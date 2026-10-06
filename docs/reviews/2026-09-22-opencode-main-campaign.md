# OpenCode main campaign: checkout evidence

This campaign exercises the upgraded authoring workflow before packaging.
**36/36 main authorings and 72 requested edits are reviewed.** The separate
[held-out campaign](2026-09-23-heldout-campaign.md) also completed all 12 authorings
and 24 edits. Reviewed completion is not a quality pass or installed-package/destination
qualification. Main41 is terminal; both edits preserve the protected components,
while the burner gap and buried rivets remain recorded quality limits. The [checkpoint](../plans/2026-09-22-progress-checkpoint.md)
owns the current runtime/gate and resume action. Sections below preserve the
runtime and cumulative counts at each historical milestone. Historical gallery
assets are unvetted showcases from earlier versions; repairing, regenerating or
replacing them is outside this campaign and the current goal.

Evidence root: `C:/Users/Mattm/X/kiln-dogfood/unification-2026-09-22`.
Original sources, failed attempts, events, images and immutable saved revisions are
retained there. Models author outside the engine checkout; reviewers do not repair
their source before assessing it.

Main-14 and its two edits are complete. Main15 is incomplete after two terminal
Muse rate-limit failures. The separate Main16 MiMo/OpenCode V2 attempt also stopped
on provider 429 before any tool call. No completed authoring is added by either.

Main16 is a new independent thin-organic CLI trial on OpenCode 2.0.14 with
`opencode/mimo-v2.6-flash-free`, explicitly permitted by the owner's later
model-diversity steering. It does not replace or resume the failed Muse trial.
Workspace `main-16-thin-organic-cli-mimo`, evidence
`evidence-main-16-thin-organic-cli-mimo`, frozen checkout `runtime-main-16-frozen`
at 24590d...b180. A real isolated-client GPU preflight passed. The baseline process
exited 1 in 1.647 seconds with `provider.quota`, HTTP 429, no tools or output files,
and zero reported cost. Its trace and `attempt-disposition.json` are retained;
no repeated attempt was made. This promotional-route failure does not establish
exhaustion of the separate Go subscription allowance.

## Open coliseum, first independent authoring

Workspace `main-01-coliseum-mcp`, evidence `evidence-main-01-coliseum-mcp`, driver
`run-main-01.mjs`. OpenCode 1.18.30 used exactly
`opencode/muse-spark-1.3-contributor-free`, with contributor-training consent.
The exported session independently confirms this route across 43 assistant messages
and $0 reported cost. All three stages exited 0 without timeout, in 629.542,
242.027 and 287.323 seconds. Engine source and all five bundles remained fixed at
`sha256:38474183f640104e9228510cfed0ddb5a15ed341feb24d2c9155f9640afe3813`.

The brief requested an editable open coliseum with twelve tiers, four usable radial
entrances, repeated arched bays, a walking ring and a ruined sector. Follow-ups
requested a 25% longer long axis and a local replacement with a darker double arch.

| Stage | Final program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | `p_c5172baf0523` | 12,234 / 317 | Recognizable open amphitheater; twelve tier levels and named structural parts exist. Pale material contrast and entrance obstructions limit brief adherence. |
| Long-axis edit | `p_d877d177d04b` | 13,910 / 317 | Arena floor long span changes 12.16 to 15.20 m exactly; short span stays 8.16 m. Tier count, vertical extent and all four original texture bytes remain. |
| Gateway replacement | `p_6a0b6a3a1526` | 14,114 / 320 | Darker twin-arch portal added locally. Twelve existing meshes change, six are added, three removed; 302 remain identical in geometry, transform and material. Other entrance axes, seating, arena and ruin are preserved. |

Source analysis identifies freely authored indexed surfaces and arch modules rather
than a mandatory building generator. That is useful category-free authoring evidence;
one construction approach is not proof of diversity across the campaign.

The whole-asset baseline bounds are 26.15 by 8.53 by 26.15 m because entrance
approaches extend past the oval walls. After elongation they are 32.24 by 8.53 by
26.15 m. The model's approximately 24-by-18 m wall dimensions must not be reported
as the footprint. The seating span changes from 22.932 to 28.655 m, approximately
25%, with the same 16.438 m short span. The last edit preserves those bounds.

All saved manifest hashes and sizes match files. Saved GLBs, sources and previews
match the corresponding CLI exports. The three revisions form one immutable chain:
`r_1e5ad3a8f83f4608ba4ab999c465c0b4` →
`r_395cbca9ba894dfba3a0f4ffb2a73958` →
`r_a2928f16a361493e86ec421eeb512aff`, under asset
`a_36a8507dbf4044c6abbd7060df1eb177`.
All six successful anchored edit calls independently reconstruct the exact stored
source bytes. All program-store source hashes verify. Every exported PNG was read
by the model; attachment bytes match the file. There are 7, 2 and 5 actual image
attachments in the respective stage traces. Reviewer inspection includes all three
final GPU sheets. These are Dawn/D3D12 views on the RTX 3070, not CPU material claims.

## Findings and repairs

**F186: opaque material-range rejection caused false restrictions.** The baseline
failed three render calls with generic execution rejection. The model blamed raw
`THREE.BufferGeometry` and supported material fields. An independent probe confirms
those APIs work: `mortarWidth: 2` is invalid because it is a 0..1 fraction. Discovery
listed the field without its range. This wasted retries and diverted the author
from a supported construction technique.

The repair adds an engine-owned `MATERIAL_FRACTION_RANGE` diagnostic through the
isolated evaluator, with no exception text or source values crossing the boundary.
It covers texture mortar width, stagger and opacity plus the existing portable
material fraction fields. Discovery now supplies their ranges/defaults. Two focused
tests failed before the fix; handler/subprocess/registry and valid endpoint checks
pass afterward. The exact failed source now receives the actionable hint through
both actual CLI and stdio MCP. This verifies transport behavior, not yet model
recovery from the revised diagnostic in a fresh authoring.

**F187: review did not establish entrance clearance.** Independent double-sided GLB
ray checks at 1.7 m height find pylons crossing both east/west center paths before
and after the resize. The gateway edit leaves neighboring pylons and narrow seating
gaps, so visible arch holes and authored dimensions do not establish a usable route.
The final double arch intentionally has a center pier; centerline blockage alone
would not be a defect there. Side rays also hit neighboring geometry. These sparse
rays provide obstruction evidence, not exhaustive navigation or character clearance.
QA accepted all stages but had no bound entrance-clearance requirement. The final
stage correctly warns about five images versus the four-image portable budget.
Keep this case in R02/C07/Q02/V09; do not invent a universal solid-building rule or
call passing structural QA proof of brief adherence.

**F188: refinement context missed existing interface constraints.** One resize call
exceeded the 20-replacement maximum; the model recovered with batches of 19 and 10.
Three gateway inspect calls failed because subjects used authored names or a manually
decoded path. These are model request errors against existing contracts, not evidence
that explicit cameras are broken. The refine entrypoint now names the edit limit,
and its view reference explicitly preserves encoded returned paths and distinguishes
source names from exported node names. Fresh-context behavioral acceptance remains.

Remaining visual issues include weak overall limestone/riser contrast, large blocky
entrance cheeks and overlapping portal structures. The local darker gateway improves
contrast but adds a fifth texture. No renderer/light change is justified from this
one material set without a controlled comparison.

Machine evidence: `independent-artifact-review.json`, `trace-review.json`, full
`session-export.json`, stage inputs/process receipts, and original JSONL events.
The external `verify-main-01.mjs` parses GLB vertex data and transforms without
executing authored source. Original summaries' `errors` fields count transport errors
only; the independent review also records semantic `ok:false` tool responses.

## Articulated robot, first independent authoring

`main-02-articulated-cli-v2` is a fresh workspace for the branched articulated
non-humanoid family. The earlier unused preparation is preserved and not counted.
Its workspace MCP is deliberately disabled for the CLI-only condition; original
and modified configurations are recorded. The three briefs exercise six legs and
animation, body widening with hip relocation, and a front-tool replacement.

The material diagnostic slice uses runtime
`sha256:c3177b2859c172510fc054be4f4905a5c94ddede6f3a9bdd1baa7faafed9b0e1`.
Focused material/evaluator checks: 21 pass, 163 assertions. Discovery: 9 pass,
73 assertions. Prompt snapshots, typecheck, lint, skill conformance and direct CLI/MCP
probes pass. The first full suite found one stale Discovery wording assertion;
the assertion now checks the published ranges. The original failure log is retained.
The final full gate passes: **2453 pass, 4 skip, 0 fail**, 2457 tests across 290
files, 58979 assertions, 150.62 seconds. Coverage: 95.07% functions / 92.66% lines;
thresholds unchanged. All five bundle hashes match the current source identity.
Original and final logs are retained in `evidence-main-01-coliseum-mcp/repair-logs/`.
That runtime remained fixed for all three robot stages. Their process receipts now
show successful completion: 1237.168, 188.872 and 196.994 seconds. The exported session
confirms 86 assistant messages on the exact free Muse route and $0 reported cost.
No model process from this trial remains active.

| Stage | Final program | Triangles | Independent assessment |
| --- | --- | --- | --- |
| Baseline | `p_ae7ca578ecc9` | 2,872 | Recognizable six-legged robot with separate joints, feet, sensor mast and front arm. Pale orange and weak steel contrast limit material readability. |
| Body-width edit | `p_7c5c9002b26b` | 2,872 | Hull width increases from 0.72 to 0.864 m; length stays 2 m. All six hip attachments move outward by 0.072 m. Leg geometry, materials and animation remain unchanged. |
| Tool replacement | `p_006187581ddb` | 2,884 | Five gripper meshes become six fork meshes. Every surviving mesh keeps its geometry and world transform; all joints, materials and animation remain unchanged. |

All source/GLB exports match their recorded hashes and saved revision bytes. Every
saved manifest file hash/size verifies. The revision chain under
`a_9afcb207e7574dd580ead6ce3278a6f8` is
`r_b9d240ee916e4a8c9597ce6e7001c05c` →
`r_2892bc6abcf14f08a87d0d3f088127ed` →
`r_00511ac2e7cc42f79e74505d98a7cebb`.
Every exported PNG was read by the model, with matching attachment bytes. Saved
previews and exported PNGs differ: the former use the default sheet, while the
exports use the authored two-view capture. All three saved preview manifests identify
material-faithful GPU evidence; preview equality is not claimed.

The independent reviewer loads unmodified exported GLBs with Three.js GLTFLoader
and plays their actual clips with AnimationMixer. Each has the same two-second
`Walk`, 19 tracks and 22 named joints. The clip data is identical across edits;
the fork edit preserves every joint and sampled foot trajectory. Geometry hashes
use logical accessor values, including interleaved stride/offset, rather than
unrelated bytes in a shared backing buffer. The source author's manual posed
copies are retained as trace evidence but do not count as exported playback proof.

**F189: cold Windows shell renders retained output pipes.** During the baseline,
two shell calls timed out after successfully producing outputs. An independent
cold replay reproduced the observer hang; a warm direct CLI run finished normally.
Controlled launch fixtures show that detached Node children can retain the caller's
unrelated pipe handles even when their own stdio is ignored. The CLI exits, but an
agent waiting for pipe EOF continues waiting for the shared renderer.

The Windows host now uses a short hidden Windows PowerShell `Start-Process` launcher
without stream redirection, isolating the service through ShellExecute. The launcher
reports its PID; startup monitoring distinguishes launcher success from renderer
survival. Socket identity, shared lifetime and idle shutdown remain authoritative.
The prior pipe-closure regression was observed failing, then passes with an actual
shell pipeline and a fixture path containing a space and apostrophe. A second check
detects a native process exiting before health. Native stderr is not captured on
this path; documented manual startup exposes driver errors. This tradeoff is explicit.

The actual cold GPU replay exited and closed its streams in **4.574 seconds**, with
the real renderer still healthy. Its GLB is byte-identical to the robot baseline.
The probe used a fresh port and stopped only its verified service afterward.
It is a maintainer infrastructure replay, not another model authoring or a repair
to the scored robot. Original timeouts and the explicitly stopped observer remain
in the evidence. The general dogfood process observer's timeout/drain limitation
has not been separately fixed.

**F190: CLI animation review is missing.** The model tried `--clip` and an animation
field in a capture shot; both were rejected. It then authored temporary posed
copies for t=0.5 and t=1.0 and rendered those. Those images cannot prove playback of
the delivered animation. Expose the existing shared animation-sampling capability
through CLI, then replay this asset and evaluate fresh author behavior. This remains
open; do not teach source-pose workarounds as the standard animation workflow.

**F191: preserved animation is not a convincing gait.** Across 65 evenly spaced
playback samples, left-foot bottoms range down to -0.01185 m and lift at most
0.00097 m; right-foot bottoms reach -0.00911 m and lift at most 0.00565 m. The
alternating tracks and mast scan execute, but foot drag and ground penetration
limit the walk. This is sampled contact evidence, not continuous collision or
game-engine acceptance. All stages passed structural QA with no bound locomotion
requirement. Keep brief adherence, animation behavior and structural QA separate.
The fork is visibly distinct in the hero view; its tines overlap in the side view.

Machine evidence is in `evidence-main-02-articulated-cli-v2`: original stage inputs,
JSONL events, process receipts, session export, immutable artifacts,
`independent-artifact-review.json` and `maintainer-cold-fixed-receipt.json`.
The retained external review script is `verify-main-02.mjs`.

## Exporter capability repair after the robot trial

D09's hard-coded exporter limitation is repaired. Discovery uses the same supported
attribute contract as export validation, reports legacy or experimental Three.js
selection, and leaves attributes unknown for an opaque host evaluator that has not
declared its backend. Local build provenance records the selected exporter.
An additional regression showed that the legacy choice could be replaced by a later
ambient environment change; local evaluators now pass their captured default
explicitly. No exporter default was changed.

Three focused tests first failed. After repair, 20 focused tests with 546 assertions
pass, including actual GLB color/UV1/UV2/UV3 inspection for both backends. Actual CLI
and stdio MCP capability responses agree for both selections. The original
`discovery-export-probe.json` is retained. D09 remains in progress for broader host
renderer/resource readiness; exporter reporting alone does not close the whole task.

## Current repaired checkout gate

Renderer slice: 9 focused tests / 39 assertions and a full gate of 2455 pass,
4 skip, 0 fail. The following exporter capability slice passes 20 focused tests /
546 assertions and **2458 pass, 4 skip, 0 fail** overall: 2462 tests across 290 files,
59007 assertions, 146.60 seconds. Coverage: 95.10% functions / 92.69% lines, above
unchanged thresholds. Typecheck and lint (640 files) pass. All five runtime bundle
hashes verify against `sha256:45c99823cf0799191509add7260a723838038841caf08c3a4a6fcafa2b4e6c10`.

Logs, including the original failing regressions, are in the robot evidence's
`repair-logs/`. Earlier model runs retain their frozen historical runtime identities.
No paid inference, package, commit, push, publication or deployment occurred.
Next: expose shared animation sampling through CLI, replay the original robot,
then continue the main campaign with another asset family. Thirty-four main and
all twelve held-out authorings remain, alongside the ledger's other open tasks.

## CLI animation review repair

F190's missing CLI capability is implemented as `kiln animation`. It calls the
existing program-aware `kiln_screenshot_animation` definition, retaining the same
sampler, shot schema, phase limits, framing, derivative fidelity, renderer policy
and host requirement binding. Source paths and saved references work; grid and
numbered individual PNGs are supported. JSON returns metadata and image paths,
without embedding base64. Each file replacement is atomic; the image set is not a
single filesystem transaction. Invalid requests and missing clips preserve prior
output files. A clip miss reports available names.

The CLI regression first failed on `--clip`. The repaired command's individual
frames match shared-tool CPU pixels exactly; Node/Bun PNG compression bytes can
differ. Grid/follow/subject-shot review, phase bounds, conflicting options, missing
clips, unchanged source and absence of accidental GLB outputs are checked.
Focused CLI/shared-animation tests: **6 pass, 68 assertions**.

The actual GPU replay uses the robot's original `p_006187581ddb`, samples Walk at
phases 0, 0.25, 0.5, 0.75 and 1, and finishes in **5.799 seconds**. It returns five
material-faithful derivative receipts. The reviewed sheet shows the leg and mast
motion while the sampling fork remains attached. Its source and delivered GLB
hashes remain unchanged. This closes the missing interface, not F191's gait quality.
No reviewer source repair or new model campaign attempt is counted.

Author/refine skills, motion reference, generated workspace guidance and rendering
documentation now expose the command and phase units. Six skills/two registered
copies and both edited skills validate. Fresh-model use remains to assess.

Current full gate: **2459 pass, 4 skip, 0 fail**, 2463 tests across 291 files,
59054 assertions, 142.28 seconds. Coverage: 95.03% functions / 92.42% lines, unchanged
thresholds. Typecheck and lint (642 files) pass. Runtime:
`sha256:5253a92023a9f3191af85d56393faaaff534427d7dabdef700f6441765e9e846`.
Logs and the replay receipt/image are retained beside the original robot evidence.

## Thin organic surface, first independent authoring

The third main trial uses `main-03-curled-leaf-mcp`, a fresh OpenCode workspace with
the revised skills, and `run-main-03.mjs`. Its baseline asks for a thin asymmetric
curled broadleaf, attached surface veins, contrasting upper/underside materials
and a curved stalk. Planned edits widen the blade by 30% without changing stalk or
height, then add actual edge tears while preserving prior changes. Construction is
unconstrained by categories or a prescribed helper. Source/runtime stay fixed through
all three stages. Actual child MCP events are retained separately from CLI exports.
All three stages completed in 175.196, 52.810 and 101.492 seconds, respectively,
with $0 reported cost. Session export independently confirms the exact free route
across 31 assistant messages. The source/runtime remained at `5253a920...` through
all stages; the subsequent renderer repair below has a different identity.

| Stage | Saved program | Triangles | Independent result |
| --- | --- | --- | --- |
| Baseline | `p_fc1f3f0b5520` | 11,548 | Curved asymmetric thin blade, distinct upper/underside, named stalk and veins. Tip appears folded rather than softly rolled; stalk is visibly faceted. |
| Widened | `p_80aa16c0395e` | 11,548 | Width parameter increases exactly 30%; projected whole-asset width increases 29.23%. Stalk geometry, transforms, material parameters and embedded texture bytes remain identical. Height changes by only 0.018 mm. |
| Torn edge | `p_b09c349b53bc` | 12,988 | Two real notches deform the right boundary; left-half blade vertices and centerline remain byte-identical. The rim is resampled. Height increases 8.28 mm from raised notch lips, and the upper notch visually merges with the folded tip. |

All three manifest file hashes/sizes and exported source/GLB hashes agree. Saved
revisions form one immutable parent chain, and each exported PNG was actually read
by the model. The final GPU sheets were independently inspected. No scored source
was repaired by the reviewer. Evidence and `independent-artifact-review.json` are
under `evidence-main-03-curled-leaf-mcp`; `verify-main-03.mjs` performs the review.

**F192: shared equations do not establish attached detail or preserved dimensions.**
The model claimed no floating veins because veins sample the blade equation. In
fact it adds constant world-axis offsets and then interpolates tubes independently.
Sampled exported tube-ring centers have positive distance-minus-radius clearance
from the blade, reaching 2.07 mm in the baseline and 2.06 mm after edits. This proves
detachment at those rings; it does not certify continuous contact elsewhere. The
tear edit also changed height despite the preservation instruction. These are
authoring/brief-review failures, not proof that parametricSurface or curveToMesh
violates its contract. R04/Q02/V09 retain the need for useful surface-detail guidance
and independent attachment/dimension review, without prohibiting open thin meshes.

The baseline CLI export first tried unsupported `render --json`, then recovered
using the documented command. No engine failure was inferred from that request.

## Joined renderer recovery after idle exit

**F193: an MCP host joining an existing renderer lost material views after idle
shutdown.** The leaf tear edit returned truthful geometry-flat feedback with
`render service http://127.0.0.1:8000 is absent`; the final separate CLI GPU export
succeeded. The joined-service branch attached a permanent HTTP port while only the
cold-start branch could restart an absent local service.

Both local paths now share the existing lazy lifecycle policy. Concurrent requests
share one replacement startup; an explicitly remote service and disabled automatic
local startup retain their behavior. Unknown, incompatible or timed-out health does
not authorize starting a replacement. The two regression cases failed before the
fix; focused lifecycle/transport checks now pass 30 tests and 71 assertions.

