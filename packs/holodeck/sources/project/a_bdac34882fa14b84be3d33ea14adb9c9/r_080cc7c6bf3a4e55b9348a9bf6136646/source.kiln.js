// Meridian Sanctuary planting (plan.md section 5, assets 32-37): columnar cypress, flowering
// shrubs and trailing ivy. PIECE selects which one this revision is. Each plant is one mesh with
// one alpha-masked material, so placements batch, and binds Holodeck's asset.foliage by its
// Mesh_<name> node. Wind weight is UV.y: a plant's body runs v 0 at its foot to 1 at its top
// (the whole column sways a little), each tuft or strand card runs 0 at its attachment to 1 at
// its tip. Cards are emitted on both sides with outward normals, so foliage shades as a
// volume instead of darkening when a card is seen from behind.
const meta = { name: 'Meridian planting' };
const PIECE = 'shrub-c';

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------------------------------------------------------------- textures (512 x 512 atlases)
// Column 0 (u 0 - 0.25) is an opaque body strip; columns 1 - 3 hold card sprays drawn with their
// attachment at the top of the image (v = 0) and their tip at the bottom (v = 1). Cleared texels
// keep a near-zero alpha and a foliage colour, so filtering never darkens a silhouette.
function bodyStrip(layers, floor) { // floor: the colour cleared texels keep, at alpha 1
  return [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: 512, usage: 'albedo', layers } },
    { op: 'mask', shape: { kind: 'rectangle', x: 0, y: 0, width: 128, height: 512 } },
    { op: 'paint', shape: { kind: 'rectangle', x: 128, y: 0, width: 384, height: 512 }, rgba: [...floor, 1] }];
}
// A flame-shaped spray in column c: overlapping leaf blobs in bands that widen then taper.
function spray(c, bands, blob, colours, seed) {
  const cx = 128 * c + 64, ops = [];
  bands.forEach(([y0, y1, w, n], i) => colours.forEach(([rgba, share], k) => ops.push({ op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: blob[0], height: blob[1] }, rgba, count: Math.max(1, Math.round(n * share)),
    seed: seed + 31 * i + 7 * k, area: { x: cx - Math.round(w / 2), y: y0, width: w, height: y1 - y0 } })));
  return ops;
}
// Cypress (turn 8): a 512 px atlas of 128 px cells (2 px gutters), composed from one procedural
// source per region since a single texture allows only 256 stamps. Column 0 is the opaque core
// strip, dark olive with lighter and darker blotches, over a band of bark at its foot (v 0 -
// 0.05, which the trunk maps). Columns 1 - 3 hold twelve clump cells in four rows by height on
// the tree (row 0 at the foot, so the wind weight grows upward). Each clump is a dense oval of
// needle tufts: dark at its root (the cell's top), deep olive in the middle, and a fringe of
// fine lit tufts round its tip and sides, so the outline is soft rather than serrated; higher
// rows and the third column a little brighter.
async function cypressAtlas() {
  const ell = (w, h) => ({ kind: 'ellipse', x: 0, y: 0, width: w, height: h });
  const regions = [{ name: 'core', content: { x: 2, y: 2, width: 124, height: 508 }, source: { kind: 'procedural', spec: { schemaVersion: 3, width: 124, height: 508, usage: 'albedo',
    background: [60, 76, 36, 255], operations: [ // turn 13: a little lighter, so gaps between clumps read as depth, not holes
      { op: 'stamps', shape: ell(12, 14), rgba: [78, 94, 42, 255], count: 110, seed: 22, area: { x: 0, y: 30, width: 112, height: 470 } },
      { op: 'stamps', shape: ell(10, 12), rgba: [36, 46, 24, 255], count: 80, seed: 24, area: { x: 0, y: 30, width: 114, height: 470 } },
      { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 124, height: 26 }, rgba: [104, 90, 70, 255] },
      { op: 'stamps', shape: { kind: 'rectangle', x: 0, y: 0, width: 3, height: 9 }, rgba: [74, 62, 48, 255], count: 40, seed: 23, area: { x: 0, y: 0, width: 121, height: 17 } }] } } }];
  for (let r = 0; r < 4; r++) for (const c of [1, 2, 3]) {
    const lift = 5 * r + 5 * (c - 2), seed = 500 + 13 * r + 5 * c;
    regions.push({ name: `clump-${r}-${c}`, content: { x: 128 * c + 2, y: 128 * r + 2, width: 124, height: 124 }, source: { kind: 'procedural', spec: {
      schemaVersion: 3, width: 124, height: 124, usage: 'albedo', background: [74, 92, 40, 1], operations: [
        { op: 'stamps', shape: ell(12, 14), rgba: [44 + lift, 58 + lift, 28, 255], count: 64, seed, area: { x: 28, y: 6, width: 56, height: 50 } },
        { op: 'stamps', shape: ell(10, 12), rgba: [72 + lift, 90 + lift, 40, 255], count: 92, seed: seed + 1, area: { x: 18, y: 24, width: 78, height: 58 } },
        { op: 'stamps', shape: ell(6, 8), rgba: [108 + lift, 126 + lift, 54, 255], count: 98, seed: seed + 2, area: { x: 12, y: 40, width: 94, height: 74 } }] } } });
  }
  return textureAtlas({ schemaVersion: 1, width: 512, height: 512, usage: 'albedo', regions });
}
// Shrubs (turn 9: the reviews of revision 11 saw crumpled dark bowls with no flowers): a 512 px
// atlas of 128 px cells in the cypress's manner. Column 0 is the opaque leafy core; columns 1 - 2
// hold eight rounded clusters of small leaves (rows by height on the mound, lighter higher up),
// column 3 four clusters of cream and white blossom heads over leaves.
async function shrubAtlas() {
  const ell = (w, h) => ({ kind: 'ellipse', x: 0, y: 0, width: w, height: h });
  const regions = [{ name: 'core', content: { x: 2, y: 2, width: 124, height: 508 }, source: { kind: 'procedural', spec: { schemaVersion: 3, width: 124, height: 508, usage: 'albedo',
    background: [52, 80, 40, 255], operations: [ // turn 13: lighter, so the crown never reads as a dark hollow
      { op: 'stamps', shape: ell(10, 8), rgba: [70, 104, 52, 255], count: 140, seed: 31, area: { x: 0, y: 0, width: 114, height: 500 } },
      { op: 'stamps', shape: ell(8, 6), rgba: [28, 46, 24, 255], count: 90, seed: 32, area: { x: 0, y: 0, width: 116, height: 502 } }] } } }];
  for (let r = 0; r < 4; r++) for (const c of [1, 2]) {
    const lift = 7 * r + 5 * (c - 1), seed = 700 + 11 * r + 3 * c;
    regions.push({ name: `leaves-${r}-${c}`, content: { x: 128 * c + 2, y: 128 * r + 2, width: 124, height: 124 }, source: { kind: 'procedural', spec: {
      schemaVersion: 3, width: 124, height: 124, usage: 'albedo', background: [64, 98, 48, 1], operations: [
        { op: 'stamps', shape: ell(12, 9), rgba: [44 + lift, 74 + lift, 36, 255], count: 76, seed, area: { x: 16, y: 10, width: 80, height: 70 } },
        { op: 'stamps', shape: ell(10, 7), rgba: [72 + lift, 110 + lift, 52, 255], count: 100, seed: seed + 1, area: { x: 10, y: 22, width: 94, height: 82 } },
        { op: 'stamps', shape: ell(7, 5), rgba: [112 + lift, 150 + lift, 74, 255], count: 76, seed: seed + 2, area: { x: 14, y: 34, width: 90, height: 78 } }] } } });
  }
  // turn 14: rows 0 - 1 cream and white (shrub-a, shrub-b), rows 2 - 3 old rose (shrub-c), so the
  // three shrubs share one atlas and one material
  for (let r = 0; r < 4; r++) {
    const seed = 800 + 13 * r, [petal, light, eye] = r < 2 ? [[248, 238, 212], [255, 252, 244], [236, 204, 120]] : [[232, 160, 172], [248, 204, 210], [226, 184, 112]];
    regions.push({ name: `blossom-${r}`, content: { x: 384 + 2, y: 128 * r + 2, width: 124, height: 124 }, source: { kind: 'procedural', spec: {
      schemaVersion: 3, width: 124, height: 124, usage: 'albedo', background: [64, 98, 48, 1], operations: [
        { op: 'stamps', shape: ell(11, 8), rgba: [56, 90, 44, 255], count: 70, seed, area: { x: 14, y: 14, width: 84, height: 80 } },
        { op: 'stamps', shape: ell(10, 9), rgba: [...petal, 255], count: 64, seed: seed + 1, area: { x: 14, y: 12, width: 88, height: 90 } },
        { op: 'stamps', shape: ell(6, 6), rgba: [...light, 255], count: 90, seed: seed + 2, area: { x: 12, y: 10, width: 96, height: 96 } },
        { op: 'stamps', shape: ell(2, 2), rgba: [...eye, 255], count: 30, seed: seed + 3, area: { x: 20, y: 18, width: 82, height: 84 } }] } } });
  }
  return textureAtlas({ schemaVersion: 1, width: 512, height: 512, usage: 'albedo', regions });
}
// Ivy (turn 8): sixteen 128 px cells, one five-lobed leaf hanging from its stalk in each, with a
// pale midrib and lateral veins, in four rows by place along a strand: row 0 the mature, darker
// leaves of the crown and the strand tops, row 3 the light yellow-green tips (the mean stays near
// sRGB 90, 130, 50). Four hues per row. A card maps one cell, its stalk at the cell's top, so the
// wind weight (UV.y) grows toward a strand's tip.
const IVY_LEAF = [[50, 14], [58, 6], [68, 2], [78, 4], [86, 10], [90, 18], [86, 26], [80, 30], [90, 36], [98, 44], [96, 52], [88, 56], [76, 58],
  [72, 66], [66, 78], [58, 90], [50, 100], [42, 90], [34, 78], [28, 66], [24, 58], [12, 56], [4, 52], [2, 44], [10, 36], [20, 30], [14, 26],
  [10, 18], [14, 10], [22, 4], [32, 2], [42, 6]]; // in a 100 x 100 box, the stalk joining at (50, 14)
