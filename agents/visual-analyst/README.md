# Visual Analyst workbench

This directory is the tuning surface for one agent. Edit `prompt.md`, keep `schema.json` stable unless the contract itself changes, and save each run to a different output directory.

Run against a local Ollama vision model:

```sh
npm run visual:analyze -- \
  --image /absolute/path/to/screenshot.png \
  --model qwen2.5vl:7b \
  --out outputs/visual-analyst/experiment-001
```

Each experiment produces:

- `analysis.json`: the model observation
- `geometry-validation.json`: deterministic coordinate checks
- `run.json`: model, image, dimensions, prompt, and schema provenance

PNG input is recommended. PNG and SVG dimensions are detected automatically; pass `--width` and `--height` for other formats when detection is unavailable.

Do not tune the prompt on one screenshot only. Keep the prompt fixed while running a batch of Golden Cases, then compare region, element, hierarchy, relation, and geometry scores.
