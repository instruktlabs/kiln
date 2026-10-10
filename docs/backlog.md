# Kiln current backlog

Current release status: npm 1.2.1 and GitHub v1.2.1 are published.
Scene delivery evidence below retains its 5 October scope.
This is a work queue and known-limit inventory, not a count of defects.
The [roadmap](../ROADMAP.md) describes the delivered state and future milestones.
[Historical reports](reviews/2026-10-05-status-reconciliation.md) keep their original
test, device and candidate scopes.

## Completed delivery cycle

The hub migration, Troy environment/gameplay/control/asset work, public scene
integration, pack downloads, portable scene source and source organization are
complete. Development happens on this computer; the hub is reserved for isolated
performance testing. The canonical Troy entry is
[scenes/packages/troy](../scenes/packages/troy/README.md).

All five packs (Farm, Vehicles, Bridge, Foundry and Troy) have checked-in editable
source; all four runnable scenes have maintained source packages. Runtime and
Editable downloads are public. Large generated files remain outside the normal
clone through hash-pinned Cloudflare R2 delivery and explicit hydration.
Bridge is in the gallery. The unwanted Battle before the gate composition is
removed from gallery presentation while its saved source/history remains.

Current scene pins are Farm `r36-local-review`, Bridge `g9-code6`, Foundry
`ff3-review2-code5` and Troy `troy-20261005-07`.
The horse-ear child revision, loading transport/bundling changes, public-text
encoding guard, Troy homepage images and revised Foundry campus preview are delivered.
The obsolete private `/reviews/troy/` prototype has been retired; use the normal
public scene, pack and gallery flow.

The following original alignment IDs are closed within their recorded scope.
They remain useful regression contracts when a later change touches that surface.

| IDs | Implemented and delivered scope |
| --- | --- |
| CORE-1 | Shared-image ORM isolation, distinct AO consumers and serialized output |
| CORE-2, CORE-3, CORE-4 | Full-export semantic preservation, draw/byte policy, conditioned transforms, split limits and versioned rebuild diagnostics on main |
| CORE-5 | Bounded D23 diagnostics and maintained guidance, fresh setup and managed upgrades |
| UPGRADE-1, UPGRADE-2 | Compatible exact dependencies/toolchain, renderer identity and scoped both-backend checks |
| ASSET-1, ASSET-2 | Revision/inventory reconciliation, source corpus and hash-pinned public deliveries; Troy is now included |
| TOOL-1, TOOL-2, TOOL-3 | Portable inputs/browser launch, script gates and owned browser lifecycle |
| KIT-1, KIT-2, KIT-3, KIT-4, KIT-5, KIT-6 | WebP serving, HUD/touch/input ownership, shadow motion, preserved interaction and parity/timing tools |
| FARM-1, FARM-2, FARM-4, FARM-5 | Trailer shadows, paired pilot audit, farmer motion and scoped camera/input repairs |
| GG-1, GG-2, GG-3, GG-4, GG-5 | Depth/reflection/layout delivery, targeted startup pipeline repair and owner-observed water fixes; timing limitations remain below |
| FF-1 | Optimized Foundry runtime with retained campus/interior behavior |
| PERF-1 | Intended focused investigation completed; failed strict results preserved, no actionable new regression established |
| SITE-1, SITE-2, SITE-3 | Portable deploy preflight, sealed deliveries and qualified public flows, including Troy |
| RELEASE-1 | Published npm 1.0.0 and GitHub v1.0.0, with exact archive and installed-package qualification |

PR #131 completed the scene runtime optimization pass. #132 fixed ORM UV/transform
handling; CORE-1's shared-image isolation and the remaining core changes landed
through #133 and shipped in npm 1.0.0. Later candidate changes still require their
own package qualification and publication.

## Remaining package and product work

