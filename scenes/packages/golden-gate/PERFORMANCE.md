# Golden Gate performance plan and evidence (SPEC 20)

This is SPEC 20 applied to Golden Gate. Standing decision 1 governs it: nothing is timed on the dev PC (an RTX 3070 desktop under load from other agents). Owner rule 11:35 adds that any timing seen there is "indicative, PC under load" and never settles a budget. Timing comes from the hub, which only the coordinator connects to, and from the owner's devices.

Golden Gate has no pilot. X-01 does not apply, and every relative rule in SPEC 20 ("within 110 percent of the pilot") becomes the absolute target that SPEC 20.2 gives for the device class. The counts, bytes and memory recorded here are the baseline for later changes.

State on 2026-09-29, 16:56:

- Done: the local evidence (X-02, X-03, X-11 and X-12 all pass or are recorded) and the tablet run (X-07 passes, below).
- Run on the hub: session 1 (2026-09-29, 17:34 to 18:04, g1 kit) ran X-06 and X-04. Session 2 (20:11 to 22:35, g2 kit) ran X-05 and the 30-minute soak (X-09 and the hub part of X-10). Results are under "Hub session 2" below and in `evidence/perf/hub-2026-09-29/` and `hub-2026-09-29-session-2/`.
- Deferred: the phone (X-08).
- Rerun on g3 (fix round 2, 2026-09-30, 00:22 to 00:25): X-02, X-03, X-11 and X-12 pass or are recorded. The files are in `evidence/build/g3/` (section "g3 local evidence" below). g3 has not been timed on the hub.

## Checks

| Id | Check | Where | Method for Golden Gate | Pass rule | State |
|---|---|---|---|---|---|
| X-01 | CPU frame time versus the pilot | none | none | not applicable: Golden Gate has no pilot | n/a |
| X-02 | Draw calls, triangles, geometries, textures, pipelines | dev PC, counts only | `renderer.info` at 15 views: the ten named views, four hero-orbit points and the drive chase fixture. Frozen clock (Day, time 12), tiers high, balanced and economy, WebGPU and WebGL2. A count is kept once two samples 20 frames apart agree. | no pilot: recorded as the baseline; draw calls and triangles must match across backends | done; `evidence/perf/x02-counts.json`; g3: `evidence/build/g3/`; re-baselined 2026-10-02 on the draw-optimized build (OD-8, D-53; section "X-02 re-baseline" below) |
| X-03 | Leaks | dev PC, counts only | The kit's B-05 protocol (R2-13/C-04) for this scene: a cold teardown, two 120-frame cycles, ten initialization cycles, then ten measured mount and unmount cycles alternating automatic (WebGPU) and forced WebGL2 | heap after a forced collection within 5 percent; every receipt disposed with 0 resources and a lost device or context; no listener, canvas or HUD left | **pass**; `x03-leaks.json`; g3 pass, `evidence/build/g3/` |
| X-04 | Time to `onReady` | hub | cold (a new profile per run) and warm, both backends, 5 runs each | WebGL2 worst run at most 45 s; medians recorded | **pass** 2026-09-29 (hub session 1, g1 kit): WebGL2 worst run 3585 ms against 45 s; median (worst of 5) WebGPU cold 3929 (4056) ms, warm 3823 (3865); WebGL2 cold 3542 (3585), warm 3335 (3575); `evidence/perf/hub-2026-09-29/` |
| X-05 | Desktop tier qualification | hub | tiers high, balanced and economy, both backends, workloads orbit, flyover and drive, 60 s each, 5 runs, governor held at the tier's level 0 | recorded per tier, including which tiers reach 60 FPS (no pilot) | **recorded 2026-09-29** (hub session 2, g2 kit): all three tiers reach 60 FPS on both backends and all three workloads (18 of 18 groups, 90 of 90 runs valid and quiet); median interval 8.3 ms and 119.8 to 119.9 FPS at the panel's 120.11 Hz refresh, so no headroom is visible; table under "Hub session 2"; `evidence/perf/hub-2026-09-29-session-2/` |
| X-06 | The tier the kit selects on the hub GPU, and the frame rate there | hub | automatic tier with the governor live (as a visitor gets it), three workloads, both backends, 3 runs of 60 s | the selected tier reaches 60 FPS on WebGPU: median interval at most 17 ms and average at least 60 FPS | **pass** 2026-09-29 (hub session 1, g1 kit): the kit selects High (level 0) on both backends and all three workloads; WebGPU 119.9 / 119.8 / 119.9 FPS (orbit / flyover / drive), median 8.3 ms, 18 of 18 runs valid and quiet, no governor change; `evidence/perf/hub-2026-09-29/` |
| X-07 | Tablet | owner's Galaxy Tab S9 FE (Mali-G68), over ADB | `tests/tools/tablet-check.ts`: the pilot's tablet preflight, then the automatic tier on orbit, drive and flyover (60 s each; orbit and drive twice), plus forced balanced orbit; thermal and battery state before and after each run | 20.2 tablet: 30 FPS or better with p95 under 33.3 ms in orbit and in play (drive); no task over 100 ms after ready | **pass** (evidence: quiet preflight, every run started cool); `evidence/perf/tablet-2026-09-29/` |
| X-08 | Phone | owner's Galaxy S24+ | no phone is connected to this builder; the tier path is emulated in `tests/tools/device-check.ts` and `tests/unit/tiers.test.ts` | 20.2 phone | deferred |
| X-09 | Soak | hub (run kit), phone (deferred) | 30 minutes, alternating orbit and drive every 5 minutes, automatic tier; heap after forced collections at minute 5 and at the end | heap growth under 2 MB from minute 5 to the end; no long task after ready | hub: **pass** 2026-09-29 (30 minutes, WebGPU, automatic tier): heap growth 351,248 B from minute 5 to the end after forced collections (limit 2 MB), 0 long tasks after ready; phone deferred; `evidence/perf/hub-2026-09-29-session-2/results/x09-soak-webgpu.json` |
| X-10 | Governor stability on real devices | hub soak, tablet runs; the kit's U-16 and B-10 cover the synthetic part | level changes per minute over the soak; each tablet run records its level changes | at most 4 changes in any minute; at most one lock per session | tablet: at most one change (a revert to level 0) per 60 s run, no lock; hub: **pass** 2026-09-29 (soak: 0 level changes in 30 minutes, tier High at level 0 in every minute; limit 4 in any minute); phone deferred |
| X-11 | Bytes | dev PC, static | the staged pack, the bundle per chunk, and bytes on the wire before and after `onReady` (CDP Network, cache disabled) per tier; the renderer's own memory accounting per tier and backend | recorded; the public chunk within this scene's D-15 ceiling; nothing fetched after ready | **pass**; `x11-bytes.json`; g3 pass, `evidence/build/g3/` |
| X-12 | Per-frame allocation | dev PC, memory only | 1,000 frames of each workload between forced collections (`HeapProfiler.collectGarbage`, `Runtime.getHeapUsage`), after 240 frames of warm-up; tier high, WebGPU, 1920 x 1080 | growth under 2 MB | **pass**; `x12-allocation.json`; g3 pass, `evidence/build/g3/` |

