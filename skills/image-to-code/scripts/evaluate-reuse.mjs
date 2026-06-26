#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(`evaluate-reuse: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) fail(`unexpected argument: ${item}`);
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function normalizeText(value) {
  return String(value).toLowerCase();
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`could not read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
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

function collectHexValues(value, output = new Set()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) output.add(match[0].toLowerCase());
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectHexValues(item, output);
    return output;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectHexValues(item, output);
  }

  return output;
}

function collectContractStats(contract) {
  return {
    sections: Array.isArray(contract?.sections) ? contract.sections.length : 0,
    products: Array.isArray(contract?.products) ? contract.products.length : 0,
    filterGroups: Array.isArray(contract?.filterGroups) ? contract.filterGroups.length : 0,
    footerColumns: Array.isArray(contract?.footerColumns) ? contract.footerColumns.length : 0,
    mustCropRegions: Array.isArray(contract?.cropRegions) ? contract.cropRegions.filter((region) => region?.mustCrop === true).length : 0
  };
}

const args = parseArgs(process.argv.slice(2));
const designSystemPath = args["design-system"];
const contractPath = args.contract;
const outputPath = args.output;

if (!designSystemPath || !contractPath || !outputPath) {
  fail("usage: node evaluate-reuse.mjs --design-system <design-system.json> --contract <page-contract.json> --output <output-file-or-dir>");
}

for (const path of [designSystemPath, contractPath, outputPath]) {
  if (!existsSync(path)) fail(`path does not exist: ${path}`);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const validatorPath = join(scriptDir, "validate-page-contract.mjs");
const validatorResult = spawnSync(process.execPath, [validatorPath, contractPath, outputPath], { encoding: "utf8" });
let contractReport;
try {
  contractReport = JSON.parse(validatorResult.stdout);
} catch {
  fail(`contract validator did not return JSON: ${validatorResult.stderr || validatorResult.stdout}`);
}

const designSystem = await readJson(designSystemPath);
const contract = await readJson(contractPath);
const files = await listTextFiles(outputPath);
const outputText = normalizeText((await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n"));
const designColors = [...collectHexValues(designSystem)];
const reusedColors = designColors.filter((color) => outputText.includes(color));
const issues = [...contractReport.issues];

if (designColors.length > 0 && reusedColors.length === 0) {
  issues.push({
    severity: "warning",
    code: "no-design-token-color-reuse",
    target: "design-system.colors",
    message: "No design-system hex color values were found in the generated output."
  });
}

const contractStats = collectContractStats(contract);
if (contractStats.products === 0) {
  issues.push({
    severity: "warning",
    code: "no-products-in-contract",
    target: "page-contract.products",
    message: "Contract has no products; ecommerce reuse evaluation may be too weak."
  });
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  scores: {
    contractIntegrity: contractReport.valid ? 1 : 0,
    designColorReuse: designColors.length === 0 ? null : Number((reusedColors.length / designColors.length).toFixed(2))
  },
  stats: {
    filesChecked: files.length,
    designColors: designColors.length,
    reusedDesignColors: reusedColors.length,
    ...contractStats
  },
  manualReviewChecklist: [
    "Does the generated page keep the target screenshot section order?",
    "Are product names, prices, ratings, filters, newsletter, and footer text faithful?",
    "Are mustCrop image regions visually correct, not just present?",
    "Does the output reuse the source design-system style without copying source-page facts?",
    "Is the result better than a no-design-system baseline?"
  ]
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
