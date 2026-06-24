import type { LayoutRelation, Rect, UiElement, VisualAnalysis, VisualTokens } from "../domain/contracts.ts";

type SourceSize = { width: number; height: number };

export function normalizeVisualAnalysis(input: unknown, fallbackSource?: SourceSize): VisualAnalysis {
  const record = asRecord(input);
  const source = normalizeSource(record.source, fallbackSource);
  const regions = asArray(record.regions).map(normalizeRegion).filter(Boolean);
  const layout = normalizeLayout(record.layout);
  const hierarchy = normalizeHierarchy(record.hierarchy, regions[0]?.id);
  const elements = asArray(record.elements).map(normalizeElement).filter(Boolean);
  const layoutRelations = asArray(record.layoutRelations).map(normalizeRelation).filter(Boolean);
  const visualTokens = normalizeVisualTokens(record.visualTokens);
  const uncertainObservations = asArray(record.uncertainObservations).map(normalizeObservation).filter(Boolean);

  return {
    source,
    regions,
    layout,
    hierarchy,
    elements,
    layoutRelations,
    ...(visualTokens ? { visualTokens } : {}),
    uncertainObservations
  };
}

function normalizeSource(value: unknown, fallbackSource?: SourceSize): SourceSize {
  const record = asRecord(value);
  return {
    width: asNumber(record.width) ?? fallbackSource?.width ?? 0,
    height: asNumber(record.height) ?? fallbackSource?.height ?? 0
  };
}

function normalizeRegion(value: unknown): VisualAnalysis["regions"][number] | undefined {
  const record = asRecord(value);
  const bbox = normalizeRect(record.bbox);
  if (!bbox) return undefined;
  return {
    id: asString(record.id) ?? "",
    role: asString(record.role) ?? "unknown",
    bbox
  };
}

function normalizeLayout(value: unknown): VisualAnalysis["layout"] {
  const record = asRecord(value);
  const direction = asEnum(record.direction, ["row", "column", "mixed"]) ?? "mixed";
  const horizontalAlignment = asEnum(record.horizontalAlignment, ["start", "center", "end", "stretch", "mixed"]);
  const padding = normalizePadding(record.padding);
  const notes = asArray(record.notes).map((item) => asString(item)).filter(Boolean) as string[];

  return {
    direction,
    ...(horizontalAlignment ? { horizontalAlignment } : {}),
    ...(asNumber(record.gap) !== undefined ? { gap: asNumber(record.gap) as number } : {}),
    ...(padding ? { padding } : {}),
    ...(notes.length > 0 ? { notes } : {})
  };
}

function normalizeHierarchy(value: unknown, fallbackRoot?: string): VisualAnalysis["hierarchy"] {
  const record = asRecord(value);
  const root = asString(record.root) ?? fallbackRoot ?? "root";
  const childrenRecord = asRecord(record.children);
  const children: Record<string, string[]> = {};

  for (const [key, childIds] of Object.entries(childrenRecord)) {
    children[key] = asArray(childIds).map((item) => asString(item)).filter(Boolean) as string[];
  }

  return { root, children };
}

function normalizeElement(value: unknown): UiElement | undefined {
  const record = asRecord(value);
  const kind = asString(record.kind);
  if (!kind) return undefined;

  return {
    id: asString(record.id) ?? "",
    kind,
    ...(asString(record.text) ? { text: asString(record.text) as string } : {}),
    regionId: asString(record.regionId) ?? "",
    ...(normalizeRect(record.bbox) ? { bbox: normalizeRect(record.bbox) as Rect } : {}),
    ...(asString(record.visualRole) ? { visualRole: asString(record.visualRole) as string } : {}),
    geometrySource: asEnum(record.geometrySource, ["vlm", "ocr", "detector"]) ?? "vlm",
    certainty: asEnum(record.certainty, ["high", "medium", "low"]) ?? "low",
    ...(asRecord(record.visual) ? { visual: asRecord(record.visual) } : {})
  };
}

function normalizeRelation(value: unknown): LayoutRelation | undefined {
  const record = asRecord(value);
  return {
    type: asEnum(record.type, ["above", "below", "left-of", "right-of", "aligned-left", "aligned-center", "same-width", "contains"]) ?? "contains",
    source: asString(record.source) ?? "",
    target: asString(record.target) ?? "",
    ...(asNumber(record.distance) !== undefined ? { distance: asNumber(record.distance) as number } : {})
  };
}

function normalizeObservation(value: unknown): VisualAnalysis["uncertainObservations"][number] | undefined {
  const record = asRecord(value);
  const description = asString(record.description);
  if (!description) return undefined;
  return {
    description,
    relatedIds: asArray(record.relatedIds).map((item) => asString(item)).filter(Boolean) as string[]
  };
}

function normalizeVisualTokens(value: unknown): Partial<VisualTokens> | undefined {
  const record = asRecord(value);
  const tokens = {
    colors: normalizeStringRecord(record.colors),
    typography: normalizeStringRecord(record.typography),
    spacing: normalizeStringRecord(record.spacing),
    radius: normalizeStringRecord(record.radius)
  };

  return Object.values(tokens).some((entry) => Object.keys(entry).length > 0) ? tokens : undefined;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function normalizePadding(value: unknown): VisualAnalysis["layout"]["padding"] | undefined {
  const record = asRecord(value);
  const top = asNumber(record.top);
  const right = asNumber(record.right);
  const bottom = asNumber(record.bottom);
  const left = asNumber(record.left);
  if ([top, right, bottom, left].some((item) => item === undefined)) return undefined;
  return { top: top as number, right: right as number, bottom: bottom as number, left: left as number };
}

function normalizeRect(value: unknown): Rect | undefined {
  if (Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    const [left, top, right, bottom] = value as number[];
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  const record = asRecord(value);
  const x = asNumber(record.x);
  const y = asNumber(record.y);
  const width = asNumber(record.width);
  const height = asNumber(record.height);
  if ([x, y, width, height].some((item) => item === undefined)) return undefined;
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asEnum<const T extends readonly string[]>(value: unknown, options: T): T[number] | undefined {
  return typeof value === "string" && options.includes(value) ? value as T[number] : undefined;
}
