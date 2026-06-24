export type VisualAnalysisDetail = "full" | "coarse" | "outline";

export function buildVisualAnalysisInstructions(prompt: string, detail: VisualAnalysisDetail): string {
  const baseContract = `Return one JSON object with this contract:
- source: { width: number, height: number }
- regions: array of { id, role, bbox }
- layout: object with at least direction: "row" | "column" | "mixed"
- hierarchy: { root: string, children: Record<string, string[]> }
- elements: array of { id, kind, regionId, bbox?, text?, visualRole?, geometrySource, certainty, visual? }
- layoutRelations: array of { type, source, target, distance? }
- uncertainObservations: array of { description, relatedIds }

Do not output a schema. Do not describe the contract. Output one analysis instance only.`;

  if (detail === "outline") {
    return `${prompt.trim()}

Outline mode:
- Return only the highest-level page structure.
- Prefer 3 to 8 elements total.
- Use section wrappers only, such as \`promoBar\`, \`navBar\`, \`heroSection\`, \`benefitsSection\`, \`categorySection\`, \`rewardsSection\`, and \`productCarousel\`.
- Do not enumerate navigation links, icons, buttons inside sections, product details, or repeated cards.
- Keep text fields very short. Prefer a short label like "Hero" or "Best Sellers" over copying long marketing copy.
- Use one page region plus a small set of top-level section elements.
- Do not output markdown, explanations, placeholder comments, or continuation notes. Stop after one complete JSON object.

${baseContract}`;
  }

  if (detail === "coarse") {
    return `${prompt.trim()}

Coarse mode:
- Focus on major page sections first, not on every small child element.
- Prefer 5 to 12 elements total unless the page is genuinely sparse.
- Use section wrappers such as \`promoBar\`, \`navBar\`, \`heroSection\`, \`benefitsSection\`, \`categorySection\`, \`rewardsSection\`, and \`productCarousel\` when visible.
- For repeated commerce rows, include the row wrapper plus at most 1 to 3 representative child items.
- Do not enumerate every navigation link, every icon, every product detail, or every repeated card in coarse mode.
- Avoid long free-text copies when they make the JSON fragile; keep text fields short, and prefer headline-level text over full paragraphs.
- Do not collapse the whole body into one generic content element.
- Do not output markdown, explanations, placeholder comments, or continuation notes. Stop after one complete JSON object.

${baseContract}`;
  }

  return `${prompt.trim()}

Full mode:
- Capture section-level structure and as many clearly visible UI elements as possible without breaking JSON validity.
- Prefer specific visible roles over generic wrappers.
- Keep long text exact only when it is important to the element identity.

${baseContract}`;
}
