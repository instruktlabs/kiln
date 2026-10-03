# Kiln stabilization and adversarial review — 3 October 2026

**Release direction, 3 October:** Matt confirmed the farmer hand fixes look good,
could not reproduce the water jump in the local candidate, and authorized settling
the performance findings followed by commit, main integration and site deployment.
The [release disposition](2026-10-03-release-disposition.md) records the bounded performance decision.
Troy, physical-device promotion and npm publication remain deferred. Earlier open
water and authorization statements below describe superseded checkpoints.

**Superseding owner feedback:** Golden Gate water is reopened after repeated wave-position
jumps reported during orbit. The implementation-complete wording below describes the
earlier checkpoint; it is not current water acceptance. See the [water follow-up](2026-10-03-water-orbit-follow-up.md)
and [release preparation](../plans/2026-10-03-release-preparation.md).

This is the current review checkpoint, not release acceptance. The maintained queue
is [the backlog](../backlog.md); exact receipts and scopes are indexed in
`tmp/alignment-20261003/qualification.json`. The adopted focused measurements and
bounded follow-up are collected. Strict desktop performance acceptance remains open;
implementation and functional verification are complete within the scopes below.

## Repository and scope

A fresh fetch found `codex/core-scenes-alignment` at `ac8456c`, zero commits ahead
or behind `origin/main`, with the accumulated alignment changes uncommitted.
PR #131 already landed the scene optimization pass; #132 subsequently fixed ORM
UV/transform handling. The new issues below do not establish that the optimization
pass broke every scene. Saved asset GLBs have been preserved.

The current task is to stabilize the engine and existing scenes/assets, challenge
implementation and evidence, and leave a reviewable result for Matt. Troy ideas
are not an adopted specification or backlog. Its pack remains off the public site;
construction, refinement and requirements await direct discussion. No commit,
push, tag, npm publication, upload or deployment is authorized by this checkpoint.

## Verified implementation and actual behavior

| Surface | Finding and repair | Evidence and limits |
| --- | --- | --- |
| Core ORM | Materials sharing one metallic-roughness image could overwrite each other's occlusion. Packing now isolates each pair while preserving other consumers. | Serialized GLB, order, slot and sampling regressions; final engine coverage and installed-package checks. This was separate from #132's UV fix. |
| Core full exporter | Full-mode rigid merging now respects named pivots, animation, placement and LOD boundaries, conditioned transforms, actual added bytes per saved draw, splitting and rollback. Replay policy is explicitly versioned. | Maintained adversarial tests cover the six adopted conditions; planned 0.11 behavior/migration remains unreleased. |
| Core diagnostics/upgrades | Bounded draw/geometry observations and compatible dependency/toolchain updates are implemented. | Final engine identity `58b1b178…`; 3,187 tests pass, three platform skips, zero failures, 95.11% function / 92.32% line coverage. Renderer and installed CLI/MCP/WASM checks have separate exact receipts. |
| Farmer hand and animation | Mixer-only frames missed the empty-hand correction; the original rigid right hand remained a grip; stopping actions caused abrupt transitions. Correction now runs every rendered frame, a scene-only relaxed arm borrows existing geometry, Idle/Walk blends, and hidden pose/shadow variants warm before use. | Exact r36 CPU sequences and both-backend rendered play/start-stop/reentry pass. Saved assets are unchanged. Sampled clearance and restoration are bounded evidence, not every pose or owner appearance acceptance. |
| Farmer mobile camera | Collision-shortened camera distance fed back into desired orbit distance. A single sideways drag reproduced 4.70 m → 1.46 m. Desired camera pose is now independent of collision projection. | Native-control regressions and actual compiled touch checks on WebGPU/WebGL2 preserve orbit radius and pinch in both directions. Physical-phone behavior remains unverified. |
| Shared input / Foundry | Hiding the joystick erased the newer first keyboard movement. Movement ownership now makes release/cancel/unmount affect only its own contribution. This code predates #131, from #125. | Three real DOM failures observed before repair, all eight cases pass afterward. Foundry's compiled first key moves the actor; desktop orbit/wheel, touch orbit/pinch and camera hand-back pass on both backends. |
| Golden Gate water | Incorrect floating-origin phase sign and unrelated foam offsets caused surface discontinuity. Pier wakes were too strong and long. | Actual shader-graph tests and both-backend boundary comparisons across three tiers support the phase/foam fix. Wakes are shorter and softer. Appearance/device acceptance is distinct. |
| Golden Gate first use | The natural flyover transition first created two contact-shadow pipelines, producing a reproduced hitch. Both sides now warm before ready and retain their cache owners. | Actual native pipeline handles settle before readiness and are reused at the natural 580 m camera jump on motion3. This is functional first-use proof, not a timing pass. |
| Foundry assets/runtime | The optimized exterior and existing interior remain intact; shared follow/input repairs apply to its controls. | Prior bounded image/count comparisons, fresh both-backend public controls and lifecycle flows pass. No optimization-caused Foundry regression was established. |

