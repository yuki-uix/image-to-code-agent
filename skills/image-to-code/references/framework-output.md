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
- Use proportional color blocks for unavailable images.
- Do not use emoji as image placeholders.
- Do not invent navigation, routes, copy, products, or services.

## HTML output

Default output path: same directory/name as the image with `.html`.

Output one self-contained HTML file with:

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
```

Use more files only when the page has clear reusable components:

```txt
App.tsx
components/
  Button.tsx
  ProductCard.tsx
data/
  pageData.ts
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

Minimal pattern:

```tsx
import "./tokens.css";

const products = [
  { title: "Visible title", price: "$35.00", imageTone: "#d8c9b8" }
];

interface ProductCardProps {
  title: string;
  price: string;
  imageTone: string;
}

function ProductCard({ title, price, imageTone }: ProductCardProps) {
  return (
    <article className="rounded-[var(--radius-card)] bg-[var(--surface-bg)] p-[var(--card-padding)]">
      <div className="aspect-[3/4]" style={{ backgroundColor: imageTone }} />
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
```

Use more files only when the page has clear reusable components:

```txt
App.vue
components/
  ProductCard.vue
data/
  pageData.ts
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

Minimal pattern:

```vue
<script setup lang="ts">
import "./tokens.css";

const products = [
  { title: "Visible title", price: "$35.00", imageTone: "#d8c9b8" }
];
</script>

<template>
  <main class="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
    <article
      v-for="product in products"
      :key="product.title"
      class="rounded-[var(--radius-card)] bg-[var(--surface-bg)] p-[var(--card-padding)]"
    >
      <div class="aspect-[3/4]" :style="{ backgroundColor: product.imageTone }"></div>
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
