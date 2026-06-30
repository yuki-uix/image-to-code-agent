# Design bundle input reference

Read this when the input path is a directory or `--source-type design-bundle` is requested.

## Directory contract

```txt
design-input/
  page-reference.png          # required: page only, no asset board around it
  design-board.png            # optional: tokens/components/reference annotations
  input-manifest.json         # optional but recommended
  assets/                     # required: separate clean source files
    product-bottle.png
    botanical-leaf.png
    hero-background.jpg
    footer-leaf.svg
```

The page reference defines layout and visible content. `assets/` provides production imagery. The optional design board may clarify tokens and component styling, but may not override page facts.

## Input rules

- Keep each production asset in its own file.
- Prefer transparent PNG/SVG for objects, leaves, logos, and icons used as overlays.
- Use JPG/WebP for opaque photography and full-bleed backgrounds.
- Use semantic filenames; avoid `image1.png`, `export-final.png`, or screenshot hashes.
- Do not include labels, specimen borders, neighboring assets, or contact-sheet whitespace inside production files.
- Keep page-reference resolution at least as large as the target viewport.
- Treat cropping from a flattened design board as fallback, not the normal bundle path.

## Optional input manifest

```json
{
  "meta": { "schemaVersion": 1 },
  "pageReference": "page-reference.png",
  "designBoard": "design-board.png",
  "assets": [
    {
      "id": "product-bottle",
      "file": "assets/product-bottle.png",
      "role": "hero-product",
      "presentation": {
        "background": "transparent",
        "recommendedFit": "contain",
        "focalPoint": { "x": 0.5, "y": 0.5 }
      }
    }
  ]
}
```

If the manifest is absent, inspect the clean files and create equivalent asset-manifest entries during packaging. Never claim transparency without verifying the source file or user-provided metadata.

## Preflight

Run before any model-heavy work:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-design-input.mjs <design-input-dir>
```

Stop on errors. Warnings about missing optional metadata or small assets may proceed only when the user accepts the limitation.

## Packaging behavior

- Set source type to `design-bundle`.
- Copy clean assets into `design-package/assets/`; set `extraction` to `provided`.
- Build `asset-manifest.json` from the supplied or normalized input manifest.
- Build page facts only from `page-reference`.
- Use `design-board` only for token/component evidence.
- Continue through fact lock, region coverage, asset composition, code generation, and the visual gate.
