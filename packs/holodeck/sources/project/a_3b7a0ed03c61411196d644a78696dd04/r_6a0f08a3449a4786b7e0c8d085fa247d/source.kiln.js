// Meridian Sanctuary stone kit (plan.md section 5, assets 1-13).
// One program builds every stone piece; PIECE selects which one this revision is.
// Each piece is one mesh with one material: an atlas holding two white veined marble
// patches, two ivory travertine patches and a brushed brass band, so every placement
// of a piece batches into a single instanced draw.
const meta = { name: 'Meridian stone kit' };
const PIECE = 'stair-4';

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- textures
const BAND = 0.047; // brass band: top of quadrant 4, as a fraction of the atlas edge
const REG = {
  MA: [0.008, 0.008, 0.492, 0.492], MB: [0.508, 0.008, 0.992, 0.492],
  TA: [0.008, 0.508, 0.492, 0.992], TB: [0.508, 0.5 + BAND + 0.008, 0.992, 0.992],
  BR: [0.512, 0.506, 0.988, 0.5 + BAND - 0.006],
};

// A meandering vein as short overlapping polygon segments: V3 fill work grows with
// bounding-box area times edge count, so one long diagonal polygon is too costly.
function veinPolys(R, x, y, ang, steps, len, halfW, wiggle, seg = 6) {
  const left = [], right = [];
  for (let k = 0; k < steps; k++) {
    ang += (R() - 0.5) * wiggle;
    x += Math.cos(ang) * len; y += Math.sin(ang) * len;
    const t = k / (steps - 1);
    const w = Math.max(1, halfW * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + 0.6 * R()));
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    left.push([Math.round(x + nx) + 0, Math.round(y + ny) + 0]); // + 0 turns -0 into 0
    right.push([Math.round(x - nx) + 0, Math.round(y - ny) + 0]);
  }
  const polys = [];
  for (let a = 0; a < steps - 1; a += seg) {
    const b = Math.min(steps - 1, a + seg);
    const pts = left.slice(a, b + 1).concat(right.slice(a, b + 1).reverse())
      .filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
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
  ] } }); // noise octaves dominate the work bound, which an atlas shares across its regions
  // turn 16 (round 7: thick brown crescent strokes on every tile read as scuffs or cracks): two
  // long veins a patch, each a wide faint halo round a fine warm-grey core with a forked branch,
  // and fainter, finer secondary veins (as architecture.kiln.js, so the atlases stay identical)
  for (let i = 0; i < 2; i++) {
    const x = -0.05 * q, y = ((i + 0.25 + R() * 0.5) * q) / 2, ang = baseAng + (R() - 0.5) * 0.3, vs = Math.floor(R() * 1e9);
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 10 * s + 1, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [222, 216, 206, 255], opacity: 28 });
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 1.2 * s + 0.6, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [178, 172, 162, 255], opacity: 75 });
    const t = 0.3 + 0.3 * R(), ba = ang + (R() < 0.5 ? -1 : 1) * (0.4 + 0.3 * R());
    for (const p of veinPolys(R, x + t * q * Math.cos(ang), y + t * q * Math.sin(ang), ba, 13, q / 26, 0.9 * s + 0.5, 0.35)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [186, 180, 170, 255], opacity: 60 });
  }
  for (let i = 0; i < 5; i++) {
    const opacity = 30 + Math.floor(R() * 18);
    for (const p of veinPolys(R, R() * q, R() * q, baseAng + (R() - 0.5) * 0.9, 19, q / 30, 0.8 * s + 0.5, 0.5)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [200, 194, 186, 255], opacity });
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}

