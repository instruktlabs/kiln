// Meridian Sanctuary architecture (plan.md sections 3 and 5, assets 14-20).
// One program builds every piece; PIECE selects which one this revision is. Each stone piece
// is one mesh with one material: an atlas of white veined marble, ivory travertine and a
// band of brass, warm-white glow and planting soil, with an emissive map for the glow.
// Masses are coursed, chamfered stones on a cell grid; arches are true round arches.
const meta = { name: 'Meridian architecture' };
const PIECE = 'cube-mirror';

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- textures (as the stone kit)
const BAND = 0.047; // top band of quadrant 4: brass | glow | soil
const BAND_COLS = [[0.5, 0.66], [0.66, 0.83], [0.83, 1.0]];
const REG = {
  MA: [0.008, 0.008, 0.492, 0.492], MB: [0.508, 0.008, 0.992, 0.492],
  TA: [0.008, 0.508, 0.492, 0.992], TB: [0.508, 0.5 + BAND + 0.008, 0.992, 0.992],
  BR: [0.506, 0.507, 0.654, 0.5 + BAND - 0.007], GL: [0.672, 0.509, 0.818, 0.5 + BAND - 0.009], SO: [0.836, 0.508, 0.99, 0.5 + BAND - 0.007],
};

function veinPolys(R, x, y, ang, steps, len, halfW, wiggle, seg = 6) {
  const left = [], right = [];
  for (let k = 0; k < steps; k++) {
    ang += (R() - 0.5) * wiggle;
    x += Math.cos(ang) * len; y += Math.sin(ang) * len;
    const t = k / (steps - 1);
    const w = Math.max(1, halfW * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + 0.6 * R()));
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    left.push([Math.round(x + nx) + 0, Math.round(y + ny) + 0]);
    right.push([Math.round(x - nx) + 0, Math.round(y - ny) + 0]);
  }
  const polys = [];
  for (let a = 0; a < steps - 1; a += seg) {
    const b = Math.min(steps - 1, a + seg);
    const pts = left.slice(a, b + 1).concat(right.slice(a, b + 1).reverse()).filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
    if (pts.length >= 3) polys.push(pts);
  }
  return polys;
}
// White veined marble (turn 9, after the reviews of revision 11: veins did not read at eye height):
// a near-white ground with bold grey-gold veins, a soft halo round each, at a scale where a metre
// of floor carries a vein or two.
function marbleSpec(q, seed, baseAng) {
  const s = q / 512, R = rng(seed), ops = [];
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0xf1efea, colorB: 0xfefdfb, scale: 3, octaves: 4, seed },
    { op: 'noise', colorA: 0xdcd6cc, colorB: 0xfaf8f4, scale: 10, octaves: 2, seed: seed + 5, blend: 'overlay', opacity: 0.25 },
  ] } });
  for (let i = 0; i < 3; i++) {
    const x = -0.05 * q, y = ((i + 0.2 + R() * 0.6) * q) / 3, ang = baseAng + (R() - 0.5) * 0.3, vs = Math.floor(R() * 1e9);
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 8 * s + 1, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [214, 203, 184, 255], opacity: 45 });
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 2.4 * s + 0.8, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [170, 152, 122, 255], opacity: 120 });
  }
  for (let i = 0; i < 6; i++) {
    const opacity = 50 + Math.floor(R() * 25);
    for (const p of veinPolys(R, R() * q, R() * q, baseAng + (R() - 0.5) * 0.9, 19, q / 30, 1.1 * s + 0.6, 0.5)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [190, 176, 152, 255], opacity });
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}
// Ivory travertine (turn 9: it read as flat plaster): bedding bands of varied width and warmth
// across each patch, soft pits of several sizes (fewer tiny dark ones, which sparkled at
// distance), and a tint per patch (warm or cream), so neighbouring blocks differ. band: null, or
// three RGBA colours for the brass, glow and soil columns of the band.
// Turn 13 (the reviews of revision 15: travertine read cool grey in shade and its pits as
// polka dots and dashes): a warmer ivory ground and bedding, and fewer, rounder, paler pits.
function travSpec(q, seed, band, tint = 0) {
  const s = q / 512, R = rng(seed), ops = [], t = (c) => c + tint * 0x030406; // tint > 0: a creamier patch
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: t(0xe7d8c0), colorB: t(0xf8efdf), scale: 4, octaves: 3, seed },
    { op: 'stripes', colorA: t(0xe3d2b6), colorB: t(0xf7eedd), count: 14, angleDeg: 90, blend: 'overlay', opacity: 0.45 },
  ] } });
  for (let i = 0; i < 14; i++) { // bedding: a few broad soft bands and fine streaks
    const y = Math.round(R() * q), dy = Math.round((R() - 0.5) * 6 * s), broad = i < 4, light = R() < 0.45;
    ops.push({ op: 'paint', shape: { kind: 'line', from: [-4, y], to: [q + 4, y + dy], width: Math.max(1, Math.round((broad ? 9 + R() * 10 : 1 + R() * 2) * s)) },
      rgba: light ? [250, 244, 232, 255] : [220, 202, 172, 255], opacity: broad ? 55 : 50 });
  }
  const pits = (w, h, rgba, count) => ops.push({ op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: Math.max(2, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) },
    rgba, count, seed: Math.floor(R() * 4e9), area: { x: 0, y: 0, width: q, height: q } });
  pits(3, 3, [214, 199, 174, 255], 60);
  pits(6, 4, [210, 194, 167, 255], 60);
  pits(9, 7, [205, 188, 160, 255], 30);
  pits(14, 10, [212, 196, 170, 255], 10);
  if (band) {
    const bh = Math.round(BAND * 2 * q);
    BAND_COLS.forEach(([a, b], i) => {
      const x0 = Math.round((a - 0.5) * 2 * q), x1 = Math.round((b - 0.5) * 2 * q);
      ops.push({ op: 'paint', shape: { kind: 'rectangle', x: x0, y: 0, width: x1 - x0, height: bh }, rgba: band[i] });
    });
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}
function ormSpec(oq, roughA, roughB, seed, band) {
  const ops = [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: oq, usage: 'metallicRoughness', layers: [
    { op: 'noise', colorA: roughA << 8, colorB: roughB << 8, scale: 5, octaves: 3, seed }] } }];
  if (band) {
    const bh = Math.max(1, Math.round(BAND * 2 * oq));
    [[0, 82, 255, 255], [0, 110, 0, 255], [0, 245, 0, 255]].forEach((rgba, i) => {
      const [a, b] = BAND_COLS[i], x0 = Math.round((a - 0.5) * 2 * oq), x1 = Math.round((b - 0.5) * 2 * oq);
      ops.push({ op: 'paint', shape: { kind: 'rectangle', x: x0, y: 0, width: x1 - x0, height: bh }, rgba });
    });
  }
  return { schemaVersion: 3, width: oq, height: oq, usage: 'metallicRoughness', operations: ops };
}
async function atlas(edge, usage, specs) {
  const q = edge / 2, names = ['marble-a', 'marble-b', 'trav-a', 'trav-b'], pos = [[0, 0], [q, 0], [0, q], [q, q]];
  return textureAtlas({ schemaVersion: 1, width: edge, height: edge, usage, pack: { edge: 1024, gutter: 0 },
    regions: specs.map((spec, i) => ({ name: names[i], content: { x: pos[i][0], y: pos[i][1], width: q, height: q }, gutter: 0, source: { kind: 'procedural', spec } })) });
}
// Emissive map: black except the glow column, which falls off from a warm-white core to a deep
// amber rim in both directions, so a niche's back wall (which maps the whole column) glows in
// its middle and dims toward its reveals. Under the Neutral grade (revision 13) at strength GLOW
// the core shows about #fef0db and the rim about #fad5a6 (tonemap.mjs --grade neutral glow).
const GLOW = 3.5;
function glowMap(n) {
  const [a, b] = BAND_COLS[1], x0 = Math.round(a * n), x1 = Math.round(b * n), y0 = n / 2, h = Math.round(BAND * n), w = x1 - x0;
  const ring = (f, rgb, kind = 'ellipse') => { const dx = Math.round((w * (1 - f)) / 2), dy = Math.round((h * (1 - f)) / 2);
    return { op: 'paint', shape: { kind, x: x0 + dx, y: y0 + dy, width: w - 2 * dx, height: h - 2 * dy }, rgba: [...rgb, 255] }; };
  const stops = [[1, [178, 114, 52]], [0.86, [200, 136, 66]], [0.74, [220, 160, 88]], [0.63, [236, 184, 112]], [0.52, [246, 202, 136]],
    [0.42, [252, 216, 158]], [0.32, [255, 226, 180]], [0.23, [255, 233, 197]], [0.14, [255, 237, 208]]];
  return proceduralTexture({ schemaVersion: 3, width: n, height: n, usage: 'emissive', background: [0, 0, 0, 255],
    operations: [ring(1, [150, 92, 40], 'rectangle'), ...stops.map(([f, c]) => ring(f, c))] });
}
async function stoneMaterial(edge, glow) {
  const q = edge / 2, oq = edge / 8, grey = [128, 128, 128, 255];
  // The planting column is a leafy groundcover green (it was soil brown, which read as dark
  // troughs from below on inverted pieces and as brown rails along the arcades from the air).
  const albedo = await atlas(edge, 'albedo', [marbleSpec(q, 101, 0.55), marbleSpec(q, 202, -0.5), travSpec(q, 303, null),
    travSpec(q, 404, [[188, 148, 82, 255], [255, 228, 184, 255], [84, 112, 58, 255]], 1)]);
  const flat = { schemaVersion: 3, width: q, height: q, usage: 'albedo', background: grey, operations: [] };
  const height = await atlas(edge, 'albedo', [flat, flat, travSpec(q, 303, null), travSpec(q, 404, [grey, grey, grey])]);
  const orm = await atlas(edge / 4, 'metallicRoughness', [ormSpec(oq, 0x20, 0x34, 5, false), ormSpec(oq, 0x22, 0x36, 6, false),
    ormSpec(oq, 0xae, 0xda, 7, false), ormSpec(oq, 0xb0, 0xdc, 8, true)]);
  const opts = { albedo, normal: normalMapFromHeight(height, { strength: 3 }), metallicRoughness: orm, roughness: 1, metalness: 1 };
  if (glow) Object.assign(opts, { emissive: glowMap(1024), emissiveIntensity: glow });
  return pbrMaterial(opts);
}

