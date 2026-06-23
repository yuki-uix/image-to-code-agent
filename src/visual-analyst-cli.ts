#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { TraceableVisualAnalyst } from "./agents/visual-analyst.ts";
import { OllamaModelClient } from "./model/ollama-model-client.ts";
import { looksLikeSchemaEcho } from "./validation/visual-analysis-guards.ts";
import { validateGeometry } from "./validation/geometry-validator.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.image) {
  console.error("Usage: npm run visual:analyze -- --image <screenshot.png> [--model qwen2.5vl:7b] [--width 1440 --height 900] [--out outputs/visual-analyst/run-1]");
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
  const instructions = buildVisualAnalysisInstructions(prompt);
  const model = new OllamaModelClient({ model: args.model });
  const analyst = new TraceableVisualAnalyst(model, instructions);
  const result = await analyst.analyzeWithTrace({
    image: { mimeType: mimeTypeFor(imagePath), base64: bytes.toString("base64") },
    viewport: { width, height }
  });
  if (looksLikeSchemaEcho(result.raw)) {
    throw new Error("Visual Analyst returned the schema instead of an analysis instance. Try rerunning after the prompt update, or switch to a stronger vision model.");
  }
  const analysis = result.analysis;
  const report = validateGeometry(analysis);
  const outputDir = resolve(args.out ?? `outputs/visual-analyst/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "analysis.json"), analysis);
  await writeJson(join(outputDir, "raw-analysis.json"), result.raw);
  await writeFile(join(outputDir, "raw-analysis.txt"), `${result.rawText.trim()}\n`);
  await writeJson(join(outputDir, "geometry-validation.json"), report);
  await writeJson(join(outputDir, "run.json"), {
    agent: "visual-analyst",
    model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
    image: imagePath,
    source: { width, height },
    prompt: "agents/visual-analyst/prompt.md",
    artifacts: ["analysis.json", "raw-analysis.json", "raw-analysis.txt", "geometry-validation.json", "run.json"]
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

function mimeTypeFor(path: string): string {
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" } as Record<string, string>)[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function detectImageSize(bytes: Buffer, extension: string): { width: number; height: number } | undefined {
  if (extension.toLowerCase() === ".png" && bytes.length >= 24 && bytes.toString("ascii", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (extension.toLowerCase() === ".svg") {
    const source = bytes.toString("utf8", 0, Math.min(bytes.length, 2048));
    const width = Number(source.match(/\bwidth=["']([\d.]+)/)?.[1]);
    const height = Number(source.match(/\bheight=["']([\d.]+)/)?.[1]);
    if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };
  }
  return undefined;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function buildVisualAnalysisInstructions(prompt: string): string {
  return `${prompt.trim()}

Return one JSON object with this contract:
- source: { width: number, height: number }
- regions: array of { id, role, bbox }
- layout: object with at least direction: "row" | "column" | "mixed"
- hierarchy: { root: string, children: Record<string, string[]> }
- elements: array of { id, kind, regionId, bbox?, text?, visualRole?, geometrySource, certainty, visual? }
- layoutRelations: array of { type, source, target, distance? }
- uncertainObservations: array of { description, relatedIds }

  Do not output a schema. Do not describe the contract. Output one analysis instance only.`;
}