An actual compiled MCP replay joins a GPU renderer on a private test socket, renders
the original leaf, observes its five-second managed idle exit, and renders the same
program through a new GPU instance in 3.834 seconds. Both views are material-faithful
and have the original GLB hash. The scored source and export remain unchanged. The
private service was stopped after the replay. This is checkout Windows GPU evidence,
not a new model attempt or installed/platform qualification. Receipt and images:
`evidence-main-03-curled-leaf-mcp/rejoin-replay/`.

Full gate: **2463 pass, 4 skip, 0 fail**, 2467 tests across 291 files, 59066 assertions,
144.70 seconds. Coverage: 95.05% functions / 92.42% lines; thresholds unchanged.
Typecheck and lint pass. All five rebuilt bundles use runtime
`sha256:9179daf15f65d73f2cb267d4fd10705726cc3ade1bb9c6f9ce0ce6929ce887f2`.

## Directional-textured sweep, first independent authoring

The fourth main trial, `main-04-grained-handrail-cli`, completed through the CLI,
with MCP deliberately disabled. Its three stages took 319.187, 85.760 and 213.762
seconds. Exported session evidence confirms the exact free contributor route across
77 assistant messages and $0 reported cost. All three stages used runtime `9179daf1...`.

| Stage | Saved program | Triangles / meshes | Independent result |
| --- | --- | --- | --- |
| Baseline | `p_71725f60b064` | 3,292 / 35 | Continuous grained S-shaped wood rail on four posts. GPU closeup confirms grain follows the bends. Material variation remains regular and stylized. |
| Curve reversal | `p_7169517eea0b` | 3,292 / 35 | Reflected rail vertex set matches exactly, with unchanged UVs, textures, material parameters and bounds. Support geometry is unchanged; its positions follow the mirrored curve. |
| Support replacement | `p_1f332144c2db` | 5,036 / 43 | Eight collar/saddle meshes replaced by sixteen fork components. Every retained mesh has identical geometry and transform, including rail, posts, end caps, floor plates and bolts. Materials and embedded texture bytes remain identical. |

All three saved manifests, source/GLB exports and immutable parent links verify.
Every final PNG was actually read by the model. The reviewer inspected the baseline
and revised sheets, grain closeup and final bracket closeups. Temporary detail PNGs
that the model removed remain recoverable byte-for-byte from its read attachments;
the final-stage ones are copied under `retained-read-images/` in the evidence folder.
`verify-main-04.mjs` and `independent-artifact-review.json` record the comparisons.
Repeated Bolt names are compared by occurrence plus their unchanged physical placement;
names alone are not claimed to provide unique part identity.

**F195: named support components are not a reusable assembly.** The last instruction
requested each bracket/post as a coherent editable assembly. The final GLB contains
only the Handrail group with 43 sibling meshes; suffixes in names provide no shared
transform or replacement root. The local source edit works, but whole-support
interchangeability remains incomplete. C07/R03/V09 retain this concrete recipe and
composition gap. The small forks also read more as cups in some views; metallic
roughness alone does not establish brushed-metal surface detail. End caps remain
simple world-aligned plates rather than following the endpoint frame.

## Renderer authentication feedback

**F194: a listening renderer was mistaken for usable client access.** The fourth
baseline found an existing compatible service. Large GPU requests returned generic
`fetch failed`; a small probe returned HTTP 401. The model stopped the shared service
and then rendered successfully with a new local service. The trace establishes an
authentication failure and poor diagnostics; it does not establish who configured
the earlier token or that every fetch failure had the same cause. Initial shell
`head` usage and an unsupported `render --json` flag were separate recovered request
errors. Original outputs and failed edits remain in the trace.

The client now consumes the renderer's existing `authRequired` health field and
reports missing credentials before sending asset bytes. Explicit HTTP 401 responses
give matching-token guidance. `service status` reports the authentication policy and
whether a client token is configured; it explicitly does not claim that public
health validates the token. `service reprobe` fails when required credentials are
absent. Neither credentials nor their values are printed. Documentation now teaches
matching client/service tokens and corrects stale owner-lifetime descriptions.

Two focused regressions failed before implementation. The lifecycle, service CLI
and transport suite then passed **28 tests / 88 assertions**. An actual compiled
CLI/MCP replay uses a private authenticated GPU service: missing-token CLI rendering
and reprobe fail with setup guidance; MCP returns truthful geometry-flat feedback;
the matching client renders the original handrail in 2.851 seconds using the same
service instance. Only the private test renderer is stopped during cleanup. Evidence:
`evidence-main-04-grained-handrail-cli/auth-replay/`.

Current full gate: **2465 pass, 4 skip, 0 fail**, 2469 tests across 291 files,
59074 assertions, 149.96 seconds. Coverage: 95.05% functions / 92.42% lines, unchanged
thresholds. Typecheck and lint pass. Runtime:
`sha256:a1963524113a2e61797ac2c44b07101383f43359d41ca1c768e1f0677025af89`.
No model/test process from this slice remains active. Model use of the improved
diagnostic remains to qualify; the replay does not count as another authoring.

## Optional assembly and surface-detail recipe repair

F192/F195 now have two executable optional Discovery constructions and targeted
skill guidance. `recipe:editable-assembly-v1` provides actual support/bracket roots,
namespace-safe replication through nodeMap, and a local saddle-to-fork replacement.
Exported hierarchy and unchanged mesh/world-transform checks pass. The surface-detail
recipe derives a raised strip from actual carrier triangles, retaining identical
boundary coordinates before and after a 30% width edit. The example retains 1.2 m
height; this does not promise dimension preservation for every normal offset.

These are experimental recipes built from existing helpers, not new mandatory
geometry types or an attachment solver. The surface example is an open single-sided
sheet; arbitrary branching, closed topology and destination shading need separate
construction/review. Both examples have real CLI GPU sheets, reviewed externally
under `construction-recipes/`. They are teaching fixtures, not campaign authorings.
No scored leaf or handrail source was repaired or rescored.

Discovery now exposes 19 recipes. Three expected failing checks preceded the
implementation; focused sandbox/Discovery checks pass 19 tests / 868 assertions.
Typecheck, lint (643 files), skills and all five rebuilt runtimes pass. The full gate
passes 2467 tests, 4 skips, 0 failures, 59571 assertions, 291 files, in 141.94 seconds;
coverage is 95.06% functions / 92.44% lines with unchanged thresholds.
Runtime: `sha256:f523a85cedd783a25b0883b218069cdb13ebf92ee28e86d8271814fa12f13bb5`.
Logs: external `construction-recipes/logs/`.

The fifth main trial, `main-05-bench-vise-mcp`, uses fresh copied skills and the exact
free Muse route. Baseline process handle 21827 is active at this checkpoint. Its
brief requests a 30 cm vise with coherent moving components, followed by opening
and insert-replacement challenges. Original failure evidence and prior four
completed authorings remain unchanged. Fresh-model benefit is not yet established.

## Small mechanical assembly: bench vise

Workspace `main-05-bench-vise-mcp`, evidence `evidence-main-05-bench-vise-mcp`, driver
`run-main-05.mjs`. All three stages completed without timeout in 208.116, 79.406 and
122.431 seconds. The exported session confirms 32 assistant messages on the exact
free Muse route and $0 reported cost. Runtime remained `sha256:f523a85cedd783a25b0883b218069cdb13ebf92ee28e86d8271814fa12f13bb5`.
The model used 16, 6 and 5 actual MCP calls across the stages; all exported PNGs were
read. All source/GLB bytes match saved immutable revisions and manifest hashes.

| Stage | Program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | `p_a7b7e8e8cadc` | 5,080 / 73 | Recognizable vise with real moving-jaw, insert and handle roots. Grip ridges reduce requested 40 mm clear opening to 34.5 mm. Initial images are truthfully CPU-only. |
| Opening edit | `p_a3d2f9754dd1` | 5,080 / 73 | Exactly 35 meshes move with the jaw; every geometry/material/texture is unchanged. Usable grip separation is 64.5 mm rather than claimed 70 mm. |
| Copper insert swap | `p_ab28f74078f9` | 4,840 / 53 | Eight copper components replace 28 steel plate/ridge meshes. All 45 retained meshes keep geometry and world transforms; paint and texture bytes remain. Grooves are geometric channels. Flat plates stay 70 mm apart, but screws leave 68 mm usable separation. |

Asset `a_47c3a3b976ce46d4bf753b066cb9649d`; lineage:
`r_1343a75251a84171a3da0f5a8cb82819` → `r_f160360f7878460cb142586395aab056`
→ `r_c02ee31fda2d4d46861630edf56039fc`.
Bounds are 0.292 × 0.152 × 0.192 m initially, then 0.322 × 0.152 × 0.192 m.

Grouping and local edit behavior succeed. The recipe itself was not retrieved, and
the brief explicitly requested roots, so this run does not isolate the effect of
the recipe or revised skill. All group datums initially remain at the asset origin,
which is editable here but less reusable than connection-local insert frames.
Visual limitations include boxy cast surfaces, regular rings rather than a helical
thread, and broad paint noise rather than convincing localized wear. No functioning
mechanism or manufacturing-solid claim is supported.

F196 records the difference between nominal dimensions and functional clearance.
`insert-clearance-review.json` measures actual world-space GLB positions including
grip detail and screws. The plates' nominal dimensions are correct; the agent's
claim of clear space is not. Structural QA accepted the assets under neutral
requirements, which does not certify this unbound brief constraint. Author/refine
skills now explicitly distinguish usable clearance from nominal spacing; fresh
qualification of that instruction remains open. The basic source example also no
longer defaults `meta.role` to prop; scene roles remain optional composition metadata.

### Renderer setup and retained failures

The baseline found an authenticated shared service, reported the matching-token
diagnostic and saved a CPU image with material limitations. The maintainer's GPU
warm-up inherited a host RENDER_SERVICE_TOKEN, while the contributor environment
intentionally omitted it. This was a trial-setup error, not a new authentication
implementation failure. No token value was inspected, printed or sent to the model.

A dedicated loopback service on port 51435 was started through the same allowlist
as the model. Only this workspace's MCP port changed; the CLI received the same
port. The original baseline source, GLB and CPU sheet remain untouched. A separate
GPU baseline supplement used the exact saved source and was read by the model before
the opening edit. Later GPU outputs are material-faithful. The dedicated service was
verified by instance ID and stopped after review; shared service state was untouched.
`renderer-setup-repair.json` and before/after workspace config hashes preserve this
change. Future campaign preparation must verify actual rendering from the isolated
client environment, not only readiness from the maintainer shell.

The baseline also recovered from a recipe ID missing its namespace and again tried
unsupported `render --json`. F197 records the repeated CLI structured-output gap
seen across previous trials. It remains a candidate for a shared, bounded JSON
receipt, not a silent alias or a falsely claimed implementation.

All three process handles (21827, 42065, 87211), export/review and cleanup completed.
No model process from this trial remains active. Five main authorings and ten edits
are complete; 31 main and all 12 held-outs remain.

## Structured CLI render repair

F197 is implemented: `render --json` returns one receipt with the source reference,
requirements, triangle count, bounds, QA, exact GLB hash and written files. Requested
images use the shared MCP media metadata, including parts/cameras/fidelity, without
embedded PNG or GLB bytes. Missing input, invalid flags/capture, failed builds and
failed GPU requests return JSON errors with nonzero exits. Build failures retain the
source reference. A GLB written before an image failure remains accurately listed;
the image destination remains unchanged. This preserves the existing sequential
write behavior rather than promising a multi-file transaction.

An additional red regression caught authored console output corrupting the JSON
stream in trusted in-process mode. Local hosts now inject a stderr Console into
execution; no ambient console is patched. Library defaults remain intact, and
the evaluator protocol explicitly rejects a nonserializable host console capability.
This also protects the local in-process MCP stdio channel from authored log calls.

Three red checks preceded repair. Focused CLI/animation/requirements/protocol checks
pass 18 tests / 153 assertions. Typecheck, lint (644 files), skills and all five
rebuilt runtimes pass. Full gate: 2471 pass / 4 skip / 0 fail, 2475 tests, 292 files,
59628 assertions, 155.37 seconds; coverage 95.03% functions / 92.36% lines with
unchanged thresholds. Runtime: `sha256:e74ee5812a5fd5532011ab9c0bc9c2575af321e1543d0c349f6191ab6a7d533b`.

Actual compiled Node CLI replay uses the default subprocess and unchanged final
vise source: CPU GLB 1.200 s, private GPU GLB/image 4.626 s, failed GPU request
1.276 s. Receipts parse cleanly; file sizes and artifact hashes match. GPU fidelity
names the exported GLB, which is byte-identical to the scored artifact. Original
files remain unchanged and the private service was stopped. Evidence:
external `render-json-replay/receipt.json` and `logs/`.

The sixth main trial, `main-06-cargo-trike-cli`, has started with fresh skills and
CLI-only OpenCode configuration. Baseline handle 5418 is active at this checkpoint.
A private loopback GPU preflight through the same credential-free environment
allowlist passed in 3.648 s (port 62534). The brief exercises three wheels, steering,
wheel-spin clips, track widening and fork replacement. Fresh-model acceptance of
the new JSON/clearance guidance and CLI animation remains to be assessed.

## Steerable cargo trike and sampled pose feedback

The sixth main authoring and both edits are complete. Workspace
`main-06-cargo-trike-cli`, evidence `evidence-main-06-cargo-trike-cli`, driver
`run-main-06.mjs`. Baseline and edits took 433.938, 183.709 and 193.519 seconds;
all exited 0 without timeout. The exported session records 61 assistant messages
on the exact free Muse route and $0 cost. No MCP calls were made in this CLI-only
lane. All three exported PNGs were read; source/GLB bytes and immutable manifest
hashes match. Runtime stayed at `sha256:e74ee5812a5fd5532011ab9c0bc9c2575af321e1543d0c349f6191ab6a7d533b`.

| Stage | Program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | `p_31ba4e02f2cb` | 13,552 / 123 | Recognizable tubular cargo trike with steering and separate wheel-spin pivots. Broad images miss tread penetration during spin. |
| Rear track edit | `p_5545b52cb029` | 13,552 / 123 | Tire center-plane separation changes from 0.70 to 0.84 m. Five axle/stay geometries change; 54 wheel/nut transforms move. Tire geometry, front assembly, tray, saddle, materials and both clips remain. |
| Cantilever fork | `p_b7cf308b8ee1` | 12,668 / 120 | Dedicated local `Joint_FrontFork` under steering contains five components on the +Z side. Two new and five removed meshes, three changed retained fork components; the other 115 meshes preserve geometry and world transforms. Both clips and materials remain identical. |

Asset `a_f203184c04ac427eb4da17be5118c10c`; lineage:
`r_1473cfff296c485487cc312385359db9` → `r_200f98dd65e94c11a55e40ef9ff78f4d`
→ `r_04dbffc0fd3142678c430548cc5464c6`.
The front-view steering sheets show the fork/wheel/handlebars moving together while
the rear assembly stays fixed. The final -Z hub face is open. This is useful local
replacement evidence, not proof of mechanical strength or continuous clearances.
The author acknowledges intersecting stay/hub geometry, chunky tread and absent
drive detail. No rule requires all assets to use these constructions.

F198 records a missed motion constraint: all stages sit 1.384 mm above Y=0 at rest,
but an independent exported-vertex/quaternion sampler finds tread at -9.770 mm
during wheel spin (81 phases). Existing structural QA and broad images did not
establish the requested ground contact. Original scored sources are unchanged.
The review script initially assumed indexed geometry; it now handles legal
non-indexed GLB primitives with implicit sequential indices. This was a reviewer
defect, not an engine export failure.

F197 receives fresh CLI use: the agent uses `render --json` throughout, reads the
actual images and uses CLI animation. It also notices one stale source reference
and rerenders the new revision. Baseline intermediate image files were deleted by
the model, but their actual read-attachment bytes are retained. Later stages were
instructed to preserve intermediates; that prompt difference is recorded. This run
demonstrates adoption, not a controlled causal quality comparison.

### Pose-bounds implementation and replay

Animation review now returns `poseBounds`: phase, seconds, whole-scene bounds and
optional selected-subject bounds in world metres. These come from posed drawable
geometry before camera isolation, using the existing bounds measurement. They do
not add a ground-failure rule or claim continuous contact/collision safety. Input
schemas and geometry output remain unchanged. Shared CLI/MCP descriptions and
author/refine/QA guidance explain the measurements and repeated-geometry aliasing.
The old animation description's prescriptive humanoid-knee guidance is removed.

Two expected red checks precede repair; the focused suite passes 16 tests with
127 assertions. Actual compiled CLI/GPU and MCP/GPU calls agree with an independent
GLB sampler at six phases on unchanged final source. They expose -9.245 mm at
quarter turns. The CLI takes 7.053 s; the private credential-free renderer is
stopped in 0.757 s. Original source and GLB hashes remain unchanged.
Evidence: `pose-bounds-replay/receipt.json`, `wheel-motion-measurements.json`,
`independent-artifact-review.json`, and retained images/events.

Full gate: **2472 pass / 4 skip / 0 fail**, 2476 tests, 292 files, 59653 assertions,
155.12 s. Coverage 95.06% functions / 92.36% lines, unchanged thresholds. Typecheck,
lint (644 files), skills and all five rebuilt bundles pass. Runtime:
`sha256:dbabf8aa4600a7e27177eaeb161fa38884381d8018b4786de63cc03e324edc4e`.

A separate F198 repair replay is active, handle **54515**, driver
`run-main-06-repair.mjs 3`. Four copied skill/reference files were refreshed after
the three scored stages, with originals and hashes retained. This explicitly
prompted repair must not count as another main authoring or erase the original
failure. No repair result is claimed yet. Preserve runtime and copied skills while
it runs. Original model handles 5418, 53137 and 8974, full gate 75015 and maintainer
replay 24867 are terminal; do not restart them.

### Bounded foliage recipe investigation

R04 remains open. Raw `THREE.DataTexture` construction is rejected by generated-source
policy; it must not be taught as an available route. The existing approved
`kiln.texture.leaf-mask-albedo.v1` works with `loadApprovedTexture` and
`foliageMaterial`: actual CPU CLI export contains MASK, doubleSided and embedded
alpha. It is a 4×4 placeholder, not production foliage. External
`cutout-approved-recipe-probe-review.json` preserves the result; GPU, destination
and optional executable recipe publication remain to do. No scored source or
approved resource bytes were altered for this investigation.

## Completed trike repair and material recipes

The explicit F198 repair replay completed in 388.217 s, exit 0, no timeout, $0.
The session has 75 assistant messages on the same exact free Muse route; the
repair itself uses eight CLI commands, five reads and two edits. It reproduces
negative poseBounds, adjusts only the 54 tread lugs, samples nine phases and reads
GPU images. Independent GLB comparison confirms all 66 other meshes, materials,
wheel centers, 0.84 m rear track and both clips remain unchanged.

Repair source `p_db37b5bbc024`, GLB `5622715c00cd465bd1604d94a941a1d4ec6006de15d3ea3cefa3d68aa9e4c47d`;
child `r_29d718006acf4273939726486dbf6c0b` of `r_04dbffc0fd3142678c430548cc5464c6`
in the existing trike asset. Manifest/source/GLB identity and PNG reads match.
The independent 81-phase sampler now measures 0.857–2.195 mm wheel clearance.
Sampled penetration is corrected, but exact Y=0 rolling contact is not established.
The source comment claiming at least 1.5 mm at every phase is wrong; the final
model report acknowledges approximately 0.86 mm minimum. The scored baseline and
edits remain unchanged. This prompted repair is not a seventh main authoring or
proof of general fresh-model improvement. Handle 54515 is terminal.

R04 is locally implemented. Discovery now has 21 recipes, including
`recipe:foliage-cutout-v1` and `recipe:directional-sweep-v1`. The former uses the
existing approved alpha-bearing resource and foliageMaterial; the latter retains
sweep perimeter/path UVs through a reflected bend. Two helper examples now actually
bind alpha and invoke foliageMaterial instead of showing an untextured baseline.
Skills point to optional recipes without selecting an asset category.

The foliage resource is explicitly a 4×4 placeholder. GPU review shows a crude
masked card, not production-quality foliage. Its GLB contains MASK cutoff 0.5,
doubleSided and alpha values 0/96/180/255. The striped sweep visibly follows both
bends, but its planar cap UVs need separate end-grain treatment. Recipes distinguish
CPU placement evidence, GPU material review, and destination filtering/mipmaps/
backfaces. They do not promise arbitrary alpha generation or physical thickness.

