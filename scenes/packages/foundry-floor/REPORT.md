# Foundry Floor FF1: report

Builder: Claude Code subagent (Opus 5.5) of the coordinator, 2026-09-29, one session.
Task: `scenes/TASK-FF1.md` under `scenes/TASK.md` and `scenes/DECISIONS.md`.
Package: `scenes/packages/foundry-floor` (`@kiln-scenes/foundry-floor`, private). Nothing is committed.
All timings were taken on this shared PC and are indicative only. Each evidence file carries its load sample.

(Saved by the coordinator from the builder's final message: the harness refused the builder's own write of this file.)

## Summary

- **The twin runs the same under Bun and in Chrome.** It is seeded and runs in integer milliseconds. `src/sim/` has no three, React, kit or DOM imports and does not use `Math.random` or `Date.now`.
  - Seed 1 gives 720 hourly hashes, identical headless and at 30, 60 and 144 fps. Day-30 hash: `faf0cd2a`.
  - In Chrome, WebGPU and WebGL2 both reproduce the Bun twin: megafab `dcced2f6` at day 30 and `e97fe9a6` one hour later.
- **Pilot line and megafab both work.** Megafab adds 15 synthetic vehicles on the spine loop.
- **The proxy scene renders on both backends** with the HUD, the controls, two cameras and About. Neither backend logged an unexpected console message.
- **Model sanity fails 3 of 4 criteria.** Lots out (122) is in the band. Cycle time (6.87 d), WIP (27.6) and moves per hour (40.1) are below it.
  - I tried two retunes and recorded both. Neither was adopted.
  - The owner decides the gap.
- **Warm-up is over budget.** A 30-day warm-up takes about 4.5 s against a 1 s budget. The scene therefore restores a stored snapshot for each seed, which takes about 1 ms.

## What FF1 delivers, item by item

### 1. Package

The package follows Golden Gate's layout:

- `data/`;
- `src/sim/` (the twin);
- `src/scene/`, plus `src/definition.ts`, `src/FoundryFloorScene.tsx` and `src/index.ts`;
- `standalone/`, the page and harness adapted from Golden Gate;
- `scripts/`: generators, sim runs, evidence and `stage.ts`;
- `tests/unit/`, 7 files;
- `tests/tools/`: `owned.ts`, `build.ts` and `capture.ts`;
- `PROGRESS.md` and `evidence/`.

`bun.lock` gained 22 lines, all for this workspace. `dist/`, `staged/` and `.tmp/` are gitignored.

### 2. Data (D-21)

Scripts generate or check every file, and every file carries basis labels.

| File | Contents |
|---|---|
| `data/layout.json` (from `scripts/build-layout.ts`) | 10 bays, the spine, rails, 42 tools (38 process tools and 4 tracks), 4 litho cells, 2 stockers, 32 UTS shelves, the litho zone, the gallery, the section cut, heights, cameras |
| `data/rail-graph.json` (from `scripts/build-rail-graph.ts`, using the rail-kit piece dimensions) | 314 nodes (175 ports, 16 throats, 123 joins), 322 edges, 132 pieces, 465.39 m |
| `data/route.json` | 240 steps, 137.1 h of raw process time |
| `data/tools.json` | Groups, process times, furnace batch rule, MTBF, MTTR and PM |
| `data/sim-config.json` | CONWIP cap 95; releases at 00:00, 06:00, 12:00 and 18:00; modes; scales; vehicles; dispatch; seeds; the knobs `tuning.nonScheduled` and `tuning.mttrScale` |
| `data/assets.json` | The asset map and the palette |
| `data/about.json` | About this model |

`scripts/build-tables.ts` generates `src/sim/tables.ts`. A test fails when any generated file is out of date.

### 3. The twin (`src/sim/`)

- **Clock and randomness.** An integer-ms clock, a `(t, seq)` event queue, and named seeded streams through fixed inverse-CDF tables.
- **Entities.** Lots and FOUPs; vehicles with block reservations on the rail graph; stockers with cranes; UTS seats; load ports; tools with E10 states.
- **Process model.**
  - CONWIP releases.
  - Furnace batching: 4 lots, or 2 to 3 once the oldest has waited 2 h.
  - The move rule: the next tool's free port, else an upstream UTS seat, else the nearer stocker.
  - Three dispatch rules: `leastWork`, `fifo` and `criticalRatio`.
- **Time.** The scale ladder Pause, 1x, 10x, 60x and 600x, with the 250 ms wall-delta cap and the clip rules for each scale (`src/sim/clock.ts`).
- **State.** The hourly FNV-1a hash, snapshot and restore, and the stored warm start `data/warm/seed-1.json` (103,065 B).
- **API.** The typed agent API is `createFab` / `Fab` in `src/sim/index.ts`.
- **Stub.** Technicians are a stub.

**Megafab** (`setMode('megafab')`) places synthetic vehicles evenly on the 144.5 m spine loop. Evidence: `evidence/sim/megafab.json`.

- 20 are configured, but only 15 fit at the configured vehicle length and gap.
- A 24 h run had 21 vehicles and 776,619 events.
- 0 of 360 route samples left the loop, and there were 0 emergency stops.
- The twin costs 0.136 ms per 60 fps frame at 600x.

### 4. Tests

See "Acceptance tests run" below.

### 5. Proxy scene (`src/scene/`)

**The world** (`proxy-world.ts`).

- **Static geometry.** One instanced mesh of 980 boxes, built from the layout and the rail graph:
  - tools tinted by family, each with a family stripe;
  - load ports and UTS plates;
  - rails, with arcs split into segments of 0.3 m or less;
  - enclosed stockers;
  - the floor, the walls, the litho partitions, and the gallery glazing and handrail.
- **Ceiling.** Four downward-facing planes, amber over litho.
- **Posed from the twin every frame:**
  - vehicles, drawn to the envelope of sim-spec test 3: a drive block plus side covers, orange for pilot and slate for synthetic;
  - emissive pulses for moving vehicles from 60x;
  - hoist belts;
  - FOUPs, placed by `foup-poses.ts` from twin state only. Lots in stocker slots and furnaces are hidden;
  - an E10 lamp per tool.

**The frame system** (`World.tsx`).

- Restores the warm start in megafab mode at 1x.
- Steps the twin to the presentation clock with its own wall delta, capped at 250 ms.
- Applies HUD requests and publishes the HUD at 4 Hz.
- Test hooks: `ffState`, `ffSetScale`, `ffSetMode`, `ffSetView`, `ffAdvance`.

**The HUD** (`Hud.tsx`, `hud-text.ts`).

- A mode, scale and sim-time line, with the synthetic label in megafab mode.
- WIP, lots out today, moves per hour, vehicles busy, and tool counts by E10 state.
- Segmented controls for time scale, mode and view, plus About this model and Credits.
- Below 900 px the status panel moves to the bottom.

**Cameras.** The kit `OrbitRig`:

- landing: (0, 1.6, 24.4) looking at (0, 3, 10.2), fov 55;
- overview: (0, 64, 58) looking at the origin, fov 40.

**The pack.** `scripts/stage.ts` stages release `ff1-proxy-1` into `staged/ff1`: pack data `warm-seed-1` plus the 7 data files.

### 6. Evidence

| Path | Contents |
|---|---|
| `evidence/sim/hashes.json` | Hourly hashes for seed 1 |
| `evidence/sim/sanity.json` | The model-sanity run |
| `evidence/sim/retunes.json` | The spec configuration and the two retunes |
| `evidence/sim/warmup.json` | Warm-up timings and the decision |
| `evidence/sim/megafab.json` | The 24 h megafab run |
| `evidence/build/ff1/bundle-public.json` | Public build sizes |
| `evidence/build/ff1/bundle-test.json` | Test build sizes |
| `evidence/build/ff1/ceiling.json` | The proposed D-15 ceiling |
| `evidence/captures/ff1/captures.json` | Every capture record |
| `evidence/captures/ff1/webgpu/` | `landing.png`, `landing-600x.png`, `overview-600x.png`, `about.png`, `phone-landing.png`, `landing-repeat.png`, `public-landing.png` |
| `evidence/captures/ff1/webgl2/` | `landing.png`, `landing-600x.png`, `overview-600x.png`, `public-landing.png` |

## Acceptance tests run

**Gates**, from the scenes root with `./scripts/toolchain-run.ps1`:

- `run typecheck`: clean.
- `run lint`: ok, 0 findings. Foundry Floor is an advisory package and has 0 findings. The single advisory finding is in golden-gate's `src/play/car.ts:77`.
- `test packages/foundry-floor`: 41 pass, 0 fail, 876,406 expect calls, 28.6 s.
  - 38 are ordinary tests.
  - 3 are the sanity band's known failures, marked `test.failing`.
- Root `bun test`: 313 pass, 1 skip, 0 fail, across 54 files, in 119.6 s.

| Sim-spec 12 test | Result | Where |
|---|---|---|
| 1 Seats under rails | Pass. Every seat is within 5 mm (X, Z) of its port node, at Y 0.90 or 3.20. Ports are on the right of travel. UTS seats hang under the rail. | `tests/unit/data.test.ts` |
| 2 Rail graph | Pass. Strongly connected; joints within 1 mm; tangents within 1°; lengths match geometry and totals. | `tests/unit/data.test.ts` |
| 3 Clearances | Not run: needs the GLBs | FF2 |
| 4 Handoff | Not run: needs the GLBs | FF2 |
| 5 Determinism | Pass (see below). Firefox and WebKit were not run. | `tests/unit/determinism.test.ts`, `evidence/sim/hashes.json`, `evidence/captures/ff1/captures.json` |
| 6 Model sanity | **Fail, 3 of 4 criteria** | `tests/unit/sanity.test.ts`, `evidence/sim/sanity.json`, `evidence/sim/retunes.json` |
| 7 Performance | Partial: first render only (indicative). Frame times need devices. | `captures.json` |
| 8 Honesty | Pass (see below) | `tests/unit/honesty.test.ts`; About: `captures.json` `controls` |
| 9 Tour framing | Not run | FF2 |

**Test 5.** The 720 headless hashes equal the recorded list. Runs at 30, 60 and 144 fps at 600x give the same hashes. The stored snapshot is byte-identical to a fresh warm-up. Chrome WebGPU and WebGL2 reproduce the Bun twin.

**Test 8.** No excluded name appears in the data, `src`, `standalone`, `scripts`, `staged` or `dist`. The About fields are present. The HUD line always names the mode and scale, and megafab adds the synthetic label. About is one tap away.

**Other checks, all passing:**

- **Scale rules** (`tests/unit/scale.test.ts`):
  - the ladder, the 250 ms cap and pause;
  - one-shot clips at each scale;
  - loops at 2x wall speed above 1x;
  - pulses from 60x;
  - irregular frames with scale changes reproduce the headless hashes.
- **Twin behaviour** (`tests/unit/twin.test.ts`):
  - the CONWIP cap and release times;
  - furnace batching;
  - the move rule and least-work choice;
  - snapshot and restore;
  - different seeds give different fabs;
  - `injectDown`;
  - the three dispatch rules;
  - the megafab loop, its 40-vehicle limit and the switch back to pilot.
- **FOUP poses** (`tests/unit/foup-poses.test.ts`):
  - over 6 h sampled every 7 s, each visible lot is drawn exactly once and hidden lots are not drawn;
  - there is one synthetic FOUP per synthetic vehicle.

**Browser checks** (`captures.json`), headless Chrome with `--window-size=1280,720`:

- Neither backend fell back, and there were 0 unexpected console messages.
- The landing shot reproduces byte-identically.
- The real HUD buttons work:
  - About opens with all five sections plus the basis labels;
  - Pilot line leaves 6 vehicles and 0 synthetic;
  - Overview puts the camera at (0, 64, 58);
  - 600x advanced 124,860 ms of sim time;
  - Pause advanced 0.
- Phone, 390 × 844 with touch: the toolbar is at the top (366 × 200), the status panel at the bottom (340 × 177), and there is no horizontal overflow.
- The public build renders on both backends.

## Model sanity and the retunes (`evidence/sim/retunes.json`)

The pilot line was measured over days 30 to 60 with seed 1.

| Config | CT (d) | X | WIP mean (min–max) | Out | Moves/h | Busy of 6 | Adopted |
|---|---|---|---|---|---|---|---|
| Spec as written | 6.87 | 1.20 | 27.6 (25–30) | 122 | 40.1 | 0.97 | yes |
| Retune 1: 11 tools NON_SCHEDULED | 8.96 | 1.57 | 35.9 (33–39) | 122 | 42.6 | 1.01 | no |
| Retune 2: retune 1 plus every MTTR doubled | 11.68 | 2.04 | 46.7 (42–51) | 116 | 45.9 | 1.05 | no |
| Band | 14–23 | — | 57–91 | 110–130 | 45–75 | — | |

The spec run had 0 emergency stops and 0 releases skipped.

**Retune 1** holds these tools NON_SCHEDULED:

- etch 6 → 4, CVD/ALD 6 → 4, PVD 3 → 2, CMP 4 → 3;
- metrology 4 → 3, probe 4 → 3;
- implant 2 → 1, DUV cells 2 → 1, furnace 3 → 2.

This takes DUV and implant below the report's floor of 2, and etch and CVD/ALD below their tools-needed count. It still misses the band.

**Retune 2** changes repair times, which are not one of the spec's named knobs, so it is recorded as a sensitivity result only.

**Dispatch was not retuned.** The three rules only reorder a tool's queue, and in a work-conserving line that leaves mean cycle time and WIP almost unchanged.

**Finding.** At the spec's starts, tool counts and reliability, the twin runs at an x-factor near 1.2. The busiest families reach only about 57 to 70 percent calendar utilisation. The report's x-factor of 2.5 to 4.0 is an assumed value (E), not an output of its capacity model. The owner decides.

## Warm-up (`evidence/sim/warmup.json`)

- Two 30-day warm-ups took 4,676 ms and 4,481 ms: 2,897,599 events, 96,587 per day.
- Load: CPU 19.9% before and 14.9% after; GPU 3D 17% and 18%.
- The budget is 1,000 ms, so the scene ships a stored snapshot for each seed: `data/warm/seed-1.json`, 103,065 B (23,986 B gzip), pack data `warm-seed-1`. It restores in about 1 ms.
- To regenerate it after engine changes, run `scripts/sim-evidence.ts --write-snapshot`. The determinism test fails if the snapshot is stale.

## Proxy build sizes (`evidence/build/ff1/`)

| Build | JS (one chunk) | gzip | Output |
|---|---|---|---|
| Public, `dist/standalone` | 1,591,731 B | 446,215 B | 2,076,179 B in 15 files; HTML 1,905 B; 19 licence records |
| Test, `dist/test` | 1,598,315 B | 449,106 B | 2,082,933 B |

- **Pack:** `staged/ff1` holds 10 files, 446,139 B.
- **Fetched at startup:** `pack.json` (1,589 B) plus the warm start (103,065 B).
- **Bundled data:** the 7 data JSON files are also bundled, 340,811 B raw, of which the rail graph is 197,177 B.
- **Proposed D-15 ceiling** (`ceiling.json`): the first public build (1,591,477 B / 446,118 B gzip) plus 10%, which gives **1,750,625 B / 490,730 B gzip**. `tests/tools/build.ts` enforces it.

## Programs and first render (indicative; `evidence/captures/ff1/captures.json`)

- Setup: headless Chrome, `--window-size=1280,720`, `tier=high`, served from owned ports starting at 4700.
- GPU: NVIDIA RTX 3070. WebGL2 ran through ANGLE D3D11.
- Load: 21:23:37, CPU 6.9% and GPU 3D 9%; 21:23:48, CPU 20.7% and GPU 3D 6%.

| Backend | Programs | Pipelines | Draws (landing / 600x) | Triangles | First render, test build | Kit ready | First render, public build |
|---|---|---|---|---|---|---|---|
| WebGPU | 12 | 8 | 9 / 10 | about 12.9k | 1,013 ms | 442 ms | 395 ms |
| WebGL2 | 12 | 8 | 9 / 10 | about 12.9k | 641 ms | 493 ms | 297 ms |

- First render is measured from navigation start to the first frame after the scene is built, polled every animation frame.
- The public runs came later in the same browser session.
- Earlier runs this session gave WebGPU 798 to 1,013 ms and WebGL2 569 to 641 ms.

## Kit requests

- **FF-001** is in `scenes/KIT-REQUESTS.md`: ports 4700 to 4749, the same need as GG-001. The kit's `serveOwned`, `assertOwnedUrl` and `runSceneContractTests` are fixed to 4400–4499.
- `tests/tools/owned.ts` binds 4700 to 4749 through the kit's `startStaticServer`. It tries each port directly and moves on at EADDRINUSE, so it never probes a listener.
- FF1 made **no kit change**.

## Left for FF2 and the coordinator

1. **Model sanity:** the owner decides the band gap.
2. **Megafab:** 15 of the 20 configured synthetic vehicles fit on the spine loop. Lengthen the loop, shorten the gap, or configure 15.
3. **Ceiling:** freeze the D-15 ceiling.
4. **Tests not run:** sim-spec tests 3, 4, 7 (device frame times) and 9. Firefox and WebKit determinism.
5. **Contract suite:** the kit's browser contract suite (B-checks) has not run for this scene. It waits on FF-001 or GG-001.
6. **FF2 scope:**
   - wire the accepted GLBs and clips through `data/assets.json`;
   - free walk (D-22);
   - tour, tool panels and follow-a-wafer;
   - technicians are still a stub.
7. **About wording:** "What you are watching" says every "FOUP, vehicle, lamp and robot motion" follows from state. FF1 draws no robots. Keep the wording for FF2 or trim it for an FF1 release.

## Processes

- The static servers and headless Chrome close in `finally` blocks, and Chrome's profile is removed on close.
- At the end of the session no listener was open on 4700 to 4749 and no capture Chrome was running.
- I removed one leftover Chrome URL-fetcher temp file under the package `.tmp`.
- No listener outside 4700 to 4749 was touched. The browser pane and the hub were not used.

# Foundry Floor FF2: report

Builder: Claude Code subagent (Opus 5.5) of the coordinator, 2026-09-29 21:48 to 2026-09-30 about 04:05, one session.
Task: `scenes/TASK-FF2.md` under `scenes/TASK.md` and `scenes/DECISIONS.md`, started from `833f6da` on `work/scenes-v1`; HEAD is now the coordinator's `556de9c`. Nothing is committed.
The owner's decision of 2026-09-29 22:05 replaces TASK-FF2 item 6's sanity rule. DECISIONS D-35 (pack licence) and D-36 (no timing on this PC) arrived during the session and are applied.
Times and working notes are in `PROGRESS.md` (FF2 section). Per D-36, no number here is a timing result. The few wall times the tools record stay in the evidence files, labelled indicative, with load samples.

## Summary

- **All 31 accepted assets are wired through `data/assets.json` (D-21).** 29 are placed and drawn from their GLBs, which the page fetches from the pack with size and hash checked. Two are staged but unplaced: the subfab pump and abatement kit fits no kit zone of the final section module, and the humanoid work robot is FF3's.
- **Free walk, the tour, tool panels and follow-a-wafer** run in the page on WebGPU, on WebGL2 and in the phone layout. Every panel and HUD line is derived from the twin's state. Captures: `evidence/captures/ff2/`.
- **Sim-spec tests.** Tests 1, 2, 4, 5, 8 and 9 pass. Test 3 passes, with two asset and spec shortfalls recorded. Test 6 fails 3 of 4 criteria at the owner's release rate, and the gap is structural (below). Test 7 was not run: it needs the devices (D-36).
- **The kit port range (GG-001 / FF-001)** is in `testing/node.ts` with tests. The kit's contract suite passes every check for Foundry Floor on ports 4700 to 4703.
- **The public JS chunk is 1,586,280 B, 473,835 B gzip**, under the frozen ceiling of 1,750,625 B and 490,730 B gzip.
- **Gates:** typecheck clean, lint 0 findings, package tests 87 of 87, kit tests 148 of 148, root `bun test` 411 pass, 1 skip, 0 fail.
- **One rule breach:** a `bun x eslint` download at 00:18, cleaned up at 00:23 (see "Rule breach").

## What FF2 delivers, item by item

### 1. Real assets through `data/assets.json` (D-21)

**Intake.** Every accepted GLB's bytes and SHA-256 were verified before use. The first 24 were checked against their author reports, Kiln build receipts and coordinator reviews, and the seven later deliveries against the coordinator's messages. All matched. The GLBs were read in place and never edited.

**The asset map.** `scripts/inspect-assets.ts` writes `data/assets.json` (`foundry-floor.asset-map/2`, 212,191 B) from the pinned GLBs and from scene rules taken from the reviews. `--check` fails on drift, and `scripts/glb.ts` is a pure GLB reader. Each entry holds:

- the source (author, file, revision, review) and pins (bytes, SHA-256);
- measured nodes, bounds, locators and clips, with durations read from the GLB;
- the LOD class, play rules, hide rules and instance slots per mode.

The map is pack data: the bundle does not import it.

| Entity | Asset | Revision | Instance slots (pilot / megafab / phone) |
|---|---|---|---|
| foup | foup | r_2bab2591207a4eeb922f05cc2d52eaa7 | 75 / 256 / 120 |
| vehicle | oht-vehicle | r_bbf8c93343da4b7b96762d731872f67f | 6 / 40 / 16 |
| loadPort | load-port | r_ad0d81fde77d4fe08fbdcdd9911c4160 | 103 |
| stocker | stocker | r_5098431bec1849eda5e160b664ab76f8 | 2 |
| signalTower | signal-tower | r_0af702f0a7364dffbac3255c04a909ff | 44 |
| uts | under-track-storage | r_7dabe4c644824eb4bdb014a45c276a56 | 32 |
| railStraight | oht-rail-straight | r_3a30a0b877a345f8bd562a372302f666 | 96 |
| railCurve | oht-rail-curve | r_cc370801a4df4604b629c26ff1d9264a | 20 |
| railSwitch | oht-rail-switch | r_678517d2e36e4879b448f85f5f175266 | 16 |
| floorModule | raised-floor-module | r_ca8f4b96cad641129e0f5c078f4465e5 | 280 |
| ceilingModule | ffu-ceiling-module | r_d73b60677ff2417ea9a0d1add4114f10 | 280 |
| wallKit | cleanroom-wall-kit | r_4e0249fdfb804779a0adb8c6cae9d2dd | 75 |
| tool:etch | etch-cluster-tool | r_c548f01cc98b4fb0adbee9b763ec1831 | 6 |
| tool:cvd-ald | cvd-ald-cluster-tool | r_bcc14a9dbb4e41a997023b3712b05779 | 6 |
| tool:pvd | pvd-cluster-tool | r_5da63ee0e94648c7b2981a0021e3e616 | 3 |
| tool:clean | single-wafer-clean-tool | r_ef576d03ece64a33a331429020148625 | 2 |
| tool:cmp | cmp-polisher | r_bd4199a5d1c14b96935be86fc3316adb | 4 |
| tool:furnace | vertical-furnace | r_11d06703f7c34eb2aeca0b7298a5784c | 3 |
| tool:implanter | ion-implanter | r_f053ff760e7c46018c274ec2a12ee18b | 2 |
| tool:metrology | metrology-inspection-tool | r_4ee6df55b165456abe7f9002bfd7b0d1 | 4 |
| tool:prober | wafer-prober-tester | r_853a936fe0dd48d299ae55585d9d276a | 4 |
| tool:track | coater-developer-track | r_2bdd2517bf744bc580b1af4314fcef3a | 4 |
| tool:euv-scanner | euv-scanner | r_f4a48de7bac1455da5a1f76be6702e4c | 2 |
| tool:duv-scanner | duv-immersion-scanner | r_60b7dd62114248d8b39445eb7a485c0b | 2 |
| subfabKit | subfab-pump-abatement-kit | r_d0ff94d7e74c487b9b822f61a1ccd171 | 0: unplaced, zone conflict |
| gallerySegment | visitor-gallery-segment | r_cf68f8f819f34684ac183610c45596cc | 10 |
| technician | cleanroom-technician | r_e1d7c6935493484d9586bcf0c21604de | 12 / 12 / 6 |
| humanoidWorkRobot | humanoid-work-robot | r_9f717d17eec74f2dbd4c338612207ed5 | 0: data only, for FF3 |
| amrFloorRobot | amr-floor-robot | r_4141b13a77bb45dd830fa66d35f799e7 | 4 |
| toolFrontRobotArm | tool-front-robot-arm | r_309f3e9884384c3e9090f2b0b76dc333 | 4 |
| sectionModule | level-section-module | r_3b3d090fa0494380bdcaafaf6f3a22f2 | 7 |

