# Draw optimization across the three scenes

Current disposition (3 October): the non-engine optimization work below landed in
PR #131 (`b1ac6ee`). Optimized Farm is deployed; Golden Gate and Foundry await the
planned reseal of their optimized runtimes. The separate engine modules remain
unlanded. The [current plan](../plans/2026-10-02-core-scenes-site-alignment.md) and
[backlog](../backlog.md) distinguish completed work from adopted follow-ups. All
before/after counts, timing and local-only statements below describe the recorded
cycle, not a new run or the current delivery state.

The draw-optimization cycle ran on branch `draw-optimization` in the worktree
`C:/Users/Mattm/X/kiln-draw-optimization`, following
`docs/plans/2026-10-01-draw-optimization-cycle.md`. Owner decisions OD-1 to OD-18
are recorded as D-46 to D-63 in `scenes/DECISIONS.md`, and the X-02 re-baseline
as D-64.

The parity images are on the private report page (owner). This record covers counts, look parity, quiet-host timing, what worked where, the
open decisions and a feedback map. The commits are local only: nothing was pushed,
deployed, posted upstream, or run against a live model. No owner acceptance is
implied.

## Headline

Draws are summed over every count fixture of a tier. BEFORE is `draw-base` (main
at `c734e2a`) and AFTER is `draw-after` (this branch).

| Scene | Tier | Draws BEFORE → AFTER | Pipelines bound, summed | Triangles |
|---|---|---|---|---|
| Farm (18 fixtures) | minimal | 3,712 → 3,424 (−7.8%) | 470 → 470 | equal |
| Farm | economy, balanced, high | 8,161 → 3,025 (−62.9%) | 1,039 → 517 | −22% to −24% (no per-frame shadow pass when settled) |
| Golden Gate (18) | minimal, economy | 2,207 → 786 (−64%) | 435 → 238 | +0.4% (coarser culling) |
| Golden Gate | balanced | 2,238 → 817 (−64%) | 440 → 243 | +0.2% |
| Golden Gate | high | 6,158 → 1,706 (−72%) | 1,014 → 447 | −9% |
| Foundry Floor (15) | minimal to high | 1,579–1,677 → 1,474–1,572 (−6.3% to −6.6%) | 303–305 → 138–140 | equal |

Representative views, draws per frame:

| View | BEFORE | AFTER |
|---|---|---|
| Farm landing view, high, settled | 583 (main 312, shadow 270, output 1) | 283 (main 282, shadow 0, output 1) |
| Farm landing view, high, clock running | 583 | 337 (live map for animals and rotors; 12-17 static re-renders over 3,600 frames) |
| Farm landing view, minimal | 345 | 315 |
| Golden Gate arrival, high | 432 (main 179, shadow 37+37, reflection 178, output 1) | 103 (main 51, shadow 2 in one pass, reflection 49, output 1) |
| Golden Gate arrival, minimal | 180 | 52 |
| Foundry Floor campus, high | 101 main | 95 main; pipelines bound 21 → 10 |

## What changed

The hashes are those of the source branch `draw-optimization`. PR 1 lands every
commit except `e72b610` as a cherry-pick under a new hash; the engine modules of
`e72b610` land in the separate engine PR.

| Commit | Step |
|---|---|
| `417da63` | Committed per-pass count probe for every scene (S1) |
| `e72b610` | Engine: `src/rigid-merge.ts` and `src/extension-compat.ts`, unbundled modules (S2) |
| `ced34bb` | Scene-kit multisample discard knob, per-scene tiers (S3) |
| `5042a16` | Probe `--query` for same-build A/B |
| `57177cf`, `75751ec` | D-46 to D-63, D-64 |
| `67cafa4` | Interleaved A/B timing runner and kit (S6) |
| `2bd021e`, `0806baa`, `8d95fec` | Kit: rigid merge; shadow cache, once-per-frame, threshold, stand-ins, pass stand-ins; review hardening |
| `95996dc` | Foundry Floor planting through one material graph |
| `1c4ae4f`, `0174e7d` | Farm hero merge, stand-ins, cached shadow, threshold; review tuning |
| `d2d1cfd`, `892d103` | Golden Gate bridge merge, once-per-frame shadow, stand-ins, reflection stand-ins; kerb depth-tie fix |
| `4383a1a`, `dc77f27`, `bf4b2dd` | Before/after parity tools and the X-02 re-baselines (S5) |
| `7db7325` | `kiln-compose-scene` skill and runtime-scenes reference (S7) |