| Item | Completion boundary |
| --- | --- |
| Authoring guidance follow-up | PR #163 contains circular-wall orientation and export-receipt guidance; still unmerged at the October 9 readback and not included in npm 1.2.1 |
| Hosted service | Invite-only launch work is owned by the private application's handoff; public package publication does not establish hosted availability |
| Community and site alignment | Discord setup, hosted-access instructions and current-version documentation are in progress; publish only after review |
| Directory submissions | Separate from package publication and hosted deployment; no submission is implied by either |
| Further packs | Separate product work; ten-pack production is not a Troy release chore |
| Broader importer qualification | Actual destination tests for LOD, visibility and supported export profiles |
| Optional compressed runtime derivatives | Explicit loader/profile adoption and measured size/startup/render tradeoffs; current shared runtime loading is not universal Meshopt/Draco/KTX2 support |
| New derivative guidance | Demonstrated authoring/workflow evidence beyond Troy before promoting a scene-specific lesson to shared guidance |

Full optimization preserves semantic nodes while potentially emptying ordinary
named mesh geometry. Off/palette modes retain their documented geometry contracts.
Old unversioned full-mode source must use the original engine or an explicit new
revision; never silently rewrite saved revisions.

## Known limits and evidence-triggered work

| Item | Current disposition |
| --- | --- |
| FARM-3 late hero-view hitch | Late major GC and allocator/retainer ownership remain unresolved. Diagnose a reproduced event before proposing a repair; no hitch-fixed claim |
| Farm/Bridge/Foundry strict timing | Retain original failed D41 intervals and post-run quiet checks. Passing repeats do not erase failures. The prepared 108-run campaign remains deferred and unrun |
| Troy frame tails | Quiet-hub candidate means are scoped evidence, not locked 60 FPS. Target stays 1440x900 balanced, including combat/fleet transitions |
| Device/tier acceptance | Samsung reduced-tier measurements exist; they do not establish tablet 60 FPS or universal mobile qualification |
| Xclipse classification (GG-008) | Requires actual device strings and measured behavior |
| Sweep analysis | Bounded local/adjacent coverage; distant self-intersections are outside the guarantee |
| Foundry S3 cross-pass and roof/seam design | Pre-existing asset/design questions; retain campus structures pending a specific design decision |
| Full-army damage, boarding, wall climbing, RTS and living-horse contacts | Outside the accepted Troy endpoint; require new scope |

The [3 October release disposition](reviews/2026-10-03-release-disposition.md)
retains exact performance failures and source-scoped conclusions. The dated Troy
reports likewise describe their tested stages, not the latest runtime pin.
No new benchmark campaign, paid provider run or wholesale rebake is required
solely because a historical report used pending-release language.

## Optional or deferred decisions

| Item | Disposition |
| --- | --- |
| AI SDK/provider/OpenRouter/OpenAI majors | Strands peer compatibility holds these upgrades; compatible-family updates are on main |
| Site TypeScript 7 | Retain TypeScript 6 for Astro checker/compiler-API compatibility |
| FARM-008 instancing/warmup | Measure applicability per scene; not a proven global defect |
| Shared Meshopt loader (GG-002) | Optional consolidation of the existing Bridge-specific path |
| Terrain derivative encoder (GG-005) | Regeneration tooling when new terrain tiles are needed |
| Static scene export (GG-006) | Separate delivery-contract decision |
| Vegetation cycle (D33) | Later per-tree culling exploration with visual and measured GPU-work checks |
| R8 shadows, reflection cadence, output depth, extra merging | Optional measured follow-ups |
| MCP render file destination | Unadopted; existing CLI output and MCP media/receipts remain valid |
| SEP-2640 resources and large present metadata | Recorded deferrals; see the roadmap and engine ledger |

## Maintaining this queue

For a changed surface, connect implementation to focused tests, exact source/input
identity and the affected public or installed-package flow. Preserve failures,
skips, owner/device limits and dated evidence. Completed migration and publication
do not reopen from old logs; genuinely new scope needs its own completion boundary.
