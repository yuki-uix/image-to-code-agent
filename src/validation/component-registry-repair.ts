import type { ComponentRegistry, UiElement, VisualAnalysis } from "../domain/contracts.ts";

export function repairComponentRegistryCoverage(registry: ComponentRegistry, visualAnalysis: VisualAnalysis): ComponentRegistry {
  const cited = new Set(Object.values(registry.components).flatMap((component) => component.sourceElementIds));
  const existingNames = new Set(Object.keys(registry.components));
  const uncited = visualAnalysis.elements.filter((element) => element.id && !cited.has(element.id));

  // Group uncited elements by their numbered stem (e.g. service1/service2 → "service").
  // Stems with 2+ members become a single component; singletons stay one-off.
  const stemGroups = new Map<string, typeof uncited>();
  const singletons: typeof uncited = [];
  for (const element of uncited) {
    const stem = numberedStem(element.id);
    if (stem) {
      const group = stemGroups.get(stem) ?? [];
      group.push(element);
      stemGroups.set(stem, group);
    } else {
      singletons.push(element);
    }
  }
  for (const [stem, group] of stemGroups) {
    if (group.length >= 2) {
      // Keep as group
    } else {
      singletons.push(...group);
      stemGroups.delete(stem);
    }
  }

  const additions: Record<string, ReturnType<typeof makeOneOff>> = {};

  for (const [stem, group] of stemGroups) {
    const ids = group.map((element) => element.id);
    const kind = group[0]?.kind ?? "element";
    const name = uniqueComponentName(pascalCase(stem), existingNames);
    existingNames.add(name);
    const texts = group.map((element) => (element as UiElement).text).filter(Boolean) as string[];
    const textHint = texts.length > 0
      ? ` Each item has a visible title and description: ${texts.slice(0, 2).join("; ")}.`
      : kindContentHint(kind);
    additions[name] = {
      name,
      sourceElementIds: ids,
      instances: ids.length,
      variants: [],
      props: interactiveProps(name),
      evidence: `Visible repeated ${kind} elements ${ids.join(", ")} were not cited by the model and are preserved as a grouped component.${textHint}`
    };
  }

  for (const element of singletons) {
    const name = uniqueComponentName(pascalCase(element.id), existingNames);
    existingNames.add(name);
    additions[name] = makeOneOff(name, element);
  }

  return Object.keys(additions).length === 0
    ? registry
    : { components: { ...registry.components, ...additions } };
}

function makeOneOff(name: string, element: UiElement): {
  name: string; sourceElementIds: string[]; instances: number; variants: string[]; props: string[]; evidence: string;
} {
  const textHint = element.text ? ` Visible text: "${element.text}".` : "";
  return {
    name,
    sourceElementIds: [element.id],
    instances: 1,
    variants: [],
    props: interactiveProps(name),
    evidence: `Visible ${element.kind ?? "element"} element ${element.id} was not cited by the model and is preserved as a one-off component.${textHint}`
  };
}

function numberedStem(id: string): string | undefined {
  return id.match(/^(.+?)(?:-|_)?\d+$/)?.[1];
}

function kindContentHint(kind: string): string {
  const hints: Record<string, string> = {
    card: " Each card contains a visible title and description.",
    imageBlock: " Each item has a visible image and title.",
    button: " Each button has a visible label.",
    icon: " Each icon has a visible label.",
    service: " Each item has a visible title and description.",
  };
  return hints[kind] ?? "";
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
