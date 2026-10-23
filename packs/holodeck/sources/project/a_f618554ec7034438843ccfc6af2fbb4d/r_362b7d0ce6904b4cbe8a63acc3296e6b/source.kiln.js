/** Which piece to build: one of the PIECES keys, or 'lineup' to review every piece together. */
const VARIANT = 'shells_wrack';
const meta = {
  name: VARIANT === 'lineup' ? 'Crescent Cove strand-line debris lineup' : `Crescent Cove debris ${VARIANT}`,
  role: 'prop',
};

// Crescent Cove beach and grove debris (Holodeck world tropical-island).
// Asset frame: metres, +Y up, origin at the ground contact; pieces sink a little below Y=0 so they sit in
// the sand on gentle slopes. Driftwood uses the library material cove-driftwood (grain along V, 1 m tile):
// tubes map U around the circumference and V along the length, both in metres. Fronds, nuts, shells and
// wrack share one 512x4 strip material whose bands carry a darker or lighter stripe at their centre.
// Static pieces: no wind weights.

const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

/** Deterministic mulberry32 stream. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- materials
const SAMPLER = { minFilter: 'linear-mipmap-linear', magFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' };
const librarySpec = (hash, name) => ({
  schemaVersion: 3, model: 'pbrMetallicRoughness', name, roughness: 1, metalness: 0,
  textures: {
    baseColor: { kind: 'resource', resourceId: `kiln.library.${hash}.base-color`, sampler: SAMPLER },
    normal: { kind: 'resource', resourceId: `kiln.library.${hash}.normal`, sampler: SAMPLER },
    metallicRoughness: { kind: 'resource', resourceId: `kiln.library.${hash}.metallic-roughness`, sampler: SAMPLER },
  },
});
const DRIFTWOOD_SPEC = librarySpec('75fffc14ed1aa96150c92561425e7f63ce5b00db1be58d3324c13f92ef6e3cd5', 'Driftwood');
const SAND_SPEC = librarySpec('ebba050eb4413a171f9ecade01346f3c3fe1a91d97136944b64600416c5264fb', 'ReviewSand');

const BAND_PX = 16;
const STRIP_W = 512;
const BANDS = {
  frondDry: { i: 0, base: [182, 156, 104], mid: [150, 124, 80] },
  frondGrey: { i: 1, base: [156, 146, 126], mid: [128, 118, 100] },
  frondBrown: { i: 2, base: [124, 94, 60], mid: [98, 72, 46] },
  frondFresh: { i: 3, base: [196, 164, 72], mid: [168, 138, 58] },
  rachis: { i: 4, base: [170, 146, 100], mid: [146, 122, 82] },
  sheath: { i: 5, base: [138, 108, 72], mid: [112, 84, 56] },
  nutGreen: { i: 6, base: [104, 128, 50], mid: [86, 108, 42] },
  nutBrown: { i: 7, base: [126, 90, 54], mid: [104, 72, 42] },
  nutGrey: { i: 8, base: [138, 124, 104], mid: [116, 102, 84] },
  fibre: { i: 9, base: [196, 168, 118], mid: [170, 140, 96] },
  shellWhite: { i: 10, base: [234, 226, 208], mid: [214, 204, 184] },
  shellTan: { i: 11, base: [214, 184, 146], mid: [186, 150, 112] },
  shellBrown: { i: 12, base: [160, 116, 82], mid: [220, 200, 170] },
  cowrie: { i: 13, base: [196, 160, 110], mid: [238, 228, 208] },
  coral: { i: 14, base: [228, 224, 212], mid: [206, 200, 186] },
  wrackDark: { i: 15, base: [96, 80, 52] },
  wrackOlive: { i: 16, base: [122, 112, 64] },
  sprout: { i: 17, base: [110, 150, 60], mid: [150, 184, 92] },
};
/** U inside a band: f = -1 and +1 are the band edges, 0 is the centre stripe. */
const bandU = (b, f) => (b.i * BAND_PX + 1.5 + (BAND_PX - 3) * (0.5 + 0.5 * f)) / STRIP_W;