// ---------------------------------------------------------------- mesh building
function makeBuilder() {
  const P = [], N = [], T = [], I = [];
  const push = (verts, norms, uvs, n) => {
    let s = [0, 0, 0]; // Newell normal: robust winding even with a degenerate corner
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      s = [s[0] + (a[1] - b[1]) * (a[2] + b[2]), s[1] + (a[2] - b[2]) * (a[0] + b[0]), s[2] + (a[0] - b[0]) * (a[1] + b[1])];
    }
    if (Math.hypot(...s) < 1e-12) return;
    let vs = verts, ns = norms, us = uvs;
    if (dot(s, n) < 0) { vs = verts.slice().reverse(); ns = norms.slice().reverse(); us = uvs.slice().reverse(); }
    const base = P.length / 3;
    vs.forEach((v, i) => { P.push(v[0], v[1], v[2]); N.push(...ns[i]); T.push(us[i][0], us[i][1]); });
    for (let i = 1; i + 1 < vs.length; i++) I.push(base, base + i, base + i + 1);
  };
  return {
    poly(verts, n, uvs) { push(verts, verts.map(() => n), uvs, n); },
    polyN(verts, norms, uvs) { push(verts, norms, uvs, nrm(norms.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]))); },
    geometry() { return meshGeo({ positions: P, normals: N, uvs: T, indices: I }); },
  };
}

// trav-a and marble-a draw only from the travertine and marble patches away from the brass /
// glow / soil band, so large faces seen from far off cannot pick up the band in their mips.
const DENS = { marble: 0.25, trav: 0.19, 'trav-a': 0.12, 'marble-a': 0.2 };
function pickWindow(R, kind, fw, fh, dens, square) {
  if (kind === 'brass' || kind === 'glow' || kind === 'soil') {
    const [r0, s0, r1, s1] = REG[kind === 'brass' ? 'BR' : kind === 'glow' ? 'GL' : 'SO'];
    return { u0: r0, v0: s0, du: r1 - r0, dv: s1 - s0, rot: 0 };
  }
  const key = kind === 'marble' ? (R() < 0.5 ? 'MA' : 'MB') : kind === 'marble-a' ? 'MA' : kind === 'trav-a' ? 'TA' : (R() < 0.5 ? 'TA' : 'TB');
  const [r0, s0, r1, s1] = REG[key];
  const rot = square ? Math.floor(R() * 4) : (R() < 0.5 ? 0 : 2);
  let ww = fw * dens, wh = fh * dens;
  if (rot % 2) [ww, wh] = [wh, ww];
  ww = Math.min(ww, r1 - r0); wh = Math.min(wh, s1 - s0);
  return { u0: r0 + R() * (r1 - r0 - ww), v0: s0 + R() * (s1 - s0 - wh), du: ww, dv: wh, rot };
}
function uvOf(w, a, b) {
  let s = a, t = 1 - b;
  if (w.rot === 1) [s, t] = [t, 1 - s]; else if (w.rot === 2) [s, t] = [1 - s, 1 - t]; else if (w.rot === 3) [s, t] = [1 - t, s];
  return [w.u0 + s * w.du, w.v0 + t * w.dv];
}

// A chamfered box stone emitting only faces, edges and corners touching an exposed side.
// st: { lo, hi, c, kind, exp: {px..nz}, faceKind?: {face: kind}, dens? }
const PARAM = [[2, 1], [0, 2], [0, 1]];
const fkey = (ax, s) => (s > 0 ? 'p' : 'n') + 'xyz'[ax];
function emitStone(B, R, st) {
  const { lo, hi, c, exp } = st, fk = st.faceKind || {};
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const wins = {};
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const f = fkey(ax, s); if (!exp[f]) continue;
    const kind = fk[f] || st.kind, [pa, pb] = PARAM[ax];
    wins[f] = pickWindow(R, kind, size[pa], size[pb], st.dens || DENS[kind] || 0.2, ax === 1 && Math.abs(size[pa] - size[pb]) < 0.01);
  }
  const order = ['py', 'px', 'nx', 'pz', 'nz', 'ny'];
  const uvFor = (f, v) => { const ax = 'xyz'.indexOf(f[1]), [pa, pb] = PARAM[ax];
    return uvOf(wins[f], (v[pa] - lo[pa]) / size[pa], (v[pb] - lo[pb]) / size[pb]); };
  const emit = (verts, n, fs) => { const f = order.find((k) => fs.includes(k) && exp[k]); if (f) B.poly(verts, n, verts.map((v) => uvFor(f, v))); };
  const C = (i, s) => (s > 0 ? hi[i] : lo[i]), E = st.E || {};
  // turn 10: the depth of the edge between faces f and g (seal() sets it where only one shows);
  // a vertex on a face that does not show takes the depth of the showing face's edge
  const dep = (f, g) => (f + g in E ? E[f + g] : g + f in E ? E[g + f] : c);
  const V = (ax, sg) => {
    const F = fkey(ax, sg[ax]);
    return [0, 1, 2].map((i) => {
      if (i === ax) return C(i, sg[i]);
      const G = fkey(i, sg[i]), K = fkey(3 - ax - i, sg[3 - ax - i]);
      return C(i, sg[i]) - sg[i] * (exp[F] ? dep(F, G) : exp[G] ? dep(G, F) : dep(K, G));
    });
  };
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const f = fkey(ax, s); if (!exp[f]) continue;
    const [a1, a2] = [0, 1, 2].filter((i) => i !== ax);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => { const sg = [0, 0, 0]; sg[ax] = s; sg[a1] = p; sg[a2] = q; return V(ax, sg); });
    const n = [0, 0, 0]; n[ax] = s;
    emit(pts, n, [f]);
  }
  if (c <= 0) return;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const fa = fkey(a, sa), fb = fkey(b, sb); if ((!exp[fa] && !exp[fb]) || dep(fa, fb) <= 0) continue;
    const o = [0, 1, 2].find((i) => i !== a && i !== b);
    const sg = (so) => { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[o] = so; return g; };
    const n = [0, 0, 0]; n[a] = sa; n[b] = sb;
    emit([V(a, sg(-1)), V(a, sg(1)), V(b, sg(1)), V(b, sg(-1))], nrm(n), [fa, fb]);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const fs = [fkey(0, sx), fkey(1, sy), fkey(2, sz)]; if (!fs.some((f) => exp[f])) continue;
    const g = [sx, sy, sz], open = [0, 1, 2].filter((i) => exp[fs[i]]);
    if (open.length === 1) { // a joint crossing on a face: run the corner down to the joint point, which closes the pinhole four bevels leave
      const e = open[0], [a, b] = [0, 1, 2].filter((i) => i !== e), d = Math.max(dep(fs[e], fs[a]), dep(fs[e], fs[b]));
      if (d <= 0) continue;
      const P = [0, 1, 2].map((i) => (i === e ? C(i, g[i]) - g[i] * d : C(i, g[i])));
      emit([V(e, g), V(a, g), P, V(b, g)], nrm(g), fs);
    } else emit([V(0, g), V(1, g), V(2, g)], nrm(g), fs);
  }
}

// turn 10: sealed joints (glb-cracks.mjs, on the reviews of revision 12: sky still showed through
// the gateway's niche corners and the joint under its first cornice, and the sun leaked through
// the arcade and planter joints in dashed lines onto shaded paving). Every edge where one face of
// a stone shows and the other does not gets one depth, the same as the stone across the joint:
// - at an inner corner (the cell diagonally across both faces is solid: a niche's back corners,
//   a wall under a projecting band), at a hidden join, or against a stone without bevels (brass,
//   shafts, custom geometry), none: the face runs flush, where the bevel used to open a slot
//   into the hollow behind;
// - at a joint between two faces that both show, the bevel, which course() makes one size for
//   every stone (marble 1 cm against travertine 2 cm left a slot between the two halves of a
//   groove).
// The stone across is looked for at a quarter, half and three quarters along the edge: courses
// stagger by half a stone, so a stone's midpoint lies on the joint of the course beside it.
function seal(S) {
  const grid = new Map(), fl = Math.floor, key = (p) => `${fl(p[0])},${fl(p[1])},${fl(p[2])}`;
  for (const st of S) for (let i = fl(st.lo[0]); i <= fl(st.hi[0]); i++) for (let j = fl(st.lo[1]); j <= fl(st.hi[1]); j++) for (let k = fl(st.lo[2]); k <= fl(st.hi[2]); k++) {
    const kk = `${i},${j},${k}`; if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(st);
  }
  const at = (p, own) => (grid.get(key(p)) || []).find((t) => t !== own && p.every((v, i) => v > t.lo[i] && v < t.hi[i]));
  const e = 1e-3, dirs = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  for (const st of S) {
    st.E = {};
    const lim = (i, s) => (s > 0 ? st.hi[i] : st.lo[i]);
    for (const F of dirs) {
      if (!st.exp[F]) continue;
      const ax = 'xyz'.indexOf(F[1]), s = F[0] === 'p' ? 1 : -1;
      for (const G of dirs) {
        const bx = 'xyz'.indexOf(G[1]); if (bx === ax || st.exp[G]) continue;
        if ((st.flush && st.flush[G]) || (st.inner && st.inner[F + G]) || !(st.c > 0)) { st.E[F + G] = 0; continue; }
        const t = G[0] === 'p' ? 1 : -1, o = 3 - ax - bx;
        let depth = st.c, found = false, flush = false;
        for (const f of [0.25, 0.5, 0.75]) {
          const p = [0, 0, 0], q = [0, 0, 0];
          p[o] = q[o] = st.lo[o] + f * (st.hi[o] - st.lo[o]);
          p[bx] = q[bx] = lim(bx, t) + t * e; // across the joint
          p[ax] = lim(ax, s) - s * e; q[ax] = lim(ax, s) + s * e; // under the face; diagonally across it
          if (at(q, st)) { flush = true; break; } // an inner corner
          const N = at(p, st);
          if (!N) continue;
          found = true;
          if (!N.exp[F] || !(N.c > 0)) { flush = true; break; } // its face does not show here, or has no bevel
          depth = Math.max(depth, N.c);
        }
        st.E[F + G] = flush || !found ? 0 : depth;
      }
    }
  }
}

