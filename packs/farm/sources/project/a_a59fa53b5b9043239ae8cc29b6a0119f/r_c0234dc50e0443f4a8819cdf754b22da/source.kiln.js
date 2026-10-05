const meta = { name: 'Red gambrel barn', role: 'building' };

// ---------------------------------------------------------------------------
// Body frame: metres, +X forward (main doorway), +Y up, +Z right, ground Y=0.
// Main walls are 10m (X) x 8m (Z), centred on the body origin. The body group is
// shifted along Z so the root sits at the centre of the complete placement
// footprint (main roof eave on -Z to the awning roof edge on +Z).
// ---------------------------------------------------------------------------
const L = 10, W = 8, WT = 0.2;
const EAVE = 4.0;                 // roof underside meets wall outer face
const KNEE_Z = 2.85, KNEE_Y = 5.85;
const RIDGE_Y = 6.85;             // roof underside at ridge
const ROOF_T = 0.16, EAVE_OH = 0.35, GABLE_OH = 0.3;
const PLINTH_H = 0.3, PLINTH_P = 0.05;
const FLOOR_T = 0.03;
const DOOR_HALF = 2.0, DOOR_HEAD = 3.55;
const TRIM_W = 0.2, TRIM_P = 0.05;
const HINGE_X = L / 2 + TRIM_P + 0.03;      // vertical hinge axis x
const HINGE_Z = 2.12;                        // |z| of each hinge axis
const LEAF_W = HINGE_Z - 0.01, LEAF_Y0 = 0.05, LEAF_Y1 = 3.72, LEAF_OFF = 0.04;
const LEAF_BT = 0.05, LEAF_FT = 0.04, LEAF_FW = 0.14;
const HINGE_YS = [0.48, 3.0];
const OPEN_DEG = 90, CLIP_S = 2.2;
const BATTEN_W = 0.07, BATTEN_P = 0.025;
const AWN_Z0 = W / 2, AWN_Z1 = 7.45, AWN_X = 3.5, AWN_Y0 = 3.55, AWN_SLOPE = 0.18, AWN_T = 0.08;
const AWN_POST_Z = 6.9, AWN_POSTS = [-3.3, 0, 3.3], RAFTER_D = 0.14;

// Library materials: exact portable specs, resolved through the farm-production pins.
function lib(id) {
  const r = (s) => ({ kind: 'resource', resourceId: `kiln.library.${id}.${s}` });
  return { baseColor: r('base-color'), normal: r('normal'), metallicRoughness: r('metallic-roughness') };
}
function spec(name, id, extra) {
  return Object.assign({ schemaVersion: 2, model: 'pbrMetallicRoughness', name, baseColor: 0xffffff,
    roughness: 1, metalness: 0, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5,
    doubleSided: false, textures: lib(id) }, extra || {});
}
const SPECS = {
  red: spec('Farm barn red painted boards', 'a7639a5e03d30a34b47c4b9d4484b81070d3bb679d38872bbeced6c66bc1cce7'),
  cream: spec('Farm cream painted trim', 'c3c8fad2dbe4671b35c343b10c1d18b773fd25ebef95e767e06a5bb7299973eb'),
  honey: spec('Farm honey wood (subdued grain derivative)', '710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd'),
  roof: spec('Farm charcoal roof shingles', 'ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85'),
  masonry: spec('Farm cream masonry (restrained blocks)', 'd1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6'),
  iron: spec('Brushed neutral metal', '67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0', { baseColor: 0x4a4b4d, metalness: 1 }),
};
// Physical repeat (metres per UV unit) from each material record, and whether the
// texture's grain stripes run along V (true) or U (false).
const MAT_SCALE = { red: 1, cream: 1, honey: 1, roof: 1, masonry: 2, iron: 1 };
const GRAIN_V = { red: true, cream: true, honey: true, roof: true, masonry: true, iron: true };

// ---- small vector helpers ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = len(a); return l > 1e-12 ? scl(a, 1 / l) : null; };
const n2 = (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };

