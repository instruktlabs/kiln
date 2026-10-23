/** Which coral group to build: one of the GROUPS keys, or 'lineup' to review every group together. */
const VARIANT = 'rubble_patch';
const meta = {
  name: VARIANT === 'lineup' ? 'Crescent Cove coral lineup' : `Crescent Cove coral ${VARIANT}`,
  role: 'fill',
};

// Crescent Cove lagoon coral (Holodeck world tropical-island). Each asset is one composite coral group that
// the world places once per group. Asset frame: metres, +Y up, origin at the seabed contact; every piece
// reaches at least 0.1 m below Y=0, so a gently uneven seabed never shows a gap under it.
// Each group is one mesh primitive with one material: a 64x4 strip holding up to eight colour ramps of eight
// texels. TEXCOORD_0.x picks a ramp and a shade inside it (0 = shaded base, 1 = lit tips and margins), so base
// shading, mottling and pale tips come from the strip (Kiln has no vertex colours). TEXCOORD_0.y is unused.
//
// Holodeck tints the submerged seabed and, since its turn-8 upgrade, every placed object below the water, each at
// its own depth:
//   bed * T + scatter * (1 - T),  T = exp(-2 * depth * [0.9, 0.16, 0.11]),
//   scatter = mix(shallowColor, waterColor, smoothstep(1.5, 9, depth)),
// so a saved group carries the living colour only (a baked tint would be applied twice). The lineup still
// previews that tint at each group's typical depths (bases deeper than tips) beside the review seabed: reds
// vanish, and the variation that survives is in brightness and in the green-blue balance.

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
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

function hash3(i, j, k, seed) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x85ebca6b) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, roughly -1..1. */
function noise3(x, y, z, seed) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const fx = x - i;
  const fy = y - j;
  const fz = z - k;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      for (let c = 0; c < 2; c++) {
        r += hash3(i + a, j + b, k + c, seed) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
      }
    }
  }
  return 2 * r - 1;
}

