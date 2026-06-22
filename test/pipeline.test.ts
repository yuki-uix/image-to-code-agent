import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ReplayModelClient } from "../src/model/replay-model-client.ts";
import { StructuredPipeline } from "../src/pipeline/structured-pipeline.ts";
import { buildUiMemory } from "../src/memory/ui-memory-store.ts";
import { defaultProjectContract, type ComponentRegistry, type VisualAnalysis } from "../src/domain/contracts.ts";

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
    regions: [],
    layout: { direction: "column", width: 100, height: 100 },
    hierarchy: { root: "page", children: {} },
    elements: []
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
