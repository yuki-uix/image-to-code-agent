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
