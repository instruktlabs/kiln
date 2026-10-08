# Kiln roadmap

Updated 7 October 2026 for the public 1.1 release cycle. Delivered scene evidence
below remains the 5 October checkpoint; it does not attest to a new scene release.
[CHANGELOG.md](CHANGELOG.md) defines engine release behavior.
The [backlog](docs/backlog.md) separates completed work, known limits and future decisions.
Dated plans and reviews retain their original candidate scopes.

## Delivered

Kiln 1.0.0 is published on npm as `@instruktlabs/kiln`, with a matching GitHub
release and tag. Standalone authoring, optional projects,
materials, Live Review, calibrated review lighting, bounded tool results and the
current CLI/MCP contracts are included. This release incorporated the previously
planned 0.11 optimizer changes, compiled SDK and compatible dependency upgrades.
The public repository is owned by Instrukt Labs. The separate private hosted
application has a tested main-branch handoff; its public deployment is deferred.

The completed scene optimization pass landed in #131, ORM UV/transform fixes in
#132 and the core/stabilization/site follow-ups in #133. Their bounded qualification
and remaining performance limits are recorded in the
[3 October release disposition](docs/reviews/2026-10-03-release-disposition.md).
These are completed changes, not an instruction to restart that pass.

Troy's hub source and in-progress work have been migrated to this computer. The
maintained, portable scene source is [scenes/packages/troy](scenes/packages/troy/README.md).
Development continues locally; the hub is used for isolated performance testing.
The coast, terrain/ocean, fleet transitions, crowds and archers, playable
Achilles/Hector, combat, blocking, stamina, bots, simple hands/grips and consistent
scene controls are delivered. The old private playfield-review prototype is retired.

The public site now includes Troy's scene, pack and gallery, together with Farm,
Vehicles, Bridge and Foundry packs. All five packs have source in `packs/`; all
four runnable scenes have source in `scenes/packages/`. Vehicles supplies shared
assets rather than an invented fifth scene. Runtime and Editable downloads are
available across the packs. Large generated payloads are delivered through
Cloudflare R2; hydration is optional, so cloning source does not fetch them.
The [delivery/source plan](docs/plans/2026-10-05-asset-delivery-and-source-organization.md)
records the adopted organization.

Current site pins at this checkpoint are Farm `r36-local-review`, Bridge
`g9-code6`, Foundry `ff3-review2-code5` and Troy `troy-20261005-07`.
The public text encoding cleanup, Troy homepage pictures and revised Foundry
campus preview are deployed. The current data manifests govern subsequent pins;
this dated list is not a substitute for inspecting them.

## Next engine and product milestones

1. Finish the [public 1.1 release](docs/plans/2026-10-07-public-release-goal.md):
   shared setup for existing projects and new workspaces, stable host SDK
   interfaces, concise npm-first documentation, Troy README images and blind
   clone/package dogfooding. Qualify the exact archive, publish the approved npm
   version and GitHub release, then deploy and verify the updated static site.
2. Qualify broader destination/importer support when adopted, especially LOD,
   visibility and optional compressed runtime derivatives. Current scene delivery
   does not imply universal Meshopt, Draco or KTX2 loader support.
3. In a later hosting cycle, qualify and deploy the authenticated Cloudflare
   service and resume applicable vendor directory submissions. Local Claude
   Code/Codex plugins are distributed with the public package. Hosted
   access stays free within quotas, with optional sponsorship and no user billing.
   Track npm publication, hosting, plugin distribution and vendor review separately.
   Hosting launch, further packs and community contribution triage stay outside
   the current public release cycle.

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
| MCP render file destination | Unadopted; CLI file output and MCP media/receipts remain supported |

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
