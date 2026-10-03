# Kiln core, scene and asset stabilization

**Release direction, 3 October:** Matt confirmed the farmer hand fixes look good,
could not reproduce the water jump in the local candidate, and authorized settling
the performance findings followed by commit, main integration and site deployment.
The [release disposition](../reviews/2026-10-03-release-disposition.md) records the bounded performance decision.
Troy, physical-device promotion and npm publication remain deferred. Earlier open
water and authorization statements below describe superseded checkpoints.

**Reopened 3 October after owner feedback:** Matt still observes repeated wave-position
jumps while orbiting Golden Gate. GG-5 is open; earlier boundary checks are bounded
evidence, not proof that this report is resolved. The current investigation and exact
preview/build distinction are in [the water follow-up](../reviews/2026-10-03-water-orbit-follow-up.md).
The 108-minute campaign is not a requirement for this release checkpoint; use focused
failure-driven validation and preserve historical failed results. Prepare commit/push
and Cloudflare deployment, but do not execute those release actions yet. Troy follows
stabilization and a separate requirements discussion.

This is the current alignment plan, recorded on 2 October 2026 after the hub audit
and updated by Matt's 3 October clarification. The goal is to stabilize the existing
core, scenes and assets, adversarially review behavior, implementation correctness
and the cycle's intent, and qualify reproducible final local artifacts. Troy ideas
were brainstorming, not an adopted specification, backlog or task. Troy construction
is deferred for direct discussion with Matt; keep the Troy pack off the public site.
No commit, upload, deployment or package publication is authorized. Current code,
AGENTS.md and CHANGELOG.md remain the behavior and release authorities.

Updated 3 October with the maintained [backlog](../backlog.md). Read the backlog for
item status and this plan for acceptance criteria and sequencing.

The implementation is now on local branch `codex/core-scenes-alignment`, based on
`ac8456c` and still uncommitted. The backlog's local-progress table is authoritative
for candidate status; the starting-point evidence below describes the earlier audit.
No production deployment, public package publication or saved-asset rebake has occurred.

Core implementation and separate runtime/package gates pass. A fresh 224/224
source corpus run now binds current identity `58b1b178…`, with every per-input result
and optimized hash equal to the prior dd25 checkpoint; 20 terrain files remain
explicitly decoded derivatives. The motion3 portable gate passes 713 tests with
18 historical skips, and Farm/Foundry controls pass both backends. Bounded
[adversarial review](../reviews/2026-10-03-stabilization-adversarial-review.md) finds
no new concrete implementation blocker within its stated surfaces and test limits.

The code5 local site `26ecd2b2…` now has fresh qualification: 564 tests with two
historical skips, 70 Astro files without diagnostics, static checks, six NVIDIA
control scenarios / 34 checks, nine flows, 396 accessibility widths and 44 keyboard
tours pass. HTTP checks cover 116 downloads, 520 files, 89 pages and three checksum
endpoints; revision reconciliation covers 292 records / 882 checks without mismatch.
Actual public Farm orbit/pinch/first-key behavior passes on both backends in public-02;
public-01's warning-classification failure is preserved. Current fresh/managed skill
copies pass. The final skill-only artifact `978664da…` passes fresh static/delivery/
HTTP checks and exact continuity: 2,721 product files, all 200 HTML and 243 scene
files are unchanged from `26ecd2b2…`. Current skill archives match maintained
guidance. Original browser measurements retain their identity and scope. After
documentation freezes, the final offline package byte audit is separately recorded
at `tmp/alignment-20261003/package-stabilization-final/receipt.json`; the qualification
ledger records its result, with no outcome claimed in advance.

Matt selected focused checks, expanding only if a failure needs investigation.
All 18 intended focused runs / 20.5 measured minutes are collection-valid, with raw
D41 17 pass / one fail. The original candidate Golden Gate balanced flyover's
50.1 ms interval at 56.9993 s stays failed. Both post-run quiet gates fail, with CPU
maxima of 16.473% and 16.159%, sampled 18.125 s and 6.326 s after their respective
blocks. Farm's 135-second minimal hero-view pair has original/candidate maxima of
25.0/33.4 ms, both raw D41 pass. The overall focused audit remains **FAIL**.
One additional unchanged flyover A/B pair completes two measured minutes at
50.0/16.7 ms maxima, with both D41 and all quiet/cleanup checks passing. Its early
12.694% CPU preflight failure stopped before browser launch and is retained.
The candidate's later 50.1 ms miss did not recur; no actionable cause or new runtime
fix is justified. The repeat does not erase failures or establish full qualification.
All intended measurements and functional implementation are complete within their
tested scopes; strict desktop performance acceptance remains open. No further
benchmark expansion is presently justified. The 18-cell / 108-run preparation is preserved,
deferred and unrun; it is no longer the active requirement. The older
UI3 balanced block retains 37 D41 passes and five failures across 42 runs; it does
not qualify the changed candidate. Golden Gate startup native pipeline preparation
has functional proof; the separate drive event remains. Farm's late pause overlaps
major GC. Four serialized 135-second allocation observations are complete: neither
current observation has a natural interval above 40 ms, while original observations
reach 50.0 and 41.7 ms. Current GC still takes about 36 ms; source allocation/retainer
ownership remains unresolved and no speculative repair is justified. Owner farmer/
water appearance review follows development goals. Device/importer limits and
original failures/skips remain explicit; no release or Troy work is authorized.

## What already landed

The large scene optimization pass **is done in source**: PR #131 (`b1ac6ee`,
2 October) integrated the scene-kit features, all three scene adaptations, count
baselines, parity tools and compose-scene guidance. PR #132 (`ac8456c`) subsequently
fixed ORM UV/transform handling; it did not change the scenes. Fresh fetch on this
hub confirms main and origin/main both point to `ac8456c`.

| Scene | Landed optimization and recorded evidence | Remaining delivery |
| --- | --- | --- |
| Farm | Hero merges inside anchors, cached shadows and stand-ins; shadow-tier fixture draws 8,161 to 3,025; 86/86 parity cases | Optimized Farm is already deployed from b1ac6ee |
| Golden Gate | Bridge merges, once-per-frame shadows, shadow/reflection stand-ins; fixture draws down 64–72%; recorded parity has known tower thin-line failures across several views/tiers (the original 488/489 tally was corrected) | Optimized source is landed; production still uses sealed g9 pending reseal |
| Foundry Floor | Shared planting material graph, multisample discard, 60-row count baseline and count gate; draws down 6.3–6.6%, pipeline totals 303–305 to 138–140; 160/160 parity cases | Optimized source is landed; production still uses sealed ff3-review2 pending reseal |

These figures are the cycle's recorded evidence, not new browser runs on this hub.
Foundry's fab and planting-off captures were byte-identical before/after: its
already-efficient interior was retained. No Foundry regression from #131 has been
established. This plan does not call for redoing the completed optimization pass.

The pass changed browser runtime code, **not asset GLBs, source assets, materials or
sealed pack files**. The general engine full optimizer (`e72b610`) was deliberately
excluded from #131 and is now implemented in the local candidate. Distinguish the
completed implementation from its remaining qualification:

- Golden Gate depth/reflection and Farm's economy trailer exemption are implemented.
  GG/FF static checks and Farm's direct/paired/count/pooling/collider checks are
  complete within their named build and baseline scopes.
- The engine optimizer and adopted test tooling pass their local gates. Bounded
  hitch traces have explicit dispositions below; they do not imply a newly caused
  scene regression or justify an unmeasured repair.
- Local Golden Gate/Foundry code5 delivery seals are prepared. Integrated controls,
  lifecycle and fresh accessibility gates pass within their exact-artifact scopes;
  quiet performance and owner/release review remain before any authorized publication.
  A verification checklist is not a list of newly discovered defects.

## Direction and boundaries

- Troy construction and refinement are deferred for direct discussion with Matt.
  The earlier sea/shore/plain/wall/city ideas and battle composition are brainstorming
  and reference material, not specifications, acceptance criteria or queued tasks.
  Completing this foundation does not authorize starting them.
- Keep the Troy pack, assets and scene off the public site. Existing local Troy
  revisions may remain fixed regression inputs; that does not authorize publishing,
  refining or constructing them.
- Review adopted changes adversarially against intended behavior and cycle decisions,
  not only aggregate test counts. Keep a bounded inventory of demonstrated issues,
  explicit failures/skips/unverified areas, risks and blockers; distinguish source
  defects from verifier mistakes and external owner/device/release decisions.
- Preserve standalone asset revisions, their sources, material pins and review history.
  Runtime merges, shadow proxies, collision setup, terrain and controllers belong to
  scenes. A runtime improvement does not automatically require rebaking an asset.
- Existing Farm, Golden Gate and Foundry are the proving environments. Each needs an
  exact accepted baseline and a candidate. Historical draw counts or unit tests alone
  do not establish current appearance, interaction, loading or performance.
- Review every upgrade family, but move versions in compatible groups with measured
  acceptance. A version being newer is not sufficient evidence to replace a working pin.

## Verified starting point

| Surface | State verified in this audit |
| --- | --- |
| Engine repository | main at ac8456c, identical to origin/main after fetch; no open PRs |
| Source release | 0.10.0, with later changes under Unreleased; npm publication remains a separate milestone |
| Raw optimization branch | draw-optimization at 4a1d238; scene work already squash-landed, engine commit e72b610 not integrated |
| Existing local changes | Scene pin-path portability fix and test, contributor/handoff updates; preserved, uncommitted |
| Core validation | 3,137 pass, 3 skip; functions 95.06%, lines 92.25%; toolchain, skills, typecheck and lint pass; render-service 78 pass |
| Scene validation | Toolchain, pins, typecheck, lint and portable tests pass; separate script tests 58 pass, 1 fixture skip |
| Runtime | All six dist source identities and bundle hashes match |
| Site validation | Frozen dependency install restored; 455 pass, 2 fixture skips; Astro checks 70 files with no diagnostics |
| Production website | Public build-info and authenticated Cloudflare deployment list agree: b1ac6ee, clean, packs enabled; deployment 33c716c7-16e5-46c6-93bf-f2260f0082be |
| Production scene inputs | Farm r36-local-review with source-built runtime; Golden Gate g9 and Foundry ff3-review2 with sealed runtimes |
| Cloudflare access | Wrangler 4.147.0 ran through an exact-version temporary npm invocation; existing OAuth accesses the kilnstudio Pages project and kiln-assets R2 bucket |