function makeStripMaterial() {
  const ops = [];
  for (const b of Object.values(BANDS)) {
    ops.push({ op: 'paint', shape: { kind: 'rectangle', x: b.i * BAND_PX, y: 0, width: BAND_PX, height: 4 }, rgba: [...b.base, 255] });
    if (b.mid) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: b.i * BAND_PX + 7, y: 0, width: 2, height: 4 }, rgba: [...b.mid, 255] });
  }
  const strip = proceduralTexture({
    schemaVersion: 3, width: STRIP_W, height: 4, usage: 'albedo', name: 'DebrisStrip',
    background: [170, 150, 110, 255], operations: ops,
  });
  const mat = pbrMaterial({ albedo: strip, roughness: 0.85, metalness: 0, doubleSided: true });
  mat.name = 'Debris';
  return mat;
}

// ---------------------------------------------------------------- mesh builder
function makeMesh() {
  const p = [];
  const uv = [];
  const nr = [];
  const idx = [];
  const P = (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  return {
    /** Vertex with optional explicit normal; vertices without one get accumulated face normals. */
    v(pos, u, w, n) {
      p.push(pos[0], pos[1], pos[2]);
      uv.push(u, w);
      nr.push(n ? V.norm(n) : null);
      return p.length / 3 - 1;
    },
    t(a, b, c) {
      idx.push(a, b, c);
    },
    pos: P,
    triangles: () => idx.length / 3,
    geometry() {
      const acc = new Array(p.length).fill(0);
      for (let i = 0; i < idx.length; i += 3) {
        const a = P(idx[i]);
        const f = V.cross(V.sub(P(idx[i + 1]), a), V.sub(P(idx[i + 2]), a));
        for (let k = 0; k < 3; k++) {
          const q = idx[i + k] * 3;
          acc[q] += f[0];
          acc[q + 1] += f[1];
          acc[q + 2] += f[2];
        }
      }
      const n = [];
      for (let i = 0; i < nr.length; i++) {
        const a = [acc[3 * i], acc[3 * i + 1], acc[3 * i + 2]];
        const v = nr[i] || (V.len(a) < 1e-12 ? [0, 1, 0] : V.norm(a));
        n.push(v[0], v[1], v[2]);
      }
      return meshGeo({ positions: p, normals: n, uvs: uv, indices: idx });
    },
  };
}

/** Orthonormal frame: d along, s across, n the part of `up` normal to d. */
function frame(dir, up) {
  const d = V.norm(dir);
  let s = V.cross(up || [0, 1, 0], d);
  if (V.len(s) < 1e-5) s = V.cross([1, 0, 0], d);
  s = V.norm(s);
  return { d, s, n: V.cross(d, s) };
}

/** Point and unit tangent at fraction t along a polyline (by vertex index). */
function along(path, t) {
  const f = clamp01(t) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  return { p: V.lerp(path[i], path[i + 1], f - i), d: V.norm(V.sub(path[i + 1], path[i])) };
}

// ---------------------------------------------------------------- wood
/** Wood tube: rings of sides+1 vertices (seam duplicated); U = arc length around, V = length along (metres). */
function woodTube(m, path, radius, sides, v0) {
  let prevN = null;
  let run = v0 || 0;
  const rings = [];
  for (let k = 0; k < path.length; k++) {
    if (k > 0) run += V.len(V.sub(path[k], path[k - 1]));
    const t = k / (path.length - 1);
    const T = V.norm(V.sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
    let N = prevN ? V.sub(prevN, V.mul(T, V.dot(prevN, T))) : V.cross(T, Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    N = V.norm(N);
    prevN = N;
    const B = V.cross(T, N);
    const r0 = radius(t, 0);
    const ids = [];
    for (let j = 0; j <= sides; j++) {
      const ang = (j / sides) * TAU;
      const radial = V.add(V.mul(N, Math.cos(ang)), V.mul(B, Math.sin(ang)));
      ids.push(m.v(V.add(path[k], V.mul(radial, radius(t, ang))), (j / sides) * TAU * r0, run, radial));
    }
    rings.push({ ids, T, N, B, center: path[k], r: r0 });
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[k].ids[j];
      const b = rings[k].ids[j + 1];
      const c = rings[k + 1].ids[j + 1];
      const e = rings[k + 1].ids[j];
      m.t(a, b, c);
      m.t(a, c, e);
    }
  }
  return rings;
}

/** Close a tube end with a fan to a splintered point `depth` radii beyond the ring, off-centre by `skew`. */
function breakCap(m, ring, out, depth, skew) {
  const tip = V.add(V.add(ring.center, V.mul(out, depth * ring.r)), V.mul(ring.N, skew * ring.r));
  const c = m.v(tip, 0, 0);
  const rim = ring.ids.slice(0, -1).map((id) => {
    const q = m.pos(id);
    const rel = V.sub(q, ring.center);
    return m.v(q, V.dot(rel, ring.N), V.dot(rel, ring.B));
  });
  const flip = V.dot(out, ring.T) < 0;
  for (let j = 0; j < rim.length; j++) {
    const a = rim[j];
    const b = rim[(j + 1) % rim.length];
    if (flip) m.t(c, a, b);
    else m.t(c, b, a);
  }
}

/** Bleached log, about 3.6 m, half sunk in sand: twisted checks, a splintered tip, a root plate and stubs. */
function driftwoodLog(m, rand) {
  const L = 3.6;
  const segs = 14;
  const rAt = (t) => 0.19 - 0.1 * t + 0.09 * Math.max(0, 1 - t / 0.14) ** 2;
  const path = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    path.push([-1.4 + t * L, rAt(t) * (0.3 + 0.3 * t), 0.16 * Math.sin(t * Math.PI * 1.15) - 0.05]);
  }
  const checks = [0.9, 2.6, 4.4].map((a) => a + rand() * 0.4);
  const radius = (t, ang) => {
    let s = 1 + 0.07 * Math.sin(3 * ang + 1.3 + t * 2.4) + 0.04 * Math.sin(5 * ang + t * 6);
    for (const a0 of checks) {
      const d = Math.atan2(Math.sin(ang - a0 - t * 0.8), Math.cos(ang - a0 - t * 0.8));
      s -= 0.12 * Math.exp(-((d / 0.1) ** 2));
    }
    return rAt(t) * s;
  };
  const rings = woodTube(m, path, radius, 12, 0);
  const last = rings[rings.length - 1];
  breakCap(m, last, last.T, 0.45, 0.3);
  breakCap(m, rings[0], V.mul(rings[0].T, -1), 0.25, 0);
  // Root plate: gnarled roots wander out sideways and back, a few rising, the rest lost in the sand.
  const rootEnd = path[0];
  for (let i = 0; i < 10; i++) {
    const az = (i / 10) * TAU + rand() * 0.4;
    const spread = rad(55 + rand() * 45);
    const dir0 = V.norm([-Math.cos(spread), 0.7 * Math.sin(spread) * Math.sin(az), Math.sin(spread) * Math.cos(az)]);
    if (dir0[1] < -0.25) continue;
    const len = 0.3 + rand() * 0.8;
    const r0 = 0.045 + rand() * 0.03;
    let pos = V.add(rootEnd, V.mul(dir0, rAt(0) * 0.5));
    let dir = dir0;
    const rpath = [pos];
    for (let k = 1; k <= 6; k++) {
      dir = V.norm(V.add(dir, [(rand() - 0.5) * 0.6, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.6]));
      pos = V.add(pos, V.mul(dir, len / 6));
      pos[1] = Math.max(pos[1], r0 * 0.3 - 0.02);
      rpath.push(pos);
    }
    const rr = woodTube(m, rpath, (t) => r0 * (1 - 0.6 * t), 6, rand() * 3);
    const end = rr[rr.length - 1];
    breakCap(m, end, end.T, 0.5, 0.2);
  }
  for (const t0 of [0.42, 0.7]) {
    const { p, d } = along(path, t0);
    const side = V.norm(V.cross([0, 1, 0], d));
    const sg = t0 < 0.5 ? 1 : -1;
    const dir = V.norm(V.add(V.add(V.mul(side, sg * 0.8), V.mul(d, 0.5)), [0, 0.55, 0]));
    const len = 0.3 + rand() * 0.25;
    const spath = [0, 1, 2, 3].map((k) => V.add(p, V.mul(dir, (k / 3) * len)));
    const sr = woodTube(m, spath, (t) => 0.055 * (1 - 0.4 * t), 6, rand() * 3);
    const end = sr[sr.length - 1];
    breakCap(m, end, end.T, 0.4, 0.4);
  }
}

/** Tangle of smaller branches and twigs, later ones resting on earlier ones. */
function driftwoodPile(m, rand) {
  const placed = [];
  const restY = (q, r) => {
    let y = r * 0.7;
    for (const b of placed) {
      for (let k = 0; k < b.path.length; k++) {
        const d = Math.hypot(q[0] - b.path[k][0], q[2] - b.path[k][2]);
        const lim = r + b.rads[k];
        if (d < lim) y = Math.max(y, b.path[k][1] + Math.sqrt(lim * lim - d * d) * 0.9);
      }
    }
    return y;
  };
  const branches = 7;
  for (let i = 0; i < branches; i++) {
    const len = 0.9 + rand() * 1.2;
    const r0 = 0.028 + rand() * 0.045;
    const yawA = (i / branches) * Math.PI + rand() * 0.6;
    const h = [Math.cos(yawA), 0, Math.sin(yawA)];
    const sideH = [-h[2], 0, h[0]];
    const c = [(rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.6];
    const bendSign = rand() < 0.5 ? 1 : -1;
    const segs = 8;
    const path = [];
    const rads = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const s = (t - 0.5) * len;
      const bend = bendSign * 0.07 * len * Math.sin(t * Math.PI);
      const r = r0 * (1 - 0.45 * t);
      const q = [c[0] + h[0] * s + sideH[0] * bend, 0, c[2] + h[2] * s + sideH[2] * bend];
      q[1] = restY(q, r);
      path.push(q);
      rads.push(r);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k <= segs; k++) {
        const lo = Math.max(k > 0 ? path[k - 1][1] - 0.05 : 0, k < segs ? path[k + 1][1] - 0.05 : 0);
        path[k][1] = Math.max(path[k][1], lo);
      }
    }
    const rings = woodTube(m, path, (t, ang) => r0 * (1 - 0.45 * t) * (1 + 0.06 * Math.sin(3 * ang + i)), 7, rand() * 2);
    breakCap(m, rings[0], V.mul(rings[0].T, -1), 0.3, 0.2);
    const end = rings[rings.length - 1];
    breakCap(m, end, end.T, 0.45, 0.3);
    placed.push({ path, rads });
    const twigs = Math.floor(rand() * 3);
    for (let k = 0; k < twigs; k++) {
      const { p, d } = along(path, 0.25 + rand() * 0.6);
      const sg = rand() < 0.5 ? 1 : -1;
      const dir = V.norm(V.add(V.add(V.mul(V.norm(V.cross([0, 1, 0], d)), sg), V.mul(d, 0.6)), [0, 0.25 + rand() * 0.3, 0]));
      const tl = 0.2 + rand() * 0.3;
      const tpath = [0, 1, 2, 3].map((j) => V.add(p, V.mul(dir, (j / 3) * tl)));
      const tr = woodTube(m, tpath, (t) => r0 * 0.4 * (1 - 0.5 * t), 4, rand() * 2);
      const tend = tr[tr.length - 1];
      breakCap(m, tend, tend.T, 0.5, 0);
    }
  }
}