## Targets (SPEC 20.2 without a pilot)

| Class | Tier expected | Golden Gate feature set | Target |
|---|---|---|---|
| Desktop, RTX 3070 (this PC) | high | High | Not timed (standing decision 1). Counts, bytes and memory only. |
| Hub GPU, GTX 1660 Ti Max-Q, 1080p | high or balanced, by measurement | High or Medium | 60 FPS or better at the tier the kit selects; WebGL2 ready within 45 s. The run records which tier that is. |
| Tablet, Mali-G68 (Galaxy Tab S9 FE) | economy | Low | 30 FPS or better with p95 under 33.3 ms in orbit and in play; no task over 100 ms after ready. |
| Phone, Adreno 7xx (Galaxy S24+) | high | Medium (`high` on a phone is Medium, SCENE-TASK) | 55 FPS or better on the 60 Hz cap; at most one governor step in a 5 minute soak; a sharper image than the lowest tier. |

The tier map (SCENE-TASK and SPEC 21.1, `data/tiers.json`, `tests/unit/tiers.test.ts`):

- minimal and economy are Low;
- balanced is Medium;
- high is High on a desktop and Medium on a phone.

On WebGL2 a phone starts on minimal (D-03).

## Workloads

Registered through the kit's workload registry, in the test and dev builds only. Public builds drop the hook (`src/camera/GoldenGateCameras.tsx`, `src/camera/workloads.ts`, `src/play/Driving.tsx`).

- **orbit**, the hero orbit. The orbit camera circles (0, 90, -100) at a 1,000 m radius and 240 m height, fov 55, one revolution per 60 s sample. `tests/unit/workloads.test.ts` checks 720 samples on the staged collision grid: more than 90 m of terrain clearance, an 80 m clear sightline to the target, and positions inside the orbit rig's limits.
- **flyover**, the guided flights in turn: postcard-sweep (30 s), tower-rise (30 s), deck-run (80 s), then fog-roll (56 s), which plays only under the Fog preset and is otherwise skipped.
- **drive**, the kit's drive workload with this scene's car. The sedan runs at full throttle along the northbound deck with lane changes and turns around at each end, followed by the chase camera.

## Local evidence (counts, bytes and memory; no timing)

Taken with `tests/tools/perf-local.ts`, headless (owner rule 11:40) on this builder's ports, 2026-09-29, files written 16:17 to 16:20. X-11 was rerun at 16:26 after the D-15 ceiling fix and at 16:48 to add renderer memory.

### X-02 counts at 15 views, frozen clock

| Tier (feature set) | Backend | Draw calls | Triangles | Geometries | Textures | Pipelines | Programs |
|---|---|---|---|---|---|---|---|
| high (High) | WebGPU | 162 to 460 | 835,327 to 1,255,365 | 108 to 119 | 50 | 47 to 48 | 31 to 33 |
| high (High) | WebGL2 | 162 to 460 | 835,327 to 1,255,365 | 108 to 119 | 50 | 15 to 16 | 30 to 32 |
| balanced (Medium) | WebGPU | 47 to 169 | 299,720 to 455,603 | 106 to 118 | 43 | 20 to 22 | 22 to 24 |
| balanced (Medium) | WebGL2 | 47 to 169 | 299,720 to 455,603 | 106 to 118 | 43 | 11 to 12 | 22 to 24 |
| economy (Low) | WebGPU | 47 to 163 | 164,232 to 226,541 | 105 to 115 | 42 | 20 to 22 | 22 to 24 |
| economy (Low) | WebGL2 | 47 to 163 | 164,232 to 226,541 | 105 to 115 | 42 | 11 to 12 | 22 to 24 |

- Draw calls and triangles are identical on both backends at every view. All 90 counts were stable.
- High includes the planar water reflection and one shadow cascade, which re-draw the scene. The busiest view is the hero orbit at 180 degrees (460 draws). The most triangles are at the sidewalk view (1.26 M).
- Low's busiest views are the span, postcard and hero orbit (152 to 163 draws, about 0.22 M triangles).

### X-03 leaks: pass

- Ten measured cycles on the kit's B-05 protocol: heap after a forced collection from 11,741,376 to 12,056,504 B, a ratio of 1.0268 (limit 1.05).
- Every receipt was disposed with 0 resources and a lost WebGPU device or WebGL2 context. After unmount the window had 0 listeners and the document 1, the same as the fresh document.
- A residual growth of about 32 KB per cycle remains, by a least-squares fit over the ten cycles. It stays well inside the rule and is recorded as a known limit.

