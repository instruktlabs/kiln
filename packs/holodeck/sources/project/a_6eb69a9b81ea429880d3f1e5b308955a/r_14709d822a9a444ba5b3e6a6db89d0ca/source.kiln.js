// Meridian Sanctuary architecture (plan.md sections 3 and 5, assets 14-20).
// One program builds every piece; PIECE selects which one this revision is. Each stone piece
// is one mesh with one material: an atlas of white veined marble, ivory travertine and a
// band of brass, warm-white glow and planting soil, with an emissive map for the glow.
// Masses are coursed, chamfered stones on a cell grid; arches are true round arches.
const meta = { name: 'Meridian architecture' };
const PIECE = 'orb';

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
function marbleSpec(q, seed, baseAng) {
  const s = q / 512, R = rng(seed), ops = [];
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0xe9e6e1, colorB: 0xfcfbf9, scale: 3, octaves: 4, seed },
    { op: 'noise', colorA: 0xd5d0c8, colorB: 0xf8f6f3, scale: 10, octaves: 2, seed: seed + 5, blend: 'overlay', opacity: 0.3 },
  ] } });
  for (let i = 0; i < 3; i++) {
    const x = -0.05 * q, y = ((i + 0.2 + R() * 0.6) * q) / 3, ang = baseAng + (R() - 0.5) * 0.3, vs = Math.floor(R() * 1e9);
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 6 * s + 1, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [205, 200, 193, 255], opacity: 35 });
    for (const p of veinPolys(rng(vs), x, y, ang, 31, q / 19, 1.4 * s + 0.6, 0.22)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [160, 153, 144, 255], opacity: 95 });
  }
  for (let i = 0; i < 6; i++) {
    const opacity = 45 + Math.floor(R() * 25);
    for (const p of veinPolys(R, R() * q, R() * q, baseAng + (R() - 0.5) * 0.9, 19, q / 30, 0.8 * s + 0.6, 0.5)) ops.push({ op: 'paint', shape: { kind: 'polygon', points: p }, rgba: [175, 169, 161, 255], opacity });
  }
  return { schemaVersion: 3, width: q, height: q, usage: 'albedo', operations: ops };
}
// band: null, or three RGBA colours for the brass, glow and soil columns of the band.
function travSpec(q, seed, band) {
  const s = q / 512, R = rng(seed), ops = [];
  ops.push({ op: 'legacy-v2', spec: { schemaVersion: 2, size: q, usage: 'albedo', layers: [
    { op: 'noise', colorA: 0xd8cbb3, colorB: 0xf1e9dc, scale: 4, octaves: 3, seed },
    { op: 'stripes', colorA: 0xdccfb8, colorB: 0xf0e8da, count: 18, angleDeg: 90, blend: 'overlay', opacity: 0.3 },
  ] } });
  for (let i = 0; i < 10; i++) {
    const y = Math.round(R() * q), dy = Math.round((R() - 0.5) * 8 * s), light = R() < 0.5;
    ops.push({ op: 'paint', shape: { kind: 'line', from: [-4, y], to: [q + 4, y + dy], width: Math.max(1, Math.round((1 + R() * 2) * s)) },
      rgba: light ? [246, 241, 232, 255] : [205, 191, 168, 255], opacity: 45 });
  }
  const pits = (w, h, rgba, count) => ops.push({ op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: Math.max(2, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) },
    rgba, count, seed: Math.floor(R() * 4e9), area: { x: 0, y: 0, width: q, height: q } });
  pits(3, 3, [174, 160, 136, 255], 140); // 256 stamps per texture in total
  pits(6, 3, [180, 166, 143, 255], 90);
  pits(10, 4, [160, 144, 118, 255], 26);
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
// Emissive map: black except the glow column, brighter in its middle so slots read as light.
function glowMap(n) {
  const [a, b] = BAND_COLS[1], x0 = Math.round(a * n), x1 = Math.round(b * n), y0 = n / 2, h = Math.round(BAND * n), w = x1 - x0;
  return proceduralTexture({ schemaVersion: 3, width: n, height: n, usage: 'emissive', background: [0, 0, 0, 255], operations: [
    { op: 'paint', shape: { kind: 'rectangle', x: x0, y: y0, width: w, height: h }, rgba: [238, 218, 190, 255] },
    { op: 'paint', shape: { kind: 'rectangle', x: x0 + Math.round(w * 0.22), y: y0, width: Math.round(w * 0.56), height: h }, rgba: [255, 245, 230, 255] },
  ] });
}
async function stoneMaterial(edge, glow) {
  const q = edge / 2, oq = edge / 8, grey = [128, 128, 128, 255];
  const albedo = await atlas(edge, 'albedo', [marbleSpec(q, 101, 0.55), marbleSpec(q, 202, -0.5), travSpec(q, 303, null),
    travSpec(q, 404, [[188, 148, 82, 255], [252, 244, 228, 255], [92, 74, 56, 255]])]);
  const flat = { schemaVersion: 3, width: q, height: q, usage: 'albedo', background: grey, operations: [] };
  const height = await atlas(edge, 'albedo', [flat, flat, travSpec(q, 303, null), travSpec(q, 404, [grey, grey, grey])]);
  const orm = await atlas(edge / 4, 'metallicRoughness', [ormSpec(oq, 0x20, 0x34, 5, false), ormSpec(oq, 0x22, 0x36, 6, false),
    ormSpec(oq, 0xae, 0xda, 7, false), ormSpec(oq, 0xb0, 0xdc, 8, true)]);
  const opts = { albedo, normal: normalMapFromHeight(height, { strength: 3 }), metallicRoughness: orm, roughness: 1, metalness: 1 };
  if (glow) Object.assign(opts, { emissive: glowMap(256), emissiveIntensity: glow });
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

const DENS = { marble: 0.25, trav: 0.19 };
function pickWindow(R, kind, fw, fh, dens, square) {
  if (kind === 'brass' || kind === 'glow' || kind === 'soil') {
    const [r0, s0, r1, s1] = REG[kind === 'brass' ? 'BR' : kind === 'glow' ? 'GL' : 'SO'];
    return { u0: r0, v0: s0, du: r1 - r0, dv: s1 - s0, rot: 0 };
  }
  const key = kind === 'marble' ? (R() < 0.5 ? 'MA' : 'MB') : (R() < 0.5 ? 'TA' : 'TB');
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
  const C = (i, s) => (s > 0 ? hi[i] : lo[i]);
  const V = (ax, sg) => [0, 1, 2].map((i) => (i === ax ? C(i, sg[i]) : C(i, sg[i]) - sg[i] * c));
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const f = fkey(ax, s); if (!exp[f]) continue;
    const [a1, a2] = [0, 1, 2].filter((i) => i !== ax);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => { const sg = [0, 0, 0]; sg[ax] = s; sg[a1] = p; sg[a2] = q; return V(ax, sg); });
    const n = [0, 0, 0]; n[ax] = s;
    emit(pts, n, [f]);
  }
  if (c <= 0) return;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const fa = fkey(a, sa), fb = fkey(b, sb); if (!exp[fa] && !exp[fb]) continue;
    const o = [0, 1, 2].find((i) => i !== a && i !== b);
    const sg = (so) => { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[o] = so; return g; };
    const n = [0, 0, 0]; n[a] = sa; n[b] = sb;
    emit([V(a, sg(-1)), V(a, sg(1)), V(b, sg(1)), V(b, sg(-1))], nrm(n), [fa, fb]);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const fs = [fkey(0, sx), fkey(1, sy), fkey(2, sz)]; if (!fs.some((f) => exp[f])) continue;
    const g = [sx, sy, sz];
    emit([V(0, g), V(1, g), V(2, g)], nrm(g), fs);
  }
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
      const exp = {}, faceKind = {};
      for (const [f, s] of Object.entries(nb)) {
        if (!isOpen(s)) continue;
        exp[f] = true;
        if (s.startsWith('slot')) faceKind[f] = s.slice(5) === f ? 'glow' : 'marble';
        else if (s === 'spout') faceKind[f] = 'marble';
      }
      if (!Object.keys(exp).length) continue;
      const kind = kindOf(xm, ym, zm, exp, faceKind);
      S.push({ lo: [xa, y0, za], hi: [xb, y1, zb], c: kind === 'marble' ? 0.006 : 0.012, kind, exp, faceKind });
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
// shifting alternate courses by half a stone for running bond.
function courses(S, ys, half, special, state, kindOf, len) {
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i], y1 = ys[i + 1], ym = (y0 + y1) / 2, [hx, hz] = half(ym), sp = special(ym), shift = i % 2 ? 0.5 : 0;
    course(S, y0, y1, cuts(-hx, hx, sp.x || [], len, shift), () => cuts(-hz, hz, sp.z || [], len, shift), state, kindOf);
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
    if (y > 9.0 && Math.abs(z) < 0.42) { fk.py = 'soil'; return 'trav'; }
    return y < 7.9 || y > 8.6 ? 'marble' : 'trav';
  };
  courses(S, [7.75, 7.9, 8.6, 8.75, 9.0, 9.33, 9.4], (y) => [2.4, hz(y)], (y) => ({ x: [0], z: y > 9.0 ? [-0.42, 0.42] : [] }), state, kindOf, 99);
}

