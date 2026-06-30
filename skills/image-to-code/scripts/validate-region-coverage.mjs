#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

function fail(message) {
  console.error(`validate-region-coverage: ${message}`);
  process.exit(2);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function validBox(value) {
  return isRecord(value)
    && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(value[key])))
    && Number(value.x) >= 0
    && Number(value.y) >= 0
    && Number(value.width) > 0
    && Number(value.height) > 0;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const [, , factsPath, contractPath] = process.argv;
if (!factsPath || !contractPath) {
  fail("usage: node validate-region-coverage.mjs <page-facts.json> <page-contract.json>");
}
if (!existsSync(factsPath)) fail(`page facts do not exist: ${factsPath}`);
if (!existsSync(contractPath)) fail(`page contract does not exist: ${contractPath}`);

const facts = await readJson(factsPath);
const contract = await readJson(contractPath);
const issues = [];
const regions = Array.isArray(facts?.regions) ? facts.regions : [];
const coverage = Array.isArray(contract?.regionCoverage) ? contract.regionCoverage : [];

if (!Array.isArray(facts?.regions) || regions.length === 0) {
  issues.push({ severity: "error", code: "missing-region-inventory", target: "page-facts.regions", message: "Page facts require a non-empty regions inventory." });
}
if (!Array.isArray(contract?.regionCoverage) || coverage.length === 0) {
  issues.push({ severity: "error", code: "missing-region-coverage", target: "page-contract.regionCoverage", message: "Page contract requires a non-empty regionCoverage array." });
}

const factById = new Map();
for (const [index, region] of regions.entries()) {
  const target = `page-facts.regions[${index}]`;
  if (!isRecord(region) || typeof region.id !== "string" || !region.id.trim()) {
    issues.push({ severity: "error", code: "invalid-region", target, message: "Page regions require a stable string ID." });
    continue;
  }
  if (factById.has(region.id)) {
    issues.push({ severity: "error", code: "duplicate-region-id", target: region.id, message: "Page region IDs must be unique." });
    continue;
  }
  factById.set(region.id, region);
  if (!validBox(region.bbox)) {
    issues.push({ severity: "error", code: "invalid-region-bbox", target: region.id, message: "Page regions require a positive pixel bbox." });
  }
  if (!positiveInteger(region.expectedInstances ?? 1)) {
    issues.push({ severity: "error", code: "invalid-region-instances", target: region.id, message: "expectedInstances must be a positive integer." });
  }
}

const coverageCounts = new Map();
for (const [index, item] of coverage.entries()) {
  const target = `page-contract.regionCoverage[${index}]`;
  if (!isRecord(item) || typeof item.sourceRegionId !== "string" || !item.sourceRegionId.trim()) {
    issues.push({ severity: "error", code: "invalid-coverage-entry", target, message: "Coverage entries require sourceRegionId." });
    continue;
  }
  const id = item.sourceRegionId;
  coverageCounts.set(id, (coverageCounts.get(id) ?? 0) + 1);
  const fact = factById.get(id);
  if (!fact) {
    issues.push({ severity: "error", code: "unknown-source-region", target: id, message: "Coverage entry references an unknown page region." });
    continue;
  }
  const expected = Number(fact.expectedInstances ?? 1);
  if (Number(item.expectedInstances ?? 1) !== expected) {
    issues.push({ severity: "error", code: "region-instance-mismatch", target: id, message: `Coverage expectedInstances must match page facts (${expected}).` });
  }
  if (fact.kind === "image" && (typeof item.assetPath !== "string" || !item.assetPath.trim())) {
    issues.push({ severity: "error", code: "missing-region-asset", target: id, message: "Image regions require an assetPath in regionCoverage." });
  }
}

for (const [id, fact] of factById) {
  const count = coverageCounts.get(id) ?? 0;
  if (fact.required !== false && count === 0) {
    issues.push({ severity: "error", code: "required-region-omitted", target: id, message: "Required page region is missing from the contract." });
  }
  if (count > 1) {
    issues.push({ severity: "error", code: "duplicate-region-coverage", target: id, message: "A source region must have exactly one coverage entry." });
  }
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  stats: {
    sourceRegions: factById.size,
    requiredRegions: [...factById.values()].filter((region) => region.required !== false).length,
    coveredRegions: [...coverageCounts.keys()].filter((id) => factById.has(id)).length,
    repeatedGroups: [...factById.values()].filter((region) => Number(region.expectedInstances ?? 1) > 1).length
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