// turn 13: one texel density (the technical review of revision 15: travertine stretched on tall
// faces). A face's texture window is its size times its density, capped at the atlas region, so
// a face larger than the region stretched it: the plain shafts under the rim towers, pylons and
// foundations (30 - 110 m at density 0.04 - 0.05) by up to nine times, the arcade cornice stones
// (a whole 4.8 m span) by 2.5. A stone whose window would be capped by more than 15 % splits
// into equal parts, each within one window; the plain shafts take the big-face density (0.12)
// and a bevel, so they read as tall courses. Parts meet in joints that seal() closes.
const REGION = 0.48, SHAFT_DENS = 0.12;
function splitStones(S) {
  const out = [], fixed = (k) => k === 'brass' || k === 'glow' || k === 'soil';
  for (const st of S) {
    const kinds = [st.kind, ...Object.values(st.faceKind || {})];
    if (kinds.some(fixed)) { out.push(st); continue; }
    const shaft = st.dens !== undefined && st.dens < SHAFT_DENS;
    const dens = Math.max(...kinds.map((k) => (st.dens !== undefined ? Math.max(st.dens, SHAFT_DENS) : DENS[k] || 0.2)));
    const size = [0, 1, 2].map((i) => st.hi[i] - st.lo[i]);
    const n = [0, 1, 2].map((i) => {
      const shows = [0, 1, 2].some((ax) => ax !== i && (st.exp[fkey(ax, 1)] || st.exp[fkey(ax, -1)]));
      const r = (size[i] * dens) / REGION;
      return shows && r > 1.15 ? Math.ceil(r - 1e-9) : 1;
    });
    if (n.every((v) => v === 1)) { out.push(shaft ? { ...st, dens: SHAFT_DENS } : st); continue; }
    for (let a = 0; a < n[0]; a++) for (let b = 0; b < n[1]; b++) for (let d = 0; d < n[2]; d++) {
      const idx = [a, b, d], outer = (f) => { const i = 'xyz'.indexOf(f[1]); return f[0] === 'p' ? idx[i] === n[i] - 1 : idx[i] === 0; };
      const exp = {}, flush = {}, inner = {}, faceKind = {};
      for (const [f, v] of Object.entries(st.exp)) if (v && outer(f)) exp[f] = true;
      for (const [f, v] of Object.entries(st.flush || {})) if (outer(f)) flush[f] = v;
      for (const [fg, v] of Object.entries(st.inner || {})) if (outer(fg.slice(2))) inner[fg] = v;
      for (const [f, k] of Object.entries(st.faceKind || {})) if (exp[f]) faceKind[f] = k;
      if (!Object.keys(exp).length) continue;
      out.push({ ...st, lo: [0, 1, 2].map((i) => st.lo[i] + (size[i] * idx[i]) / n[i]), hi: [0, 1, 2].map((i) => st.lo[i] + (size[i] * (idx[i] + 1)) / n[i]),
        exp, flush, inner, faceKind, ...(shaft ? { dens: SHAFT_DENS, c: 0.02 } : {}) });
    }
  }
  return out;
}

