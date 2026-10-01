# Golden Gate scene: behaviour

This file specifies the scene's moving parts precisely enough to rebuild them in another engine
(owner direction D-21; PLAN 2.6). The numbers live in the JSON files beside it: `layout.json`,
`traffic.json`, `driving.json`, `tiers.json` and `presets.json`. The frame and units are those of
`layout.json` `conventions`: metres and seconds, right-handed with +Y up, +X west, +Z north, and
the water at Y = 0. The reference implementation is TypeScript in `src/` (`traffic/sim.ts`,
`traffic/traffic.ts`, `play/car.ts`, `play/car-pose.ts`, `camera/flights.ts`, `world/fog-banks.ts`,
`world/route.ts`, `world/alignment.ts`, `world/approach-mesh.ts`, `world/corridor.ts`). Where this
file and the code disagree, the code is the reference and this file is the bug.

Randomness comes from `mulberry32` seeded from the data. To reproduce the web scene exactly, draw
the numbers in the order given below:

```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
```

## Route coordinates

The car and the traffic drive one road, the route (`world/route.ts`): the bridge deck and both
approach roads (section 6). A point on it is a route station `σ` and a lateral offset `d`, in metres.

- **Deck** (`|σ| ≤ roadEndZ`). `σ = z` and `d = x`. The height is the top of the bridge's Roadway.
  Over the deck's last 0.98 m, from the last 1 m row of the Roadway's height grid (|z| = 1032) to
  `roadEndZ`, it runs linearly to the approach's start elevation.
- **Approach.** `σ = sign · (roadEndZ + s)`, where `sign` is -1 for the south approach and +1 for the
  north, and `s` is the approach station from the deck's road end. The point is `C(s) + sign · d · N(s)`:
  - `C(s)` is the centreline;
  - `T(s)` is its tangent (increasing `s`), and `N = (T.z, -T.x)`;
  - `y` is the profile elevation at `s`, level across the road.
- So `σ` grows northward along the whole route, and a lane keeps its deck `x` as its `d` from one
  approach end to the other.
- **Heading and grade.** The route heading is the direction of increasing `σ`: +Z on the deck and
  `sign · T` on an approach. The grade is `dy/dσ`: on the deck a central difference over ±0.5 m, on an
  approach `sign` × the profile grade.
- **Straightened road.** The car and the traffic move in route coordinates, as on a straightened road.
  On an approach curve of curvature `κ`, a lane at offset `d` is `1 - κ d` times as long as the
  centreline. The simulation ignores this; it is at most 2.6 % (the outer lane on the 300 m curve).

## 1. Traffic

### Lanes

- There are six lanes (`layout.json` `lanes`). Lanes 0 to 2 are northbound, at x < 0, inner to
  outer. Lanes 3 to 5 are southbound and mirror them at x > 0. Each lane has:
  - a lateral position `x`, its route offset `d` along the whole route;
  - a cruising `speed`;
  - the vehicle types it allows (`classes`: trucks and buses stay out of the inner lanes);
  - `stations`, the route stations of its entry and exit at the two approach ends, with `entry` and
    `exit` world points there (northbound from the south end to the north end, southbound the other way);
  - a `polyline` along the Roadway from deck end to deck end.
- A lane is one-dimensional. A vehicle's centre is at `s` metres from the entry, where 0 ≤ s ≤ L and
  L = |stations[1] - stations[0]| = 4010.96 m (the 2065.96 m deck plus the 965 m south and 980 m north
  approaches).
  - Its route station is `σ = stations[0] + dir · s`, where `dir` is +1 for north and -1 for south.
  - It sits at the route point `(σ, x)`. On the deck the polyline and the Roadway surface agree within 5 mm.
- Vehicle classes are the six vehicle GLBs. Length, width and wheel radius are measured from each
  model's LOD0 bounds and wheels. `traffic.json` `vehicles[].weight` is each class's share of entries.

### Creating a vehicle

A vehicle is created in lane `k` at position `s`. Its values are drawn in this order:

1. **Class.** A weighted draw over the classes the lane allows.
2. **Cruise.** `cruise = laneSpeed · (1 + (r - 0.5) · speed.personal)`.
3. **Paint.** Build the set of colours to avoid:
   - the colour of the car directly ahead in the lane;
   - every colour within `paint.avoidRadius` of `s` in the three lanes of the same direction.

   Make up to `paint.attempts` weighted draws from `palette` and keep the first colour not in the
   set. If none qualifies, take the heaviest colour not in the set. If every colour is in the set,
   take palette entry 0.
4. **Tint.** `tint = linear(srgb) · (1 + (r - 0.5) · paint.brightnessJitter)`, where `linear()` is the
   sRGB transfer function.
5. **Phase.** `phase = r · 2π`.
6. **Period.** `period = oscillationPeriod[0] + r · (oscillationPeriod[1] - oscillationPeriod[0])`.
7. **Wheel angle.** `spin = r · 2π`.

A new vehicle starts at `v = cruise`, `fade = 0` and `brake = 0`. Its tint replaces the albedo of
the `Paint` material only; every other material, including `CargoBox` and `Trim`, keeps its
authored colour.

An entry headway is drawn as
`minHeadway + (meanHeadway - minHeadway) · (-ln(1 - r1) - ln(1 - r2)) / 2`, a gamma distribution
with shape 2. `meanHeadway` is `densityHeadway[density]`, and each tier chooses the density
(`tiers.json` `features.*.traffic`). Changing the density affects future entries only. The mean is
never set below `minHeadway + 0.5`.

### Start-up

1. The generator is seeded with `traffic.json` `seed`.
2. For lanes 0 to 5, one entry countdown each: `nextEntry = headway()`.
3. **Fill.** For each lane 0 to 5, with `V` the lane speed:
   1. Start at `s = L - fade - r · V · meanHeadway`.
   2. While `s > fade` and the lane holds fewer than `perLaneMax` vehicles, create a vehicle at `s`
      with `fade = 1`, then set `s -= headway() · V`.
   3. Set `nextEntry = max(0, -s / V)`.
4. **Settle.** Run 20 s of steps.

### Stepping

- The frame time is capped at 0.5 s. It is split into sub-steps of `h = min(remaining, 1 / stepsPerSecond)`,
  and scene time `t` advances by each `h`.
- In each sub-step the lanes run 0 to 5. Within a lane, vehicles update leader first, and each
  follower sees its leader's already-updated state.

Each vehicle updates as follows:

1. **Gap.** `gap` runs from the leader's rear to this vehicle's front (∞ with no leader). `vLead` is the
   leader's speed.
2. **Player car.** The player's car may be the leader; see "The player's car" below.
3. **Desired speed.** `v0 = cruise · (1 + speed.oscillation · sin(2π t / period + phase))`.
4. **IDM (Treiber).** Using the `idm` values:
   - `a = accel · (1 - (v / v0)^4)`;
   - with a leader, compute `want = gap0 + max(0, v · headway + v · (v - vLead) / (2 · sqrt(accel · brake)))`
     and then `a -= accel · (want / max(gap, 0.5))^2`;
   - clamp `a` to `[-emergency, accel]` and set `v = max(0, v + a · h)`.
5. **Backstop.** No vehicle comes closer than `HARD_GAP` = 0.5 m to its leader or to the player's car.
   - `limit` is the leader's (or the car's) rear minus half this vehicle's length minus 0.5.
   - The new position is `min(s + v · h, max(s, limit))`.
   - If that cut the move short, `v = (new s - s) / h`.
6. **Wheels.** `spin += v · h / wheelRadius`, wrapped to 2π.
7. **Brake lamp.** `brake += ((a < -brakeLights.decel ? 1 : 0) - brake) · min(1, h · brakeLights.rate)`.
8. **Fade.** `fade = min(1, s / fade, (L - s) / fade)`. `traffic.json` `fade` (40 m) is no longer than
   either approach's dissolve stretch, which ends at the lane's end (section 6). So vehicles fade in and
   out only inside the dissolve stretches, and never at the deck.

After the vehicles, each lane handles its ends:

- **Exits.** Vehicles with `s ≥ L` leave.
- **Entries.** `nextEntry -= h`. When it reaches 0 or less and the lane has room under `perLaneMax`, a
  vehicle enters at `s = 0` if both hold:
  - the last vehicle's rear is more than `gap0 + longest class length + vLast · headway` from the entry;
  - the player's car is not in the lane between `s = -20` and `s = fade + 20`.

  The entering vehicle's speed is `min(cruise, vLast)`, and `nextEntry` is drawn again. If the entry
  is blocked, the lane retries on every step.

### The player's car

**When traffic sees the car.** Traffic in lane `i` sees the car only when both hold:

- the car drives in that lane's direction;
- its footprint enters the lane band: `|car.x - lane.x| < laneWidth / 2 + ex`.

Here `ex` and `ez` are the car's half extents across and along the lane, including its heading
offset (section 2).

**Where it sits.** The car's `x` and `z` are its route offset and station (section 2). Its lane
position is `s = (car.z - stations[0]) · dir`. It counts with speed `max(0, car speed)` and half
length `ez`.

**Who follows it.**

- The car leads a vehicle only when it is wholly ahead of that vehicle's front and nearer than its
  leader.
- A vehicle already alongside keeps going. The car's own rules keep it clear sideways.
- Nothing ever collides physically.

### Drawing

- **Pose.**
  - Each vehicle stands at its route point and faces its direction of travel: the route heading,
    reversed for the southbound lanes.
  - Its pitch is `atan(dir · grade)`, with the route's grade.
  - The wheels spin by `spin`, and the front wheels steer (0 for traffic).
- **LOD.**
  - Distances use the tier's `traffic.lod` values `[lod1, lod2, cull]`, defined at a 50° vertical
    field of view.
  - `d` is the distance from the camera to the vehicle centre `(x, y + height / 2, z)`. A vehicle with
    `d > cull` is not drawn.
  - The level comes from `d · tan(fov / 2) / tan(25°)` against `[lod1, lod2]`, with 6% hysteresis:
    - a vehicle moves to a coarser level beyond `limit · 1.06`;
    - it moves back to a finer level below `limit · 0.94`.
  - Levels come from `MSFT_lod` when present; otherwise from sibling `LOD1`/`LOD2` groups; otherwise
    LOD0 at every distance.
  - Wheels are drawn at LOD0 and LOD1 only.
- **Opacity.** Vehicles are dithered (alpha-hashed). The opacity is the smallest of three values:
  - the lane `fade`;
  - `(cull - d) / (0.12 · cull)`;
  - `(along - length / 2 - 0.5) / 4`, applied only when the camera stands inside the vehicle's lane
    footprint (within `width / 2 + 0.6` across and from 0.5 below the road to `height + 0.5` above
    it). Such a vehicle dissolves instead of passing through the camera.

  Vehicles at opacity 0.01 or below are skipped.
- **Driven car.** It is always LOD0 and fully opaque.
- **Shadows.** LOD0 and LOD1 cast sun shadows when the tier has shadows.
- **Contact shadows.** A tier without a shadow map (`tiers.json` `traffic.contactShadow` > 0) lays
  a soft black rectangle under each vehicle drawn at LOD0 or LOD1, the driven car included:
  - centred under the centre of the vehicle's LOD0 bounding box, turned with the vehicle and pitched
    with the deck, 0.04 m above the road;
  - half extents `length / 2 + 0.45` and `width / 2 + 0.45`; along each axis the opacity is
    `1 - smoothstep(half - 1.05, half, |distance from the centre|)`, and the two axes multiply;
  - peak opacity `contactShadow` × the vehicle's opacity × `min(1, (lod2 - d') / (0.2 · lod2))`,
    where `d'` is the field-of-view-scaled distance, so the shadow is gone before LOD2;
  - blended over the road without writing depth.
- **Lamps.** Section 5.

## 2. Driving the sedan (`driving.json`)

### Controls

| Control | Inputs |
|---|---|
| `throttle` | the forward axis, 0 to 1 |
| `reverse` | the backward axis, 0 to 1 |
| `steer` | the side axis, -1 left to +1 right |
| `brake` | Space |
| `handbrake` | X |

All keys are listed in `controls`. While the turn-around fade runs, every control reads 0.