The production build predates ac8456c. Its artifact manifest counts 2,727 files,
excluding the two final receipts. No upload, deployment, DNS change or package
publication was performed in the starting audit. At that point GPU driver detection
succeeded, while engine GPU rendering and browser performance still needed fresh
qualification. Completed renderer checks and the remaining performance scope are
recorded in the current progress and integrated evidence sections.

## Core work

### E1 Preserve shared textures during ORM packing

Confirmed on current main: two materials sharing metallic-roughness but using different
occlusion maps both end up reading the last map. A base-color consumer of the same
image can also be changed. The UV/transform guard added in #132 does not isolate the
mutation in src/kit.ts.

Git history dates this shared-image mutation to 8 August (`022b30f`); it is not
a regression from the October scene pass or #132.

Write failing tests first for distinct occlusion maps, reversed material order,
already-packed occlusion and other-slot consumers. Copy per distinct packing
combination or report a deliberate skip. Preserve unaffected channels, alpha where
another consumer needs it, UVs, transforms and sampler behavior. Validate both
applyKitContract and serialized packKitGlb results. This is the first isolated fix.

### E2 Qualify and integrate the replacement full optimizer

Today's full mode can delete an unanimated named pivot without reducing draws. The
replacement has useful existing tests, but is not ready to land unchanged. Port only
the engine work; do not merge all raw branch commits. The ignored wiring patch no
longer applies cleanly after #132 and needs a reviewed port.

This is the separate GLB-export optimizer, not the scene-kit runtime merge that
already landed and was exercised in #131. The old flatten/join path dates to June
(`b459adc`). Conditions below qualify the unlanded replacement; they are not
failures introduced into the shipped scenes. Current Uint32 indices are valid;
D3 is an adopted output/size policy, not a repair for corrupt geometry.

Required conditions from the adversarial review, now supported by targeted probes:

1. D2 must measure additional baked bytes per actual saved draw. The scratch predicate
   undercounts a reproduced case. A conservative per-mesh cap is an alternative policy,
   not an equivalent implementation of the owner's 4 KB per saved draw decision.
2. Protect MSFT_lod referenced levels, including levels still attached to a scene, as
   boundaries. Current proposed code protects only the extension owner.
3. Return merge and rejection diagnostics through OptimizeSummary and render warnings.
4. Choose a deterministic, well-conditioned bake frame; do not blindly choose the
   first contributor. Test scale extremes, mirrored transforms, normals and tangents.
5. Implement and exercise D3's split at 65,534 vertices, including boundary cases and
   subsequent weld behavior; the scratch option is not currently wired.
6. Record the optimization pipeline version and define behavior for older full-mode
   rebuilds. A saved mode name alone cannot promise the old bytes after changing its meaning.

Also cover partial meshes, shared meshes across boundaries, UV/COLOR layouts,
texture transforms, quantized geometry, animation targets, transparent ordering,
determinism through the whole pipeline and failure behavior. Verify off, auto and
palette behavior remain stable unless a separately recorded fix intentionally changes it.

Caller inventory and contract are now settled in the local candidate. Main CLI/MCP
evaluation pins `off`; library calls and review derivatives retain documented mode
and environment behavior. The local Studio production services use off/palette;
its explicit full-mode quality fixture asserts semantic nodes/metadata, which are
protected boundaries. Composition wrappers are protected. The rigid-merge pass retains every node's
name, parent and transform, while an ordinary non-boundary mesh can become empty
or hold its group's merged geometry; consumers requiring geometry on each named
part use off/palette with `instance: 'off'`, because the separate GPU-instancing pass
can remove named instance nodes. No model-facing input knob was added. This is a planned
breaking full-mode contract, not an assertion that every named mesh retains geometry.

All 258 off/auto/palette comparisons across the 86 examples match the previous
`ac8456c` worker bytes under the same Bun/runtime dependencies. That isolates the
source-level optimizer change; it is not an old-versus-new dependency comparison.
The provisional Node-versus-Bun comparison differed in last-bit colour factors and
was replaced by the same-runtime comparison, not treated as an optimizer regression.
Receipt: `tmp/engine-claim-audit-20261002/off-mode-compat.json`.

Target the behavior-changing work at the planned 0.11 release with migration notes,
a Breaking changelog entry, one final runtime rebuild and fresh installed-package
qualification. A decision to ship E1 separately can keep its release scope small.

### E3 Useful outputs and authoring guidance

D23 is output-only: per-anchor draw information and qualified estimates, mirrored
tangent and coplanar-part observations, plus export/inspection summaries. Keep compact
render results and tool input schemas within their existing contracts. Estimates must
count eligible material/layout buckets and locked/split draws, state the passes covered,
and avoid claiming that material count alone equals draw count.

Apply demonstrated lessons to maintained authoring/QA skills, then qualify fresh setup
and managed upgrade without overwriting user customizations. Compose-scene guidance
already landed; its missing dogfood remains work. Run Agy/OpenCode live qualification
only as an explicitly authorized paid step with a concrete scope; historical approval
in a dated record is not a new run started by this plan.

Skill freshness checked 3 October: compose-scene was expanded on 1 October in
#125 and updated again on 2 October in #131 (three entrypoint lines and 87 lines
of runtime guidance). The composition API reference agrees with current exports
and defaults. At audit time, all three files in the published website skill archive
matched main, and the archive matched its discovery digest. The v0.10.0 tag predates
the #131 additions. A current package dry run includes all three maintained files.

This alignment pass clarifies prototype versus adopted results, renderer support
versus available host API, shadow observation, and custom-material transforms in
extra passes. Compose guidance now names the optional scene-kit reversed-depth
API, its default-off contract, effective unsupported-WebGL fallback and camera
flags for custom frustum tests. These edits are local and unpublished. The existing Troy workspace has only author/refine/QA installed;
compose-scene is optional, not a stale installed copy there. When scene authoring
resumes, qualify a workspace with that optional skill and the chosen harness.
Authoring/QA references now also describe the rigid-boundary contract and bounded
draw diagnostics. Compose guidance reflects movable morph-weight observation while
keeping shader/custom-attribute motion explicit. All three skill validators and
`check:skills` pass. Existing installed copies remain untouched. Fresh Codex and Claude workspaces now
pass byte-for-byte skill copying, current-state checks and managed upgrade; unrelated
files and local customizations survive, and an upstream/local conflict refuses
atomically. The receipt is `tmp/engine-claim-audit-20261002/workspace-independent-result.json`,
against final rebuilt runtime identity `58b1b178…`. Paid live dogfood remains separate.

## Existing asset alignment

Extend the existing manifests into a cross-consumer revision matrix; do not recreate
their inventories or rebake assets without cause. For each consumer record source/material revisions,
GLB hash, converter/profile, axes/units, pivots/clips, LODs, licenses, preview provenance,
scene release and site download pins. Identify missing original author sources separately
from the available sealed binaries; restoring a scene runtime must not require those sources.
For each final existing-scene delivery, reconcile its compiled runtime/producer identity,
`site/src/data/scene-packs.json`, the archive pins in `scene-inputs.json`, mirror/upload
manifests, applicable pack catalog references (including Foundry `scenePack`), and the
actual served hashes. Asset/model/data digests and accepted source/material revisions
must remain unchanged unless a separately justified revision is recorded. A new delivery
label or runtime chunk must not promote asset acceptance or imply a rebake. Recheck the
site catalog, route inventory and downloads exclude Troy in the final artifact.

The audit checked current tracked catalogs against mirror/upload manifests without
finding hash/size mismatches for Farm, bridge, vehicles or Foundry. All six shared
road-vehicle revisions and GLB hashes agree between Vehicles and Foundry. This is
record consistency, not a fresh binary, visual or public-download qualification.

The 3 October consolidated local matrix is now recorded in
`tmp/alignment-20261003/asset-revision-matrix.json`, with a compact companion summary.
It joins 292 revision/resource rows across Farm, bridge/terrain, Road Vehicles,
Foundry, Troy, gallery and material families. All 113 scene GLB consumer entries and
109 sealed auxiliary inputs are represented; 788 fresh local byte/hash checks and
94 catalog-to-manifest comparisons have zero mismatches. All six shared vehicle
revisions and delivered GLB hashes agree across Vehicles, Golden Gate and Foundry.
Fresh Foundry GLB headers show zero images in all 62 models and 43 models with LOD
links. These are byte and declaration checks, not a new appearance or motion review.

The matrix preserves provenance gaps: six shared Foundry road assets resolve to
verified vehicle editable archives, while the other 56 original authored sources
and export settings are not linked/restored by the selected models-only records.
This does not restrict access to the complete sealed binaries. Axes/units and
pivot/clip declarations retain their recorded scope; functional pivots, world scale
and animation timing have not been freshly measured. The bridge page explicitly
identifies its preview and reference images as full-tier views; web/far download
rows make no exact-image claim, so sharing that family poster is not an alignment
defect. Historical gallery pictures retain their separate provenance, material
dependency inventories do not prove visible bindings, and no owner acceptance is
promoted by the matrix. The 17 current Troy picks and eight older corpus revisions
remain separate; original terrain survey inputs have not been restored.

| Asset surface | Existing inventory and acceptance boundary |
| --- | --- |
| Farm | 23 assets, 10 material records and 30 maps. Exact current asset revisions are owner-accepted; historical whole-pack/performance/publication flags remain false and need reconciliation with dated release evidence, not automatic promotion |
| Golden Gate bridge/terrain | Three saved bridge tiers (full/web/far), editable/source/archive lineage and sealed terrain derivatives. Standalone bridge acceptance is separate from scene and terrain/performance acceptance |
| Road Vehicles | Six r4 child revisions, currently 0/6 owner-accepted in the catalog. Earlier accepted r2 parents do not transfer acceptance to lamp/LOD child revisions |
| Foundry Floor | 62 models: 31 interior, 12 campus, six shared road vehicles, eight plants and five freight. Catalog records 43 LOD models, 55 review candidates and seven accepted assets; models-only download, no textures |
| Historical gallery | 86 source examples / 80 public archive assets; unvetted historical showcases, not golden outputs. Normal bun run assets rebuilt the current 80 canonical/runtime pairs and recorded their identities; historical images retain separate provenance |
| Maintained materials | 48 production maps across 16 families, five teaching texture resources and five procedural presets; distinguish these shipped resources from immutable workspace material records |
| Troy | 16 standalone candidates plus one reference composition and seven material pins; owner-unreviewed, off the public site and deferred for direct Matt discussion. Exact revisions are local regression inputs only |

