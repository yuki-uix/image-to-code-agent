---
name: image-to-code
description: >
  A disciplined screenshot-to-frontend-code workflow. In simple mode, converts a
  UI screenshot into frontend code for html, react, or vue. The default html
  framework creates a self-contained browser-ready preview using React 18,
  Tailwind CDN, and Babel; react and vue outputs are framework code intended to
  be copied into an existing project. In structured mode, extracts reusable
  design-system artifacts from a screenshot for future screenshots and
  framework-specific generation. No Ollama, no local model, no build step
  required for the default html output. Use when the user asks to turn a
  screenshot into code, recreate a design, generate HTML/React/Vue from an
  image, extract a design system from a screenshot, or reuse a design system for
  another page. Trigger phrases include: "image to code", "screenshot to code",
  "generate React for this", "generate Vue for this", "extract design system",
  "/image-to-code".
---

# image-to-code

Turn a UI screenshot into either:

1. frontend code for `html`, `react`, or `vue`, or
2. reusable design-system artifacts for future pages.

This skill is not a smarter model. It is a repeatable workflow with quality gates: visual audit first, real text, exact color tokens, clear section structure, framework-aware output, centralized design tokens, and optional design-system reuse.

## Usage

```txt
/image-to-code <image-path> [--framework html|react|vue] [--out <output-path-or-dir>]
/image-to-code <image-path> --mode structured [--out <output-dir>]
/image-to-code <image-path> --framework react --design-system <design-system.json> [--out <output-dir>]
/image-to-code <image-path> --framework vue --design-system <design-system.json> [--out <output-dir>]
/image-to-code <image-path> --mode structured --design-system <design-system.json> [--out <output-dir>]
```

- `<image-path>` — screenshot path; required.
- `--mode simple|structured` — default: `simple`.
- `--framework html|react|vue` — default: `html`; ignored in structured mode unless writing an optional preview.
- `--asset-policy crop|placeholder|none` — default: `crop`.
- `--out` — file path for html simple mode; output directory for react/vue or structured mode.
- `--design-system` — existing `design-system.json` to reuse as visual guidance or update in structured mode.

Keep the default experience zero-config: one image in, one browser-openable HTML file out.

## Modes

### Simple mode

Use simple mode when the user wants frontend code now.

Input:
- one screenshot
- optional existing design system
- optional framework choice

Output:
- `html`: one self-contained `.html` file
- `react`: React/TypeScript component files, usually `App.tsx` + `tokens.css`
- `vue`: Vue 3 SFC files, usually `App.vue` + `tokens.css`
- `page-contract.json` when `--design-system` is provided, to lock current screenshot facts before styling

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

Do not promise pixel-perfect output. The goal is faithful, useful frontend code that can be reviewed, copied, or refined.

### Structured mode

Use structured mode when the user wants to reuse a visual language across screenshots.

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

Structured mode is for reuse and consistency, not immediate final-page fidelity.

## Agent/stage structure

Use these roles as strict stages. They can be implemented inside one Claude Code run, but the responsibilities must not blur.

### Stage 1 — Page Analyst

Input: current screenshot only.

Output: visual audit and, when needed, `page-contract.json`.

Responsibilities:
- lock current page facts: section order, layout, visible text, nav labels, product data, form labels, footer links, and image/crop regions
- identify unreadable text instead of inventing it
- decide which components are visible on the current page

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
- image path
- mode, defaulting to `simple`
- framework, defaulting to `html`
- output path or directory
- optional existing design-system path
 - asset policy, defaulting to `crop`

If the image path is missing, ask for it.

If the requested framework is not `html`, `react`, or `vue`, ask the user to choose one of those for now.

For framework-specific output requirements, read `references/framework-output.md` before writing files.

For structured-mode artifact requirements, read `references/structured-output.md` before writing JSON files.

For simple mode with `--design-system`, read `references/page-contract.md` before writing code.

## Step 2 — Visual audit before writing files

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

When `--design-system` is provided, write `page-contract.json` before generating code. Follow `references/page-contract.md`.

The contract must include:
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
- match visible brand typography cues, especially for luxury, skincare, editorial, SaaS, food, and playful retail categories
- report approximations for unavailable imagery, unreadable text, simplified icons, and invented-looking details

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
- React output uses valid TypeScript/TSX conventions and exports a root component.
- Vue output uses a valid Vue 3 SFC structure.
- All readable visible text is represented.
- No generic placeholder copy remains.
- Colors use exact hex values or token variables derived from exact hex values.
- Repeated components use data arrays.
- Structured JSON is valid and separates design-system tokens, reusable components, and page-specific analysis.
- Structured output can be checked with `scripts/check-structured-output.mjs` when available.
- If an existing design system was provided in simple mode, `page-contract.json` exists and the output preserves the current screenshot’s layout, text, and assets.
- If `scripts/validate-page-contract.mjs` is available, run it before reporting success for simple mode with `--design-system`.
- If an existing design system was provided in structured mode, updates are additive and conflicts are noted.

## Step 5 — Report

Tell the user:
- what mode ran
- what framework was generated, if applicable
- output path(s)
- what was generated
- what was approximate
- whether an existing design system was used or updated

## Non-goals

- This skill does not guarantee pixel-perfect reproduction from one screenshot.
- It does not require Ollama, qwen, or local models.
- It does not run npm install or create a full React/Vue project unless the user explicitly asks.
- It does not guarantee perfect crop alignment for real image assets.
- It does not replace human review for production UI.