// Ivory travertine (turn 9: it read as flat plaster): bedding bands of varied width and warmth,
// soft pits of several sizes (fewer tiny dark ones, which sparkled at distance), and a tint per
// patch (warm or cream), so neighbouring blocks differ.
// Turn 13 (the reviews of revision 15: travertine read cool grey in shade and its pits as
// polka dots and dashes): a warmer ivory ground and bedding, and fewer, rounder, paler pits.
function travSpec(q, seed, band, tint = 0) {
  const s = q / 512, R = rng(seed), ops = [], t = (c) => c + tint * 0x030406; // tint > 0: a creamier patch
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: t(0xe1d0b5), colorB: t(0xf8efdf), scale: 4, octaves: 3, seed }, // turn 16: more value from block to block (was e7d8c0)
    { op: 'stripes', colorA: t(0xe3d2b6), colorB: t(0xf7eedd), count: 14, angleDeg: 90, blend: 'overlay', opacity: 0.45 },
  ] } });
  for (let i = 0; i < 14; i++) { // bedding: a few broad soft bands and fine streaks
    const y = Math.round(R() * q), dy = Math.round((R() - 0.5) * 6 * s), broad = i < 4, light = R() < 0.45;
    ops.push({ op: 'paint', shape: { kind: 'line', from: [-4, y], to: [q + 4, y + dy], width: Math.max(1, Math.round((broad ? 9 + R() * 10 : 1 + R() * 2) * s)) },
      rgba: light ? [250, 244, 232, 255] : [220, 202, 172, 255], opacity: broad ? 55 : 50 });
  }
  const pits = (w, h, rgba, count, area = { x: 0, y: 0, width: q, height: q }) => ops.push({ op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: Math.max(2, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) },
    rgba, count, seed: Math.floor(R() * 4e9), area });
  // turn 16 (round 7: the pits read as a uniform sprinkle of dark dots): long thin pits along the
  // bedding, in five bands where they gather, and a few rounder ones between
  for (let i = 0; i < 5; i++) {
    const bh = Math.round((14 + R() * 26) * s), y0 = Math.round(R() * (q - bh));
    pits(10, 2, [208, 192, 166, 255], 14, { x: 0, y: y0, width: q, height: bh });
    pits(18, 3, [212, 197, 172, 255], 6, { x: 0, y: y0, width: q, height: bh });
  }
  pits(6, 4, [214, 200, 176, 255], 12);
  if (band) {
    const bh = Math.round(BAND * 2 * q);
    ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: q, height: bh }, rgba: band });
    if (band[0] !== 128) for (let i = 0; i < 12; i++) {
      const y = Math.round(R() * bh);
      ops.push({ op: 'paint', shape: { kind: 'line', from: [-4, y], to: [q + 4, y], width: 1 },
        rgba: R() < 0.5 ? [212, 175, 108, 255] : [160, 124, 66, 255], opacity: 70 });
    }
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}

function ormSpec(oq, roughA, roughB, seed, band) {
  const ops = [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: oq, usage: 'metallicRoughness', layers: [
    { op: 'noise', colorA: roughA << 8, colorB: roughB << 8, scale: 5, octaves: 3, seed }] } }];
  if (band) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: oq, height: Math.max(1, Math.round(BAND * 2 * oq)) }, rgba: [0, 82, 255, 255] });
  return { schemaVersion: 3, width: oq, height: oq, usage: 'metallicRoughness', operations: ops };
}

async function atlas(edge, usage, specs) {
  const q = edge / 2, names = ['marble-a', 'marble-b', 'trav-a', 'trav-b'], pos = [[0, 0], [q, 0], [0, q], [q, q]];
  // pack selects the newer atlas compiler, whose aggregate work budget fits four regions
  return textureAtlas({ schemaVersion: 1, width: edge, height: edge, usage, pack: { edge: 1024, gutter: 0 },
    regions: specs.map((spec, i) => ({ name: names[i], content: { x: pos[i][0], y: pos[i][1], width: q, height: q }, gutter: 0, source: { kind: 'procedural', spec } })) });
}

async function stoneMaterial(edge) {
  const q = edge / 2, oq = edge / 8;
  const brass = [188, 148, 82, 255], grey = [128, 128, 128, 255];
  const albedo = await atlas(edge, 'albedo', [marbleSpec(q, 101, 0.55), marbleSpec(q, 202, -0.5), travSpec(q, 303, null), travSpec(q, 404, brass, 1)]);
  const flat = { schemaVersion: 3, width: q, height: q, usage: 'albedo', background: grey, operations: [] };
  const height = await atlas(edge, 'albedo', [flat, flat, travSpec(q, 303, null), travSpec(q, 404, grey)]);
  const orm = await atlas(edge / 4, 'metallicRoughness', [ormSpec(oq, 0x20, 0x34, 5, false), ormSpec(oq, 0x22, 0x36, 6, false),
    ormSpec(oq, 0xae, 0xda, 7, false), ormSpec(oq, 0xb0, 0xdc, 8, true)]);
  return pbrMaterial({ albedo, normal: normalMapFromHeight(height, { strength: 3 }), metallicRoughness: orm, roughness: 1, metalness: 1 });
}