Use current catalog acceptance rather than a broad statement that every pack is
approved. A pending owner appearance review is also not proof of an asset defect.
Preserve historical editable-archive engine pins where deliberate. Foundry has no
texture consumers in its current catalog, so E1 does not establish any need to rebake it.
The sealed inputs have now been restored and verified. The local full-optimizer
corpus checks 224 inputs: all 86 examples, 113 released scene GLBs and 25 pinned Troy
revisions. All pass world-geometry aggregate, hierarchy/animation/LOD, material-binding,
deterministic-byte and Khronos-error checks with a stable runtime source/dependency
identity. Twenty meshopt-compressed Golden Gate terrain files use recorded decoded
in-memory derivatives, because core IO has no injected decoder; this does not claim
direct compressed-input optimization support. Original files remain untouched.
See `scripts/qualify-full-optimizer.mjs` and the local receipt
`tmp/full-optimizer-corpus/qualified.json`. This gate does not establish appearance.

The site's normal asset build deletes/rebuilds generated gallery output from current
sources and guards engine identity; its old ignored local cache is not an identified
production defect. Follow that existing build contract for the next release.

Exercise representative assets from every family through E1/E2. Reuse the 86-example
corpus and pack fixtures, but do not mistake the existing integration-corpus script for
full-mode coverage: it renders off and its generic NodeIO does not register Kiln's LOD
extension. Use the engine's IO and world-space geometry/semantic-boundary assertions,
not node-for-node equality where a merge intentionally changes topology.

Keep accepted originals immutable. Only demonstrated asset defects produce new asset
revisions; refresh preview, inventory, archive and site pins together when that happens.
Recheck material pixels, named interactions, intermediate poses and destination behavior.
Blender/Unity support stays limited to the tested importer profiles; the extension
compatibility table is not proof that every consumer implements a feature.

Foundry's pre-existing S3 cross-pass and seam/roof appearance questions need an explicit
asset/design disposition, then collision/drive verification if changed. D-75 retained
the campus structures during the optimization cycle; those questions do not authorize
redesign or block delivery of the already-qualified optimization by themselves.
They are not engine defects or regressions introduced by #131.
Troy's existing off-mode revisions are a useful pinned-material regression set, but the
full-mode replacement alone does not justify migrating them.

### Foundry release scope

Keep the existing interior optimization and the landed campus planting work. All
62 source/catalog revision and available hash pins agree, including the 24 interior
LOD replacements. Reuse the existing loading, transport, rig, freight-coupling,
clearance and LOD tests. Correct the integration test's historical staged/ff2 path
so restored exact released inputs exercise it rather than produce a fixture skip.

For the new runtime seal, verify the changed paths on both backends while preserving
simulation inputs, AMR/arm lot ownership, humanoid maintenance visits, deferred
interior entry/exit, cutaway, walking/driving and articulated freight. These features
already exist. Old reports about eager interior startup, static transport, missing
visits or old vehicle lamps are superseded by later implementation and intake.

The S3 through-road remains a separate design choice: the current scene deliberately
uses driveable stubs and non-driven outer legs. D13 retained the structures. Portal
versus raised link requires a design decision; roof/link/seam observations do not
mandate repair. No new Foundry optimization project is justified by this audit.

## Shared scene tooling and correctness

| Work | Completion evidence |
| --- | --- |
| Exact inputs on a clean hub | Restore hash-pinned public scene archives using site/scripts/scene-inputs.mjs; rebuild runtimes through scenes/scripts/build-scene.ts without old Windows author paths |
| Portable browser launch | Shared executable discovery/configuration for Linux and Windows; preserve owned-port behavior; clean temporary profiles on close and launch failure |
| D19 test coverage | scripts/tests participates in normal scene tests; correct Foundry budget fixture selection; separate exact-input integration gate ensures fixture skips cannot count as qualification; commit Golden Gate count baseline |
| GG-004 WebP serving | GET, HEAD and range responses use image/webp; existing server access/path checks remain intact |
| GG-007 shared help/credits | Correct panel sizing, scrolling, stacking, keyboard/focus behavior and narrow/short HUD layouts; retire scene workarounds only after parity |
| FF-002 nested touch controls | Nested joystick/buttons receive touches without click-through beneath panels; verify all three scene HUDs |
| D26 shadow motion | Settle automatic detection versus explicit live-caster contract; cover morphs, shader-position motion and custom instance attributes without matrix changes |
| D26 collision and naming | Assert that optimization preserves collision/interaction results and excludes proxies/hidden duplicates; preserve collision-before-optimization ordering where required |
| D18 parity | Shared comparer enforces the adopted thin-line budget with repeat-capture noise; individual tools already have a budget and should consume one implementation |
| D16 timing | Report GPU clock and busy times clock with units, provenance and paired decisions; do not infer equal GPU work from equal frame rate |

The specific GateLeaf versus /leaf/i collider allegation is not reproduced by current
source: Farm restricts that regex to faceted-tree and selects doors separately. Keep
the general regression obligation without labeling the current gate broken. The shadow
cache now observes morph weights and tests the explicit live/invalidation contract
for motion it cannot observe; it does not promise automatic shader inspection.

GG-007 and FF-002 had scene-local workarounds. Shared bounds/scroll/stacking and
nested-touch changes pass 72 DOM contracts and all six final public scene/backend
control scenarios. Integration reproduced and fixed the narrower Foundry campus
More/Controls overlap; live panel stacking, touch, scrolling and visible focus now
pass on both backends. The CSS-only repair is separate from geometry optimization.
FF-003's exact callback-cancellation
identity handling is already implemented and must not be listed as a new repair.

## Scene changes and performance

| Scene | Work before its next qualified release |
| --- | --- |
| Farm | D8 exemption and D20 tooling are implemented; 160 direct, 32 paired, 32 settled-count and pooling/collider checks pass within explicit baseline scope. Four absolute pilot-image failures are shared. Four allocation observations are complete: neither current observation has a natural interval above 40 ms in those two observations, but about 36 ms late GC and unresolved allocation/retainer ownership remain. Balanced walk/tractor and the minimal hero-view pair are collected with raw D41 passes, but both blocks fail strict post-run quiet qualification. No speculative repair or hitch-fixed claim. |
| Golden Gate | D15 opt-in depth and sky/reflection/bias adaptations, plus D5/D6 exclusions and persistent fog-bank hiding, are implemented and checked on both NVIDIA backends. Reconstructed depth-reference matrices pass 78/78 each; authentic original→final strict flags remain recorded. Missing-clip fallback, final public startup and both-backend controls pass; local `g9-code5` delivery is qualified within the site continuity scope. Owner review follows development goals; publication remains separate. |
| Golden Gate delivery | D27 verified layout and bounded bootstrap are implemented. Code5 public code is 1,708,928 raw / 512,680 gzip bytes, within unchanged ceilings. First-use native evidence proves contact pipeline variants prepared before ready and reused at the 580 m jump. The focused pairs and unchanged flyover repeat are collected. The repeat passes, but the original candidate flyover D41 miss and block quiet failure remain; preserve the separate historical drive event and defer the larger campaign. Tablet stays minimal. |
| Foundry Floor | The recorded default matrix passes 120 image comparisons and 56 static X-02 checks; four actual NVIDIA startup probes pass. Local `ff3-review2-code5` retains unchanged model/data hashes and acceptance states. Both-backend controls/lifecycle and first-key ownership checks pass. Focused balanced campus/fab landing/drive runs have raw D41 passes, but strict block quiet qualification fails; owner/release acceptance remains separate. |
| Farm owner observations | Empty-hand correction, arm borrowing/blending and warming are implemented and have bounded compiled/public evidence. Owner farmer appearance review follows the development goals; sampled checks do not establish every clipping or seated pose. |
| Golden Gate owner observations | Targeted phase/foam continuity and shorter, softer wakes are implemented with frozen comparisons and public integration checks. Owner water appearance review follows the development goals; physical-device acceptance remains separate. |
| Shared performance | All 18 intended focused runs are validly collected, raw 17 D41 pass / one fail, with two failed post-run quiet gates. A separate unchanged flyover repeat passes D41/quiet/cleanup but does not erase failures. Overall audit remains FAIL; no further benchmark expansion is justified. Motion3's 108-run preparation is preserved, deferred and unrun. Prior UI3 balanced evidence retains 37 D41 pass/five fail; busy×clock remains a proxy, not code causality or desktop acceptance. |

The tablet remains minimal. Retain Farm variant A and trailer/farmer joint boundaries,
the live shadow-map sizes already selected, existing tractor kinematics, and the decision
against hero instancing across placements. The watermill stall came from a rejected
packed-woodland variant; it is not a demonstrated production defect.

Farm preparation on 3 October preserves the original `draw-after` binary through
`scenes/packages/farm/dist/original-draw-after/test`: all 42 Farm files / 8,824,115
bytes match the preserved timing-kit manifest. Its `index-oAhThwe1.js` and the
candidate use the same r36 asset-pack hash. D-64/D-68 establishes this historical
comparison baseline; no hash-bound latest scene-runtime acceptance receipt has
been established. The maintained paired runner can still compare all 32 named/play
cases against r34, reporting `releaseQualified: false` without that receipt. This
boundary concerns scene-runtime acceptance, not individual asset-owner review.
The separate #131 source reconstruction uses current dependencies and is labeled
diagnostic; it does not replace the preserved binary.

The Farm's direct parity tool now returns a failure status for failed, errored,
missing or duplicate requested cells, and X-02 records its resolved headed/headless
launch mode. The focused 32-test tool slice and scene lint pass; no threshold or
committed count baseline was changed. Final direct images now pass all 160 cases
(20 views × four tiers × two backends), with 144/144 luminance tiles passing per
case and at most 18 pixels above the >32-channel repeat-adjusted threshold against
the unchanged 100-pixel budget. Draws, triangles and pipelines match exactly. This
does not mean identical images: 60 cases contain nonzero after differences, 48 have
repeat noise, and 37 trigger the retained-difference heuristic; all satisfy the
existing gate. Settled X-02 passes all 32 cases and exactly matches all six baseline
fields: draws, triangles, pipelines, programs, geometries and textures. All report
41 textures with cached shadows and three agreeing count samples; 39 textures names
the historical prewarm condition, which this run did not measure.

The source-hashed local receipts and full scope are preserved in
`scenes/.tmp/alignment-farm/final-counts-and-images-summary.json` and its Markdown
companion. These direct/X-02 results do not establish B-07 texture pooling,
optimization or collider equality on their own. Same-phase paired run 02 has now
completed all 32 cases with no introduced pilot-image failure and clean shutdown.
Both builds pass absolute pilot parity in 28 cases; `play-house` and
`play-house-door` fail on both backends in both builds. Those four shared failures
remain explicit. Run 01 aborted before capture and provides no qualification.