// ---------------------------------------------------------------- strip-material pieces
/** Flat strip leaf on a grid: droop curls it toward its underside, fold lifts the edges into a V. */
function blade(m, o) {
  const { d, s, n } = frame(o.dir, o.up);
  const fold = Math.tan(rad(o.fold || 0));
  const droop = rad(o.droop || 0);
  const rows = [];
  let pos = o.base;
  let prev = d;
  for (let i = 0; i <= o.segs; i++) {
    const t = i / o.segs;
    const a = droop * Math.pow(t, 1.6);
    const dt = V.sub(V.mul(d, Math.cos(a)), V.mul(n, Math.sin(a)));
    const nt = V.add(V.mul(n, Math.cos(a)), V.mul(d, Math.sin(a)));
    if (i > 0) pos = V.add(pos, V.mul(V.norm(V.add(dt, prev)), o.len / o.segs));
    prev = dt;
    const hw = o.width * Math.max(0.05, o.shape(t));
    rows.push([-1, 0, 1].map((f) => m.v(V.add(V.add(pos, V.mul(s, f * hw)), V.mul(nt, Math.abs(f) * hw * fold)), bandU(o.band, f), 0.5)));
  }
  for (let i = 0; i < o.segs; i++) {
    for (let j = 0; j < 2; j++) {
      const a = rows[i][j];
      const b = rows[i][j + 1];
      const c = rows[i + 1][j + 1];
      const e = rows[i + 1][j];
      m.t(a, c, b);
      m.t(a, e, c);
    }
  }
}