// ---------------------------------------------------------------- geometry
function makeBuilder() {
  const P = [], N = [], T = [], I = [];
  return {
    poly(verts, n, uvs) { // convex polygon; winding is fixed to face n
      let vs = verts, us = uvs;
      if (dot(crs(sub(verts[1], verts[0]), sub(verts[2], verts[0])), n) < 0) { vs = verts.slice().reverse(); us = uvs.slice().reverse(); }
      const base = P.length / 3;
      vs.forEach((v, i) => { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); T.push(us[i][0], us[i][1]); });
      for (let i = 1; i + 1 < vs.length; i++) I.push(base, base + i, base + i + 1);
    },
    geometry() { return meshGeo({ positions: P, normals: N, uvs: T, indices: I }); },
  };
}

// Texture window: kind marble | trav | brass; face size in metres; density in atlas units per metre.
function pickWindow(R, kind, fw, fh, dens, square) {
  const key = kind === 'marble' ? (R() < 0.5 ? 'MA' : 'MB') : kind === 'trav' ? (R() < 0.5 ? 'TA' : 'TB') : 'BR';
  const [r0, s0, r1, s1] = REG[key];
  const rot = kind === 'brass' ? 0 : square ? Math.floor(R() * 4) : (R() < 0.5 ? 0 : 2);
  let ww = fw * dens, wh = fh * dens;
  if (kind === 'brass') { ww = Math.min(r1 - r0, 0.3); wh = s1 - s0; }
  if (rot % 2) [ww, wh] = [wh, ww];
  ww = Math.min(ww, r1 - r0); wh = Math.min(wh, s1 - s0);
  return { u0: r0 + R() * (r1 - r0 - ww), v0: s0 + R() * (s1 - s0 - wh), du: ww, dv: wh, rot };
}
function uvOf(w, a, b) {
  let s = a, t = 1 - b;
  if (w.rot === 1) [s, t] = [t, 1 - s]; else if (w.rot === 2) [s, t] = [1 - s, 1 - t]; else if (w.rot === 3) [s, t] = [1 - t, s];
  return [w.u0 + s * w.du, w.v0 + t * w.dv];
}

// A box stone with chamfered edges, emitting only faces, edges and corners that touch
// an exposed side. exp keys: px nx py ny pz nz.
const PARAM = [[2, 1], [0, 2], [0, 1]]; // face axis -> (a, b) parameter axes
const fkey = (ax, s) => (s > 0 ? 'p' : 'n') + 'xyz'[ax];
function emitStone(B, R, st) {
  const { lo, hi, c, kind, dens, exp } = st;
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const wins = {};
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const f = fkey(ax, s); if (!exp[f]) continue;
    const [pa, pb] = PARAM[ax];
    wins[f] = pickWindow(R, kind, size[pa], size[pb], dens, ax === 1 && Math.abs(size[pa] - size[pb]) < 0.01);
  }
  const order = ['py', 'px', 'nx', 'pz', 'nz', 'ny'];
  const uvFor = (f, v) => { const ax = 'xyz'.indexOf(f[1]); const [pa, pb] = PARAM[ax];
    return uvOf(wins[f], (v[pa] - lo[pa]) / size[pa], (v[pb] - lo[pb]) / size[pb]); };
  const emit = (verts, n, fs) => { const f = order.find((k) => fs.includes(k) && exp[k]); if (f) B.poly(verts, n, verts.map((v) => uvFor(f, v))); };
  const C = (i, s) => (s > 0 ? hi[i] : lo[i]), E = st.E || {}, flat = st.flat || [];
  // turn 10: the depth of the edge between faces f and g (seal() sets it where only one shows);
  // a vertex on a face that does not show takes the depth of the showing face's edge. Turn 15:
  // the edges round a stone's flat faces (st.flat: a module's butt ends) take none, so modules
  // laid end to end close without the V-notch whose corners let the sun through their shadows
  const dep = (f, g) => (flat.includes(f) || flat.includes(g) ? 0 : f + g in E ? E[f + g] : g + f in E ? E[g + f] : c);
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
    if (open.length === 1) { // turn 9: a joint crossing on a face: run the corner down to the joint point, closing the pinhole four bevels leave
      const e = open[0], [a, b] = [0, 1, 2].filter((i) => i !== e), d = Math.max(dep(fs[e], fs[a]), dep(fs[e], fs[b]));
      if (d <= 0) continue;
      const P = [0, 1, 2].map((i) => (i === e ? C(i, g[i]) - g[i] * d : C(i, g[i])));
      emit([V(e, g), V(a, g), P, V(b, g)], nrm(g), fs);
    } else emit([V(0, g), V(1, g), V(2, g)], nrm(g), fs);
  }
}

