import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Buffer } from "node:buffer";
import { ReplayModelClient } from "../src/model/replay-model-client.ts";
import { StructuredPipeline } from "../src/pipeline/structured-pipeline.ts";
import { buildUiMemory } from "../src/memory/ui-memory-store.ts";
import { defaultProjectContract, type ComponentRegistry, type VisualAnalysis } from "../src/domain/contracts.ts";
import { CodeGenerator } from "../src/agents/code-generator.ts";
import type { ModelClient, ModelRequest } from "../src/model/model-client.ts";
import { detectImageMimeType, detectImageSize } from "../src/image-size.ts";
import { OllamaInvalidJsonError } from "../src/model/ollama-model-client.ts";
import { looksLikeComponentRegistrySchemaEcho } from "../src/validation/component-registry-guards.ts";
import { normalizeComponentRegistry } from "../src/validation/component-registry-normalizer.ts";
import { validateComponentRegistry } from "../src/validation/component-registry-validator.ts";
import { validateGeometry } from "../src/validation/geometry-validator.ts";
import { buildVisualAnalysisInstructions } from "../src/visual-analysis-instructions.ts";
import { looksLikeSchemaEcho } from "../src/validation/visual-analysis-guards.ts";
import { normalizeVisualAnalysis } from "../src/validation/visual-analysis-normalizer.ts";
import { repairVisualAnalysis } from "../src/validation/visual-analysis-repair.ts";
import { validateUiArchitecture } from "../src/validation/ui-architecture-validator.ts";
import { repairUiArchitecture } from "../src/validation/ui-architecture-repair.ts";
import { validateReactPage } from "../src/validation/react-page-validator.ts";
import { repairReactPage } from "../src/validation/react-page-repair.ts";

const fixture = resolve("evaluation/landing-pages/simple-search");

test("structured pipeline writes all MVP artifacts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "image-to-code-"));
  const model = await ReplayModelClient.fromFile(join(fixture, "model-responses.json"));
  const result = await new StructuredPipeline(model).run({
    imagePath: join(fixture, "screenshot.svg"),
    outputDir,
    viewport: { width: 1440, height: 900 }
  });

  for (const file of ["layout.json", "component-registry.json", "ui-memory.json", "ui-architecture.json", "react-page.tsx"]) {
    assert.ok((await readFile(join(outputDir, file), "utf8")).length > 0, `${file} should be written`);
  }
  assert.equal(result.componentRegistry.components.Tag.instances, 3);
  assert.match(result.reactPage, /aria-label="Search resources"/);
});

test("UI architecture validation rejects undeclared layout components", () => {
  const report = validateUiArchitecture({
    pages: [{ name: "ShopPage", route: "/shop", rootComponent: "ShopPage" }],
    components: [{ name: "ProductCard", file: "src/components/ProductCard.tsx", children: [] }],
    layoutTree: { component: "ShopPage", children: ["FilterSidebar", "ProductCard"] },
    fileStructure: ["src/components/ProductCard.tsx", "src/pages/ShopPage.tsx"]
  });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "unknown-layout-component" && item.target === "FilterSidebar"));
});

test("UI architecture validation accepts numbered instances of a declared component", () => {
  const report = validateUiArchitecture({
    pages: [{ name: "ShopPage", route: "/shop", rootComponent: "ShopPage" }],
    components: [{ name: "ProductCard", file: "src/components/ProductCard.tsx", children: [] }],
    layoutTree: { component: "ShopPage", children: ["ProductCard1", "ProductCard2"] },
    fileStructure: ["src/components/ProductCard.tsx", "src/pages/ShopPage.tsx"]
  });
  assert.equal(report.valid, true);
});

