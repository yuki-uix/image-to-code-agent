# image-to-code

A Claude Code skill for turning UI screenshots into either:

1. a self-contained browser-ready HTML file, or
2. reusable design-system artifacts for future screenshots.

The skill is not a separate model and does not require Ollama, qwen, npm install, React install, Tailwind install, or a build step. It uses Claude/Codex vision directly, but wraps direct generation in a disciplined workflow: visual audit, exact colors, real text, component structure, CSS variables, structured artifacts, and validation.

## Why not just ask Claude/Codex directly?

Claude Code and Codex can already generate HTML from an image. This skill is useful because it makes the process repeatable:

- fixed workflow instead of ad hoc prompting
- explicit quality gates
- no placeholder text
- exact hex colors instead of default Tailwind colors
- self-contained HTML output
- reusable `design-system.json` in structured mode
- clear separation between page-specific sections and reusable components

It is a workflow and quality standard, not a smarter underlying model.

## Skills

This repo currently ships two Claude Code skills.

### `/image-to-code`

Main entry point.

#### Simple mode

Default mode. Converts a screenshot into one `.html` file that opens directly in a browser.

```txt
/image-to-code path/to/screenshot.jpg
/image-to-code path/to/screenshot.jpg --out path/to/output.html
```

Output:

```txt
output.html
```

The HTML uses:

- React 18 CDN
- ReactDOM CDN
- Babel standalone
- Tailwind CDN
- exact hex colors and CSS variables
- copied visible text when readable
- proportional placeholders for unavailable images

Simple mode is for quick page generation. It aims for a faithful first pass, not pixel-perfect reproduction.

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

Generate a new page using an existing design system:

```txt
/image-to-code path/to/next-page.jpg --design-system ./design-system/design-system.json --out next-page.html
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

It does not compare the page visually against the original screenshot.

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
| simple | screenshot | self-contained HTML | quick browser-ready page |
| structured | screenshot | JSON artifacts | reusable design system |
| simple + design system | screenshot + `design-system.json` | self-contained HTML | cross-page visual consistency |
| structured + design system | screenshot + `design-system.json` | updated JSON artifacts | incremental design-system growth |

Visual calibration against a browser-rendered screenshot is intentionally not the core MVP. It may become a later advanced workflow, but the current product promise is zero-config screenshot-to-HTML and screenshot-to-design-system.

## Development history

The `src/` directory contains an earlier multi-agent pipeline:

```txt
Visual Analyst → Component Architect → UI Architect → Code Generator
```

That pipeline uses local model tooling and was useful for understanding image-to-code failure modes: missing text, over-merged components, placeholder generation, invalid JSX, and weak layout hierarchy.

The production-facing deliverable is the `skills/` directory. The pipeline remains as reference and experimentation infrastructure.
