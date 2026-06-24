#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { TraceableVisualAnalyst } from "./agents/visual-analyst.ts";
import { detectImageMimeType, detectImageSize } from "./image-size.ts";
import { OllamaInvalidJsonError, OllamaModelClient } from "./model/ollama-model-client.ts";
import { looksLikeSchemaEcho } from "./validation/visual-analysis-guards.ts";
import { validateGeometry } from "./validation/geometry-validator.ts";
import { buildVisualAnalysisInstructions, type VisualAnalysisDetail } from "./visual-analysis-instructions.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.image) {
  console.error("Usage: npm run visual:analyze -- --image <screenshot.png> [--model qwen2.5vl:7b] [--detail full|coarse|outline] [--width 1440 --height 900] [--out outputs/visual-analyst/run-1]");
  process.exitCode = 1;
} else {
  const imagePath = resolve(args.image);
  const bytes = await readFile(imagePath);
  const detected = detectImageSize(bytes, extname(imagePath));
  const width = Number(args.width ?? detected?.width);
  const height = Number(args.height ?? detected?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Cannot detect image dimensions. Supply --width and --height.");
  }

  const prompt = await readFile(resolve("agents/visual-analyst/prompt.md"), "utf8");
  const model = new OllamaModelClient({ model: args.model });
  const outputDir = resolve(args.out ?? `outputs/visual-analyst/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const requestedDetail = parseDetail(args.detail);
  let detailUsed: VisualAnalysisDetail = requestedDetail;
  let result;
  try {
    result = await runAnalysis({
      detail: requestedDetail,
      prompt,
      model,
      imagePath,
      image: { mimeType: detectImageMimeType(bytes, imagePath), base64: bytes.toString("base64") },
      viewport: { width, height }
    });
  } catch (error) {
    if (error instanceof OllamaInvalidJsonError) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, `raw-analysis.${requestedDetail}.txt`), `${error.rawText.trim()}\n`);
      const fallbacks = fallbackSequence(requestedDetail);
      for (const fallbackDetail of fallbacks) {
        try {
          result = await runAnalysis({
            detail: fallbackDetail,
            prompt,
            model,
            imagePath,
            image: { mimeType: detectImageMimeType(bytes, imagePath), base64: bytes.toString("base64") },
            viewport: { width, height }
          });
          detailUsed = fallbackDetail;
          break;
        } catch (fallbackError) {
          if (fallbackError instanceof OllamaInvalidJsonError) {
            await writeFile(join(outputDir, `raw-analysis.${fallbackDetail}.txt`), `${fallbackError.rawText.trim()}\n`);
            continue;
          }
          throw fallbackError;
        }
      }
      if (!result) {
        await writeJson(join(outputDir, "run.json"), {
          agent: "visual-analyst",
          model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
          image: imagePath,
          source: { width, height },
          prompt: "agents/visual-analyst/prompt.md",
          detailRequested: requestedDetail,
          detailUsed: null,
          status: "invalid-json",
          artifacts: [`raw-analysis.${requestedDetail}.txt`, ...fallbacks.map((item) => `raw-analysis.${item}.txt`), "run.json"]
        });
        throw new Error(`Ollama returned malformed JSON in ${[requestedDetail, ...fallbacks].join(", ")} mode. Raw model output was saved under ${outputDir}`);
      }
    }
    throw error;
  }
  if (!result) throw new Error("Visual analysis did not produce a result.");
  const minimumElementsExpected = minimumElementsFor(detailUsed);
  if (looksLikeSchemaEcho(result.raw)) {
    throw new Error("Visual Analyst returned the schema instead of an analysis instance. Try rerunning after the prompt update, or switch to a stronger vision model.");
  }
  let analysis = result.analysis;
  let report = validateGeometry(analysis, { minimumElements: minimumElementsExpected });
  let initialResult: typeof result | undefined;
  if (detailUsed !== "outline" && report.issues.some((issue) => issue.code === "coarse-element-coverage")) {
    initialResult = result;
    result = await runAnalysis({
      detail: detailUsed,
      prompt: `${prompt}\n\nCorrection for this retry: the previous analysis returned too few elements for this visually rich page. Return at least ${minimumElementsExpected} elements. Include the hero CTA, representative category cards, representative loyalty benefits, and representative product cards. Keep the whole navigation as one navBar element.`,
      model,
      imagePath,
      image: { mimeType: detectImageMimeType(bytes, imagePath), base64: bytes.toString("base64") },
      viewport: { width, height }
    });
    if (looksLikeSchemaEcho(result.raw)) {
      throw new Error("Visual Analyst retry returned the schema instead of an analysis instance.");
    }
    analysis = result.analysis;
    report = validateGeometry(analysis, { minimumElements: minimumElementsExpected });
  }
  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "analysis.json"), analysis);
  await writeJson(join(outputDir, "raw-analysis.json"), result.raw);
  await writeFile(join(outputDir, "raw-analysis.txt"), `${result.rawText.trim()}\n`);
  if (initialResult) {
    await writeJson(join(outputDir, "raw-analysis.initial.json"), initialResult.raw);
    await writeFile(join(outputDir, "raw-analysis.initial.txt"), `${initialResult.rawText.trim()}\n`);
  }
  await writeJson(join(outputDir, "geometry-validation.json"), report);
  await writeJson(join(outputDir, "run.json"), {
    agent: "visual-analyst",
    model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
    image: imagePath,
    source: { width, height },
    prompt: "agents/visual-analyst/prompt.md",
    detailRequested: requestedDetail,
    detailUsed,
    minimumElementsExpected,
    attempts: initialResult ? 2 : 1,
    status: detailUsed === requestedDetail ? "ok" : "fallback-coarse",
    artifacts: ["analysis.json", "raw-analysis.json", "raw-analysis.txt", ...(initialResult ? ["raw-analysis.initial.json", "raw-analysis.initial.txt"] : []), "geometry-validation.json", "run.json"]
  });
  console.log(`Visual analysis written to ${outputDir}`);
  console.log(report.valid ? "Geometry validation passed." : `Geometry validation found ${report.issues.length} issue(s).`);
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, "");
    const value = values[index + 1];
    if (key && value) result[key] = value;
  }
  return result;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseDetail(value?: string): VisualAnalysisDetail {
  if (value === "outline") return "outline";
  if (value === "coarse") return "coarse";
  return "full";
}

async function runAnalysis(input: {
  detail: VisualAnalysisDetail;
  prompt: string;
  model: OllamaModelClient;
  imagePath: string;
  image: { mimeType: string; base64: string };
  viewport: { width: number; height: number };
}) {
  const instructions = buildVisualAnalysisInstructions(input.prompt, input.detail);
  const analyst = new TraceableVisualAnalyst(input.model, instructions);
  return analyst.analyzeWithTrace({
    image: input.image,
    viewport: input.viewport
  });
}

function fallbackSequence(requested: VisualAnalysisDetail): VisualAnalysisDetail[] {
  if (requested === "full") return ["coarse", "outline"];
  if (requested === "coarse") return ["outline"];
  return [];
}

function minimumElementsFor(detail: VisualAnalysisDetail): number {
  if (detail === "full") return 16;
  if (detail === "coarse") return 10;
  return 3;
}