/** Thin closed-sided tube in a strip band (rachis, coral, sprout stalk). */
function stripTube(m, path, radius, sides, band) {
  let prevN = null;
  const rings = [];
  for (let k = 0; k < path.length; k++) {
    const t = k / (path.length - 1);
    const T = V.norm(V.sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
    let N = prevN ? V.sub(prevN, V.mul(T, V.dot(prevN, T))) : V.cross(T, Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    N = V.norm(N);
    prevN = N;
    const B = V.cross(T, N);
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * TAU;
      const radial = V.add(V.mul(N, Math.cos(ang)), V.mul(B, Math.sin(ang)));
      ring.push(m.v(V.add(path[k], V.mul(radial, radius(t))), bandU(band, Math.cos(ang)), 0.5, radial));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[k][j];
      const b = rings[k][(j + 1) % sides];
      const c = rings[k + 1][(j + 1) % sides];
      const e = rings[k + 1][j];
      m.t(a, b, c);
      m.t(a, c, e);
    }
  }
  return rings;
}

/** Closed surface of revolution about `axis` from a radius profile; `lobes` adds a rounded-polygon section. */
function revolve(m, o) {
  const { d, s, n } = frame(o.axis, o.up || [0, 1, 0]);
  const at = (x, a, r) => V.add(V.add(o.center, V.mul(d, x)), V.add(V.mul(s, Math.cos(a) * r), V.mul(n, Math.sin(a) * r)));
  const rings = [];
  for (let i = 1; i < o.rings; i++) {
    const t = i / o.rings;
    const x = (t - 0.5) * o.length;
    const ring = [];
    for (let j = 0; j < o.sides; j++) {
      const a = (j / o.sides) * TAU + (o.roll || 0);
      const r = o.radius * o.profile(t) * (1 + (o.lobes ? o.lobeDepth * Math.cos(o.lobes * a) : 0));
      ring.push(m.v(at(x, a, r), bandU(o.band, o.stripe ? Math.cos(o.stripe * a) : 0.6), 0.5));
    }
    rings.push(ring);
  }
  const back = m.v(V.add(o.center, V.mul(d, -0.5 * o.length)), bandU(o.band, 0.6), 0.5);
  const front = m.v(V.add(o.center, V.mul(d, 0.5 * o.length)), bandU(o.band, o.tipStripe ? 0 : 0.6), 0.5);
  const S = o.sides;
  for (let j = 0; j < S; j++) m.t(back, rings[0][(j + 1) % S], rings[0][j]);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = rings[i][j];
      const b = rings[i][(j + 1) % S];
      const c = rings[i + 1][(j + 1) % S];
      const e = rings[i + 1][j];
      m.t(a, b, c);
      m.t(a, c, e);
    }
  }
  const lastRing = rings[rings.length - 1];
  for (let j = 0; j < S; j++) m.t(front, lastRing[j], lastRing[(j + 1) % S]);
}