The fresh final-source corpus passes **224/224**: 86 examples, 113 scene GLBs and
25 saved Troy revisions used only as regression inputs. All optimized hashes and
per-input result data equal the earlier checkpoint. Twenty compressed terrain inputs
are explicitly decoded derivatives. This executes current source matching `58b1`;
dist execution is covered by separate installed-package checks. The historical
`dd25` corpus was not relabeled as a fresh final-build run.

Independent review examined Farm ownership/restoration and warming; root separately
reviewed FollowRig/native-input behavior. Input ownership also received a separate
review. No new concrete implementation blocker was found within those scopes.
The source hashes, authorship disclosures and gaps are in
`tmp/alignment-20261003/adversarial-motion3/`.

## Revision and site alignment

The final local site is `978664da398a2f67ea8e1ed210db6609a997095ffeff9d8961a7e044e2884d8d`:
2,728 inventoried files, 199,998,384 bytes. Golden Gate `g9-code5` and Foundry
`ff3-review2-code5` archives reproduce exactly, retain all original model/data bytes,
and remain within their runtime ceilings. Farm uses the current source bundle.

Fresh reconciliation covers 292 revision/resource records and 882 checks, with zero
mismatches; all 113 scene GLB consumers are represented. Only delivery labels changed.
The final artifact audit checks all members, 222 sealed scene payload files and 86
current gallery viewer revision/model/download references. Served HTTP checks bind
all three scenes to actual runtime chunks, frames, shell attributes and pack bases;
116 downloads, 520 linked site files, 89 mapped pages and three checksum endpoints
pass. No stale code1–4 page references or Troy delivery was found.

Adversarial review found a verifier gap: a self-consistent stale frame/runtime could
pass without agreeing with the catalog or page references. The added binding checks
reject that case. They also verified the old code3 candidate was internally aligned;
this was a verification gap, not evidence of an old pin mismatch.

The code5 site passes 564 tests with two historical skips, all 70 Astro files without
diagnostics, static validation, six hardware public-control scenarios / 34 checks,
and nine fresh lifecycle/layout/touch/viewer areas. Accessibility passes 396 page-width
checks and 44 keyboard tours with zero problems. The direct public Farm diagnostic
passes drag orbit, both pinch directions, post-pinch orbit and the first keyboard
movement after touch on actual NVIDIA WebGPU and WebGL2. Its first run remains
recorded as a warning-classification failure; the second uses the maintained exact
warning classifier and passes. These browser observations were collected on `26ecd2b29…`.
The final skills-only refresh proves all 2,721 product files, including 200 HTML pages
and 243 scene files, byte-identical to that tested artifact. Fresh final static,
delivery and HTTP checks pass. Four skill archives only changed compression; their
decompressed tar streams are identical. Compose changes only the intended input-ownership
guidance. Every current archive member matches maintained source, and fresh/managed
workspace copy checks pass. The earlier browser results have not been relabeled as reruns.

Production remains the separately recorded Cloudflare deployment `33c716c7…`,
commit `b1ac6ee`, using old Golden Gate/Foundry seals. The portable deployment
preflight is implemented and tested, including refusal of a dirty checkout.
No local qualification changes production or authorizes publication.

## Bounded remaining issues and evidence limits

