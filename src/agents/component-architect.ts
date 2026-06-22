import type { ComponentRegistry, VisualAnalysis } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class ComponentArchitect {
  private readonly model: ModelClient;

  constructor(model: ModelClient) {
    this.model = model;
  }

  extract(visualAnalysis: VisualAnalysis) {
    return this.model.generateJson<ComponentRegistry>({
      agent: "component-architect",
      instructions: "Find repeated or semantically identical UI patterns, variants, and reusable component boundaries. Cite source element ids. Do not write React code.",
      payload: visualAnalysis
    });
  }
}
