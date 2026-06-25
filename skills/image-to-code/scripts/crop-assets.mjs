#!/usr/bin/env node
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";

function usage() {
  console.error(`Usage:
  node crop-assets.mjs <source-image> <crop-specs.json> <out-dir>

crop-specs.json:
[
  { "id": "product-main", "bbox": { "x": 80, "y": 120, "width": 420, "height": 560 } },
  { "id": "thumb-1", "bbox": { "x": 80, "y": 700, "width": 96, "height": 96 }, "output": "custom-name.png" }
]
`);
}

function fail(message) {
  console.error(`crop-assets: ${message}`);
  process.exit(1);
}

function assertSipsAvailable() {
  const result = spawnSync("sips", ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    fail("macOS 'sips' command is required for this helper. Use placeholders or crop assets manually on non-macOS systems.");
  }
}

function safeFileName(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function int(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${label} must be a finite number`);
  const rounded = Math.round(n);
  if (rounded < 0) fail(`${label} must be >= 0`);
  return rounded;
}

async function main() {
  const [sourceImage, specsPath, outDir] = process.argv.slice(2);
  if (!sourceImage || !specsPath || !outDir) {
    usage();
    process.exit(1);
  }

  assertSipsAvailable();

  const specs = JSON.parse(await readFile(specsPath, "utf8"));
  if (!Array.isArray(specs)) fail("crop specs must be a JSON array");

  await mkdir(outDir, { recursive: true });
  const outputs = [];

  for (const spec of specs) {
    const id = safeFileName(spec.id ?? `asset-${outputs.length + 1}`);
    const bbox = spec.bbox ?? {};
    const x = int(bbox.x, `${id}.bbox.x`);
    const y = int(bbox.y, `${id}.bbox.y`);
    const width = int(bbox.width, `${id}.bbox.width`);
    const height = int(bbox.height, `${id}.bbox.height`);
    if (width <= 0 || height <= 0) fail(`${id}.bbox.width/height must be > 0`);

    const outputName = safeFileName(spec.output ?? `${id}.png`);
    const outputPath = join(outDir, outputName.endsWith(".png") ? outputName : `${outputName}.png`);
    const tempPath = join(outDir, `.${id}.tmp${extname(sourceImage) || ".img"}`);

    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(sourceImage, tempPath);

    const result = spawnSync("sips", [
      "-s", "format", "png",
      "-c", String(height), String(width),
      "--cropOffset", String(y), String(x),
      tempPath,
      "--out", outputPath
    ], { encoding: "utf8" });

    await rm(tempPath, { force: true });

    if (result.status !== 0) {
      fail(`failed to crop ${id}: ${result.stderr || result.stdout}`);
    }

    outputs.push({ id, path: outputPath, bbox: { x, y, width, height } });
  }

  console.log(JSON.stringify({ assets: outputs }, null, 2));
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