/** Fractal noise at `freq` cycles per metre; typical values stay within about -0.5..0.5. */
function fbm(q, freq, octaves, seed) {
  let s = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    s += amp * noise3(q[0] * f, q[1] * f, q[2] * f, seed + 31 * o);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

// ---------------------------------------------------------------- water tint and colour ramps
const WATER = { shallow: [79, 210, 207], deep: [11, 74, 124], absorb: [0.9, 0.16, 0.11] }; // #4fd2cf, #0b4a7c
const toLinear = (c) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const toByte = (l) => {
  const x = clamp01(l);
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
};
/** Linear colour of a surface `depth` metres under the rest level, tinted as the terrain shader tints the seabed. */
function underwater(lin, depth) {
  const k = smoothstep(1.5, 9, depth);
  return lin.map((c, i) => {
    const T = Math.exp(-2 * depth * WATER.absorb[i]);
    const sc = toLinear(WATER.shallow[i]) + (toLinear(WATER.deep[i]) - toLinear(WATER.shallow[i])) * k;
    return c * T + sc * (1 - T);
  });
}

// Living colour before the water tint, sRGB stops from the shaded base (0) to lit tips and margins (1).
const RAMPS = {
  turf: [[0, [30, 30, 20]], [0.5, [70, 66, 42]], [0.8, [96, 90, 60]], [1, [128, 120, 88]]],
  turfBrown: [[0, [36, 28, 20]], [0.5, [84, 66, 44]], [0.8, [110, 90, 62]], [1, [140, 118, 86]]],
  coralline: [[0, [70, 46, 54]], [0.5, [150, 96, 116]], [1, [206, 156, 172]]],
  bleached: [[0, [96, 92, 82]], [0.5, [170, 164, 146]], [1, [214, 208, 192]]],
  brown: [[0, [40, 28, 18]], [0.5, [104, 78, 48]], [0.8, [132, 104, 70]], [1, [168, 140, 100]]],
  olive: [[0, [30, 34, 16]], [0.5, [84, 94, 44]], [0.8, [112, 122, 66]], [1, [150, 160, 98]]],
  purple: [[0, [36, 24, 40]], [0.5, [92, 64, 100]], [0.8, [120, 92, 128]], [1, [160, 130, 168]]],
  bluegreen: [[0, [24, 36, 36]], [0.5, [60, 90, 86]], [0.8, [84, 118, 112]], [1, [120, 154, 146]]],
  cream: [[0, [60, 48, 34]], [0.5, [150, 128, 94]], [1, [196, 178, 140]]],
  // living brown sides (to about 0.6), then the dead, algae-covered flat top of a microatoll
  microatoll: [[0, [36, 26, 18]], [0.4, [100, 76, 48]], [0.62, [112, 88, 58]], [0.8, [92, 90, 64]], [1, [132, 128, 98]]],
  stagTan: [[0, [50, 38, 26]], [0.45, [128, 100, 66]], [0.85, [176, 152, 112]], [1, [226, 212, 180]]],
  stagBlue: [[0, [40, 44, 46]], [0.45, [92, 108, 116]], [0.85, [130, 156, 180]], [1, [170, 200, 230]]],
  stagViolet: [[0, [46, 34, 28]], [0.45, [116, 90, 76]], [0.85, [150, 120, 160]], [1, [190, 150, 214]]],
  stagOlive: [[0, [40, 40, 24]], [0.45, [100, 102, 60]], [0.85, [146, 160, 104]], [1, [190, 210, 150]]],
  tableGreen: [[0, [26, 28, 18]], [0.5, [74, 80, 48]], [0.85, [104, 112, 70]], [1, [168, 178, 128]]],
  tableBrown: [[0, [34, 26, 18]], [0.5, [96, 76, 52]], [0.85, [128, 104, 74]], [1, [196, 176, 138]]],
  tableBlue: [[0, [28, 34, 38]], [0.5, [76, 92, 100]], [0.85, [104, 124, 136]], [1, [156, 182, 200]]],
  folioseOlive: [[0, [36, 38, 16]], [0.5, [108, 110, 50]], [0.85, [140, 142, 74]], [1, [186, 186, 112]]],
};

function rampLinear(stops, f) {
  let i = 0;
  while (i < stops.length - 2 && f > stops[i + 1][0]) i++;
  const [f0, c0] = stops[i];
  const [f1, c1] = stops[i + 1];
  const t = clamp01((f - f0) / (f1 - f0));
  return c0.map((c, k) => toLinear(c) + (toLinear(c1[k]) - toLinear(c)) * t);
}

const RAMP_TEXELS = 8;
const STRIP_W = 64;
/** U of shade s (0..1) inside ramp `slot`, between the centres of its first and last texels. */
const rampU = (slot, s) => (slot * RAMP_TEXELS + 0.5 + (RAMP_TEXELS - 1) * clamp01(s)) / STRIP_W;
const hex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

/** One strip per group: each texel is its ramp's living colour; the lineup previews it tinted at a depth between the
 *  group's base and top depths. */
function makeMaterial(group) {
  const ops = [];
  const baked = {};
  group.palette.forEach((key, slot) => {
    const row = [];
    for (let k = 0; k < RAMP_TEXELS; k++) {
      const f = k / (RAMP_TEXELS - 1);
      const depth = group.bake[0] + (group.bake[1] - group.bake[0]) * f;
      const lin = rampLinear(RAMPS[key], f);
      const rgb = (VARIANT === 'lineup' ? underwater(lin, depth) : lin).map(toByte);
      ops.push({ op: 'paint', shape: { kind: 'rectangle', x: slot * RAMP_TEXELS + k, y: 0, width: 1, height: 4 }, rgba: [...rgb, 255] });
      row.push(rgb);
    }
    baked[key] = [hex(row[1]), hex(row[4]), hex(row[7])];
  });
  const strip = proceduralTexture({
    schemaVersion: 3, width: STRIP_W, height: 4, usage: 'albedo', name: `Coral${group.name}Strip`,
    background: [40, 70, 66, 255], operations: ops,
  });
  const mat = pbrMaterial({ albedo: strip, roughness: 0.82, metalness: 0 });
  mat.name = `Coral${group.name}`;
  return { mat, baked };
}

// ---------------------------------------------------------------- mesh builder
function makeMesh() {
  const p = [];
  const uv = [];
  const idx = [];
  const P = (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  const faceN = (a, b, c) => V.cross(V.sub(P(b), P(a)), V.sub(P(c), P(a)));
  const push = (a, b, c, flip) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));
  return {
    v(pos, slot, s) {
      p.push(pos[0], pos[1], pos[2]);
      uv.push(rampU(slot, s), 0.5);
      return p.length / 3 - 1;
    },
    /** Triangle wound to face away from the point `inside`. */
    out(a, b, c, inside) {
      const mid = V.mul(V.add(V.add(P(a), P(b)), P(c)), 1 / 3);
      push(a, b, c, V.dot(faceN(a, b, c), V.sub(mid, inside)) < 0);
    },
    /** Triangle wound to face along `dir`. */
    dir(a, b, c, d) {
      push(a, b, c, V.dot(faceN(a, b, c), d) < 0);
    },
    triangles: () => idx.length / 3,
    bounds() {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p[i + k]);
          max[k] = Math.max(max[k], p[i + k]);
        }
      }
      return { min, max };
    },
    geometry() {
      const n = new Array(p.length).fill(0);
      for (let i = 0; i < idx.length; i += 3) {
        const f = faceN(idx[i], idx[i + 1], idx[i + 2]);
        for (let k = 0; k < 3; k++) {
          const q = idx[i + k] * 3;
          n[q] += f[0];
          n[q + 1] += f[1];
          n[q + 2] += f[2];
        }
      }
      for (let i = 0; i < n.length; i += 3) {
        const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
        if (l < 1e-12) {
          n[i] = 0;
          n[i + 1] = 1;
          n[i + 2] = 0;
        } else {
          n[i] /= l;
          n[i + 1] /= l;
          n[i + 2] /= l;
        }
      }
      return meshGeo({ positions: p, normals: n, uvs: uv, indices: idx });
    },
  };
}
const quadOut = (m, a, b, c, d, inside) => {
  m.out(a, b, c, inside);
  m.out(a, c, d, inside);
};
const quadDir = (m, a, b, c, d, dir) => {
  m.dir(a, b, c, dir);
  m.dir(a, c, d, dir);
};

// ---------------------------------------------------------------- pieces
/**
 * Closed lumpy head: a spherified cube from its top face down to yb (cube units; negative reaches under the
 * equator), closed underneath by a fan. o: { c, r, n, rows, yb, yaw?, bump?(q) -> radial factor,
 * flat? (height above which the top is pressed nearly flat), slot, shade(p) -> s }.
 */
