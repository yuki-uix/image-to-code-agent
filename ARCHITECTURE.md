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

Visual Analyst treats bounding boxes as measurement evidence. Its local workbench separates VLM observation from deterministic geometry validation, and emphasizes relative layout relations over absolute positioning.

`ModelClient` is the provider boundary. The checked-in `ReplayModelClient` makes Golden Cases deterministic; a production vision-model adapter can implement the same two methods.

## Grounding and asset generation when running inside Claude Code

The primary, everyday path (the `/image-to-code` skill invoked from a live Claude Code session) does not go through a `ModelClient` adapter at all for Visual Analyst grounding or Reference Review critique. It dispatches a sub agent to shell out to `codex exec -m gpt-5.5 --output-schema agents/visual-analyst/schema.strict.json`, reusing `agents/visual-analyst/prompt.md`'s instructions verbatim, and keeping the model's verbose raw output out of the orchestrating session's context. Note `schema.strict.json`, not the canonical `schema.json`: the canonical file's `layout`/`hierarchy`/`visualTokens` fields are bare `{"type":"object"}` without `additionalProperties:false`, which OpenAI's strict schema mode for `--output-schema` rejects outright (`invalid_json_schema`, confirmed by hand) before the model runs at all. `schema.strict.json` is a dedicated, verified-working variant: every object is fully closed and required (nullable unions express optionality), and `hierarchy.children` — an arbitrary-keyed dictionary in the canonical contract, inexpressible in strict mode — is encoded as an array of `{id, childIds}` pairs and converted back to the canonical map shape immediately after the call, before anything else touches it. Verified end to end against a real screenshot: schema accepted, correct shape, bboxes pixel-accurate. Reasoning stages (Component Architect, UI Architect, Code Generator) run as the orchestrating session's own work — no adapter needed, since that session already is the model. Asset generation defaults to `scripts/generate-assets.mjs`, which shells directly to the Codex-managed imagegen channel. A portable `ModelClient`-based adapter (item 1 below) remains valuable only for running this pipeline outside a Claude Code session entirely; it is not required for the primary path.

## Editable memory

Memory is a versioned JSON artifact, not conversation history. `decisionsAndOverrides` records user intent, while the effective `componentRegistry` reflects it. The MVP implements component rename and merge. Split is represented in the contract but deliberately awaits a UI and evidence-selection design.

For an interactive product, pause after `ui-memory.json`, let the user edit it, validate it, then resume with UI Architect. The current CLI accepts an overrides file and performs that operation in a single run.

## Next engineering slice

1. Add a production multimodal `ModelClient` with schema-constrained outputs — deferred; the sub-agent-dispatch pattern above covers the primary path without it. Revisit only if a non-Claude-Code runtime is needed.
2. Add runtime contract validation and actionable repair prompts.
3. Split pipeline execution into resumable stages around the Memory checkpoint.
4. Add screenshot rendering plus pixel/structure/accessibility review — see `scripts/fidelity-loop.mjs` and `references/visual-eval.md`'s dual-critique Reference Review tier.
5. Compare the Golden Cases against a direct screenshot-to-code baseline.
