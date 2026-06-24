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
  const citedElementIds = new Set<string>();

  if (Object.keys(normalized.components).length === 0 && visualAnalysis.elements.length > 0) {
    issues.push(issue("error", "missing-components", "components", "Component Architect must return at least one component when elements exist."));
  }

  // Repetition is a property of the visual analysis, not merely of whichever
  // elements the model happened to cite. This catches a section-level answer
  // that silently omits visible cards such as categoryCard1..3.
  for (const repeatedIds of repeatedItemGroups(visualAnalysis.elements.map((element) => element.id))) {
    if (!hasRepeatedItemComponent(normalized, repeatedIds)) {
      const stem = numberedStem(repeatedIds[0]) ?? "item";
      issues.push(issue("error", "repeated-items-not-modeled-as-instances", stem, `Visible repeated ${stem} elements require an item component with instances: ${repeatedIds.length} and all item IDs as evidence.`));
    }
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
      citedElementIds.add(elementId);
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

  }

  const minimumCitedElements = minimumCoverageCount(visualAnalysis.elements.length);
  if (citedElementIds.size < minimumCitedElements) {
    issues.push(issue("error", "insufficient-element-coverage", "components", `The registry cites ${citedElementIds.size} of ${visualAnalysis.elements.length} visible elements; cite at least ${minimumCitedElements} so one-off visible sections are not silently dropped.`));
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    stats: { components: Object.keys(normalized.components).length, citedElements: citedElementIds.size }
  };
}

function issue(severity: ComponentRegistryIssue["severity"], code: string, targetId: string, message: string): ComponentRegistryIssue {
  return { severity, code, targetId, message };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function repeatedItemGroups(ids: string[]): string[][] {
  const grouped = new Map<string, string[]>();
  for (const id of ids) {
    const stem = numberedStem(id);
    if (stem) grouped.set(stem, [...(grouped.get(stem) ?? []), id]);
  }
  return [...grouped.values()].filter((group) => group.length >= 3);
}

function numberedStem(id: string): string | undefined {
  return id.match(/^(.+?)(?:-|_)?\d+$/)?.[1];
}

function hasRepeatedItemComponent(registry: ComponentRegistry, ids: string[]): boolean {
  return Object.values(registry.components).some((component) => component.instances === ids.length && ids.every((id) => component.sourceElementIds.includes(id)));
}

function pageLevelElementIds(visualAnalysis: VisualAnalysis): Set<string> {
  const pageIds = visualAnalysis.regions.filter((region) => region.role === "page").map((region) => region.id);
  const directChildren = pageIds.flatMap((pageId) => visualAnalysis.hierarchy.children[pageId] ?? []);
  return new Set(directChildren.filter((id) => visualAnalysis.elements.some((element) => element.id === id)));
}

function minimumCoverageCount(elementCount: number): number {
  // Very small analyses can legitimately contain just a few high-level items.
  // Once a detail pass yields a richer page, retain enough evidence for all
  // major one-off sections as well as repeated cards.
  return elementCount >= 10 ? Math.ceil(elementCount * 0.75) : 0;
}