// turn 10: sealed joints (glb-cracks.mjs, on the reviews of revision 12: the sun leaked through
// joints in dashed lines onto shaded paving). Every edge where one face of a stone shows and the
// other does not gets one depth, the same as the stone across the joint: none at an inner
// corner (the space diagonally across both faces is stone), or against a stone without bevels
// (the brass strips), where the bevel used to open a slot into the hollow behind; at a joint
// between two faces that both show, the deeper of the two bevels on both sides, where a tile
// bevel (6 mm) met a wall course's (2 cm) and left a slot between them. The stone across is
// looked for at a quarter, half and three quarters along the edge: courses stagger by half a
// stone, so a stone's midpoint lies on the joint of the course beside it.
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
        if (!(st.c > 0)) { st.E[F + G] = 0; continue; }
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

// turn 13: one texel density (as architecture.kiln.js): a stone whose texture window would be
// capped at its atlas region by more than 15 % splits into equal parts; the plain foundation
// shaft (94 m at density 0.05, stretched nearly ten times on the tall west foundations) takes the
// big-face density 0.12 and a bevel, and reads as tall courses.
const REGION = 0.48, SHAFT_DENS = 0.12;
function splitStones(S) {
  const out = [];
  for (const st of S) {
    if (st.kind === 'brass') { out.push(st); continue; }
    const shaft = st.dens < SHAFT_DENS, dens = Math.max(st.dens, SHAFT_DENS), size = [0, 1, 2].map((i) => st.hi[i] - st.lo[i]);
    const n = [0, 1, 2].map((i) => {
      const shows = [0, 1, 2].some((ax) => ax !== i && (st.exp[fkey(ax, 1)] || st.exp[fkey(ax, -1)]));
      const r = (size[i] * dens) / REGION;
      return shows && r > 1.15 ? Math.ceil(r - 1e-9) : 1;
    });
    if (n.every((v) => v === 1)) { out.push(shaft ? { ...st, dens: SHAFT_DENS } : st); continue; }
    for (let a = 0; a < n[0]; a++) for (let b = 0; b < n[1]; b++) for (let d = 0; d < n[2]; d++) {
      const idx = [a, b, d], exp = {};
      for (const [f, v] of Object.entries(st.exp)) {
        const i = 'xyz'.indexOf(f[1]);
        if (v && (f[0] === 'p' ? idx[i] === n[i] - 1 : idx[i] === 0)) exp[f] = true;
      }
      if (!Object.keys(exp).length) continue;
      out.push({ ...st, lo: [0, 1, 2].map((i) => st.lo[i] + (size[i] * idx[i]) / n[i]), hi: [0, 1, 2].map((i) => st.lo[i] + (size[i] * (idx[i] + 1)) / n[i]),
        exp, ...(shaft ? { dens: SHAFT_DENS, c: STONE_C } : {}) });
    }
  }
  return out;
}

