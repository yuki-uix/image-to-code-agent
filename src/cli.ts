#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MemoryOverrides } from "./domain/contracts.ts";
import { ReplayModelClient } from "./model/replay-model-client.ts";
import { StructuredPipeline } from "./pipeline/structured-pipeline.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.image || !args.responses) {
  console.error("Usage: node src/cli.ts --image <file> --responses <fixture.json> [--out <dir>] [--overrides <json>] [--width 1440] [--height 900]");
  process.exitCode = 1;
} else {
  const overrides = args.overrides
    ? JSON.parse(await readFile(resolve(args.overrides), "utf8")) as MemoryOverrides
    : undefined;
  const pipeline = new StructuredPipeline(await ReplayModelClient.fromFile(resolve(args.responses)));
  const out = resolve(args.out ?? "outputs/run");
  await pipeline.run({
    imagePath: resolve(args.image),
    outputDir: out,
    viewport: { width: Number(args.width ?? 1440), height: Number(args.height ?? 900) },
    overrides
  });
  console.log(`Generated MVP artifacts in ${out}`);
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