// One course of coursed masonry on a cell grid. state(x, y, z) returns 'solid', 'empty',
// 'phantom' (solid for neighbours, never drawn: custom geometry or a hidden join), 'spout',
// or 'slot:<face>' (an open slot whose back wall, facing <face>, glows). Faces next to
// open cells are exposed; slot and spout reveals are marble.
const isOpen = (s) => s === 'empty' || s === 'spout' || s.startsWith('slot');
function course(S, y0, y1, xCuts, zCutsFor, state, kindOf) {
  const e = 1e-4, ym = (y0 + y1) / 2;
  for (let i = 0; i + 1 < xCuts.length; i++) {
    const xa = xCuts[i], xb = xCuts[i + 1]; if (xb - xa < 1e-4) continue;
    const zc = zCutsFor(xa, xb, y0, y1);
    for (let j = 0; j + 1 < zc.length; j++) {
      const za = zc[j], zb = zc[j + 1]; if (zb - za < 1e-4) continue;
      const xm = (xa + xb) / 2, zm = (za + zb) / 2;
      if (state(xm, ym, zm) !== 'solid') continue;
      const nb = { px: state(xb + e, ym, zm), nx: state(xa - e, ym, zm), pz: state(xm, ym, zb + e), nz: state(xm, ym, za - e), py: state(xm, y1 + e, zm), ny: state(xm, y0 - e, zm) };
      const exp = {}, faceKind = {}, flush = {};
      for (const [f, s] of Object.entries(nb)) {
        if (s === 'phantom') flush[f] = true;
        if (!isOpen(s)) continue;
        exp[f] = true;
        if (s.startsWith('slot')) faceKind[f] = s.slice(5) === f ? 'glow' : 'marble';
        else if (s === 'spout') faceKind[f] = 'marble';
      }
      if (!Object.keys(exp).length) continue;
      // turn 10: inner corners against cells that are solid or custom geometry (seal() finds those
      // against other stones)
      const inner = {}, clo = [xa, y0, za], chi = [xb, y1, zb], cm = [xm, ym, zm];
      for (const f of Object.keys(exp)) {
        const ax = 'xyz'.indexOf(f[1]), s = f[0] === 'p' ? 1 : -1;
        for (const g of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) {
          const bx = 'xyz'.indexOf(g[1]); if (bx === ax || exp[g] || flush[g]) continue;
          const t = g[0] === 'p' ? 1 : -1, q = cm.slice();
          q[ax] = s > 0 ? chi[ax] + e : clo[ax] - e; q[bx] = t > 0 ? chi[bx] + e : clo[bx] - e;
          if (!isOpen(state(q[0], q[1], q[2]))) inner[f + g] = true;
        }
      }
      const kind = kindOf(xm, ym, zm, exp, faceKind);
      // turn 9: larger bevels so the edges catch the light; no bevel toward custom geometry or
      // hidden joins (phantom), whose faces carry no matching bevel, so the groove there opened
      // onto the hollow behind and showed the sky (the gateway's string courses). Turn 10: one
      // size, 1.5 cm, for marble and travertine (seal()).
      S.push({ lo: [xa, y0, za], hi: [xb, y1, zb], c: 0.015, kind, exp, faceKind, flush, inner });
    }
  }
}
// Sorted cut list: the given special cuts plus stone breaks every `len` metres from lo to hi
// (the first at len * (1 - shift), so shift 0.5 staggers alternate courses), skipping breaks
// within `gap` of another cut.
function cuts(lo, hi, special, len, shift, gap = 0.3) {
  const list = [lo, hi, ...special.filter((v) => v > lo + 1e-6 && v < hi - 1e-6)];
  for (let p = lo + len * (1 - shift); p < hi - gap; p += len) if (list.every((v) => Math.abs(v - p) > gap)) list.push(p);
  return [...new Set(list.map((v) => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- round arches
// Arches lie in the XY plane, centred at (cx, ys) on the springline, with depth along Z.
// Angles run from 0 (+X) over the crown (PI/2) to PI (-X).
const at = (cx, ys, r, a, z) => [cx + r * Math.cos(a), ys + r * Math.sin(a), z];
const steps = (a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n);

// Wall face at z = zf around an arched opening: the region between the arc of radius r and
// the rectangle [x0, x1] x [ys, yt], as quads from the arc to their radial projection.
function spandrel(B, R, o) {
  const { cx, ys, r, x0, x1, yt, zf, nz, a0 = 0, a1 = Math.PI, n = 12, kind = 'trav', dens = 0.12 } = o;
  const corners = [Math.atan2(yt - ys, x1 - cx), Math.atan2(yt - ys, x0 - cx)].filter((a) => a > a0 + 1e-6 && a < a1 - 1e-6);
  const angs = [...steps(a0, a1, n), ...corners].sort((p, q) => p - q);
  const hit = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    let t = Infinity;
    if (c > 1e-9) t = Math.min(t, (x1 - cx) / c);
    if (c < -1e-9) t = Math.min(t, (x0 - cx) / c);
    if (s > 1e-9) t = Math.min(t, (yt - ys) / s);
    return [cx + t * c, ys + t * s, zf];
  };
  const w = pickWindow(R, kind, x1 - x0, yt - ys, dens, false);
  const uv = (p) => uvOf(w, (p[0] - x0) / (x1 - x0), (p[1] - ys) / (yt - ys));
  for (let k = 0; k + 1 < angs.length; k++) {
    const a = angs[k], b = angs[k + 1];
    if (b - a < 1e-9) continue;
    const v = [at(cx, ys, r, a, zf), at(cx, ys, r, b, zf), hit(b), hit(a)];
    B.poly(v, [0, 0, nz], v.map(uv));
  }
}
// Flat annular sector at z = zf between radii r0 < r1, split into k stones with their own windows.
function ringFace(B, R, o) {
  const { cx, ys, r0, r1, zf, nz, a0 = 0, a1 = Math.PI, n = 16, kind = 'marble', k = 1 } = o;
  for (let s = 0; s < k; s++) {
    const sa = a0 + ((a1 - a0) * s) / k, sb = a0 + ((a1 - a0) * (s + 1)) / k, m = Math.max(1, Math.round(n / k));
    const w = pickWindow(R, kind, ((r0 + r1) / 2) * (sb - sa), r1 - r0, DENS[kind] || 0.25, false);
    steps(sa, sb, m).forEach((a, i, arr) => {
      if (i === 0) return;
      const p = arr[i - 1], up = (p - sa) / (sb - sa), ua = (a - sa) / (sb - sa);
      B.poly([at(cx, ys, r0, p, zf), at(cx, ys, r0, a, zf), at(cx, ys, r1, a, zf), at(cx, ys, r1, p, zf)], [0, 0, nz],
        [uvOf(w, up, 0), uvOf(w, ua, 0), uvOf(w, ua, 1), uvOf(w, up, 1)]);
    });
  }
}
// Cylindrical band of radius r from z0 to z1 with smooth normals, facing the centre when inward.
function band(B, R, o) {
  const { cx, ys, r, z0, z1, a0 = 0, a1 = Math.PI, n = 16, inward = true, kind = 'marble', k = 1 } = o;
  const nAt = (a) => (inward ? [-Math.cos(a), -Math.sin(a), 0] : [Math.cos(a), Math.sin(a), 0]);
  for (let s = 0; s < k; s++) {
    const sa = a0 + ((a1 - a0) * s) / k, sb = a0 + ((a1 - a0) * (s + 1)) / k, m = Math.max(1, Math.round(n / k));
    const w = pickWindow(R, kind, r * (sb - sa), Math.abs(z1 - z0), DENS[kind] || 0.25, false);
    steps(sa, sb, m).forEach((a, i, arr) => {
      if (i === 0) return;
      const p = arr[i - 1], up = (p - sa) / (sb - sa), ua = (a - sa) / (sb - sa);
      B.polyN([at(cx, ys, r, p, z0), at(cx, ys, r, a, z0), at(cx, ys, r, a, z1), at(cx, ys, r, p, z1)], [nAt(p), nAt(a), nAt(a), nAt(p)],
        [uvOf(w, up, 0), uvOf(w, ua, 0), uvOf(w, ua, 1), uvOf(w, up, 1)]);
    });
  }
}
// Archivolt of k projecting marble voussoirs on the face z = zf (projecting p toward nz), with
// fine joints between stones and an optional larger, deeper keystone at the crown.
function voussoirs(B, R, o) {
  const { cx, ys, r0, r1, zf, nz, p, k, gap = 0.006, key = null, n = 2, inner = true } = o;
  for (let s = 0; s < k; s++) {
    const isKey = key && s === (k - 1) / 2, R1 = isKey ? r1 + key.dr : r1, zt = zf + nz * (isKey ? p + key.dp : p);
    const g = gap / ((r0 + R1) / 2), sa = (Math.PI * s) / k + g, sb = (Math.PI * (s + 1)) / k - g;
    ringFace(B, R, { cx, ys, r0, r1: R1, zf: zt, nz, a0: sa, a1: sb, n });
    band(B, R, { cx, ys, r: R1, z0: zf, z1: zt, a0: sa, a1: sb, n, inward: false });
    if (inner) band(B, R, { cx, ys, r: r0, z0: zf, z1: zt, a0: sa, a1: sb, n, inward: true });
    for (const [a, sg] of [[sa, -1], [sb, 1]]) {
      const w = pickWindow(R, 'marble', R1 - r0, Math.abs(zt - zf), DENS.marble, false);
      B.poly([at(cx, ys, r0, a, zf), at(cx, ys, R1, a, zf), at(cx, ys, R1, a, zt), at(cx, ys, r0, a, zt)], [-Math.sin(a) * sg, Math.cos(a) * sg, 0],
        [uvOf(w, 0, 0), uvOf(w, 1, 0), uvOf(w, 1, 1), uvOf(w, 0, 1)]);
    }
  }
}
// The two halves of a spandrel, each with its own texture window.
function spandrels(B, R, o) {
  spandrel(B, R, { ...o, x0: o.cx, a0: 0, a1: Math.PI / 2 });
  spandrel(B, R, { ...o, x1: o.cx, a0: Math.PI / 2, a1: Math.PI });
}
// Courses from a list of boundaries, breaking stones every `len` metres along both axes and
// shifting alternate courses by half a stone for running bond. A course that projects past the
// course below or above also breaks where that neighbour ends: a stone straddling the step
// would test its neighbour at its middle, find stone, and leave its projecting underside (or
// top) undrawn, a slit that shows the sky.
function courses(S, ys, half, special, state, kindOf, len) {
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i], y1 = ys[i + 1], ym = (y0 + y1) / 2, [hx, hz] = half(ym), sp = special(ym), shift = i % 2 ? 0.5 : 0;
    const nb = [i > 0 ? half((ys[i - 1] + y0) / 2) : null, i + 2 < ys.length ? half((y1 + ys[i + 2]) / 2) : null].filter(Boolean);
    const steps = (k, h) => nb.map((n) => n[k]).filter((v) => v < h - 1e-6).flatMap((v) => [-v, v]);
    course(S, y0, y1, cuts(-hx, hx, [...(sp.x || []), ...steps(0, hx)], len, shift), () => cuts(-hz, hz, [...(sp.z || []), ...steps(1, hz)], len, shift), state, kindOf);
  }
}

// ---------------------------------------------------------------- pieces
// Arcade span, pier centre to pier centre (x -2.4..2.4), faces at z +/-0.6, floor at y = 0:
// a round arch (soffit r 1.8, springing at 5.2 from the pier impost) with one stepped order
// (r 2.1), an archivolt of 13 voussoirs and a keystone, string course, frieze, cornice and a
// planting trough for ivy along the top.
function arcadeArch(S, R, B) {
  const ys = 5.2;
  for (const nz of [1, -1]) {
    spandrels(B, R, { cx: 0, ys, r: 2.1, x0: -2.4, x1: 2.4, yt: 7.75, zf: 0.6 * nz, nz, n: 9, dens: 0.12 });
    ringFace(B, R, { cx: 0, ys, r0: 1.8, r1: 2.1, zf: 0.45 * nz, nz, n: 18, k: 9 });
    band(B, R, { cx: 0, ys, r: 2.1, z0: 0.45 * nz, z1: 0.6 * nz, n: 18, k: 3 });
    voussoirs(B, R, { cx: 0, ys, r0: 2.1, r1: 2.4, zf: 0.6 * nz, nz, p: 0.07, k: 13, key: { dr: 0.1, dp: 0.05 } });
  }
  band(B, R, { cx: 0, ys, r: 1.8, z0: -0.45, z1: 0.45, n: 18, k: 3 });
  const hz = (y) => (y < 7.9 ? 0.66 : y < 8.6 ? 0.6 : y < 8.75 ? 0.72 : y < 9.0 ? 0.85 : 0.6);
  const state = (x, y, z) => {
    if (Math.abs(x) > 2.4) return 'phantom';
    if (y < 7.75) return Math.abs(z) <= 0.6 ? 'phantom' : 'empty';
    if (y > 9.4 || Math.abs(z) > hz(y)) return 'empty';
    if (y > 9.33 && Math.abs(z) < 0.42) return 'empty';
    return 'solid';
  };
  const kindOf = (x, y, z, exp, fk) => {
    // turn 13: the trough floor is travertine, not soil: turned over in the hanging courts it
    // faced down as a flat green strip (all four reviews of revision 15); the ivy hangs from
    // placements of its own
    if (y > 9.0 && Math.abs(z) < 0.42) return 'trav';
    return y < 7.9 || y > 8.6 ? 'marble' : 'trav';
  };
  courses(S, [7.75, 7.9, 8.6, 8.75, 9.0, 9.33, 9.4], (y) => [2.4, hz(y)], (y) => ({ x: [0], z: y > 9.0 ? [-0.42, 0.42] : [] }), state, kindOf, 99);
}

// Arcade pier 1.2 m square to the impost at 5.0-5.2 m, on a marble plinth; the slot variant
// has a warm glowing niche on its court and outer faces (turn 9: one 0.52 x 1.55 m niche 0.2 m
// deep, where a 3.1 m hairline slot read as LED tape).
function arcadePier(S, slot) {
  const half = (y) => (y < 0.35 ? 0.7 : y < 5.0 ? 0.6 : 0.68);
  const inSlot = (y) => slot && y > 1.9 && y < 3.45;
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (y > 5.2) return 'empty';
    const h = half(y);
    if (Math.abs(x) > h || Math.abs(z) > h) return 'empty';
    if (inSlot(y) && Math.abs(x) < 0.26 && Math.abs(z) > 0.4) return z > 0 ? 'slot:pz' : 'slot:nz';
    return 'solid';
  };
  // one tall course holds the niche, so its glowing back is a single face
  courses(S, slot ? [0, 0.35, 1.125, 1.9, 3.45, 4.225, 5.0, 5.2] : [0, 0.35, 1.125, 1.9, 2.675, 3.45, 4.225, 5.0, 5.2], (y) => [half(y), half(y)],
    (y) => (inSlot(y) ? { x: [-0.26, 0.26], z: [-0.4, 0.4] } : {}), state, (x, y) => (y < 0.35 || y > 5.0 ? 'marble' : 'trav'), 1.2);
}

