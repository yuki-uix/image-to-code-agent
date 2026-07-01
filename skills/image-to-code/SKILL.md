---
name: image-to-code
description: >
  Convert UI screenshots, AI-generated design boards, or clean design bundles
  into HTML, React, or Vue. Design sources may contain page composition, assets, component
  specimens, and design-token cues; the skill materializes them as a reusable
  design package before generating the page. It also supports lightweight direct
  screenshot generation, structured design-system extraction, same-family reuse,
  and artifact validation. No Ollama or local model is required. Use when the
  user asks to turn a screenshot or Codex-generated design image into frontend
  code, extract real design assets, build a design system, reuse a design package,
  generate HTML/React/Vue from an image, or validate image-to-code artifacts.
  Trigger phrases include: "image to code", "screenshot to code", "generate
  React for this", "generate Vue for this", "extract design system", "reuse
  design system", "/image-to-code".
---

# image-to-code

Turn a UI screenshot, design board, or clean design bundle into a controlled frontend workflow:

1. Generate: screenshot to `html`, `react`, or `vue`
2. Package: AI design board to real assets + design system + components
3. Compose: design package to an editable frontend page
4. Extract/Reuse: screenshot-based design-system workflows
5. Validate: check packages, structured artifacts, or page-contract fidelity

This skill is not a smarter model. It is a repeatable workflow with quality knobs. Default to the light Generate path; use Extract, Reuse, and Validate only when their extra token cost is justified.

## Usage

```txt
/image-to-code <image-path> [--framework html|react|vue] [--out <output-path-or-dir>]
/image-to-code <design-input-dir> --source-type design-bundle [--framework html|react|vue] [--out <output-dir>]
/image-to-code <image-path> --source-type design-board [--framework html|react|vue] [--out <output-dir>]
/image-to-code <image-path> --source-type design-board --package-only [--out <output-dir>]
/image-to-code <image-path> --design-package <design-package-dir> [--framework html|react|vue] [--out <output-dir>]
/image-to-code <image-path> --mode structured [--out <output-dir>]
/image-to-code <image-path> --quality safe [--framework html|react|vue] [--out <output-path-or-dir>]
/image-to-code <image-path> --framework html|react|vue --design-system <design-system.json> [--out <output-dir>]
/image-to-code <image-path> --mode structured --design-system <design-system.json> [--out <output-dir>]
```

- `<input-path>` — screenshot file or design-bundle directory; required.
- `--source-type auto|screenshot|design-board|design-bundle` — default: `auto`.
- `--package-only` — for design boards, stop after building and validating `design-package/`.
- `--design-package` — consume an existing package instead of extracting it again.
- `--mode simple|structured` — default: `simple`.
- `--framework html|react|vue` — default: `html`; ignored in structured mode unless writing an optional preview.
- `--quality fast|safe` — default: `fast`; `safe` writes `page-contract.json` and runs contract validation when available.
- `--asset-policy crop|placeholder|none` — default: `crop`.
- `--out` — file path for html simple mode; output directory for react/vue or structured mode.
- `--design-system` — existing `design-system.json` to reuse as visual guidance or update in structured mode.

## Actions

### Package and Compose

Use this path when the input contains reusable visual materials in addition to a page composition. Prefer a clean design bundle; treat flattened boards as fallback.

Input:
- one clean design-bundle directory, design-board image, or existing design package
- optional framework choice

Output:
- `design-package/design-source.json`
- `design-package/page-facts.json`
- `design-package/asset-manifest.json`
- `design-package/design-system.json`
- `design-package/components.json`
- real files under `design-package/assets/`
- generated code under `page/`, unless `--package-only` is used

Read `references/design-source.md` before analyzing or writing files. Build and validate the package before generating page code. Never claim package success when extractable visual regions exist but no real asset files were created.

### Generate

Use Generate when the user wants frontend code now. This is the default and lowest-token path.

Input:
- one screenshot
- optional existing design system
- optional framework choice

