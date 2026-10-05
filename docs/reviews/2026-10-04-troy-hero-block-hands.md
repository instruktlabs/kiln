# Troy hero block hands and natural grips

Achilles and Hector now use one compact solid block per wrist, with forearm-aligned
wrists and modest equipment overlap in the paired duel and playable combat.
The current local scene pins Achilles `r_d106a8a2394f4cdbb61804bfe41fa081` and
Hector `r_f30fc9db17854996a62dae714cc2c835`. Both saved sources rebuild to the exact
integrated GLBs. These are reviewed candidates awaiting owner acceptance.

Each hand is a 70 x 95 x 50 mm beveled block. There are no separate fingers,
thumb, heel protrusions or grip holes. Existing armor, materials, embedded images,
non-hand mesh geometry and exported animation channels are preserved. Two rest
mounts deliberately changed: `socket_hand_left` and `Joint_shield_frame`.
The authored shield handle now lies along the shield back against its bracket;
the entire hand stays behind the plate. All other joint rest transforms remain.

The consumer grip adapter solves the arms to the intended equipment contact and
aligns each wrist with its forearm. Sword and shield sockets move on cloned live
rigs; standalone master assets remain untouched by the runtime. The paired duel's
sword and shield-face world transforms match the previous choreography over 321
sampled times, with maximum matrix difference 2.85e-14. Shield-handle placement
intentionally changed. This comparison does not assert unchanged live arm poses.

All 134 scene tests and four focused authored-asset tests pass. Checks include 161
paired poses and eight playable hero/attack/guard cases with 180 ticks each.
The actual hand triangles remain clear of their own shield, helmet and cuirass
by the tested 1 mm contact tolerance. Source clips were sampled at 41 phases per
clip, across both clips per hero. These finite samples do not prove every future
pose or combat configuration.

Six current WebGPU/WebGL2 screenshots and accessibility states cover the paired
reference and both playable heroes. Choosing heroes, attack commands, pause,
rematch and leaving combat were exercised. Heavy screenshots show the state
after the command; they are not claimed as captured heavy windup. Local Auto
water quality varied with load. These checks do not qualify performance, shadow
quality or backend pixel parity.

Exact source snapshots, asset hashes, previous inputs, intermediate children,
rebuild proofs and test output live in the private authored workspace and scene:
`troy-expansion/scene/evidence/hero-block-hands-01/receipt.json`,
`scene/output/hero-block-intake-01`, `scene/output/hero-block-intake-02`, and
`troy-character-repair-2026-10-04/ws/work/hero-block-mount-integrity.json`.
The earlier source-only integrity receipt correctly records its checkpoint
before scene integration; the current scene receipt records integration.

All 48 archers continue using archer-v4/bank-14 and the same simple hand policy.
Fleet and ordinary infantry still need that style and natural grips, followed by
coherent derivative-bank rebuilds. Current full-workload shadows, hub/device
performance, broader composition, maintained skill lessons and final owner
acceptance remain open. This checkpoint changes authored assets and their scene
consumer; it does not claim an engine runtime fix or completion of the full goal.
