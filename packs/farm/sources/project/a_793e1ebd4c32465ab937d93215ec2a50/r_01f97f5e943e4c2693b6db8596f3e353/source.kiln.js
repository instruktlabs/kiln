// Farmhouse — cream masonry, charcoal roof, front dormer, gable chimney, olive shutters,
// honey-wood covered porch and steps. Metres; +X front, +Y up, +Z right; body centred on origin.
const meta = { name: 'Farmhouse', role: 'building' };

const P = {
  halfX: 3.0, halfZ: 4.0, wallT: 0.3, floorY: 0.4, eaveY: 3.6, pitchDeg: 40,
  roofT: 0.18, eaveOver: 0.35, gableOver: 0.35,
  doorHalfW: 0.5, doorTop: 2.55, winY0: 1.15, winY1: 2.45, shutterW: 0.55,
  porchX: 5.0, porchHalfZ: 3.45, postX: 4.8, postZ: [-3.3, -0.95, 0.95, 3.3],
  porchLedgerY: 3.3, porchSlope: 0.2, porchRoofT: 0.12, porchRoofX: 5.25,
  beamTop: 2.80, beamD: 0.18, stepHalfZ: 0.8,
};
const TH = P.pitchDeg * Math.PI / 180;
const K = Math.tan(TH);
const RIDGE_Y = P.eaveY + P.halfX * K; // roof underside at ridge
// Stripe-based wood maps run grain lines along texture V; set false if review shows cross grain.
const WOOD_GRAIN_ALONG_V = true;

const MAT = {
  masonry: { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Farm cream masonry (restrained blocks)', baseColor: 16777215, roughness: 1, metalness: 0, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: { baseColor: { kind: 'resource', resourceId: 'kiln.library.d1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6.base-color' }, normal: { kind: 'resource', resourceId: 'kiln.library.d1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6.normal' }, metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.d1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6.metallic-roughness' } } },
  roof: { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Farm charcoal roof shingles', baseColor: 16777215, roughness: 1, metalness: 0, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: { baseColor: { kind: 'resource', resourceId: 'kiln.library.ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85.base-color' }, normal: { kind: 'resource', resourceId: 'kiln.library.ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85.normal' }, metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85.metallic-roughness' } } },
  wood: { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Farm honey wood (subdued grain derivative)', baseColor: 16777215, roughness: 1, metalness: 0, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: { baseColor: { kind: 'resource', resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.base-color' }, normal: { kind: 'resource', resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.normal' }, metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.metallic-roughness' } } },
  metal: { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal', roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: { baseColor: { kind: 'resource', resourceId: 'kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.base-color' }, normal: { kind: 'resource', resourceId: 'kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.normal' }, metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.metallic-roughness' } } },
};
const plain = (name, baseColor, roughness, metalness = 0) =>
  ({ schemaVersion: 2, model: 'pbrMetallicRoughness', name, baseColor, roughness, metalness });

// ---------- small vector helpers ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
function newell(vs) {
  const n = [0, 0, 0];
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm(n);
}

