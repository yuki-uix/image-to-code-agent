#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

function fail(message) {
  console.error(`validate-layout-contract: ${message}`);
  process.exit(2);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validBox(value) {
  return isRecord(value) && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(value[key])));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function addIssue(issues, severity, code, target, message, details) {
  issues.push({ severity, code, target, message, ...(details ? { details } : {}) });
}

const [, , contractPath, measurementsPath] = process.argv;
if (!contractPath || !measurementsPath) {
  fail("usage: node validate-layout-contract.mjs <layout-contract.json> <layout-measurements.json>");
}
if (!existsSync(contractPath)) fail(`layout contract does not exist: ${contractPath}`);
if (!existsSync(measurementsPath)) fail(`layout measurements do not exist: ${measurementsPath}`);

const contract = await readJson(contractPath);
const measurements = await readJson(measurementsPath);
const issues = [];
const targets = Array.isArray(contract?.regions) ? contract.regions : [];
const actualRegions = Array.isArray(measurements?.regions) ? measurements.regions : [];
const defaultPositionTolerance = Number(contract?.tolerances?.positionPx ?? 16);
const defaultSizeTolerance = Number(contract?.tolerances?.sizeRatio ?? 0.08);

if (!isRecord(contract?.viewport) || !Number.isFinite(Number(contract.viewport.width)) || !Number.isFinite(Number(contract.viewport.height))) {
  addIssue(issues, "error", "invalid-viewport-target", "layout-contract.viewport", "Layout contract requires viewport width and height.");
}
if (!isRecord(contract?.document) || !Number.isFinite(Number(contract.document.width)) || !Number.isFinite(Number(contract.document.height))) {
  addIssue(issues, "error", "invalid-document-target", "layout-contract.document", "Layout contract requires document width and height.");
}
if (targets.length === 0) {
  addIssue(issues, "error", "missing-layout-regions", "layout-contract.regions", "Layout contract requires at least one region target.");
}

for (const axis of ["width", "height"]) {
  const target = Number(contract?.viewport?.[axis]);
  const actual = Number(measurements?.viewport?.[axis]);
  if (Number.isFinite(target) && (!Number.isFinite(actual) || Math.abs(actual - target) > 1)) {
    addIssue(issues, "error", "viewport-mismatch", `viewport.${axis}`, `Captured viewport ${axis} must match the layout contract.`, { target, actual });
  }
}

const documentTolerance = Number(contract?.document?.tolerancePx ?? Math.max(16, Number(contract?.document?.height ?? 0) * 0.05));
for (const axis of ["width", "height"]) {
  const target = Number(contract?.document?.[axis]);
  const actual = Number(measurements?.document?.[axis]);
  const delta = Math.abs(actual - target);
  if (Number.isFinite(target) && (!Number.isFinite(actual) || delta > documentTolerance)) {
    addIssue(issues, "error", "document-size-drift", `document.${axis}`, `Rendered document ${axis} exceeds the allowed ${documentTolerance}px drift.`, { target, actual, delta, tolerancePx: documentTolerance });
  }
}

const actualById = new Map();
for (const item of actualRegions) {
  if (typeof item?.sourceRegionId !== "string") continue;
  const entries = actualById.get(item.sourceRegionId) ?? [];
  entries.push(item);
  actualById.set(item.sourceRegionId, entries);
}

let comparisons = 0;
let passingComparisons = 0;
for (const [index, target] of targets.entries()) {
  const id = target?.sourceRegionId;
  if (typeof id !== "string" || !validBox(target?.bbox)) {
    addIssue(issues, "error", "invalid-layout-region", `layout-contract.regions[${index}]`, "Layout regions require sourceRegionId and bbox.");
    continue;
  }
  const matches = actualById.get(id) ?? [];
  if (matches.length !== 1) {
    addIssue(issues, "error", matches.length === 0 ? "missing-measured-region" : "duplicate-measured-region", id, "Every layout target must resolve to exactly one measured DOM region.", { actualCount: matches.length });
    continue;
  }
  const actual = matches[0];
  if (!validBox(actual.bbox)) {
    addIssue(issues, "error", "invalid-measured-bbox", id, "Measured region requires a numeric bbox.");
    continue;
  }
  const positionTolerance = Number(target?.tolerance?.positionPx ?? defaultPositionTolerance);
  const sizeTolerance = Number(target?.tolerance?.sizeRatio ?? defaultSizeTolerance);
  const deltas = {
    x: Math.abs(Number(actual.bbox.x) - Number(target.bbox.x)),
    y: Math.abs(Number(actual.bbox.y) - Number(target.bbox.y)),
    widthRatio: Math.abs(Number(actual.bbox.width) - Number(target.bbox.width)) / Number(target.bbox.width),
    heightRatio: Math.abs(Number(actual.bbox.height) - Number(target.bbox.height)) / Number(target.bbox.height)
  };
  comparisons += 1;
  const passes = deltas.x <= positionTolerance
    && deltas.y <= positionTolerance
    && deltas.widthRatio <= sizeTolerance
    && deltas.heightRatio <= sizeTolerance;
  if (passes) passingComparisons += 1;
  else addIssue(issues, "error", "region-geometry-drift", id, "Rendered region geometry exceeds its layout tolerance.", {
    target: target.bbox,
    actual: actual.bbox,
    deltas,
    tolerance: { positionPx: positionTolerance, sizeRatio: sizeTolerance }
  });

  const expectedInstances = Number(target.expectedInstances ?? 1);
  const actualInstances = Number(actual.instances ?? 1);
  if (actualInstances !== expectedInstances) {
    addIssue(issues, "error", "layout-instance-mismatch", id, "Measured repeated-group cardinality differs from the layout contract.", { expectedInstances, actualInstances });
  }
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  scores: { geometryAgreement: comparisons === 0 ? 0 : Number((passingComparisons / comparisons).toFixed(4)) },
  stats: { targetRegions: targets.length, measuredRegions: actualRegions.length, passingRegions: passingComparisons }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