test("UI architecture validation rejects nested child objects in component declarations", () => {
  const report = validateUiArchitecture({
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [
      { name: "CategoryContent", file: "src/components/CategoryContent.tsx", children: [{ name: "ShopByCategoryCard" }] as unknown as string[] },
      { name: "ShopByCategoryCard", file: "src/components/ShopByCategoryCard.tsx", children: [] }
    ],
    layoutTree: { component: "Root", children: ["CategoryContent"] },
    fileStructure: ["src/components/CategoryContent.tsx", "src/components/ShopByCategoryCard.tsx"]
  });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "invalid-component-child" && item.target === "CategoryContent"));
});

test("UI architecture repair maps source element children back to component names", () => {
  const componentRegistry: ComponentRegistry = {
    components: {
      CTAButton: { name: "CTAButton", sourceElementIds: ["ctaButton"], instances: 1, variants: [], props: ["label"], evidence: "Primary CTA label is Shop Now." }
    }
  };
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry
  });

  const repaired = repairUiArchitecture({
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [{ name: "CTAButton", file: "src/components/CTAButton.tsx", children: ["ctaButton", "missingElement"] }],
    layoutTree: { component: "Root", children: ["ctaButton"] },
    fileStructure: ["src/components/CTAButton.tsx"]
  }, memory);

  assert.deepEqual(repaired.components.find((component) => component.name === "CTAButton")?.children, []);
  assert.deepEqual(repaired.layoutTree.children, ["CTAButton"]);
  assert.equal(validateUiArchitecture(repaired).valid, true);
});

test("editable memory applies component renames before architecture", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 100, height: 100 },
    regions: [],
    layout: { direction: "column" },
    hierarchy: { root: "page", children: {} },
    elements: [],
    layoutRelations: [],
    uncertainObservations: []
  };
  const componentRegistry: ComponentRegistry = {
    components: {
      Tag: { name: "Tag", sourceElementIds: ["one"], instances: 1, variants: [], props: [], evidence: "fixture" }
    }
  };
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis,
    componentRegistry,
    overrides: { rename_component: { Tag: "TopicChip" } }
  });

  assert.equal(memory.componentRegistry.components.Tag, undefined);
  assert.equal(memory.componentRegistry.components.TopicChip.name, "TopicChip");
  assert.deepEqual(memory.decisionsAndOverrides.rename_component, { Tag: "TopicChip" });
});

test("code generator receives component registry evidence and forbids third-party imports", async () => {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async generateJson() {
      throw new Error("not used");
    },
    async generateText(request) {
      requests.push(request);
      return "export default function Root() { return <main />; }";
    }
  };
  const componentRegistry: ComponentRegistry = {
    components: {
      CTAButton: { name: "CTAButton", sourceElementIds: ["ctaButton"], instances: 1, variants: [], props: ["label"], evidence: "Primary CTA label is Shop Now." }
    }
  };
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry
  });

  await new CodeGenerator(model).implement({
    pages: [{ name: "Home", route: "/", rootComponent: "Home" }],
    components: [{ name: "CTAButton", file: "src/components/CTAButton.tsx", children: [] }],
    layoutTree: { component: "Root", children: ["CTAButton"] },
    fileStructure: ["src/components/CTAButton.tsx"]
  }, memory);

  assert.match(requests[0].instructions, /Allowed imports: React only/);
  assert.match(requests[0].instructions, /Never hide a component/);
  assert.deepEqual((requests[0].payload as { componentRegistry: ComponentRegistry }).componentRegistry, componentRegistry);
});

