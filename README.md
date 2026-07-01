# image-to-code

A Claude Code workflow for turning AI-generated design sources into reusable, validated frontend packages—with screenshot-to-HTML as a fast preview path.

The primary product path accepts a clean design bundle or an AI-generated design board, preserves its real assets and design language, and composes editable HTML, React, or Vue code. React and Vue outputs materialize reusable component files, props, variants, data, tokens, and manifests instead of flattening the result into one page component.

This is not a new image model or a “pixel-perfect page from one screenshot” promise. It is a controlled channel between design and code: observable intermediate artifacts, deterministic contracts, inexpensive validation, and human review only where visual judgment is still necessary.

For production-oriented work, prefer a clean design bundle containing a page reference plus separate assets. A flattened design board is supported as a packaging fallback, while an ordinary screenshot can still generate a lightweight browser preview.

The workflow does not require Ollama, Qwen, or any other local-model runtime. The default HTML output also requires no npm install, framework install, or build step.

## What is this tool?

Use it through two routes:

1. **Design package route — primary:** `design bundle / design board → Package → Compose → Validate`
2. **Screenshot route — fast path:** `screenshot → Generate`, with optional Extract and Reuse for same-family pages

The available actions are:

| Action | Input | Output | Token cost | Use when |
|---|---|---|---|---|
| Package | clean design bundle or AI board | `design-package/` with real assets, tokens, facts, and component contracts | medium/high | you want reusable design materials |
| Compose | `design-package/` | editable `html`, `react`, or `vue` | medium | you want code built from approved materials |
| Validate | generated artifacts | JSON reports and visual-eval artifacts | low | you want deterministic quality gates |
| Generate | screenshot | `html`, `react`, or `vue` + optional `assets/` | low | you need a quick one-page implementation |
| Extract | screenshot | `design-system.json`, `components.json`, `page-analysis.json` | medium/high | you want to reuse a visual system later |
| Reuse | screenshot + `design-system.json` | code + `page-contract.json` + assets | high | you are building multiple pages in the same design family |

Use Package → Compose → Validate whenever reusable assets or a design system are part of the input. Default ordinary one-off screenshots to Generate. Use Extract only when a screenshot is your sole design-system source, and Reuse only for pages that genuinely belong to the same design family.

## Why not just ask Claude/Codex directly?

Claude Code and Codex can already generate code from an image. This skill is useful because it turns one-off generation into a repeatable workflow with reusable outputs.

### What value does this skill add?

Direct prompting gives you a one-time result. This workflow preserves real assets, design tokens, component contracts, page facts, and layout geometry between design and code. It is not trying to be a smarter model—it makes the model's work reusable, inspectable, and testable.

### How is this different from existing image-to-code tools?

Most image-to-code flows focus on recreating the current screenshot. This workflow can first produce a durable `design-package/`, then compose framework code from that controlled source. React and Vue outputs are checked against an executable component contract rather than accepted as a monolithic visual approximation.

### When should I use it?

Use direct model prompting if you only need an informal one-off snippet. Use this workflow when you want reusable assets and components, framework-specific delivery, traceable design decisions, and deterministic quality checkpoints.

In short: Package → Compose → Validate is the product path; Generate is the lightweight preview path.

## Project status

Current state: validated pipeline MVP. Generate, Package, Compose, Extract, and Validate are usable today. The clean design-bundle route has passed an end-to-end product-detail run, including reusable React/Vue component validation; broader page-family testing and direct cross-page component-library imports remain in progress. Screenshot-based Reuse remains experimental.

### Already done

