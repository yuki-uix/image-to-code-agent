# image-to-code

A Claude Code workflow kit for turning UI screenshots into frontend code, reusable design-system artifacts, and optional validation checkpoints.

This is not a magic “perfect page from one image” button. It is a practical channel for screenshot-to-frontend work: automate the repetitive parts, keep human review at the important checkpoints, and only spend extra tokens when you need reuse or stronger guardrails.

The default path is intentionally light: one screenshot in, browser-openable HTML out. React and Vue are also supported for existing projects.

The skill is not a separate model and does not require Ollama, qwen, npm install, React install, Tailwind install, or a build step for the default HTML output.

## What is this tool?

Use it as four actions:

| Action | Input | Output | Token cost | Use when |
|---|---|---|---|---|
| Generate | screenshot | `html`, `react`, or `vue` + optional `assets/` | low | you want code quickly |
| Extract | screenshot | `design-system.json`, `components.json`, `page-analysis.json` | medium/high | you want to reuse a visual system later |
| Reuse | screenshot + `design-system.json` | code + `page-contract.json` + assets | high | you are building multiple pages in the same design family |
| Validate | generated artifacts | JSON report | low | you want to catch structural drift or weak artifacts |

Default to Generate. Use Extract only when you need a design system. Use Reuse only for same-brand/same-system pages. Use Validate as a cheap checkpoint after heavier runs.

## Why not just ask Claude/Codex directly?

Claude Code and Codex can already generate code from an image. This skill is useful because it turns one-off generation into a repeatable workflow with reusable outputs.

### What value does this skill add?

Direct prompting gives you a one-time result. This skill gives you a controllable workflow: quick generation by default, optional extraction when you need reusable artifacts, optional contract validation when you need fewer random drifts. It is not trying to be a smarter model — it is a quality channel around the model.

### How is this different from existing image-to-code tools?

Most image-to-code flows focus on recreating the current screenshot. This skill is designed to produce intermediate artifacts that can survive beyond one page: cropped image assets, `design-system.json`, `components.json`, and `page-analysis.json`. Those artifacts can then drive HTML, React, or Vue output for future screenshots.

### When should I use it?

Use direct model prompting if you only need an informal one-off snippet. Use this skill when you want a repeatable command, real cropped assets, framework-specific outputs, optional design-system extraction, and validation checkpoints.

In short: Generate is the default; Extract/Reuse/Validate are optional quality knobs.

## Quick start

Start Claude Code from the repo root:

```sh
cd /private/tmp/image-to-code-agent-remote
claude
```

Generate a browser-openable HTML preview:

```txt
/image-to-code /path/to/screenshot.png --framework html --out ./output/page
```

Open it:

```sh
open ./output/page/index.html
```

Generate React or Vue instead:

```txt
/image-to-code /path/to/screenshot.png --framework react --out ./output/react-page
/image-to-code /path/to/screenshot.png --framework vue --out ./output/vue-page
```

Add a page-contract checkpoint when you want stronger drift control:

```txt
/image-to-code /path/to/screenshot.png --framework html --quality safe --out ./output/page-safe
```

## Skills

This repo currently ships two Claude Code skills.

### `/image-to-code`

Main entry point.

#### Generate: screenshot → code

Default action. Converts a screenshot into frontend code with the least process overhead.

```txt
/image-to-code path/to/screenshot.jpg
/image-to-code path/to/screenshot.jpg --framework html --out output.html
/image-to-code path/to/screenshot.jpg --framework react --out ./generated-react
/image-to-code path/to/screenshot.jpg --framework vue --out ./generated-vue
/image-to-code path/to/screenshot.jpg --framework html --asset-policy crop --out ./generated-html
/image-to-code path/to/screenshot.jpg --framework html --quality safe --out ./generated-safe-html
```

Framework outputs:

| Framework | Output | Intended use |
|---|---|---|
| `html` | `index.html`, optional `assets/` | open directly in a browser |
| `react` | `App.tsx`, `tokens.css`, optional components/data/assets files | copy into an existing React project |
| `vue` | `App.vue`, `tokens.css`, optional components/data/assets files | copy into an existing Vue project |

HTML remains the default because it is the lowest-friction preview path. React and Vue outputs are framework code, not full project scaffolds, unless the user explicitly asks for a full project.

By default, the skill should crop visible image regions from the screenshot into real assets. CSS placeholders are only a fallback when cropping is impossible or `--asset-policy placeholder` is requested.

Generate quality bar:

- section order matches the screenshot
- readable visible text is copied verbatim
- exact hex colors or token variables
- centralized visual tokens
- real cropped assets for visible product, hero, gallery, and card images when possible
- proportional placeholders only as fallback
- repeated content represented as data arrays
- no generic placeholder copy
- explicit approximation notes for unavailable imagery or unreadable text

Generate does not force a full `page-contract.json` by default. That keeps token usage lower.

#### Extract: screenshot → design system

Extracts reusable design-system artifacts from a screenshot.

```txt
/image-to-code path/to/screenshot.jpg --mode structured --out ./design-system
```

Output:

```txt
design-system.json
components.json
page-analysis.json
preview.html        # optional
```

Artifact responsibilities:

- `design-system.json` stores reusable visual tokens only.
- `components.json` stores reusable component patterns.
- `page-analysis.json` stores the current page structure, visible text, image placeholders, and approximations.

Structured mode is for building reusable design language across screenshots:

