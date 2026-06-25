import type { ComponentDefinition, ComponentRegistry } from "../domain/contracts.ts";

export function normalizeComponentRegistry(input: unknown): ComponentRegistry {
  const record = asRecord(input);
  const componentsRecord = asRecord(record.components);
  const components = Object.fromEntries(
    Object.entries(componentsRecord)
      .map(([name, value]) => [name, normalizeDefinition(name, value)])
      .filter((entry): entry is [string, ComponentDefinition] => Boolean(entry[1]))
  );
  return { components };
}

function normalizeDefinition(fallbackName: string, value: unknown): ComponentDefinition | undefined {
  const record = asRecord(value);
  const name = asString(record.name) ?? fallbackName;
  if (!name) return undefined;
  const sourceElementIds = uniqueStrings(asArray(record.sourceElementIds).map(asString).filter(Boolean) as string[]);
  return {
    name,
    sourceElementIds,
    instances: asPositiveInteger(record.instances) ?? Math.max(sourceElementIds.length, 1),
    variants: uniqueStrings(asArray(record.variants).map(asString).filter(Boolean) as string[]),
    props: inferProps(
      uniqueStrings(asArray(record.props).map(asString).filter(Boolean) as string[]),
      asPositiveInteger(record.instances) ?? Math.max((asArray(record.sourceElementIds)).length, 1),
      asString(record.evidence) ?? ""
    ),
    evidence: asString(record.evidence) ?? "No evidence provided."
  };
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

function asPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

// When the model leaves props empty on a repeated component, derive them
// from the evidence text. This keeps props populated without relying on
// the 7B model to satisfy multiple constraints simultaneously.
const EVIDENCE_PROP_PATTERNS: Array<[RegExp, string]> = [
  [/\b(heading|title|name|label)\b/i, "title"],
  [/\b(copy|description|caption|text|subtitle)\b/i, "description"],
  [/\b(image|photo|thumbnail|picture|img)\b/i, "imageSrc"],
  [/\b(price|cost|amount)\b/i, "price"],
  [/\b(href|url|link)\b/i, "href"],
  [/\b(icon)\b/i, "icon"],
  [/\b(logo|logos|brand|brands)\b/i, "logos"],
  [/\b(badge|tag|chip)\b/i, "badge"],
];

function inferProps(modelProps: string[], instances: number, evidence: string): string[] {
  if (modelProps.length > 0 || instances < 2 || !evidence) return modelProps;
  const inferred = EVIDENCE_PROP_PATTERNS
    .filter(([pattern]) => pattern.test(evidence))
    .map(([, prop]) => prop);
  return uniqueStrings(inferred);
}
