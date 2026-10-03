# Kiln roadmap

**Release direction, 3 October:** Matt confirmed the farmer hand fixes and could not
reproduce the water jump locally. He authorized final performance review, commits,
main integration and Cloudflare deployment. The focused performance investigation is
settled for release with its original failures and limits preserved. See the
[release disposition](docs/reviews/2026-10-03-release-disposition.md). Bridge stills are refreshed; physical-device
promotion, Troy construction and npm publication remain deferred.

Kiln **0.10.0** is the current release, the v1 readiness release: the stdio server serves
protocol revision 2026-07-28 beside the 2025 handshakes and answers before the engine
loads, the three record tools are flat objects with an `action` field, every tool result is
bounded and leads with its verdict, and the generated workspace guide and skills are
shorter. It builds on 0.9.0's standalone authoring with optional projects, a material
library and Live Review in the packaged local dashboard and the calibrated
`review-neutral-v1` review rig. [CHANGELOG.md](CHANGELOG.md) lists the changes with each
breaking one marked. The
[foundation checkpoint](docs/plans/2026-09-26-project-foundation.md) is history: it records
how projects, materials and Live Review were qualified, and the changelog describes 0.9.0.
Dated plans and reviews under `docs/` record how earlier work was qualified; the September
dogfooding and stabilisation work is in [dogfooding](docs/dogfooding.md),
[headless harnesses](docs/harnesses.md) and Phase 17 of the
[engine ledger](docs/plans/repo-size-and-r2-migration-2026-09-10.md).

The large scene optimization pass landed in **#131 (`b1ac6ee`)**: Farm hero/shadow
work, Golden Gate bridge/shadow/reflection work and Foundry planting/MSAA work,
with count baselines and parity evidence. It did not rewrite saved assets. Optimized
Farm is live; local Golden Gate `g9-code5` and Foundry `ff3-review2-code5` deliveries
are now prepared, while production retains its previous seals. #132
(`ac8456c`) then fixed ORM UV/transform handling. The remaining work below does
not restart that completed pass.

## Next

The owner's current direction is to stabilize existing core, assets and scenes,
review behavior, implementation and cycle intent adversarially, and qualify exact
local artifacts with explicit issues and evidence limits. Troy brainstorming is not
an adopted specification or task; its construction awaits direct Matt discussion,
and its pack stays off the public site. No release actions are authorized. The
[alignment plan](docs/plans/2026-10-02-core-scenes-site-alignment.md) is the current
work queue and acceptance contract; the [current backlog](docs/backlog.md) tracks
individual dispositions. The September Farm pilot and October landing plans retain
their historical scope.

The 3 October local candidate implements ORM isolation, rigid full optimization,
rebuild versioning, bounded inspection/export diagnostics, compatible dependencies
and the adopted scene/control repairs. These planned 0.11 changes remain local and
unreleased. The fresh current-source corpus passes **224/224** at identity
`58b1b178…`: 86 examples, 113 scene GLBs and 25 saved Troy regression inputs. Every
per-input result and optimized hash matches the earlier run; 20 compressed terrain
inputs remain explicitly decoded derivatives. Separate installed-package checks
qualify the frozen runtime bundles. Root coverage passes 3,187 tests; the complete
scene-script gate records 108 tests / 615 assertions, and the motion3 portable gate
passes 713 tests with 18 historical skips. Typecheck and lint pass.

The bounded [stabilization adversarial review](docs/reviews/2026-10-03-stabilization-adversarial-review.md)
found no new concrete implementation blocker in its reviewed surfaces. Farm pose,
blend, warming, orbit/pinch and shared first-key ownership repairs pass their focused
and compiled both-backend checks. Golden Gate water continuity and startup contact
pipeline preparation have bounded browser/native evidence. These do not establish
every clipping pose, physical-device behavior, owner appearance or performance.
Earlier image/count matrices retain their tested build scopes: Farm 160 direct,
32 paired and 32 settled-count cases; Foundry 120 default images and 56 exact static
count rows; Golden Gate 78 depth-reference cases per backend. Four shared Farm pilot
differences and Golden Gate's 17 WebGPU / 11 WebGL2 original strict flags remain.

The code5 local site **`26ecd2b2…`** now qualifies the changed public deliveries:
564 tests with two historical skips, all 70 Astro files without diagnostics, static
checks, six NVIDIA control scenarios / 34 checks and nine lifecycle/viewer/failure
areas pass. Fresh accessibility passes 396 widths and 44 keyboard tours with zero
issues. Served checks cover 116 downloads, 520 linked files, 89 pages and three
checksum endpoints. Revision reconciliation covers 292 records / 882 checks with
zero mismatches; saved model/data/source revisions remain unchanged. The actual
public Farm diagnostic also passes orbit, pinch and first keyboard movement after
touch on NVIDIA WebGPU and WebGL2; its earlier warning-classification failure stays
recorded. Current fresh/managed skills qualify KIT-6 guidance. The final skill-only
site **`978664da…`** passes fresh static, delivery and HTTP checks. Its strict
continuity proof establishes 2,721 unchanged product files, including all 200 HTML
and 243 scene files, against `26ecd2b2…`; earlier browser measurements retain their
original artifact and scope. Current skill archives match the maintained guidance.
After documentation freezes, the final offline package byte audit is separately
recorded at `tmp/alignment-20261003/package-stabilization-final/receipt.json`; the
qualification ledger records its result. No result is claimed in advance.