## Diagnosis (S1)

The committed probe (`scenes/scripts/count-probe.ts`, kit `probeFrames`) records the
following for every scene, tier and named view or workload:
- draws per render pass;
- pipelines and triangles;
- attribution by system;
- count-only what-ifs.

It covered 204 fixtures, all stable. GPU draws equal JS draws everywhere, and every
what-if restores its baseline. The ranked levers are in
`scenes/evidence/counts/draw-base/levers.md` (ignored, local only). The short version:

- **Farm:**
  - The shadow pass was 270 of 583 draws at the landing view. A cached static map
    removes all of it while nothing moves.
  - Heroes were 198 main and 198 shadow draws.
  - A 2-texel small-caster threshold drops 59, 25 or 2 casters (economy, balanced,
    high).
  - Woodland packing at minimal would save up to 48 draws. That is an owner tier
    decision.
- **Golden Gate:**
  - The bridge web was 148 of 180 draws at minimal and 366 of 432 at high, and
    the only lever on the low tiers.
  - The shadow map rendered twice a frame, because the planar reflector's camera
    triggers a second render.
  - The reflection redrew 50-180 draws.
- **Foundry Floor** is the control scene:
  - The fab already draws 39-134 in 6-7 pipelines, using an anchor bake per entity
    and material.
  - Campus planting compiled one pipeline per draw.

## Phase 0 engine (S2)

These modules (`e72b610`) are not in PR 1; they land in the engine PR described in
`docs/reviews/2026-10-02-draw-optimization-engine-handoff.md`.

`mergeRigidGroups` merges by material inside rigid groups. Its boundaries are:
- animation targets;
- `Joint_*` pivots;
- nodes with Kiln semantic extras;
- relationship targets;
- LOD and visibility nodes.

It also locks blended and transmissive materials and validates each bucket before
changing anything. A test failed first (expected 11, received 16) and now passes.
For `farmhouse.glb`:
- draws go from 16 to 11;
- `Joint_FrontDoor` keeps its 2 primitives and 132 triangles;
- triangles stay at 4,080;
- bounds drift is 0.

`extension-compat.ts` flags extensions marked required against six destinations
(three, Godot, Unity glTFast, Unreal, Bevy, Blender), with 12 tests.

Wiring the merge into `optimize:'full'` is held (see the open decisions).
`src/render.ts` and `dist/` are `v1-readiness` files, and the bundle test checks
`dist/` byte for byte. The patch and its test updates are in
`tmp/drawcalls/phase0/wiring.patch` (ignored, local only); all 401 optimize-related
tests pass with it.

## Multisample store (S3, OD-10)

**Verdict: confirmed, narrower than first suspected.**

three r186 always stores the 4x colour and depth of the canvas frame-buffer target
after the resolve. That is a conservative default, not a three.js bug:
- the store is wasted where the main pass is never split;
- it is required where a mid-pass `viewportDepthTexture` copy restarts the pass
  with Load (Golden Gate medium and high water).

Scene-kit sets the store flags per tier. Trip-wires fail loudly in test and dev
when a pass would reload the attachments. Pin tests read three's build.

| Check | Result |
|---|---|
| Browser frames sampled | 190 |
| Mutations caught | 14/14 |
| Pixel parity | B-06 144/144; every Foundry fab and planting-off capture byte-identical |
| Hub timing | no measurable change |
| Tablet, Farm minimal | GPU busy 93% → 85% at 60 fps |
| Tablet, Golden Gate minimal | GPU busy 85% → 82% |
| Tablet, Farm economy (GPU-bound) | frames within one refresh 39.9% → 48.8%, 37.5 → 39.8 fps |

three r186 makes the attachments transient when the store flags are false, and the
tablet supports `TRANSIENT_ATTACHMENT`. The issue, how it was found and the fix
are on a private report page (owner). Nothing was posted upstream.

## Scene-kit features (S4, S4b)

All are opt-in, covered by tests, and pinned to three r186 where they rely on its
internals.

