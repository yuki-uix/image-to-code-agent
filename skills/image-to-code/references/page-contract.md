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
    "schemaVersion": 1
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
      "rating": "4.6 (182)"
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
- product names, subtitles, prices, original prices, badges, and ratings
- form placeholders and button labels
- footer column headings and visible links
- crop region IDs and subject descriptions

If text is unreadable, omit it or mark it in `unreadableText`; do not invent exact copy.

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

## Validator command

```bash
node ${CLAUDE_SKILL_DIR}/scripts/validate-page-contract.mjs <page-contract.json> <output-file-or-dir>
```

The validator checks text-level contract integrity. It does not judge visual fidelity, crop alignment, or layout quality.
