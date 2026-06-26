#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

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

const files = await listTextFiles(outputPath);
const output = normalize((await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n"));

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

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  stats: {
    filesChecked: files.length,
    requiredText: required.size,
    forbiddenText: forbidden.size
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
