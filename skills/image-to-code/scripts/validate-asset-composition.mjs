#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

function fail(message) {
  console.error(`validate-asset-composition: ${message}`);
  process.exit(2);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validAspectRatio(value) {
  if (typeof value !== "string") return false;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  return Boolean(match) && Number(match[1]) > 0 && Number(match[2]) > 0;
}

const allowedModes = new Set(["single", "background", "layered"]);
const allowedFits = new Set(["contain", "cover", "fill", "none"]);
const imageRenderTypes = new Set(["img", "image", "background", "media"]);

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const [, , manifestPath, contractPath] = process.argv;
if (!manifestPath || !contractPath) {
  fail("usage: node validate-asset-composition.mjs <asset-manifest.json> <page-contract.json>");
}
if (!existsSync(manifestPath)) fail(`asset manifest does not exist: ${manifestPath}`);
if (!existsSync(contractPath)) fail(`page contract does not exist: ${contractPath}`);

const manifest = await readJson(manifestPath);
const contract = await readJson(contractPath);
const issues = [];
const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
const coverage = Array.isArray(contract?.regionCoverage) ? contract.regionCoverage : [];
const compositions = Array.isArray(contract?.assetComposition) ? contract.assetComposition : [];

const assetsById = new Map();
for (const [index, asset] of assets.entries()) {
  const target = asset?.id ?? `asset-manifest.assets[${index}]`;
  if (!isRecord(asset) || typeof asset.id !== "string" || !asset.id.trim()) continue;
  assetsById.set(asset.id, asset);
  const presentation = asset.presentation;
  if (!isRecord(presentation)) {
    issues.push({ severity: "error", code: "missing-asset-presentation", target, message: "Assets require presentation metadata before composition." });
    continue;
  }
  if (!["transparent", "opaque", "full-bleed"].includes(presentation.background)) {
    issues.push({ severity: "error", code: "invalid-asset-background", target, message: "Asset background must be transparent, opaque, or full-bleed." });
  }
  if (!allowedFits.has(presentation.recommendedFit)) {
    issues.push({ severity: "error", code: "invalid-recommended-fit", target, message: "Asset recommendedFit is invalid." });
  }
}

const coverageById = new Map();
for (const item of coverage) {
  if (typeof item?.sourceRegionId === "string") coverageById.set(item.sourceRegionId, item);
}

const compositionByRegion = new Map();
const compositionIds = new Set();

function validateAssetReference(assetId, assetPath, target) {
  const asset = assetsById.get(assetId);
  if (!asset) {
    issues.push({ severity: "error", code: "unknown-composition-asset", target, message: `Composition references unknown asset: ${assetId}` });
    return undefined;
  }
  if (typeof assetPath !== "string" || assetPath !== asset.file) {
    issues.push({ severity: "error", code: "composition-asset-path-mismatch", target, message: `Composition assetPath must match manifest file for ${assetId}.` });
  }
  return asset;
}

for (const [index, composition] of compositions.entries()) {
  const target = composition?.id ?? `page-contract.assetComposition[${index}]`;
  if (!isRecord(composition) || typeof composition.id !== "string" || !composition.id.trim()) {
    issues.push({ severity: "error", code: "invalid-composition", target, message: "Asset compositions require a stable ID." });
    continue;
  }
  if (compositionIds.has(composition.id)) {
    issues.push({ severity: "error", code: "duplicate-composition-id", target: composition.id, message: "Asset composition IDs must be unique." });
  }
  compositionIds.add(composition.id);

  const regionId = composition.sourceRegionId;
  if (typeof regionId !== "string" || !coverageById.has(regionId)) {
    issues.push({ severity: "error", code: "unknown-composition-region", target, message: "Asset composition must reference a covered source region." });
  } else if (compositionByRegion.has(regionId)) {
    issues.push({ severity: "error", code: "duplicate-region-composition", target: regionId, message: "Image regions may have only one asset composition." });
  } else {
    compositionByRegion.set(regionId, composition);
  }

  if (!allowedModes.has(composition.mode)) {
    issues.push({ severity: "error", code: "invalid-composition-mode", target, message: "Composition mode must be single, background, or layered." });
  }
  if (!allowedFits.has(composition.fit)) {
    issues.push({ severity: "error", code: "invalid-composition-fit", target, message: "Composition fit must be contain, cover, fill, or none." });
  }
  if (!validAspectRatio(composition.containerAspectRatio)) {
    issues.push({ severity: "error", code: "invalid-container-aspect-ratio", target, message: "Composition requires a positive width/height aspect ratio." });
  }

  if (composition.mode === "single" || composition.mode === "background") {
    validateAssetReference(composition.assetId, composition.assetPath, target);
    if (Array.isArray(composition.layers) && composition.layers.length > 0) {
      issues.push({ severity: "error", code: "unexpected-composition-layers", target, message: "Single/background compositions must not declare layers." });
    }
  }

  if (composition.mode === "layered") {
    const layers = Array.isArray(composition.layers) ? composition.layers : [];
    if (layers.length < 2) {
      issues.push({ severity: "error", code: "insufficient-composition-layers", target, message: "Layered compositions require at least two layers." });
      continue;
    }
    const zIndexes = layers.map((layer) => Number(layer?.zIndex));
    if (zIndexes.some((value) => !Number.isFinite(value)) || new Set(zIndexes).size !== zIndexes.length) {
      issues.push({ severity: "error", code: "invalid-layer-order", target, message: "Layer zIndex values must be finite and unique." });
    }
    const baseZ = Math.min(...zIndexes.filter(Number.isFinite));
    for (const [layerIndex, layer] of layers.entries()) {
      const layerTarget = `${target}.layers[${layerIndex}]`;
      if (!allowedFits.has(layer?.fit)) {
        issues.push({ severity: "error", code: "invalid-layer-fit", target: layerTarget, message: "Layer fit is invalid." });
      }
      const asset = validateAssetReference(layer?.assetId, layer?.assetPath, layerTarget);
      if (asset && Number(layer.zIndex) !== baseZ && asset.presentation?.background !== "transparent") {
        issues.push({ severity: "error", code: "opaque-overlay-layer", target: layer.assetId, message: "Non-base layers must use transparent assets; opaque overlays create visible rectangles." });
      }
    }
  }
}

for (const [regionId, item] of coverageById) {
  if (imageRenderTypes.has(item.renderAs) && !compositionByRegion.has(regionId)) {
    issues.push({ severity: "error", code: "image-region-without-composition", target: regionId, message: "Every covered image/media region requires one asset composition." });
  }
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  stats: {
    assets: assetsById.size,
    compositions: compositions.length,
    layeredCompositions: compositions.filter((item) => item?.mode === "layered").length,
    imageRegions: [...coverageById.values()].filter((item) => imageRenderTypes.has(item.renderAs)).length
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