Local review2 adds held Shift boost (8 m/s² acceleration, 42 m/s forward ceiling; ordinary driving
remains 5 m/s² and 29 m/s). Traffic, road-end, curb and service-brake constraints still apply.
On touch the kit's `VirtualJoystick` in its `throttle` mode drives and steers. Its
forward and side axes are read separately: each has a dead zone of 12 % of the stick's 66 px reach
and rises linearly to 1 at full reach. Separate held Boost and Brake buttons sit opposite the
joystick. "Leave the car" in the toolbar exits driving. The orbit overview has no camera pad on touch: a drag
orbits, a pinch zooms, a two-finger drag pans and "Reset view" in the toolbar returns the camera to
its home pose (D-22; touch is the last touch or pen input, or a coarse pointer unless the keyboard
was used last). Keyboard and mouse layouts keep the pad with its Reset button.

### Car state and stepping

- **State.** The car's state is:
  - `dir` (+1 north, -1 south);
  - `x` and `z`, the car's route offset `d` and route station `σ` ("Route coordinates");
  - the signed `speed`;
  - the heading offset `offset` from the lane direction (radians, positive to the left);
  - the front `wheel` angle, the wheel `spin` and the `brakeLight` level;
  - timers `held`, `curbCooldown` and `endHold`, and the `bump` pitch.

  The heading is `yaw = (dir > 0 ? 0 : π) + offset`, and forward is `(sin yaw, cos yaw)` in (x, z),
  in route coordinates.
- **Stepping.** Steps are fixed at `h` = 1/120 s. The frame time goes into an accumulator capped at
  0.5 s.
- **Traffic.** The car sees the traffic of its own direction within 200 m as boxes, taken at the
  start of the frame. Between the car's steps each box moves on at its own speed.

Each step does the following, in order.

**1. Longitudinal.** Let `coast(v) = coast.constant + coast.quadratic · v²`.

- **Rolling forward (v > 0).**
  - `drive` is `accel · throttle · (1 - (v / topSpeed)²)` with the throttle on, else `-coast(v)`.
  - `stop` is the largest of `brake · brakeIn`, `brake · reverse` and `handbrake` (when held).
  - `v = max(0, v + (drive - stop) · h)`.
- **Rolling backward (v < 0).**
  - `drive` is `-reverse.accel · reverse` while `|v| < reverse.maxSpeed`; else 0 with reverse held, or
    `+coast(v)` without it.
  - `stop` is the largest of `brake · brakeIn`, `brake · throttle` and `handbrake`.
  - `v = min(0, v + (drive + stop) · h)`.
- **At rest (v = 0).** "Free" means neither brake nor handbrake is held.
  - With the throttle on and free, `v = accel · throttle · h`.
  - With reverse on and free, `held += h`. Once `held ≥ reverse.afterStopSeconds`,
    `v = -reverse.accel · reverse · h`. The brake lamp shows while it waits.
  - Near the road end (`toEnd ≤ roadEnd.promptDistance`) reverse does not engage: the car stays at
    rest with the brake lamp on, and the hold counts toward a turn-around (below).

  Brake lamps light whenever a stop term is non-zero.

**2. Steering.** Let `f = min(1, |v| / topSpeed)`. Let `limit = lerp(steer.headingDeg[0], steer.headingDeg[1], f)`
and `rate = steer.rateDegPerSecond · min(1, |v| / steer.fullRateSpeed) · h`.

- The offset moves toward `(v < 0 ? steer : -steer) · limit` by at most `rate`. When `|offset| > limit`,
  it is pulled back by at most `rate`.
- The wheel angle moves toward `-steer · lerp(steer.wheelDeg[0], steer.wheelDeg[1], f)` by at most
  4 rad/s.

**3. Traffic ahead or behind.**

- A box counts when it is in the car's lateral span: `|x - b.x| < ex + b.halfWidth + traffic.lateralMargin`.
- `approach(d, g) = min(g · d, sqrt(2 · 0.8 · brake · d))`, with `d` clamped at 0 or above.
- **Driving forward.** For a box ahead with `v > 0`, the allowed speed is
  `b.speed + approach(gap - traffic.minGap, traffic.followGain)`.
- **Reversing.** For a box behind with `v < 0`, the allowed backward speed is
  `approach(gap - minGap, followGain)`.
