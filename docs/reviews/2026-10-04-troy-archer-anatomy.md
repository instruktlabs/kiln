# Troy archer right-arm correction

4 October 2026. The owner rejected the default archer's drawing arm: its elbow
folded inward and behind the head/body. Earlier functional and reconstruction
checks had not established anatomical or visual acceptance. The correction is
now in the normal CPU controller and the default packed bank for all 48 archers.

At full draw the previous elbow was at approximately `[-.026, 1.519, -.131]`
relative to the actor, inward of the right shoulder at `[-.204, 1.360, .035]`.
The corrected elbow is approximately `[-.471, 1.458, .088]`, with the forearm
running forward along the arrow line. The old controller also failed sampled
forearm/chest clearance during nocking. The actual saved bow/hand/body GLBs were
inspected; those masters remain unchanged.

The reference now carries the arrow around the right shoulder before turning
it forward, raises the bow before drawing, and uses an outboard bend direction
for the two-bone solver. The quiver is fitted farther right/lower in this scene;
equipped arrows are scaled to 1.29 of the master length and draw travel is .775 m.
These are consumer dimensions, not changes to standalone asset requirements.
The string hand uses three hooked fingers and a relaxed little finger. Release,
ballistics, recovery, planted feet and exact seeking remain supported. A further
regression caught a 29.85 mm right-elbow jump at loop reset; the bend direction
now blends back to rest during recovery.

The pose direction follows the drawing-forearm/arrow alignment guidance in the
[USA Archery manual](https://www.usarchery.org/resources/adaptive-archery-manual-220319172814.pdf)
and [World Archery coaching manual](https://extranet.worldarchery.sport/documents/index.php/Coaches/Accreditation/Coaching_Levels/Coaching_Manual_Level2.pdf).
These references inform the controller; they do not establish owner acceptance.

Three focused regression tests cover outboard/full-draw forearm alignment,
sampled forearm clearance from head and cuirass throughout the nine-second
cycle, and continuity across movement boundaries and reset. The original
anatomy failures and the later loop failure are retained before their fixes.
Clearance checks sample a centreline against transformed mesh bounds; they are
not a continuous all-surface collision certificate.

All **92 scene tests pass**, including existing hand/grip surfaces, source
immutability, soles, inverse seeking, 480 phased exact-projectile comparisons
and independent visible-surface bank reconstruction within 2 mm. WebGPU and
WebGL2 each complete **24 views for both the CPU reference and actual default**,
covering eight phases from front, rear and above, without errors/warnings.
The corrected default poses were visually inspected. Captures pin the sources,
inputs and payloads under the external scene's `evidence/archer-anatomy-04/`.
Earlier candidate captures and failed tests remain under `-01`, `-02` and `-03`;
joint records before/after are under `-01` and `-05`.

`output/archer-bank-04` and repeat `-05` reproduce both current payloads byte
for byte: **554 frames, 95 parts, 236 deforming vertices, 3,355,024 bytes**.
Six adaptive passes finish sampled fitting at 1.491 mm. Transform SHA-256 is
`2e5a5393ba5b642d387c85493884cc039ad568a1bd5dfceefb27eddacaff11e7`;
vertex SHA-256 is
`ed58385a519990c0222e348f9f6e428d554ef1002f550573b4b37d63f1e73395`.
The bank's source manifest matches the normal controller. The intermediate
`archer-bank-03` predates the loop fix and is retained as history.

Refresh the existing preview at `http://127.0.0.1:4420/` with `view=archer`;
normal URLs select all 48 packed archers. `archers=reference` selects the single
close CPU reference; `archers=cpu` selects the full CPU comparison.

No current-animation speed claim follows from the earlier
[CPU attribution/bounds measurements](2026-10-04-troy-cpu-bounds.md): their frozen
poses precede this correction. The bow remains a kinematic deformation rather
than a string/limb physics simulation. Full draw-finger/string, equipment/strap,
animated-shadow, certified-culling, startup/resource and owner review remain
open. Heroes, later-crew destinations, city routes, reusable workflow/skills,
asset revisions and final delivery remain required by the active completion goal.
The earlier WebGL2 19-pixel aerial return failure is preserved and unresolved.

Changes are in the private scene workspace under
`C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\review\troy-expansion\scene`.
Engine runtime and maintained skills were not changed by this correction.
No commit, push, deployment, publication or owner approval is claimed.
