# Troy continuous-looking terrain and ocean

4 October 2026. Follow-on implementation under the active completion goal.
This supersedes the geometry/coverage next action in the
[material checkpoint](2026-10-04-troy-terrain-materials.md); that report keeps its
original source, failures and cost scope. The full Troy goal remains incomplete.

## Implemented

The preview defaults to `environment=continuous`. Beach and mountains meet at
Z = 1,850 m on identical boundary vertices, with no overlapping faces. Sand and
rock colours blend over the next 250 m. The original 193 × 193 contact grid,
heights and triangle diagonals are preserved exactly. Current city, feet, planks
and shore wash retain their ground. Saved assets and motion banks are untouched.

The fixed world-coordinate mesh extends to X ±16,384 m and Z ±16,384 m, with
progressively coarser samples away from the scene. Mountain coverage now matches
the beach width and continues into broad surrounding ridges. Water extends to
the same lateral/offshore bounds while retaining every existing near grid row and
column in all three quality tiers. Wave phase, shoreline masking and noise stay
in world coordinates. There is no moving origin, terrain regeneration per frame,
new GPU compute pass or additional environment draw.

This is finite geometry beyond the preview's admitted view envelope, providing
the requested appearance of continuity. Orbit targets are bounded to X/Z
±6,000 m and Y -16…600 m; orbit distance remains at most 1,800 m. Moving the target
at a boundary retains the camera offset. The outer edge is therefore farther
than the camera's 6,000 m far plane even at an extreme target. Fog finishes at
5,600 m before clipping. There is no claim of unrestricted travel or a physically
curved ocean. Future traversal outside the preserved near grid must use the
actual coarse mesh surface; analytic hill height alone is not a contact test.

Current ground: 42,570 sand vertices and 9,460 rock vertices, 102,720 triangles.
Balanced ocean: 9,768 vertices and 19,140 triangles. The two ground draws and one
opaque shore-water draw remain. Ground position/normal/colour/index data grows
by about 0.67 MiB from the earlier checkpoint. Procedural colour plus its shared
texture now uses about 0.93 MiB; near rock can read two packed samples while
blending sand into rock, and its far material reads neither. Driver/pipeline,
temporary generation buffers and total-scene allocations are not qualified here.

Use `environment=legacy` for the prior overlapping, finite environment.
`depth=standard&surface=flat&environment=legacy` restores the original comparator.
The new setting does not change the exact nearby crowd/ship representations.

## Evidence and cost

Local scene tests: 67 pass, no failures or skips. Tests verify all original dense
vertices, diagonal orientation, exact boundary equality, deterministic bounded
meshes, water-grid preservation in every tier, camera-offset preservation and
the material transition. The first test command incorrectly named the tests
directory as a test file; its failed invocation is retained separately from the
successful wildcard run. It was a launcher error, not a test failure hidden by
the passing result.

Both hardware backends are checked at 1,440 × 900 with 16 fixed views, including
close shore, aerial, eastern/western shore, sea and land horizons, mountain join
and extreme orbit. The final actual-default suite additionally records 96 camera
travel samples, low/high/balanced water transitions and exact frozen aerial return.
WebGPU passes the final suite, including exact return. WebGL2 completed the 16
views, 96 travel samples and all quality transitions without runtime errors or
warnings, but its final exact-return check fails: 19 pixels differ by one colour
level, none by more. Camera quaternion, world, view and projection matrices are
identical at both endpoints. The receipt remains `failed`; the check was not
relaxed, and pixel repeatability remains open. These checks do not establish
full frame-pacing or owner visual acceptance.

The first visual candidate removed overlap but exposed corrugated height and
stretched vertex colour on the finer mountain mesh. The next candidates smoothed
the hill modulation and baked lower-frequency rock colour appropriate to the
grid. Those candidates remain in the evidence. One intermediate WebGL2 return
failed by 19 pixels at one colour level, none above 30; a subsequent run passed
exact return, with identical retained camera transforms. The original failure is
retained and its intermittent cause is not claimed resolved. The exact check
was not relaxed. Final acceptance must consider travel/appearance and devices,
not just a successful repeat of this check.

Hub stage `troy-terrain-perf-04` verified all 362 browser files (82,243,973 bytes)
against the local manifest. The original hub source was not modified. Sequential
headed hardware Chrome used the GTX 1660 Ti Max-Q, WebGPU/WebGL2, balanced water,
reversed depth and LOD materials. CPU admission samples stayed below 1.4% and
before/after GPU utilization was 0%; no post-boot agent turn was active. Each view
has 240 known GPU samples after 20 warm-up frames. Both candidates replay the
same early scene times, about 0.33–4.32 seconds; later landing endpoints still
need integrated performance checks.

GPU render means, milliseconds:

| Backend | View | Legacy coverage | Continuous coverage | Difference |
|---|---|---:|---:|---:|
| WebGPU | Shoreline | 5.360 | 5.129 | -0.231 |
| WebGPU | Aerial | 7.316 | 6.973 | -0.343 |
| WebGPU | Mountains | 4.249 | 3.817 | -0.432 |
| WebGL2 | Shoreline | 10.676 | 10.554 | -0.122 |
| WebGL2 | Aerial | 12.428 | 12.615 | +0.187 |
| WebGL2 | Mountains | 7.886 | 8.442 | +0.556 |

CPU submission means, legacy → continuous: WebGPU 7.822 → 7.537,
8.873 → 8.582, 6.468 → 6.154 ms; WebGL2 9.586 → 9.430,
11.447 → 11.058, 7.673 → 7.868 ms. Sequential variation prevents speedup claims.
The widest measured increment is 0.556 ms in the WebGL2 mountain view, about 7%.
These are warmed rendering costs; actor updates, natural frame intervals, startup,
device tiers and mobile remain unqualified. Post-await reset draw counters are
not draw-count evidence. The bounded results support continuing with this coverage
default, not declaring final Troy performance accepted.

The staged candidate explicitly selected continuous coverage. The later local
change selected it by default and exposed a read-only camera-transform diagnostic;
neither changes the selected terrain, material or water graph. Final actual-default
captures retain the current hashes. Source edits, agents and analysis stayed local;
the hub hosted only identified measurement candidates.

Evidence root:
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene\evidence\`:

- `terrain-continuous-01` through `05`: original candidates, source snapshots,
  functional results, visual changes and the original intermittent return failure.
- `terrain-continuous-default-01`: final default views, travel/quality transitions,
  source continuity and `local-tests.tap`.
- `terrain-perf-04`: staged source/manifest and all four returned raw hub receipts.

## Remaining

Environment owner review and physical-device checks remain open. Current routes,
plant placement, walls and city are still a blockout. No camera/actor ground
collision or unrestricted landscape traversal is implied by these orbit tests.
Next production work is a complete landing/formation/archer/hero/gate/courtyard
slice, followed by full composition and integrated performance. Later crew onward
regrouping, equipped archers, optional duel, horse running, shadows, reusable
derivative/skill proof, revision pins, source rebuild, site delivery and acceptance
remain governed by the completion plan. No commit, push, deployment or canonical
asset repin occurred in this checkpoint.