- When the car exceeds the allowed speed, it slows toward it by at most `brake · h` per step. This
  overrides the throttle.

**4. End stops.** The car's road ends are on the approach roads, past the deck ends:
`roadEnd(dir) = dir · (roadEndZ + ends.car)`, with `ends.car` the approach's `layout.json` value
(south -1592.98, north 1632.98). The approach roads, with their traffic, run on beyond them to the
dissolve stretches. Each carriageway ends `roadEnd.stopDistance` short of its road end, at
`endStop(dir) = roadEnd(dir) - dir · stopDistance`. Toward either stop, the car is limited to
`approach(room, ∞)` in the same way as step 3.

**5. Brake lamps.** The lamps also light when the car slows faster than `traffic.json`
`brakeLights.decel`.

**6. Move and clamp.**

- **Move.** `x += v · sin(yaw) · h` and `z += v · cos(yaw) · h`.
- **Carriageway.** The footprint `x ± ex` must stay between the median (`medianHalfWidth + curb.clearance`)
  and the curb (`roadHalfWidth - curb.clearance`) on the car's own side. At either edge:
  - clamp `x` and set `offset *= exp(-h / 0.15)`;
  - once per `curb.cooldown`, when `|v| > 0.5`, set `v *= curb.speedKept` and give a pitch kick of
    `curb.bumpDeg`, which decays with a 0.12 s time constant.
- **Sideways into traffic.** Let `reach = ex + b.halfWidth + lateralMargin`. The car may not move
  sideways into `reach` of a box in either of two cases:
  - **Alongside:** `|dz| < ez + b.halfLength`.
  - **Merging:** it starts outside reach and `|dz| < ez + b.halfLength + mergeMargin`. Here
    `mergeMargin = longitudinalMargin + closing speed · 1 s`. The closing speed is how fast the gap
    shrinks: for a box behind, `max(0, b.speed - v)`; for a box ahead, `max(0, v - b.speed)`.

  When blocked, `x` stops at the reach boundary (or keeps its previous value if already inside it),
  and `offset` relaxes as at the edges.
- **Hard stop.** Where each box will be at the end of the step, the car never comes within
  `ez + b.halfLength + minGap` of it.
  - A box ahead pushes the car back, and the car's speed is capped at the box's speed.
  - When reversing, a box behind stops the car.
- **End clamp.** `z` never passes the end stops.

**7. Book-keeping.**

- `spin += v · h / wheelRadius`.
- `brakeLight` approaches 0 or 1 at a rate of 12 per second.
- `toEnd = (roadEnd(dir) - z) · dir`.

### Road end, start and leaving

- **Turn-around triggers.** The turn-around prompt shows in the status line when
  `toEnd ≤ roadEnd.promptDistance`. Three things turn the car around:
  - R, when the prompt shows;
  - holding the throttle at rest at the end stop for `roadEnd.holdSeconds`;
  - holding reverse at rest while the prompt shows for `roadEnd.holdSeconds` (on touch, the stick
    held back; D-22). Releasing either hold starts its count again.
- **Turning around.**
  1. Fade to black over `fadeSeconds`.
  2. Move the car to the first free spot on the other carriageway. It tries the lanes nearest the
     mirror position `-x` first, at `z + newDir · {0, 10, 20, 30, 40}` in turn. Failing all of those,
     it goes to the mirror position itself.
  3. Face the car the other way, at rest, and restart the chase camera behind it.
  4. Fade back over `fadeSeconds`.
- **Free spot.** In a candidate lane, every box that overlaps the car sideways (margin
  `lateralMargin`) must be clear of it:
  - a box ahead by at least 12 m;
  - a box behind by at least `10 + max(0, b.speed - speed)² / (2 · 4)` m.
- **Entering.**
  - The car starts in `start.lane` at `start.z`. If that spot is not free, it tries `z ± 6, ± 12, …`
    within `start.window`, in the lanes nearest the start lane.
  - It starts rolling at `min(start.speed, speed of the vehicle ahead in its lane)`.
  - Its paint is `driving.json` `paint`.
