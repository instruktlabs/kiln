# Golden Gate still-image refresh — 3 October 2026

The owner's request covers the still images on the homepage, scene listing and
Golden Gate scene page. Those three surfaces share the same two image records:
the wide daytime view and the closer driving view. Both have been retaken from the
prepared `g9-code5` runtime; the previous images came from `g9` and `g5` respectively.

The maintained `site/scripts/capture-scene-poster.mjs` workflow captures the actual
scene canvas at 1440×925, using its normal view controls and hiding the HUD. A local
launch wrapper selects headed Chrome, X11 and Vulkan; captured adapter telemetry
confirms NVIDIA WebGPU. The initial default headless attempt was stopped without
using an image. Neither replacement is composited or retouched. Both were visually
inspected before recording them in the media catalog.

The runtime SHA-256 is
`1a01a81a912157936f05a2060f1df377c418607a83567753e4db2b0257bdb556`.
The new PNG pins are:

| View | Bytes | SHA-256 |
| --- | ---: | --- |
| Day | 886155 | `3b75ae261e59a034165ec705d20931484b03600d39fae51c42fc02db22ba42e5` |
| Drive | 728452 | `487793596f730d5424c1b25016fbc27408d6d2ab707c57343acbbc6a52b1bc56` |

The new immutable media paths live under `media/scenes/golden-gate/g9-code5/`.
The media pipeline derives six widths in both AVIF and WebP, plus each full-size
WebP fallback. Historical image pins remain available for rollback. Scene runtime,
GLBs and camera behavior are unchanged by this refresh. Social cards use separate
asset or Farm imagery and do not depend on these two bridge scene captures.

Local capture, build and validation evidence is retained in
`site/.cache/water-reopened-posters/`, alongside the preceding site artifact.
The refreshed local preview uses port 4412. These images are prepared locally;
production has not been deployed.

This image refresh does not close the [water orbit report](2026-10-03-water-orbit-follow-up.md).
If another water repair changes the final runtime, retake these two images again
before release and bind their provenance to that runtime. The 108-minute timing
matrix is not required for a still-image update.