test("react page validation rejects missing renders, third-party imports, and bare template identifiers", () => {
  const componentRegistry: ComponentRegistry = {
    components: {
      SpringSaleBanner: { name: "SpringSaleBanner", sourceElementIds: ["springSaleBanner"], instances: 1, variants: [], props: [], evidence: "A sale banner is visible." },
      ShopByCategoryCard: { name: "ShopByCategoryCard", sourceElementIds: ["categoryCard1", "categoryCard2", "categoryCard3"], instances: 3, variants: [], props: ["title", "description"], evidence: "Three cards share title and description." }
    }
  };
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry
  });
  const architecture = {
    pages: [{ name: "Home", route: "/", rootComponent: "Home" }],
    components: [
      { name: "SpringSaleBanner", file: "src/components/SpringSaleBanner.tsx", children: [] },
      { name: "ShopByCategoryCard", file: "src/components/ShopByCategoryCard.tsx", children: [] }
    ],
    layoutTree: { component: "Root", children: ["SpringSaleBanner", "ShopByCategoryCard"] },
    fileStructure: ["src/components/SpringSaleBanner.tsx", "src/components/ShopByCategoryCard.tsx"]
  };

  const report = validateReactPage(`
    import React from 'react';
    import { twMerge } from 'tailwind-merge';
    const Root = () => <main><ShopByCategoryCard description={\`Explore \${title}\`} /></main>;
  `, architecture, memory);

  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "disallowed-import"));
  assert.ok(report.issues.some((item) => item.code === "missing-component-render" && item.target === "SpringSaleBanner"));
  assert.ok(report.issues.some((item) => item.code === "suspicious-template-identifier" && item.target === "title"));
});

test("react page repair inserts defined but missing components into the default root", () => {
  const componentRegistry: ComponentRegistry = {
    components: {
      SpringSaleBanner: { name: "SpringSaleBanner", sourceElementIds: ["springSaleBanner"], instances: 1, variants: [], props: [], evidence: "A sale banner is visible." }
    }
  };
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry
  });
  const architecture = {
    pages: [{ name: "Home", route: "/", rootComponent: "Home" }],
    components: [{ name: "SpringSaleBanner", file: "src/components/SpringSaleBanner.tsx", children: [] }],
    layoutTree: { component: "Home", children: ["SpringSaleBanner"] },
    fileStructure: ["src/components/SpringSaleBanner.tsx"]
  };
  const source = `
    import React from 'react';
    const Home = () => (
      <div>
        <main>Visible page</main>
      </div>
    );
    const SpringSaleBanner = () => <section>Spring sale</section>;
    export default Home;
  `;
  const repaired = repairReactPage(source, validateReactPage(source, architecture, memory));

  assert.match(repaired, /<SpringSaleBanner \/>/);
  assert.equal(validateReactPage(repaired, architecture, memory).valid, true);
});

test("react page validation rejects wrong default export and invented console behavior", () => {
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry: {
      components: {
        CTAButton: { name: "CTAButton", sourceElementIds: ["ctaButton"], instances: 1, variants: [], props: ["label"], evidence: "Primary CTA label is Shop Now." }
      }
    }
  });
  const report = validateReactPage(`
    import React from 'react';
    const CTAButton = ({ label }: { label: string }) => <button onClick={() => console.log(label)}>{label}</button>;
    const Home = () => <main><CTAButton label="Shop Now" /></main>;
    export default Home;
  `, {
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [{ name: "CTAButton", file: "src/components/CTAButton.tsx", children: [] }],
    layoutTree: { component: "Root", children: ["CTAButton"] },
    fileStructure: ["src/components/CTAButton.tsx"]
  }, memory);

  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "page-root-export-mismatch" && item.target === "Home"));
  assert.ok(report.issues.some((item) => item.code === "invented-console-behavior"));
});

test("react page repair fixes root export mismatch and console-only click handlers", () => {
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry: {
      components: {
        CTAButton: { name: "CTAButton", sourceElementIds: ["ctaButton"], instances: 1, variants: [], props: ["label"], evidence: "Primary CTA label is Shop Now." }
      }
    }
  });
  const architecture = {
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [{ name: "CTAButton", file: "src/components/CTAButton.tsx", children: [] }],
    layoutTree: { component: "Root", children: ["CTAButton"] },
    fileStructure: ["src/components/CTAButton.tsx"]
  };
  const source = `
    import React from 'react';
    const CTAButton = ({ label }: { label: string }) => <button onClick={() => console.log(label)}>{label}</button>;
    const Home = () => <main><CTAButton label="Shop Now" /></main>;
    export default Home;
  `;
  const repaired = repairReactPage(source, validateReactPage(source, architecture, memory), architecture);

  assert.match(repaired, /const Root =/);
  assert.match(repaired, /export default Root/);
  assert.doesNotMatch(repaired, /console\./);
  assert.equal(validateReactPage(repaired, architecture, memory).valid, true);
});

