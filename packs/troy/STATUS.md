# Troy status, 5 October 2026

The hub work and in-progress source are on this computer. The current scene is source stage 38; the public artifact is `troy-20261005-02`. This computer owns development and asset authoring. The hub is reserved for isolated performance testing.

Completed: connected coast/city terrain and ocean, procedural sand/rock detail, fleet arrival/unloading/formations, 48 archers with corrected poses, simple hands/grips, differentiated playable heroes, light/heavy attacks, stamina, blocking and bots. Shield rest is at the side; blocking raises it in front with the forearm across the inner plate. A/D strafe correctly. Left/right mouse attacks supplement J/K and touch. Primary controls remain visible; secondary controls start folded, as in Farm/Fab/Bridge.

Stage 38 passes 265 scene tests, 14 actual browser input cases, and three public open/play/Exit cycles on each graphics backend with complete resource release. Twenty-one assets have normal gallery pages and 3D previews, CC0 downloads and actual captured pictures. The public scene and pack follow the other website entries.

The retained stage-36 quiet hub matrix measured 52 windows at 1440x900 balanced. All WebGPU case means met 60 FPS; its slowest mean was 62.26 FPS. WebGL2 later unloading measured 59.46–59.93 FPS. Frame tails remain above 16.7 ms, so this is not a locked-60 claim. GPU timestamps were unavailable. Samsung tablet minimal mode measured about 38–56 FPS. These timings qualify stage 36, not the later input/pose edits in stage 38.

Engine typecheck, lint and focused checks pass. Broad local Windows runs retain one asset-import EPERM failure; two site fixtures cannot create file symlinks here. Their assertions remain intact. Exact-commit CI and the clean production build govern release readiness.

The endpoint is this environment and two-hero interaction. Full army casualties, projectile damage, boarding, wall climbing and an RTS campaign are outside it. The optional horse is supplied as an asset; its running-contact work remains outside the active scene.
