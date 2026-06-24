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
    props: uniqueStrings(asArray(record.props).map(asString).filter(Boolean) as string[]),
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
