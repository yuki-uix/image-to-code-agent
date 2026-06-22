import type { UiArchitecture, UiMemory } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class CodeGenerator {
  private readonly model: ModelClient;

  constructor(model: ModelClient) {
    this.model = model;
  }

  implement(architecture: UiArchitecture, memory: UiMemory) {
    return this.model.generateText({
      agent: "code-generator",
      instructions: "Implement the supplied architecture in React, TypeScript, and Tailwind. Do not change component boundaries or invent product behavior. Return only TSX.",
      payload: { architecture, projectContract: memory.projectContract, visualTokens: memory.visualTokens }
    });
  }
}