Output:
- `html`: one self-contained `.html` file
- `react`: React/TypeScript component files, usually `App.tsx` + `tokens.css`
- `vue`: Vue 3 SFC files, usually `App.vue` + `tokens.css`
- `page-contract.json` only when `--quality safe` or `--design-system` is provided

Success criteria:
- section order matches the screenshot
- all readable visible text is copied verbatim
- colors use exact hex values or token variables derived from exact hex values
- images/photos become proportionally accurate placeholders unless real assets are available
- visible product, hero, and card images are cropped into real assets by default when possible
- micro-components are represented: ratings, badges, tabs, quantity selectors, filters, forms, pagination, etc.
- repeated content uses data arrays
- visual tokens are centralized
- framework-specific code follows that framework’s conventions

Do not promise pixel-perfect output. The goal is faithful, useful frontend code that can be reviewed, copied, or refined. Do not spend tokens on a full page contract in the default fast path unless the page is unusually fragile or the user asks for stronger validation.

### Extract

Use Extract when the user wants to reuse a visual language across screenshots.

Input:
- one screenshot
- optional existing design system

Output directory:

```txt
design-system.json
components.json
page-analysis.json
preview.html        # optional
```

Success criteria:
- extracts reusable colors, typography, spacing, radii, shadows, and component patterns
- separates reusable components from one-off page sections
- identifies repeated components and their props
- records uncertainty instead of inventing exact CSS values
- when an existing design system is provided, merges additively instead of overwriting stable tokens without evidence

Extract is for reuse and consistency, not immediate final-page fidelity.

### Reuse

Use Reuse when the user provides `--design-system` and wants another page in the same design family.

Input:
- current screenshot
- existing `design-system.json`
- framework choice

Output:
- framework code
- current-page assets
- `page-contract.json`

Reuse is the highest-token path. Only use it when the current screenshot belongs to the same brand/design family as the existing design system. The current screenshot supplies facts; the design system supplies visual guidance.

### Validate

Use Validate after Extract or Reuse:

- `scripts/check-structured-output.mjs` validates Extract artifacts.
- `scripts/validate-page-contract.mjs` validates Reuse contract fidelity.
- `scripts/evaluate-reuse.mjs` combines contract validation with design-token reuse stats and a manual review checklist.
- `scripts/validate-design-package.mjs` checks design-board decomposition, required system artifacts, and real materialized asset files.
- `scripts/validate-fact-lock.mjs` rejects contracts that omit source facts or introduce unsupported visible text.
- `scripts/validate-region-coverage.mjs` rejects missing, unknown, or duplicated visual regions.
- `scripts/validate-asset-composition.mjs` rejects unsafe layering, missing image plans, and manifest mismatches.
- `scripts/build-layout-contract.mjs` + `validate-layout-contract.mjs` enforce observed page and region geometry without a model call.
- `scripts/capture-page.mjs` + `visual-diff.py` provide the full-document visual gate; see `references/layout-contract.md` and `references/visual-eval.md`.

Validation is cheap compared with generation; visual review is still required for crop alignment, density, and Reuse value.

## Agent/stage structure
Use these roles as strict stages. They can be implemented inside one Claude Code run, but the responsibilities must not blur.

For design-board or design-bundle input, follow decomposition → asset materialization → system extraction → page composition. The screenshot stages below remain the route for ordinary webpage screenshots.

### Stage 1 — Page Analyst

Input: current screenshot only.

Output: visual audit, `page-facts.json`, and, when needed, `page-contract.json`.

Responsibilities:
- lock current page facts: section order, layout, visible text, nav labels, product data, form labels, footer links, and image/crop regions
- identify unreadable text instead of inventing it
- decide which components are visible on the current page
- keep `inferredText` empty and record unreadable text instead of borrowing component defaults

Do not read reusable component examples as instructions to change the current page.

### Stage 2 — Design System Stylist