function head(m, o) {
  const warp = (t) => Math.tan((t * Math.PI) / 4);
  const cy = Math.cos(o.yaw || 0);
  const sy = Math.sin(o.yaw || 0);
  const ids = new Map();
  const vid = (qx, qy, qz) => {
    const key = `${qx.toFixed(4)},${qy.toFixed(4)},${qz.toFixed(4)}`;
    let id = ids.get(key);
    if (id === undefined) {
      const d = V.norm([warp(qx), warp(qy), warp(qz)]);
      const e = [d[0] * o.r[0], d[1] * o.r[1], d[2] * o.r[2]];
      const l = [e[0] * cy - e[2] * sy, e[1], e[0] * sy + e[2] * cy];
      const k = o.bump ? o.bump(V.add(o.c, l)) : 1;
      let pos = V.add(o.c, V.mul(l, k));
      if (o.flat !== undefined && pos[1] > o.flat) pos = [pos[0], o.flat + (pos[1] - o.flat) * 0.15, pos[2]];
      id = m.v(pos, o.slot, o.shade(pos));
      ids.set(key, id);
    }
    return id;
  };
  const n = o.n;
  const g = (k) => -1 + (2 * k) / n;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      quadOut(m, vid(g(i), 1, g(k)), vid(g(i + 1), 1, g(k)), vid(g(i + 1), 1, g(k + 1)), vid(g(i), 1, g(k + 1)), o.c);
    }
  }
  const perim = (j) => {
    const e = Math.floor(j / n) % 4;
    const t = g(j % n);
    return e === 0 ? [1, t] : e === 1 ? [-t, 1] : e === 2 ? [-1, -t] : [t, -1];
  };
  const yAt = (r) => 1 - ((1 - o.yb) * r) / o.rows;
  for (let r = 0; r < o.rows; r++) {
    for (let j = 0; j < 4 * n; j++) {
      const [x0, z0] = perim(j);
      const [x1, z1] = perim(j + 1);
      quadOut(m, vid(x0, yAt(r), z0), vid(x1, yAt(r), z1), vid(x1, yAt(r + 1), z1), vid(x0, yAt(r + 1), z0), o.c);
    }
  }
  const bottom = m.v([o.c[0], o.c[1] - 0.6 * o.r[1], o.c[2]], o.slot, 0);
  for (let j = 0; j < 4 * n; j++) {
    const [x0, z0] = perim(j);
    const [x1, z1] = perim(j + 1);
    m.out(vid(x0, o.yb, z0), vid(x1, o.yb, z1), bottom, o.c);
  }
}

/** Angular rubble piece centred at c; returns its radii. */
function lump(m, rand, c, size, slot) {
  const r = [size * (0.9 + rand() * 0.7), size * (0.45 + rand() * 0.25), size * (0.75 + rand() * 0.4)];
  const base = c[1] - r[1];
  head(m, {
    c, r, n: 2, rows: 1, yb: -0.6, yaw: rand() * TAU, bump: () => 0.72 + rand() * 0.56, slot,
    shade: (p) => clamp01(0.22 + (0.6 * (p[1] - base)) / (2 * r[1]) + 0.2 * (rand() - 0.5)),
  });
  return r;
}

/**
 * Low encrusted sheet with a lobed outline whose edge dips under the sand, closed underneath. Returns its
 * surface height, for rubble laid on top. o: { c, r: [rx, rz], rings, segs, relief, lobes, skirt, seed, slot, shade(p, rho) }
 */
function sheet(m, o) {
  const outline = (phi) => 1 + o.lobes * (1.8 * noise3(Math.cos(phi) * 1.4, Math.sin(phi) * 1.4, 0.37, o.seed) + 0.3 * Math.sin(3 * phi + o.seed));
  const lift = (x, z, rho) => Math.sqrt(Math.max(0, 1 - rho * rho)) *
    (o.relief * (0.45 + 1.1 * (0.5 + fbm([x, 0, z], 1.6, 3, o.seed + 5))) + 0.05 * fbm([x, 0, z], 5, 2, o.seed + 6));
  const point = (rho, phi) => {
    const k = outline(phi) * rho;
    const x = o.c[0] + Math.cos(phi) * o.r[0] * k;
    const z = o.c[2] + Math.sin(phi) * o.r[1] * k;
    return [x, o.c[1] + lift(x, z, rho), z];
  };
  const up = [0, 1, 0];
  const centre = point(0, 0);
  const C = m.v(centre, o.slot, o.shade(centre, 0));
  const rings = [];
  for (let j = 1; j <= o.rings; j++) {
    const rho = j / o.rings;
    rings.push(Array.from({ length: o.segs }, (_, k) => {
      const q = point(rho, (k / o.segs) * TAU);
      return m.v(q, o.slot, o.shade(q, rho));
    }));
  }
  for (let k = 0; k < o.segs; k++) m.dir(C, rings[0][k], rings[0][(k + 1) % o.segs], up);
  for (let j = 0; j < o.rings - 1; j++) {
    for (let k = 0; k < o.segs; k++) {
      const k1 = (k + 1) % o.segs;
      quadDir(m, rings[j][k], rings[j + 1][k], rings[j + 1][k1], rings[j][k1], up);
    }
  }
  const skirt = Array.from({ length: o.segs }, (_, k) => {
    const q = point(1.06, (k / o.segs) * TAU);
    return m.v([q[0], o.c[1] - o.skirt, q[2]], o.slot, 0);
  });
  const last = rings[o.rings - 1];
  const mid = [o.c[0], o.c[1] - o.skirt / 2, o.c[2]];
  for (let k = 0; k < o.segs; k++) {
    const k1 = (k + 1) % o.segs;
    quadOut(m, last[k], skirt[k], skirt[k1], last[k1], mid);
  }
  const B = m.v([o.c[0], o.c[1] - o.skirt, o.c[2]], o.slot, 0);
  for (let k = 0; k < o.segs; k++) m.dir(B, skirt[(k + 1) % o.segs], skirt[k], [0, -1, 0]);
  return {
    height(x, z) {
      const dx = (x - o.c[0]) / o.r[0];
      const dz = (z - o.c[2]) / o.r[1];
      const rho = Math.hypot(dx, dz) / outline(Math.atan2(dz, dx));
      return rho >= 1 ? -Infinity : o.c[1] + lift(x, z, rho);
    },
  };
}

