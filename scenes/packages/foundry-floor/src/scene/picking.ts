// SPDX-License-Identifier: MIT
// Tap-to-inspect and the follow camera's obstruction (TASK-FF2 item 4): world boxes of the tools (the body and, apart,
// each load port under its FOUP) and the stockers from the layout's footprints, the nearest box a ray enters, and the room of the fab
// floor (floor, FFU face, walls) a follow camera stays inside. Pure: no three, React or DOM.
import type { LayoutData } from '../sim/data';

export interface PickBox { id: string; kind: 'tool' | 'stocker'; min: [number, number, number]; max: [number, number, number] }
/** A load port's plan half-width around its seat and its height (the port body under a FOUP). */
const PORT_HALF_M = 0.3, PORT_TOP_M = 1.3;

/** The boxes a tap can hit, named by their tool or stocker: each tool's body and each of its load ports (a separate box,
 *  so a ray over a port row reaches the tool behind it; `ports: false` leaves them out for the follow camera, so a FOUP
 *  seated at a port stands outside every box), and each stocker. */
export function pickBoxes(layout: LayoutData, options: { ports?: boolean } = {}): PickBox[] {
  const out: PickBox[] = [], ports = options.ports ?? true;
  for (const t of layout.tools) {
    out.push({ id: t.id, kind: 'tool', min: [...t.footprint.min] as [number, number, number], max: [...t.footprint.max] as [number, number, number] });
    if (ports) for (const p of t.ports) {
      out.push({ id: t.id, kind: 'tool', min: [p.seat[0] - PORT_HALF_M, 0, p.seat[2] - PORT_HALF_M], max: [p.seat[0] + PORT_HALF_M, PORT_TOP_M, p.seat[2] + PORT_HALF_M] });
    }
  }
  for (const s of layout.stockers) out.push({ id: s.id, kind: 'stocker', min: [...s.footprint.min] as [number, number, number], max: [...s.footprint.max] as [number, number, number] });
  return out;
}

/** Where the ray o + t d (d need not be unit) enters the box: t, 0 when o is inside, or Infinity when it misses. */
export function rayBox(o: readonly number[], d: readonly number[], min: readonly number[], max: readonly number[]): number {
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    const ok = o[k] as number, dk = d[k] as number, lo = min[k] as number, hi = max[k] as number;
    if (Math.abs(dk) < 1e-12) { if (ok < lo || ok > hi) return Infinity; continue; }
    let a = (lo - ok) / dk, b = (hi - ok) / dk;
    if (a > b) { const s = a; a = b; b = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** The nearest box the ray enters (boxes holding the origin are skipped), within maxT. */
export function pickRay(boxes: readonly PickBox[], o: readonly number[], d: readonly number[], maxT = Infinity): { box: PickBox; t: number } | null {
  let best: PickBox | null = null, bestT = maxT;
  for (const b of boxes) {
    const inside = o[0]! >= b.min[0] && o[0]! <= b.max[0] && o[1]! >= b.min[1] && o[1]! <= b.max[1] && o[2]! >= b.min[2] && o[2]! <= b.max[2];
    if (inside) continue;
    const t = rayBox(o, d, b.min, b.max);
    if (t < bestT) { bestT = t; best = b; }
  }
  return best ? { box: best, t: bestT } : null;
}

/** The room a follow camera stays inside: the fab floor between the raised floor and the FFU face, inside the walls,
 *  with `pad` metres kept from each. */
export function roomLimits(layout: LayoutData, pad: number): { min: [number, number, number]; max: [number, number, number] } {
  return {
    min: [layout.cleanroom.x[0] + pad, (layout.heights.raisedFloor ?? 0) + pad, layout.cleanroom.z[0] + pad],
    max: [layout.cleanroom.x[1] - pad, (layout.heights.ffuFace ?? 6) - pad, layout.cleanroom.z[1] - pad],
  };
}

/** How far the segment from `a` toward `b` (length |b - a|) goes before it enters a box or leaves the room; Infinity
 *  when it does neither. `a` is assumed inside the room. */
export function obstructionDistance(boxes: readonly PickBox[], room: { min: readonly number[]; max: readonly number[] }, a: readonly number[], b: readonly number[]): number {
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], length = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (length < 1e-9) return Infinity;
  for (let k = 0; k < 3; k++) d[k] = d[k]! / length;
  let best = Infinity;
  const hit = pickRay(boxes, a, d, length);
  if (hit) best = hit.t;
  for (let k = 0; k < 3; k++) {
    const dk = d[k]!;
    if (dk > 1e-12) best = Math.min(best, Math.max(0, (room.max[k]! - a[k]!) / dk));
    else if (dk < -1e-12) best = Math.min(best, Math.max(0, (room.min[k]! - a[k]!) / dk));
  }
  return best < length ? best : Infinity;
}
