import type { Rect, VisualAnalysis } from "../domain/contracts.ts";

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

export function validateGeometry(analysis: VisualAnalysis): GeometryReport {
  const issues: GeometryIssue[] = [];
  const ids = new Set<string>();
  const regionIds = new Set(analysis.regions.map((region) => region.id));

  if (analysis.source.width <= 0 || analysis.source.height <= 0) {
    issues.push(issue("error", "invalid-source-size", "source", "Source width and height must be positive."));
  }

  for (const region of analysis.regions) {
    checkUnique(region.id, ids, issues);
    checkRect(region.id, region.bbox, analysis.source, issues);
  }

  for (const element of analysis.elements) {
    checkUnique(element.id, ids, issues);
    if (!regionIds.has(element.regionId)) {
      issues.push(issue("error", "missing-region", element.id, `Unknown region: ${element.regionId}`));
    }
    if (element.bbox) checkRect(element.id, element.bbox, analysis.source, issues);
  }

  const knownIds = new Set([...ids, analysis.hierarchy.root]);
  for (const relation of analysis.layoutRelations) {
    if (!knownIds.has(relation.source)) issues.push(issue("warning", "missing-relation-source", relation.source, "Relation source does not exist."));
    if (!knownIds.has(relation.target)) issues.push(issue("warning", "missing-relation-target", relation.target, "Relation target does not exist."));
    if (relation.distance !== undefined && relation.distance < 0) issues.push(issue("error", "negative-distance", relation.source, "Relation distance cannot be negative."));
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    stats: { regions: analysis.regions.length, elements: analysis.elements.length, relations: analysis.layoutRelations.length }
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

function issue(severity: GeometryIssue["severity"], code: string, targetId: string, message: string): GeometryIssue {
  return { severity, code, targetId, message };
}
