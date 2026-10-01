// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md items 1 to 3 and 5): the dressing's placements against our own
// terrain imagery (the near albedo mosaic). Each element read from the imagery is drawn on a north-up map of the
// imagery with the model's footprint at ground and as the imagery would show its top (relief displacement:
// approaches.<end>.imagery.displacement, metres toward -X per metre of height), and the modelled edges are compared
// with the imagery's after the same correction, in station and lane offset x (+ the southbound lanes' side). The
// correction uses the alignment's frame at the element's middle station (the plaza and the lot lie on straight or
// gently curved road). Tolerance: the alignment's (approaches.<end>.imagery.tolerance).
// Vista Point's lot is a traced polygon rather than a rectangle, so its outline and planted island are compared
// with the imagery's own edges instead: at points every EDGE_STEP m along each traced edge (clear of its corners),
// the imagery's luminance across the edge (averaged over EDGE_WINDOW m on each side of a candidate) is searched
// EDGE_SEARCH m either way for the step between the pale paving and the darker ground: for the lot, the strongest
// step (the ground beyond it has pale dry grass and trails, the paving inside it parked cars); for the island, the
// first step of EDGE_CONTRAST or more met coming in from the lot's paving, at its strongest within the next
// EDGE_REFINE m (the planting has pale paths among it). A sample without a step of EDGE_CONTRAST finds no edge.
// The throat edge (paving on both sides) is left out. The lot and its cars are at the ground, so no relief
// correction is applied to the edges; the cars' roofs are drawn where the imagery would show them.
// The benched cuts' scrub colours (approaches.<end>.cuts) are recomputed from the imagery over each cut's region,
// every 0.5 m in station and lane offset: the mean colours of its 10-35 % and 65-90 % luma bands, which the data
// must match within 1 (of 255) in every channel.
// The vegetation impostors (item 5) are counted per feature level: the candidate cards, those on ground (the heights
// of the canonical corridor tiles, near for High and Medium and near_low for Low as scene.json terrain.sets load them;
// the runtime's corridor edits reshape only the road's margins), which are the instances uploaded, and those the
// canopy score keeps from the imagery (the mean sRGB colour of four samples 1 m apart around each root; the GPU reads
// a 2 m mip in linear light), by approach and kind, with their GPU bytes. A report only: nothing fails on it.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/dressing-imagery.ts
// Writes evidence/captures/dressing/imagery.json and one <element>-imagery.png per element.
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { LAYOUT, TIER_DATA } from '../../src/data';
import { parkedVehicles, plazaWidening, polygonDistance, vistaRows } from '../../src/world/dressing';
import { frame } from '../../src/world/mesh-arrays';
import { buildApproach, type Approach } from '../../src/world/route';
import { canopyScore, crownAtlas, VEGETATION_INSTANCE_BYTES, vegetationCandidates } from '../../src/world/vegetation';
import { loadTileArrays, Tin } from '../../scripts/approaches.ts';
import { writePng, type Image } from './image.ts';
import { albedoAt, mapImage, nearAlbedo, plotMap, type MapFrame } from './imagery.ts';
import { PACKAGE_ROOT, writeJson } from './owned.ts';

type Rgb = [number, number, number];
type Range = [number, number];
const OUT = resolve(PACKAGE_ROOT, 'evidence/captures/dressing'), MPP = .25, MARGIN = 25;
const COLOURS: Record<string, Rgb> = { model: [255, 214, 0], shown: [255, 0, 200], imagery: [0, 230, 255], parts: [255, 120, 0], paved: [255, 255, 255] };
const EDGE_STEP = 2, EDGE_CORNER = 2, EDGE_SEARCH = 10, EDGE_WINDOW = 3, EDGE_CONTRAST = 12, EDGE_REFINE = 3, CAR = { width: 1.9, length: 4.6, height: 1.5 };
const { approaches, bridge, dressing } = LAYOUT, cs = approaches.crossSection;

/** A rectangle in station and lane offset on an approach, with its top's height above the road. */
interface Footprint { s: Range; x: Range; height: number }
interface Element { name: string; approach: Approach; model: Footprint; imagery: { s: Range; x: Range }; parts: Footprint[]; paved?: (s: number) => Range; region: Range }

