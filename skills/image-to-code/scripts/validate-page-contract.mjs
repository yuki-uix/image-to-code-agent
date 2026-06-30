#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

function fail(message) {
  console.error(`validate-page-contract: ${message}`);
  process.exit(2);
}

const [, , contractPath, outputPath] = process.argv;

if (!contractPath || !outputPath) {
  fail("usage: node validate-page-contract.mjs <page-contract.json> <output-file-or-dir>");
}

function normalize(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function addText(target, value) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target.add(trimmed);
}

function collectContractText(value, required, forbidden) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") addText(required, item);
      else collectContractText(item, required, forbidden);
    }
    return;
  }

  const productLike = ["subtitle", "price", "originalPrice", "rating", "badge"].some((key) => typeof value[key] === "string");
  if (productLike) addText(required, value.name);

  for (const [key, item] of Object.entries(value)) {
    if (key === "forbiddenText" && Array.isArray(item)) {
      for (const text of item) addText(forbidden, text);
      continue;
    }

    if ([
      "requiredText",
      "visibleText",
      "labels",
      "subtitle",
      "price",
      "originalPrice",
      "rating",
      "badge",
      "label",
      "placeholder",
      "buttonLabel",
      "heading"
    ].includes(key)) {
      if (Array.isArray(item)) {
        for (const text of item) addText(required, text);
      } else {
        addText(required, item);
      }
      continue;
    }

    if (typeof item === "object") collectContractText(item, required, forbidden);
  }
}

function collectProducts(contract) {
  return Array.isArray(contract?.products) ? contract.products : [];
}

function collectCropRegions(contract) {
  return Array.isArray(contract?.cropRegions) ? contract.cropRegions : [];
}

function collectRegionCoverage(contract) {
  return Array.isArray(contract?.regionCoverage) ? contract.regionCoverage : [];
}

