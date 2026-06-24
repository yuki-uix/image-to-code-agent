import type { Rect, VisualAnalysis } from "../domain/contracts.ts";
import { normalizeVisualAnalysis } from "./visual-analysis-normalizer.ts";

export type GeometryIssue = {
  severity: "error" | "warning";
  code: string;
  targetId: string;
  message: string;
};

export type GeometryReport = {
  valid: boolean;
  issues: GeometryIssue[];
  stats: { regions: number; elements: number; relations: number };
};

export type GeometryValidationOptions = {
  minimumElements?: number;
};

export function validateGeometry(analysis: VisualAnalysis, options: GeometryValidationOptions = {}): GeometryReport {
  const normalized = normalizeVisualAnalysis(analysis);
  const issues: GeometryIssue[] = [];
  const ids = new Set<string>();
  const regionIds = new Set(normalized.regions.map((region) => region.id));
  const hierarchyChildren = normalized.hierarchy.children ?? {};
  const rootChildren = new Set(hierarchyChildren[normalized.hierarchy.root] ?? []);

  if (normalized.source.width <= 0 || normalized.source.height <= 0) {
    issues.push(issue("error", "invalid-source-size", "source", "Source width and height must be positive."));
  }
  if (normalized.regions.length === 0) {
    issues.push(issue("error", "missing-regions", "regions", "Visual Analyst must return at least one region."));
  }
  if (normalized.elements.length === 0) {
    issues.push(issue("warning", "missing-elements", "elements", "No UI elements were returned."));
  }
  const minimumElements = options.minimumElements ?? (normalized.source.height >= 900 ? 5 : 0);
  if (normalized.elements.length > 0 && normalized.elements.length < minimumElements) {
    issues.push(issue("warning", "coarse-element-coverage", "elements", `This analysis returned ${normalized.elements.length} elements, below the expected minimum of ${minimumElements}.`));
  }

  for (const region of normalized.regions) {
    checkUnique(region.id, ids, issues);
    if (!region.id) issues.push(issue("error", "missing-id", "region", "Every region must have an id."));
    checkRect(region.id || "region", region.bbox, normalized.source, issues);
    if (!rootChildren.has(region.id)) {
      issues.push(issue("warning", "region-not-linked-from-root", region.id, "Every top-level region should be listed under hierarchy.children[root]."));
    }
    if (region.role === "page" && normalized.regions.length === 1 && !matchesSourceRect(region.bbox, normalized.source)) {
      issues.push(issue("warning", "page-region-not-full-canvas", region.id, "A single page-level region should usually cover the full source image."));
    }
  }

  for (const element of normalized.elements) {
    checkUnique(element.id, ids, issues);
    if (!element.id) issues.push(issue("error", "missing-id", element.kind, "Every element must have an id."));
    if (!regionIds.has(element.regionId)) {
      issues.push(issue("error", "missing-region", element.id, `Unknown region: ${element.regionId}`));
    }
    if (element.bbox) checkRect(element.id || element.kind, element.bbox, normalized.source, issues);
    if (!new Set(hierarchyChildren[element.regionId] ?? []).has(element.id)) {
      issues.push(issue("warning", "element-not-linked-from-region", element.id, `Region ${element.regionId} should include this element in hierarchy.children.`));
    }
    if (["maincontent", "content", "pagebody", "bodycontent"].includes(element.id.toLowerCase()) || ["maincontent", "content", "pagebody", "bodycontent"].includes(element.kind.toLowerCase())) {
      issues.push(issue("warning", "generic-catchall-element", element.id || element.kind, "Avoid collapsing multiple visible sections into one generic catch-all element."));
    }
  }

  if (!normalized.hierarchy.root) {
    issues.push(issue("error", "missing-hierarchy-root", "hierarchy", "Hierarchy root is required."));
  }

  const knownIds = new Set([...ids, normalized.hierarchy.root]);
  for (const relation of normalized.layoutRelations) {
    if (!knownIds.has(relation.source)) issues.push(issue("warning", "missing-relation-source", relation.source, "Relation source does not exist."));
    if (!knownIds.has(relation.target)) issues.push(issue("warning", "missing-relation-target", relation.target, "Relation target does not exist."));
    if (relation.distance !== undefined && relation.distance < 0) issues.push(issue("error", "negative-distance", relation.source, "Relation distance cannot be negative."));
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    stats: { regions: normalized.regions.length, elements: normalized.elements.length, relations: normalized.layoutRelations.length }
  };
}

function checkUnique(id: string, ids: Set<string>, issues: GeometryIssue[]) {
  if (ids.has(id)) issues.push(issue("error", "duplicate-id", id, "Ids must be unique across regions and elements."));
  ids.add(id);
}

function checkRect(id: string, rect: Rect, source: { width: number; height: number }, issues: GeometryIssue[]) {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
    issues.push(issue("error", "non-finite-bbox", id, "Bounding-box values must be finite numbers."));
    return;
  }
  if (rect.width <= 0 || rect.height <= 0) issues.push(issue("error", "invalid-bbox-size", id, "Bounding-box width and height must be positive."));
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > source.width || rect.y + rect.height > source.height) {
    issues.push(issue("error", "bbox-out-of-bounds", id, "Bounding box must remain inside the source image."));
  }
}

function matchesSourceRect(rect: Rect, source: { width: number; height: number }): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === source.width && rect.height === source.height;
}

function issue(severity: GeometryIssue["severity"], code: string, targetId: string, message: string): GeometryIssue {
  return { severity, code, targetId, message };
}