// ---- per-material triangle accumulation (flat facets, metre-scaled UVs) ----
function bucket(set, m) { return set[m] || (set[m] = { p: [], n: [], uv: [] }); }
function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}
function addPoly(set, mat, pts, grain, fan0 = 0) {
  if (!mat) return;
  const n = norm(newell(pts)); if (!n) return;
  const g = grain ? (norm(grain) || [0, 1, 0]) : [0, 1, 0];
  let v = sub(g, scl(n, dot(g, n)));
  if (len(v) < 0.2) { const alt = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; v = sub(alt, scl(n, dot(alt, n))); }
  v = norm(v); const u = cross(v, n);
  const s = MAT_SCALE[mat], along = GRAIN_V[mat];
  const uvOf = (p) => along ? [dot(p, u) / s, dot(p, v) / s] : [dot(p, v) / s, -dot(p, u) / s];
  const B = bucket(set, mat), k = pts.length;
  for (let i = 1; i < k - 1; i++) {
    for (const p of [pts[fan0], pts[(fan0 + i) % k], pts[(fan0 + i + 1) % k]]) {
      B.p.push(p[0], p[1], p[2]); B.n.push(n[0], n[1], n[2]); const t = uvOf(p); B.uv.push(t[0], t[1]);
    }
  }
}
function addOriented(set, mat, pts, want, grain, fan0 = 0) {
  if (!mat) return;
  if (dot(newell(pts), want) < 0) addPoly(set, mat, pts.slice().reverse(), grain, pts.length - 1 - fan0);
  else addPoly(set, mat, pts, grain, fan0);
}
const pickMat = (m, key, i) => (typeof m === 'string' ? m : (typeof m[key] === 'function' ? m[key](i) : (key in m ? m[key] : (m.all || null))));
// Hexahedron from 8 corners c[i + 2j + 4k]; face keys nx/px (i), ny/py (j), nz/pz (k).
function hexa(set, c, m, grain) {
  const P = (i, j, k) => c[i + 2 * j + 4 * k];
  const flip = dot(sub(P(1, 0, 0), P(0, 0, 0)), cross(sub(P(0, 1, 0), P(0, 0, 0)), sub(P(0, 0, 1), P(0, 0, 0)))) < 0;
  const faces = [
    ['nx', [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)]], ['px', [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)]],
    ['ny', [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)]], ['py', [P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)]],
    ['nz', [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)]], ['pz', [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)]],
  ];
  for (const [key, q] of faces) addPoly(set, pickMat(m, key), flip ? q.slice().reverse() : q, grain);
}
const ID = (p) => p;
const tdir = (T, g) => sub(T(g), T([0, 0, 0]));
function box(set, x0, x1, y0, y1, z0, z1, m, grain, T = ID) {
  const c = [];
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) c.push(T([i ? x1 : x0, j ? y1 : y0, k ? z1 : z0]));
  const ext = [x1 - x0, y1 - y0, z1 - z0];
  const g = grain || (ext[1] >= ext[0] && ext[1] >= ext[2] ? [0, 1, 0] : (ext[0] >= ext[2] ? [1, 0, 0] : [0, 0, 1]));
  hexa(set, c, m, tdir(T, g));
}
// Convex (or star-shaped from fan0) polygon extruded by d; keys cap0, cap1, side(i).
function prism(set, pts, d, m, grain, fan0 = 0) {
  const k = pts.length, dn = norm(d);
  let c = [0, 0, 0]; for (const p of pts) c = add(c, p); c = scl(c, 1 / k);
  addOriented(set, pickMat(m, 'cap0'), pts, scl(d, -1), grain, fan0);
  addOriented(set, pickMat(m, 'cap1'), pts.map((p) => add(p, d)), d, grain, fan0);
  for (let i = 0; i < k; i++) {
    const a = pts[i], b = pts[(i + 1) % k];
    let out = sub(scl(add(a, b), 0.5), c); out = sub(out, scl(dn, dot(out, dn)));
    addOriented(set, pickMat(m, 'side', i), [a, b, add(b, d), add(a, d)], out, grain || sub(b, a));
  }
}
function member(set, p0, p1, up, w, h, m) {
  const A = sub(p1, p0), a = norm(A);
  const H = norm(sub(up, scl(a, dot(up, a)))), Wd = cross(a, H), c = [];
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    c.push(add(add(add(p0, scl(A, i)), scl(H, (j - 0.5) * h)), scl(Wd, (k - 0.5) * w)));
  }
  hexa(set, c, m, a);
}
function octagon(cx, cz, r, y) { const o = []; for (let i = 0; i < 8; i++) { const t = (i + 0.5) * Math.PI / 4; o.push([cx + r * Math.cos(t), y, cz + r * Math.sin(t)]); } return o; }
function clipHalf(poly, a, nr, off) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const dp = (P[0] - a[0]) * nr[0] + (P[1] - a[1]) * nr[1] - off, dq = (Q[0] - a[0]) * nr[0] + (Q[1] - a[1]) * nr[1] - off;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}