// Pylon 1.8 m square and 12.6 m tall, proud of the arcade so it closes the arch modules'
// cornices and troughs: ends each arcade run and marks every terrace step, with marble bands
// at both impost levels and a glowing niche on each face (turn 9: one 0.6 x 1.8 m niche 0.2 m
// deep at walking height, where two tall slots per face read as LED tape). A plain shaft
// continues it down the foundation face into the cloud, as on the rim towers.
function pylon(S) {
  const ys = [0, 0.5, 1.4, 2.3, 4.1, 5.0, 5.25, 5.967, 6.683, 7.4, 7.65, 8.44, 9.23, 10.02, 10.81, 11.6, 11.85, 12.05, 12.45, 12.6]; // 2.3 - 4.1 one course: the niche's
  const half = (y) => (y < 0.5 ? 1.0 : y < 5.0 ? 0.9 : y < 5.25 ? 0.96 : y < 7.4 ? 0.9 : y < 7.65 ? 0.96 : y < 11.6 ? 0.9 : y < 11.85 ? 1.02 : y < 12.05 ? 1.1 : y < 12.45 ? 0.75 : 0.8);
  const inSlot = (y) => y > 2.3 && y < 4.1;
  const marble = (y) => y < 0.5 || (y > 5.0 && y < 5.25) || (y > 7.4 && y < 7.65) || (y > 11.6 && y < 12.05) || y > 12.45;
  const state = (x, y, z) => {
    if (y < 0) return Math.abs(x) <= 0.9 && Math.abs(z) <= 0.9 ? 'phantom' : 'empty';
    if (y > 12.6) return 'empty';
    const h = half(y), ax = Math.abs(x), az = Math.abs(z);
    if (ax > h || az > h) return 'empty';
    if (inSlot(y) && ax < 0.3 && az > h - 0.2) return z > 0 ? 'slot:pz' : 'slot:nz';
    if (inSlot(y) && az < 0.3 && ax > h - 0.2) return x > 0 ? 'slot:px' : 'slot:nx';
    return 'solid';
  };
  courses(S, ys, (y) => [half(y), half(y)], (y) => (inSlot(y) ? { x: [-0.3, 0.3, -0.7, 0.7], z: [-0.3, 0.3, -0.7, 0.7] } : {}),
    state, (x, y) => (marble(y) ? 'marble' : 'trav'), 1.8);
  // turn 8: the shaft runs to -110, below the cloud deck (now 80 m down), to dissolve in it
  S.push({ lo: [-0.9, -110, -0.9], hi: [0.9, 0, 0.9], c: 0, kind: 'trav', dens: 0.04, exp: { px: true, nx: true, pz: true, nz: true } });
}

// Rim tower 4 m square rising 24 m above its terrace, with a plain shaft dissolving into the
// cloud below, marble bands and cornice, and a glowing niche in each face of both lower stages
// (turn 9: 0.9 x 2.4 m and 0.3 m deep, where 6 m hairline slots read as LED tape). tower-slot
// keeps the 32 m shaft (it also hangs from an inverted court, shaft up); tower-rim, for the rim
// towers, runs it to -110 under the lowered cloud deck.
// turn 14: extra stages (each 7.45 m: a storey with its glowing niches and a marble band) go in
// under the plain top stage; tower-gate, the rim towers either side of the gateway, has two
// (39 m), so from the head of F2 (04) they fill the frame's upper corners as the hero's flanking
// towers do.
function tower(S, shaft = 32, extra = 0) {
  const E = 7.45 * extra, top = 21.3 + E;
  const ys = [-0.6, 0.4, 1.6, 2.8, 5.2, 6.4, 7.6, 7.85, 9.05, 10.25, 12.65, 13.85, 15.05, 15.3];
  for (let k = 0; k < extra; k++) { const b = 15.3 + 7.45 * k; ys.push(b + 1.2, b + 2.4, b + 4.8, b + 6.0, b + 7.2, b + 7.45); }
  ys.push(...[16.5, 17.7, 18.9, 20.1, 21.3, 21.6, 21.9, 22.65, 23.4, 23.7, 24.0].map((v) => +(v + E).toFixed(3))); // each niche in one course
  const bandAt = (y) => [7.6, 15.05, ...Array.from({ length: extra }, (_, k) => 15.05 + 7.45 * (k + 1))].some((b) => y > b && y < b + 0.25);
  const half = (y) => (y < 0.4 ? 2.12 : y < top ? (bandAt(y) ? 2.08 : 2.0) : y < top + 0.3 ? 2.15 : y < top + 0.6 ? 2.3 : y < top + 2.1 ? 1.85 : y < top + 2.4 ? 1.95 : 1.2);
  const inSlot = (y) => (y > 2.8 && y < 5.2) || (y > 10.25 && y < 12.65) || Array.from({ length: extra }, (_, k) => 15.3 + 7.45 * k).some((b) => y > b + 2.4 && y < b + 4.8);
  const marble = (y) => y < 0.4 || bandAt(y) || (y > top && y < top + 0.6) || y > top + 2.1;
  const state = (x, y, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    if (y < -0.6) return ax <= 1.9 && az <= 1.9 ? 'phantom' : 'empty';
    if (y > 24 + E) return 'empty';
    const h = half(y);
    if (ax > h || az > h) return 'empty';
    if (inSlot(y) && ax < 0.45 && az > h - 0.3) return z > 0 ? 'slot:pz' : 'slot:nz';
    if (inSlot(y) && az < 0.45 && ax > h - 0.3) return x > 0 ? 'slot:px' : 'slot:nx';
    return 'solid';
  };
  courses(S, ys, (y) => [half(y), half(y)], (y) => (inSlot(y) ? { x: [-0.45, 0.45, -1.7, 1.7], z: [-0.45, 0.45, -1.7, 1.7] } : {}),
    state, (x, y) => (marble(y) ? 'marble' : 'trav'), 2.0);
  if (shaft > 0.6) S.push({ lo: [-1.9, -shaft, -1.9], hi: [1.9, -0.6, 1.9], c: 0, kind: 'trav', dens: 0.04, exp: { px: true, nx: true, pz: true, nz: true } });
  else S.push({ lo: [-1.9, -0.6, -1.9], hi: [1.9, -0.5, 1.9], c: 0, kind: 'trav', dens: 0.12, exp: { ny: true } }); // turn 15: no shaft, a closing course under the plinth
}

// Cascade tower 4 m square and 6.4 m tall standing against a terrace wall (-Z) whose top is
// 3.4 m above the tower's base, with a recessed spout for the waterfall on its +Z face and a
// marble-rimmed planting top. Its back is closed above the wall top.
function cascade(S) {
  const half = (y) => (y < 0.6 ? 2.08 : y < 5.4 ? 2.0 : y < 5.6 ? 2.1 : 2.0);
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (z < -2.0) return y < 3.0 ? 'phantom' : 'empty';
    if (y > 6.4) return 'empty';
    const h = half(y), ax = Math.abs(x);
    if (ax > h || z > h) return 'empty';
    if (y > 4.2 && y < 5.4 && ax < 0.9 && z > 1.65) return 'slot:pz'; // turn 9: the spout's back glows (it read as a black slit)
    if (y > 6.2 && ax < 1.65 && Math.abs(z) < 1.65) return 'empty';
    return 'solid';
  };
  const kindOf = (x, y, z, exp, fk) => {
    if (y > 5.6 && y < 6.2 && Math.abs(x) < 1.65 && Math.abs(z) < 1.65) { fk.py = 'soil'; return 'trav'; }
    return y < 0.6 || y > 5.4 ? 'marble' : 'trav';
  };
  courses(S, [0, 0.6, 1.8, 3.0, 4.2, 5.4, 5.6, 6.2, 6.4], (y) => [half(y), half(y)],
    (y) => (y > 4.2 && y < 5.4 ? { x: [-0.9, 0.9], z: [1.65] } : y > 5.6 ? { x: [-1.65, 1.65], z: [-1.65, 1.65] } : {}), state, kindOf, 2.0);
}

