const meta = {
  name: 'gnarled-canopy-bough',
};

// ============================================================================
// Geometry & Math Utilities
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function vAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vScale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vLen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function vNorm(a) {
  const l = vLen(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

function pathArcLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += vLen(vSub(pts[i], pts[i - 1]));
  }
  return len;
}

function samplePolyline(pts, radii, t) {
  const n = pts.length;
  const f = clamp(t, 0, 1) * (n - 1);
  const i0 = Math.min(Math.floor(f), n - 2);
  const frac = f - i0;
  const p = [
    lerp(pts[i0][0], pts[i0 + 1][0], frac),
    lerp(pts[i0][1], pts[i0 + 1][1], frac),
    lerp(pts[i0][2], pts[i0 + 1][2], frac),
  ];
  const r = radii ? lerp(radii[i0], radii[i0 + 1], frac) : 0.1;
  const iPrev = Math.max(0, i0 - 1);
  const iNext = Math.min(n - 1, i0 + 2);
  const tan = vNorm(vSub(pts[iNext], pts[iPrev]));
  return { point: p, radius: r, tangent: tan };
}

function buildBasis(forward, upHint) {
  const f = vNorm(forward);
  let u = upHint ? vNorm(upHint) : [0, 1, 0];
  if (Math.abs(vDot(f, u)) > 0.96) {
    u = Math.abs(f[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  }
  const r = vNorm(vCross(f, u));
  const trueUp = vNorm(vCross(r, f));
  return { forward: f, right: r, up: trueUp };
}

function transformGeo(geo, origin, basisX, basisY, basisZ, scale) {
  const sx = Array.isArray(scale) ? scale[0] : (scale ?? 1);
  const sy = Array.isArray(scale) ? scale[1] : (scale ?? 1);
  const sz = Array.isArray(scale) ? scale[2] : (scale ?? 1);
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const uvAttr = geo.getAttribute('uv');
  const idxAttr = geo.getIndex();
  const vCount = posAttr.count;
  const positions = new Array(vCount * 3);
  const normals = normAttr ? new Array(vCount * 3) : null;
  const uvs = uvAttr ? new Array(vCount * 2) : null;

  for (let i = 0; i < vCount; i++) {
    const x = posAttr.getX(i) * sx;
    const y = posAttr.getY(i) * sy;
    const z = posAttr.getZ(i) * sz;
    positions[i * 3] = origin[0] + basisX[0] * x + basisY[0] * y + basisZ[0] * z;
    positions[i * 3 + 1] = origin[1] + basisX[1] * x + basisY[1] * y + basisZ[1] * z;
    positions[i * 3 + 2] = origin[2] + basisX[2] * x + basisY[2] * y + basisZ[2] * z;

    if (normals) {
      const nx = normAttr.getX(i) / (sx || 1);
      const ny = normAttr.getY(i) / (sy || 1);
      const nz = normAttr.getZ(i) / (sz || 1);
      const wx = basisX[0] * nx + basisY[0] * ny + basisZ[0] * nz;
      const wy = basisX[1] * nx + basisY[1] * ny + basisZ[1] * nz;
      const wz = basisX[2] * nx + basisY[2] * ny + basisZ[2] * nz;
      const nl = Math.hypot(wx, wy, wz) || 1;
      normals[i * 3] = wx / nl;
      normals[i * 3 + 1] = wy / nl;
      normals[i * 3 + 2] = wz / nl;
    }
    if (uvs) {
      uvs[i * 2] = uvAttr.getX(i);
      uvs[i * 2 + 1] = uvAttr.getY(i);
    }
  }

  let indices;
  if (idxAttr) {
    indices = Array.from(idxAttr.array);
  } else {
    indices = new Array(vCount);
    for (let i = 0; i < vCount; i++) indices[i] = i;
  }

  const out = { positions, indices };
  if (normals) out.normals = normals;
  if (uvs) out.uvs = uvs;
  return meshGeo(out);
}

function mergeGeos(geos) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  for (const g of geos) {
    if (!g) continue;
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    let norm = g.getAttribute('normal');
    if (!norm) {
      g.computeVertexNormals();
      norm = g.getAttribute('normal');
    }
    const uv = g.getAttribute('uv');
    const idx = g.getIndex();
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (norm) {
        const nx = norm.getX(i);
        const ny = norm.getY(i);
        const nz = norm.getZ(i);
        const nl = Math.hypot(nx, ny, nz);
        if (nl > 1e-6) {
          normals.push(nx / nl, ny / nl, nz / nl);
        } else {
          normals.push(0, 1, 0);
        }
      } else {
        normals.push(0, 1, 0);
      }
      if (uv) {
        uvs.push(uv.getX(i), uv.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < count; i++) {
        indices.push(i + vertexOffset);
      }
    }
    vertexOffset += count;
  }

  return meshGeo({ positions, normals, uvs, indices });
}

// ============================================================================
// Procedural V3 RGBA Atlas Builders (Foliage + Orchids)
// ============================================================================

function leafPolygonPoints(cx, cy, len, halfW, angleRad, nSide) {
  const pts = [];
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const steps = nSide || 7;
  // Base at (0,0), tip at (0, len) in local leaf space
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = halfW * Math.sin(Math.pow(t, 0.72) * Math.PI) * (1 - 0.14 * t);
    const lx = w;
    const ly = t * len;
    pts.push([
      Math.round(cx + lx * cos - ly * sin),
      Math.round(cy + lx * sin + ly * cos),
    ]);
  }
  for (let i = steps - 1; i >= 1; i--) {
    const t = i / steps;
    const w = halfW * Math.sin(Math.pow(t, 0.72) * Math.PI) * (1 - 0.14 * t);
    const lx = -w;
    const ly = t * len;
    pts.push([
      Math.round(cx + lx * cos - ly * sin),
      Math.round(cy + lx * sin + ly * cos),
    ]);
  }
  return pts;
}

function buildSunlitSpraySpec() {
  // 256x512 column, V=0 (top, y=0) = stem attachment, V=1 (bottom, y=511) = leaf tip
  const ops = [];
  // Central woody green stem descending from y=2 to y=475
  ops.push({ op: 'paint', shape: { kind: 'line', from: [128, 2], to: [128, 468], width: 7 }, rgba: [52, 92, 34, 255] });
  ops.push({ op: 'paint', shape: { kind: 'line', from: [127, 2], to: [127, 460], width: 3 }, rgba: [86, 134, 48, 255] });

  // 4 pairs of opposite glossy pointed leaflets + 1 bold terminal leaflet (total 9 leaves)
  const pairs = [
    { y: 52, len: 108, w: 36, ang: 0.78, shade: 0 },
    { y: 138, len: 132, w: 43, ang: 0.68, shade: 1 },
    { y: 235, len: 136, w: 44, ang: 0.58, shade: 2 },
    { y: 332, len: 118, w: 38, ang: 0.45, shade: 3 },
  ];

  const baseColors = [
    [40, 86, 30, 255],
    [52, 104, 36, 255],
    [64, 120, 42, 255],
    [76, 134, 48, 255],
  ];
  const hiColors = [
    [72, 124, 44, 210],
    [90, 144, 52, 215],
    [106, 160, 58, 220],
    [124, 176, 66, 225],
  ];

  for (const p of pairs) {
    for (const side of [-1, 1]) {
      const a = side * p.ang;
      const sx = 128 + side * 4;
      const sy = p.y;
      // Full leaflet silhouette
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: leafPolygonPoints(sx, sy, p.len, p.w, a, 6) },
        rgba: baseColors[p.shade],
      });
      // Sunlit upper-blade highlight
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: leafPolygonPoints(sx + side * 3, sy + 6, p.len * 0.86, p.w * 0.62, a, 5) },
        rgba: hiColors[p.shade],
      });
      // Crisp pale yellow-green central midrib
      const tx = Math.round(sx - Math.sin(a) * p.len * 0.86);
      const ty = Math.round(sy + Math.cos(a) * p.len * 0.86);
      ops.push({
        op: 'paint',
        shape: { kind: 'line', from: [sx, sy + 2], to: [tx, ty], width: 3 },
        rgba: [134, 186, 76, 230],
      });
    }
  }

  // Terminal sunlit emerald leaf reaching down to y=506
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: leafPolygonPoints(128, 376, 130, 44, 0, 7) },
    rgba: [68, 126, 44, 255],
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: leafPolygonPoints(128, 384, 112, 28, 0, 6) },
    rgba: [118, 174, 62, 220],
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'line', from: [128, 380], to: [128, 492], width: 3 },
    rgba: [148, 198, 86, 235],
  });

  // 2 + 4*2*3 + 3 = 29 ops (<= 64!)
  return {
    schemaVersion: 3,
    width: 256,
    height: 512,
    usage: 'albedo',
    background: [0, 0, 0, 0],
    operations: ops,
  };
}