Independent retained-statistics auditing passes the existing r34 B-07 checks in
all 32 cases for both builds: textures pool from 98 to 29 with 92 shared assignments,
cached-shadow renderer textures are 41, and ordered collider counts/shapes match
the frozen r34 fixture (13 colliders, 95,382 static and 14,468 dynamic triangles,
nine doors, ten door pivots). All six X-02 fields also match exactly in the paired
captures. Pilot renderer textures vary by view: 39 in 22 cases, 35 in four and 29
in six, identical across first/repeat samples. Those are observations, not an
equality requirement against cached-shadow textures. The audit first selected the
older r33 collider fixture in error; that rejected output is retained, and selecting
the existing r34 fixture by declared release resolves the mismatch without changing
any baseline. The historical r34 script already records the farmhouse-only +264
static triangles.

See `scenes/.tmp/alignment-farm/final-qualification-summary.json` and its Markdown
companion for the completed, hash-bound rollup. B-07 retains its r34 visible-source
provenance note: the current rule records 2,195 meshes without requiring equality
to r33's 2,194. This postprocessing does not re-derive that source delta or compare
collision soup bytes, and does not replace functional collision/motion tests. The
missing hash-bound latest scene-runtime owner acceptance receipt keeps
`releaseQualified: false`; public site interactions and performance are separate
evidence.

The four historical hero hitches were confirmed at approximately 96.0–97.7 seconds
into sampling, after a five-second warmup, lasting 66.5–99.6 ms. Fresh serialized
original/candidate traces on actual NVIDIA WebGPU now reproduce a late 41.7/50.0 ms
frame at about 106 seconds. Both overlap V8 memory-reducer major GC: 41.739/44.791 ms
wall time and 35.349/38.918 ms renderer-main-thread CPU. The larger 242/267 ms frames
occur during trace startup and are instrumentation artifacts. All 58 sampled joint
transforms, sim state, draws, pipelines and programs remain constant at minimal.
Both heaps show startup garbage and allocation/collection cycles, then shrink from
about 275 MB capacity to about 85 MB; post-collection used heap stays in a similar
65–73 MB range. No obvious new retention path was found in the relevant source diff.

FARM-3's captured desktop mechanism is therefore identified; the allocation/retainer
cause and any worthwhile narrow repair are not yet measured. Defer that repair
until they are, preserving GC, scene features, tractor behavior and hitch limits.
These instrumented values are smaller than the historical tablet spikes but do not
prove improvement, the same tablet cause or performance acceptance. Local hashed
receipts and the analysis are under `scenes/.tmp/alignment-farm/`, summarized in
`trace-findings.md`. Source-built Farm runtime changes require a fresh site build
and integrated checks, while the unchanged r36 input archive/catalog hashes stay
pinned.

R8 shadow color targets, reflection cadence changes, output-pass depth removal and
additional merge layouts are optional follow-ups, not automatic prerequisites. Xclipse
classification needs actual device strings/performance before promotion. Shared meshopt
loading is a possible consolidation of Golden Gate's working local loader; static scene
export is a new contract, and terrain derivative regeneration is distinct from verifying
the existing delivered tiles. Give these explicit dispositions rather than silently
turning every historical suggestion into a mandatory rewrite.

The next vegetation cycle (D33) is later exploration, separate from releasing the
completed pass: per-tree culled woodland packing before LOD, subject to the adopted
smoothness/GPU-work criteria and visual acceptance. Foundry already has per-tree
frustum culling and three vegetation LOD levels; D33 does not call for building
those again. Its older eager-interior-load defect is
fixed; the next release checks that the existing deferred-loading behavior remains
intact rather than reopening the original implementation.

## Upgrade policy

Audit direct and optional dependencies, resolved lockfiles and maintainer tooling together.
Three.js, its types, scene dependencies and renderer build identities must move together;
renderer changes require GPU smoke and both-backend scene parity before adoption.
Do not blindly unify the site's TypeScript 6 compiler API consumers with the root/scenes
TypeScript 7 CLI toolchain. Restore installations with frozen locks before diagnosing
version incompatibilities; the audit's initial site failures disappeared after doing so.

The AI SDK/provider/OpenRouter/Strands group is one peer-compatibility decision. Inspect
current upstream constraints before advancing a major; preserve provider prompt-cache
and usage fields through the existing adapter tests. Node/Bun/npm maintainer pins remain
separate from consumer engine requirements. Candidate versions and their gate outcomes
must be recorded before the upgrade commit, not left as unversioned latest commands.

Registry audit on 2 October identified the following candidates. These are proposals,
not installed upgrades or qualification results; recheck metadata when executing.

Execution update, 3 October: compatible non-renderer candidates below are now
installed locally with synchronized locks. Registry/peer and lock-diff receipts are
under `tmp/upgrade1-audit-20261003/`; focused geometry/image (138), provider/MCP (79)
and site (503, plus two fixture skips) tests pass. Node 22.23.3/npm 12.2.0 are installed
in an isolated hub prefix, with the old prefix retained; Bun remains 1.4.2. Active
metadata/workflows/guidance agree. UPGRADE-2 is installed too: Three.js 0.186.1,
types 0.186.0 and WebGPU 0.6.2 across engine, site, scenes and render service. The
renderer identity includes the new exact pins; immutable old asset packs retain
their original producer versions. All six Node bundles are rebuilt. Render-service
78 tests, real NVIDIA Dawn/Vulkan smoke, display and material conformance pass.
The integrated core coverage and installed-package gates pass. Both-backend scene
and final site browser gates also pass within the explicitly recorded binary and
continuity scopes. Quiet timing and owner/release acceptance remain separate;
these receipts do not qualify a production deployment.

| Family | Current to candidate | Qualification |
| --- | --- | --- |
| glTF Transform packages / manifold | 4.5.0 to 4.5.1 / 3.5.3 to 3.5.4 | Core geometry, IO, kit and regression corpus |
| MCP client/server | 2.2.0 to 2.3.0 | Protocol handshakes, lazy loading, registry/manifest and installed MCP; ext-apps 2.0.3 remains current |
| Strands / AI SDK / provider | 1.18.0 to 1.19.0 / 6.0.282 to 6.0.300 / 3.0.16 to 3.0.18 | Compatible peer group, adapter/cache/usage tests; retain existing major families |
| Bedrock SDK / Google GenAI | 3.1131.0 to 3.1146.0 / 2.22.0 to 2.27.0 | Offline provider adapter contracts |
| Three.js / native webgpu runtime | 0.186.0 to 0.186.1 / 0.6.1 to 0.6.2 | Coordinate renderer consumers and identities; Three.js types remain 0.186.0 unless a compatible update is published |
| Canvas / root sharp | 1.0.9 to 1.0.10 / 0.35.4 to 0.35.5 | CPU raster/PNG/cache checks; site already uses sharp 0.35.5 |
| Biome / Vite / Zod / site parse5 | 2.5.13 to 2.5.15 / 8.3.0 to 8.3.2 / 4.6.4 to 4.6.5 / 8.0.0 to 8.0.1 | Applicable lint/build/schema/HTML checks and scene/site bundle budgets |
| Maintainer Node / npm / Bun | 22.23.2 to 22.23.3 / 12.0.2 to 12.2.0 / retain 1.4.2 | Pin files, CI, isolated hub runtime and workspace launchers; keep consumer engines separate |

