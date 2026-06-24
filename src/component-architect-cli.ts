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
  if (report.issues.some((issue) => issue.code === "over-merged-section-component")) {
    initialResult = result;
    const retryArchitect = new TraceableComponentArchitect(model, `${instructions}\n\nRepair requirement: Your previous attempt merged distinct top-level sections into a generic SectionHeading. Return named one-off section components instead (for example HeroSection, CategorySection, LoyaltySection, ProductCarousel). Do not use SectionHeading to group different page sections.`);
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
