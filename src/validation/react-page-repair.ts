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
  if (rootName) repaired = replaceSelfRecursiveRootWrapper(repaired, rootName);
  repaired = replaceSelfRecursiveComponentReferences(repaired, report, rootName);
  repaired = repaired.replace(/\s+onClick=\{\(\)\s*=>\s*console\.[^}]+\}/g, "");
  // "children" written as a string literal in JSX → proper {children} interpolation
  repaired = repaired.replace(/>\s*"children"\s*</g, ">{children}<");
  // {PascalCase} bare component references are always wrong in JSX (not <PascalCase/>) — remove them
  repaired = repaired.replace(/\{\s*([A-Z][A-Za-z0-9]+)\s*\}/g, (match, name) =>
    isDefinedComponent(repaired, name) ? "" : match
  );
  repaired = defineMissingComponents(repaired, report);

  const missing = report.issues
    .filter((issue) => issue.code === "missing-component-render")
    .map((issue) => issue.target)
    .filter((name, index, values) => values.indexOf(name) === index);

  if (missing.length === 0) return finalizeRepair(fillMissingProps(repaired), rootName, architecture);

  const defaultComponent = defaultExportName(repaired);
  if (!defaultComponent) return finalizeRepair(fillMissingProps(repaired), rootName, architecture);

  const declaration = componentDeclarationPattern(defaultComponent).exec(repaired);
  if (declaration?.index === undefined) return finalizeRepair(fillMissingProps(repaired), rootName, architecture);

  const insertion = missing.map((name) => `    <${name} />`).join("\n");
  const functionBodyStart = declaration.index;
  const afterDeclaration = repaired.slice(functionBodyStart);
  const closeIndex = firstRootCloseIndex(afterDeclaration);
  if (closeIndex === -1) return finalizeRepair(fillMissingProps(repaired), rootName, architecture);

  const absoluteCloseIndex = functionBodyStart + closeIndex;
  return finalizeRepair(fillMissingProps(`${repaired.slice(0, absoluteCloseIndex)}${insertion}\n  ${repaired.slice(absoluteCloseIndex)}`), rootName, architecture);
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

function defineMissingComponents(source: string, report: ReactPageReport): string {
  const missingNames = report.issues
    .filter((issue) => issue.code === "missing-component-render" || issue.code === "undefined-component")
    .map((issue) => issue.target)
    .filter((name, index, values) => !isDefinedComponent(source, name) && values.indexOf(name) === index);
  if (missingNames.length === 0) return source;
  const definitions = missingNames.map((name) => `
const ${name} = ({ content, label, title, text }: { content?: string; label?: string; title?: string; text?: string }) => (
  <div className="rounded-2xl border border-black/10 p-4">
    <h3 className="font-semibold">{title ?? label ?? text ?? content ?? "${humanize(name)}"}</h3>
  </div>
);
`).join("\n");
  const exportIndex = source.search(/export\s+default\s+[A-Z][A-Za-z0-9]*\s*;?/);
  return exportIndex === -1
    ? `${source}\n${definitions}`
    : `${source.slice(0, exportIndex)}${definitions}\n${source.slice(exportIndex)}`;
}

function replaceSelfRecursiveRootWrapper(source: string, rootName: string): string {
  const declaration = componentDeclarationPattern(rootName).exec(source);
  if (!declaration) return source;
  const before = source.slice(0, declaration.index);
  const body = source.slice(declaration.index);
  const repairedBody = body
    .replace(new RegExp(`<${escapeRegExp(rootName)}(\\s*>)`), "<main$1")
    .replace(new RegExp(`</${escapeRegExp(rootName)}>`, "g"), "</main>");
  return `${before}${repairedBody}`;
}

function replaceSelfRecursiveComponentReferences(source: string, report: ReactPageReport, rootName?: string): string {
  let repaired = source;
  for (const name of report.issues.filter((issue) => issue.code === "self-recursive-component-render").map((issue) => issue.target)) {
    if (name === rootName) continue;
    const declaration = componentDeclarationPattern(name).exec(repaired);
    if (!declaration) continue;
    const before = repaired.slice(0, declaration.index);
    const body = repaired.slice(declaration.index);
    const nextDeclaration = body.slice(1).search(/\n\s*(?:const|function)\s+[A-Z][A-Za-z0-9]*\b/);
    const componentSource = nextDeclaration === -1 ? body : body.slice(0, nextDeclaration + 1);
    const rest = nextDeclaration === -1 ? "" : body.slice(nextDeclaration + 1);
    const componentBody = componentSource
      .replace(new RegExp(`\\s*<${escapeRegExp(name)}\\b[^>]*\\/>`, "g"), "")
      .replace(new RegExp(`\\s*<${escapeRegExp(name)}\\b[^>]*>[\\s\\S]*?</${escapeRegExp(name)}>`, "g"), "");
    repaired = `${before}${componentBody}${rest}`;
  }
  return repaired;
}

function finalizeRepair(source: string, rootName?: string, architecture?: UiArchitecture): string {
  let repaired = source;
  for (const name of componentDefinitionNames(repaired)) {
    if (name === rootName) continue;
    repaired = removeSelfReferencesFromComponent(repaired, name);
  }
  repaired = ensureArchitectureComponentsRendered(repaired, architecture, rootName);
  return fillMissingProps(repaired);
}

