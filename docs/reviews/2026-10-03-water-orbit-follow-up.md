# Golden Gate water orbit follow-up — 3 October 2026

**Release direction, 3 October:** Matt confirmed the farmer hand fixes look good,
could not reproduce the water jump in the local candidate, and authorized settling
the performance findings followed by commit, main integration and site deployment.
The [release disposition](2026-10-03-release-disposition.md) records the bounded performance decision.
Troy, physical-device promotion and npm publication remain deferred. Earlier open
water and authorization statements below describe superseded checkpoints.

**Open.** Matt still sees waves jump to different positions repeatedly during orbit.
The earlier phase/foam correction and boundary captures do not establish that his
observation is resolved. No new product-code change was made during this investigation:
a residual cause must be demonstrated before another repair is justified.

## Build identity comes first

A fresh read of `https://kilnstudio.tools/build-info.json` at 17:34 UTC confirms
production commit `b1ac6ee`, Golden Gate `g9`, artifact `5ecbbe76…`. It does **not**
include the prepared water repairs. The local candidate uses `g9-code5`, artifact
`978664da…`, with `index-DhpWxFro.js` SHA-256
`1a01a81a912157936f05a2060f1df377c418607a83567753e4db2b0257bdb556`.
The exact current preview is `http://127.0.0.1:4412/scenes/golden-gate/`; its server
verifies each requested file against the candidate inventory. This URL is local to
the development machine. The served runtime was independently fetched and hash-checked.

A question asking whether the observation is local or on the live site is pending.
Do not infer the answer. If it is production, first reproduce on this identified
candidate. If it is the candidate, record the view/altitude, backend and the repeated
jump before changing code. A working-tree fix is not evidence that the live site changed.

## Competing explanations and evidence

| Explanation | Investigation and current interpretation |
| --- | --- |
| Camera-relative wave phase | The old shader used the wrong sign for the origin correction. The existing repair makes `k·(p−origin) + k·origin − omega·time` independent of the shading origin. Actual TSL tests and earlier before/after captures support that repair. The renewed report remains open until its build and condition are matched. |
| Mesh recentring or level changes | Sixteen additional 2 mm camera crossings cover negative and positive shading-origin and clipmap thresholds. Same-pose controls are pixel-identical; largest whole-image mean maximum-channel difference is below 0.05/255. Edge pixels can differ, so this is not absolute image identity or proof for every route. |
| Flow or texture-offset reset | Three.js Water2 blends two offset flow phases to hide resets. Our shader also blends staggered phases and uses repeated texture offsets. Code review found no new definite reset defect. Frozen-time probes deliberately exclude animation; they cannot rule out a time-dependent fault. |
| Reflection movement mistaken for surface movement | Full-colour and normal-debug probes separate view-dependent lighting/reflections from the wave normal. The high-tier full-colour orbit has a largest center-pixel step of 6/255, with a broad lighting change around the sun direction. This does not qualify every pixel or camera path. |
| A transient first frame | A new probe stops automatic frame advancement and renders one frame per changed camera pose, rather than waiting twelve frames for each settled capture. It does not reproduce a large fixed-point normal jump on the tested far orbit. |
| Backend, depth or adaptive quality | Current high-tier WebGL2 and balanced WebGPU fixed-point orbit probes each vary at most 1/255 between sampled positions. The installed Three.js depth conversion explicitly handles reversed depth. The governor changes live density knobs, not structural water tiers during an orbit. Physical-device behavior and the exact owner's rendering path are not established. |

## Expanded local probes

All five orbit sequences contain 121 poses, including the repeated 360-degree
endpoint, and use a frozen scene time of 12 seconds. An odd 801×601 viewport keeps
the center pixel on the projected water-plane target. The tested renderer is actual
NVIDIA hardware; these are visual diagnostics, not performance measurements.

| Build / probe | Camera radius / height | Largest center RGB-channel step |
| --- | --- | ---: |
| Earlier UI3, balanced normal, WebGPU | 1,200 m / 500 m | 6/255 |
| Current motion3, balanced normal, WebGPU | 1,200 m / 500 m | 1/255 |
| Current motion3, high full colour, WebGPU | 1,200 m / 500 m | 6/255 |
| Current motion3, high normal, WebGL2 | 1,200 m / 500 m | 1/255 |
| Current motion3, high normal, WebGPU, near displaced surface | 80 m / 30 m | 7/255 |

The near probe looks at a plane target while the actual surface is displaced, so it
does not track an identical material point through every angle. Its numbers are
observations, not an invented acceptance threshold. UI3 is a retained earlier
candidate, not a claimed byte-identical copy of the live `g9` build. All diagnostic
pages, browsers and temporary servers reported successful cleanup. The separately
owned local review server remains available for matching the reported issue.

Receipts and image sequences are under `scenes/.tmp/water-reopen-20261003/`.
`tmp/alignment-20261003/water-reopened/` records current/live identities, the file
inventory and the preserved prior qualification checkpoint. Earlier failed or
limited evidence is not overwritten with a pass.

## Open-source comparisons

- [Three.js Water](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water.js)
  samples its normal pattern from world position and treats reflection projection
  separately. That is the appropriate coordinate distinction to test here.
- [Three.js Water2](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water2.js)
  uses two flow phases and a crossfade to avoid visible resets. Its shader and update
  code are a useful reference for testing a suspected temporal discontinuity.
- [Nugget8/Three.js-Ocean-Scene](https://github.com/Nugget8/Three.js-Ocean-Scene)
  documents a camera-centered ocean with scrolling normal maps, illustrating why
  moving geometry and texture anchoring must be considered separately.
- [Mohido/Ocean](https://github.com/Mohido/Ocean) implements the GPU Gems water model
  and offers a normal-map viewer, a useful precedent for separating surface-normal
  debugging from final lighting.

These are diagnostic references, not adopted dependencies or evidence that replacing
our water implementation will fix this report. No external shader code was copied.

## Next repair and validation boundary

Match the owner's runtime first. If the jump persists on `g9-code5`, capture that
path with motion running and frozen, then isolate normals, foam, reflection and mesh
selection. Record the first failing frame and relevant origin/time/quality state.
Add a focused regression that fails on the demonstrated cause, make the smallest
repair, and validate the real orbit on both backends before resealing the scene/site.
Do not close GG-5 on the basis of the bounded probes above.

The 108-minute matrix is not required for this checkpoint. After a water-only repair,
paired 60-second balanced orbit, high orbit and flyover cases total six measured
minutes, plus loading/quiet checks. Existing D41 limits remain unchanged. Repeat a
long Farm sample only if shared frame or Farm code changes, or a late pause recurs.
The historical aggregate timing audit stays failed; its result is not rewritten by
reducing future scope. See [release preparation](../plans/2026-10-03-release-preparation.md).
