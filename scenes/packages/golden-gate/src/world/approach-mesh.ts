// SPDX-License-Identifier: MIT
// The approach roads' meshes (fix round 2), generated from data/layout.json `approaches` (D-21) through
// the shared alignment (./alignment, ./route): asphalt with the deck's lane lines, edge lines and median,
// concrete barriers, a ramp that takes the deck walkways down to the shoulder at the anchorage, and on
// structures a slab soffit, girders, bents and abutments. Two representations: `near` (2 m stations, every
// part) and `far` (10 m stations: road, barrier faces, the median, structure). Materials are the bridge GLB's own
// (Asphalt, RoadMarkings, Concrete, looked up by name), so an approach reads as the deck's continuation.
// Columns and abutment walls run down to `supports.footing`, below the ground everywhere along the
// approaches; the terrain (edited by ./corridor) hides what lies under it. Geometry is built as typed
// arrays (pure, testable) and wrapped in three.js meshes by approachMeshes().
import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three/webgpu';
import type { Material } from 'three/webgpu';
import { Arrays, at, frame } from './mesh-arrays';
import type { MeshArrays, V3 } from './mesh-arrays';
import type { Approach } from './route';
import { barrierGaps, dressingArrays, dressingBreaks, medianGap, medianScale, sideWidening } from './dressing';
import type { ApproachCrossSection, SceneDressing } from '../data';

export type ApproachDetail = 'near' | 'far';
/** Station spacing of each representation (m). */
export const STATION_STEP: Record<ApproachDetail, number> = { near: 2, far: 10 };

/** How far below the bed a cut's toe wall reaches (m), so the terrain meets its faces, not its foot. */
export const TOE_FOOT = .3;

export type { MeshArrays } from './mesh-arrays';
export interface ApproachArrays { road: MeshArrays; markings: MeshArrays | null; concrete: MeshArrays; paint: MeshArrays | null; glass: MeshArrays | null }

/** Sorted stations from 0 to the approach length every `step` metres, with the given breaks. */
function stations(length: number, step: number, breaks: readonly number[]): number[] {
  const all = new Set<number>();
  for (let s = 0; s < length - 1e-6; s += step) all.add(+s.toFixed(6));
  all.add(length);
  for (const b of breaks) if (b > 0 && b < length) all.add(b);
  return [...all].sort((x, y) => x - y).filter((s, k, list) => k === 0 || s - list[k - 1]! > .05);
}

/**
 * Typed arrays of one approach for one representation. `roadEndZ` is the bridge's road end (the approach's
 * station 0); `medianHalfWidth` is the deck median's (layout.json bridge). `dressing` (layout.json, fix round 3)
 * widens the paved road and moves its barrier at the toll plaza, interrupts the median across it and adds the
 * plaza's canopy, columns and islands; at Vista Point it gaps the edge barrier for the lot's throat and adds the
 * lot (./dressing).
 */