// ---------- per-material mesh builder with metre-scaled UVs ----------
// tile = physical texture repeat in metres; grain = member direction mapped to U (or V for wood).
function MB(tile, grainAlongV = false) {
  const bld = { tile, gv: grainAlongV, pos: [], nor: [], uv: [], idx: [] };
  bld.face = (vs, inside, grain) => {
    let n = newell(vs);
    if (dot(n, sub(vs[0], inside)) < 0) { vs = vs.slice().reverse(); n = mul(n, -1); }
    let g = sub(grain, mul(n, dot(grain, n)));
    if (len(g) < 0.3) g = Math.abs(n[1]) < 0.9 ? cross([0, 1, 0], n) : [1, 0, 0];
    g = norm(g);
    let u, v;
    if (bld.gv) { v = g; u = cross(v, n); }
    else { u = g; v = cross(n, u); if (Math.abs(n[1]) < 0.9 && v[1] < 0) { u = mul(u, -1); v = mul(v, -1); } }
    const base = bld.pos.length / 3;
    for (const p of vs) { bld.pos.push(...p); bld.nor.push(...n); bld.uv.push(dot(p, u) / bld.tile, dot(p, v) / bld.tile); }
    for (let i = 1; i < vs.length - 1; i++) bld.idx.push(base, base + i, base + i + 1);
  };
  bld.obox = (c, ex, ey, ez, hx, hy, hz, grain) => {
    const C = (i, j, k) => add(add(add(c, mul(ex, i ? hx : -hx)), mul(ey, j ? hy : -hy)), mul(ez, k ? hz : -hz));
    const g = grain || (hx >= hy && hx >= hz ? ex : hy >= hz ? ey : ez);
    const F = [
      [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ];
    for (const f of F) bld.face(f.map(([i, j, k]) => C(i, j, k)), c, g);
  };
  bld.aabb = (x0, x1, y0, y1, z0, z1, grain) => {
    bld.obox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1],
      (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, grain);
  };
  // convex polygon pts [a,b] mapped by map(a,b,d) and extruded d0..d1
  bld.prism = (pts, map, d0, d1, grain) => {
    const c0 = pts.map(([a, b]) => map(a, b, d0)), c1 = pts.map(([a, b]) => map(a, b, d1));
    const all = c0.concat(c1);
    const inside = mul(all.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / all.length);
    bld.face(c0, inside, grain); bld.face(c1, inside, grain);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      bld.face([c0[i], c0[j], c1[j], c1[i]], inside, grain);
    }
  };
  bld.strut = (a, b, w, h, side, ext = 0.03) => {
    const d = norm(sub(b, a));
    const ey = norm(cross(d, side)), ez = cross(d, ey);
    bld.obox(mul(add(a, b), 0.5), d, ey, ez, len(sub(b, a)) / 2 + ext, h / 2, w / 2, d);
  };
  bld.geo = () => meshGeo({ positions: bld.pos, normals: bld.nor, uvs: bld.uv, indices: bld.idx });
  return bld;
}

// Solid wall split into blocks around real openings. axis 'x': wall faces ±X and runs along Z.
function wall(mb, axis, t0, t1, s0, s1, y0, y1, holes) {
  const cuts = [...new Set([s0, s1, ...holes.flatMap((h) => [h.s0, h.s1])])].sort((a, b) => a - b);
  const emit = (a, b, ya, yb) => axis === 'x'
    ? mb.aabb(t0, t1, ya, yb, a, b, [0, 0, 1]) : mb.aabb(a, b, ya, yb, t0, t1, [1, 0, 0]);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 1e-6) continue;
    const hs = holes.filter((h) => h.s0 <= a + 1e-6 && h.s1 >= b - 1e-6).sort((p, q) => p.y0 - q.y0);
    let y = y0;
    for (const h of hs) { if (h.y0 > y + 1e-6) emit(a, b, y, h.y0); y = Math.max(y, h.y1); }
    if (y1 > y + 1e-6) emit(a, b, y, y1);
  }
}