// Convex prism between x0 and x1 over a (z, y) profile; hide lists edge indices to skip.
function emitPrismX(B, R, x0, x1, prof, hide, capEdge = -1) {
  const area = prof.reduce((acc, p, i) => { const q = prof[(i + 1) % prof.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0);
  const zs = prof.map((p) => p[0]), ys = prof.map((p) => p[1]);
  const zmin = Math.min(...zs), ymin = Math.min(...ys), zr = Math.max(...zs) - zmin, yr = Math.max(...ys) - ymin;
  for (const [x, nx] of [[x0, -1], [x1, 1]]) {
    const w = pickWindow(R, 'trav', zr, yr, 0.19, false);
    const verts = prof.map(([z, y]) => [x, y, z]);
    B.poly(verts, [nx, 0, 0], verts.map((v) => uvOf(w, (v[2] - zmin) / zr, (v[1] - ymin) / yr)));
  }
  prof.forEach((p, i) => {
    if (hide.includes(i)) return;
    const q = prof[(i + 1) % prof.length];
    const dz = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dz, dy);
    const sgn = area > 0 ? 1 : -1; // outward normal in the (z, y) plane
    const n = nrm([0, -dz * sgn, dy * sgn]);
    const w = pickWindow(R, i === capEdge ? 'marble' : 'trav', x1 - x0, len, i === capEdge ? 0.25 : 0.19, false);
    const verts = [[x0, p[1], p[0]], [x1, p[1], p[0]], [x1, q[1], q[0]], [x0, q[1], q[0]]];
    B.poly(verts, n, [uvOf(w, 0, 0), uvOf(w, 1, 0), uvOf(w, 1, 1), uvOf(w, 0, 1)]);
  });
}

// ---------------------------------------------------------------- piece helpers
const TILE_C = 0.006, STONE_C = 0.02; // turn 9: larger bevels, so edges catch the light
function tiles(S, x0, x1, z0, z1, nx, nz, top, th, perim, dens = 0.2) { // turn 9: 0.2 (was 0.25), so a metre of floor shows bolder veins
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    S.push({ lo: [x0 + i * dx, top - th, z0 + j * dz], hi: [x0 + (i + 1) * dx, top, z0 + (j + 1) * dz], c: TILE_C, kind: 'marble', dens,
      exp: { py: true, nx: !!perim.nx && i === 0, px: !!perim.px && i === nx - 1, nz: !!perim.nz && j === 0, pz: !!perim.pz && j === nz - 1 } });
  }
}
// Travertine courses on one side: outer plane coordinate, run [s0, s1], courses from yTop down to yBot.
function courses(S, side, outer, s0, s1, yTop, yBot, ch, len, depth, ends) {
  const ax = side[1] === 'x' ? 0 : 2, along = ax === 0 ? 2 : 0, sg = side[0] === 'p' ? 1 : -1;
  let row = 0;
  for (let yt = yTop; yt > yBot + 1e-6; yt -= ch, row++) {
    const yb = Math.max(yBot, yt - ch), cuts = [s0];
    for (let p = s0 + (row % 2 ? len / 2 : len); p < s1 - 0.3; p += len) cuts.push(p);
    cuts.push(s1);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const lo = [0, yb, 0], hi = [0, yt, 0];
      lo[ax] = sg > 0 ? outer - depth : outer; hi[ax] = sg > 0 ? outer : outer + depth;
      lo[along] = cuts[k]; hi[along] = cuts[k + 1];
      const exp = { [side]: true };
      if (ends && k === 0) exp['n' + 'xyz'[along]] = true;
      if (ends && k === cuts.length - 2) exp['p' + 'xyz'[along]] = true;
      S.push({ lo, hi, c: STONE_C, kind: 'trav', dens: 0.19, exp });
    }
  }
}
function fourSides(S, hx, hz, yTop, yBot, ch, len, depth) {
  courses(S, 'px', hx, -hz, hz, yTop, yBot, ch, len, depth, true);
  courses(S, 'nx', -hx, -hz, hz, yTop, yBot, ch, len, depth, true);
  courses(S, 'pz', hz, -hx + depth, hx - depth, yTop, yBot, ch, len, depth, false);
  courses(S, 'nz', -hz, -hx + depth, hx - depth, yTop, yBot, ch, len, depth, false);
}
const brassStrip = (S, lo, hi, exp) => S.push({ lo, hi, c: 0, kind: 'brass', dens: 1, exp });
const ALL = { px: true, nx: true, pz: true, nz: true };

