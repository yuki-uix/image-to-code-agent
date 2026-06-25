import type { UiArchitecture, UiMemory } from "../domain/contracts.ts";

export type ReactPageIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type ReactPageReport = {
  valid: boolean;
  issues: ReactPageIssue[];
};

export function validateReactPage(source: string, architecture: UiArchitecture, memory: UiMemory): ReactPageReport {
  const issues: ReactPageIssue[] = [];
  const allowedImport = /^\s*import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]react['"];?\s*$/;

  for (const line of source.split("\n").filter((item) => /^\s*import\b/.test(item))) {
    if (!allowedImport.test(line)) {
      issues.push(issue("error", "disallowed-import", line.trim(), "Generated page must be self-contained and may only import React."));
    }
  }

  const exported = defaultExportName(source);
  const rootComponents = new Set(architecture.pages.map((page) => page.rootComponent));
  if (!exported || !rootComponents.has(exported)) {
    issues.push(issue("error", "page-root-export-mismatch", exported ?? "missing-default-export", `Generated page must export the architecture rootComponent as default: ${[...rootComponents].join(", ")}.`));
  } else if ((componentProps(source).get(exported) ?? []).length > 0) {
    issues.push(issue("error", "page-root-requires-props", exported, "Default exported page root must not require external props."));
  }

  if (/\bconsole\./.test(source)) {
    issues.push(issue("error", "invented-console-behavior", "console", "Generated static UI must not add console logging or invented event behavior."));
  }

  const usedComponents = jsxComponentNames(source);
  for (const componentName of requiredRenderedComponentNames(architecture, memory)) {
    if (!usedComponents.has(componentName)) {
      issues.push(issue("error", "missing-component-render", componentName, `Generated JSX never renders ${componentName}, even though it appears in the approved architecture or registry.`));
    }
  }
  for (const item of missingRequiredProps(source)) {
    issues.push(issue("error", "missing-required-prop", item.component, `Generated JSX renders ${item.component} without required prop ${item.prop}.`));
  }

  for (const name of suspiciousTemplateIdentifiers(source)) {
    issues.push(issue("error", "suspicious-template-identifier", name, `Template interpolation uses ${name}, which is often an undefined variable in generated static content. Use data-array fields such as item.title instead.`));
  }

  return { valid: !issues.some((item) => item.severity === "error"), issues };
}

function requiredRenderedComponentNames(architecture: UiArchitecture, memory: UiMemory): Set<string> {
  return new Set([
    ...layoutComponentNames(architecture.layoutTree),
    ...architecture.components.flatMap((component) => component.children),
    ...Object.keys(memory.componentRegistry.components)
  ].filter((name) => !architecture.pages.some((page) => page.rootComponent === name)));
}

function layoutComponentNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const own = typeof record.component === "string" ? [record.component] : [];
  const children = Array.isArray(record.children) ? record.children.flatMap(layoutComponentNames) : [];
  return [...own, ...children];
}

function jsxComponentNames(source: string): Set<string> {
  return new Set([...source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1]));
}

function missingRequiredProps(source: string): Array<{ component: string; prop: string }> {
  const propsByComponent = componentProps(source);
  const missing: Array<{ component: string; prop: string }> = [];
  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9]*)\b([^>]*)\/?>/g)) {
    const component = match[1];
    const requiredProps = propsByComponent.get(component) ?? [];
    const attributes = match[2];
    for (const prop of requiredProps) {
      if (!new RegExp(`\\b${escapeRegExp(prop)}\\s*=`).test(attributes)) missing.push({ component, prop });
    }
  }
  return missing;
}

function componentProps(source: string): Map<string, string[]> {
  const props = new Map<string, string[]>();
  for (const match of source.matchAll(/interface\s+([A-Z][A-Za-z0-9]*)Props\s*\{([\s\S]*?)\}/g)) {
    const component = match[1].replace(/Props$/, "");
    const names = [...match[2].matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)].map((item) => item[1]);
    props.set(component, names);
  }
  return props;
}

function defaultExportName(source: string): string | undefined {
  return source.match(/export\s+default\s+([A-Z][A-Za-z0-9]*)\s*;?/)?.[1];
}

function suspiciousTemplateIdentifiers(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
    const name = match[1];
    if (!["i", "index"].includes(name)) names.add(name);
  }
  return names;
}

function issue(severity: ReactPageIssue["severity"], code: string, target: string, message: string): ReactPageIssue {
  return { severity, code, target, message };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