test("react page validation rejects JSX missing required interface props", () => {
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry: {
      components: {
        ShopByCategoryCard: { name: "ShopByCategoryCard", sourceElementIds: ["categoryCard1"], instances: 1, variants: [], props: ["title"], evidence: "Card title is visible." }
      }
    }
  });
  const report = validateReactPage(`
    import React from 'react';
    interface ShopByCategoryCardProps { title: string; description: string; }
    const ShopByCategoryCard = ({ title, description }: ShopByCategoryCardProps) => <article><h3>{title}</h3><p>{description}</p></article>;
    const Root = () => <main><ShopByCategoryCard /></main>;
    export default Root;
  `, {
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [{ name: "ShopByCategoryCard", file: "src/components/ShopByCategoryCard.tsx", children: [] }],
    layoutTree: { component: "Root", children: ["ShopByCategoryCard"] },
    fileStructure: ["src/components/ShopByCategoryCard.tsx"]
  }, memory);

  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "missing-required-prop" && item.target === "ShopByCategoryCard"));
});

test("react page repair fills missing required props on self-closing JSX", () => {
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry: {
      components: {
        ShopByCategoryCard: { name: "ShopByCategoryCard", sourceElementIds: ["categoryCard1"], instances: 1, variants: [], props: ["title"], evidence: "Card title is visible." }
      }
    }
  });
  const architecture = {
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [{ name: "ShopByCategoryCard", file: "src/components/ShopByCategoryCard.tsx", children: [] }],
    layoutTree: { component: "Root", children: ["ShopByCategoryCard"] },
    fileStructure: ["src/components/ShopByCategoryCard.tsx"]
  };
  const source = `
    import React from 'react';
    interface ShopByCategoryCardProps { title: string; description: string; }
    const ShopByCategoryCard = ({ title, description }: ShopByCategoryCardProps) => <article><h3>{title}</h3><p>{description}</p></article>;
    const Root = () => <main><ShopByCategoryCard /></main>;
    export default Root;
  `;
  const repaired = repairReactPage(source, validateReactPage(source, architecture, memory), architecture);

  assert.match(repaired, /<ShopByCategoryCard\s+title="Shop By Category Card"\s+description="Shop By Category Card details"\s+\/>/);
  assert.equal(validateReactPage(repaired, architecture, memory).valid, true);
});

test("react page validation and repair enforce zero-prop page root", () => {
  const memory = buildUiMemory({
    image: { id: "one", path: "screenshot.png", viewport: { width: 100, height: 100 } },
    projectContract: defaultProjectContract,
    visualAnalysis: {
      source: { width: 100, height: 100 },
      regions: [],
      layout: { direction: "column" },
      hierarchy: { root: "page", children: {} },
      elements: [],
      layoutRelations: [],
      uncertainObservations: []
    },
    componentRegistry: {
      components: {
        Navigation: { name: "Navigation", sourceElementIds: ["nav"], instances: 1, variants: [], props: ["label"], evidence: "Navigation label is visible." }
      }
    }
  });
  const architecture = {
    pages: [{ name: "Home", route: "/", rootComponent: "Root" }],
    components: [{ name: "Navigation", file: "src/components/Navigation.tsx", children: [] }],
    layoutTree: { component: "Root", children: ["Navigation"] },
    fileStructure: ["src/components/Navigation.tsx"]
  };
  const source = `
    import React from 'react';
    interface RootProps { navigationLabel: string; }
    const Navigation = ({ label }: { label: string }) => <nav>{label}</nav>;
    const Root = ({ navigationLabel }: RootProps) => <main><Navigation label={navigationLabel} /></main>;
    export default Root;
  `;
  const report = validateReactPage(source, architecture, memory);
  const repaired = repairReactPage(source, report, architecture);

  assert.ok(report.issues.some((item) => item.code === "page-root-requires-props"));
  assert.doesNotMatch(repaired, /RootProps/);
  assert.match(repaired, /const Root = \(\) =>/);
  assert.match(repaired, /label="navigation Label"/);
  assert.equal(validateReactPage(repaired, architecture, memory).valid, true);
});

