import type { ComponentRegistry, VisualAnalysis } from "../domain/contracts.ts";
import type { ModelClient, TraceableModelClient } from "../model/model-client.ts";
import { normalizeComponentRegistry } from "../validation/component-registry-normalizer.ts";

export class ComponentArchitect {
  private readonly model: ModelClient;
  protected readonly instructions: string;

  constructor(model: ModelClient, instructions = defaultComponentArchitectInstructions) {
    this.model = model;
    this.instructions = instructions;
  }

  async extract(visualAnalysis: VisualAnalysis): Promise<ComponentRegistry> {
    const { registry } = await this.extractWithTrace(visualAnalysis);
    return registry;
  }

  async extractWithTrace(visualAnalysis: VisualAnalysis): Promise<{ registry: ComponentRegistry; raw: unknown; rawText?: string }> {
    const response = await this.model.generateJson<unknown>({
      agent: "component-architect",
      instructions: this.instructions,
      payload: visualAnalysis
    });
    return { registry: normalizeComponentRegistry(response), raw: response };
  }
}

export class TraceableComponentArchitect extends ComponentArchitect {
  private readonly traceableModel: TraceableModelClient;

  constructor(model: TraceableModelClient, instructions = defaultComponentArchitectInstructions) {
    super(model, instructions);
    this.traceableModel = model;
  }

  async extractWithTrace(visualAnalysis: VisualAnalysis): Promise<{ registry: ComponentRegistry; raw: unknown; rawText: string }> {
    const { parsed, rawText } = await this.traceableModel.generateJsonWithRaw<unknown>({
      agent: "component-architect",
      instructions: this.instructions,
      payload: visualAnalysis
    });
    return { registry: normalizeComponentRegistry(parsed), raw: parsed, rawText };
  }
}

export const defaultComponentArchitectInstructions = "Find repeated or semantically identical UI patterns, variants, and reusable component boundaries. Cite source element ids. Do not write React code.";
