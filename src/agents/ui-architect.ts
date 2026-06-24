import type { UiArchitecture, UiMemory } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class UiArchitect {
  private readonly model: ModelClient;
  private readonly instructions: string;

  constructor(model: ModelClient, instructions = defaultUiArchitectInstructions) {
    this.model = model;
    this.instructions = instructions;
  }

  design(memory: UiMemory) {
    return this.model.generateJson<UiArchitecture>({
      agent: "ui-architect",
      instructions: this.instructions,
      payload: memory
    });
  }
}

export const defaultUiArchitectInstructions = "Turn approved UI Memory into a compact React page architecture. Treat decisionsAndOverrides as authoritative. Do not emit implementation code. Return JSON only: { pages: [{ name, route, rootComponent }], components: [{ name, file, children }], layoutTree: { component, children }, fileStructure: string[] }. Every component used by layoutTree must appear in components, including layout containers such as NavBar and FilterSidebar. Preserve the approved componentRegistry; represent repeated components once in the file tree. layoutTree must use type-level component names only: use ProductCard, not ProductCard1 through ProductCard12; use CategoryFilter, not individual filter-control names.";