export function approachArrays(a: Approach, cs: ApproachCrossSection, roadEndZ: number, medianHalfWidth: number, detail: ApproachDetail, dressing?: SceneDressing): ApproachArrays {
  const L = a.length, data = a.data, [fade] = data.ends.dissolve, near = detail === 'near';
  const P = cs.pavedHalfWidth, [bIn, bOut, bH] = cs.barrier, slab = cs.deck.slab, girder = cs.deck.girder, gw = cs.deck.girderHalfWidth;
  const { ramp, taper } = cs.joint, footing = cs.supports.footing;
  const structures = data.segments.filter(s => s.kind === 'viaduct' || s.kind === 'overpass');
  const gap = medianGap(a, dressing), openings = barrierGaps(a, dressing), gapBreaks = Number.isFinite(gap[0]) ? [gap[0] - taper, gap[1] + taper] : [];
  const breaks = [fade, fade - taper, ramp[1], ...structures.flatMap(s => [s.from, s.to]), ...dressingBreaks(a, dressing), ...gapBreaks];
  const S = stations(L, STATION_STEP[detail], breaks), frames = S.map(s => frame(a, s));
  const road = new Arrays(), marks = new Arrays(), concrete = new Arrays(), paint = new Arrays(), glass = new Arrays();
  const up: V3 = [0, 1, 0];
  const onStructure = (s: number) => structures.some(t => s > t.from + 1e-6 && s < t.to - 1e-6);
  const taperAt = (s: number) => Math.min(1, Math.max(0, (fade - s) / taper));
  const wide = (s: number, side: number) => sideWidening(a, dressing, P, s, side);
  const medianAt = (s: number) => Math.min(taperAt(s), medianScale(gap, taper, s));
  for (let k = 0; k + 1 < S.length; k++) {
    const s0 = S[k]!, s1 = S[k + 1]!, f0 = frames[k]!, f1 = frames[k + 1]!, mid = (s0 + s1) / 2;
    // Asphalt across the shoulders (u = x, v = z in metres, as on the deck's Roadway), and a plaza's extra width.
    const w0 = [wide(s0, -1), wide(s0, 1)], w1 = [wide(s1, -1), wide(s1, 1)];
    road.quad(at(f0, -P - w0[0]!, 0), at(f0, P + w0[1]!, 0), at(f1, P + w1[1]!, 0), at(f1, -P - w1[0]!, 0), up);
    if (mid < fade) {
      // Barriers (taper to the road before the dissolve) and, near, the median and edge lines.
      const h0 = bH * taperAt(s0), h1 = bH * taperAt(s1);
      for (const side of [-1, 1]) {
        if (openings.some(g => g.side === side && mid > g.s[0] && mid < g.s[1])) continue;
        const j = side < 0 ? 0 : 1, in0 = side * (bIn + w0[j]!), in1 = side * (bIn + w1[j]!), o0 = side * (bOut + w0[j]!), o1 = side * (bOut + w1[j]!);
        const out: V3 = [side * f0.nx, 0, side * f0.nz], inward: V3 = [-out[0], 0, -out[2]];
        concrete.quad(at(f0, o0, -slab), at(f1, o1, -slab), at(f1, o1, h1), at(f0, o0, h0), out);
        concrete.quad(at(f0, in0, h0), at(f1, in1, h1), at(f1, o1, h1), at(f0, o0, h0), up);
        if (near) concrete.quad(at(f0, in0, 0), at(f1, in1, 0), at(f1, in1, h1), at(f0, in0, h0), inward);
      }
      // The median continues the deck's movable median barrier (item 4) in both representations.
      if (!(mid > gap[0] && mid < gap[1])) {
        const m0 = cs.medianHeight * medianAt(s0), m1 = cs.medianHeight * medianAt(s1), w = medianHalfWidth;
        concrete.quad(at(f0, -w, m0), at(f1, -w, m1), at(f1, w, m1), at(f0, w, m0), up);
        for (const side of [-1, 1]) concrete.quad(at(f0, side * w, 0), at(f1, side * w, 0), at(f1, side * w, m1), at(f0, side * w, m0), [side * f0.nx, 0, side * f0.nz]);
      }
      if (near) {
        for (const side of [-1, 1]) {
          const [e0, e1] = cs.markings.edge, lift = cs.markings.lift;
          marks.quad(at(f0, side * e0, lift), at(f0, side * e1, lift), at(f1, side * e1, lift), at(f1, side * e0, lift), up, [[0, s0 / 3], [1, s0 / 3], [1, s1 / 3], [0, s1 / 3]]);
        }
      }
    }
    if (onStructure(mid)) {
      // Slab soffit, then the girder box.
      concrete.quad(at(f0, -bOut, -slab), at(f0, bOut, -slab), at(f1, bOut, -slab), at(f1, -bOut, -slab), [0, -1, 0]);
      concrete.box(f0, f1, -gw, gw, [f0.y - girder, f0.y - slab], [f1.y - girder, f1.y - slab], { sides: true, bottom: true });
    }
  }
  // Barrier start faces against the deck end.
  if (near) for (const side of [-1, 1]) concrete.box(frames[0]!, frames[1]!, Math.min(side * bIn, side * bOut), Math.max(side * bIn, side * bOut), [frames[0]!.y - slab, frames[0]!.y + bH], [frames[1]!.y - slab, frames[1]!.y + bH], { sides: false, start: true });
  // Broken lane lines: dashes by route station, continuing the deck's pattern (sigma = sign * (roadEndZ + s)).
  if (near) {
    const { dash, period, phase, lift, broken } = cs.markings, sigmaAt = (s: number) => a.sign * (roadEndZ + s);
    const lo = Math.min(sigmaAt(0), sigmaAt(fade)), hi = Math.max(sigmaAt(0), sigmaAt(fade));
    for (let k = Math.floor((lo - phase) / period) - 1; phase + k * period <= hi; k++) {
      const sa = a.sign * (phase + k * period) - roadEndZ, sb = a.sign * (phase + k * period + dash) - roadEndZ;
      const d0 = Math.max(0, Math.min(sa, sb)), d1 = Math.min(fade, Math.max(sa, sb));
      if (d1 - d0 < .05) continue;
      const g0 = frame(a, d0), g1 = frame(a, d1);
      for (const [l0, l1] of broken) for (const side of [-1, 1]) marks.quad(at(g0, side * l0, lift), at(g0, side * l1, lift), at(g1, side * l1, lift), at(g1, side * l0, lift), up, [[0, 1], [1, 1], [1, 0], [0, 0]]);
    }
    // The deck walkways end 0.22 m above the road at the anchorage: a concrete ramp takes them to the shoulder.
    const [rise, run] = ramp, r0 = frames[0]!, r1 = frame(a, run), w0 = cs.joint.walk[0], w1 = cs.joint.walk[1];
    for (const side of [-1, 1]) {
      const dA = side * w0, dB = side * w1, out: V3 = [-side * r0.nx, 0, -side * r0.nz];
      concrete.quad(at(r0, dA, rise), at(r1, dA, 0), at(r1, dB, 0), at(r0, dB, rise), up);
      concrete.quad(at(r0, dA, 0), at(r1, dA, 0), at(r0, dA, rise), at(r0, dA, rise), out);
    }
  }
  // Bents: a cap beam under the girders on two columns down to the footing level.
  const col = cs.supports.column / 2, [capDepth, capLength] = cs.supports.cap;
  for (const seg of structures) for (const sb of seg.supports ?? []) {
    const f0 = frame(a, sb - col), f1 = frame(a, sb + col), capTop0 = f0.y - girder, capTop1 = f1.y - girder;
    concrete.box(f0, f1, -capLength / 2, capLength / 2, [capTop0 - capDepth, capTop0], [capTop1 - capDepth, capTop1], { sides: true, bottom: true, start: true, end: true });
    for (const dc of cs.supports.columns) concrete.box(f0, f1, dc - col, dc + col, [footing, capTop0 - capDepth], [footing, capTop1 - capDepth], { sides: true, start: true, end: true });
  }
  // Abutments: walls under the slab across the bed, down to the footing level.
  const bed = bOut + cs.envelope.bedMargin, A = cs.supports.abutment;
  for (const seg of structures) for (const c of seg.abutments ?? []) {
    const f0 = frame(a, c - A / 2), f1 = frame(a, c + A / 2);
    concrete.box(f0, f1, -bed, bed, [footing, f0.y - slab], [footing, f1.y - slab], { sides: true, start: true, end: true });
  }
  // The barrier's end faces at a gap (Vista Point's throat).
  if (near) for (const g of openings) for (const [s, dir] of [[g.s[0], 1], [g.s[1], -1]] as const) {
    const f = frame(a, s), w = wide(s, g.side), h = bH * taperAt(s), i = g.side * (bIn + w), o = g.side * (bOut + w);
    concrete.quad(at(f, i, 0), at(f, i, h), at(f, o, h), at(f, o, -slab), [f.tx * dir, 0, f.tz * dir]);
  }
  // Benched cuts' toe walls (fix round 3), near only: low concrete retaining walls from TOE_FOOT below the bed to
  // their top above the road, along the stations where our imagery shows them; the corridor's cut profile rises
  // across their body.
  if (near) for (const c of data.cuts ?? []) {
    const side = a.sign * c.side, [w0, w1] = c.toe.x, lo = side > 0 ? w0 : -w1, hi = side > 0 ? w1 : -w0, [t0, t1] = c.toe.s;
    const F = stations(t1 - t0, STATION_STEP.near, []).map(s => frame(a, t0 + s)), foot = cs.pavement + TOE_FOOT;
    for (let k = 0; k + 1 < F.length; k++) {
      const f0 = F[k]!, f1 = F[k + 1]!;
      concrete.box(f0, f1, lo, hi, [f0.y - foot, f0.y + c.toe.height], [f1.y - foot, f1.y + c.toe.height], { sides: true, top: true, start: k === 0, end: k === F.length - 2 });
    }
  }
  if (dressing) dressingArrays(a, dressing, near, { road, marks, concrete, paint, glass }, cs);
  return { road: road.arrays(), markings: marks.empty ? null : marks.arrays(), concrete: concrete.arrays(), paint: paint.empty ? null : paint.arrays(), glass: glass.empty ? null : glass.arrays() };
}

