import type { UiArchitecture, UiMemory } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class UiArchitect {
  private readonly model: ModelClient;

  constructor(model: ModelClient) {
    this.model = model;
  }

  design(memory: UiMemory) {
    return this.model.generateJson<UiArchitecture>({
      agent: "ui-architect",
      instructions: "Turn the approved UI Memory into a page tree, component tree, and maintainable file structure. Treat decisionsAndOverrides as authoritative. Do not emit implementation code.",
      payload: memory
    });
  }
}