A single number is the same in every mode.

**Layout from the measured extents** (`scripts/build-layout.ts`, layout /2):

- Tools stand at X from their measured `lp` locators, so their load ports sit under the rail port nodes. Test 1 holds with the real load ports.
- Rows are packed by measured extents and clip sweeps, with keep-outs in world coordinates. Metrology tools alternate `column` and `opticalHead` per instance.
- Litho cells moved west by the measured service-door reach. The spec X values are kept as `specX`.
- Other placements:
  - wall-kit panels, with a people door on the west wall;
  - ten gallery segments, lowered 0.05 m so the walking surface is flush with the floor;
  - the viewing landing;
  - seven section modules along the east cut;
  - four robot stations, each an arm plus an AMR, with 0 m hand-off error against the stated poses;
  - technician service points and walk paths.
- The rail graph has 314 nodes, 322 edges and 175 ports, 465.39 m in all.

**The world** (`src/scene/world/glb-world.ts`, `src/scene/glb/`). Each model is baked once (anchors, forms, merged groups) and drawn as instanced groups. Moving parts are posed from twin state only, with one-shots and loops under the scale rules:

- **tools:** productive loops while the tool or its litho cell is productive. Service lids, doors and the prober head open while the tool is down and close from the clip log. The CMP carousel indexes at lot start, and the furnace boat loads and unloads with the batch.
- **load ports:** Dock, DoorOpen, DoorClose and Undock, from the port state, with the FOUP riding the stage.
- **FOUPs:** tinted by lot class, with the door removed and wafers shown while the port is open.
- **vehicles:** the hoist and belts follow the inverted HoistDown table at the twin's hoist extension, and the fingers follow the hand-off phase. Synthetic traffic is drawn in slate.
- **stockers:** crane mast and carriage at the twin's crane position; the CraneCycle clip is for review only.
- **signal towers:** the E10 state on `signalTowerMount`. A litho cell's track and scanner show the cell's state.
- **pump-kit fans** loop, although no kit is placed in FF2.
- **technicians:** they walk the stub provider's service visits at 1.2 m/s, with Walk played at speed / 1.2, and the fab's people door opens as they pass.

