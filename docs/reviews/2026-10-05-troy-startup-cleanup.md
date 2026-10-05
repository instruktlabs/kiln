# Troy startup cleanup and current hub stage, 5 October 2026

Failed fleet startup previously retained two pose texture leases after formation
bank admission failed, and five after later-wave shore admission failed. The two
focused tests reproduced those failures before implementation.

Scene resource scopes now record acquisitions, release them in reverse order,
continue past a cleanup exception, await asynchronous completion, and close once.
Borrowed fleet resources remain owned by their caller. Partial shore, offshore
and later-wave constructors release their own leases and generated batches.
Fleet source loading closes parsed source resources when a later acquisition fails.

The root scene owns loaded GLB geometry, materials, textures and image bitmaps,
its created instances and terrain/water resources, actor runtimes, controls,
listeners and panels. Shared source resource objects close once. The current
water tier is released through its mutable owner. Normal shutdown removes the
animation loop, resize/rejection listeners, view buttons and playback panels.
Failure preserves the primary diagnostic; cleanup errors have separate diagnostics.

Five focused checks and all 160 scene tests pass. The Node construction fixtures
explicitly match the browser Three.js import map and strip images only for CPU
fixtures. Actual image/material behavior was checked separately in the browser.

Eight injected startup failures pass across WebGPU and WebGL2: an unavailable
first asset, bad formation manifest, bad Trojan infantry digest and invalid final
view. Every case completes all registered cleanup callbacks, releases every pose
lease/texture/payload and leaves zero playback panels or generated view buttons.
Both backends recover to normal full-scene loads. Rowing and marching records
preserve previous input pins, counts and actor positions. Two normal double
disposals finish all 527 root cleanup registrations without duplicate release.
Fourteen captures and raw receipts are in scene/evidence/startup-cleanup-01.
The eight console errors are precisely the injected fixture failures; no
unexpected warning/error was captured.

This is bounded failure-path evidence. It does not prove all parser/renderer
failure paths, startup cancellation/deadlines, first usable interaction, physical
heap/VRAM reclamation, device fallback or performance. Runtime shaders, source
assets, pose banks and routes are unchanged; the receipt verifies 346 unchanged
prior checkpoint files and exact previous snapshots of five changed loaders.

The complete current browser candidate is staged on the hub at
/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-current-runtime-stage-01.
It matches 501 browser files (118,969,767 bytes) and 1,263 Three.js dependency
files at 0.186.1. Archive SHA-256:
b5ff7fc352662e372ad5b4c6b41a7f5bb70a92ff59186da0a2b0c7c2c5a47512.
Local package and returned hub stage receipts are under
scene/evidence/current-runtime-stage-01. Original hub work remains intact.
The preparation probe observed no post-boot agent turn, CPU below 1.3% and GPU
at 0%; this is preparation evidence, not timing admission for a future run.
New measurements must recheck admission and identify their actual runner,
camera/time workload, backend/adapter, viewport and dependency identity.

The full goal remains active. The next runtime work is current complete-workload
costs, animated shadows/culling, supported-device policy and startup/fallback.
Later crew destinations and city routes, environment acceptance, hero/bot/input
feel, unrelated-asset workflow proof, maintained/package skills, final owner
acceptance and explicitly approved site delivery remain open.
Nothing was committed, pushed, deployed or published.