/** Open shell bowl (split husk half or clam valve): outer and inner skins joined at the rim. */
function bowl(m, o) {
  const { d, s, n } = frame(o.up, [1, 0, 0]);
  const pt = (phi, a, r) => {
    const rr = r * Math.sin(phi);
    return V.add(o.center, V.add(V.mul(d, -r * Math.cos(phi) * o.depth), V.add(V.mul(s, Math.cos(a) * rr * o.aspect), V.mul(n, Math.sin(a) * rr))));
  };
  const skins = [];
  for (const [r, band, sign] of [[o.radius, o.outer, 1], [o.radius - o.thickness, o.inner, -1]]) {
    const pole = m.v(pt(0, 0, r), bandU(band, 0), 0.5);
    const rings = [];
    for (let i = 1; i <= o.rings; i++) {
      const phi = (i / o.rings) * (Math.PI / 2);
      const ring = [];
      for (let j = 0; j < o.sides; j++) {
        const a = (j / o.sides) * TAU;
        const rib = o.ribs ? 1 + 0.06 * Math.cos(o.ribs * a) * (i / o.rings) : 1;
        ring.push(m.v(pt(phi, a, r * rib), bandU(band, o.ribs ? Math.cos(o.ribs * a) : 0.5), 0.5));
      }
      rings.push(ring);
    }
    const S = o.sides;
    for (let j = 0; j < S; j++) {
      if (sign > 0) m.t(pole, rings[0][j], rings[0][(j + 1) % S]);
      else m.t(pole, rings[0][(j + 1) % S], rings[0][j]);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < S; j++) {
        const a = rings[i][j];
        const b = rings[i][(j + 1) % S];
        const c = rings[i + 1][(j + 1) % S];
        const e = rings[i + 1][j];
        if (sign > 0) {
          m.t(a, c, b);
          m.t(a, e, c);
        } else {
          m.t(a, b, c);
          m.t(a, c, e);
        }
      }
    }
    skins.push(rings[rings.length - 1]);
  }
  if (o.thickness > 0) {
    const [outer, inner] = skins;
    for (let j = 0; j < o.sides; j++) {
      const k = (j + 1) % o.sides;
      m.t(outer[j], inner[k], outer[k]);
      m.t(outer[j], inner[j], inner[k]);
    }
  }
}