`lod1` shows far and the detailed parts near, by a distance rule per class. A tool draws detailed while a down clip is off its rest pose (the review's clearance rule).

Two structural fixes:

1. **Shader programs.** Three 0.186 builds a program per small `InstancedMesh`. That gave 114 to 151 programs, against the sim-spec budget of 32. The shared GLB materials now read the instance matrix from four instanced attributes, and the result is 12 programs and 6 pipelines on both backends.
2. **Pack data.** The twin's layout, rail graph, route and tools are pack data fetched at startup, as are the asset map and the warm start. Only `sim-config.json` and `about.json` stay bundled. This moved about 30 KB gzip out of the bundle.

### 2. Sim-spec tests 3, 4 and 9 on the real geometry

- **Test 3, clearances** (`tests/unit/clearance.test.ts`, `evidence/sim-spec/ff2/clearance.json`). The threshold is 0.10 m. The table gives the least clearance of each envelope.

  | Envelope | Least clearance | Where |
  |---|---|---|
  | Vehicle, every edge every 25 mm (19,050 samples) | 0.108 m | uts-n12 |
  | Hoist at load ports | 0.129 m | |
  | Hoist at stockers | 0.434 m | |
  | Hoist at UTS | 0.259 m | |
  | Stocker faces | 0.600 m | all 8 ports |
  | The 0.62 m walker on the aisle paths | 0.100 m | the AMRs in S4 and S5 |
  | The 0.62 m walker on the spine | 0.494 m | |

  Two shortfalls are recorded as asset and spec facts, not layout faults:

  - **Neighbouring load port, 0.069 m, at 99 ports.** A descending FOUP passes this close to the next load port on the same tool. The `lp` locators stand 0.505 m apart and the load port is 0.50 m wide.
  - **Serving arm at home, 0.054 m, at 4 ports.** This follows from the author's `seatRef`.

  Two layout decisions came from this test:

  - **Section module 4 draws without its return-air shaft** (`withoutShaft`, chosen by a rule in `build-layout.ts`). The spine's east U-turn swept a vehicle through that shaft at 0.000 m. Moving the U-turn clear would need more than the east half's 0.8 m of slack.
  - **The UTS rows beside the N1 diverge and N4 merge throats keep 0.3 m clear of the throat.** Before that they measured 0.074 m.
- **Test 4, hand-off** (`tests/unit/handoff.test.ts`, `evidence/sim-spec/ff2/handoff.json`). The error is 0 mm in each of these checks:
  - the vehicle GLB lowers the FOUP onto the seat at all 175 ports;
  - 1,484 twin hand-offs over 12 h, checked at the exact end of HoistDown;
  - the load port's Dock, DoorOpen, DoorClose and Undock sequence (101 samples per phase) shows 0 crossings of the FOUP or either door through the frame. A control, pushed 1.5 mm past docked, is caught.
- **Test 9, tour framing** (`tests/unit/tour.test.ts`, `evidence/sim-spec/ff2/tour.json`):
  - every stop's anchor lies inside 90 percent of the picture at 16:9 and at 9:19.5, and on its subject;
  - fly legs and stops clear static geometry by at least 0.388 m, against a 0.2 m rule;
  - motion is at most 0.109 m and 2.1 degrees per 60 fps frame;
  - reduced motion cuts every leg.

  Occlusion is recorded, not failed. The landing stop looks through the wall-s-11 glazing, and one UTS shelf stands in front of the spine anchor.

### 3. Free walk (D-22)

`src/scene/walk.ts`, tested by `tests/unit/walk.test.ts` (9 tests).

- **Movement.** The eye is at 1.6 m. The pace is 1.4 m/s, or 2.8 m/s running. Input comes through the kit: the keyboard (WASD or the arrows, Shift to run) and the kit `VirtualJoystick` on touch. Drag looks around, and the wheel or a pinch zooms.
- **Collision.** A 0.3 m circle meets the plan boxes of tools, load ports, stockers, walls and posts, floor robots, gallery benches and kiosks, and the drawn section shafts. It also meets the layout's walk edges: the gallery handrail, the rail along the cut and the landing rails. The walker slides along whatever it meets and stays inside the walk areas.
- **Spaces.** The fab floor and the gallery with its landing are separate spaces behind the glazing. The walk starts where the view is: from the landing view it starts in the gallery. The section cut reads from the viewing landing (frame `walk-landing-section`).
- **The kit's play mode.** Enter on the focused scene starts the walk. The first Escape ends it inside the scene and the second reaches the page (contract B-11). The kit's `HelpOverlay` opens with a visit's first walk, and the `StatusLine` names the walker's place.
- **Landing view.** The landing view and the walk start moved to (1.8, 1.6, 25.4): the middle of glazed panel wall-s-11, 2 m back from the glass. The 7.2 m gallery segments meet the 3.6 m wall panels at multiples of 3.6 m, so the old X 0 view looked into a mullion pair.

### 4. Tour, tool panels and follow-a-wafer

**The tour** (`src/scene/tour.ts`):

- It visits seven named views in order: landing, spine, an EUV litho cell, the etch bay, the stocker canyon, the gallery and the section cut. It lasts 71.4 s, or 42 s with reduced motion.
- On the fab floor it flies along the aisles. Between separate spaces it cuts through a fade.
- On a narrow screen the vertical field of view widens to keep 40 degrees horizontal.
- A click or tap on the canvas, a walking key or Escape ends it, and that Escape stays in the scene.
- Each stop's caption lines are the stop's live state.

**Tool panels** open on click or tap (`src/scene/picking.ts`: a body box per tool and a box per load port). A tool panel shows:

- family and bay;
- the E10 state and how long the tool has been in it;
- the lot in process, with its step and the time left;
- the queue and the ports.

A stocker panel shows its slots in use, the crane and its ports.

**Follow-a-wafer.**

- A HUD picker lists hot lots first, then lots riding a vehicle, then lots processing.
- The kit `FollowRig` follows the lot's FOUP. `src/scene/follow.ts` frames a lot inside a furnace or stocker from the front of what holds it, from the first clear side.
- The HUD shows the lot class, "step n of 240" with the step's name, the place and state, a route-progress bar and percentage, and the time since release.
- The capture follows lot 144 from etch-03.lp1 onto vehicle 6 and into track-duv-1.lp1.

**Words from state.** Every line is built in `src/scene/panels.ts` from the twin's read-only views (`toolView`, `stockerView`, `lotView`, `kpis`). `tests/unit/panels.test.ts` (11 tests) holds them to the state they describe.

**Fixes found in the browser:**

- the kit's HUD store coalesces notifications to ten a second, so the tools wait for it before reading the HUD;
- the tour's fleet line now counts vehicles by the plan's speed;
- the kit joystick was unreachable under `.ff-hud`'s `pointer-events: none`. The fix is the scene rule `.ff-hud>.ks-joystick{pointer-events:auto}`, and kit advisory FF-002 is filed.

### 5. GG-001 / FF-001 and the contract suite

**The kit change** (`packages/scene-kit/src/testing/node.ts`, additive):

- `PortRange` and `DEFAULT_PORT_RANGE` (4400 to 4499) are exported.
- `serveOwned`, `noCorsServer`, `assertOwnedUrl`, `runSceneContractTests` and `runPerformance` take an optional `ports` range. `runSceneContractTests` passes it to every server it starts and every URL it checks.
- An invalid range is refused before any output, server or browser.

Tests: three new cases in `packages/scene-kit/tests/ui/node-policy.test.ts`, 8 of 8. None of them binds a port.

`KIT-REQUESTS.md` marks GG-001 and FF-001 done, so Golden Gate can adopt the range later with 4600 to 4649. It also files FF-002 (advisory).

**The contract suite.** `tests/tools/contract.ts` runs the kit's `runSceneContractTests` on the ff2 test, public and dev builds. It uses ports 4700 to 4749 and a 1280x720 window; the suite page is 960x720.

The final run was on the final builds, in Chrome 154.0.8037.58. Every check passed on the first attempt:

| Check | Result |
|---|---|
| B-01 | Pass |
| B-02 | WebGL2 forced: ANGLE D3D11 on the RTX 3070 |
| B-03 | Auto chose WebGPU |
| B-04 | 404, hash, schema and CORS, plus the five callback fixtures (graphics, pack, build, backend, tier) |
| B-05 | 34 mounts. Heap after GC went from 10,983,240 B to 11,212,876 B, a ratio of 1.021 (measured growth +229,636 B; trend +80,172 B). The one document listener is React's `selectionchange`, present from the first mount. |
| B-11 | axe found 0 violations. All 14 controls are at least 44 x 44 px. Enter starts the walk in the gallery, W moves the walker, and reduced motion is honoured. |
| B-12 | The public build has no hooks and no dev panel, and ignores URL flags; the dev build shows the dev panel. |
| B-11-ff-escape | Escape ends a tour and stops following without reaching the page shell; the next Escape does reach it. |

- Only ports 4700 to 4703 were used. The browser and servers closed and the profile was removed.
- 0 unexpected browser messages.
- Evidence: `evidence/contract/ff2/` (`summary.json`, `browser-results.json`, `B-01-ready.png`).

### 6. Model settings

- **Megafab** configures the 15 synthetic vehicles that fit. Placement now searches on round the loop when pilot traffic fills a slot. A 24 h run had 21 vehicles and 0 emergency stops (`evidence/sim/megafab.json`). The HUD and About text say 15.
- **The D-15 ceiling** is frozen at 1,750,625 B and 490,730 B gzip, and `tests/tools/build.ts` enforces it. The GLBs are pack files, not bundle bytes.
- **The About wording** on robot motion stays. The tools' handler and robot clips play from twin state. The floor robots stand at rest because the FF2 twin sends every move by rail.
- **Model sanity** follows the owner's 22:05 decision (next section).
- **Licence (D-35).** The pack carries the Farm pack's licence: CC0-1.0 for authored asset content only, designated by the project owner to the extent of the owner's rights. This is in the credits, in `licenses/ASSET-LICENSE.txt` and in the asset map's licence note. It replaces FF2's earlier designation by SPEC 22, which I had flagged.

### 7. Evidence

| Path | Contents |
|---|---|
| `evidence/sim-spec/ff2/clearance.json`, `handoff.json`, `tour.json` | Sim-spec tests 3, 4 and 9 |
| `evidence/sim/hashes.json`, `sanity.json`, `retunes.json`, `megafab.json`, `warmup.json` | The twin at the adopted release rate; `retunes.json` holds the release sweep beside FF1's three runs |
| `evidence/contract/ff2/` | The kit contract suite |
| `evidence/captures/ff2/captures.json` | Every browser check and record, the browser twin hashes, and each frame's PNG SHA-256 and size |
| `evidence/captures/ff2/sheet-*.jpg` | Seven contact sheets: the eight views on each backend, the walk, the tour, panels and following, the phone layout, the public build |
| `evidence/build/ff2/bundle-{public,test,dev}.json` | Build sizes and the ceiling |

The captures keep bulk frames light: no full frames are written, only their hashes and sizes.

## Acceptance tests run

**Gates**, run from the scenes root with `./scripts/toolchain-run.ps1` on the final state:

- `run typecheck`: clean.
- `run lint`: 0 findings, gated and advisory.
- `test packages/foundry-floor`: 87 pass, 0 fail (14 files).
- `test packages/scene-kit`: 148 pass, 0 fail (20 files).
- Root `bun test`: 411 pass, 1 skip, 0 fail (412 tests in 69 files, including Golden Gate's tree as it stood).

| Sim-spec 12 test | Result | Where |
|---|---|---|
| 1 Seats under rails | Pass with the real load ports: every seat is within 5 mm (X and Z) of its port node | `tests/unit/data.test.ts` |
| 2 Rail graph | Pass: 314 nodes, 322 edges, 175 ports, 465.39 m; strongly connected | `tests/unit/data.test.ts` |
| 3 Clearances | Pass at 0.10 m, with two shortfalls recorded (above) | `tests/unit/clearance.test.ts`, `evidence/sim-spec/ff2/clearance.json` |
| 4 Hand-off | Pass: 0 mm at 175 ports and at 1,484 twin hand-offs; 0 crossings | `tests/unit/handoff.test.ts`, `evidence/sim-spec/ff2/handoff.json` |
| 5 Determinism | Pass (details below). Firefox and WebKit were not run. | `tests/unit/determinism.test.ts`, `evidence/sim/hashes.json`, `evidence/captures/ff2/captures.json` (`twin`) |
| 6 Model sanity | **Fail, 3 of 4 criteria.** Moves per hour pass as an ordinary test; lots out, cycle time and WIP are `test.failing` with reasons. | `tests/unit/sanity.test.ts`, `evidence/sim/sanity.json`, `evidence/sim/retunes.json` |
| 7 Performance | Not run (D-36; device runs are the coordinator's). Counts only: 12 programs and 6 pipelines on both backends, draws and triangles inside the budgets (below). | `captures.json`, `tests/unit/glb-world.test.ts` |
| 8 Honesty | Pass: no excluded name in data, sources, scripts, staged JSON or the built scene. The HUD names the mode and scale in every frame, and About is one tap away. | `tests/unit/honesty.test.ts`, the contact sheets |
| 9 Tour framing | Pass | `tests/unit/tour.test.ts`, `evidence/sim-spec/ff2/tour.json` |

**Test 5.**

- The 720 hourly pilot hashes (day 30: `dc801e30`) hold headless and when stepped at 30, 60 and 144 fps.
- The stored warm start equals a fresh warm-up.
- In Chrome, the twin in megafab reproduces the Bun run on both WebGPU and WebGL2: `3fd35c0d` at the day-30 warm start and `9d9edcb2` one sim hour later.

**Browser checks** (`captures.json`): headless Chrome, `--window-size=1280,720`, the kit clock frozen, each page in a browser context of its own. 0 failures and 0 unexpected console messages.

- **Views:** the eight named views on each backend, with identical draw and triangle counts on both.
- **Walk** (WebGPU):
  - W walks the N1 aisle at eye height;
  - etch-02's load port stops the walker at its radius;
  - the Escape pair behaves as in B-11;
  - Walk from the landing view starts in the gallery, and the gallery leads to the viewing landing;
  - the Controls panel opens with the first walk and closes.
- **Tour** (WebGPU): seven stops with captions from the twin; a fly leg and a cut; interruption by a click and by a key.
- **Panels** (WebGPU): etch-03 and stocker-e open by click.
- **Follow-a-wafer** (WebGPU):
  - the picker's first lot is followed;
  - lot 144 is followed through its pick-up, the ride and its arrival;
  - Stop following hands the camera back.
- **Phone (390 x 844, touch):**
  - landing;
  - the walk's help;
  - a joystick walk of 1.54 m;
  - a tour stop;
  - a tapped panel;
  - the picker;
  - following.

  The toolbar and the bottom stack never overlap, nothing covers the joystick, and nothing scrolls sideways.
- **Public build** on both backends: no hooks, and the Walk, Tour and Follow a wafer buttons are present.

## Model sanity at the owner's release rate

The owner's decision (22:05) was to raise the release rate until the busiest families run near 85 percent. Tool counts, MTBF, MTTR and PM stay as specified.

**Chosen:** 4,500 wafer starts a month, which is 6 lots a day released at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00. Over days 30 to 60 with seed 1 this runs etch at 85.3 percent and CVD/ALD at 85.2 percent of calendar time in PRODUCTIVE. Probe runs at 79.6 percent. Furnaces run at 96.9 percent because a batch occupies the tube whatever its size.

The release sweep, with every other setting as specified (`evidence/sim/retunes.json`):

| Starts/month | Etch | CVD/ALD | CT (d) | WIP | Lots out | Moves/h | Busy of 6 | Skipped |
|---|---|---|---|---|---|---|---|---|
| 3,000 (spec) | 56.8% | 56.6% | 6.89 | 27.7 | 120 | 40.3 | 0.97 | 0 |
| 3,500 | 66.2% | 66.1% | 7.18 | 33.5 | 141 | 47.1 | 1.14 | 0 |
| 4,000 | 75.7% | 75.5% | 7.59 | 40.5 | 161 | 54.3 | 1.33 | 0 |
| **4,500 (adopted)** | **85.3%** | **85.2%** | **8.32** | **50.1** | **180** | **61.8** | **1.51** | 0 |
| 5,000 | 93.4% | 93.5% | 10.67 | 71.2 | 196 | 74.9 | 1.78 | 0 |
| 6,000 (CONWIP binds) | 94.1% | 93.7% | 14.35 | 94.4 | 200 | 84.4 | 1.95 | 65 |
| Band | | | 14–23 | 57–91 | 110–130 | 45–75 | | |

**At 4,500:**

- cycle time 8.32 d (x-factor 1.46);
- WIP 50.1 (47 to 54);
- 180 lots out;
- 61.8 moves an hour;
- 1.51 vehicles busy;
- 0 emergency stops and 0 releases skipped.

Only moves per hour is in band, so the sanity test keeps its other three criteria as known failures with the measured reasons.

**Finding.** Throughput equals the release rate, so the band's 110 to 130 lots out is the spec's 3,000 starts. The band's cycle time and WIP need an x-factor of 2.5 to 4, which the twin's variability does not produce short of saturation. The release rate alone cannot meet the band; the owner decides whether the band or the model changes.

The warm start (`data/warm/seed-1.json`, 108,345 B) and the hash evidence were regenerated for this configuration.

## Build sizes (`evidence/build/ff2/`)

| Build | JS (one chunk) | gzip | Output |
|---|---|---|---|
| Public, `dist/standalone` | 1,586,280 B | 473,835 B | 7,805,401 B in 47 files; 19 licence records |
| Test, `dist/test` | 1,594,670 B | 476,764 B | 7,813,961 B |
| Dev, `dist/dev` | 1,596,662 B | 477,401 B | 7,815,953 B |

- **Ceiling (frozen):** 1,750,625 B and 490,730 B gzip. The public chunk is within it by 164,345 B and 16,895 B gzip, using 90.6 and 96.6 percent. FF1's public chunk was 1,591,731 B and 446,215 B gzip.
- **Staged pack `staged/ff2`:** 42 files, 6,179,589 B, `pack.json` SHA-256 `2a6840fbe3e541090753b5fdca23934442a4be2788b74765c16afcc4a63ff8fc`. It holds 31 GLBs (5,437,748 B), of which 29 are pack models fetched at startup (5,172,312 B). The subfab kit and the humanoid are listed under `source.unplaced`.
- **Fetched at startup:**
  - `pack.json`, 27,427 B;
  - the asset map, 212,191 B;
  - the warm start, 108,345 B (25,559 B gzip);
  - the layout, rail graph, route and tools, 372,304 B in all;
  - the 29 models.

**Counts at the named views** (desktop, identical on WebGPU and WebGL2; `captures.json`):

| View | Draws | Triangles |
|---|---|---|
| landing | 117 | 185,631 |
| overview | 72 | 104,103 |
| spine | 121 | 220,453 |
| litho | 37 | 58,943 |
| cluster | 42 | 82,815 |
| stocker | 100 | 183,799 |
| gallery | 94 | 142,067 |
| section | 88 | 121,465 |

The budget is 300 draws and 1.2 M triangles. `glb-world.test.ts` also holds the phone layout within 150 draws and 450,000 triangles; its highest count is 88 draws and 132,504 triangles, at the spine.

## For the coordinator

1. **Subfab pump and abatement kit: requirement conflict** (SPEC 24 stop rule, scoped to this placement).
   - The accepted kit (r_d0ff94d7...) measures 3.6 x 6.0 x 2.4 m. Turned 90 degrees it is 2.4 m across the cut.
   - The final section module's kit zone is 1.7 x 3.6 x 2.0 m.
   - No pose fits, so the kit is accepted and staged but not placed.
   - Decision needed: a narrower, lower kit revision, or a larger zone.
2. **Section module 4 draws without its return-air shaft**, by a layout rule: the spine's east U-turn passes through it (test 3). The six other modules keep their shafts, and the tool rows pack around them as clean-room obstacles.
3. **Two clearance shortfalls in the assets and spec:**
   - neighbouring load ports, 0.069 m: the `lp` spacing of 0.505 m against a 0.50 m wide port;
   - the serving arm at home, 0.054 m, from its `seatRef`.

   An asset revision would be needed to reach 0.10 m.
4. **Model sanity:** the structural gap above.
5. **Floor robots and humanoid** are accepted, with the facts FF3 needs in the asset map and the `sim-config` movers:
   - the arms and AMRs are drawn at rest;
   - the humanoid is data only: a people class with no visits in FF2, drawn by data alone in a world test.
6. **FF-002 (kit, advisory):** `.ks-joystick` and `.ks-touch-buttons` do not take pointer events inside a scene HUD with `pointer-events: none`. The scene has a local rule until the kit adds `.ks-joystick,.ks-touch-buttons{pointer-events:auto}`.
7. **D-35 is applied to the pack**; it resolves FF2's earlier licence flag. D-36 is observed: no timing is cited.

## Rule breach

At 00:18 I ran `toolchain-run.ps1 x eslint packages/foundry-floor` to lint new code. `bun x` resolved eslint@latest and downloaded 77 packages (294 files, eslint 10.11.0) into `scenes/.tmp/bunx-*` and the workspace Bun cache. That breaks "install only SPEC 3.1 pins; stop and report before any other download". eslint then exited without running, because there is no eslint config.

- **Nothing was installed into the workspace.** `bun.lock` and the manifests are unchanged, and there is no `node_modules/eslint`.
- **Cleanup at 00:23.** I removed the bunx folder and the 72 packages that the download added to the cache. Five packages that were already cached stayed.
- **From then on** I linted with `bun run lint` only, and never used `bun x` again.

## Left for FF3 and the coordinator

1. The floor robots' moves and hand-offs, and the humanoid mover class. These are FF3 twin features; D-34 allows FF3 to start.
2. The subfab kit decision (item 1 above).
3. Test 7 on devices, and Firefox and WebKit determinism.
4. The sanity band decision.
5. FF-002 in the kit.

## Processes

- Every server and headless Chrome I started closed in `finally` blocks:
  - the capture pages each used a browser context of their own;
  - the capture's and the contract suite's Chrome profiles were removed.
- At the end of the session no listener was open on 4700 to 4749, and no Chrome or Bun process of mine was running.
- I removed my temp leftovers: the contract Chrome's URL-fetcher folder under `scenes/.tmp` and the package `.tmp` (smoke frames, not evidence).
- Only ports 4700 to 4703 were used. Nothing on 8000 to 8099, 4400 to 4499 or 4600 to 4649 was touched.
- The hub, the tablet and the Browser pane were not used.

## FF3 local v0.9 candidate, 2026-09-30

This section supersedes the earlier FF3 implementation checkpoint for the current local candidate. Historical FF2/FFC1 packs, builds, source revisions and acceptance records remain unchanged. This is technical qualification for owner review, not owner acceptance, a deployment or a package release.

### Production transport and fit

Four metrology/probe ports now use real simulation-owned floor jobs to and from two stockers. AMRs pick up, carry and drop off the lot's one FOUP; robot arms perform the physical lift and seating. A capacity-limited shared aisle, station reservations and stocker transfer-seat reservations prevent duplicate ownership and occupied handoff seats. Other ports retain overhead transport. The stocker handoff extensions are scene-owned geometry, with explicit routes and mounts. Humanoids perform actual repair/PM visits and technicians perform qualifications. The owner has explicitly chosen to retain the humanoid repair/maintenance role while AMRs and arms carry the FOUPs; a humanoid carrying route is not required for v0.9.

Exact mesh tests found defects in the original gripper housing/jaws, AMR mating pins, loaded approach and empty release trajectories. The separate `showcase/authors/codex-ff-arm-fit` workspace produced preserved-parent repair revisions. Those repairs then became parents of source-backed standard LOD revisions in `showcase/authors/codex-ff-lod-migration`. The final map carries 24 `review-candidate` LOD revisions and seven unchanged accepted interior assets. Public GLB filenames stay stable. `evidence/asset-replacements.json` in the pack retains original and repair lineage without private workspace paths; the author manifests retain the full source chain.

The scene reads off-scene `MSFT_lod` nodes and retains their parent transforms and clip targets. An actual migrated animated AMR exposed Three's pruning of off-scene node associations; explicit dependency indexing fixes that without attaching both levels to the default scene. All 24 files pass `evidence/sim-spec/ff3-floor/final-lod-intake.json`. Current-engine CSG re-tessellation for FOUP/vehicle/load-port and historical emissive serialization corrections are separately proven against rebuilt unchanged sources. Stocker's saved-source-parent GLB and its historical scene-pinned rendition have different bytes; supplemental preservation evidence compares the exact scene predecessor instead of relabeling it.

The migrated models pass all 12 distinct pickup/dropoff mesh sweeps, eight loaded routes, 32 continuity cases, grip fit, OHT hoist and door clearance, desktop/phone geometry budgets and actual people visits: 26 tests and 5,166,504 assertions in `evidence/sim-spec/ff3-floor/migrated-geometry.log`. The seven subfab kits retain the D-42 pose, local X 0.63 m with 90-degree yaw; their measured module clearance is 0.10 m, tool-row clearance at least 1.5 m and other static geometry at least 0.9 m. The original evidence is retained in `evidence/sim-spec/ff3/kit-clearance.json`.

### Model change and evidence

Floor transport is a model change, so the warm start and hashes were deliberately regenerated. `evidence/sim-spec/ff3-floor/comparison.json` compares the same three seeds and inputs with floor transport disabled/enabled over sixty days. Seed 1 changes cycle time from 8.3241 to 8.3736 days, mean WIP from 50.0931 to 50.3722 lots, output from 180 to 181 lots and moves from 61.7625 to 67.9722 per hour. Its 8,507 floor moves use all four stations; all three runs have zero emergency stops and skipped releases.

D-43 remains the synthetic regression band: cycle time 7.955–9.495 days, WIP 45.3–60.65, output 170.5–188 lots, moves 58.05–68.35 per hour. None of these bounds changed to pass floor transport. The earlier requested 14–23 days / 57–91 WIP / 110–130 lots / 45–75 moves band was superseded by the owner's D-43 decision because a release-rate-only retune could not satisfy it; the original sweep remains in `evidence/sim/retunes.json`. Passing D-43 is not physical calibration of a real fab.

`evidence/sim/ff3-warm-pins.json` binds every simulation input, the exact 109,133-byte warm snapshot, and all 720 hourly hashes. The warm snapshot SHA-256 is `394262eec8cb9b185ac1ebbdcfd4884eab294efbf426f9ea5bd40e9b96cdea8f`; the day-30 pilot hash is `d1614d9a`. A fresh replay reproduced the exact snapshot bytes and all hourly hashes. The former state remains under `evidence/sim/pre-floor-20260930/`.

### Pack, loading and controls

The final `staged/ff3/` pack has 62 models: 31 interior, 12 campus structures, six road vehicles, eight vegetation assets and five freight assets. Pack SHA-256: `a6f1cb97f4f45cc493e1fb609f6b155c36fd58292cb30dbdd9c2d5f2f5673aa1`. All files and replacements are pinned and checked; canonical pack equality and replay of its own 720 hourly hashes pass. Campus placement and freight evidence are retained in the package's campus tests and public `data/campus-assets.json`.

Public code is split into the initial campus and a deferred interior. The initial static dependency closure is **1,520,413 bytes / 444,177 gzip**, below the unchanged D-15 limits of 1,750,625 / 490,730. The interior loads only when entering the fab. Full chunk hashes are in `evidence/build/ff3/bundle-public.json`.

| Public chunk | Bytes | Gzip | Load |
|---|---:|---:|---|
| `index-Cm7qFpzw.js` | 1,406,441 | 404,958 | Initial |
| `camera-YzP6jt8n.js` | 41,114 | 11,302 | Initial exterior dependency |
| `exterior-BxDZTevR.js` | 72,858 | 27,917 | Initial exterior |
| `interior-C07892cC.js` | 172,114 | 68,986 | Enter the fab; contains twin and movers |

Both graphics backends pass the focused local controls test: reduced-motion startup, pause/resume outside and inside, deferred interior fetch, real floor-transfer following, About/tour/follow Escape consumption, focus restoration, exit/reentry and 320×256 offscreen readiness. A forced no-graphics run reports `dataset.state=error` and `dataset.errorCode=renderer-init`. The interior About panel's missing Escape handler was reproduced and fixed with the shared panel hook. See `evidence/contract/ff3/local-review.json`.

### Road-marking visual correction

A direct inspection found bright broken streaks across distant carriageways. Hiding only the marking layer removed them; road topology, depth ordering and the intentional arrival-end dissolve were sound. The quarter-metre ribbons projected to a median 0.212 pixels in the roundabout view and 0.043 pixels at arrival.

The bounded correction filters only marking contrast using the Euclidean screen derivative of its across-ribbon coordinate. Paint blends toward the actual lit road underlay between 0.25 and 1 projected pixel. The material remains opaque in its existing ground order, preserving cars/buildings above it. The underlay retains the split/cross end dissolves and apron colour. No road geometry, physical width, camera, asset, simulation or pack data changed.

`evidence/captures/ff3-road-filter/README.md` retains the expected failing tests, the three passing regressions (5,546 assertions), fourteen matching before and fourteen after shots, and exact opaque-object comparisons at three real driving poses on both backends. The actual shader colour graph is also evaluated against independently sampled original ground triangles at both fading road ends and the apron boundary. Initial delivery increases by 1,048 bytes / 451 gzip and remains inside D-15. Public, test and development outputs were rebuilt; the full CPU suite, both graphics contracts, local controls and final scene captures below were rerun on these bytes. Owner appearance acceptance remains separate.

### Validation and owner boundary

The complete current package CPU suite passes **163 tests / 7,206,087 assertions**, with clean typecheck and lint. `evidence/sim-spec/ff3-floor/final-cpu.log` is the final passing run; its earlier failed JSON receipt comparison is retained separately. A path with no static geometry within the one-metre search now records that lower bound explicitly instead of serializing Infinity as null; the 5 cm clearance requirement is unchanged.

The full Chromium contracts pass **8/8 on WebGPU and 8/8 on forced WebGL2**, including the formerly failing B-04 diagnostic policy, fixed lifecycle cycles, accessibility and keyboard way-in. Receipts are `evidence/contract/ff3/summary.json` and `evidence/contract/ff3-webgl2/summary.json`. Both runs completed on their first attempt and closed their owned servers, browsers and profiles; no M5 change was needed.

`evidence/captures/ff3-local-v09/captures.json` records **36 final shots**, with PNG hashes and two contact sheets: six campus views, eight interior views, a real loaded AMR, the same job's arm transfer, and actual walking humanoid and technician visitors on each backend. Both browser twins match headless megafab hashes `043cd4bd` at warm start and `ec825bae` one hour later, with no unexpected diagnostics. An earlier walking-camera capture was blocked by a stocker; that attempt remains under `framing-attempt-1/`. The final AMR shots use the existing obstruction-aware Follow camera and clearly show its carried FOUP. Runtime code and bundle hashes did not change for this capture correction.

Firefox determinism was not run: no `firefox-*` browser exists in `C:/Users/Mattm/AppData/Local/ms-playwright/`. WebKit 2287 and 2359 are cached, but this workspace has no pinned `playwright` or `playwright-core` driver. TASK-FF3 item 6 forbids downloads and permits recording these limits. Tablet/phone operation, visual taste and model alignment belong to the owner's local review. No shared-PC timing is used as performance acceptance.

To serve the candidate from the scenes root through the pinned workspace toolchain:

```powershell
& ./scripts/toolchain-run.ps1 packages/foundry-floor/dist/ff3/standalone/serve.mjs --port 4720 --verify
```

The authoritative build/check entrypoints are `tests/tools/build-ff3.ts public test dev`, `tests/tools/contract-ff3.ts` (repeat with `--webgl`), `tests/tools/local-review.ts`, `tests/tools/capture-local-v09.ts`, and `bun test packages/foundry-floor/tests/unit` through `scripts/toolchain-run.ps1`. Browser runners own their 4700–4749 listeners and close their headless browser/profile in `finally` blocks. Do not rebuild FF2/FFC1 to serve this candidate.

# Foundry Floor FF-C1: report

Builder: Claude Code subagent (Opus 5.5) of the coordinator, 2026-09-30 08:14 to 11:22 (clock times; see `PROGRESS.md`,
FF-C1 section, for the log). Task: `scenes/TASK-FF-CAMPUS-1.md` (brief 08:11; its Conditions carry the owner's direction
relayed at 08:16) under `scenes/TASK.md` and `scenes/DECISIONS.md`. Started from `7f96c2e` on `work/scenes-v1`; the branch
is now at `b914d80` (the coordinator's decision records; none touches this package). Nothing of FF-C1 is committed. No
number here is a timing result: counts, bytes and hashes only (the drive check's seconds are simulated time).

## Summary

- **The campus stands and is staged (items 1 to 3 and 9).** `data/campus.json` is built from the twelve accepted
  structure exports by `scripts/build-campus.ts`, and all nine of its checks pass (re-run 11:18). It holds 20
  placements of 12 models, 194 solids, 8 lanes, 3,272 parking stalls (2,330 occupied at the high tier), 24 utility
  satellites, 224 light standards and 13,818 ground triangles. Pack `ffc1`: 68 files, 11,288,278 B, `pack.json` SHA-256
  `0c4b2648ed0530b72acf030abf6c4dd89fc847b794421cd34861cf2c15cc2260`.
- **The way in (item 6).** "Enter the fab" at the south-west arrival canopy mounts FF2's interior unchanged, and "Exit to
  campus" returns to the canopy. It is captured from the orbit on WebGPU and WebGL2, and from the car on WebGPU. The twin
  hashes equal FF2's recorded ones: `3fd35c0d` at entry, `9d9edcb2` one hour later, `3fd35c0d` again on a second entry.
  FF2's eight interior views have FF2's recorded camera, draw calls and triangles on both backends.
- **Orbit (item 4):** the kit's `OrbitRig` with clamps from the data, four presets and the D-22 touch pad (Reset view on
  touch). **The flight is cut** (first to give).
- **Drive (item 5):** the sedan on the split road, the cross-pass stubs and the roundabout on Golden Gate's conventions
  (`data/driving.json`), with traffic in eight lanes that fades at the lane ends. The drive check drives the whole route
  on the car model in two lanes (17,408.9 m and 17,400.7 m) and samples every traffic lane every 0.25 m: 0 wheels off
  the road (re-run 11:18).
- **Presets and tiers (item 7):** the exterior day preset with `NeutralToneMapping`; instanced parking, lights and
  traffic; far shells by distance; counts per tier, identical on both backends. **The dusk preset is cut** (second to
  give). Traffic density is not cut.
- **D-15 (item 8):** the public startup chunk is 1,597,094 B, 477,510 B gzip, within the frozen ceiling (1,750,625 B,
  490,730 B gzip). The campus exterior is its own chunk (59,732 B, 23,071 B gzip), loaded when the exterior starts.
- **FF2's outputs are untouched:** no file under `dist/standalone/` or `staged/ff2/` changed after 08:14 (checked
  11:22); `staged/ff2/pack.json` is still `2a6840fbe3e541090753b5fdca23934442a4be2788b74765c16afcc4a63ff8fc`.
- **Gates (item 10):** captures on both backends with 0 failures; package tests 106 of 106 in 16 files (19 new);
  typecheck clean and lint 0 findings (re-run 11:19). The kit contract suite passes B-01, B-02, B-03, B-05, B-11, B-12
  and the campus's keyboard way-in check. **B-04 fails** on the suite's diagnostics rule for callback fixtures, not on a
  scene defect (kit request FF-003).

## What FF-C1 delivers, item by item

### 1. Campus data (D-21)

- `data/campus.json`, schema `foundry-floor.campus/1`, 120,586 B, SHA-256
  `162d4993519d4c5faaee905719f6f7e640da699cabc4bf6a3010a95d593d8747`. `scripts/build-campus.ts --write` builds it from
  the structure exports; `--check` rebuilds and compares (not stale at 11:18). `tests/unit/campus.test.ts` asserts the
  committed file is the build output.
- It holds the contract's placements (SW = W as built, SE = E as built, NE = W turned 180 degrees, NW = E turned 180
  degrees; seams at u = -3015 and +3015; the two S3 links, the two S4 canopies, the eight S5 bridges), the split road,
  the cross pass, the roundabout, road ends with a 150 m dissolve stretch, the drop-off bays, parking, satellites, light
  standards, the tiers, the six named views, the exterior look and the orbit clamps.
- The interior locator: the SW head, building frame (-760, 8.0, 115), campus (-3775, 8.0, -185), yaw -90 degrees,
  walking surface Y 8.0. The twin's footprint sits behind the atrium void, in line with the entrance and the canopy.
- Its nine checks are in "Campus checks" below; eleven discrepancies are recorded in its `discrepancies` array.
- `data/assets.json` gains a `structures` section for the twelve exports (author, file, asset, revision, bytes,
  SHA-256, measured facts); every FF2 section is equal when parsed.

### 2. Structures in the scene

- Twelve GLBs, not the ten the brief names: the brief's own table lists twelve files. Each equals the newest revision of
  its Kiln asset in bytes and SHA-256 (verified 08:30). Revisions and hashes are in "The ffc1 pack".
- The page fetches them through the pack with size and hash checked, as FF2 fetches its models.
- Full shells are drawn within the tier's `fullWithin` (800, 1,200, 1,800 and 2,400 m), far shells beyond it.
- Meshes are merged by material at load and keep the exported material objects, so a structure's draw calls equal its
  material count.

### 3. Ground and roads

- A grade plane; the split road with four 4.5 m lanes each way and solid edge lines at |v| 18.5 and 39.5; the cross pass
  (drivable stubs, and outer legs drawn but not driven, see discrepancy 3); a four-lane roundabout (r 85 to 105) with an
  apron and a planted island.
- Lane and edge markings, drop-off bays under both canopies, 3,272 parking stalls, 24 satellites, and 224 light
  standards with lamp heads.
- The campus's own ground, roads, markings, stalls, satellites and lights are untextured, coloured from the data's
  palette, with no text, numbers, logos or brands.
- Ground layers draw first without depth, in render order, so nothing z-fights at campus distances.

### 4. Orbit

- The kit's `OrbitRig` with the data's clamps: distance 25 to 16,000 m, 6 m clearance, a maximum polar angle and the
  campus bounds.
- Presets in the View control: Campus, One pair, Arrival and The split. Two more views, under a bridge and the
  roundabout, are capture views set through test hooks.
- D-22 touch: Reset view shows in the toolbar on touch layouts (phone capture, 390x844).
- **The flight is not built** (cut line).

### 5. Drive

- `data/driving.json` (`foundry-floor.campus-driving/1`) carries Golden Gate's values for the start rule, speeds,
  accelerations, brakes, coasting, reverse, curb, traffic margins, turn-around, controls and chase camera;
  `tests/unit/campus-drive.test.ts` asserts that they equal Golden Gate's. Two differences are recorded:
  - the road-end stop is 45 m (Golden Gate 30 m), so the stopped car stands in the south-west canopy's drop-off bay;
  - steering is a kinematic bicycle about the rear axle with Golden Gate's wheel angles, because the campus car turns
    through a roundabout and into the cross pass.
- Controls:
  - Enter, E or "Drive the sedan" takes the car; E, Escape or "Leave the car" hands the camera back to the orbit, 42 m
    from the car.
  - W or Up accelerates; S or Down brakes, then reverses; A, D, Left or Right steer; Space brakes; X is the handbrake.
  - At a road end the prompt reads "Press R, or stop and hold S, to turn around". R and a throttle held for 1 s against
    the stop both turn the car around in the capture.
  - On touch the kit joystick (throttle mode) is the only driving input (D-22).
- Traffic: Golden Gate's lane flow on the eight lanes through the roundabout, with the six accepted vehicles drawn by
  their `MSFT_lod` levels (the sedan at 3,664, 2,256 and 190 triangles). Vehicles fade at the lane ends and hold behind
  the driven car. The traffic steps on the scene clock, so the frozen capture clock holds it still.
- The drive check (`scripts/drive-check.ts`, `evidence/drive/contact.json`, re-run 11:18 with the same results):
  - The sedan (4.86 x 1.87 m, wheelbase 2.85 m) drives the car model at 120 Hz. An autopilot gives only a viewer's
    inputs over the whole route: the south end to the north end, to the west stub end, west to east through the
    roundabout, then back to the south end, with three turn-arounds.
  - It covers 17,408.9 m in lane 1 and 17,400.7 m in lane 3 (95,077 and 94,780 samples). 0 wheels are off the road,
    body, surface and pitch steps are 0, and there are 0 curb contacts.
  - The least edge clearance is 15.065 m and 5.585 m. The lowest part above the car is 14 m (the canopy-S soffit).
  - The traffic lanes are sampled every 0.25 m with the transit bus (wheelbase 7.2 m): 277,290 samples, 0 off the road.

### 6. The way in

- "Enter the fab" is the single context action (D-22). It is offered when the orbit camera is within 700 m of the
  south-west drop-off, or when the car is in the drop-off zone under the canopy at 4 m/s or less.
- Enter fades out and mounts FF2's own world, HUD and session, a fresh session from the pack's warm start. The HUD is
  FF2's with one control added first, "Exit to campus". The exterior is not drawn inside.
- Exit returns to the Arrival view, or, after entering from the car, to the car at rest where it stopped, with the chase
  camera behind it.
- Evidence:
  - `evidence/captures/ffc1/captures.json` `records[].wayIn`, `interior` and `twin` (both backends), `drive.wayIn`
    (WebGPU) and `phone` (390x844 touch);
  - the contract check `B-11-ffc1-keyboard-way-in` (keyboard only): the Arrival view by the view group's arrows, Enter
    the fab, FF2's tour ended by Escape inside the scene, Exit to campus back at the Arrival view, then Escape reaching
    the page shell.

### 7. Presets and tiers

- One exterior look, the day preset, with `NeutralToneMapping`; the interior keeps FF2's preset.
- Parked cars, light standards, lamp heads and satellites are instanced (2,826 instances at the high tier), as is the
  traffic; far shells are chosen by distance.
- Counts per tier: "Tier counts" below.
- **The dusk preset is not built** (cut line).

### 8. Sizes (D-15)

See "Build sizes". The startup chunk fits the ceiling, and the campus's exterior code (ground, structures, drive,
traffic, exterior HUD) loads as its own chunk when the exterior starts. The kit's `VehicleRig` sits in the startup
chunk, because the kit module that holds it is already there for `OrbitRig`.

### 9. Pack `ffc1`

See "The ffc1 pack". `scripts/stage-campus.ts` never calls FF2's `stageFoundryFloor`; `tests/tools/build-campus.ts`
builds only `dist/campus/`.

### 10. Evidence

| Evidence | Path |
|---|---|
| Captures, both backends, 0 failures: six orbit views, the drive start and three driven views, the way in, FF2's eight interior views, the twin, drive checks, phone 390x844, per-tier counts, public build | `evidence/captures/ffc1/captures.json`; `sheet-views-webgpu.jpg`, `sheet-views-webgl2.jpg`, `sheet-drive-webgpu.jpg`, `sheet-phone-webgpu.jpg`, `sheet-public.jpg` |
| Build records (chunks, roles, bytes, gzip, startup fetch) and staging record | `evidence/build/ffc1/bundle-{public,test,dev}.json`, `stage.json` |
| Drive check | `evidence/drive/contact.json` |
| Kit contract suite and the B-04 probe | `evidence/contract/ffc1/summary.json`, `browser-results.json`, `B-01-ready.png`, `callback-probe.json` |
| Package tests | `tests/unit/campus.test.ts` (8 tests), `tests/unit/campus-drive.test.ts` (11 tests) |

The tools are `tests/tools/capture-campus.ts`, `contract-campus.ts` and `callback-probe.ts`, all headless with
`--window-size`, on ports 4700 to 4749.

## Campus checks (`build-campus.ts --check`; all nine pass)

| Check | Measured |
|---|---|
| seams | In all four buildings the head and the hall meet at the seam plane: no reach past it either way and no envelope cap. Outline v +-190, Y 0 to 46 on both. Outer outlines agree within 5 mm except the two recorded differences, the lit parapet strip (0.100 m) and the half-groove ends (0.051 m). Slab bands are equal. S2 caps its nine interior slabs at the seam (18 triangles per building, inside the joined slabs). |
| negative-scale | 1,852 placed nodes, 0 negative scales, 0 mirrored world matrices. |
| clear-height | 29.4 m under all eight S5 bridges, full and far shells. |
| road-profile | 27,956 ground vertices (13,818 triangles), largest offset from grade 0 m. |
| lanes-on-road | All eight lanes; the least lateral margin is 6.844 m (the outer lanes). |
| road-envelope | 56 structure triangles tested near the drivable area, none inside it between 0.05 and 5 m; the least clearance is 0.1 m, at the canopy kerb. |
| extents | Every placement within its clause. Beyond 0.5 m only where the contract or the author's brief projects a feature: S1 front fins 0.6 m, S1 entrance portal 0.632 m, S2 bay fins 0.605 m, the revision 3 pod canopies 12 m. Links reach 0.3 m, canopies 0.332 m, bridges 0 m; far shells at most 0.014 m. |
| interior-fit | The twin sits inside the bar, 12.7 m clear of the atrium; the level bands 8.0, 14.0, 0.5 and 21.4 m are equal; 0 intruding triangles. |
| dressing-clear | 0 stalls on a road or within 3 m of a head; satellites 140 m from the halls; 0 poles on the drivable area. |

Structure triangles over all placements: 160,012 with full shells, 18,688 with far shells.

## Tier counts (`captures.json` `tiers`; identical on WebGPU and WebGL2)

Each cell gives draw calls / triangles, the full shells drawn (f) and the traffic vehicles drawn (tr).

| Tier | Parked | Instances | Traffic | campus | pair | canopy | split | bridge | roundabout | drive-split |
|---|---|---|---|---|---|---|---|---|---|---|
| minimal | 687 | 1,183 | 220 | 89 / 64,323 f4 | 89 / 64,323 f4 | 107 / 100,605 f6 tr10 | 106 / 98,731 f6 tr9 | 59 / 83,347 f9 tr17 | 95 / 103,101 f9 tr19 | 107 / 101,991 f10 tr18 |
| economy | 1,148 | 1,644 | 333 | 89 / 75,387 f4 | 89 / 75,387 f4 | 107 / 114,139 f6 tr23 | 121 / 133,893 f8 tr24 | 67 / 119,946 f11 tr39 | 98 / 121,545 f11 tr41 | 107 / 121,139 f10 tr41 |
| balanced | 1,744 | 2,240 | 464 | 89 / 89,691 f4 | 89 / 89,691 f4 | 124 / 157,219 f8 tr66 | 124 / 158,185 f9 tr59 | 77 / 161,003 f12 tr69 | 99 / 145,643 f13 tr73 | 111 / 158,257 f11 tr79 |
| high | 2,330 | 2,826 | 593 | 89 / 103,755 f4 | 96 / 120,984 f5 | 126 / 181,033 f9 tr99 | 125 / 183,569 f10 tr102 | 79 / 190,199 f14 tr118 | 100 / 175,155 f15 tr138 | 112 / 188,589 f12 tr119 |

- Tier knobs in `data/campus.json`:

  | Tier | fullWithin (m) | Parking share | Headway | Per lane | Traffic LOD (m) | Far (m) |
  |---|---|---|---|---|---|---|
  | minimal | 800 | 0.3 | 18 | 30 | 30 / 120 / 700 | 26,000 |
  | economy | 1,200 | 0.5 | 12 | 50 | 40 / 160 / 1,000 | 30,000 |
  | balanced | 1,800 | 0.75 | 9 | 70 | 50 / 200 / 1,400 | 36,000 |
  | high | 2,400 | 1 | 7 | 90 | 60 / 250 / 1,800 | 40,000 |

- Driven views at the high tier: drive start 131 / 218,647; under a bridge 123 / 204,629; at the roundabout 83 /
  178,999. The traffic takes 13 draws in each driven view, 49,582 to 52,508 triangles.
- Programs 23 to 28 on both backends; pipelines 15 to 18 on WebGPU and 13 to 16 on WebGL2, by view.
- Inside, FF2's counts are unchanged: landing 117 / 185,631, overview 72 / 104,103, spine 121 / 220,453, litho 37 /
  58,943, cluster 42 / 82,815, stocker 100 / 183,799, gallery 94 / 142,067, section 88 / 121,465.

## Build sizes (D-15; `evidence/build/ffc1/`)

| Build | Chunk | Loaded | Bytes | gzip |
|---|---|---|---|---|
| Public, `dist/campus/standalone` | `assets/index-B8iwkEho.js` | at startup (entry) | 1,597,094 | 477,510 |
| Public | `assets/exterior-DHcXPF0e.js` | when the exterior starts (dynamic import) | 59,732 | 23,071 |
| Test, `dist/campus/test` | `assets/index-BIeCYpi-.js` | at startup | 1,605,770 | 480,659 |
| Test | `assets/exterior-Ds0Cfnss.js` | when the exterior starts | 62,220 | 23,885 |
| Dev, `dist/campus/dev` | `assets/index-poAYLm1g.js` | at startup | 1,607,762 | 481,309 |
| Dev | `assets/exterior-BumZLtjD.js` | when the exterior starts | 62,220 | 23,885 |

- **Ceiling (frozen): 1,750,625 B and 490,730 B gzip.** The public startup chunk is within it by 153,531 B and 13,220 B
  gzip (91.23 and 97.31 percent of the ceiling).
- **Which it is:** the campus code loads as its own chunk when the exterior starts. The campus opens on the exterior, so
  on this page both chunks load at once: 1,656,826 B and 500,581 B gzip together. That is under the byte ceiling and
  9,851 B over the gzip ceiling.
- The startup chunk grew 5,855 B (1,871 B gzip) from the 09:49 build, which had no drive. It now holds the kit's
  `VehicleRig` and the campus session's car memory. FF2's public chunk was 1,586,280 B, 473,835 B gzip.
- Public output: 74 files, 12,986,496 B; 19 licence records in `THIRD-PARTY-NOTICES.txt`.
- **Fetched at startup:**
  - `pack.json`, 49,477 B;
  - eight data files: the asset map 254,798 B; the layout, rail graph, route and tools as in FF2; the warm start
    108,345 B; `campus.json` 120,586 B (15,755 B gzip); `driving.json` 7,697 B;
  - 47 models, 10,076,504 B: the 29 interior models FF2 loads (5,172,312 B), the 12 structures (3,580,972 B) and the 6
    vehicles (1,323,220 B).

## The ffc1 pack (`staged/ffc1/`; `evidence/build/ffc1/stage.json`)

- 68 files, 11,288,278 B: the 66 files `pack.json` lists (11,232,497 B), plus `pack.json` (49,477 B, SHA-256
  `0c4b2648ed0530b72acf030abf6c4dd89fc847b794421cd34861cf2c15cc2260`) and `SHA256SUMS`. It lists 47 models and 8 data
  entries. The staging verification is ok.
- It holds everything `staged/ff2` holds: 40 files, 38 byte-identical. The two FF-C1 extends are checked:
  - `data/assets.json` (212,191 to 254,798 B, SHA-256 `8a7f1247cbb6000ffb45cf7f90e39176205876cf2f03e510f8b084af9f370eff`)
    adds the structures section; every other section is equal when parsed;
  - `licenses/ASSET-LICENSE.txt` (7,105 to 11,376 B, SHA-256
    `37813f2ae7e2c1f4cffecd4b58fdd5d8f5d1b168f9a0a7b3874d0270d433d4a4`) keeps all 31 FF2 model lines verbatim and adds
    the structures and vehicles with author and revision. It stays CC0-1.0 with the Farm scope sentence (D-35).
- Added:
  - `data/campus.json` (SHA-256 `162d4993519d4c5faaee905719f6f7e640da699cabc4bf6a3010a95d593d8747`);
  - `data/driving.json` (7,697 B, `d80f24776a5773184b389c5b3984910b648213e12c556261c2f9e0f3a6cf7899`);
  - the twelve structures and the six vehicles;
  - the vehicles' six licence texts under `licenses/vehicles/`.
- The six vehicle GLBs and their licence texts are byte-identical to Golden Gate's staged `g4`, `g5` and `g6` (checked
  11:22).

