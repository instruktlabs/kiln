const meta = { name: 'Plaza Fountain', role: 'poi' };

// ---------------------------------------------------------------------------
// Fountain-local frame: metres, +X forward, +Y up, origin at basin centre on the ground.
// Every profile below is [radius-or-apothem, height]. Profiles are traversed with the
// solid on the left (outer faces go up, tops go inward, interiors go down/inward), so
// the outward normal is the right-hand side of the direction of travel.
// ---------------------------------------------------------------------------

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

// Water lines and inscribed radii reported to the host (kept in one place).
const WATER = {
  lower: { y: 0.42, r: 2.58 },   // octagon inner face apothem (inscribed)
  middle: { y: 1.96, r: 1.01 },
  upper: { y: 2.83, r: 0.455 },
};

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const arc = (cx, cy, r, t0, t1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = (t0 + (t1 - t0) * i / n) * D2R; return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
});
const curve = (f, n) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

// ---------- batches: accumulate many grids into one mesh per role ----------
function newBatch() { return { pos: [], idx: [], uv: [] }; }
function batchGeo(b) { return meshGeo({ positions: b.pos, indices: b.idx, uvs: b.uv }); }

function addGrid(b, rows, cols, P, { wrap = false, flip = false } = {}) {
  const base = b.pos.length / 3;
  const nc = wrap ? cols : cols + 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < nc; j++) {
    const p = P(i, j); b.pos.push(p[0], p[1], p[2]); b.uv.push(j / cols, i / Math.max(1, rows - 1));
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) {
    const j1 = wrap ? (j + 1) % cols : j + 1;
    const a = base + i * nc + j, bb = base + (i + 1) * nc + j, c = base + (i + 1) * nc + j1, d = base + i * nc + j1;
    if (!flip) b.idx.push(a, bb, c, a, c, d); else b.idx.push(a, c, bb, a, d, c);
  }
}

// profile outward normal (right-hand side of travel) at point i of a run
function runNormal(run, i) {
  const p0 = run[Math.max(0, i - 1)], p1 = run[Math.min(run.length - 1, i + 1)];
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1]; const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

// Round revolution of profile runs. mod(theta, i, run, point) returns an offset along the outward normal.
function addRevolve(b, runs, segs, mod, phase = 0) {
  for (const run of runs) {
    addGrid(b, run.length, segs, (i, j) => {
      const th = j / segs * TAU + phase; let [r, y] = run[i];
      if (mod) { const off = mod(th, i, run, run[i]); if (off) { const n = runNormal(run, i); r += n[0] * off; y += n[1] * off; } }
      return [r * Math.cos(th), y, r * Math.sin(th)];
    }, { wrap: true });
  }
}

// Polygon (mitered) sweep: faces are separate grids so corners stay crisp.
// corner(m, a) -> [u, v] in the loop plane; toWorld(u, v, h) -> xyz.
function addLoopSweep(b, nCorners, corner, toWorld, runs, flip = false) {
  for (const run of runs) for (let k = 0; k < nCorners; k++) {
    addGrid(b, run.length, 1, (i, j) => {
      const [a, h] = run[i]; const [u, v] = corner((k + j) % nCorners, a); return toWorld(u, v, h);
    }, { flip });
  }
}
function octCorner(sides) {
  const R = 1 / Math.cos(Math.PI / sides);
  return (m, a) => { const ph = (m - 0.5) * TAU / sides; return [a * R * Math.cos(ph), a * R * Math.sin(ph)]; };
}
const yUpWorld = (u, v, h) => [u, h, v];