- color palette
- typography scale
- spacing scale
- radius/shadow/elevation
- reusable components
- page-specific sections
- visible text inventory
- approximations and uncertainty notes

#### Reuse: screenshot + design system → same-family code

Generate framework code using an existing design system. Use this only for pages that belong to the same brand/design family.

```txt
/image-to-code path/to/next-page.jpg --framework html --design-system ./design-system/design-system.json --out ./next-html
/image-to-code path/to/next-page.jpg --framework react --design-system ./design-system/design-system.json --out ./next-react
/image-to-code path/to/next-page.jpg --framework vue --design-system ./design-system/design-system.json --out ./next-vue
```

Reuse creates or should create `page-contract.json` so the current screenshot remains the source of truth. The existing design system may influence colors, typography, spacing, radius, shadows, and component styling. It must not overwrite current-page facts such as product names, prices, nav labels, crop regions, or section order.

Update an existing design system with another screenshot:

```txt
/image-to-code path/to/next-page.jpg --mode structured --design-system ./design-system/design-system.json --out ./design-system
```

The skill should merge additively: preserve stable tokens, add variants, and record conflicts instead of silently overwriting the system.

---

### `/validate-html`

Auxiliary skill for checking generated HTML.

```txt
/validate-html path/to/output.html
/validate-html path/to/output.html --fix
```

It checks for:

- JSX syntax issues
- missing React/Tailwind/Babel CDN tags
- missing `#root`
- wrong Babel script type
- undefined component names
- placeholder text
- obvious structural problems

It does not validate React/Vue project code and does not compare the page visually against the original screenshot.

#### Validate: check artifacts

The image-to-code skill includes small deterministic helpers:

```txt
skills/image-to-code/scripts/crop-assets.mjs
skills/image-to-code/scripts/check-structured-output.mjs
skills/image-to-code/scripts/validate-page-contract.mjs
skills/image-to-code/scripts/evaluate-reuse.mjs
```

- `crop-assets.mjs` crops real image regions from a screenshot into `assets/`.
- `check-structured-output.mjs` validates the minimum structured-mode JSON contract.
- `validate-page-contract.mjs` checks that generated code preserves current-screenshot text facts and required cropped assets.
- `evaluate-reuse.mjs` combines page-contract validation with design-token reuse stats and a manual review checklist.

Validate structured output:

```sh
node skills/image-to-code/scripts/check-structured-output.mjs ./output/design-system
```

Validate a Reuse output when `page-contract.json` exists:

```sh
node skills/image-to-code/scripts/validate-page-contract.mjs ./output/page/page-contract.json ./output/page
```

Evaluate a Reuse run:

```sh
node skills/image-to-code/scripts/evaluate-reuse.mjs \
  --design-system ./output/design-system/design-system.json \
  --contract ./output/page/page-contract.json \
  --output ./output/page
```

For visual quality, use the checklist in `skills/image-to-code/references/visual-eval.md`. The evaluator intentionally does not claim pixel-perfect scoring; it standardizes what a human should inspect: layout, crop quality, density, typography, design-system consistency, and with-system vs no-system comparison.

## Installation

There are two ways to use this repo.

### Project-local slash commands

This repo includes Claude Code command wrappers:

```txt
.claude/commands/image-to-code.md
.claude/commands/validate-html.md
```

If you start Claude Code from this repo root, the commands should be available as:

```txt
/image-to-code path/to/screenshot.jpg --framework react --out ./generated-react
/validate-html path/to/output.html
```

If a command does not appear immediately, restart Claude Code from the repo root. Claude Code discovers project commands from `.claude/commands/` and skills from `.claude/skills/`.

### Personal install across projects

To use the skills from any project, copy them into your personal Claude Code skills directory:

```sh
mkdir -p ~/.claude/skills
cp -R skills/image-to-code ~/.claude/skills/image-to-code
cp -R skills/validate-html ~/.claude/skills/validate-html
```

Then restart Claude Code or open a new session. Personal skills become available as:

```txt
/image-to-code
/validate-html
```

You can also invoke the skill manually without installing it:

```txt
Use the skill at /private/tmp/image-to-code-agent-remote/skills/image-to-code/SKILL.md.
Convert /path/to/screenshot.jpg with framework react and write output to ./generated-react.
```

## Scope

The current MVP scope is:

| Action | Input | Output | Goal |
|---|---|---|---|
| Generate + html | screenshot | HTML + optional assets | zero-config browser preview |
| Generate + react | screenshot | React code + optional assets | copyable React implementation |
| Generate + vue | screenshot | Vue code + optional assets | copyable Vue implementation |
| Extract | screenshot | JSON artifacts | reusable design system |
| Reuse | screenshot + `design-system.json` | code + `page-contract.json` + assets | same-family visual consistency |
| Validate | generated artifacts | JSON report | cheap quality checkpoint |

Visual calibration against a browser-rendered screenshot is intentionally not the core MVP. It may become a later advanced workflow, but the current product promise is screenshot-to-frontend-code and screenshot-to-design-system.

## Development history

The `src/` directory contains an earlier multi-agent pipeline:

```txt
Visual Analyst → Component Architect → UI Architect → Code Generator
```

That pipeline uses local model tooling and was useful for understanding image-to-code failure modes: missing text, over-merged components, placeholder generation, invalid JSX, and weak layout hierarchy.

The production-facing deliverable is the `skills/` directory. The pipeline remains as reference and experimentation infrastructure.