| File | Bytes | Kiln revision (author) | SHA-256 |
|---|---|---|---|
| `models/structures/s1-head-W.glb` | 794,948 | `r_c2d99522b58344b69dca0ad1ce41928a` (opus-ff-head) | `12be5743a5e422416602ce42ad36b8143ad203e2672a2c00043e1410564e78cf` |
| `models/structures/s1-head-E.glb` | 794,948 | `r_df7dae73a55c46f1853280912ac1d593` (opus-ff-head) | `694ef50d50de5f4f28be10a0b087b9493e19ad3d7083bc95c717c37a292114c0` |
| `models/structures/s1-head-W-far.glb` | 32,280 | `r_e8204a9885e14c2c9d09a22f755a80da` (opus-ff-head) | `0bcce2163fbbfaa787628efffc8362405ed3b42a7614d3161e6bb33e790f83ea` |
| `models/structures/s1-head-E-far.glb` | 32,280 | `r_2e4899a609764cf6a993093253b75fd8` (opus-ff-head) | `6d5a620ef1a11c1964797663d0465ce48170049440e1b1df80b6eeb22374cdcb` |
| `models/structures/s4-canopy.glb` | 40,252 | `r_e6e9b7f634014bc6ab698dcbb0df91a5` (opus-ff-head) | `5a847c587b59fa62b4c6e4113a605eae1ec4a8f760d99d5817b8fd7c0b68f0c7` |
| `models/structures/s2-hall-W.glb` | 641,092 | `r_360a18d9520a47ba8f74803411d880d7` (sonnet-ff-hall) | `7b0346a7c31c8f76cdf5689089ba2c130ebf160b5df74c78b0f6a49514c0a41b` |
| `models/structures/s2-hall-E.glb` | 641,092 | `r_9240eafbf13942e4a6263b1012889b2d` (sonnet-ff-hall) | `567561f70e74675a89185701468ef9ffa995cb3307b3661130ae2b6cd00b26c7` |
| `models/structures/s2-hall-W-far.glb` | 57,480 | `r_47f890f3d7314130ade16990037c4519` (sonnet-ff-hall) | `7eef9f8b6ffbba459d96bd5f3e6c1efc05425ad4148d68717ab26c198cf2ad35` |
| `models/structures/s2-hall-E-far.glb` | 57,476 | `r_d946a31fc6c041a8b3d6ca0e6006fb36` (sonnet-ff-hall) | `eeb5315c3d1806c3baf31fc7bb960dde0a0b3e13d8a17d123152ac73c5e8365f` |
| `models/structures/s3-link.glb` | 72,040 | `r_b2f1a7eab1cc48fb8d2561914e8888d3` (sonnet-ff-hall) | `246bbf1956c794d55720ff0ba53bd817e6cac3962dad44a3c7973bd470382a3c` |
| `models/structures/s5-split-bridge.glb` | 356,080 | `r_8bbd9104498f4aad974d4f3cb29e810e` (sonnet-ff-bridge) | `1086e13f6306afe7b19fe1c520360cd37e80eda61894602060ff3a29b56a7083` |
| `models/structures/s5-split-bridge-far.glb` | 61,004 | `r_51b50c962e754a098db9b438367ed1b1` (sonnet-ff-bridge) | `380887f36e9cde62d202b24244162186f35f74f71e1f99be39e809191dc81e30` |
| `models/vehicles/sedan.glb` | 259,596 | `r_1cb27a0c14d44e48afff84db23013dad` (sonnet-vehicles-a) | `e05943cd76110e6ed7e3210b9bc33ede40d48371def8439ca1bc9c8dcabf8e96` |
| `models/vehicles/hatchback.glb` | 262,464 | `r_105b27d31fe44f2aa188a333e19e3977` (sonnet-vehicles-a) | `c2f941f89816b5d8a48bb2d9481a00411c2af45591d26ea46a99399d385a3bfa` |
| `models/vehicles/suv.glb` | 266,964 | `r_8261935e39684470b65549b1c39142fd` (sonnet-vehicles-a) | `f46d4535adf8a2730ff832fba59476db2cc63b0dece497aebc1651ae53a6d28d` |
| `models/vehicles/pickup.glb` | 170,228 | `r_b74ac56a93a44c7484890f712df9c64c` (sonnet-vehicles-b) | `3adba5410c857ae9e4ec9e2a6eb65428b928783746a7a34fd18679a4d29d83a4` |
| `models/vehicles/box-truck.glb` | 169,772 | `r_d5e37b6d4e7347ac863220cdbd8e49a4` (sonnet-vehicles-b) | `bea417d293d5e2a32f99795bc2841ef845bd1a94ccc6f9d9e4691c050c5a0e94` |
| `models/vehicles/transit-bus.glb` | 194,196 | `r_6ab2ee53817449c59972502fcf008f1a` (sonnet-vehicles-b) | `c55fbf069668774e0d3dc98db76c3efd05ff630f0ffd2b2cf475579336875617` |