Three expected red checks preceded implementation. A local prototype also caught
a variable shadowing the injected bend helper; the recipe now uses curveOffset.
Focused Discovery/sandbox/export checks pass 21 tests / 1024 assertions. Actual CLI
retrieval, CPU/GPU exports and GLB texture decoding are retained in external
`surface-recipes/receipt.json`; both GPU sheets were reviewed. The private renderer
was stopped. A final-runtime CPU export confirms both recipe sources and GLB bytes
are identical to the GPU-reviewed artifacts (`surface-recipes/final/receipt.json`).

The first full gate had one expected helper-example prompt snapshot mismatch,
2473 passes and four skips. Only the intended helper guidance diff was updated;
the failure log is retained. Final gate: **2474 pass / 4 skip / 0 fail**, 2478 tests,
292 files, 59810 assertions, 147.49 s. Coverage 95.06% functions / 92.38% lines,
unchanged thresholds. Typecheck, lint (645 files), skills and five rebuilt bundles
pass. Runtime: `sha256:13d2d5ca2ea57bd3f241f4239f86984dba20bab001f1075043a30a8277ba5875`.
No fresh foliage authoring or non-Three destination acceptance is claimed.

The seventh main trial is active: `main-07-river-skiff-mcp`, driver
`run-main-07.mjs 0`, handle **93286**. A fresh OpenCode workspace and copied skills
use a private credential-free renderer on port 49748; actual isolated-client GPU
preflight passed in 3.686 s. The brief uses Y=0 as a waterline with an intentionally
submerged hull, followed by a 20% beam edit and outboard-to-rudder replacement.
Keep engine and skills fixed through all three stages. Six main authorings/twelve
edits remain complete; 30 main and all 12 held-outs remain. No paid Strands inference,
packaging, commit, push or deployment occurred.

## Completed skiff and workspace upgrade

The watercraft trial and both edits completed on the exact free Muse route in
363.539 / 115.332 / 114.026 seconds, exit 0, no timeout and $0 reported cost.
The exported session has 34 assistant messages. All three stages retained runtime
`sha256:13d2d5ca2ea57bd3f241f4239f86984dba20bab001f1075043a30a8277ba5875`
and the same copied skills. Handles 93286, 13664 and 32835 are terminal. The private
renderer on port 49748 has already stopped; no other service was touched.

| Stage | Source reference | Independent result |
| --- | --- | --- |
| Baseline | `p_b4b4f4559e69` | 1392 triangles / 34 meshes; hull 4.80000019 m long, beam 1.39999998 m, keel Y=-0.349999994. |
| Beam edit | `p_574d6cd49621` | Beam 1.67999995 m; hull X/Y extents unchanged. All 12 motor meshes preserve geometry and transforms. Interior/floor/benches/storage adapt; materials and textures unchanged. |
| Rudder replacement | `p_5d33baa2b13c` | 1304 triangles / 29 meshes. Seven rudder/tiller meshes under Joint_RudderMount replace 12 motor meshes. All 22 non-motor meshes preserve geometry, transforms and material assignments. |

The seven-to-six material-table reduction removes the unused motor cowl material;
it is not a change to retained hull/interior materials. Whole-asset length grows
from 5.085 to 5.13 m because the rudder projects beyond the stern, while the hull
itself stays 4.8 m. Intentional submerged geometry does not acquire a ground rule.

Saved source/GLB hashes, manifest sizes, exported PNG reads and parent lineage all
verify. Asset `a_f68d3902665a4a59aff380bd139f822b` has revisions
`r_0c9e941e70484aecbcb20ae865ba4a62` → `r_dfb205b118a84983942dea7c4e29760b`
→ `r_d94499193c9c40b7b4ce593381bbc177`. Final GLB:
`e8b36c73103e8d8a0888c25ecf296d92e8d95e315337bf410a4dc6b331c10dbb`.
Maintainer reviewed all final source revisions and GPU sheets. Original assets
remain unchanged. Evidence: `evidence-main-07-river-skiff-mcp/`, including independent
artifact, hull/attachment, session and renderer-cleanup receipts.

**F199: bow closure is incomplete.** A double-sided ray through the exported bow at
Y=0.65, Z=0 reaches stern components without encountering hull geometry. The rim
cap leaves the lower stem seam open. The model acknowledged the visible gap;
accepted structural QA does not certify a closed shell. Guidance now distinguishes
intended openings from unjoined end boundaries. Do not make every open sheet fail QA.

**F200: an internal replacement connection is missing.** The tiller starts 20.000025 mm
ahead of the rudder head. Its coherent parent and attached transom gudgeons do not
establish that the handle meets the head. Refinement guidance now checks internal
connections as well as the assembly mount. No reviewer repaired the scored asset.

**F201: weathering is unproved.** The orange hull uses a uniform color and high
roughness, with no textures or visible wear variation. The model supplies a readable
simple skiff but misses this requested appearance. Pale interior features have poor
contrast. Skills now require visible evidence for material adjectives. These three
asset findings remain open for model/recipe/QA qualification, not closed by prose.

L05 is locally implemented. `kiln-init WORKSPACE --check` reports stale runtime
identity/bundle bytes, instructions and all three copied-skill locations. `--upgrade`
refreshes unchanged owned files together, removes unchanged retired resources,
preserves user files, and refuses conflicting customizations before writing. Older
untracked instruction files require explicit comparison/resolution. Existing local
edits survive when their upstream file is unchanged. There is no automatic text merge.
Generated CLI launchers and opted-in MCP configuration reject stale managed workspaces
before serving tools; older launchers need an explicit check/upgrade, and hand-wired
setups remain outside this mechanism. Docs require restarting cached harness sessions.

Five new tests exercise same-version updates, all skill mirrors, actual CLI/MCP
refusal, retained source, conflicting edits, legacy manifests, retirement, traversal
and directory links. The focused workspace set passes 24 tests / 165 assertions.
Actual Node setup/check/upgrade and MCP replay retain the skiff program reference;
source and exported GLB are byte-identical. Corrected foliage limits appear through
actual MCP Discovery. This replay deliberately simulates old copied guidance, not an
installed historical release. The reviewer's first Discovery request incorrectly
combined ids and capabilities; its rejection is preserved and the corrected requests
are separate. Evidence: external `workspace-upgrade-review/receipt.json`.

**F202: earlier foliage warnings were not exposed.** Current typecheck caught two
`note` properties where HelperSpec expects `promptNotes`. The previous material-recipes
checkpoint's typecheck claim was incorrect for its final bytes. A focused regression
also showed the placeholder warning missing from Discovery. Both fields now use the
existing contract; the two reviewed prompt snapshots gain only the intended notes.
This corrects metadata and guidance, not the recipe geometry. The prior failed
typecheck log is retained in the new evidence directory.

Current full gate: **2480 pass / 4 skip / 0 fail**, 2484 tests, 293 files,
59859 assertions, 160.51 seconds. Coverage is 95.06% functions / 92.36% lines;
thresholds remain 94% / 92.10%. Typecheck, lint (646 files), skills, toolchain and
all five rebuilt runtime bundles pass. Runtime: `sha256:0e00f8806ee92927068334e5aa7a64ac947b8d2881283a7474ac12a985d2c85e`.

Seven main authorings and fourteen edits are complete; no held-outs or paid Strands
trials have run. The eighth baseline is active in `main-08-woodland-foliage-cli`,
driver `run-main-08.mjs 0`, handle 98990. It uses the fresh copied guidance, disabled
workspace MCP for the CLI lane, and private credential-free GPU port 53830. Actual
isolated-client GPU preflight passed in 3.644 s. Keep runtime/skills fixed through
both follow-up edits. No packaging, commit, push, publication or deployment occurred.

## Completed foliage and neutral scope measurements

The foliage trial and both edits completed through the CLI on the exact free Muse
route in 448.092 / 238.959 / 213.883 seconds, exit 0, no timeout and $0 reported
cost. The exported session verifies 76 assistant messages, no MCP tool calls,
actual reads of all exported PNGs, saved source/GLB hashes and immutable lineage.
Runtime `sha256:0e00f8806ee92927068334e5aa7a64ac947b8d2881283a7474ac12a985d2c85e`
and copied guidance stayed fixed for all stages. Handles 98990, 47951 and 27244
are terminal. Original outputs remain unmodified; all three sources/GPU sheets
received maintainer review.

| Stage | Source reference | Independent result |
| --- | --- | --- |
| Baseline | `p_66e46e31f04b` | 13944 triangles / 67 meshes, six actual fan groups; X/Y/Z spans 0.761933 / 0.821647 / 0.763333 m. Baseline is narrower than the approximate 0.9 m brief. |
| Canopy spread | `p_60886aed0d00` | X/Z spans 0.909121 / 0.923081 m, +19.3177% / +20.9277%; height identical. Leaf geometry, UVs, crown, materials and texture bytes preserved; stems adapt. |
| Local replacement | `p_f17fc4069422` | 13100 triangles / 62 meshes. Three narrow blades replace the lowest fan's six broad leaves and two cards. All 57 meshes outside that fan preserve geometry, world transforms, materials and hierarchy. Height unchanged. |

The replacement reuses the existing fan's curved stem and root, preserves the five
other fans, and leaves ten alpha cards. Its longer leaves extend the footprint to
0.946257 by 0.958431 m. All materials/textures remain identical across revisions.
The three-leaf replacement has geometric silhouettes; alpha cards remain elsewhere.
Asset `a_39222feda8584e5faa3a1af10ec71d8c` has revisions
`r_a682002d216c49f2b958c6d8ea51cf22` → `r_49978fca95014a0ab3b2138fc2968ac4`
→ `r_45dda45f92194d2086db0d7b9ca52e76`. Final GLB:
`1f4efdd4a55a83ae490ac9bd87a567bab67c6e0bb6c1060dbe1f10749d0bdf31`.

F202 now has fresh-model evidence: the author reads and accurately discloses the
4×4 teaching texture limitation. Pale cutouts remain visibly jagged. The model's
claim that every leaf base sits on its stem is stronger than the evidence: exported
cutout origins are up to 71.087 mm from their own stem/tip surface after widening.
This point-distance check alone does not establish disconnected leaf surfaces;
wide cards may intersect elsewhere. Attachments remain a review limitation under
F192, not a new universal blocker. The crown bottom is Y=-0.0005000001 m and reads
as a small flat disc. Structural acceptance does not erase these visual limitations.
Evidence: `evidence-main-08-woodland-foliage-cli/`, including independent artifact
and canopy/attachment receipts. No reviewer repaired the scored asset.

**F203: scope analysis was absent from neutral QA and overcounted nested members.**
The existing advisory checker now runs only for host-requested scope, reads actual
scene members/dressing signals, and reports its counts through CLI/MCP. Nested
replaceable parts count under their enclosing member root. Labels and inferred
scope do not select rules. Off/missing measurements remain not evaluated; forged
authored count receipts are ignored. This does not certify semantic scope, modular
reusability or pack membership: requested scope acceptance remains incomplete.
Seven focused regressions began with five failures. The combined focused set passes
31 tests / 136 assertions. Actual Node CLI and host-bound Bun stdio MCP agree for
single versus cluster requests. Natural-language part requirements remain unqualified;
phrases such as clear entry must not be silently reinterpreted as exact node names.

**F204: MCP initialization still advertised a separate renderer install.**
The live instruction source now matches the root optional-dependency architecture
and points to service status and local/remote rendering guidance. GPU availability
is still measured rather than inferred from installed dependencies. This is local
guidance correction, not installed-package qualification.

Full gate: **2487 pass / 4 skip / 0 fail**, 2491 tests, 294 files, 59910 assertions,
156.84 seconds. Coverage 95.06% functions / 92.37% lines; thresholds unchanged.
Typecheck, lint (647 files), skills and toolchain pass. One Bun bundle write failed
with EUNKNOWN; an identical-input rebuild passed and all five identities verify.
Both logs are retained; the transient write's cause is not established.
Runtime: `sha256:beec259a7a9cd1762b5824e4df453c6744c4324ebd25ddd654c8d8aab76c4a86`. Evidence: `neutral-scope-review/`.

Eight main authorings / sixteen edits are reviewed; all twelve held-outs remain.
The ninth baseline and length edit completed in 117.714 / 85.153 s; handles 28481
and 75931 are terminal. Both sources and GPU sheets were reviewed. Replacement
stage 2 is active: `main-09-modular-bridge-mcp`, driver `run-main-09.mjs 2`, handle
40380, dedicated GPU port 50504. Final independent comparison is pending; rail
clearance and module-local placement need measurement, not nominal claims. Isolated-client GPU preflight passed in
3.296 s. Keep runtime and copied guidance fixed through its baseline and two edits.
No packaging, commit, push, deployment or paid inference occurred.

## Completed bridge and explicit migration review

The ninth authoring and both edits completed on the exact free Muse route in
117.714 / 85.153 / 199.949 s, exit 0, no timeout, $0 reported cost. The exported
session verifies 34 assistant messages. Runtime
`sha256:beec259a7a9cd1762b5824e4df453c6744c4324ebd25ddd654c8d8aab76c4a86`
and copied guidance stayed fixed. Source, saved hashes, PNG reads and revision
lineage verify. All three source revisions and GPU sheets received maintainer
review. Original assets remain unchanged. Handles 28481, 75931 and 40380 are
terminal. The private renderer on port 50504 is no longer reachable; no process
was stopped and no shared service was altered.

| Stage | Source reference | Independent result |
| --- | --- | --- |
| Baseline | `p_248e259a8993` | 900 triangles / 75 meshes; three real module groups, 6 m overall length, flat deck seams. |
| Length edit | `p_a72b99b4697a` | 972 triangles / 81 meshes; three 2.5 m modules, 7.5 m overall length. Hardware sections and materials preserved; posts increase from three to four per side. |
| Middle arch | `p_ad7d6c622290` | 1812 triangles / 151 meshes. All 54 outer-module meshes preserve geometry, world transforms, hierarchy and materials. |

Asset `a_bc56b172657c401a9f70681d323e428a` has revisions
`r_78bade8fe99d4ea8b4c649abe02be9f5` → `r_1c42a23ec5e847f29d6345d99d3c4b71`
→ `r_fb37b060af4b403cab0d9d5019198ed6`. Final GLB:
`276f7a7325934bf5f8f61cbff7cfaa0d9e64f82065b6fe85705072bcc0271ec5`.
Materials and textures remain identical. Repeated simple box construction is a
valid modeling choice, but the following functional claims are not established.

F196 recurs: top rail inner faces leave **1.460000003 m**, despite the 1.5 m
clear-width claim. Measuring only post spacing misses the projecting handrails.
This is a measured clearance limitation, not a claim that the bridge is unwalkable.

**F205: module groups do not establish interchangeable local frames.** Every group
retains an identity transform; child coordinates carry the placements at -2/0/+2 m,
then -2.5/0/+2.5 m. The grouping supports local edits but copying an outer module
still requires compensating its baked placement. An independently reusable module
needs an intentional local placement/attachment frame; existing guidance alone has
not qualified model use. Keep C07/C08/R02 work open.

**F206: overlapping tilted boxes do not meet the claimed exact end interface.**
The arched deck spans X=±1.287709613 m against requested joins at ±1.25 m. At each
join, downward centerline rays hit the flat neighbor at Y=0.600000001 and the arch
at Y=0.601399415: about 1.3994 mm mismatch and 37.7096 mm geometric overlap into
each neighbor. This is sparse boundary evidence, not complete collision/navigation
qualification. Original replacement remains uncorrected. Evidence includes independent
artifact, seams/clearance/frame and deck-boundary-ray receipts under
`evidence-main-09-modular-bridge-mcp/`.

L03 now has a manifest conversion API plus actual `kiln migrate intent|manifest`
CLI. Versioned review/proposal records preserve the original data, revision/file
identities and field mapping. Missing intents, contradictory categories, custom
fields/profiles, current receipts and unqualified obligations cannot disappear.
Legacy build options remain review data; old QA is never presented as current QA.
Output creation is exclusive, bounded UTF-8 parsing occurs before any work, and no
source execution, model, renderer or asset-store write is involved. Exit 3 means
review required and not activated. Reports cannot serve as runtime host bindings.

Actual Node CLI evidence uses deliberately constructed legacy metadata over retained
skiff artifacts: input, review and artifact bytes are preserved; overwrite and
binding misuse fail. This is not historical-package migration acceptance. Six new
tests cover manifest conversion, malformed/missing/current data, explicit unknown
fields, and actual CLI file/activation boundaries. The focused set passes 49 tests /
165 assertions. Review found a prototype-named field escaping unknown-field reporting;
a failing regression and final Node probe verify the Object.hasOwn correction.
The first green gate predates that correction and is retained separately.

**L03 remains in progress.** Qualified policy activation, successful rewriting of
legacy revisions and L08 historical/installed acceptance are still open. The API
and CLI deliver an explicit review proposal, not a falsely completed migration.
README and migration documentation describe the current upgrade/conversion paths.

Final gate: **2493 pass / 4 skip / 0 fail**, 2497 tests, 296 files,
59966 assertions, 164.31 s; coverage 95.07% functions / 92.38% lines.
Thresholds unchanged. Typecheck, lint (650 files), skills, toolchain and five rebuilt
bundles pass. Runtime: `sha256:52d64a490e4b52e11e2e83fd62b3ff8fdfb506b5eb4e9428a345b1a6f97efb6e`. Evidence: `migration-review/`.

Nine main authorings/eighteen edits are complete; all twelve held-outs remain.
Tenth baseline completed in 369.377 s, exit 0, $0; handle 99405 is terminal. Source
and GPU sheet reviewed. Center-bay edit active: `main-10-six-level-facade-cli`,
`run-main-10.mjs 1`, handle 85252, dedicated GPU port 58202. Actual isolated-client GPU preflight passed in
3.646 s. Freeze runtime and guidance through its center-bay resize and balcony
replacement. No paid inference, packaging, commit, push or deployment occurred.

## Completed facade and structural recipe review

The tenth main authoring and both edits completed through the actual CLI on the
exact free Muse route: 369.377 / 226.475 / 260.074 s, exit 0, no timeouts, $0.
The session export verifies 86 assistant messages. Runtime and copied guidance
stayed fixed at `sha256:52d64a490e4b52e11e2e83fd62b3ff8fdfb506b5eb4e9428a345b1a6f97efb6e`.
Source, saved hashes, lineage, PNG reads and three GPU sheets were independently
reviewed. Handles 99405, 85252 and 75021 are terminal. Originals remain unchanged.

| Stage | Source | Measured result |
| --- | --- | --- |
| Six-storey baseline | `p_db8d80fa7dc4` | 3504 triangles / 292 meshes; six 3 m storeys, four balcony roots. |
| Center-bay widening | `p_5079158376c3` | 3600 triangles / 300 meshes; wall width 8 to 9.333 m, outer window geometry preserved for all 96 window meshes. |
| L4 balcony swap | `p_fcfb489efbce` | 5320 triangles / 295 meshes; all 279 unrelated meshes unchanged, but the platform projects backward. |

The original asset is `a_ab92727c951b4527b1dd69f9b4f980d1`, with revisions
`r_2e6802ec549849348f1dbfd2c93b01cd` → `r_bfdfa76f87f84540a6e0ce9601b54801`
→ `r_6bc6c9127e83464b8d64e306513cadae`. Materials/textures remain unchanged.
Final original GLB: `2ab28d4ee82977e7ab741eaf2b2cba47ae8c0bfc36dd15d68d1265c0019005ff`.

**F207: the extrusion contract omitted signed profile orientation.** On axis Y,
extrudeProfile maps (u,v) to (u,d,-v). The model's positive-sine profile put its
platform at Z=-1.70..-0.05 while the curved railing projected to Z=+1.56.
Discovery said only that the profile is perpendicular to the selected axis.
Exact XYZ mappings and the [X,-Z] footprint idiom now appear in Discovery, generated
prompt notes and geometry documentation. An asymmetric-profile regression verifies
all three mappings against actual generated geometry; no implementation
axis change or silent compatibility fallback was introduced.

F187 also recurs: a full-width 0.4 m plinth crosses the ground-level entry.
Exported centerline rays confirm it at Y=0.02/0.2/0.399, despite accepted QA and
the model's usable-entry claim. A nominal wall aperture is not final clearance.
The double-applied window parent offset also places glazing behind the wall's
back plane; that measurement alone does not establish disconnection from its trim.

