import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ReplayModelClient } from "../src/model/replay-model-client.ts";
import { StructuredPipeline } from "../src/pipeline/structured-pipeline.ts";
import { buildUiMemory } from "../src/memory/ui-memory-store.ts";
import { defaultProjectContract, type ComponentRegistry, type VisualAnalysis } from "../src/domain/contracts.ts";
import { validateGeometry } from "../src/validation/geometry-validator.ts";
import { looksLikeSchemaEcho } from "../src/validation/visual-analysis-guards.ts";
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