- **`mergeRigidByMaterial`** merges per (anchor, material, attribute layout,
  shadow and render flags).
  - Anchors keep their identity, transform and children; sources are hidden, not
    removed.
  - The bake is bit-exact on identity and translation paths.
  - Options:
    - `layout: 'source'` mirrors the source interleaving, which saves the Farm 2-3
      pipelines;
    - an `order` hook settles coplanar depth ties.
- **`shadowStandIns`** builds position-only depth proxies per anchor, side and
  optional cell.
  - Excluded materials are counted by reason, and sources outside `shadowMask` are
    skipped.
  - Pass stand-ins (`mainOnly`, `passStandIn`, `passCameraLayers`) route content
    between the main pass and an extra pass by layer.
- **`cachedSunShadow`** keeps a static map rendered only when armed and a live map
  for casters observed to move.
  - Casters return to the static map after 30 still frames; the two maps are
    sampled as `min`.
  - `prime()` is called when the world is revealed; `track()` returns `untrack`,
    and a `live()` option marks motion the watch cannot see.
  - It throws on a late install.
- **`shadowOncePerFrame`** renders the sun map once a frame when a second camera
  would render it again. It throws when three would fall back to each viewing
  camera's mask.
- **`smallCasterThreshold`** stops casters under N shadow texels from casting,
  measured with the same bounding sphere as the probe.

Where each one is on:

| Feature | Farm | Golden Gate | Foundry Floor |
|---|---|---|---|
| Rigid merge | heroes per anchor and material, source layout | bridge per (south, north, span) × material, curb order | no (control scene) |
| Shadow stand-ins | 71 hero proxies (shadow tiers) | 7 bridge and approach proxies (high) | no shadows |
| Cached static + live shadow | on (shadow tiers) | wired, off: no gain while driving | no shadows |
| Once-per-frame shadow | not needed (one camera) | on (high) | no shadows |
| Small-caster threshold | 2 texels (shadow tiers; farmers keep detail) | not applicable once stand-ins cover every caster | no shadows |
| Reflection stand-ins | no reflection | far approaches in the reflection (high) | no reflection |
| Multisample discard | every tier | low tiers (no mid-pass copy) | every tier |
| Shared material graph | — | — | campus planting |

## Per scene (S5)

### Farm

- **Counts:** see the headline.
  - The static map re-renders only on events: 115 / 128 / 141 draws in 12
    pipelines (economy / balanced / high).
  - With the clock running, the landing view draws 315 / 313 / 326 / 337 a frame
    (minimal to high), against 345 / 583 / 583 / 583 before.
  - B-07 is unchanged: batching 83/54/2000/2004/11, frozen 555/4191, hidden roots
    575, dynamic roots 34.
- **Interaction:** the adversarial review exercised every door and gate, the
  rotors, tractor drive, farmer play and walk on WebGPU and WebGL2.
  - Leaf and shadow both move, and settle back into the static map.
  - Colliders are identical: 13 / 95,382 / 14,468.
  - Seven tier remounts gave no errors and no growth.
  - Nothing is created after ready.
- **Parity:** 86/86 cases pass B-06 and the thin-line check (pixels over 32 levels,
  budget 100):
  - WebGPU: 20 views at 4 tiers;
  - WebGL2: 6.
- **Pilot parity** (D-53, D-64) did not run in S5. The decision sweep of 2 October
  ran it as D20 against the sealed r34 pilot, on WebGPU and WebGL2. Standalone runs
  failed a different view for each build, for reasons in the tool (a loose phase
  capture, animations it cannot align). Captured at the same pilot phase,
  draw-after and draw-base got the same verdict in 17 of 17 pairs, so all 17
  same-phase pairs pass: the cycle did not change pilot parity. The pairs came
  from a prototype script,
  `tmp/drawcalls/decisions/decide-sweep/e2-samephase.ts` (ignored, local only).
- **OD-4 shadow changes** at economy (2 texels = 34 cm):
  - the trailer drawbar, hitch ring and hitch pin stop casting (146 px over 8
    levels);
  - sheep leg segments and other herd parts drop a few one-texel blocks (up to 69
    px);
  - one texel of a trailer hub goes;
  - balanced changes 5 px or fewer.

  The farmers keep their small parts, so the player's shadow keeps its neck and boot
  contact. Images: `tmp/drawcalls/s5/images/farm/` (ignored, local only; also on
  the private report page).