test("component registry normalization infers props from evidence for repeated components", () => {
  const registry: ComponentRegistry = {
    components: {
      ProductCard: {
        name: "ProductCard",
        sourceElementIds: ["productCard1", "productCard2", "productCard3"],
        instances: 3,
        variants: [],
        props: [],
        evidence: "Three product cards share the same structure: heading plus short descriptive copy."
      }
    }
  };
  const normalized = normalizeComponentRegistry(registry);
  assert.ok(normalized.components.ProductCard.props.includes("title"), "should infer title from heading");
  assert.ok(normalized.components.ProductCard.props.includes("description"), "should infer description from copy");
});

test("component registry normalization does not infer props when model already provided them", () => {
  const registry: ComponentRegistry = {
    components: {
      ProductCard: {
        name: "ProductCard",
        sourceElementIds: ["productCard1", "productCard2"],
        instances: 2,
        variants: [],
        props: ["name", "price"],
        evidence: "Two product cards with heading and image."
      }
    }
  };
  const normalized = normalizeComponentRegistry(registry);
  assert.deepEqual(normalized.components.ProductCard.props, ["name", "price"]);
});

test("geometry validation catches boxes outside the screenshot", () => {
  const analysis: VisualAnalysis = {
    source: { width: 100, height: 100 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 100, height: 100 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"] } },
    elements: [{ id: "button", kind: "button", regionId: "page", bbox: { x: 90, y: 90, width: 20, height: 20 }, geometrySource: "vlm", certainty: "low" }],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateGeometry(analysis);
  assert.equal(report.valid, false);
  assert.equal(report.issues[0]?.code, "bbox-out-of-bounds");
});

test("geometry validation reports incomplete model output instead of throwing", () => {
  const report = validateGeometry({ source: { width: 1440, height: 900 } } as VisualAnalysis);
  assert.equal(report.valid, false);
  assert.equal(report.issues[0]?.code, "missing-regions");
});

test("schema echo shape is distinguishable from an analysis instance", () => {
  const schemaEcho = { $schema: "https://json-schema.org/draft/2020-12/schema", title: "VisualAnalysis", type: "object", properties: {} };
  assert.equal(looksLikeSchemaEcho(schemaEcho), true);
  assert.equal(looksLikeSchemaEcho({ source: { width: 1, height: 1 } }), false);
});

test("geometry validation warns when hierarchy omits region and element links", () => {
  const analysis: VisualAnalysis = {
    source: { width: 100, height: 100 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 100, height: 100 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: [] } },
    elements: [{ id: "title", kind: "text", regionId: "page", bbox: { x: 10, y: 10, width: 40, height: 10 }, geometrySource: "vlm", certainty: "medium" }],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateGeometry(analysis);
  assert.equal(report.valid, true);
  assert.deepEqual(report.issues.map((item) => item.code), ["region-not-linked-from-root", "element-not-linked-from-region"]);
});

test("geometry validation warns when lone page region does not cover the source", () => {
  const analysis: VisualAnalysis = {
    source: { width: 100, height: 100 },
    regions: [{ id: "page", role: "page", bbox: { x: 5, y: 5, width: 90, height: 90 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: [] } },
    elements: [],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateGeometry(analysis);
  assert.equal(report.valid, true);
  assert.ok(report.issues.some((item) => item.code === "page-region-not-full-canvas"));
});

test("repair visual analysis expands lone page region to the full canvas", () => {
  const repaired = repairVisualAnalysis({
    source: { width: 100, height: 80 },
    regions: [{ id: "page", role: "page", bbox: { x: 5, y: 4, width: 70, height: 70 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"] } },
    elements: [],
    layoutRelations: [],
    uncertainObservations: []
  });
  assert.deepEqual(repaired.regions[0]?.bbox, { x: 0, y: 0, width: 100, height: 80 });
});

test("repair visual analysis fills missing hierarchy links from root and region", () => {
  const repaired = repairVisualAnalysis({
    source: { width: 100, height: 80 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 100, height: 80 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: {} },
    elements: [{ id: "title", kind: "text", regionId: "page", bbox: { x: 10, y: 10, width: 20, height: 10 }, geometrySource: "vlm", certainty: "medium" }],
    layoutRelations: [],
    uncertainObservations: []
  });
  assert.deepEqual(repaired.hierarchy.children.root, ["page"]);
  assert.deepEqual(repaired.hierarchy.children.page, ["title"]);
});

test("normalization and repair accept VLM corner-array boxes", () => {
  const normalized = normalizeVisualAnalysis({
    source: { width: 200, height: 100 },
    regions: [{ id: "hero", role: "hero", bbox: [10, 20, 150, 80] }],
    layout: { direction: "column" },
    hierarchy: { root: "hero", children: {} },
    elements: [{ id: "hero", kind: "hero", bbox: [10, 20, 150, 80] }],
    layoutRelations: [],
    uncertainObservations: []
  });
  const repaired = repairVisualAnalysis(normalized);
  assert.equal(repaired.regions[0]?.id, "region-hero");
  assert.deepEqual(repaired.regions[0]?.bbox, { x: 10, y: 20, width: 140, height: 60 });
  assert.equal(repaired.hierarchy.root, "root");
  assert.equal(repaired.elements[0]?.regionId, "region-hero");
  assert.deepEqual(repaired.hierarchy.children["region-hero"], ["hero"]);
  assert.equal(validateGeometry(repaired).valid, true);
});

test("component registry normalization fills missing fields", () => {
  const registry = normalizeComponentRegistry({
    components: {
      FeatureCard: {
        sourceElementIds: ["section-1", "section-2", "section-2"]
      }
    }
  });
  assert.deepEqual(registry.components.FeatureCard, {
    name: "FeatureCard",
    sourceElementIds: ["section-1", "section-2"],
    instances: 2,
    variants: [],
    props: [],
    evidence: "No evidence provided."
  });
});

test("component registry validation flags unknown source elements", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 100, height: 100 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 100, height: 100 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["title"] } },
    elements: [{ id: "title", kind: "text", regionId: "page", geometrySource: "vlm", certainty: "high" }],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry({
    components: {
      CtaButton: {
        name: "CtaButton",
        sourceElementIds: ["missing-id"],
        instances: 1,
        variants: [],
        props: ["label"],
        evidence: "fixture"
      }
    }
  }, visualAnalysis);
  assert.equal(report.valid, false);
  assert.equal(report.issues[0]?.code, "unknown-source-element");
});

test("component registry schema echo is distinguishable from a registry instance", () => {
  const schemaEcho = { $schema: "https://json-schema.org/draft/2020-12/schema", title: "ComponentRegistry", type: "object", properties: {} };
  assert.equal(looksLikeComponentRegistrySchemaEcho(schemaEcho), true);
  assert.equal(looksLikeComponentRegistrySchemaEcho({ components: {} }), false);
});

test("component registry rejects a repeated item group modeled only as one container", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 400, height: 400 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 400, height: 400 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["productCard1", "productCard2", "productCard3"] } },
    elements: [
      { id: "productCard1", kind: "product", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "productCard2", kind: "product", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "productCard3", kind: "product", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry({
    components: {
      ProductGrid: {
        name: "ProductGrid",
        sourceElementIds: ["productCard1", "productCard2", "productCard3"],
        instances: 1,
        variants: [],
        props: ["products"],
        evidence: "Three product cards are displayed."
      }
    }
  }, visualAnalysis);
  assert.ok(report.issues.some((item) => item.code === "repeated-items-not-modeled-as-instances"));
  assert.equal(report.valid, false);
});

test("component registry rejects a repeated item group omitted by section components", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 400, height: 400 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 400, height: 400 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["categorySection", "categoryCard1", "categoryCard2", "categoryCard3"] } },
    elements: [
      { id: "categorySection", kind: "categoryContent", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "categoryCard1", kind: "shop_by_category_card", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "categoryCard2", kind: "shop_by_category_card", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "categoryCard3", kind: "shop_by_category_card", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry({
    components: {
      CategorySection: { name: "CategorySection", sourceElementIds: ["categorySection"], instances: 1, variants: [], props: [], evidence: "Category area." }
    }
  }, visualAnalysis);
  assert.ok(report.issues.some((item) => item.code === "repeated-items-not-modeled-as-instances"));
  assert.equal(report.valid, false);
});

test("component registry rejects low coverage for a detailed page analysis", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 400, height: 400 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 400, height: 400 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["nav", "hero", "banner", "newsletter", "trust", "footer", "card1", "card2", "card3", "card4"] } },
    elements: ["nav", "hero", "banner", "newsletter", "trust", "footer", "card1", "card2", "card3", "card4"].map((id) => ({ id, kind: "section", regionId: "page", geometrySource: "vlm" as const, certainty: "high" as const })),
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry({
    components: {
      Hero: { name: "Hero", sourceElementIds: ["hero"], instances: 1, variants: [], props: [], evidence: "Hero." }
    }
  }, visualAnalysis);
  assert.ok(report.issues.some((item) => item.code === "insufficient-element-coverage"));
  assert.equal(report.valid, false);
});

