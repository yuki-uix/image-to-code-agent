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
      instructions: "Implement the supplied architecture in React, TypeScript, and Tailwind. Do not change component boundaries or invent product behavior. Return one self-contained TSX file: define every PascalCase component used in JSX in this file, use no local component imports, and do not reference any component absent from the architecture. Return only TSX.",
      payload: { architecture, projectContract: memory.projectContract, visualTokens: memory.visualTokens }
    });
  }
}
