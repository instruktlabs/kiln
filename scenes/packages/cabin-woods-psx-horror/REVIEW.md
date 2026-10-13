# Cabin in the Woods: release review

Approved 2026-10-12. The owner approved the scene, both photographs and all release
actions: commit, push, merge, npm 1.2.3 publication and site deployment. Dogfooding
follows publication. The evidence below records the reviewed candidate; it is not
a claim that publication has already completed.

Release preparation preserves the same 53 asset revisions. Public availability is
enabled and pending-review presentation copy is removed. The runtime change after
review only removes a hardcoded `ownerVisualApproval: false` diagnostic field.
The resulting bundle is `game-iHAxN1tn.js`; the scene ZIP is
`869f25399eb308e40173705c679bb0d42c133e16e9cf4514204bb706eefa1b2b`.
The historical candidate identities and timings below remain attributable to the
original reviewed build.

## Reviewed candidate (before publication preparation)

- Selection: `1cedd25a9ebc757b28054c03ee87afc3f388bd72740f6ea8778afefc8278ede7` (53 exact revisions).
- Game JavaScript: `game-DPbVtMBx.js`, SHA-256 `2a718765f739c867c32428e87acfe461215a7dc490ec4ca364fe6ad7da663dd7`.
- Source manifest: `d8b93653dc89f48552634df7e327f88ddb2c9c57d15477f0aabcc00f9e6f479f`.
- Runnable scene ZIP: `18a820f5876e422e9afc7aeac4f69c7f5802aac92773b748d2a2abe12055764f`.
- Site artifact manifest: `a2edb0071e07837583c8440ba52d1990d8f64b63ee8c2e8b9de4d21d087ecbc6`.
- Site source manifest: `8c81c5eb1871f625fad7c30746393834b92ff1e266eb126c3de8bf15f1c479f5`.
- Public availability remains false. Review locally at `http://127.0.0.1:4540/scenes/cabin-woods-psx-horror/`; hub review uses port 4544.

## Changes ready for review

The scene shares matching textures/materials, batches compatible furnishings and woodland,
retains lightweight static placements, releases loader/parser ownership, caches collision
records and uses bounded targeting queries. Moving parts and saved asset provenance remain
separate from optimization derivatives. The forest density is preserved.

The Caretaker starts unarmed with the left flashlight on. The approved porch light is on in
aerial/orbit presentation and off in Play. The shotgun join, elbow poses, grips and reload
framing have been revised. The hearth uses textured flame geometry and embers whose size
and light track fuel; the actual 90-second decay/refuel cycle was checked.

The approved aerial/interior images appear on the README and site presentation surfaces.
Gallery, pack and scene use the same 53 saved revisions. Site markup fixes omit empty image
srcsets, distinguish pack/scene metadata and keep embedded runtime/source HTML out of search.
Source HTML dependencies are checked relative to their downloadable project root.

## Headed hub measurements

Chrome 150, NVIDIA GTX 1660 Ti Max-Q, hardware WebGPU, actual desktop `:0`, no Xvfb or
headless rendering. No viewport emulation: native window dimensions produce a 1280×720 CSS
canvas and 760×427 rendering buffer with PSX pixels enabled. These settings matter; this is
not native-resolution 1280×720 GPU performance. Host contention was checked before/after;
unrelated background CPU was about 4.4–5.6% of one core.

Each representative view has about 20 seconds of measurement after warmup. Aerial/orbit
were recorded before a test-harness duplicate Escape exited the iframe; the remaining views
were resumed in a fresh scene instance. All rows use identical game JavaScript. The final
site-only metadata changes leave JavaScript, CSS, models and gameplay unchanged.

| View | Median ms | p95 ms | p99 ms | Maximum ms | Draws at sample end |
| --- | ---: | ---: | ---: | ---: | ---: |
| Aerial | 8.3 | 8.4 | 8.4 | 16.7 | 162 |
| Orbit | 8.3 | 8.4 | 8.4 | 16.7 | 166 |
| Living room | 8.3 | 8.4 | 8.4 | 16.7 | 49 |
| Kitchen | 8.3 | 8.4 | 8.4 | 16.7 | 71 |
| Bedroom | 8.3 | 8.4 | 8.4 | 16.8 | 130 |
| Storage | 8.3 | 8.4 | 8.4 | 16.7 | 89 |
| Hearth | 8.3 | 8.4 | 8.4 | 16.7 | 44 |
| House walking/turning | 8.3 | 8.4 | 8.5 | 16.7 | 86 |
| Forest walking/turning | 8.3 | 8.4 | 8.4 | 16.7 | 38 |