test("component registry validation rejects over-merged generic section headings", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 736, height: 1104 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 736, height: 1104 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["heroSection", "bestSellers"] } },
    elements: [
      { id: "heroSection", kind: "heroSection", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "bestSellers", kind: "productCarousel", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry({
    components: {
      SectionHeading: {
        name: "SectionHeading",
        sourceElementIds: ["heroSection", "bestSellers"],
        instances: 2,
        variants: [],
        props: ["text"],
        evidence: "Both are headings."
      }
    }
  }, visualAnalysis);
  assert.ok(report.issues.some((item) => item.code === "over-merged-section-component"));
  assert.equal(report.valid, false);
});

test("component registry validation detects over-merging when section kinds are generic", () => {
  const visualAnalysis: VisualAnalysis = {
    source: { width: 736, height: 1104 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 736, height: 1104 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["heroSection", "bestSellers"] } },
    elements: [
      { id: "heroSection", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "bestSellers", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry({
    components: {
      SectionHeading: {
        name: "SectionHeading",
        sourceElementIds: ["heroSection", "bestSellers"],
        instances: 2,
        variants: [],
        props: ["text"],
        evidence: "Both are headings."
      }
    }
  }, visualAnalysis);
  assert.ok(report.issues.some((item) => item.code === "over-merged-section-component"));
  assert.equal(report.valid, false);
});

test("component registry rejects repeated component with empty props", () => {
  const registry: ComponentRegistry = {
    components: {
      ProductCard: {
        name: "ProductCard",
        sourceElementIds: ["productCard1", "productCard2", "productCard3"],
        instances: 3,
        variants: [],
        props: [],
        evidence: "Three product cards."
      }
    }
  };
  const analysis: VisualAnalysis = {
    source: { width: 800, height: 600 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 800, height: 600 } }],
    layout: { direction: "row" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["productCard1", "productCard2", "productCard3"] } },
    elements: [
      { id: "productCard1", kind: "card", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "productCard2", kind: "card", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "productCard3", kind: "card", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry(registry, analysis);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "empty-props-on-repeated-component"));
});