// Arcade pier 1.2 m square to the impost at 5.0-5.2 m, on a marble plinth; the slot variant
// has a warm-white glowing slot on its court and outer faces.
function arcadePier(S, slot) {
  const half = (y) => (y < 0.35 ? 0.7 : y < 5.0 ? 0.6 : 0.68);
  const inSlot = (y) => slot && y > 1.125 && y < 4.225;
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (y > 5.2) return 'empty';
    const h = half(y);
    if (Math.abs(x) > h || Math.abs(z) > h) return 'empty';
    if (inSlot(y) && Math.abs(x) < 0.14 && Math.abs(z) > 0.48) return z > 0 ? 'slot:pz' : 'slot:nz';
    return 'solid';
  };
  courses(S, [0, 0.35, 1.125, 1.9, 2.675, 3.45, 4.225, 5.0, 5.2], (y) => [half(y), half(y)],
    (y) => (inSlot(y) ? { x: [-0.14, 0.14], z: [-0.48, 0.48] } : {}), state, (x, y) => (y < 0.35 || y > 5.0 ? 'marble' : 'trav'), 1.2);
}

// Pylon 1.8 m square and 12.6 m tall, proud of the arcade so it closes the arch modules'
// cornices and troughs: ends each arcade run and marks every terrace step, with marble bands
// at both impost levels and glowing slots on all faces.
function pylon(S) {
  const ys = [0, 0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.25, 5.967, 6.683, 7.4, 7.65, 8.44, 9.23, 10.02, 10.81, 11.6, 11.85, 12.05, 12.45, 12.6];
  const half = (y) => (y < 0.5 ? 1.0 : y < 5.0 ? 0.9 : y < 5.25 ? 0.96 : y < 7.4 ? 0.9 : y < 7.65 ? 0.96 : y < 11.6 ? 0.9 : y < 11.85 ? 1.02 : y < 12.05 ? 1.1 : y < 12.45 ? 0.75 : 0.8);
  const inSlot = (y) => (y > 1.4 && y < 4.1) || (y > 8.44 && y < 11.6);
  const marble = (y) => y < 0.5 || (y > 5.0 && y < 5.25) || (y > 7.4 && y < 7.65) || (y > 11.6 && y < 12.05) || y > 12.45;
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (y > 12.6) return 'empty';
    const h = half(y), ax = Math.abs(x), az = Math.abs(z);
    if (ax > h || az > h) return 'empty';
    if (inSlot(y) && ax < 0.15 && az > h - 0.15) return z > 0 ? 'slot:pz' : 'slot:nz';
    if (inSlot(y) && az < 0.15 && ax > h - 0.15) return x > 0 ? 'slot:px' : 'slot:nx';
    return 'solid';
  };
  courses(S, ys, (y) => [half(y), half(y)], (y) => (inSlot(y) ? { x: [-0.15, 0.15, -0.75, 0.75], z: [-0.15, 0.15, -0.75, 0.75] } : {}),
    state, (x, y) => (marble(y) ? 'marble' : 'trav'), 1.8);
}

