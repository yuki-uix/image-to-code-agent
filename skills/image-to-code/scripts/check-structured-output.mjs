#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function usage() {
  console.error(`Usage:
  node check-structured-output.mjs <structured-output-dir>
`);
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

function requireObject(parent, key, target, issues) {
  if (!isRecord(parent?.[key])) {
    issues.push({
      severity: "error",
      code: "missing-object",
      target: `${target}.${key}`,
      message: `${target}.${key} must be an object`
    });
  }
}

function hasPlaceholder(value) {
  const text = JSON.stringify(value);
  return /\b(lorem ipsum|service 1|card title|product name|description goes here)\b/i.test(text);
}

function validateDesignSystem(value, issues) {
  if (!isRecord(value)) return;
  for (const key of ["meta", "colors", "typography", "spacing", "radius", "shadow"]) {
    requireObject(value, key, "design-system", issues);
  }
  if (hasPlaceholder(value)) {
    issues.push({
      severity: "warning",
      code: "placeholder-text",
      target: "design-system",
      message: "Design system contains generic placeholder text"
    });
  }
}

function validateComponents(value, issues) {
  if (!isRecord(value)) return;
  for (const [name, component] of Object.entries(value)) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      issues.push({
        severity: "error",
        code: "invalid-component-name",
        target: name,
        message: "Component keys must be PascalCase"
      });
    }
    if (!isRecord(component)) continue;
    if (component.reusable === true && Number(component.instancesObserved ?? 0) > 1) {
      const props = component.props;
      if (!Array.isArray(props) || props.length === 0) {
        issues.push({
          severity: "error",
          code: "missing-repeated-component-props",
          target: name,
          message: "Repeated reusable components must list props that differ across instances"
        });
      }
    }
  }
  if (hasPlaceholder(value)) {
    issues.push({
      severity: "warning",
      code: "placeholder-text",
      target: "components",
      message: "Components contain generic placeholder text"
    });
  }
}

function validatePageAnalysis(value, issues) {
  if (!isRecord(value)) return;
  if (!Array.isArray(value.sections)) {
    issues.push({
      severity: "error",
      code: "missing-sections",
      target: "page-analysis.sections",
      message: "page-analysis.sections must be an array"
    });
  } else {
    let previousOrder = 0;
    for (const section of value.sections) {
      if (!isRecord(section)) continue;
      const order = Number(section.order);
      if (Number.isFinite(order) && order < previousOrder) {
        issues.push({
          severity: "error",
          code: "unordered-sections",
          target: "page-analysis.sections",
          message: "Sections should preserve top-to-bottom order"
        });
        break;
      }
      if (Number.isFinite(order)) previousOrder = order;
    }
  }
  if (!Array.isArray(value.visibleText)) {
    issues.push({
      severity: "warning",
      code: "missing-visible-text",
      target: "page-analysis.visibleText",
      message: "page-analysis.visibleText should list readable text from the screenshot"
    });
  }
  if (hasPlaceholder(value)) {
    issues.push({
      severity: "warning",
      code: "placeholder-text",
      target: "page-analysis",
      message: "Page analysis contains generic placeholder text"
    });
  }
}

async function main() {
  const [dir] = process.argv.slice(2);
  if (!dir) {
    usage();
    process.exit(1);
  }

  const issues = [];
  const designSystem = await readJson(join(dir, "design-system.json"), issues);
  const components = await readJson(join(dir, "components.json"), issues);
  const pageAnalysis = await readJson(join(dir, "page-analysis.json"), issues);

  validateDesignSystem(designSystem, issues);
  validateComponents(components, issues);
  validatePageAnalysis(pageAnalysis, issues);

  const report = {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    stats: {
      components: isRecord(components) ? Object.keys(components).length : 0,
      sections: Array.isArray(pageAnalysis?.sections) ? pageAnalysis.sections.length : 0
    }
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.valid ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