const world = (a: Approach, s: number, x: number): [number, number] => { const f = frame(a, s), d = a.sign * x; return [f.x + f.nx * d, f.z + f.nz * d]; };
/** The imagery's shift of a point h metres above the ground, in station and lane offset at station s. */
function shift(a: Approach, s: number, h: number): { ds: number; dx: number } {
  const f = frame(a, s), dX = -a.data.imagery.displacement * h;
  return { ds: dX * f.tx, dx: a.sign * dX * f.nx };
}
function outline(img: Image, map: MapFrame, a: Approach, s: Range, x: Range, rgb: Rgb, offset = { ds: 0, dx: 0 }): void {
  const step = MPP / 2, edge = (s0: number, x0: number, s1: number, x1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(s1 - s0, x1 - x0) / step));
    for (let i = 0; i <= n; i++) { const [px, pz] = world(a, s0 + (s1 - s0) * i / n + offset.ds, x0 + (x1 - x0) * i / n + offset.dx); plotMap(img, map, px, pz, rgb); }
  };
  edge(s[0], x[0], s[1], x[0]); edge(s[1], x[0], s[1], x[1]); edge(s[1], x[1], s[0], x[1]); edge(s[0], x[1], s[0], x[0]);
}

const south = buildApproach('south', approaches.south, bridge.roadEndZ), north = buildApproach('north', approaches.north, bridge.roadEndZ);
const byName = { south, north } as const;
const plaza = dressing.plaza, plazaApproach = byName[plaza.approach];
const elements: Element[] = [{
  name: 'plaza',
  approach: plazaApproach,
  model: { s: plaza.canopy.s, x: plaza.canopy.x, height: plaza.canopy.top },
  imagery: plaza.imagery.roof,
  parts: plaza.islands.x.map((x, k) => ({ s: plaza.islands.s, x: [x - plaza.islands.halfWidth[k]!, x + plaza.islands.halfWidth[k]!] as Range, height: plaza.islands.height })),
  paved: s => { const w = plazaWidening(plaza, cs.pavedHalfWidth, s); return plaza.side > 0 ? [-cs.pavedHalfWidth, cs.pavedHalfWidth + w] : [-cs.pavedHalfWidth - w, cs.pavedHalfWidth]; },
  region: [plaza.fan[0], plaza.fan[3]],
}];