Two explicit supplemental repair stages ran in a fresh isolated CLI workspace,
with retained source and saved lineage and the updated runtime. They are not new
main authorings and do not replace original scores. The first, 188.085 s, read the
new exact contract and corrected the platform direction plus split the plinth;
292 unrelated meshes remain identical. It disclosed but left a 5 mm baluster gap.
A targeted follow-up, 121.199 s, changed only nine L4 balusters; all other 287
meshes remain identical. Nine exported centerline samples now measure a gap of
1.10e-8 m, within Float32 precision. Plinth gap is 2.4899999 m; the existing 0.1 m
threshold remains. These are contact/clearance samples, not whole-building
navigation, accessibility or load-bearing acceptance.

Repair lineage adds `r_d0973719a00f4de383e9c9325351b67d`, then
`r_7e0a46eeca32417c9af04fe128d4d237`; final source `p_7a737856c149` and GLB
`8cba5f204fb270db84f2c459f50506dac498eeabe1bb2e20259d3ac22507b426`.
Hashes, image reads, saved lineage, source and GPU views verify. The repair session
contains 41 assistant messages on the authorized free route, $0. Handles 97663 and
87520 are terminal. Evidence: `evidence-main-10-six-level-facade-cli/` and
`evidence-repair-10-facade-cli/`.

R02 now publishes `recipe:structural-bays-v1` and `recipe:open-tiered-seating-v1`.
Both are optional examples using existing operations, with editable local roots.
The facade supports arbitrary storey count, center-only resizing and isolated
infill replacement; its ground entry stays clear and glazing has one depth datum.
The open arena reserves its entrance before generating individually editable tiers
and sectors. Both disclose their layout/material/navigation limitations.

Sandbox/export regressions cover outer detailing, ground-entry rays, glazing depth,
local replacement under a rotated/nonuniformly scaled ancestor, sector omission
and open entrance rays. Actual compiled Node CLI CPU/GPU outputs identify the same
GLBs; both GPU sheets were reviewed. Actual compiled Node stdio MCP returns the
same recipe records as CLI and the signed extrusion contract. The first MCP review
probe incorrectly assumed a JSON envelope for text-oriented Discovery; corrected
single-ID parsing verifies the intended transport shape without changing it.
The recipe fixtures are not fresh-model or destination qualification. C07 remains
in progress for the complete wheel/roof/bay/articulated replacement matrix.

The first full gate had only two expected prompt-snapshot differences from the
reviewed extrusion notes. Those snapshots were updated, and the full gate rerun.

Final gate: **2498 pass / 4 skip / 0 fail**, 2502 tests, 297 files,
61143 assertions, 161.96 s. Coverage 95.10% functions / 92.40% lines;
thresholds unchanged. Focused: 26 tests / 2908 assertions. Typecheck, lint (652 files),
skills, toolchain and all five rebuilt bundles pass. Runtime: `sha256:27e00760b5d1cb4e1bd2e538e781834e4cf05c13b61d0081074d969efa8150ee`.
Evidence: `structural-recipes/`. Discovery has 103 helpers and 23 recipes.

Ten main authorings and twenty edits are complete; all twelve held-outs remain.
Next active: camping-lantern baseline, `run-main-11.mjs 0`, handle 93817, workspace
`main-11-camp-lantern-mcp`, private renderer port 49548. Isolated-client GPU preflight
passed in 3.313 s. Freeze runtime/guidance through globe-height and handle-swap edits.
No paid inference, packaging, commit, push, publication or deployment occurred.

## Camping lantern, first independent authoring

Workspace `main-11-camp-lantern-mcp`, evidence `evidence-main-11-camp-lantern-mcp`,
driver `run-main-11.mjs`. Actual MCP trial, with CLI delivery of the same revisions.
The exported session confirms the exact free Muse route across 41 assistant messages,
$0 reported cost. Baseline and two edits exited 0 without timeout in 245.982,
116.512 and 810.685 seconds. Runtime and copied guidance were unchanged across all
three inputs: `sha256:27e00760b5d1cb4e1bd2e538e781834e4cf05c13b61d0081074d969efa8150ee`.
Handles 93817/43523/59826 are terminal. Stage 2 recovered from one unmatched edit
anchor by reading the exact source; the original rejected call remains in the trace.

| Stage | Program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | `p_75ee0de20004` | 8656 / 55 | Legible green/brass/glass lantern, visible burner and actual vent gaps. Body height about 0.3215 m; five real assembly groups. |
| Globe height | `p_0e3008a57385` | 8656 / 55 | Exported glass height ratio 1.24999995; both diameters retained. Base/burner unchanged, crown dimensions retained and its position raised 0.0375 m. |
| Strap replacement | `p_03774cf8c660` | 8228 / 72 | Four wire/grip meshes replaced with 21 strap/bracket meshes under one new root. All 51 unrelated meshes retain geometry, transforms and materials; original pins/axes retained. |

Asset `a_f7e0e72d2eb74481907176cecf009e07` has verified immutable lineage
`r_07912f6e33cb43ae901296bc55857111` → `r_6bc70ddc5a544839aa3370b3c882cb2f` →
`r_2b112616281a4f808a0776fcd16616d9`. Final GLB:
`11c98f3135a2ffb7e54a312c62f170ebee66d5cc99df61c9513704c4a96e984b`.
All source/export/manifest hashes and the model's exported PNG reads verify. All
three GPU sheets and both edited sources were independently reviewed. Evidence:
`independent-artifact-review.json` and `connection-review.json`.

The model discloses faceted strap joints, intersecting hinge details, blended-glass
budget warnings and appearance-only emission. Independent vertex bounds additionally
show a **0.9999998 mm gap between the positive pivot lug and its aligned crown vent
pillar**, unchanged in every stage. This repeats the attachment failure represented
by F200. Preserved original pins have parallel offset X axes; this static model is
not proof of functional hinge motion. No animation was requested. Assembly roots
are real but remain at the lantern origin; part-local reuse still needs careful
placement. Original scored outputs remain untouched. This is a completed trial
with limitations, not a complete quality pass or evidence that all outputs improved.

## Wheel/branched recipes and assembly replacement acceptance

C07 now has whole wheel, roof, bay and branched-chain replacement fixtures beneath
a rotated, nonuniformly scaled and reflected parent. Both legacy and Three exporters
preserve retained parts, replacement placement, unique remapped names, semantic node
references, joint-role parents and exported animation targets. Reloaded GLBs animate
the replacement without moving the retained assembly. These whole-replacement tests
use optimization off; existing rig-export tests separately cover off/palette/full
metadata preservation. Neither proves external mounting or destination qualification.

R03 adds `recipe:steerable-wheel-v1` and `recipe:branched-articulation-v1`, optional
executable teaching examples. The wheel separates fork/axle steering from spin and
derives dimensions from radius/width. The gripper uses explicit branches and nonzero
rest rotations; absolute local animation retains offsets and returns to the rest
pose. Tests cover both exporters, two wheel radii and sampled actual tire bounds,
not merely the nominal contact marker. The examples disclose physics, mating and
continuous-collision limits; no new category or primitive is required.

Focused red tests failed for the five missing-recipe cases before implementation.
The final focused recipe/replacement run passes 13 tests / 646 assertions; the
assembly and rig-export suite separately passes 39 / 624. Actual compiled Node CLI
and stdio MCP return equal recipes. CPU/GPU exports match, both GPU sheets and all
three five-phase motion sheets were reviewed. Evidence: `articulation-recipes/`
`receipt.json`, `mcp-receipt.json`, `motion-receipt.json`. Fresh-model benefit and
other destination playback remain to qualify.

Full gate: **2511 pass / 4 skip / 0 fail**, 2515 tests, 299 files, 61801 assertions,
161.25 s; coverage 95.10% functions / 92.41% lines, thresholds unchanged. Typecheck,
lint (655 files), skills, toolchain and rebuilt bundles pass. Current runtime:
`sha256:497f994677851ecd3c7e43a3c01469d7c626ecf3d361b5d003ae552837cad4f1`.
Discovery now has 103 helpers and 25 recipes. Next active: main-12 repeated mechanism
CLI baseline, handle 33788, private renderer port 53152. Preflight passed in 3.326 s.
Freeze runtime and copied guidance through its spacing and end-effector edits.
No paid inference, packaging, commit, push, publication or deployment occurred.

## Repeated inspection arms, first independent authoring

Workspace `main-12-repeated-mechanism-cli`, evidence
`evidence-main-12-repeated-mechanism-cli`, driver `run-main-12.mjs`. All three
stages completed on the exact free Muse route, $0, across 73 assistant messages.
Baseline/edits took 1256.361 / 133.684 / 259.884 seconds, with no timeout. Handles
33788, 44126 and 37873 are terminal. Original runtime and copied guidance remained
fixed: `sha256:497f994677851ecd3c7e43a3c01469d7c626ecf3d361b5d003ae552837cad4f1`.
The runtime source/bundles are retained in `runtime-main-12-frozen/`; independent
bundled-source repairs proceeded without changing the trial's executable inputs.

| Stage | Program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | `p_ca0bbf4b7bf5` | 1560 / 53 | Three nested arms, distinct yaw, actual rotated/nonuniform right parent, center-only animation. Readable but sparse industrial asset. |
| Spacing | `p_42c2d750744b` | 1560 / 53 | Carriage spacing 0.8 to 1.04 m, rail 2.4 to 2.88 m. Only rail/conduit geometry changes; materials and animation are identical. |
| Suction tool | `p_f99adb0e83c6` | 1820 / 52 | Six center palm/finger meshes replaced by five tool meshes beneath one new tool root. All 47 retained meshes keep exact geometry and world transforms. Only removed finger animation is deleted. |

Asset `a_a43f50c31c494347a0c5a77400b92959`, immutable lineage
`r_00f20d05fc334720bad00e609c449a6d` → `r_cde8e09805434e98906dce08a55dbe2b` →
`r_e31fb8159a4f47cdaac641e399b18d09`. Final GLB:
`898c554814afa42c90b15211f6d76a659cf6d797923f115004fa406c55d29dd0`.
All source/export/manifest hashes and actual model PNG reads verify. Reviewer read
all three exported sheets and source changes. Evidence: `independent-artifact-review.json`
and `mechanism-review.json`; original assets remain untouched.

The trial has meaningful failures as well as preserved edits:

- **F200 recurrence:** the original local-frame analysis reported 12.499993 mm
  forearm-to-palm gaps in all three arms. The later world-surface check below
  corrects the transformed right arm to 12.415194 mm. The outer two gaps survive both edits. The suction
  connector fixes the center interface, reaching the wrist plane within float
  precision; that does not repair the other arms.
- **F205 recurrence:** carriage/drop-plate/bolts live outside the articulated roots.
  The model changes independent coordinates instead of translating complete module
  roots, despite claiming otherwise. The final suction tool does have its own root.
- **F210:** box-mesh OBB tests at exported animation phases 0.25, 0.5 and 0.75 find
  finger interpenetration. At the closed pose the signed tip-center separation is
  -22.4235 mm: the fingers cross. Valid clip targets are not mechanical correctness.
  Stage 2 removes the clip as requested, rather than repairing its earlier motion.
- **F208:** the agent correctly discovers that CLI has no `edit` command and uses
  anchored host-file edits instead. The trial prompt expected a missing capability;
  this is a workflow defect, not agent refusal. No source/runtime repair was slipped
  into the scored trial.

## CLI edit and replication repair

The observed CLI gap is now repaired with `kiln edit REF --edits edits.json`.
It invokes the shared program-aware `kiln_edit` definition with `render:false`,
returns an immutable revision/diff, and preserves ordered all-or-nothing editing.
The CLI renders the revised reference in a separate existing command. Help, README
and refine guidance explain this distinction. Focused tests first failed for the
missing command, then passed 12 tests / 87 assertions, including shared-tool equality,
no evaluation during editing, failed-batch immutability and bounded malformed input.

**F209:** world-space replication under ordinary rotated/scaled parents rejected
an affine homogeneous constant of `1.0000000000000002`. The source fix accepts
bounded roundoff while retaining projective, singular and shear rejection. Its
observed red regression and related assembly tests pass 33 tests / 633 assertions.
The `snapTo` contract now correctly says its axis controls overlap direction;
AABB alignment does not prove physical attachment. No new frame helper was adopted.

Actual rebuilt Node CLI and stdio MCP return identical edit receipts, preserve exact
revised source, render both ordinary/reflected replication fixtures and preserve
exported world matrices within 4.45e-16. Evidence: `edit-affine-review-qualified/receipt.json`.
The initial reviewer fixture used invalid uppercase namespaces; its rejected output
is retained in `edit-affine-review/` and is not scored as an engine failure.

Full gate: **2516 pass / 4 skip / 0 fail**, 2520 tests, 301 files, 61890 assertions,
162.93 s. Coverage: 95.05% functions / 92.33% lines; thresholds unchanged. Typecheck,
lint (658 files), skills and toolchain checks pass. The first full run failed only
its two stale-bundle checks; all five bundles were then rebuilt and the gate passed.
Runtime: `sha256:93343a61a669cbc5d7021fb3cb4c63b3caf577c0d7b66099e6d972bb70e47eaf`.
No paid inference or release action occurred. Fresh-model CLI-edit use remains to test.

P08's [rule disposition](2026-09-22-qa-migration-disposition.md) now records all 27
rules, preserved modes, current kernels, known coverage gaps and evidence. It closes
the inventory task, not migration activation or the outstanding QA adapters.


## Neutral connectivity integration

The shared connectivity kernel now runs in neutral QA without a category. It reports
rest-pose AABB components in observe mode and explicitly allows intentional separation.
Feedback no longer asserts every separation needs a join or suggests renaming parts
to bypass inspection. Disabled optional observations do not make structural acceptance
incomplete; required/universal checks and promotion safeguards remain intact.

Actual compiled Node CLI/MCP reports agree for a detached two-part cluster (5 m gap),
a connected chain, a 15 mm gap below the historical 20 mm tolerance, and the second
coliseum baseline. That coliseum has two reported groups (27.428 and 69.003 mm),
both advisory. This does not detect the campaign's smaller wrist/handle gaps or
prove surface contact, support, interpenetration or motion clearance. Historical
foliage/decal name exemptions remain disclosed. Receipt: neutral-connectivity-review/receipt.json.

Focused suite: 32 pass / 103 assertions after the initial four missing-adapter
failures. The first full gate exposed a placement test whose global enforce policy
also attempted to promote the new observation; the test now isolates placement,
and a separate assertion preserves the rejection of connectivity promotion.
Final gate: **2520 pass / 4 skip / 0 fail**, 2524 tests, 302 files, 61926 assertions,
169.42 s. Coverage: 95.05% functions / 92.33% lines; thresholds unchanged.
Typecheck and lint (659 files) pass; all five bundles share runtime sha256:a349708461e8f4a621e8e77a1b0efd23c291b30ca645b35edd65a219d2774fd5.
The later author/refine guidance change passes skills/lint and does not change bundles.

## Open coliseum, second independent authoring (CLI)

Main-13 completed the original three coliseum briefs using CLI on fixed runtime
93343a61a669cbc5d7021fb3cb4c63b3caf577c0d7b66099e6d972bb70e47eaf.
An independent runnable snapshot lets engine work proceed without changing scored
trial inputs. Dependencies are shared through a junction and remain unchanged.
All three stages exited zero, without timeout, in 379.637 / 144.923 / 165.549 s.
Session ses_f360bcf4affeNDN9XBklTEQgys contains 55 assistant messages on the exact
free Muse route, $0. Source/export/manifest hashes, immutable lineage and actual
model PNG reads verify; the reviewer inspected all three images and source edits.

| Stage | Program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | p_cc94b482efca | 12174 / 328 | Open arena, 12 tier levels, replaceable arched bays and ruined sector; four plinths obstruct the entrances. |
| Extension | p_4fd1b1c05f8b | 12174 / 328 | X grows 24.6536%; total Z changes by -0.3000 m despite preservation claim. Materials remain identical. |
| Gateway | p_157657b73282 | 12394 / 330 | Four east pylon/cap meshes replaced with six gateway meshes. All 324 retained meshes have identical geometry/world transforms; original entrance obstruction persists. |

Asset a_3562b70a63cf45819b07bf865867041c retains revisions
r_d509985547674414b9f628c963e4977f -> r_388e31b0be9949608eecde7ca225a9a0 ->
r_f191bf8d1f5249ed86e5765041af37ce. Final GLB SHA-256:
8e82d94f8c9d2aa15bf07d7d551137fa974405c7a36c0faf7699d6167b9500e7.

**F208 has fresh-model workflow evidence:** five successful CLI edit calls across
the baseline and edits, using exact returned references. This repairs the missing
CLI operation; it does not establish the generated asset's overall quality.

**F187 recurs:** actual exported-triangle rays at Y=0.27 m hit a 0.4 m plinth across
each of the four approaches in every stage. Passage floors top out at Y=0.12 m,
leaving 0.28 m steps. Higher rays can pass without establishing usable floor-level
clearance. The new gateway has a deliberate central pier; its center ray is not
treated as proof that both arch lanes are blocked. The old plinth remains behind it.

**F211:** the model reports nominal ellipse centerlines as measured overall bounds.
Actual baseline X/Y/Z extents are 25.3603 / 5.8917 / 25.3000 m; after extension they
are 31.6126 / 5.8917 / 25.0000 m, not the reported 30.5 / 5.825 / 18.4 m.
The short-axis entrance floors/walls still extend beyond the oval. Guidance now
asks for returned bounds.size and before/after preservation checks; its benefit
requires a subsequent trial. No silent asset repair occurred.

Evidence: evidence-main-13-coliseum-cli/independent-artifact-review.json and
entrance-review.json. These are sampled obstruction checks, not a navigation
certificate. Images show a recognizable but pale, repetitive coliseum; neither a
structural pass nor the presence of texture-capable materials proves rich appearance.
Main-14 is now running on a separate fixed snapshot. No paid Strands inference,
packaging, commit, push, publication or deployment occurred.


## Six-legged exploration robot, second independent authoring (MCP)

Main-14 repeats the original robot briefs through actual kiln_workspace MCP on
fixed runtime a349708461e8f4a621e8e77a1b0efd23c291b30ca645b35edd65a219d2774fd5.
Session ses_f35fc76e2ffeJN8p87yh0OPSlw contains 25 assistant messages, exact free
Muse route, $0. Baseline/edits complete in 135.854 / 74.333 / 63.649 s, without
timeout, with 11 / 5 / 5 actual MCP calls. Handles 14934/17904/89250 are terminal.
All source/export/saved-file hashes, immutable parents and model PNG reads verify.
Reviewer inspected three exported sheets, source diffs and all three motion sheets.

| Stage | Program | Triangles / meshes | Independent assessment |
| --- | --- | --- | --- |
| Baseline | p_7a710dace729 | 5876 / 97 | Six articulated legs, separate mast and arm, orange/dark/steel materials; simple readable game robot. Full length 2.8207 m includes arm overhang beyond the 2 m body. |
| Body width | p_cfbf5c1fff26 | 5876 / 97 | Body Z 0.6200 to 0.7440 m (+20%); X remains 2 m. Hip centers move out by 0.068 m per side; leg geometry and all animation channels remain identical. |
| Front-tool swap | p_1a30d5543f23 | 5900 / 99 | Three pincer meshes replaced by five fork meshes at the same wrist. All 94 retained meshes preserve geometry/world transforms; materials and the clip remain identical. |

Asset a_5cb6afbfe7bf495aabe108478f9af6a0 retains revisions
r_928ac7ac610943c1afe7a0f8f4e9591f -> r_b8c841f13e1143dfb327ce27e0c02e65 ->
r_4b0f18328db143229c9e2ff35bed42e8. Final GLB SHA-256:
be677766ff16675bfd2073d6c7879027718dc633314ed184b99d88293688506b.

Actual Three.js GLTFLoader/AnimationMixer playback samples the 2 s, 21-channel
walk clip at 65 phases per revision. Foot minima range from 4.0869 to 35.5508 mm
above Y=0, unchanged through edits. No sampled ground penetration occurs, but all
six feet remain above the plane at every sample. Thus the visible alternating swing
and preserved rig do not establish grounded support or a physically stable gait
(F191). This is a measured limitation, not a new universal contact requirement.
The model itself reports shallow lift and the need for application locomotion/physics.

Evidence: evidence-main-14-articulated-mcp/independent-artifact-review.json and
gait-review.json. This is useful editing and animation-preservation evidence, not
continuous collision or destination-runtime certification. The later bounds guidance
was not in this trial. Fourteen main authorings and 28 requested edits are now
reviewed; 22 main and all 12 final held-outs remain. No paid inference or release
operation occurred. The code gate remains unchanged at 2520 pass / 4 skip / 0 fail.


## Renderer capability reporting and main15 provider stop

