# Framework output reference

Read this when `/image-to-code` runs in simple mode.

## Framework selection

- `html` is the default for zero-config preview.
- `react` should produce copyable React/TypeScript code for an existing app.
- `vue` should produce copyable Vue 3 code for an existing app.
- Do not scaffold a full project, package manager, or config files unless the user explicitly asks.

## Shared output rules

- Centralize visual tokens.
- Keep visible text real and verbatim when readable.
- Use data arrays for repeated content.
- Keep section components responsible for layout.
- Keep leaf components responsible for content.
- Crop real image regions from the screenshot whenever possible.
- Use proportional color blocks only when cropping is impossible or the user requests `--asset-policy placeholder`.
- Do not use emoji as image placeholders.
- Do not invent navigation, routes, copy, products, or services.
- Match the visual mass of major images: a product/photo placeholder should occupy roughly the same area as the source image subject, not shrink into a tiny icon.
- Vary product placeholders when the source shows different product silhouettes, orientations, or tones.
- Preserve brand typography cues: luxury/skincare/editorial pages often need serif headings, letter-spaced labels, and restrained body text; SaaS/tech pages often need geometric sans; playful consumer pages may need softer rounded sans.
- Record approximations for unreadable text, unavailable image assets, simplified icons, maps, and decorative illustrations.

## Asset policy

Default asset policy is `crop`.

- `crop`: crop visible product, hero, gallery, recommendation, card, and lifestyle image regions from the source screenshot and save them under `assets/`.
- `placeholder`: use CSS placeholders instead of cropped assets.
- `none`: omit image assets and avoid visual placeholders unless necessary for layout.

Prefer real cropped assets for ecommerce/product pages. The user expects real images, not icons.

When using `crop`, first produce crop specs:

```json
[
  { "id": "product-main", "bbox": { "x": 80, "y": 120, "width": 420, "height": 560 } },
  { "id": "product-thumb-1", "bbox": { "x": 80, "y": 700, "width": 96, "height": 96 } },
  { "id": "recommendation-1", "bbox": { "x": 40, "y": 1080, "width": 240, "height": 220 } }
]
```

Then use the bundled helper when available:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/crop-assets.mjs <source-image> <crop-specs.json> <out-dir>/assets
```

If the helper cannot run, crop assets manually with available tools. Use placeholders only as fallback, and report that fallback.

## Product and image fallback fidelity

When real image assets are not available, placeholders should still preserve visual weight.

For ecommerce/product pages:
- Main product image placeholders should fill the same visual role as the original product photo. Do not render a tiny bottle/icon inside a large blank block unless the source subject is genuinely tiny.
- Thumbnail placeholders should be consistent with the main image and show the same product silhouette or color family.
- Recommendation cards should not all use identical placeholders if the source shows visibly different products.
- Use simple CSS shapes, gradients, labels, and aspect-ratio containers to approximate product silhouettes when useful.
- Note in the final report that product imagery was approximated.

For lifestyle/hero photography:
- Preserve dominant color, aspect ratio, and crop position.
- Use gradients only when the original image is broad lifestyle/photo content; avoid generic gradients for product cutouts.

## Brand typography fidelity

Choose typography to match the brand category:

- Skincare, luxury, fashion, editorial: prefer refined serif or high-contrast display headings, small uppercase labels, generous letter spacing, restrained colors.
- Modern ecommerce and SaaS: prefer clean geometric sans headings and compact body text.
- Food, wellness, playful retail: prefer warmer sans or rounded shapes when visible.

Apply this consistently to logo treatment, headings, nav labels, product titles, prices, and CTA text. Do not let the page collapse into a generic ecommerce template if the screenshot has a clear brand mood.

## Approximation reporting

At the end of the run, report approximations explicitly:

```txt
Approximations:
- Product photos were recreated as CSS placeholders.
- Some small footer links were unreadable and approximated.
- Decorative icons were simplified.
```

If text is unreadable, either omit it, mark it as unreadable in structured output, or use a clearly stated approximation. Do not silently invent specific product names, routes, claims, locations, or policy text.

## HTML output

Default output path: same directory/name as the image with `.html`.

If `--asset-policy crop` is used, prefer an output directory:

```txt
index.html
assets/
  product-main.png
  product-thumb-1.png