// The gateway, rebuilt in turn 7 on the hero's silhouette: 31 m wide, 12 m deep and 98.6 m
// above its threshold (front at +Z), three stacked stages under a plain stepped cornice and a
// crown that steps in through three tiers.
// - Main arch: 12 m wide and 28 m to its crown (2.3:1), springing at 22 m behind three stepped
//   marble orders and a voussoir archivolt; the passage vault glows warm white between ribs.
// - Second arch: 9 m wide and 23.5 m tall, open to the sky, with a glowing ribbed soffit.
// - Lantern: 7 m wide; its reveals, order band and soffit glow.
// - Piers: a tall glowing slot on every face at each stage; small glowing niches in the crown.
// The passage walls are travertine with small bevels (rough, so the bevels do not mirror the
// sky as the marble ones did); the threshold is one seamless marble floor.
function gateway(S, R, B) {
  const seq = (a, b, n) => Array.from({ length: n }, (_, i) => +(a + ((b - a) * (i + 1)) / n).toFixed(4));
  const YS1 = 22.0, YS2 = 52.0, YS3 = 78.0;
  // turn 9: glowing niches 1 m wide and 0.3 m deep, each in one double-height course (so its
  // glowing back is one face), stacked three to a stage on the piers' faces and one to a stage
  // on the sides, where full-stage hairline slots read as LED tape
  const s1 = seq(0.6, 21.6, 17), s2 = seq(33.0, 52.0, 16), s3 = seq(64.0, 78.0, 12);
  const nicheF = [[s1[2], s1[4]], [s1[6], s1[8]], [s1[10], s1[12]], [s2[1], s2[3]], [s2[5], s2[7]], [s2[9], s2[11]], [s3[1], s3[3]], [s3[5], s3[7]]];
  const nicheS = [[s1[6], s1[8]], [s2[5], s2[7]], [s3[5], s3[7]]];
  const merged = new Set([s1[3], s1[7], s1[11], s2[2], s2[6], s2[10], s3[2], s3[6]]);
  const ys = [0, 0.6, ...s1, 22.0, ...seq(22.0, 31.0, 8), 31.6, 33.0, ...s2, ...seq(52.0, 59.0, 6),
    ...seq(59.0, 61.0, 2), 61.6, ...seq(61.6, 64.0, 2), ...s3, ...seq(78.0, 83.0, 4), ...seq(83.0, 86.0, 3), 86.4, 86.9, 87.4,
    ...seq(87.4, 91.0, 3), 91.4, ...seq(91.4, 95.0, 3), 95.4, ...seq(95.4, 98.0, 2), 98.6, 37.15].filter((y) => !merged.has(y)).sort((a, b) => a - b);
  const half0 = (y) => (y < 0.6 ? [15.7, 5.9] : y < 21.6 ? [15.5, 5.7] : y < 22.0 ? [15.65, 5.85] : y < 31.0 ? [15.5, 5.7] : y < 31.6 ? [15.8, 6.0]
    : y < 61.0 ? [15.0, 5.5] : y < 61.6 ? [15.3, 5.8] : y < 86.0 ? [14.6, 5.3] : y < 86.4 ? [14.9, 5.6] : y < 86.9 ? [15.2, 5.9] : y < 87.4 ? [15.5, 6.2]
    : y < 91.0 ? [12.4, 5.0] : y < 91.4 ? [12.7, 5.3] : y < 95.0 ? [9.4, 4.4] : y < 95.4 ? [9.7, 4.7] : y < 98.0 ? [6.2, 3.6] : [6.5, 3.9]);
  // turn 14 (the reviews of revision 15: a campanile with a grid of window-like slots, not the
  // hero's portal; widen the massing with stepped flanking piers that carry planted ledges, and
  // one or two full-height glowing slits per pier):
  // - front piers either side of the main arch, 9.4 - 15.5 m out, stand 3.5 m proud of the
  //   front face up to 37.75 m, over the arch's crown and the string course, banded with the
  //   body's marble courses and capped by a marble coping that is their planted ledge (the
  //   planters, cypresses and ivy are placements); each carries one glowing slit 1.8 - 34.2 m
  // - the first stage steps out into two tiers of wings, so the base reads broad: to 19.5 m
  //   either side up to 12.95 m, then to 18 m up to 19.13 m, full depth, each tier under a
  //   marble coping course, a tall slit in each wing face
  // - elsewhere in the first two stages each pier's outer 1.9 m stands 0.45 m proud of its face,
  //   a pilaster running the stage's height
  // - the body's faces take one tall glowing slit per stage where the front piers leave them open
  const PIL = 13.6, PROUD = 0.45, pilY = (y) => (y > 0.6 && y < 31.0) || (y > 33.0 && y < 61.0);
  const FP = { x0: 9.4, x1: 15.5, top: s2[3], cope: 37.15, z: 9.2 };
  const fpZ = (y) => (y < 0.6 ? 9.4 : (y > 21.6 && y < 22.0) || (y > 31.0 && y < 31.6) || y > FP.cope ? 9.5 : FP.z);
  const W1 = [19.5, s1[9]], W2 = [18.0, s1[14]];
  const wingX = (y) => (y < W1[1] ? W1[0] : y < W2[1] ? W2[0] : 0);
  const half = (y) => { const [hx, hz] = half0(y); return [Math.max(hx, wingX(y)), y < FP.top ? fpZ(y) : pilY(y) ? hz + PROUD : hz]; };
  const open1 = (az) => (az > 5.2 ? 7.5 : az > 4.6 ? 7.0 : az > 4.0 ? 6.5 : 6.0); // passage and its orders
  const open2 = (az) => (az > 4.9 ? 5.2 : az > 4.3 ? 4.85 : 4.5); // second arch
  const open3 = (az) => (az > 4.7 ? 4.0 : 3.5); // lantern
  const inN = (list, y) => list.some(([a, b]) => y > a && y < b);
  // the tall slits, 1 m wide and 0.3 m deep: [x0, x1, y0, y1, face (1 front, -1 back, 0 both)];
  // their glowing backs are drawn as one panel each (below), so the glow runs the slit's whole
  // height instead of restarting in every course
  const SLITS = [[11.35, 12.35, s1[1], s1[14], -1], [11.35, 12.35, s2[1], s2[13], -1], [11.35, 12.35, s2[4], s2[13], 1],
    [11.35, 12.35, s3[1], s3[9], 0], [17.0, 18.0, s1[1], s1[8], 0]];
  const PSLIT = [11.95, 12.95, s1[1], s2[0]]; // in the front piers' faces
  const inSlit = (ax, y, z) => SLITS.some(([x0, x1, y0, y1, f]) => (!f || f === Math.sign(z)) && ax > x0 && ax < x1 && y > y0 && y < y1);
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (y > 98.6) return 'empty';
    const [hx, hz1] = half(y), ax = Math.abs(x), az = Math.abs(z), hz = half0(y)[1];
    if (ax > hx || az > hz1) return 'empty';
    if (az > hz) { // proud of the body's face: a front pier, or a pilaster
      if (z > 0 && y < FP.top && ax > FP.x0 && ax < FP.x1) {
        if (z > fpZ(y)) return 'empty';
        if (ax > PSLIT[0] && ax < PSLIT[1] && y > PSLIT[2] && y < PSLIT[3]) { if (z > FP.z - 0.3) return 'empty'; if (z > FP.z - 0.6) return 'phantom'; }
        return 'solid';
      }
      return pilY(y) && ax > PIL && ax < half0(y)[0] && az < hz + PROUD ? 'solid' : 'empty';
    }
    if (y < 87.4) {
      if (inSlit(ax, y, z)) { if (az > hz - 0.3) return 'empty'; if (az > hz - 0.6) return 'phantom'; }
      if (ax > hx - 0.3 && az < 0.5 && inN(nicheS, y)) return x > 0 ? 'slot:px' : 'slot:nx';
    }
    if (y < YS1) return ax < open1(az) ? 'empty' : 'solid';
    if (y < 31.0) return ax < 8.6 ? 'phantom' : 'solid';
    if (y < 33.0) return 'solid'; // string course and the second arch's sill
    if (y < YS2) return ax < open2(az) ? 'empty' : 'solid';
    if (y < 59.0) return ax < 6.2 ? 'phantom' : 'solid';
    if (y < 64.0) return 'solid';
    if (y < YS3) return ax < open3(az) ? (x > 0 ? 'slot:nx' : 'slot:px') : 'solid'; // the lantern's reveals glow
    if (y < 83.0) return ax < 4.8 ? 'phantom' : 'solid';
    if (y > 91.4 && y < 95.0 && ax < 1.8 && az > 3.6) return z > 0 ? 'slot:pz' : 'slot:nz';
    return 'solid';
  };
  const marbleY = (y) => y < 0.6 || (y > 21.6 && y < 22.0) || (y > 31.0 && y < 31.6) || (y > 61.0 && y < 61.6) || (y > 86.0 && y < 87.4)
    || (y > 91.0 && y < 91.4) || (y > 95.0 && y < 95.4) || y > 98.0;
  const kindOf = (x, y, z) => {
    const ax = Math.abs(x);
    if (marbleY(y) || (y > 33.0 && y < 59.0 && ax < 6.2) || (y > 64.0 && y < 83.0 && ax < 4.8)) return 'marble';
    if (ax > 15.5 && ((y > s1[8] && y < W1[1]) || (y > s1[13] && y < W2[1]))) return 'marble'; // the wings' copings
    if (y > FP.cope && z > half0(y)[1]) return 'marble'; // the front piers' copings
    return 'trav';
  };
  // the faces of the courses above and below: with the piers and pilasters a course's extent is
  // no longer its face, so the coursing's steps miss a band's 0.15 m projection and its underside
  // went undrawn (cracks at the main arch's springing, glb-cracks.mjs)
  const nearFaces = (y) => { const i = ys.findIndex((v) => v > y); return [i > 1 ? (ys[i - 2] + ys[i - 1]) / 2 : y, i + 1 < ys.length ? (ys[i] + ys[i + 1]) / 2 : y].map((m) => half0(m)[1]); };
  const special = (y) => {
    const [hx] = half(y), hx0 = half0(y)[0], hz = half0(y)[1], x = [], z = [];
    if (y < 87.4) { x.push(11.35, 12.35, hx0 - 0.3); z.push(hz - 0.3, hz - 0.6, 0.5); }
    if (y < 61.6) z.push(...nearFaces(y));
    if (pilY(y)) { x.push(PIL); z.push(hz, hz + PROUD); }
    if (y < FP.top) { x.push(FP.x0, FP.x1, PSLIT[0], PSLIT[1]); z.push(hz, FP.z - 0.6, FP.z - 0.3, FP.z); }
    if (wingX(y)) x.push(hx0, ...(y < W1[1] ? [17.0, 18.0, W2[0]] : []), hx - 0.3);
    if (y < YS1) { x.push(6.0, 6.5, 7.0, 7.5); z.push(4.0, 4.6, 5.2); }
    else if (y < 31.0) x.push(8.6);
    else if (y > 33.0 && y < YS2) { x.push(4.5, 4.85, 5.2); z.push(4.3, 4.9); }
    else if (y > YS2 && y < 59.0) x.push(6.2);
    else if (y > 64.0 && y < YS3) { x.push(3.5, 4.0); z.push(4.7); }
    else if (y > YS3 && y < 83.0) x.push(4.8);
    else if (y > 91.4 && y < 95.0) { x.push(1.8); z.push(3.6); }
    return { x: x.flatMap((v) => [-v, v]), z: z.flatMap((v) => [-v, v]) };
  };
  courses(S, ys, half, special, state, kindOf, 2.0); // turn 10: the passage walls keep the common bevel (their 6 mm met 2 cm and opened slots)
  // the slits' glowing backs, one panel per slit
  const glowPanel = (x0, x1, y0, y1, sx, zb, sz) => {
    const w = pickWindow(R, 'glow', x1 - x0, y1 - y0, 1, false);
    B.poly([[sx * x0, y0, zb], [sx * x1, y0, zb], [sx * x1, y1, zb], [sx * x0, y1, zb]], [0, 0, sz],
      [uvOf(w, 0, 0), uvOf(w, 1, 0), uvOf(w, 1, 1), uvOf(w, 0, 1)]);
  };
  for (const [x0, x1, y0, y1, f] of SLITS) for (const sx of [-1, 1]) for (const sz of f ? [f] : [-1, 1]) glowPanel(x0, x1, y0, y1, sx, sz * (half0((y0 + y1) / 2)[1] - 0.3), sz);
  for (const sx of [-1, 1]) glowPanel(PSLIT[0], PSLIT[1], PSLIT[2], PSLIT[3], sx, FP.z - 0.3, 1);
  // Threshold: a seamless marble floor through the passage, 2 cm proud of the deck and running
  // under the walls and reveals, so no deck joint shows in it.
  for (const [z0, z1] of [[-5.9, -1.9], [-1.9, 1.9], [1.9, 5.9]]) {
    S.push({ lo: [-7.6, 0, z0], hi: [7.6, 0.02, z1], c: 0, kind: 'marble', exp: { py: true, pz: z1 > 5, nz: z0 < -5 } });
  }

  for (const nz of [1, -1]) {
    // main arch: spandrels up to the string course, a voussoir archivolt, three stepped orders
    spandrels(B, R, { cx: 0, ys: YS1, r: 7.5, x0: -8.6, x1: 8.6, yt: 31.0, zf: 5.7 * nz, nz, n: 20, dens: 0.06 });
    voussoirs(B, R, { cx: 0, ys: YS1, r0: 7.5, r1: 8.4, zf: 5.7 * nz, nz, p: 0.22, k: 27, key: { dr: 0.6, dp: 0.16 } });
    for (const [r0, r1, zf, zo] of [[7.0, 7.5, 5.2, 5.7], [6.5, 7.0, 4.6, 5.2], [6.0, 6.5, 4.0, 4.6]]) {
      ringFace(B, R, { cx: 0, ys: YS1, r0, r1, zf: zf * nz, nz, n: 44, k: 21 });
      band(B, R, { cx: 0, ys: YS1, r: r1, z0: zf * nz, z1: zo * nz, n: 44, k: 5 });
    }
    // second arch, open to the sky: two orders
    spandrels(B, R, { cx: 0, ys: YS2, r: 5.2, x0: -6.2, x1: 6.2, yt: 59.0, zf: 5.5 * nz, nz, n: 16, dens: 0.08 });
    voussoirs(B, R, { cx: 0, ys: YS2, r0: 5.2, r1: 5.9, zf: 5.5 * nz, nz, p: 0.18, k: 21, key: { dr: 0.4, dp: 0.12 } });
    for (const [r0, r1, zf, zo] of [[4.85, 5.2, 4.9, 5.5], [4.5, 4.85, 4.3, 4.9]]) {
      ringFace(B, R, { cx: 0, ys: YS2, r0, r1, zf: zf * nz, nz, n: 36, k: 15 });
      band(B, R, { cx: 0, ys: YS2, r: r1, z0: zf * nz, z1: zo * nz, n: 36, k: 4 });
    }
    // lantern: a marble order whose band glows
    spandrels(B, R, { cx: 0, ys: YS3, r: 4.0, x0: -4.8, x1: 4.8, yt: 83.0, zf: 5.3 * nz, nz, n: 14, dens: 0.1 });
    voussoirs(B, R, { cx: 0, ys: YS3, r0: 4.0, r1: 4.6, zf: 5.3 * nz, nz, p: 0.16, k: 17, key: { dr: 0.3, dp: 0.1 } });
    ringFace(B, R, { cx: 0, ys: YS3, r0: 3.5, r1: 4.0, zf: 4.7 * nz, nz, n: 30, k: 11 });
    band(B, R, { cx: 0, ys: YS3, r: 4.0, z0: 4.7 * nz, z1: 5.3 * nz, n: 30, kind: 'glow' });
  }
  // Soffits: glowing panels between marble ribs in the passage and the second arch; the
  // lantern glows all through.
  const vault = (y0, r, zEnd, ribs, w, n) => {
    const zc = [-zEnd, ...ribs.flatMap((zr) => [zr - w, zr + w]), zEnd];
    for (let i = 0; i + 1 < zc.length; i += 2) band(B, R, { cx: 0, ys: y0, r, z0: zc[i], z1: zc[i + 1], n, kind: 'glow' });
    for (const zr of ribs) {
      band(B, R, { cx: 0, ys: y0, r: r - 0.15, z0: zr - w, z1: zr + w, n, k: 9 });
      for (const sg of [-1, 1]) ringFace(B, R, { cx: 0, ys: y0, r0: r - 0.15, r1: r, zf: zr + w * sg, nz: sg, n, k: 9 });
      // turn 10: the rib's ends, where it springs from the walls (they were open to the sky)
      const wnd = pickWindow(R, 'marble', 0.15, 2 * w, DENS.marble, false);
      for (const a of [0, Math.PI]) B.poly([at(0, y0, r - 0.15, a, zr - w), at(0, y0, r, a, zr - w), at(0, y0, r, a, zr + w), at(0, y0, r - 0.15, a, zr + w)],
        [0, -1, 0], [uvOf(wnd, 0, 0), uvOf(wnd, 1, 0), uvOf(wnd, 1, 1), uvOf(wnd, 0, 1)]);
    }
  };
  vault(YS1, 6.0, 4.0, [-2.4, -0.8, 0.8, 2.4], 0.2, 44);
  vault(YS2, 4.5, 4.3, [-1.4, 1.4], 0.18, 36);
  band(B, R, { cx: 0, ys: YS3, r: 3.5, z0: -4.7, z1: 4.7, n: 30, kind: 'glow' });
}

