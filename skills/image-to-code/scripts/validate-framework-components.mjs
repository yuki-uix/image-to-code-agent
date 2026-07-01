#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

function fail(message) {
  console.error(`validate-framework-components: ${message}`);
  process.exit(2);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safePath(root, value) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) return undefined;
  const path = resolve(root, value);
  const local = relative(resolve(root), path);
  return local.startsWith("..") || isAbsolute(local) ? undefined : path;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function listSourceFiles(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await listSourceFiles(child));
    else if ([".tsx", ".ts", ".vue"].includes(extname(entry.name).toLowerCase())) result.push(child);
  }
  return result;
}

function addIssue(issues, code, target, message) {
  issues.push({ severity: "error", code, target, message });
}

const [, , framework, registryPath, contractPath, manifestPath, outputArg] = process.argv;
if (!["react", "vue"].includes(framework) || !registryPath || !contractPath || !manifestPath || !outputArg) {
  fail("usage: node validate-framework-components.mjs <react|vue> <components.json> <page-contract.json> <component-manifest.json> <output-dir>");
}

for (const path of [registryPath, contractPath, manifestPath]) {
  if (!existsSync(path)) fail(`required file does not exist: ${path}`);
}
const outputDir = resolve(outputArg);
if (!existsSync(outputDir) || !statSync(outputDir).isDirectory()) fail(`output directory does not exist: ${outputDir}`);

const registry = await readJson(registryPath);
const contract = await readJson(contractPath);
const manifest = await readJson(manifestPath);
const issues = [];
const required = Array.isArray(contract?.requiredComponents) ? contract.requiredComponents : [];
const declared = Array.isArray(manifest?.components) ? manifest.components : [];

if (manifest?.meta?.framework !== framework) {
  addIssue(issues, "framework-mismatch", "component-manifest.meta.framework", `Manifest framework must be ${framework}.`);
}
if (required.length === 0) {
  addIssue(issues, "missing-required-components", "page-contract.requiredComponents", "React/Vue page contracts require a non-empty requiredComponents list.");
}
if (declared.length === 0) {
  addIssue(issues, "missing-component-manifest", "component-manifest.components", "Component manifest requires reusable component entries.");
}

const sourceFiles = await listSourceFiles(outputDir);
const sourceByPath = new Map(await Promise.all(sourceFiles.map(async (path) => [resolve(path), await readFile(path, "utf8")])));
const declaredBySource = new Map();

for (const [index, component] of declared.entries()) {
  const target = component?.sourceComponent ?? component?.name ?? `component-manifest.components[${index}]`;
  if (!isRecord(component) || typeof component.name !== "string" || typeof component.sourceComponent !== "string") {
    addIssue(issues, "invalid-component-entry", target, "Manifest components require name and sourceComponent.");
    continue;
  }
  const entries = declaredBySource.get(component.sourceComponent) ?? [];
  entries.push(component);
  declaredBySource.set(component.sourceComponent, entries);
  if (!isRecord(registry?.[component.sourceComponent])) {
    addIssue(issues, "unknown-source-component", component.sourceComponent, "Manifest component is not present in design-package components.json.");
  }
}