// Rim tower 4 m square rising 24 m above its terrace, with a plain shaft dissolving into the
// cloud below, marble bands and cornice, and tall glowing slots on all four faces.
function tower(S) {
  const ys = [-0.6, 0.4, 1.6, 2.8, 4.0, 5.2, 6.4, 7.6, 7.85, 9.05, 10.25, 11.45, 12.65, 13.85, 15.05, 15.3, 16.5, 17.7, 18.9, 20.1, 21.3, 21.6, 21.9, 22.65, 23.4, 23.7, 24.0];
  const half = (y) => (y < 0.4 ? 2.12 : y < 7.6 ? 2.0 : y < 7.85 ? 2.08 : y < 15.05 ? 2.0 : y < 15.3 ? 2.08 : y < 21.3 ? 2.0 : y < 21.6 ? 2.15 : y < 21.9 ? 2.3 : y < 23.4 ? 1.85 : y < 23.7 ? 1.95 : 1.2);
  const inSlot = (y) => (y > 1.6 && y < 7.6) || (y > 9.05 && y < 15.05);
  const marble = (y) => y < 0.4 || (y > 7.6 && y < 7.85) || (y > 15.05 && y < 15.3) || (y > 21.3 && y < 21.9) || y > 23.4;
  const state = (x, y, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    if (y < -0.6) return ax <= 1.9 && az <= 1.9 ? 'phantom' : 'empty';
    if (y > 24) return 'empty';
    const h = half(y);
    if (ax > h || az > h) return 'empty';
    if (inSlot(y) && ax < 0.25 && az > h - 0.25) return z > 0 ? 'slot:pz' : 'slot:nz';
    if (inSlot(y) && az < 0.25 && ax > h - 0.25) return x > 0 ? 'slot:px' : 'slot:nx';
    return 'solid';
  };
  courses(S, ys, (y) => [half(y), half(y)], (y) => (inSlot(y) ? { x: [-0.25, 0.25, -1.75, 1.75], z: [-0.25, 0.25, -1.75, 1.75] } : {}),
    state, (x, y) => (marble(y) ? 'marble' : 'trav'), 2.0);
  S.push({ lo: [-1.9, -32, -1.9], hi: [1.9, -0.6, 1.9], c: 0, kind: 'trav', dens: 0.04, exp: { px: true, nx: true, pz: true, nz: true } });
}