const mosaic = await nearAlbedo();
mkdirSync(OUT, { recursive: true });
const results = elements.map(e => {
  const a = e.approach, mid = (e.model.s[0] + e.model.s[1]) / 2, sh = shift(a, mid, e.model.height), tolerance = a.data.imagery.tolerance;
  // The imagery's edges moved back to the ground, and the model's edges' deviations from them (+ beyond, - short).
  const truth = { s: [e.imagery.s[0] - sh.ds, e.imagery.s[1] - sh.ds] as Range, x: [e.imagery.x[0] - sh.dx, e.imagery.x[1] - sh.dx] as Range };
  const deviation = { sStart: truth.s[0] - e.model.s[0], sEnd: e.model.s[1] - truth.s[1], xLow: truth.x[0] - e.model.x[0], xHigh: e.model.x[1] - truth.x[1] };
  const worst = Math.max(...Object.values(deviation).map(Math.abs));
  // The map: every footprint corner, the region's paved edges and a margin.
  const pts: [number, number][] = [];
  for (const s of [e.region[0], e.region[1], ...e.model.s]) for (const x of [...e.model.x, ...(e.paved?.(s) ?? [])]) pts.push(world(a, s, x));
  const map: MapFrame = { xWest: Math.max(...pts.map(p => p[0])) + MARGIN, xEast: Math.min(...pts.map(p => p[0])) - MARGIN, zSouth: Math.min(...pts.map(p => p[1])) - MARGIN, zNorth: Math.max(...pts.map(p => p[1])) + MARGIN, mpp: MPP };
  const img = mapImage(mosaic, map);
  if (e.paved) for (let s = e.region[0] - 20; s <= e.region[1] + 20; s += MPP) for (const x of e.paved(s)) { const [px, pz] = world(a, s, x); plotMap(img, map, px, pz, COLOURS.paved!, .6); }
  for (const p of e.parts) outline(img, map, a, p.s, p.x, COLOURS.parts!);
  outline(img, map, a, e.imagery.s, e.imagery.x, COLOURS.imagery!);
  outline(img, map, a, e.model.s, e.model.x, COLOURS.model!);
  outline(img, map, a, e.model.s, e.model.x, COLOURS.shown!, sh);
  const file = resolve(OUT, `${e.name}-imagery.png`);
  writeFileSync(file, writePng(img));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    name: e.name, approach: a.name, image: relative(PACKAGE_ROOT, file).replaceAll('\\', '/'),
    model: { s: e.model.s, x: e.model.x, top: e.model.height, size: { alongRoad: r2(e.model.s[1] - e.model.s[0]), across: r2(e.model.x[1] - e.model.x[0]) } },
    imagery: { shown: e.imagery, reliefShift: { ds: r2(sh.ds), dx: r2(sh.dx) }, atGround: { s: truth.s.map(r2), x: truth.x.map(r2) } },
    deviation: Object.fromEntries(Object.entries(deviation).map(([k, v]) => [k, r2(v)])), worst: r2(worst), tolerance, pass: worst <= tolerance,
  };
});
// Vista Point: the traced lot and island against the imagery's edges (see the header).
const vista = dressing.vista, va = byName[vista.approach], vTolerance = va.data.imagery.tolerance;
const luma = (x: number, z: number) => { const c = albedoAt(mosaic, x, z); return c ? .2126 * c[0] + .7152 * c[1] + .0722 * c[2] : NaN; };
const tracedPlan = (pts: readonly (readonly [number, number])[]) => pts.flatMap((q, k) => {
  const r = pts[(k + 1) % pts.length]!, n = Math.max(1, Math.ceil(Math.hypot(r[0] - q[0], r[1] - q[1])));
  return Array.from({ length: n }, (_, i) => world(va, q[0] + (r[0] - q[0]) * i / n, q[1] + (r[1] - q[1]) * i / n));
});
const lotPlan = tracedPlan(vista.outline), islandPlan = tracedPlan(vista.planter);
const median = (v: number[]) => { const s = [...v].sort((p, q) => p - q); return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN; };
const pct = (v: number[], q: number) => { const s = [...v].sort((p, r) => p - r); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN; };
const r2v = (v: number) => Math.round(v * 100) / 100;
type EdgeHit = { x: number; z: number; deviation: number };
/** Imagery edges along a traced polygon's edges: pale is +1 when the paving is inside it (the lot), -1 when outside (the island). */
function tracedEdges(pts: readonly (readonly [number, number])[], shape: [number, number][], pale: 1 | -1, skip: number[], rule: 'strongest' | 'from paving') {
  return pts.map((q, k) => {
    const r = pts[(k + 1) % pts.length]!, len = Math.hypot(r[0] - q[0], r[1] - q[1]), hits: EdgeHit[] = []; let samples = 0;
    if (!skip.includes(k)) for (let m = EDGE_CORNER; m <= len - EDGE_CORNER + 1e-9; m += EDGE_STEP) {
      samples++;
      const at = (u: number) => world(va, q[0] + (r[0] - q[0]) * u, q[1] + (r[1] - q[1]) * u), [px, pz] = at(m / len), [ax, az] = at((m + .5) / len);
      const tl = Math.hypot(ax - px, az - pz); let nx = (az - pz) / tl, nz = -(ax - px) / tl;
      if (polygonDistance(shape, px + nx, pz + nz) < 0) { nx = -nx; nz = -nz; }
      const contrast = (d: number) => {
        let inside = 0, outside = 0, n = 0;
        for (let w = .5; w <= EDGE_WINDOW + 1e-9; w += .5, n++) { inside += luma(px + nx * (d - w), pz + nz * (d - w)); outside += luma(px + nx * (d + w), pz + nz * (d + w)); }
        return pale * (inside - outside) / n;
      };
      // Offsets from the paving side to the other (+ outward from the traced polygon).
      const from = rule === 'strongest' ? -EDGE_SEARCH : pale > 0 ? -EDGE_SEARCH : EDGE_SEARCH, dir = rule === 'strongest' || pale > 0 ? 1 : -1;
      let bestT = NaN, best = -Infinity;
      for (let i = 0; i <= 4 * EDGE_SEARCH; i++) {
        const d = from + dir * i * .5, c = contrast(d);
        if (rule === 'strongest') { if (c > best) { best = c; bestT = d; } continue; }
        if (Number.isNaN(bestT)) { if (c >= EDGE_CONTRAST) { best = c; bestT = d; } continue; }
        if (Math.abs(d - bestT) > EDGE_REFINE + 1e-9) break;
        if (c > best) { best = c; bestT = d; }
      }
      if (best >= EDGE_CONTRAST) hits.push({ x: px + nx * bestT, z: pz + nz * bestT, deviation: -bestT });
    }
    const dev = hits.map(h => h.deviation);
    return { edge: k, from: q, to: r, samples, found: hits.length, median: r2v(median(dev)), worst: r2v(Math.max(0, ...dev.map(Math.abs))), hits };
  }).filter(e => e.samples);
}
const lotEdges = tracedEdges(vista.outline, lotPlan, 1, [vista.throat.edge], 'strongest'), islandEdges = tracedEdges(vista.planter, islandPlan, -1, [], 'from paving');
const vistaResult = (() => {
  const pts = lotPlan, map: MapFrame = { xWest: Math.max(...pts.map(p => p[0])) + MARGIN, xEast: Math.min(...pts.map(p => p[0])) - MARGIN, zSouth: Math.min(...pts.map(p => p[1])) - MARGIN, zNorth: Math.max(...pts.map(p => p[1])) + MARGIN, mpp: MPP };
  const img = mapImage(mosaic, map), line = (x0: number, z0: number, x1: number, z1: number, rgb: Rgb) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (MPP / 2)));
    for (let i = 0; i <= n; i++) plotMap(img, map, x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, rgb);
  };
  const trace = (plan: [number, number][], rgb: Rgb) => plan.forEach((q, k) => { const r = plan[(k + 1) % plan.length]!; line(q[0], q[1], r[0], r[1], rgb); });
  for (let s = Math.min(...vista.outline.map(p => p[0])) - 60; s <= Math.max(...vista.outline.map(p => p[0])) + 60; s += MPP) for (const x of [-cs.pavedHalfWidth, cs.pavedHalfWidth]) { const [px, pz] = world(va, s, x); plotMap(img, map, px, pz, COLOURS.paved!, .6); }
  for (const row of vistaRows(va, vista)) for (const l of row.lines) line(l.p[0], l.p[2], l.p[0] + l.n[0] * vista.stalls.depth, l.p[2] + l.n[1] * vista.stalls.depth, COLOURS.paved!);
  trace(lotPlan, COLOURS.model!); trace(islandPlan, COLOURS.model!);
  const [t0, t1] = [vista.outline[vista.throat.edge]!, vista.outline[(vista.throat.edge + 1) % vista.outline.length]!];
  { const [x0, z0] = world(va, t0[0], t0[1]), [x1, z1] = world(va, t1[0], t1[1]); line(x0, z0, x1, z1, COLOURS.paved!); }
  for (let k = vista.wall.from; k !== vista.wall.to; k = (k + 1) % vista.outline.length) {
    const q = vista.outline[k]!, r = vista.outline[(k + 1) % vista.outline.length]!;
    for (let i = 0; i < 20; i++) { const [x0, z0] = world(va, q[0] + (r[0] - q[0]) * i / 20, q[1] + (r[1] - q[1]) * i / 20), [x1, z1] = world(va, q[0] + (r[0] - q[0]) * (i + 1) / 20, q[1] + (r[1] - q[1]) * (i + 1) / 20); line(x0, z0, x1, z1, COLOURS.parts!); }
  }
  const cars = parkedVehicles(approaches, bridge.roadEndZ, dressing), roof = -va.data.imagery.displacement * CAR.height;
  for (const c of cars) {
    const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw), sx = -fz, sz = fx, hl = CAR.length / 2, hw = CAR.width / 2;
    const corner = (a: number, b: number): [number, number] => [c.x + roof + fx * a + sx * b, c.z + fz * a + sz * b];
    trace([corner(hl, hw), corner(hl, -hw), corner(-hl, -hw), corner(-hl, hw)], COLOURS.shown!);
  }
  for (const e of [...lotEdges, ...islandEdges]) for (const h of e.hits) for (let d = -.5; d <= .5; d += .25) { plotMap(img, map, h.x + d, h.z, COLOURS.imagery!, 1); plotMap(img, map, h.x, h.z + d, COLOURS.imagery!, 1); }
  const file = resolve(OUT, 'vista-imagery.png'); writeFileSync(file, writePng(img));
  const area = (plan: [number, number][]) => { let s = 0; for (let i = 0, j = plan.length - 1; i < plan.length; j = i++) s += plan[j]![0] * plan[i]![1] - plan[i]![0] * plan[j]![1]; return Math.abs(s / 2); };
  const summary = (edges: typeof lotEdges) => {
    const dev = edges.flatMap(e => e.hits.map(h => h.deviation)), abs = dev.map(Math.abs), samples = edges.reduce((n, e) => n + e.samples, 0);
    return { samples, found: dev.length, median: r2v(median(dev)), medianAbs: r2v(median(abs)), p90Abs: r2v(pct(abs, .9)), within: dev.filter(d => Math.abs(d) <= vTolerance).length,
      edges: edges.map(({ hits, ...e }) => e) };
  };
  const ss = vista.outline.map(p => p[0]), xs = vista.outline.map(p => p[1]), lot = summary(lotEdges), island = summary(islandEdges);
  // The traced lot and island each lie within the tolerance of the imagery's edges at the median of their samples;
  // the per-edge medians show where parked cars, the service road's paving or the island's paths compete.
  const pass = lot.medianAbs <= vTolerance && island.medianAbs <= vTolerance;
  return {
    name: 'vista', approach: va.name, image: relative(PACKAGE_ROOT, file).replaceAll('\\', '/'),
    placement: { s: [Math.min(...ss), Math.max(...ss)], x: [Math.min(...xs), Math.max(...xs)], level: vista.level, size: { alongRoad: r2v(Math.max(...ss) - Math.min(...ss)), across: r2v(Math.max(...xs) - Math.min(...xs)) },
      area: { outline: r2v(area(lotPlan)), island: r2v(area(islandPlan)), paved: r2v(area(lotPlan) - area(islandPlan)) },
      stalls: vistaRows(va, vista).reduce((n, r) => n + r.stalls.length, 0), cars: cars.length },
    lot, island, tolerance: vTolerance, pass,
  };
})();
// Benched cuts (item 3): the scrub colours recomputed from the imagery (see the header).
const cutResults = (['south', 'north'] as const).flatMap(end => (LAYOUT.approaches[end].cuts ?? []).map(c => {
  const a = buildApproach(end, LAYOUT.approaches[end], LAYOUT.bridge.roadEndZ), px: [number, number, number, number][] = [];
  for (let s = c.scrub.region.s[0]; s <= c.scrub.region.s[1] + 1e-9; s += .5) {
    const f = frame(a, s);
    for (let x = c.scrub.region.x[0]; x <= c.scrub.region.x[1] + 1e-9; x += .5) {
      const d = a.sign * x, rgb = albedoAt(mosaic, f.x + f.nx * d, f.z + f.nz * d);
      if (rgb) px.push([rgb[0], rgb[1], rgb[2], .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]]);
    }
  }
  px.sort((u, v) => u[3] - v[3]);
  const band = (lo: number, hi: number) => { const part = px.slice(Math.floor(px.length * lo), Math.floor(px.length * hi)); return [0, 1, 2].map(k => Math.round(part.reduce((sum, q) => sum + q[k]!, 0) / part.length)); };
  const dark = band(.1, .35), light = band(.65, .9), stored = [...c.scrub.dark, ...c.scrub.light];
  return { name: `${end} cut ${c.s.join('-')}`, region: c.scrub.region, samples: px.length, dark, light, stored: { dark: c.scrub.dark, light: c.scrub.light }, pass: [...dark, ...light].every((v, k) => Math.abs(v - stored[k]!) <= 1) };
}));
// Vegetation impostors (item 5): counts per feature level (see the header).
const veg = LAYOUT.dressing.vegetation, tins = { near: new Tin(loadTileArrays('near')), near_low: new Tin(loadTileArrays('near_low')) };
const atlas = crownAtlas(), atlasBytes = Math.round(atlas.width * atlas.height * 4 * 4 / 3);
const rootColour = (x: number, z: number) => {
  const sum = [0, 0, 0]; let n = 0;
  for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) { const c = albedoAt(mosaic, x + dx, z + dz); if (c) { for (let k = 0; k < 3; k++) sum[k]! += c[k]!; n++; } }
  return n ? sum.map(q => q / n) : null;
};
const vegetation = (['high', 'medium', 'low'] as const).map(level => {
  const f = TIER_DATA.features[level].vegetation, tin = tins[level === 'low' ? 'near_low' : 'near'];
  const cands = vegetationCandidates(LAYOUT.approaches, LAYOUT.bridge.roadEndZ, LAYOUT.dressing, f.density), kept: Record<string, number> = {};
  let onGround = 0;
  for (const c of cands) {
    const y = tin.height(c.x, c.z); if (!(y >= veg.ground)) continue;
    onGround++;
    const rgb = rootColour(c.x, c.z), key = `${c.approach} ${c.kind}`;
    kept[key] ??= 0;
    if (rgb && Math.round(c.seed * 255) / 255 < canopyScore(rgb, c.kind, veg.classes)) kept[key]!++;
  }
  const keptTotal = Object.values(kept).reduce((a, b) => a + b, 0);
  return { level, density: f.density, fade: f.fade, corridorTiles: level === 'low' ? 'near_low' : 'near', candidates: cands.length, instances: onGround, kept, keptTotal, instanceBytes: onGround * VEGETATION_INSTANCE_BYTES, atlasBytes };
});
const report = {
  description: 'Fix round 3 dressing placements against the near albedo mosaic. deviation: modelled edge minus the imagery edge moved back to the ground (+ the model reaches further, - it stops short), in metres along the road (s) and across it (x, + the southbound lanes\' side). Map colours: yellow the model at ground, magenta where the imagery would show its top, cyan the imagery\'s edges as read, orange the parts (toll islands), white the paved edges.',
  vista: 'Vista Point: the traced lot outline (yellow, the throat edge white, the overlook wall orange) and planted island (yellow) with the stall lines (white) and the parked cars\' roofs as the imagery would show them (magenta), and the imagery\'s own edges found across the traced edges (cyan). deviation: the traced edge minus the imagery edge along the outward normal (+ the traced lot or island reaches further). The lot and the island pass when the median |deviation| of their samples is within the tolerance; edges: [edge, found/samples, median, worst |deviation|].',
  cuts: 'Benched cuts: the scrub colours recomputed from the imagery over each cut\'s region (stations s, lane offsets x): the mean colours (sRGB) of its 10-35 % (dark) and 65-90 % (light) luma bands, and the stored colours they must match within 1.',
  vegetationNote: 'Vegetation impostors per feature level: candidates (the jittered grid thinned by the density), instances (those on ground, uploaded at 20 bytes each), kept (those the canopy score keeps from the imagery, by approach and kind; the rest collapse on the GPU), and the crown atlas bytes (with mips).',
  colours: COLOURS, elements: results, vistaLot: vistaResult, cutScrub: cutResults, vegetation,
};
writeJson(resolve(OUT, 'imagery.json'), report);
console.log(JSON.stringify(results.map(r => ({ name: r.name, worst: r.worst, pass: r.pass, deviation: r.deviation, image: r.image }))));
const brief = (e: { edges: { edge: number; samples: number; found: number; median: number; worst: number }[] } & Record<string, unknown>) => ({ ...e, edges: e.edges.map(d => [d.edge, d.found + '/' + d.samples, d.median, d.worst].join(' ')) });
console.log(JSON.stringify({ name: 'vista', placement: vistaResult.placement, lot: brief(vistaResult.lot), island: brief(vistaResult.island), pass: vistaResult.pass, image: vistaResult.image }));
console.log(JSON.stringify(cutResults));
console.log(JSON.stringify(vegetation));
if (results.some(r => !r.pass) || !vistaResult.pass || cutResults.some(r => !r.pass)) throw new Error('a dressing element lies outside the imagery tolerance');
