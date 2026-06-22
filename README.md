# Image-to-Code Agent Framework

An inspectable MVP for turning one screenshot into React through specialized agents and editable UI Memory.

## Run the deterministic demo

Requires Node.js 23.6 or newer (native TypeScript type stripping):

```sh
npm test
npm run demo
```

The demo writes these artifacts to `outputs/demo/`:

- `layout.json`
- `component-registry.json`
- `ui-memory.json`
- `ui-architecture.json`
- `react-page.tsx`

The replay responses are a test seam, not fake production intelligence. Replace `ReplayModelClient` with a multimodal implementation of `ModelClient` to analyze real screenshots; the pipeline and agents remain unchanged.

## Apply a user override

Create an overrides file:

```json
{
  "rename_component": {
    "Tag": "TopicChip"
  }
}
```

Then add `--overrides path/to/overrides.json` to the CLI command. Overrides are stored in UI Memory and applied before UI Architect runs.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for responsibilities, boundaries, and the next implementation slice.

## Tune Visual Analyst locally

The first agent now has an independent Ollama workbench. Install Ollama and pull the default vision model:

```sh
brew install --cask ollama
ollama pull qwen2.5vl:7b
```

Open the Ollama application, then analyze one PNG screenshot without running the rest of the pipeline:

```sh
npm run visual:analyze -- \
  --image /absolute/path/to/screenshot.png \
  --out outputs/visual-analyst/experiment-001
```

Edit `agents/visual-analyst/prompt.md` between experiments. The model output, deterministic geometry report, and run metadata are written together so experiments remain comparable. Use `--model qwen2.5vl:3b` on a lower-memory machine.
