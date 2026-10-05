# Troy natural block-hand grips

Current local checkpoint: all 48 packed archers use `runtime/archer-v4`, the same
saved one-piece block-hand donor `r_2afc9ff07e944c70be5236f263c3f9bc`, and newly
rebuilt `archer-bank-14`. The owner affirmed that these simple hands look better
and asked for straighter wrists with tasteful overlap when holding equipment.
The appearance of the resulting grip still needs owner acceptance.

## Fit and motion

The earlier bow pose kept its block just outside the handle by sharply bending
the wrist. A focused failing test measured a 109.6-degree bow-hand bend at full
draw. The consumer now solves the elbow toward the grip using the combined
forearm/contact offset, recovers the forearm direction analytically, and aligns
the block's long axis with it. The bow-support contact sits 55 mm to the side and
45 mm along the hand; the drawing contact sits 70 mm along the hand and 20 mm
across its thickness. This puts the nock 5 mm inside the 50 mm-thick block.

The bow handle overlaps the block by approximately 10 mm. Source checks bound
overlap at 5–13 mm across 361 sampled cycle poses, preserve finite handle/hand
intersection, and check the embedded nock against the actual block envelope and
triangle surfaces. The hand remains visible, with no added fingers, thumb or
grip opening. Full-draw bow-arm extension and the drawing elbow's outboard,
below-head position, forearm alignment, head/cuirass clearance, bow/string/helmet
clearance, planted feet, and projectile behavior remain checked.

A first iterative fit passed sparse contact tests but failed the adaptive bake
with a pose branch between samples. That candidate was discarded; `archer-bank-13`
is the unsuccessful directory. The closed-form fit passes the adaptive bake and
independent interval checks. Both wrists also retain continuous position and
roll at retrieval, draw, release and loop boundaries, and seeking remains
deterministic. Standalone saved geometry, generic sockets, body and bow sources
are unchanged. This is a scene attachment/controller change.

## Evidence

All 132 scene tests pass. The installed bank has 65 parts, 560 frames and
2,988,160 binary bytes. Independent decoded-bank checks cover 567 times and
3,498,462 visible vertices: maximum position error 1.240 mm, deforming-normal
error 0.003267 radians, and drawing contact/nock gap 0.918 mm. Decoded palm radial
distance from the 30 mm-radius handle lies between 19.140 and 20.222 mm. Packed
wrist alignment is also checked independently against decoded forearms.

`scene/evidence/archer-natural-grips-01/receipt.json` records exact input, bank and
source hashes, snapshots, tests and six actual-scene screenshots. Retrieval,
full draw and release were inspected on WebGPU and WebGL2 with no logged errors
or warnings. Auto water chose balanced on WebGPU and low on WebGL2; these checks
are not pixel-parity evidence. They do not establish current shadows, hub/device
costs or owner acceptance. The live scene keeps packed animation playback; no
per-actor per-frame IK was introduced for these archers. No performance gain or
qualification is claimed.

## Continuation

Apply the simple block style to fleet, infantry and champions. Fit each role's
oar, sword and shield mounts to a natural arm/wrist pose, allowing a modest
intentional overlap when it improves the stylized grip. Do not force zero
penetration at the expense of wrist anatomy, and do not infer that this bow
fit qualifies other equipment. Rebuild all affected motion data, contacts and
bounds, then inspect the actual transitions and equipment poses.

The wider completion goal remains active: current shadows and matched full-load
performance/device checks, later landing routes, terrain/aerial stability,
gameplay and bots, reusable derivative workflows and maintained skills, required
engine work, site delivery and final owner acceptance.