// Closed tube from rings of equal length with fan caps; winding fixed by signed volume.
function addTube(b, rings, startCap, endCap) {
  const M = rings[0].length, n = rings.length, base = b.pos.length / 3, i0 = b.idx.length;
  rings.forEach((ring, i) => ring.forEach((p, j) => { b.pos.push(p[0], p[1], p[2]); b.uv.push(j / M, i / (n - 1)); }));
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M;
    const a = base + i * M + j, bb = base + (i + 1) * M + j, c = base + (i + 1) * M + j1, d = base + i * M + j1;
    b.idx.push(a, bb, c, a, c, d);
  }
  if (startCap) {
    const s = b.pos.length / 3; b.pos.push(...startCap); b.uv.push(0.5, 0);
    for (let j = 0; j < M; j++) b.idx.push(s, base + j, base + (j + 1) % M);
  }
  if (endCap) {
    const e = b.pos.length / 3; b.pos.push(...endCap); b.uv.push(0.5, 1); const L = base + (n - 1) * M;
    for (let j = 0; j < M; j++) b.idx.push(e, L + (j + 1) % M, L + j);
  }
  let vol = 0; const P = b.pos;
  for (let t = i0; t < b.idx.length; t += 3) {
    const a = b.idx[t] * 3, c = b.idx[t + 1] * 3, d = b.idx[t + 2] * 3;
    vol += P[a] * (P[c + 1] * P[d + 2] - P[c + 2] * P[d + 1]) - P[a + 1] * (P[c] * P[d + 2] - P[c + 2] * P[d]) + P[a + 2] * (P[c] * P[d + 1] - P[c + 1] * P[d]);
  }
  if (vol < 0) for (let t = i0; t < b.idx.length; t += 3) { const tmp = b.idx[t + 1]; b.idx[t + 1] = b.idx[t + 2]; b.idx[t + 2] = tmp; }
}

// Open polar relief (height field) in a frame {O,U,V,N}; centre fan, rings outward.
function addRelief(b, F, Rof, zof, nr, na) {
  const base = b.pos.length / 3;
  const W = (x, y, z) => [F.O[0] + F.U[0] * x + F.V[0] * y + F.N[0] * z, F.O[1] + F.U[1] * x + F.V[1] * y + F.N[1] * z, F.O[2] + F.U[2] * x + F.V[2] * y + F.N[2] * z];
  const c = W(0, 0, zof(0, 0)); b.pos.push(...c); b.uv.push(0.5, 0.5);
  for (let i = 1; i <= nr; i++) for (let j = 0; j < na; j++) {
    const al = j / na * TAU, R = Rof(al) * i / nr, x = R * Math.cos(al), y = R * Math.sin(al);
    b.pos.push(...W(x, y, zof(x, y))); b.uv.push(0.5 + x * 3, 0.5 + y * 3);
  }
  for (let j = 0; j < na; j++) b.idx.push(base, base + 1 + j, base + 1 + (j + 1) % na);
  for (let i = 1; i < nr; i++) for (let j = 0; j < na; j++) {
    const j1 = (j + 1) % na, a = base + 1 + (i - 1) * na + j, bb = base + 1 + i * na + j, cc = base + 1 + i * na + j1, d = base + 1 + (i - 1) * na + j1;
    b.idx.push(a, bb, cc, a, cc, d);
  }
}

function addGeometry(b, geo, matrix) {
  const g = geo.clone(); g.applyMatrix4(matrix);
  const base = b.pos.length / 3, p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { b.pos.push(p.getX(i), p.getY(i), p.getZ(i)); b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); }
  if (g.index) for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
  else for (let i = 0; i < p.count; i++) b.idx.push(base + i);
}

// radial frame at angle theta around Y (front faces outward)
function radialFrame(theta, r, y) {
  const N = [Math.cos(theta), 0, Math.sin(theta)], V = [0, 1, 0], U = [Math.sin(theta), 0, -Math.cos(theta)];
  return { O: [r * N[0], y, r * N[2]], U, V, N };
}

// ---------- carved motifs ----------
// Acanthus-like leaf: a lobed, cupped, ribbed flattened tube following a Bezier spine in the (r, y) plane.
function addLeaf(b, theta, P, W, T, o = {}) {
  const ER = [Math.cos(theta), 0, Math.sin(theta)], ET = [-Math.sin(theta), 0, Math.cos(theta)];
  const n = o.rows || 16, M = o.M || 10, lobes = o.lobes || 3, cup = o.cup ?? 0.35, rib = o.rib ?? 0.25 * T;
  const bez = (t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };
  const dbez = (t) => { const u = 1 - t; return [0, 1].map((k) => 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k])); };
  const to3 = (r, y, t) => [r * ER[0] + t * ET[0], y, r * ER[2] + t * ET[2]];
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const v = 0.03 + 0.94 * i / n, c = bez(v), d = dbez(v), l = Math.hypot(d[0], d[1]);
    const nn = [d[1] / l, -d[0] / l];
    const env = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 0.7);
    const w = W * env * (0.8 + 0.2 * Math.abs(Math.sin(lobes * Math.PI * v + 0.4)));
    const h = T * (1 - 0.55 * v);
    const ring = [];
    for (let j = 0; j < M; j++) {
      const ph = j / M * TAU, cu = Math.cos(ph), su = Math.sin(ph);
      const offN = h * su + cup * w * cu * cu + (su > 0 ? rib * Math.exp(-(cu * cu) / 0.05) * (1 - v) : 0);
      ring.push(to3(c[0] + nn[0] * offN, c[1] + nn[1] * offN, w * cu));
    }
    rings.push(ring);
  }
  const s = bez(0), e = bez(1);
  addTube(b, rings, to3(s[0], s[1], 0), to3(e[0], e[1], 0));
}

