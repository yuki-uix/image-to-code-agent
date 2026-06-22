import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ComponentRegistry, MemoryOverrides, ProjectContract, UiMemory, VisualAnalysis } from "../domain/contracts.ts";

const emptyTokens = { colors: {}, typography: {}, spacing: {}, radius: {} };

export function buildUiMemory(input: {
  image: { id: string; path: string; viewport: { width: number; height: number } };
  projectContract: ProjectContract;
  visualAnalysis: VisualAnalysis;
  componentRegistry: ComponentRegistry;
  overrides?: MemoryOverrides;
}): UiMemory {
  const memory: UiMemory = {
    version: 1,
    projectContract: input.projectContract,
    imageInventory: [input.image],
    visualTokens: { ...emptyTokens, ...input.visualAnalysis.visualTokens },
    layoutModel: {
      regions: input.visualAnalysis.regions,
      layout: input.visualAnalysis.layout,
      hierarchy: input.visualAnalysis.hierarchy
    },
    componentRegistry: structuredClone(input.componentRegistry),
    assetRegistry: { icons: {}, images: {}, illustrations: {} },
    decisionsAndOverrides: input.overrides ?? {}
  };
  applyOverrides(memory);
  return memory;
}

export function applyOverrides(memory: UiMemory): void {
  const registry = memory.componentRegistry.components;
  for (const [from, to] of Object.entries(memory.decisionsAndOverrides.rename_component ?? {})) {
    if (!registry[from]) throw new Error(`Cannot rename missing component: ${from}`);
    registry[to] = { ...registry[from], name: to };
    delete registry[from];
  }
  for (const [target, sources] of Object.entries(memory.decisionsAndOverrides.merge_component ?? {})) {
    const definitions = sources.map((name) => registry[name]).filter(Boolean);
    if (definitions.length !== sources.length) throw new Error(`Cannot merge missing component into ${target}`);
    registry[target] = {
      name: target,
      sourceElementIds: [...new Set(definitions.flatMap((item) => item.sourceElementIds))],
      instances: definitions.reduce((sum, item) => sum + item.instances, 0),
      variants: [...new Set(definitions.flatMap((item) => item.variants))],
      props: [...new Set(definitions.flatMap((item) => item.props))],
      evidence: `User override merged: ${sources.join(", ")}`
    };
    for (const source of sources) if (source !== target) delete registry[source];
  }
}

export class UiMemoryStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async save(memory: UiMemory): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(memory, null, 2)}\n`);
  }

  async load(): Promise<UiMemory> {
    return JSON.parse(await readFile(this.path, "utf8")) as UiMemory;
  }
}
