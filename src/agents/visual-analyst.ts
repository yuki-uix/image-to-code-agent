import type { VisualAnalysis } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class VisualAnalyst {
  private readonly model: ModelClient;
  private readonly instructions: string;

  constructor(model: ModelClient, instructions = defaultVisualAnalystInstructions) {
    this.model = model;
    this.instructions = instructions;
  }

  analyze(input: { image: { mimeType: string; base64: string }; viewport: { width: number; height: number } }) {
    return this.model.generateJson<VisualAnalysis>({
      agent: "visual-analyst",
      instructions: this.instructions,
      payload: { source: input.viewport },
      image: input.image
    });
  }
}

export const defaultVisualAnalystInstructions = `Analyze only visible UI facts in the screenshot.
Return source size, regions, elements, hierarchy, layout relations, visual tokens, and uncertain observations.
Use pixel bounding boxes as {x, y, width, height}, measured from the top-left corner of the original image.
Treat bounding boxes as visual evidence, not implementation instructions.
Describe relative alignment, containment, direction, gaps, and padding when visible.
Use geometrySource "vlm" and certainty "high", "medium", or "low". Do not invent numeric confidence.
Do not infer UX strategy, reusable components, React code, or hidden behavior.
Do not merge repeated elements into components. Every visible instance remains a separate element.
Return JSON only, matching the VisualAnalysis schema.`;