| Item | Current disposition |
| --- | --- |
| Final performance checks | All 18 adopted observations are collected: eight old/new 60-second pairs and one 135-second Farm pair, totaling 20.5 measured minutes. Collection is valid, but the overall independent audit fails: 17 raw D41 passes, one candidate flyover 50.1 ms failure, and failed post-run idle checks for both blocks. One targeted additional flyover pair (two measured minutes) passes every encoded timing and quiet check. It does not erase the original failures. The full 18-cell / 108-minute campaign is preserved, deferred and unrun. Thresholds are unchanged; strict desktop performance acceptance is still open. |
| Farm late hitch | Four valid 135-second observations are complete. Original lean/sample runs retain natural 50.0/41.7 ms intervals near 106 seconds; current lean/sample runs have no natural interval above 40 ms, but retain roughly 36 ms late major GC. Both sampled runs have a separately excluded profiler-stop hitch. Sampled JS allocation estimates differ by about 0.81%; the shared embedder-memory cycle and exact allocator/retainer ownership remain unresolved. These single instrumented observations do not prove a fix or leak. No speculative runtime change is justified by this result. |
| Golden Gate timing events | The historical 58.3 ms drive event remains distinct from the shared flyover pipeline cause. The focused drive pair is 25.0 ms maximum on both sides. The new flyover miss occurs near 57 seconds, later than the old first-use event; it does not recur in the targeted pair. No additional actionable runtime cause is demonstrated. Historical failures remain visible. |
| Device and appearance | Desktop touch emulation does not qualify physical mobile hardware. Samsung/Mali evidence for this candidate is absent; Xclipse is unverified. Golden Gate original strict-image flags and owner appearance decisions remain open. |
| Asset acceptance/source scope | Farm's 23 selected assets retain their recorded acceptance; a latest hash-bound scene-runtime owner acceptance is absent. Foundry retains seven accepted and 55 candidate assets. Road-vehicle owner acceptance is not inferred. Original editable-source linkage and metadata-only pivot/scale facts retain the matrix's explicit limits. |
| Historical failures/skips | Four Farm pilot-image differences shared with the original, Golden Gate strict flags, timing failures and platform/fixture skips remain visible. They are not converted into passes by a successful test count. |
| Held upgrades/work | Incompatible provider-family majors, site TypeScript 7, physical-device promotion, optional redesigns and separately authorized paid dogfood remain held. Troy work remains deferred. |
| Final bindings | Skills/site byte continuity and fresh workspace copies pass. The offline package byte audit is recorded separately at `tmp/alignment-20261003/package-stabilization-final/receipt.json` after these docs are frozen; the qualification ledger records its result. Matt will review corrected appearances after the development goals are complete. No owner decision is inferred from these technical checks. |


## Focused timing disposition

All samples use the unchanged collector, exact original optimized and current motion3
builds, a visible NVIDIA WebGPU renderer, 1920×1080 at DPR 1, and measured nominal
120 Hz. Each side has one observation; these are not reliable speedup estimates.
Every sample has a p95 of 8.4 ms. The existing limit is no interval above 50 ms and
none above 100 ms; the 50.1 ms failure is not rounded into a pass.

| Case | Original maximum, ms | Candidate maximum, ms | Raw D41 |
| --- | ---: | ---: | --- |
| Farm balanced walk, 60 s | 25.1 | 16.8 | Both pass |
| Farm balanced tractor drive, 60 s | 16.8 | 33.2 | Both pass |
| Golden Gate balanced flyover, 60 s | 50.0 | 50.1 | Candidate fails |
| Golden Gate balanced drive, 60 s | 25.0 | 25.0 | Both pass |
| Golden Gate high orbit, 60 s | 25.0 | 25.1 | Both pass |
| Foundry balanced campus, 60 s | 16.7 | 25.0 | Both pass |
| Foundry balanced fab landing, 60 s | 25.0 | 25.1 | Both pass |
| Foundry balanced drive, 60 s | 16.8 | 25.0 | Both pass |
| Farm minimal hero, 135 s | 25.0 | 33.4 | Both pass |
| Targeted flyover follow-up, 60 s | 50.0 | 16.7 | Both pass |

The first block's before/internal idle checks passed, but its post-run CPU maximum
was 16.473%, above the strict 12% limit. The spike was sampled 18.125 seconds after
the block ended, outside all scene measurements. The Farm pair also passed its
before/internal checks but failed post-run idle at 16.159%, sampled 6.326 seconds
after the block ended. Neither failure is silently excused or replaced. Their timing
limits causal conclusions about the scene samples; it does not make the protocol pass.

The candidate flyover's sole 50.1 ms interval ends at 56.999 seconds. A nearby
render-call wall-duration sample is 41.3 ms; this does not distinguish actual thread
CPU work, driver/GPU waiting, GC or descheduling. The frame and render arrays are not
a calibrated timestamp join. This is later than the known first-use boundary near
25 seconds in the measured window. Zero recorded long tasks and final pipeline counts
do not establish the cause or rule out transient work.

The unchanged follow-up preserves both exact builds and lasts only two measured
minutes. Its first idle attempt failed before any browser launched; that receipt is
retained. A fresh gate after a 20-second settling period passed, as did its internal
and post-run gates. The candidate's maximum is 16.7 ms and the 57-second event does
not recur. All owned browsers, profiles and server ports were independently confirmed
closed. No speculative code repair, repeated testing until success, or broader tier
campaign follows from this result.

The bounded investigation is complete with mixed evidence. The strict overall audit
remains failed, and performance promotion stays open. It is reasonable to review the
implemented functional repairs with this limitation visible; it is not accurate to
label the candidate fully performance-qualified. Any further timing work should target
a reproduced failure or a specific acceptance decision. The original full campaign
remains deferred, and physical-mobile and owner appearance evidence are separate.

The exit gate is reproducible evidence for the in-scope repairs on identified final
artifacts, with known failures, risks, skips, unverified areas and justified deferrals
reported explicitly. It is not a promise of zero possible bugs, and it does not
start Troy automatically. Matt reviews the resulting checkpoint before that discussion.
