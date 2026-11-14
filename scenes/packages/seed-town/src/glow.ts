/**
 * Where the town gives off light at dusk, read from the plan alone: the lanterns of lit street
 * lamps and the ground in front of lit shop and house fronts. Everything is in plan coordinates.
 */
import type { TownPlacement, TownPlan } from './plan/town-plan.js';

/** A soft ellipse of light lying on the pavement. `out` and `along` are half sizes in the placement's frame. */
export interface Pool { x: number; z: number; yaw: number; out: number; along: number; tint: 'lamp' | 'window'; strength: number }
export interface Lantern { x: number; y: number; z: number }
export interface TownLights { pools: Pool[]; lanterns: Lantern[] }

const number = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);

/** A point of a placement's own frame in plan coordinates: `lx` out from its face, `lz` along it. */
export function placePoint(place: TownPlacement, lx: number, lz: number): [number, number] {
  const turn = place.yaw * Math.PI / 180, cos = Math.cos(turn), sin = Math.sin(turn);
  return [place.pos[0] + lx * cos + lz * sin, place.pos[2] - lx * sin + lz * cos];
}

/** How far a lit front throws light onto the pavement, by what stands in the bay. */
const FRONTS: Record<string, { out: number; reach: number; spread: number; strength: number }> = {
  shopWindow: { out: 1.5, reach: 2.3, spread: 0.72, strength: 1 },
  shopDoor: { out: 1.3, reach: 2, spread: 0.6, strength: 0.8 },
  houseWindow: { out: 0.9, reach: 1.4, spread: 0.45, strength: 0.5 },
  houseDoor: { out: 0.7, reach: 1, spread: 0.36, strength: 0.3 },
};

export function townLights(plan: TownPlan): TownLights {
  const pools: Pool[] = [], lanterns: Lantern[] = [];
  // Fronts that look out of the town are lit like the rest, but the grass outside takes no pool.
  const { x0, x1, length } = plan.town;
  const paved = (x: number, z: number) => x > x0 && x < x1 && z > 0 && z < length;
  for (const place of plan.placements) {
    if (place.values.lit !== true) continue;
    if (place.kit === 'street-lamp') {
      const twin = place.values.arms === 'twin', height = number(place.values.height, 3.8);
      const reach = twin ? 6.4 : 5.4;
      pools.push({ x: place.pos[0], z: place.pos[2], yaw: place.yaw, out: reach, along: reach, tint: 'lamp', strength: 1 });
      lanterns.push({ x: place.pos[0], y: place.pos[1] + height + (twin ? 0.36 : 0.26), z: place.pos[2] });
    } else if (place.kit === 'ground-bay') {
      const front = FRONTS[String(place.values.front)];
      if (!front) continue;
      const width = number(place.values.bayWidth, 1.8);
      const [x, z] = placePoint(place, front.out, width / 2);
      if (!paved(x, z)) continue;
      pools.push({ x, z, yaw: place.yaw, out: front.reach, along: width * front.spread, tint: 'window', strength: front.strength });
    }
  }
  return { pools, lanterns };
}

/**
 * Which lanterns carry a real light this frame: the `slots` nearest the eye. A light fades to
 * nothing at the distance of the nearest lantern left without one, so a slot never changes
 * lantern while it is lit. Writes each slot's lantern index (or -1) and strength (0 to 1).
 */
export function nearestLanterns(
  lanterns: readonly Lantern[], eye: readonly [number, number, number], slots: Int32Array, strength: Float32Array, maxReach = 46,
): void {
  const count = slots.length;
  const distance = (i: number) => Math.hypot(lanterns[i]!.x - eye[0], lanterns[i]!.y - eye[1], lanterns[i]!.z - eye[2]);
  const order = lanterns.map((_, i) => i).sort((a, b) => distance(a) - distance(b));
  const chosen = order.slice(0, count);
  const reach = Math.min(maxReach, order.length > count ? distance(order[count]!) : maxReach);
  // Slots keep a lantern that is still among the nearest; the rest take the newcomers.
  const kept = new Set<number>();
  for (let s = 0; s < count; s++) {
    if (chosen.includes(slots[s]!) && !kept.has(slots[s]!)) kept.add(slots[s]!);
    else slots[s] = -1;
  }
  const fresh = chosen.filter(i => !kept.has(i));
  for (let s = 0; s < count; s++) {
    if (slots[s] === -1 && fresh.length) slots[s] = fresh.shift()!;
    const i = slots[s]!;
    if (i < 0) { strength[s] = 0; continue; }
    const k = Math.min(1, Math.max(0, (reach - distance(i)) / (reach * 0.45)));
    strength[s] = k * k * (3 - 2 * k);
  }
}