- Project-local `/image-to-code` command covering Generate, Package, Compose, Extract, Reuse, and Validate.
- Default HTML output that opens directly in a browser; React and Vue output contracts for existing projects.
- Real asset workflow: `--asset-policy generate` (default) asks the Codex-managed imagegen channel for a fresh image per region — the right default when the screenshot isn't your own asset library; `--asset-policy crop` remains available with its deterministic crop helper for when you do own the source pixels.
- Visual Analyst grounding runs via a dispatched sub agent shelling out to `codex exec -m gpt-5.5` against this repo's existing `agents/visual-analyst/schema.json` — keeps the model's raw output out of the orchestrating session's context, and gives denser/more consistent element coverage than an ad hoc look at the image.
- Fidelity loop (`scripts/fidelity-loop.mjs`) gets a dual-critique Reference Review tier: one pass from a Codex sub agent, one pass from the orchestrating agent's own reading of the comparison image, shown side by side rather than merged into a single score.
- Structured-mode artifacts: `design-system.json`, `components.json`, and `page-analysis.json`.
- Design-system reuse path with `page-contract.json`, so the target screenshot remains the source of truth.
- Validation helpers for structured artifacts, page contracts, reuse checks, required text, forbidden text, cropped assets, and design-color reuse.
- Visual Eval v2 with full-document Chrome capture, page-reference cropping, overlay/diff artifacts, lightweight similarity scoring, and a one-repair limit.
- Same-brand VELVETY test series used to compare Generate, Extract, and Reuse behavior across product-detail, collection, and editorial/about pages.
- Design-board input contract with explicit separation of page layout, real assets, component references, token evidence, and ignored annotations.
- Design-package validator that rejects missing files, unsafe asset paths, and extractable regions that were never materialized.
- Page fact lock that requires `page-facts.json → page-contract.json → code` and rejects invented prices, footer copy, labels, or omitted visible facts before generation.
- Region coverage contract that maps every required visual area exactly once and verifies generated `data-source-region` markers and repeated-group counts.
- Asset composition contract for single, background, and layered media, including fit, aspect ratio, transparent-overlay, z-index, and generated marker validation.
- First-class `design-bundle` directory input and a zero-model preflight validator for page reference, separate assets, optional manifest metadata, file safety, dimensions, and transparency claims.
- Layout contract derived from observed bboxes, plus DOM geometry capture and deterministic validation for viewport, document height, region position, size, and repeated counts.
- Executable React/Vue component contract with independent component files, registry mappings, preserved props/variants, and data-driven repeated rendering.
- Zero local-model dependency: no Ollama, Qwen, provider client, or model-download step remains in the production workflow.

### TODO / next milestones

- Add `--component-library` so later React/Vue pages import previously generated component code instead of regenerating it from the same contract.
- Keep screenshot-based Reuse marked as advanced/experimental until it passes more page families and page types.
- Improve crop precision and add stronger visual crop validation, not just asset existence checks.
- Strengthen page-contract extraction so generated contracts capture all visible target-page facts before reuse begins.
- Add per-stage timing traces to distinguish hosted-model generation latency from local packaging and deterministic validation.
- Expand same-brand test suites and require with-system vs no-system comparisons for reuse regressions.
- Reduce token cost by keeping Generate light by default and putting heavier extraction, reuse, and visual checks behind explicit flags.
- Polish installation and packaging so a new user can run the workflow from any project with minimal setup.
- Forward-test the clean design-bundle route across collection, editorial, and responsive page references.
- Add mask/background-removal support for assets that cannot be cleanly represented by rectangular crops. Partially addressed by defaulting to `generate`: a generated asset isn't bound to the source screenshot's rectangular pixels at all, so occluded/missing/wrong-aspect regions no longer need a crop workaround — but true transparent-background matting for generated output is still a separate, unaddressed need.
- The Codex-vision / Sonnet-reasoning `ModelClient` split (a portable TypeScript client usable outside Claude Code entirely) is deferred/optional — today's grounding and critique improvements assume the skill runs inside a Claude Code session that can dispatch sub agents and shell out to `codex exec` directly; build the standalone client only if a non-Claude-Code runtime becomes a real requirement.

## Quick start

Start Claude Code from the repo root:

```sh
cd /path/to/image-to-code-agent
claude
```

Generate a browser-openable HTML preview:

```txt
/image-to-code /path/to/screenshot.png --framework html --out ./output/page
```

Open it:

```sh
open ./output/page/index.html
```

Build a reusable package and page from an AI-generated design board:

```txt
/image-to-code /path/to/design-board.png --source-type design-board --framework html --out ./output/design-board-run
```

Preferred: build from a clean design bundle:

```txt
/image-to-code /path/to/design-input --source-type design-bundle --framework html --out ./output/design-bundle-run
```

Build only the materials package:

```txt
/image-to-code /path/to/design-board.png --source-type design-board --package-only --out ./output/brand-package
```

Compose another page from an existing package:

```txt
/image-to-code /path/to/page-composition.png --design-package ./output/brand-package/design-package --framework react --out ./output/react-page
```

Generate React or Vue instead:

```txt
/image-to-code /path/to/screenshot.png --framework react --out ./output/react-page
/image-to-code /path/to/screenshot.png --framework vue --out ./output/vue-page
```

Add a page-contract checkpoint when you want stronger drift control:

```txt
/image-to-code /path/to/screenshot.png --framework html --quality safe --out ./output/page-safe
```

## Skills

This repo currently ships two Claude Code skills.

### `/image-to-code`

Main entry point.

#### Package and Compose: design board → materials → page

Use this route when a Codex- or ChatGPT-generated image includes not only a page mockup but also reusable photos, illustrations, textures, logos, component specimens, or token examples.

```txt
/image-to-code path/to/design-board.png --source-type design-board --framework html --out ./generated-board
/image-to-code path/to/design-board.png --source-type design-board --package-only --out ./generated-package
/image-to-code path/to/page.png --design-package ./generated-package/design-package --framework vue --out ./generated-vue
```

Package output:

```txt
design-package/
  design-source.json
  page-facts.json
  asset-manifest.json
  design-system.json
  components.json
  assets/
```

The package is a first-class deliverable. `asset-manifest.json` must reference real files; editable text and controls remain code rather than bitmap crops.

#### Generate: screenshot → code

Default action. Converts a screenshot into frontend code with the least process overhead.

```txt
/image-to-code path/to/screenshot.jpg
/image-to-code path/to/screenshot.jpg --framework html --out output.html
/image-to-code path/to/screenshot.jpg --framework react --out ./generated-react
/image-to-code path/to/screenshot.jpg --framework vue --out ./generated-vue
/image-to-code path/to/screenshot.jpg --framework html --asset-policy generate --out ./generated-html
/image-to-code path/to/screenshot.jpg --framework html --asset-policy crop --out ./generated-html
/image-to-code path/to/screenshot.jpg --framework html --quality safe --out ./generated-safe-html
```

Framework outputs:

| Framework | Output | Intended use |
|---|---|---|
| `html` | `index.html`, optional `assets/` | open directly in a browser |
| `react` | `src/App.tsx`, reusable `components/`, sections, data, tokens, manifest, assets | copy into an existing React project |
| `vue` | `src/App.vue`, reusable `components/`, sections, data, tokens, manifest, assets | copy into an existing Vue project |

HTML remains the default because it is the lowest-friction preview path. Design-package React and Vue outputs must materialize reusable registered components, but are not full project scaffolds unless explicitly requested.

By default, the skill generates a fresh, license-clean image per required region via the Codex-managed imagegen channel (`--asset-policy generate`) — the screenshot is a design reference, not necessarily an asset library you have rights to lift pixels from. Use `--asset-policy crop` when you do own the source image and a clean, unobstructed region exists to lift verbatim. CSS placeholders are a fallback for neither case, or when `--asset-policy placeholder` is explicitly requested.

Generate quality bar:

- section order matches the screenshot
- readable visible text is copied verbatim
- exact hex colors or token variables
- centralized visual tokens
- real cropped assets for visible product, hero, gallery, and card images when possible
- proportional placeholders only as fallback
- repeated content represented as data arrays
- no generic placeholder copy
- explicit approximation notes for unavailable imagery or unreadable text

Generate does not force a full `page-contract.json` by default. That keeps token usage lower.

#### Extract: screenshot → design system

Extracts reusable design-system artifacts from a screenshot.

```txt
/image-to-code path/to/screenshot.jpg --mode structured --out ./design-system
```

Output:

```txt
design-system.json
components.json
page-analysis.json
preview.html        # optional
```

Artifact responsibilities:

- `design-system.json` stores reusable visual tokens only.
- `components.json` stores reusable component patterns.
- `page-analysis.json` stores the current page structure, visible text, image placeholders, and approximations.

Structured mode is for building reusable design language across screenshots:

- color palette
- typography scale
- spacing scale
- radius/shadow/elevation
- reusable components
- page-specific sections
- visible text inventory
- approximations and uncertainty notes

#### Reuse: screenshot + design system → same-family code

Generate framework code using an existing design system. Use this only for pages that belong to the same brand/design family.

```txt
/image-to-code path/to/next-page.jpg --framework html --design-system ./design-system/design-system.json --out ./next-html
/image-to-code path/to/next-page.jpg --framework react --design-system ./design-system/design-system.json --out ./next-react
/image-to-code path/to/next-page.jpg --framework vue --design-system ./design-system/design-system.json --out ./next-vue
```

Reuse creates or should create `page-contract.json` so the current screenshot remains the source of truth. The existing design system may influence colors, typography, spacing, radius, shadows, and component styling. It must not overwrite current-page facts such as product names, prices, nav labels, crop regions, or section order.