- **Merge pixels** (OD-18): isolated flips on the barn cupola louvres and the
  watermill corner speckle, up to 153 px over 8 levels; they pass both checks.
- **X-02** now compares against `packages/farm/fixtures/x02-baseline.json` (D-64).

### Golden Gate

- **Counts:** see the headline.
  - High shadow passes go from 36 to 18 over the fixtures; shadow draws go from
    1,746 to 104.
  - Reflection draws go from 2,163 to 773.
  - Main-pass draws at high go from 2,231 to 811.
- **Parity:** 488 of 489 cases pass in the S5 parity run, over day, golden and fog
  presets on WebGPU and WebGL2. That count is too high: the run covered golden-hour
  side-full only at high on WebGPU, and the view also fails at economy and
  balanced (193 px) and on High WebGL2 (200 px).
  - **The failure:** golden-hour side-full has 193 px over 32 levels at high (200
    on WebGL2), against a budget of 100; B-06 passes. It comes from the tower ribs
    against their panels: a depth tie that the merge settles in one fixed order
    where the per-mesh sort used to vary with the view.
  - **Accepted residuals:** golden arrival 74 px, day span 52, low shore
    reflections 21-35.
  - **Kerb stipple:** the review found it (the merge put the curbs after the
    coplanar walks). It is fixed at no extra draws.
- **F2** is not applied. Traffic and fog banks appear in the reflection exactly as
  before; the image pair is on the private page.
- **The cached shadow stays off.** While driving, the static map re-arms on 104 of
  120 frames, so it adds a pass and a second shadow lookup for nothing.
- **X-02** has a new baseline from `perf-local.ts`, recorded in
  `packages/golden-gate/PERFORMANCE.md`.

### Foundry Floor (control)

- **Counts:** campus fixtures fall 11-13%; planting goes from 12 to 6 draws at the
  campus view and from 39 to 14 at the roundabout. Pipelines bound fall by about
  half; triangles are equal. The fab is unchanged (745 draws over its fixtures).
- **Parity:** 160/160 cases pass.
  - The worst is 181 of 921,600 px, at planting part edges.
  - All 48 fab captures and all 40 planting-off captures are byte-identical to
    the old build.
- **Count baseline:** a first one, in `packages/foundry-floor/fixtures/count-baseline.json`.

## Timing (S6)

The timing uses quiet hosts only (OD-5).
- **Hub:** quiet checks before and after every block, and headed runs at 120.114 Hz.
- **Tablet:** a Samsung SM-X518U (Mali-G68, Chrome 154, 60 Hz) on the device kit.
  - Thermal status stayed at none, with the battery at 24.3-28.1 °C.
  - Every adb mapping was removed and verified empty.
- **This PC:** it failed its quiet check twice (CPU 65% and 29.8%), so it was not
  timed.

**Method:** draw-base (A) against draw-after (B).
- Each cell runs 3 interleaved pairs (A B, B A, A B).
- Each run is a fresh page, a 5 s warm-up, then a 60 s sample.
- 196 of 198 runs were valid. The two invalid runs came from a display-rate probe
  that Chrome throttled; the probe is fixed in `69f92fe`, and the cells were rerun
  at 12/12.
- "Within 1" and "Within 2" are the shares of frames that land within one and two
  display refreshes.

The full tables, load samples and draw cross-checks are in
`tmp/drawcalls/s6/timing-full.report.md` (ignored, local only). Evidence is in
`scenes/evidence/perf/{hub,tablet}-2026-10-02/` (ignored, local only).

**Tablet, minimal** (its tier, D-25). Both builds hold 60 Hz, p95 stays within OD-7
(33.3 ms), and D-41 passes in every run.

| Cell | p95 ms A → B | Within 1 refresh A → B | Within 2 refreshes A → B | Mali GPU busy A → B (pairs lower) | Draws A → B |
|---|---|---|---|---|---|
| Farm hero | 16.7 → 16.7 | 100 → 100% | 100 → 100% | 92 → 87 (3/3) | 280 → 255 |
| Farm walk | 16.7 → 16.7 | 100 → 100% | 100 → 100% | 84 → 83 (mixed) | 110 → 102 |
| Foundry Floor campus | 16.7 → 16.7 | 100 → 100% | 100 → 100% | 82 → 80 (mixed) | 77 → 72 |
| Foundry Floor drive | 17.2 → 16.7 | 96.3 → 100% | 100 → 100% | 92 → 82 (3/3) | 148 → 135 |
| Golden Gate arrival | 16.7 → 16.7 | 100 → 100% | 100 → 100% | 87 → 83 (3/3) | 140 → 36 |
| Golden Gate drive | 16.7 → 16.8 | 98.4 → 98.3% | 100 → 100% | 93 → 90 (3/3) | 128 → 50 |