Input: optional existing `design-system.json` plus the Page Analyst output.

Output: style plan.

Responsibilities:
- reuse matching colors, typography, spacing, radius, shadows, and component style patterns
- mark local overrides where the screenshot differs from the design system
- never add sections, copy, products, nav labels, crops, or components that are not in `page-contract.json`

### Stage 3 — Code Generator

Input: page contract + style plan + framework target.

Output: `html`, `react`, or `vue` implementation and cropped assets.

Responsibilities:
- generate structure from the page contract
- apply style from the style plan
- use current screenshot crop regions only
- keep repeated content in data arrays

### Stage 4 — Contract Validator

Input: page contract + generated code.

Responsibilities:
- check that required current-screenshot text is present
- check that forbidden previous-page or placeholder text is absent
- repair and rerun validation before reporting success

### Existing design-system boundary

When `--design-system` is provided for simple mode, treat it as visual guidance only.

The current screenshot is always the source of truth for:
- page structure
- section order
- layout proportions
- visible text
- navigation labels
- product names, prices, badges, and ratings
- form labels and placeholders
- image subjects and crop regions
- which components appear on the page

The existing design system may influence only:
- color tokens
- typography choices
- spacing scale
- radius scale
- shadow/elevation style
- reusable component styling patterns such as buttons, cards, badges, ratings, tabs, filters, forms, and footer columns

Never copy page sections, product content, nav labels, crop specs, or page-specific component composition from the design-system source page into the new screenshot’s output. If the screenshot conflicts with the existing design system, the screenshot wins and the conflict should be reported as a local override.

## Step 1 — Parse arguments

Identify:
- input path, file or directory
- source type, defaulting to `auto`
- optional package-only flag or existing design-package path
- mode, defaulting to `simple`
- framework, defaulting to `html`
- output path or directory
- optional existing design-system path
- quality, defaulting to `fast`
- asset policy, defaulting to `crop`

If the image path is missing, ask for it.

If the requested framework is not `html`, `react`, or `vue`, ask the user to choose one of those for now.

If `--source-type design-bundle` is selected or the input path is a directory, read `references/design-input.md` and run `scripts/validate-design-input.mjs` before model-heavy work.

If `--source-type design-board` is selected or auto-detected, read `references/design-source.md` and follow it before the screenshot workflow below. A supplied `--design-package` skips source decomposition and asset extraction, but the package must still pass validation.

For framework and reusable component output requirements, read `references/framework-output.md` and `references/component-output.md` before writing files.

For structured-mode artifact requirements, read `references/structured-output.md` before writing JSON files.

For simple mode with `--quality safe` or `--design-system`, read `references/page-contract.md` before writing code.

For safe, design-board, design-bundle, or design-package runs, read `references/page-facts.md` before writing `page-contract.json`.

Read `references/region-coverage.md` when writing page regions, contract coverage, and generated-code markers.
Read `references/asset-composition.md` before placing design-package assets in page regions.
Read `references/layout-contract.md` for safe page generation and geometry validation.

## Step 2 — Visual audit before writing files

For design-board input, replace this screenshot audit with the source decomposition defined in `references/design-source.md`. Explicitly separate page layout, extractable assets, component references, token references, and ignored annotations.

Read the image and produce a concise working audit before generating code or JSON. The audit should cover:

### Color palette

List exact hex values for:
- page background
- section backgrounds
- surface/card backgrounds
- primary text
- secondary/muted text
- accent color
- borders/dividers
- special states such as sale, active tab, badge, rating, or CTA color

### Section inventory

List sections from top to bottom. For each:
- section name
- background color
- layout type: flex row, flex column, grid, split hero, sidebar + content, overlay, etc.
- key children/components
- whether it is reusable or page-specific

### Text inventory

Copy all readable visible text verbatim:
- brand name
- navigation
- headlines
- body copy
- card titles/descriptions
- button labels
- prices
- badges
- form labels/placeholders
- footer text

