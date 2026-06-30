# Page facts reference

Read this before creating `page-contract.json` from a screenshot or design-board page reference.

## Purpose

Lock visible page content before loading reusable component defaults or generating code. Use this chain:

```txt
source image page region → page-facts.json → page-contract.json → code
```

`page-facts.json` is an observation record, not a design proposal. Never copy default text from `components.json`, `design-system.json`, another page, or general domain knowledge into it.

## Output shape

```json
{
  "meta": {
    "schemaVersion": 1,
    "sourceImage": "path/to/source.png",
    "sourceRegionId": "page-layout",
    "pageType": "product-detail",
    "confidence": "medium"
  },
  "sections": [
    {
      "name": "Header",
      "order": 1,
      "bbox": { "x": 12, "y": 12, "width": 580, "height": 80 },
      "visibleText": ["VELVETY", "PAGES", "SHOP", "ABOUT", "LOGIN", "CART (0)"]
    }
  ],
  "regions": [
    {
      "id": "header-navigation",
      "section": "Header",
      "kind": "group",
      "bbox": { "x": 12, "y": 12, "width": 580, "height": 80 },
      "required": true,
      "expectedInstances": 1
    }
  ],
  "visibleText": [
    "VELVETY",
    "PAGES",
    "SHOP",
    "ABOUT",
    "LOGIN",
    "CART (0)"
  ],
  "unreadableText": [],
  "inferredText": []
}
```

Add structured groups such as `navigation`, `products`, `filterGroups`, `newsletter`, `forms`, `featureItems`, and `footerColumns` only when they are visible in the page reference. Every text value inside those groups must also appear verbatim in the top-level `visibleText` array.

Read `region-coverage.md` when writing `regions`; it defines stable IDs, expected instances, contract coverage, and generated-code markers.

## Fact rules

- Read only the page-reference region, not the asset, component, icon, or token panels.
- Copy visible strings verbatim, including punctuation, accents, currency, capitalization, and years.
- Use `null` for a structured field that is visibly present but unreadable.
- Put uncertain fragments in `unreadableText`; do not choose a plausible replacement.
- Keep `inferredText` empty for `--quality safe`, `--source-type design-board|design-bundle`, and `--design-package` runs.
- Include every visible repeated item. Do not summarize four product cards as one example.
- Record the visible footer exactly. Do not expand it from a reusable Footer component definition.
- Treat component examples outside the page reference as style and behavior evidence only, never page content.

## Contract derivation

Build `page-contract.json` only from `page-facts.json`:

1. Preserve all visible text.
2. Preserve section order and repeated-item cardinality.
3. Add structural implementation details such as layout names, component IDs, and asset paths.
4. Do not add new user-visible strings.
5. Run the fact-lock validator before code generation.

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-fact-lock.mjs <page-facts.json> <page-contract.json>
```

If validation fails, repair the contract. Do not weaken `page-facts.json` merely to make invented output pass.
