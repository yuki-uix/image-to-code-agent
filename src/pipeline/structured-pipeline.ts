import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { VisualAnalyst } from "../agents/visual-analyst.ts";
import { ComponentArchitect } from "../agents/component-architect.ts";
import { UiArchitect } from "../agents/ui-architect.ts";
import { CodeGenerator } from "../agents/code-generator.ts";
import { buildUiMemory, UiMemoryStore } from "../memory/ui-memory-store.ts";
import { defaultProjectContract, type MemoryOverrides, type PipelineResult, type ProjectContract } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

const mimeTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

export class StructuredPipeline {
  private readonly model: ModelClient;

  constructor(model: ModelClient) {
    this.model = model;
  }

  async run(input: {
    imagePath: string;
    imageId?: string;
    viewport: { width: number; height: number };
    outputDir: string;
    projectContract?: ProjectContract;
    overrides?: MemoryOverrides;
  }): Promise<PipelineResult> {
    await mkdir(input.outputDir, { recursive: true });
    const bytes = await readFile(input.imagePath);
    const image = { mimeType: mimeTypes[extname(input.imagePath).toLowerCase()] ?? "application/octet-stream", base64: bytes.toString("base64") };

    const visualAnalysis = await new VisualAnalyst(this.model).analyze({ image, viewport: input.viewport });
    await writeJson(join(input.outputDir, "layout.json"), visualAnalysis);

    const componentRegistry = await new ComponentArchitect(this.model).extract(visualAnalysis);
    await writeJson(join(input.outputDir, "component-registry.json"), componentRegistry);

    const uiMemory = buildUiMemory({
      image: { id: input.imageId ?? "image-1", path: input.imagePath, viewport: input.viewport },
      projectContract: input.projectContract ?? defaultProjectContract,
      visualAnalysis,
      componentRegistry,
      overrides: input.overrides
    });
    await new UiMemoryStore(join(input.outputDir, "ui-memory.json")).save(uiMemory);

    const uiArchitecture = await new UiArchitect(this.model).design(uiMemory);
    await writeJson(join(input.outputDir, "ui-architecture.json"), uiArchitecture);

    const reactPage = stripCodeFence(await new CodeGenerator(this.model).implement(uiArchitecture, uiMemory));
    await writeFile(join(input.outputDir, "react-page.tsx"), `${reactPage.trim()}\n`);
    return { visualAnalysis, componentRegistry, uiMemory, uiArchitecture, reactPage };
  }
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:tsx|typescript)?\s*/i, "").replace(/\s*```$/, "");
}
