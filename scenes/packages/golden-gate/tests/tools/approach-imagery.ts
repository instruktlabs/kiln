// Review 2 item 1: the approach roads against the terrain imagery, "measured on top-down captures with the road
// drawn over the imagery". For each end this decodes the staged near albedo tiles (WebP, in headless Chrome; no
// server), crops the approach's corridor as a map (north up, west left, 1 m per pixel, about the imagery's own
// 0.98 m per texel; grey beyond the terrain frame at |X|, |Z| = 2000 m) and draws over the imagery, from the layout
// the scene builds:
//  - red: the modelled centreline (orange in the end's dissolve stretch);
//  - yellow: the edge lines (layout.json approaches.crossSection.markings.edge);
//  - white, dashed: +-5 m around the centreline, the review's tolerance;
//  - magenta: on the structures, where the imagery shows the elevated road: the orthophoto is rectified to bare
//    earth, so a road `a` m above the ground appears displaced east (-X) by `imagery.displacement` x a;
//  - cyan: the imagery's road centre points (`imagery.reference`, read from the imagery in 20 to 25 m steps).
// It measures each point's offset from the centreline (on structures after the displacement), as `layout.ts --check`
// does, and writes evidence/captures/approaches/imagery-<end>.png and imagery.json.
// Usage: bun tests/tools/approach-imagery.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PACKAGE_ROOT, writeJson } from './owned.ts';
import { EXTENT, SIZE, nearAlbedo } from './imagery.ts';
import { writePng, type Image, type Rgb } from './image.ts';
import { APPROACH_NAMES, Tin, loadTileArrays } from '../../scripts/approaches.ts';
import { LAYOUT } from '../../src/data';
import { approachHorizontal } from '../../src/world/route';
import { horizontalAt, horizontalProject, lateral, profileAt } from '../../src/world/alignment';

const MPP = 1, MARGIN = 60, TOLERANCE_DASH = 4;