const leafletShape = (t) => (t < 0.1 ? 0.5 + 5 * t : 1 - 0.85 * t * t);

/** Fallen coconut frond: curved rachis on the sand, a curled sheath at the base, leaflets splayed flat, some missing. */
function fallenFrond(m, rand, o) {
  const segs = 10;
  const h = [Math.cos(o.yaw), 0, Math.sin(o.yaw)];
  const side0 = [-h[2], 0, h[0]];
  const pts = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const s = t * o.len;
    const lateral = o.curve * o.len * t * t;
    pts.push([o.base[0] + h[0] * s + side0[0] * lateral, o.lift + 0.03 + 0.07 * (1 - t) ** 2, o.base[2] + h[2] * s + side0[2] * lateral]);
  }
  stripTube(m, pts, (t) => 0.038 - 0.028 * t, 4, BANDS.rachis);
  // Base sheath: a trough of fibrous husk that once wrapped the trunk, opening upward behind the rachis.
  const sheathRings = [];
  for (let k = 0; k <= 3; k++) {
    const c = V.add(pts[0], V.mul(h, -0.12 * k));
    const ring = [];
    for (let j = 0; j <= 6; j++) {
      const a = rad(-110 + (220 * j) / 6);
      const r = 0.08 + 0.05 * k;
      ring.push(m.v([c[0] + side0[0] * Math.sin(a) * r, o.lift + 0.02 + r * (1 - Math.cos(a)) * 0.9, c[2] + side0[2] * Math.sin(a) * r], bandU(BANDS.sheath, Math.cos(a * 3)), 0.5));
    }
    sheathRings.push(ring);
  }
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 6; j++) {
      const a = sheathRings[k][j];
      const b = sheathRings[k][j + 1];
      const c = sheathRings[k + 1][j + 1];
      const e = sheathRings[k + 1][j];
      m.t(a, b, c);
      m.t(a, c, e);
    }
  }
  for (let k = 0; k < o.pairs; k++) {
    const t = 0.2 + 0.78 * (k / (o.pairs - 1));
    const { p, d } = along(pts, t);
    const sideN = V.norm(V.cross([0, 1, 0], d));
    for (const sg of [-1, 1]) {
      if (rand() < o.missing) continue;
      const broken = rand() < 0.2;
      const len = (0.35 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.15 + t))) * (broken ? 0.35 + rand() * 0.3 : 0.85 + rand() * 0.3);
      const ang = rad(38 + rand() * 28);
      const dir = V.norm(V.add(V.mul(d, Math.cos(ang)), V.mul(sideN, sg * Math.sin(ang))));
      blade(m, {
        base: p, dir: V.norm([dir[0], -0.1 - 0.1 * rand(), dir[2]]), up: [0, 1, 0], len, width: 0.026 + rand() * 0.01,
        shape: leafletShape, fold: 18 + rand() * 22, droop: -10 + rand() * 25, segs: 2,
        band: rand() < 0.7 ? o.band : o.band2,
      });
    }
  }
}

/** Two dry fronds crossing, one older and greyer. */
function fronds(m, rand) {
  fallenFrond(m, rand, { base: [-2.0, 0, -0.35], yaw: 0.12, len: 4.2, curve: 0.07, pairs: 34, missing: 0.12, band: BANDS.frondDry, band2: BANDS.frondFresh, lift: 0 });
  fallenFrond(m, rand, { base: [1.2, 0, -1.5], yaw: 2.0, len: 3.3, curve: -0.09, pairs: 28, missing: 0.25, band: BANDS.frondGrey, band2: BANDS.frondBrown, lift: 0.02 });
}

/** Husked coconut: a rounded-triangular ovoid, about 0.28 m. */
function coconut(m, o) {
  revolve(m, {
    center: o.center, axis: o.axis, up: [0, 1, 0], length: o.size, radius: o.size * 0.4, rings: 6, sides: 7, roll: o.roll,
    profile: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8), lobes: 3, lobeDepth: 0.1, band: o.band, stripe: 3,
  });
}