Discovery now distinguishes CPU mode, local on-demand readiness, compatible remote
health, missing credentials and configured-but-unverified credentials. It never
starts a renderer or requests an image. Health is refreshed without retargeting an
existing host; a later healthy service does not invent an attached port. The host
reports the required restart explicitly. Resource availability and deliberate
in-session port refresh remain separate unfinished work.

Focused checks: 37 pass / 180 assertions. Compiled Node CLI and stdio MCP agree in
six routing/authentication cases; a seventh checks existing-session recovery. The
actual private Dawn/D3D12 RTX 3070 service also reports compatible health. Evidence:
renderer-capability-review/receipt.json. These are reporting checks, not new GPU
rendering or installation acceptance. Full gate: 2528 pass, 4 skip, 0 fail; functions
95.05%, lines 92.34%; all five bundles at 23390f...edfd.

Main15 uses the original thin-organic briefs through CLI, on fixed a349708...74fd5
with the measured-bounds guidance. Baseline process 42365 ended after 638.590 s on
HTTP 429 FreeUsageLimitError. Its one allowed continuation, process 69169, used the
same session and exact contributor route and ended after 75.280 s on the same error
without tool calls. No final saved/exported baseline exists and no campaign success
is counted. The draft, GPU images, source revisions and both event streams remain
in evidence-main-15-thin-organic-cli and main-15-thin-organic-cli. No model was
substituted. Stop this lane pending a provider-access change or owner direction;
continue independent implementation.


### Evaluator-scoped material resources (D09 implementation complete)

Discovery now reports 48 production resource IDs grouped by allowed material slot,
excluding placeholder swatches. The reply is 5,489 characters in the compiled
subprocess CLI (5,376 in-process), without truncation. Worker catalogs cannot inherit
a parent's resolver; opaque external evaluators remain unspecified unless declared.
Host declarations refresh without fetching bytes, including removal of a resolver.

Focused resource/context tests: 30 pass, 191 assertions. Actual compiled CLI and MCP
produce matching catalogs in subprocess and in-process modes. Three IDs selected
from that response resolve into three embedded PNGs; exported GLB hash matches the
MCP render input. Evidence: discovery-resource-review-qualified/receipt.json. The
first proof attempt incorrectly read an absent top-level MCP hash; its output is
preserved in discovery-resource-review. The corrected check uses the documented
viewFidelity.inputGlbSha256. CPU views remain explicitly non-material evidence.

Final gate: 2532 pass, 4 skip, 0 fail; 62016 assertions; coverage 95.08% functions /
92.36% lines. Typecheck, lint and five rebuilt bundles pass at cff10e...2473. No model
retry or packaging occurred. D09 is implemented; installed/final host qualification
and H06 deliberate in-session refresh remain open.


## Targeted surface measurements and CLI inspection

`kiln_inspect` now supports `measure.mode: "surface"`. It measures selected
exported rest-pose triangles and returns closest world points, exact part paths
and explicit incomplete bounds when its work budget is exhausted. Reflected and
nonuniform transforms, instances, degenerate triangles, crossing faces and
overlapping boxes with separated surfaces have focused regression evidence.
Unsupported deformation and invalid/excessive geometry fail visibly. A new
`kiln inspect <file|ref> --request controls.json --views close.png --json`
command uses the same registry definition and atomic image output. Anchor distance
retains its original meaning. No category requirement or universal contact gate
was introduced; QA acceptance is unchanged.

Actual compiled Node 22.23.2 CLI and standalone MCP agree on all four unchanged
baseline-source measurements and return byte-identical CPU close-ups:

| Selected interface | Surface distance |
| --- | ---: |
| lantern | 1.000000 mm |
| left-wrist | 12.499993 mm |
| center-wrist | 12.499993 mm |
| right-wrist | 12.415194 mm |

Independent face projections from the original saved GLBs agree within 1e-8 m.
The right arm's nonuniform parent transform changes its world-space gap; the
earlier 12.499993 mm figure described its local frame. The first qualification
attempt stopped on that mistaken expected value and is retained under
surface-distance-review. The corrected receipt is C:/Users/Mattm/X/kiln-dogfood/unification-2026-09-22/surface-distance-review-final/receipt.json.
Original source/GLB bytes are unchanged. Lantern and right-wrist close-ups were
visually inspected for framing; those views alone do not establish contact.

This is controlled tool qualification, not another model authoring or repair.
Fresh-model benefit and repairs remain open under F200. Zero surface distance
can mean touching or intersection; positive distance does not exclude containment.
Solid clearance, attachment strength, deformation, alpha/displacement appearance
and continuous motion are not certified. Select the actual interface rather than
a large assembly that might touch elsewhere. Updated refinement guidance teaches
that distinction.

## OpenCode V2 availability and invalid main16–18 attempts

Counts remain **14/36 main, 28 edits, 0/12 held-outs**. Main16's separate
`opencode/mimo-v2.6-flash-free` baseline returned quota 429 before any tool call.
Do not retry that promotional route without changed access evidence.

Main17 proves `opencode-go/deepseek-v4.1-flash` is available through the existing
Go subscription, but its workspace recorded Node 22.23.2 while child PATH selected
Node 24.20.0. The workspace correctly rejected interpreter drift. The reviewer
stopped the run after 120.62 seconds; explicit Node 22 works with the same workspace
configuration. This was an operator setup confound, not an asset-quality failure.

Main18 pinned child PATH to Node 22 and passed the actual launcher/GPU preflight.
However, the exported OpenCode V2 session proves the model received only the first
context paragraph, surrounded by literal quotes. The botanical asset brief and
delivery instructions never arrived. `resolveBin` passed a forward-slash absolute
`.exe` path to Windows `where.exe`, then incorrectly fell back to `cmd.exe`; the
shell dropped the rest of the multiline argument. The unrelated vessel draft and
97.76-second stopped run are retained and excluded from model-quality scoring.

F214 is fixed by resolving explicit absolute paths directly and spawning native
executables without a shell. A failing argv round-trip reproduced the exact loss
before the fix and now preserves multiline prompts, quotes, percent signs and
shell metacharacters. PATH-order resolution for named commands remains intact.
Focused checks: 29 pass. Full gate: **2581 pass, 4 skip, 0 fail**, 62,275 assertions
across 313 files in 165.92 seconds; typecheck, lint, skills and diff checks pass.
The actual Node 22 / OpenCode 2.0.14 loopback control retains all prompt paragraphs
and literal metacharacters. OpenCode adds surrounding quotes and escapes embedded
quotes in the provider text, so strict byte-equality failed; that evidence is
retained rather than called an exact provider-text match. Native argv round-trip
is exact. Fresh authoring acceptance remains open. Command-shim multiline transport
is not qualified by the native-executable regression.

The harness reports nominal costs of $0.017208948 and $0.021066216 for main17/18;
these are not independently measured wallet charges or subscription consumption.
Evidence directories, session export, setup controls and attempt dispositions are
under `C:/Users/Mattm/X/kiln-dogfood/unification-2026-09-22`. No provider, workspace
or runtime was silently substituted inside a scored trial.


## Curling botanical leaf, OpenCode V2 CLI authoring (main19)

Main19 completes baseline and two edits through the CLI on OpenCode 2.0.14,
Node 22.23.2 and the existing Go route `opencode-go/deepseek-v4.1-flash`.
Runtime `d81c53fe633053c28868bc55809c5b18758792bc82143d96f7c57666ee7089f6`
and guidance remained fixed. All three complete briefs appear in the exported
session, with only OpenCode's surrounding quotes; all 97 assistant messages name
the requested provider/model. This supplies fresh authoring evidence for the
F214 native-launcher repair. Main17/18 remain excluded.

| Stage | Program | Independent assessment |
| --- | --- | --- |
| Baseline | p_acb6d93bb08e | Recognizable asymmetric curling leaf, textured green upper surface, pale underside and reddish stalk. 53,492 triangles / 8 meshes / 4 embedded PNG textures. Height 1.198790366 m. Small base crease remains; self-intersection is not certified. |
| Widen | p_ecf46527f6e6 | Blade half-width parameter rises exactly 30%; sampled edge-to-edge chords rise approximately 29.97–30%. Stalk, transforms and materials are identical. Height rises to 1.209901089 m, contradicting the model's preservation claim (F192/F211). |
| Two tears | p_12efc614105e | Actual right-edge notches change both blade sheets and their rim. Each sheet changes 756 vertices, entirely on the right half within two local length bands. Left edge, stalk, prior height, caps and materials remain identical. |

All exports match saved revisions and all final model PNG reads match the exported
images byte for byte. The explicit CPU intermediate `botanical/geo-03.png` is white
because these materials obtain their colors from texture maps, which that CPU
geometry view does not sample. All three final sheets explicitly report
`GPU dawn-d3d12:nvidia-geforce-rtx-3070:D3D12 driver version 32.0.16.1074`.
There is no reported CPU fallback for those final sheets. The real provider HTTP
body was not captured; native image attachment bytes were verified.

Baseline and edits finish in 534.956 / 67.786 / 143.243 s, without tool failures.
Nominal harness cost totals $0.11374068; this is not a measured wallet charge or
subscription allowance deduction. Asset `a_3397b988c0244e2185843487b504e498`
retains immutable parent-linked revisions 4a5e8f...32d5 → 5b052b...8f05 → 9cb63a...196d.
Final GLB SHA-256: `3b82647459711dffb489cc7a1fd00ca0c0b3164dad853bb09babb5340105442f`.

Evidence: `evidence-main-19-thin-organic-cli-deepseek/trial-qualification.json`,
`independent-artifact-review-stage-2.json`, `renderer-trace-review.json`, exported
session and original events. The two edit requests are reviewed, not declared
unconditionally successful. The 11.110723 mm height regression remains unchanged.
Fifteen main authorings / 30 edits are now reviewed; 21 main and all 12 held-outs
remain. Handles 51380, 81657 and 51191 are terminal. No runtime code changed in
this review, so no new full code gate or installed-package claim is made.


## Grained handrail, second independent authoring (main20 CLI)

OpenCode 2.0.14 / Go `deepseek-v4.1-flash` / Node 22.23.2 completed all three
original handrail briefs on fixed runtime `1981085ea5c544f0396014f64de26dad011065b7f8d1484eae30df190708ca57`.
All 58 assistant messages name the selected route; all complete briefs and fixed
guidance hashes verify. Baseline / edits took 266.179 / 80.181 / 143.456 s, without
tool failures. Nominal harness cost is $0.082112568, not measured wallet spending.

| Stage | Program | Independent assessment |
| --- | --- | --- |
| Baseline | p_578ff8b256a6 | Curved oak-colored rail, four metal posts, bolted floor plates and replaceable brackets. 5,484 triangles / 47 meshes. Overall bounds 2.449716839 × 0.953999999 × 0.345365872 m; wood top is nominally 0.95 m, caps extend above it. |
| Curve reversal | p_caca752dc9ee | Only rail geometry changes; post/cap transforms follow the reversed bend. Post geometry, all materials, texture bytes and rail UVs are identical. Rail point sets mirror in Z on a 10 micrometre comparison grid. Overall dimensions remain identical. |
| Y brackets | p_08cd669860b1 | Twelve old saddle/strap meshes replaced by twenty fork/cradle meshes; eight wood bolts change locally. All 27 rail/end-cap/post/floor-plate/plate-bolt meshes retain exact geometry and world transforms. Materials, textures, prior curve and overall dimensions remain. 6,732 triangles / 55 meshes. |

Source, saved immutable parent lineage, exported GLBs and all final PNG reads
match. Actual final GPU receipts name RTX 3070 Dawn/D3D12, full-material output,
no degradation, and input GLB hashes matching the saved artifacts. The receipt's
`exactArtifact:false` / `IN_LOOP_BUILD_NOT_PERSISTED` remains recorded; independent
hash agreement is additional evidence, not a rewritten flag. Stage0's author
piped CLI JSON through PowerShell Select-String, which added ANSI/highlight and
line wrapping. The reviewer removed only those display changes to parse the
original single-line receipt. Stage1/2 redirect unfiltered JSON to receipt files.
Provider HTTP image payloads were not captured; native image attachments match.

Natural-language searches for wood grain around a curved rail and brushed metal
led to exact sweep, material and directional-recipe contracts. The model also
checked approved texture access. It chose a procedural albedo and acknowledges
its regular stripes rather than natural oak grain. The curved texture follows
the rail, but visual realism is limited. GPU close-ups show the fork geometry
clearly in isolation; much is buried behind the wood in context. The model
acknowledges the broad, chunky cradle and weak Y silhouette.

Reviewer measurements on saved GLBs find zero unsigned surface distance at all
four baseline/reversed saddles and all twenty final fork/cradle parts. Zero can
mean intersection; it is not proof of a physically sound fitting. Four side-strap
measurements in each earlier stage hit the bounded work limit, with upper bounds
of 0.006–0.0934 mm, and remain incomplete. This is reviewer tool use, not fresh-model
use of surface measurement. The original sources remain unchanged.

Evidence: `evidence-main-20-grained-handrail-cli-deepseek/` contains
`trial-qualification.json`, `independent-artifact-review-stage-2.json`,
`contact-review-stage-2.json`, original traces and session export. Asset
`a_97dba0fe23074610879ec07efd7b9d08` ends at revision
`r_e25c05a8aef04dce857495897fc3c2be`. Final GLB SHA-256:
`2b49351982446863e58cfd5c90483c84f615e127b7d17e7ad9d41a686a91cb93`.
Sixteen main authorings / 32 requested edits are reviewed; 20 main and all 12
held-outs remain. Handles 32173 / 48180 / 63459 are terminal. This is checkout
evidence with clear visual limits, not final candidate or installed qualification.


Post-trial F216 qualification on the unchanged main20 artifacts now completes all
44 targeted surface measurements. The eight old budget-incomplete straps resolve
to approximately 0.006–0.027 mm through current CLI and MCP, agreeing with exhaustive
old-kernel chunks. Original frozen trial runtime, traces, sources and GLBs remain
untouched. This adds no model authoring or edit count. See the QA migration report
and external `surface-search-review/receipt.json`.


## Bench vise, second independent authoring (main21 MCP)

OpenCode 2.0.14 / Go DeepSeek V4.1 Flash / Node 22.23.2 completes the baseline
and both requested edits on frozen runtime 9a67f9...f3b21. The original vise
briefs gain one explicit instruction to use surface measurements; this is a
recorded changed condition, not an isolated comparison of models or guidance.
The exported session verifies all three full prompts and all 44 assistant messages
on the requested route. Actual nested MCP calls number 30 / 11 / 8. OpenCode V2
execute retains typed PNG attachments; final native image reads match the saved
files. All GPU receipts name the RTX 3070 and their input GLB hashes match the
saved artifacts. Real provider HTTP bodies were not captured.

| Stage | Independent result |
| --- | --- |
| Baseline | 9,658 triangles / 64 meshes; bounds 0.304 × 0.18975 × 0.178 m. Grip-tip gap is 39.99999981 mm, agreeing with the model's completed surface measurement. |
| Opening | Gap is 69.99999981 mm. Twenty jaw meshes translate 30 mm with unchanged geometry and materials. F217: the shaft grows from 195 to 235 mm and the helix from 29 to 35 turns, contradicting the requested unchanged component geometry. |
| Copper inserts | 10,806 triangles / 54 meshes. Gap remains 70.00000022 mm. Twenty-eight old insert meshes become eighteen new ones; all 36 non-insert meshes preserve geometry, materials and world transforms exactly. Both insert roots retain their frames. Independent triangle rays at three heights find an 8 mm V recess and symmetric slopes in each insert. |

The model uses exact surface measurements rather than nominal plate spacing, so
F196 has a successful fresh-authoring case. It recovers two wrong subject names
from returned paths, then corrects its own result-field projection. Stage2 also
recovers OpenCode's initially unregistered tool catalog through native search.
These are retained recoveries; the top-level process success does not erase them.

The model reports the opening's screw extension openly, but rationalizes it as
necessary to retain the connection instead of preserving the requested geometry.
Keep this constraint failure as F217. A passing gap measurement and immutable save
do not establish an otherwise preserved edit. The copper swap does preserve the
rest of the mechanism and produces actual counterbores and geometric V grooves.

The GPU sheets retain a blocky silhouette and weak, mostly color-based paint wear.
No textures are authored. Hidden body/slider/screw interpenetration remains, which
the model explicitly acknowledges; it does not claim a manufacturing-solid or
motion-clearance certificate. Zero distance cannot establish a real bearing bore.

All original source/GLB files and immutable revision hashes agree. Asset
`a_e1dec5e251b146e58383f14af963992f` ends at revision
`r_dd68f52c3b9c4acab41bfdf2380a95d0`; final GLB SHA-256
`b361d5a0117c1bfe37f96d8f8572d14698da0124e51b5f4b3bf0b45f029d5ff6`.
Elapsed times: 499.209 / 90.781 / 181.958 seconds. Nominal harness cost
$0.132195726 is not a measured wallet charge or subscription deduction.

Evidence: external `evidence-main-21-bench-vise-mcp-deepseek/` contains
`trial-qualification.json`, independent GLB review, original event logs and the
exported session. The reviewer's initial preflight script assumed raw JSON for
Discovery's text-rendered capabilities and used Windows paths as ESM URLs; those
script assumptions were corrected before inference. No Kiln runtime change was
needed. Seventeen main authorings / 34 edits are reviewed; 19 main authorings and
all 12 held-outs remain. Handles 99650 / 78990 / 6872 are terminal.


Post-trial preservation tooling now reports the original main19 height regression
and main21 shaft/thread geometry changes through shared CLI/MCP inspection.
Four original-export comparisons and eight actual interface requests agree.
This is maintainer evidence only; the original failures remain and no new
authoring is counted. See the QA migration report and external
`revision-comparison-final-review/receipt.json`.


## Cargo trike, second independent authoring (main22 MCP)

OpenCode 2.0.14 / Go DeepSeek V4.1 Flash / Node 22.23.2 completes the original
three briefs on frozen runtime ee4001...90455. The new shared refinement skill is
present; no extra comparison instruction is added to the scored prompts. Full
session export verifies all prompts and route identity. Fifty-four assistant
messages contain 57 nested MCP calls (32/11/14). The model uses exported revision
comparison on both requested edits, recovering one limit=200 schema error by
using 100. Actual saved/exported source, GLB and native PNG-read bytes agree.
Final images use RTX 3070 Dawn/D3D12 with no material degradation.

| Stage | Independent result |
| --- | --- |
| Baseline | 16,248 triangles, 90 meshes, eight materials, no textures; approximately 1.790 × 1.139 × .814 m. The helper rejects a centerline wheel, so the model labels it left. The visible saddle intersects the frame, and front tray supports miss their intended lower stays by 68.962 mm. |
| Rear-track edit | Tire center planes move from .72 to .864 m apart, exactly +20%. Wheels translate without changing geometry/materials, and only axle/stay geometry adapts. Protected components and both clips remain. |
| Fork replacement | Intentionally replaces the two-sided fork with a +Z cantilever and open -Z side, as explicitly requested. Protected wheel geometry, steering/spin frames, rear track and animation channels remain. Single-sided design is not an accidental omission or a strength qualification. |

The original quarter/eighth-cycle motion samples alias the 16 repeated tread lugs.
Independent 81-phase measurements find front/rear penetration of .581/.643 mm.
Rest-pose grounding and passing structural QA did not establish motion clearance.
This repeats F198. A broad connected-component check also cannot prove both ends
of a bar meet their intended neighbors, or distinguish a required joint from a
seat/frame collision. Preserve these original quality misses.

The owner caught the support and saddle defects. Two further model turns are
supplementary repairs, not new scored authorings. The first attaches all eight
L/R support endpoints to their intended members and adjusts tread thickness,
but still leaves the saddle nose intersecting the top tube. Independent review
rejects that incomplete repair. The second changes only saddle/post/rail geometry
or transforms: final saddle-to-top-tube separation is 28.145 mm and seat-tube
separation 124.014 mm; its mount/rails still meet the saddle. Other geometry,
materials and animations are preserved. Eighty-one sampled phases after the
tread repair have positive minimum ground clearance (.055 mm rear, .117 mm front);
continuous rolling contact is not established. Stage4 preserves this wheel geometry.

Original nominal harness cost is $0.079072194; repairs add $0.039853896. These are
harness estimates, not wallet charges. All five process handles are terminal.
Evidence: external `evidence-main-22-cargo-trike-mcp-deepseek/`, particularly
`trial-qualification.json`, `repair-qualification.json`, original and repair
session exports, surface measurements, motion measurements and immutable artifacts.
Final repair is `p_9ddb2485e39d`, revision `r_78dc6a11715d4342b83e89e59f68926b`,
GLB SHA-256 `6eeb8833e9e2a5fbc8f8214b3c0f0615cb349d88456fd92a6dc377edb3c26b9b`.