test("component registry rejects interactive component with empty props", () => {
  const registry: ComponentRegistry = {
    components: {
      CTAButton: {
        name: "CTAButton",
        sourceElementIds: ["ctaButton"],
        instances: 1,
        variants: [],
        props: [],
        evidence: "A call-to-action button."
      }
    }
  };
  const analysis: VisualAnalysis = {
    source: { width: 800, height: 600 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 800, height: 600 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["ctaButton"] } },
    elements: [
      { id: "ctaButton", kind: "button", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  };
  const report = validateComponentRegistry(registry, analysis);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "empty-props-on-interactive-component"));
});

test("image size detection supports jpeg", () => {
  const bytes = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00
  ]);
  assert.deepEqual(detectImageSize(bytes, ".jpg"), { width: 600, height: 300 });
});

test("image size detection falls back to file signature over extension", () => {
  const bytes = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00
  ]);
  assert.deepEqual(detectImageSize(bytes, ".png"), { width: 600, height: 300 });
  assert.equal(detectImageMimeType(bytes, "fake.png"), "image/jpeg");
});

test("invalid json error retains raw model output", () => {
  const error = new OllamaInvalidJsonError("bad json", "{\"broken\":");
  assert.equal(error.rawText, "{\"broken\":");
  assert.equal(error.name, "OllamaInvalidJsonError");
});

