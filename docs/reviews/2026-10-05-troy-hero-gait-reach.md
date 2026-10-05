# Troy sustained combat reach repair and current CPU evidence

The current-scene hub run reproduced a live combat failure that short animation
checks missed. The default bot's recovery/approach reversal eventually leaves a
planted foot farther from its hip than the leg can reach. The failed natural
WebGPU run is retained in scene/evidence/current-workload-01; it completed seven
twenty-second windows before failing in combat and is not a performance pass.

A focused test using the actual saved hero models reproduces the failure at
tick 702, 5.8583 seconds, with Achilles standing and requesting light/light/heavy
attacks every 1.1 seconds. The old rig and failing TAP output are retained in
scene/output/hero-gait-reach-intake-01 and scene/evidence/hero-gait-reach-01.

The live rig now completes a foot swing in 0.16 rather than 0.22 seconds. Contact
targets, lift shape, movement rules, weapons and IK reach guard remain intact.
The test runs either hero through the sustained scenario and verifies that
planted soles stay fixed, visible soles do not penetrate the terrain and the
solved contact coordinates match their targets. All 163 scene tests pass,
including existing shield interception, natural grip and moving combat checks.
This does not establish every input/seed combination or owner playfeel acceptance.

The new hub stage is troy-current-runtime-stage-02. Its archive SHA-256 is
5cc9ecd102bbc50f956f72db208f44c12c9f5b2065eceb018bfb23770b1eeb05.
All 501 browser files and 1,263 Three.js 0.186.1 dependency files were checked.
Only hero-combat-rig.mjs differs from the preceding browser candidate; the other
500 files, including assets, banks, routes and shaders, are unchanged.

Six profiled twenty-second windows cover unloading, later-wave handoff and
combat on WebGPU and WebGL2. Each rendered combat window remains actively
fighting after more than 19 seconds and accepts 12 attack requests. Both runs
finish without runtime errors or warnings, close all 527 cleanup registrations
and leave no pose-texture leases. Receipts, CPU profiles and images are retained
in scene/evidence/current-cpu-attribution-01. These include profiler overhead
and do not replace uninstrumented frame-pacing qualification. GPU execution
time is unknown.

The WebGPU unloading profile attributes about 16.2 of 19.6 seconds of sampled
animation-loop activity to updateCrowds. World-matrix propagation accounts for
about 5.0 seconds of self time; renderer submission accounts for about 3.15
seconds inclusive. These are nested sampled costs and must not be added as
independent buckets. In the combat view, fleet updates still dominate sampled
CPU work. The next optimization should reduce redundant pose/matrix work while
preserving exact visible contacts, positions, clocks and shadow behavior.

The failed prior natural run also retains a 2.816-second transition interval.
The profiled transition does not reproduce that interval, so its cause and
first-use conditions remain unresolved. Do not describe it as fixed. Complete
the repeated uninstrumented current-workload matrix against the corrected stage
or a later exact candidate before declaring any performance target met.

The full goal remains active: later-crew destinations, the integrated city
journey, shadows/culling and device policy, reusable workflows/packaged skills,
final source/destination delivery and owner acceptance remain open. No new
commit, push, publication or deployment was performed.