Product response: add centerline identity through wheel construction and resolution,
update the caster recipe, correct beam/snap helper claims, add an optional joined-frame
recipe using shared attachment points, and teach required pair contacts versus
separations plus non-repeating motion samples. No two-sided-fork requirement or
asset-category gate is added. Actual CLI/MCP measurements on a separate plain frame
distinguish an 86.317 mm deliberately detached endpoint even though its connectivity
graph remains connected. The baseline and resized recipe retain both joints and
positive deck clearance. This is maintainer evidence, not proof of improved fresh
model behavior. Campaign: **18/36 main, 36 required edits, 0/12 held-outs**.


## Modular bridge, second independent authoring (main23 MCP)

Frozen runtime 48daaa...3d7d1 / OpenCode 2.0.14 / Go DeepSeek V4.1 Flash /
Node 22.23.2 runs the original bridge briefs with updated shared skills/catalog.
No extra instruction selects the new frame recipe or a measurement. Native skill
outputs contain the revised authoring procedure and both-end refinement guidance.
The model uses 18 / 10 / 10 surface requests and revision comparison on both edits.
The trace contains 41 assistant messages and 50 / 17 / 15 actual nested MCP calls.
All three full prompts, fixed runtime/guidance and route are verified.

| Stage | Independent result |
| --- | --- |
| Baseline | Three genuine module roots; 6.000 m overall X span, deck boards at Y=.600 m and 1.500 m clear top-rail width. 1,416 triangles / 108 meshes. All 46 selected seam pairs and 12 brace/girder interfaces meet. |
| Length edit | 7.500 m overall X span, same deck top and clear width. Added supports/posts retain their cross-sections; 1,908 triangles / 129 meshes. All 46 seam pairs and 36 brace/support interfaces meet. |
| Arched middle | One named replacement root; all 86 outer-module meshes retain exact geometry, transforms, parents and material bindings. 2,616 triangles / 188 meshes. Final 36 brace interfaces meet, and independent replay confirms two clear-width measurements and eight zero-distance inter-module contacts. |

This is a positive transfer case for selecting/measuring intended interfaces,
not proof that the guidance alone caused it. It also preserves a remaining fit
limitation. Tilted, overlapping box segments make the middle assembly 2.531824 m
wide in X rather than its nominal 2.5 m: 15.912 mm overhang at each end, primarily
from the girders. Sparse deck rays at X=±1.25, Z=.05 hit Y=.600411 m; the center
is .730008 m. The model explicitly acknowledges wedge-shaped end faces and a
small rail step, but still treats construction plus zero distance as establishing
exact deck-end height. These numerical deviations are observations, not an
invented global game-asset tolerance or manufacturing rejection. Flush fit and
continuous walkability remain unqualified. The 6 mm board expansion gaps in the
flat spans expose the substrate to rays at Z=0; they are intentional gaps, not
missing deck evidence.

The model also states that it read only the first comparison page. The maintainer
proves the protected parts independently; this does not turn the model's incomplete
review into complete proof. Repeated interface calls and paginated preservation
are a concrete inspection-usability follow-up under Q02. The recipe was optional
and was not required or explicitly requested by the driver. After this frozen
trial, the refinement reference adds a short distinction between contact and flush
end fit; fresh-model use of that added wording remains untested.

Actual recorded GPU exports name RTX 3070 Dawn/D3D12 with material-faithful images;
input GLB hashes and native PNG-read bytes match saved exports. The renderer's
`exactArtifact:false` receipt is retained; independent byte agreement is separate
evidence. Four flat PBR materials and no textures remain a visual limitation. No
provider HTTP image body or destination importer was captured. Original sources
and immutable parent lineage are retained without reviewer repairs. The initial
review script left renamed brace paths explicitly unmeasured; the completed review
resolves the actual brace names and all 12/36/36 intended endpoint pairs.

Evidence: external `evidence-main-23-modular-bridge-mcp-deepseek/` contains
`trial-qualification.json`, `fit-review-stage-2.json`, `arch-interface-review.json`,
session export and original events. Final program `p_f401f41017dc`, asset
`a_ef2698c9134f49638e28720d70f00dda`, revision `r_e525c8555db9457a96e6f46665204283`;
GLB SHA-256 `143f29be03b3d98efe546490d2d4f92ac1bea50a68f7e11c73a0b4783b670345`.
Durations: 288.758 / 168.931 / 178.002 seconds. Nominal harness cost $0.084181596
is not a measured wallet/subscription charge. All three handles are terminal.
Campaign: **19/36 main, 38 edits, 0/12 held-outs**; 17 main and 12 held-outs remain.


## Shared inspection follow-up after main23

**Inspection usability follow-up is implemented and replay-qualified.**
Shared `kiln_inspect` supports 1..12 surface pairs, explicit numeric-only output,
and complete selected-subtree comparisons. All 38 main23 measurements replay in
four calls per transport with exact CLI/MCP/single-kernel agreement. Both protected
outer modules (86 meshes) remain unchanged; a deliberate 1 cm ancestor move is
reported changed. Comparison accepts actual baseline inspection paths and reports
each revision's path across scene-title changes. All three saved-stage GLBs remain
byte-identical. Partial batch failures stay visible; default output has one image,
while numeric-only output invokes no renderer. Native Strands adapter parity is
covered offline. No new model trial or physical-fit certification is claimed.

Runtime: `sha256:86b41b909b7c6df46ab99e791c037c2f777ed2381dd78cbe8b6d2d435258fe96`. Gate: **2600 pass / 4 skip / 0 fail; 95.1% functions / 92.35% lines**,
62,508 assertions, 197.69 s. Typecheck, lint, skills
and diff checks pass; log `inspection-batches-final-coverage.log`. Evidence:
external `inspection-batch-final-review/receipt.json`. All processes are terminal.

Next: continue the remaining 17 main authorings on a frozen checkout,
including fresh-model use of these inspection controls and flush-boundary guidance.
All 12 final held-outs remain. Preserve the bridge's imperfect end fit and original
trike failures; cheaper measurement does not itself prove better generated assets.


## Repeated inspection arms, second independent authoring (main24 MCP)

Frozen runtime `sha256:86b41b909b7c6df46ab99e791c037c2f777ed2381dd78cbe8b6d2d435258fe96`, OpenCode 2.0.14 /
Go DeepSeek V4.1 Flash / Node 22.23.2; original main12 briefs and current shared
skills. All three full prompts, fixed runtime/guidance and actual model route are
verified in exported session `ses_f342aa5e5ffe5w2e87QT3oLnSk` (49 assistant messages). The
author reads the revised authoring skill, QA skill and modeling references; the
first edit reads the revised refinement entrypoint. Numeric batches appear without
extra driver instruction: 16 baseline pair queries in two calls, four spacing pair
queries plus two anchor checks, and four replacement pair queries. Selected-subtree
comparison runs once for spacing and twice for replacement. MCP call counts: 27/8/7.

| Stage | Independent outcome |
| --- | --- |
| Baseline | 2.4 m rail, .9 m module pitch; 4,988 triangles / 77 meshes. Actual right wrapper retains 25 degree yaw and [1.15,1,.8] scale. All 36 selected mounting/link/finger interfaces meet. Only the center fingers have animation tracks; nine quaternion samples retain finger contact while outer world transforms stay fixed. |
| Spacing edit | Pitch 1.17 m (+30%); rail 2.88 m. Only rail web/flange geometry changes. Hardware/link geometry and animation arrays remain exact; complete outer roots translate. All 36 selected interfaces still meet. |
| Suction replacement | One SuctionTool root at the retained wrist datum; 4,848 triangles / 76 meshes. Six old center-gripper meshes are removed and five tool meshes added. All 71 retained meshes preserve geometry, parent, world transform and material binding. Obsolete center-finger tracks are removed; outer grippers remain. |

The final 38-pair review finds 37 contacts and one 0.500 mm collar-to-accent-band
separation inside the connector. The author measured the wrist mount and head-to-arm
clearances, but omitted this consecutive internal interface. A separate actual
frozen CLI check reproduces .0005 m for that pair and zero for the larger
ToolConnector/SuctionHead groups. These results establish selected surface distances,
not solid fit or strength. No arbitrary game tolerance is imposed; the visible
importance at the intended viewing scale remains unqualified. Original artifacts
are retained without maintainer repair. This is positive adoption and preservation
evidence, with a remaining coverage limitation under F219/Q02. It does not isolate
the causal effect of skills from model variation.

All exported sources/GLBs match immutable saved revisions and parent lineage. Actual
recorded CLI GPU exports report RTX 3070 Dawn/D3D12; input GLB hashes match the saved
artifacts, and native image-read PNG bytes match exports. Preserve the renderer's
`exactArtifact:false` receipt; separate hash agreement is independent evidence.
No real provider HTTP image body or destination importer was captured. Steel/dark
materials and a warm accent are readable but simple and untextured. The suction
head is an opaque visual frustum, with no deforming seal, vacuum or load simulation.
One unavailable browser.preview call ends without a retry; image files are read.

Program refs: `p_54df81e2dd3e` → `p_8db738036baa` → `p_68d64987713f`.
Asset `a_63e7cbeb39b047239dca9fd44eac95d7`; final revision
`r_46beab660a5741c0ab89105a38dc758a`. Final GLB SHA-256
`977852f5820e2c86cf6e22f38548bf1a39e23b574c2a559b637e0fd4a7e2a9d9`.
Durations 314.589 / 93.005 / 119.240 s; nominal harness cost $0.085867626, not a
measured wallet/subscription charge. Handles 10104/4596/38255 are terminal.
Campaign at this milestone: **20/36 main, 40 edits, 0/12 held-outs**. No engine
change or repeated full gate was needed for main24 review. Its 2,600-pass runtime
is historical; the checkpoint records the newer candidate and completed gate.

## Main25 baseline and shared loft defect, historical interim result

OpenCode 2.0.14 / `opencode-go/deepseek-v4.1-flash` completed the river-skiff
baseline in 885.273 seconds, exiting zero. Session
`ses_f340137e5ffeGD6MWkp0erI5q1` and process handle 44943 are terminal. The nominal
harness cost is $0.141251148, not a measured wallet charge. The trial retains
frozen runtime `12feddbd...72e989d` and the original main07 briefs.

Program `p_179be9d50d61` is saved as asset `a_36471b77cfbf4753aee790420593c3de`,
revision `r_6087568633954b3693d005ac56c8b6c9`. Independent stage-0 export/lineage
checks match source, GLB and preview bytes to the saved revision. The GLB has
2,304 triangles and 39 meshes. Evidence is in
`evidence-main-25-river-skiff-mcp-deepseek/` under the external campaign root.
These checks do not establish the model's wall-thickness, material or usable-space
claims. Final visual/brief review and both edits remain before trial qualification.

An earlier unmodified draft exposed inward loft faces for descending sections.
The [loft comparison and replay](2026-09-22-loft-alternatives.md) documents a shared
engine correction, with actual CLI/MCP/GPU evidence on the unchanged source.
The maintainer replay is separate from the scored trial, which must keep its
original runtime through both remaining edits. It adds no campaign completion.

## River skiff, second independent authoring (main25 MCP)

All three stages completed on the original frozen runtime
`sha256:12feddbd19c0becfe3eb2a2083be42604e51feddc4d7fb2a72c5643dc72e989d`,
OpenCode 2.0.14 / `opencode-go/deepseek-v4.1-flash`, using the original main07
briefs. Session `ses_f340137e5ffeGD6MWkp0erI5q1` independently verifies the three
prompts and route across 62 assistant messages. All five authoring/refinement/QA
references were read at baseline. Actual MCP call counts are 48/7/4; no stage
uses surface measurements or protected-subtree comparison, despite that guidance.

| Stage | Independent outcome |
| --- | --- |
| Baseline | 4.8 m hull, 1.4 m beam; 2,304 triangles / 39 meshes. Four downward ray samples confirm an open cavity and approximately 50 mm vertical floor. Axis-sampled side gaps are 52.09–52.59 mm, not proof of 50 mm minimum normal thickness. |
| Beam edit | Hull beam increases exactly 20% to 1.68 m; hull length and height stay fixed. All 14 motor meshes retain geometry, world placement and materials. Hull, rails, benches and associated mounting positions adapt. |
| Rudder replacement | Fourteen motor meshes are removed and eleven rudder meshes added, for 2,152 triangles / 36 meshes. All 25 retained meshes preserve geometry, parent, world transform and material binding. All 24 selected bench/rudder interfaces meet. |

The baseline and width edit retain a **35 mm shaft-to-lower-unit gap**. The model
dismissed a 25 mm bounding-box advisory as harmless and claimed a connected motor;
exported triangle-surface measurements contradict that claim. Existing inspection
could resolve it, but the model never used it. Keep this under the existing F219
inspection-completeness finding rather than adding a watercraft-specific rule.
The rudder replacement removes that motor, but does not retroactively repair the
earlier stages. Tiller reach and mechanical hinge operation are unqualified.
The rough materials are untextured; the model acknowledges limited weathering.

Source/export/preview hashes match every immutable saved revision. Actual CLI
GPU exports use RTX 3070 Dawn/D3D12, input GLB hashes match exports and native PNG
reads match image bytes. Preserve `exactArtifact:false`; the real provider HTTP
image body was not captured. Two malformed requests (mixed Discovery query/IDs
and an unknown camera field) were correctly rejected; the model recovered from
these and an omitted async declaration. Nested tool errors are visible in raw
events even where the harness's aggregate error list is empty.

Program refs: `p_179be9d50d61` → `p_eaa2b410bec5` → `p_249d5b824722`.
Asset `a_36471b77cfbf4753aee790420593c3de`; final revision
`r_90202fc448dc4023939b5dd49ae1a1cd`; final GLB SHA-256
`ea2586f4b28af438a09a760ba4679fc4bdfdc2aa6359d83a6a409ebf1be7c2d7`.
Durations: 885.273 / 139.405 / 178.014 seconds; nominal harness cost $0.180173064,
not a measured wallet charge. Handles 44943/81805/92202 are terminal. Evidence:
`evidence-main-25-river-skiff-mcp-deepseek/trial-qualification.json`,
`fit-review-stage-{0,1,2}.json` and original session/events under the external root.

The trial's manual winding compensation and asymmetric bow remain in its original
source/GLBs. The [shared loft report](2026-09-22-loft-alternatives.md) separately
qualifies both engine repairs and an explicitly migrated demonstration. These add
no authorings. Campaign: **21/36 main, 42 edits, 0/12 held-outs**; 15 main and all
12 held-outs remain. Completion counts record reviewed attempts, not quality passes.


## Woodland foliage, second independent authoring (main26 MCP)

Frozen runtime `sha256:d2df3a0cd56622fbffa77377569fee386cd78133137e753ee0a4a6bda5f905c7`, OpenCode 2.0.14 /
Go DeepSeek V4.1 Flash; original main08 briefs and current shared skills. Session
`ses_f33cb765fffeIC75Af3QTQS0J6` verifies all prompts, unchanged runtime/guidance and route
across 63 assistant messages. All three original stages are reviewed.

| Stage | Independent outcome |
| --- | --- |
| Baseline | Six named fans, 41 leaves, 10,584 triangles / 89 meshes. Exported bounds 0.8133 × 0.7610 × 0.8284 m; approximate 0.9 m width brief is undershot. Opaque shaped mature leaves and six masked young cards share a basal crown. |
| Width edit | Bounds 0.9783 × 0.7610 × 0.9957 m, about +20.3% X / +20.2% Z. Only six stem geometries change; leaf/petiole geometry and UVs, height, crown, materials and texture bytes stay exact. |
| Lowest-fan replacement | FanF becomes three narrow masked leaves on a curved stem. All 76 meshes outside FanF preserve geometry, parents, world transforms and material bindings. 10,210 triangles / 83 meshes; X extent increases another 13.468 mm, with Y/Z unchanged. |

Actual MCP counts are 34/9/9. Numeric batches are used in all stages; the final
edit uses complete selected-subtree comparisons. The author investigates resource
limits and correctly reports the bundled 4×4 mask as a placeholder. It contains
eight opaque and eight transparent pixels at alpha 0.5. Exported materials retain
MASK, cutoff 0.5 and double-sided leaves; original PNG sheets are actual RTX 3070
Dawn/D3D12 GPU captures. Blocky young-card edges and the clipped narrow-leaf
silhouettes remain visible limitations, not production foliage qualification.

Independent surface review measures 88/88/82 intended pairs. All but one pair
meet geometrically: Stem_B to Petiole_B_4 has a 0.400 mm gap at baseline and
0.060 mm after widening. The model sampled other pairs and omitted this one.
No universal tolerance or repair is imposed. These distances reuse the shared
measurement implementation and ignore alpha, so card contact does not prove
visible cutout attachment. Original scored assets remain unrepaired.

All source/GLB/preview hashes match immutable saves and parent lineage; native
image-read bytes match the exports. Keep `exactArtifact:false`; hash agreement
is independent evidence. Stage 2's recorded CLI command retains only viewFidelity,
so its envelope success flag is unavailable, while GPU identity/hash, saved artifact
and image checks pass. Provider HTTP image bodies and destination imports remain
unqualified. The baseline recovered from an empty probe, a generic rejected probe
and a syntax error; raw nested outputs are retained alongside the trace review.

Program refs: `p_c31e905640a8` → `p_15b494e8f6fb` → `p_cc588b33b3e8`.
Asset `a_e4479f611d854d318917ebbce645ab35`; final revision
`r_8c437dae74ed48af9a60f4f5568c57e2`; final GLB SHA-256
`eb3a650d1c2055c55e08a3293cfb9bc0e60cd0853915c6fc4ae16e6e1cb30bed`.
Durations 412.405 / 116.803 / 144.197 seconds; nominal harness cost $0.104366418,
not a measured subscription charge. Handles 60223/36759/95461 are terminal.
Evidence: external `evidence-main-26-foliage-mcp-deepseek/trial-qualification.json`,
`fit-review-stage-{0,1,2}.json`, `trace-error-review.json` and session/events.
Campaign: **22/36 main, 44 edits, 0/12 held-outs**; fourteen main and twelve
held-outs remain. The parallel maintainer E04 repair did not change this trial.


## Six-level facade, second independent authoring (main27 MCP)

Frozen d3c878...e7a571a8, OpenCode 2.0.14 / Go DeepSeek V4.1 Flash; original
main10 briefs. Session `ses_f33b51098ffea8s040QssF9Mus` verifies three prompts and
unchanged guidance/runtime/route across 59 assistant messages.

| Stage | Independent outcome |
| --- | --- |
| Baseline | Six 3 m storeys; 8 m wall width, 8.5 m with cornice, 18.4 m total height. 18 actual apertures, four balconies, 3012 triangles / 251 meshes. |
| Center-bay width | Bay 3.0 to 4.5 m; wall width 9.5 m, cornice width 10 m. All 120 outer-bay meshes retain geometry/UVs/material bindings and move exactly 0.75 m outward. Height remains unchanged. 3300 triangles / 275 meshes. |
| Fourth balcony | Semicircular platform with swept rails; all 251 meshes outside Balcony_L4 preserve geometry, parents, world transforms and material bindings. 3650 triangles / 269 meshes; depth increases to 2.79 m. |

Actual MCP counts 36/12/6; numeric measures in every stage and subtree comparisons
in both edits. All source, GLB and preview hashes match immutable saves and lineage;
GPU CLI receipts match exported GLB hashes, and native image-read bytes match PNGs.
Keep `exactArtifact:false`. All three sheets were reviewed; provider HTTP bodies
and destination imports remain unqualified.

Independent checks cover 144/216/208 balcony surface pairs and nine wall-thickness
rays through each of 18 apertures per stage, excluding glass/mullions. The samples
are clear; entry width changes 1.7 to 2.0 m. Balusters contact the platforms and
mid-rails but terminate 50 mm below rectangular top rails and 30 mm below the curved
top rail. The author did not inspect those endpoints. These are review limitations,
not proof that every intended joint or continuous clearance is correct.

The model fetched projectUV, then wrongly described its bounds-normalized mapping
as metre-scaled. Brick size/phase varies across wall segments. Discovery and the
geometry guide now explain normalization explicitly; the scored assets are untouched.
The trace recovered from a too-large surface-pair batch and one unknown-tool
registration response in each edit. Those registration replies originated in the
harness lookup; they are not evidence of a failed Kiln server call.