## Discrepancies between the contract or blueprint and the build

The first eleven are recorded in `data/campus.json` `discrepancies`.

1. **Blueprint path.** The brief puts `campus-blueprint-v7.svg` beside the contract. It is one level up, at
   `pack2-research/terafab/campus-blueprint-v7.svg`, the path the contract's header names. Nothing else differs.
2. **Ten GLBs.** The build uses twelve, the files the brief's own table lists; all twelve are verified and staged.
3. **S3 blocks the cross pass.** The blueprint draws the cross pass (u -60 to 60) straight through the chevron, but the
   contract builds each link as a closed, clad box from grade (Y 0 to 30).
   - Built: drivable stubs from the roundabout to |v| 224, 15 m short of the placed link's near face at 239.7.
   - The outer legs, from |v| 353, are drawn as road with no car and no traffic.
   - Open decision below.
4. **Chevron arms.** The blueprint ends them at u +-170. The contract (review 1) and the asset run them to the swept hall
   faces at (+-271, -150). Built as the asset and the contract.
5. **Bridges and pod canopies.** Contract revision 3 supersedes the blueprint's "no bridges along the split", so the
   eight S5 bridges are placed. The pod canopies project 12 m beyond the loading faces. Both are listed in the extents
   check with their clauses.
6. **Tip to tip.** The blueprint text says 1,660 m; the contract and the drawn geometry give 1,664 m (832 x 2). Built as
   the contract.