const mosaic = await nearAlbedo(), tin = new Tin(loadTileArrays('near'));
const roadEndZ = LAYOUT.bridge.roadEndZ, cs = LAYOUT.approaches.crossSection, edge = (cs.markings.edge[0] + cs.markings.edge[1]) / 2;
const report: Record<string, unknown> = {};
for (const name of APPROACH_NAMES) {
  const data = LAYOUT.approaches[name], h = approachHorizontal(name, data.alignment, roadEndZ), profile = { pvis: data.profile };
  const structure = (s: number) => data.structures.some(st => s >= st.from && s <= st.to);
  const above = (s: number) => { const c = horizontalAt(h, s); return Math.max(0, profileAt(profile, s).y - tin.height(c.x, c.z)); };
  // The crop: the centreline and the reference points with a margin.
  let xw = -Infinity, xe = Infinity, zs = Infinity, zn = -Infinity;
  const grow = (x: number, z: number) => { xw = Math.max(xw, x + MARGIN); xe = Math.min(xe, x - MARGIN); zn = Math.max(zn, z + MARGIN); zs = Math.min(zs, z - MARGIN); };
  for (let s = 0; s <= data.length; s += 5) { const p = horizontalAt(h, s); grow(p.x, p.z); }
  for (const [x, z] of data.imagery.reference) grow(x, z);
  [xw, xe, zs, zn] = [Math.ceil(xw), Math.floor(xe), Math.floor(zs), Math.ceil(zn)];
  const W = Math.round((xw - xe) / MPP), H = Math.round((zn - zs) / MPP), img: Image = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = xw - (i + .5) * MPP, z = zn - (j + .5) * MPP;
    const c = Math.floor((x + EXTENT) / (2 * EXTENT) * SIZE), r = Math.floor((EXTENT - z) / (2 * EXTENT) * SIZE), o = (j * W + i) * 4;
    // Beyond the terrain frame: neutral grey.
    if (c < 0 || r < 0 || c >= SIZE || r >= SIZE) img.data.set([96, 96, 96, 255], o);
    else { img.data.set(mosaic.subarray((r * SIZE + c) * 4, (r * SIZE + c) * 4 + 3), o); img.data[o + 3] = 255; }
  }
  const plot = (x: number, z: number, rgb: Rgb, a = .9) => {
    const i = Math.floor((xw - x) / MPP), j = Math.floor((zn - z) / MPP); if (i < 0 || j < 0 || i >= W || j >= H) return;
    const o = (j * W + i) * 4; for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(img.data[o + k]! * (1 - a) + rgb[k]! * a);
  };
  // Lines every 0.25 m of station, offset d from the centreline; a dash keeps TOLERANCE_DASH m on and off.
  const line = (d: number, rgb: Rgb | ((s: number) => Rgb | null), shift: (s: number) => number = () => 0, dash = 0) => {
    for (let s = 0; s <= data.length; s += .25) {
      if (dash && Math.floor(s / dash) % 2) continue;
      const colour = typeof rgb === 'function' ? rgb(s) : rgb; if (!colour) continue;
      const p = horizontalAt(h, s), [nx, nz] = lateral(p.tx, p.tz); plot(p.x + nx * d - shift(s), p.z + nz * d, colour);
    }
  };
  const [d0, d1] = data.ends.dissolve;
  for (const d of [-edge, edge]) line(d, [255, 225, 0]);
  for (const d of [-5, 5]) line(d, [255, 255, 255], undefined, TOLERANCE_DASH);
  line(0, s => s >= d0 && s <= d1 ? [255, 150, 0] : [255, 40, 40]);
  line(0, s => structure(s) ? [255, 0, 255] : null, s => data.imagery.displacement * above(s));
  // Reference points and their offsets.
  const points = data.imagery.reference.map(([x, z]) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) plot(x + di * MPP, z + dj * MPP, [0, 235, 255], 1);
    const p = horizontalProject(h, x, z, 50);
    if (!p) return { x, z, beyond: true };
    if (!structure(p.s)) return { x, z, s: +p.s.toFixed(1), d: +p.d.toFixed(2) };
    const a = above(p.s), q = horizontalProject(h, x + data.imagery.displacement * a, z, 50)!;
    return { x, z, s: +p.s.toFixed(1), structure: true, above: +a.toFixed(1), dRaw: +p.d.toFixed(2), d: +q.d.toFixed(2) };
  });
  const worst = (sel: (p: (typeof points)[number]) => boolean) => +Math.max(0, ...points.filter(p => 'd' in p && sel(p)).map(p => Math.abs((p as { d: number }).d))).toFixed(2);
  const file = `imagery-${name}.png`;
  writeFileSync(resolve(PACKAGE_ROOT, 'evidence/captures/approaches', file), writePng(img));
  report[name] = {
    image: `evidence/captures/approaches/${file}`, crop: { xWest: xw, xEast: xe, zSouth: zs, zNorth: zn, metresPerPixel: MPP, width: W, height: H },
    tolerance: data.imagery.tolerance, displacement: data.imagery.displacement, references: points.length,
    worst: { atGrade: worst(p => !('structure' in p)), elevated: worst(p => 'structure' in p) }, layoutCheck: data.deviation, points,
  };
  const r = report[name] as { worst: { atGrade: number; elevated: number } };
  console.log(`${name}: ${file} ${W}x${H}; ${points.length} reference points, worst ${r.worst.atGrade} m at grade, ${r.worst.elevated} m on structures (tolerance ${data.imagery.tolerance} m)`);
}
writeJson(resolve(PACKAGE_ROOT, 'evidence/captures/approaches/imagery.json'), {
  description: 'Review 2 item 1: each approach drawn over the terrain imagery (the staged near albedo, north up, west left, 1 m per pixel). Red: the modelled centreline (orange in the dissolve stretch); yellow: the edge lines; white dashes: +-5 m (the tolerance); magenta: on structures, where the imagery shows the elevated road (relief displacement, east by `displacement` x the height above the ground); cyan: the imagery road centre points. d: a point\'s offset from the centreline in metres (on structures after the displacement; dRaw before it).',
  ...report,
});
