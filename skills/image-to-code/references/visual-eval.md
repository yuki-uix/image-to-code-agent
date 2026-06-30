# Visual evaluation reference

Run the deterministic geometry gate in `layout-contract.md` before interpreting pixel similarity. Geometry errors are cheaper and more actionable than an image-wide diff.

Read this when judging Reuse output quality or when reporting whether a generated page is visually better than a no-design-system baseline.

Machine checks can verify contract text, required assets, and token reuse. Visual evaluation covers what those checks cannot see: layout fidelity, crop quality, density, and whether design-system reuse actually improves the page.

For safe design-source runs, automate the first comparison before human review. Use a fixed viewport derived from the page reference, capture the full rendered document, and compare it with the source.

## Automated capture and diff

Capture the complete HTML document at the reference viewport:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/capture-page.mjs \
  --html <page-dir>/index.html \
  --out <eval-dir>/actual.png \
  --width <page-layout-width> \
  --height <page-layout-height>
```

`capture-page.mjs` uses local Chrome/Chromium through DevTools and records both viewport and full document dimensions. A page that is twice as tall as the reference therefore cannot pass by showing only its first screen.

Compare against the input page region:

```sh
python3 ${CLAUDE_SKILL_DIR}/scripts/visual-diff.py \
  --reference <source-image> \
  --design-source <design-package>/design-source.json \
  --actual <eval-dir>/actual.png \
  --out <eval-dir>
```

This writes `reference.png`, `actual.png`, `actual-resized.png`, `overlay.png`, `diff.png`, and `visual-eval.json`.

Interpret the score only as triage:

- `pass`: accept machine comparison, then perform a brief semantic review.
- `partial` or `fail`: inspect the overlay and the worst tiles; allow one targeted repair pass.
- After one repair, rerun capture and diff. Stop after that pass and report remaining gaps instead of entering an open-ended token loop.

Pillow and local Chrome/Chromium are optional dependencies for this advanced visual gate. Their absence must not break default Generate mode.

## Recommended eval bundle

For each serious Reuse test, keep:

```txt
visual-eval/
  original-target.png
  reference.png
  actual.png
  overlay.png
  diff.png
  with-system.png
  no-system.png
  reuse-eval.json
  visual-eval.json
  notes.md
```

The bundle can be created manually with screenshots from the browser. The goal is repeatable human review, not fully automated pixel scoring.

## Review dimensions

Score each dimension as `pass`, `partial`, or `fail`.

1. Layout fidelity
   - Section order matches the target screenshot.
   - Major columns, grids, and split layouts have similar proportions.
   - No duplicated headers, misplaced controls, or missing sections.

2. Text and data fidelity
   - Visible headings, nav, filters, product data, footer links, and CTA labels match the target.
   - No source-page facts leak from the design-system page.

3. Crop and asset fidelity
   - Real image regions are used where the target has real images.
   - Crop subjects are complete and centered enough to read visually.
   - No obvious white slivers, cut-off product labels, or wrong image subjects.

4. Typography and density
   - Heading scale, body size, line height, letter spacing, and spacing density feel close.
   - The page is not noticeably too loose, too cramped, too bold, or too generic.

5. Design-system consistency
   - Shared tokens and component styling improve brand consistency.
   - The design system does not override target-page facts.

6. Baseline comparison
   - Compare `with-system` against `no-system`.
   - Record whether design-system reuse improves, harms, or has no clear effect.

## Page-type focus

For `collection` pages, focus on product grid consistency, filter fidelity, product data, card crops, and sort/pagination controls.

For `product-detail` pages, focus on gallery crops, product title/price/options, tabs, CTA hierarchy, and recommendation cards.

For `cart` and `checkout` pages, focus on line-item data, totals, quantity controls, trust badges, and form layout.

For `editorial` pages, focus on hero proportion, editorial image crops, value cards, story/quote sections, ingredient/card grids, and footer/newsletter continuity.

For `marketing` pages, focus on hero hierarchy, CTA styling, feature/testimonial sections, social proof, and repeated card patterns.

## Notes template

```md
# Visual Eval

## Verdict

- with-system vs no-system: better / worse / mixed / unclear
- machine eval: pass / fail
- visual eval: pass / partial / fail

## Observations

- Layout:
- Text/data:
- Crop/assets:
- Typography/density:
- Design-system consistency:
- Baseline comparison:

## Next action

- accept
- fix contract extraction
- fix crop specs
- tune styling
- rerun without design system
```