// A flight climbing toward -Z from a foot at z = 0: 15 risers of 0.16 m, 13 treads of
// 0.40 m and a 2.8 m landing after the eighth riser; brass nosings; mass from base. Every
// stone also draws its underside, the end stones their outer sides and the last tread its
// back, so a flight in the air reads as one solid wedge of stone from below and the side.
const RISE = 0.16, TREAD = 0.4, LANDING = 2.8, NOSE = 0.035;
function flightStones(S, x0, x1, base, stones) {
  let z = 0;
  for (let k = 1; k < 15; k++) {
    const depth = k === 8 ? LANDING : TREAD, top = RISE * k, w = (x1 - x0) / stones;
    for (let i = 0; i < stones; i++) {
      const ends = { ny: true, nx: i === 0, px: i === stones - 1 };
      if (k === 8) for (let j = 0; j < 2; j++) S.push({ lo: [x0 + i * w, base, z - NOSE - (j + 1) * (depth - NOSE) / 2], hi: [x0 + (i + 1) * w, top, z - NOSE - j * (depth - NOSE) / 2], c: TILE_C, kind: 'marble', dens: 0.25, exp: { py: true, pz: j === 0, ...ends } });
      else S.push({ lo: [x0 + i * w, base, z - depth], hi: [x0 + (i + 1) * w, top, z - NOSE], c: TILE_C, kind: 'marble', dens: 0.25, exp: { py: true, pz: true, nz: k === 14, ...ends } });
    }
    // turn 10: its back closes the notch at the tread's bevel; turn 15: 3 mm proud of the tread
    // (flush, the strip resolved differently on each backend at the forecourt's edge in h8)
    brassStrip(S, [x0, top - 0.03, z - NOSE], [x1, top + 0.003, z + 0.006], { py: true, pz: true, nz: true });
    z -= depth;
  }
}