/** Tube along a polyline with parallel-transported rings. The tip closes on a rounded point; the base stays
 * open inside a mound or below the seabed unless baseCap (loose fragments). */
function branch(m, path, radius, sides, slot, shade, tipCap, baseCap) {
  let prevN = null;
  const rings = [];
  for (let k = 0; k < path.length; k++) {
    const t = k / (path.length - 1);
    const T = V.norm(V.sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
    let N = prevN ? V.sub(prevN, V.mul(T, V.dot(prevN, T))) : V.cross(T, Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    N = V.norm(N);
    prevN = N;
    const B = V.cross(T, N);
    const r = radius(t);
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * TAU;
      ring.push(m.v(V.add(path[k], V.add(V.mul(N, Math.cos(ang) * r), V.mul(B, Math.sin(ang) * r))), slot, shade(t)));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const inside = V.lerp(path[k], path[k + 1], 0.5);
    for (let j = 0; j < sides; j++) {
      quadOut(m, rings[k][j], rings[k][(j + 1) % sides], rings[k + 1][(j + 1) % sides], rings[k + 1][j], inside);
    }
  }
  const cap = (ring, end, prev, s) => {
    const tip = m.v(V.add(end, V.mul(V.norm(V.sub(end, prev)), radius(s) * 0.9)), slot, shade(s));
    for (let j = 0; j < sides; j++) m.out(ring[j], ring[(j + 1) % sides], tip, end);
  };
  if (tipCap) cap(rings[rings.length - 1], path[path.length - 1], path[path.length - 2], 1);
  if (baseCap) cap(rings[0], path[0], path[1], 0);
}

/** Point and unit tangent at fraction t along a polyline (by vertex index). */
function along(path, t) {
  const f = clamp01(t) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  return { p: V.lerp(path[i], path[i + 1], f - i), d: V.norm(V.sub(path[i + 1], path[i])) };
}

/**
 * Closed plate: a lobed, slightly dished top with a pale growing margin, a thin rim and a dark underside.
 * o: { c (top centre), R, normal, segs, rings, dish, thick, rough, lobes, seed, slot }
 */
function plate(m, o) {
  const n = V.norm(o.normal);
  const a = V.norm(V.cross(Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], n));
  const b = V.cross(n, a);
  const edge = (phi) => o.R * (1 + o.lobes * 1.6 * noise3(Math.cos(phi) * 1.7, Math.sin(phi) * 1.7, 2.9, o.seed) + 0.03 * Math.sin(11 * phi + o.seed));
  const at = (rho, phi, lift) => {
    const r = edge(phi) * rho;
    return V.add(o.c, V.add(V.add(V.mul(a, r * Math.cos(phi)), V.mul(b, r * Math.sin(phi))), V.mul(n, lift)));
  };
  const topLift = (rho, phi) => o.dish * rho * rho + o.rough * noise3(rho * Math.cos(phi) * 3.5, rho * Math.sin(phi) * 3.5, 1.3, o.seed + 7);
  const underLift = (rho, phi) => topLift(rho, phi) - o.thick * (1 - 0.6 * rho);
  const topShade = (rho, phi) => clamp01(0.48 + 0.2 * noise3(rho * Math.cos(phi) * 5, rho * Math.sin(phi) * 5, 4.1, o.seed + 3) + 0.42 * smoothstep(0.82, 1, rho));
  const S = o.segs;
  const K = o.rings;
  const phiK = (k) => (k / S) * TAU;
  const ring = (rho, lift, shade) => Array.from({ length: S }, (_, k) => m.v(at(rho, phiK(k), lift(rho, phiK(k))), o.slot, shade(rho, phiK(k))));
  const top0 = m.v(at(0, 0, topLift(0, 0)), o.slot, topShade(0, 0));
  const top = [];
  for (let j = 1; j <= K; j++) top.push(ring(j / K, topLift, topShade));
  for (let k = 0; k < S; k++) m.dir(top0, top[0][k], top[0][(k + 1) % S], n);
  for (let j = 0; j < K - 1; j++) {
    for (let k = 0; k < S; k++) quadDir(m, top[j][k], top[j + 1][k], top[j + 1][(k + 1) % S], top[j][(k + 1) % S], n);
  }
  // the rim has its own vertices, so the edge stays crisp against the top and the underside
  const rimHi = ring(1, topLift, () => 0.95);
  const rimLo = ring(0.97, underLift, () => 0.55);
  for (let k = 0; k < S; k++) quadOut(m, rimHi[k], rimLo[k], rimLo[(k + 1) % S], rimHi[(k + 1) % S], o.c);
  const down = V.mul(n, -1);
  const u0 = ring(0.97, underLift, () => 0.12);
  const u1 = ring(0.5, underLift, () => 0.06);
  const uc = m.v(at(0, 0, underLift(0, 0)), o.slot, 0.03);
  for (let k = 0; k < S; k++) quadDir(m, u0[k], u1[k], u1[(k + 1) % S], u0[(k + 1) % S], down);
  for (let k = 0; k < S; k++) m.dir(uc, u1[(k + 1) % S], u1[k], down);
}

// ---------------------------------------------------------------- groups
/** Rubble patch: an encrusted rubble sheet with satellites, angular rubble, pale and pink fragments, a few small heads. */
function rubblePatch(m, rand, S) {
  const turfShade = (p, rho) => clamp01(0.42 + 0.6 * fbm(p, 2.2, 3, 41) + 0.12 * (1 - rho));
  const sheets = [
    sheet(m, { c: [0, 0, 0], r: [3.0, 2.2], rings: 4, segs: 28, relief: 0.1, lobes: 0.2, skirt: 0.14, seed: 11, slot: S.turf, shade: turfShade }),
    sheet(m, { c: [3.15, 0, 1.35], r: [1.0, 0.75], rings: 2, segs: 12, relief: 0.06, lobes: 0.25, skirt: 0.12, seed: 12, slot: S.turfBrown, shade: turfShade }),
    sheet(m, { c: [-2.95, 0, -1.25], r: [1.1, 0.8], rings: 2, segs: 12, relief: 0.07, lobes: 0.25, skirt: 0.12, seed: 13, slot: S.turfBrown, shade: turfShade }),
    sheet(m, { c: [-0.8, 0, 2.55], r: [0.8, 0.6], rings: 2, segs: 12, relief: 0.05, lobes: 0.3, skirt: 0.12, seed: 14, slot: S.turf, shade: turfShade }),
  ];
  const surface = (x, z) => Math.max(...sheets.map((s) => s.height(x, z)));
  for (let i = 0; i < 22; i++) {
    const onSheet = i < 18;
    let x = 0;
    let z = 0;
    let y = -Infinity;
    for (let tries = 0; tries < 60; tries++) {
      const a = rand() * TAU;
      const rr = Math.sqrt(rand());
      x = Math.cos(a) * rr * (onSheet ? 3.3 : 4.3);
      z = Math.sin(a) * rr * (onSheet ? 2.5 : 3.3);
      y = surface(x, z);
      if (onSheet ? y > 0.02 : y === -Infinity) break;
    }
    const slot = i % 5 === 0 ? S.bleached : i % 5 === 1 ? S.coralline : i % 2 ? S.turf : S.turfBrown;
    const size = 0.1 + rand() * 0.1;
    // on a sheet a piece sits a little into it; strays on the sand are mostly buried
    const cy = onSheet ? Math.max(0, y) - 0.2 * size : -0.3 * size;
    lump(m, rand, [x, cy, z], size, slot);
  }
  const smalls = [[0.9, -0.6, 0.38, 0.24, 0.34, S.olive], [-1.25, 0.5, 0.32, 0.2, 0.3, S.brown], [0.25, 1.15, 0.3, 0.18, 0.28, S.purple], [-0.45, -1.1, 0.26, 0.16, 0.24, S.bluegreen]];
  smalls.forEach(([x, z, rx, ry, rz, slot], i) => {
    const base = Math.max(0, surface(x, z)) - 0.06;
    const knobby = i === 0;
    head(m, {
      c: [x, base, z], r: [rx, ry, rz], n: knobby ? 6 : 3, rows: knobby ? 3 : 2, yb: -0.4, yaw: rand() * TAU, slot,
      bump: (q) => 1 + 0.12 * fbm(q, 4, 2, 50 + i) + (knobby ? 0.12 * noise3(q[0] * 9, q[1] * 9, q[2] * 9, 55) : 0),
      shade: (p) => clamp01(0.2 + (0.7 * (p[1] - base)) / ry + 0.3 * fbm(p, 9, 2, 60 + i) + (knobby ? 0.3 * noise3(p[0] * 9, p[1] * 9, p[2] * 9, 55) : 0)),
    });
  });
  // low rubble piles on the sheet give it relief at wading distance
  [[-1.4, -0.5, 0.85, 0.15, 0.6], [1.5, 0.4, 0.75, 0.13, 0.55], [0.1, -0.2, 0.6, 0.12, 0.7], [-0.3, 1.5, 0.55, 0.11, 0.45], [1.9, -1.1, 0.5, 0.12, 0.42]].forEach(([x, z, rx, ry, rz], i) => {
    const base = Math.max(0, surface(x, z)) - 0.07;
    head(m, {
      c: [x, base, z], r: [rx, ry, rz], n: 4, rows: 2, yb: -0.5, yaw: rand() * TAU, slot: i % 2 ? S.turfBrown : S.turf,
      bump: (q) => 1 + 0.35 * fbm(q, 3.5, 3, 70 + i),
      shade: (p) => clamp01(0.3 + (0.5 * (p[1] - base)) / ry + 0.45 * fbm(p, 6, 2, 75 + i)),
    });
  });
}

/** Massive heads: a lobed boulder, brain domes, a microatoll with a dead flat top, a finger-coral head, rubble. */
function brainHeads(m, rand, S) {
  const HEADS = [
    { c: [0.15, -0.12, 0.1], r: [1.05, 0.85, 0.95], n: 8, rows: 5, slot: S.brown, lobes: 0.18, freq: 1.8 },
    { c: [-1.55, -0.1, 0.95], r: [0.7, 0.62, 0.66], n: 7, rows: 4, slot: S.olive, lobes: 0.12, freq: 3, ridge: true },
    { c: [1.65, -0.18, -1.0], r: [1.05, 0.6, 0.95], n: 7, rows: 4, slot: S.microatoll, lobes: 0.14, freq: 2.5, flat: 0.34 },
    { c: [-1.25, -0.08, -1.15], r: [0.52, 0.46, 0.5], n: 5, rows: 3, slot: S.purple, lobes: 0.16, freq: 4, ridge: true },
    { c: [1.45, -0.06, 1.3], r: [0.55, 0.42, 0.5], n: 9, rows: 4, slot: S.cream, lobes: 0.08, freq: 3, knobby: true },
    { c: [-2.35, -0.06, -0.2], r: [0.42, 0.36, 0.4], n: 5, rows: 3, slot: S.bluegreen, lobes: 0.16, freq: 4.5, ridge: true },
    { c: [0.25, -0.05, -1.8], r: [0.4, 0.3, 0.36], n: 4, rows: 3, slot: S.olive, lobes: 0.16, freq: 5 },
  ];
  HEADS.forEach((h, i) => {
    const top = h.flat !== undefined ? h.flat : h.c[1] + h.r[1];
    const seed = 100 + 10 * i;
    head(m, {
      c: h.c, r: h.r, n: h.n, rows: h.rows, yb: -0.35, yaw: rand() * TAU, flat: h.flat, slot: h.slot,
      // knobby heads (finger and lobe corals) carry close bumps of about the vertex spacing
      bump: (q) => 1 + h.lobes * fbm(q, h.freq, 2, seed) + (h.knobby ? 0.11 * noise3(q[0] * 7, q[1] * 7, q[2] * 7, seed + 5) : 0.04 * fbm(q, 3 * h.freq, 1, seed + 1)),
      shade: (p) => {
        if (h.flat !== undefined && p[1] > h.flat - 0.02) return clamp01(0.84 + 0.3 * fbm(p, 6, 2, seed + 2));
        const ridge = h.ridge ? 0.4 * (Math.abs(noise3(p[0] * 6, p[1] * 6, p[2] * 6, seed + 3)) - 0.3) : 0;
        const knob = h.knobby ? 0.35 * noise3(p[0] * 7, p[1] * 7, p[2] * 7, seed + 5) : 0;
        const living = h.flat !== undefined ? 0.45 : 0.55;
        return clamp01(0.08 + living * smoothstep(-0.05, 0.85, p[1] / top) + 0.45 * fbm(p, 5, 2, seed + 4) + ridge + knob);
      },
    });
  });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand() * 0.3;
    const rr = 1.7 + rand() * 1.2;
    const size = 0.08 + rand() * 0.13;
    const slot = i % 4 === 0 ? S.coralline : i % 3 === 0 ? S.olive : S.turf;
    lump(m, rand, [Math.cos(a) * rr * 1.05, -0.3 * size, Math.sin(a) * rr * 0.85], size, slot);
  }
}