Refs `p_1752bc3f06e4` → `p_e756412ec2e8` → `p_e088771d30c3`;
asset `a_5cd63200da32411fbdec80374bb3b6ba`, final revision
`r_a1cf09df73494b4596c561bff9ebdb24`; final GLB SHA-256
`f402265b0e1c7e1177ab2a554e069083ba540b5d63c6b61219926d7c9af1c506`.
Durations 445.486 / 103.834 / 118.264 seconds; nominal harness cost $0.104881626,
not a measured wallet charge. All handles terminal. Evidence under external
`evidence-main-27-facade-mcp-deepseek/`: qualification, fit and trace-error reviews.
Campaign: **23/36 main, 46 edits, 0/12 held-outs**; thirteen main and twelve
held-outs remain. Reviewed completion does not make this a golden example.
## Lantern second-trial attempt stopped before delivery (main28)

This attempt does not add an authoring or edit to the campaign. On frozen runtime
`837998...54f5c54c`, OpenCode 2.0.14 / Go DeepSeek V4.1 Flash ran for 655.948 seconds
and exited 1 with provider error `Too many images in request: 31 > 30`. No final
save/source/GLB/PNG delivery exists. The last retained draft is `p_79ef5df3b603`;
session `ses_f339cad8fffeomd5t52LkT9EXI`, nominal harness cost $0.100345554. The
provider HTTP image body was not captured; the error itself is retained.

Trace mining produced a shared fix: Discovery's uppercase alpha-mode wording
misled authoring while the runtime accepts lowercase. The contract and worker
repair hint are corrected in the next candidate, separately qualified through
actual CLI/MCP. See the [diagnostic report](2026-09-22-retired-source-diagnostics.md).

A second confirmed defect was found: render responses silently limit `parts`
to 80 entries. Replaying `p_51697ae13472` with its frozen evaluator exports 94
subjects. All four lug/cap meshes and their primitive children occur at indices
80–87, immediately beyond that preview. The model wrongly inferred a nested-pivot
traversal bug and guessed incomplete paths. Preserve the failing draft; fix shared
part-list discoverability and truncation reporting before another lantern attempt.

At the failed attempt, numeric-only `image:false` belonged to `kiln_inspect` and required a real
measurement or comparison; it is not supported by `kiln_render`. CLI rendering
without `--views` evaluates/exports without an image. Avoid pretending those are
the same interface or silently dropping images to accommodate one provider. Review
generic probe/inspection guidance and the harness's supported context controls.

Evidence: external `evidence-main-28-lantern-mcp-deepseek/failure-review.json`,
`parts-preview-diagnosis.json` and original events. Handle 38954 is terminal.
Main28 must not be rerun over its retained evidence. Campaign remains 23/36 main,
46 edits and 0/12 held-outs. A fresh lantern attempt remains required.

### Shared part inventory fix

Render responses now disclose `partsTotal`, `partsTruncated` and `partsNextOffset`.
The existing inspection tool accepts `listParts` with a case-insensitive name/path
substring, offset and bounded limit (default 80, maximum 100). Its `partListing`
includes total and matched counts plus the next offset. `image:false` lists paths
without rendering; it can also combine that listing with existing measurements.
The listing uses the same exported-scene path traversal as exact camera and
measurement selection, including nested groups, duplicate names and primitives.

Three focused regressions failed before the fix. The focused suite now passes
five tests / 98 assertions. Actual compiled CLI and MCP recover all 94 paths from
the unchanged failed draft; all eight previously omitted lug/cap paths match the
independent frozen-GLB diagnosis. Filtering and measurement use those returned
paths. CLI listing works with an unavailable required GPU port because it does
not need the renderer. The actual Strands tool adapter returns the same second
page with zero render or image-observer calls; this is offline adapter evidence,
not live model qualification.

Skills, camera guidance and the generated tool reference teach the new workflow.
The fourteen advertised tools now total 32,455 serialized characters; the explicit
context ceiling rises from 31,744 to 32,768 characters for these bounded controls.
The initial full gate caught this measured increase; it is retained rather than
hidden. Coverage thresholds remain unchanged. No images are suppressed by route,
and the provider's accumulated-image limit remains a separate campaign limitation.

Evidence: external `part-listing-review/receipt.json`, `native-receipt.json`,
`part-listing-red.log`, `part-listing-focused-final.log` and the gate recorded in
the current checkpoint. No historical gallery asset was changed or qualified.

## Lantern follow-up, main29 in progress

The fresh attempt uses the same briefs on frozen `3f82c3...5baa315c`. Baseline
stage 0 completed in 753.868 seconds, exit 0; session
`ses_f337d8feeffezhNSPH2nwcKGNR`. Source `p_eb2a5a6f6d63`, asset
`a_d4488868d9ea4c0fa7ff68c87e559841`, revision
`r_358b8c591b8c4c529f18e9f4633721c4`. The independent baseline review verifies
saved/exported source and GLB, image-read bytes, 27,508 triangles and 50 meshes.
The exported GPU sheet was reviewed. This is not yet a completed three-stage
trial and does not increment the campaign. Edits and final qualification remain.

The model independently used image-free `listParts` twice, including a filtered
query for the nested stays. The original silent-preview defect is therefore
qualified both at the interface and in fresh use; one trial does not establish
causal performance improvement or universal model reliability.

Trace findings are retained for the shared tools:

- A missing `D.stayR` reached `pipeAlongPath` as `undefined`, selecting Three.js's
  unit-radius default. The model initially blamed smoothing, then found its own
  missing dimension. Kiln now validates the required radius in both tube helpers
  with a shared guard and closed `TUBE_RADIUS` advice. Invalid values fail before
  allocating geometry; accepted positive radii keep their existing output.
- `materialRecipe` emissive intensity is limited to 0..1 for its core-glTF recipe;
  the model tried 1.8 and received generic rejection. Repair guidance and exact
  Discovery bounds still need follow-through. This is distinct from the portable
  material compiler's intensity range.
- A cylindrical subtraction through an axis-touching revolved crown produced
  zero normals and was correctly blocked by GLB validation. Minimize and classify
  the construction/CSG cause before choosing a shared fix; no quality pass is claimed.
- An excessive profile bevel also required bisection after generic rejection.
  Its valid-domain repair hint remains to be qualified.

Tube evidence: `tube-radius-red-final.log` reproduces both missing-radius failures;
`tube-radius-focused.log` has 38 passes / 1122 assertions. Actual compiled CLI/MCP
`tube-radius-review/receipt.json` rejects missing and zero radii with matching
safe advice and no image/artifact, for both helpers. Positive controls produce
GLBs byte-identical to the preceding frozen candidate. Full gate:
`tube-radius-final-gate.log`, 2644 pass / 4 skip / zero failures, unchanged
coverage thresholds. Main29 keeps its original runtime and source revisions.

Independent baseline measurements find 1.672 mm between globe and crown shell,
4.309 mm between burner tube and collar, and 2.710 mm between tube and deck.
These are selected triangle-surface separations, not evidence about strength or
all intended joints. The model's overall successful rendering and QA do not
certify these interfaces. All evidence remains external under the main29 directory.


## Lantern, fresh second authoring (main29 MCP)

Main29 retains runtime 3f82c3...5baa315c, OpenCode 2.0.14 and Go DeepSeek V4.1
Flash throughout three original briefs. Main28 remains a separate failed attempt.
Three prompts, 58 assistant messages, runtime/guidance hashes, source/GLB/preview
lineage and actual PNG reads are verified. GPU CLI receipts match exported GLBs;
Select-String ANSI/wrapping was normalized only for receipt parsing in edits.
Original events remain intact; provider HTTP image bodies were not captured and
`exactArtifact:false` remains explicit. No reviewer source repair.

- Baseline: 0.15325 × 0.34430 × 0.15000 m, 50 meshes, 27,508 triangles.
- Height edit: glass 0.194 to 0.2425 m (+25%), diameter unchanged; 19 base/burner
  meshes exactly preserved. Crown/handle move +48.5 mm with sampled shape
  discrepancy below 3e-8 m. Height becomes 0.39280 m.
- Strap replacement: 56 meshes, 27,332 triangles, height 0.41430 m. It preserves
  44 of 46 meshes outside Handle, but removes both crown lugs. New hinge lines
  are parallel yet move 2 mm outward. These violate retained scope/axes (F231).

Actual MCP calls 64/6/4. The model uses paginated/filterable part listing twice,
numeric inspection and comparisons in the baseline/height edit, but skips
comparison on replacement. Existing tools/guidance could expose the deviation;
whole-asset bounds do not prove preservation. No additional helper is inferred.

Independent selected surface checks cover 24/24/47 pairs. Stay ends meet their
selected mounts; burner tube remains 4.309 mm from collar and 2.710 mm from deck.
Glass/crown separation is 1.672 then 1.735 mm. Final bracket plates meet the shell;
their 1.5 mm separation from the band is not a missing shell connection. Strap to
top collar is 23.345 mm; zero distance elsewhere does not certify a carrying opening
or continuous clearance. Clear glass, green/brass hierarchy and real vents are
visible in GPU sheets; blend area warnings and sweep intersection limits remain.

Shared trace fixes: F227 missing tube radii; F228 recipe range guidance; F230
collapsed bevel advice. The latter two pass three original worker regressions,
55 focused tests and seven compiled CLI/MCP controls. Valid GLBs are byte-identical
to the prior candidate; portable V2 intensity 1.8 remains supported. Full gate:
2,647 pass / 4 skip / 0 fail, 95.20% functions / 92.38% lines. Two expected prompt
snapshot mismatches were reviewed and updated; the initial log is retained.

F229 remains open: the original centered cylindrical cut creates 16 zero-area
triangles and 48 zero normals. The uncut profile is clean; removing its duplicate
endpoint does not help. A 23-sided or slightly offset cutter passes. Smoothing
exports but retains the degenerate triangles, so it is not accepted as a fix.
No default segment changes, invented normals or ad hoc geometry deletion applied.

Session `ses_f337d8feeffezhNSPH2nwcKGNR`; refs `p_eb2a5a6f6d63` →
`p_38e54bbe8880` → `p_1a6fe1d50eaf`. Asset
`a_d4488868d9ea4c0fa7ff68c87e559841`, final revision
`r_8d5f3aabd7884e89a7b5997092ebf0cf`; final GLB
`a1b4b9d02a3145eef22aeac6fd6ff3de3ad03f581bbdc2e28be2d657c465f13c`.
Durations 753.868 / 433.339 / 362.801 seconds; nominal harness cost $0.350646810,
not a measured wallet debit. External evidence: `evidence-main-29-lantern-mcp-deepseek/`,
`recipe-bevel-review/receipt.json`, `recipe-bevel-final-gate-complete.log`.
Campaign: **24/36 main, 48 edits, 0/12 held-outs**. Twelve main and twelve held-outs
remain; reviewed assets are not golden examples. Historical gallery work remains out of scope.


## Shared Float32 correction after main29

F229 is now fixed in checkout. See [the bounded conversion report](2026-09-23-csg-float32-boundary.md)
for root cause, rejected approaches, actual CLI/MCP/GPU evidence and limits.
The original scored authoring and F231 protected-part failure remain unchanged.
Campaign totals remain **24/36 main, 48 edits, 0/12 held-outs**. Historical gallery
assets remain outside repair/regeneration scope.


## Coliseum, third independent authoring (main30 MCP)

OpenCode 2.0.14 / Go DeepSeek V4.1 Flash completed all three original briefs on
frozen runtime 1276ef...82c774c. Three prompts and 50 assistant messages, unchanged
runtime/guidance hashes, source/GLB/PNG exports, saved lineage and native PNG reads
are verified. Recorded GPU receipts identify the RTX 3070 and match exported GLB
hashes. They retain `exactArtifact:false` / `IN_LOOP_BUILD_NOT_PERSISTED`;
provider HTTP image bodies were not captured. Edit receipts were redirected to
files and displayed as PowerShell field lists; qualification checks the actual
JSON files against the recorded command, successful exit and printed GLB hash.

- Baseline: 24.203862 × 8.060000 × 18.209571 m, 349 meshes, 16,832 triangles.
  Twelve tiers, four radial aisles, arched bays and a ruined sector are present.
- Long-axis edit: 30.252273 × 8.060000 × 18.211574 m. Actual growth is 24.989447%;
  short span drifts 2.003007 mm. The model disclosed that approximate preservation.
- Gateway replacement: 352 meshes, 17,004 triangles, unchanged overall bounds.
  All 347 meshes outside Bay_19 preserve geometry, world transforms, parents and
  actual material bindings. Textures/material arrays remain identical.

The model uses the open-tiered-seating recipe and freely authored profile holes.
Actual MCP calls: 33/6/8; the final edit uses comparison twice, but no stage uses
numeric surface measurements. Two baseline anchor mismatches recover after a
source read. Comparison correctly proves preservation; it does not prove fit.

**F187 recurs, without adding a duplicate finding.** Baseline and length-edit
entrance centerlines are clear at all 12 selected rays; 12 lateral rays meet
seating near the arena end. The final gateway's own two nominal 1.95 m holes are
open, but neighboring Bay_18/Bay_00 walls obstruct 12 of 24 opening rays through
the wall slab, including both doorway centerlines at Y=.5, 1.5, 2.5 and 3 m.
The other 12 rays remain clear. This is partial assembled obstruction, not proof
that every passage is fully sealed or a human-sized traversal certificate. The
model's unobstructed sight-line claim exceeds its evidence. Original source and
artifacts remain untouched; this trial is not a golden example.

The GPU sheet shows the elongated arena, tiers, ruin and warmer stone treatment.
349/352 draw calls and five textures remain explicit runtime warnings. The main
quality gap is useful inspection of occupied and empty space after replacement;
another historical gallery repair would not resolve it.

Session `ses_f3340027bffeZVj2TkB1wNFh06`; refs `p_f31e462eba33` →
`p_5ed20ac38851` → `p_3f3752e653de`. Asset
`a_974b455dac394ae18141cee2f09fd78a`, final revision
`r_8420c3793bf34c12855542bb427e1fd6`. Durations 882.274/232.510/388.385 s;
nominal harness cost $0.252672462, not a measured wallet debit. Evidence:
`evidence-main-30-coliseum-mcp-deepseek/trial-qualification.json`,
`entrance-review-stage-2.json`, `gateway-void-review.json` and original traces.
Campaign: **25/36 main, 50 edits, 0/12 held-outs**.


## Six-legged explorer, third independent authoring (main31 MCP)

All three original briefs completed through OpenCode 2.0.14 / Go DeepSeek V4.1
Flash, on frozen d2f0f9...134a5c. Three original prompts, 59 assistant messages,
unchanged guidance/runtime, saved revision lineage, exported bytes and native PNG
reads are verified. GPU receipts match all exported GLBs and identify the RTX
3070. They retain exactArtifact:false; provider HTTP image bodies were not captured.

The baseline has 128 meshes and 7,828 triangles with orange panels, rubber feet
and steel joints. Core width increases exactly 20%, length stays fixed, all six
hips move 54 mm outward and all 78 leg mesh geometries remain unchanged. The fork
replacement has 129 meshes and 7,864 triangles. All 122 meshes outside the gripper
retain geometry, world transforms, parents and material bindings. The gripper
mount and all 17 exported Walk channels remain identical, including mast/arm and
jaw articulation now carried by the fork. Zero textures; material arrays agree.

Main31 preserves all 17 exported Walk channels, 78 leg geometries during widening and 122 protected meshes during fork replacement. Actual playback in all three revisions still has all six feet above Y=0 by more than 1 mm at 54/65 sampled phases; foot lift reaches 87.919723 mm. No sampled penetration. Left/right groups alternate but this is not a supported tripod gait. No reviewer source repair.

The model used surface measurements in baseline and widening, plus revision
comparison for both edits (actual MCP calls 52/8/6). It fixed its initially nested
animate function before saving. That author error was not an exporter failure.
On resumed turns OpenCode first rejected an undiscovered Code Mode tool name;
subsequent tool search recovered. Its capability parsing then used a regex that
requires compact JSON, but Discovery returns formatted JSON text. Null extracted
fields therefore do not prove missing capabilities or an engine installation
switch. Baseline capability output identifies the exact frozen root, and the
driver verifies immutable runtime/config hashes in every stage. No Kiln-specific
harness patch was introduced.

Main31 predates neutral part-volume QA integration. Original sources and all
artifacts remain untouched. Evidence: evidence-main-31-articulated-mcp-deepseek/
trial-qualification.json and gait-review-stage-2.json. Session
`ses_f33141ce5ffev3rMQD60hNnKCD`; durations 444.802/127.585/95.086 s; nominal
harness cost $0.101898156, not wallet debit. Campaign: **26/36 main, 52 edits,
0/12 held-outs**.


## Thin organic leaf, third completed authoring (main32 MCP)

OpenCode 2.0.14 / Go DeepSeek V4.1 Flash completed three original briefs on frozen
64b5de...996245: baseline, 30% widening and two small asymmetric right-edge tears.
Three prompts/48 assistant messages, source/GLB/PNG hashes, saved child lineage,
native image reads and matching GPU receipts are verified. PowerShell Select-String
wrapped two JSON receipts; qualification removes only ANSI presentation controls
and display line breaks before parsing their full recorded content. RTX 3070
material-faithful receipts retain exactArtifact:false. Provider HTTP image bodies
were not captured. All seven mesh materials/textures and transforms persist.

The baseline has 15,198 triangles and dimensions 0.542258 × 1.192354 × 0.323849 m.
Widening yields 0.542602 × 1.194560 × 0.421712 m: world width +30.2185%, height
+2.206087 mm. The source changes half-width exactly 30% and adjusts twist 30°→23°
to reduce height growth. It does not achieve exact height preservation. Both edits
keep the stalk byte-equivalent in geometry, placement and material binding.

Main32 preserves stalk geometry/material/world placement in both edits and the left edge exactly in the tear edit. Widening increases world Z extent 30.2185% and height 2.206087 mm. The tear formula declares depth .20/.32 but never uses it; exported boundaries remove 99.9435%/99.1331% of the right half-width at sampled stations, moving inward 233.420/152.257 mm, not the reported ~48 mm. Both are real edge notches. Vein-centroid distances to the upper blade remain at most 2.34652 mm across 1760 final samples, so the sheet alone does not prove detached veins. Original source/artifacts remain unchanged; no new gallery repair or duplicate finding.

The final asset has 14,762 triangles. Independent exported-UV boundary comparison
finds two cut intervals and unchanged left-edge vertices; unchanged midrib meshes
remain visible. Baseline/widened/final vein triangle-centroid distance maxima are
1.506149/1.500788/2.346520 mm. These finite unsigned samples do not establish full
attachment or solid validity. The main failure is excessive cut magnitude and
unsupported reporting of the unused depth values. This extends F192.

Actual MCP calls: 25/16/5, including numeric inspection in each stage and comparison
in both edits. A resumed Code Mode tool lookup recovers after search. The fresh
neutral-volume adapter is visible in all three exported reports: six open meshes
are skipped, zero Boolean pairs are measured, and both rule and visual coverage
remain notEvaluated. No thin-sheet rejection or false full-coverage pass occurs.
The model still reports structural accepted/pass; it does not establish visual
quality. This confirms exposure of the shared adapter, not successful use of every
warning. The newer animated-part measurement is outside this frozen trial.

Session `ses_f32fd9fa0ffehQUSivzmXC6Ec6`; refs `p_392b0874efb6` →
`p_a9bea19c30f6` → `p_a076106831d6`; asset `a_f3d78402e40b4b1986cd1a8829ea9ac7`,
final revision `r_a2234572011d4f62bfe81fd03632a206`. Durations
518.694/140.348/163.210 s; nominal harness cost $0.084499302, not wallet debit.
Evidence: evidence-main-32-thin-organic-mcp-deepseek/trial-qualification.json,
surface-review.json and neutral-volume-uptake.json. Campaign: **27/36 main,
54 edits, 0/12 held-outs**. No scored source was repaired.


## Directional-textured handrail, third authoring (main33 MCP)

OpenCode 2.0.14 / Go DeepSeek V4.1 Flash completed the three original briefs on
7aed68...409efb. All 3 prompts/42 assistant messages, source/GLB/image outputs,
immutable child lineage and frozen runtime/guidance are verified. The baseline
has 35 meshes/12,684 triangles, a rounded 2.4 m centreline S rail, four supports
and continuous lengthwise grain. Its material is visibly repetitive, and the
metal has scalar PBR shading rather than a brushed normal/anisotropy map.

