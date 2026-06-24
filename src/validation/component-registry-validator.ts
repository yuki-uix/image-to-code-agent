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
    const topLevelSectionIds = pageLevelElementIds(visualAnalysis);
    const citedTopLevelSections = component.sourceElementIds.filter((id) => topLevelSectionIds.has(id));
    if (component.sourceElementIds.length > 1 && /sectionheading/i.test(component.name) && (citedKinds.length > 1 || citedTopLevelSections.length > 1)) {
      issues.push(issue("error", "over-merged-section-component", component.name, "This generic section-heading component merges distinct top-level sections. Keep page sections separate unless structure and page role clearly match."));
    }

    const repeatedStem = sharedNumberedStem(component.sourceElementIds);
    if (repeatedStem && component.instances === 1 && !hasRepeatedItemComponent(normalized, component.sourceElementIds)) {
      issues.push(issue("error", "repeated-items-not-modeled-as-instances", component.name, `The repeated ${repeatedStem} elements need an item component with instances matching the cited item count.`));
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

function sharedNumberedStem(ids: string[]): string | undefined {
  if (ids.length < 3) return undefined;
  const stems = ids.map((id) => id.match(/^(.+?)(?:-|_)?\d+$/)?.[1]);
  if (stems.some((stem) => !stem)) return undefined;
  return uniqueStrings(stems as string[]).length === 1 ? stems[0] : undefined;
}

function hasRepeatedItemComponent(registry: ComponentRegistry, ids: string[]): boolean {
  return Object.values(registry.components).some((component) => component.instances === ids.length && ids.every((id) => component.sourceElementIds.includes(id)));
}

function pageLevelElementIds(visualAnalysis: VisualAnalysis): Set<string> {
  const pageIds = visualAnalysis.regions.filter((region) => region.role === "page").map((region) => region.id);
  const directChildren = pageIds.flatMap((pageId) => visualAnalysis.hierarchy.children[pageId] ?? []);
  return new Set(directChildren.filter((id) => visualAnalysis.elements.some((element) => element.id === id)));
}
