import type { UiArchitecture } from "../domain/contracts.ts";
import type { ReactPageReport } from "./react-page-validator.ts";

export function repairReactPage(source: string, report: ReactPageReport, architecture?: UiArchitecture): string {
  let repaired = source;
  const rootName = architecture?.pages[0]?.rootComponent;
  const exported = defaultExportName(repaired);
  if (rootName && exported && exported !== rootName && report.issues.some((issue) => issue.code === "page-root-export-mismatch")) {
    repaired = repaired.replace(componentDeclarationPattern(exported), (match) => match.replace(exported, rootName));
    repaired = repaired.replace(new RegExp(`export\\s+default\\s+${escapeRegExp(exported)}\\s*;?`), `export default ${rootName};`);
  }
  if (rootName) repaired = removeRootProps(repaired, rootName);
  repaired = repaired.replace(/\s+onClick=\{\(\)\s*=>\s*console\.[^}]+\}/g, "");

  const missing = report.issues
    .filter((issue) => issue.code === "missing-component-render")
    .map((issue) => issue.target)
    .filter((name, index, values) => isDefinedComponent(repaired, name) && values.indexOf(name) === index);

  if (missing.length === 0) return fillMissingProps(repaired);

  const defaultComponent = defaultExportName(repaired);
  if (!defaultComponent) return fillMissingProps(repaired);

  const declaration = componentDeclarationPattern(defaultComponent).exec(repaired);
  if (!declaration?.index) return fillMissingProps(repaired);

  const insertion = missing.map((name) => `    <${name} />`).join("\n");
  const functionBodyStart = declaration.index;
  const afterDeclaration = repaired.slice(functionBodyStart);
  const closeIndex = afterDeclaration.indexOf("</div>");
  if (closeIndex === -1) return fillMissingProps(repaired);

  const absoluteCloseIndex = functionBodyStart + closeIndex;
  return fillMissingProps(`${repaired.slice(0, absoluteCloseIndex)}${insertion}\n  ${repaired.slice(absoluteCloseIndex)}`);
}

function isDefinedComponent(source: string, name: string): boolean {
  return componentDeclarationPattern(name).test(source);
}

function componentDeclarationPattern(name: string): RegExp {
  return new RegExp(`(?:const|function)\\s+${escapeRegExp(name)}\\b`);
}

function defaultExportName(source: string): string | undefined {
  return source.match(/export\s+default\s+([A-Z][A-Za-z0-9]*)\s*;?/)?.[1];
}

function fillMissingProps(source: string): string {
  const propsByComponent = componentProps(source);
  return source.replace(/<([A-Z][A-Za-z0-9]*)\b([^>]*)\/>/g, (match, component: string, attributes: string) => {
    const props = propsByComponent.get(component) ?? [];
    const missingProps = props.filter((prop) => !new RegExp(`\\b${escapeRegExp(prop)}\\s*=`).test(attributes));
    if (missingProps.length === 0) return match;
    const additions = missingProps.map((prop) => `${prop}="${defaultPropValue(component, prop)}"`).join(" ");
    return `<${component}${attributes} ${additions} />`;
  });
}

function removeRootProps(source: string, rootName: string): string {
  const propsName = `${rootName}Props`;
  const propsBody = source.match(new RegExp(`interface\\s+${escapeRegExp(propsName)}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
  const propNames = [...propsBody.matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)].map((item) => item[1]);
  let repaired = source.replace(new RegExp(`\\n?interface\\s+${escapeRegExp(propsName)}\\s*\\{[\\s\\S]*?\\}\\n?`), "\n");
  repaired = repaired.replace(new RegExp(`const\\s+${escapeRegExp(rootName)}\\s*=\\s*\\(\\s*\\{[^}]*\\}\\s*:\\s*${escapeRegExp(propsName)}\\s*\\)\\s*=>`), `const ${rootName} = () =>`);
  repaired = repaired.replace(new RegExp(`function\\s+${escapeRegExp(rootName)}\\s*\\(\\s*\\{[^}]*\\}\\s*:\\s*${escapeRegExp(propsName)}\\s*\\)`), `function ${rootName}()`);
  for (const propName of propNames) {
    repaired = repaired.replace(new RegExp(`\\{${escapeRegExp(propName)}\\}`, "g"), `"${defaultPropValue(rootName, propName)}"`);
  }
  return repaired;
}

function componentProps(source: string): Map<string, string[]> {
  const props = new Map<string, string[]>();
  for (const match of source.matchAll(/interface\s+([A-Z][A-Za-z0-9]*)Props\s*\{([\s\S]*?)\}/g)) {
    const component = match[1].replace(/Props$/, "");
    const names = [...match[2].matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)].map((item) => item[1]);
    props.set(component, names);
  }
  return props;
}

function defaultPropValue(component: string, prop: string): string {
  if (prop === "label") return humanize(component.replace(/Button$/, "")) || "Learn more";
  if (prop === "title") return humanize(component);
  if (prop === "description") return `${humanize(component)} details`;
  return humanize(prop);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
