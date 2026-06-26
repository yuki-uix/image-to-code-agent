# Structured output reference

Read this when `/image-to-code` runs with `--mode structured`.

Structured mode creates reusable design-system artifacts. The goal is cross-page consistency, not immediate final-page fidelity.

## Output files

Write these files to the output directory:

```txt
design-system.json
components.json
page-analysis.json
preview.html        # optional
```

All JSON files must be valid JSON. Do not include comments, markdown fences, trailing commas, or explanatory prose inside JSON.

## Separation of responsibilities

- `design-system.json`: reusable visual tokens only.
- `components.json`: reusable component patterns only.
- `page-analysis.json`: current page structure, text, and approximations.

Do not place page-specific text such as a hero headline, sale banner copy, or one-off campaign message in `design-system.json`.

Do not promote a one-off section to `components.json` unless it appears reusable or follows a repeated pattern.

## `design-system.json`

Use this shape:

```json
{
  "meta": {
    "schemaVersion": 1,
    "sourceImages": ["path/to/source.jpg"],
    "createdFrom": "screenshot",
    "confidence": "low | medium | high",
    "notes": ["Values are visually estimated from screenshot pixels."],
    "conflicts": []
  },
  "colors": {
    "pageBg": { "value": "#f7f2ea", "usage": "page background", "confidence": "medium" },
    "surface": { "value": "#ffffff", "usage": "cards and panels", "confidence": "high" },
    "textPrimary": { "value": "#1c1b18", "usage": "primary text", "confidence": "high" },
    "textMuted": { "value": "#777064", "usage": "secondary text", "confidence": "medium" },
    "accent": { "value": "#2d5a3d", "usage": "primary CTA and active states", "confidence": "medium" },
    "border": { "value": "#e7ded2", "usage": "dividers and card borders", "confidence": "medium" }
  },
  "typography": {
    "headingFont": { "value": "Inter", "fallback": "system-ui, sans-serif", "confidence": "low" },
    "bodyFont": { "value": "Inter", "fallback": "system-ui, sans-serif", "confidence": "low" },
    "scale": {
      "h1": { "value": "42px", "confidence": "medium" },
      "h2": { "value": "24px", "confidence": "medium" },
      "body": { "value": "14px", "confidence": "medium" },
      "label": { "value": "11px", "transform": "uppercase", "tracking": "0.08em", "confidence": "low" }
    }
  },
  "spacing": {
    "baseUnit": { "value": 4, "confidence": "medium" },
    "sectionPaddingY": { "value": 32, "confidence": "medium" },
    "sectionPaddingX": { "value": 28, "confidence": "medium" },
    "cardPadding": { "value": 16, "confidence": "medium" },
    "gridGap": { "value": 16, "confidence": "medium" }
  },
  "radius": {
    "card": { "value": 8, "confidence": "medium" },
    "button": { "value": 4, "confidence": "medium" },
    "image": { "value": 6, "confidence": "medium" },
    "badge": { "value": 999, "confidence": "medium" }
  },
  "shadow": {
    "card": { "value": "0 1px 8px rgba(0,0,0,0.06)", "confidence": "low" }
  }
}
```

Rules:
- Prefer token objects with `value`, `usage`, and `confidence` where useful.
- Use exact hex values for colors.
- Use pixel numbers for spacing/radius when estimating from screenshots.
- Mark uncertain values with low confidence instead of pretending precision.
- Add optional groups such as `breakpoints`, `motion`, `iconography`, or `imagery` only when clearly useful.

## `components.json`

Use this shape:

```json
{
  "Button": {
    "reusable": true,
    "observedIn": ["path/to/source.jpg"],
    "instancesObserved": 2,
    "variants": [
      {
        "name": "primary",
        "usage": "main CTA",
        "tokens": {
          "background": "colors.accent",
          "radius": "radius.button",
          "height": "spacing.buttonHeight"
        }
      }
    ],
    "props": ["label", "href", "variant"],
    "notes": [],
    "confidence": "medium"
  },
  "ProductCard": {
    "reusable": true,
    "observedIn": ["path/to/source.jpg"],
    "instancesObserved": 4,
    "variants": [],
    "props": ["title", "price", "imageTone", "badge"],
    "composition": ["ImagePlaceholder", "Price", "Badge"],
    "notes": ["Image assets were not available; placeholder ratio inferred from screenshot."],
    "confidence": "medium"
  }
}
```

Rules:
- Component keys should be PascalCase.
- Reusable repeated components should list props that differ across instances.
- Section containers may be reusable only if they represent a repeated pattern across pages.
- One-off page sections belong in `page-analysis.json`, not `components.json`.
- Record component composition when it helps framework generation.

## `page-analysis.json`

Use this shape:

```json
{
  "meta": {
    "sourceImage": "path/to/source.jpg",
    "viewport": { "width": 736, "height": 1104 },
    "confidence": "medium"
  },
  "sections": [
    {
      "name": "HeroSection",
      "order": 1,
      "layout": "split hero",
      "reusable": false,
      "background": "colors.pageBg",
      "children": ["NavBar", "CTAButton", "HeroImagePlaceholder"],
      "visibleText": ["Visible headline", "Shop now"],
      "approximations": ["Hero photo replaced by dominant-color placeholder."],
      "confidence": "medium"
    }
  ],
  "visibleText": ["Visible headline", "Shop now"],
  "images": [
    {
      "id": "hero-image",
      "type": "photo",
      "aspectRatio": "4/5",
      "dominantColor": "#d8c9b8",
      "replacement": "placeholder"
    }
  ],
  "approximations": ["Real image assets were not available."],
  "unreadableText": []
}
```

Rules:
- Preserve section order.
- Keep campaign copy, product names, and page-specific headings here.
- Include unreadable text explicitly rather than inventing replacement copy.
- Include image placeholder decisions so framework code can reuse them.

## Updating an existing design system

When `--design-system` is provided in structured mode:

1. Load the existing design system conceptually.
2. Preserve stable tokens unless the new screenshot clearly contradicts them.
3. Add new variants instead of replacing existing variants.
4. Record conflicts in `meta.conflicts`.
5. Add the new source image to `meta.sourceImages`.
6. Keep page-specific details in `page-analysis.json`.

The new screenshot is the source of truth for its own page analysis. Do not copy page sections, visible text, product data, navigation labels, crop regions, or component composition from the existing design system’s source page.

Existing design-system content may be reused only for reusable visual decisions:
- token naming
- token values that match the new screenshot
- component style patterns
- known variants that visibly recur

If a reusable component pattern recurs but the content differs, keep the new screenshot’s content and props. If the new screenshot uses a different layout, record it as a local page structure rather than forcing it into an older component composition.

Conflict format:

```json
{
  "token": "colors.accent",
  "existing": "#2d5a3d",
  "observed": "#315f42",
  "resolution": "kept existing; observed value is close and may be antialiasing",
  "confidence": "medium"
}
```

## Validation checklist

Before finishing structured mode, verify:

- All three required JSON files exist.
- JSON parses without comments or trailing commas.
- `design-system.json` has `meta`, `colors`, `typography`, `spacing`, `radius`, and `shadow`.
- `components.json` uses PascalCase component keys.
- Repeated reusable components list differing props.
- `page-analysis.json` includes ordered sections.
- Page-specific text is not stored as a design-system token.
- Existing design-system updates are additive and conflicts are recorded.