const IVY_HUES = [[[58, 94, 38], [66, 104, 42], [52, 86, 36], [72, 110, 46]], [[76, 116, 46], [86, 126, 50], [70, 108, 44], [94, 132, 54]],
  [[102, 140, 56], [112, 148, 60], [96, 134, 52], [120, 156, 64]], [[136, 168, 70], [146, 176, 78], [128, 160, 66], [156, 182, 84]]];
function ivyAtlas() {
  const ops = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = 128 * c, y = 128 * r, wide = [1.04, 0.94, 1.0, 1.1][c], body = IVY_HUES[r][c];
    const pt = ([px, py]) => [Math.round(x + 64 + (px - 50) * 1.04 * wide), Math.round(y + 20 + py * 1.04)];
    const vein = [...body.map((v, i) => Math.min(255, v + [44, 40, 26][i])), 255];
    ops.push({ op: 'paint', shape: { kind: 'polygon', points: IVY_LEAF.map(pt) }, rgba: [...body, 255] },
      { op: 'paint', shape: { kind: 'line', from: [x + 64, y + 1], to: [x + 64, y + 112], width: 3 }, rgba: vein },
      { op: 'paint', shape: { kind: 'polygon', points: [[20, 62], [50, 30], [80, 62], [80, 65], [50, 33], [20, 65]].map(pt) }, rgba: vein });
  }
  return proceduralTexture({ schemaVersion: 3, width: 512, height: 512, usage: 'albedo', background: [90, 130, 50, 1], operations: ops });
}
const foliage = (albedo, roughness) => pbrMaterial({ albedo, roughness, metalness: 0, alphaMode: 'mask', alphaCutoff: 0.5, doubleSided: false });