[Strands 1.19.0 metadata](https://registry.npmjs.org/@strands-agents%2fsdk/1.19.0)
still requires provider 3, OpenAI 6 and the older Anthropic peer family. AI SDK 7,
provider 4, OpenRouter 3, OpenAI 7 and the newest Anthropic family cannot be assumed
compatible. OpenRouter 2.10 and OpenAI 6.49 are compatible-family candidates to assess
with their exact patch releases. [Astro checker 0.9.10 metadata](https://registry.npmjs.org/@astrojs%2fcheck/0.9.10)
supports TypeScript 5/6, so the site's 6.0.3 pin is intentional. Inspect actual bundle
graphs before overriding older transitive Three.js copies; a lockfile entry alone
does not prove duplicated shipped code.

## Cloudflare delivery

Keep the existing hosting architecture: Cloudflare Pages direct upload to project
kilnstudio, production branch production, domain kilnstudio.tools; public versioned
assets on kiln-assets through assets.kilnstudio.tools. GitHub main is the source branch;
the Website workflow validates and deploys nothing. No hosting-provider migration is needed.

The hub already has valid OAuth and Pages write scope; project and R2 bucket reads succeed.
Initial OAuth verification used Wrangler 4.147.0 under Node 22.23.2 through an
exact-version npm invocation; current maintainer pins are Node 22.23.3/npm 12.2.0. Do not
refresh unrelated OAuth scopes just to satisfy a warning when required operations work.
If required access expires, use browser OAuth; never copy token contents into docs or logs.

The deployment work now has these local results and remaining boundaries:

1. The portable Node entrypoint and PowerShell compatibility wrapper retain clean-tree,
   exact-commit, packs-enabled and file-limit checks with an exact Wrangler pin.
   Refusal tests pass; the real dry run correctly refuses the dirty candidate checkout.
2. The preflight verifies the artifact manifest and every file immediately before
   upload. The read-only upload summary now validates all three manifests, including
   scene archives: 484 files, zero problems. No upload has run.
3. The prior code3 launch artifact passes site, static, asset, HTTP, all six hardware
   control scenarios, all nine lifecycle/viewer/failure areas and fresh accessibility.
   New changed scene runtimes require affected-surface requalification on their exact
   final artifact; prior results carry forward only with explicit dependency identity. Default
   Website CI uses packs=0 and has no browser acceptance; it is not the full deployment gate.
4. Local Golden Gate `g9-code3` and Foundry `ff3-review2-code3` archive/runtime pins are
   restored and staged through the normal build path, with the Foundry gallery's pack
   reference aligned. New delivery metadata and dependency notices preserve all model/data
   bytes, SHA256SUMS and saved source revisions. Old public objects remain unchanged.
5. Integrated viewer/scene controls, touch, failure/retry, entry/exit/teardown and
   loading checks pass and are bound to the final artifact by exact product-byte
   continuity. Preserve those receipts and requalify affected flows if product bytes
   change; static accessibility and hashes alone do not replace interaction or timing evidence.
6. After the reviewed release is authorized for production, upload required new R2
   objects and verify public hashes, deploy those exact Pages bytes, then check public
   build-info, artifact/scene hashes, asset downloads and real scene flows. Record the
   deployment ID and rollback target. Authentication alone is not a deployment.

Current latest production is b1ac6ee and must not be relabeled as current source ac8456c.
The former PowerShell-only operational gap on Linux is closed by the tested Node
wrapper. Local seals and technical checks do not claim a clean production artifact,
owner acceptance or deployment; no upload or commit has occurred.

## Implementation sequence and exit

1. Reconcile current docs and request ledgers; establish exact baselines, portable tools,
   source/material/asset lineage and Cloudflare preflight. Preserve the existing local changes.
2. Land E1, then compatible dependency updates in small tested groups. Re-establish
   renderer and bundle baselines after upgrades that change them.
3. Resolve E2 policy questions and complete the optimizer, rebuild compatibility,
   output/skill work and installed-package qualification. Run core regression assets here.
4. Complete shared correctness and adopted scene follow-ups; diagnose measured stalls.
   Keep the next vegetation experiment separate from shipping the completed pass;
   qualify it using the agreed look/performance gates if pursued in this cycle.
5. Rebaseline only accepted changes, prepare immutable local delivery candidates and
   validate the exact final site with aligned scene, asset, archive and download pins.
   Retain the reviewed Cloudflare preflight/rollback procedure; perform no release action.
6. Report stabilization readiness and the remaining explicit boundaries to Matt. Any
   Troy discussion is a later direct conversation, not an automatic next implementation
   phase, asset task or publication step.

Readiness requires evidence per changed surface and a bounded final review:

- Review behavior, implementation and cycle intent adversarially; close adopted local
  requirements with reproducible commands, exact source/build/dependency/input hashes
  and applicable focused, full offline, installed-package/workspace and browser gates.
  Treat aggregate counts as summaries, not proof of unexercised behavior.
- Qualify the exact final scene/site artifacts, changed controls/lifecycle paths and
  required quiet-host comparisons. Preserve baseline failures and prove any reuse by
  byte/dependency identity; do not turn missing or skipped evidence into a pass.
- Reconcile existing scene/asset/source/material/acceptance/download records across
  catalogs, sealed packs, archives, mirrors and served bytes. Preserve old immutable
  objects and keep Troy absent from public routes, assets and downloads.
- Deliver a known-issue inventory with reproduction/evidence, affected builds, impact,
  confidence and disposition, including explicit failures, skips, unverified areas,
  risks and blockers. Missing physical-device, owner visual, importer or paid-dogfood
  evidence stays separate from local implementation and qualification requirements.
- State the release boundary: no commit, push, upload, deployment or publication is
  authorized. Optional ideas need a decision; Troy brainstorming supplies no tasks.
  These reports establish local readiness, not owner acceptance or release approval.

## Evidence and records

- [Cycle close and adversarial conditions](2026-10-02-cycle-close.md)
- [Engine handoff](../reviews/2026-10-02-draw-optimization-engine-handoff.md)
- [Draw optimization review](../reviews/2026-10-02-draw-optimization.md)
- [Scene decisions](../../scenes/DECISIONS.md) and [kit requests](../../scenes/KIT-REQUESTS.md)
- [Cloudflare deployment contract](../../site/DEPLOYMENT.md)
- [Importer qualification limits](../engine-handoff.md)
- [Troy handoff](../../packs/troy/HANDOFF.md)

The local hub index is ~/X/START-HERE.md. Preserved raw evidence is in the separate
kiln-draw-optimization worktree's ignored tmp/drawcalls and scenes/evidence folders;
reproduction scripts from this audit are under this checkout's ignored
tmp/engine-claim-audit-20261002. Historical records retain their dates and acceptance limits.

## Integrated candidate validation, 3 October

The original timing kit was subsequently found outside `X`, at
`~/kiln-hub/draw-base-vs-draw-after/`. All **505 files / 74,132,012 bytes** match
its manifest (SHA-256 `ecd9a3cce2001b9ae6e08375e7384eec4e751b0c363198220281baa83696ab5d`).
Its original optimized Farm, Golden Gate and Foundry pack hashes match the current
candidate. The manifest names source commit `75751ec` and the build records say
working tree; these are preserved original binaries, not a claim of a clean #131
build. They allow actual old-binary comparisons, while reconstructed #131 builds
using current dependencies isolate source changes. Neither provenance alone
confers owner appearance acceptance.

The final root coverage run passes **3,187 tests / 3 platform skips / 0 failures**.
The maintained gate reports **95.11% functions / 92.32% lines**, above the unchanged
94.00% / 92.10% thresholds. Typecheck and lint pass. The first full run found the
architecture conformance fixture hash still pinned to its old full-to-palette
assertion. The title/mode expectation now reflects rigid full mode; all architecture
QA assertions remain. Its conformance receipt was refreshed with the actual CPU
renderer identity and date, then the 70 focused checks and full coverage passed.
No acceptance threshold or rule behavior was weakened.

The final scope review removed the unused importer-profile experiment and its
12 tests from the candidate; neither the rigid optimizer nor D23 calls it.
Its source remains in the raw worktree and local audit evidence. Importer profiles
were not an adopted integration requirement and are not newly qualified here.
The final coverage run above followed that removal; earlier 3,199-pass logs
describe the larger provisional scope.

All six Node bundles carry `sha256:58b1b1784701b3b04bac6e7a429ea5dd9d1aeac646e5189bbb21f251e9f1a295`.
The final local package smoke passes installation without development dependencies,
Node CLI/MCP, CSG/UV WASM, CPU PNG, source-store persistence, capture reuse and
textured subprocess export. Fresh Codex/Claude workspace copying and managed
upgrade/conflict preservation also pass against this identity. These are local
checks of an unreleased candidate; package publication remains deferred.

The upgraded-dependency corpus passes **199 example/released-asset inputs plus 25
Troy revisions**, with deterministic bytes and preserved structure. Its two receipts
are `tmp/full-optimizer-corpus/renderer-upgrade-qualified.json` and
`renderer-upgrade-troy-qualified.json`. They record identity `dd25c75c…`, before the
architecture receipt-only refresh above; optimizer and geometry code are unchanged.
The subsequent unused-profile removal also changes the source identity without
changing the optimizer, geometry code or any reachable runtime behavior.
Twenty compressed terrain inputs remain explicitly decoded in-memory derivatives,
not a claim of native compressed-input support.

Renderer checks pass: 78 offline tests, real NVIDIA Dawn/Vulkan smoke, calibrated
display output and material-channel conformance. The separate headed browser probe
confirms NVIDIA WebGPU and WebGL2, with owned profile removal; headless Chrome 150
uses SwiftShader here. No performance comparison or scene pixel acceptance is
inferred from that capability probe. The exact released-input gate passes 22 tests
with zero skips. The normal site gallery pipeline rebuilt 80 historical assets
(1,472,955 triangles, 34.8 MB GLB) without changing accepted Commons revisions.

Foundry Floor's authentic preserved optimized binary→`alignment-final` comparison
passes **120/120 default cases**: 80 WebGPU views across all four tiers and 40
WebGL2 views at minimal/high, each at 1280×720 with the unchanged 100-pixel
thin-line budget. All 80 WebGPU captures are pixel-identical. WebGL2 has 36 exact
matches; the other four fab views differ in only one to seven pixels by one
channel level. Every recorded before/after backend matches, with no browser
messages. This fresh default regression matrix is distinct from the earlier
**160-case optimization qualification**: it does not repeat the 40
`plantingShared=false` isolation cases or relabel their historical evidence.

Foundry X-02 passes all **56 judged static rows**, exactly matching the committed
optimized reference in draws, triangles, bound pipelines, pipeline cache,
programs, geometries and textures. All 60 fixtures are present and stable, GPU
encoder and JS draw counts agree, and raw records identify the final chunks with
unmixed 1920×1080/shared-page WebGPU conditions. Four drive rows remain
informational under the existing rule; minimal drive differs by 136 fewer
triangles. There are no errors or messages. A separate four-start probe confirms
actual NVIDIA WebGPU Turing and WebGL2 ANGLE GTX 1660 Ti for both exact builds,
their expected entry chunks, one ready event each, no fallback and owned-profile
cleanup. The parity runner did not retain repeat-backend or per-row adapter
identity; this bounded startup evidence does not invent those missing fields.
Receipts are summarized in `scenes/.tmp/alignment-ff/evidence-summary.md`.

The local Foundry delivery pin is now `ff3-review2-code1`. Changes to its asset
archive are limited to delivery metadata: `assets/SHA256SUMS` and all model/data
hashes remain unchanged, as do the source catalog's 55 review-candidate and seven
accepted asset states. The local launch candidate containing this pin passes
517 site tests with two historical skips, plus initial dependency-closure/bundle
budget and served runtime/asset-hash checks. The integrated FF3 site interaction
flow remains pending. These local checks do not publish the delivery or confer
owner appearance acceptance.

Golden Gate's static comparisons now cover both NVIDIA backends at 1280×720:
78 views per matrix across two tiers, three presets and thirteen cameras. The
same-dependency #131 source control retains 17 strict WebGPU flags and 11 WebGL2
flags; all 78 luminance checks pass on each backend. Rebuilding the preserved D15
prototype source under current dependencies gives **78/78 strict passes on each
backend**, with no pixels over the 32-channel threshold. This is a reconstructed
reference, not a relabeled historical executable or owner appearance acceptance.

Direct comparisons of the authentic preserved optimized binary to the final
`alignment-final` build cover the Three 0.186.0→0.186.1 and final KIT-2 CSS changes.
They retain exactly the same 17 WebGPU and 11 WebGL2 strict flags as the source
controls, with no additional flagged cases and all luminance gates passing.
The WebGPU list matches the 17 historical D15 cases. Two WebGL2 flags,
High/Day `drive-nb-0` and `far-low`, are outside that historical WebGPU list;
they pass against the reconstructed depth reference and remain separately named.
All gates keep the default 100-pixel budget beyond repeat noise; flags are not
converted to passes. Camera and bridge draw/proxy states agree in all matrices.
GG-2 combines this visual/content evidence with regression-tested dynamic-layer
exclusion and persistent fog hiding; these matrices do not measure a new per-pass
reflection draw saving. Evidence is in `scenes/.tmp/alignment-gg/parity-{webgpu,webgl2}/`,
`parity-d15-{webgpu,webgl2}/` and `parity-original-{webgpu,webgl2}/`.

The final Golden Gate public build is **1,706,652 raw / 511,859 gzip bytes**, below
the fixed 1,796,415 / 530,691 ceilings. Its producer receipts verify chunk hashes
and actual current dependencies; the immutable g9 asset pack remains unchanged.
Final startup probes confirm verified layout loading, one ready event, the public
surface without test hooks, and supported reversed depth on NVIDIA WebGPU/WebGL2.
An injected missing `EXT_clip_control` yields the expected warning, standard depth
and standard offset signs; two fallback views pass against the #131 standard-depth
control. Six supplemental final-build views also pass. Receipts and their bounded
scope are recorded in `scenes/.tmp/alignment-gg/evidence-summary.md`. Flyover traces
and quiet-host performance remain separate from these static checks.

A serialized diagnostic flight trace on each Golden Gate build observed the
natural postcard-to-tower transition at 17.2 ms in the original and 15.3 ms in the
final build. The historical large transition hitch did not reproduce in this
bounded run. Both builds show slower cold postcard starts and new pipelines;
repeated starts peak at 12.5 / 11.5 ms. Separate final-build mid-path pauses are
predominantly off-CPU: representative render callbacks take 95.22 / 6.06 ms and
110.39 / 9.30 ms of wall / thread CPU time. This does not attribute the remaining
wall time to a scene algorithm, GC or a specific external cause. CPU profiling
and per-frame observation make these diagnostic receipts, not quiet performance
acceptance. No speculative precompile or transition repair was added. The receipt
is `scenes/.tmp/alignment-gg/flight-diagnostic-comparison.json`; remaining workload
measurements and tablet-tier decisions stay separate.

The preserved intermediate launch-mode site build passed 513 site tests (two historical
fixture skips), checks 70 Astro files without diagnostics and emits 198 pages.
All 458 public mirror pins verify. Its local HTTP review passes 116 mapped
downloads, 520 linked site files, 89 mapped pages, three checksum endpoints and
all three scenes' served runtime/pack hashes. Artifact inventory SHA-256 is
`836c4a5c030a16bf3cbedd5f593f57f7ade3dc11d082c3e020ad35ed6a88ae32`.
That build retained the existing Golden Gate g9 and Foundry ff3-review2 seals;
its receipts remain bound to that earlier artifact in
`site/.cache/alignment-preliminary/`.

The final local launch artifact is
`f0e49fbc557acaecef1eff8044459f4b4bc57996d4e2b1f88f88bb00783fb60a`:
**2,728 inventoried files / 199,968,715 bytes**, with 198 Astro pages and 200 static
HTML documents. It carries local `g9-code1` and `ff3-review2-code1` delivery pins;
the original asset/source revisions, model/data bytes and SHA256SUMS remain unchanged.
All **517 site tests pass / two historical skips**, all 70 Astro files check clean,
and static, asset and local HTTP verification pass: 116 mapped downloads, 520 linked
files, 89 mapped pages and three checksum endpoints. All three served scene hashes
and copy/fallback checks pass. Final migration/runtime wording and the three updated
skill references are included; fresh-workspace and skill-package checks pass. The
final private-data scan has zero findings. The all-manifest upload summary contains
484 files and zero problems.

Final static accessibility covers **396 route/width checks / 44 keyboard tours /
zero problems**. The final build freshly checks four widths on `/docs/migration/`
and `/docs/runtime/`; 196 unchanged routes reuse 392 widths and all 44 tours from
artifact `42a41439670a415fa2f3cd204fbd4af61f5ca68576e5369b5431f9d15f739b6e`.
Every final artifact was rehashed, and reused HTML, shared JS/CSS/fonts and loaded
display resources are byte-identical, with unchanged browser, axe and verifier.
The final receipt is `site/.cache/alignment-release-docs/accessibility/combined.json`;
its proof is `proof/a11y-reuse-proposal.json` under the same directory. The preserved
prior receipt under `site/.cache/alignment-before-migration/` retains its own proof:
60 routes freshly ran 120 widths and eight tours, while 138 routes reused 276 widths
and 36 tours from the preliminary artifact. This chain is static load/axe/overflow/Tab
evidence; integrated scene/viewer controls, touch and failure flows remain pending, as does
quiet performance qualification. The deployment dry run correctly refuses the dirty
tree. No upload or commit has occurred, and production retains its old delivery IDs.

Logs remain local under `/tmp/kiln-alignment-*`; package/skill/corpus receipts name
the actual build identity. Integrated scene/viewer flows, quiet-host timing and
clean production release acceptance remain in progress; local delivery seals and
the final launch-site artifact are prepared.

The maintained timing tools now read the Node pin from `scenes/toolchain.json`
when generating a kit and require a complete readable GPU sample window for hub,
tablet and PC quiet checks. Missing, nonfinite or outside-0–100-percent samples
cannot be treated as idle; existing load thresholds are unchanged. Focused
test-first regressions pass **19 tests / 164 assertions** across
`timing-kit.test.ts`, `timing-ab.test.ts` and `gpu-work.test.ts`. The subsequent
complete `bun test scripts/tests` gate in `scenes/` passes **93 tests / 540
assertions / 0 failures** across 20 files, recorded in
`/tmp/kiln-scenes-final-scripts-complete.log`. The earlier
`/tmp/kiln-scenes-final-script-gate.log` retains its 89-test / 521-assertion result.
The current runner was rebundled; immutable historical kits were not edited.
These checks qualify tool behavior, not the remaining device-performance cells.

## UI2 rebuild checkpoint, 3 October

This is a later candidate than the `alignment-final` / code1 / `f0e49fbc…`
receipts above. Those full matrices remain tied to their original binaries. The
five UI2 builds preserve all original asset packs and 296 current module source
files from the prebuild snapshot. Eight fresh image sanity cells pass the unchanged
D18 thresholds; GG actual NVIDIA WebGPU/WebGL2/missing-clip startup probes pass.
Farm public code independently reproduces exactly at `6b537900…` with the same
producer/module inventory; only the two recorded UI source files differ from its
prior source receipt. The portable scene gate passes 678 tests / 18 historical
skips; the exact released-input gate passes 22 / 0 skips.

New local archives `g9-code2` and `ff3-review2-code2` reproduce byte for byte and
preserve all saved revisions and sealed payloads. The separate code2 matrix retains
292 records / 882 checks, plus all 222 active sealed dist files. GG code measures
1,706,950 raw / 511,965 gzip bytes; Foundry's verified initial closure measures
1,532,188 / 448,714. Both retain their unchanged ceilings.

Site artifact `28f84720ad3eb8a1a0c04010772f253c36bd65873d819c90c294916fa033557f`
has 2,728 inventoried files / 199,993,239 bytes. Its 538 site tests / two historical
skips, static/assets checks, 116 downloads, 520 linked files, 89 mapped HTML pages,
three checksum endpoints and all three served runtime seals pass. Its upload set
has 484 files and zero problems; nothing was uploaded. This artifact contains the
44 px topbar and Explore layout reservation, awaiting final width checks.

The new public control gate passes Golden Gate WebGPU, including panel focus,
touch steering, exit and disposal. Foundry's narrow campus toolbar reproduces a
separate issue: reopening More leaves Credits behind the open help panel. The
failed run and hit-test/screenshot evidence are preserved under
`site/.cache/alignment-ui2/flows/`; a focused shared stacking fix and new exact
runtime qualification are required. Do not label UI2 fully qualified.

A strict accessibility continuation proof refuses reuse because emitted shared
CSS differs outside its two approved normalization rules. After the final HUD
fix, run all 198 routes / 396 widths and 44 keyboard tours fresh. Quiet-host
performance also remains unmeasured: 18 cells / 108 minutes are prepared, but the
candidate kit must follow the final runtime hashes. Owner/device/clean-release
boundaries and deferred Troy remain unchanged.

## UI3 menu fix checkpoint, 3 October

The Foundry menu defect is fixed with one shared CSS stacking rule. All 72 HUD
browser contracts pass, including four campus touch/hit-test cases; UI3 public
Foundry panels now pass touch scrolling, simultaneous help/credits, Escape and
visible focus restoration. Golden Gate WebGPU controls also pass. All 14 compiled
JS chunks across five builds become byte-identical to UI2 after removing only the
exact 207-byte CSS addition and mapping generated sibling chunk filenames. Farm's
independent public rebuild is also exact and requires only that CSS removal to
match UI2. No geometry, simulation, asset or input behavior changed in this slice.

Current local delivery pins are `g9-code3` and `ff3-review2-code3`. Their archives
reproduce exactly; the distinct code3 matrix preserves all 292 records / 882 checks
and 222 active sealed files. The launch artifact is
`d2659dfbb7adfcb8f132b7470aa8026b21784944aa0dcc3b5ab5254878a567c0`
(2,728 inventoried files / 199,993,860 bytes). Its 539 site tests, static/assets,
HTTP downloads/links/checksums and all three served runtime checks pass.

The live control run stopped at an over-specific freight observation: neither
semi bucket is visible within 15 seconds of a portrait Arrival view. A read-only
four-view probe confirms actual camera transitions, ordinary traffic and delivery
vans; distant Campus/One pair views cull traffic by design. This is not evidence
that freight simulation is broken. Establish a useful public camera/visibility
setup, then finish all six scenarios and the other final browser gates. Strict
accessibility proof requires all 198 routes / 396 widths and 44 tours fresh. The
18-cell quiet timing kit now targets UI3; actual measurements and final package/
requirement audits remain. No upload, commit or release approval has occurred.

## UI4 public controls checkpoint, 3 October

The final launch artifact is
`70ccf7d40c845c3d8d2dcd243db9d512b216b0a8f6f077069c0401db5d8688ff`:
2,728 inventoried files / 199,993,860 bytes. It retains the same compiled code3
scene bytes and asset inputs. The site suite passes 542 tests, with two historical
skips, zero failures and 7,560 assertions across 75 files. The preceding UI4
artifact `627a7f56…` passes the width gate with zero issues and all 12 hidden
Explore reservation checks. The final rebuild differs only in its source-files
receipt; that byte binding is recorded separately from the browser observations.

All six public control scenarios now pass on actual hardware WebGPU and WebGL2
for Golden Gate, Foundry and Farm. They include panel stacking, touch, scrolling
and visible focus restoration; Golden Gate driving; Foundry interior walking and
return, driving, and freight pause/public-camera scan/resume; and actual Farm
joystick movement. The exact-artifact receipt is
`site/.cache/alignment-ui4-final/live-controls/controls.json`, with execution log
`/tmp/kiln-site-ui4-final-live-controls.log`.

The earlier freight failures tested unsuitable visibility and camera-height
assumptions. The corrected verifier clears the existing campus floor constraint
through public camera gestures, finds visible freight and observes motion after
Resume. No production traffic defect or runtime fix was established; the failed
receipts remain diagnostic records, and this check does not claim individual
trailer-joint alignment or owner appearance acceptance.

Eight remaining lifecycle/viewer/failure jobs are running. Fresh accessibility
still requires 198 routes / 396 widths and 44 keyboard tours; the 18-cell quiet
timing campaign remains unmeasured. Final documentation, package-byte and evidence
binding follow those results. Historical image matrices keep their original
binary scope. Production remains unchanged; no upload, commit or release approval
has occurred.

## Final lifecycle checkpoint, 3 October

The current artifact is
`a4d1e2d0023d9ec17f8063f53b04568e4aecd2a5958c9413d696e254e7f30b19`
(2,728 files / 199,993,860 bytes). All nine flow areas pass: eight new executions
on `70ccf7d4…` plus the prior `627a7f56…` width gate. All six public control
scenarios / 34 checks pass on actual hardware WebGPU and WebGL2. The receipt at
`site/.cache/alignment-site-qualified/lifecycle-continuity.json` rehashes every
file and proves all 2,727 product files unchanged, preserving the original browser
receipt identities. Only `source-files.json` differs after synchronizing the
fullscreen verifier; no production code changed. The 12 hidden Explore checks
carry forward through that same proof. Eleven copy/fallback checks pass freshly
on the final artifact; the site suite remains 542 passes, two historical skips,
zero failures and 7,560 assertions across 75 files.

Fresh accessibility passes all 198 routes / 396 widths, 44 keyboard tours and
2,138 stops, with zero problems and no reused routes. The exact final-artifact
receipt is `site/.cache/alignment-site-qualified/accessibility/combined.json`.
All local site browser gates pass. The 18-cell / 108-minute quiet timing campaign
and final documentation/package/evidence binding remain pending. Historical image
and browser evidence retains its original scope.

The authenticated Cloudflare deployment list checked at approximately 10:35 UTC
still identifies production `33c716c7-16e5-46c6-93bf-f2260f0082be` / `b1ac6ee`.
A subsequent Node-fetch check at 10:50 UTC freshly verifies public build metadata
and manifest `5ecbbe7673348989a85ef2beb2613e5f27f92c9449cec67690f0791288ab7d15`,
still with old `g9` / `ff3-review2` pins. Its receipt is
`tmp/alignment-20261003/production-recheck-20261003T103132Z/node-public-receipt.json`.
The earlier Python-client 403 attempt remains preserved as a separate attempt.
No upload, commit or deployment has occurred.

## Quiet preflight checkpoint, 3 October

Implemented changes and the local site browser gates pass within their recorded
scopes. The prepared 18-cell / 108-minute timing campaign has not started. Its
first balanced-block quiet preflight at 10:53 UTC failed: CPU mean 10.76%, CPU
max 18.68%, GPU max 34%; the screen was unlocked. The unchanged hub limits are
mean CPU below 5%, max CPU below 12% and max GPU at most 3%. The receipt is
`scenes/.tmp/alignment-perf/quiet-candidate-ui3-balanced-before.json`.

Owned browsers and servers were closed, but desktop compositor and ChatGPT
activity remained. The next step requires an idle host, potentially with Codex
minimized by the user; no user process was stopped. This failed environmental
precondition is not a scene regression or an authorization/access failure.
Preserve the receipt and retry with a new filename when the host is quiet. Timing
and final evidence review remain open; no performance acceptance is inferred from
the completed implementation, package or browser gates.

The final current-prose reconciliation also corrects the site README's qualification
pointer and deployment runbook's code3 object examples. Rebuilding retains artifact
`a4d1e2d0023d9ec17f8063f53b04568e4aecd2a5958c9413d696e254e7f30b19`;
the build receipt records the new build time and source diff without changing the
inventoried product bytes. The current package-byte receipt is recorded separately
at `tmp/alignment-20261003/package-final-prose/receipt.json`: it compares shipped
members with the frozen source and binds the six runtime bundles to their already
qualified `58b1b178…` identity. This bounded packing check does not rebuild runtime,
repeat installed-package smoke, or confer timing/release acceptance.


## Balanced timing checkpoint, 3 October

The idle-host blocker is resolved without relaxing quiet limits. Before, internal
and after checks pass. The balanced block completes **7 of 18 cells / 42 of 108
one-minute runs** on the exact preserved optimized `draw-after` and UI3 candidate
binaries. Collection is complete and valid; performance is not an overall pass.
D41 records **37 pass / 5 fail**. All 12 Farm and 18 Foundry balanced runs pass
raw D41. The six static Foundry fab runs have absent exterior pose fields under
the expected schema; readiness is enforced, but interior camera coordinates were
not independently retained. This is a scope limit, not a hidden failed pose check.

All six Golden Gate flyover runs have their longest frame about 25 s into sampling,
near 30 s of scene time after the five-second warmup. Both builds share the peak:
A 50.0/66.6/58.4 ms; B 58.2/50.1/49.9 ms. Four exceed D41. Candidate drive pair2
has a separate 58.3 ms event about 4.408 s into sampling. These five failures stay
failed; the earlier instrumented traces retain their different workload/startup
scope. Exact tracing must distinguish the shared transition from the separate
drive event before assigning cause or changing behavior.

Independent arithmetic over all 462 readable GPU polls reproduces the recorded
same-sample busy×clock summaries. Flyover rises +3.45%, +0.05% and +2.91% across
the three pairs. Mean busy rises about 1.18/0.09/1.27 points while mean clocks
change +13.64/−2.73/0 MHz; higher clocks alone do not explain the observed signal.
This is a small global activity-proxy increase, not proof of code causality, energy
or per-frame GPU time. Frame p50/p95 remain 8.3/8.4 ms at the locked display rate.
Coarse polling, thermal/clock history and compositor activity limit attribution.
No desktop acceptance margin or tablet D-65 adoption threshold is applied. The
historical +2–4 busy-point observation used different cells and draw-base→draw-after;
this block does not directly repeat that comparison.

Seven economy cells and four orbit cells remain. The owner has now reported Farm
arms clipping/snapping over milliseconds, with an empty-hand walking grip and
wrist twist despite no pitchfork; and Golden Gate pier wakes that look too large/
distinct, plus water texture/orientation clipping or snapping at high orbit angles.
These are owner observations, not yet independent reproductions or assigned causes.
Hold the remaining timing blocks until the targeted diagnoses and fixes settle,
then measure the exact resulting candidate. Begin with pose/attachment/transition
and camera/water behavior; do not wholesale-rebake assets or assume an asset defect.
Prior UI3 timing keeps its original candidate scope. Raw results are preserved under
`scenes/evidence/perf/hub-alignment-2026-10-03/candidate-ui3-balanced/`; independent
42-run calculations and scope are in
`tmp/alignment-20261003/balanced-performance-review/review.json`. Earlier failed
quiet attempts are retained. Existing core, site and package qualifications remain
valid within their recorded checkpoint scopes; the previous package tar does not
bind these newly edited status docs. A new package binding is pending. No upload,
deployment, blanket timing pass or release approval is claimed.


## Targeted motion and touch checkpoint, 3 October

The owner clarified that the gripping/clipping farmer was seen in a local preview;
its exact build is unknown. The observation was not dismissed as an old build.
The reported mobile behavior also had a reproduced cause: collision-shortened camera
position fed back into the intended orbit distance.

Farm now applies its empty-hand pose after every rendered mixer update, borrows a
mirrored saved relaxed lower arm without changing GLB bytes, blends Idle/Walk over
150 ms, and warms the explicitly registered hidden pose and shadow variants. CPU
regressions cover zero/substep frames, interrupted blends, overview/seat restoration
and original buffers; the measured shoulder release jump falls 13.13→1.05 degrees
and the hip step 24.91→2.54 degrees in the exact r36 sequence. Actual public
entry/start-stop/reentry checks pass on WebGPU and WebGL2 with 345/506 rendered
frames retaining correct hand state and restoring overview. Pipeline counts remain
54→54 / 21→21 and program counts 40→40. The WebGPU API observer records no new
first-use pipeline events; its empty event list is not evidence about WebGL2 calls.
Receipts are `scenes/.tmp/alignment-motion/farmer-controls-motion2-{webgpu,webgl2}/receipt.json`.
These checks do not prove every clipping pose or confer owner appearance acceptance.

FARM-5 separates intended camera pose from collision projection. Actual emulated
mobile touch passes on both backends: orbit retains 4.697 m and pinch changes
9.86→1.943 m, with the actor stationary. Receipts are
`scenes/.tmp/alignment-motion/farmer-touch-motion2-{webgpu,webgl2}/receipt.json`;
physical-device qualification remains separate. The later Foundry first-key failure
was diagnosed as a shared joystick cleanup defect, repaired and qualified in motion3
as recorded below; it was not a pause-order verifier issue.

Golden Gate phase/foam origin fixes and shorter, softer wakes are implemented.
Actual shader graph tests and frozen origin-boundary comparisons cover all three
tiers on both backends; the previously recorded crossing and appearance evidence
keeps its scope. Contact-shadow side prewarming is now integrated before readiness,
with abort/failure disposal and retained cache ownership covered by 39 focused tests.
The production integration check now passes: both native side variants settle before
first ready, remain cached, and actual contact draws at the natural 580 m jump reuse
them with no new pipeline or shader module. The exact receipt is
`scenes/.tmp/alignment-gg/balanced-contact-first-use-motion2-01/summary.json`.
This startup/first-use proof is not a D41 performance pass.
Earlier unsuccessful single-variant and strict index-identity probes remain preserved.
Normal Uint16→Uint32 promotion retains the same six indices. None of these diagnostic
probes converts the five preserved balanced D41 failures into passes.

The full portable scene gate passes 711 tests, with 18 historical skips and zero
failures across 123 files in 49.82 s (`/tmp/kiln-scenes-motion2-test.log`); typecheck
and lint pass after all three slices. Current builds and receipts are under
`scenes/.tmp/alignment-motion/` and `scenes/.tmp/alignment-gg/`; the root qualification
index records 206 checks at this checkpoint. Prior code3 site `a4d1e2d0…`, its browser
evidence, UI3 timing and package receipts remain exact historical checkpoints.
The changed source still needs affected scene/site rebuilds, controls/lifecycle
requalification, final-candidate quiet timing and fresh document/skill/package
bindings. Production is unchanged; owner/device/release boundaries and deferred
Troy construction remain explicit.


KIT-6 repairs the reproduced pre-#131 joystick cleanup defect: the first KeyW
reached the focused root, then joystick unmount erased that newer keyboard movement.
Movement ownership now preserves the newer input. The unchanged DOM regression
passes 8/8; compiled Foundry motion3 passes both backends, including first-key walking
(about 0.956/0.965 m), orbit/wheel/pinch, interior hand-back and campus return.
Farm motion3 public controls and touch also pass both backends, and GG's native
prewarm handles remain reused. The combined scene gate passes 713 tests with 18
historical skips and zero failures (4,382,983 assertions, 49.84 s); typecheck/lint
and fresh/managed skill copies pass. These are functional and packaging checks,
not quiet performance or release acceptance.

At that test-build checkpoint, motion2 and prepared code4 archives remained preserved
and code4 was not activated. Motion3/code5 site pins were then in progress and not
yet qualified; the subsequent site and final-source checkpoint below supersedes
that pending status. The isolated motion3 timing preparation verifies 18 cells /
108 planned one-minute runs, but no timing has started. No production or saved
asset revision changed.


## Code5 site and final-source checkpoint, 3 October

The fresh corpus run in `tmp/full-optimizer-corpus/current58b1-20261003/` executes
current source with stable initial/final `58b1b178…` identity: 86 examples, 113 released
scene GLBs and 25 saved Troy regression inputs, 224/224 complete with zero failures.
All input bytes remain unchanged; every prepared hash, optimized artifact hash and
per-input result equals the earlier dd25 run. The 20 decoded terrain derivatives
retain explicit provenance. Frozen dist hashes still match their build receipt,
with execution qualified separately by installed-package smoke. This closes the
prior current-identity corpus gap without relabeling historical receipts or claiming
appearance, native compressed-input, importer or owner acceptance.

The bounded [stabilization adversarial review](../reviews/2026-10-03-stabilization-adversarial-review.md)
records source hashes, ownership/cadence/transition/input checks and their limits.
No new concrete blocker was found in those reviewed surfaces. Motion3 has 713 portable
passes / 18 historical skips and clean typecheck/lint. Current fresh and managed
Codex/Claude copies qualify the KIT-6 ownership guidance; final package binding
will follow the status-document update.

Golden Gate `g9-code5` and Foundry `ff3-review2-code5` archives reproduce exactly.
Their public payloads are respectively 1,708,928 raw / 512,680 gzip bytes and
1,710,132 raw / 519,928 gzip bytes, within unchanged ceilings. Saved asset revisions,
model/data payloads and checksums stay unchanged. Code5 site artifact
`26ecd2b29e15191edce22a0df48da108b0d91851a37f9b062f8c97347fc21efb`
contains 2,728 inventoried files / 199,998,092 bytes. It passes 564 site tests with two
historical skips, 70 Astro files without diagnostics and static validation. Fresh
browser checks pass six NVIDIA public-control scenarios / 34 checks, nine
lifecycle/viewer/failure areas, 396 accessibility widths and 44 keyboard tours with
zero issues. HTTP verification passes 116 downloads, 520 linked files, 89 pages and
three checksum endpoints. Final revision reconciliation repeats 882 checks across
292 records with zero mismatches; asset appearance and owner acceptance stay separate.

The direct public Farm probe passes orbit, pinch out/in, post-pinch orbit and first
keyboard movement after touch on NVIDIA WebGPU and WebGL2:
`site/.cache/alignment-motion3/farm-touch-public-02/receipt.json`. Public-01 retained
passing behavior but failed its warning classifier; that failed receipt is preserved.
These are actual public-runtime desktop-emulated touch checks, not physical devices.
The site source/input binding is
`site/.cache/alignment-motion3/final-delivery-binding.json`; the launch flows and
HTTP checks are alongside it. A skill-only site rebuild and exact continuity proof
are being completed separately; do not inherit the code5 browser gates onto changed
bytes without that proof.

The current motion3 18-cell / 108-run quiet campaign and four serialized 135-second
Farm allocation observations remain unstarted. The latter are bounded diagnostics,
not timing or retainer acceptance. Historical UI3 timing retains all five D41 failures;
Golden Gate's original strict-image flags and separate drive event retain their
owner/diagnostic dispositions. Final package/status binding, exact-candidate timing
and authorized clean delivery remain separate. No public release action occurred.

## Focused qualification decision, 3 October

Matt selected **“Focused checks, expand only if a failure needs investigation”**
and placed owner farmer/water review **after the development goals**. This replaces
the motion3 18-cell / 108-run preparation as the active timing requirement. That
larger preparation remains preserved, deferred and unrun; prior dated checkpoints
describe their state at the time and are not rewritten.

The selected block is one original/candidate A/B pair for each case below:

| Scene | Cases | Duration per build |
| --- | --- | --- |
| Farm | Balanced walk; balanced tractor | 60 seconds each |
| Golden Gate | Balanced flyover; balanced drive; high orbit | 60 seconds each |
| Foundry Floor | Balanced campus; balanced fab landing; balanced drive | 60 seconds each |
| Farm | Minimal hero view | 135 seconds |

This is 16 one-minute measurements plus two 135-second measurements: **20.5 minutes
measured, plus loading**. Quiet-host checks, actual hardware identity, foreground
validity and D41 limits remain unchanged. Preserve every failed or incomplete case;
expand only where a failure needs investigation. One pair does not establish repeat
stability, all-tier performance, a desktop speedup, tablet promotion or release acceptance.

The bounded FARM-3 allocation diagnosis is complete in
`scenes/.tmp/alignment-farm/allocation-plan/four-run-comparison.json` and `.md`.
All four 135-second observations are valid. Original lean/sampled runs contain
natural 50.0/41.7 ms intervals; neither current observation contains a natural
interval above 40 ms. Current late major GC still takes about 36 ms. Both sampled runs
retain their separate 66.7 ms profiler-stop interval as instrumentation evidence.
The common embedder-heap cycle and minified allocation stacks do not establish
source allocation/retainer ownership. No new regression, speculative repair,
hitch-fixed, long-term leak-freedom or D41-pass claim follows. The selected minimal
hero-view pair is separate unprofiled timing evidence.

Final skill-only site artifact
`978664da398a2f67ea8e1ed210db6609a997095ffeff9d8961a7e044e2884d8d`
contains 2,728 inventoried files / 199,998,384 bytes. Fresh static, delivery and HTTP
checks pass. Strict continuity against `26ecd2b2…` proves 2,721 unchanged product
files, including all 200 HTML and 243 scene files, with identical local download
mapping. Original browser measurements keep their artifact identities and scopes.
The five regenerated skill archives match every maintained member: four tar streams
are byte-identical with only Node/Bun gzip encoding differences; compose changes
only `references/runtime-scenes.md` plus its size/checksum metadata. The failed
strict attempts remain preserved alongside
`site/.cache/alignment-kit6-site/product-continuity.json`. Current guidance and
fresh/managed workspace copies are verified separately. These new status edits
still require final package binding; no upload, deployment, tag or publication is authorized.

## First focused block checkpoint, 3 October

All **16 of 16 runs are collection-valid** for the eight selected 60-second A/B
cases. Every run has a p95 frame interval of **8.4 ms**. Raw D41 records **15 pass /
one fail**: candidate Golden Gate balanced flyover has a **50.1 ms** interval at
**56.9993 s**, while its original comparison has **50.0 ms** near **25.0293 s**.
These rounded values do not waive the raw verdict.

Strict quiet qualification **fails**. The post-run CPU maximum is **16.473%**, with
that sample **18.125 s after the block ended**. Collection validity and the sample's
later timing do not convert the failed strict quiet gate into a pass; retain its
original failed receipt. No overall performance acceptance follows.

Bounded triage finds a nearby candidate render call spanning **41.3 ms wall time**.
This is not measured CPU time and does not identify a CPU, driver, upload or pipeline
cause. The event is later than the known first-use contact-shadow event; no new
runtime repair is justified by this observation alone.

The only added measurement planned is **one unchanged original/candidate balanced
flyover pair**, two measured minutes, to investigate this failure. The originally
selected **135-second Farm minimal hero-view pair** remains. Keep the same quiet,
actual-hardware, foreground and D41 limits. The full 108-minute preparation stays
preserved, deferred and unrun. There is no all-tier, repeated-run stability or desktop
speedup claim. Owner farmer/water review follows the development goals. Final
status/package binding and release authorization remain separate; no public action occurred.

## Final collected focused timing checkpoint, 3 October

The original focused scope is fully collected: **18/18 collection-valid runs,
20.5 measured minutes**, with **17 raw D41 passes and one failure**. Candidate
Golden Gate balanced flyover's **50.1 ms** interval at **56.9993 s** remains failed.
The Farm minimal hero-view pair completes **135 seconds per build**, with maxima
of **25.0 ms original / 33.4 ms candidate**, both raw D41 pass.

Both strict post-run quiet failures remain: the first block records **16.473% CPU**
maximum **18.125 s after the block ended**; the Farm block records **16.159% CPU**
maximum **6.326 s afterward**. These later samples do not excuse the failed gates.
The overall focused audit remains **FAIL**, encompassing those two quiet failures
and the original candidate flyover D41 miss.

The one bounded, unchanged flyover repeat is also complete: an additional **two
measured minutes**, original/candidate maxima **50.0/16.7 ms**, both D41 pass,
before/internal/after quiet checks pass, and owned cleanup passes. An earlier
repeat preflight with **12.694% CPU** stopped before browser launch; its failed
receipt is preserved. The candidate's near-57-second miss did not recur. The
earlier nearby **41.3 ms render-call wall interval** was not measured CPU time;
there is no actionable cause or justified new runtime repair. A passing repeat
does not erase failed evidence or establish full qualification.

All intended focused measurement work and functional implementation are complete
within their stated scopes. **Strict desktop performance acceptance remains open**;
no further benchmark expansion is presently justified. The broader 108-minute
preparation remains preserved, deferred and unrun. Physical-device acceptance is
deferred; owner farmer/water appearance review follows the development goals.
No all-tier, repeat-stability, desktop-speedup, full-goal-completion or release
acceptance is claimed. Source and runtime are unchanged by this status update.

After these documents are frozen, the final offline package byte audit is separately
recorded at `tmp/alignment-20261003/package-stabilization-final/receipt.json`; the
qualification ledger records its result. This checkpoint does not pre-claim that
audit's outcome. No commit, public upload, deployment, tag or publication occurred.
