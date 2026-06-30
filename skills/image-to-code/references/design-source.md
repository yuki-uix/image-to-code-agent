# Design source reference

Read this when `/image-to-code` receives `--source-type design-board` or the input is clearly an AI-generated design board containing both a page composition and reusable visual assets.

## Product contract

A design board is not merely a webpage screenshot. It may contain:

- a proposed page layout
- isolated product photos, illustrations, textures, logos, or decorative motifs
- component examples such as buttons, cards, fields, badges, and navigation
- typography, color, spacing, radius, or shadow cues

Convert it in two phases:

1. Build a reusable `design-package/` from the source image.
2. Generate the requested page from the package and the page composition.

Do not generate the page before the package is materialized and validated.

## CLI behavior

```txt
/image-to-code <image> --source-type design-board --framework html|react|vue --out <dir>
/image-to-code <image> --source-type design-board --package-only --out <dir>
/image-to-code <image> --design-package <design-package-dir> --framework html|react|vue --out <dir>
```

- `--source-type auto|screenshot|design-board` defaults to `auto`.
- In `auto`, choose `design-board` only when the image visibly contains reusable asset specimens or design-system examples in addition to a page composition. Otherwise choose `screenshot`.
- `--package-only` stops after validating the design package.
- `--design-package` consumes an existing package without re-extracting its assets.

State the detected source type before writing files. If the distinction is genuinely ambiguous and changes the requested result, ask one concise question.

## Output layout

For a complete design-board run, write:

```txt
<out>/
  design-package/
    design-source.json
    page-facts.json
    asset-manifest.json
    design-system.json
    components.json
    assets/
      ...real extracted files
  page/
    page-contract.json
    index.html | App.tsx | App.vue
    tokens.css              # React/Vue when useful
    assets/                 # copied or referenced from design-package
```

`--package-only` writes only `design-package/`.

## Stage 1 — Source decomposition

Inspect the source image and classify every meaningful region as one of:

- `page-layout`: structure or composition to implement in code
- `asset`: photo, illustration, texture, logo, icon, or decorative visual to extract
- `component-reference`: reusable UI appearance to encode in `components.json`
- `token-reference`: color, typography, spacing, radius, border, or shadow evidence
- `ignore`: annotation, measurement, cursor, watermark, or irrelevant chrome

Write `design-source.json`:

```json
{
  "meta": {
    "schemaVersion": 1,
    "sourceType": "design-board",
    "sourceImage": "path/to/board.png",
    "canvas": { "width": 1536, "height": 2048 },
    "confidence": "medium"
  },
  "regions": [
    {
      "id": "hero-botanical",
      "role": "asset",
      "kind": "photo",
      "bbox": { "x": 840, "y": 120, "width": 560, "height": 620 },
      "decision": "extract",
      "notes": []
    }
  ],
  "pageComposition": {
    "sections": ["Header", "Hero", "FeatureGrid", "Footer"]
  },
  "unreadableText": [],
  "approximations": []
}
```

Coordinates use source-image pixels with origin at the top-left. Do not treat text, buttons, or whole cards as bitmap assets when they should remain editable HTML/CSS.

### Lock page facts

After locating the `page-layout` region, read `page-facts.md` and write `page-facts.json` from that region only. Do this before reading component defaults or composing the final page.

The asset, icon, component, and token panels may clarify style or reusable behavior, but they are forbidden sources for page text. Keep prices, footer columns, years, labels, and repeated item data exactly as shown in the page-layout region. Use `unreadableText` instead of plausible replacements.

## Stage 2 — Asset materialization

Extract real visual assets before code generation. Prefer clean isolated specimens from the board over crops from the composed page.

Write `asset-manifest.json`:

```json
{
  "meta": {
    "schemaVersion": 1,
    "sourceImage": "path/to/board.png"
  },
  "assets": [
    {
      "id": "hero-botanical",
      "role": "hero",
      "kind": "photo",
      "file": "assets/hero-botanical.png",
      "extraction": "crop",
      "sourceRegion": { "x": 840, "y": 120, "width": 560, "height": 620 },
      "reusable": true,
      "confidence": "high",
      "presentation": {
        "background": "transparent",
        "recommendedFit": "contain",
        "focalPoint": { "x": 0.5, "y": 0.5 }
      }
    }
  ]
}
```

Rules:

- Use `extraction: crop` for pixels taken from the board, `recreate` only when the user permits regeneration, and `provided` for separate source files.
- Every manifest entry must point to a real, non-empty file.
- Keep filenames semantic and stable.
- Exclude surrounding labels, borders, neighboring specimens, and page chrome from crops.
- Preserve transparency when the source supports it; otherwise record the baked background in notes.
- Do not use placeholders when an extractable source asset exists.
- Use `scripts/crop-assets.mjs` for deterministic rectangular crops when suitable.
- Declare `presentation.background` and `recommendedFit` for every asset. Read `asset-composition.md` before using assets in page code.

## Stage 3 — System extraction

Write `design-system.json` and `components.json` using `structured-output.md`.

Derive reusable rules from token and component evidence, not from arbitrary page content. Component definitions should reference asset roles or asset IDs rather than embedding source-page text.

## Stage 4 — Page composition

Write `page/page-contract.json` from `design-package/page-facts.json`, not from component examples. Validate the fact lock before generating code:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-fact-lock.mjs \
  <design-package-dir>/page-facts.json \
  <page-dir>/page-contract.json
```

Then generate code using:

- the contract for page structure and visible content
- the design system for tokens
- components for reusable UI behavior and styling
- the asset manifest for real imagery

Do not flatten extracted assets back into a screenshot-sized background image. The result must remain editable and componentized.

## Validation

Validate the package before page generation:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-design-package.mjs <design-package-dir>
```

Then validate the generated page contract with `validate-page-contract.mjs` when applicable.

A package is not successful merely because its JSON parses. It must contain real asset files whenever `asset` regions were marked for extraction.