// Lion mask in relief on a radial frame: maned roundel, brow, eyes, muzzle, open mouth.
function addLionMask(b, F, R) {
  const g = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  const Rof = (al) => R * (1 + 0.07 * Math.cos(11 * al) + 0.03 * Math.cos(5 * al + 1));
  const zof = (x, y) => {
    const rho = Math.hypot(x, y) / R, al = Math.atan2(y, x);
    let z = 0.42 * R * Math.sqrt(Math.max(0, 1 - rho * rho)) - 0.07 * R;                     // mane dome
    z += 0.07 * R * smooth(0.45, 0.8, rho) * (1 - smooth(0.92, 1.05, rho)) * Math.cos(16 * al + 4 * rho); // mane locks
    const face = 1 - smooth(0.42, 0.62, rho);
    z += 0.16 * R * face;                                                                     // face plate
    z += 0.16 * R * g(x, y, 0, 0.20 * R, 0.42 * R, 0.10 * R);                                 // brow ridge
    z -= 0.10 * R * (g(x, y, 0.20 * R, 0.08 * R, 0.08 * R, 0.06 * R) + g(x, y, -0.20 * R, 0.08 * R, 0.08 * R, 0.06 * R)); // eyes
    z += 0.30 * R * g(x, y, 0, -0.06 * R, 0.13 * R, 0.30 * R);                                 // nose bridge
    z += 0.22 * R * (g(x, y, 0.11 * R, -0.25 * R, 0.13 * R, 0.10 * R) + g(x, y, -0.11 * R, -0.25 * R, 0.13 * R, 0.10 * R)); // whisker pads
    z -= 0.20 * R * g(x, y, 0, -0.40 * R, 0.13 * R, 0.07 * R);                                 // open mouth
    return z;
  };
  addRelief(b, F, Rof, zof, 12, 44);
}

// Scallop shell relief: ribbed fan rising from a hinge with two small ears.
function addShell(b, F, S) {
  const base = b.pos.length / 3; const nb = 26, nd = 10, hy = -0.45 * S;
  const W = (x, y, z) => [0, 1, 2].map((k) => F.O[k] + F.U[k] * x + F.V[k] * y + F.N[k] * z);
  const ribs = 9;
  for (let i = 0; i <= nd; i++) for (let j = 0; j <= nb; j++) {
    const beta = (-72 + 144 * j / nb) * D2R, f = 0.06 + 0.94 * i / nd;
    const ribPhase = Math.cos(ribs * beta * 1.25);
    const Rd = S * (1 + 0.035 * ribPhase);
    const d = Rd * f, x = d * Math.sin(beta), y = hy + d * Math.cos(beta);
    const dome = Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.2))) * Math.cos(beta * 0.6);
    const z = 0.22 * S * dome + 0.06 * S * f * (0.5 + 0.5 * ribPhase) * (1 - smooth(0.9, 1, f)) - 0.05 * S;
    b.pos.push(...W(x, y, z)); b.uv.push(j / nb, i / nd);
  }
  for (let i = 0; i < nd; i++) for (let j = 0; j < nb; j++) {
    const a = base + i * (nb + 1) + j, bb = base + (i + 1) * (nb + 1) + j, c = bb + 1, d = a + 1;
    b.idx.push(a, c, bb, a, d, c);
  }
  // hinge ears
  for (const sx of [-1, 1]) {
    const ears = [[0, 0], [0.28 * S, 0], [0.30 * S, 0.12 * S], [0.06 * S, 0.16 * S]];
    const eb = b.pos.length / 3;
    for (const [ex, ey] of ears) { b.pos.push(...W(sx * ex, hy - 0.06 * S + ey, 0.05 * S)); b.uv.push(0, 0); }
    if (sx > 0) b.idx.push(eb, eb + 1, eb + 2, eb, eb + 2, eb + 3); else b.idx.push(eb, eb + 2, eb + 1, eb, eb + 3, eb + 2);
  }
}