```

Reference cropped assets with relative paths such as `./assets/product-main.png`.

If the user explicitly requests a single `.html` file, either embed cropped assets as base64 data URLs or report that image assets were approximated.

Output one self-contained HTML file only when no external assets are needed:

```html
<div id="root"></div>
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script type="text/babel">
  // React components here
</script>
```

Use a `:root` block for tokens:

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
    --font-heading: Inter, system-ui, sans-serif;
    --text-body: 14px;
    --text-h1: 42px;
    --section-py: 32px;
    --section-px: 28px;
    --card-padding: 16px;
    --grid-gap: 16px;
    --radius-card: 8px;
    --radius-button: 4px;
  }
</style>
```

## React output

Default output directory: image basename plus `-react`.

Prefer this minimal structure:

```txt
App.tsx
tokens.css
assets/
```

Use more files only when the page has clear reusable components:

```txt
App.tsx
components/
  Button.tsx
  ProductCard.tsx
data/
  pageData.ts
assets/
  product-main.png
tokens.css
```

React rules:
- Use TypeScript.
- Use `export default function App()`.
- Use PascalCase component names.
- Define props interfaces for reusable components.
- Put repeated content arrays at module scope or in `data/pageData.ts`.
- Import `./tokens.css`.
- Do not include React CDN, Babel, `ReactDOM.createRoot`, or HTML shell.
- Do not assume a router, global state library, icon library, or image asset pipeline.
- Reference cropped assets with relative paths such as `./assets/product-main.png` or import them only if the target project convention is known.

Minimal pattern:

```tsx
import "./tokens.css";

const products = [
  { title: "Visible title", price: "$35.00", imageSrc: "./assets/product-1.png" }
];

interface ProductCardProps {
  title: string;
  price: string;
  imageSrc: string;
}

function ProductCard({ title, price, imageSrc }: ProductCardProps) {
  return (
    <article className="rounded-[var(--radius-card)] bg-[var(--surface-bg)] p-[var(--card-padding)]">
      <img className="aspect-[3/4] w-full object-cover" src={imageSrc} alt={title} />
      <h3>{title}</h3>
      <p>{price}</p>
    </article>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      {products.map((product) => (
        <ProductCard key={product.title} {...product} />
      ))}
    </main>
  );
}
```

## Vue output

Default output directory: image basename plus `-vue`.

Prefer this minimal structure:

```txt
App.vue
tokens.css
assets/
```

Use more files only when the page has clear reusable components:

```txt
App.vue
components/
  ProductCard.vue
data/
  pageData.ts
assets/
  product-main.png
tokens.css
```

Vue rules:
- Use Vue 3 SFC syntax.
- Use `<script setup lang="ts">`.
- Use `v-for` for repeated content with stable keys.
- Use `defineProps` for reusable components when split into files.
- Import `./tokens.css` from `App.vue` or the app entry expectation.
- Do not include React patterns, JSX, ReactDOM, or Babel.
- Do not assume Vue Router, Pinia, icon libraries, or image asset pipeline.
- Reference cropped assets with relative paths such as `./assets/product-main.png` unless the target project convention is known.

Minimal pattern:

```vue
<script setup lang="ts">
import "./tokens.css";

const products = [
  { title: "Visible title", price: "$35.00", imageSrc: "./assets/product-1.png" }
];
</script>

<template>
  <main class="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
    <article
      v-for="product in products"
      :key="product.title"
      class="rounded-[var(--radius-card)] bg-[var(--surface-bg)] p-[var(--card-padding)]"
    >
      <img class="aspect-[3/4] w-full object-cover" :src="product.imageSrc" :alt="product.title" />
      <h3>{{ product.title }}</h3>
      <p>{{ product.price }}</p>
    </article>
  </main>
</template>
```

## `tokens.css`

For React/Vue, write tokens to `tokens.css`:

```css
:root {
  --page-bg: #f7f2ea;
  --surface-bg: #ffffff;
  --text-primary: #1c1b18;
  --text-muted: #777064;
  --accent: #2d5a3d;
  --border: #e7ded2;
  --font-body: Inter, system-ui, sans-serif;
  --font-heading: Inter, system-ui, sans-serif;
  --text-body: 14px;
  --text-h1: 42px;
  --section-py: 32px;
  --section-px: 28px;
  --card-padding: 16px;
  --grid-gap: 16px;
  --radius-card: 8px;
  --radius-button: 4px;
}
```

Use Tailwind arbitrary values with variables when available. If the target project does not use Tailwind, write plain CSS classes instead of Tailwind utility classes.
