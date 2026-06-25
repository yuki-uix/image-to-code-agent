import type { ComponentRegistry, VisualAnalysis } from "../domain/contracts.ts";

export function repairComponentRegistryCoverage(registry: ComponentRegistry, visualAnalysis: VisualAnalysis): ComponentRegistry {
  const cited = new Set(Object.values(registry.components).flatMap((component) => component.sourceElementIds));
  const existingNames = new Set(Object.keys(registry.components));
  const additions = Object.fromEntries(
    visualAnalysis.elements
      .filter((element) => element.id && !cited.has(element.id))
      .map((element) => {
        const name = uniqueComponentName(pascalCase(element.id), existingNames);
        existingNames.add(name);
        return [name, {
          name,
          sourceElementIds: [element.id],
          instances: 1,
          variants: [],
          props: interactiveProps(name),
          evidence: `Visible ${element.kind} element ${element.id} was not cited by the model and is preserved as a one-off component.`
        }];
      })
  );

  return Object.keys(additions).length === 0
    ? registry
    : { components: { ...registry.components, ...additions } };
}

function pascalCase(value: string): string {
  const normalized = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\s+/g, "");
  return normalized || "VisibleElement";
}

function uniqueComponentName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName;
  let index = 2;
  while (existingNames.has(`${baseName}${index}`)) index += 1;
  return `${baseName}${index}`;
}

function interactiveProps(name: string): string[] {
  return /button|link|input|cta/i.test(name) ? ["label"] : [];
}
