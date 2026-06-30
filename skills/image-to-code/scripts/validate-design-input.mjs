#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`validate-design-input: ${message}`);
  process.exit(2);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safePath(root, value) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) return undefined;
  const path = resolve(root, value);
  const local = relative(resolve(root), path);
  if (local.startsWith("..") || isAbsolute(local)) return undefined;
  return path;
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

async function listFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else files.push(child);
  }
  return files;
}

function imageInfo(path) {
  if (extname(path).toLowerCase() === ".svg") {
    try {
      const source = readFileSync(path, "utf8").slice(0, 8192);
      if (!/<svg\b/i.test(source)) return { valid: false };
      const width = Number(source.match(/\bwidth=["']([\d.]+)/i)?.[1]);
      const height = Number(source.match(/\bheight=["']([\d.]+)/i)?.[1]);
      const viewBox = source.match(/\bviewBox=["'][^"']*?([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)["']/i);
      return {
        valid: true,
        width: Number.isFinite(width) && width > 0 ? width : viewBox ? Number(viewBox[3]) : undefined,
        height: Number.isFinite(height) && height > 0 ? height : viewBox ? Number(viewBox[4]) : undefined
      };
    } catch {
      return { valid: false };
    }
  }
  const result = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", path], { encoding: "utf8" });
  if (result.status !== 0) return { valid: false };
  const width = result.stdout.match(/pixelWidth:\s*(\d+)/)?.[1];
  const height = result.stdout.match(/pixelHeight:\s*(\d+)/)?.[1];
  const alpha = result.stdout.match(/hasAlpha:\s*(yes|no)/i)?.[1];
  const parsedWidth = width ? Number(width) : undefined;
  const parsedHeight = height ? Number(height) : undefined;
  return {
    valid: Number.isFinite(parsedWidth) && parsedWidth > 0 && Number.isFinite(parsedHeight) && parsedHeight > 0,
    width: parsedWidth,
    height: parsedHeight,
    hasAlpha: alpha ? alpha.toLowerCase() === "yes" : undefined
  };
}

const [inputDirArg] = process.argv.slice(2);
if (!inputDirArg) fail("usage: node validate-design-input.mjs <design-input-dir>");
const inputDir = resolve(inputDirArg);
if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) fail(`input directory does not exist: ${inputDir}`);

const issues = [];
const manifestPath = join(inputDir, "input-manifest.json");
let manifest;
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    issues.push({ severity: "error", code: "invalid-input-manifest", target: manifestPath, message: error instanceof Error ? error.message : String(error) });
  }
} else {
  issues.push({ severity: "warning", code: "missing-input-manifest", target: "input-manifest.json", message: "Optional input manifest is missing; presentation metadata must be created during packaging." });
}

let pageReference;
if (isRecord(manifest) && typeof manifest.pageReference === "string") {
  pageReference = safePath(inputDir, manifest.pageReference);
  if (!pageReference || !existsSync(pageReference)) {
    issues.push({ severity: "error", code: "missing-page-reference", target: manifest.pageReference, message: "Manifest pageReference is missing or unsafe." });
  }
} else {
  const rootFiles = await readdir(inputDir, { withFileTypes: true });
  const matches = rootFiles
    .filter((entry) => entry.isFile() && /^page-reference\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => join(inputDir, entry.name));
  if (matches.length !== 1) {
    issues.push({ severity: "error", code: "ambiguous-page-reference", target: inputDir, message: "Design bundle requires exactly one page-reference image." });
  } else {
    pageReference = matches[0];
  }
}

if (pageReference && existsSync(pageReference)) {
  const info = imageInfo(pageReference);
  if (!info.valid) {
    issues.push({ severity: "error", code: "invalid-image-file", target: basename(pageReference), message: "Page reference is not a readable image file." });
  } else if (info.width && info.height && (info.width < 320 || info.height < 320)) {
    issues.push({ severity: "error", code: "page-reference-too-small", target: basename(pageReference), message: `Page reference is only ${info.width}x${info.height}.` });
  } else if (info.width && info.width < 800) {
    issues.push({ severity: "warning", code: "page-reference-low-resolution", target: basename(pageReference), message: `Page reference width ${info.width}px may limit fidelity.` });
  }
}

const assetsDir = join(inputDir, "assets");
let assetFiles = [];
if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
  issues.push({ severity: "error", code: "missing-assets-directory", target: assetsDir, message: "Design bundle requires an assets directory." });
} else {
  assetFiles = (await listFiles(assetsDir)).filter((path) => imageExtensions.has(extname(path).toLowerCase()));
  if (assetFiles.length === 0) {
    issues.push({ severity: "error", code: "empty-assets-directory", target: assetsDir, message: "Design bundle contains no supported image assets." });
  }
}

const seenNames = new Set();
const invalidImagePaths = new Set();
for (const file of assetFiles) {
  const local = relative(inputDir, file);
  if (statSync(file).size === 0) {
    issues.push({ severity: "error", code: "empty-asset-file", target: local, message: "Asset file is empty." });
  }
  const normalizedName = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (seenNames.has(normalizedName)) {
    issues.push({ severity: "error", code: "duplicate-asset-name", target: normalizedName, message: "Asset basenames must be unique after normalization." });
  }
  seenNames.add(normalizedName);
  if (/^(image|img|export|screenshot|asset)(-?\d+|-?final)?$/i.test(normalizedName)) {
    issues.push({ severity: "warning", code: "generic-asset-name", target: local, message: "Use a semantic asset filename." });
  }
  const info = imageInfo(file);
  if (!info.valid) {
    invalidImagePaths.add(resolve(file));
    issues.push({ severity: "error", code: "invalid-image-file", target: local, message: "Asset is not a readable image file." });
  } else if (info.width && info.height && Math.max(info.width, info.height) < 128) {
    issues.push({ severity: "warning", code: "small-raster-asset", target: local, message: `Raster asset is only ${info.width}x${info.height}.` });
  }
}

if (isRecord(manifest)) {
  if (!Array.isArray(manifest.assets)) {
    issues.push({ severity: "error", code: "missing-manifest-assets", target: "input-manifest.assets", message: "Manifest assets must be an array." });
  } else {
    const listedFiles = new Set();
    const listedIds = new Set();
    for (const [index, asset] of manifest.assets.entries()) {
      const target = asset?.id ?? `input-manifest.assets[${index}]`;
      if (!isRecord(asset) || typeof asset.id !== "string" || !asset.id.trim()) {
        issues.push({ severity: "error", code: "invalid-manifest-asset", target, message: "Manifest assets require stable IDs." });
        continue;
      }
      if (listedIds.has(asset.id)) issues.push({ severity: "error", code: "duplicate-manifest-asset-id", target: asset.id, message: "Manifest asset IDs must be unique." });
      listedIds.add(asset.id);
      const path = safePath(inputDir, asset.file);
      if (!path || !path.startsWith(resolve(assetsDir) + "/") || !existsSync(path)) {
        issues.push({ severity: "error", code: "missing-manifest-asset-file", target, message: "Manifest asset file must exist inside assets/." });
        continue;
      }
      const extension = extname(path).toLowerCase();
      const info = imageExtensions.has(extension) ? imageInfo(path) : { valid: false };
      if (!info.valid && !invalidImagePaths.has(resolve(path))) {
        invalidImagePaths.add(resolve(path));
        issues.push({ severity: "error", code: "invalid-image-file", target, message: "Manifest asset is not a supported readable image file." });
      }
      listedFiles.add(resolve(path));
      if (!isRecord(asset.presentation)
        || !["transparent", "opaque", "full-bleed"].includes(asset.presentation.background)
        || !["contain", "cover", "fill", "none"].includes(asset.presentation.recommendedFit)) {
        issues.push({ severity: "error", code: "invalid-manifest-presentation", target, message: "Manifest assets require valid background and recommendedFit presentation metadata." });
      }
      if (info.valid && asset.presentation?.background === "transparent" && info.hasAlpha === false) {
        issues.push({ severity: "error", code: "false-transparent-asset", target, message: "Asset is declared transparent but the file has no alpha channel." });
      }
    }
    for (const file of assetFiles) {
      if (!listedFiles.has(resolve(file))) {
        issues.push({ severity: "error", code: "unmanifested-asset", target: relative(inputDir, file), message: "Every asset file must be listed when input-manifest.json is present." });
      }
    }
  }
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  stats: {
    pageReference: pageReference ? relative(inputDir, pageReference) : null,
    assets: assetFiles.length,
    manifestProvided: Boolean(manifest),
    designBoardProvided: existsSync(join(inputDir, "design-board.png")) || (typeof manifest?.designBoard === "string" && Boolean(safePath(inputDir, manifest.designBoard)))
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