function collectAssetComposition(contract) {
  return Array.isArray(contract?.assetComposition) ? contract.assetComposition : [];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateContractShape(contract, issues) {
  for (const [index, product] of collectProducts(contract).entries()) {
    if (!product || typeof product !== "object") {
      issues.push({
        severity: "error",
        code: "invalid-product-contract",
        target: `products[${index}]`,
        message: "Product contract entries must be objects."
      });
      continue;
    }

    for (const key of ["name", "price"]) {
      if (typeof product[key] !== "string" || !product[key].trim()) {
        issues.push({
          severity: "error",
          code: "incomplete-product-contract",
          target: `products[${index}].${key}`,
          message: `Product contract is missing required field ${key}.`
        });
      }
    }

    for (const key of ["subtitle", "originalPrice", "rating", "badge"]) {
      if (!(key in product)) {
        issues.push({
          severity: "warning",
          code: "sparse-product-contract",
          target: `products[${index}].${key}`,
          message: `Product contract does not state ${key}; visible ecommerce cards should include it when readable.`
        });
      }
    }
  }

  for (const [index, region] of collectCropRegions(contract).entries()) {
    if (!region || typeof region !== "object") {
      issues.push({
        severity: "error",
        code: "invalid-crop-contract",
        target: `cropRegions[${index}]`,
        message: "Crop region entries must be objects."
      });
      continue;
    }

    if (region.mustCrop === true && typeof region.assetPath !== "string") {
      issues.push({
        severity: "error",
        code: "missing-must-crop-asset",
        target: region.id ?? `cropRegions[${index}]`,
        message: "mustCrop regions must include assetPath so generated code can be checked."
      });
    }
  }
}

async function listTextFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];

  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets" || entry.name === "node_modules") continue;
      files.push(...await listTextFiles(child));
      continue;
    }

    if ([".html", ".htm", ".tsx", ".ts", ".jsx", ".js", ".vue", ".css"].includes(extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}

if (!existsSync(contractPath)) fail(`contract does not exist: ${contractPath}`);
if (!existsSync(outputPath)) fail(`output does not exist: ${outputPath}`);

const issues = [];
let contract;

try {
  contract = JSON.parse(await readFile(contractPath, "utf8"));
} catch (error) {
  fail(`invalid contract JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const required = new Set();
const forbidden = new Set();
collectContractText(contract, required, forbidden);
validateContractShape(contract, issues);

const files = await listTextFiles(outputPath);
const rawOutput = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
const output = normalize(rawOutput);
const outputForAssets = rawOutput.toLowerCase();
const outputIsDir = statSync(outputPath).isDirectory();

for (const text of required) {
  if (text.length <= 1) continue;
  if (!output.includes(normalize(text))) {
    issues.push({
      severity: "error",
      code: "missing-required-text",
      target: text,
      message: `Output is missing required current-screenshot text: ${text}`
    });
  }
}

for (const text of forbidden) {
  if (text.length <= 1) continue;
  if (output.includes(normalize(text))) {
    issues.push({
      severity: "error",
      code: "forbidden-text-present",
      target: text,
      message: `Output contains forbidden previous-page or placeholder text: ${text}`
    });
  }
}

for (const region of collectCropRegions(contract)) {
  if (region?.mustCrop !== true) continue;
  const assetPath = region.assetPath;
  if (typeof assetPath !== "string" || !assetPath.trim()) continue;

  const assetName = basename(assetPath);
  const normalizedAssetPath = assetPath.toLowerCase();
  const normalizedAssetName = assetName.toLowerCase();

  if (!outputForAssets.includes(normalizedAssetPath) && !outputForAssets.includes(normalizedAssetName)) {
    issues.push({
      severity: "error",
      code: "must-crop-asset-not-referenced",
      target: assetPath,
      message: `Output does not reference required cropped asset: ${assetPath}`
    });
  }

  if (outputIsDir && !existsSync(join(outputPath, assetPath))) {
    issues.push({
      severity: "error",
      code: "must-crop-asset-missing",
      target: assetPath,
      message: `Required cropped asset file is missing: ${assetPath}`
    });
  }
}

const coverage = collectRegionCoverage(contract);
const knownRegionIds = new Set();
for (const [index, region] of coverage.entries()) {
  const id = region?.sourceRegionId;
  if (typeof id !== "string" || !id.trim()) {
    issues.push({
      severity: "error",
      code: "invalid-region-coverage",
      target: `regionCoverage[${index}]`,
      message: "Region coverage entries require sourceRegionId."
    });
    continue;
  }
  knownRegionIds.add(id);
  const marker = new RegExp(`data-source-region\\s*=\\s*["']${escapeRegExp(id)}["']`, "g");
  const markerCount = [...rawOutput.matchAll(marker)].length;
  if (markerCount === 0) {
    issues.push({ severity: "error", code: "region-marker-missing", target: id, message: `Output is missing data-source-region marker: ${id}` });
  } else if (markerCount > 1) {
    issues.push({ severity: "error", code: "region-marker-duplicated", target: id, message: `Output renders the same source region marker ${markerCount} times in source.` });
  }

  const expectedInstances = Number(region.expectedInstances ?? 1);
  if (expectedInstances > 1) {
    const idPattern = escapeRegExp(id);
    const countPattern = escapeRegExp(expectedInstances);
    const sameTagForward = new RegExp(`data-source-region\\s*=\\s*["']${idPattern}["'][^>]*data-source-instances\\s*=\\s*["']${countPattern}["']`);
    const sameTagReverse = new RegExp(`data-source-instances\\s*=\\s*["']${countPattern}["'][^>]*data-source-region\\s*=\\s*["']${idPattern}["']`);
    if (!sameTagForward.test(rawOutput) && !sameTagReverse.test(rawOutput)) {
      issues.push({
        severity: "error",
        code: "region-instance-marker-missing",
        target: id,
        message: `Repeated region ${id} must declare data-source-instances="${expectedInstances}" on the same element.`
      });
    }
  }
}

for (const match of rawOutput.matchAll(/data-source-region\s*=\s*["']([^"']+)["']/g)) {
  const id = match[1];
  if (coverage.length > 0 && !knownRegionIds.has(id)) {
    issues.push({ severity: "error", code: "unknown-region-marker", target: id, message: `Output contains a source-region marker not declared by the contract: ${id}` });
  }
}

const assetComposition = collectAssetComposition(contract);
const knownCompositionIds = new Set();
for (const [index, composition] of assetComposition.entries()) {
  const id = composition?.id;
  if (typeof id !== "string" || !id.trim()) {
    issues.push({ severity: "error", code: "invalid-asset-composition", target: `assetComposition[${index}]`, message: "Asset composition entries require an ID." });
    continue;
  }
  knownCompositionIds.add(id);
  const idPattern = escapeRegExp(id);
  const marker = new RegExp(`data-asset-composition\\s*=\\s*["']${idPattern}["']`, "g");
  const markerCount = [...rawOutput.matchAll(marker)].length;
  if (markerCount === 0) {
    issues.push({ severity: "error", code: "asset-composition-marker-missing", target: id, message: `Output is missing asset composition marker: ${id}` });
  } else if (markerCount > 1) {
    issues.push({ severity: "error", code: "asset-composition-marker-duplicated", target: id, message: `Output contains duplicate asset composition markers: ${id}` });
  }

  const modePattern = escapeRegExp(composition.mode ?? "");
  const fitPattern = escapeRegExp(composition.fit ?? "");
  const attributes = [
    `data-asset-composition\\s*=\\s*["']${idPattern}["']`,
    `data-asset-mode\\s*=\\s*["']${modePattern}["']`,
    `data-asset-fit\\s*=\\s*["']${fitPattern}["']`
  ];
  const permutations = [
    new RegExp(`${attributes[0]}[^>]*${attributes[1]}[^>]*${attributes[2]}`),
    new RegExp(`${attributes[0]}[^>]*${attributes[2]}[^>]*${attributes[1]}`),
    new RegExp(`${attributes[1]}[^>]*${attributes[0]}[^>]*${attributes[2]}`),
    new RegExp(`${attributes[1]}[^>]*${attributes[2]}[^>]*${attributes[0]}`),
    new RegExp(`${attributes[2]}[^>]*${attributes[0]}[^>]*${attributes[1]}`),
    new RegExp(`${attributes[2]}[^>]*${attributes[1]}[^>]*${attributes[0]}`)
  ];
  if (!permutations.some((pattern) => pattern.test(rawOutput))) {
    issues.push({ severity: "error", code: "asset-composition-attributes-missing", target: id, message: "Composition marker must declare its mode and fit on the same element." });
  }

  const references = composition.mode === "layered" ? composition.layers : [composition];
  for (const reference of Array.isArray(references) ? references : []) {
    if (typeof reference?.assetPath === "string") {
      const path = reference.assetPath.toLowerCase();
      const name = basename(reference.assetPath).toLowerCase();
      if (!outputForAssets.includes(path) && !outputForAssets.includes(name)) {
        issues.push({ severity: "error", code: "composition-asset-not-referenced", target: reference.assetPath, message: `Output does not reference composition asset: ${reference.assetPath}` });
      }
    }
    if (composition.mode === "layered" && typeof reference?.assetId === "string") {
      const layerMarker = new RegExp(`data-asset-layer\\s*=\\s*["']${escapeRegExp(reference.assetId)}["']`, "g");
      const count = [...rawOutput.matchAll(layerMarker)].length;
      if (count !== 1) {
        issues.push({ severity: "error", code: "asset-layer-marker-invalid", target: reference.assetId, message: `Layered assets require exactly one data-asset-layer marker; found ${count}.` });
      }
    }
  }
}

for (const match of rawOutput.matchAll(/data-asset-composition\s*=\s*["']([^"']+)["']/g)) {
  const id = match[1];
  if (assetComposition.length > 0 && !knownCompositionIds.has(id)) {
    issues.push({ severity: "error", code: "unknown-asset-composition-marker", target: id, message: `Output contains an undeclared asset composition marker: ${id}` });
  }
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  stats: {
    filesChecked: files.length,
    requiredText: required.size,
    forbiddenText: forbidden.size,
    products: collectProducts(contract).length,
    mustCropRegions: collectCropRegions(contract).filter((region) => region?.mustCrop === true).length,
    coveredRegions: coverage.length,
    assetCompositions: assetComposition.length
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
