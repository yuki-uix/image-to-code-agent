# MVP Architecture

## Boundary

The MVP proves one claim: explicit analysis plus editable shared memory produces a more inspectable and controllable result than a single screenshot-to-code prompt.

It intentionally includes only:

`image -> Visual Analyst -> Component Architect -> UI Memory -> UI Architect -> Code Generator`

Intent classification, review loops, multi-image reconciliation, and long-term memory are later milestones.

## Contracts and handoffs

Each agent has one reasoning responsibility and receives only the artifacts it needs:

| Stage | Reads | Writes | Must not do |
| --- | --- | --- | --- |
| Visual Analyst | image, viewport | `layout.json` | infer components or code |
| Component Architect | visual analysis | `component-registry.json` | write React |
| UI Memory | analysis, registry, user overrides | `ui-memory.json` | hide private agent state |
| UI Architect | approved memory | `ui-architecture.json` | alter authoritative overrides |
| Code Generator | architecture, project contract, tokens | `react-page.tsx` | redesign architecture |

`ModelClient` is the provider boundary. The checked-in `ReplayModelClient` makes Golden Cases deterministic; a production vision-model adapter can implement the same two methods.

## Editable memory

Memory is a versioned JSON artifact, not conversation history. `decisionsAndOverrides` records user intent, while the effective `componentRegistry` reflects it. The MVP implements component rename and merge. Split is represented in the contract but deliberately awaits a UI and evidence-selection design.

For an interactive product, pause after `ui-memory.json`, let the user edit it, validate it, then resume with UI Architect. The current CLI accepts an overrides file and performs that operation in a single run.

## Next engineering slice

1. Add a production multimodal `ModelClient` with schema-constrained outputs.
2. Add runtime contract validation and actionable repair prompts.
3. Split pipeline execution into resumable stages around the Memory checkpoint.
4. Add screenshot rendering plus pixel/structure/accessibility review.
5. Compare the Golden Cases against a direct screenshot-to-code baseline.
