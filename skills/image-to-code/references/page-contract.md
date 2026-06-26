# Page contract reference

Read this when `/image-to-code` runs in simple mode, especially when `--design-system` is provided.

A page contract locks the facts from the current screenshot before any design-system styling is applied. It prevents an existing design system from rewriting the current page.

## When to create it

Create `page-contract.json` before generating code when:

- `--design-system` is provided, or
- the screenshot has many repeated products/cards, or
- the user is comparing cross-page design-system reuse.

For simple mode without `--design-system`, a concise working page contract in the response is acceptable, but writing the JSON file is still useful for debugging.

## Contract shape

```json
{
  "meta": {
    "sourceImage": "path/to/current-screenshot.png",
    "schemaVersion": 1,
    "pageType": "collection"
  },
  "sections": [
    {
      "name": "Header",
      "order": 1,
      "layout": "horizontal nav",
      "requiredText": ["VELVETY", "PAGES", "SHOP", "ABOUT", "LOGIN", "CART (0)"]
    }
  ],
  "navigation": {
    "labels": ["PAGES", "SHOP", "ABOUT", "LOGIN", "CART (0)"]
  },
  "products": [
    {
      "name": "CHICORI",
      "subtitle": "Protect Serum",
      "price": "$20",
      "originalPrice": "$28",
      "badge": "BEST SELLER",
      "rating": "4.6 (182)"
    }
  ],
  "filterGroups": [
    {
      "heading": "CATEGORIES",
      "options": ["All Products", "Best Sellers", "New Arrivals", "Serums"]
    }
  ],
  "newsletter": {
    "heading": "Join the VELVETY Circle",
    "text": "Be the first to know about new arrivals, exclusive offers, and skincare rituals.",
    "placeholder": "Enter your email",
    "buttonLabel": "SUBSCRIBE"
  },
  "footerColumns": [
    {
      "heading": "SHOP",
      "links": ["All Products", "Best Sellers", "New Arrivals", "Skincare Sets", "Gift Cards"]
    }
  ],
  "requiredText": [
    "Skincare Essentials",
    "Daily rituals for hydrated, luminous skin."
  ],
  "forbiddenText": [
    "Service 1",
    "Product Name",
    "Description goes here"
  ],
  "cropRegions": [
    {
      "id": "product-chicori",
      "assetPath": "assets/product-chicori.png",
      "mustCrop": true,
      "bbox": { "x": 242, "y": 377, "width": 173, "height": 290 },
      "subject": "CHICORI product card image"
    }
  ],
  "localOverrides": [
    {
      "token": "navigation.labels",
      "reason": "current screenshot labels differ from existing design system"
    }
  ]
}
```

## Required facts

Include all readable facts that must not drift:

- header/nav labels
- page title and subtitle
- section headings
- product names, subtitles, prices, original prices, badges, and ratings; for product grids, every visible product card must be represented
- filter group headings and every visible option label
- newsletter heading, supporting text, input placeholder, and CTA label
- form placeholders and button labels
- footer column headings and visible links
- crop region IDs, subject descriptions, asset paths, and whether the region must be cropped

If text is unreadable, omit it or mark it in `unreadableText`; do not invent exact copy.

Set `meta.pageType` so validation can judge the page fairly:

- `product-detail`
- `collection`
- `cart`
- `checkout`
- `editorial`
- `marketing`
- `contact`
- `dashboard`
- `other`

Use `collection`, `product-detail`, `cart`, or `checkout` for ecommerce pages where product data is expected. Use `editorial` for brand story, about, article, ingredient, or content-led pages where `products` may be empty.

For ecommerce grids, do not summarize repeated items. Write every visible card into `products`. If a value is visible but small, record the best readable value and add a low confidence note. The generator may not replace product data with inferred alternatives.

## Image facts

For each real photo/product image that should survive as an asset, add a `cropRegions` entry with:

- `id`
- `assetPath`
- `mustCrop: true`
- `bbox`
- `subject`

Use `mustCrop: true` for product photos, hero photos, card photos, lifestyle photos, and newsletter botanical images when the screenshot shows a real image. Do not replace `mustCrop` regions with CSS illustrations, gradients, emoji, or generic icon shapes.

Use `mustCrop: false` only for abstract decoration where a CSS approximation is acceptable.

## Forbidden facts

When `--design-system` is provided, add obvious page-specific text from the design-system source page to `forbiddenText` if it must not appear in the current page. Examples:

- previous page title
- previous product detail labels
- previous product-only controls such as quantity selectors or tabs
- previous product names that are not visible in the current screenshot

Keep this list focused. Do not forbid reusable brand text such as the brand name or shared footer labels.

## Using the contract

Generation order:

1. Build `page-contract.json` from the current screenshot only.
2. Build a style plan from the design system, if provided.
3. Generate code from `page-contract.json` + style plan.
4. Validate the generated code with `scripts/validate-page-contract.mjs` when available.

If validation fails, repair the generated code against the contract before reporting success.

If validation passes but visual review shows drift, inspect `page-contract.json` first. A passing validator with wrong output usually means the contract omitted visible facts.

## Validator command

```bash
node ${CLAUDE_SKILL_DIR}/scripts/validate-page-contract.mjs <page-contract.json> <output-file-or-dir>
```

The validator checks text-level contract integrity and whether required cropped assets exist and are referenced. It does not judge visual fidelity, crop alignment, or layout quality.