function buildShadedClusterSpec() {
  // Broad dense deep-emerald rainforest canopy cluster (V=0 top stem -> V=1 bottom tips)
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'line', from: [128, 2], to: [128, 420], width: 8 }, rgba: [36, 68, 24, 255] });

  const leaves = [
    { x: 128, y: 24, len: 185, w: 66, ang: 0.62, c: [30, 68, 24, 255], hi: [48, 96, 34, 200] },
    { x: 128, y: 30, len: 192, w: 68, ang: -0.58, c: [34, 74, 26, 255], hi: [54, 104, 38, 200] },
    { x: 128, y: 126, len: 215, w: 74, ang: 0.44, c: [38, 82, 28, 255], hi: [62, 114, 40, 210] },
    { x: 128, y: 136, len: 218, w: 75, ang: -0.42, c: [42, 88, 32, 255], hi: [68, 122, 44, 210] },
    { x: 128, y: 244, len: 220, w: 72, ang: 0.24, c: [48, 98, 34, 255], hi: [78, 134, 48, 215] },
    { x: 128, y: 250, len: 222, w: 72, ang: -0.22, c: [50, 102, 36, 255], hi: [82, 140, 52, 215] },
    { x: 128, y: 308, len: 198, w: 64, ang: 0.02, c: [58, 112, 40, 255], hi: [94, 152, 56, 220] },
  ];

  for (const lf of leaves) {
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPolygonPoints(lf.x, lf.y, lf.len, lf.w, lf.ang, 7) },
      rgba: lf.c,
    });
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPolygonPoints(lf.x, lf.y + 12, lf.len * 0.82, lf.w * 0.56, lf.ang, 6) },
      rgba: lf.hi,
    });
    const tx = Math.round(lf.x - Math.sin(lf.ang) * lf.len * 0.88);
    const ty = Math.round(lf.y + Math.cos(lf.ang) * lf.len * 0.88);
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [lf.x, lf.y + 4], to: [tx, ty], width: 3 },
      rgba: [108, 158, 62, 215],
    });
  }
  // 1 + 7*3 = 22 ops (<= 64!)
  return {
    schemaVersion: 3,
    width: 256,
    height: 512,
    usage: 'albedo',
    background: [0, 0, 0, 0],
    operations: ops,
  };
}

function buildSplitFrondSpec() {
  // Iconic tropical Philodendron / Monstera deeply lobed leaf frond (V=0 top stem -> V=1 bottom tip)
  const ops = [];
  // Petiole stem
  ops.push({ op: 'paint', shape: { kind: 'line', from: [128, 2], to: [128, 488], width: 10 }, rgba: [46, 86, 30, 255] });

  // Build deeply lobed tropical leaf silhouette (symmetric lobes fanning from central rachis)
  const lobes = [
    { y: 58, len: 108, w: 30, ang: 1.05, dark: [34, 78, 26, 255], lit: [62, 118, 42, 215] },
    { y: 122, len: 122, w: 33, ang: 0.90, dark: [38, 86, 28, 255], lit: [68, 126, 46, 215] },
    { y: 192, len: 124, w: 34, ang: 0.78, dark: [44, 94, 32, 255], lit: [76, 136, 50, 220] },
    { y: 266, len: 118, w: 32, ang: 0.66, dark: [48, 102, 36, 255], lit: [84, 146, 54, 220] },
    { y: 342, len: 106, w: 29, ang: 0.50, dark: [54, 110, 38, 255], lit: [94, 156, 58, 225] },
  ];

  // Central blade spine joining lobes
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: leafPolygonPoints(128, 44, 462, 52, 0, 8) },
    rgba: [38, 84, 28, 255],
  });

  for (const lb of lobes) {
    for (const side of [-1, 1]) {
      const a = side * lb.ang;
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: leafPolygonPoints(128, lb.y, lb.len, lb.w, a, 6) },
        rgba: lb.dark,
      });
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: leafPolygonPoints(128, lb.y + 4, lb.len * 0.85, lb.w * 0.54, a, 5) },
        rgba: lb.lit,
      });
      const tx = Math.round(128 - Math.sin(a) * lb.len * 0.84);
      const ty = Math.round(lb.y + Math.cos(a) * lb.len * 0.84);
      ops.push({
        op: 'paint',
        shape: { kind: 'line', from: [128, lb.y + 2], to: [tx, ty], width: 3 },
        rgba: [116, 172, 68, 225],
      });
    }
  }

  // Highlighted central midrib over top
  ops.push({ op: 'paint', shape: { kind: 'line', from: [128, 42], to: [128, 492], width: 5 }, rgba: [114, 170, 66, 235] });
  // 2 + 5*2*3 + 1 = 33 ops (<= 64!)
  return {
    schemaVersion: 3,
    width: 256,
    height: 512,
    usage: 'albedo',
    background: [0, 0, 0, 0],
    operations: ops,
  };
}

function buildVineTendrilSpec() {
  // Slender hanging jungle vine ribbon with lush sunlit backlit alternating heart/ovate leaves (V=0 top -> V=1 tip)
  const ops = [];
  const stemPts = [
    [128, 2], [116, 86], [140, 176], [114, 266], [140, 356], [120, 438], [128, 502],
  ];
  for (let i = 0; i < stemPts.length - 1; i++) {
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: stemPts[i], to: stemPts[i + 1], width: 4 },
      rgba: [52, 94, 30, 255],
    });
  }

  // 12 bold alternating sunlit lime-emerald vine leaves with crisp airy gaps between pairs
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const y = Math.round(18 + t * 432);
    const side = i % 2 === 0 ? 1 : -1;
    const sx = Math.round(128 + Math.sin(t * 9.5) * 10);
    const len = Math.round(lerp(106, 52, t));
    const hw = Math.round(lerp(42, 22, t));
    const ang = side * lerp(0.88, 0.42, t);
    const darkR = Math.round(lerp(48, 82, t));
    const darkG = Math.round(lerp(104, 154, t));
    const darkB = Math.round(lerp(30, 44, t));
    const litR = Math.round(lerp(104, 152, t));
    const litG = Math.round(lerp(168, 208, t));
    const litB = Math.round(lerp(50, 68, t));

    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPolygonPoints(sx, y, len, hw, ang, 6) },
      rgba: [darkR, darkG, darkB, 255],
    });
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPolygonPoints(sx + side * 2, y + 5, len * 0.80, hw * 0.60, ang, 5) },
      rgba: [litR, litG, litB, 225],
    });
  }
  return {
    schemaVersion: 3,
    width: 256,
    height: 512,
    usage: 'albedo',
    background: [0, 0, 0, 0],
    operations: ops,
  };
}

function buildOrchidPetalSpec() {
  // 250x250 painted orchid petal swatch: V=0 base (top) -> V=1 outer tip (bottom)
  // Soft pale lilac ruffled edge (#e8a8e6) -> vibrant magenta-violet (#c848bc / #9e329a) -> luminous heart
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 250, height: 250 }, rgba: [236, 174, 234, 255] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 10, y: -18, width: 230, height: 242 }, rgba: [208, 76, 194, 255] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 24, y: -22, width: 202, height: 214 }, rgba: [182, 54, 172, 238] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 46, y: -16, width: 158, height: 162 }, rgba: [158, 38, 152, 220] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 74, y: -12, width: 102, height: 84 }, rgba: [228, 118, 212, 215] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 96, y: -8, width: 58, height: 52 }, rgba: [250, 214, 148, 195] });
  for (let i = -5; i <= 5; i++) {
    const endX = Math.round(125 + i * 22);
    const endY = Math.round(234 - Math.abs(i) * 14);
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [125, 6], to: [endX, endY], width: i === 0 ? 4 : 2 },
      rgba: [134, 24, 130, 120],
    });
  }
  ops.push({ op: 'paint', shape: { kind: 'line', from: [20, 234], to: [125, 245], width: 10 }, rgba: [244, 194, 242, 190] });
  ops.push({ op: 'paint', shape: { kind: 'line', from: [125, 245], to: [230, 234], width: 10 }, rgba: [244, 194, 242, 190] });
  return {
    schemaVersion: 3,
    width: 250,
    height: 250,
    usage: 'albedo',
    background: [236, 174, 234, 255],
    operations: ops,
  };
}

function buildOrchidLipSpec() {
  // 250x250 labellum / luminous golden-yellow throat swatch (#ebb836 -> #ffdf52) with rich magenta lip frill
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 250, height: 250 }, rgba: [176, 42, 164, 255] });
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 222, width: 250, height: 28 }, rgba: [236, 168, 232, 235] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 4, y: -14, width: 242, height: 230 }, rgba: [242, 184, 34, 255] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 22, y: -6, width: 206, height: 196 }, rgba: [255, 212, 54, 255] });
  ops.push({ op: 'paint', shape: { kind: 'ellipse', x: 50, y: 12, width: 150, height: 140 }, rgba: [255, 238, 108, 252] });
  for (let i = -3; i <= 3; i++) {
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [125 + i * 8, 8], to: [125 + i * 24, 152], width: 3 },
      rgba: [164, 32, 112, 150],
    });
  }
  ops.push({
    op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: 6, height: 6 },
    rgba: [172, 34, 116, 170],
    count: 20,
    seed: 9127,
    area: { x: 58, y: 44, width: 134, height: 124 },
  });
  return {
    schemaVersion: 3,
    width: 250,
    height: 250,
    usage: 'albedo',
    background: [176, 42, 164, 255],
    operations: ops,
  };
}

function buildOrchidStemSpec() {
  // Smooth organic orchid flower-stem & bud green (#3a6128)
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 250, height: 250 }, rgba: [58, 98, 40, 255] });
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 40, y: 0, width: 90, height: 250 }, rgba: [76, 122, 50, 180] });
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 165, y: 0, width: 70, height: 250 }, rgba: [44, 76, 30, 180] });
  // Subtle pinkish blush at top V=0..0.25 for bud tips if needed, subtle stem nodes
  for (let y = 32; y < 240; y += 54) {
    ops.push({ op: 'paint', shape: { kind: 'line', from: [0, y], to: [250, y], width: 4 }, rgba: [42, 68, 28, 150] });
  }
  return {
    schemaVersion: 3,
    width: 250,
    height: 250,
    usage: 'albedo',
    background: [58, 98, 40, 255],
    operations: ops,
  };
}