// Cascade tower 4 m square and 6.4 m tall standing against a terrace wall (-Z), with a recessed
// spout for the waterfall on its +Z face and a marble-rimmed planting top.
function cascade(S) {
  const half = (y) => (y < 0.6 ? 2.08 : y < 5.4 ? 2.0 : y < 5.6 ? 2.1 : 2.0);
  const state = (x, y, z) => {
    if (y < 0 || z < -2.0) return 'phantom';
    if (y > 6.4) return 'empty';
    const h = half(y), ax = Math.abs(x);
    if (ax > h || z > h) return 'empty';
    if (y > 4.2 && y < 5.4 && ax < 0.9 && z > 1.65) return 'spout';
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

// The gateway: 22 x 10 x 52 m above its threshold (front at +Z). A round arch 8 m wide
// (springing at 12.5 m) behind three stepped marble orders and a voussoir archivolt, a passage
// vault that glows warm white between marble ribs, glowing slots in the piers, an arched upper
// window 5 m wide open to the sky, ivy troughs at 14 m and 24 m, and a stepped cornice and attic.
function gateway(S, R, B) {
  const YS = 12.5, ys = [0, 0.6];
  for (let i = 1; i <= 10; i++) ys.push(+(0.6 + i * 1.14).toFixed(3));
  for (let i = 0; i <= 8; i++) ys.push(12.5 + i);
  ys.push(21.1, 22.325, 23.55, 24.775);
  for (let i = 0; i <= 10; i++) ys.push(+(26 + i * 1.15).toFixed(3));
  for (let i = 1; i <= 8; i++) ys.push(+(37.5 + i * 1.1875).toFixed(4));
  ys.push(47.45, 47.9, 48.4, 49.5, 50.6, 51.0, 52.6, 54.2, 54.6, 55.2);
  // Above the cornice the centre stops at a coped attic (51 m) while the two piers rise as
  // towers to planted tops at 55.2 m.
  const half = (y) => (y < 0.6 ? [11.12, 5.12] : y < 12.0 ? [11, 5] : y < 12.5 ? [11.2, 5.2] : y < 20.5 ? [11, 5] : y < 21.1 ? [11.25, 5.25]
    : y < 47.0 ? [11, 5] : y < 47.45 ? [11.3, 5.3] : y < 47.9 ? [11.55, 5.55] : y < 48.4 ? [11.8, 5.8] : y < 50.6 ? [10.75, 4.75]
    : y < 51.0 ? [10.75, 4.85] : y < 54.2 ? [10.75, 4.75] : y < 54.6 ? [10.9, 4.9] : [10.6, 4.6]);
  const top = (ax, az, y) => { // the towers and planted tops above 50.6 m
    if (y < 51.0) return ax < 6.2 ? az <= 4.85 : az <= 4.75;
    if (y < 54.2) return ax >= 6.2 && az <= 4.75;
    if (y < 54.6) return ax >= 6.05 && az <= 4.9;
    return ax >= 6.35 && az <= 4.6 && !(ax > 6.7 && ax < 10.25 && az < 4.25);
  };
  const open = (az) => (az > 4.4 ? 5.6 : az > 3.8 ? 5.0 : az > 3.2 ? 4.4 : 4.0);
  const lowSlot = (y) => y > 2.88 && y < 10.86, upSlot = (y) => y > 28.3 && y < 35.2;
  const state = (x, y, z) => {
    if (y < 0) return 'phantom';
    if (y > 55.2) return 'empty';
    const [hx, hz] = half(y), ax = Math.abs(x), az = Math.abs(z);
    if (ax > hx || az > hz) return 'empty';
    if (y < YS) {
      if (ax < open(az)) return 'empty';
      if (lowSlot(y) && az > 4.75 && ax > 8.05 && ax < 8.55) return z > 0 ? 'slot:pz' : 'slot:nz';
      if (lowSlot(y) && ax > 10.75 && az < 0.25) return x > 0 ? 'slot:px' : 'slot:nx';
      return 'solid';
    }
    if (y < 20.5) return ax < 7.0 ? 'phantom' : 'solid';
    if (y > 50.6) return top(ax, az, y) ? 'solid' : 'empty';
    if (y > 21.1 && y < 47.0 && ax < 6.2 && az > 4.4) return 'empty'; // recessed centre bay
    if (y > 26 && y < 37.5 && ax < (az > 3.8 ? 3.1 : 2.5)) return 'empty';
    if (y > 37.5 && y < 41.0625 && ax < 4.0) return 'phantom';
    if (upSlot(y) && az > 4.75 && ax > 8.05 && ax < 8.55) return z > 0 ? 'slot:pz' : 'slot:nz';
    return 'solid';
  };
  const marbleY = (y) => y < 0.6 || (y > 12.0 && y < 12.5) || (y > 20.5 && y < 21.1) || (y > 47.0 && y < 48.4) || y > 54.2;
  const kindOf = (x, y, z, exp, fk) => {
    const ax = Math.abs(x);
    if (y > 54.2 && y < 54.6 && ax > 6.7 && ax < 10.25 && Math.abs(z) < 4.25) { fk.py = 'soil'; return 'marble'; }
    if (marbleY(y) || (y > 50.6 && y < 51.0 && ax < 6.2) || (y < YS && ax < 6.2) || (y > 24.775 && y < 41.0625 && ax < 3.6)) return 'marble';
    return 'trav';
  };
  const special = (y) => {
    const x = [], z = [];
    if (y < YS) { x.push(4.0, 4.4, 5.0, 5.6, 6.2); if (lowSlot(y)) x.push(8.05, 8.55, 10.75); }
    else if (y < 20.5) x.push(7.0);
    else if (y < 47) { x.push(2.5, 3.1, 3.6, 4.0, 6.2); if (upSlot(y)) x.push(8.05, 8.55); }
    else if (y > 50.6) x.push(6.05, 6.2, 6.35, 6.7, 10.25);
    return { x: x.flatMap((v) => [-v, v]), z };
  };
  const zCutsFor = (y, shift) => (xa, xb) => {
    const [, hz] = half(y), xm = Math.abs((xa + xb) / 2), z = [];
    if (y < YS && xm < 6.2) z.push(3.2, 3.8, 4.4);
    if ((lowSlot(y) || upSlot(y)) && xm > 8.05 && xm < 8.55) z.push(4.75);
    if (lowSlot(y) && xm > 10.75) z.push(0.25);
    if (y > 21.1 && y < 47 && xm < 6.2) z.push(4.4);
    if (y > 24.775 && y < 41.0625 && xm < 4.0) z.push(3.8);
    if (y > 50.6) z.push(4.25, 4.6, 4.75);
    return cuts(-hz, hz, z.flatMap((v) => [-v, v]), 2.2, shift);
  };
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i], y1 = ys[i + 1], ym = (y0 + y1) / 2, [hx] = half(ym);
    course(S, y0, y1, cuts(-hx, hx, special(ym).x, 2.0, i % 2 ? 0.5 : 0), zCutsFor(ym, i % 2 ? 0.5 : 0), state, kindOf);
  }

  for (const nz of [1, -1]) {
    // main arch: spandrels, voussoir archivolt, three stepped orders and their bands
    spandrels(B, R, { cx: 0, ys: YS, r: 5.6, x0: -7, x1: 7, yt: 20.5, zf: 5 * nz, nz, n: 16, dens: 0.06 });
    voussoirs(B, R, { cx: 0, ys: YS, r0: 5.6, r1: 6.3, zf: 5 * nz, nz, p: 0.18, k: 23, key: { dr: 0.45, dp: 0.14 } });
    for (const [r0, r1, zf, k] of [[5.0, 5.6, 4.4, 19], [4.4, 5.0, 3.8, 17], [4.0, 4.4, 3.2, 15]]) {
      ringFace(B, R, { cx: 0, ys: YS, r0, r1, zf: zf * nz, nz, n: 38, k });
      band(B, R, { cx: 0, ys: YS, r: r1, z0: zf * nz, z1: (zf + 0.6) * nz, n: 38, k: 5 });
    }
    // upper window in the recessed bay: spandrels, archivolt, one stepped order
    spandrels(B, R, { cx: 0, ys: 37.5, r: 3.1, x0: -4, x1: 4, yt: 41.0625, zf: 4.4 * nz, nz, n: 12, dens: 0.12 });
    voussoirs(B, R, { cx: 0, ys: 37.5, r0: 3.1, r1: 3.4, zf: 4.4 * nz, nz, p: 0.12, k: 15, key: { dr: 0.12, dp: 0.08 } });
    ringFace(B, R, { cx: 0, ys: 37.5, r0: 2.5, r1: 3.1, zf: 3.8 * nz, nz, n: 22, k: 11 });
    band(B, R, { cx: 0, ys: 37.5, r: 3.1, z0: 3.8 * nz, z1: 4.4 * nz, n: 22, k: 3 });
    // ivy troughs on the pier faces at 14 m and 24 m
    for (const sx of [1, -1]) for (const yb of [13.4, 23.45]) {
      const x0 = sx > 0 ? 7.4 : -10.6, x1 = x0 + 3.2, f = nz > 0 ? 'pz' : 'nz', w = nz > 0 ? 'nz' : 'pz';
      const zr = (a, b) => (nz > 0 ? [a, b] : [-b, -a]);
      const [s0, s1] = zr(5, 5.6), [r0, r1] = zr(5.42, 5.6), [i0, i1] = zr(5, 5.42);
      S.push({ lo: [x0, yb, s0], hi: [x1, yb + 0.2, s1], c: 0.006, kind: 'marble', exp: { ny: true, [f]: true, px: true, nx: true } });
      S.push({ lo: [x0, yb + 0.2, r0], hi: [x1, yb + 0.65, r1], c: 0.006, kind: 'marble', exp: { py: true, [f]: true, [w]: true, px: true, nx: true } });
      for (const [e0, e1] of [[x0, x0 + 0.18], [x1 - 0.18, x1]]) {
        S.push({ lo: [e0, yb + 0.2, i0], hi: [e1, yb + 0.65, i1], c: 0.006, kind: 'marble', exp: { py: true, px: true, nx: true } });
      }
      S.push({ lo: [x0 + 0.18, yb + 0.2, i0], hi: [x1 - 0.18, yb + 0.58, i1], c: 0, kind: 'soil', exp: { py: true } });
    }
  }
  // passage vault: warm-white glowing panels between three marble ribs
  const ribs = [-1.6, 0, 1.6], cuts3 = [-3.2, ...ribs.flatMap((zr) => [zr - 0.18, zr + 0.18]), 3.2];
  for (let i = 0; i + 1 < cuts3.length; i += 2) band(B, R, { cx: 0, ys: YS, r: 4.0, z0: cuts3[i], z1: cuts3[i + 1], n: 40, kind: 'glow' });
  for (const zr of ribs) {
    band(B, R, { cx: 0, ys: YS, r: 3.85, z0: zr - 0.18, z1: zr + 0.18, n: 40, k: 9 });
    for (const sg of [-1, 1]) ringFace(B, R, { cx: 0, ys: YS, r0: 3.85, r1: 4.0, zf: zr + 0.18 * sg, nz: sg, n: 40, k: 9 });
  }
  band(B, R, { cx: 0, ys: 37.5, r: 2.5, z0: -3.8, z1: 3.8, n: 22, k: 4 }); // upper window soffit
}

