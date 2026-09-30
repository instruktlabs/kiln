# Kiln roadmap

Kiln **0.9.0** is the current release: standalone authoring with optional projects, a
material library and Live Review in the packaged local dashboard, the calibrated
`review-neutral-v1` review rig, compact tool results, and the fixes authors reported
against 0.8. [CHANGELOG.md](CHANGELOG.md) lists the changes. The
[foundation checkpoint](docs/plans/2026-09-26-project-foundation.md) is history: it records
how projects, materials and Live Review were qualified, and the changelog describes 0.9.0.
Dated plans and reviews under `docs/` record how earlier work was qualified; the September
dogfooding and stabilisation work is in [dogfooding](docs/dogfooding.md),
[headless harnesses](docs/harnesses.md) and Phase 17 of the
[engine ledger](docs/plans/repo-size-and-r2-migration-2026-09-10.md).

## Next

1. **Farm pilot.** Begin the [Farm pilot](docs/plans/2026-09-26-farm-pilot-brief.md) as a
   production step in a separate asset workspace: its 23-asset inventory and individual
   references, a project profile and scale lineup, then a qualified shared material and
   shape slice before production expands. The assembled Farm scene needs its own artistic
   and performance acceptance.
2. **Later.** Ten-pack production, engine-specific importer qualification and a public
   Commons/package launch.

Projects remain optional for every other kind of standalone authoring.

## Requests not adopted in 0.9

Authors asked for these while using 0.8. Each is a new contract that needs an owner
decision before it is built:

- per-part transforms in `listParts` output;
- `userData` exported as glTF `extras`, and a node-visibility extension (core glTF has none);
- easing curves for `createClip`;
- a choice of index policy for exported buffers;
- a self-intersection check for `sweepProfile`;
- a hide-node option in versioned captures (`visibility: "isolate"` covers subject-only shots);
- a per-part "intentionally open" annotation for overlap QA;
- a level-of-detail authoring workflow, including which level a default sheet shows;
- an output path on MCP render tools (CLI `--views` and `--capture` write files).

## Deferred

| Item | State |
|---|---|
| `kiln_present` puts up to 16 MiB of base64 in `_meta` | Deferred by decision. The shape is settled and the MCP Apps spec confirms it: a UI iframe may call `resources/read`, so the widget can fetch what the manifest names. The over-limit behaviour is a graceful refusal, not a failure |
| SEP-2640 / `skill://` resources | Deferred by decision; see ledger 7.12 and 14.1 |

## Dependencies

| Family | State |
|---|---|
| `three` r186 + `@types/three` 0.186.0 | **Taken.** Both are pinned at 0.186.0 in every manifest that uses them |
| `webgpu` 0.6.1 in `render-service/` | **Taken** after the GPU smoke it was gated on passed: `dawn-vulkan` on a GTX 1660 Ti boots and renders through the engine |
| `zod` 4.6.4 | **Taken** |
| `ai` 6→7, `@ai-sdk/provider` 3→4, `@openrouter/ai-sdk-provider` 2→3, `openai` 6→7 | **Blocked upstream, not by money.** `@strands-agents/sdk@1.18.0` peer-requires `@ai-sdk/provider: ^3.0.0`, while `@openrouter/ai-sdk-provider@3` requires `ai: ^7`, which depends on provider 4 |
