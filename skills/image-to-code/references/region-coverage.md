# Region coverage reference

Read this after writing `page-facts.json` and before generating code for safe design-source or design-package runs.

## Purpose

Ensure every visible page region is represented exactly once. Use this chain:

```txt
page-facts.regions → page-contract.regionCoverage → data-source-region markers
```

This catches missing description images, footer decorations, controls, and sections, as well as duplicated strips or components.

## Page facts inventory

Add a `regions` array to `page-facts.json`:

```json
{
  "regions": [
    {
      "id": "product-hero",
      "section": "ProductHero",
      "kind": "group",
      "bbox": { "x": 24, "y": 96, "width": 540, "height": 360 },
      "required": true,
      "expectedInstances": 1
    },
    {
      "id": "description-texture-image",
      "section": "ProductTabs",
      "kind": "image",
      "bbox": { "x": 340, "y": 510, "width": 230, "height": 120 },
      "required": true,
      "expectedInstances": 1,
      "assetId": "cream-texture"
    },
    {
      "id": "related-product-cards",
      "section": "RelatedProducts",
      "kind": "repeated-group",
      "bbox": { "x": 32, "y": 680, "width": 540, "height": 210 },
      "required": true,
      "expectedInstances": 4
    }
  ]
}
```

Inventory rules:

- Give every meaningful visual area a stable ID.
- Include text blocks, images, controls, component groups, repeated groups, and decorations that materially affect the page.
- Represent a repeated collection as one `repeated-group` with its visible cardinality unless individual items need different assets or layouts.
- Do not inventory the same visual area both as a peer and as a duplicate container.
- Keep section membership and pixel bbox from the page-reference region.

## Contract coverage

Add `regionCoverage` to `page-contract.json`:

```json
{
  "regionCoverage": [
    {
      "sourceRegionId": "product-hero",
      "component": "ProductHero",
      "renderAs": "section",
      "expectedInstances": 1
    },
    {
      "sourceRegionId": "description-texture-image",
      "component": "ProductDescriptionImage",
      "renderAs": "img",
      "assetPath": "assets/cream-texture.png",
      "expectedInstances": 1
    },
    {
      "sourceRegionId": "related-product-cards",
      "component": "ProductCard",
      "renderAs": "repeated-group",
      "expectedInstances": 4
    }
  ]
}
```

Every required source region must have exactly one coverage entry. Coverage entries may add implementation details but may not point to unknown source region IDs.

## Code markers

Emit one literal marker for each coverage entry:

```html
<section data-source-region="product-hero">...</section>
<img data-source-region="description-texture-image" src="./assets/cream-texture.png" />
<div data-source-region="related-product-cards" data-source-instances="4">...</div>
```

- Use exactly one `data-source-region` marker per source region.
- For a repeated group, add `data-source-instances` equal to `expectedInstances` on its wrapper.
- Keep marker values literal in HTML, React, and Vue source so deterministic validation can inspect them.
- Do not put the same marker on both a wrapper and its child.

## Validation

Before code generation:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-region-coverage.mjs \
  <page-facts.json> <page-contract.json>
```

After code generation, run `validate-page-contract.mjs`; it checks marker presence, duplication, and repeated-group instance declarations whenever `regionCoverage` exists.
