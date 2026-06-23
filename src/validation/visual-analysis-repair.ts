import type { Rect, VisualAnalysis } from "../domain/contracts.ts";

export function repairVisualAnalysis(analysis: VisualAnalysis): VisualAnalysis {
  const source = analysis.source;
  const regions = analysis.regions.map((region) => {
    if (analysis.regions.length === 1 && region.role === "page") {
      return { ...region, bbox: { x: 0, y: 0, width: source.width, height: source.height } };
    }
    return { ...region, bbox: clampRect(region.bbox, source) };
  });

  const regionIds = regions.map((region) => region.id).filter(Boolean);
  const children: Record<string, string[]> = Object.fromEntries(
    Object.entries(analysis.hierarchy.children).map(([key, value]) => [key, uniqueStrings(value)])
  );
  const root = analysis.hierarchy.root || "root";
  children[root] = uniqueStrings([...(children[root] ?? []), ...regionIds]);

  for (const regionId of regionIds) {
    const elementIds = analysis.elements.filter((element) => element.regionId === regionId && element.id).map((element) => element.id);
    children[regionId] = uniqueStrings([...(children[regionId] ?? []), ...elementIds]);
  }

  const elements = analysis.elements.map((element) => element.bbox ? { ...element, bbox: clampRect(element.bbox, source) } : element);

  return {
    ...analysis,
    regions,
    hierarchy: { root, children },
    elements
  };
}

function clampRect(rect: Rect, source: { width: number; height: number }): Rect {
  const x = clamp(rect.x, 0, Math.max(0, source.width - 1));
  const y = clamp(rect.y, 0, Math.max(0, source.height - 1));
  const maxWidth = Math.max(1, source.width - x);
  const maxHeight = Math.max(1, source.height - y);
  return {
    x,
    y,
    width: clamp(rect.width, 1, maxWidth),
    height: clamp(rect.height, 1, maxHeight)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
