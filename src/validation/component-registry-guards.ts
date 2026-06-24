export function looksLikeComponentRegistrySchemaEcho(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.$schema === "string"
    && typeof record.title === "string"
    && typeof record.type === "string"
    && "properties" in record
    && !("components" in record);
}
