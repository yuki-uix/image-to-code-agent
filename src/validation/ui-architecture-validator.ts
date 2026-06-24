import type { UiArchitecture } from "../domain/contracts.ts";

export type UiArchitectureIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type UiArchitectureReport = {
  valid: boolean;
  issues: UiArchitectureIssue[];
};

export function validateUiArchitecture(architecture: UiArchitecture): UiArchitectureReport {
  const issues: UiArchitectureIssue[] = [];
  const componentNames = architecture.components.map((component) => component.name);
  const pageRoots = architecture.pages.map((page) => page.rootComponent);
  const knownNames = new Set([...componentNames, ...pageRoots]);
  const files = new Set<string>();

  for (const component of architecture.components) {
    if (!component.name) issues.push(issue("error", "missing-component-name", "components", "Every component needs a name."));
    if (!component.file) issues.push(issue("error", "missing-component-file", component.name, "Every component needs a file path."));
    if (files.has(component.file)) issues.push(issue("error", "duplicate-component-file", component.file, "Component file paths must be unique."));
    files.add(component.file);
  }
  if (new Set(componentNames).size !== componentNames.length) {
    issues.push(issue("error", "duplicate-component-name", "components", "Component names must be unique."));
  }

  for (const page of architecture.pages) {
    if (!page.rootComponent || !knownNames.has(page.rootComponent)) {
      issues.push(issue("error", "unknown-page-root", page.name, "Each page rootComponent must be declared in pages or components."));
    }
  }

  for (const name of layoutComponentNames(architecture.layoutTree)) {
    if (!knownNames.has(name) && !isDeclaredNumberedInstance(name, knownNames)) {
      issues.push(issue("error", "unknown-layout-component", name, "Every component referenced by layoutTree must be declared in components or pages."));
    }
  }

  return { valid: !issues.some((item) => item.severity === "error"), issues };
}

function isDeclaredNumberedInstance(name: string, knownNames: Set<string>): boolean {
  const baseName = name.replace(/\d+$/, "");
  return baseName !== name && knownNames.has(baseName);
}

function layoutComponentNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const own = typeof record.component === "string" ? [record.component] : [];
  const children = Array.isArray(record.children) ? record.children.flatMap(layoutComponentNames) : [];
  return [...own, ...children];
}

function issue(severity: UiArchitectureIssue["severity"], code: string, target: string, message: string): UiArchitectureIssue {
  return { severity, code, target, message };
}
