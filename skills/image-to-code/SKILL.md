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
- `--out` — file path for html simple mode; output directory for react/vue or structured mode.
- `--design-system` — existing `design-system.json` to reuse or update.

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

Success criteria:
- section order matches the screenshot
- all readable visible text is copied verbatim
- colors use exact hex values or token variables derived from exact hex values
- images/photos become proportionally accurate placeholders unless real assets are available
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

## Step 1 — Parse arguments

Identify:
- image path
- mode, defaulting to `simple`
- framework, defaulting to `html`
- output path or directory
- optional existing design-system path

If the image path is missing, ask for it.

If the requested framework is not `html`, `react`, or `vue`, ask the user to choose one of those for now.

For framework-specific output requirements, read `references/framework-output.md` before writing files.

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

## Step 3A — Simple mode code generation

Generate framework-specific code using `references/framework-output.md`.

Shared rules:
- keep visible text real; never use placeholders like `Lorem ipsum`, `Service 1`, `Card Title`, `Product Name`, or `Description goes here`
- do not use emoji as product/photo placeholders
- use exact colors or token variables
- centralize tokens in `:root`, `tokens.css`, or framework-appropriate CSS
- use data arrays for repeated cards, products, nav items, testimonials, services, etc.
- section components handle layout
- leaf components render content
- avoid rendering the same visual area twice as both a container and a peer component
- do not invent routes, nav links, products, or copy not visible in the image

Framework expectations:
- `html` output is zero-config and opens directly in a browser.
- `react` output is framework code for an existing React project, not a full app scaffold unless the user asks.
- `vue` output is framework code for an existing Vue project, not a full app scaffold unless the user asks.

## Step 3B — Structured mode artifacts

Write JSON artifacts instead of final framework code.

### `design-system.json`

Capture reusable visual tokens:
- `meta`
- `colors`
- `typography`
- `spacing`
- `radius`
- `shadow`
- optional `breakpoints`, `motion`, or `iconography` only if clearly relevant

### `components.json`

Capture reusable components:
- component name
- whether it is reusable
- observed instance count
- props
- variants
- token dependencies
- notes and uncertainty

### `page-analysis.json`

Capture page-specific structure:
- sections in order
- layout per section
- visible text
- image placeholders
- approximations
- one-off sections that should not enter the reusable component system

When updating an existing design system:
- preserve stable tokens unless the new screenshot clearly contradicts them
- add new component variants instead of replacing old ones
- record conflicts in `meta.notes`
- keep page-specific sections in `page-analysis.json`, not in the reusable component system

An optional `preview.html` may demonstrate the extracted design system, but the JSON artifacts are the primary output.

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
- If an existing design system was provided, updates are additive and conflicts are noted.

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
- It does not extract real image assets from screenshots.
- It does not replace human review for production UI.
