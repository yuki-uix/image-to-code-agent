#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

function usage() {
  console.error(`Usage:
  node generate-assets.mjs <generate-specs.json> <out-dir>

generate-specs.json:
[
  { "id": "product-main", "bbox": { "x": 80, "y": 120, "width": 420, "height": 560 }, "prompt": "no-text hero product photo, soft daylight, 4:3" },
  { "id": "thumb-1", "bbox": { "x": 80, "y": 700, "width": 96, "height": 96 }, "prompt": "flat icon-style device thumbnail, transparent background", "output": "custom-name.png" }
]

This is the default asset source (see SKILL.md --asset-policy). Use crop-assets.mjs instead
when you own the source screenshot's pixels and a clean, unobstructed region exists to lift.
`);
}

function fail(message) {
  console.error(`generate-assets: ${message}`);
  process.exit(1);
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

function findCodexCompanion() {
  // The openai-codex Claude Code plugin's own companion CLI. Its `imagegen` subcommand
  // authenticates through the already-logged-in Codex CLI session (no separate API key needed) —
  // this is the path actually verified to work in a Claude Code + openai-codex-plugin environment.
  const globRoot = join(homedir(), ".claude", "plugins", "cache", "openai-codex", "codex");
  if (!existsSync(globRoot)) return null;
  const versions = readdirSync(globRoot).sort().reverse();
  for (const version of versions) {
    const candidate = join(globRoot, version, "scripts", "codex-companion.mjs");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function imagegenCli() {
  const configured = process.env.IMAGEGEN_CLI;
  if (configured) return { path: configured, style: process.env.IMAGEGEN_CLI_STYLE || "system" };

  const companion = findCodexCompanion();
  if (companion) return { path: companion, style: "companion" };

  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  return { path: join(codexHome, "skills", ".system", "imagegen", "scripts", "image_gen.py"), style: "system" };
}

function assertGenerationAvailable() {
  const cli = imagegenCli();
  if (!existsSync(cli.path)) {
    fail(
      `No working imagegen CLI found (looked for the openai-codex plugin's codex-companion.mjs, then ` +
      `\${CODEX_HOME}/skills/.system/imagegen/scripts/image_gen.py at ${cli.path}).\n` +
      `Set IMAGEGEN_CLI (and IMAGEGEN_CLI_STYLE=companion|system, default system) to point at a working ` +
      `CLI, or run with --asset-policy crop or --asset-policy placeholder instead.`
    );
  }
  return cli;
}

function nearestFixedSize(width, height) {
  // Common fixed sizes accepted by current OpenAI-family image models; pick the closest by aspect ratio.
  const options = [
    { label: "1024x1024", w: 1024, h: 1024 },
    { label: "1536x1024", w: 1536, h: 1024 },
    { label: "1024x1536", w: 1024, h: 1536 },
  ];
  const targetRatio = width / height;
  let best = options[0];
  let bestDelta = Infinity;
  for (const opt of options) {
    const delta = Math.abs(opt.w / opt.h - targetRatio);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = opt;
    }
  }
  return best.label;
}

async function main() {
  const [specsPath, outDir] = process.argv.slice(2);
  if (!specsPath || !outDir) {
    usage();
    process.exit(1);
  }

  const cli = assertGenerationAvailable();
  const python = process.env.PYTHON || "python3";

  const specs = JSON.parse(await readFile(specsPath, "utf8"));
  if (!Array.isArray(specs)) fail("generate specs must be a JSON array");

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
    const prompt = String(spec.prompt ?? "").trim();
    if (!prompt) fail(`${id}.prompt is required`);

    const outputName = safeFileName(spec.output ?? `${id}.png`);
    const outputPath = join(outDir, outputName.endsWith(".png") ? outputName : `${outputName}.png`);
    await mkdir(dirname(outputPath), { recursive: true });

    let executable;
    let args;
    if (cli.style === "companion") {
      // codex-companion.mjs imagegen: authenticates through the already-logged-in Codex CLI
      // session. Positional prompt, no --size/--quality/--output-format — it doesn't expose them.
      // Don't pass --model unless explicitly requested: an explicit model name can be rejected
      // depending on how the underlying Codex account is authenticated, where omitting it works.
      executable = process.execPath;
      args = [cli.path, "imagegen", "--out", outputPath];
      if (process.env.IMAGEGEN_MODEL) args.push("--model", process.env.IMAGEGEN_MODEL);
      args.push(prompt);
    } else {
      executable = python;
      args = [
        cli.path,
        "generate",
        "--prompt", prompt,
        "--out", outputPath,
        "--model", process.env.IMAGEGEN_MODEL || "gpt-image-2",
        "--size", spec.size || nearestFixedSize(width, height),
        "--quality", spec.quality || "medium",
        "--output-format", "png",
      ];
    }

    const result = spawnSync(executable, args, { encoding: "utf8" });
    if (result.status !== 0) {
      fail(`failed to generate ${id}: ${result.stderr || result.stdout || "unknown error"}`);
    }

    outputs.push({ id, path: outputPath, bbox: { x, y, width, height }, source: "generated" });
  }

  console.log(JSON.stringify({ assets: outputs }, null, 2));
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
