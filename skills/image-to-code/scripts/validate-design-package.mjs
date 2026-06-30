#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

function usage() {
  console.error("Usage: node validate-design-package.mjs <design-package-dir>");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(path, issues) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    issues.push({
      severity: "error",
      code: "invalid-json",
      target: path,
      message: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function addIssue(issues, severity, code, target, message) {
  issues.push({ severity, code, target, message });
}

function validBox(value) {
  return isRecord(value)
    && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(value[key])))
    && Number(value.x) >= 0
    && Number(value.y) >= 0
    && Number(value.width) > 0
    && Number(value.height) > 0;
}

function safePackagePath(packageDir, file) {
  if (typeof file !== "string" || !file.trim() || isAbsolute(file)) return undefined;
  const resolved = resolve(packageDir, file);
  const local = relative(resolve(packageDir), resolved);
  if (local.startsWith("..") || isAbsolute(local)) return undefined;
  return resolved;
}

function validateDesignSource(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid-design-source", "design-source", "design-source.json must contain an object.");
    return;
  }
  if (!["design-board", "design-bundle"].includes(value.meta?.sourceType)) {
    addIssue(issues, "error", "invalid-source-type", "design-source.meta.sourceType", "Source type must be design-board or design-bundle.");
  }
  if (!Array.isArray(value.regions) || value.regions.length === 0) {
    addIssue(issues, "error", "missing-source-regions", "design-source.regions", "At least one classified source region is required.");
    return;
  }

  const allowedRoles = new Set(["page-layout", "asset", "component-reference", "token-reference", "ignore"]);
  const ids = new Set();
  for (const [index, region] of value.regions.entries()) {
    const target = `design-source.regions[${index}]`;
    if (!isRecord(region)) {
      addIssue(issues, "error", "invalid-source-region", target, "Source regions must be objects.");
      continue;
    }
    if (typeof region.id !== "string" || !region.id.trim()) {
      addIssue(issues, "error", "missing-region-id", target, "Source regions require stable IDs.");
    } else if (ids.has(region.id)) {
      addIssue(issues, "error", "duplicate-region-id", region.id, "Source region IDs must be unique.");
    } else {
      ids.add(region.id);
    }
    if (!allowedRoles.has(region.role)) {
      addIssue(issues, "error", "invalid-region-role", region.id ?? target, "Region role is not supported.");
    }
    if (region.role !== "ignore" && !validBox(region.bbox)) {
      addIssue(issues, "error", "invalid-region-bbox", region.id ?? target, "Meaningful source regions require a positive pixel bbox.");
    }
  }
}

function validateDesignSystem(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid-design-system", "design-system", "design-system.json must contain an object.");
    return;
  }
  for (const key of ["meta", "colors", "typography", "spacing", "radius", "shadow"]) {
    if (!isRecord(value[key])) {
      addIssue(issues, "error", "missing-design-system-group", `design-system.${key}`, `design-system.${key} must be an object.`);
    }
  }
}

function validateComponents(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid-components", "components", "components.json must contain an object.");
    return;
  }
  for (const name of Object.keys(value)) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      addIssue(issues, "error", "invalid-component-name", name, "Component keys must be PascalCase.");
    }
  }
}

function validatePageFacts(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid-page-facts", "page-facts", "page-facts.json must contain an object.");
    return;
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    addIssue(issues, "error", "missing-fact-sections", "page-facts.sections", "Page facts require ordered page sections.");
  }
  if (!Array.isArray(value.visibleText) || value.visibleText.length === 0) {
    addIssue(issues, "error", "missing-visible-text", "page-facts.visibleText", "Page facts require an exhaustive visibleText array.");
  }
  if (!Array.isArray(value.regions) || value.regions.length === 0) {
    addIssue(issues, "error", "missing-page-regions", "page-facts.regions", "Page facts require a non-empty visual region inventory.");
  }
  if (Array.isArray(value.inferredText) && value.inferredText.length > 0) {
    addIssue(issues, "error", "inferred-page-text", "page-facts.inferredText", "Design-board page facts must not contain inferred text.");
  }
}