7. **Head top.** Measured 74.821 m (the roof monitor over the taper; the far shell is 70 m) against the contract's 70 m
   bar roof. Built as exported; the author's question 13 is on record.
8. **Lanes and markings.** The blueprint draws paved outlines with dashed centre lines and no lanes. The scene adds four
   4.5 m lanes each way, edge lines at |v| 18.5 and 39.5, and a four-lane roundabout, all within the paved outlines.
9. **Drop-off bays.** The S4 kerbs at Z +-60 lie beyond the 80 m road. The bays run from the road edge to the kerbs
   (|v| 40 to 59.4) under each canopy, so both are honoured.
10. **Link arm ends.** The asset's arm back corners reach (+-265.2, -181.1) in the link frame. That is 41 m outside the
    blueprint's quadratic hall end, in the corner the sweep leaves open, and 10 m past a square end at +-271. Built as
    accepted; a visible fact for the owner's look review.
11. **Seam details**, measured on the placed meshes:
    - S1 inlays the lit strip in the top 0.3 m of its parapet face, while S2 puts it on top: a 0.100 m step at the join.
      The on-top rule came after S1's acceptance, and the coordinator kept S1 (OVERNIGHT 16:05).
    - S1's half grooves stop 0.3 m below the wall top; S2's run the full height (0.051 m).
    - S2 caps its nine interior slabs at the seam, inside the joined slabs, where the contract says both stop with no
      cap.
    - S1's ground slab has no underside (on grade).
