---
name: image-to-code
description: >
  A disciplined screenshot-to-HTML workflow. In simple mode, converts a UI
  screenshot into a self-contained browser-ready HTML file using React 18,
  Tailwind CDN, and Babel. In structured mode, extracts reusable design-system
  artifacts from a screenshot for use across future screenshots. No Ollama, no
  local model, no build step required. Use when the user asks to turn a
  screenshot into code, recreate a design, generate HTML from an image, extract
  a design system from a screenshot, or reuse a design system for another page.
  Trigger phrases include: "image to code", "screenshot to code",
  "generate HTML for this", "extract design system", "/image-to-code".
---

# image-to-code

Turn a UI screenshot into either:

1. a self-contained HTML page, or
2. reusable design-system artifacts for future pages.

This skill is not a smarter model. It is a repeatable workflow with quality gates: visual audit first, real text, exact color tokens, clear section structure, calibration-ready CSS variables, and optional design-system reuse.

## Usage

```txt
/image-to-code <image-path> [--out <output-path>]
/image-to-code <image-path> --mode structured [--out <output-dir>]
/image-to-code <image-path> --design-system <design-system.json> [--out <output-path>]
/image-to-code <image-path> --mode structured --design-system <design-system.json> [--out <output-dir>]
```

- `<image-path>` — screenshot path; required.
- `--mode simple|structured` — default: `simple`.
- `--out` — HTML path for simple mode; output directory for structured mode.
- `--design-system` — existing `design-system.json` to reuse or update.

Keep the default experience zero-config: one image in, one HTML file out.

## Modes

### Simple mode

Use simple mode when the user wants a page now.

Input:
- one screenshot
- optional existing design system

Output:
- one self-contained `.html` file

Success criteria:
- opens directly in a browser
- no build step
- no Ollama or local model
- React 18 + ReactDOM + Babel + Tailwind CDN
- section order matches the screenshot
- all visible text is copied verbatim when readable
- colors use exact hex values, not nearest Tailwind names
- images/photos become proportionally accurate placeholders
- micro-components are represented: ratings, badges, tabs, quantity selectors, filters, forms, pagination, etc.
- global visual tokens are centralized in `:root`

Do not promise pixel-perfect output. The goal is a faithful, useful first pass that can be reviewed or calibrated later.

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
preview.html        # optional but recommended
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
- output path or directory
- optional existing design-system path

If the image path is missing, ask for it.

## Step 2 — Visual audit before writing files

Read the image and produce a concise working audit before generating HTML or JSON. The audit should cover:

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

## Step 3A — Simple mode HTML generation

Generate one complete self-contained HTML file.

Required stack:

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
```

Use `type="text/babel"` for the React script. Add Google Fonts only when a specific font family is useful.

### CSS variables

Centralize global visual tokens in a single `:root` block, even when using Tailwind classes:

```html
<style>
  :root {
    --page-bg: #f7f2ea;
    --surface-bg: #ffffff;
    --text-primary: #1c1b18;
    --text-muted: #777064;
    --accent: #2d5a3d;
    --border: #e7ded2;

    --font-body: Inter, system-ui, sans-serif;
    --font-heading: "Cormorant Garamond", Georgia, serif;
    --text-body: 13px;
    --text-h1: 42px;
    --text-h2: 24px;

    --section-py: 32px;
    --section-px: 28px;
    --card-padding: 16px;
    --grid-gap: 16px;
    --button-height: 38px;

    --radius-card: 8px;
    --radius-button: 4px;
    --radius-image: 6px;
    --shadow-card: 0 1px 8px rgba(0,0,0,0.06);
  }
</style>
```

Use variables through Tailwind arbitrary values or inline styles, e.g. `bg-[var(--page-bg)]`, `text-[var(--text-primary)]`, or `style={{ padding: 'var(--section-py) var(--section-px)' }}`.

### Code structure

Use a clear component tree:

```jsx
const products = [...];
const navItems = [...];