// Gadroon (convex lobe) offset: theta around, s along the lobe 0 (inner point) .. 1 (rounded outer tip).
function gadroon(theta, s, N, A, phase = 0) {
  if (s <= 0 || s >= 1) return 0;
  // teardrop lobe: narrow root, constant body, semicircular outer tip
  const tip = 0.8;
  let w = 0.9 * Math.min(1, Math.pow(s / 0.3, 0.5));
  if (s > tip) w *= Math.sqrt(Math.max(0, 1 - ((s - tip) / (1 - tip)) ** 2));
  let f = theta * N / TAU + phase; f = f - Math.floor(f) - 0.5;
  const q = 2 * Math.abs(f) / (w + 1e-6);
  if (q >= 1) return 0;
  return A * Math.pow(1 - q * q, 0.7) * Math.min(1, w / 0.5);
}
// Flute (concave channel) offset with rounded ends.
function flute(theta, s, N, depth, endLen = 0.08) {
  if (s <= 0 || s >= 1) return 0;
  const dEnd = Math.max(0, endLen - s, s - (1 - endLen)) / endLen;
  const w = 0.78 * Math.sqrt(Math.max(0, 1 - dEnd * dEnd));
  let f = theta * N / TAU; f = f - Math.floor(f) - 0.5;
  const q = 2 * Math.abs(f) / (w + 1e-6);
  if (q >= 1) return 0;
  return -depth * Math.sqrt(1 - q * q);
}

function namePart(name, geo, mat, opts) { const m = createPart(name, geo, mat, opts); m.name = name; return m; }

