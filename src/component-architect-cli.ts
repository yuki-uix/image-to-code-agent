#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { TraceableComponentArchitect } from "./agents/component-architect.ts";
import type { VisualAnalysis } from "./domain/contracts.ts";
import { OllamaModelClient } from "./model/ollama-model-client.ts";
import { looksLikeComponentRegistrySchemaEcho } from "./validation/component-registry-guards.ts";
import { validateComponentRegistry } from "./validation/component-registry-validator.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.analysis) {
  console.error("Usage: npm run component:extract -- --analysis <visual-analysis.json> [--model qwen2.5vl:7b] [--out outputs/component-architect/run-1]");
  process.exitCode = 1;
} else {
  const analysisPath = resolve(args.analysis);
  const visualAnalysis = JSON.parse(await readFile(analysisPath, "utf8")) as VisualAnalysis;
  const prompt = await readFile(resolve("agents/component-architect/prompt.md"), "utf8");
  const instructions = buildComponentArchitectInstructions(prompt);
  const model = new OllamaModelClient({ model: args.model });
  const architect = new TraceableComponentArchitect(model, instructions);
  let result = await architect.extractWithTrace(visualAnalysis);
  if (looksLikeComponentRegistrySchemaEcho(result.raw)) {
    throw new Error("Component Architect returned the schema instead of a registry instance. Try rerunning after the prompt update, or switch to a stronger model.");
  }
  let report = validateComponentRegistry(result.registry, visualAnalysis);
  let initialResult: typeof result | undefined;
  const retryCodes = new Set(["over-merged-section-component", "unknown-source-element", "repeated-items-not-modeled-as-instances", "insufficient-element-coverage"]);
  if (report.issues.some((issue) => retryCodes.has(issue.code))) {
    initialResult = result;
    const availableElementIds = visualAnalysis.elements.map((element) => element.id).filter(Boolean).join(", ");
    const retryArchitect = new TraceableComponentArchitect(model, `${instructions}\n\nRepair requirement: Your previous attempt violated the evidence contract. Every sourceElementIds entry must be selected exactly from this list of visible element IDs: ${availableElementIds}. Do not cite regions, hierarchy keys, or inferred wrappers. Cover the major visible one-off elements too: navigation, promo banners, newsletter/sign-up, and trust/benefit rows must each be represented by a component or be cited as evidence by their owning section. For EVERY numbered item family with three or more IDs (for example categoryCard1..3 or newArrivalsCard1..3), create a dedicated reusable item component. It must cite every ID in that family and set instances to the exact count. A section/container component is allowed only in addition to those item components. Keep distinct top-level sections separate; do not use SectionHeading to group them.`);
    result = await retryArchitect.extractWithTrace(visualAnalysis);
    if (looksLikeComponentRegistrySchemaEcho(result.raw)) {
      throw new Error("Component Architect retry returned the schema instead of a registry instance.");
    }
    report = validateComponentRegistry(result.registry, visualAnalysis);
  }
  const outputDir = resolve(args.out ?? `outputs/component-architect/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "component-registry.json"), result.registry);
  await writeJson(join(outputDir, "raw-component-registry.json"), result.raw);
  await writeFile(join(outputDir, "raw-component-registry.txt"), `${result.rawText.trim()}\n`);
  if (initialResult) {
    await writeJson(join(outputDir, "raw-component-registry.initial.json"), initialResult.raw);
    await writeFile(join(outputDir, "raw-component-registry.initial.txt"), `${initialResult.rawText.trim()}\n`);
  }
  await writeJson(join(outputDir, "component-validation.json"), report);
  await writeJson(join(outputDir, "run.json"), {
    agent: "component-architect",
    model: args.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b",
    analysis: analysisPath,
    prompt: "agents/component-architect/prompt.md",
    attempts: initialResult ? 2 : 1,
    artifacts: ["component-registry.json", "raw-component-registry.json", "raw-component-registry.txt", ...(initialResult ? ["raw-component-registry.initial.json", "raw-component-registry.initial.txt"] : []), "component-validation.json", "run.json"]
  });
  console.log(`Component registry written to ${outputDir}`);
  console.log(report.valid ? "Component validation passed." : `Component validation found ${report.issues.length} issue(s).`);
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

function buildComponentArchitectInstructions(prompt: string): string {
  return `${prompt.trim()}

Return one JSON object with this contract:
- components: record keyed by component name
- each component: { name, sourceElementIds, instances, variants, props, evidence }

Do not output a schema. Do not describe the contract. Output one component registry instance only.`;
}