Busy alone understates the GPU savings. The Mali clock changes with load, so the
same busy share at a higher clock is more work; read as busy × clock, Farm walk
falls by 15% and Foundry Floor campus by 24%, where the busy column reads mixed.

In the Foundry Floor drive, the old build misses vsync throughout: its longest frame
is 33.8 ms, against 17.8 ms after.

**Tablet, economy** (OD-12). This tier is GPU-bound in both builds, with GPU busy at
91-95%. The new build delivers more frames from the same GPU budget.

| Cell | p50 ms A → B | p95 ms A → B (OD-7 ≤ 33.3) | Within 1 refresh A → B | Within 2 refreshes A → B | fps per run A → B | D-41 runs passing A → B |
|---|---|---|---|---|---|---|
| Farm hero | 33.2 → 16.7 | 33.3 → 33.3 | 39.9 → 61.2% | 99.9 → 99.9% | 37.5 → about 43.4 | 2/3 → 3/3 |
| Farm tractor-drive | 33.1 → 16.6 | **33.4 (over)** → 33.3 | 39.0 → 81.9% | 99.9 → 100% | 35.7-44.4 → 49.5-56.5 | 3/3 → 3/3 |
| Golden Gate arrival | 16.6 → 16.6 | 33.2 → 16.7 | 86.4 → 97.9% | 99.8 → 100% | 52.9 → 58.9 | 3/3 → 3/3 |

The old build broke OD-7 on the Farm tractor drive at economy; the new build meets
it. Farm hero still misses about 39% of refreshes at economy, so the tablet tier
stays the owner's call.

**Hub** (GTX 1660 Ti Max-Q, 120 Hz). Every run in both builds sits at p50 8.3 and
p95 8.4 ms, because the hub is vsync-limited. The change shows in CPU render time,
draws and pacing instead.

| Cell | CPU render ms A → B | Draws A → B | Within 1 refresh A → B | GPU busy A → B |
|---|---|---|---|---|
| Farm hero, high | 5.5 → 1.6 | 583 → 330 | 98.6 → 99.9% (longest 25.0 → 16.8 ms) | 53 → 53 |
| Farm hero, balanced | 5.1 → 1.6 | 583 → 321 | 96.9 → 99.9% | 50 → 52 |
| Farm hero, economy | 5.2 → 1.3 | 583 → 313 | 99.7 → 99.9% | 44 → 43 |
| Farm walk, high | 3.9 → 2.0 | 365 → 153 | 99.8 → 99.9% | 52 → 46 |
| Farm tractor-drive, high | 4.0 → 2.0 | 399 → 190 | 99.8 → 99.9% | 55 → 52 |
| Golden Gate arrival, high | 1.7 → 1.1 | 432 → 103 | 99.9 → 99.7% | 58 → 55 |
| Golden Gate flyover, high | 1.5 → 1.1 | 324 → 93 | 99.8 → 99.9% | 57 → 52 |
| Golden Gate arrival, minimal | 2.2 → 1.6 | 180 → 52 | 99.9 → 99.9% | 39 → 39 |
| Foundry Floor campus, high | 2.0 → 1.8 | 102 → 96 | 99.9 → 99.8% | 39 → 39 |

Within 2 refreshes is 100% in both builds in every hub cell.

- **D-41:** 131 of 132 hub runs pass. The failure is Golden Gate flyover at minimal,
  B pair 3: one frame of 50.1 ms, 0.1 ms over. Every flyover run in both builds has
  its longest frame at the same moment, 25 s in, when the flight changes (A 41.6 /
  33.2 / 41.7 ms; B 41.6 / 41.7 / 50.1 ms). So three pairs cannot attribute it to
  the change.

  A 5-pair rerun on the quiet hub settled it: 20 of 20 runs were valid. The stall
  appears in every run of both builds at 24.9-25.1 s.
  - Median stall: minimal 41.6 ms (before) and 41.7 ms (after); high 33.3 and
    25.0 ms.
  - The after build was shorter in 3 of 5 pairs.
  - At minimal, both builds hit six-refresh stalls: before 49.9 and 50.0 ms, after
    50.0 and 50.1 ms. Six refreshes take 49.95 ms, so the same stall passes or
    fails the 50 ms rule on jitter.
  - D-41: before 5/5 and 5/5; after 4/5 at minimal and 5/5 at high.

  The flight-change stall is a pre-existing scene hitch, not caused by this cycle.
  Fixing it is separate work.