Matt selected **focused checks, expanding only if a failure needs investigation**.
All **18 intended focused runs / 20.5 measured minutes** are collection-valid.
Raw D41 is **17 pass / 1 fail**, retaining candidate Golden Gate balanced flyover's
50.1 ms interval at 56.9993 s. The Farm minimal 135-second pair passes D41 with
original/candidate maxima of 25.0/33.4 ms. Strict post-run quiet checks fail for
both blocks: CPU maxima of 16.473% and 16.159%, sampled 18.125 s and 6.326 s after
their respective blocks. The overall focused audit therefore remains **FAIL**.
One additional unchanged flyover A/B pair completes two measured minutes with
50.0/16.7 ms maxima, both D41 and all quiet checks passing, with complete cleanup.
Its earlier 12.694% CPU preflight failure stopped before browser launch and is preserved.
The candidate's later 50.1 ms miss did not recur; no actionable cause or new runtime
repair is established. The passing repeat does not erase the original failures.
All intended focused measurement work is complete; no further benchmark expansion
is presently justified. The prepared 18-cell / 108-run campaign
is preserved, deferred and unrun; no all-tier, repeated-run or desktop-speedup claim follows.
The prior UI3 balanced block stays 7/18 cells and 42/108 runs, with 37 D41 passes and
five failures; it does not qualify the changed candidate. Golden Gate's separate
58.3 ms drive event remains distinct from the identified flyover pipeline cause.
Farm's four allocation observations are complete: neither current observation has
a natural interval above 40 ms, compared with original intervals of 50.0 and 41.7 ms.
Current late major GC still takes about 36 ms; source allocation/retainer ownership
remains unresolved, so no speculative repair or hitch-fixed claim is justified.
Functional implementation is complete within its tested scope. Strict desktop
performance acceptance remains open; physical-device and owner appearance review
are deferred, with owner farmer/water review after the development goals. No desktop
margin, tablet promotion, full-goal completion, owner approval or deployment is claimed.

1. **Core correctness and upgrades.** Implementation, fresh final-source corpus and
   core/package gates pass. Retain named/LOD, draw/byte and saved-revision contracts
   through final package binding and release review.
2. **Focused scene follow-ups and asset checks.** Motion3 and code5 functional
   qualification and bounded Farm allocation diagnosis are complete within the recorded
   scope. Intended focused measurements are complete; retain the failed strict
   performance audit and unresolved cause without speculative repairs or further
   benchmark expansion. Do not promote incomplete acceptance evidence.
3. **Site delivery.** Code5 seals and the exact local launch artifact are qualified.
   Skill-only rebuild and product continuity pass. Record the separate final package
   byte audit after documentation freezes, then review the exact clean artifact before
   any authorized Cloudflare release.
   GitHub validation does not deploy it.
4. **Troy remains deferred.** Discuss it directly with Matt after the stabilization
   report. Earlier ideas and the [handoff](packs/troy/HANDOFF.md) are reference only,
   not adopted construction/refinement tasks. Keep the pack off the public site.
5. **Later product milestones.** Ten-pack production, broader importer qualification and
   the v1 public package launch remain separate milestones.

Projects remain optional for every other kind of standalone authoring.

## Disposition of earlier author requests

The former "not adopted in 0.9" list was stale. Current implementations and
[CHANGELOG.md](CHANGELOG.md) establish these dispositions:

| Request | Current state |
| --- | --- |
| Per-part transforms | Available through requested `listParts` placement output |
| `userData` and visibility | Bounded JSON extras and `KHR_node_visibility` shipped |
| Easing and index policy | Cubic animation samplers and indexed/as-built policies shipped; as-built requires optimization off |
| Sweep self-intersection | Bounded local/adjacent-ring analysis shipped; general distant self-intersections remain outside its guarantee |
| Hide-node captures | Available in `kiln.capture.v2` |
| Intentionally open parts | `markOpenShell` shipped; it does not suppress measured overlap failures |
| LOD authoring and review | `defineLod`, `MSFT_lod`, LOD0 default views and per-level inspection shipped; destination support must still be verified |
| MCP render output path | Still unadopted; CLI views/capture write files and MCP returns media/receipts |

## Deferred

| Item | State |
|---|---|
| `kiln_present` puts up to 16 MiB of base64 in `_meta` | Deferred by decision. The shape is settled and the MCP Apps spec confirms it: a UI iframe may call `resources/read`, so the widget can fetch what the manifest names. The over-limit behaviour is a graceful refusal, not a failure |
| SEP-2640 / `skill://` resources | Deferred by decision; see ledger 7.12 and 14.1 |

## Dependencies

| Family | State |
|---|---|
| Three.js/types and webgpu | Local candidate uses 0.186.1 / 0.186.0 / 0.6.2 with synchronized locks and identities. Native GPU/material/display, fresh 58b1 source corpus, motion3 both-backend controls and code5 site gates pass within their scopes. Intended focused timing is collected: 18 valid runs, raw 17 D41 pass / one fail and two failed post-run quiet gates; a separate unchanged flyover pair passes but does not erase failures. Strict desktop acceptance remains open; the 108-run preparation stays deferred/unrun and owner/device/release boundaries remain |
| glTF Transform, MCP, material/runtime and site tooling | Compatible updates are installed locally and pass the full core and package gates. Exact versions and evidence are in the alignment plan; production has not changed |
| Maintainer Node/Bun/npm | Local pins and active hub tools are 22.23.3 / 1.4.2 / 12.2.0; the former Node/npm prefix is retained |
| TypeScript | Root/scenes use 7.0.2; site and the scene compiler-API alias retain 6.0.3 intentionally |
| AI SDK/provider/OpenRouter/OpenAI majors | Held by Strands compatibility: installed candidate Strands 1.19.0 requires provider 3 and OpenAI 6. Its Anthropic peer also excludes the newest Anthropic family |

Versions were checked on 2 October and the compatible updates were installed and
qualified on 3 October 2026. Keep exact release inputs; unresolved scene evidence
and incompatible major families are not silently accepted by the core test results.