// Planter for the cypresses and shrubs: a recessed brass strip at the foot, a marble plinth, a
// coursed ivory travertine body and a marble rim 0.12 m wide over a soil top 6 cm down.
function planter(S, hx, hz, h) {
  const half = (y) => (y < 0.05 ? [hx, hz] : y < 0.15 ? [hx + 0.03, hz + 0.03] : y < h - 0.12 ? [hx, hz] : [hx + 0.04, hz + 0.04]);
  const inside = (x, z) => Math.abs(x) < hx - 0.12 && Math.abs(z) < hz - 0.12;
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (y > h) return 'empty';
    const [a, b] = half(y);
    if (Math.abs(x) > a || Math.abs(z) > b) return 'empty';
    return y > h - 0.06 && inside(x, z) ? 'empty' : 'solid';
  };
  const kindOf = (x, y, z, exp, fk) => {
    if (y > h - 0.12 && y < h - 0.06 && inside(x, z)) { fk.py = 'soil'; return 'trav'; }
    return y < 0.05 ? 'brass' : y < 0.15 || y > h - 0.12 ? 'marble' : 'trav';
  };
  const mid = (0.15 + h - 0.12) / 2;
  courses(S, [0, 0.05, 0.15, +mid.toFixed(3), +(h - 0.12).toFixed(3), +(h - 0.06).toFixed(3), h], (y) => half(y),
    (y) => (y > h - 0.12 ? { x: [-(hx - 0.12), hx - 0.12], z: [-(hz - 0.12), hz - 0.12] } : {}), state, kindOf, 0.8);
}

// Floating cube, 1 m with a 2 cm bevel, polished white marble; placements scale it from a block
// you could almost touch to monoliths. cube-mirror (in build) is the same block as a mirror.
const CUBE = { lo: [-0.5, -0.5, -0.5], hi: [0.5, 0.5, 0.5], c: 0.02, kind: 'marble-a', dens: 0.5, exp: { px: true, nx: true, py: true, ny: true, pz: true, nz: true } };
function cubeMarble(S) { S.push({ ...CUBE, exp: { ...CUBE.exp } }); }
// The mirror cube's mesh: each face spans its whole texture (a mirror inside a brass border),
// and the 2 cm bevels and corners sample the border, so the frame runs round every edge.
function mirrorCube(B) {
  const h = 0.5, c = 0.04, rim = [0.015, 0.5]; // turn 16: a bevel twice as wide, to catch the sun (round 7: flat faces)
  const V = (g, ax) => [0, 1, 2].map((i) => (i === ax ? g[i] * h : g[i] * (h - c)));
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const [a1, a2] = [0, 1, 2].filter((i) => i !== ax), n = [0, 0, 0];
    n[ax] = s;
    const gs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => { const g = [0, 0, 0]; g[ax] = s; g[a1] = p; g[a2] = q; return g; });
    B.poly(gs.map((g) => V(g, ax)), n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const o = [0, 1, 2].find((i) => i !== a && i !== b), n = [0, 0, 0];
    const g = (so) => { const t = [0, 0, 0]; t[a] = sa; t[b] = sb; t[o] = so; return t; };
    n[a] = sa; n[b] = sb;
    B.poly([V(g(-1), a), V(g(1), a), V(g(1), b), V(g(-1), b)], nrm(n), [rim, rim, rim, rim]);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) B.poly([V([sx, sy, sz], 0), V([sx, sy, sz], 1), V([sx, sy, sz], 2)], nrm([sx, sy, sz]), [rim, rim, rim]);
}

// Floating isle: a marble deck 24 m square over an inverted ziggurat of coursed ivory travertine
// with marble bands, narrowing in steps to a 4.4 m keel 18.4 m down. Decks, arcades and
// planting from the kit stand on top.
function isle(S) {
  const halves = [12, 11.3, 10.5, 9.6, 8.6, 7.6, 6.5, 5.4, 4.3, 3.2, 2.2], tops = [0, -0.4]; // course boundaries from the deck down
  for (let k = 1; k < halves.length; k++) tops.push(+(-0.4 - 1.8 * k).toFixed(2));
  const course = (y) => Math.max(0, tops.findIndex((v, i) => i + 1 < tops.length && y <= v && y >= tops[i + 1]));
  const half = (y) => { const h = halves[Math.min(halves.length - 1, course(y))]; return [h, h]; };
  const state = (x, y, z) => {
    if (y > 0 || y < tops[tops.length - 1]) return 'empty';
    const [h] = half(y);
    return Math.abs(x) <= h && Math.abs(z) <= h ? 'solid' : 'empty';
  };
  const kindOf = (x, y) => (y > -0.4 || course(y) % 4 === 3 ? 'marble-a' : 'trav-a');
  // turn 10: courses() takes the boundaries from the bottom up; given them from the top down it
  // found no step's underside, so the keel showed the sky between its courses
  courses(S, tops.slice().reverse(), half, () => ({}), state, kindOf, 2.4);
}