function ProductCard({ name, price, imageTone }) { ... }
function NavBar() { ... }
function HeroSection() { ... }
function ProductGrid() { ... }

function Page() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      <NavBar />
      <HeroSection />
      <ProductGrid />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
```

Rules:
- data arrays at module scope
- repeated cards render via `.map()`
- section components handle layout
- leaf components render content
- avoid rendering the same visual area twice as both a container and a peer component
- never use placeholder text like `Lorem ipsum`, `Service 1`, `Card Title`, `Product Name`, or `Description goes here`
- never use emoji as product/photo placeholders

## Step 3B — Structured mode artifacts

Write JSON artifacts instead of a final page.

### `design-system.json`

Use this shape:

```json
{
  "meta": {
    "sourceImage": "path/to/image.jpg",
    "mode": "structured",
    "notes": ["Values are visually estimated from screenshot pixels."]
  },
  "colors": {
    "pageBg": "#f7f2ea",
    "surface": "#ffffff",
    "textPrimary": "#1c1b18",
    "textMuted": "#777064",
    "accent": "#2d5a3d",
    "border": "#e7ded2"
  },
  "typography": {
    "headingFont": "Cormorant Garamond",
    "bodyFont": "Inter",
    "h1": "42px",
    "h2": "24px",
    "body": "13px",
    "label": "10px uppercase tracking-wide"
  },
  "spacing": {
    "baseUnit": 4,
    "sectionPaddingY": 32,
    "sectionPaddingX": 28,
    "cardPadding": 16,
    "gridGap": 16
  },
  "radius": {
    "card": 8,
    "button": 4,
    "image": 6,
    "badge": 999
  },
  "shadow": {
    "card": "0 1px 8px rgba(0,0,0,0.06)"
  }
}
```

### `components.json`

Capture reusable components:

```json
{
  "Button": {
    "reusable": true,
    "variants": ["primary", "outline"],
    "props": ["label", "href", "variant"],
    "tokens": {
      "height": "var(--button-height)",
      "radius": "var(--radius-button)"
    }
  },
  "ProductCard": {
    "reusable": true,
    "instancesObserved": 4,
    "props": ["title", "price", "imageTone", "badge"],
    "notes": ["Image assets were not available; placeholder ratio inferred from screenshot."]
  }
}
```

### `page-analysis.json`

Capture page-specific structure:

```json
{
  "sections": [
    {
      "name": "HeroSection",
      "layout": "split hero",
      "reusable": false,
      "children": ["NavBar", "CTAButton", "HeroImagePlaceholder"]
    }
  ],
  "visibleText": ["..."],
  "approximations": ["Hero photo replaced by dominant-color placeholder."]
}
```

When updating an existing design system:
- preserve stable tokens unless the new screenshot clearly contradicts them
- add new component variants instead of replacing old ones
- record conflicts in `meta.notes`
- keep page-specific sections in `page-analysis.json`, not in the reusable component system

An optional `preview.html` may demonstrate the extracted design system, but the JSON artifacts are the primary output.

## Step 4 — Quality gates

Before finishing, check:

- The requested mode’s required files exist.
- Simple HTML includes React, ReactDOM, Babel, Tailwind CDN, `#root`, and `type="text/babel"`.
- Simple HTML opens without a build step.
- All readable visible text is represented.
- No generic placeholder copy remains.
- Colors use exact hex values or CSS variables derived from exact hex values.
- Repeated components use data arrays.
- Structured JSON is valid and separates design-system tokens, reusable components, and page-specific analysis.
- If an existing design system was provided, updates are additive and conflicts are noted.

## Step 5 — Report

Tell the user:
- what mode ran
- output path(s)
- what was generated
- what was approximate
- whether an existing design system was used or updated

## Non-goals

- This skill does not guarantee pixel-perfect reproduction from one screenshot.
- It does not require Ollama, qwen, local models, npm install, React install, or Tailwind install.
- It does not extract real image assets from screenshots.
- It does not replace human review for production UI.