If text is unreadable, mark it as `unreadable` and avoid inventing copy.

### Photo and illustration inventory

For each real image:
- approximate aspect ratio
- position and size
- dominant color
- subject type
- shape/radius

Use proportionally accurate color placeholders unless real assets are available.

### Micro-components

Identify small elements such as:
- star ratings
- price + strikethrough
- discount badges
- tab controls
- filters/chips
- quantity selectors
- radio/checkboxes
- pagination
- icon buttons
- forms
- maps

### Design tokens

Extract the page’s implicit design system:
- font family/classification
- heading scale
- body scale
- label style
- spacing unit
- section padding
- card padding
- grid gap
- button height
- radius scale
- shadow/elevation

When using an existing design system, compare the screenshot against it and state whether each token should be reused, extended, or locally overridden.

For simple mode with `--design-system`, do not let this comparison change the page inventory. Reuse tokens and component styling only after the current screenshot’s structure, text inventory, and crop inventory are complete.

## Step 3A — Simple mode page contract

When `--quality safe` or `--design-system` is provided, write `page-facts.json`, then derive `page-contract.json` before generating code. Follow `references/page-facts.md` and `references/page-contract.md`.

The contract must include:
- `meta.pageType` using the page-contract reference enum, such as `collection`, `product-detail`, `cart`, `editorial`, or `marketing`
- ordered sections
- nav/header labels
- all readable page-specific headings and body text
- repeated product/card data for every visible card: names, subtitles, prices, original prices, badges, ratings
- filter groups: headings and all visible option labels
- newsletter content: heading, supporting text, input placeholder, CTA label
- form labels/placeholders and CTA labels
- footer headings and visible links
- crop regions from the current screenshot, including `assetPath` and `mustCrop: true` for real product/hero/card/lifestyle photos
- focused `forbiddenText` for previous-page facts that must not appear

Do not proceed to code generation until the contract represents the current screenshot rather than the design-system source page.

Run `scripts/validate-fact-lock.mjs` before generation. Repair the contract if it introduces text not present in page facts or omits visible source facts.

Run `scripts/validate-region-coverage.mjs` before generation. Every required page region must map exactly once into `regionCoverage`.
Run `scripts/validate-asset-composition.mjs` before generation; do not layer opaque assets above another image.
Build `layout-contract.json` from page facts before generation; treat its section and region bboxes as CSS constraints.

Do not summarize repeated visual facts. If the screenshot shows 8 product cards, the contract should list 8 products. If it shows 4 footer columns, the contract should list the visible heading and links for all 4 columns. A weak contract will let incorrect output pass validation.

## Step 3B — Simple mode style plan

When `--design-system` is provided, create a concise style plan after the page contract.

The style plan may reuse:
- color tokens
- type scale and font classification
- spacing/radius/shadow rhythm
- component visual styling

The style plan may not change:
- page layout
- section order
- visible text
- product data
- crop regions
- whether a component appears

## Step 3C — Simple mode code generation

Generate framework-specific code using `references/framework-output.md`.

Shared rules:
- keep visible text real; never use placeholders like `Lorem ipsum`, `Service 1`, `Card Title`, `Product Name`, or `Description goes here`
- do not use emoji as product/photo placeholders
- crop visible image regions into `assets/` whenever `--asset-policy crop` is used and cropping is feasible
- use exact colors or token variables
- centralize tokens in `:root`, `tokens.css`, or framework-appropriate CSS
- use data arrays for repeated cards, products, nav items, testimonials, services, etc.
- section components handle layout
- leaf components render content
- avoid rendering the same visual area twice as both a container and a peer component
- do not invent routes, nav links, products, or copy not visible in the image
- preserve the visual mass of major product/photo placeholders instead of shrinking them into tiny icons
- size sections, grids, and media against `layout-contract.json` when present
- match visible brand typography cues, especially for luxury, skincare, editorial, SaaS, food, and playful retail categories
- report approximations for unavailable imagery, unreadable text, simplified icons, and invented-looking details
- for safe/design-source runs, emit one literal `data-source-region` marker per coverage entry and declare repeated-group cardinality