- **GPU busy at balanced** rose 2-4 points in all three pairs, at matching clocks.
  This metric is a 5 s share-of-time sample from `nvidia-smi`. GPU timestamp
  queries would measure GPU time per frame; the adapter exposes `timestamp-query`.

**Pending runs**, with exact commands in the timing report:
- Hub balanced and economy beyond Farm hero and Golden Gate arrival: 14 cells,
  about 1 h 45 min.
- Golden Gate hero orbit (arrival was run instead).
- Foundry Floor economy on the tablet: no longer pending; it has since run.
- Any run on this PC, once it passes its quiet check.

## What worked where

| Lever | Farm | Golden Gate | Foundry Floor | Lesson |
|---|---|---|---|---|
| Cached static shadow + live map | Biggest win: 270 → 0 settled, 31-54 with life | No gain: the fitted shadow box follows the car | — | Pays only where the shadow frustum is still |
| Depth stand-ins | 198 hero shadow draws → about 71 proxies; matters on static re-renders and movers | 150 casters → 7 proxies | — | Build before merging; chunk long structures |
| Once-per-frame shadow | — | Halves the shadow cost with a reflector | — | Needs a shadow mask with a bit above layer 0 |
| Merge by material within anchors | −30 main draws, look-neutral, interaction intact | The only low-tier lever: 148 → 20 bridge draws | — | Check coplanar faces across parts: merge order decides depth ties |
| Reflection stand-ins | — | Reflection 178 → 49 at arrival | — | Keep the reflection's content contract (F2) separate |
| Small-caster threshold | −59 casters at economy | Not applicable | — | Exempt actors whose contact shadows read |
| Multisample discard | Tablet GPU busy −8 points | −3 points at minimal | Pixel-neutral control | No desktop effect; pays on tile-based mobile GPUs |
| Shared material graph | — (heroes are textured) | — | Pipelines −50% on campus | Pipelines, not draws, were the cost |

## Open decisions for the owner

The owner answered all ten on 2 October in a wider decision sweep: the scene
answers are in `scenes/DECISIONS.md` from D-65, the engine answers in
`docs/reviews/2026-10-02-draw-optimization-engine-handoff.md`.

1. **Engine wiring** of `mergeRigidGroups` into `optimize:'full'`:
   - (a) commit regenerated `dist/` here and regenerate at rebase; or
   - (b) wait until `v1-readiness` merges (recommended, OD-1).