Draws are actual total submissions at the sampled endpoint, not maxima over the route.
All 46 placed asset families were submitted across the review views/presets; seven pack-only
families are not claimed as scene placements. The soft 100-draw target is exceeded in some
views, without exceeding the 60-FPS frame budget in these representative samples apart
from timer precision around 16.7 ms.

A separate 160-second uninterrupted normal-mode forest walk/turn sample recorded 19,183
frames: median 8.3 ms, p95/p99 8.4 ms, maximum 16.8 ms, no gaps above 20 ms and no page errors.
Benchmark recording was off, with no trace or heap profiler attached.

CPU p95: collision records 0.1 ms in every view; model/animation updates 2.6–2.9 ms;
render submission 3.8–5.0 ms. These are CPU categories, not GPU execution timings.
An ABBA benchmark-off/on/on/off comparison had the same 8.3 ms median and 8.4 ms p99;
maxima were 8.5, 25.0, 16.8 and 16.7 ms respectively.

## Remaining limitations

The occasional hitch is not eliminated. Earlier traces attributed a pause to main-thread
major GC, including a frozen-world case without doors/gameplay updates. Correcting the
CSS viewport did not remove that case. The precise costly V8 epilogue substep remains
unattributed. No forced-GC flag, artificial frame cap or blanket static-transform patch
is used to hide it. The clean final walkthrough is bounded evidence, not a hitch-free guarantee.

Twenty seconds of normal active-play allocation sampling (including collected objects)
estimated 932,981,332 bytes over 2,415 frames. Sampling itself adds overhead; this is an
allocation estimate, not retained heap or a leak measurement. Model/update, bounds and
renderer stacks dominate the sampled list. The earlier retained-heap reduction to about
29 MB does not imply allocation-free frames. `pmndrs/math` was evaluated separately and
not adopted: correctness matched, but its isolated saving did not establish a scene-frame win.

Full Kiln import/remix was qualified against the current working-tree engine, not the
published npm release. Runtime GLBs and the portable scene do not require Kiln. Mobile play
and other GPUs are unqualified. Final visual acceptance remains the owner's decision.

## Validation and receipts

- Fresh extracted source: frozen install, 109 hydrated inputs, 188 passing tests, all 112
  rebuilt runtime files byte-identical to the maintained build.
- All 53 canonical GLBs match exact revision IDs, fresh-workspace rebuilds and served bytes;
  a separate FPS remix changes the model while preserving all ten clips.
- All 53 gallery routes, 265 per-asset download hashes and three pack archive hashes checked.
- Site tests: 646 passing, two skipped; two Windows symlink-creation EPERM failures.
  The exact deployment suite passes all 48 tests on Linux, including the two symlink cases.
- Gameplay: door, TV, window breach/repair, withdraw/saw/chop/store, tree harvest and
  encounter checks passed. Actual-site fullscreen, pointer lock, movement, equipment,
  firing/reloading, flashlight and iframe disposal passed. All 53 gallery models opened
  in hardware 3D; both photos loaded on all five presentation routes; all three downloaded
  archive hashes matched. No browser errors or failed responses were recorded.
- Final static validation: 281 HTML documents, zero HTML or link/metadata/sitemap errors,
  zero description-length warnings. Privacy and public-text scans passed.
- Final Astro check: 81 files, zero errors, warnings or hints.
- Actions runner restored active/running. ExpressVPN and WARP remain inactive at the
  owner's explicit request.

Detailed receipts and screenshots live in
`C:/Users/Mattm/X/nightman-rebuild-audit/presentation-qualification-20261012/`:
`review-final-profile-*.json`, `review-final-long-active.json`,
`review-final-instrumentation.json`, `review-final-allocations.json`,
`review-final-draw-coverage.json`, `review-final-interactions.json`,
`site-final-static-validation2.txt`, `integrated-review-site-proof.json` and
`review-final-restored-services.txt`.

The next authorized step is owner review. Release actions require explicit approval for
the reviewed candidate and the specific actions; material changes require renewed review.