Update an existing design system with another screenshot:

```txt
/image-to-code path/to/next-page.jpg --mode structured --design-system ./design-system/design-system.json --out ./design-system
```

The skill should merge additively: preserve stable tokens, add variants, and record conflicts instead of silently overwriting the system.

---

### `/validate-html`

Auxiliary skill for checking generated HTML.

```txt
/validate-html path/to/output.html
/validate-html path/to/output.html --fix
```

It checks for:

- JSX syntax issues
- missing React/Tailwind/Babel CDN tags
- missing `#root`
- wrong Babel script type
- undefined component names
- placeholder text
- obvious structural problems

It does not validate React/Vue project code and does not compare the page visually against the original screenshot.

#### Validate: check artifacts

The image-to-code skill includes small deterministic helpers:

```txt
skills/image-to-code/scripts/crop-assets.mjs
skills/image-to-code/scripts/check-structured-output.mjs
skills/image-to-code/scripts/validate-page-contract.mjs
skills/image-to-code/scripts/evaluate-reuse.mjs
skills/image-to-code/scripts/validate-design-package.mjs
skills/image-to-code/scripts/validate-fact-lock.mjs
skills/image-to-code/scripts/validate-region-coverage.mjs
skills/image-to-code/scripts/validate-asset-composition.mjs
skills/image-to-code/scripts/build-layout-contract.mjs
skills/image-to-code/scripts/validate-layout-contract.mjs
skills/image-to-code/scripts/validate-framework-components.mjs
skills/image-to-code/scripts/capture-page.mjs
skills/image-to-code/scripts/visual-diff.py
skills/image-to-code/scripts/validate-design-input.mjs
```

- `crop-assets.mjs` crops real image regions from a screenshot into `assets/`.
- `check-structured-output.mjs` validates the minimum structured-mode JSON contract.
- `validate-page-contract.mjs` checks that generated code preserves current-screenshot text facts and required cropped assets.
- `evaluate-reuse.mjs` combines page-contract validation with design-token reuse stats and a manual review checklist.
- `validate-design-package.mjs` verifies design-board decomposition and requires materialized, package-local asset files.
- `validate-fact-lock.mjs` verifies that a page contract contains only observed page text and omits none of the locked visible facts.
- `validate-region-coverage.mjs` detects omitted, unknown, duplicated, and cardinality-mismatched page regions before generation.
- `validate-asset-composition.mjs` rejects opaque overlay layers, unknown assets, missing image plans, path mismatches, and invalid fit/aspect declarations.
- `build-layout-contract.mjs` converts observed page-fact bboxes into low-token geometry constraints.
- `validate-layout-contract.mjs` compares captured DOM geometry with the target viewport, document, and region tolerances.
- `validate-framework-components.mjs` verifies that React/Vue outputs materialize, reuse, and render registered components instead of producing a monolithic page.
- `capture-page.mjs` captures the complete rendered document and optional DOM region measurements through local Chrome DevTools.
- `visual-diff.py` crops the source page reference, writes overlay/diff artifacts, and reports dimension, color, structure, and worst-tile scores.
- `validate-design-input.mjs` performs a zero-model preflight on clean page-reference and asset directories.

Validate structured output:

```sh
node skills/image-to-code/scripts/check-structured-output.mjs ./output/design-system
```

Validate a clean design input before spending model tokens:

```sh
node skills/image-to-code/scripts/validate-design-input.mjs /path/to/design-input
```

Validate a Reuse output when `page-contract.json` exists:

```sh
node skills/image-to-code/scripts/validate-page-contract.mjs ./output/page/page-contract.json ./output/page
```

Validate reusable React/Vue component output:

```sh
node skills/image-to-code/scripts/validate-framework-components.mjs \
  react \
  ./output/design-package/components.json \
  ./output/page/page-contract.json \
  ./output/page/component-manifest.json \
  ./output/page
```

Evaluate a Reuse run:

```sh
node skills/image-to-code/scripts/evaluate-reuse.mjs \
  --design-system ./output/design-system/design-system.json \
  --contract ./output/page/page-contract.json \
  --output ./output/page
```

Validate a design package:

```sh
node skills/image-to-code/scripts/validate-design-package.mjs ./output/design-board-run/design-package
```

Validate page facts before generation:

```sh
node skills/image-to-code/scripts/validate-fact-lock.mjs \
  ./output/design-board-run/design-package/page-facts.json \
  ./output/design-board-run/page/page-contract.json
```