If `--design-system` is provided:
- use it only after the screenshot audit and page contract are complete
- use it to name and stabilize tokens, not to replace the screenshot’s layout
- keep the current screenshot’s header/nav/footer labels unless they are unreadable
- keep the current screenshot’s product/card data instead of copying examples from the design system
- crop assets from the current screenshot only
- prefer local overrides when current screenshot evidence differs from the design system

Framework expectations:
- `html` output is zero-config and opens directly in a browser.
- `react` output is framework code for an existing React project, not a full app scaffold unless the user asks.
- `vue` output is framework code for an existing Vue project, not a full app scaffold unless the user asks.
- If real image assets are cropped, output a directory containing code plus `assets/` rather than a single bare file unless the user explicitly requests a single-file fallback.

## Step 3D — Structured mode artifacts

Write JSON artifacts instead of final framework code. Follow `references/structured-output.md`.

Required artifacts:
- `design-system.json` for reusable visual tokens
- `components.json` for reusable component patterns
- `page-analysis.json` for page-specific structure, visible text, and approximations

Optional artifact:
- `preview.html` to demonstrate the extracted design system

When updating an existing design system, preserve stable tokens, add variants, record conflicts, and keep page-specific details out of reusable artifacts.

## Step 4 — Quality gates

Before finishing, check:

- The requested mode’s required files exist.
- Framework output follows the chosen framework’s conventions.
- HTML output includes React, ReactDOM, Babel, Tailwind CDN, `#root`, and `type="text/babel"`.
- React/Vue output uses valid framework files, reusable components, `component-manifest.json`, and passes component validation.
- All readable visible text is represented.
- No generic placeholder copy remains.
- Colors use exact hex values or token variables derived from exact hex values.
- Repeated components use data arrays.
- Structured JSON is valid and separates design-system tokens, reusable components, and page-specific analysis.
- Structured output can be checked with `scripts/check-structured-output.mjs` when available.
- If an existing design system was provided in simple mode, `page-contract.json` exists and the output preserves the current screenshot’s layout, text, and assets.
- If `scripts/validate-page-contract.mjs` is available, run it before reporting success for simple mode with `--design-system`.
- If `scripts/evaluate-reuse.mjs` is available, use it after Reuse runs when the user is comparing design-system value.
- If an existing design system was provided in structured mode, updates are additive and conflicts are noted.
- Design-board runs contain `design-package/design-source.json`, `page-facts.json`, `asset-manifest.json`, `design-system.json`, and `components.json`.
- `scripts/validate-fact-lock.mjs` passes before code generation for safe, design-board, design-bundle, and design-package runs.
- Region coverage validation passes before generation, and generated output contains exactly one marker for every required source region.
- Asset composition validation passes and output markers preserve declared mode, fit, layers, and asset paths.
- Safe HTML runs capture DOM measurements, pass layout validation, and compare visually; failure permits at most one targeted repair.
- Every design-package manifest asset points to a real non-empty file inside the package.
- `scripts/validate-design-package.mjs` passes before a design-board page is generated or reported complete.

## Step 5 — Report

Tell the user:
- what mode ran
- what framework was generated, if applicable
- output path(s)
- what was generated
- what was approximate
- whether an existing design system was used or updated
- whether the source was treated as a screenshot or a design board
- how many real reusable assets were materialized, when a design package was built

## Non-goals

- This skill does not guarantee pixel-perfect reproduction from one screenshot.
- It does not require Ollama, qwen, or local models.
- It does not run npm install or create a full React/Vue project unless the user explicitly asks.
- It does not guarantee perfect crop alignment for real image assets.
- It does not turn editable text or UI controls into bitmap assets merely because they appear on a design board.
- It does not replace human review for production UI.
