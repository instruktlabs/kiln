# Kiln and Troy completion status, 5 October 2026

The hub work and in-progress source are on this computer. The current scene is source stage 38; the public artifact is `troy-20261005-02`. This computer owns development and asset authoring. The hub is reserved for isolated performance testing.

Completed: connected coast/city terrain and ocean, procedural sand/rock detail, fleet arrival/unloading/formations, 48 archers with corrected poses, simple hands/grips, differentiated playable heroes, light/heavy attacks, stamina, blocking and bots. Shield rest is at the side; blocking raises it in front with the forearm across the inner plate. A/D strafe correctly. Left/right mouse attacks supplement J/K and touch. Primary controls remain visible; secondary controls start folded, as in Farm/Fab/Bridge.

Stage 38 passes 265 scene tests, 14 actual browser input cases, and three public open/play/Exit cycles on each graphics backend with complete resource release. Twenty-one assets have normal gallery pages and 3D previews, CC0 downloads and actual captured pictures. The public scene and pack follow the other website entries.

The retained stage-36 quiet hub matrix measured 52 windows at 1440x900 balanced. All WebGPU case means met 60 FPS; its slowest mean was 62.26 FPS. WebGL2 later unloading measured 59.46–59.93 FPS. Frame tails remain above 16.7 ms, so this is not a locked-60 claim. GPU timestamps were unavailable. Samsung tablet minimal mode measured about 38–56 FPS. These timings qualify stage 36, not the later input/pose edits in stage 38.

Engine typecheck, lint and focused checks pass. Broad local Windows runs retain one asset-import EPERM failure; two site fixtures cannot create file symlinks here. Their assertions remain intact. Exact-commit CI and the clean production build govern release readiness.

The endpoint is this environment and two-hero interaction. Full army casualties, projectile damage, boarding, wall climbing and an RTS campaign are outside it. The optional horse is supplied as an asset; its running-contact work remains outside the active scene.

## Release and preservation

Public integration is prepared for `/scenes/troy/`, `/packs/troy/` and 21 `/gallery/troy/<slug>/` pages. The source-stage-38 browser seal is `249f9949f18afd73fd38bdac9f38e24b511d1cf05e5f602cb4e23ab23b525005`. The tighter scene pictures were captured from the actual scene at 1440x900. `site/src/data/troy-delivery.json` records the immutable public archive identity.

The user's playfield review led to the final strafe, mouse and shield-rest fixes. The remaining sequence is source preservation, exact-commit CI, a clean production build and live deployment verification. No additional provenance or owner-review flow is required on the public website. No npm publication or cleanup is part of this thread.

The historical stage-36 recovery checkpoint is now sealed at `D:/kiln-recovery/2026-10-05-troy/delivery-release-checkpoint-01.tgz`, SHA-256 `172900f81c3912ea63f89238fbebc9c9231f1c490f6133d34c5a23effe2a4c41`, with all 1,102 entries verified and 35 retained parent archives. The previously failed partial archive remains preserved separately. Current stage-38/public work requires the subsequent final checkpoint; do not confuse the historical checkpoint with the latest release.

Current engine/source bases are `a6d2aa3bc54ae7d8f78fc4cc0d811ac5b4830575` and private `3cdd416`. Local source is in `C:/Users/Mattm/X/kiln-oss` and `C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10`. Latest commits and deployment identity will be recorded after successful release verification.
