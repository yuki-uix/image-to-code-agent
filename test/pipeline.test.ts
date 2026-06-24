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