2. **`expandSharedMeshes` default.** Golden Gate gets either:
   - 11 draws with a 25% larger file (shared meshes copied, today's default); or
   - 104 draws with an 8% larger file.
3. **F2:** remove traffic and fog banks from Golden Gate's reflection, per its spec.
   That is a visible change.
4. **OD-4 images:** accept the economy small-caster changes on the private page (or
   exempt the trailer hitch).
5. **Golden Gate tower depth tie:** accept 193 px at golden-hour side-full, or keep
   the tower ribs unmerged for a few draws. Correction: keeping the ribs unmerged
   also fails, at 177 px.
6. **OD-9 live map size:** full size is the default. `?liveMapSize=1024` at high
   saves 25.2 MB at a small look risk.
7. **Woodland packing at minimal** (Farm, up to −48 draws on the tablet tier).
8. **Cross-placement hero instancing:** gates 24 → 4 and farmers 60 → 30. It
   changes B-07 counts and pitchfork visibility handling.
9. **Foundry campus structures instancing** (78 → about 16 draws). It replaces
   exported materials.
10. **The tablet's default tier** (OD-12), with the economy numbers above.

## Feedback map

Proposals unless marked as applied. Engine and model-facing changes wait for
`v1-readiness` (OD-1).

**Engine tools**
- Wire `mergeRigidGroups` (decisions 1 and 2) and report merged draws per anchor in
  the export summary.
- Surface `extension-compat` results in `kiln_export` and `kiln_inspect` output.
  This changes the schema, so it needs versioning.
- Add a per-asset draw estimate to inspection: draws as authored, after a merge
  within anchors, and the shadow casters below 2 texels at a stated texel.
- Flag mirrored tangent-bearing parts and coplanar faces shared across parts or
  materials. The Golden Gate kerb shows both are depth-tie risks once merged.

**Authoring and QA skills** (`v1-readiness` owns them; proposals)
- `kiln-author-asset` geometry recipes:
  - keep moving parts as named `Joint_*` pivots;
  - budget materials per rigid group (draws per anchor equal its material count);
  - avoid coplanar faces across separate parts;
  - fold tiny separate parts (eyes, bolts, hubs) into their parent's material when
    they never move.
- `kiln-qa-asset`: in the destination, check draws per anchor and material, and
  check that interaction survives a merge.

**Scene-kit**
- Applied: the rigid merge, the shadows module, pass stand-ins, the multisample
  knob, and the probe with `--query` and settled probing.
- Proposed:
  - choose `layout: 'source'` per bucket automatically;
  - add a probe what-if that pauses kit-installed shadow re-arms;
  - detect morph-target motion;
  - verify the cache on WebGL2 hardware beyond the Farm;
  - add an R8 shadow colour target after a WebGL2 check.

**Compose-scene skill** (applied, OD-16)
- `skills/kiln-compose-scene` and its runtime-scenes reference now carry the proven
  techniques and their measured effect.

**Project conventions**
- Every scene keeps a committed count baseline with provenance and runs it before
  release. Foundry Floor's new check should join the portable gate.
- Count tests under `scenes/scripts/tests/` are not in `bun run test` (the portable
  runner reads package test folders only). Move the offline ones, or add the
  folder.
- Parity uses B-06 plus a thin-line budget (pixels over 32 levels), the same build
  with each lever off, and a repeat for the noise floor.
- Report cached features settled and with the clock running.
- Probe and time workloads at pinned poses. Drive fixtures that run on wall-clock
  delta are workload state, not evidence of change.

## Evidence

The following are ignored local paths in the worktree:
- `scenes/evidence/counts/{draw-base,draw-after,...}`;
- `scenes/evidence/draw-after/<scene>/` (count tables, parity, images);
- `scenes/evidence/perf/{hub,tablet}-2026-10-02/`.

Reports are under `tmp/drawcalls/` (`understand/`, `wave-a/`, `wave-b/`,
`wave-b-review/`, `s5/`, `s6/`), which is ignored and local only too.

Gates are listed in the last section.

## Gates

All gates were run on HEAD `69f92fe`. Logs are in `tmp/drawcalls/gates/final/`
(ignored, local only).

On 2 October the landing branch `draw-optimization-landing` (on `main` `a396612`)
reran `bun run check:skills` (pass) and the scenes gates: typecheck pass, lint 0
findings, test 525 pass, 30 skip, 0 fail. The 8 skips beyond the 22 below are
suites whose ignored staged inputs a fresh worktree does not have (Golden Gate's
vehicle models, 7; Foundry Floor's saved plants, 1).

**Engine**

| Gate | Result |
|---|---|
| `bun run typecheck` | pass |
| `bun run lint` | pass |
| `bun run test` | 3,070 pass, 2 skip, 0 fail |
| `bun run test:render-service` | 78/78 |
| `bun run test:coverage` | functions 95.28% (minimum 94.00%), lines 92.55% (minimum 92.10%) |
| `bun run check:skills` | pass |

**Scenes**

| Gate | Result |
|---|---|
| `bun run typecheck` | pass |
| `bun run lint` | 0 findings |
| `bun run test` | 533 pass, 22 skip, 0 fail |
| `bun test scripts/tests` (not part of `bun run test`) | 58/58 |

Public builds stay within the D-15 ceilings:

| Scene | Size change, bytes / gzip | Gzip headroom left |
|---|---|---|
| Farm | +18,939 / +7,158 | 35,468 |
| Golden Gate | +14,183 / +5,628 | 6,347 |
| Foundry Floor | +4,200 / +1,580 | startup chunk 1,414,442 of 1,750,625 |

Bundle hygiene finds 0 hits in all 12 public files.
