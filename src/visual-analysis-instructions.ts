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
    return `You are a Visual Analyst. Describe only visible UI structure from the supplied screenshot.

Coarse mode:
- Output exactly 10 elements for a visually rich ecommerce page. Keep the JSON short enough to finish in one response.
- Reserve one element for the whole navigation/header, one for the hero, one for its primary CTA, one for benefits, two for category content, two for loyalty content, and two for product content when those areas are visible.
- On a genuinely sparse page, return the smallest honest set instead of padding the count.
- Use section wrappers such as \`promoBar\`, \`navBar\`, \`heroSection\`, \`benefitsSection\`, \`categorySection\`, \`rewardsSection\`, and \`productCarousel\` when visible.
- Hard budget: represent an entire top navigation/header as one \`navBar\` element. Do not enumerate individual navigation links, utility icons, product details, or every repeated card in coarse mode.
- Keep text short. Use concrete ids and kinds. Do not infer code, UX, or invisible behavior.
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