Validate region completeness before generation:

```sh
node skills/image-to-code/scripts/validate-region-coverage.mjs \
  ./output/design-board-run/design-package/page-facts.json \
  ./output/design-board-run/page/page-contract.json
```

Validate asset composition before generation:

```sh
node skills/image-to-code/scripts/validate-asset-composition.mjs \
  ./output/design-board-run/design-package/asset-manifest.json \
  ./output/design-board-run/page/page-contract.json
```

Build deterministic geometry constraints before generation:

```sh
node skills/image-to-code/scripts/build-layout-contract.mjs \
  ./output/design-board-run/design-package/page-facts.json \
  ./output/design-board-run/page/layout-contract.json
```

Capture and compare a generated HTML page:

```sh
node skills/image-to-code/scripts/capture-page.mjs \
  --html ./output/design-board-run/page/index.html \
  --out ./output/design-board-run/visual-eval/actual.png \
  --width 592 --height 1024 \
  --measurements ./output/design-board-run/visual-eval/layout-measurements.json

node skills/image-to-code/scripts/validate-layout-contract.mjs \
  ./output/design-board-run/page/layout-contract.json \
  ./output/design-board-run/visual-eval/layout-measurements.json

python3 skills/image-to-code/scripts/visual-diff.py \
  --reference /path/to/design-board.png \
  --design-source ./output/design-board-run/design-package/design-source.json \
  --actual ./output/design-board-run/visual-eval/actual.png \
  --out ./output/design-board-run/visual-eval
```

For visual quality, use the checklist in `skills/image-to-code/references/visual-eval.md`. The evaluator intentionally does not claim pixel-perfect scoring; it standardizes what a human should inspect: layout, crop quality, density, typography, design-system consistency, and with-system vs no-system comparison.

## Installation

There are two ways to use this repo.

### Project-local slash commands

This repo includes Claude Code command wrappers:

```txt
.claude/commands/image-to-code.md
.claude/commands/validate-html.md
```

If you start Claude Code from this repo root, the commands should be available as:

```txt
/image-to-code path/to/screenshot.jpg --framework react --out ./generated-react
/validate-html path/to/output.html
```

If a command does not appear immediately, restart Claude Code from the repo root. Claude Code discovers project commands from `.claude/commands/` and skills from `.claude/skills/`.

### Personal install across projects

To use the skills from any project, copy them into your personal Claude Code skills directory:

```sh
mkdir -p ~/.claude/skills
cp -R skills/image-to-code ~/.claude/skills/image-to-code
cp -R skills/validate-html ~/.claude/skills/validate-html
```

Then restart Claude Code or open a new session. Personal skills become available as:

```txt
/image-to-code
/validate-html
```

You can also invoke the skill manually without installing it:

```txt
Use the skill at /path/to/image-to-code-agent/skills/image-to-code/SKILL.md.
Convert /path/to/screenshot.jpg with framework react and write output to ./generated-react.
```

## Scope

The current validated-pipeline MVP is:

| Action | Input | Output | Goal |
|---|---|---|---|
| Package | clean design bundle or AI design board | real assets + facts + manifests + system artifacts | reusable design source |
| Compose + html | design package + optional page reference | HTML + assets | browser-openable implementation |
| Compose + react | design package + optional page reference | React components + data + tokens + assets | reusable React delivery |
| Compose + vue | design package + optional page reference | Vue components + data + tokens + assets | reusable Vue delivery |
| Validate | generated artifacts and rendered page | JSON reports + layout/visual artifacts | deterministic quality gates |
| Generate | screenshot | HTML/React/Vue + optional assets | lightweight one-page implementation |
| Extract | screenshot | JSON artifacts | reusable design system |
| Reuse | screenshot + `design-system.json` | code + `page-contract.json` + assets | same-family visual consistency |

Browser capture, layout-contract validation, overlays, and visual diffs are implemented. They provide evidence for review, not a claim of automatic pixel-perfect convergence.

The current component promise is deliberately precise: a single React/Vue output contains reusable, independently materialized components. A later page can reuse the same design package and component contract, but importing the exact previously generated component implementation is not guaranteed until `--component-library` is complete.

## Development history

The `src/` directory retains framework-level contracts, normalization, repair, validation, and replay-test infrastructure from the earlier multi-agent experiments. The production-facing deliverable is the `skills/` directory; no local-model runtime or provider-specific CLI remains in the repository.
