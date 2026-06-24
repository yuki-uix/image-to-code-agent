#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { LayoutRelation, VisualAnalysis } from "./domain/contracts.ts";
import { detectImageMimeType } from "./image-size.ts";
import { OllamaModelClient } from "./model/ollama-model-client.ts";
import { normalizeVisualAnalysis } from "./validation/visual-analysis-normalizer.ts";
import { repairVisualAnalysis } from "./validation/visual-analysis-repair.ts";
import { validateGeometry } from "./validation/geometry-validator.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.image || !args.analysis || !args.focus) {
  console.error("Usage: npm run visual:detail -- --image <screenshot> --analysis <base-analysis.json> --focus <area to inspect> [--out outputs/visual-detail/run-1] [--model qwen2.5vl:7b]");
  process.exitCode = 1;
} else {
  const imagePath = resolve(args.image);
  const base = JSON.parse(await readFile(resolve(args.analysis), "utf8")) as VisualAnalysis;
  const bytes = await readFile(imagePath);
  const outputDir = resolve(args.out ?? `outputs/visual-detail/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const model = new OllamaModelClient({ model: args.model });
  const instructions = detailInstructions(args.focus, base.source);
  const { parsed, rawText } = await model.generateJsonWithRaw<unknown>({
    agent: "visual-analyst",
    instructions,
    payload: { source: base.source, focus: args.focus },
    image: { mimeType: detectImageMimeType(bytes, extname(imagePath)), base64: bytes.toString("base64") }
  });
  const detail = repairVisualAnalysis(normalizeVisualAnalysis(parsed, base.source));
  const merged = mergeVisualAnalyses(base, detail);
  const report = validateGeometry(merged);

  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "detail-analysis.json"), detail);
  await writeFile(join(outputDir, "raw-detail.txt"), `${rawText.trim()}\n`);
  await writeJson(join(outputDir, "merged-analysis.json"), merged);
  await writeJson(join(outputDir, "geometry-validation.json"), report);
  await writeJson(join(outputDir, "run.json"), {
    agent: "visual-analyst-detail",
    model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
    image: imagePath,
    baseAnalysis: resolve(args.analysis),
    focus: args.focus,
    artifacts: ["detail-analysis.json", "raw-detail.txt", "merged-analysis.json", "geometry-validation.json", "run.json"]
  });
  console.log(`Detail analysis written to ${outputDir}`);
  console.log(report.valid ? "Merged geometry validation passed." : `Merged geometry validation found ${report.issues.length} issue(s).`);
}

function detailInstructions(focus: string, source: { width: number; height: number }): string {
  return `You are the detail pass of a screenshot analysis pipeline. Inspect only this requested area: ${focus}.
Return one compact JSON VisualAnalysis object. Source is ${source.width} by ${source.height}. Include one page region covering the source and 4 to 10 clearly visible elements from the requested area only. Use concrete repeated item ids such as categoryCard1 or productCard1 when visible. Do not repeat navigation, hero, or unrelated sections. Every element must have id, kind, regionId, bbox, geometrySource "vlm", and certainty. Use bbox objects { x, y, width, height }. Return JSON only.`;
}

function mergeVisualAnalyses(base: VisualAnalysis, detail: VisualAnalysis): VisualAnalysis {
  return repairVisualAnalysis({
    ...base,
    regions: uniqueById([...base.regions, ...detail.regions]),
    elements: uniqueById([...base.elements, ...detail.elements]),
    layoutRelations: uniqueRelations([...base.layoutRelations, ...detail.layoutRelations]),
    uncertainObservations: [...base.uncertainObservations, ...detail.uncertainObservations]
  });
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.filter((value) => value.id).map((value) => [value.id, value])).values()];
}

function uniqueRelations(values: LayoutRelation[]): LayoutRelation[] {
  return [...new Map(values.map((value) => [`${value.type}:${value.source}:${value.target}`, value])).values()];
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
