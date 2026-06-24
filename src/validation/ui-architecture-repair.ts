import type { UiArchitecture, UiMemory } from "../domain/contracts.ts";

export function repairUiArchitecture(architecture: UiArchitecture, memory: UiMemory): UiArchitecture {
  const sourceToComponent = new Map<string, string>();
  for (const component of Object.values(memory.componentRegistry.components)) {
    for (const sourceId of component.sourceElementIds) sourceToComponent.set(sourceId, component.name);
  }

  const declared = new Map(architecture.components.map((component) => [component.name, component]));
  const regionToComponent = new Map(memory.layoutModel.regions.map((region) => [region.id, pascalCase(region.id)]));

  const resolveName = (name: string): string => {
    const direct = sourceToComponent.get(name);
    if (direct) return direct;
    const numbered = name.replace(/\d+$/, "");
    if (numbered !== name && sourceToComponent.has(name)) return sourceToComponent.get(name) as string;
    const region = regionToComponent.get(name);
    return region ?? name;
  };

  const ensureComponent = (name: string) => {
    if (architecture.pages.some((page) => page.rootComponent === name) || declared.has(name)) return;
    declared.set(name, { name, file: `src/components/${name}.tsx`, children: [] });
  };

  const repairTree = (value: unknown): unknown => {
    if (typeof value === "string") {
      const name = resolveName(value);
      ensureComponent(name);
      return name;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const component = typeof record.component === "string" ? resolveName(record.component) : record.component;
    if (typeof component === "string") ensureComponent(component);
    return {
      ...record,
      ...(component ? { component } : {}),
      ...(Array.isArray(record.children) ? { children: record.children.map(repairTree) } : {})
    };
  };

  return { ...architecture, components: [...declared.values()], layoutTree: repairTree(architecture.layoutTree) as UiArchitecture["layoutTree"] };
}

function pascalCase(value: string): string {
  return value.replace(/(^|[-_\s])(\w)/g, (_, __, character: string) => character.toUpperCase());
}