// Board panel in local YZ with thickness along +X from xb: painted boards, cream
// perimeter frame and a half-lapped cream X brace clipped flush into the frame.
function bracedPanel(set, T, o) {
  const { z0, z1, y0, y1, xb, bt, ft, fw, back } = o, xf = xb + bt;
  const edge = { nx: back, px: 'red', ny: 'red', py: 'red', nz: 'red', pz: 'red' };
  box(set, xb, xf, y0, y1, z0, z1, edge, [0, 1, 0], T);
  const fr = { nx: null, all: 'cream' };
  box(set, xf, xf + ft, y0, y1, z0, z0 + fw, fr, [0, 1, 0], T);
  box(set, xf, xf + ft, y0, y1, z1 - fw, z1, fr, [0, 1, 0], T);
  box(set, xf, xf + ft, y0, y0 + fw, z0 + fw, z1 - fw, fr, [0, 0, 1], T);
  box(set, xf, xf + ft, y1 - fw, y1, z0 + fw, z1 - fw, fr, [0, 0, 1], T);
  const rect = [[z0 + fw, y0 + fw], [z1 - fw, y0 + fw], [z1 - fw, y1 - fw], [z0 + fw, y1 - fw]];
  const diag = (a, b, depth) => {
    const t = n2([b[0] - a[0], b[1] - a[1]]), nr = [-t[1], t[0]];
    let poly = clipHalf(rect, a, nr, fw / 2); poly = clipHalf(poly, a, [-nr[0], -nr[1]], fw / 2);
    prism(set, poly.map(([z, y]) => T([xf, y, z])), tdir(T, [depth, 0, 0]), { cap0: null, cap1: 'cream', side: 'cream' },
      tdir(T, [0, b[1] - a[1], b[0] - a[0]]));
  };
  diag(rect[0], rect[2], ft);
  diag(rect[1], rect[3], ft - 0.006); // half-lap: second brace sits 6mm behind the first
}