function validateManifest(value, designSource, packageDir, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid-asset-manifest", "asset-manifest", "asset-manifest.json must contain an object.");
    return { assets: 0, reusableAssets: 0 };
  }
  if (!Array.isArray(value.assets)) {
    addIssue(issues, "error", "missing-assets", "asset-manifest.assets", "asset-manifest.assets must be an array.");
    return { assets: 0, reusableAssets: 0 };
  }

  const assetRegions = new Set(
    Array.isArray(designSource?.regions)
      ? designSource.regions.filter((region) => region?.role === "asset" && region?.decision === "extract").map((region) => region.id)
      : []
  );
  const manifestedRegions = new Set();
  const ids = new Set();
  const files = new Set();
  let reusableAssets = 0;

  for (const [index, asset] of value.assets.entries()) {
    const target = `asset-manifest.assets[${index}]`;
    if (!isRecord(asset)) {
      addIssue(issues, "error", "invalid-asset", target, "Asset entries must be objects.");
      continue;
    }
    if (typeof asset.id !== "string" || !asset.id.trim()) {
      addIssue(issues, "error", "missing-asset-id", target, "Assets require stable IDs.");
    } else if (ids.has(asset.id)) {
      addIssue(issues, "error", "duplicate-asset-id", asset.id, "Asset IDs must be unique.");
    } else {
      ids.add(asset.id);
      manifestedRegions.add(asset.id);
    }

    if (!["crop", "recreate", "provided"].includes(asset.extraction)) {
      addIssue(issues, "error", "invalid-extraction-method", asset.id ?? target, "Asset extraction must be crop, recreate, or provided.");
    }
    if (asset.extraction === "crop" && !validBox(asset.sourceRegion)) {
      addIssue(issues, "error", "invalid-asset-source-region", asset.id ?? target, "Cropped assets require a positive sourceRegion bbox.");
    }
    if (!isRecord(asset.presentation)) {
      addIssue(issues, "error", "missing-asset-presentation", asset.id ?? target, "Assets require presentation metadata for deterministic composition.");
    } else {
      if (!["transparent", "opaque", "full-bleed"].includes(asset.presentation.background)) {
        addIssue(issues, "error", "invalid-asset-background", asset.id ?? target, "Asset presentation background must be transparent, opaque, or full-bleed.");
      }
      if (!["contain", "cover", "fill", "none"].includes(asset.presentation.recommendedFit)) {
        addIssue(issues, "error", "invalid-asset-fit", asset.id ?? target, "Asset presentation recommendedFit is invalid.");
      }
    }

    const assetPath = safePackagePath(packageDir, asset.file);
    if (!assetPath) {
      addIssue(issues, "error", "unsafe-asset-path", asset.id ?? target, "Asset file must be a relative path inside the design package.");
    } else {
      if (files.has(asset.file)) {
        addIssue(issues, "error", "duplicate-asset-file", asset.file, "Each asset should use a distinct file path.");
      }
      files.add(asset.file);
      if (!existsSync(assetPath) || !statSync(assetPath).isFile() || statSync(assetPath).size === 0) {
        addIssue(issues, "error", "missing-asset-file", asset.file, "Manifest asset file is missing or empty.");
      }
    }
    if (asset.reusable === true) reusableAssets += 1;
  }

  for (const regionId of assetRegions) {
    if (!manifestedRegions.has(regionId)) {
      addIssue(issues, "error", "unmaterialized-asset-region", regionId, "An extractable asset region has no matching manifest asset.");
    }
  }

  if (value.assets.length === 0) {
    addIssue(issues, "warning", "no-materialized-assets", "asset-manifest.assets", "The design package contains no real visual assets; confirm that the input was actually a design board.");
  }

  return { assets: value.assets.length, reusableAssets };
}

async function main() {
  const [packageDir] = process.argv.slice(2);
  if (!packageDir) {
    usage();
    process.exit(2);
  }
  if (!existsSync(packageDir) || !statSync(packageDir).isDirectory()) {
    console.error(`validate-design-package: directory does not exist: ${packageDir}`);
    process.exit(2);
  }

  const issues = [];
  const designSource = await readJson(join(packageDir, "design-source.json"), issues);
  const pageFacts = await readJson(join(packageDir, "page-facts.json"), issues);
  const assetManifest = await readJson(join(packageDir, "asset-manifest.json"), issues);
  const designSystem = await readJson(join(packageDir, "design-system.json"), issues);
  const components = await readJson(join(packageDir, "components.json"), issues);

  validateDesignSource(designSource, issues);
  validatePageFacts(pageFacts, issues);
  validateDesignSystem(designSystem, issues);
  validateComponents(components, issues);
  const stats = validateManifest(assetManifest, designSource, packageDir, issues);

  const report = {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    stats: {
      regions: Array.isArray(designSource?.regions) ? designSource.regions.length : 0,
      visibleFacts: Array.isArray(pageFacts?.visibleText) ? pageFacts.visibleText.length : 0,
      pageRegions: Array.isArray(pageFacts?.regions) ? pageFacts.regions.length : 0,
      components: isRecord(components) ? Object.keys(components).length : 0,
      assets: stats.assets,
      reusableAssets: stats.reusableAssets
    }
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.valid ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