/** Staghorn thicket: four spreading, forking colonies with pale tips over a low mound of dead branches and rubble. */
function staghorn(m, rand, S) {
  const turfShade = (p) => clamp01(0.3 + 0.35 * smoothstep(-0.05, 0.22, p[1]) + 0.5 * fbm(p, 3.5, 3, 61));
  const R0 = [1.25, 0.24, 1.05];
  head(m, { c: [0, -0.12, 0], r: R0, n: 7, rows: 2, yb: -0.5, bump: (q) => 1 + 0.4 * fbm(q, 2.6, 3, 71), slot: S.turf, shade: turfShade });
  const moundY = (x, z) => -0.12 + R0[1] * Math.sqrt(Math.max(0, 1 - (x / R0[0]) ** 2 - (z / R0[2]) ** 2));
  const CAP = 0.55;
  const capPath = (path) => {
    const y0 = path[0][1];
    const top = Math.max(...path.map((q) => q[1]));
    if (top <= CAP) return path;
    const k = (CAP - y0) / (top - y0);
    return path.map((q) => [q[0], y0 + (q[1] - y0) * k, q[2]]);
  };
  /** One branch that curls gently upward; returns its (capped) path. */
  const twig = (from, dir, len, segs, r0, r1, slot, s0, tint) => {
    let q = from;
    let d = V.norm(dir);
    const path = [q];
    for (let k = 1; k <= segs; k++) {
      d = V.norm(V.add(d, [(rand() - 0.5) * 0.25, 0.16 + rand() * 0.1, (rand() - 0.5) * 0.25]));
      q = V.add(q, V.mul(d, len / segs));
      path.push(q);
    }
    const p = capPath(path);
    branch(m, p, (t) => r0 + (r1 - r0) * t, 4, slot, (t) => clamp01(s0 + tint + (0.9 - s0) * t + 0.25 * smoothstep(0.7, 1, t)), true, false);
    return p;
  };
  const colonies = [
    { at: [-0.55, -0.25], n: 14, reach: 0.62, slot: S.stagTan },
    { at: [0.6, 0.35], n: 14, reach: 0.58, slot: S.stagBlue },
    { at: [0.25, -0.85], n: 9, reach: 0.45, slot: S.stagViolet },
    { at: [-0.6, 0.8], n: 9, reach: 0.45, slot: S.stagOlive },
  ];
  for (const col of colonies) {
    const y0 = moundY(col.at[0], col.at[1]);
    for (let i = 0; i < col.n; i++) {
      const az = i * GOLDEN + rand() * 0.5;
      const h = [Math.cos(az), 0, Math.sin(az)];
      const e = rad(16 + 40 * (1 - i / col.n) + (rand() - 0.5) * 12); // inner branches upright, outer ones spread
      const len = col.reach * (0.75 + rand() * 0.4);
      const tint = (rand() - 0.5) * 0.1;
      const start = [col.at[0] + h[0] * 0.06, y0 - 0.08, col.at[1] + h[2] * 0.06];
      const path = twig(start, [h[0] * Math.cos(e), Math.sin(e), h[2] * Math.cos(e)], len, 4, 0.03, 0.021, col.slot, 0.2, tint);
      for (const [tf, chance] of [[0.35 + rand() * 0.2, 0.85], [0.62 + rand() * 0.18, 0.6]]) {
        if (rand() > chance) continue;
        const { p: fp, d: fd } = along(path, tf);
        const side = V.norm(V.cross([0, 1, 0], fd));
        const dir = V.add(V.add(fd, V.mul(side, (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.45))), [0, 0.25, 0]);
        twig(fp, dir, len * (0.3 + rand() * 0.2), 2, 0.023, 0.018, col.slot, 0.4, tint);
      }
    }
  }
  // broken branches lying on the mound, and rubble at its edge
  for (let i = 0; i < 8; i++) {
    const a = rand() * TAU;
    const rr = 0.3 + rand() * 0.6;
    const x = Math.cos(a) * rr * R0[0];
    const z = Math.sin(a) * rr * R0[2];
    const az = rand() * TAU;
    const L = 0.14 + rand() * 0.14;
    const y = moundY(x, z) - 0.005;
    const d = [Math.cos(az) * L * 0.5, 0.02, Math.sin(az) * L * 0.5];
    branch(m, [V.sub([x, y, z], d), V.add([x, y, z], d)], () => 0.02, 4, i % 2 ? S.bleached : S.turfBrown, (t) => 0.5 + 0.2 * t, true, true);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rand() * 0.4;
    const size = 0.07 + rand() * 0.1;
    lump(m, rand, [Math.cos(a) * (R0[0] + rand() * 0.3), -0.3 * size, Math.sin(a) * (R0[2] + rand() * 0.25)], size, i % 3 ? S.turf : S.coralline);
  }
}