// Far monolith (turn 9, rule 6's far layer): a colossal coursed travertine stele, 10 x 40 x 10 m
// at scale 1 (placements scale it two to five times), on a stepped marble plinth under a
// stepped cap, with a marble band every sixth course; stones 2.5 m long in 1.6 m courses with
// 6 cm bevels, so at a few hundred metres it reads as built masonry, not a plain block. It
// floats, so its underside is drawn too.
function monolith(S) {
  const ys = [0, 0.8];
  for (let y = 1.6; y < 38.4 + 1e-6; y += 1.6) ys.push(+y.toFixed(2));
  ys.push(39.2, 40);
  const half = (y) => (y < 0.8 ? 5.6 : y < 1.6 ? 5.3 : y < 38.4 ? 5.0 : y < 39.2 ? 5.3 : 4.6);
  const state = (x, y, z) => (y < 0 || y > 40 || Math.abs(x) > half(y) || Math.abs(z) > half(y) ? 'empty' : 'solid');
  const band = (y) => y < 1.6 || y > 38.4 || Math.floor((y - 1.6) / 1.6) % 6 === 5;
  courses(S, ys, (y) => [half(y), half(y)], () => ({}), state, (x, y) => (band(y) ? 'marble-a' : 'trav-a'), 2.5);
  for (const st of S) st.c = 0.06;
}

// turn 15 (round 5: the arcade tops ran as one flat line; staggered pavilions should break it):
// an open belvedere on a coursed shaft standing up out of the cloud sea. A marble plinth 4.8 m
// square, four travertine corner piers 0.8 m square, on every side a round arch 3 m wide
// springing at 2.9 m under a marble archivolt, a marble entablature from 4.8 to 5.95 m and a roof
// stepping in three times to a marble finial at 7.6 m; the shaft, 3.4 m square, runs 60 m down.
// The arches of the x-facing sides are drawn through a proxy that turns them a quarter about y.
function pavilion(S, R, B) {
  const H = 2.3, P = 0.8, ys = 2.9, r = 1.5, yt = 4.8, open = { px: true, nx: true, pz: true, nz: true };
  S.push({ lo: [-H - 0.1, -0.3, -H - 0.1], hi: [H + 0.1, 0, H + 0.1], c: 0.02, kind: 'marble', dens: 0.25, exp: { py: true, ny: true, ...open } });
  S.push({ lo: [-1.7, -60, -1.7], hi: [1.7, -0.3, 1.7], c: 0.02, kind: 'trav', dens: 0.12, exp: open });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    S.push({ lo: [sx > 0 ? H - P : -H, 0, sz > 0 ? H - P : -H], hi: [sx > 0 ? H : -H + P, yt, sz > 0 ? H : -H + P], c: 0.02, kind: 'trav', dens: 0.19, exp: open });
  }
  for (const [y0, y1, h, kind] of [[yt, 5.2, 2.45, 'marble'], [5.2, 5.75, 2.35, 'trav'], [5.75, 5.95, 2.6, 'marble'], [5.95, 6.3, 2.1, 'trav'], [6.3, 6.65, 1.6, 'trav'],
    [6.65, 7.0, 1.1, 'marble'], [7.0, 7.6, 0.35, 'marble']]) S.push({ lo: [-h, y0, -h], hi: [h, y1, h], c: 0.015, kind, dens: kind === 'marble' ? 0.25 : 0.19, exp: { py: true, ny: true, ...open } });
  const turned = { poly: (v, n, uv) => B.poly(v.map(([x, y, z]) => [z, y, -x]), [n[2], n[1], -n[0]], uv),
    polyN: (v, ns, uv) => B.polyN(v.map(([x, y, z]) => [z, y, -x]), ns.map((n) => [n[2], n[1], -n[0]]), uv) };
  for (const BB of [B, turned]) for (const s of [-1, 1]) {
    spandrels(BB, R, { cx: 0, ys, r, x0: -1.5, x1: 1.5, yt, zf: H * s, nz: s, n: 12, dens: 0.12 }); // outer face
    spandrels(BB, R, { cx: 0, ys, r, x0: -1.5, x1: 1.5, yt, zf: (H - P) * s, nz: -s, n: 12, dens: 0.12 }); // inner face
    voussoirs(BB, R, { cx: 0, ys, r0: r, r1: r + 0.3, zf: H * s, nz: s, p: 0.06, k: 9, key: { dr: 0.12, dp: 0.04 } });
    band(BB, R, { cx: 0, ys, r, z0: (H - P) * s, z1: H * s, n: 16 });
  }
}

// A piece's stones and faces moved dx along x, into another piece's mesh.
function putShifted(S, R, B, fn, dx) {
  const S2 = [], shift = (v) => [v[0] + dx, v[1], v[2]];
  fn(S2, R, { poly: (v, n, uv) => B.poly(v.map(shift), n, uv), polyN: (v, ns, uv) => B.polyN(v.map(shift), ns, uv) });
  for (const st of S2) S.push({ ...st, lo: shift(st.lo), hi: shift(st.hi) });
}

// Review only (never saved): three arches on their piers between two pylons, in one mesh.
function previewArcade(S, R, B) {
  const put = (fn, dx) => putShifted(S, R, B, fn, dx);
  for (const dx of [-4.8, 0, 4.8]) put((S2, R2, B2) => arcadeArch(S2, R2, B2), dx);
  put((S2) => arcadePier(S2, true), -2.4);
  put((S2) => arcadePier(S2, false), 2.4);
  for (const dx of [-7.2, 7.2]) put((S2) => pylon(S2), dx);
}

// Turn 15: one bay of the arcade in one mesh, the plain pier at x = 0 and its arch on the +x
// side (x -0.7 .. 4.8), so the inverted sanctuary's arcades take one placement a bay.
function arcadeBay(S, R, B) {
  putShifted(S, R, B, (S2) => arcadePier(S2, false), 0);
  putShifted(S, R, B, (S2, R2, B2) => arcadeArch(S2, R2, B2), 2.4);
}

const PIECES = {
  'preview-arcade': { glow: GLOW, build: previewArcade },
  'arcade-arch': { glow: 0, build: arcadeArch },
  'arcade-pier': { glow: 0, build: (S) => arcadePier(S, false) },
  'arcade-pier-slot': { glow: GLOW, build: (S) => arcadePier(S, true) },
  'arcade-pylon': { glow: GLOW, build: pylon },
  'tower-slot': { glow: GLOW, build: (S) => tower(S) },
  'tower-rim': { glow: GLOW, build: (S) => tower(S, 110) },
  'tower-gate': { glow: GLOW, build: (S) => tower(S, 110, 2) }, // turn 14: the T3 rim towers beside the gateway, two storeys taller
  'cascade-tower': { glow: GLOW, build: cascade },
  'gateway': { glow: GLOW, build: gateway },
  'planter-sq': { glow: 0, build: (S) => planter(S, 0.8, 0.8, 0.9) },
  'planter-long': { glow: 0, build: (S) => planter(S, 2.0, 0.6, 0.7) },
  'cube-marble': { glow: 0, build: cubeMarble },
  'isle-base': { glow: 0, build: isle },
  'monolith': { glow: 0, build: monolith },
  'pavilion': { glow: 0, build: pavilion }, // turn 15
  'tower-hang': { glow: GLOW, build: (S) => tower(S, 0.6, 1) }, // turn 15: a rim tower one storey taller with no shaft, to hang from the inverted sanctuary
  'arcade-bay': { glow: 0, build: arcadeBay }, // turn 15
};

async function build() {
  const root = createRoot(PIECE);
  if (PIECE === 'orb') { // a true mirror: white metal, roughness 0.02, smooth normals
    const white = proceduralTexture({ schemaVersion: 2, size: 4, usage: 'albedo', layers: [{ op: 'solid', color: 0xf2f4f6 }] });
    createPart('orb', sphereGeo(2.25, 96, 64), pbrMaterial({ albedo: white, roughness: 0.02, metalness: 1 }), { parent: root });
    return root;
  }
  // the floating cube as a true mirror with a hairline brass edge (turn 9: the frame read as a crate);
  // cube-mirror-court (turn 11) is the same cube under its own name, for the court's reflection probe
  if (PIECE === 'cube-mirror' || PIECE === 'cube-mirror-court' || PIECE === 'cube-mirror-far') { // turn 16: cube-mirror-far, the same cube for the far ones' sky reflection
    const n = 64, f = 1, inner = { kind: 'rectangle', x: f, y: f, width: n - 2 * f, height: n - 2 * f };
    const albedo = proceduralTexture({ schemaVersion: 3, width: n, height: n, usage: 'albedo', background: [236, 212, 156, 255], // turn 16: a paler gold bevel (was 212, 176, 104)
      operations: [{ op: 'paint', shape: inner, rgba: [238, 240, 243, 255] }] });
    const mr = proceduralTexture({ schemaVersion: 3, width: n, height: n, usage: 'metallicRoughness', background: [0, 64, 255, 255], // turn 16: bevel roughness 0.25 (was 0.35)
      operations: [{ op: 'paint', shape: inner, rgba: [0, 5, 255, 255] }] }); // turn 13: roughness 0.02 (was 0.04)
    const B = makeBuilder();
    mirrorCube(B);
    createPart('cube_mirror', B.geometry(), pbrMaterial({ albedo, metallicRoughness: mr, roughness: 1, metalness: 1 }), { parent: root });
    return root;
  }
  const piece = PIECES[PIECE], R = rng(hash(PIECE)), B = makeBuilder(), S0 = [];
  piece.build(S0, R, B);
  const S = splitStones(S0);
  seal(S);
  for (const st of S) emitStone(B, R, st);
  createPart(PIECE.replace(/-/g, '_'), B.geometry(), await stoneMaterial(1024, piece.glow), { parent: root });
  return root;
}