async function build() {
  const root = createRoot('Farmhouse');
  const M = {
    masonry: await compilePortableMaterialSpecV2({ ...MAT.masonry, baseColor: 0xeadcbf }),
    stone: await compilePortableMaterialSpecV2({ ...MAT.masonry, name: 'Farm stone (masonry maps, stone tint)', baseColor: 0xaea796 }),
    roof: await compilePortableMaterialSpecV2({ ...MAT.roof, baseColor: 0x8c8c8c }),
    wood: await compilePortableMaterialSpecV2({ ...MAT.wood, baseColor: 0xdcae78 }),
    metal: await compilePortableMaterialSpecV2({ ...MAT.metal, name: 'Hinge iron (brushed metal, dark tint)', baseColor: 0x8a8c88 }),
    trim: await compilePortableMaterialSpecV2(plain('Painted cream trim', 0xe6dcc6, 0.8)),
    olive: await compilePortableMaterialSpecV2(plain('Olive shutter paint', 0x55622e, 0.72)),
    red: await compilePortableMaterialSpecV2(plain('Painted red door', 0x9f3f2b, 0.68)),
    // Clear, lightly tinted glazing: portable core-glTF alpha BLEND (no transmission extension).
    // Single-sided on closed pane boxes so each view crosses exactly one glazed face.
    glass: await materialRecipe('kiln.material.glass.v1', { baseColor: '#a9cdd4', roughness: 0.05, opacity: 0.14, doubleSided: false }),
    dark: await compilePortableMaterialSpecV2(plain('Flue soot', 0x1c1a18, 1)),
  };
  const B = {
    masonry: MB(2), stone: MB(3), trim: MB(1), glass: MB(1), dark: MB(1),
    roof: MB(1), porchWood: MB(1, WOOD_GRAIN_ALONG_V), porchStone: MB(3), porchRoof: MB(1),
    steps: MB(1, WOOD_GRAIN_ALONG_V), olive: MB(1), hinge: MB(1),
    doorRed: MB(1), doorMetal: MB(1), ceiling: MB(1),
    floor: MB(1, WOOD_GRAIN_ALONG_V),
  };
  const { halfX: HX, halfZ: HZ, wallT: WT, floorY: FY, eaveY: E } = P;
  const ix = HX - WT, iz = HZ - WT;

  // ---------- window unit: frame, glass, sill, lintel, optional shutters with strap hinges ----------
  function windowUnit(o) {
    const P3 = (s, y, d) => (o.axis === 'x' ? [o.face - o.out * d, y, s] : [s, y, o.face - o.out * d]);
    const box = (mb, s0, s1, y0, y1, d0, d1, grain) => {
      const a = P3(s0, y0, d0), b = P3(s1, y1, d1);
      mb.aabb(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]),
        Math.min(a[2], b[2]), Math.max(a[2], b[2]), grain);
    };
    const { s0, s1, y0, y1 } = o, f = 0.06;
    box(B.glass, s0 + f, s1 - f, y0 + f, y1 - f, 0.15, 0.17);
    box(B.trim, s0, s1, y0, y0 + f, 0.08, 0.2); box(B.trim, s0, s1, y1 - f, y1, 0.08, 0.2);
    box(B.trim, s0, s0 + f, y0 + f, y1 - f, 0.08, 0.2); box(B.trim, s1 - f, s1, y0 + f, y1 - f, 0.08, 0.2);
    const sm = (s0 + s1) / 2, ym = y0 + (y1 - y0) * 0.58;
    box(B.trim, sm - 0.02, sm + 0.02, y0 + f, y1 - f, 0.12, 0.15);
    box(B.trim, s0 + f, s1 - f, ym - 0.02, ym + 0.02, 0.12, 0.15);
    box(B.stone, s0 - 0.07, s1 + 0.07, y0 - 0.06, y0 + 0.02, -0.07, 0.08);
    box(B.stone, s0 - 0.12, s1 + 0.12, y1 + 0.001, y1 + 0.16, -0.03, 0.1);
    if (!o.shutters) return;
    const w = o.shutterW || P.shutterW;
    for (const side of [-1, 1]) {
      const inner = side < 0 ? s0 - 0.04 : s1 + 0.04, outer = inner + side * w;
      const a = Math.min(inner, outer), b = Math.max(inner, outer);
      box(B.olive, a, b, y0, y1, -0.045, 0);
      for (const yb of [y0 + 0.16, y1 - 0.16]) {
        box(B.olive, a + 0.03, b - 0.03, yb - 0.045, yb + 0.045, -0.065, -0.045);
        const strapEnd = inner + side * 0.32;
        box(B.hinge, Math.min(inner - side * 0.03, strapEnd), Math.max(inner - side * 0.03, strapEnd), yb - 0.02, yb + 0.02, -0.075, -0.064);
        box(B.hinge, Math.min(inner, inner - side * 0.035), Math.max(inner, inner - side * 0.035), yb - 0.03, yb + 0.03, -0.078, 0);
      }
    }
  }

  // ---------- Shell: foundation, walls with real openings, gables, dormer walls, chimney ----------
  // Perimeter stone foundation under walls; exterior plinth and seating preserved exactly
  B.stone.aabb(ix, HX + 0.08, 0, FY, -HZ - 0.08, HZ + 0.08);
  B.stone.aabb(-HX - 0.08, -ix, 0, FY, -HZ - 0.08, HZ + 0.08);
  B.stone.aabb(-ix, ix, 0, FY, -HZ - 0.08, -iz);
  B.stone.aabb(-ix, ix, 0, FY, iz, HZ + 0.08);
  // Main room wooden plank floor spanning interior between walls
  B.floor.aabb(-ix, ix, 0, FY - 0.02, -iz, iz, [0, 0, 1]);
  const numBoards = 18, boardW = (2 * ix) / numBoards;
  for (let i = 0; i < numBoards; i++) {
    const xa = i === 0 ? -ix : -ix + i * boardW + 0.002;
    const xb = i === numBoards - 1 ? ix : -ix + (i + 1) * boardW - 0.002;
    B.floor.aabb(xa, xb, FY - 0.02, FY, -iz, iz, [0, 0, 1]);
  }
  const frontWins = [-2.0, 2.0].map((c) => ({ s0: c - 0.55, s1: c + 0.55, y0: P.winY0, y1: P.winY1 }));
  const door = { s0: -P.doorHalfW, s1: P.doorHalfW, y0: FY, y1: P.doorTop };
  wall(B.masonry, 'x', HX - WT, HX, -HZ + WT, HZ - WT, FY, E, [door, ...frontWins]);
  wall(B.masonry, 'x', -HX, -HX + WT, -HZ + WT, HZ - WT, FY, E, frontWins);
  for (const w of frontWins) {
    windowUnit({ axis: 'x', out: 1, face: HX, ...w, shutters: true });
    windowUnit({ axis: 'x', out: -1, face: -HX, ...w, shutters: true });
  }
  const sideWin = { '1': { s0: -0.55, s1: 0.55 }, '-1': { s0: 0.35, s1: 1.45 } };
  const gableWin = { s0: -0.4, s1: 0.4, y0: 4.1, y1: 4.9 };
  for (const sz of [1, -1]) {
    const t0 = sz > 0 ? HZ - WT : -HZ, t1 = sz > 0 ? HZ : -HZ + WT;
    const sw = { ...sideWin[String(sz)], y0: P.winY0, y1: P.winY1 };
    wall(B.masonry, 'z', t0, t1, -HX, HX, FY, E, [sw]);
    windowUnit({ axis: 'z', out: sz, face: sz * HZ, ...sw, shutters: true });
    // gable above the eave, meeting the roof underside, with a real gable window
    const map = (a, b, d) => [a, b, d];
    const yAt = (x) => E + (HX - Math.abs(x)) * K;
    B.masonry.prism([[-HX, E], [-0.4, E], [-0.4, yAt(-0.4)]], map, t0, t1, [1, 0, 0]);
    B.masonry.prism([[0.4, E], [HX, E], [0.4, yAt(0.4)]], map, t0, t1, [1, 0, 0]);
    B.masonry.aabb(-0.4, 0.4, E, gableWin.y0, t0, t1, [1, 0, 0]);
    B.masonry.prism([[-0.4, gableWin.y1], [0.4, gableWin.y1], [0.4, yAt(0.4)], [0, RIDGE_Y], [-0.4, yAt(-0.4)]], map, t0, t1, [1, 0, 0]);
    windowUnit({ axis: 'z', out: sz, face: sz * HZ, ...gableWin, shutters: false });
  }
  // Front dormer walls (roof part in Roof assembly)
  const D = { x0: 2.15, x1: 2.3, hz: 0.9, y0: 4.0, eave: 5.25, win: { s0: -0.4, s1: 0.4, y0: 4.55, y1: 5.05 } };
  const dormerPeak = D.eave + D.hz * K;
  wall(B.masonry, 'x', D.x0, D.x1, -D.hz, D.hz, D.y0, D.eave, [D.win]);
  B.masonry.prism([[-D.hz, D.eave], [D.hz, D.eave], [0, dormerPeak]], (a, b, d) => [d, b, a], D.x0, D.x1, [0, 0, 1]);
  B.masonry.aabb(0.8, D.x0, D.y0, D.eave, D.hz - 0.15, D.hz, [1, 0, 0]);
  B.masonry.aabb(0.8, D.x0, D.y0, D.eave, -D.hz, -D.hz + 0.15, [1, 0, 0]);
  windowUnit({ axis: 'x', out: 1, face: D.x1, ...D.win, shutters: true, shutterW: 0.38 });
  // Finished interior ceiling: one continuous solid slab seated 0.05 m into all four walls
  // (hides roof/dormer construction), with a plain cornice strip closing each wall join.
  const CEIL = { y: 3.2, t: 0.1, cornice: 0.07 };
  const cy = CEIL.y, cc = CEIL.cornice;
  B.ceiling.aabb(-ix - 0.05, ix + 0.05, cy, cy + CEIL.t, -iz - 0.05, iz + 0.05, [0, 0, 1]);
  B.ceiling.aabb(ix - cc, ix, cy - cc, cy, -iz, iz, [0, 0, 1]);
  B.ceiling.aabb(-ix, -ix + cc, cy - cc, cy, -iz, iz, [0, 0, 1]);
  B.ceiling.aabb(-ix + cc, ix - cc, cy - cc, cy, iz - cc, iz, [1, 0, 0]);
  B.ceiling.aabb(-ix + cc, ix - cc, cy - cc, cy, -iz, -iz + cc, [1, 0, 0]);
  // Door surround
  B.trim.aabb(HX, HX + 0.04, FY, P.doorTop, -0.64, -0.5); B.trim.aabb(HX, HX + 0.04, FY, P.doorTop, 0.5, 0.64);
  B.trim.aabb(HX, HX + 0.05, P.doorTop, P.doorTop + 0.16, -0.66, 0.66);
  // Gable-end stone chimney on -Z with a real hollow flue crown
  const ch = { x0: -2.1, x1: -1.1, z0: -4.65, z1: -HZ, sx0: -1.95, sx1: -1.25, sz0: -4.55, top: 6.85 };
  B.stone.aabb(ch.x0, ch.x1, 0, 3.4, ch.z0, ch.z1);
  B.stone.prism([[ch.x0, 3.4], [ch.x1, 3.4], [ch.sx1, 3.8], [ch.sx0, 3.8]], (a, b, d) => [a, b, d], ch.z0, ch.z1, [1, 0, 0]);
  B.stone.aabb(ch.sx0, ch.sx1, 3.8, ch.top, ch.sz0, ch.z1);
  const fx = -1.6, fz = (ch.sz0 + ch.z1) / 2, fh = 0.15, cy0 = ch.top, cy1 = ch.top + 0.12;
  B.stone.aabb(ch.sx0 - 0.05, ch.sx1 + 0.05, cy0, cy1, ch.sz0 - 0.05, fz - fh);
  B.stone.aabb(ch.sx0 - 0.05, ch.sx1 + 0.05, cy0, cy1, fz + fh, ch.z1 + 0.05);
  B.stone.aabb(ch.sx0 - 0.05, fx - fh, cy0, cy1, fz - fh, fz + fh);
  B.stone.aabb(fx + fh, ch.sx1 + 0.05, cy0, cy1, fz - fh, fz + fh);
  B.dark.aabb(fx - fh, fx + fh, cy0, cy0 + 0.02, fz - fh, fz + fh);

  // ---------- Roof: two slabs meeting under a ridge cap, dormer gable roof ----------
  const c = Math.cos(TH), s = Math.sin(TH), T = P.roofT;
  for (const sx of [1, -1]) {
    const eu = [sx * c, -s, 0], en = [sx * s, c, 0];
    const top = [0, RIDGE_Y, 0], low = [sx * (HX + P.eaveOver), E - P.eaveOver * K, 0];
    const mid = add(mul(add(top, low), 0.5), mul(en, T / 2));
    B.roof.obox(mid, eu, en, [0, 0, 1], len(sub(low, top)) / 2, T / 2, HZ + P.gableOver, [0, 0, 1]);
  }
  const r45 = Math.SQRT1_2;
  B.roof.obox([0, RIDGE_Y + 0.1, 0], [r45, r45, 0], [-r45, r45, 0], [0, 0, 1], 0.15, 0.15, HZ + P.gableOver + 0.05, [0, 0, 1]);
  const dx0 = 0.1, dx1 = D.x1 + 0.15, dOver = 0.15;
  for (const sz of [1, -1]) {
    const eu = [0, -s, sz * c], en = [0, c, sz * s];
    const top = [0, dormerPeak, 0], low = [0, D.eave - dOver * K, sz * (D.hz + dOver)];
    const mid = add(mul(add(top, low), 0.5), mul(en, T / 2));
    B.roof.obox(add(mid, [(dx0 + dx1) / 2, 0, 0]), eu, en, [1, 0, 0], len(sub(low, top)) / 2, T / 2, (dx1 - dx0) / 2, [1, 0, 0]);
  }
  B.roof.obox([(dx0 + dx1) / 2, dormerPeak + 0.09, 0], [1, 0, 0], [0, r45, r45], [0, -r45, r45], (dx1 - dx0) / 2 + 0.03, 0.12, 0.12, [1, 0, 0]);

  // ---------- Porch: stone plinth, deck, posts, beam, knee braces, rafters, ledger, railings, shed roof ----------
  const W = B.porchWood, PZ = P.porchHalfZ, PX = P.postX;
  B.porchStone.aabb(HX + 0.08, P.porchX, 0, 0.3, -PZ + 0.05, PZ - 0.05);
  W.aabb(HX + 0.08, P.porchX + 0.05, 0.3, FY, -PZ, PZ, [0, 0, 1]);
  const beamBot = P.beamTop - P.beamD;
  for (const z of P.postZ) W.aabb(PX - 0.08, PX + 0.08, FY, beamBot, z - 0.08, z + 0.08, [0, 1, 0]);
  W.aabb(PX - 0.08, PX + 0.08, beamBot, P.beamTop, -PZ, PZ, [0, 0, 1]);
  const braceDir = [1, -1, 1, -1];
  P.postZ.forEach((z, i) => {
    const dz = braceDir[i];
    W.strut([PX, beamBot - 0.44, z + dz * 0.04], [PX, beamBot + 0.05, z + dz * 0.49], 0.08, 0.08, [1, 0, 0]);
  });
  const ps = P.porchSlope, pc = 1 / Math.hypot(1, ps);
  const peu = [pc, -ps * pc, 0], pen = [ps * pc, pc, 0];
  const underY = (x) => P.porchLedgerY - (x - HX) * ps - P.porchRoofT / pc;
  W.aabb(HX, HX + 0.12, 3.0, underY(HX + 0.12), -PZ, PZ, [0, 0, 1]);
  for (const z of [-3.3, -1.65, 0, 1.65, 3.3]) {
    const a = [HX, underY(HX), z], b = [P.porchRoofX - 0.05, underY(P.porchRoofX - 0.05), z];
    W.obox(add(mul(add(a, b), 0.5), mul(pen, -0.06)), peu, pen, [0, 0, 1], len(sub(b, a)) / 2, 0.06, 0.04, peu);
  }
  {
    const a = [HX, P.porchLedgerY, 0], b = [P.porchRoofX, P.porchLedgerY - (P.porchRoofX - HX) * ps, 0];
    B.porchRoof.obox(add(mul(add(a, b), 0.5), mul(pen, -P.porchRoofT / 2)), peu, pen, [0, 0, 1],
      len(sub(b, a)) / 2, P.porchRoofT / 2, PZ + 0.1, [0, 0, 1]);
  }
  // Porch soffit: boarded ceiling under the rafter line, split around the beam (posts, beam
  // and braces stay exposed), bay closures at both ends and a fascia over the rafter tails.
  const rafterD = 0.12, soffitT = 0.025, rafterEnd = P.porchRoofX - 0.05;
  const rafterBot = (x) => add([x, underY(x), 0], mul(pen, -rafterD));
  const soffit = (xa, xb) => {
    const a = rafterBot(xa), b = rafterBot(xb);
    W.obox(add(mul(add(a, b), 0.5), mul(pen, -soffitT / 2)), peu, pen, [0, 0, 1], len(sub(b, a)) / 2, soffitT / 2, PZ, [0, 0, 1]);
  };
  soffit(HX, PX - 0.08); soffit(PX + 0.08, rafterEnd);
  for (const zc of [-PZ + 0.02, PZ - 0.02]) {
    const a = [HX, underY(HX), zc], b = [rafterEnd, underY(rafterEnd), zc];
    W.obox(add(mul(add(a, b), 0.5), mul(pen, -(rafterD + soffitT) / 2)), peu, pen, [0, 0, 1], len(sub(b, a)) / 2, (rafterD + soffitT) / 2, 0.02, peu);
  }
  W.aabb(rafterEnd, rafterEnd + 0.03, rafterBot(rafterEnd)[1] - soffitT, underY(rafterEnd + 0.03), -PZ, PZ, [0, 0, 1]);
  function railing(axis, fixed, a0, a1) {
    const R = (lo, hi, y0, y1, w) => axis === 'z'
      ? W.aabb(fixed - w, fixed + w, y0, y1, lo, hi) : W.aabb(lo, hi, y0, y1, fixed - w, fixed + w);
    R(a0, a1, 1.25, 1.33, 0.045); R(a0, a1, 0.5, 0.56, 0.035);
    const n = Math.max(1, Math.round((a1 - a0) / 0.22));
    for (let i = 1; i < n; i++) { const t = a0 + (a1 - a0) * i / n; R(t - 0.022, t + 0.022, 0.56, 1.25, 0.022); }
  }
  railing('z', PX, -3.3 + 0.06, -0.95 - 0.06); railing('z', PX, 0.95 + 0.06, 3.3 - 0.06);
  railing('x', -3.3, HX, PX - 0.06); railing('x', 3.3, HX, PX - 0.06);

  // ---------- Steps: three risers from ground to deck ----------
  const rise = FY / 3;
  B.steps.aabb(P.porchX, P.porchX + 0.65, 0, rise, -P.stepHalfZ, P.stepHalfZ, [0, 0, 1]);
  B.steps.aabb(P.porchX, P.porchX + 0.35, rise, 2 * rise, -P.stepHalfZ, P.stepHalfZ, [0, 0, 1]);
  B.porchStone.aabb(P.porchX + 0.05, P.porchX + 0.65, 0, rise - 0.001, -P.stepHalfZ - 0.1, -P.stepHalfZ);
  B.porchStone.aabb(P.porchX + 0.05, P.porchX + 0.65, 0, rise - 0.001, P.stepHalfZ, P.stepHalfZ + 0.1);

  // ---------- Door leaf on a hinge pivot (static, closed; pivot ready for a later clip) ----------
  const L = { x0: -0.025, x1: 0.025, h: P.doorTop - FY - 0.02, w: 2 * P.doorHalfW - 0.02 };
  B.doorRed.aabb(L.x0, L.x1, 0.01, 0.01 + L.h, 0, L.w, [0, 1, 0]);
  for (const [za, zb] of [[0.1, 0.44], [0.54, 0.88]]) for (const [ya, yb] of [[0.22, 1.0], [1.18, 1.98]])
    B.doorRed.aabb(L.x1, L.x1 + 0.018, ya, yb, za, zb, [0, 1, 0]);
  for (const yb of [0.12, 2.02]) {
    B.doorMetal.aabb(L.x1, L.x1 + 0.012, yb - 0.025, yb + 0.025, -0.01, 0.46);
    B.doorMetal.aabb(-0.03, 0.03, yb - 0.08, yb + 0.08, -0.012, 0.012);
  }
  B.doorMetal.aabb(L.x1, L.x1 + 0.012, 0.95, 1.2, 0.84, 0.92);
  B.doorMetal.aabb(L.x1 + 0.012, L.x1 + 0.07, 1.06, 1.1, 0.86, 0.9);

  // ---------- assemble named reusable groups ----------
  const group = (name) => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };
  const shell = group('Shell'), roof = group('Roof'), porch = group('Porch'), steps = group('Steps'),
    shutters = group('Shutters'), doorG = group('Door');
  createPart('ShellMasonry', B.masonry.geo(), M.masonry, { parent: shell });
  createPart('ShellStone', B.stone.geo(), M.stone, { parent: shell });
  createPart('ShellTrim', B.trim.geo(), M.trim, { parent: shell });
  createPart('ShellGlass', B.glass.geo(), M.glass, { parent: shell });
  createPart('ChimneyFlue', B.dark.geo(), M.dark, { parent: shell });
  createPart('InteriorCeiling', B.ceiling.geo(), M.trim, { parent: shell });
  createPart('InteriorFloor', B.floor.geo(), M.wood, { parent: shell });
  createPart('RoofShingles', B.roof.geo(), M.roof, { parent: roof });
  createPart('PorchTimber', B.porchWood.geo(), M.wood, { parent: porch });
  createPart('PorchPlinth', B.porchStone.geo(), M.stone, { parent: porch });
  createPart('PorchRoof', B.porchRoof.geo(), M.roof, { parent: porch });
  createPart('StepTreads', B.steps.geo(), M.wood, { parent: steps });
  createPart('ShutterPanels', B.olive.geo(), M.olive, { parent: shutters });
  createPart('ShutterHinges', B.hinge.geo(), M.metal, { parent: shutters });
  const hinge = createPivot('FrontDoor', [HX - 0.2, FY, -P.doorHalfW + 0.01], doorG);
  createPart('DoorLeaf', B.doorRed.geo(), M.red, { parent: hinge });
  createPart('DoorHardware', B.doorMetal.geo(), M.metal, { parent: hinge });
  return root;
}
