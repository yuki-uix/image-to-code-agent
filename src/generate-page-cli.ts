#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CodeGenerator } from "./agents/code-generator.ts";
import { defaultUiArchitectInstructions, UiArchitect } from "./agents/ui-architect.ts";
import { defaultProjectContract, type ComponentRegistry, type MemoryOverrides, type UiArchitecture, type VisualAnalysis } from "./domain/contracts.ts";
import { buildUiMemory } from "./memory/ui-memory-store.ts";
import { OllamaInvalidJsonError, OllamaModelClient } from "./model/ollama-model-client.ts";
import { validateUiArchitecture } from "./validation/ui-architecture-validator.ts";
import { repairUiArchitecture } from "./validation/ui-architecture-repair.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.analysis || !args.registry || !args.image) {
  console.error("Usage: npm run page:generate -- --analysis <analysis.json> --registry <component-registry.json> --image <source-image> [--out outputs/page-generation/run-1] [--overrides overrides.json] [--model qwen2.5vl:7b]");
  process.exitCode = 1;
} else {
  const analysis = JSON.parse(await readFile(resolve(args.analysis), "utf8")) as VisualAnalysis;
  const registry = JSON.parse(await readFile(resolve(args.registry), "utf8")) as ComponentRegistry;
  const overrides = args.overrides ? JSON.parse(await readFile(resolve(args.overrides), "utf8")) as MemoryOverrides : undefined;
  const outputDir = resolve(args.out ?? `outputs/page-generation/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const imagePath = resolve(args.image);
  const memory = buildUiMemory({
    image: { id: "image-1", path: imagePath, viewport: analysis.source },
    projectContract: defaultProjectContract,
    visualAnalysis: analysis,
    componentRegistry: registry,
    overrides
  });

  const model = new OllamaModelClient({ model: args.model });
  await mkdir(outputDir, { recursive: true });
  console.log("Writing approved UI Memory...");
  await writeJson(join(outputDir, "ui-memory.json"), memory);
  console.log("Designing UI architecture...");
  let architecture;
  try {
    architecture = await new UiArchitect(model).design(memory);
  } catch (error) {
    const details = error instanceof OllamaInvalidJsonError ? `${error.message}\n\n${error.rawText}` : String(error);
    await writeFile(join(outputDir, "ui-architecture.error.txt"), `${details}\n`);
    throw error;
  }
  architecture = repairUiArchitecture(architecture, memory);
  let architectureReport = validateUiArchitecture(architecture);
  architecture = declareMissingLayoutComponents(architecture, architectureReport);
  architectureReport = validateUiArchitecture(architecture);
  if (!architectureReport.valid) {
    const feedback = architectureReport.issues.map((item) => `- ${item.code}: ${item.message} (${item.target})`).join("\n");
    console.log("Retrying UI architecture after validation...");
    architecture = await new UiArchitect(model, `${defaultUiArchitectInstructions}\n\nRepair the previous architecture using these validation errors:\n${feedback}`).design(memory);
    architecture = repairUiArchitecture(architecture, memory);
    architectureReport = validateUiArchitecture(architecture);
    architecture = declareMissingLayoutComponents(architecture, architectureReport);
    architectureReport = validateUiArchitecture(architecture);
  }
  await writeJson(join(outputDir, "ui-architecture-validation.json"), architectureReport);
  if (!architectureReport.valid) {
    await writeJson(join(outputDir, "ui-architecture.json"), architecture);
    throw new Error(`UI Architecture validation failed. See ${join(outputDir, "ui-architecture-validation.json")}`);
  }
  console.log("Generating React TSX...");
  const reactPage = stripCodeFence(await new CodeGenerator(model).implement(architecture, memory));

  await writeJson(join(outputDir, "ui-architecture.json"), architecture);
  await writeFile(join(outputDir, "react-page.tsx"), `${reactPage.trim()}\n`);
  await writeJson(join(outputDir, "run.json"), {
    stages: ["ui-memory", "ui-architect", "code-generator"],
    model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
    analysis: resolve(args.analysis),
    registry: resolve(args.registry),
    image: imagePath,
    artifacts: ["ui-memory.json", "ui-architecture.json", "ui-architecture-validation.json", "react-page.tsx", "run.json"]
  });
  console.log(`Generated page artifacts in ${outputDir}`);
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, "");
    const value = values[index + 1];
    if (key && value) result[key] = value;
  }
  return result;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:tsx|typescript)?\s*/i, "").replace(/\s*```$/, "");
}

function declareMissingLayoutComponents(architecture: UiArchitecture, report: ReturnType<typeof validateUiArchitecture>): UiArchitecture {
  const known = new Set(architecture.components.map((component) => component.name));
  const additions = report.issues
    .filter((issue) => issue.code === "unknown-layout-component" && !known.has(issue.target))
    .map((issue) => ({ name: issue.target, file: `src/components/${issue.target}.tsx`, children: [] }));
  return additions.length === 0 ? architecture : { ...architecture, components: [...architecture.components, ...additions] };
}
