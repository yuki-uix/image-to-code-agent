# Codex grounding + Sonnet reasoning: what changed and what we learned

This PR changes who does what inside the `/image-to-code` skill when it runs in a live Claude Code
session, and adds a dual-critique fidelity pass. It does not change the skill's public interface —
same command, same flags (one default flipped, see below).

## The change in one paragraph

Visual Analyst grounding (Step 2's "read the image" work) now dispatches a sub agent to run
`codex exec -m gpt-5.5 --output-schema agents/visual-analyst/schema.strict.json`, instead of the
orchestrating agent eyeballing the screenshot itself. Component Architect / UI Architect / Code
Generator get no new code at all — they're just the orchestrating session's own work, since that
session already is a model (Sonnet 5, in our testing). Asset generation now defaults to actually
generating a fresh image per region (`scripts/generate-assets.mjs`, via the Codex-managed imagegen
channel) instead of only cropping. The fidelity check gets a new "Reference Review" tier where two
independent passes — one dispatched-Codex, one the orchestrating agent's own reading — are shown
side by side rather than merged into one verdict.

## Why: what this was tested against

Two real dry runs, both actually executed end to end (not simulated), both included in this PR
under `evaluation/`:

1. **`evaluation/landing-pages/simple-search/`** — the repo's own existing fixture. Simple page,
   no real image-asset regions. Result: overall similarity **0.988**, 0 must-fix, 0 should-fix.
2. **`evaluation/velvety-product-detail/`** — a real, dense e-commerce product-detail page
   (user-provided design reference: header/nav/cart, 4 gallery thumbnails + hero product photo,
   price/description/feature icons, size/quantity/add-to-cart, 4-item trust-badge row, 4 tabs,
   a 4-card "you may also like" carousel, multi-column footer with decorative illustration — 7
   regions, 100 elements per the grounding pass). Result: overall similarity **0.772** after 3
   rounds (max-rounds reached, status `rounds-exhausted`), 10 real generated product-photo assets.

The second run is the one that actually stress-tested the design — see findings below.

## What we found (the reason this is worth reading, not just the diff)

**Two schema/tooling bugs, found and fixed before anything shipped:**

- `agents/visual-analyst/schema.json` is not usable with `codex exec --output-schema` as-is —
  OpenAI's structured-outputs strict mode requires `additionalProperties:false` on every object
  node and every declared property listed in `required`; the canonical schema's `layout`/
  `hierarchy`/`visualTokens` fields are bare `{"type":"object"}` and get rejected outright
  (`invalid_json_schema`, confirmed by hand, before the model runs at all). New
  `agents/visual-analyst/schema.strict.json` fixes this for the codex-facing call only — the
  canonical `schema.json` and everything that reads the canonical `VisualAnalysis` contract shape
  are untouched. Because strict mode can't express an arbitrary-keyed dictionary,
  `hierarchy.children` is wire-encoded as an array of `{id, childIds}` pairs and converted back to
  the canonical `{id: [childIds]}` map immediately after the call — nothing downstream needs to
  know the wire format differs.
- The Codex-managed imagegen channel actually has two different underlying mechanisms in the wild
  (a system-bundled `image_gen.py` requiring its own `OPENAI_API_KEY`, and the openai-codex Claude
  Code plugin's `codex-companion.mjs imagegen`, which authenticates through the already-logged-in
  Codex CLI session). `scripts/generate-assets.mjs` auto-detects the companion path first — the one
  actually verified to work without extra key configuration — falling back to the system script,
  and both are overridable via `IMAGEGEN_CLI`/`IMAGEGEN_CLI_STYLE` for other environments.

**Two model-behavior gotchas worth knowing about, not fixable in this repo, only worth defending against:**

- Codex's own self-reported `source.width`/`source.height` in the grounding response can simply be
  wrong (observed: claimed 1600×900 for an actual 1440×900 image) while every individual element's
  bbox is still correct in the true frame. SKILL.md now says explicitly: always overwrite `source`
  with the rasterized image's real dimensions, never trust the self-report.
- Codex misread visible text twice across the two runs — a "€60" free-shipping threshold read back
  as "€40", and a "2024" footer copyright year read back as "2034" — and **neither was flagged in
  its own `uncertainObservations`**. "Not flagged as uncertain" is not the same as "correct." Both
  were caught because the orchestrating agent independently read the disputed pixels rather than
  trusting the structured pass blindly, which is exactly what Step 2 already told it to do; the
  VELVETY run is the first real evidence that instruction earns its keep.

**One finding that's the actual argument for the dual-critique design:** a checklist section's data
was column-major but the CSS grid defaulted to row-major fill, silently misassigning items to the
wrong column. The automated pixel-diff score **did not move at all** when this was found and fixed
(0.7719 → 0.7719, unchanged to four decimal places). The two Reference Review passes are the only
part of the pipeline that caught it — pixel similarity is structurally blind to this entire class of
bug, which is precisely the gap that tier exists to cover.

**The dual critique isn't just two opinions stapled together — one pass fact-checked the other.**
On the VELVETY run, the Codex-dispatched pass and the orchestrating agent's own pass agreed on some
things (residual vertical drift, the generated photos running warmer/more saturated than the
reference's muted palette) but disagreed on others: Codex called the product-card photos
"completely frameless — the biggest structural miss," which turned out on pixel inspection to be a
real but subtle ~1px border, not the "biggest" issue; Codex also read the footer copyright glyph as
"2034," which cross-checking against known digit shapes elsewhere in the same image showed was
almost certainly "2024" (same misreading pattern as the €40/€60 case). Showing both passes
side-by-side, tagged by source, rather than merging them into one verdict, is what made this
catchable at all.

## Known gaps this surfaced, not yet fixed

- No documented way to tell the pipeline "this region is artboard/annotation chrome, not real page
  content" — the VELVETY reference had a baked-in Figma frame label; excluding it from the
  generated page was clearly correct, but the pixel-diff scoring has no way to exclude that region,
  so it silently eats a fixed, fully-explained penalty instead of being told to ignore it.
- The fidelity loop's "one targeted repair" framing assumes a localized issue. On a long,
  multi-section page the real fix for excess document height touched five sections' spacing in one
  pass — the single-issue framing undersells what a repair pass on a dense page actually needs to
  cover.
- Generated product photography reads as visibly generated next to coded UI on a photo-heavy page —
  warmer/more saturated color temperature than the reference, and blank product labels (no attempt
  to render brand text on the bottles, since garbled AI text reads worse than none). This is the
  single biggest remaining "looks generated" tell and has no proposed fix yet.
- `--asset-policy` defaults to `generate`, a change from the previous `crop` default — flagged
  explicitly here since it changes behavior for existing callers who relied on the old default
  without passing the flag explicitly.

## Where to look

- `skills/image-to-code/SKILL.md` — the actual behavior change (Step 1 flag default, Step 2
  grounding instructions, asset materialization, Reference Review).
- `agents/visual-analyst/schema.strict.json` — the strict-mode-compatible schema, new file.
- `skills/image-to-code/scripts/generate-assets.mjs`, `fidelity-loop.mjs` — new scripts.
- `skills/image-to-code/references/icon-system.md` — new, adapted from a sibling project's icon
  vs. image-asset classification guide.
- `evaluation/velvety-product-detail/` — the dense real-world test case: reference screenshot,
  generated HTML + all 10 generated product-photo assets, and the full fidelity report.
- `ARCHITECTURE.md`, `README.md`, `skills/image-to-code/references/visual-eval.md` — updated to
  match.
