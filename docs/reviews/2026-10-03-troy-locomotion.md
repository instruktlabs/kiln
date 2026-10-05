# Troy first locomotion prototype

3 October 2026. Follow-up to [actor-transform integration](2026-10-03-troy-runtime-motion.md).
The production goal remains active. This is a saved Greek-soldier prototype in the
external authoring workspace, not final motion acceptance or a scene/site release.

## Result and preserved scope

`troy-expansion/motion/` restored Greek soldier parent
`r_647e60b4c8c94640aca8a8266a371b0f` with its five exact material pins. The original
GLB rebuilt byte-for-byte. Child `r_1483de05d4fe400a910e5d23004fa7c4` adds `walk`,
`walk_start` and `walk_stop`, preserving the parent's existing idle/attack body
channels. All non-clothing geometry except the empty left hand is unchanged;
material parameters and embedded texture bytes are identical. The sword remains
on the original right-hand socket with its original grip geometry.

The first gait exposed thigh penetration through the rigid tunic. Reducing excessive
foot lift helped but did not resolve it. A wider rigid-shell trial still intersected
the thighs. Those drafts are retained. The selected prototype divides the original
shell profile into twelve overlapping, closed linen panels, hinged at the waist and
driven by leg angles. The same panel tracks accompany idle and attack. This uses
rigid transforms, not cloth simulation. The empty left hand now has relaxed fingers
instead of an unoccupied circular grip.

Current source ref: `p_0bb7e4defea8` in this workspace. GLB: 595,152 bytes,
SHA-256 `19292c078ddca6e7331f1b379f57f45cff36564331079bf15b8b1ebb4fd770a3`.
Original revisions and source/material provenance remain intact. The child identifies
Codex refinement separately from the parent's Claude Opus/Claude Code attribution.

## Motion contract and evidence

- Walk: 1.2 seconds, 0.8 m forward root travel per cycle, 2/3 m/s; approximately
  3 cm swing clearance. Root translation belongs to the consumer, not the clip.
- Start: 0.775 seconds, 0.31 m forward travel, joins walk phase zero. Stop:
  1.14 seconds, 0.38 m travel, enters from walk phase zero and returns to guard.
  Arbitrary-phase stopping and general clip blending are not implemented.
- `check-walk.mjs`: 577 exported-animation samples over two cycles; maximum stance
  Z variation approximately 0.0228 mm, minimum foot bound -0.0874 mm. These are
  sampled flat-plane checks, not a continuous collision proof.
- `check-transitions.mjs`: no measured position gap at the four clip joins;
  raw quaternion angular comparison below 0.000451 radians. Maximum stance Z
  variation is about 0.0138 mm during start and 0.0075 mm during stop.
- `check-garment.mjs`: zero strict triangle crossings between thighs and the
  specified lower-tunic region across idle, attack, walk, start and stop at
  approximately 240 Hz. Waist contacts, panel overlaps and other body/equipment
  pairs are outside that check. A focused segment/triangle fixture covers an actual
  crossing, a miss and excluded endpoint contact.
- Material-faithful sheets were reviewed. `runtime-lab/evidence/motion-07/`
  contains ten front/side ground-plane captures per backend, plus live progression
  through start into walk, on WebGPU and WebGL2 with no page errors. This is an
  original-hierarchy preview; no new crowd bake or performance qualification is
  implied. The earlier `motion-06` captures remain available.

The interactive review is `http://127.0.0.1:4421/motion.html`. Its sequence holds
the initial guard, starts, walks two cycles, stops and idles. Replay is an explicit
restart; it does not hide a resetting actor among a crowd. It verifies the GLB hash
before parsing. The full scene on 4420 still uses the previously staged idle assets.

## Next boundary

Later progress: [independent crowd clips and fore-deck probe](2026-10-03-troy-crowd-clips.md)
records the new-clip bake checks and first supported flat-deck routes. The remaining
terrain/disembark scope below is still open.

Review movement quality in context, port the required motion to the other actors,
and requalify source/baked playback of the new clips. Build one complete landing
slice with a single stable actor roster, ship support, an actual egress route,
terrain/deck contact and phase-aware clip changes. Slopes, boat motion, hands and
dynamic equipment, archery, hero duel, crowd LOD/culling and physical mobile remain
open. No timed performance run was made for this authoring work; future runs must
follow the owner-requested quiet-machine/minimized-Codex protocol.
