// Facade bay: one bay wide, one storey high. Old-town high street kit, see STREET-STANDARD.md.
// The building line is X = 0 (outer wall face); the bay spans Z 0..bayWidth and Y 0..storeyHeight.
const meta = { name: 'Facade bay', role: 'building' };

const P = defineParams({
  bayWidth: { type: 'range', default: 1.8, min: 1.6, max: 2.0, step: 0.1, snap: true, unit: 'm', describe: 'Width of the bay along the street.' },
  storeyHeight: { type: 'range', default: 3.0, min: 2.7, max: 3.3, step: 0.1, snap: true, unit: 'm', describe: 'Floor to floor height.' },
  window: { type: 'choice', default: 'sash', options: ['sash', 'casement', 'arched', 'blind'], describe: 'Window in the opening.' },
  finish: { type: 'choice', default: 'stucco', options: ['stucco', 'brick', 'timber'], describe: 'Wall finish.' },
  head: { type: 'choice', default: 'keystone', options: ['keystone', 'pediment', 'plain'], describe: 'Trim over the window.' },
  cornice: { type: 'toggle', default: false, describe: 'Projecting cornice with dentils at the top of the bay.' },
  shutters: { type: 'toggle', default: false, describe: 'Louvred shutters folded open beside the window.' },
  balcony: { type: 'toggle', default: false, describe: 'Iron window guard on a stone shelf.' },
  lit: { type: 'toggle', default: false, describe: 'Window glows from inside.' },
  wall: { type: 'color', default: '#d9c7a3', describe: 'Wall colour.' },
  trim: { type: 'color', default: '#efe8d8', describe: 'Sill, lintel and string course colour.' },
  joinery: { type: 'color', default: '#3f5a4a', describe: 'Window frame and shutter colour.' },
}, { presets: {
  dusk: { lit: true },
  shuttered: { shutters: true, window: 'casement', head: 'plain' },
  townhouse: { window: 'arched', balcony: true, head: 'pediment', cornice: true, wall: '#c9b08a' },
  brickwork: { finish: 'brick', wall: '#9a5a44', trim: '#e6dcc6', joinery: '#f1ece0' },
  halfTimbered: { finish: 'timber', window: 'casement', head: 'plain', wall: '#e9dfc8', joinery: '#4a3528' },
} });

const DEFAULTS = { bayWidth: 1.8, storeyHeight: 3.0 };
const MAX = { bayWidth: 2.0, storeyHeight: 3.3 };
const T = 0.30;          // wall thickness
const OPEN_W = 0.80;     // opening width
const SILL_Y = 0.85;     // opening bottom above the floor line
const OPEN_H = 1.50;     // opening height
const GLASS_X = -0.13;   // glazing plane, set back in the reveal