const PIECES = {
  'block-8': { edge: 1024, build(S) { tiles(S, -4, 4, -4, 4, 8, 8, 0, 0.2, ALL); fourSides(S, 4, 4, -0.2, -3.4, 0.8, 2, 0.3); } },
  'deck-4': { edge: 1024, build(S) { tiles(S, -2, 2, -2, 2, 4, 4, 0, 0.2, ALL); fourSides(S, 2, 2, -0.2, -1.0, 0.8, 2, 0.3); } },
  'deck-6': { edge: 1024, build(S) {
    for (const sx of [-1, 1]) {
      // turn 7: the brass inlays along the causeway's edges are 8 cm wide (they were 3 cm and
      // did not read from the arrival)
      for (let j = 0; j < 4; j++) S.push({ lo: [sx < 0 ? -3 : 2.65, -0.2, -2 + j], hi: [sx < 0 ? -2.65 : 3, 0, -1 + j], c: TILE_C, kind: 'marble', dens: 0.25,
        exp: { py: true, [sx < 0 ? 'nx' : 'px']: true } });
      brassStrip(S, [sx < 0 ? -2.65 : 2.57, -0.2, -2], [sx < 0 ? -2.57 : 2.65, 0.002, 2], { py: true, px: true, nx: true }); // turn 15: 2 mm proud, not coplanar
      courses(S, sx < 0 ? 'nx' : 'px', 3 * sx, -2, 2, -0.2, -1.0, 0.8, 2, 0.3, false);
    }
    tiles(S, -2.57, 2.57, -2, 2, 5, 4, 0, 0.2, {});
  } },
  'step-slab': { edge: 1024, build(S) {
    for (let i = 0; i < 3; i++) S.push({ lo: [-3 + 2 * i, -1, -1.35], hi: [-1 + 2 * i, 0, 1.35], c: STONE_C, kind: 'marble', dens: 0.17,
      exp: { py: true, pz: true, nz: true, nx: i === 0, px: i === 2 } });
  } },
  'coping-4': { edge: 1024, build(S) {
    for (let j = 0; j < 4; j++) S.push({ lo: [-0.2, -0.25, -2 + j], hi: [0.2, 0, -1 + j], c: TILE_C, kind: 'marble', dens: 0.25, exp: { py: true, px: true, nx: true } });
    for (let j = 0; j < 2; j++) S.push({ lo: [-0.2, -1, -2 + 2 * j], hi: [0.2, -0.25, 2 * j], c: STONE_C, kind: 'trav', dens: 0.19, exp: { px: true, nx: true } });
    brassStrip(S, [0.2, -0.05, -2], [0.24, 0.002, 2], { px: true, py: true, ny: true, nx: true }); // a 4 cm brass lip over the water (was 1.2 cm); turn 10: its back closes the notch at the coping's bevel; turn 15: 2 mm proud
  } },
  'pool-steps': { edge: 1024, build(S) {
    for (let k = 1; k <= 5; k++) for (let i = 0; i < 2; i++) S.push({ lo: [-1.5 + 1.5 * i, -1, 0.36 * (k - 1)], hi: [1.5 * i, -k / 6, 0.36 * k], c: 0.008, kind: 'marble', dens: 0.25,
      exp: { py: true, pz: true, nx: i === 0, px: i === 1 } });
  } },
  'stair-8': { edge: 1024, build(S) { flightStones(S, -4, 4, -1, 4); } },
  'stair-4': { edge: 1024, build(S, R, B) {
    flightStones(S, -1.7, 1.7, 0, 2);
    // Sloped travertine cheeks 0.9 m above the nosing line at the foot, in three sections.
    const top = (z) => 1.06 - 0.28 * z;
    for (const [za, zb, hide] of [[0, -8 / 3, [2, 3]], [-8 / 3, -16 / 3, [0, 2, 3]], [-16 / 3, -8, [0, 2, 3]]]) {
      const prof = [[za, 0], [za, top(za)], [zb, top(zb)], [zb, 0]];
      emitPrismX(B, R, -2, -1.7, prof, hide, 1); // edge 1 is the sloped top: a marble coping
      emitPrismX(B, R, 1.7, 2, prof, hide, 1);
    }
  } },
  'parapet-4': { edge: 1024, build(S) {
    // turn 15: the module's butt ends are flat (no bevel), so a run closes without notches at its
    // joints (the sun leaked through them in pairs of dots, h8); the brass 2 mm proud
    for (let i = 0; i < 2; i++) {
      const flat = [i === 0 ? 'nx' : 'px'];
      S.push({ lo: [-2 + 2 * i, 0, -0.2], hi: [2 * i, 0.92, 0.2], c: STONE_C, kind: 'trav', dens: 0.19, flat, exp: { pz: true, nz: true, nx: i === 0, px: i === 1 } });
      for (const [z0, z1] of [[-0.22, -0.01], [0.01, 0.22]]) S.push({ lo: [-2 + 2 * i, 0.92, z0], hi: [2 * i, 1.0, z1], c: TILE_C, kind: 'marble', dens: 0.25, flat,
        exp: { py: true, ny: true, [z0 < 0 ? 'nz' : 'pz']: true, nx: i === 0, px: i === 1 } });
    }
    brassStrip(S, [-2, 0.92, -0.01], [2, 1.002, 0.01], { py: true, px: true, nx: true });
  } },
  // turn 15 (h8: the forecourt's solid balustrades hid the flights and pools below): an open
  // balustrade, 4 m and 0.9 m tall, flat-ended like parapet-4 - a marble plinth, thirteen square
  // travertine balusters 0.12 m on 0.3 m centres, a marble rail with a brass inlay
  'balustrade-4': { edge: 1024, build(S) {
    const ends = (i, n) => [...(i === 0 ? ['nx'] : []), ...(i === n - 1 ? ['px'] : [])];
    for (let i = 0; i < 2; i++) S.push({ lo: [-2 + 2 * i, 0, -0.19], hi: [2 * i, 0.14, 0.19], c: TILE_C, kind: 'marble', dens: 0.25, flat: ends(i, 2),
      exp: { py: true, pz: true, nz: true, nx: i === 0, px: i === 1 } });
    for (let k = 0; k < 13; k++) {
      const x = -1.8 + 0.3 * k;
      S.push({ lo: [x - 0.06, 0.14, -0.06], hi: [x + 0.06, 0.76, 0.06], c: 0.012, kind: 'trav', dens: 0.19, exp: ALL });
    }
    for (let i = 0; i < 2; i++) for (const [z0, z1] of [[-0.17, -0.01], [0.01, 0.17]]) S.push({ lo: [-2 + 2 * i, 0.76, z0], hi: [2 * i, 0.9, z1], c: TILE_C, kind: 'marble', dens: 0.25,
      flat: ends(i, 2), exp: { py: true, ny: true, [z0 < 0 ? 'nz' : 'pz']: true, nx: i === 0, px: i === 1 } });
    brassStrip(S, [-2, 0.76, -0.01], [2, 0.902, 0.01], { py: true, px: true, nx: true });
  } },
  // turn 15 (round 5: the hanging terraces' undersides were flat white slabs): a coffered slab
  // for the inverted sanctuary, 8 m square and 1.2 m deep, read from below: a 3 x 3 grid of
  // coffers 2 m square between marble ribs 0.6 m deep, each stepping in once more round a
  // travertine molding 0.18 m wide and 0.24 m deep to its field; plain travertine on top. Its
  // butt edges are flat, so slabs laid edge to edge close.
  'coffer-8': { edge: 1024, build(S) {
    const SIDES = ['px', 'nx', 'pz', 'nz'], OPEN = [[-3.6, -1.6], [-1.0, 1.0], [1.6, 3.6]], RIB = [[-4, -3.6], [-1.6, -1.0], [1.0, 1.6], [3.6, 4]];
    S.push({ lo: [-4, -0.6, -4], hi: [4, 0, 4], c: STONE_C, kind: 'trav', dens: 0.12, flat: SIDES, exp: { py: true, ny: true, px: true, nx: true, pz: true, nz: true } });
    RIB.forEach(([x0, x1], i) => S.push({ lo: [x0, -1.2, -4], hi: [x1, -0.6, 4], c: TILE_C, kind: 'marble', dens: 0.25, flat: SIDES,
      exp: { ny: true, pz: true, nz: true, nx: true, px: true } }));
    for (const [z0, z1] of RIB) for (const [x0, x1] of OPEN) S.push({ lo: [x0, -1.2, z0], hi: [x1, -0.6, z1], c: TILE_C, kind: 'marble', dens: 0.25, flat: SIDES,
      exp: { ny: true, pz: z1 < 4, nz: z0 > -4 } });
    for (const [xa, xb] of OPEN) for (const [za, zb] of OPEN) {
      const m = 0.18, y0 = -0.84, y1 = -0.6;
      S.push({ lo: [xa, y0, za], hi: [xa + m, y1, zb], c: 0.01, kind: 'trav', dens: 0.19, exp: { ny: true, px: true } });
      S.push({ lo: [xb - m, y0, za], hi: [xb, y1, zb], c: 0.01, kind: 'trav', dens: 0.19, exp: { ny: true, nx: true } });
      S.push({ lo: [xa + m, y0, za], hi: [xb - m, y1, za + m], c: 0.01, kind: 'trav', dens: 0.19, exp: { ny: true, pz: true } });
      S.push({ lo: [xa + m, y0, zb - m], hi: [xb - m, y1, zb], c: 0.01, kind: 'trav', dens: 0.19, exp: { ny: true, nz: true } });
    }
  } },
  'foundation-4': { edge: 1024, build(S) {
    courses(S, 'pz', 0, -2, 2, 0, -16, 1.0, 2, 1.2, true);
    for (const st of S) if (st.hi[1] === 0) st.exp.py = true; // the top course is the arcade floor
    // turn 8: the plain shaft runs to -110, below the cloud deck (now 80 m down), to dissolve in it
    S.push({ lo: [-2, -110, -1.2], hi: [2, -16, 0], c: 0, kind: 'trav', dens: 0.05, exp: { pz: true, px: true, nx: true } });
  } },
};

async function build() {
  const root = createRoot(PIECE);
  const piece = PIECES[PIECE];
  const R = rng(hash(PIECE));
  const B = makeBuilder(), S0 = [];
  piece.build(S0, R, B);
  const S = splitStones(S0);
  seal(S);
  for (const st of S) emitStone(B, R, st);
  createPart(PIECE.replace(/-/g, '_'), B.geometry(), await stoneMaterial(piece.edge), { parent: root });
  return root;
}
