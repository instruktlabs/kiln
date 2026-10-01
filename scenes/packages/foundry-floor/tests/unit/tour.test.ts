// Sim-spec 12 test 9 (tour framing) on the accepted GLBs: every tour stop frames its highlighted subject (the layout's
// feature anchor, a point on that subject) inside the picture with a 10% margin at 16:9 and at 9:19.5, with the tour's
// field-of-view rule (tourFov); the camera path passes through no geometry: every fly-leg sample (every 0.1 m) and
// every stop stands at least 0.2 m from all static geometry at the placements the scene draws, so no segment between
// samples crosses a triangle; the camera moves continuously except under a full fade. Occlusion of each anchor is
// recorded as information (the gallery glazing is geometry too). The timeline itself: stop order, holds at the exact
// views, cuts through black, reduced motion turning every leg into a cut.
// FF_SIMSPEC_EVIDENCE=1 writes evidence/sim-spec/ff2/tour.json; otherwise the run is compared with it.
import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { buildTour, holdTime, newTourFrame, pathPoint, sampleTour, tourFov } from '../../src/scene/tour';
import type { TourPose } from '../../src/scene/tour';
import { FAB_DATA } from '../../src/sim/index';
import { GLBS_AVAILABLE, loadModels, PACKAGE, staticTriangles } from './fab-geometry';
import type { WorldTriangles } from './fab-geometry';

const { layout, tools } = FAB_DATA;
const EVIDENCE = resolve(PACKAGE, 'evidence/sim-spec/ff3-floor/tour.json');
const WRITE = process.env.FF_SIMSPEC_EVIDENCE === '1';
const ASPECTS = { '16:9': 16 / 9, '9:19.5': 9 / 19.5 } as const;
const MARGIN = 0.9, CLEAR = 0.2, STEP = 0.1, REACH = 1.0, NEAR = 0.05;
const RAILS = new Set(['railStraight', 'railCurve', 'railSwitch']);
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const tour = buildTour(layout);
const evidence: Record<string, unknown> = {};

let models: Map<string, GLTF>;
beforeAll(async () => { if (GLBS_AVAILABLE) models = await loadModels(); });

// ---- geometry helpers

