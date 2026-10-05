# Troy fleet block hands and natural oar grips

The live fleet now uses the saved solid block-hand donor already used for archer
hands. The wrists follow the forearms, with a contact point inside each block
meeting the actual oar shaft. The same hand source carries through rowing,
parking, oar release, standing, unloading, shore idle and regroup marching.
No additional standalone asset revision or engine runtime change was needed.

The exact donor is revision r_2afc9ff07e944c70be5236f263c3f9bc, program
p_590bc5044275, source SHA-256
590bc5044275c42d1661e886effbf7b8f5ff551bbcf1ff7f4116d6c4b4fd6906,
GLB SHA-256 bc27825236545247ffe4fea06029637dc23a6551ebfc603382d75e38484e343c.
The complete saved GLB is copied byte-for-byte, preserving its material images
and non-hand geometry. One compact visible mesh remains under each hand frame;
hidden finger joints remain for skeleton compatibility.

Actual palm/oar surface checks found a chest contact at the end of the original
pull. The spine now leans backward on the pull, using .16 + .40 * stroke radians
instead of .28 + .28 * stroke. The release baseline matches .16 radians. The
contact lies 80 mm down the hand from the wrist, inside its 95 mm solid envelope;
that is an internal attachment coordinate, not a measure of shaft penetration.
The hand stays aligned with the forearm while the invisible socket follows the
shaft. This is scene-specific pose work and does not add per-actor IK to packed
rowing, idle or shared walking playback.

Vessel GLB, queue, arrival profile and placement are preserved byte-for-byte.
Paired old/new rowing checks preserve seating, feet, pivots, feathering and
parking transforms across all 28 seats. Actual hand triangles meet the actual
oar shaft and clear the cuirass/helmet by the checked 1 mm margin across sampled
rowing and release poses. Release/stand/aisle boundary hand vertices stay
continuous under tiny time probes, and forward/reverse unloading and idle
preserve forearm alignment. Cached and subtree pose paths agree to 1e-9 across
the checked all-seat forward/reverse seeks. These are sampled, bounded checks,
not general continuous collision or neighboring-actor clearance proof.

Current runtime versions are landing-v11 (row bank), crew-v3 (subtree unload),
crew-block-cached-v1 (cached alternative), crew-idle-v2, regroup-block-v1 and
walk-block-v1 controllers, formation-idle-v2 and walk-bank-v2 banks. Packed
route data remains regroup-v2; its record and plans are unchanged. The reference
and single hybrid landing imports also point to the new landing source, while
older explicit landing experiments remain historical. Exact manifests and
new pose-source dependency hashes admit the final02 banks. Experimental01
outputs predate the final posture repair, remain preserved and are not admitted.

| Bank | Clips | Parts | Transform bytes | Checked reference error |
| --- | ---: | ---: | ---: | --- |
| Rowing | 28 | 39 | 2,384,928 | 0.726 mm mesh, 0.718 mm grip point |
| Shore idle | 28 | 39 | 2,384,928 | 1.002 mm mesh |
| Formed idle | 33 | 39 | 2,810,808 | 1.009 mm mesh across 224 stances |
| Shared walk | 92 | 39 | 5,381,064 | 2.347 mm donor; 7.808 mm sampled route approximation |

The old banks had 69 parts. Their combined stored transform payload falls
from 22,932,288 to 12,961,728 bytes, a 43.5% reduction. This is a file/payload
measurement; GPU allocation and frame cost have not been qualified. Independent
quarter-frame checks cover 10,108 rowing poses and 10,108 shore-idle poses;
formed idle covers 80,864 placed poses. Walking covers every donor at eighth
frames plus 24,192 selected route-phase poses. Bound checks report no sampled
escapes. Walking keeps the earlier 12 mm mesh / 8 mm foot approximation gates,
with measured foot error 4.205 mm; it is not a full-route continuous bound.

Decoded rowing is also tested with normalized quaternions and actual triangle
contacts: 20,216 hand/oar contacts and 40,432 hand/body clearance checks pass
over 10,108 poses. All 147 current scene tests pass. Ten actual-scene captures
cover rowing at 0 s, initial unload/release at 55 s, landed idle at 170 s,
marching at 390 s and formed idle at 595.175 s on WebGPU and WebGL2 with fleet
culling enabled. Three source close-ups inspect pull, reach and completed stand.
The new Rowing hands view frames the primary crew at time zero for review.
Complete scene accessibility records were re-observed at the same poses on
unchanged source after correcting the initial diff-only state export. Auto
graphics may differ between image capture and that later state observation;
source close-up state records retain their delta format. Neither record
establishes graphics or performance parity.

The scene shows 528 Greeks, 192 Trojans, 12 ships, 48 archers and two separate
heroes. All 336 fleet crew now join the 336 ordinary formation infantry, 48
archers and two heroes in the simple hand style. Infantry-v1, archer-v5 and
the saved hero source children are unchanged. Browser Auto water selected
balanced on WebGPU and low on WebGL2 under multi-tab local load. The WebGL2
tab briefly timed out during a large timeline seek and recovered through native
controls. Screenshots do not qualify backend pixel parity, shadows, frame
tails, startup costs or supported-device performance. Console results are
recorded with the exact receipt rather than inferred from appearance.

Evidence and source snapshots are in
troy-expansion/scene/evidence/fleet-block-hands-01/receipt.json. Old runtime
versions and failed/stale candidate evidence remain recoverable. No commit,
push, deployment or owner acceptance is claimed. The full completion goal stays
active. Shared resources, dark bronze appearance, current shadows/culling,
isolated hub/device costs, terrain/ocean/aerial stability, city routes, reusable
workflow and maintained/package skills, final playtest and acceptance remain.