### X-11 bytes: pass

Fix round 1 re-staged the pack as g2 and re-measured on 2026-09-29 (23:17 UTC). The g1 values are kept beside the g2 values.

| Item | g1 | g2 (current) |
|---|---|---|
| Staged pack | 104 files, 12,173,161 B, `37927dea...` | 103 files, 12,145,328 B, `19ea95fb...` |
| Download, High | 11,153,038 B | 11,123,882 B |
| Download, Medium | 9,186,665 B | 9,157,509 B |
| Download, Low | 6,766,397 B | 6,737,241 B |
| Public chunk (one chunk; three.js, R3F and the kit are bundled) | `index-q4iCWQ1V.js`, 1,633,233 B, 482,471 B gzip | `index-q3BRAQGs.js`, 1,635,531 B, 483,437 B gzip |

- D-15 as amended applies per scene. The ceiling is frozen from the first passing public build (15:57, 1,633,104 B / 482,446 B gzip) plus 10 percent, which is 1,796,415 B / 530,691 B gzip.
- `tests/tools/build.ts` records the ceiling in `evidence/build/bundle-public.json` and fails any public build that exceeds it.
- The current chunk is 2,427 B over the first build: 129 B come from the `toOrbit` control, and the rest from fix round 1 (the touch Reset view control, the Low water fade and the changed data, which is bundled into the code).
- That puts the chunk at 91.0 % of the ceiling raw and 91.1 % gzip. Headroom is 160,884 B raw and 47,254 B gzip.

| Load (cache disabled) | Requests before ready | Bytes before ready, g2 | Bytes before ready, g1 | GLB | Images | Code | After ready |
|---|---|---|---|---|---|---|---|
| public, automatic (High on this desktop) | 73 | 12,765,191 | 12,792,029 | 7,143,128 | 3,905,646 | 1,635,844 | 0 |
| test, high | 73 | 12,774,909 | 12,801,358 | 7,143,128 | 3,905,646 | 1,645,562 | 0 |
| test, balanced | 73 | 10,808,527 | 10,834,976 | 6,780,556 | 2,301,836 | 1,645,562 | 0 |
| test, economy | 73 | 8,388,246 | 8,414,695 | 5,764,236 | 897,875 | 1,645,562 | 0 |

The GLB, Images and Code columns are g2 values.

Renderer memory as three counts it (`renderer.info.memory`), at the postcard view at 1920 x 1080, g2:

| Tier (feature set) | Textures (terrain maps, environment and render targets) | Total, WebGPU | Total, WebGL2 |
|---|---|---|---|
| high (High) | 321,855,016 B | 342,305,992 B | 339,695,570 B |
| balanced (Medium) | 197,286,738 B | 215,723,816 B | 213,488,383 B |
| economy (Low) | 84,157,018 B | 97,096,663 B | 95,979,086 B |

- Textures are unchanged from g1.
- The totals are 45 KB to 69 KB higher than g1, which was taken at 16:48 (WebGPU High was 342,237,208 B).

On the tablet, at economy with a smaller canvas, textures came to 70,538,506 B and the total to 83,662,600 B.

### X-12 per-frame allocation: pass

1,000 frames per workload at tier high on WebGPU:

| Workload | Heap growth |
|---|---|
| orbit | 211,416 B |
| flyover | 51,716 B |
| drive | 272,096 B |

The limit is 2 MB.

### g3 local evidence (fix round 2)

Fix round 2 staged g3 (bridge review 3, the approach roads) and reran `tests/tools/perf-local.ts x02 x03 x11 x12 --out=evidence/build/g3` on 2026-09-30, 00:22 to 00:25, headless on this builder's ports. The files are in `evidence/build/g3/`, not `evidence/perf/`, because the hub session 2 agent owned that directory during the round. 0 unexpected messages.

| Check | g2 | g3 |
|---|---|---|
| X-02 draw calls, High / Medium / Low | 162-460 / 47-169 / 47-163 | 170-468 / 50-172 / 50-166 |
| X-02 triangles, High / Medium / Low | 0.84-1.26 M / 0.30-0.46 M / 0.16-0.23 M | 1.01-1.48 M / 0.37-0.54 M / 0.21-0.29 M |
| X-02 pipelines, WebGPU; WebGL2 (High) | 47-48; 15-16 | 56-57; 17-18 |
| X-03 heap ratio over ten cycles (limit 1.05) | 1.0268 | 1.0231 (12,393,964 to 12,680,592 B) |
| X-11 staged pack | 103 files, 12,145,328 B | 103 files, 12,430,083 B, `5664e37e...` |
| X-11 download, High / Medium / Low | 11,123,882 / 9,157,509 / 6,737,241 B | 11,398,894 / 9,432,521 / 7,012,253 B |
| X-11 public chunk (D-15 ceiling 1,796,415 / 530,691 B) | 1,635,531 / 483,437 B | `index-CpnNafWq.js` 1,677,316 / 500,671 B (93.4 % / 94.3 %) |
| X-11 bytes before ready: public; test High / Medium / Low | 12,765,191; 12,774,909 / 10,808,527 / 8,388,246 B | 13,081,988; 13,093,857 / 11,127,475 / 8,707,194 B |
| X-11 requests before ready; after ready | 73; 0 | 73; 0 |
| X-11 renderer memory total, WebGPU High / Medium / Low | 342,305,992 / 215,723,816 / 97,096,663 B | 347,429,194 / 220,679,935 / 101,148,237 B |
| X-12 heap growth over 1,000 frames: orbit / flyover / drive (limit 2 MB) | 211,416 / 51,716 / 272,096 B | 178,736 / 54,472 / 174,152 B |

