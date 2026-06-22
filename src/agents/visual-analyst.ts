import type { VisualAnalysis } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class VisualAnalyst {
  private readonly model: ModelClient;

  constructor(model: ModelClient) {
    this.model = model;
  }

  analyze(input: { image: { mimeType: string; base64: string }; viewport: { width: number; height: number } }) {
    return this.model.generateJson<VisualAnalysis>({
      agent: "visual-analyst",
      instructions: "Describe only visible layout, hierarchy, alignment, spacing, and elements. Do not infer UX, components, or code. Return JSON matching VisualAnalysis.",
      payload: { viewport: input.viewport },
      image: input.image
    });
  }
}