function buildOrchidStrapLeafSpec() {
  // Thick leathery dark-emerald basal orchid leaf with pale center crease
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 250, height: 250 }, rgba: [42, 84, 32, 255] });
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 24, y: 0, width: 202, height: 250 }, rgba: [56, 104, 40, 210] });
  ops.push({ op: 'paint', shape: { kind: 'rectangle', x: 64, y: 0, width: 122, height: 250 }, rgba: [72, 122, 48, 185] });
  ops.push({ op: 'paint', shape: { kind: 'line', from: [125, 0], to: [125, 250], width: 8 }, rgba: [108, 154, 68, 215] });
  return {
    schemaVersion: 3,
    width: 250,
    height: 250,
    usage: 'albedo',
    background: [42, 84, 32, 255],
    operations: ops,
  };
}

// ============================================================================
// Organic Sculpted Geometry Builders
// ============================================================================

function makeBarkBranch(controlPts, radiiAtCtrl, opts) {
  const samplesPerSpan = opts.samplesPerSpan || 6;
  const radialSegments = opts.radialSegments || 16;
  const gnarlAmp = opts.gnarlAmp ?? 0.025;
  const gnarlFreq = opts.gnarlFreq ?? 4.5;
  const seedPhase = opts.seedPhase ?? 0;
  const sectionScale = opts.sectionScale || null;

  const path = catmullRomPath(controlPts, samplesPerSpan);
  const n = path.length;
  const radii = new Array(n);
  const secScales = sectionScale ? new Array(n) : null;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const f = t * (radiiAtCtrl.length - 1);
    const i0 = Math.min(Math.floor(f), radiiAtCtrl.length - 2);
    const frac = f - i0;
    const baseR = lerp(radiiAtCtrl[i0], radiiAtCtrl[i0 + 1], frac);
    // Subtle organic knot/swelling modulation along length
    const swell = 1 + 0.065 * Math.sin(t * 14.0 + seedPhase) + 0.04 * Math.cos(t * 27.0 - seedPhase * 1.7);
    radii[i] = Math.max(0.012, baseR * swell);
    if (secScales) {
      secScales[i] = sectionScale(t);
    }
  }

  const tubeOpts = {
    radialSegments,
    creaseAngle: 180,
    cap: opts.cap ?? true,
    twist: opts.twist ?? 0,
  };
  if (secScales) tubeOpts.sectionScale = secScales;

  let geo = taperedTube(path, radii, tubeOpts);

  // Organic gnarled rainforest bark furrows & twisted ridges
  if (gnarlAmp > 0) {
    geo = displace(geo, ([x, y, z]) => {
      const f1 = Math.sin(x * gnarlFreq + y * 3.1 + z * gnarlFreq + seedPhase);
      const f2 = Math.cos(x * (gnarlFreq * 1.9) - y * 5.2 + z * (gnarlFreq * 1.7) + seedPhase * 2.1);
      const f3 = Math.sin((x - z) * 8.5 + y * 7.2 + seedPhase * 0.7);
      const dx = gnarlAmp * (0.55 * f1 + 0.30 * f2 + 0.15 * f3);
      const dy = gnarlAmp * 0.5 * (0.5 * f2 - 0.35 * f1);
      const dz = gnarlAmp * (0.55 * f2 - 0.30 * f1 + 0.15 * f3);
      return [dx, dy, dz];
    });
  }

  // Scale UVs proportionally to real world arc length & circumference (~1.1 m per tile)
  const arcLen = pathArcLength(path);
  const avgR = radii.reduce((a, b) => a + b, 0) / n;
  const uTiles = Math.max(1, Math.round((2 * Math.PI * avgR) / 0.85));
  const vTiles = Math.max(1, arcLen / 1.15);
  geo = remapUV(geo, { scale: [uTiles, vTiles] });
  return { geo, path, radii };
}