test("visual analysis instructions differ between full and coarse modes", () => {
  const full = buildVisualAnalysisInstructions("Base prompt", "full");
  const coarse = buildVisualAnalysisInstructions("Base prompt", "coarse");
  const outline = buildVisualAnalysisInstructions("Base prompt", "outline");
  assert.match(full, /Full mode:/);
  assert.match(coarse, /Coarse mode:/);
  assert.match(outline, /Outline mode:/);
  assert.match(coarse, /Output exactly 10 elements/);
  assert.match(coarse, /entire top navigation\/header as one `navBar` element/);
  assert.doesNotMatch(coarse, /Base prompt/);
  assert.match(coarse, /Do not enumerate individual navigation links/);
  assert.match(coarse, /Do not output markdown/);
  assert.match(outline, /Prefer 3 to 8 elements total/);
  assert.match(outline, /Do not enumerate navigation links/);
  assert.notEqual(full, coarse);
  assert.notEqual(coarse, outline);
});

test("image size detection supports webp vpx", () => {
  const bytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1e, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xdf, 0x02, 0x00,
    0x4f, 0x01, 0x00
  ]);
  assert.deepEqual(detectImageSize(bytes, ".webp"), { width: 736, height: 336 });
});

test("geometry validation warns when a tall page has too few elements", () => {
  const report = validateGeometry({
    source: { width: 736, height: 1104 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 736, height: 1104 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["header", "mainContent"] } },
    elements: [
      { id: "header", kind: "header", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "mainContent", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "low" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  });
  assert.ok(report.issues.some((item) => item.code === "coarse-element-coverage"));
});

test("geometry validation respects a mode-specific minimum element count", () => {
  const report = validateGeometry({
    source: { width: 736, height: 1104 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 736, height: 1104 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["header", "hero", "categories", "products", "footer"] } },
    elements: [
      { id: "header", kind: "nav", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "hero", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "categories", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "products", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "high" },
      { id: "footer", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "high" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  }, { minimumElements: 10 });
  assert.ok(report.issues.some((item) => item.code === "coarse-element-coverage"));
});

test("geometry validation warns on generic catch-all elements", () => {
  const report = validateGeometry({
    source: { width: 736, height: 1104 },
    regions: [{ id: "page", role: "page", bbox: { x: 0, y: 0, width: 736, height: 1104 } }],
    layout: { direction: "column" },
    hierarchy: { root: "root", children: { root: ["page"], page: ["mainContent"] } },
    elements: [
      { id: "mainContent", kind: "section", regionId: "page", geometrySource: "vlm", certainty: "low" }
    ],
    layoutRelations: [],
    uncertainObservations: []
  });
  assert.ok(report.issues.some((item) => item.code === "generic-catchall-element"));
});
