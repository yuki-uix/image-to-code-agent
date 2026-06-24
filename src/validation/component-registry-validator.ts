import type { ComponentRegistry, VisualAnalysis } from "../domain/contracts.ts";
import { normalizeComponentRegistry } from "./component-registry-normalizer.ts";

export type ComponentRegistryIssue = {
  severity: "error" | "warning";
  code: string;
  targetId: string;
  message: string;
};

export type ComponentRegistryReport = {
  valid: boolean;
  issues: ComponentRegistryIssue[];
  stats: { components: number; citedElements: number };
};

export function validateComponentRegistry(registry: ComponentRegistry, visualAnalysis: VisualAnalysis): ComponentRegistryReport {
  const normalized = normalizeComponentRegistry(registry);
  const elementsById = new Map(visualAnalysis.elements.map((element) => [element.id, element]));
  const elementIds = new Set(elementsById.keys());
  const issues: ComponentRegistryIssue[] = [];
  let citedElements = 0;

  if (Object.keys(normalized.components).length === 0 && visualAnalysis.elements.length > 0) {
    issues.push(issue("error", "missing-components", "components", "Component Architect must return at least one component when elements exist."));
  }

  for (const [key, component] of Object.entries(normalized.components)) {
    if (component.name !== key) {
      issues.push(issue("warning", "name-key-mismatch", key, "Component key should match component.name."));
    }
    if (component.instances < 1) {
      issues.push(issue("error", "invalid-instance-count", component.name, "Component instances must be at least 1."));
    }
    if (component.sourceElementIds.length === 0) {
      issues.push(issue("error", "missing-source-elements", component.name, "Each component must cite at least one source element id."));
    }

    for (const elementId of component.sourceElementIds) {
      citedElements += 1;
      if (!elementIds.has(elementId)) {
        issues.push(issue("error", "unknown-source-element", component.name, `Unknown source element id: ${elementId}`));
      }
    }

    const citedKinds = uniqueStrings(component.sourceElementIds.map((id) => elementsById.get(id)?.kind).filter(Boolean) as string[]);
    if (component.sourceElementIds.length > 1 && citedKinds.length > 1 && /sectionheading/i.test(component.name)) {
      issues.push(issue("warning", "over-merged-section-component", component.name, "This generic section-heading component merges different section roles. Keep top-level sections separate unless structure and page role clearly match."));
    }
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    stats: { components: Object.keys(normalized.components).length, citedElements }
  };
}

function issue(severity: ComponentRegistryIssue["severity"], code: string, targetId: string, message: string): ComponentRegistryIssue {
  return { severity, code, targetId, message };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
