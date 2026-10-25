# Kiln roadmap

Updated 25 October 2026 after the public 1.5.0 release.
Scene performance evidence below retains its original candidate scope; Cabin in
the Woods carries its own 1.2.3 review report.
[CHANGELOG.md](CHANGELOG.md) defines engine release behavior.
The [backlog](docs/backlog.md) separates completed work, known limits and future decisions.
Dated plans and reviews retain their original candidate scopes.

## Delivered

Kiln 1.5.0 is published on npm as `@instruktlabs/kiln`, with a matching
[GitHub release and tag](https://github.com/instruktlabs/kiln/releases/tag/v1.5.0).
The public site is deployed with the 1.5.0 publication record. Standalone authoring,
optional projects, materials, Live Review, calibrated review lighting, bounded
tool results, the compiled SDK and shared CLI/MCP contracts remain the core.

Version 1.4.0 collects fixes and features from a dogfood pass that built Holodeck
scenes with Kiln: the opt-in `kiln_export_to` tool, runtime texture manifests,
content-addressed external textures and optional KTX2 encoding, a host validation
profile, `externalSupport` declarations, curve and foliage helpers, metric
`projectUV`, height-derived normal maps and two new material preset sets.

Version 1.5.0 completes that pass: `--max-lod` and `--position-bits` on the three
runtime target, an instanced-draw estimate beside the draws cap, `seededRandom`,
`simplifyGeometry`, material advice kept apart from declared budgets, save deltas
against the parent revision and tiling material map export.

Version 1.3.0 adds optional delivery roles, colliders, anchors, kit ports, surface
bakes, budgets, solid assertions, atlas packing and a compressed Three.js runtime
target. Selected organic helpers contributed by
[FaberVi](https://github.com/FaberVi) are integrated with attribution, alongside
review/export fidelity fixes, Windows material-publication recovery, renderer
startup fixes and maintained authoring guidance. No default asset budget,
universal closed-mesh rule or mandatory modeling approach is introduced.
See the [changelog](CHANGELOG.md) and [delivery contract](docs/delivery-contract.md).

The public repository is owned by Instrukt Labs. Hosted access is a separate,
invite-only service; public package publication does not upgrade or qualify its
runtime. See the [community and hosted access information](README.md#community-and-hosted-access).

The completed scene optimization pass landed in #131, ORM UV/transform fixes in
#132 and the core/stabilization/site follow-ups in #133. Their bounded qualification
and remaining performance limits are recorded in the
[3 October release disposition](docs/reviews/2026-10-03-release-disposition.md).
These are completed changes, not an instruction to restart that pass.

Troy's maintained, portable scene source is
[scenes/packages/troy](scenes/packages/troy/README.md).
The coast, terrain/ocean, fleet transitions, crowds and archers, playable
Achilles/Hector, combat, blocking, stamina, bots, simple hands/grips and consistent
scene controls are delivered. The old private playfield-review prototype is retired.

The public site now includes Troy's and Cabin in the Woods' scenes, packs and
galleries, together with Farm, Vehicles, Bridge and Foundry packs. All six packs have
source in `packs/`; all five runnable scenes have source in `scenes/packages/`.
Vehicles supplies shared assets rather than a runnable scene of its own.
Runtime and Editable downloads are available across the packs. Large generated
payloads are delivered through
Cloudflare R2; hydration is optional, so cloning source does not fetch them.
The [delivery/source plan](docs/plans/2026-10-05-asset-delivery-and-source-organization.md)
records the adopted organization.

Current site pins at this checkpoint are Farm `r36-local-review`, Bridge
`g9-code6`, Foundry `ff3-review2-code5`, Troy `troy-20261005-07` and Cabin
`cabin-20261012-01`.
The public text encoding cleanup, Troy homepage pictures and revised Foundry
campus preview are deployed. The current data manifests govern subsequent pins;
this dated list is not a substitute for inspecting them.

## Next engine and product milestones

1. Carry forward the explicitly unfinished work in the
   [1.3.0 cycle handoff](docs/backlog.md#cycle-handoff-17-october). The delivery
   contract, selected organic helpers and reviewed dogfood guidance have shipped;
   their old proposal branches are not pending engine work.
2. Qualify broader destination/importer support when adopted, especially LOD,
   visibility and optional compressed runtime derivatives. Current scene delivery
   does not imply universal Meshopt, Draco or KTX2 loader support.
3. Review the prepared scenes trailer and any new packs as separate product work.
   Continue applicable directory submissions independently of package publication.
   Local Claude Code/Codex plugins are distributed with the public package;
   hosted runtime changes require their own qualification and release.

The full optimizer now preserves semantic nodes, hierarchy, placements, animated
targets and LOD relationships; ordinary named meshes can become empty semantic
nodes. Old unversioned full-mode source must replay with its original engine or
produce an explicit new revision under the new contract. Standalone saved asset
revisions are not silently replaced by scene optimization derivatives.

## Qualification limits

The quiet hub target remains 60 FPS at 1440x900, balanced, including combat and
fleet transitions. Retained Troy timings are scoped to their exact candidates;
release 07 preserves release 06 model/bank payloads. Frame tails remain, so neither
mean FPS nor deployment establishes a locked-60 guarantee. Reduced Samsung-tablet
measurements exist; physical-device and all-tier acceptance remain separate.

The earlier Farm/Bridge/Foundry strict timing failures and unresolved Farm late-GC
allocation ownership remain in the
[release disposition](docs/reviews/2026-10-03-release-disposition.md).
A later passing repeat does not erase those failures. No additional broad
benchmark campaign or speculative patch follows without a reproducible problem.

Full-army casualties/projectile damage, boarding, wall climbing, an RTS campaign
and optional living-horse running contacts are outside the delivered Troy endpoint.
They are potential new scope, not prerequisites for the published scene.

## Authoring request dispositions

| Request | Current state |
| --- | --- |
| Per-part transforms | Requested `listParts` placement output |
| JSON extras and visibility | Bounded `userData` and `KHR_node_visibility` |
| Animation easing and index policy | Cubic samplers and indexed/as-built policies; as-built requires optimization off |
| Sweep self-intersection | Bounded local/adjacent-ring analysis; no general distant-intersection guarantee |
| Hide-node capture | `kiln.capture.v2` |
| Intentional open shells | `markOpenShell`; measured overlap failures still apply |
| LOD authoring/review | `defineLod`, `MSFT_lod`, LOD0 default views and per-level inspection; verify destination support |
| MCP export file destination | Adopted (opt-in `KILN_EXPORT_ROOT`, `kiln_export_to`); render file output remains unadopted: delivery starts from a saved revision |

Projects remain optional for standalone authoring.

## Deferred decisions and dependencies

| Item | Disposition |
| --- | --- |
| Large `kiln_present` metadata | Existing bounded behavior retained; resource-fetch redesign deferred |
| SEP-2640 / `skill://` resources | Deferred by decision; engine ledger sections 7.12 and 14.1 |
| Three.js/types/WebGPU | Exact compatible pins 0.186.1 / 0.186.0 / 0.6.2 on main |
| Maintainer Node/Bun/npm | 22.23.3 / 1.4.2 / 12.2.0; consumer Node support is a separate contract |
| TypeScript | Root/scenes 7.0.2; site and compiler-API alias 6.0.3 intentionally |
| AI SDK/provider/OpenRouter/OpenAI majors | Held by Strands peer compatibility; compatible updates are implemented |

Use the current locks, `toolchain.json` and changelog when preparing another release.
Historical Troy stage notes and the retired review workflow are summarized in the
[reconciliation record](docs/reviews/2026-10-05-status-reconciliation.md).
