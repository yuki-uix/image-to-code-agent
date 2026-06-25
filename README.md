# image-to-code

A Claude Code skill for turning UI screenshots into frontend code or reusable design-system artifacts.

The default output is a zero-config self-contained HTML preview, but HTML is not the only target. The skill can also generate React or Vue code for an existing project.

The skill is not a separate model and does not require Ollama, qwen, npm install, React install, Tailwind install, or a build step for the default HTML output. It uses Claude/Codex vision directly, but wraps direct generation in a disciplined workflow: visual audit, exact colors, real text, component structure, framework-aware output, CSS variables, structured artifacts, and validation.

## Why not just ask Claude/Codex directly?

Claude Code and Codex can already generate code from an image. This skill is useful because it makes the process repeatable:

- fixed workflow instead of ad hoc prompting
- explicit quality gates
- framework-specific output contracts
- no placeholder text
- exact hex colors instead of default Tailwind colors
- centralized visual tokens
- reusable `design-system.json` in structured mode
- clear separation between page-specific sections and reusable components

It is a workflow and quality standard, not a smarter underlying model.

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
```

Framework outputs:

| Framework | Output | Intended use |
|---|---|---|
| `html` | one self-contained `.html` file | open directly in a browser |
| `react` | `App.tsx`, `tokens.css`, optional components/data files | copy into an existing React project |
| `vue` | `App.vue`, `tokens.css`, optional components/data files | copy into an existing Vue project |

HTML remains the default because it is the lowest-friction preview path. React and Vue outputs are framework code, not full project scaffolds, unless the user explicitly asks for a full project.

All frameworks share the same quality bar:

- section order matches the screenshot
- readable visible text is copied verbatim
- exact hex colors or token variables
- centralized visual tokens
- proportional placeholders for unavailable images
- repeated content represented as data arrays
- no generic placeholder copy

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

Copy the skills into your Claude Code skills directory:

```sh
cp -r skills/image-to-code <your-claude-skills-dir>/
cp -r skills/validate-html <your-claude-skills-dir>/
```

Or clone this repo and symlink the skill folders.

The exact skill directory depends on your Claude Code setup. Check Claude Code settings for the active skills directory.

## Scope

The current MVP scope is:

| Mode | Input | Output | Goal |
|---|---|---|---|
| simple + html | screenshot | self-contained HTML | zero-config browser preview |
| simple + react | screenshot | React code | copyable React implementation |
| simple + vue | screenshot | Vue code | copyable Vue implementation |
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