// ---- quad builder: fixed vertex counts, per-face normals, UVs taken from the default-size build ----
function quads() {
  const list = [];
  const api = {
    list,
    quad(a, b, c, d, n) { list.push({ p: [a, b, c, d], n }); return api; },
    tri(a, b, c, n) { list.push({ p: [a, b, c], n }); return api; },
    // Axis-aligned box from min to max corner; skip is a string of faces to leave out, e.g. '-x+z'.
    box(min, max, skip = '') {
      const [x0, y0, z0] = min, [x1, y1, z1] = max;
      const f = (key, a, b, c, d, n) => { if (!skip.includes(key)) api.quad(a, b, c, d, n); };
      f('+x', [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
      f('-x', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      f('+y', [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
      f('-y', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
      f('+z', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      f('-z', [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
      return api;
    },
  };
  return api;
}

function geometryFrom(actual, reference, uvScale = 1) {
  const pos = [], nor = [], uv = [], idx = [];
  // The face normal comes from the corners; q.n only says which side is the front.
  const faceNormal = q => {
    const [a, b, c] = q.p;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = n[0] * q.n[0] + n[1] * q.n[1] + n[2] * q.n[2] < 0, len = Math.hypot(n[0], n[1], n[2]) || 1, s = flip ? -1 : 1;
    return { flip, n: [s * n[0] / len, s * n[1] / len, s * n[2] / len] };
  };
  actual.forEach((q, i) => {
    const { flip, n } = faceNormal(q), r = faceNormal(reference[i]).n;
    const order = q.p.length === 3 ? (flip ? [0, 2, 1] : [0, 1, 2]) : (flip ? [0, 3, 2, 1] : [0, 1, 2, 3]);
    const ax = Math.abs(r[0]), ay = Math.abs(r[1]), az = Math.abs(r[2]);   // projection axis from the default build
    const base = pos.length / 3;
    for (const k of order) {
      const p = q.p[k], d = reference[i].p[k];
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
      if (ax >= ay && ax >= az) uv.push(d[2] / uvScale, d[1] / uvScale);
      else if (ay >= az) { if (ax > az + 1e-6) uv.push(d[2] / uvScale, d[0] / uvScale); else uv.push(d[0] / uvScale, d[2] / uvScale); }   // v runs up the slope
      else uv.push(d[0] / uvScale, d[1] / uvScale);
    }
    idx.push(base, base + 1, base + 2);
    if (q.p.length === 4) idx.push(base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---- shared surface textures: neutral grey detail, so a colour parameter stays the plain base colour ----
// Each entry is { size: metres one tile covers, make: () => texture }. Pass `size` to geometryFrom as
// the texture scale of every mesh that wears the material.
const TEX = {
  // Carriageway setts, 100 x 200 mm, joints a little irregular. The carriageway strips all slope toward
  // the gutter, so their u runs along the street: ten setts along u, five courses along v.
  setts: { size: 1.0, make: () => proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', name: 'Setts', layers: [
    { op: 'solid', color: 0xdedede },
    { op: 'cellular', colorA: 0xffffff, colorB: 0x9c9c9c, cellsX: 10, cellsY: 5, jitterX: 0.2, jitterY: 0.35, seed: 7, feature: 'cell', blend: 'multiply' },
    { op: 'noise', colorA: 0xb4b4b4, colorB: 0xffffff, scale: 18, octaves: 3, seed: 3, blend: 'multiply', opacity: 0.5 },
    { op: 'cellular', colorA: 0xffffff, colorB: 0x4a4a4a, cellsX: 10, cellsY: 5, jitterX: 0.2, jitterY: 0.35, seed: 7, feature: 'border', borderWidth: 0.09, borderOpen: 0.9, blend: 'multiply' },
  ] }) },
  // Sawn stone for flags and kerbs: broad mottling and a fine grain (the joints are geometry).
  stone: { size: 2.0, make: () => proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', name: 'Stone', layers: [
    { op: 'solid', color: 0xe6e6e6 },
    { op: 'noise', colorA: 0xb8b8b8, colorB: 0xffffff, scale: 4, octaves: 4, seed: 21, blend: 'multiply' },
    { op: 'noise', colorA: 0xd2d2d2, colorB: 0xffffff, scale: 40, octaves: 2, seed: 5, blend: 'multiply', opacity: 0.7 },
  ] }) },
  // Brickwork in stretcher bond: 225 x 75 mm with the joint, twelve courses of four to a 0.9 m tile.
  brick: { size: 0.9, make: () => proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', name: 'Brick', layers: [
    { op: 'bricks', brick: 0xececec, mortar: 0x989898, rows: 12, cols: 4, mortarWidth: 0.07, stagger: 0.5 },
    { op: 'noise', colorA: 0xa2a2a2, colorB: 0xffffff, scale: 3, octaves: 4, seed: 31, blend: 'multiply', opacity: 0.8 },
    { op: 'noise', colorA: 0xc4c4c4, colorB: 0xffffff, scale: 30, octaves: 2, seed: 9, blend: 'multiply', opacity: 0.6 },
  ] }) },
  // Lime render: a soft float finish with slow weathering.
  stucco: { size: 2.4, make: () => proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', name: 'Stucco', layers: [
    { op: 'solid', color: 0xf0f0f0 },
    { op: 'noise', colorA: 0xe6e6e6, colorB: 0xffffff, scale: 2, octaves: 3, seed: 41, blend: 'multiply' },
    { op: 'noise', colorA: 0xdcdcdc, colorB: 0xffffff, scale: 64, octaves: 2, seed: 13, blend: 'multiply' },
  ] }) },
  // Side and back walls are as tall as a carried size makes them, so they wear no pattern: one even
  // tone near the mean of the render, and one near the mean of the brickwork.
  plainRender: { size: 2.4, make: () => proceduralTexture({ schemaVersion: 2, size: 16, usage: 'albedo', name: 'PlainRender', layers: [{ op: 'solid', color: 0xe4e4e4 }] }) },
  plainBrick: { size: 0.9, make: () => proceduralTexture({ schemaVersion: 2, size: 16, usage: 'albedo', name: 'PlainBrick', layers: [{ op: 'solid', color: 0xb4b4b4 }] }) },
  // Plain clay tiles or slates: eight courses of six to a 1.2 m tile, each course shadowed at its foot.
  tiles: { size: 1.2, make: () => proceduralTexture({ schemaVersion: 2, size: 256, usage: 'albedo', name: 'RoofTiles', layers: [
    { op: 'bricks', brick: 0xe6e6e6, mortar: 0x565656, rows: 8, cols: 6, mortarWidth: 0.07, stagger: 0.5 },
    { op: 'stripes', colorA: 0xffffff, colorB: 0xa8a8a8, count: 16, angleDeg: 90, blend: 'multiply', opacity: 0.35 },
    { op: 'noise', colorA: 0xa6a6a6, colorB: 0xffffff, scale: 7, octaves: 3, seed: 17, blend: 'multiply', opacity: 0.8 },
  ] }) },
};
// A textured material whose base colour is the parameter itself. tileOf(material) is the size in metres
// of one texture tile, for geometryFrom; an untextured material answers 1.
const TILES = new Map();
function tinted(key, colour, roughness, name) {
  const material = pbrMaterial({ albedo: TEX[key].make(), roughness, metalness: 0, name });
  material.color.set(colour);
  TILES.set(material, TEX[key].size);
  return material;
}
const tileOf = material => TILES.get(material) ?? 1;

// ---- the bay as a function of its two sizes; called once for the build and once for the defaults ----
function construct(bw, sh) {
  const zc = bw / 2, z0 = zc - OPEN_W / 2, z1 = zc + OPEN_W / 2, y0 = SILL_Y, y1 = SILL_Y + OPEN_H;
  const out = {};
  const part = name => (out[name] = quads());

  // Wall: front face around the opening, and the four reveals.
  const wall = part('wall');
  wall.quad([0, 0, 0], [0, sh, 0], [0, sh, z0], [0, 0, z0], [1, 0, 0]);
  wall.quad([0, 0, z1], [0, sh, z1], [0, sh, bw], [0, 0, bw], [1, 0, 0]);
  wall.quad([0, 0, z0], [0, y0, z0], [0, y0, z1], [0, 0, z1], [1, 0, 0]);
  wall.quad([0, y1, z0], [0, sh, z0], [0, sh, z1], [0, y1, z1], [1, 0, 0]);
  wall.quad([0, y0, z0], [0, y1, z0], [-T, y1, z0], [-T, y0, z0], [0, 0, 1]);
  wall.quad([0, y0, z1], [0, y1, z1], [-T, y1, z1], [-T, y0, z1], [0, 0, -1]);
  wall.quad([0, y0, z0], [0, y0, z1], [-T, y0, z1], [-T, y0, z0], [0, 1, 0]);
  wall.quad([0, y1, z0], [0, y1, z1], [-T, y1, z1], [-T, y1, z0], [0, -1, 0]);

  // Trim: string course at the floor line, sill, lintel with a keystone.
  const trim = part('trim');
  trim.box([0, 0, 0], [0.04, 0.14, bw], '-x');                        // proud of the wall: keeps its ends (see ground-bay)
  trim.box([0, y0 - 0.07, z0 - 0.10], [0.09, y0, z1 + 0.10], '-x');

  // Window heads: flat lintel with a keystone, a pediment, or a plain flush lintel.
  const headKeystone = part('headKeystone');
  headKeystone.box([0, y1, z0 - 0.08], [0.05, y1 + 0.16, z1 + 0.08], '-x');
  headKeystone.box([0.05, y1 + 0.01, zc - 0.07], [0.075, y1 + 0.20, zc + 0.07], '-x');
  const headPediment = part('headPediment');
  const pa = z0 - 0.12, pb = z1 + 0.12, py = y1 + 0.10, apex = y1 + 0.36, px = 0.07;
  headPediment.box([0, y1, pa], [px, py, pb], '-x+y');
  headPediment.tri([px, py, pa], [px, py, pb], [px, apex, zc], [1, 0, 0]);
  headPediment.quad([px, py, pa], [px, apex, zc], [0, apex, zc], [0, py, pa], [0, 0.6, -0.8]);
  headPediment.quad([px, py, pb], [px, apex, zc], [0, apex, zc], [0, py, pb], [0, 0.6, 0.8]);
  headPediment.box([px, py + 0.03, pa + 0.10], [px + 0.02, py + 0.05, pb - 0.10], '-x');
  const headPlain = part('headPlain');
  headPlain.box([0, y1, z0 - 0.05], [0.025, y1 + 0.12, z1 + 0.05], '-x');

  // Cornice: three stepped courses and a row of dentils at the top of the bay.
  const cornice = part('cornice');
  cornice.box([0, sh - 0.26, 0], [0.05, sh - 0.20, bw], '-x');
  cornice.box([0, sh - 0.12, 0], [0.13, sh - 0.06, bw], '-x');
  cornice.box([0, sh - 0.06, 0], [0.19, sh, bw], '-x');
  const dentils = 9;
  for (let i = 0; i < dentils; i++) {
    const zd = bw * (i + 0.5) / dentils;
    cornice.box([0, sh - 0.20, zd - 0.045], [0.09, sh - 0.12, zd + 0.045], '-x+y');
  }

  // Timber frame: half posts on the lot edges, plates, window posts, a rail and braces, proud of the infill.
  const timber = part('timber');
  const tx = 0.03, post = 0.08, by0 = 0.14, by1 = 0.32, ty0 = sh - 0.18;
  timber.box([0, by0, 0], [tx, by1, bw], '-x');
  timber.box([0, ty0, 0], [tx, sh, bw], '-x+y');
  timber.box([0, by1, 0], [tx, ty0, post], '-x-y+y');
  timber.box([0, by1, bw - post], [tx, ty0, bw], '-x-y+y');
  // Rails run from post to post; the piers beside the window are left to the shutters.
  timber.box([0, y0 - 0.19, post], [tx, y0 - 0.09, bw - post], '-x-z+z');
  timber.box([0, y1 + 0.18, post], [tx, y1 + 0.28, bw - post], '-x-z+z');
  const brace = (zl, zr) => {            // a diagonal from the bottom plate up to the rail, under the window
    const w = 0.09, yb = by1, yt = y0 - 0.19;
    timber.quad([tx, yb, zl], [tx, yb, zl + w], [tx, yt, zr + w], [tx, yt, zr], [1, 0, 0]);
    timber.quad([tx, yb, zl], [tx, yt, zr], [0, yt, zr], [0, yb, zl], [0, zr > zl ? 0.5 : -0.5, zr > zl ? -0.5 : 0.5]);
    timber.quad([tx, yb, zl + w], [tx, yt, zr + w], [0, yt, zr + w], [0, yb, zl + w], [0, zr > zl ? -0.5 : 0.5, zr > zl ? 0.5 : -0.5]);
  };
  brace(post + 0.02, zc - 0.045 - 0.06);
  brace(bw - post - 0.02 - 0.09, zc - 0.045 + 0.06);

  // Glass and glow, shared by every glazed window style.
  part('glass').quad([GLASS_X, y0, z0], [GLASS_X, y1, z0], [GLASS_X, y1, z1], [GLASS_X, y0, z1], [1, 0, 0]);
  part('glow').quad([GLASS_X + 0.012, y0 + 0.02, z0 + 0.02], [GLASS_X + 0.012, y1 - 0.02, z0 + 0.02], [GLASS_X + 0.012, y1 - 0.02, z1 - 0.02], [GLASS_X + 0.012, y0 + 0.02, z1 - 0.02], [1, 0, 0]);

  const fx0 = GLASS_X + 0.02, fx1 = GLASS_X + 0.075;   // frame depth, in front of glass and glow
  const frame = (q, inset = 0) => {
    const f = 0.055;
    q.box([fx0, y0 + inset, z0 + inset], [fx1, y1 - inset, z0 + inset + f]);
    q.box([fx0, y0 + inset, z1 - inset - f], [fx1, y1 - inset, z1 - inset]);
    q.box([fx0, y0 + inset, z0 + inset + f], [fx1, y0 + inset + f, z1 - inset - f], '-z+z');
    q.box([fx0, y1 - inset - f, z0 + inset + f], [fx1, y1 - inset, z1 - inset - f], '-z+z');
  };

  // Sash: outer frame, meeting rail, three glazing bars per sash.
  const sash = part('sash');
  frame(sash);
  const ym = (y0 + y1) / 2;
  sash.box([fx0, ym - 0.03, z0 + 0.055], [fx1 + 0.01, ym + 0.03, z1 - 0.055], '-z+z');
  for (const zb of [zc - 0.115, zc + 0.115]) {
    sash.box([fx0, y0 + 0.055, zb - 0.011], [fx1 - 0.02, ym - 0.03, zb + 0.011], '-y+y');
    sash.box([fx0, ym + 0.03, zb - 0.011], [fx1 - 0.02, y1 - 0.055, zb + 0.011], '-y+y');
  }
  for (const yb of [(y0 + 0.055 + ym - 0.03) / 2, (ym + 0.03 + y1 - 0.055) / 2])
    sash.box([fx0, yb - 0.011, z0 + 0.055], [fx1 - 0.025, yb + 0.011, z1 - 0.055], '-z+z');

  // Casement: outer frame, centre mullion, transom with a top light.
  const casement = part('casement');
  frame(casement);
  const yt = y1 - 0.40;
  casement.box([fx0, y0 + 0.055, zc - 0.035], [fx1 + 0.012, yt, zc + 0.035], '-y+y');
  casement.box([fx0, yt, z0 + 0.055], [fx1 + 0.006, yt + 0.05, z1 - 0.055], '-z+z');
  for (const zb of [zc - 0.2, zc + 0.2]) casement.box([fx0, yt + 0.05, zb - 0.011], [fx1 - 0.02, y1 - 0.055, zb + 0.011], '-y+y');
  for (const [za, zb] of [[z0 + 0.055, zc - 0.035], [zc + 0.035, z1 - 0.055]])
    casement.box([fx0, (y0 + yt) / 2 - 0.011, za], [fx1 - 0.025, (y0 + yt) / 2 + 0.011, zb], '-z+z');

  // Arched: a wall-coloured infill with a round head, and an arched frame.
  const archInfill = part('archInfill'), arched = part('arched');
  const r = OPEN_W / 2 - 0.001, ys = y1 - r - 0.07, N = 12;
  const ax = -0.05;                                      // infill face, set back from the wall face
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
    const p0 = [zc + r * Math.cos(a0), ys + r * Math.sin(a0)], p1 = [zc + r * Math.cos(a1), ys + r * Math.sin(a1)];
    archInfill.quad([ax, p0[1], p0[0]], [ax, y1, p0[0]], [ax, y1, p1[0]], [ax, p1[1], p1[0]], [1, 0, 0]);
    // soffit of the arch, from the infill face back to the frame
    archInfill.quad([ax, p0[1], p0[0]], [ax, p1[1], p1[0]], [fx1, p1[1], p1[0]], [fx1, p0[1], p0[0]], [0, -Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2)]);
    // arched frame head: a ring segment
    const ri = r - 0.055;
    const q0 = [zc + ri * Math.cos(a0), ys + ri * Math.sin(a0)], q1 = [zc + ri * Math.cos(a1), ys + ri * Math.sin(a1)];
    arched.quad([fx1, p0[1], p0[0]], [fx1, p1[1], p1[0]], [fx1, q1[1], q1[0]], [fx1, q0[1], q0[0]], [1, 0, 0]);
    arched.quad([fx1, q0[1], q0[0]], [fx1, q1[1], q1[0]], [fx0, q1[1], q1[0]], [fx0, q0[1], q0[0]], [0, -Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2)]);
  }
  arched.box([fx0, y0, z0], [fx1, ys, z0 + 0.055]);
  arched.box([fx0, y0, z1 - 0.055], [fx1, ys, z1]);
  arched.box([fx0, y0, z0 + 0.055], [fx1, y0 + 0.055, z1 - 0.055], '-z+z');
  arched.box([fx0, ys - 0.025, z0 + 0.055], [fx1 + 0.006, ys + 0.025, z1 - 0.055], '-z+z');
  arched.box([fx0, y0 + 0.055, zc - 0.03], [fx1 + 0.01, ys - 0.025, zc + 0.03], '-y+y');
  for (const ang of [Math.PI / 3, Math.PI / 2, 2 * Math.PI / 3]) {
    const tip = [zc + (r - 0.055) * Math.cos(ang), ys + (r - 0.055) * Math.sin(ang)];
    const w = 0.011, dz = Math.sin(ang) * w, dy = -Math.cos(ang) * w;
    arched.quad([fx1 - 0.02, ys + 0.025 + dy, zc - dz], [fx1 - 0.02, ys + 0.025 - dy, zc + dz], [fx1 - 0.02, tip[1] - dy, tip[0] + dz], [fx1 - 0.02, tip[1] + dy, tip[0] - dz], [1, 0, 0]);
  }

  // Blind: a recessed panel with a raised border, in the wall colour.
  const blind = part('blind');
  blind.quad([-0.06, y0, z0], [-0.06, y1, z0], [-0.06, y1, z1], [-0.06, y0, z1], [1, 0, 0]);
  blind.box([-0.06, y0 + 0.12, z0 + 0.12], [-0.035, y1 - 0.12, z1 - 0.12], '-x');

  // Painted jambs bridge the recessed frame to the backs of the open shutters.
  const shutters = part('shutters');
  const sx0 = 0.034, sx1 = 0.07;
  for (const [za, zb] of [[z0 - 0.018, z0 + 0.008], [z1 - 0.008, z1 + 0.018]]) {
    shutters.box([fx1 - 0.003, y0, za], [sx0, y1, zb], '-x-y+y');
  }
  for (const [za, zb] of [[z0 - 0.38, z0], [z1, z1 + 0.38]]) {
    shutters.box([sx0, y0, za], [sx1, y1, za + 0.045], '-x');
    shutters.box([sx0, y0, zb - 0.045], [sx1, y1, zb], '-x');
    shutters.box([sx0, y0, za + 0.045], [sx1, y0 + 0.06, zb - 0.045], '-x-z+z');
    shutters.box([sx0, y1 - 0.06, za + 0.045], [sx1, y1, zb - 0.045], '-x-z+z');
    shutters.box([sx0, ym - 0.03, za + 0.045], [sx1, ym + 0.03, zb - 0.045], '-x-z+z');
    shutters.quad([sx0 + 0.008, y0 + 0.06, za + 0.045], [sx0 + 0.008, y1 - 0.06, za + 0.045], [sx0 + 0.008, y1 - 0.06, zb - 0.045], [sx0 + 0.008, y0 + 0.06, zb - 0.045], [1, 0, 0]);
    const louvres = 14;
    for (let i = 0; i < louvres; i++) {
      const half = i < louvres / 2 ? [y0 + 0.06, ym - 0.03] : [ym + 0.03, y1 - 0.06];
      const k = i % (louvres / 2), span = (half[1] - half[0]) / (louvres / 2), ya = half[0] + k * span + 0.012;
      shutters.quad([sx0 + 0.012, ya, za + 0.045], [sx1 - 0.004, ya + span - 0.03, za + 0.045], [sx1 - 0.004, ya + span - 0.03, zb - 0.045], [sx0 + 0.012, ya, zb - 0.045], [0.6, 0.8, 0]);
    }
  }

  // Balcony: a stone shelf on two brackets and an iron guard.
  const shelf = part('shelf'), guard = part('guard');
  shelf.box([0, y0 - 0.16, z0 - 0.16], [0.34, y0 - 0.07, z1 + 0.16], '-x');
  for (const zb of [z0 - 0.06, z1 + 0.06]) shelf.box([0, y0 - 0.40, zb - 0.045], [0.24, y0 - 0.16, zb + 0.045], '-x+y');
  const gx = 0.31, gy0 = y0 - 0.07, gy1 = y0 + 0.62, gz0 = z0 - 0.13, gz1 = z1 + 0.13, bar = 0.011;
  guard.box([gx - bar, gy1 - 0.03, gz0], [gx + bar, gy1, gz1]);
  guard.box([gx - bar, gy0 + 0.08, gz0], [gx + bar, gy0 + 0.10, gz1]);
  for (const zb of [gz0 + bar, gz1 - bar]) {
    guard.box([0, gy1 - 0.03, zb - bar], [gx - bar, gy1, zb + bar], '-x+x');
    guard.box([0, gy0 + 0.08, zb - bar], [gx - bar, gy0 + 0.10, zb + bar], '-x+x');
  }
  const balusters = 9;
  for (let i = 0; i < balusters; i++) {
    const zb = gz0 + (gz1 - gz0) * (i + 0.5) / balusters;
    guard.box([gx - 0.008, gy0, zb - 0.008], [gx + 0.008, gy1 - 0.03, zb + 0.008], '+y-y');
  }
  return out;
}

