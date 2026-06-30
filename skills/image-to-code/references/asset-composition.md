# Asset composition reference

Read this after region coverage and before generating code for a design-package page.

## Purpose

Define how each real asset enters a page region. Do not improvise image layering in code.

```txt
asset-manifest presentation → page-contract.assetComposition → generated asset markers
```

## Asset presentation metadata

Every manifest asset must declare presentation properties:

```json
{
  "id": "product-bottle",
  "file": "assets/product-bottle.png",
  "presentation": {
    "background": "transparent",
    "recommendedFit": "contain",
    "focalPoint": { "x": 0.5, "y": 0.5 }
  }
}
```

- `background`: `transparent`, `opaque`, or `full-bleed`.
- `recommendedFit`: `contain`, `cover`, `fill`, or `none`.
- `focalPoint`: normalized coordinates from `0` to `1`; optional.
- Use `transparent` only when the file actually has usable transparency.
- Use `opaque` for self-contained product/card photos with a baked background.
- Use `full-bleed` for backgrounds intended to fill and crop inside a container.

Clean provided assets are preferred. A rectangular crop from a flattened board usually has `opaque` background and must not be used as an overlay layer.

## Composition contract

Add `assetComposition` to `page-contract.json`.

### Single asset

```json
{
  "id": "related-product-grace-image",
  "sourceRegionId": "related-product-grace-image",
  "mode": "single",
  "assetId": "grace-cleansing-oil",
  "assetPath": "assets/grace-cleansing-oil.png",
  "fit": "cover",
  "position": "50% 50%",
  "containerAspectRatio": "3/4"
}
```

### Background

```json
{
  "id": "hero-background",
  "sourceRegionId": "hero-background",
  "mode": "background",
  "assetId": "herb-background",
  "assetPath": "assets/herb-background.jpg",
  "fit": "cover",
  "position": "50% 50%",
  "containerAspectRatio": "4/3"
}
```

### Layered composition

```json
{
  "id": "hero-media",
  "sourceRegionId": "hero-media",
  "mode": "layered",
  "fit": "cover",
  "containerAspectRatio": "4/5",
  "layers": [
    { "assetId": "hero-background", "assetPath": "assets/hero-background.jpg", "fit": "cover", "position": "50% 50%", "zIndex": 0 },
    { "assetId": "product-bottle", "assetPath": "assets/product-bottle.png", "fit": "contain", "position": "50% 60%", "zIndex": 1 }
  ]
}
```

Rules:

- Prefer `single` when the supplied asset already represents the intended visual.
- Use `layered` only when overlay layers have transparent backgrounds.
- Allow one opaque or full-bleed base layer at the lowest z-index.
- Reject opaque overlay layers; they create visible rectangles.
- Keep z-index values unique and ordered.
- Match every image region in `regionCoverage` to exactly one composition.
- Use a declared aspect ratio, fit, and position; do not rely on browser defaults.
- Do not stretch photos with `fill` unless the source explicitly demonstrates distortion.

## Generated-code markers

Emit one literal composition marker on the image container:

```html
<div
  data-asset-composition="hero-media"
  data-asset-mode="layered"
  data-asset-fit="cover"
>
  <img data-asset-layer="hero-background" src="./assets/hero-background.jpg" />
  <img data-asset-layer="product-bottle" src="./assets/product-bottle.png" />
</div>
```

For `single` and `background`, use the same wrapper attributes and reference the declared asset path. Keep marker values literal in HTML, React, and Vue source.

## Validation

Before generation:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-asset-composition.mjs \
  <asset-manifest.json> <page-contract.json>
```

After generation, `validate-page-contract.mjs` checks composition markers, mode/fit declarations, layer markers, and asset-path references.
