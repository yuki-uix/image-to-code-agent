#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { VisualAnalyst } from "./agents/visual-analyst.ts";
import { OllamaModelClient } from "./model/ollama-model-client.ts";
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
  const schema = await readFile(resolve("agents/visual-analyst/schema.json"), "utf8");
  const instructions = `${prompt.trim()}\n\nJSON Schema:\n${schema}`;
  const model = new OllamaModelClient({ model: args.model });
  const analysis = await new VisualAnalyst(model, instructions).analyze({
    image: { mimeType: mimeTypeFor(imagePath), base64: bytes.toString("base64") },
    viewport: { width, height }
  });
  const report = validateGeometry(analysis);
  const outputDir = resolve(args.out ?? `outputs/visual-analyst/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "analysis.json"), analysis);
  await writeJson(join(outputDir, "geometry-validation.json"), report);
  await writeJson(join(outputDir, "run.json"), {
    agent: "visual-analyst",
    model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
    image: imagePath,
    source: { width, height },
    prompt: "agents/visual-analyst/prompt.md",
    schema: "agents/visual-analyst/schema.json"
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