// ---------------------------------------------------------------- geometry
function makeMesh() {
  const M = { P: [], N: [], T: [], I: [] };
  M.vert = (p, n, uv) => { M.P.push(...p); M.N.push(...n); M.T.push(...uv); return M.P.length / 3 - 1; };
  // a card both ways round, all four corners shaded with normal n
  M.card = (c, n, uv) => {
    const i = c.map((p, k) => M.vert(p, n, uv[k])), j = c.map((p, k) => M.vert(p, n, uv[k]));
    M.I.push(i[0], i[1], i[2], i[0], i[2], i[3], j[0], j[2], j[1], j[0], j[3], j[2]);
  };
  M.geo = () => meshGeo({ positions: M.P, normals: M.N, uvs: M.T, indices: M.I });
  return M;
}
// A lathed body around +Y with a lumpy radius: rings from y0 to H, the strip u 0 - 0.25 around,
// v 0 at the foot to vTop at the top (1 for a column that sways; less for a low mound, which
// also keeps its texture from squashing).
function body(M, H, y0, radius, rings, segs, lump, R, vTop = 1) {
  const ph = Array.from({ length: 4 }, () => R() * 6.283);
  const bump = (th, t) => 1 + lump * (0.5 * Math.sin(3 * th + ph[0] + 9 * t) + 0.3 * Math.sin(5 * th + ph[1] - 13 * t) + 0.2 * Math.sin(7 * th + ph[2] + 21 * t));
  const base = M.P.length / 3;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = y0 + t * (H - y0), r = radius(t);
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * 2 * Math.PI, rr = r * bump(th, t);
      M.vert([rr * Math.cos(th), y, rr * Math.sin(th)], nrm([Math.cos(th), 0.25 + 0.6 * t * t, Math.sin(th)]), [(0.25 * j) / segs, t * vTop]);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = base + i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
    M.I.push(a, c, b, b, c, d);
  }
  return bump;
}
// Crossed tuft cards rooted just inside the body, pointing out and up: n of them, placed by
// area (rejection sampling on the radius), each picking one of the spray columns.
function tufts(M, H, y0, radius, bump, n, R, o) {
  for (let k = 0; k < n;) {
    const t = o.t0 + R() * (o.t1 - o.t0), rad = radius(t);
    if (R() * o.rmax > rad) continue;
    k++;
    const th = R() * 2 * Math.PI, y = y0 + t * (H - y0), r = rad * bump(th, t), out = [Math.cos(th), 0, Math.sin(th)];
    const elev = o.elev[0] + R() * (o.elev[1] - o.elev[0]) + o.elevTop * t;
    const dir = nrm([out[0] * Math.cos(elev), Math.sin(elev), out[2] * Math.cos(elev)]);
    const side1 = [-Math.sin(th), 0, Math.cos(th)], side2 = nrm(cross(dir, side1));
    const L = (o.len[0] + R() * (o.len[1] - o.len[0])) * (0.55 + 0.45 * (rad / o.rmax)), W = L * (o.aspect[0] + R() * (o.aspect[1] - o.aspect[0]));
    const root = add([r * out[0], y, r * out[2]], out, -o.sink), tip = add(root, dir, L);
    const col = 1 + Math.floor(R() * 3), u0 = 0.25 * col + 0.01, u1 = u0 + 0.23, n2 = nrm(add(out, [0, 1, 0], 0.4)), vt = o.vMax ?? 1;
    for (const side of o.cross === false ? [side1] : [side1, side2]) {
      M.card([add(root, side, -W / 2), add(root, side, W / 2), add(tip, side, W * 0.45), add(tip, side, -W * 0.45)], n2,
        [[u0, 0], [u1, 0], [u1, vt], [u0, vt]]);
    }
  }
}
// Italian cypress (turn 8, after the reviews of revision 10): a slender column, height about six
// times its width, on a short visible trunk; widest a third of the way up, tapering to a blunt
// point, its axis wandering a little. A dark core carries several hundred small crossed clump
// cards rooted in it and set by area, pointing out and up, so the outline is soft and irregular.
// Their shading normals are spherical (out from the axis, a little up) so the column shades as
// one volume: dark in its shade, lit olive on the sun side, with bright tips.
// turn 14 (rule 9's varied pairs): o.peak is where the column is widest (0.32 of its height),
// o.taper the power of its narrowing above (0.75), o.lean the top's offset in metres (x, z),
// growing with the square of height so the column bows rather than tilts.
async function cypress(H, W, n, seed, trunk, o = {}) {
  const R = rng(seed), M = makeMesh(), rc = W / 2 - 0.2, y0 = trunk - 0.12, pk = o.peak ?? 0.32, tp = o.taper ?? 0.75, [lx, lz] = o.lean ?? [0, 0];
  const prof = (t) => (t < pk ? 0.58 + 0.42 * Math.sin((Math.PI / 2) * (t / pk)) : Math.pow((1 - t) / (1 - pk), tp));
  const radius = (t) => Math.max(0.02, rc * prof(t));
  const ph = [R() * 6.283, R() * 6.283, R() * 6.283, R() * 6.283, R() * 6.283];
  const axis = (t) => [0.05 * t * Math.sin(5.5 * t + ph[0]) + lx * t * t, 0.04 * t * Math.sin(4.3 * t + ph[1]) + lz * t * t];
  const bump = (th, t) => 1 + 0.09 * (0.5 * Math.sin(3 * th + ph[2] + 11 * t) + 0.3 * Math.sin(5 * th + ph[3] - 17 * t) + 0.2 * Math.sin(7 * th + ph[4] + 23 * t));
  // the trunk: 8 sides tapering from 0.12 to 0.085 m, bark at v 0 - 0.05 (it does not sway)
  const tb = M.P.length / 3;
  for (let i = 0; i <= 1; i++) for (let j = 0; j <= 8; j++) {
    const th = (j / 8) * 2 * Math.PI, r = i ? 0.085 : 0.12;
    M.vert([r * Math.cos(th), i ? trunk : 0, r * Math.sin(th)], [Math.cos(th), 0, Math.sin(th)], [(0.25 * j) / 8, i ? 0.05 : 0.004]);
  }
  for (let j = 0; j < 8; j++) M.I.push(tb + j, tb + j + 9, tb + j + 1, tb + j + 1, tb + j + 9, tb + j + 10);
  // the core: a ring every 0.3 m, 18 sides; strip u 0 - 0.25 around, v 0.07 at its foot to 1 at the top
  const rings = Math.round((H - y0) / 0.3), segs = 18, cb = M.P.length / 3;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = y0 + t * (H - y0), r = radius(t), [ax, az] = axis(t);
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * 2 * Math.PI, rr = r * bump(th, t);
      M.vert([ax + rr * Math.cos(th), y, az + rr * Math.sin(th)], nrm([Math.cos(th), 0.2 + 0.5 * t * t, Math.sin(th)]), [(0.25 * j) / segs, 0.07 + 0.93 * t]);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = cb + i * (segs + 1) + j, c = a + segs + 1;
    M.I.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // the clumps, by area over the core: rooted 0.1 m inside it, longer where the column is wide
  for (let k = 0; k < n;) {
    const t = 0.015 + R() * 0.975, rad = radius(t);
    if (R() * rc > rad) continue;
    k++;
    const th = R() * 2 * Math.PI, [ax, az] = axis(t), y = y0 + t * (H - y0), out = [Math.cos(th), 0, Math.sin(th)];
    const r = rad * bump(th, t), elev = 0.45 + R() * 0.5 + 0.55 * t * t;
    const dir = nrm([out[0] * Math.cos(elev), Math.sin(elev), out[2] * Math.cos(elev)]);
    const tan = [-Math.sin(th), 0, Math.cos(th)], spin = R() * Math.PI; // the crossed pair turned at random about its axis
    const side1 = add(tan.map((v) => v * Math.cos(spin)), cross(dir, tan), Math.sin(spin)), side2 = nrm(cross(dir, side1));
    // turn 13 (the reviews of revision 15: near cypresses read as stacked cardboard with a sawtooth
    // outline): clumps two thirds the size and nearly twice as many, so the outline breaks finer
    const L = (0.19 + 0.17 * R()) * (0.55 + 0.45 * Math.min(1, rad / (0.7 * rc))), Wc = L * (0.75 + 0.35 * R());
    const root = [ax + (r - 0.1) * out[0], y - 0.04, az + (r - 0.1) * out[2]], tip = add(root, dir, L);
    const row = Math.min(3, Math.floor(t * 4)), col = 1 + Math.floor(R() * 3);
    const u0 = 0.25 * col + 0.006, u1 = u0 + 0.238, v0 = 0.25 * row + 0.006, v1 = v0 + 0.238;
    const ns = nrm([out[0], 0.3 + 0.4 * t, out[2]]);
    for (const side of [side1, side2]) {
      M.card([add(root, side, -Wc / 2), add(root, side, Wc / 2), add(tip, side, Wc / 2), add(tip, side, -Wc / 2)], ns, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  return [['cypress', M.geo(), foliage(await cypressAtlas(), 0.85)]];
}
// Flowering mound (turn 9): a dome, widest just above the ground, of small crossed clusters of
// leaves rooted by area in a dark leafy core, a share of them blossom heads, more on its crown and
// sun side of the dome; rounded (spherical) shading normals; it spills a little past a planter's
// rim. Card rows follow height, so the wind stirs the crown more than the foot.
// turn 14: o.rose takes the old-rose blossom rows (2 - 3) and the lighter leaf rows; the cream
// shrubs take blossom rows 0 - 1, low on the mound and high
async function shrub(H, R0, n, seed, bloom, o = {}) {
  const R = rng(seed), M = makeMesh(), bRow = (row) => (o.rose ? 2 : 0) + (row >= 2 ? 1 : 0), lRow = (row) => (o.rose ? Math.min(3, row + 1) : row);
  const radius = (t) => R0 * Math.max(0.005, Math.sqrt(Math.max(0, 1 - t ** 2.4)) * (0.9 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.8)))); // turn 13: closed at the top (a pinhole showed the sky)
  const bump = body(M, H, 0, radius, 8, 14, 0.12, R, 0.3);
  // turn 13 (the reviews of revision 15 saw hollow domes from above, h8): a dense pass of
  // clusters over the crown, rooted across it (not only round its rim) and pointing up
  for (let k = 0; k < Math.round(n * 0.35); k++) {
    const t = 0.62 + 0.36 * R(), th = R() * 2 * Math.PI, rr = radius(t) * Math.sqrt(R()), out = [Math.cos(th), 0, Math.sin(th)];
    const elev = 1.05 + 0.45 * R(), dir = nrm([out[0] * Math.cos(elev), Math.sin(elev), out[2] * Math.cos(elev)]);
    const tan = [-Math.sin(th), 0, Math.cos(th)], spin = R() * Math.PI;
    const side1 = add(tan.map((v) => v * Math.cos(spin)), cross(dir, tan), Math.sin(spin)), side2 = nrm(cross(dir, side1));
    const L = (0.12 + 0.1 * R()) * (H / 0.6) ** 0.5, Wc = L * (0.85 + 0.25 * R());
    const root = [rr * out[0], t * H - 0.04, rr * out[2]], tip = add(root, dir, L), flower = R() < bloom * 1.1;
    const col = flower ? 3 : 1 + Math.floor(R() * 2), u0 = 0.25 * col + 0.006, u1 = u0 + 0.238, v0 = flower ? 0.25 * bRow(3) + 0.006 : 0.756, v1 = v0 + 0.238;
    const ns = nrm([out[0] * 0.3, 1, out[2] * 0.3]);
    for (const side of [side1, side2]) M.card([add(root, side, -Wc / 2), add(root, side, Wc / 2), add(tip, side, Wc / 2), add(tip, side, -Wc / 2)], ns, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  for (let k = 0; k < n;) {
    const t = 0.04 + R() * 0.94, rad = radius(t);
    if (R() * R0 > rad + 0.5 * R0 * t) continue; // by area, the crown favoured (turn 13: it showed a dark hollow from above)
    k++;
    const th = R() * 2 * Math.PI, y = t * H, out = [Math.cos(th), 0, Math.sin(th)], r = rad * bump(th, t);
    const elev = 0.25 + R() * 0.55 + 0.7 * t * t, dir = nrm([out[0] * Math.cos(elev), Math.sin(elev), out[2] * Math.cos(elev)]);
    const tan = [-Math.sin(th), 0, Math.cos(th)], spin = R() * Math.PI;
    const side1 = add(tan.map((v) => v * Math.cos(spin)), cross(dir, tan), Math.sin(spin)), side2 = nrm(cross(dir, side1));
    const L = (0.12 + 0.1 * R()) * (H / 0.6) ** 0.5, Wc = L * (0.85 + 0.25 * R()); // turn 13: smaller and more of them
    const root = [(r - 0.05) * out[0], y - 0.02, (r - 0.05) * out[2]], tip = add(root, dir, L);
    const row = Math.min(3, Math.floor(t * 4)), flower = t > 0.3 && R() < bloom * (0.6 + 0.6 * t);
    const col = flower ? 3 : 1 + Math.floor(R() * 2), u0 = 0.25 * col + 0.006, u1 = u0 + 0.238, v0 = 0.25 * (flower ? bRow(row) : lRow(row)) + 0.006, v1 = v0 + 0.238;
    const ns = nrm([out[0] * (1 - 0.6 * t), 0.35 + 0.8 * t, out[2] * (1 - 0.6 * t)]);
    for (const side of [side1, side2]) M.card([add(root, side, -Wc / 2), add(root, side, Wc / 2), add(tip, side, Wc / 2), add(tip, side, -Wc / 2)], ns, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  return [['shrub', M.geo(), foliage(await shrubAtlas(), 0.85)]];
}
// Trailing ivy (turn 8, after the reviews of revision 10), in the ledge's frame: the edge runs
// along x at y = 0, z = 0, the ledge top lies toward -Z and the drop toward +Z. Strands in two or
// three loose groups root on the ledge, run over the edge and hang, bulging out a little and
// drifting outward toward the ends, as ivy trails down pier edges. Every leaf is its own small
// card hung from its stalk, turned and tipped out from the wall at random, on alternate sides of
// its strand: close-set, large and dark near the top, sparser, smaller and lighter toward the
// tapering tip. A crown of leaves over each group and a ragged line along the edge between them
// make the top densest. Shading normals are bent out from the wall (and a little up), toward
// the warm haze and the court rather than the blue zenith, so curtains in shade stay green.
function ivy(span, strands, lenRange, seed, o) {
  const R = rng(seed), M = makeMesh();
  const leaf = (p, size, row, lean) => { // a card from its stalk at p, the blade below it
    const roll = (R() - 0.5) * 0.9, twist = (R() - 0.5) * 1.2;
    const d = nrm([Math.sin(roll) * Math.cos(lean), -Math.cos(lean) * Math.cos(roll), Math.sin(lean)]);
    const a0 = nrm(cross(d, [0, 0, 1])), a = add(a0.map((v) => v * Math.cos(twist)), cross(d, a0), Math.sin(twist));
    const half = add([0, 0, 0], a, size / 2), foot = add(p, d, size), col = Math.floor(R() * 4);
    const u0 = 0.25 * col + 0.006, u1 = u0 + 0.238, v0 = 0.25 * row + 0.006, v1 = v0 + 0.238;
    const n = nrm([0.25 * (R() - 0.5), 0.3 + 0.2 * R(), 1]);
    M.card([add(p, half, -1), add(p, half, 1), add(foot, half, 1), add(foot, half, -1)], n, [[u1, v0], [u0, v0], [u0, v1], [u1, v1]]);
  };
  const groups = Array.from({ length: 2 + Math.floor(R() * 2) }, () => (R() - 0.5) * span * 0.8);
  const raw = Array.from({ length: strands }, (_, k) => groups[k % groups.length] + (R() - 0.5) * span * 0.32);
  const mid = (Math.min(...raw) + Math.max(...raw)) / 2; // centre the curtain on the piece
  groups.forEach((g, i) => { groups[i] = g - mid; });
  const roots = raw.map((x) => Math.max(-span / 2, Math.min(span / 2, x - mid))).sort((a, b) => a - b);
  for (const x0 of roots) {
    const L = lenRange[0] + Math.pow(R(), 0.7) * (lenRange[1] - lenRange[0]), bulge = 0.08 + R() * 0.22;
    const out = Math.sign(x0 || 1) * Math.pow(Math.abs(x0) / (span / 2), 2) * (0.3 + R() * 0.6) + (R() - 0.5) * 0.3; // drift at the tip
    const at = (s) => (s < 0.2 ? [x0, 0.04, -0.2 + s] // along the ledge top to the edge, then down the face
      : [x0 + out * ((s - 0.2) / (L - 0.2)) ** 1.6, -(s - 0.2), 0.05 + bulge * (1 - Math.exp(-(s - 0.2) / 0.55)) - 0.04 * ((s - 0.2) / (L - 0.2))]);
    let side = R() < 0.5 ? -1 : 1;
    for (let s = 0.04 + 0.06 * R(); s < L; s += 0.045 + 0.12 * (s / L) ** 1.2 + 0.03 * R()) {
      const f = s / L, p = add(at(s), [side * (0.03 + 0.07 * R()) * (1 - 0.5 * f), 0, 0.015]);
      const row = Math.max(0, Math.min(3, Math.floor(4 * f ** 0.85 + 0.6 * (R() - 0.5))));
      leaf(p, o.leaf * (1 - 0.48 * f) * (0.85 + 0.3 * R()), row, s < 0.2 ? 1.1 + 0.4 * R() : 0.25 + 0.55 * R()); // flatter on the ledge top
      side = R() < 0.82 ? -side : side; // mostly alternate, sometimes two on one side
    }
  }
  for (const g of groups) for (let k = 0; k < o.crown; k++) { // the crown over each group, on the ledge top and over the edge
    const x = g + (R() + R() - 1) * span * 0.2, z = -0.26 + 0.34 * R(), onTop = z < -0.02;
    leaf([x, onTop ? 0.06 + 0.1 * R() : 0.08 * R() - 0.06, z], o.leaf * (0.9 + 0.35 * R()), R() < 0.7 ? 0 : 1, onTop ? 1.0 + 0.5 * R() : 0.4 + 0.5 * R());
  }
  for (let x = -span / 2; x < span / 2; x += 0.12 + 0.2 * R()) { // a ragged line along the edge between the groups
    if (R() < 0.45) leaf([x, 0.05 * R(), -0.05 + 0.08 * R()], o.leaf * (0.75 + 0.3 * R()), R() < 0.6 ? 0 : 1, 0.6 + 0.6 * R());
  }
  return [['ivy', M.geo(), foliage(ivyAtlas(), 0.85)]];
}

const PIECES = {
  'cypress-tall': () => cypress(10, 1.6, 850, 1, 0.6), // 6.3 : 1
  'cypress-mid': () => cypress(7.2, 1.24, 600, 2, 0.5), // 5.8 : 1
  'shrub-a': () => shrub(1.1, 0.85, 300, 3, 0.4), // turn 13: narrower, so it stays in the island planters
  'shrub-b': () => shrub(0.62, 0.74, 230, 4, 0.45), // fills a square planter to its rim and spills a little (turn 13: counts held to rule 16's triangle reserve)
  // turn 14 (rule 9: pairs that vary in height and fullness): a pencil cypress, 8.8 : 1 and
  // bowing a little; a young broad cone, 3.5 : 1, widest low; an old-rose shrub, taller than
  // shrub-b and lighter in leaf
  'cypress-slim': () => cypress(11.5, 1.3, 720, 7, 0.7, { peak: 0.42, taper: 0.62, lean: [0.24, -0.1] }),
  'cypress-broad': () => cypress(6.2, 1.75, 560, 8, 0.45, { peak: 0.22, taper: 0.95 }),
  'shrub-c': () => shrub(0.9, 0.78, 260, 9, 0.6, { rose: true }),
  'ivy-long': () => ivy(3.4, 13, [3.0, 7.0], 5, { leaf: 0.26, crown: 40 }),
  'ivy-short': () => ivy(2.6, 9, [1.2, 3.0], 6, { leaf: 0.24, crown: 30 }),
};
// Review only (never saved): a cypress pair, shrubs and both ivies on a stand-in ledge.
async function previewPlanting() {
  const out = [], stone = pbrMaterial({ albedo: proceduralTexture({ schemaVersion: 2, size: 64, usage: 'albedo', layers: [{ op: 'noise', colorA: 0xe7dfd0, colorB: 0xf8f4ec, scale: 4, octaves: 2, seed: 5 }] }), roughness: 0.7, metalness: 0 });
  const B = makeMesh(), box = (lo, hi) => { // a plain box for the stand-ins
    const f = [[[hi[0], lo[1], hi[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [hi[0], hi[1], hi[2]], [1, 0, 0]], [[lo[0], lo[1], lo[2]], [lo[0], lo[1], hi[2]], [lo[0], hi[1], hi[2]], [lo[0], hi[1], lo[2]], [-1, 0, 0]],
      [[lo[0], hi[1], hi[2]], [hi[0], hi[1], hi[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [0, 1, 0]], [[lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]], [0, 0, 1]]];
    for (const [a, b, c, d, n] of f) { const i = [a, b, c, d].map((p, k) => B.vert(p, n, [k % 2, k > 1 ? 1 : 0])); B.I.push(i[0], i[1], i[2], i[0], i[2], i[3]); }
  };
  box([-4, 0, -1], [4, 8, 0]);
  out.push(['stand_wall', B.geo(), stone]);
  const place = (parts, d) => { for (const [name, geo, mat] of parts) { geo.translate(d[0], d[1], d[2]); out.push([`${name}_${out.length}`, geo, mat]); } };
  place(PIECES['ivy-long'](), [-2, 8, 0]);
  place(PIECES['ivy-short'](), [2, 8, 0]);
  place(await PIECES['cypress-tall'](), [-6, 0, 3]);
  place(await PIECES['cypress-mid'](), [6, 0, 3]);
  place(await PIECES['shrub-a'](), [-2, 0, 3]);
  place(await PIECES['shrub-b'](), [1.5, 0, 3]);
  return out;
}

async function build() {
  const root = createRoot(PIECE);
  const parts = await (PIECE === 'preview-planting' ? previewPlanting() : PIECES[PIECE]());
  for (const [name, geo, mat] of parts) createPart(name, geo, mat, { parent: root });
  return root;
}
