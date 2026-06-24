# Component Architect workbench

This directory is the tuning surface for the second agent. Edit `prompt.md`, keep `schema.json` stable unless the registry contract itself changes, and save each run to a separate output directory.

Run against a local Ollama model after producing a visual analysis:

```sh
npm run component:extract -- \
  --analysis outputs/visual-analyst/experiment-006/analysis.json \
  --out outputs/component-architect/experiment-001
```

Each experiment produces:

- `component-registry.json`: normalized registry used by the system
- `component-validation.json`: deterministic registry checks
- `raw-component-registry.json`: parsed raw model output
- `raw-component-registry.txt`: original model response text
- `run.json`: provenance for the experiment

Tune this prompt across several screenshots, not just one page. Compare component naming, repeated-pattern detection, variant quality, and evidence quality across your Golden Cases.