/** Fallen nuts under a palm: three whole husks, one sprouting, and a split husk in two halves. */
function coconuts(m, rand) {
  const nuts = [
    { center: [0, 0.1, 0], size: 0.29, band: BANDS.nutBrown, yaw: 0.4 },
    { center: [0.38, 0.1, 0.22], size: 0.27, band: BANDS.nutGreen, yaw: 2.1 },
    { center: [-0.55, 0.09, 0.45], size: 0.26, band: BANDS.nutGrey, yaw: 4.0 },
    { center: [0.6, 0.1, -0.45], size: 0.28, band: BANDS.nutBrown, yaw: 5.2 },
  ];
  for (const nut of nuts) {
    coconut(m, { center: nut.center, axis: [Math.cos(nut.yaw), -0.08, Math.sin(nut.yaw)], size: nut.size, band: nut.band, roll: rand() * TAU });
  }
  // The last nut sprouts: a short stalk and three pleated juvenile leaves.
  const base = V.add(nuts[3].center, [Math.cos(nuts[3].yaw) * 0.1, 0.08, Math.sin(nuts[3].yaw) * 0.1]);
  stripTube(m, [base, V.add(base, [0.01, 0.08, 0.0]), V.add(base, [0.02, 0.15, 0.01])], (t) => 0.018 - 0.008 * t, 4, BANDS.sprout);
  const top = V.add(base, [0.02, 0.15, 0.01]);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.2 + 0.5;
    blade(m, {
      base: top, dir: [Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35], up: [Math.cos(a), 0, Math.sin(a)], len: 0.32 + 0.08 * k, width: 0.03,
      shape: (t) => Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)), fold: 25, droop: 40 + 15 * k, segs: 3, band: BANDS.sprout,
    });
  }
  // Split husk: one half cup-up showing the fibre, the other dome-up beside it.
  bowl(m, { center: [-0.2, 0.11, -0.45], up: [0.15, 1, 0.1], radius: 0.14, depth: 0.85, aspect: 1.25, thickness: 0.035, rings: 3, sides: 8, outer: BANDS.nutBrown, inner: BANDS.fibre });
  bowl(m, { center: [-0.62, 0.0, -0.12], up: [0.2, -1, 0.1], radius: 0.14, depth: 0.85, aspect: 1.25, thickness: 0.035, rings: 3, sides: 8, outer: BANDS.nutGrey, inner: BANDS.fibre });
}

/** Strand-line scatter along local Z (2.4 m): shells, coral rubble and wrack. */
function strandline(m, rand) {
  const spot = () => [(rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 2.4];
  const flat = () => {
    const a = rand() * TAU;
    return [Math.cos(a), (rand() - 0.5) * 0.3, Math.sin(a)];
  };
  for (let i = 0; i < 6; i++) {
    const q = spot();
    const size = 0.05 + rand() * 0.04;
    const axis = flat();
    revolve(m, {
      center: [q[0], size * 0.25, q[2]], axis, length: size * 1.4, radius: size * 0.55, rings: 3, sides: 6, roll: rand() * TAU,
      profile: (t) => Math.pow(1 - t, 0.9) * Math.min(1, t * 6), band: rand() < 0.5 ? BANDS.shellBrown : BANDS.shellTan, stripe: 2,
    });
  }
  for (let i = 0; i < 4; i++) {
    const q = spot();
    const size = 0.055 + rand() * 0.03;
    revolve(m, {
      center: [q[0], size * 0.12, q[2]], axis: flat(), length: size, radius: size * 0.36, rings: 4, sides: 6, roll: 0,
      profile: (t) => Math.sin(Math.PI * t), band: BANDS.cowrie, stripe: 1,
    });
  }
  for (let i = 0; i < 7; i++) {
    const q = spot();
    const r = 0.04 + rand() * 0.03;
    const up = rand() < 0.5 ? [rand() * 0.3, 1, rand() * 0.3] : [rand() * 0.3, -1, rand() * 0.3];
    bowl(m, { center: [q[0], up[1] > 0 ? r * 0.55 : 0.004, q[2]], up, radius: r, depth: 0.45, aspect: 1.1, thickness: 0, rings: 2, sides: 7, ribs: 7,
      outer: rand() < 0.5 ? BANDS.shellWhite : BANDS.shellTan, inner: BANDS.shellWhite });
  }
  for (let i = 0; i < 10; i++) {
    const q = spot();
    const d = flat();
    const len = 0.06 + rand() * 0.1;
    const r = 0.008 + rand() * 0.007;
    const pts = [0, 1, 2].map((k) => [q[0] + d[0] * len * (k / 2 - 0.5), r * 0.6 + d[1] * len * 0.2 * (k / 2), q[2] + d[2] * len * (k / 2 - 0.5)]);
    stripTube(m, pts, (t) => r * (1 - 0.3 * t), 4, BANDS.coral);
    if (rand() < 0.5) {
      const mid = pts[1];
      const bd = V.norm([d[2] + rand() - 0.5, 0.4, -d[0]]);
      stripTube(m, [mid, V.add(mid, V.mul(bd, len * 0.45))], () => r * 0.7, 3, BANDS.coral);
    }
  }
  for (let i = 0; i < 12; i++) {
    const q = spot();
    const a = rand() * TAU;
    const len = 0.12 + rand() * 0.2;
    const w = 0.014 + rand() * 0.016;
    const band = rand() < 0.6 ? BANDS.wrackDark : BANDS.wrackOlive;
    const rows = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const wig = 0.04 * Math.sin(t * 5 + i);
      const c = [q[0] + Math.cos(a) * len * (t - 0.5) - Math.sin(a) * wig, 0.006, q[2] + Math.sin(a) * len * (t - 0.5) + Math.cos(a) * wig];
      const sx = -Math.sin(a) * w;
      const sz = Math.cos(a) * w;
      rows.push([m.v([c[0] - sx, c[1], c[2] - sz], bandU(band, -1), 0.5, [0, 1, 0]), m.v([c[0] + sx, c[1], c[2] + sz], bandU(band, 1), 0.5, [0, 1, 0])]);
    }
    for (let k = 0; k < 4; k++) {
      m.t(rows[k][0], rows[k + 1][1], rows[k][1]);
      m.t(rows[k][0], rows[k + 1][0], rows[k + 1][1]);
    }
  }
}

