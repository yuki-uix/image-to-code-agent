#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function fail(message) {
  console.error(`build-layout-contract: ${message}`);
  process.exit(2);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validBox(value) {
  return isRecord(value)
    && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(value[key])))
    && Number(value.x) >= 0
    && Number(value.y) >= 0
    && Number(value.width) > 0
    && Number(value.height) > 0;
}

function normalizeBox(box) {
  return Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Math.round(Number(box[key]))]));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const [, , factsArg, outputArg] = process.argv;
if (!factsArg || !outputArg) {
  fail("usage: node build-layout-contract.mjs <page-facts.json> <layout-contract.json>");
}

const factsPath = resolve(factsArg);
const outputPath = resolve(outputArg);
if (!existsSync(factsPath)) fail(`page facts do not exist: ${factsPath}`);

const facts = await readJson(factsPath);
const sections = Array.isArray(facts?.sections) ? facts.sections.filter((item) => validBox(item?.bbox)) : [];
const regions = Array.isArray(facts?.regions) ? facts.regions.filter((item) => item?.required !== false && validBox(item?.bbox)) : [];
if (sections.length === 0) fail("page facts require at least one section with a valid bbox");
if (regions.length === 0) fail("page facts require at least one required region with a valid bbox");

const boxes = [...sections, ...regions].map((item) => item.bbox);
const derivedWidth = Math.ceil(Math.max(...boxes.map((box) => Number(box.x) + Number(box.width))));
const derivedHeight = Math.ceil(Math.max(...boxes.map((box) => Number(box.y) + Number(box.height))));
const declaredViewport = facts?.meta?.viewport;
const width = validBox({ x: 0, y: 0, width: declaredViewport?.width, height: declaredViewport?.height })
  ? Math.round(Number(declaredViewport.width))
  : derivedWidth;
const height = validBox({ x: 0, y: 0, width: declaredViewport?.width, height: declaredViewport?.height })
  ? Math.round(Number(declaredViewport.height))
  : derivedHeight;

const positionTolerancePx = Math.max(8, Math.round(Math.min(width, height) * 0.015));
const sizeToleranceRatio = 0.08;
const documentTolerancePx = Math.max(16, Math.round(height * 0.05));

const contract = {
  meta: {
    schemaVersion: 1,
    sourceImage: facts?.meta?.sourceImage ?? null,
    sourceRegionId: facts?.meta?.sourceRegionId ?? null,
    derivedFrom: factsPath
  },
  viewport: { width, height },
  document: { width, height, tolerancePx: documentTolerancePx },
  tolerances: { positionPx: positionTolerancePx, sizeRatio: sizeToleranceRatio },
  sections: sections.map((section) => ({
    name: String(section.name ?? "UnnamedSection"),
    order: Number(section.order ?? 0),
    bbox: normalizeBox(section.bbox)
  })),
  regions: regions.map((region) => ({
    sourceRegionId: String(region.id),
    bbox: normalizeBox(region.bbox),
    expectedInstances: Math.max(1, Math.round(Number(region.expectedInstances ?? 1)))
  }))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(contract, null, 2)}\n`);
console.log(JSON.stringify({
  valid: true,
  output: outputPath,
  stats: {
    viewport: contract.viewport,
    sections: contract.sections.length,
    regions: contract.regions.length,
    positionTolerancePx,
    sizeToleranceRatio,
    documentTolerancePx
  }
}, null, 2));
