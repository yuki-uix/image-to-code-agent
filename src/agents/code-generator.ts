import type { UiArchitecture, UiMemory } from "../domain/contracts.ts";
import type { ModelClient } from "../model/model-client.ts";

export class CodeGenerator {
  private readonly model: ModelClient;
  private readonly repairFeedback?: string;

  constructor(model: ModelClient, repairFeedback?: string) {
    this.model = model;
    this.repairFeedback = repairFeedback;
  }

  implement(architecture: UiArchitecture, memory: UiMemory) {
    return this.model.generateText({
      agent: "code-generator",
      instructions: [
        "Implement the supplied architecture in React, TypeScript, and Tailwind.",
        "Return one self-contained TSX file only.",
        "The default export must be the exact architecture page rootComponent name.",
        "Allowed imports: React only. Do not import tailwind-merge, clsx, local components, assets, or any third-party package.",
        "Define every PascalCase component used in JSX in this file, and do not reference any component absent from the architecture.",
        "Use the supplied componentRegistry as the evidence contract: preserve component boundaries, props, instance counts, and visible labels from evidence.",
        "For repeated components, define a small local data array with exactly the registry instance count and render it with map. Pass the declared props such as title, description, imageSrc, href, or label.",
        "CRITICAL — never use placeholder text. Forbidden strings: 'Service 1', 'Service 2', 'Content for Card 1', 'Banner Content', 'Card Content', 'Item 1', or any pattern like '<ComponentName> Content'. If a component's evidence mentions specific text (a button label, a card title, a service name), use that exact text. For repeated components, seed the data array with distinct real values derived from evidence, not numbered placeholders.",
        "Every component in the architecture and componentRegistry must be rendered at least once in JSX, unless it is the page root.",
        "For interactive components, render the visible label from props or evidence. Never hide a component because children are missing. Do not add onClick handlers, console logging, or invented behavior.",
        "Each section must render its own content directly — do not nest all sections inside HeroSection or any other single wrapper. Page-level siblings in layoutTree.children must be rendered as siblings in the Page JSX, not as children of the first component.",
        "Do not use undefined variables inside template strings. In mapped cards, use item.title or item.description, not bare title.",
        "Use Tailwind classes directly; merge classes manually if needed.",
        "Do not invent product behavior beyond static UI rendering.",
        ...(this.repairFeedback ? [`Repair these validation errors exactly:\n${this.repairFeedback}`] : [])
      ].join(" "),
      payload: {
        architecture,
        projectContract: memory.projectContract,
        visualTokens: memory.visualTokens,
        layoutModel: memory.layoutModel,
        componentRegistry: memory.componentRegistry
      }
    });
  }
}
