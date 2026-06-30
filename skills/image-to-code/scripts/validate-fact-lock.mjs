#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

function fail(message) {
  console.error(`validate-fact-lock: ${message}`);
  process.exit(2);
}

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addText(target, value) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length > 1) target.add(trimmed);
}

const ARRAY_CONTENT_KEYS = new Set([
  "visibleText",
  "requiredText",
  "labels",
  "options",
  "links",
  "benefits",
  "sizes"
]);

const STRING_CONTENT_KEYS = new Set([
  "brand",
  "heading",
  "title",
  "subtitle",
  "price",
  "originalPrice",
  "rating",
  "badge",
  "label",
  "text",
  "description",
  "placeholder",
  "buttonLabel",
  "stockStatus",
  "ctaLabel"
]);

function collectContent(value, target, path = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectContent(item, target, path);
    return;
  }
  if (!isRecord(value)) return;

  const inProducts = path.includes("products");
  for (const [key, item] of Object.entries(value)) {
    if (key === "inferredText" || key === "unreadableText" || key === "forbiddenText") continue;

    if (ARRAY_CONTENT_KEYS.has(key) && Array.isArray(item)) {
      for (const text of item) addText(target, text);
      continue;
    }
    if (STRING_CONTENT_KEYS.has(key)) {
      addText(target, item);
      continue;
    }
    if (key === "name" && inProducts) {
      addText(target, item);
      continue;
    }
    if (typeof item === "object") collectContent(item, target, [...path, key]);
  }
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
  fail("usage: node validate-fact-lock.mjs <page-facts.json> <page-contract.json>");
}
if (!existsSync(factsPath)) fail(`page facts do not exist: ${factsPath}`);
if (!existsSync(contractPath)) fail(`page contract does not exist: ${contractPath}`);

const facts = await readJson(factsPath);
const contract = await readJson(contractPath);
const issues = [];

if (!isRecord(facts)) {
  issues.push({ severity: "error", code: "invalid-page-facts", target: "page-facts", message: "page-facts.json must contain an object." });
}
if (!isRecord(contract)) {
  issues.push({ severity: "error", code: "invalid-page-contract", target: "page-contract", message: "page-contract.json must contain an object." });
}

const visibleText = Array.isArray(facts?.visibleText) ? facts.visibleText.filter((item) => typeof item === "string" && item.trim().length > 1) : [];
if (!Array.isArray(facts?.visibleText)) {
  issues.push({ severity: "error", code: "missing-visible-text", target: "page-facts.visibleText", message: "page-facts.visibleText must be an exhaustive string array." });
}
if (Array.isArray(facts?.inferredText) && facts.inferredText.length > 0) {
  issues.push({ severity: "error", code: "inferred-page-text", target: "page-facts.inferredText", message: "Safe and design-board runs must not contain inferred page text." });
}

const factsContent = new Set();
collectContent(facts, factsContent);
const visibleNormalized = new Set(visibleText.map(normalize));
for (const text of factsContent) {
  if (!visibleNormalized.has(normalize(text))) {
    issues.push({
      severity: "error",
      code: "structured-fact-not-in-visible-text",
      target: text,
      message: `Structured page fact is not backed by page-facts.visibleText: ${text}`
    });
  }
}

const contractContent = new Set();
collectContent(contract, contractContent);
const contractNormalized = new Set([...contractContent].map(normalize));

for (const text of contractContent) {
  if (!visibleNormalized.has(normalize(text))) {
    issues.push({
      severity: "error",
      code: "contract-text-without-source",
      target: text,
      message: `Page contract contains user-visible text not observed in the source page: ${text}`
    });
  }
}

for (const text of visibleText) {
  if (!contractNormalized.has(normalize(text))) {
    issues.push({
      severity: "error",
      code: "source-fact-omitted",
      target: text,
      message: `Page contract omitted visible source text: ${text}`
    });
  }
}

const report = {
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
  stats: {
    visibleFacts: visibleNormalized.size,
    structuredFacts: factsContent.size,
    contractFacts: contractContent.size,
    unreadableFacts: Array.isArray(facts?.unreadableText) ? facts.unreadableText.length : 0,
    inferredFacts: Array.isArray(facts?.inferredText) ? facts.inferredText.length : 0
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