function removeSelfReferencesFromComponent(source: string, name: string): string {
  const declaration = componentDeclarationPattern(name).exec(source);
  if (!declaration) return source;
  const before = source.slice(0, declaration.index);
  const body = source.slice(declaration.index);
  const nextDeclaration = body.slice(1).search(/\n\s*(?:const|function)\s+[A-Z][A-Za-z0-9]*\b/);
  const componentSource = nextDeclaration === -1 ? body : body.slice(0, nextDeclaration + 1);
  const rest = nextDeclaration === -1 ? "" : body.slice(nextDeclaration + 1);
  const componentBody = componentSource
    .replace(new RegExp(`\\s*<${escapeRegExp(name)}\\b[^>]*\\/>`, "g"), "")
    .replace(new RegExp(`\\s*<${escapeRegExp(name)}\\b[^>]*>[\\s\\S]*?</${escapeRegExp(name)}>`, "g"), "");
  return `${before}${componentBody}${rest}`;
}

function componentDefinitionNames(source: string): string[] {
  return [...source.matchAll(/(?:const|function)\s+([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1]);
}

function ensureArchitectureComponentsRendered(source: string, architecture?: UiArchitecture, rootName?: string): string {
  if (!architecture) return source;
  const required = new Set([
    ...layoutComponentNames(architecture.layoutTree),
    ...architecture.components.flatMap((component) => Array.isArray(component.children) ? component.children : []),
    ...architecture.components.map((component) => component.name)
  ]);
  if (rootName) required.delete(rootName);
  const rendered = new Set([...source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1]));
  const missing = [...required].filter((name) => isDefinedComponent(source, name) && !rendered.has(name));
  if (missing.length === 0) return source;
  return insertIntoDefaultComponent(source, missing.map((name) => `    <${name} />`).join("\n"));
}

function insertIntoDefaultComponent(source: string, insertion: string): string {
  const defaultComponent = defaultExportName(source);
  if (!defaultComponent) return source;
  const declaration = componentDeclarationPattern(defaultComponent).exec(source);
  if (declaration?.index === undefined) return source;
  const afterDeclaration = source.slice(declaration.index);
  const nextDeclaration = afterDeclaration.slice(1).search(/\n\s*(?:const|function)\s+[A-Z][A-Za-z0-9]*\b/);
  const componentSource = nextDeclaration === -1 ? afterDeclaration : afterDeclaration.slice(0, nextDeclaration + 1);
  const closeIndex = firstRootCloseIndex(componentSource);
  if (closeIndex === -1) {
    const rewrittenComponent = componentSource.replace(/=>\s*<([A-Z][A-Za-z0-9]*)([^>]*)\/>\s*;/, (_match, component: string, attributes: string) => `=> (\n  <main>\n    <${component}${attributes} />\n${insertion}\n  </main>\n);`);
    if (rewrittenComponent !== componentSource) {
      return `${source.slice(0, declaration.index)}${rewrittenComponent}${nextDeclaration === -1 ? "" : afterDeclaration.slice(nextDeclaration + 1)}`;
    }
    return source;
  }
  const absoluteCloseIndex = declaration.index + closeIndex;
  return `${source.slice(0, absoluteCloseIndex)}${insertion}\n  ${source.slice(absoluteCloseIndex)}`;
}

function layoutComponentNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const own = typeof record.component === "string" ? [record.component] : [];
  const children = Array.isArray(record.children) ? record.children.flatMap(layoutComponentNames) : [];
  return [...own, ...children];
}

function firstRootCloseIndex(value: string): number {
  const customComponentCloseIndex = value.match(/<\/[A-Z][A-Za-z0-9]*>/)?.index ?? -1;
  const candidates = ["</div>", "</main>", "</section>"]
    .map((token) => value.indexOf(token))
    .concat(customComponentCloseIndex)
    .filter((index) => index >= 0);
  return candidates.length === 0 ? -1 : Math.min(...candidates);
}

function removeRootProps(source: string, rootName: string): string {
  const propsName = `${rootName}Props`;
  const propsBody = source.match(new RegExp(`interface\\s+${escapeRegExp(propsName)}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
  const propNames = [...propsBody.matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)].map((item) => item[1]);
  let repaired = source.replace(new RegExp(`\\n?interface\\s+${escapeRegExp(propsName)}\\s*\\{[\\s\\S]*?\\}\\n?`), "\n");
  // Handle: const Root = ({ ... }: RootPageProps) =>
  repaired = repaired.replace(new RegExp(`const\\s+${escapeRegExp(rootName)}\\s*=\\s*\\(\\s*\\{[^}]*\\}\\s*:\\s*${escapeRegExp(propsName)}\\s*\\)\\s*=>`), `const ${rootName} = () =>`);
  // Handle: const Root: React.FC<RootPageProps> = ({ ... }) =>
  repaired = repaired.replace(new RegExp(`const\\s+${escapeRegExp(rootName)}\\s*:\\s*React\\.FC<${escapeRegExp(propsName)}>\\s*=\\s*\\([^)]*\\)\\s*=>`), `const ${rootName}: React.FC = () =>`);
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