function build() {
  const root = createRoot('FacadeBay');
  const actual = construct(P.bayWidth, P.storeyHeight), ref = construct(DEFAULTS.bayWidth, DEFAULTS.storeyHeight);
  const wallMat = tinted('stucco', P.wall, 0.92, 'wall');
  const trimMat = gameMaterial(P.trim, { roughness: 0.85, name: 'trim' });
  const joineryMat = gameMaterial(P.joinery, { roughness: 0.6, name: 'joinery' });
  const glassMat = gameMaterial(0x1c2730, { roughness: 0.12, name: 'glass' });
  const glowMat = gameMaterial(0xffd9a0, { roughness: 0.9, emissive: 0xffc070, emissiveIntensity: 1.6, name: 'glow' });
  const stoneMat = gameMaterial(0xb9b2a4, { roughness: 0.9, name: 'stone' });
  const ironMat = gameMaterial(0x1d1f22, { roughness: 0.55, name: 'iron' });
  const mesh = (name, key, mat, parent) => createPart(name, geometryFrom(actual[key].list, ref[key].list, tileOf(mat)), mat, { parent });
  const group = (name, visible) => { const g = new THREE.Object3D(); g.name = name; g.visible = visible; root.add(g); return g; };

  const brickMat = tinted('brick', P.wall, 0.95, 'wall-brick');
  const timberMat = gameMaterial(0x3a2a20, { roughness: 0.9, name: 'timber' });
  const stucco = group('Finish_stucco', P.finish === 'stucco'); mesh('WallStucco', 'wall', wallMat, stucco);
  const brick = group('Finish_brick', P.finish === 'brick'); mesh('WallBrick', 'wall', brickMat, brick);
  const framed = group('Finish_timber', P.finish === 'timber');
  mesh('WallInfill', 'wall', wallMat, framed); mesh('TimberFrame', 'timber', timberMat, framed);
  mesh('Trim', 'trim', trimMat, root);
  const hk = group('Head_keystone', P.head === 'keystone'); mesh('HeadKeystone', 'headKeystone', trimMat, hk);
  const hp = group('Head_pediment', P.head === 'pediment'); mesh('HeadPediment', 'headPediment', trimMat, hp);
  const hl = group('Head_plain', P.head === 'plain'); mesh('HeadPlain', 'headPlain', trimMat, hl);
  const co = group('Cornice', P.cornice); mesh('CorniceCourses', 'cornice', trimMat, co);
  mesh('Glass', 'glass', glassMat, root);
  const glow = mesh('Glow', 'glow', glowMat, root);
  glow.visible = P.lit;

  const sash = group('Window_sash', P.window === 'sash'); mesh('Sash', 'sash', joineryMat, sash);
  const casement = group('Window_casement', P.window === 'casement'); mesh('Casement', 'casement', joineryMat, casement);
  const arched = group('Window_arched', P.window === 'arched');
  mesh('ArchInfill', 'archInfill', wallMat, arched); mesh('ArchFrame', 'arched', joineryMat, arched);
  const blind = group('Window_blind', P.window === 'blind'); mesh('BlindPanel', 'blind', wallMat, blind);

  const shutters = group('Shutters', P.shutters); mesh('ShutterLeaves', 'shutters', joineryMat, shutters);
  const balcony = group('Balcony', P.balcony); mesh('Shelf', 'shelf', stoneMat, balcony); mesh('Guard', 'guard', ironMat, balcony);

  // The module record must not follow a carried size (it would make the size rebuild-only), so it states the
  // largest bay: every port stays inside it at every value. The actual size is bayWidth x storeyHeight.
  defineModule(root, { footprint: [T, MAX.bayWidth], height: MAX.storeyHeight, snapAxis: 'z', origin: 'corner' });
  port('z0', { parent: root, position: [0, 0, 0] });
  port('z1', { parent: root, position: [0, 0, P.bayWidth] });
  port('up', { parent: root, position: [0, P.storeyHeight, 0] });
  return root;
}
