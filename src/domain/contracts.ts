export type Rect = { x: number; y: number; width: number; height: number };

export type UiElement = {
  id: string;
  kind: string;
  text?: string;
  regionId: string;
  bounds?: Rect;
  visual?: Record<string, unknown>;
};

export type VisualAnalysis = {
  regions: Array<{ id: string; role: string; bounds?: Rect }>;
  layout: { direction: "row" | "column" | "mixed"; width: number; height: number; notes?: string[] };
  hierarchy: { root: string; children: Record<string, string[]> };
  elements: UiElement[];
  visualTokens?: Partial<VisualTokens>;
};

export type ComponentDefinition = {
  name: string;
  sourceElementIds: string[];
  instances: number;
  variants: string[];
  props: string[];
  evidence: string;
};

export type ComponentRegistry = {
  components: Record<string, ComponentDefinition>;
};

export type VisualTokens = {
  colors: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
};

export type ProjectContract = {
  framework: "React";
  language: "TypeScript";
  styling: "Tailwind";
  responsive: boolean;
};

export type MemoryOverrides = {
  rename_component?: Record<string, string>;
  merge_component?: Record<string, string[]>;
  split_component?: Record<string, string[]>;
  rules?: Record<string, unknown>;
};

export type UiMemory = {
  version: 1;
  projectContract: ProjectContract;
  imageInventory: Array<{ id: string; path: string; pageRole?: string; viewport: { width: number; height: number } }>;
  visualTokens: VisualTokens;
  layoutModel: Pick<VisualAnalysis, "regions" | "layout" | "hierarchy">;
  componentRegistry: ComponentRegistry;
  assetRegistry: { icons: Record<string, unknown>; images: Record<string, unknown>; illustrations: Record<string, unknown> };
  decisionsAndOverrides: MemoryOverrides;
};

export type UiArchitecture = {
  pages: Array<{ name: string; route: string; rootComponent: string }>;
  components: Array<{ name: string; file: string; children: string[] }>;
  layoutTree: { component: string; children: Array<unknown> };
  fileStructure: string[];
};

export type PipelineResult = {
  visualAnalysis: VisualAnalysis;
  componentRegistry: ComponentRegistry;
  uiMemory: UiMemory;
  uiArchitecture: UiArchitecture;
  reactPage: string;
};

export const defaultProjectContract: ProjectContract = {
  framework: "React",
  language: "TypeScript",
  styling: "Tailwind",
  responsive: true
};
