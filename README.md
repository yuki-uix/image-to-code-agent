# image-to-code

Turn any UI screenshot into browser-ready HTML — as a Claude Code skill, no build step required.

## Skills

This repo ships two Claude Code skills. Install them by copying the `skills/` directory into your Claude skills folder.

### `/image-to-code`

Converts a screenshot into a self-contained HTML file that reproduces the visual design. Uses Claude's own vision — no Ollama, no local models, no external dependencies.

**What it generates:**
- React 18 + Tailwind CSS + Babel standalone (CDN, runs in any browser)
- Exact brand colors via Tailwind arbitrary values (`bg-[#b5ff47]`)
- Verbatim copy for all visible text — no placeholder content
- SVG approximations for decorative illustrations
- Correct layout structure (grid, flex, columns) matching the original

**Usage:**
```
/image-to-code path/to/screenshot.jpg
/image-to-code path/to/screenshot.png --out path/to/output.html
```

**Example output:** see [`outputs/`](./outputs/) for generated HTML previews.

---

### `/validate-html`

Checks a generated HTML file for common AI output problems and optionally repairs them.

**What it checks:**
- JSX syntax errors (string literals as children, bare component references, unclosed tags)
- Undefined component names that would throw at runtime
- Missing CDN script tags
- Placeholder text that wasn't replaced
- Structural problems (components nested where they shouldn't be)

**Usage:**
```
/validate-html path/to/output.html
/validate-html path/to/output.html --fix
```

---

## Installation

Copy both skills into your Claude Code skills directory:

```sh
# macOS
cp -r skills/image-to-code ~/Library/Application\ Support/Claude/...your-skills-path.../
cp -r skills/validate-html ~/Library/Application\ Support/Claude/...your-skills-path.../
```

Or clone this repo and symlink the `skills/` folder.

> The exact path depends on your Claude Code installation. Check Settings → Skills to find your skills directory.

---

## How it works

The skills use Claude's multimodal vision to analyze the screenshot directly — no intermediate vision model, no agent pipeline. The approach:

1. **Analyze** — Claude reads the image and extracts colors, layout structure, typography, and all visible text
2. **Generate** — Claude writes a complete React component tree with exact hex colors and verbatim copy
3. **Output** — a single `.html` file that opens directly in a browser

This produces dramatically better visual fidelity than a pipeline built around a smaller vision model, while being simpler to install and run.

---

## Development history

The `src/` directory contains an earlier multi-agent pipeline (Visual Analyst → Component Architect → UI Architect → Code Generator) built around Ollama + qwen2.5vl. That approach was useful for understanding what makes image-to-code hard — color extraction, layout inference, avoiding placeholder text — but the output quality didn't match direct Claude generation.

The skills in `skills/` are the production deliverable. The pipeline code in `src/` is kept as reference.