async function build() {
  const MATS = {};
  for (const [k, s] of Object.entries(SPECS)) MATS[k] = await compilePortableMaterialSpecV2(s);

  const root = createRoot('Barn');
  const S = {}, RF = {}, CU = {}, AW = {}, DR = {}, DL = {};

  // ---- gambrel roof lines (z, y) ----
  const E = [W / 2, EAVE], K = [KNEE_Z, KNEE_Y], R = [0, RIDGE_Y];
  const dl = n2([E[0] - K[0], E[1] - K[1]]);
  const Eo = [E[0] + dl[0] * EAVE_OH, E[1] + dl[1] * EAVE_OH];
  const U = [[-Eo[0], Eo[1]], [-K[0], K[1]], R, K, Eo];
  const segN = [];
  for (let s = 0; s < 4; s++) { const t = n2([U[s + 1][0] - U[s][0], U[s + 1][1] - U[s][1]]); segN.push([-t[1], t[0]]); }
  const Tp = U.map((p, k) => {
    let o;
    if (k === 0) o = [segN[0][0] * ROOF_T, segN[0][1] * ROOF_T];
    else if (k === U.length - 1) o = [segN[3][0] * ROOF_T, segN[3][1] * ROOF_T];
    else { const m = n2([segN[k - 1][0] + segN[k][0], segN[k - 1][1] + segN[k][1]]); const f = ROOF_T / (m[0] * segN[k][0] + m[1] * segN[k][1]); o = [m[0] * f, m[1] * f]; }
    return [p[0] + o[0], p[1] + o[1]];
  });
  const RX = L / 2 + GABLE_OH;
  for (let s = 0; s < 4; s++) {
    const c = [];
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const q = (j ? Tp : U)[s + i]; c.push([k ? RX : -RX, q[1], q[0]]);
    }
    hexa(RF, c, { nx: s === 0 ? 'roof' : null, px: s === 3 ? 'roof' : null, ny: 'honey', py: 'roof', nz: 'roof', pz: 'roof' },
      [0, U[s + 1][1] - U[s][1], U[s + 1][0] - U[s][0]]);
  }
  const ridgeTop = Tp[2][1];
  box(RF, -RX, RX, ridgeTop - 0.08, ridgeTop + 0.05, -0.12, 0.12, { ny: null, all: 'roof' }, [0, 0, 1]);
  const roofTopY = (a) => ridgeTop + (Tp[3][1] - ridgeTop) * (Math.abs(a) / Tp[3][0]);
  const yUnder = (a) => (a >= KNEE_Z ? KNEE_Y + (EAVE - KNEE_Y) * (a - KNEE_Z) / (W / 2 - KNEE_Z) : RIDGE_Y + (KNEE_Y - RIDGE_Y) * a / KNEE_Z);

  // ---- walls: red painted exterior, honey-wood interior ----
  const up = 0.02; // gable tops tuck into the roof slab
  const gable = [[-W / 2, 0], [W / 2, 0], [W / 2, EAVE + up], [KNEE_Z, KNEE_Y + up], [0, RIDGE_Y + up], [-KNEE_Z, KNEE_Y + up], [-W / 2, EAVE + up]];
  const gSide = (i) => (i === 0 || i === 1 || i === 6 ? 'red' : null);
  prism(S, gable.map(([z, y]) => [-L / 2, y, z]), [WT, 0, 0], { cap0: 'red', cap1: 'honey', side: gSide }, [0, 1, 0]);
  const upper = [[-W / 2, DOOR_HEAD], [W / 2, DOOR_HEAD], ...gable.slice(2)];
  prism(S, upper.map(([z, y]) => [L / 2 - WT, y, z]), [WT, 0, 0], { cap0: 'honey', cap1: 'red', side: (i) => (i === 0 ? 'cream' : gSide(i)) }, [0, 1, 0]);
  for (const sz of [1, -1]) {
    const zin = sz > 0 ? 'nz' : 'pz', zout = sz > 0 ? 'pz' : 'nz';
    box(S, L / 2 - WT, L / 2, 0, DOOR_HEAD, Math.min(sz * DOOR_HALF, sz * W / 2), Math.max(sz * DOOR_HALF, sz * W / 2),
      { nx: 'honey', px: 'red', ny: 'red', py: null, [zin]: 'cream', [zout]: 'red' }, [0, 1, 0]);
    box(S, -L / 2 + WT, L / 2 - WT, 0, EAVE, sz > 0 ? W / 2 - WT : -W / 2, sz > 0 ? W / 2 : -W / 2 + WT,
      { nx: null, px: null, ny: 'red', py: 'honey', [zin]: 'honey', [zout]: 'red' }, [0, 1, 0]);
  }
  // floor, threshold and a shallow exterior ramp so the doorway stays traversable from Y=0
  box(S, -L / 2 + WT, L / 2 - WT, 0, FLOOR_T, -W / 2 + WT, W / 2 - WT, 'honey', [1, 0, 0]);
  box(S, L / 2 - WT, L / 2, 0, FLOOR_T, -DOOR_HALF, DOOR_HALF, { nx: null, all: 'honey' }, [1, 0, 0]);
  prism(S, [[L / 2, 0, -DOOR_HALF], [L / 2 + 0.14, 0, -DOOR_HALF], [L / 2, FLOOR_T, -DOOR_HALF]], [0, 0, 2 * DOOR_HALF],
    { side: (i) => (i === 2 ? null : 'honey'), all: 'honey' }, [1, 0, 0]);
  // interior tie beams resting on the side walls, well above the door head
  for (const x of [-3, 0, 3]) box(S, x - 0.09, x + 0.09, 3.78, 3.98, -W / 2 + WT, W / 2 - WT, { nz: null, pz: null, all: 'honey' }, [0, 0, 1]);

  // ---- cream masonry plinth skin ----
  const px0 = L / 2 + PLINTH_P;
  for (const sz of [1, -1]) {
    box(S, -px0, px0, 0, PLINTH_H, sz > 0 ? W / 2 : -W / 2 - PLINTH_P, sz > 0 ? W / 2 + PLINTH_P : -W / 2, { [sz > 0 ? 'nz' : 'pz']: null, all: 'masonry' }, [1, 0, 0]);
    box(S, L / 2, px0, 0, PLINTH_H, Math.min(sz * (DOOR_HALF + TRIM_W), sz * W / 2), Math.max(sz * (DOOR_HALF + TRIM_W), sz * W / 2), { nx: null, all: 'masonry' }, [0, 0, 1]);
  }
  box(S, -px0, -L / 2, 0, PLINTH_H, -W / 2, W / 2, { px: null, all: 'masonry' }, [0, 0, 1]);

  // ---- cream framing: corner boards, door casing, gable bargeboards ----
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const xa = sx * L / 2, xb = sx * (L / 2 + 0.04), za = sz * (W / 2 - 0.22), zb = sz * W / 2;
    box(S, Math.min(xa, xb), Math.max(xa, xb), PLINTH_H, EAVE - 0.22, Math.min(za, zb), Math.max(za, zb), { [sx > 0 ? 'nx' : 'px']: null, all: 'cream' }, [0, 1, 0]);
    const xc = sx * (L / 2 - 0.22), zc = sz * W / 2, zd = sz * (W / 2 + 0.04);
    box(S, Math.min(xc, xb), Math.max(xc, xb), PLINTH_H, EAVE, Math.min(zc, zd), Math.max(zc, zd), { [sz > 0 ? 'nz' : 'pz']: null, all: 'cream' }, [0, 1, 0]);
  }
  for (const sz of [1, -1]) box(S, L / 2, L / 2 + TRIM_P, 0, DOOR_HEAD, Math.min(sz * DOOR_HALF, sz * (DOOR_HALF + TRIM_W)), Math.max(sz * DOOR_HALF, sz * (DOOR_HALF + TRIM_W)), { nx: null, all: 'cream' }, [0, 1, 0]);
  box(S, L / 2, L / 2 + TRIM_P, DOOR_HEAD, DOOR_HEAD + 0.25, -DOOR_HALF - TRIM_W, DOOR_HALF + TRIM_W, { nx: null, all: 'cream' }, [0, 0, 1]);
  const bargePts = [[-W / 2, EAVE], [-KNEE_Z, KNEE_Y], [0, RIDGE_Y], [KNEE_Z, KNEE_Y], [W / 2, EAVE]];
  for (const sx of [1, -1]) {
    for (let s = 0; s < 4; s++) {
      const c = [];
      for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const q = bargePts[s + i]; c.push([sx * (L / 2 + (k ? 0.05 : 0)), q[1] + (j ? 0.02 : -0.22), q[0]]);
      }
      hexa(S, c, { nx: s === 0 ? 'cream' : null, px: s === 3 ? 'cream' : null, ny: 'cream', py: null, nz: sx > 0 ? null : 'cream', pz: sx > 0 ? 'cream' : null },
        [0, bargePts[s + 1][1] - bargePts[s][1], bargePts[s + 1][0] - bargePts[s][0]]);
    }
  }

  // ---- board-and-batten relief ----
  const segs = (y0, y1, holes) => {
    let out = [[y0, y1]];
    for (const [h0, h1] of holes) out = out.flatMap(([a, b]) => (h1 <= a || h0 >= b ? [[a, b]] : [[a, h0], [h1, b]].filter(([p, q]) => q - p > 0.08)));
    return out;
  };
  const winX = [-2.5, 2.5];
  for (let x = -4.75; x <= 4.76; x += 0.5) {
    for (const sz of [1, -1]) {
      const holes = sz < 0 && winX.some((c) => Math.abs(x - c) < 0.55) ? [[1.45, 2.55]] : [];
      for (const [y0, y1] of segs(PLINTH_H, EAVE - 0.02, holes)) {
        box(S, x - BATTEN_W / 2, x + BATTEN_W / 2, y0, y1, sz > 0 ? W / 2 : -W / 2 - BATTEN_P, sz > 0 ? W / 2 + BATTEN_P : -W / 2, { [sz > 0 ? 'nz' : 'pz']: null, all: 'red' }, [0, 1, 0]);
      }
    }
  }
  for (let z = -3.75; z <= 3.76; z += 0.5) {
    const top = yUnder(Math.abs(z) + BATTEN_W / 2) - 0.1;
    for (const sx of [1, -1]) {
      const holes = [];
      if (Math.abs(z) < 0.7) holes.push([4.2, 5.6]);
      if (sx > 0 && Math.abs(z) < DOOR_HALF + TRIM_W + 0.05) holes.push([0, DOOR_HEAD + 0.25]);
      for (const [y0, y1] of segs(PLINTH_H, top, holes)) {
        box(S, sx > 0 ? L / 2 : -L / 2 - BATTEN_P, sx > 0 ? L / 2 + BATTEN_P : -L / 2, y0, y1, z - BATTEN_W / 2, z + BATTEN_W / 2, { [sx > 0 ? 'nx' : 'px']: null, all: 'red' }, [0, 1, 0]);
      }
    }
  }
  // fixed braced loft doors on both gables
  for (const sx of [1, -1]) {
    bracedPanel(S, sx > 0 ? ID : (p) => [-p[0], p[1], p[2]], { z0: -0.65, z1: 0.65, y0: 4.25, y1: 5.55, xb: L / 2, bt: 0.03, ft: 0.035, fw: 0.12, back: null });
  }
  // shuttered side windows on -Z
  for (const cx of winX) {
    const zf = -W / 2, fm = { pz: null, all: 'cream' };
    box(S, cx - 0.5, cx + 0.5, 1.5, 1.6, zf - 0.04, zf, fm, [1, 0, 0]);
    box(S, cx - 0.5, cx + 0.5, 2.4, 2.5, zf - 0.04, zf, fm, [1, 0, 0]);
    box(S, cx - 0.5, cx - 0.4, 1.6, 2.4, zf - 0.04, zf, fm, [0, 1, 0]);
    box(S, cx + 0.4, cx + 0.5, 1.6, 2.4, zf - 0.04, zf, fm, [0, 1, 0]);
    box(S, cx - 0.4, cx + 0.4, 1.6, 2.4, zf - 0.02, zf, { pz: null, all: 'honey' }, [0, 1, 0]);
    box(S, cx - 0.03, cx + 0.03, 1.6, 2.4, zf - 0.035, zf - 0.02, { pz: null, all: 'cream' }, [0, 1, 0]);
  }
  // fixed hinge gudgeons: arm on the casing plus a vertical pin on the hinge axis
  for (const sz of [1, -1]) for (const hy of HINGE_YS) {
    const zh = sz * HINGE_Z;
    box(S, L / 2 + TRIM_P, HINGE_X + 0.01, hy + 0.24, hy + 0.3, zh - 0.02, zh + 0.02, { nx: null, all: 'iron' });
    prism(S, octagon(HINGE_X, zh, 0.012, hy - 0.02), [0, 0.32, 0], 'iron', [0, 1, 0]);
  }

  // ---- cupola on the ridge ----
  const cb = 0.5, cTop = ridgeTop + 0.85, emb = 0.03;
  const yLow = roofTopY(cb) - emb, yHigh = ridgeTop - emb;
  prism(CU, [[-cb, yLow, 0], [0, yHigh, 0], [cb, yLow, 0], [cb, cTop, 0], [-cb, cTop, 0]].map(([z, y]) => [-cb, y, z]), [2 * cb, 0, 0],
    { cap0: 'red', cap1: 'red', side: (i) => (i === 2 || i === 4 ? 'red' : null) }, [0, 1, 0], 1);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    box(CU, sx * cb - 0.04, sx * cb + 0.04, roofTopY(cb + 0.04) - 0.03, cTop - 0.07, sz * cb - 0.04, sz * cb + 0.04, { ny: null, all: 'cream' }, [0, 1, 0]);
  }
  box(CU, -cb - 0.05, cb + 0.05, cTop - 0.07, cTop, -cb - 0.05, cb + 0.05, { py: null, all: 'cream' }, [1, 0, 0]);
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2, co = Math.cos(a), si = Math.sin(a);
    const T = (p) => [p[0] * co + p[2] * si, p[1], -p[0] * si + p[2] * co];
    const y0 = ridgeTop + 0.16, y1 = ridgeTop + 0.72, fm = { nx: null, all: 'cream' };
    box(CU, cb, cb + 0.035, y0, y1, -0.28, -0.22, fm, [0, 1, 0], T);
    box(CU, cb, cb + 0.035, y0, y1, 0.22, 0.28, fm, [0, 1, 0], T);
    box(CU, cb, cb + 0.035, y0, y0 + 0.06, -0.22, 0.22, fm, [0, 0, 1], T);
    box(CU, cb, cb + 0.035, y1 - 0.06, y1, -0.22, 0.22, fm, [0, 0, 1], T);
    box(CU, cb, cb + 0.006, y0 + 0.06, y1 - 0.06, -0.22, 0.22, { nx: null, all: 'roof' }, [0, 0, 1], T);
    for (let i = 0; i < 3; i++) {
      const y = y0 + 0.14 + i * 0.14;
      member(CU, T([cb + 0.02, y, -0.22]), T([cb + 0.02, y, 0.22]), T([0.55, 0.83, 0]), 0.015, 0.12, 'cream');
    }
  }
  const hb = 0.68, yE = cTop, yT = cTop + 0.07, yA = cTop + 0.62;
  const sq = (h, y) => [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]];
  addOriented(CU, 'honey', sq(hb, yE), [0, -1, 0], [1, 0, 0]);
  const lo = sq(hb, yE), hi = sq(hb, yT), apex = [0, yA, 0];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, mid = scl(add(hi[i], hi[j]), 0.5);
    addOriented(CU, 'roof', [lo[i], lo[j], hi[j], hi[i]], [mid[0], 0, mid[2]], [0, 1, 0]);
    addOriented(CU, 'roof', [hi[i], hi[j], apex], [mid[0], 0.6, mid[2]], sub(mid, apex));
  }
  prism(CU, octagon(0, 0, 0.06, yA - 0.1), [0, 0.18, 0], { cap0: null, all: 'iron' }, [0, 1, 0]);
  box(CU, -0.015, 0.015, yA + 0.07, yA + 0.62, -0.015, 0.015, { ny: null, all: 'iron' });
  const ya = yA + 0.48;
  box(CU, -0.32, 0.3, ya - 0.012, ya + 0.012, -0.01, 0.01, 'iron', [1, 0, 0]);
  prism(CU, [[0.3, ya - 0.07, -0.012], [0.44, ya, -0.012], [0.3, ya + 0.07, -0.012]], [0, 0, 0.024], 'iron', [1, 0, 0]);
  box(CU, -0.36, -0.2, ya - 0.1, ya + 0.1, -0.008, 0.008, 'iron', [1, 0, 0]);

  // ---- covered side awning on +Z (honey timber frame, charcoal roof) ----
  const yU = (z) => AWN_Y0 - (z - AWN_Z0) * AWN_SLOPE;
  {
    const c = [];
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const z = i ? AWN_Z1 : AWN_Z0; c.push([k ? AWN_X : -AWN_X, yU(z) + (j ? AWN_T : 0), z]);
    }
    hexa(AW, c, { nx: null, px: 'roof', ny: 'honey', py: 'roof', nz: 'roof', pz: 'roof' }, [0, -AWN_SLOPE, 1]);
  }
  for (let x = -3.3; x <= 3.31; x += 1.1) {
    const c = [];
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const z = i ? AWN_Z1 - 0.12 : AWN_Z0; c.push([x + (k ? 0.04 : -0.04), yU(z) - (j ? 0 : RAFTER_D), z]);
    }
    hexa(AW, c, { nx: null, py: null, all: 'honey' }, [0, -AWN_SLOPE, 1]);
  }
  const ledTop = yU(AWN_Z0 + 0.16) - RAFTER_D + 0.01;
  box(AW, -AWN_X, AWN_X, ledTop - 0.24, ledTop, AWN_Z0, AWN_Z0 + 0.16, { nz: null, all: 'honey' }, [1, 0, 0]);
  const beamTop = yU(AWN_POST_Z + 0.09) - RAFTER_D + 0.01, beamBot = beamTop - 0.24;
  box(AW, -AWN_X, AWN_X, beamBot, beamTop, AWN_POST_Z - 0.09, AWN_POST_Z + 0.09, 'honey', [1, 0, 0]);
  for (const x of AWN_POSTS) {
    box(AW, x - 0.17, x + 0.17, 0, 0.15, AWN_POST_Z - 0.17, AWN_POST_Z + 0.17, 'masonry', [1, 0, 0]);
    box(AW, x - 0.1, x + 0.1, 0.15, beamBot + 0.01, AWN_POST_Z - 0.1, AWN_POST_Z + 0.1, { ny: null, all: 'honey' }, [0, 1, 0]);
    for (const s of [1, -1]) {
      if (Math.abs(x + s * 0.7) > AWN_X - 0.1) continue;
      member(AW, [x + s * 0.07, beamBot - 0.62, AWN_POST_Z], [x + s * 0.64, beamBot + 0.03, AWN_POST_Z], [0, 0, 1], 0.09, 0.09, 'honey');
    }
  }

  // ---- main doors: two braced leaves on real vertical hinges, swinging out to +X ----
  const leaf = (set, T) => {
    bracedPanel(set, T, { z0: -LEAF_W, z1: 0, y0: LEAF_Y0, y1: LEAF_Y1, xb: LEAF_OFF, bt: LEAF_BT, ft: LEAF_FT, fw: LEAF_FW, back: 'honey' });
    const front = LEAF_OFF + LEAF_BT + LEAF_FT;
    for (const hy of HINGE_YS) {
      const knuckle = octagon(0, 0, 0.025, hy).map(T);
      prism(set, knuckle, tdir(T, [0, 0.22, 0]), 'iron', tdir(T, [0, 1, 0]));
      box(set, 0, LEAF_OFF + 0.005, hy + 0.03, hy + 0.19, -0.13, 0, 'iron', [0, 0, 1], T);
      box(set, front, front + 0.01, hy + 0.05, hy + 0.17, -LEAF_FW, 0, { nx: null, all: 'iron' }, [0, 0, 1], T);
    }
    box(set, front, front + 0.04, 1.5, 1.9, -LEAF_W + 0.03, -LEAF_W + 0.09, { nx: null, all: 'iron' }, [0, 1, 0], T);
  };
  leaf(DR, ID);
  leaf(DL, (p) => [p[0], p[1], -p[2]]);

  // ---- assemble: centre the complete placement footprint on the root ----
  const zMin = -Tp[4][0], zMax = AWN_Z1;
  const zc = (zMin + zMax) / 2;
  const body = new THREE.Group(); body.name = 'BarnBody'; body.position.set(0, 0, -zc); root.add(body);
  const group = (name) => { const g = new THREE.Group(); g.name = name; body.add(g); return g; };
  const emit = (set, prefix, parent) => {
    for (const [m, b] of Object.entries(set)) if (b.p.length) createPart(`${prefix}_${m}`, meshGeo({ positions: b.p, normals: b.n, uvs: b.uv }), MATS[m], { parent });
  };
  emit(S, 'Structure', group('Structure'));
  emit(RF, 'MainRoof', group('MainRoof'));
  emit(CU, 'Cupola', group('Cupola'));
  emit(AW, 'Awning', group('Awning'));
  const doors = group('Doors');
  const pr = createPivot('DoorRight', [HINGE_X, 0, HINGE_Z], doors);
  const pl = createPivot('DoorLeft', [HINGE_X, 0, -HINGE_Z], doors);
  emit(DR, 'DoorRight', pr);
  emit(DL, 'DoorLeft', pl);
  const place = (name, p) => { const o = new THREE.Object3D(); o.name = name; o.position.set(p[0], p[1], p[2]); body.add(o); };
  place('Place_Approach', [HINGE_X + LEAF_W + 1.8, 0, 0]);
  place('Place_Doorway', [L / 2 - WT / 2, FLOOR_T, 0]);
  place('Place_Inside', [0, FLOOR_T, 0]);
  root.userData.barn = {
    bodyOffsetZ: -zc, doorwayPlaneX: L / 2, clearWidth: 2 * DOOR_HALF, clearHeightAboveFloor: DOOR_HEAD - FLOOR_T,
    hinges: { right: [HINGE_X, 0, HINGE_Z - zc], left: [HINGE_X, 0, -HINGE_Z - zc] }, openDeg: OPEN_DEG,
  };
  return root;
}

function animate(root) {
  const keys = (a, open) => {
    const f = open ? [0, 0.12, 0.85, 1] : [1, 0.85, 0.12, 0];
    return [0, 0.5, 1.7, CLIP_S].map((t, i) => ({ time: t, rotation: [0, a * f[i], 0] }));
  };
  return [
    createClip('Open', CLIP_S, [rotationTrack('Joint_DoorRight', keys(-OPEN_DEG, true)), rotationTrack('Joint_DoorLeft', keys(OPEN_DEG, true))]),
    createClip('Close', CLIP_S, [rotationTrack('Joint_DoorRight', keys(-OPEN_DEG, false)), rotationTrack('Joint_DoorLeft', keys(OPEN_DEG, false))]),
  ];
}
