# Layout contract reference

Use this for safe screenshot, design-board, design-bundle, and design-package page generation.

## Purpose

Turn observed pixel geometry into a deterministic constraint:

```txt
page-facts bboxes → layout-contract.json → DOM measurements → geometry validation
```

This gate catches globally loose density, oversized cards, shifted sections, and excess document height without another model call.

## Build before generation

```sh
node ${CLAUDE_SKILL_DIR}/scripts/build-layout-contract.mjs \
  <page-facts.json> <layout-contract.json>
```

The builder derives:

- target viewport and document dimensions
- ordered section bboxes for generation guidance
- required region bboxes keyed by existing `data-source-region` IDs
- 1.5% position tolerance, 8% size tolerance, and 5% document-size tolerance

Prefer `page-facts.meta.viewport` when known. Otherwise the builder derives the canvas from the furthest section or region edge. Keep bboxes relative to the page-reference image, not the original contact sheet.

## Generate against geometry

Before writing CSS, use `layout-contract.sections` to choose section heights and use `layout-contract.regions` for major grid, media, and content proportions. Centralize likely repair values as CSS variables. Do not scale the whole page with CSS transforms.

Every target region must retain its literal `data-source-region` marker. Repeated groups also retain `data-source-instances`.

## Capture measurements

Capture at the contract viewport and write DOM measurements:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/capture-page.mjs \
  --html <index.html> \
  --out <visual-eval/actual.png> \
  --width <layout-contract.viewport.width> \
  --height <layout-contract.viewport.height> \
  --measurements <visual-eval/layout-measurements.json>
```

Then validate:

```sh
node ${CLAUDE_SKILL_DIR}/scripts/validate-layout-contract.mjs \
  <layout-contract.json> <visual-eval/layout-measurements.json>
```

## Repair policy

If geometry fails, make at most one targeted repair. Rank issues by:

1. document height drift
2. section y/height drift
3. repeated-card or media size drift
4. local x/width drift

Adjust shared CSS dimensions, gaps, paddings, and aspect ratios for the failing regions only. Do not rewrite facts, assets, or working sections. Re-capture and re-run both geometry and visual-diff validation once, then report remaining gaps honestly.
