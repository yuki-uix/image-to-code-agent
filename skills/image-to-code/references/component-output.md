# Reusable framework component output

Read this before generating React or Vue from a design package. HTML may remain self-contained; React and Vue must emit reusable component files.

## Required output

Use `.tsx` for React and `.vue` for Vue:

```txt
page/
  src/App.tsx|App.vue
  src/components/*.{tsx,vue}
  src/sections/*.{tsx,vue}
  src/data/page-data.ts
  src/tokens.css
  component-manifest.json
  page-contract.json
  layout-contract.json
  assets/
```

Put reusable leaf or pattern components in `src/components/`. Put page-specific composition in `src/sections/`. Do not put the full page in one `App` file.

## Contract mapping

Before generation, add `requiredComponents` to `page-contract.json`. Select only registry components visible on the current page.

```json
{
  "requiredComponents": [
    {
      "name": "ProductCard",
      "sourceComponent": "ProductCard",
      "sourceRegionIds": ["related-product-cards"],
      "expectedInstances": 4,
      "repeated": true
    }
  ]
}
```

`sourceComponent` must be a key in design-package `components.json`. `name` is the exported framework component. Page-only sections do not belong in `requiredComponents`.

Write `component-manifest.json`:

```json
{
  "meta": { "schemaVersion": 1, "framework": "react" },
  "entry": "src/App.tsx",
  "components": [
    {
      "name": "ProductCard",
      "sourceComponent": "ProductCard",
      "file": "src/components/ProductCard.tsx",
      "reusable": true,
      "props": ["name", "subtitle", "price", "assetId", "href"],
      "variants": ["default"],
      "renderStrategy": "data-driven"
    }
  ],
  "sections": [
    { "name": "RelatedProducts", "file": "src/sections/RelatedProducts.tsx" }
  ]
}
```

## Implementation rules

- Preserve every public prop and variant listed by the source registry component.
- Import and render each required component outside its own file.
- Render repeated components from arrays using `.map()` in React and `v-for` in Vue.
- Keep page facts in `src/data/page-data.ts`; do not embed four nearly identical cards by hand.
- Keep variants inside one reusable component unless their DOM structure is materially different.
- Keep framework components free of page-specific product names, prices, and copy.
- Use design-system tokens through `src/tokens.css`; do not duplicate raw values across component files.
- Allow sections to compose multiple reusable components, but do not rename registry components without recording `sourceComponent`.

## Validation

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-framework-components.mjs \
  react|vue \
  <design-package/components.json> \
  <page/page-contract.json> \
  <page/component-manifest.json> \
  <page-dir>
```

Do not report React/Vue generation complete until this validator and the normal page/layout checks pass.