/** Concatenates mesh arrays (both approaches share one draw per material). */
export function mergeArrays(parts: readonly MeshArrays[]): MeshArrays {
  const count = parts.reduce((n, p) => n + p.position.length / 3, 0), indices = parts.reduce((n, p) => n + p.index.length, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2), index = count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let v = 0, i = 0;
  for (const p of parts) {
    position.set(p.position, v * 3); normal.set(p.normal, v * 3); uv.set(p.uv, v * 2);
    for (let k = 0; k < p.index.length; k++) index[i + k] = p.index[k]! + v;
    v += p.position.length / 3; i += p.index.length;
  }
  return { position, normal, uv, index };
}

function geometry(arrays: MeshArrays): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(arrays.position, 3)); g.setAttribute('normal', new BufferAttribute(arrays.normal, 3)); g.setAttribute('uv', new BufferAttribute(arrays.uv, 2));
  g.setIndex(new BufferAttribute(arrays.index, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

export interface ApproachMaterials { asphalt: Material; markings: Material; concrete: Material; paint: Material; glass: Material }
export interface ApproachMeshes { group: Group; triangles: number; draws: number; dispose(): void }
/** One representation of both approaches as meshes on the bridge's own materials (not disposed here: the bridge owns them). */
export function approachMeshes(approaches: readonly Approach[], cs: ApproachCrossSection, roadEndZ: number, medianHalfWidth: number, detail: ApproachDetail, materials: ApproachMaterials, o: { castShadow: boolean; layer: number }, dressing?: SceneDressing): ApproachMeshes {
  const group = new Group(); group.name = `approaches-${detail}`;
  const parts = approaches.map(a => approachArrays(a, cs, roadEndZ, medianHalfWidth, detail, dressing));
  const geometries: BufferGeometry[] = [];
  let triangles = 0;
  const add = (name: string, arrays: MeshArrays | null, material: Material, cast: boolean) => {
    if (!arrays || !arrays.index.length) return;
    const g = geometry(arrays); geometries.push(g); triangles += arrays.index.length / 3;
    const mesh = new Mesh(g, material); mesh.name = `approaches-${detail}-${name}`;
    mesh.castShadow = cast; mesh.receiveShadow = o.castShadow; mesh.matrixAutoUpdate = false; mesh.layers.set(o.layer);
    group.add(mesh);
  };
  add('road', mergeArrays(parts.map(p => p.road)), materials.asphalt, false);
  const markings = parts.flatMap(p => (p.markings ? [p.markings] : []));
  if (markings.length) add('markings', mergeArrays(markings), materials.markings, false);
  add('concrete', mergeArrays(parts.map(p => p.concrete)), materials.concrete, o.castShadow && detail === 'near');
  for (const [name, key] of [['paint', 'paint'], ['glass', 'glass']] as const) {
    const list = parts.flatMap(p => (p[key] ? [p[key]] : []));
    if (list.length) add(name, mergeArrays(list), materials[key], o.castShadow && detail === 'near' && key === 'paint');
  }
  group.updateMatrixWorld(true);
  return { group, triangles, draws: group.children.length, dispose() { group.removeFromParent(); for (const g of geometries) g.dispose(); } };
}
