# image-to-code

A Claude Code skill for turning UI screenshots into frontend code or reusable design-system artifacts.

The default output is a zero-config self-contained HTML preview, but HTML is not the only target. The skill can also generate React or Vue code for an existing project.

The skill is not a separate model and does not require Ollama, qwen, npm install, React install, Tailwind install, or a build step for the default HTML output. It uses Claude/Codex vision directly, but wraps direct generation in a disciplined workflow: visual audit, exact colors, real text, component structure, framework-aware output, CSS variables, structured artifacts, and validation.

## Why not just ask Claude/Codex directly?

Claude Code and Codex can already generate code from an image. This skill is useful because it turns one-off generation into a repeatable workflow with reusable outputs.

### What value does this skill add?

Direct prompting gives you a one-time result; this skill extracts reusable assets, design tokens, component structure, page analysis, and framework-specific code contracts. It is not trying to be a smarter model — it is a workflow and quality standard around the model. The benefit is more stable repeated output: fewer placeholders, less random structure, and better cross-page consistency.

### How is this different from existing image-to-code tools?

Most image-to-code flows focus on recreating the current screenshot. This skill is designed to produce intermediate artifacts that can survive beyond one page: cropped image assets, `design-system.json`, `components.json`, and `page-analysis.json`. Those artifacts can then drive HTML, React, or Vue output for future screenshots.

### When should I use it?

Use direct model prompting if you only need a quick one-off HTML demo. Use this skill when you want to preserve the screenshot’s visual system, reuse it on the next page, generate different framework targets, or build a small design-system trail as you go.

In short: simple mode gets you usable frontend code now; structured mode turns the screenshot into reusable design-system material.

## Skills

This repo currently ships two Claude Code skills.

### `/image-to-code`

Main entry point.

#### Simple mode

Default mode. Converts a screenshot into frontend code.

```txt
/image-to-code path/to/screenshot.jpg
/image-to-code path/to/screenshot.jpg --framework html --out output.html
/image-to-code path/to/screenshot.jpg --framework react --out ./generated-react
/image-to-code path/to/screenshot.jpg --framework vue --out ./generated-vue
/image-to-code path/to/screenshot.jpg --framework html --asset-policy crop --out ./generated-html
```

Framework outputs:

| Framework | Output | Intended use |
|---|---|---|
| `html` | `index.html`, optional `assets/` | open directly in a browser |
| `react` | `App.tsx`, `tokens.css`, optional components/data/assets files | copy into an existing React project |
| `vue` | `App.vue`, `tokens.css`, optional components/data/assets files | copy into an existing Vue project |

HTML remains the default because it is the lowest-friction preview path. React and Vue outputs are framework code, not full project scaffolds, unless the user explicitly asks for a full project.

By default, the skill should crop visible image regions from the screenshot into real assets. CSS placeholders are only a fallback when cropping is impossible or `--asset-policy placeholder` is requested.

All frameworks share the same quality bar:

- section order matches the screenshot
- readable visible text is copied verbatim
- exact hex colors or token variables
- centralized visual tokens
- real cropped assets for visible product, hero, gallery, and card images when possible
- proportional placeholders only as fallback
- repeated content represented as data arrays
- no generic placeholder copy
- explicit approximation notes for unavailable imagery or unreadable text

#### Structured mode

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

#### Using an existing design system

Generate framework code using an existing design system:

```txt
/image-to-code path/to/next-page.jpg --framework react --design-system ./design-system/design-system.json --out ./next-react
/image-to-code path/to/next-page.jpg --framework vue --design-system ./design-system/design-system.json --out ./next-vue
```

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

| Mode | Input | Output | Goal |
|---|---|---|---|
| simple + html | screenshot | HTML + optional assets | zero-config browser preview |
| simple + react | screenshot | React code + optional assets | copyable React implementation |
| simple + vue | screenshot | Vue code + optional assets | copyable Vue implementation |
| structured | screenshot | JSON artifacts | reusable design system |
| simple + design system | screenshot + `design-system.json` | html/react/vue code | cross-page visual consistency |
| structured + design system | screenshot + `design-system.json` | updated JSON artifacts | incremental design-system growth |

Visual calibration against a browser-rendered screenshot is intentionally not the core MVP. It may become a later advanced workflow, but the current product promise is screenshot-to-frontend-code and screenshot-to-design-system.

## Development history

The `src/` directory contains an earlier multi-agent pipeline:

```txt
Visual Analyst → Component Architect → UI Architect → Code Generator
```

That pipeline uses local model tooling and was useful for understanding image-to-code failure modes: missing text, over-merged components, placeholder generation, invalid JSX, and weak layout hierarchy.

The production-facing deliverable is the `skills/` directory. The pipeline remains as reference and experimentation infrastructure.