// Review only (never saved): three arches on their piers between two pylons, in one mesh.
function previewArcade(S, R, B) {
  const put = (fn, dx) => {
    const S2 = [], shift = (v) => [v[0] + dx, v[1], v[2]];
    fn(S2, R, { poly: (v, n, uv) => B.poly(v.map(shift), n, uv), polyN: (v, ns, uv) => B.polyN(v.map(shift), ns, uv) });
    for (const st of S2) S.push({ ...st, lo: shift(st.lo), hi: shift(st.hi) });
  };
  for (const dx of [-4.8, 0, 4.8]) put((S2, R2, B2) => arcadeArch(S2, R2, B2), dx);
  put((S2) => arcadePier(S2, true), -2.4);
  put((S2) => arcadePier(S2, false), 2.4);
  for (const dx of [-7.2, 7.2]) put((S2) => pylon(S2), dx);
}

const PIECES = {
  'preview-arcade': { glow: 4, build: previewArcade },
  'arcade-arch': { glow: 0, build: arcadeArch },
  'arcade-pier': { glow: 0, build: (S) => arcadePier(S, false) },
  'arcade-pier-slot': { glow: 4, build: (S) => arcadePier(S, true) },
  'arcade-pylon': { glow: 4, build: pylon },
  'tower-slot': { glow: 4, build: tower },
  'cascade-tower': { glow: 0, build: cascade },
  'gateway': { glow: 4, build: gateway },
};

async function build() {
  const root = createRoot(PIECE);
  if (PIECE === 'orb') { // a true mirror: white metal, roughness 0.02, smooth normals
    const white = proceduralTexture({ schemaVersion: 2, size: 4, usage: 'albedo', layers: [{ op: 'solid', color: 0xf2f4f6 }] });
    createPart('orb', sphereGeo(2.25, 96, 64), pbrMaterial({ albedo: white, roughness: 0.02, metalness: 1 }), { parent: root });
    return root;
  }
  const piece = PIECES[PIECE], R = rng(hash(PIECE)), B = makeBuilder(), S = [];
  piece.build(S, R, B);
  for (const st of S) emitStone(B, R, st);
  createPart(PIECE.replace(/-/g, '_'), B.geometry(), await stoneMaterial(1024, piece.glow), { parent: root });
  return root;
}