async function build() {
  const root = createRoot('PlazaFountain');
  const limestone = await materialRecipe('kiln.material.stone.v1', { baseColor: '#d6c8a8', roughness: 0.88 });
  const weathered = await materialRecipe('kiln.material.stone.v1', { baseColor: '#9c8d70', roughness: 0.93 });
  const bronze = await materialRecipe('kiln.material.painted-metal.v1', { baseColor: '#5f7a62', roughness: 0.55, metalness: 0.45 });
  limestone.name = 'Limestone'; weathered.name = 'WeatheredStone'; bronze.name = 'VerdigrisBronze';

  const oct = octCorner(8);

  // ===================== LOWER BASIN (octagon, 6.08 m across the coping flats) =====================
  const plinth = newBatch();
  addLoopSweep(plinth, 8, oct, yUpWorld, [
    [[3.10, 0.0], [3.10, 0.055]],
    [[3.10, 0.055], [3.07, 0.08]],
    [[3.07, 0.08], [2.95, 0.08]],
  ]);
  namePart('Basin_Plinth', batchGeo(plinth), weathered, { parent: root });

  const wall = newBatch();
  addLoopSweep(wall, 8, oct, yUpWorld, [
    arc(2.975, 0.11, 0.03, -90, 90, 8),                       // base torus
    [[2.975, 0.14], [2.95, 0.14]],                             // fillet
    arc(2.95, 0.18, 0.04, -90, -180, 6),                       // cavetto
    [[2.91, 0.18], [2.91, 0.41]],                              // die
    arc(2.91, 0.45, 0.04, -90, 0, 6),                          // bed ovolo
    [[2.95, 0.45], [2.995, 0.45]],                             // cap soffit
    [...arc(2.995, 0.4925, 0.0425, -90, 90, 10), [2.97, 0.542], [2.80, 0.548], [2.64, 0.544],
      ...arc(2.61, 0.508, 0.035, 90, 270, 8)],                  // nosing, worn top, inner nosing
    [[2.61, 0.473], [2.58, 0.473]],                            // inner soffit
    [[2.58, 0.473], [2.58, 0.44]],                             // clean stone above the tide line
  ]);
  // Bolection-framed panels on the eight die faces.
  const frameProfile = [[[0.022, -0.004], [0.022, 0.006]],
    [[0.022, 0.006], [0.019, 0.014], [0.012, 0.019], [0.004, 0.019], [-0.004, 0.014], [-0.010, 0.008], [-0.014, 0.002], [-0.016, -0.004]]];
  const tabletProfile = [[[0.0, -0.004], [0.0, 0.003]], [[0.0, 0.003], [-0.012, 0.009]]];
  for (let k = 0; k < 8; k++) {
    const th = k * 45 * D2R;
    const F = radialFrame(th, 2.91, 0.295);
    // U must run in the direction of increasing angle for consistent winding
    const U = [-Math.sin(th), 0, Math.cos(th)], V = [0, 1, 0], N = F.N;
    const toW = (u, v, h) => [0, 1, 2].map((c) => F.O[c] + U[c] * u + V[c] * v + N[c] * h);
    const rect = (hw, hh) => { const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; return (m, a) => [cs[m][0] * (hw + a), cs[m][1] * (hh + a)]; };
    addLoopSweep(wall, 4, rect(0.92, 0.055), toW, frameProfile);
    addLoopSweep(wall, 4, rect(0.885, 0.026), toW, tabletProfile);
    // tablet top
    const tb = wall.pos.length / 3; const hw = 0.885 - 0.012, hh = 0.026 - 0.012;
    for (const [cu, cv] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) { wall.pos.push(...toW(cu, cv, 0.009)); wall.uv.push(0, 0); }
    wall.idx.push(tb, tb + 2, tb + 1, tb, tb + 3, tb + 2);
  }
  namePart('Basin_Wall', batchGeo(wall), limestone, { parent: root });

  const basinIn = newBatch();
  addLoopSweep(basinIn, 8, oct, yUpWorld, [
    [[2.58, 0.44], [2.58, 0.14]],
    arc(2.54, 0.14, 0.04, 0, -90, 5),
    [[2.54, 0.10], [1.6, 0.10], [0.30, 0.10]],
  ]);
  // weathered lower course of the central block (below the tide line)
  addLoopSweep(basinIn, 8, oct, yUpWorld, [
    [[0.60, 0.085], [0.60, 0.18]],
    [[0.60, 0.18], [0.56, 0.21]],
    [[0.56, 0.21], [0.56, 0.46]],
  ]);
  namePart('Basin_Interior', batchGeo(basinIn), weathered, { parent: root });

  // ===================== PEDESTAL =====================
  const ped = newBatch();
  addLoopSweep(ped, 8, oct, yUpWorld, [
    [[0.56, 0.46], [0.56, 0.60]],
    arc(0.56, 0.64, 0.04, -90, 0, 6),
    [[0.60, 0.64], [0.60, 0.68]],
    [[0.60, 0.68], [0.58, 0.70]],
    [[0.58, 0.70], [0.30, 0.70]],
  ]);
  const vaseBody = curve((s) => {
    const y = 0.86 + 0.52 * s;
    const r = 0.17 + 0.135 * Math.cos(Math.PI / 2 * Math.pow(s, 1.25)) + 0.022 * Math.sin(Math.PI * Math.min(1, s / 0.35));
    return [r, y];
  }, 22);
  addRevolve(ped, [
    arc(0.36, 0.745, 0.045, -90, 90, 9),
    [[0.36, 0.79], [0.33, 0.79]],
    arc(0.33, 0.83, 0.04, -90, -180, 6),
    [[0.29, 0.83], [vaseBody[0][0], 0.86]],
  ], 64);
  const fluteRun = vaseBody;
  addRevolve(ped, [fluteRun], 96, (th, i) => flute(th, (i / (fluteRun.length - 1) - 0.12) / 0.80, 16, 0.016));
  const topR = vaseBody[vaseBody.length - 1][0];
  addRevolve(ped, [
    [[topR, 1.38], [0.175, 1.38]],
    arc(0.175, 1.405, 0.025, -90, 90, 8),
    curve((s) => [0.175 + 0.16 * s * s, 1.43 + 0.19 * s], 10),  // calyx under the leaves
  ], 64);
  // acanthus crown: 8 large leaves + 8 smaller between
  for (let k = 0; k < 8; k++) {
    const th = (k * 45 + 22.5) * D2R;
    addLeaf(ped, th, [[0.18, 1.43], [0.24, 1.53], [0.37, 1.60], [0.47, 1.53]], 0.115, 0.016, { lobes: 3, rows: 16, M: 10, cup: 0.22 });
    const th2 = k * 45 * D2R;
    addLeaf(ped, th2, [[0.17, 1.44], [0.21, 1.51], [0.29, 1.565], [0.355, 1.53]], 0.08, 0.014, { lobes: 2, rows: 12, M: 10, cup: 0.22 });
  }
  namePart('Pedestal', batchGeo(ped), limestone, { parent: root });

  // ===================== MIDDLE BOWL (2.2 m) =====================
  const mid = newBatch();
  const underMid = curve((t) => [0.18 + 0.85 * t, 1.58 + 0.25 * Math.pow(t, 2.2)], 26);
  addRevolve(mid, [underMid], 144, (th, i) => {
    const t = i / (underMid.length - 1); return gadroon(th, (t - 0.24) / 0.70, 24, 0.045, 0.5);
  });
  addRevolve(mid, [
    [[1.03, 1.83], [1.05, 1.83]],                               // soffit
    arc(1.05, 1.86, 0.03, -90, 90, 8),                          // bead
    [[1.05, 1.89], [1.06, 1.89]],
    [[1.06, 1.89], [1.06, 1.975]],                              // frieze band
    [...arc(1.06, 2.015, 0.04, -90, 0, 6), ...arc(1.055, 2.015, 0.045, 0, 180, 12).slice(1)], // lip roll
    [[1.01, 2.015], [1.01, 1.98]],
  ], 96);
  // lion masks at the four cardinal points, shells on the diagonals
  for (let k = 0; k < 4; k++) {
    addLionMask(mid, radialFrame(k * 90 * D2R, 1.055, 1.935), 0.092);
    addShell(mid, radialFrame((k * 90 + 45) * D2R, 1.055, 1.93), 0.10);
  }
  namePart('MiddleBowl', batchGeo(mid), limestone, { parent: root });

  const midIn = newBatch();
  addRevolve(midIn, [
    [[1.01, 1.98], [1.01, 1.92]],
    curve((s) => { const r = 1.01 - 0.89 * s; return [r, 1.725 + 0.195 * Math.pow((r - 0.12) / 0.89, 2.2)]; }, 20),
  ], 96);
  namePart('MiddleBowl_Interior', batchGeo(midIn), weathered, { parent: root });

  // ===================== UPPER STEM =====================
  const stem = newBatch();
  const shaft = [[0.13, 1.80], [0.128, 1.86], [0.132, 1.94], [0.125, 2.03], [0.108, 2.12], [0.09, 2.20], [0.078, 2.28], [0.074, 2.33]];
  addRevolve(stem, [
    [[0.16, 1.70], [0.16, 1.74]],
    arc(0.16, 1.77, 0.03, -90, 90, 8),
    [[0.16, 1.80], [0.13, 1.80]],
    shaft,
    [[0.074, 2.33], [0.075, 2.33]],
    arc(0.075, 2.35, 0.02, -90, 90, 6),
    curve((s) => [0.075 + 0.115 * s * s, 2.37 + 0.21 * s], 8),
  ], 48);
  for (let k = 0; k < 8; k++) {
    addLeaf(stem, (k * 45 + 22.5) * D2R, [[0.08, 2.37], [0.11, 2.45], [0.19, 2.52], [0.245, 2.485]], 0.06, 0.01, { lobes: 2, rows: 12, M: 8, cup: 0.22 });
  }
  namePart('UpperStem', batchGeo(stem), limestone, { parent: root });

  // ===================== UPPER BOWL (1.1 m) =====================
  const up = newBatch();
  const underUp = curve((t) => [0.10 + 0.40 * t, 2.55 + 0.25 * t * t], 18);
  addRevolve(up, [underUp], 96, (th, i) => {
    const t = i / (underUp.length - 1); return gadroon(th, (t - 0.18) / 0.80, 16, 0.022, 0.5);
  });
  const lipUp = arc(0.50, 2.845, 0.045, -90, 180, 12);
  addRevolve(up, [lipUp], 96, (th, i) => {
    const ang = -90 + 270 * i / (lipUp.length - 1);
    let f = th * 16 / TAU + 0.5; f = f - Math.floor(f) - 0.5;
    const scallop = Math.cos(Math.PI * f); // 1 at lobe centre, 0 at the notch
    return 0.016 * (scallop - 0.4) * (1 - smooth(60, 150, ang));
  });
  namePart('UpperBowl', batchGeo(up), limestone, { parent: root });

  const upIn = newBatch();
  addRevolve(upIn, [
    [[0.455, 2.845], [0.455, 2.82]],
    curve((s) => { const r = 0.455 - 0.385 * s; return [r, 2.68 + 0.14 * Math.pow(Math.max(0, (r - 0.10) / 0.355), 2)]; }, 14),
  ], 64);
  namePart('UpperBowl_Interior', batchGeo(upIn), weathered, { parent: root });

  // ===================== FINIAL: knop, cup and carved pinecone =====================
  const fin = newBatch();
  addRevolve(fin, [
    [[0.09, 2.66], [0.09, 2.70]],
    arc(0.09, 2.72, 0.02, -90, 90, 6),
    [[0.09, 2.74], [0.065, 2.74]],
    [[0.065, 2.74], [0.058, 2.82], [0.052, 2.90]],
    arc(0.052, 2.915, 0.015, -90, 90, 6),
    [[0.052, 2.93], [0.06, 2.95], [0.085, 2.99], [0.105, 3.02]],
    arc(0.095, 3.025, 0.01, -30, 150, 4),
    [[0.086, 3.03], [0.05, 3.03]],
  ], 48);
  for (let k = 0; k < 6; k++) {
    addLeaf(fin, (k * 60 + 30) * D2R, [[0.055, 2.94], [0.075, 2.98], [0.11, 3.02], [0.13, 3.01]], 0.03, 0.007, { lobes: 2, rows: 10, M: 8 });
  }
  // pinecone: diamond scales on two spiral families (8 and 13)
  {
    const rings = []; const nv = 30, M = 39, y0 = 3.0, Hc = 0.58, Rmax = 0.118;
    for (let i = 0; i <= nv; i++) {
      const v = 0.03 + 0.94 * i / nv;
      const R0 = Rmax * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.85)), 0.6) * (1.08 - 0.28 * v);
      const ring = [];
      for (let j = 0; j < M; j++) {
        const th = j / M * TAU;
        let p1 = 8 * th / TAU + 6 * v, p2 = 13 * th / TAU - 6 * v;
        p1 -= Math.floor(p1); p2 -= Math.floor(p2);
        const bump = Math.pow(Math.sin(Math.PI * p1) * Math.sin(Math.PI * p2), 0.6);
        const R = R0 * (0.86 + 0.2 * bump * Math.min(1, v * 6) * Math.min(1, (1 - v) * 5));
        ring.push([R * Math.cos(th), y0 + Hc * v, R * Math.sin(th)]);
      }
      rings.push(ring);
    }
    addTube(fin, rings, [0, y0, 0], [0, y0 + Hc, 0]);
  }
  namePart('Finial', batchGeo(fin), limestone, { parent: root });

  // ===================== BRONZE SPOUTS (mouths of the lion masks + pinecone tip) =====================
  const sp = newBatch();
  const pipe = cylinderGeo(0.008, 0.010, 0.09, 10);
  const ring = cylinderGeo(0.0125, 0.0125, 0.01, 10);
  for (let k = 0; k < 4; k++) {
    const th = k * 90 * D2R;
    const dir = new THREE.Vector3(Math.cos(th) * Math.cos(12 * D2R), -Math.sin(12 * D2R), Math.sin(th) * Math.cos(12 * D2R));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const c0 = new THREE.Vector3(1.055 * Math.cos(th), 1.935 - 0.034, 1.055 * Math.sin(th));
    const m = new THREE.Matrix4().compose(c0.clone().addScaledVector(dir, 0.06), q, new THREE.Vector3(1, 1, 1));
    addGeometry(sp, pipe, m);
    const m2 = new THREE.Matrix4().compose(c0.clone().addScaledVector(dir, 0.10), q, new THREE.Vector3(1, 1, 1));
    addGeometry(sp, ring, m2);
  }
  {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 3.575, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    addGeometry(sp, cylinderGeo(0.008, 0.012, 0.03, 10), m);
  }
  namePart('Spouts', batchGeo(sp), bronze, { parent: root });

  root.userData.waterLines = {
    lower: { y: WATER.lower.y, inscribedRadius: WATER.lower.r, cornerRadius: +(WATER.lower.r / Math.cos(Math.PI / 8)).toFixed(4) },
    middle: { y: WATER.middle.y, radius: WATER.middle.r },
    upper: { y: WATER.upper.y, radius: WATER.upper.r },
  };
  return root;
}