Curvature reversal preserves identical overall bounds, post geometry, material
and texture bytes. The final Y-bracket edit preserves the rail, both caps and
all 20 floor-plate/bolt meshes in geometry, world transform, parent and material.
It replaces 8 sleeve/bolt meshes with 20 fork parts, shortening only the 4 post
shafts to accommodate the new neck. Final mesh/triangle counts are 47/12,508.
The model discloses the post shortening and stepped collar appearance.

Model inspection checks seven intended contacts on one support. The reviewer
expands this to 28 explicit neck/shaft/arm/cradle/rail pairs across all four
supports; each bounded triangle-surface search completes at distance zero.
That excludes an external surface gap for these pairs, not containment, fit or
load-bearing failure. No source is repaired. The shared surface inspection is
used successfully in the fresh trial; the sheet is not a golden benchmark.

Stage 0 retains full GPU fidelity with matching GLB hash. Stages 1/2 retain
completed required-GPU CLI commands and exact artifact hashes, but the model
projects fidelity fields out of stdout. Their 2716×908 grids were returned by
OpenCode native image reads at 2000×669. Recorded read paths, aspect ratios and
full-sheet pixels agree with a Lanczos downsample (RGB MAE 0.030/0.036 of 255).
These are transformed image reads, not identical PNG bytes or a captured provider
HTTP body. Transient Code Mode catalog refreshes recover; no alternate Kiln
server or model is substituted. Actual MCP calls are 20/10/6.

Session `ses_f32e94466ffeiBZ7hFmAEvcwgs`; final program `p_a523d3823b5f`,
asset `a_23ccc78bedc5483ab4cbffb62c7a86f9`, revision
`r_a721306a07964f1ba2ccbcce0a8de2b3`. Durations 484.203/354.001/207.278 s;
nominal harness cost $0.151619436, not wallet debit. Evidence:
`evidence-main-33-grained-handrail-mcp-deepseek/trial-qualification.json`,
`independent-artifact-review-stage-2.json`, `all-supports-review.json`.
Campaign: **29/36 main, 58 edits, 0/12 held-outs**.

## Main34: bench vise, third matched authoring

All three original prompts are complete, with retained route, frozen runtime,
guidance, saved lineage, sources, GLBs and GPU receipts. Runtime is
`sha256:a10b30f10bbbf830e10ff6b52fbddec3c66efe25c75a9f7f6de751baa626ca02`.
OpenCode 2.0.14 used `opencode-go/deepseek-v4.1-flash`, session
`ses_f32bca8fbffe1Ruws0Qrd5P33z`. Handles 77453/62692/61901 are terminal.

The baseline measures 302 × 189 × 197 mm, with 57 meshes and 7,200 triangles.
The opening edit changes the measured gripping gap from 40 to 70 mm without
stretching any existing mesh geometry or changing materials. The moving assembly
translates; thread rings are repositioned and two are added. Length becomes
332 mm because the fixed-length slide projects farther from the body.

A first intermediate edit moved an insert while cancelling the jaw-body movement
through its coordinate converter. The model saved that branch, detected the
misattachment by measuring jaw-to-insert contact, and corrected it before final
delivery. Rejected revision `r_6c32edbd894f463da9696a52159eeb8c` is retained.
The accepted edit is a direct child of the baseline. This demonstrates useful
measurement uptake; a correct opening dimension alone did not establish attachment.

The copper replacement changes only the two insert assemblies and their retaining
bolts. All **41 meshes outside those assemblies** preserve geometry, world transform,
parent and material binding. Independent rays sample both actual V recesses at
three heights and measure **6 mm depth**. The flat faces remain 70 mm apart; proud
bolt heads reduce usable clearance to **69.2 mm**. Inserts seat 2 mm into the jaws.
The worn-blue treatment is uniform untextured material plus edge pieces; the
thread crests are rings rather than a functional helix. This is no golden asset or
physical clamping qualification. Final delivery has 47 meshes and 7,300 triangles.

There are 24/15/11 actual MCP calls. Stage times are 624.409/251.377/236.304 seconds;
nominal harness cost totals $0.159582636, not a measured account debit. All three
full GPU receipts retain matching input GLB hashes and material fidelity. Their
`exactArtifact: false` field remains visible for the unpersisted in-loop capture.
Independent exported/saved byte checks establish the actual revision association.
OpenCode reads downsample the 2320 × 1548 sheets to 2000 × 1334. Read paths and
full-image comparisons agree (RGB mean errors < 0.027 on a 0–255 scale); provider
HTTP image payloads were not captured.

Evidence: `C:/Users/Mattm/X/kiln-dogfood/unification-2026-09-22/evidence-main-34-bench-vise-mcp-deepseek/`.
`trial-qualification.json` retains the checks, protected records, ray samples and
three-stage immutable lineage. Authored source remains unchanged by the reviewer.
Campaign total: **29 main authorings / 58 requested edits; 7 main and 12 held-outs remain**.

## Main35: third cargo trike, inspection uptake and relative-motion reasoning

This fresh OpenCode 2.0.14 / `opencode-go/deepseek-v4.1-flash` authoring used the
original three briefs on frozen runtime
`sha256:41212c7f1f8331430ac0b11b187866c753e225dc4bdc647e5d2b8948bd02290a`.
The baseline and two requested edits completed in 720.742, 287.939 and 615.961
seconds. Session `ses_f32a6c889ffeXQGWntaWjwrHcu` retains the exact prompts and
28/8/14 actual MCP calls. Nominal harness cost is $0.364347138; this is not an
account debit. Source, images, original intermediate revisions and traces remain
outside the engine checkout. No reviewer source repair was made.

The 1.8 m baseline has 79 meshes and 12,116 triangles, with an elevated saddle,
continuous frame, separate steering/wheel-spin pivots and an open cargo tray.
Rear track changes from exactly 0.560 to 0.672 m. The seven changed meshes are
rear connecting members/axle; wheel geometry, materials and animation channels
remain identical. Shared surface inspection exposed two 8.186658 mm rack-post
end gaps during the first edit. The model corrected them before saving, without
reviewer instructions. This is useful tool uptake, not evidence that every joint
in the initial asset was sound.

The second edit removes the two-sided fork and adds a six-mesh cantilever under
its own `Joint_Fork`, on +Z with the -Z side open. Independent exported comparisons
show all 75 meshes outside the replaced fork retain geometry, world transforms,
parents and material bindings exactly. Rear track, front wheel center and both
clip channels remain unchanged. The final asset has 81 meshes and 12,284 triangles.
The model used one revision comparison and targeted joint/clearance measurements.

All final sources and GLBs match immutable saved revisions and all three exported
PNGs were actually read by the harness. The last CLI response was formatted to a
subset of fields; its full GPU receipt is retained in the saved manifest, whose
preview PNG and GLB are byte-identical to the exported/read files. All three GPU
receipts match the saved GLB hashes and report full materials without degradation.
`exactArtifact: false` is retained, not rewritten. Final references:
`p_4c4f269bf7c9`, asset `a_3af2260b27d148dab6c0d8542b382f6b`, revision
`r_2a8815a57f904e39923e170ba226279b`.

Independent sampling of 81 times per clip preserves the original motion limits:
steering front-wheel minimum Y ranges from -0.333892 to +0.942385 mm, while rear
wheels remain +0.236828 mm above Y=0. During spin, tread sampling reaches about
+1.643435 mm front and +1.479087 mm rear, with tiny negative floating-point minima.
These are sampled exported vertices, not rolling or continuous-contact proof.

**F234:** the model attributed its final dogleg-arm change to avoiding a steering
collision. That explanation is wrong: fork and tire share a rigid steering frame.
Across all sampled steering poses their relative transform changes by at most
4.45e-16; spin changes it substantially. The model increased static clearance, but
steering alone cannot cause the claimed new collision. The refinement motion
reference now distinguishes shared rigid motion from child-joint/deformation and
external-neighbor motion, and warns that world-axis box overlap can vary without
an actual collision. This is a small general guidance correction, not a new
primitive, automatic collision guarantee or asset-specific rule. Skill validation
passes; fresh-model uptake remains unqualified. Main35 and native04 retain their
original frozen guidance. Prepared main36 copies received the clarification before
any stage began, with old/new hashes retained.

Evidence: `evidence-main-35-cargo-trike-mcp-deepseek/trial-qualification.json`,
`wheel-motion-measurements.json`, `trace-surface-measurements.json` and the
independent artifact reviews under the campaign root. The shared tools have useful
new positive evidence; this remains an imperfect authored asset, not a golden example.
Campaign total: **30 main authorings / 60 requested edits; 6 main and 12 held-outs remain**.


## Modular bridge, third independent authoring (31st reviewed completion)

Main36 uses OpenCode 2.0.14 and `opencode-go/deepseek-v4.1-flash`, on frozen runtime
`sha256:d445c52e47090466d6330fba6d7bfd85b62ff15a60772c19b3c6e09ca9a68379`.
Baseline and both original requested edits exit successfully in 385.131, 97.958
and 303.599 seconds. The session export confirms all three exact prompts and the
fixed route. Source hashes, saved revision lineage, GLBs, GPU fidelity and actual
image reads agree. Reported nominal harness cost is $0.124901; this is not an
account debit measurement. There are 41/10/10 actual MCP calls.

The baseline spans 6 m across three independently translated modules. The first
edit grows each module from 2 to 2.5 m, preserving width and height. Clear rail/toe
width measures 1.5 m throughout all three stages. The final arched middle module
preserves all 78 external meshes, local/world transforms and material bindings.
The model uses an actual revision comparison and corrects its initially swapped
sweep-profile dimensions before saving. That failed intermediate remains retained.
Mesh/triangle counts are 111/1,668, 117/1,740 and 125/3,820.

All 16 structural seam pairs and 24 brace-neighbor pairs per stage measure contact
through the exported geometry. The deck still has regular 10 mm plank gaps,
including module boundaries; it is not a gap-free walking surface. Independent
rays at every plank midpoint and both supporting girder centerlines give 60/72/88
samples. Flat modules agree to floating-point precision. Arched samples range from
1.953 mm penetration to 1.191 mm clearance. This extends F219's known limitation:
zero group distance and connectedness do not establish conformity across a support
surface. No source was repaired by the reviewer, and sparse rays do not certify
continuous walkability or strength.

Evidence: `evidence-main-36-modular-bridge-mcp-deepseek/trial-qualification.json`,
`geometry-review.json`, independent artifact reviews and original session/events.
Five main authorings and all twelve held-outs remain.


## Main37: repeated arms, third independent authoring

OpenCode 2.0.14, Go DeepSeek v4.1 Flash; original three matched briefs. Frozen
75411f46...e3dca3a0; all three processes terminal. GPU material receipts, actual
image reads, source/export hashes and immutable save lineage are independently
verified. Fifteen/fifteen/twelve MCP calls; nominal harness cost $0.078633648 is
not an account debit. Thirty-two main authorings and 64 edits are now reviewed.

Mount spacing increases exactly 30%. The rail length changes while every arm
mesh retains local geometry and transforms. The replacement preserves all 66
outside meshes, their material bindings, hierarchy and world transforms. Its
single tool root uses the old wrist datum. Only the central plunger moves through
30 mm; the outer modules stay still over 33 sampled clip phases. Obsolete central
finger tracks are removed. The rotated/scaled right-arm parent remains exact.

The model incorrectly treats equal triangle count as proof of preserved shape;
independent comparison supplies that evidence for the arms, not the rail. Motion
review found F237: a false zero surface distance at 0.65 s. The original measured
results and source are retained; the shared correction is documented separately.
Positive clamp/hub surface distances do not alone indicate detached parts because
the hub can be contained within the clamp. No fit, suction, strength, continuous
collision or golden-asset certification is made.

Evidence: external `evidence-main-37-repeated-arms-mcp-deepseek/trial-qualification.json`,
`geometry-review.json`, and `surface-coplanar-review/receipt.json`.


## Main38: river skiff, third independent authoring

OpenCode 2.0.14 and Go DeepSeek V4.1 Flash use the original matched briefs with
frozen runtime 6134bfb4...02f51be. All three processes finish in 1,059.945, 177.527
and 238.966 seconds, with 32/12/9 model steps and 24/9/4 actual MCP calls. Nominal
harness cost is $0.330333282, not a measured wallet debit. Exact session prompts,
route, guidance hashes, saved lineage, GLBs, GPU receipts and native image reads
are independently verified. The campaign now has 33 reviewed authorings and 66 edits.

Hull beam measures 1.399468 then 1.679361 m, a 20% increase. Hull length remains
4.62 m within 7.54e-8 m; lower Y changes by 2.98e-8 m from Float32 reconstruction.
All 14 motor meshes retain geometry, hierarchy, transforms and material bindings.
The rudder replacement preserves all 14 unrelated meshes exactly. Seven new parts
share a replaceable root; reused Tiller/TillerGrip names are distinguished by their
new parent path. Removing an unused motor material changes the material table,
without changing retained material bindings.

Nineteen/19/13 chosen exported surface pairs measure contact or intersection.
Four hull-only cross-sections show open inner/outer walls with approximately
41–43 mm lateral gaps; four downward rays show approximately 50 mm floor depth.
The 248 reflected bow samples per stage agree within 1.18e-8 m. These are bounded
surface checks, not watertightness, minimum thickness, strength, complete attachment,
cockpit usability or tiller ergonomics certification.

The model repaired initially upright loft attachments after viewing its image.
It then spent several revisions changing geometry to chase a rim lighting artifact.
A separate [normals-only replay](2026-09-23-boolean-normal-guidance.md) removes that
band with the existing helper and identical triangle positions. The scored source
retains the artifact and uniform materials do not establish the requested weathered
finish. The pale liner is an open single-sided sheet. This is not a golden asset.

The baseline uses no numeric surface checks; the replacement uses two surface
batches and one comparison. Several responses were initially reformatted through
guessed field names, causing avoidable rereads. Independent export comparison
supplies the preservation evidence. No native/CLI/MCP context boundary is changed.
Evidence: `evidence-main-38-river-skiff-mcp-deepseek/trial-qualification.json`,
`fit-review-stage-0/1/2.json`, original events/session and `main38-normal-review/`.

## Broadleaf foliage, third independent authoring

Main39 completes baseline and both edits on its unchanged `e9d437...b56104b28`
runtime through OpenCode 2.0.14 / Go DeepSeek V4.1 Flash. All three original prompts,
shared-skill hashes, exact exports, required-GPU receipts, actual PNG reads and
immutable revision lineage are verified. Evidence: `evidence-main-39-foliage-mcp-deepseek/trial-qualification.json`.
Processes took 747.708/245.889/209.791seconds; 37/14/8 model steps started,36/13/7
finished, and 36/10/5 actual MCP calls. Nominal harness cost 0.316462626 dollars is
not a measured subscription debit.

The width edit preserves all 76 leaf geometries/orientations/materials, total
height and four crown meshes. Exported X/Z widths grow 20.73%/21.95%, not exactly
20%. Replacement changes only the lowest fan: all 139 unrelated meshes and their
material bindings/transforms remain identical; the replacement has its own curved
stem and exactly three narrow leaves. The root placement is preserved.

The model measured crown-stem contact but not every petiole interface. Reviewer
checks cover 158/158/142 intended interfaces and retain 9/10/8 gaps over 1 micrometre,
maximum 0.580/0.657/0.632 mm. This continues F219's inspection-coverage limitation.
Zero unsigned distance is contact or intersection, not strength or visible alpha
attachment. The 4×4 alpha placeholder produces coarse cutouts, some blades read
edge-on, and 162/146 mesh draw calls remain unoptimized. These are reviewed trials,
not golden assets or botanical-quality acceptance.

The trial exposed [F245](2026-09-23-render-metrics-bounds.md): MCP/native bounds were
inflated by transformed empty box corners. The model's own verifier repeated that
method and incorrectly blamed CLI. The shared collector is now fixed and checked
through all three surfaces without changing the GLB. No correction was applied
to this frozen trial or its source. Campaign total: 34/36 main, 68 edits, 0/12 held-outs.

## Six-level facade, third independent authoring

Main40 completes the original baseline and both edits through OpenCode 2.0.14 /
Go DeepSeek V4.1 Flash on frozen runtime `2c002afb...99aee2c`. All three prompts,
runtime/guidance hashes, saved child revisions, exact exports, required-GPU
receipts and actual PNG reads are checked. Evidence:
`evidence-main-40-facade-mcp-deepseek/trial-qualification.json`.

Processes took 358.134 / 111.720 / 213.256 seconds; 32/10/15 model steps started,
31/9/14 finished, with 44/8/21 actual MCP calls. Nominal harness cost $0.119515332
is not a measured subscription debit. The model uses current source references,
measurement batches and protected-subtree comparison. It diagnoses and corrects
the initial half-revolution direction from images and measurements before saving.

The center bay grows from 2.666667 to 4 m. All 146 outer-bay meshes retain geometry,
materials and parent identity with only the requested ±0.666667 m translation.
All six storey transforms and 36 existing railing-post shapes/materials remain.
The semicircular replacement changes only Balcony_L4; all 285 unrelated meshes
retain exact geometry, world transforms, parents and bindings. It has one coherent
root, nine posts and curved rails.

Independent review measures 148/160/155 selected interfaces, with maximum
separation below 1e-8 m. Nine finite rays through each of 18 apertures per stage
find no shell obstruction. Glazing and entry door/transom/handle are excluded
only from the aperture test; all-part hits are retained separately. This does not
prove openable doors, usable access, structural strength or continuous clearance.
The reviewer's initial corbel query selected the storey above its actual support;
that mistaken selection is retained separately and corrected to the lower wall.
It is not a product defect.

Material hierarchy is readable but visually plain; no detailed brick texture or
general appearance pass is claimed. No reviewer source repair was applied.
Campaign total: 35/36 main authorings, 70 requested edits, 0/12 held-outs.


## Main41: final main lantern authoring and two edits

Main campaign total: **36/36 authorings, 72 requested edits, 0/12 held-outs**.
This is reviewed completion, not a golden-asset or installed-package quality pass.
All three processes are terminal: handles37522/39951/12829, exit0,
584.710/357.298/571.044seconds. OpenCode2.0.14 used
`opencode-go/deepseek-v4.1-flash`, session `ses_f31c6eeeeffeb7pNjIcKlSJ1Sj`.
Original matched briefs, skill hashes and frozen runtime `2c002afb...99aee2c`
remain identical across all stages. The baseline and both immutable child
revisions have matching source/GLB/export/save evidence and actual PNG reads.

The baseline's green/brass/glass hierarchy and open crown slots are readable,
but the glass is milky and local camera crops omit surrounding context. The first
edit changes exported globe height from0.156000003 to0.195000008m, a25%increase,
with original X/Z vertex coordinates preserved. All18 base/burner meshes remain
exact. All15 crown/handle meshes translate39mm, retaining their shapes and
material bindings; largest mapped vertex deviation is2.53e-8m.

The strap replacement preserves all36 meshes outside `Assembly_Handle`, including
geometry, world transforms, parents and material bindings. Its two hinge-pin
centers remain exactly `[0,0.345,+/-0.047]`. The replacement has one assembly root;
all12 selected bracket/pin/rivet/strap interfaces meet. Sampled central strap
vertices clear the crown cap by77.282mm. This finite rest-pose check does not
establish hand fit, continuous clearance, strength or hinge operation.

Independent51/51/59 pair measurements retain a1mm flange/body vertical gap in
all three revisions. Four decorative base rivets are buried inside the tank.
Glass/bottom-collar surface separation is0.200mm after the height edit. Other
positive unsigned distances include contained geometry and an unneeded direct
collar/tube pair: they must not all be called detached joints. The intended
body/tube interface meets. These extend existing F219 inspection-completeness
limits; no scored source was repaired or generic tolerance introduced.

The author used27/12/10 model steps and25/6/5 actual MCP calls, including one
protected comparison in the replacement. Nominal harness cost is$0.22240893,
not established subscription spend. The author's final edit CLI outputs selected
only some GPU receipt fields: exact GLB hash and materialFaithful=true are present
for every required-GPU export, but full renderer/degradation metadata is absent
from the last selected output. The saved preview uses different cameras; its PNG
hash must not be substituted for the exported sheet. The review retains that
limitation and the initial reviewer parser failure separately.

Evidence: external `evidence-main-41-lantern-mcp-deepseek/trial-qualification.json`,
`independent-artifact-review-stage-2.json`, fit reviews, original traces/artifacts
and `qualify-main-41.mjs`. Main41 precedes F246/native-focus changes and cannot
establish uptake of them. All12 final held-outs remain.