- Draw calls and triangles stay identical on both backends at every view, and every count was stable.
- The approaches and the review-2 and review-3 bridge add 3 to 8 draws and 47,000 to 228,000 triangles per view. Textures are unchanged; the renderer totals are 3.7 to 5.1 MB higher.
- The bytes before ready grow by the same amount on every tier: 243,168 B of bridge GLB, 31,844 B of JSON (the approaches in `layout.json`) and the code.
- D-15 still holds and was not re-frozen.
- The g3 hub kit's README and MANIFEST copies are in the same directory.

### X-02 re-baseline on the draw-optimized build (OD-8, D-53; 2026-10-02)

The draw-optimization cycle (`docs/plans/2026-10-01-draw-optimization-cycle.md`) lowers draw calls on purpose: the bridge is merged by material at every tier, and at High the sun shadow renders once per frame from depth stand-ins and the planar reflection draws far-approach stand-ins. Golden Gate has no pilot, so its own X-02 run is the baseline, and OD-8 re-baselines it on the optimized build. Pixel parity is checked separately (S5 parity, two builds).

- **New baseline.** `tests/tools/perf-local.ts x02 --build=draw-after` on the draw-after test build (HEAD `892d103`; chunks `index-D-gELBet.js`, `route-contact-CxuZU847.js`; staged g9, `pack.json` sha256 `c2a1d83f…`), headless Chrome 1920 x 1080, frozen clock (Day, time 12), captured 2026-10-02 08:42:56 UTC. File: `scenes/evidence/draw-after/golden-gate/x02/draw-after/x02-counts.json` (ignored; it names the build).
- **Old baseline, measured the same way** on draw-base (main `c734e2a` plus the count-probe overlay; chunks `index-CdjtRS9C.js`, `route-contact-Ck7E03By.js`; the same pack) at 08:39:05 UTC: `…/x02/draw-base/x02-counts.json`.
- **Views.** 16: the eleven named views (`arrival` joined layout.json's cameras after the g3 run, which had ten), four hero-orbit points and the drive chase.

| Tier (feature set) | Backend | Draw calls | Triangles | Pipelines | Programs | Geometries |
|---|---|---|---|---|---|---|
| high (High) | WebGPU | 176 to 486 → 45 to 116 | 1,068,907 to 1,709,297 → 954,385 to 1,547,917 | 69 to 70 → 31 to 32 | 40 to 42 → 38 to 40 | 129 to 140 → 81 to 93 |
| high (High) | WebGL2 | 176 to 486 → 45 to 116 | 1,068,907 to 1,709,297 → 954,385 to 1,547,917 | 20 to 21 → 19 to 20 | 39 to 41 → 37 to 39 | 129 to 140 → 82 to 93 |
| balanced (Medium) | WebGPU | 52 to 182 → 23 to 54 | 391,612 to 631,479 (same range) | 29 to 31 → 17 to 19 | 30 to 32 | 126 to 137 → 68 to 80 |
| balanced (Medium) | WebGL2 | 52 to 182 → 23 to 54 | 391,612 to 631,479 (same range) | 15 to 16 | 30 to 32 | 126 to 137 → 68 to 79 |
| economy (Low) | WebGPU | 52 to 180 → 23 to 52 | 232,289 to 344,564 (same range) | 29 to 31 → 17 to 19 | 30 to 32 | 127 to 136 → 69 to 78 |
| economy (Low) | WebGL2 | 52 to 180 → 23 to 52 | 232,289 to 344,564 (same range) | 15 to 16 | 30 to 32 | 127 to 136 → 69 to 78 |

High, WebGPU, per view (old → new baseline; the check run's values last):

| View | Draw calls | Triangles | Check run |
|---|---|---|---|
| arrival | 432 → 103 | 1,540,569 → 1,426,047 | 103, 1,426,047 |
| postcard | 407 → 101 | 1,442,209 → 1,329,477 | 101, 1,329,477 |
| pier | 270 → 75 | 1,234,833 → 1,104,205 | 75, 1,104,205 |
| topdown | 212 → 64 | 1,349,785 → 1,235,407 | 64, 1,235,407 |
| horizon | 176 → 45 | 1,068,907 → 954,385 | 45, 954,385 |
| deck | 354 → 116 | 1,666,885 → 1,516,537 | 116, 1,516,537 |
| tower | 379 → 94 | 1,142,113 → 1,009,189 | 94, 1,009,189 |
| span | 436 → 107 | 1,531,157 → 1,416,635 | 107, 1,416,635 |
| lanes | 350 → 113 | 1,708,781 → 1,546,855 | 113, 1,546,855 |
| sidewalk | 354 → 116 | 1,709,297 → 1,547,917 | 116, 1,547,917 |
| traffic | 318 → 106 | 1,647,561 → 1,503,153 | 106, 1,503,153 |
| hero-orbit-0deg | 444 → 94 | 1,427,621 → 1,305,259 | 94, 1,305,259 |
| hero-orbit-90deg | 398 → 93 | 1,417,181 → 1,302,707 | 93, 1,302,707 |
| hero-orbit-180deg | 486 → 101 | 1,555,953 → 1,434,847 | 101, 1,434,847 |
| hero-orbit-270deg | 396 → 91 | 1,408,069 → 1,293,595 | 91, 1,293,595 |
| drive-chase | 350 → 113 | 1,683,369 → 1,523,583 | 113, 1,520,825 |

- **The old baseline fails against the new counts.** `--baseline=…/x02/draw-base/x02-counts.json` on draw-after: 0 of 32 High views within 2 percent (0 of 96 over all tiers), exit 1 (`…/x02/draw-after/x02-check.json`).
- **The new baseline passes.** A second draw-after run with `--baseline=…/x02/draw-after/x02-counts.json`: 32 of 32 High views within 2 percent (96 of 96), exit 0 (`…/x02/draw-after-check/x02-check.json`).
- **Triangles.** High falls 7.4 to 11.6 percent per view: one sun-shadow pass instead of two, and the far-approach stand-ins in the reflection. Medium and Low move by −0.06 to +1.51 percent (the pier view most): the merged meshes span whole bridge groups, so frustum culling is coarser.
- **Backends.** Draw calls and triangles match on both backends at every view except the drive chase, before and after.
- **The drive chase is workload state.** It runs 90 frames of real time before the clock freezes, so the car stops between z −274 and −293 m in these runs, and the traffic around it varies. That moves its triangles by up to 1.4 percent and its draws by 1 between runs and backends, which is within the 2 percent rule.
- **`ggStats.bridge.webMeshes` keeps its meaning.** It counts the meshes in the authored web model before any merge: 148 in both builds. It no longer equals what the bridge draws. X-02 records now carry both `webMeshes` and `bridgeDraws`, the meshes the merged views draw: web 20, far 18.

## Tablet (X-07): pass

**Device and setup.**
- The owner's Galaxy Tab S9 FE 5G: SM-X518U, Exynos 1380 with Mali-G68, Android 16, Chrome 154.0.8037.57.
- It ran over ADB (serial R52X405L12T) with `tests/tools/tablet-check.ts`, 2026-09-29, 16:39 to 16:47.
- The test build was served from this PC on an owned port through `adb reverse`, and Chrome remote debugging came through `adb forward`.
- Portrait, 823 x 1142 CSS pixels at a device pixel ratio of 1.75. The page chrome was hidden (`capture=1`), with the Day preset.
- Owner rules followed:
  - nothing was installed and no setting was changed (rotation, screen timeout and stay-awake were compared before and after);
  - the screen was woken for the runs and returned to its dozing state;
  - every tab opened here was closed, and the owner's tabs were counted but never read;
  - both port mappings were removed. `x07-summary.json` records `restored: true`.

**Preflight.** The pilot's rule from `farm-pilot/ops/tablet-observe.py`: 8 samples of 2 s, with CPU mean under 8 %, CPU max under 12 %, GPU busy at most 3 % and Thermal Status 0.
- Result: quiet on the first attempt, with CPU mean 5.1 %, CPU max 8.0 %, GPU 0 % and Thermal Status 0.
- Temperatures: AP 24.0 °C, skin 25.5 °C, battery 22.1 °C. The battery was at 64 %, charging over USB.
- Every run started at Thermal Status 0 and stayed there. Across the session the AP warmed from 24 to 36.7 °C and the skin from 25.5 to 31.7 °C.

**Tier selection.** The kit classified the tablet as a tablet with a mid GPU (WebGPU adapter `arm` / `valhall`) and selected **economy**, which is Low. The canvas drawing buffer was 822 x 1142: the economy cap is a pixel ratio of 1, against the device's 1.75. The same probe values are now a case in `tests/unit/tiers.test.ts`.

**Results.** Each run was 60 s after a 5 s warm-up, on WebGPU at the automatic tier with the governor live, as a visitor gets it.

| Run | Average FPS | Median / p95 / worst interval | CPU around render (median / p95) | Draws, triangles | Long tasks after ready | Governor |
|---|---|---|---|---|---|---|
| orbit 1 | 60.2 | 16.6 / 16.7 / 16.8 ms | 4.4 / 5.3 ms | 99, 209,723 | 0 | one revert, from level 1 to 0 |
| orbit 2 | 60.2 | 16.6 / 16.7 / 33.3 ms | 4.3 / 5.2 ms | 98, 209,705 | 0 | one revert, from level 1 to 0 |
| drive 1 | 60.2 | 16.6 / 16.7 / 16.9 ms | 3.9 / 4.7 ms | 116, 219,373 | 0 | none |
| drive 2 | 60.2 | 16.6 / 16.7 / 17.0 ms | 3.9 / 4.8 ms | 116, 219,365 | 0 | one revert, from level 1 to 0 |
| flyover 1 | 60.2 | 16.6 / 16.7 / 17.0 ms | 4.4 / 5.3 ms | 101, 210,295 | 0 | none |

- The tablet's browser rendered at 60 Hz, and the scene held that rate in every run. The 30 FPS / p95 33.3 ms target passes with a wide margin in orbit and in play, and no task over 100 ms (or any long task) occurred after ready.
- In three runs the governor had stepped to level 1 during loading and warm-up. It returned to level 0 within the sample: one change per minute, and no lock.
- Time to ready was 2.4 to 2.7 s. That includes the transfer over USB from this PC, so it is information only, not an X-04 figure.
- **Forced balanced (Medium), orbit, for information:** 23.0 FPS, median 49.8 ms, p95 50.0 ms, 68 frames over 50 ms. That run had 102 draws and 411,533 triangles, a 1028 x 1427 canvas at a pixel ratio of 1.25, and 187.6 MB of renderer textures. Medium is too heavy for this GPU, so the kit's choice of economy is the right one.
- Files: `evidence/perf/tablet-2026-09-29/`, holding `preflight.json`, one file per run (`x07-<tier>-<workload>-run<n>.json`, each with SPEC 20.3's flat record under `spec` plus the thermal and battery state before and after), and `x07-summary.json`.

## Hub session 2 (X-05, X-09 and X-10): recorded, and the soak passes

### Run

- **Session:** 2026-09-29, 20:11 to 22:35 EDT (2 h 24 min), commands 5 to 7 of the g2 kit's README: X-05 (18 groups, 20:11 to 22:04), the 30-minute soak (22:04 to 22:35) and `summary`. No repeat and no failed group. Nothing was timed on the dev PC.
- **Kit:** `dist/hub-kit` after fix round 1: 113 files, 112 listed in `MANIFEST.json`, staged pack (g2) `19ea95fb...`. `verify` reported 0 problems before and after, and the copy's SHA-256 list is identical to the one on the dev PC. Session 1 ran on the g1 kit.
- **Machine:** the owner's laptop (SSH host `hub`): mk-os, CachyOS (Linux 7.2.0-1-cachyos), KDE Plasma on Wayland, Ryzen 7 3750H, GTX 1660 Ti Max-Q (driver 610.57.04) with the Vega iGPU, Chrome 150.0.7871.128, Node v22.23.2. On AC, power profile performance.
- **Browser:** headed and fullscreen on the hub's own display (eDP-1, 1920x1080 at 120.11 Hz), NVIDIA PRIME offload, `--ozone-platform=x11 --enable-features=Vulkan --start-fullscreen`, never headless. Every run had a 1920x1080 viewport at a device pixel ratio of 1 and a 1920x1080 canvas, at every tier.
- **GPU:** WebGPU was real. All 46 WebGPU files report adapter vendor nvidia and architecture turing. WebGL2 ran on the NVIDIA GPU too: the scene's WebGL2 context reports `ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1660 Ti with Max-Q Design/PCIe/SSE2, OpenGL 4.5.0)` in all 45 WebGL2 files. The g1 runner could not read that string.
- **Load gate** (the runner's own, never bypassed): all 19 gates quiet on the first attempt, with CPU mean at most 0.83 %, CPU max at most 1.94 % and GPU at most 1 %. No group waited. The only other process above 1 % of the machine in a 5 s window was kwin_wayland, at most 4.53 % (compositing the fullscreen window).
- **Failures:** none. No page failed to load (0 of 91), there is no `results/failed/` or `results/failures/`, and the browser console record is empty in all 91 files. The g1 `renderer-init` failure did not recur.

### X-05: every tier reaches 60 FPS on both backends

Each row is the median of 5 runs of 60 s, at the tier held at level 0. The tier at the start and the end of every run is the requested one, and there were 0 governor changes in the 90 runs. High is `high`, Medium is `balanced` and Low is `economy`.

| Backend | Tier | Workload | Valid / quiet (of 5 runs) | Median / p95 interval (ms) | Average FPS | CPU in render (ms) | Draws | Triangles | Worst interval, 5 runs (ms) |
|---|---|---|---|---|---|---|---|---|---|
| webgpu | High (`high`) | orbit | 5 / 5 | 8.3 / 8.4 | 119.9 | 2.1 | 577 | 1,127,733 | 24.9 |
| webgpu | High (`high`) | flyover | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.4 | 298 | 1,092,317 | 33.3 |
| webgpu | High (`high`) | drive | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.4 | 320 | 1,228,257 | 25.0 |
| webgpu | Medium (`balanced`) | orbit | 5 / 5 | 8.3 / 8.4 | 119.9 | 2.1 | 155 | 429,237 | 16.8 |
| webgpu | Medium (`balanced`) | flyover | 5 / 5 | 8.3 / 8.4 | 119.8 | 2.0 | 113 | 428,211 | 75.0 |
| webgpu | Medium (`balanced`) | drive | 5 / 5 | 8.3 / 8.4 | 119.9 | 2.0 | 118 | 444,989 | 16.7 |
| webgpu | Low (`economy`) | orbit | 5 / 5 | 8.3 / 8.4 | 119.9 | 2.1 | 154 | 219,889 | 16.8 |
| webgpu | Low (`economy`) | flyover | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.8 | 113 | 215,259 | 50.0 |
| webgpu | Low (`economy`) | drive | 5 / 5 | 8.3 / 8.4 | 119.9 | 2.0 | 115 | 218,465 | 16.7 |
| webgl2 | High (`high`) | orbit | 5 / 5 | 8.3 / 8.4 | 119.8 | 2.5 | 577 | 1,127,937 | 16.8 |
| webgl2 | High (`high`) | flyover | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.6 | 298 | 1,092,317 | 25.0 |
| webgl2 | High (`high`) | drive | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.8 | 320 | 1,228,625 | 25.1 |
| webgl2 | Medium (`balanced`) | orbit | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.8 | 155 | 429,237 | 16.8 |
| webgl2 | Medium (`balanced`) | flyover | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.9 | 113 | 428,211 | 100.0 |
| webgl2 | Medium (`balanced`) | drive | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.8 | 118 | 444,989 | 16.8 |
| webgl2 | Low (`economy`) | orbit | 5 / 5 | 8.3 / 8.4 | 119.9 | 2.0 | 154 | 219,889 | 16.8 |
| webgl2 | Low (`economy`) | flyover | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.8 | 113 | 215,477 | 25.1 |
| webgl2 | Low (`economy`) | drive | 5 / 5 | 8.3 / 8.4 | 119.9 | 1.7 | 115 | 218,465 | 16.7 |

Which tiers reach 60 FPS (the kit's rule: median interval at most 17 ms and average rate at least 60 FPS):

| Tier | WebGPU: workloads that reach 60 FPS | WebGL2: workloads that reach 60 FPS |
|---|---|---|
| High (`high`) | 3 of 3 (orbit 119.9, flyover 119.9, drive 119.9 FPS) | 3 of 3 (orbit 119.8, flyover 119.9, drive 119.9 FPS) |
| Medium (`balanced`) | 3 of 3 (orbit 119.9, flyover 119.8, drive 119.9 FPS) | 3 of 3 (orbit 119.9, flyover 119.9, drive 119.9 FPS) |
| Low (`economy`) | 3 of 3 (orbit 119.9, flyover 119.9, drive 119.9 FPS) | 3 of 3 (orbit 119.9, flyover 119.9, drive 119.9 FPS) |

- **All three tiers reach it on both backends and on every workload:** 18 of 18 groups, with every run valid and quiet. Every group reads a median of 8.3 ms, a p95 of 8.4 ms and 119.8 to 119.9 FPS (lowest single run 119.47, highest 119.94). That is the panel's 120.11 Hz refresh: 8.3 ms is one refresh period, and each 60 s run recorded 7,169 to 7,197 frame intervals against about 7,207 refresh periods.
- **The refresh hides the headroom.** Every tier holds the refresh, so the frame rate cannot tell the tiers apart and does not show how far above 60 FPS any of them could run. The run shows that no tier is too heavy for a GTX 1660 Ti Max-Q at 1920x1080. It does not test anything weaker.
- **The tiers do differ in load.** High draws 577 / 298 / 320 (orbit / flyover / drive) with 1.09 to 1.23 million triangles. Medium draws 155 / 113 / 118 with 0.43 to 0.44 million, and Low 154 / 113 / 115 with about 0.22 million.
- **CPU time around `renderer.render` does not fall with the tier:** 1.4 to 2.5 ms at High, 1.8 to 2.1 ms at Medium and 1.7 to 2.1 ms at Low. On WebGPU flyover and drive it is higher at Medium and Low (1.8 to 2.0 ms) than at High (1.4 ms). The cause is not isolated, and GPU time is not measured.
- **Slow intervals.** The p99 is 8.4 to 8.5 ms in every run. The worst interval of a run is at most 17 ms in 68 of the 90 runs, at most 34 ms in 80, at most 51 ms in 88 and above 51 ms in 2: WebGL2 Medium flyover run 1 (100.0 ms, also the only long task in the 90 runs) and WebGPU Medium flyover run 1 (75.0 ms).
  - They concentrate in WebGPU flyover at Medium and Low, where each of the 10 runs has a worst interval of 33.4 to 75.0 ms. At High the same group has 16.7 to 33.3 ms, and WebGL2 flyover has at most 25.1 ms apart from the 100.0 ms run.
  - The runner does not time-stamp slow intervals, so where in the flight they fall is not known.

### X-09 and X-10: pass

The soak ran on WebGPU at the automatic tier with the governor live (preset Day), alternating orbit and drive every 5 minutes, orbit first. The page was ready in 4,009 ms. The kit selected High at level 0 in all 30 minute records.

| Measure | Result | Limit | Verdict |
|---|---|---|---|
| X-09 heap growth, minute 5 to the end, after forced collections | 351,248 B (0.335 MB): 16,095,400 B to 16,446,648 B | under 2 MB (2,097,152 B) | pass |
| X-09 long tasks after ready | 0 | none | pass |
| X-10 governor level changes | 0 in 30 minutes, so 0 in every minute | at most 4 in any minute | pass |
| Scene errors, hidden minutes, console entries | 0, 0, 0 | none allowed (checked by the driver) | as required |

- **Heap method:** `HeapProfiler.collectGarbage`, then `Runtime.getHeapUsage`, taken at minute 5 and at the end. The heap in use between collections swings from 22.9 to 56.9 MB (1 MB = 1,048,576 B) from minute to minute, which is information only.
- **Lock:** the soak record has no lock counter. With no level change, the tier read High at level 0 in every minute.

Frame rate per block of 5 minutes:

| Minutes | Workload | Median interval (ms) | Average FPS per minute (lowest to highest) | Minutes with p99 over 8.6 ms | Worst interval (ms) |
|---|---|---|---|---|---|
| 1 to 5 | orbit | 8.3 | 118.3 to 119.6 | 3 of 5 | 33.4 |
| 6 to 10 | drive | 8.3 | 118.3 to 119.5 | 3 of 5 | 58.4 |
| 11 to 15 | orbit | 8.3 | 117.6 to 118.4 | 5 of 5 | 25.0 |
| 16 to 20 | drive | 8.3 | 118.5 to 119.0 | 2 of 5 | 25.0 |
| 21 to 25 | orbit | 8.3 | 117.7 to 118.5 | 5 of 5 | 25.1 |
| 26 to 30 | drive | 8.3 | 118.8 to 119.3 | 1 of 5 | 25.0 |

- **Refresh held on the median:** 8.3 ms median and 8.4 ms p95 in every minute, and 117.6 to 119.6 FPS per minute (median 118.55).
- **About 1.2 % fewer frames than refresh periods.** 213,603 frame intervals were recorded against about 216,205 refresh periods (98.8 %; 98.6 % in the orbit minutes and 99.0 % in the drive minutes). The p99 is 16.5 to 16.7 ms, two refresh periods, in 19 of the 30 minutes (13 of 15 orbit minutes, 6 of 15 drive minutes). No X-05 run shows this. No rule covers it, and the cause is not isolated.
- **Worst intervals:** 58.4 ms in minute 6 (the first drive minute, right after the forced collection that takes the minute 5 heap figure), 33.4 ms in minute 1 and 33.3 ms in minute 5. Every other minute is at most 25.1 ms.

### Limits and open points

- The numbers are for the g2 kit. Fix round 2 (in progress when this was written) adds the approach roads and restages as g3, so draws, triangles and frame times can differ there. Nothing has been timed on g3.
- X-04 and X-06 were not re-measured on g2. The g2 High rows equal g1's X-06 rows in draws (577 / 298 / 320) and in the 8.3 / 8.4 ms medians, with triangles 0.02 to 0.13 % higher, so session 1's numbers still describe the same load.
- The soak ran on WebGPU only, which is the kit's command. There is no WebGL2 soak, and no phone or tablet soak.
- X-05 holds the tier, and the soak stayed at High, so no governor behaviour below High was measured.

### Files

- `evidence/perf/hub-2026-09-29-session-2/` holds `README.txt`, `results/` (the runner's output, unchanged: 90 X-05 files, `x09-soak-webgpu.json`, `summary.json`, 19 gate records), `evidence/` (48 files, with `results.sha256` and `evidence.sha256`, both verified on the dev PC after the copy: 111 of 111 and 46 of 46) and `analyze.py`.

## Runner and hub run kit

- **Runner.** `scripts/perf-core.ts` (the page-side recorder and measurements) and `scripts/perf.ts` (the command line). It uses only Node APIs and puppeteer-core, and runs under Bun or, bundled, under Node 22.
  - Commands: `verify`, `preflight`, `smoke`, `frames` (X-05), `auto` (X-06), `ready` (X-04 cold and warm), `soak` (X-09 and X-10) and `summary`.
  - Each run file carries SPEC 20.3's flat record under `spec`: `{ device, browser, backend, adapter, tier, workload, frames, medianMs, p95Ms, p99Ms, cpuRenderMedianMs, drawCalls, triangles, longTasks, governorChanges, readyMs }`. Beside it are the detail and the checks that make a run valid: the workload was running when sampling began, the camera moved, the car drove, the tier was held, there were no errors and the page was visible.
  - Every timing command first runs the pilot's hub load gate: 8 samples of 2 s, CPU mean under 5 %, CPU max under 12 %, NVIDIA GPU at most 3 %. It retries every 30 s for up to 15 minutes.
  - The Farm's `perf:farm` runner is not reused because it lives in `packages/farm/`, which this builder must not modify. It is also built around the Farm's workloads and its pilot baseline.
  - This runner keeps the same flat record and the Farm's percentile conventions, and adds the hub load gate, X-04 and the soak.
  - Diagnostics were added in fix round 1, after the g1 hub run's forced-WebGL2 load failed with `renderer-init` and left no explanation. Every page records its browser console from creation: console messages, uncaught page errors and failed requests, each with its time since the page opened.
    - Limits: 400 entries of up to 2,000 characters each; any excess is counted as `dropped`.
    - Every result file stores this log as `console`.
    - `environment.webgl` records the WebGL2 version, the vendor, the renderer and the unmasked renderer string. It reads them from the scene's own context when the scene runs WebGL2, and otherwise from a 1 x 1 probe context that is released at once.
    - A run that throws writes `results/failures/<run>-<time>.json`: the error, the console and the environment. The test build also keeps the underlying cause of a scene error (for example the renderer's exception), and the runner's error message carries it.
    - `summary` reads only the `x0*` files at the top of `results/`. The gates and the workloads are unchanged.
    - This was checked on the dev PC without timing:
      - The recorder captured a console warning, a page error and a failed request.
      - The renderer string was read on both backends: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 ... Direct3D11 ...)`, from the scene context under WebGL2 and from the probe under WebGPU.
      - The bundled runner was run with `--chrome-arg=--disable-webgl` and forced WebGL2, so it failed at renderer start before any sampling. It wrote a failure record whose error names the cause (`TypeError: Cannot read properties of null (reading 'getSupportedExtensions')`), with `webgl: { source: 'probe', error: 'no WebGL2 context' }` and the aborted pack request in the console.
- **Smoke** (SPEC 20.3). Two plumbing checks, headless on the dev PC: the Bun runner (`evidence/perf/smoke.json`) and the bundled runner under Node 22.23.2 (`smoke-node.json`). Both passed 5 of 5 checks: frames on each workload, the automatic tier with the governor live, and readiness on forced WebGL2. Their numbers were discarded unread and are never cited. The smoke was not re-run for fix round 1, because it samples frames and this PC takes no timing.
- **Hub run kit.** `dist/hub-kit`, assembled by `tests/tools/make-hub-kit.ts`. It holds:
  - the test build with the staged g3 pack (fix round 2, rebuilt 2026-09-30 00:32; the g1 and g2 hub runs used the g1 and g2 kits);
  - `runner/perf-gg.mjs`;
  - `README.txt` with the exact commands, Chrome flags, expected files, copy-back path and pass rules;
  - `MANIFEST.json` with the size and SHA-256 of every file (113 files, 15,814,346 B).

  `node runner/perf-gg.mjs verify` checks the kit against its manifest: 113 files, 0 problems at 00:32. The g3 kit's README and manifest copies are in `evidence/build/g3/hub-kit-README.txt` and `hub-kit-MANIFEST.json` (`--copies=evidence/build/g3`). The copies in `evidence/perf/` are still the g2 kit's.
- **The run (done).** Hub session 1 (2026-09-29, 17:34 to 18:04, on the g1 kit) ran commands 0 to 4. Hub session 2 (20:11 to 22:35, on the g2 kit) ran commands 5 to 7, which took 2 h 24 min against the 2 h 40 min planned. Both copied `results/` unchanged to `evidence/perf/hub-2026-09-29/` and `hub-2026-09-29-session-2/`. A run on a later kit (g3) is the coordinator's call.

Reproduce the local parts from the scenes root:

```
./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/build.ts public test
./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/perf-local.ts [x02] [x03] [x11] [x12] [--out=<dir>] [--build=<label>] [--baseline=<x02-counts.json>]
./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/make-hub-kit.ts [--copies=<dir>]
./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/tablet-check.ts [--seconds 60]
```

`--out=<dir>` and `--copies=<dir>` default to `evidence/perf`. `--build=<label>` measures a labelled build from `scripts/build-scene.ts` (`dist/<label>/test`), and `--baseline=<file>` checks X-02 against an earlier `x02-counts.json` (2 percent per view; the verdict is High's). Each is one token: `toolchain-run.ps1` is an advanced PowerShell script, so a separate `--out` is read as its ambiguous `-OutVariable`/`-OutBuffer`.

## Deferred, with reasons

- **X-01:** not applicable, because Golden Gate has no pilot.
- **X-08, the phone parts of X-09 and X-10, and a tablet soak:** no phone is connected to this builder, and the tablet session was kept to six 60 s runs so that it stayed cool. The Galaxy S24+ tier path is checked by emulation only: `high` gives the Medium feature set in portrait and landscape, and WebGL2 gives minimal, which is Low. Kit request GG-008 records the risk that an Exynos S24+ classifies differently from the Snapdragon model.
- **The RTX 3070 desktop:** no timing (standing decision 1 and owner rule 11:35).