- **Drawing.**
  - The car stands at the route point `(z, x)`. Its world heading is the route heading plus `yaw`.
  - `y` is the mean of the route heights at the front and rear axles, `± wheelbase / 2` along the
    heading in route coordinates.
  - Pitch is `atan2(front - back, wheelbase) + bump`.
  - The front wheels steer by `wheel`.
  - The HUD shows `round(|v| · 3.6)` km/h, updated five times a second.
- **Chase camera** (`layout.json` `cameras.chase`).
  - **Aim.** The camera looks at `car + (sin yaw · lookAhead, targetHeight, cos yaw · lookAhead)`.
  - **Rest position.** It rests `distance` behind the car along the heading and `height` above it.
  - **Smoothing.** Heading and position follow through critically damped springs,
    `ω = 2 / positionLag` and `ω = 2 / yawLag`.
  - **Field of view.** `fov` runs from `fov` at rest to `fovAtTopSpeed` at `topSpeed`.
  - **Zoom.** A pinch or the mouse wheel over the scene (the kit's per-frame `zoom` input `z`)
    multiplies a zoom factor by `exp(zoomRate · z)`, clamped to `zoom`. `distance` and `height` scale
    by the factor, which is 1 each time the car is entered.
  - **Look.** A one-finger or mouse drag over the scene swings the camera around the car by 0.005 rad
    per pixel; a drag is ignored while a second finger is down, so a pinch zooms without swinging
    (the kit's chase drag, GG-010). Three seconds after the last drag it springs back behind the car
    (the kit's orbit offset). The obstruction and suspender rules below still apply.
  - **Obstruction.**
    - Five rays run from the aim point to the camera: the centre, plus four offset by `castRadius`
      to the camera's right, left, up and down. They are tested against the bridge's obstruction
      nodes (`layout.json` `bridge`).
    - The camera may be no further than `max(minDistance, nearest hit - pad)`. It moves in at once
      and back out at `relax` m/s.
  - **Suspender limit.** The scene finally clamps the camera's lateral route offset to
    `|d| ≤ maxAbsX`, keeping its station, and re-aims it. On the deck this is `|x|`, inside the
    suspender planes. On an approach it is inside the barriers.
- **Leaving.** E, Escape or "Leave the car" removes the car. The orbit takes over from the chase
  camera's pose, aimed at the car's last position, with the same hand-back rule as a flight
  (section 3).

## 3. Camera flights (`layout.json` `flights`)

- **Keys.** A flight is a list of keys, each with a `position`, a `target` and a vertical `fov`,
  played over `seconds` of scene time.
- **Timing.** A key's `seconds` is its share of eased time since the previous key. Keys without
  `seconds` share the remaining time equally.
- **Easing.** The flight time `u` in 0..1 is eased:
  - by default, quadratic ease-in-out: `2u²` below 0.5, else `1 - (2 - 2u)² / 2`;
  - `smoothstep` (`3u² - 2u³`) where a flight names it.

  The eased value picks the segment `i` and the fraction `v` within it.
- **Interpolation.**
  - Position and target are two separate centripetal Catmull-Rom curves through the keys, with
    α = 0.5 (three.js `CatmullRomCurve3`, `centripetal`). They are evaluated at segment `i`,
    fraction `v`: uniform in key index, not in arc length.
  - The end segments use mirrored phantom points: `P(-1) = 2P0 - P1`, and likewise at the far end.
  - `fov` and roll interpolate linearly within the segment. Roll is always 0.
- **Interruption.** Any orbit input interrupts a flight.
- **Hand-back to the orbit.** At the end, or on interruption, the orbit takes over from the current
  pose. Its new target lies along the view direction, at
  `clamp(|target - position|, 1.5 · orbit.minDistance, 0.6 · orbit.maxDistance)`, clamped to the
  orbit's target bounds.
- **Fog roll.** It plays only with the Fog preset.
- **Clearance.** Every flight keeps `clearance.terrainMinimum` above the terrain of every tier and the
  water, and `clearance.bridge` from the bridge (`tests/unit/flights.test.ts`).

## 4. Fog banks (`layout.json` `fogBanks`)

- **Generation.** Puffs come from `fogBanks.seed`. Each tier uses the first `tiers.json`
  `features.*.fogBanks` banks, taken in order. Each bank generates its `puffs`; for each puff, draw
  `u`, `v`, `size` and `jitter`, then `seed`, where:
  - `u = 2r - 1` and `v = 2r - 1`;
  - `size = sizeMin + r · sizeRange`;
  - `jitter = r · heightJitter`.

  The puff's centre is
  `(bank.x + u · spread[0], bank.y + jitter + size · heightPerSize, bank.z + v · spread[1])`.
- **Drift.** Puffs drift toward -X (east, into the bay) at `driftSpeed` and wrap within
  `[wrap.east, wrap.west)`:
  `x(t) = east + mod(x0 - driftSpeed · t - east, west - east)`, where `t` is scene time.
- **Shape.** Each puff is a camera-facing sprite, `size · aspect` wide and `size` tall. Its opacity
  multiplies these terms:
  - a radial profile `(1 - r²)^1.6`, broken up by tiling noise offset per puff by its `seed`;
  - a soft intersection with the depth behind it, over 60 m;
  - a fade-in with camera distance over 30-220 m;
  - a fade-out over 9-16 km;
  - a fade-in with height over 0-18 m above the water;
  - the preset's `banks` value;
  - a constant 0.55.
- **Colour.** Each puff is coloured with the fog's own in-scatter toward the viewer, so a bank reads as
  a denser pocket of the same air. Puffs are never reflected in the water.

## 5. Lamps (`layout.json` `lights`, levels in `presets.json`)

- **Bridge lamps and beacons.** The `LampGlass` and `BeaconEmissive` materials take their authored
  emissive intensity × the preset's `lamps`.
- **Vehicle lamps.** Headlight, taillight and brake-lamp surfaces take their authored emissive colour ×
  `mix(gain[0], gain[1], lights)` for their kind, where `lights` is the preset's value.
  - Brake lamps are further scaled by `mix(brakeOff, 1, brake)`, using the vehicle's brake level.
  - Taillights are normalised so their largest emissive channel is at most `taillightPeak`.
  - Day has `lights` 0. Golden hour and Fog have `lights` 1, which gives headlights at Golden and Fog.

## 6. Approach roads (`layout.json` `approaches`)

US 101 continues off both anchorages as the approach roads, so the deck ends on a road and the traffic
and the car drive on past the deck ends. Per approach (`south`, `north`):

- **Authored:**
  - the horizontal `alignment`;
  - the modelled `length`;
  - the `join` of the structure profile with the at-grade profile;
  - the `structures`;
  - the ground-fit `spacing`;
  - the imagery `reference` points and `tolerance`;
  - the `ends`.
- **Derived:** `start`, `profile`, `segments`, `centreline` and `deviation`. They come from the
  bridge GLB's Roadway end and the canonical near terrain, and are written by `scripts/layout.ts --write`
  and checked by `--check` (see "Deriving and checking" below).

### Geometry

- **Alignment** (`world/alignment.ts`). The approach starts on the bridge axis at the deck's road end,
  `(0, sign · roadEndZ)`, heading away from the bridge. From there it runs as tangents joined by circular
  curves: at each point of intersection `pis[i]` a curve of radius `radii[i]`, then a tangent to `end`.
  The station `s` is the arc length along the centreline.
- **Profile.** The profile is a list of points of vertical intersection `[s, y, L]`:
  - straight grades run between the points;
  - at each inner point a parabolic vertical curve of length `L` is centred on it (0 at the two ends);
  - beyond the ends the end grades continue.
- **The first point is the deck end.**
  - Its elevation and grade are the Roadway's end row at `|z| = roadEndZ` and the grade of its last
    segment, read from the bridge GLB (`start`; g3: 62.55 m, falling away from the bridge at 3.18 %).
  - The first grade continues the deck's end grade unchanged, and the approach's own sag curve flattens
    it. The deck geometry is never changed.
  - A new bridge profile re-derives the approaches cleanly: `layout.ts --write` rebuilds the structure
    profile from the new end, and staging fails when an approach's `start` differs from the staged
    Roadway's end.
- **Structure and at-grade profile.**
  - The structure profile runs from the deck end at grades of at most 4 % until the road reaches the
    ground.
  - Beyond `join.station` the profile follows the ground. The ground is fitted at `ground.spacing`
    along the centreline, excluding the structures, and smoothed.
  - The two meet with the vertical curves `join.curves`.
- **Segments.** `segments` classifies the stations:
  - `viaduct` and `overpass`: on structure, with bent stations (`supports`) and `abutments`;
  - `cut`, `fill` and `grade`: at grade, by the road's height against the natural ground.
- **Cross-section** (`crossSection`, shared by both approaches).
  - The carriageway (±9.4488 m), lane lines, edge lines and median continue the deck's.
  - Shoulders run to concrete barriers (`barrier`: inner and outer offset, height) whose outer faces
    line up with the deck walkways' outer edge.
  - At the anchorage a short concrete ramp (`joint.ramp`) takes the deck's walkways, 0.22 m above the
    road, down to the shoulder.
  - On structure: a slab (`deck.slab`), a girder box (`deck.girder`, `girderHalfWidth`), and bents of
    two columns (`supports`) with a cap. The bents and abutment walls run down to `supports.footing`,
    below the ground.
  - Materials: the bridge GLB's Asphalt, RoadMarkings and Concrete.
- **Ends.**
  - `ends.car` is the car's road end (section 2).
  - `ends.dissolve` is the stretch where the road leaves the model. Before it the barriers taper to
    the road over `joint.taper`, and the median and lines end. The asphalt runs on to `length` in a
    bed that rises from `pavement` to 0.1 m below the road. Traffic fades in and out inside the
    stretch (section 1).

### Meshes

- **Representations.** The approach meshes (`world/approach-mesh.ts`) are built from these data at
  load. There are two:
  - near, with 2 m stations, lines and median;
  - far, with 10 m stations, road, barriers and structures only.
- **Switching.** The far one replaces the near one when the camera is more than 1.12 × the tier's
  `bridgeFarSwitch` from the route (the deck axis or either centreline). It switches back below 0.88 ×.
- **Lane lines.** The broken lane lines continue the deck's dash pattern by route station.

### Terrain corridor

The terrain is edited along each approach (`world/corridor.ts`) on both near terrain levels, so the
road sits in a cut or on a fill where it runs at grade and clears its girders where it is a structure.
At approach station `s` and lateral offset `d`, for the natural height `h`:

- **At grade.** There is a bed `pavement` below the road for `|d|` up to the barrier's outer edge plus
  `envelope.bedMargin`. Beyond it the terrain is clamped between a fill slope falling at
  `envelope.fill` and a cut slope rising at `envelope.cut` per metre from the bed edge.
- **Under a structure.** Clear of the abutments, the terrain stays at least `clearance` below the
  girders, with the same cut slope beyond the bed.
- **Fading.** The edit fades out:
  - laterally between `envelope.reach[0]` and `[1]`;
  - over 5 m at the deck end;
  - over 30 m past the approach's end.
- **Imagery.** It stays draped, and the edited slopes take their own normals.

### Deriving and checking

`scripts/layout.ts --write` derives the data above, and `--check` checks them together with the lanes
(5 mm on the Roadway). The check sets are:

- **Profile.** The start equals the Roadway's end, and grades are at most 4 % until the ground (the join).
- **Support.** Every 5 m on both near terrain levels, sampled every 0.5 m across the barriers:
  - no penetrations: no terrain above the road surface, or above the slab soffit under a structure;
  - no station at grade without ground contact: terrain within `pavement` + 0.05 m below the road
    somewhere across the paved width. Stations on a structure stand on its bents and abutments.
- **Imagery.** The centreline is within `imagery.tolerance` (5 m) of each road-centre reference read
  from the imagery. On structures the reference is first corrected for the orthophoto's relief
  displacement, which shows an elevated road `imagery.displacement` m further toward -X per metre
  above the ground.
- **Sight.** From the deck, the review poses and the driving cameras, no sight line reaches an end
  stretch (the dissolve and the 10 m before it, at vehicle-roof height) nearer than 300 m.
- **Driving.** `tests/tools/drive-check.ts` drives the car over the whole route, both ways, and every
  traffic lane end to end against the rendered road surfaces. It requires every wheel on a road, no
  vertical step over 0.03 m and no pitch change over 1° per step. The joints at both deck ends and
  both towers are resampled every 0.01 m.
