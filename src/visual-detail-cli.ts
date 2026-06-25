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

Return a single JSON object with exactly these top-level keys: source, regions, elements, hierarchy, layout, layoutRelations, uncertainObservations. Do not wrap them inside page_region or any other key.

Source dimensions: { "width": ${source.width}, "height": ${source.height} }

Rules:
- regions: one entry covering the full source with role "page"
- elements: 5 to 15 clearly visible items from the requested area. Use numbered ids for repeated items: productCard1, productCard2, categoryCard1, etc.
- Every element needs: id, kind, regionId, bbox { x, y, width, height }, geometrySource "vlm", certainty "high"
- hierarchy: root → page → [element ids]
- layout: { "direction": "column" }
- layoutRelations: [] (empty is fine)
- uncertainObservations: []

Example shape:
{
  "source": { "width": ${source.width}, "height": ${source.height} },
  "regions": [{ "id": "page", "role": "page", "bbox": { "x": 0, "y": 0, "width": ${source.width}, "height": ${source.height} } }],
  "elements": [
    { "id": "productCard1", "kind": "card", "regionId": "page", "bbox": { "x": 100, "y": 200, "width": 300, "height": 400 }, "geometrySource": "vlm", "certainty": "high" }
  ],
  "hierarchy": { "root": "root", "children": { "root": ["page"], "page": ["productCard1"] } },
  "layout": { "direction": "column" },
  "layoutRelations": [],
  "uncertainObservations": []
}

Return JSON only. Do not include explanations.`;
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