// ---------------------------------------------------------------- catalogue
const PIECES = {
  driftwood_log: { seed: 101, build: driftwoodLog, wood: true },
  driftwood_pile: { seed: 109, build: driftwoodPile, wood: true },
  fronds_fallen: { seed: 113, build: fronds },
  coconuts_husks: { seed: 127, build: coconuts },
  shells_wrack: { seed: 131, build: strandline },
};

function addPiece(parent, name, materials, offset, prefix) {
  const piece = PIECES[name];
  const m = makeMesh();
  piece.build(m, makeRandom(piece.seed));
  const part = createPart(prefix + 'debris', m.geometry(), piece.wood ? materials.wood : materials.strip, { parent, position: offset });
  part.name = prefix + 'debris';
  markOpenShell(part, 'Overlapping closed and open pieces: wood tubes with fan caps, single-sheet leaflets and shells, wrack strips.');
  return m.triangles();
}

/** Review-only sand floor (lineup mode). */
function addLineupGround(parent, material) {
  const [x0, x1, z0, z1] = [-3, 4, -2.5, 15];
  const geo = meshGeo({
    positions: [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [x0, z0, x1, z0, x1, z1, x0, z1],
    indices: [0, 2, 1, 0, 3, 2],
  });
  const part = createPart('lineup_ground', geo, material, { parent });
  part.name = 'lineup_ground';
  markOpenShell(part, 'Single-sided review floor; not part of any saved piece.');
}

async function build() {
  const materials = { strip: makeStripMaterial() };
  const needsWood = VARIANT === 'lineup' || PIECES[VARIANT].wood;
  if (needsWood) materials.wood = await compilePortableMaterialSpecV3(DRIFTWOOD_SPEC);
  const root = createRoot(VARIANT === 'lineup' ? 'DebrisLineup' : 'Debris');
  const triangles = {};
  if (VARIANT === 'lineup') {
    const row = [['driftwood_log', 0], ['driftwood_pile', 3.5], ['fronds_fallen', 7], ['coconuts_husks', 10.2], ['shells_wrack', 12.8]];
    for (const [n, z] of row) triangles[n] = addPiece(root, n, materials, [0, 0, z], n + '_');
    addLineupGround(root, await compilePortableMaterialSpecV3(SAND_SPEC));
  } else {
    triangles[VARIANT] = addPiece(root, VARIANT, materials, [0, 0, 0], '');
  }
  root.userData = { debrisVariant: VARIANT, groundY: 0, triangles };
  return root;
}