/** Table and plate corals: four tables on stalks, two foliose whorls, small encrusting heads, all on a rubble mound. */
function tables(m, rand, S) {
  const turfShade = (p) => clamp01(0.3 + 0.35 * smoothstep(-0.05, 0.2, p[1]) + 0.5 * fbm(p, 3.5, 3, 81));
  head(m, { c: [0, -0.14, 0], r: [2.0, 0.25, 1.65], n: 8, rows: 2, yb: -0.5, bump: (q) => 1 + 0.4 * fbm(q, 2.4, 3, 82), slot: S.turf, shade: turfShade });
  const TABLES = [
    { x: 0.25, z: 0.15, R: 0.78, h: 0.44, slot: S.tableGreen, tilt: [0.06, 1, 0.03] },
    { x: -1.3, z: 0.95, R: 0.56, h: 0.33, slot: S.tableBrown, tilt: [-0.12, 1, 0.08] },
    { x: 1.45, z: -0.95, R: 0.62, h: 0.37, slot: S.tableBlue, tilt: [0.1, 1, -0.1] },
    { x: -0.95, z: -1.2, R: 0.44, h: 0.27, slot: S.tableGreen, tilt: [-0.15, 1, -0.18] },
  ];
  TABLES.forEach((t, i) => {
    const normal = V.norm(t.tilt);
    const c = [t.x, t.h, t.z];
    plate(m, { c, R: t.R, normal, segs: 20, rings: 4, dish: 0.05, thick: 0.07, rough: 0.012, lobes: 0.1, seed: 90 + i, slot: t.slot });
    const top = V.sub(c, V.mul(normal, 0.05));
    branch(m, [[t.x + 0.03, -0.12, t.z - 0.02], V.lerp([t.x, -0.12, t.z], top, 0.5), top], (u) => 0.075 - 0.02 * u, 6, t.slot, (u) => 0.08 + 0.15 * u, false, false);
  });
  const WHORLS = [
    { x: 1.55, z: 1.05, R: 0.42, h: 0.2, slot: S.purple },
    { x: -1.95, z: -0.25, R: 0.38, h: 0.17, slot: S.folioseOlive },
  ];
  WHORLS.forEach((w, i) => {
    // overlapping tiers fanned around a knob, each tilted a little toward the axis so it rises outward
    head(m, { c: [w.x, -0.05, w.z], r: [0.22, 0.2, 0.22], n: 3, rows: 2, yb: -0.4, slot: w.slot, shade: (p) => clamp01(0.1 + (0.4 * p[1]) / 0.2) });
    for (let k = 0; k < 4; k++) {
      const az = (k / 4) * TAU + rand() * 0.6;
      const out = [Math.cos(az), 0, Math.sin(az)];
      const tilt = rad(10 + rand() * 12);
      const normal = V.norm([-out[0] * Math.sin(tilt), Math.cos(tilt), -out[2] * Math.sin(tilt)]);
      const R = w.R * (0.65 + rand() * 0.25);
      const c = [w.x + out[0] * R * 0.75, w.h + k * 0.055, w.z + out[2] * R * 0.75];
      plate(m, { c, R, normal, segs: 12, rings: 2, dish: 0.02, thick: 0.035, rough: 0.006, lobes: 0.16, seed: 120 + 10 * i + k, slot: w.slot });
    }
  });
  [[0.9, 1.45, 0.34, 0.26, 0.3], [-0.2, -1.6, 0.3, 0.22, 0.28]].forEach(([x, z, rx, ry, rz], i) => {
    head(m, {
      c: [x, -0.04, z], r: [rx, ry, rz], n: 4, rows: 3, yb: -0.35, yaw: rand() * TAU, bump: (q) => 1 + 0.16 * fbm(q, 5, 2, 140 + i), slot: S.brown,
      shade: (p) => clamp01(0.15 + (0.65 * p[1]) / ry + 0.3 * fbm(p, 8, 2, 150 + i)),
    });
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rand() * 0.4;
    const size = 0.07 + rand() * 0.1;
    lump(m, rand, [Math.cos(a) * (1.95 + rand() * 0.35), -0.3 * size, Math.sin(a) * (1.6 + rand() * 0.3)], size, i % 3 ? S.turf : S.coralline);
  }
}

// ---------------------------------------------------------------- catalogue
// bake: [base depth, tip depth] in metres under the rest level: medians measured over the group's turn-6
// placements (bases 0-15% of the height, tops above 60%), rounded to 0.05 m. Since turn 8 only the lineup's tint
// preview uses them.
const GROUPS = {
  rubble_patch: { name: 'RubblePatch', seed: 101, bake: [0.9, 0.65], build: rubblePatch,
    palette: ['turf', 'turfBrown', 'coralline', 'bleached', 'olive', 'brown', 'purple', 'bluegreen'] },
  brain_heads: { name: 'BrainHeads', seed: 211, bake: [1.6, 1.2], build: brainHeads,
    palette: ['brown', 'olive', 'purple', 'cream', 'microatoll', 'bluegreen', 'turf', 'coralline'] },
  staghorn: { name: 'Staghorn', seed: 307, bake: [0.95, 0.6], build: staghorn,
    palette: ['stagTan', 'stagBlue', 'stagViolet', 'stagOlive', 'turf', 'turfBrown', 'coralline', 'bleached'] },
  table: { name: 'Table', seed: 401, bake: [0.9, 0.6], build: tables,
    palette: ['tableGreen', 'tableBrown', 'tableBlue', 'purple', 'folioseOlive', 'turf', 'coralline', 'brown'] },
};
const LINEUP = [['rubble_patch', [0, 0, 0]], ['brain_heads', [8.5, 0, 0]], ['staghorn', [15.5, 0, 0]], ['table', [22, 0, 0]]];
const r3 = (x) => Math.round(x * 1000) / 1000;

function addGroup(parent, key, offset, prefix) {
  const g = GROUPS[key];
  const S = Object.fromEntries(g.palette.map((k, i) => [k, i]));
  const m = makeMesh();
  g.build(m, makeRandom(g.seed), S);
  const { mat, baked } = makeMaterial(g);
  const part = createPart(prefix + 'coral', m.geometry(), mat, { parent, position: offset });
  part.name = prefix + 'coral';
  markOpenShell(part, 'Overlapping closed coral pieces in one mesh; branch and stalk bases end inside rubble or below the seabed.');
  const bb = m.bounds();
  return { triangles: m.triangles(), min: bb.min.map(r3), max: bb.max.map(r3), bake: g.bake, baked };
}

/** Review-only seabed (lineup mode): sand as the terrain shader shows it 1.2 m down. */
function addReviewFloor(parent) {
  const sand = underwater([205, 185, 148].map((c) => toLinear(c) * 0.93), 1.2).map(toByte);
  const tex = proceduralTexture({
    schemaVersion: 3, width: 4, height: 4, usage: 'albedo', name: 'ReviewSeabed', background: [...sand, 255],
    operations: [{ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 4, height: 4 }, rgba: [...sand, 255] }],
  });
  const mat = pbrMaterial({ albedo: tex, roughness: 0.6, metalness: 0 });
  mat.name = 'ReviewSeabed';
  const [x0, x1, z0, z1] = [-5.5, 25.5, -4.5, 4.5];
  const geo = meshGeo({
    positions: [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
  });
  const part = createPart('review_seabed', geo, mat, { parent });
  part.name = 'review_seabed';
  markOpenShell(part, 'Single-sided review floor; not part of any saved coral group.');
  return hex(sand);
}

async function build() {
  const root = createRoot(VARIANT === 'lineup' ? 'CoralLineup' : 'CoralGroup');
  const groups = {};
  if (VARIANT === 'lineup') {
    for (const [key, offset] of LINEUP) groups[key] = addGroup(root, key, offset, key + '_');
    root.userData = { coralVariant: VARIANT, groundY: 0, reviewSeabed: addReviewFloor(root), groups };
  } else {
    groups[VARIANT] = addGroup(root, VARIANT, [0, 0, 0], '');
    root.userData = { coralVariant: VARIANT, groundY: 0, groups };
  }
  return root;
}