function makeMossCushionOnSpline(path, radii, tCenter, spanLength, arcSpanRad, thickness, rng, rollCenter) {
  // Build a sculpted organic velvet cushion saddle hugging the UPPER (+Y) and shoulder surfaces of a branch
  const uSegs = 8; // across branch circumference
  const vSegs = 7; // along branch length
  const totalLen = pathArcLength(path);
  const halfDt = clamp((spanLength * 0.5) / Math.max(totalLen, 0.2), 0.015, 0.30);
  const phaseA = rng.range(0, 6.28);
  const phaseB = rng.range(0, 6.28);
  const rollBias = (rollCenter ?? 0) + rng.range(-0.22, 0.22);

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vSegs; iv++) {
    const v = iv / vSegs;
    const t = clamp(tCenter + (v - 0.5) * 2 * halfDt, 0.02, 0.98);
    const { point, radius, tangent } = samplePolyline(path, radii, t);
    const basis = buildBasis(tangent, [0, 1, 0]);
    const endFade = Math.sin(v * Math.PI); // 0 at ends, 1 at middle

    for (let iu = 0; iu <= uSegs; iu++) {
      const u = iu / uSegs;
      const sideFade = Math.sin(u * Math.PI); // 0 at side edges, 1 at top crest
      const ang = (u - 0.5) * arcSpanRad + rollBias;

      // Direction around upper arc of branch (0 = basis.up, +/- = basis.right)
      const dirX = Math.cos(ang) * basis.up[0] + Math.sin(ang) * basis.right[0];
      const dirY = Math.cos(ang) * basis.up[1] + Math.sin(ang) * basis.right[1];
      const dirZ = Math.cos(ang) * basis.up[2] + Math.sin(ang) * basis.right[2];

      // Organic velvety multi-lobe pillow bumps
      const dome = Math.pow(Math.max(0, endFade * sideFade), 0.58);
      const lump =
        1 +
        0.30 * Math.sin(u * 10.5 + v * 8.5 + phaseA) +
        0.20 * Math.cos(u * 18.0 - v * 14.0 + phaseB);

      // Embed edge slightly (-0.024 m) inside bark so ZERO floating gap; puff richly on top & shoulders
      const radialOffset = radius - 0.024 + thickness * dome * lump;
      const px = point[0] + dirX * radialOffset;
      const py = point[1] + dirY * radialOffset;
      const pz = point[2] + dirZ * radialOffset;

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  const stride = uSegs + 1;
  for (let iv = 0; iv < vSegs; iv++) {
    for (let iu = 0; iu < uSegs; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Seal underside inside the bark
  const innerStart = positions.length / 3;
  for (let iv = 0; iv <= vSegs; iv++) {
    const v = iv / vSegs;
    const t = clamp(tCenter + (v - 0.5) * 2 * halfDt, 0.02, 0.98);
    const { point, radius, tangent } = samplePolyline(path, radii, t);
    const basis = buildBasis(tangent, [0, 1, 0]);
    const innerR = Math.max(0.01, radius - 0.05);
    positions.push(
      point[0] + basis.up[0] * innerR * 0.4,
      point[1] + basis.up[1] * innerR * 0.4,
      point[2] + basis.up[2] * innerR * 0.4,
    );
    uvs.push(0.5, v);
  }
  for (let iv = 0; iv < vSegs; iv++) {
    const l0 = iv * stride;
    const l1 = (iv + 1) * stride;
    const r0 = iv * stride + uSegs;
    const r1 = (iv + 1) * stride + uSegs;
    const c0 = innerStart + iv;
    const c1 = innerStart + iv + 1;
    indices.push(l0, c0, l1);
    indices.push(l1, c0, c1);
    indices.push(r0, r1, c0);
    indices.push(r1, c1, c0);
  }
  for (let iu = 0; iu < uSegs; iu++) {
    indices.push(iu, iu + 1, innerStart);
    const endRow = vSegs * stride;
    indices.push(endRow + iu, innerStart + vSegs, endRow + iu + 1);
  }

  return meshGeo({ positions, indices, uvs });
}

function makeCurvedLeafSprayCard(width, length, droop, cup, uSegs, vSegs) {
  // Local frame: stem attachment at (0,0,0) with UV.y = 0,
  // blade sweeps along +X to length with UV.y = 1, width along Z, normal +Y.
  const us = uSegs || 2;
  const vs = vSegs || 3;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vs; iv++) {
    const v = iv / vs;
    const x = v * length;
    const yArch = Math.sin(v * Math.PI) * length * 0.10 - v * v * droop;
    const flutter = Math.sin(v * Math.PI * 2.0) * 0.014 * width;

    for (let iu = 0; iu <= us; iu++) {
      const u = iu / us;
      const s = (u - 0.5) * 2;
      const z = s * (width * 0.5);
      const y = yArch - cup * (1 - s * s) * Math.sin(v * Math.PI) + flutter * s;
      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = us + 1;
  for (let iv = 0; iv < vs; iv++) {
    for (let iu = 0; iu < us; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  return meshGeo({ positions, indices, uvs });
}

function splayCardForCurve(cardGeo, yawDeg, pitchDeg, rollDeg, liftY, shiftZ) {
  // Rotate a leaf card in local space so repeatAlongCurve splays sprays OUTWARD from branch sides!
  const yR = (yawDeg * Math.PI) / 180;
  const pR = (pitchDeg * Math.PI) / 180;
  const rR = (rollDeg * Math.PI) / 180;
  const fwd = vNorm([Math.cos(pR) * Math.cos(yR), Math.sin(pR), Math.cos(pR) * Math.sin(yR)]);
  const bs = buildBasis(fwd, [0, 1, 0]);
  const cr = Math.cos(rR);
  const sr = Math.sin(rR);
  const up = vAdd(vScale(bs.up, cr), vScale(bs.right, sr));
  const right = vCross(fwd, up);
  return transformGeo(cardGeo, [0, liftY || 0, shiftZ || 0], fwd, up, right, 1);
}

function makeVineRibbonCard(width, length, swayAmp, phase) {
  // Hanging vine card: attachment at (0,0,0) UV.y=0, hangs straight DOWN along -Y to -length with UV.y=1!
  const us = 2;
  const vs = 5;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vs; iv++) {
    const v = iv / vs;
    const y = -v * length;
    const swayX = Math.sin(v * Math.PI * 1.5 + phase) * swayAmp * v;
    const swayZ = Math.cos(v * Math.PI * 1.2 + phase) * swayAmp * 0.75 * v;
    const twistAng = v * 1.25 + phase * 0.4;
    const ca = Math.cos(twistAng);
    const sa = Math.sin(twistAng);

    for (let iu = 0; iu <= us; iu++) {
      const u = iu / us;
      const s = (u - 0.5) * 2;
      const hw = width * 0.5 * lerp(1.0, 0.72, v);
      const px = swayX + s * hw * ca;
      const pz = swayZ + s * hw * sa;
      positions.push(px, y, pz);
      uvs.push(u, v);
    }
  }

  const stride = us + 1;
  for (let iv = 0; iv < vs; iv++) {
    for (let iu = 0; iu < us; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return meshGeo({ positions, indices, uvs });
}

// ============================================================================
// 3D Sculpted Orchid Blossom & Epiphytic Rosette Builder
// ============================================================================

function makeSculptedPetalGeo(length, maxWidth, cupDepth, curlBack, uSegs, vSegs, shapeExp, roundness, tipWidthFrac) {
  // Local space: base at (0,0,0) UV.y=0, tip at (0, length, ...) UV.y=1, facing +Z!
  // Broad soft-rounded Phalaenopsis/Cattleya butterfly-wing petal silhouette
  const us = uSegs || 2;
  const vs = vSegs || 4;
  const exp = shapeExp || 0.62;
  const rnd = roundness || 0.55;
  const tipMin = tipWidthFrac ?? 0.24;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vs; iv++) {
    const v = iv / vs;
    const sinTerm = Math.max(0, Math.sin(Math.pow(v, exp) * Math.PI));
    const endFloor = v > 0.85 ? tipMin : 0.14;
    const wFrac = Math.max(endFloor, Math.pow(sinTerm, rnd));
    const halfW = maxWidth * 0.5 * wFrac;
    const y = v * length;
    const zCurve = Math.sin(v * Math.PI) * cupDepth - v * v * curlBack;

    for (let iu = 0; iu <= us; iu++) {
      const u = iu / us;
      const s = (u - 0.5) * 2;
      const x = s * halfW;
      // Softly round outer petal tip corners (outer vertices pull slightly back in Y at v=1)
      const tipRoundY = v > 0.85 ? -Math.abs(s) * Math.abs(s) * length * 0.08 : 0;
      const ruffle = Math.sin(u * Math.PI * 3.0) * 0.0025 * v * v;
      const z = zCurve + (1 - s * s) * cupDepth * 0.45 * Math.sin(v * Math.PI) + ruffle;
      positions.push(x, y + tipRoundY, z);
      uvs.push(u, v);
    }
  }

  const stride = us + 1;
  for (let iv = 0; iv < vs; iv++) {
    for (let iu = 0; iu < us; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  return meshGeo({ positions, indices, uvs });
}

function makeOrchidLipGeo(length, width) {
  // Sculpted 3D Cattleya/Phalaenopsis trumpet labellum curving forward (+Z) and slightly down (-Y),
  // boldly displaying the glowing golden-yellow throat!
  const us = 3;
  const vs = 3;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vs; iv++) {
    const v = iv / vs;
    const flare = lerp(0.36, 1.05, Math.pow(v, 0.62)) * (1 - 0.10 * v * v);
    const z = v * length;
    const yCenter = -0.18 * length * v - 0.18 * length * v * v;

    for (let iu = 0; iu <= us; iu++) {
      const u = iu / us;
      const s = (u - 0.5) * 2;
      const angle = s * 1.15 * lerp(1.0, 0.68, v);
      const r = width * 0.5 * flare;
      const x = Math.sin(angle) * r;
      const y = yCenter + (1 - Math.cos(angle)) * r * 0.88 + Math.sin(u * Math.PI * 5) * 0.003 * v;
      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = us + 1;
  for (let iv = 0; iv < vs; iv++) {
    for (let iu = 0; iu < us; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return meshGeo({ positions, indices, uvs });
}

function buildOrchidBlossomTemplates(orchidAtlas) {
  // Lush hero foreground 3D sculpted Phalaenopsis/Cattleya orchid (~0.18 m across, lush soft-rounded butterfly wings!)
  const pieces = [];

  // 1. Dorsal Sepal (broad rounded top petal, 4 vSegs for smooth rounded tip!)
  const dorsalBase = remapUVToAtlas(
    makeSculptedPetalGeo(0.084, 0.068, 0.013, 0.009, 2, 4, 0.65, 0.54, 0.34),
    orchidAtlas,
    'petal_broad',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );
  pieces.push(transformGeo(dorsalBase, [0, 0.005, -0.003], [1, 0, 0], [0, 0.98, 0.18], [0, -0.18, 0.98], 1));

  // 2. Two Huge Broad Rounded Butterfly Lateral Petals (signature Phalaenopsis wings!)
  const wingBase = remapUVToAtlas(
    makeSculptedPetalGeo(0.095, 0.096, 0.016, 0.008, 2, 4, 0.58, 0.46, 0.42),
    orchidAtlas,
    'petal_broad',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );
  for (const side of [-1, 1]) {
    const ang = side * 1.38;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const bx = [ca, sa, 0];
    const by = [-sa * 0.95, ca * 0.95, 0.30];
    const bz = vNorm(vCross(bx, by));
    pieces.push(transformGeo(wingBase, [side * 0.005, 0.003, 0.003], bx, by, bz, 1));
  }

  // 3. Two Lower Lateral Sepals (softly rounded, tucked behind wings & lip)
  const lowerBase = remapUVToAtlas(
    makeSculptedPetalGeo(0.074, 0.058, 0.011, 0.009, 2, 4, 0.68, 0.56, 0.30),
    orchidAtlas,
    'petal_broad',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );
  for (const side of [-1, 1]) {
    const ang = side * 2.52;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const bx = [ca, sa, 0];
    const by = [-sa * 0.98, ca * 0.98, 0.16];
    const bz = vNorm(vCross(bx, by));
    pieces.push(transformGeo(lowerBase, [side * 0.004, -0.005, -0.005], bx, by, bz, 1));
  }

  // 4. Prominent Sculpted 3D Golden-Throat Labellum (Lip) projecting forward at +Z!
  const lipBase = remapUVToAtlas(
    makeOrchidLipGeo(0.062, 0.056),
    orchidAtlas,
    'lip_throat',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );
  pieces.push(transformGeo(lipBase, [0, -0.001, 0.007], [1, 0, 0], [0, 1, 0], [0, 0, 1], 1));

  // 5. Short pedicel stem behind blossom
  const pedGeo = remapUVToAtlas(
    taperedTube([[0, 0, -0.036], [0, 0, 0.002]], [0.004, 0.005], { radialSegments: 4, cap: true }),
    orchidAtlas,
    'stem_green',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );
  pieces.push(pedGeo);

  const fullBlossom = mergeGeos(pieces);

  // Unopened orchid flower bud (teardrop magenta-pink bud at raceme tip)
  const budBase = remapUVToAtlas(
    taperedTube(
      [[0, 0, -0.018], [0, 0, 0.0], [0, 0, 0.018], [0, 0, 0.032]],
      [0.0035, 0.014, 0.016, 0.002],
      { radialSegments: 5, cap: true },
    ),
    orchidAtlas,
    'petal_broad',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );

  // Sculpted thick curved epiphytic orchid strap leaf for basal rosettes gripping the mossy bark
  const strapRaw = makeSculptedPetalGeo(0.32, 0.088, 0.022, 0.062, 2, 3, 0.56, 0.65, 0.14);
  const strapLeaf = remapUVToAtlas(
    strapRaw,
    orchidAtlas,
    'orchid_leaf',
    { inputOrigin: 'top-left', mode: 'texel-center' },
  );

  return { fullBlossom, budBase, strapLeaf };
}

// ============================================================================
// Main Asset Builder
// ============================================================================

async function build() {
  const root = createRoot('gnarled-canopy-bough');
  const rng = seededRandom('lagoon-canopy-bough-v1');

  // --------------------------------------------------------------------------
  // 1. Materials (strictly <= 4 materials / draw slots)
  // --------------------------------------------------------------------------

  // Material 1: Gnarled Tropical Bark (approved Kiln bark albedo/normal/ARM)
  const [barkAlbedo, barkNormal, barkArm] = await Promise.all([
    loadApprovedTexture('kiln.texture.bark-brown-01-albedo.v1'),
    loadApprovedTexture('kiln.texture.bark-brown-01-normal.v1'),
    loadApprovedTexture('kiln.texture.bark-brown-01-arm.v1'),
  ]);
  const barkMat = pbrMaterial({
    albedo: barkAlbedo,
    normal: barkNormal,
    metallicRoughness: barkArm,
    roughness: 0.94,
    metalness: 0.0,
    name: 'BoughBark',
  });
  // Deep weathered moss-tinted rainforest bark (#473c30 - #5c4e3e)
  barkMat.color.setHex(0xb4aa96);

  // Material 2: Velvety Epiphytic Moss Cushions (rich olive-emerald #3f632b / #557a38)
  const mossTex = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'EpiphyticMoss',
    layers: [
      { op: 'solid', color: 0x4b7430 },
      { op: 'cellular', colorA: 0x345821, colorB: 0x67923d, cellsX: 16, cellsY: 16, seed: 4102, feature: 'f1', range: 0.9, opacity: 0.75 },
      { op: 'noise', colorA: 0x3b6226, colorB: 0x7ca648, scale: 18, octaves: 5, seed: 8831, blend: 'overlay', opacity: 0.80 },
      { op: 'noise', colorA: 0x2c4b1d, colorB: 0x89b250, scale: 42, octaves: 4, seed: 3329, blend: 'overlay', opacity: 0.55 },
    ],
  });
  const mossNormal = normalMapFromHeight(mossTex, { strength: 5.5, name: 'EpiphyticMossNormal' });
  const mossMat = pbrMaterial({
    albedo: mossTex,
    normal: mossNormal,
    roughness: 0.92,
    metalness: 0.0,
    name: 'BoughMoss',
  });

  // Material 3: Canopy Leaves (4-column full-height V3 RGBA textureAtlas with mask-rgb-dilate!)
  // Every column spans full height (y=0..512, gutter=0) so remapUVToAtlas(..., axes:'u-only')
  // preserves UV.y = 0 (stem) -> 1 (tip) bit-for-bit for Holodeck foliage wind sway!
  const leafAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'sunlit_spray',
        content: { x: 0, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildSunlitSpraySpec() },
      },
      {
        name: 'shaded_cluster',
        content: { x: 256, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildShadedClusterSpec() },
      },
      {
        name: 'split_frond',
        content: { x: 512, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildSplitFrondSpec() },
      },
      {
        name: 'vine_tendril',
        content: { x: 768, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildVineTendrilSpec() },
      },
    ],
  });
  const leavesMat = foliageMaterial(leafAtlas, {
    alphaCutoff: 0.5,
    roughness: 0.52,
    doubleSided: true,
    name: 'BoughLeaves',
  });

  // Material 4: Cascading Magenta-Violet Tropical Orchids (4-region 512x512 V3 atlas)
  const orchidAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'petal_broad',
        content: { x: 2, y: 2, width: 250, height: 250 },
        gutter: 2,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: buildOrchidPetalSpec() },
      },
      {
        name: 'lip_throat',
        content: { x: 258, y: 2, width: 250, height: 250 },
        gutter: 2,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: buildOrchidLipSpec() },
      },
      {
        name: 'stem_green',
        content: { x: 2, y: 258, width: 250, height: 250 },
        gutter: 2,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: buildOrchidStemSpec() },
      },
      {
        name: 'orchid_leaf',
        content: { x: 258, y: 258, width: 250, height: 250 },
        gutter: 2,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: buildOrchidStrapLeafSpec() },
      },
    ],
  });
  const orchidNormal = normalMapFromHeight(orchidAtlas, { strength: 2.0, name: 'OrchidNormal' });
  const orchidMat = pbrMaterial({
    albedo: orchidAtlas,
    normal: orchidNormal,
    roughness: 0.46,
    metalness: 0.0,
    doubleSided: true,
    name: 'OrchidBlossoms',
  });

  // --------------------------------------------------------------------------
  // 2. Mesh_BoughBark: Gnarled Trunk, Buttress Roots, Sweeping Arch & Limbs
  // --------------------------------------------------------------------------

  const barkGeos = [];
  const allSplines = []; // store { path, radii, tag } for moss & foliage anchoring

  // Main Continuous Trunk + Sweeping Overhanging Arch (X = 0 -> +8.85 m, Y = -0.45 -> +5.85 m)
  const mainCtrl = [
    [0.00, -0.45, 0.00],
    [-0.06, 0.35, 0.06],
    [-0.10, 1.45, 0.14],
    [0.10, 2.58, 0.16],
    [0.58, 3.66, 0.12],
    [1.48, 4.46, 0.04],
    [2.82, 4.82, -0.10],
    [4.45, 4.68, -0.20],
    [6.15, 4.90, -0.04],
    [7.68, 5.40, 0.12],
    [8.78, 5.82, 0.16],
  ];
  const mainRadii = [0.50, 0.44, 0.38, 0.35, 0.33, 0.29, 0.25, 0.20, 0.155, 0.105, 0.042];
  const mainBranch = makeBarkBranch(mainCtrl, mainRadii, {
    samplesPerSpan: 4,
    radialSegments: 16,
    gnarlAmp: 0.032,
    gnarlFreq: 3.6,
    twist: 55,
    seedPhase: 0.5,
  });
  barkGeos.push(mainBranch.geo);
  allSplines.push({ ...mainBranch, tag: 'main' });

  // 6 Sculptural Rainforest Plank Buttress Root Flanges flaring organically to Y = -0.50 m
  const buttressDefs = [
    { angDeg: 18, reach: 0.90, startY: 2.15, rTop: 0.19, rBot: 0.24, curveZ: 0.10 },
    { angDeg: 78, reach: 0.98, startY: 2.25, rTop: 0.20, rBot: 0.25, curveZ: -0.08 },
    { angDeg: 142, reach: 1.04, startY: 2.40, rTop: 0.21, rBot: 0.26, curveZ: 0.12 },
    { angDeg: 206, reach: 1.00, startY: 2.30, rTop: 0.20, rBot: 0.25, curveZ: -0.10 },
    { angDeg: 266, reach: 0.96, startY: 2.05, rTop: 0.19, rBot: 0.24, curveZ: 0.09 },
    { angDeg: 322, reach: 0.88, startY: 1.90, rTop: 0.18, rBot: 0.23, curveZ: -0.07 },
  ];

  for (let i = 0; i < buttressDefs.length; i++) {
    const b = buttressDefs[i];
    const a = (b.angDeg * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ta = -sa;
    const tb = ca;
    const ctrl = [
      [ca * 0.10, b.startY, sa * 0.10],
      [ca * (b.reach * 0.36) + ta * b.curveZ, b.startY * 0.50, sa * (b.reach * 0.36) + tb * b.curveZ],
      [ca * (b.reach * 0.72) + ta * b.curveZ * 0.6, 0.16, sa * (b.reach * 0.72) + tb * b.curveZ * 0.6],
      [ca * b.reach, -0.44, sa * b.reach],
    ];
    const br = makeBarkBranch(ctrl, [b.rTop, b.rTop * 1.24, b.rBot, b.rBot * 0.85], {
      samplesPerSpan: 3,
      radialSegments: 10,
      gnarlAmp: 0.018,
      gnarlFreq: 5.2,
      seedPhase: 2.1 + i * 1.3,
      sectionScale: (t) => [lerp(0.75, 0.62, t), lerp(1.30, 1.55, Math.sin(t * Math.PI))],
    });
    barkGeos.push(br.geo);
    allSplines.push({ ...br, tag: 'buttress' });
  }

  // 5 Major Secondary Forked Limbs (cleanly rooted INSIDE main trunk/arch, fanning Z in [-2.05, +2.10])
  const secondaryDefs = [
    {
      tag: 'fork_crown_left',
      ctrl: [
        [0.34, 3.22, 0.14], // cleanly inside trunk centerline (zero back elbow!)
        [-0.25, 4.35, -0.35],
        [-0.65, 5.28, -0.68],
        [0.18, 5.85, -0.42],
        [1.55, 5.95, -0.25],
      ],
      radii: [0.22, 0.18, 0.14, 0.095, 0.042],
    },
    {
      tag: 'fork_front_left',
      ctrl: [
        [1.48, 4.46, 0.04],
        [2.65, 4.92, 0.86],
        [3.98, 5.18, 1.58],
        [5.22, 5.52, 2.04],
      ],
      radii: [0.185, 0.145, 0.098, 0.038],
    },
    {
      tag: 'fork_back_left',
      ctrl: [
        [2.28, 4.72, -0.06],
        [3.55, 5.08, -0.92],
        [4.92, 5.36, -1.65],
        [6.12, 5.72, -1.98],
      ],
      radii: [0.175, 0.138, 0.092, 0.036],
    },
    {
      tag: 'fork_mid_front',
      ctrl: [
        [4.22, 4.70, -0.18],
        [5.35, 5.08, 0.62],
        [6.48, 5.52, 1.38],
        [7.42, 5.88, 1.68],
      ],
      radii: [0.138, 0.106, 0.072, 0.030],
    },
    {
      tag: 'fork_far_back',
      ctrl: [
        [5.85, 4.86, -0.08],
        [6.88, 5.22, -0.78],
        [7.88, 5.62, -1.36],
        [8.48, 5.92, -1.55],
      ],
      radii: [0.12, 0.092, 0.062, 0.026],
    },
  ];

  const forkSplines = [];
  for (let i = 0; i < secondaryDefs.length; i++) {
    const fd = secondaryDefs[i];
    const br = makeBarkBranch(fd.ctrl, fd.radii, {
      samplesPerSpan: 4,
      radialSegments: 10,
      gnarlAmp: 0.020,
      gnarlFreq: 4.8,
      twist: 28 * (i % 2 === 0 ? 1 : -1),
      seedPhase: 7.4 + i * 2.3,
    });
    barkGeos.push(br.geo);
    allSplines.push({ ...br, tag: fd.tag });
    forkSplines.push({ ...br, tag: fd.tag });
  }

  // 16 Crooked Tertiary Canopy Branchlets / Twigs (including 4 upper-center crown dome twigs filling the canopy center!)
  const twigRng = rng.fork('twigs');
  const twigDefs = [
    // Off main bough (including lush inward/upward crown dome branches bridging the canopy center!)
    { src: mainBranch, t: 0.44, dir: [0.65, 0.62, 0.55], len: 1.45, r0: 0.074 },
    { src: mainBranch, t: 0.52, dir: [0.55, 0.72, -0.52], len: 1.50, r0: 0.070 },
    { src: mainBranch, t: 0.60, dir: [0.55, 0.76, 0.22], len: 1.45, r0: 0.066 }, // center dome bridge 1
    { src: mainBranch, t: 0.68, dir: [0.62, 0.64, -0.30], len: 1.42, r0: 0.062 }, // center dome bridge 2
    { src: mainBranch, t: 0.76, dir: [0.62, 0.65, 0.45], len: 1.32, r0: 0.056 },
    { src: mainBranch, t: 0.86, dir: [0.68, 0.58, -0.45], len: 1.18, r0: 0.046 },
    // Off secondary forks (arching inward & upward as well as outward for full organic volume!)
    { src: forkSplines[0], t: 0.44, dir: [-0.42, 0.68, 0.62], len: 1.32, r0: 0.068 },
    { src: forkSplines[0], t: 0.74, dir: [0.60, 0.56, -0.58], len: 1.28, r0: 0.058 },
    { src: forkSplines[1], t: 0.46, dir: [0.58, 0.62, 0.56], len: 1.28, r0: 0.062 },
    { src: forkSplines[1], t: 0.72, dir: [0.65, 0.58, -0.62], len: 1.32, r0: 0.052 }, // bridges back toward center
    { src: forkSplines[2], t: 0.46, dir: [0.58, 0.60, -0.56], len: 1.28, r0: 0.058 },
    { src: forkSplines[2], t: 0.72, dir: [0.64, 0.58, 0.64], len: 1.32, r0: 0.050 }, // bridges back toward center
    { src: forkSplines[3], t: 0.48, dir: [0.52, 0.62, 0.56], len: 1.15, r0: 0.048 },
    { src: forkSplines[3], t: 0.76, dir: [0.62, 0.54, -0.58], len: 1.12, r0: 0.042 },
    { src: forkSplines[4], t: 0.52, dir: [0.52, 0.60, -0.55], len: 1.10, r0: 0.046 },
    { src: forkSplines[4], t: 0.76, dir: [0.64, 0.52, 0.55], len: 1.02, r0: 0.038 },
  ];

  const twigSplines = [];
  for (let i = 0; i < twigDefs.length; i++) {
    const td = twigDefs[i];
    const start = samplePolyline(td.src.path, td.src.radii, td.t);
    const d = vNorm(td.dir);
    const p0 = start.point;
    const p1 = vAdd(p0, vScale(d, td.len * 0.42));
    p1[1] = Math.max(p1[1] + 0.14, 4.45);
    const p2 = vAdd(p0, vScale(d, td.len * 0.78));
    p2[0] += twigRng.range(-0.14, 0.18);
    p2[1] = Math.max(p2[1] + 0.18, 4.65);
    p2[2] += twigRng.range(-0.18, 0.18);
    const p3 = vAdd(p0, vScale(d, td.len));
    p3[1] = Math.max(p3[1] + 0.12, 4.75);

    const tw = makeBarkBranch([p0, p1, p2, p3], [td.r0, td.r0 * 0.72, td.r0 * 0.44, 0.016], {
      samplesPerSpan: 3,
      radialSegments: 6,
      gnarlAmp: 0.009,
      gnarlFreq: 6.5,
      seedPhase: 18.0 + i * 1.9,
    });
    barkGeos.push(tw.geo);
    twigSplines.push(tw);
  }

  // 3 Climbing Woody Liana Vines wrapping helically around the trunk & crook
  for (let l = 0; l < 3; l++) {
    const lPts = [];
    const lRadii = [];
    const steps = 18;
    const tEnd = l === 0 ? 0.62 : l === 1 ? 0.48 : 0.36;
    const turns = l === 0 ? 2.4 : l === 1 ? 1.9 : 1.5;
    const phase0 = l * 2.15;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const t = lerp(0.03, tEnd, f);
      const { point, radius, tangent } = samplePolyline(mainBranch.path, mainBranch.radii, t);
      const basis = buildBasis(tangent, [0, 1, 0]);
      const ang = phase0 + f * turns * Math.PI * 2;
      const lr = lerp(0.036, 0.016, f);
      const off = radius + lr * 0.42;
      const vx = Math.cos(ang) * basis.right[0] + Math.sin(ang) * basis.up[0];
      const vy = Math.cos(ang) * basis.right[1] + Math.sin(ang) * basis.up[1];
      const vz = Math.cos(ang) * basis.right[2] + Math.sin(ang) * basis.up[2];
      lPts.push([point[0] + vx * off, point[1] + vy * off, point[2] + vz * off]);
      lRadii.push(lr);
    }
    let lGeo = taperedTube(lPts, lRadii, { radialSegments: 6, creaseAngle: 180, cap: true });
    lGeo = remapUV(lGeo, { scale: [1, pathArcLength(lPts) / 0.9] });
    barkGeos.push(lGeo);
  }

  const mergedBark = mergeGeos(barkGeos);
  createPart('BoughBark', mergedBark, barkMat, { parent: root });

  // --------------------------------------------------------------------------
  // 3. Mesh_BoughMoss: Thick Velvety Epiphytic Moss Cushions (Upper & Shoulders!)
  // --------------------------------------------------------------------------

  const mossRng = rng.fork('moss');
  const mossGeos = [];

  // Lush draping velvet saddles wrapping over upper ridges & front/back shoulders of main trunk crook & arch
  // (includes bulbous draping shoulder pads cradling the orchid bases so moss reads vividly from Y = 1.7 m!)
  const mainMossStations = [
    { t: 0.14, len: 0.90, arc: 2.60, th: 0.085, roll: 0.52 },
    { t: 0.22, len: 0.98, arc: 2.80, th: 0.095, roll: -0.48 },
    { t: 0.30, len: 1.08, arc: 3.15, th: 0.118, roll: 0.68 },  // thick front-shoulder trunk crook moss bed!
    { t: 0.36, len: 1.15, arc: 3.20, th: 0.122, roll: -0.52 }, // back-shoulder crook moss bed!
    { t: 0.43, len: 1.18, arc: 3.15, th: 0.118, roll: 0.72 },  // main arch shoulder orchid-cradle moss bed!
    { t: 0.51, len: 1.16, arc: 3.05, th: 0.108, roll: -0.58 },
    { t: 0.59, len: 1.18, arc: 3.00, th: 0.098, roll: 0.62 },  // draping over front rim of mid-bough!
    { t: 0.67, len: 1.12, arc: 2.90, th: 0.090, roll: -0.50 },
    { t: 0.75, len: 1.04, arc: 2.75, th: 0.080, roll: 0.52 },
    { t: 0.83, len: 0.92, arc: 2.55, th: 0.068, roll: -0.35 },
    { t: 0.90, len: 0.74, arc: 2.35, th: 0.056, roll: 0.30 },
  ];
  for (const ms of mainMossStations) {
    mossGeos.push(makeMossCushionOnSpline(mainBranch.path, mainBranch.radii, ms.t, ms.len, ms.arc, ms.th, mossRng, ms.roll));
  }

  // Thick moss pillows hugging the upper crests of all 6 buttress root flanges
  for (const sp of allSplines) {
    if (sp.tag === 'buttress') {
      mossGeos.push(makeMossCushionOnSpline(sp.path, sp.radii, 0.36, 0.88, 2.55, 0.075, mossRng, 0));
      mossGeos.push(makeMossCushionOnSpline(sp.path, sp.radii, 0.66, 0.78, 2.45, 0.065, mossRng, 0));
    }
  }

  // Moss saddles along all 5 secondary forked limbs
  for (const fk of forkSplines) {
    mossGeos.push(makeMossCushionOnSpline(fk.path, fk.radii, 0.24, 0.92, 2.65, 0.078, mossRng, 0.25));
    mossGeos.push(makeMossCushionOnSpline(fk.path, fk.radii, 0.52, 0.88, 2.55, 0.068, mossRng, -0.25));
    mossGeos.push(makeMossCushionOnSpline(fk.path, fk.radii, 0.76, 0.74, 2.35, 0.056, mossRng, 0.15));
  }

  const mergedMossRaw = mergeGeos(mossGeos);
  const mergedMoss = mergeVertices(projectUV(mergedMossRaw, { projection: 'box', metersPerUnit: 0.50 }));
  createPart('BoughMoss', mergedMoss, mossMat, { parent: root });

  // --------------------------------------------------------------------------
  // 4. Mesh_BoughLeaves: Merged V3 RGBA Cutout Canopy Sprays & Vine Tendrils
  // --------------------------------------------------------------------------

  const leafRng = rng.fork('leaves');
  const leafGeos = [];

  // Curved 3D leaf-spray cards with UV.y = 0 at stem, UV.y = 1 at tip,
  // mapped via remapUVToAtlas(..., axes: 'u-only') to keep V intact for Holodeck foliage sway!
  const sunlitCard = remapUVToAtlas(
    makeCurvedLeafSprayCard(0.76, 1.14, 0.28, 0.075, 2, 3),
    leafAtlas,
    'sunlit_spray',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );
  const shadedCard = remapUVToAtlas(
    makeCurvedLeafSprayCard(0.92, 1.22, 0.24, 0.085, 2, 3),
    leafAtlas,
    'shaded_cluster',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );
  const splitCard = remapUVToAtlas(
    makeCurvedLeafSprayCard(0.84, 1.18, 0.28, 0.080, 2, 3),
    leafAtlas,
    'split_frond',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );

  // Outward-and-upward splaying cards for repeatAlongCurve so sprays arch organically ABOVE & OUT from branches
  // leaving the dark gnarled mossy underside of the sweeping bough dramatically visible from Y = 1.7 m!
  const shadedSplayL = splayCardForCurve(shadedCard, 54, 28, 16, 0.10, 0.05);
  const sunlitSplayU = splayCardForCurve(sunlitCard, 42, 40, -20, 0.16, -0.06);
  const splitSplayO = splayCardForCurve(splitCard, 62, 22, 24, 0.08, 0.06);

  function addLeafBouquet(center, count, scaleRange, cardsPool, pitchRange) {
    const minY = center[0] > 3.0 ? 3.74 : center[0] > 1.6 ? 3.60 : 2.95;
    for (let i = 0; i < count; i++) {
      const yaw = (i / count) * Math.PI * 2 + leafRng.range(-0.32, 0.32);
      let pitch = leafRng.range(pitchRange[0], pitchRange[1]);
      if (center[1] - 0.85 < minY && pitch < 0.12) {
        pitch = leafRng.range(0.12, 0.44);
      }
      const roll = leafRng.range(-0.48, 0.48);
      const sc = leafRng.range(scaleRange[0], scaleRange[1]);
      const card = cardsPool[i % cardsPool.length];

      const fx = Math.cos(pitch) * Math.cos(yaw);
      const fy = Math.sin(pitch);
      const fz = Math.cos(pitch) * Math.sin(yaw);
      const fwd = vNorm([fx, fy, fz]);
      const base = buildBasis(fwd, [0, 1, 0]);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const uy = vAdd(vScale(base.up, cr), vScale(base.right, sr));
      const rz = vCross(fwd, uy);

      const jitter = [
        center[0] + leafRng.range(-0.16, 0.16),
        Math.max(center[1] + leafRng.range(-0.06, 0.18), minY + 0.22),
        center[2] + leafRng.range(-0.16, 0.16),
      ];
      leafGeos.push(transformGeo(card, jitter, fwd, uy, rz, sc));
    }
  }

  // 4A. Organic staggered repeatAlongCurve(..., { merge: true }) with wide twist sweep (zero zipper uniformity!)
  leafGeos.push(
    repeatAlongCurve(shadedSplayL, mainBranch.path, {
      count: 9,
      align: 'tangent',
      up: [0, 1, 0],
      scale: [0.96, 0.72],
      twist: [8, 54],
      opposite: true,
      start: 0.48,
      end: 0.96,
      merge: true,
    }),
  );
  leafGeos.push(
    repeatAlongCurve(sunlitSplayU, mainBranch.path, {
      count: 10,
      align: 'tangent',
      up: [0, 1, 0.16],
      scale: [1.02, 0.76],
      twist: [-10, -56],
      opposite: true,
      start: 0.43,
      end: 0.99,
      merge: true,
    }),
  );

  for (let i = 0; i < forkSplines.length; i++) {
    const fk = forkSplines[i];
    leafGeos.push(
      repeatAlongCurve(shadedSplayL, fk.path, {
        count: 6,
        align: 'tangent',
        up: [0, 1, 0],
        scale: [0.94, 0.68],
        twist: [10, 48],
        opposite: true,
        start: 0.25,
        end: 0.95,
        merge: true,
      }),
    );
    leafGeos.push(
      repeatAlongCurve(i % 2 === 0 ? sunlitSplayU : splitSplayO, fk.path, {
        count: 7,
        align: 'tangent',
        up: [0, 1, i % 2 === 0 ? 0.18 : -0.18],
        scale: [0.96, 0.72],
        twist: [-12, -52],
        opposite: true,
        start: 0.30,
        end: 0.99,
        merge: true,
      }),
    );
  }

  // Asymmetric organic cluster clumps perched irregularly along the main arch & forks (breaks all regularity!)
  const organicNodes = [
    [2.15, 4.95, 0.35],
    [3.15, 5.10, -0.45],
    [4.10, 5.05, 0.65],
    [5.25, 5.12, -0.55],
    [6.35, 5.35, 0.50],
    [7.45, 5.65, -0.40],
    [8.25, 5.88, 0.25],
  ];
  for (let i = 0; i < organicNodes.length; i++) {
    addLeafBouquet(organicNodes[i], 6, [0.76, 1.20], [sunlitCard, splitCard, shadedCard], [0.02, 0.52]);
  }

  // Tertiary twigs + rich full 3D canopy dome bouquets at every twig mid & tip!
  for (let i = 0; i < twigSplines.length; i++) {
    const tw = twigSplines[i];
    leafGeos.push(
      repeatAlongCurve(i % 3 === 0 ? splitSplayO : sunlitSplayU, tw.path, {
        count: 5,
        align: 'tangent',
        up: [0, 1, 0],
        scale: [0.84, 0.66],
        twist: [20, 40],
        opposite: true,
        start: 0.24,
        end: 0.94,
        merge: true,
      }),
    );
    const tip = tw.path[tw.path.length - 1];
    const mid = tw.path[Math.floor(tw.path.length * 0.58)];
    addLeafBouquet(tip, 7, [0.82, 1.12], [sunlitCard, splitCard, shadedCard], [-0.14, 0.48]);
    addLeafBouquet(mid, 5, [0.76, 1.02], [shadedCard, sunlitCard, splitCard], [-0.08, 0.42]);
  }

  // Lush 3D crown rosettes at main bough tip, secondary fork tips & mid-canopy upper dome!
  addLeafBouquet(mainBranch.path[mainBranch.path.length - 1], 9, [0.80, 1.10], [sunlitCard, splitCard, shadedCard], [-0.10, 0.50]);
  for (const fk of forkSplines) {
    addLeafBouquet(fk.path[fk.path.length - 1], 8, [0.82, 1.10], [sunlitCard, splitCard, shadedCard], [-0.12, 0.48]);
  }
  // Fill central overhead dappled canopy dome (so ZERO hollow middle from Top or Underside!)
  addLeafBouquet([3.45, 5.28, 0.45], 7, [0.88, 1.18], [shadedCard, sunlitCard, splitCard], [-0.05, 0.42]);
  addLeafBouquet([4.65, 5.22, -0.45], 7, [0.88, 1.18], [shadedCard, sunlitCard, splitCard], [-0.05, 0.44]);
  addLeafBouquet([5.85, 5.42, 0.35], 7, [0.86, 1.14], [sunlitCard, shadedCard, splitCard], [-0.04, 0.46]);
  addLeafBouquet([6.95, 5.65, -0.35], 6, [0.82, 1.10], [sunlitCard, splitCard, shadedCard], [-0.04, 0.46]);

  // Signature Upper-Left Framing Split-Leaf Philodendron / Monstera Clusters around trunk crook & orchids
  addLeafBouquet([0.12, 3.82, 0.48], 6, [0.76, 1.04], [splitCard, sunlitCard], [-0.22, 0.36]);
  addLeafBouquet([-0.24, 4.48, 0.30], 7, [0.84, 1.14], [splitCard, shadedCard, sunlitCard], [-0.16, 0.44]);
  addLeafBouquet([0.55, 4.35, -0.44], 6, [0.80, 1.08], [splitCard, shadedCard], [-0.14, 0.38]);
  addLeafBouquet([1.22, 4.65, 0.34], 6, [0.80, 1.06], [sunlitCard, splitCard], [-0.06, 0.40]);

  // 4B. Graceful Dangling Jungle Vine Tendrils (wider feathery backlit leaves, strict clearance!)
  const vineDefs = [
    // Left framing edge (X in [1.1, 2.85]): delicate sunlit vine drapes dipping gracefully to Y = 2.95..3.45 m
    { anchor: [1.14, 4.26, 0.34], len: 1.24, w: 0.38 },
    { anchor: [1.66, 4.50, 0.44], len: 1.38, w: 0.40 },
    { anchor: [2.20, 4.70, -0.34], len: 1.44, w: 0.38 },
    { anchor: [2.72, 4.80, 0.36], len: 1.38, w: 0.38 },
    // Mid & outer arch (strictly >= Y = 3.74 m so X > 3.0, Y < 3.6 stays 100% open!)
    { anchor: [3.48, 4.84, -0.26], len: 0.96, w: 0.36 },
    { anchor: [4.28, 4.76, 0.34], len: 0.90, w: 0.36 },
    { anchor: [5.18, 4.84, -0.40], len: 0.98, w: 0.36 },
    { anchor: [6.02, 4.96, 0.28], len: 1.08, w: 0.37 },
    { anchor: [6.92, 5.18, -0.32], len: 1.18, w: 0.37 },
    { anchor: [7.78, 5.46, 0.36], len: 1.24, w: 0.38 },
    { anchor: [3.85, 5.14, 1.46], len: 1.16, w: 0.37 },
    { anchor: [4.92, 5.34, -1.56], len: 1.22, w: 0.37 },
  ];

  for (let i = 0; i < vineDefs.length; i++) {
    const vd = vineDefs[i];
    const minTipY = vd.anchor[0] > 3.0 ? 3.74 : 2.94;
    const safeLen = Math.min(vd.len, Math.max(0.48, vd.anchor[1] - minTipY));
    const phase = leafRng.range(0, 6.28);
    // Crossed twin-ribbon vine drape offset by 68 deg and 3 cm so ZERO coplanar faces!
    for (let k = 0; k < 2; k++) {
      const rawVine = makeVineRibbonCard(vd.w, safeLen, 0.09, phase + k * 1.25);
      const mappedVine = remapUVToAtlas(rawVine, leafAtlas, 'vine_tendril', {
        inputOrigin: 'top-left',
        mode: 'texel-center',
        axes: 'u-only',
      });
      const yaw = leafRng.range(0, Math.PI) + k * 1.22;
      const bx = [Math.cos(yaw), 0, Math.sin(yaw)];
      const by = [0, 1, 0];
      const bz = [-Math.sin(yaw), 0, Math.cos(yaw)];
      const off = k === 0 ? vd.anchor : [vd.anchor[0] + 0.03, vd.anchor[1] + 0.02, vd.anchor[2] - 0.03];
      leafGeos.push(transformGeo(mappedVine, off, bx, by, bz, 1));
    }
  }

  const mergedLeaves = mergeGeos(leafGeos);
  const leavesPart = createPart('BoughLeaves', mergedLeaves, leavesMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided alpha-masked canopy leaf spray cards');

  // --------------------------------------------------------------------------
  // 5. Mesh_OrchidBlossoms: 7 Lush Cascading Racemes of 3D Magenta-Violet Orchids
  // --------------------------------------------------------------------------

  const orchidRng = rng.fork('orchids');
  const orchidGeos = [];
  const { fullBlossom, budBase, strapLeaf } = buildOrchidBlossomTemplates(orchidAtlas);

  // 7 lush arching cascading flower racemes clinging to the mossy trunk crook & lower-left bough
  const racemeDefs = [
    {
      // Hero Front-Left Stele Cascade (right beside the carved sun-stele pillar!)
      ctrl: [[0.34, 3.68, 0.34], [0.64, 3.46, 0.68], [0.84, 2.92, 0.84], [0.94, 2.34, 0.86]],
      blossoms: 13,
      buds: 3,
      faceBias: [0.32, -0.22, 0.92],
      scale: 1.18,
    },
    {
      // Upper Crook Lush Cascade
      ctrl: [[0.64, 4.08, 0.28], [1.04, 3.88, 0.58], [1.32, 3.34, 0.72], [1.44, 2.74, 0.70]],
      blossoms: 13,
      buds: 3,
      faceBias: [0.40, -0.24, 0.88],
      scale: 1.14,
    },
    {
      // Trunk Back-Side Cascade (-Z framing depth)
      ctrl: [[0.36, 3.52, -0.24], [0.68, 3.32, -0.58], [0.90, 2.84, -0.74], [1.02, 2.40, -0.76]],
      blossoms: 11,
      buds: 2,
      faceBias: [0.30, -0.20, -0.92],
      scale: 1.10,
    },
    {
      // Lower-Left Bough Underside Cascade (+Z)
      ctrl: [[1.38, 4.44, 0.26], [1.74, 4.18, 0.60], [1.98, 3.58, 0.74], [2.10, 2.98, 0.76]],
      blossoms: 12,
      buds: 3,
      faceBias: [0.28, -0.28, 0.92],
      scale: 1.12,
    },
    {
      // Mid-Left Framing Arch Cascade (+Z, strictly X < 2.95)
      ctrl: [[2.20, 4.72, 0.18], [2.52, 4.42, 0.48], [2.74, 3.84, 0.62], [2.84, 3.28, 0.64]],
      blossoms: 11,
      buds: 3,
      faceBias: [0.26, -0.32, 0.90],
      scale: 1.08,
    },
    {
      // Mid-Left Rear Cascade (-Z, strictly X < 2.85)
      ctrl: [[1.94, 4.66, -0.22], [2.28, 4.36, -0.54], [2.50, 3.84, -0.68], [2.62, 3.36, -0.70]],
      blossoms: 10,
      buds: 2,
      faceBias: [0.24, -0.28, -0.92],
      scale: 1.06,
    },
    {
      // High-Perched Outer Bough Orchid Spray (X in [3.08, 3.74], strictly ABOVE Y = 3.75 m!)
      ctrl: [[3.06, 4.82, 0.14], [3.38, 4.62, 0.42], [3.56, 4.20, 0.56], [3.66, 3.82, 0.58]],
      blossoms: 9,
      buds: 2,
      faceBias: [0.30, -0.36, 0.88],
      scale: 1.02,
    },
  ];

  for (let rIdx = 0; rIdx < racemeDefs.length; rIdx++) {
    const rd = racemeDefs[rIdx];
    const stemPath = catmullRomPath(rd.ctrl, 5);
    const stemRadii = stemPath.map((_, i) => lerp(0.013, 0.0045, i / (stemPath.length - 1)));
    const stemGeo = remapUVToAtlas(
      taperedTube(stemPath, stemRadii, { radialSegments: 5, creaseAngle: 180, cap: true }),
      orchidAtlas,
      'stem_green',
      { inputOrigin: 'top-left', mode: 'texel-center' },
    );
    orchidGeos.push(stemGeo);

    // Epiphytic Basal Strap-Leaf Rosette gripping the mossy bark at stemPath[0]
    const anchor = stemPath[0];
    const faceN = vNorm(rd.faceBias);
    for (let lf = 0; lf < 5; lf++) {
      const ang = (lf / 5) * Math.PI * 2 + orchidRng.range(-0.25, 0.25);
      const outDir = vNorm([
        Math.cos(ang) * 0.72 + faceN[0] * 0.45,
        orchidRng.range(0.18, 0.62),
        Math.sin(ang) * 0.72 + faceN[2] * 0.45,
      ]);
      const bs = buildBasis(outDir, [0, 1, 0]);
      const sc = orchidRng.range(0.82, 1.22);
      orchidGeos.push(transformGeo(strapLeaf, anchor, bs.right, bs.forward, bs.up, sc));
    }

    // Lush closely-clustered alternating 3D rounded orchid blossoms (t = 0.16 .. 0.88)
    for (let b = 0; b < rd.blossoms; b++) {
      const frac = rd.blossoms > 1 ? b / (rd.blossoms - 1) : 0.5;
      const t = lerp(0.16, 0.88, frac);
      const { point, tangent } = samplePolyline(stemPath, stemRadii, t);
      const side = b % 2 === 0 ? 1 : -1;
      const stemBasis = buildBasis(tangent, faceN);

      const lateralOff = vAdd(
        vScale(stemBasis.right, side * 0.052 * rd.scale),
        vScale(faceN, 0.036 * rd.scale),
      );
      const blossomPos = vAdd(point, lateralOff);

      const lookDir = vNorm([
        faceN[0] + stemBasis.right[0] * side * 0.36 + orchidRng.range(-0.16, 0.16),
        faceN[1] + orchidRng.range(-0.24, 0.08),
        faceN[2] + stemBasis.right[2] * side * 0.36 + orchidRng.range(-0.16, 0.16),
      ]);
      const upHint = [
        orchidRng.range(-0.16, 0.16),
        1,
        orchidRng.range(-0.16, 0.16),
      ];
      const right = vNorm(vCross(upHint, lookDir));
      const up = vNorm(vCross(lookDir, right));
      const bScale = rd.scale * lerp(1.12, 0.76, frac) * orchidRng.range(0.92, 1.08);
      orchidGeos.push(transformGeo(fullBlossom, blossomPos, right, up, lookDir, bScale));
    }

    // Tapered unopened magenta-tipped buds at the drooping tip (t = 0.91 .. 0.99)
    for (let bd = 0; bd < rd.buds; bd++) {
      const t = lerp(0.91, 0.99, rd.buds > 1 ? bd / (rd.buds - 1) : 0.5);
      const { point, tangent } = samplePolyline(stemPath, stemRadii, t);
      const side = bd % 2 === 0 ? 1 : -1;
      const lookDir = vNorm([
        tangent[0] * 0.4 + faceN[0] * 0.6 + side * 0.25,
        tangent[1] * 0.6 - 0.35,
        tangent[2] * 0.4 + faceN[2] * 0.6,
      ]);
      const right = vNorm(vCross([0, 1, 0], lookDir));
      const up = vNorm(vCross(lookDir, right));
      const bdScale = rd.scale * lerp(0.95, 0.65, bd / Math.max(1, rd.buds));
      orchidGeos.push(transformGeo(budBase, point, right, up, lookDir, bdScale));
    }
  }

  const mergedOrchids = mergeGeos(orchidGeos);
  const orchidPart = createPart('OrchidBlossoms', mergedOrchids, orchidMat, { parent: root });
  markOpenShell(orchidPart, 'Double-sided sculpted 3D orchid petals and strap leaves');

  return root;
}