12. **Extents within 0.5 m (item 1).** The full shells exceed 0.5 m only at the projected features listed under the
    extents check; the far shells stay within 0.014 m.
13. **Road-end stop 45 m where Golden Gate uses 30 m.** This puts the stopped car in the south-west drop-off bay.
14. **"The split from the driver's eye" (item 10)** is captured from the chase camera behind the sedan (the kit's
    `VehicleRig` with Golden Gate's chase values). That is the one camera Golden Gate's drive has, and its vegetation
    code calls that view the driver's eye; no in-car camera was added.
15. **No vegetation or water.** The contract names forest and water as scene work, but the brief's item 3 does not ask
    for them.

## Cut lines (SPEC 24)

1. **The flight (item 4), cut first**, by the owner's order.
2. **The dusk preset (item 7), cut second.**

Neither is built. The round's time went to the two required deliverables, the way in and the drive with traffic, and to
their evidence. Nothing built depends on either. Traffic density is not cut: every tier runs its full flow (220, 333,
464 and 593 vehicles).

## For the coordinator and the owner

1. **S3 and the cross pass (decision).** Cut a portal through each link, or raise the link over the road. Until then the
   cross pass is driven only between the links.
2. **Look review items:** the link arm ends (discrepancy 10), the head top at 74.821 m (7), and the 0.100 m lit-strip
   step and 0.051 m groove ends at the seams (11).
3. **The cut lines:** schedule the dusk preset and the flight, or drop them. `PROGRESS.md` "Next exact action" gives the
   plan.
4. **B-04 and kit request FF-003.**
   - The suite accepts only a cancelled `pack.json` in callback fixtures, but the campus pack is still loading when the
     backend and tier callbacks fire.
   - The suite recorded three unexpected `net::ERR_ABORTED` requests (`data/campus.json` and `data/driving.json`).
   - `tests/tools/callback-probe.ts` measured the cause: backend and tier cancelled pack-listed files in 3 of 3 runs
     each, at 18 to 32 of 55 assets loaded; graphics, pack and build cancelled nothing
     (`evidence/contract/ffc1/callback-probe.json`).
   - B-04's nine cases pass their own assertions; the check fails only on that diagnostics rule.
   - The kit is read-only, so the scene carries no workaround.
5. **B-05's C-04 trend flag is set.** The third block grew 219,268 B against the measured block's 197,272 B. It is not a
   gate: heap growth is 1.84 percent against the 5 percent gate. FF2's flag was not set (80,172 against 229,636). It is
   worth a look before M4.
6. **Startup fetch.** The campus page fetches all 47 pack models at startup (10,076,504 B). That includes the 29
   interior models (5,172,312 B), which are seen only after Enter. Deferring them to Enter would change FF2's loading
   path, which this round keeps unchanged; this is a decision for a later round.
7. **Frame times** for the campus, and for the drive at the high tier with 593 vehicles, are not measured here (D-36).
   The hub run is the coordinator's to schedule.

## Kit requests

- **FF-003 (new, open):** the B-04 callback-fixture diagnostics rule (above).
- No kit, Golden Gate, engine or author file was edited. Golden Gate code was copied as patterns (driving model,
  traffic, vehicles, chase values), never imported.

## Commands (PowerShell, from `C:/Users/Mattm/X/kiln-commons/scenes`)

```powershell
# Serve the public campus build. --verify checks every pack file's bytes and SHA-256 before listening. Always pass
# --port: the default, 4400, is another builder's range. (Checked at 11:14 on 4721 with Node 22.23.2, then stopped:
# index 200, pack.json 200 with SHA-256 0c4b2648...2260, campus.json and s1-head-W.glb 200 at their pinned bytes.)
node packages/foundry-floor/dist/campus/standalone/serve.mjs --port 4700 --verify

# The campus data and its nine checks; the drive check
./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/build-campus.ts --check
./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/drive-check.ts

# Stage ffc1 (never staged/ff2), then build dist/campus (the build restages ffc1 and writes evidence/build/ffc1/)
./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/stage-campus.ts --force
./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/build-campus.ts public test dev

# Captures, package tests, the kit contract suite and the B-04 probe (headless, ports 4700 to 4749)
./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/capture-campus.ts
./scripts/toolchain-run.ps1 test packages/foundry-floor
./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/contract-campus.ts
./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/callback-probe.ts

# Gates
./scripts/toolchain-run.ps1 run typecheck
./scripts/toolchain-run.ps1 run lint
```

While the site builder reads `dist/standalone/` and `staged/ff2/`, do not run FF2's `tests/tools/build.ts`: it restages
`ff2` and rebuilds `dist/standalone`.

## Processes

- Every server and headless Chrome I started was closed in `finally` blocks. The contract suite's Chrome profile was
  removed, and so was a Chrome URL-fetcher folder a probe left in the package `.tmp`.
- Ports used: only 4700 to 4749 (the contract suite used 4700 to 4704; the serve checks used 4720 and 4721). Nothing on
  8000 to 8099, 8123, 4175, 4400 to 4499 or 4600 to 4649 was touched.
- At the end, no listener was open on 4700 to 4749 and no Chrome of mine was running (checked 11:22).
- The hub, the tablet and the Browser pane were not used.