const expectedExtension = framework === "react" ? ".tsx" : ".vue";
for (const [index, item] of required.entries()) {
  const sourceComponent = typeof item === "string" ? item : item?.sourceComponent;
  const outputName = typeof item === "string" ? item : item?.name;
  const target = sourceComponent ?? `page-contract.requiredComponents[${index}]`;
  if (typeof sourceComponent !== "string" || typeof outputName !== "string" || !isRecord(registry?.[sourceComponent])) {
    addIssue(issues, "invalid-required-component", target, "Required components must reference a registry component and output name.");
    continue;
  }
  const matches = declaredBySource.get(sourceComponent) ?? [];
  if (matches.length !== 1) {
    addIssue(issues, matches.length === 0 ? "required-component-omitted" : "duplicate-component-mapping", sourceComponent, "Every required registry component must map to exactly one output component.");
    continue;
  }
  const component = matches[0];
  if (component.name !== outputName) {
    addIssue(issues, "component-name-mismatch", sourceComponent, `Manifest output name must be ${outputName}.`);
  }
  if (component.reusable !== true) {
    addIssue(issues, "component-not-reusable", sourceComponent, "Required framework components must be marked reusable.");
  }
  const file = safePath(outputDir, component.file);
  if (!file || extname(file).toLowerCase() !== expectedExtension || !existsSync(file) || statSync(file).size === 0) {
    addIssue(issues, "missing-component-file", sourceComponent, `Component requires a non-empty ${expectedExtension} file inside the output directory.`);
    continue;
  }

  const registryProps = Array.isArray(registry[sourceComponent].props) ? registry[sourceComponent].props : [];
  const manifestProps = new Set(Array.isArray(component.props) ? component.props : []);
  for (const prop of registryProps) {
    if (!manifestProps.has(prop)) addIssue(issues, "missing-component-prop", `${sourceComponent}.${prop}`, "Output component must preserve the registry public prop.");
  }
  const registryVariants = Array.isArray(registry[sourceComponent].variants)
    ? registry[sourceComponent].variants.map((variant) => variant?.name).filter(Boolean)
    : [];
  const manifestVariants = new Set(Array.isArray(component.variants) ? component.variants : []);
  for (const variant of registryVariants) {
    if (!manifestVariants.has(variant)) addIssue(issues, "missing-component-variant", `${sourceComponent}.${variant}`, "Output component must preserve the registry variant.");
  }

  const componentSource = sourceByPath.get(resolve(file)) ?? "";
  const definesComponent = framework === "react" ? componentSource.includes(component.name) : componentSource.includes("<template");
  if (!definesComponent) {
    addIssue(issues, "invalid-component-source", sourceComponent, "Component file does not define the declared component shape.");
  }
  for (const prop of registryProps) {
    if (typeof prop !== "string" || !/^[A-Za-z_$][\w$]*$/.test(prop) || !new RegExp(`\\b${prop}\\b`).test(componentSource)) {
      addIssue(issues, "component-prop-not-implemented", `${sourceComponent}.${prop}`, "Component source must implement every registry prop, not only declare it in the manifest.");
    }
  }
  const consumerSources = [...sourceByPath.entries()].filter(([path]) => path !== resolve(file)).map(([, source]) => source);
  const tagPattern = new RegExp(`<${component.name}(?:\\s|/|>)`);
  const consumers = consumerSources.filter((source) => tagPattern.test(source));
  if (consumers.length === 0) {
    addIssue(issues, "component-not-rendered", sourceComponent, "Required component must be imported and rendered outside its own file.");
  }
  const fileStem = basename(file, extname(file));
  const importPattern = new RegExp(`import[\\s\\S]*?\\b${component.name}\\b[\\s\\S]*?from\\s*["'][^"']*${fileStem}(?:\\.${framework === "react" ? "tsx" : "vue"})?["']`);
  if (!consumers.some((source) => importPattern.test(source))) {
    addIssue(issues, "component-not-imported", sourceComponent, "Consumer must import the declared reusable component file.");
  }

  const repeated = typeof item === "object" && item?.repeated === true;
  if (repeated) {
    if (component.renderStrategy !== "data-driven") {
      addIssue(issues, "repeated-component-not-data-driven", sourceComponent, "Repeated components require renderStrategy=data-driven.");
    }
    const hasLoop = consumers.some((source) => framework === "react" ? source.includes(".map(") : /v-for\s*=/.test(source));
    if (!hasLoop) addIssue(issues, "missing-repeated-render-loop", sourceComponent, `Repeated ${framework} components must render from a loop.`);
  }
}

const entry = safePath(outputDir, manifest?.entry);
if (!entry || !existsSync(entry) || statSync(entry).size === 0) {
  addIssue(issues, "missing-framework-entry", "component-manifest.entry", "Manifest entry must point to a non-empty framework entry file.");
}

const report = {
  valid: issues.length === 0,
  issues,
  stats: {
    framework,
    requiredComponents: required.length,
    declaredComponents: declared.length,
    sourceFiles: sourceFiles.length
  }
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);