/** Squared distance from p to triangle (a, b, c) (Ericson, Real-Time Collision Detection 5.1.5). */
function triDist2(p: ArrayLike<number>, t: Float64Array, o: number): number {
  const ax = t[o]!, ay = t[o + 1]!, az = t[o + 2]!, bx = t[o + 3]!, by = t[o + 4]!, bz = t[o + 5]!, cx = t[o + 6]!, cy = t[o + 7]!, cz = t[o + 8]!;
  const px = p[0]!, py = p[1]!, pz = p[2]!;
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const d = (x: number, y: number, z: number) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
  if (d1 <= 0 && d2 <= 0) return d(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return d(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return d(ax + abx * v, ay + aby * v, az + abz * v); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return d(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return d(ax + acx * w, ay + acy * w, az + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return d(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w); }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return d(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/** Triangles indexed in plan (XZ) cells with their boxes, for nearest-distance and segment queries. */
class TriGrid {
  readonly box: Float64Array;
  private readonly cells = new Map<number, number[]>();
  constructor(readonly t: WorldTriangles, private readonly cell = 1) {
    this.box = new Float64Array(t.count * 6);
    for (let i = 0; i < t.count; i++) {
      const o = i * 9, b = i * 6;
      this.box[b] = Math.min(t.tris[o]!, t.tris[o + 3]!, t.tris[o + 6]!); this.box[b + 3] = Math.max(t.tris[o]!, t.tris[o + 3]!, t.tris[o + 6]!);
      this.box[b + 1] = Math.min(t.tris[o + 1]!, t.tris[o + 4]!, t.tris[o + 7]!); this.box[b + 4] = Math.max(t.tris[o + 1]!, t.tris[o + 4]!, t.tris[o + 7]!);
      this.box[b + 2] = Math.min(t.tris[o + 2]!, t.tris[o + 5]!, t.tris[o + 8]!); this.box[b + 5] = Math.max(t.tris[o + 2]!, t.tris[o + 5]!, t.tris[o + 8]!);
      for (let x = Math.floor(this.box[b]! / cell); x <= Math.floor(this.box[b + 3]! / cell); x++) {
        for (let z = Math.floor(this.box[b + 2]! / cell); z <= Math.floor(this.box[b + 5]! / cell); z++) {
          const k = this.key(x, z), list = this.cells.get(k);
          if (list) list.push(i); else this.cells.set(k, [i]);
        }
      }
    }
  }
  private key(x: number, z: number): number { return (x + 4096) * 8192 + (z + 4096); }
  /** The nearest triangle within `reach` of p: its distance and owner index (Infinity and -1 when none). */
  nearest(p: readonly number[], reach: number): { d: number; owner: number } {
    let best = reach * reach, owner = -1;
    const seen = new Set<number>();
    for (let x = Math.floor((p[0]! - reach) / this.cell); x <= Math.floor((p[0]! + reach) / this.cell); x++) {
      for (let z = Math.floor((p[2]! - reach) / this.cell); z <= Math.floor((p[2]! + reach) / this.cell); z++) {
        for (const i of this.cells.get(this.key(x, z)) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = i * 6, box = this.box;
          const dx = Math.max(box[b]! - p[0]!, 0, p[0]! - box[b + 3]!), dy = Math.max(box[b + 1]! - p[1]!, 0, p[1]! - box[b + 4]!), dz = Math.max(box[b + 2]! - p[2]!, 0, p[2]! - box[b + 5]!);
          if (dx * dx + dy * dy + dz * dz >= best) continue;
          const d2 = triDist2(p, this.t.tris, i * 9);
          if (d2 < best) { best = d2; owner = this.t.owner[i]!; }
        }
      }
    }
    return owner < 0 ? { d: Infinity, owner: -1 } : { d: Math.sqrt(best), owner };
  }
  /** Owners of the triangles the segment a-b crosses before fraction `until` (Moller-Trumbore), skipping `skip`. */
  crossings(a: readonly number[], b: readonly number[], until: number, skip: (owner: number) => boolean): Set<number> {
    const hits = new Set<number>(), seen = new Set<number>(), t = this.t.tris;
    const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!, n = Math.ceil(Math.hypot(dx, dz) / (this.cell / 2)) + 1;
    for (let s = 0; s <= n; s++) {
      const cx = Math.floor((a[0]! + (dx * s) / n) / this.cell), cz = Math.floor((a[2]! + (dz * s) / n) / this.cell);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        for (const i of this.cells.get(this.key(cx + ox, cz + oz)) ?? []) {
          if (seen.has(i) || skip(this.t.owner[i]!)) continue;
          seen.add(i);
          const o = i * 9;
          const e1x = t[o + 3]! - t[o]!, e1y = t[o + 4]! - t[o + 1]!, e1z = t[o + 5]! - t[o + 2]!, e2x = t[o + 6]! - t[o]!, e2y = t[o + 7]! - t[o + 1]!, e2z = t[o + 8]! - t[o + 2]!;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, tx = a[0]! - t[o]!, ty = a[1]! - t[o + 1]!, tz = a[2]! - t[o + 2]!;
          const u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const f = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (f > 1e-6 && f < until) hits.add(this.t.owner[i]!);
        }
      }
    }
    return hits;
  }
}

/** Where `point` lands in the picture of `pose` at `aspect` with vertical field of view `fov` (degrees): NDC x and y,
 *  and the depth along the view. */
function project(pose: TourPose, fov: number, aspect: number, point: readonly number[]): [number, number, number] {
  const f = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
  for (let k = 0; k < 3; k++) f[k] = f[k]! / fl;
  const r = [-f[2]!, 0, f[0]!], rl = Math.hypot(r[0]!, r[2]!); r[0] = r[0]! / rl; r[2] = r[2]! / rl;
  const u = [r[1]! * f[2]! - r[2]! * f[1]!, r[2]! * f[0]! - r[0]! * f[2]!, r[0]! * f[1]! - r[1]! * f[0]!];
  const d = [point[0]! - pose.position[0], point[1]! - pose.position[1], point[2]! - pose.position[2]];
  const z = d[0]! * f[0]! + d[1]! * f[1]! + d[2]! * f[2]!, x = d[0]! * r[0]! + d[2]! * r[2]!, y = d[0]! * u[0]! + d[1]! * u[1]! + d[2]! * u[2]!;
  const h = Math.tan((fov * Math.PI) / 360);
  return [x / (z * h * aspect), y / (z * h), z];
}

/** The placement ids a stop's subject names (a litho cell names its track and scanner; tools and stockers bring their
 *  load ports and signal towers). 'spine' is the spine's rails; 'fab' names nothing. */
function subjectFilter(subject: string): ((entity: string, p: { id: string; x: number; z: number }) => boolean) | null {
  if (subject === 'fab') return null;
  if (subject === 'spine') return (e, p) => RAILS.has(e) && Math.abs(Math.abs(p.z) - 1.8) < 0.3 && Math.abs(p.x) < 33.3;
  const cell = tools.cells.find(c => c.id === subject), ids = cell ? [cell.track, cell.scanner] : [subject];
  return (_e, p) => ids.some(id => p.id === id || p.id.startsWith(`${id}.`));
}

describe('tour timeline', () => {
  test('visits the named views in order: a cut in, then a hold at each stop and a leg to the next', () => {
    expect(tour.stops.map(s => s.name)).toEqual(['landing', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section']);
    expect(tour.segments.map(s => s.kind).join(' ')).toBe('cut hold cut hold fly hold fly hold fly hold cut hold cut hold');
    const frame = newTourFrame();
    for (let i = 0; i < tour.stops.length; i++) {
      const stop = tour.stops[i]!, cam = layout.cameras[stop.name];
      sampleTour(tour, holdTime(tour, i) + 0.5, frame);
      expect(frame.phase).toBe('hold');
      expect(frame.stop).toBe(i);
      expect(frame.position).toEqual(cam.position);
      expect(frame.target).toEqual(cam.target);
      expect(frame.fov).toBe(cam.fov);
    }
    expect(sampleTour(tour, tour.total, frame).phase).toBe('done');
    expect(frame.position).toEqual(layout.cameras.section.position);
    // The first cut leaves the camera where it was and fades to black before the jump.
    const start: TourPose = { position: [1, 2, 3], target: [0, 0, 0], fov: 40 };
    expect(sampleTour(tour, 0.1, frame, start).position).toEqual([1, 2, 3]);
    expect(sampleTour(tour, tour.data.cutSeconds / 2, frame, start).fade).toBe(1);
  });

  test('moves continuously except under a full fade, and turns at most 3 degrees a frame at 60 fps', () => {
    const a = newTourFrame(), b = newTourFrame(), dt = 1 / 60;
    let maxTurn = 0, maxStep = 0;
    sampleTour(tour, 0, a);
    for (let t = dt; t < tour.total; t += dt) {
      sampleTour(tour, t, b);
      const step = Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]);
      const da = [a.target[0] - a.position[0], a.target[1] - a.position[1], a.target[2] - a.position[2]], db = [b.target[0] - b.position[0], b.target[1] - b.position[1], b.target[2] - b.position[2]];
      const cos = (da[0]! * db[0]! + da[1]! * db[1]! + da[2]! * db[2]!) / (Math.hypot(da[0]!, da[1]!, da[2]!) * Math.hypot(db[0]!, db[1]!, db[2]!));
      const turn = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
      if (b.fade < 1 && a.fade < 1) { maxStep = Math.max(maxStep, step); maxTurn = Math.max(maxTurn, turn); }
      else if (step > 0.2) expect(Math.max(a.fade, b.fade)).toBe(1);
      a.position = [...b.position]; a.target = [...b.target]; a.fade = b.fade;
    }
    // Peak speed on a fly leg is 1.875 x the average (smootherstep); the legs average 3.5 m/s or less.
    expect(maxStep).toBeLessThan((1.9 * tour.data.flySpeedMps) / 60);
    expect(maxTurn, `max turn ${maxTurn}`).toBeLessThan(3);
    evidence.motion = { maxStepMPerFrame: r3(maxStep), maxTurnDegPerFrame: r3(maxTurn), fps: 60 };
  });

  test('reduced motion turns every leg into a cut', () => {
    const reduced = buildTour(layout, { reduced: true });
    expect(reduced.segments.some(s => s.kind === 'fly')).toBe(false);
    expect(reduced.segments.filter(s => s.kind === 'cut').length).toBe(tour.stops.length);
    evidence.seconds = { tour: r3(tour.total), reducedMotion: r3(reduced.total) };
  });

  test('widens the vertical field of view on narrow screens only', () => {
    expect(tourFov(55, 16 / 9, 40)).toBe(55);
    const narrow = tourFov(55, 9 / 19.5, 40);
    expect(narrow).toBeGreaterThan(76);
    expect((2 * Math.atan(Math.tan((narrow * Math.PI) / 360) * (9 / 19.5)) * 180) / Math.PI).toBeCloseTo(40, 6);
  });
});

describe.skipIf(!GLBS_AVAILABLE)('sim-spec 12 test 9: tour framing on the accepted geometry', () => {
  test('every stop frames its subject at 16:9 and 9:19.5, and the anchor lies on that subject', () => {
    const stops: Record<string, unknown>[] = [];
    const band = staticTriangles(models, FAB_DATA, () => true, [-8, 8]), grid = new TriGrid(band);
    for (const stop of tour.stops) {
      const f = stop.feature, row: Record<string, unknown> = { stop: stop.name, label: stop.label, subject: f.subject, lines: f.lines, anchor: f.anchor };
      for (const [name, aspect] of Object.entries(ASPECTS)) {
        const fov = tourFov(stop.fov, aspect, tour.data.minHorizontalFovDeg), [x, y, z] = project(stop, fov, aspect, f.anchor);
        expect(z, `${stop.name} ${name}`).toBeGreaterThan(NEAR);
        expect(Math.abs(x), `${stop.name} ${name} x`).toBeLessThanOrEqual(MARGIN);
        expect(Math.abs(y), `${stop.name} ${name} y`).toBeLessThanOrEqual(MARGIN);
        row[name] = { fovDeg: r3(fov), ndc: [r3(x), r3(y)], depthM: r3(z) };
      }
      const filter = subjectFilter(f.subject);
      if (filter) {
        // The anchor lies on the subject: inside its bounds (0.35 m slack), on its surface or within its body.
        const own = staticTriangles(models, FAB_DATA, filter), ownGrid = new TriGrid(own);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < own.count * 3; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, own.tris[i * 3 + k]!); hi[k] = Math.max(hi[k]!, own.tris[i * 3 + k]!); }
        const inside = [0, 1, 2].every(k => f.anchor[k]! >= lo[k]! - 0.35 && f.anchor[k]! <= hi[k]! + 0.35);
        expect(inside, `${stop.name} anchor within ${f.subject} (${lo.map(r3)} to ${hi.map(r3)})`).toBe(true);
        const near = ownGrid.nearest(f.anchor, 2);
        row.anchorToSurfaceM = Number.isFinite(near.d) ? r3(near.d) : '>= 2';
        const ownIds = new Set(own.owners.map(o => o.id));
        // Information: what stands between the camera and the anchor (glazing and mullions count).
        const hits = grid.crossings(stop.position, f.anchor, 0.97, o => ownIds.has(band.owners[o]!.id));
        row.occludedBy = [...hits].map(o => `${band.owners[o]!.entity} ${band.owners[o]!.id}`).sort();
      } else {
        const [ax, , az] = f.anchor;
        expect(ax >= layout.cleanroom.x[0] && ax <= layout.cleanroom.x[1] && az >= layout.cleanroom.z[0] && az <= layout.cleanroom.z[1]).toBe(true);
        row.occludedBy = [...grid.crossings(stop.position, f.anchor, 0.97, () => false)].map(o => `${band.owners[o]!.entity} ${band.owners[o]!.id}`).sort();
      }
      stops.push(row);
    }
    evidence.stops = stops;
  }, 120_000); // measured about 20 s cold with all static geometry; 120 s covers the shared, loaded PC

  test('the camera passes through no geometry: fly legs and stops clear all static geometry by 0.2 m', () => {
    const tris = staticTriangles(models, FAB_DATA, () => true, [-1, 6.5]), grid = new TriGrid(tris);
    const legs: Record<string, unknown>[] = [], p = [0, 0, 0];
    const name = (o: number) => o < 0 ? null : `${tris.owners[o]!.entity} ${tris.owners[o]!.id}`;
    for (const seg of tour.segments) {
      if (seg.kind === 'hold') continue;
      const from = seg.from < 0 ? 'start' : tour.stops[seg.from]!.name, to = tour.stops[seg.stop]!.name;
      if (seg.kind === 'cut') { legs.push({ from, to, kind: 'cut', seconds: r3(seg.t1 - seg.t0) }); continue; }
      const path = seg.path!, n = Math.ceil(path.length / STEP);
      let min = Infinity, owner = -1, yMin = Infinity, yMax = -Infinity;
      for (let i = 0; i <= n; i++) {
        const q = (i / n) * path.length;
        const pt = pathPoint(path, q, p);
        const near = grid.nearest(pt, REACH);
        if (near.d < min) { min = near.d; owner = near.owner; }
        yMin = Math.min(yMin, pt[1]!); yMax = Math.max(yMax, pt[1]!);
      }
      expect(min, `${from} to ${to}: nearest ${name(owner)}`).toBeGreaterThanOrEqual(CLEAR);
      legs.push({ from, to, kind: 'fly', seconds: r3(seg.t1 - seg.t0), lengthM: r3(path.length), samples: n + 1,
        minClearanceM: Number.isFinite(min) ? r3(min) : `>= ${REACH}`, nearest: name(owner), heightM: [r3(yMin), r3(yMax)] });
    }
    const stops = tour.stops.map(s => {
      const near = grid.nearest(s.position, REACH);
      expect(near.d, `${s.name}: nearest ${name(near.owner)}`).toBeGreaterThanOrEqual(CLEAR);
      return { stop: s.name, clearanceM: Number.isFinite(near.d) ? r3(near.d) : `>= ${REACH}`, nearest: name(near.owner) };
    });
    evidence.legs = legs;
    evidence.stopClearance = stops;
  }, 180_000); // measured about 30 s cold (the band's triangles and ~1,300 samples); 180 s covers the shared PC

  test('the record matches evidence/sim-spec/ff3-floor/tour.json (FF2 retained)', () => {
    const record = {
      schema: 'foundry-floor.evidence.tour/1', test: 'sim-spec 12 test 9',
      rule: { margin: 'anchor inside 90% of the picture on both axes', fov: `vertical field of view widened so the horizontal is at least ${tour.data.minHorizontalFovDeg} degrees`, clearance: `every fly sample (every ${STEP} m) and every stop at least ${CLEAR} m from static geometry`, moving: 'vehicles run from 3.9 m up and lower FOUPs only at the ports along the aisle sides; people stand up to 1.8 m; fly legs keep to 2.4 to 2.8 m' },
      ...evidence,
    };
    if (WRITE) {
      mkdirSync(dirname(EVIDENCE), { recursive: true });
      writeFileSync(EVIDENCE, `${JSON.stringify(record, null, 2)}\n`);
      return;
    }
    expect(existsSync(EVIDENCE)).toBe(true);
    expect(record).toEqual(JSON.parse(readFileSync(EVIDENCE, 'utf8')));
  });
});
