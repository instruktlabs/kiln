const meta = {
  name: 'foliage-vine-short',
  role: 'fill',
};

// Lagoon Sanctuary — Foreground Close-Up Hanging Vine Cluster (3.6 m drop)
// Pivot Y = 0.00 m at TOP attachment; hangs downward into -Y.
// +X forward, +Y up, +Z right.
// Showcases Kiln 1.9.0 textureAtlas (mask-rgb-dilate) + normalMapFromHeight +
// remapUVToAtlas (u-only) + foliageMaterial + repeatAlongCurve on sinuous stems.

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// Plump botanical cordate heart-leaf philodendron silhouette:
// Deep graceful basal sinus (V-cleft) at top where the petiole joins,
// full rounded upper shoulder lobes, and a gently curving acuminate drip-tip at bottom.
function makeHeartPolygon(cx, topY, botY, halfW, cleftDepth, skew) {
  const pts = [];
  const h = botY - topY;
  const rightProfile = [
    [0.00, cleftDepth],
    [0.14, cleftDepth * 0.42],
    [0.34, 0.05],
    [0.58, 0.00],
    [0.80, 0.05],
    [0.95, 0.16],
    [1.00, 0.30],
    [0.93, 0.45],
    [0.78, 0.60],
    [0.56, 0.74],
    [0.32, 0.85],
    [0.13, 0.94],
    [0.03 * (skew >= 0 ? 1 : -1), 1.00],
  ];

  for (let i = 0; i < rightProfile.length; i++) {
    const [w, t] = rightProfile[i];
    const tipDrift = Math.pow(t, 2.3) * halfW * 0.14 * (skew >= 0 ? 1 : -1);
    const px = cx + w * halfW * (1 + skew * 0.45) + tipDrift;
    const py = topY + t * h;
    pts.push([clampInt(px, 4, 336), clampInt(py, 4, 508)]);
  }
  for (let i = rightProfile.length - 2; i >= 1; i--) {
    const [w, t] = rightProfile[i];
    const tipDrift = Math.pow(t, 2.3) * halfW * 0.14 * (skew >= 0 ? 1 : -1);
    const px = cx - w * halfW * (1 - skew * 0.35) + tipDrift;
    const py = topY + t * h;
    pts.push([clampInt(px, 4, 336), clampInt(py, 4, 508)]);
  }
  return pts;
}

function makeLancePolygon(cx, topY, botY, halfW, bendX) {
  const pts = [];
  const h = botY - topY;
  const halfSteps = 12;
  for (let i = 0; i <= halfSteps; i++) {
    const t = i / halfSteps;
    const env = Math.sin(Math.PI * Math.pow(t, 0.76)) * (1 - 0.32 * Math.pow(t, 2.1));
    const curveX = Math.sin(t * Math.PI * 1.15) * bendX;
    pts.push([clampInt(cx + curveX + halfW * env, 4, 336), clampInt(topY + t * h, 4, 508)]);
  }
  for (let i = halfSteps - 1; i >= 1; i--) {
    const t = i / halfSteps;
    const env = Math.sin(Math.PI * Math.pow(t, 0.76)) * (1 - 0.32 * Math.pow(t, 2.1)) * 0.94;
    const curveX = Math.sin(t * Math.PI * 1.15) * bendX;
    pts.push([clampInt(cx + curveX - halfW * env, 4, 336), clampInt(topY + t * h, 4, 508)]);
  }
  return pts;
}

function makeSmallLeafPoly(x0, y0, dx, dy, width) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const samples = [
    [0.0, 0.0],
    [0.16, 0.62],
    [0.40, 1.0],
    [0.66, 0.76],
    [0.86, 0.34],
    [1.0, 0.0],
    [0.86, -0.34],
    [0.66, -0.76],
    [0.40, -0.96],
    [0.16, -0.58],
  ];
  return samples.map(([s, w]) => [
    clampInt(x0 + ux * len * s + nx * width * 0.5 * w, 4, 336),
    clampInt(y0 + uy * len * s + ny * width * 0.5 * w, 4, 508),
  ]);
}

function makeOrchidPetal(cx, cy, angleRad, len, wid) {
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const nx = -uy;
  const ny = ux;
  const profile = [
    [0.0, 0.0],
    [0.24, 0.64],
    [0.56, 1.0],
    [0.84, 0.64],
    [1.0, 0.0],
    [0.84, -0.64],
    [0.56, -1.0],
    [0.24, -0.64],
  ];
  return profile.map(([s, w]) => [
    clampInt(cx + ux * len * s + nx * wid * 0.5 * w, 4, 336),
    clampInt(cy + uy * len * s + ny * wid * 0.5 * w, 4, 508),
  ]);
}

function buildHeartLeafOps(isHeight) {
  const ops = [];
  const cx = 170;

  // Slender curving petiole anchored cleanly at V = 0 top edge
  ops.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 0], to: [cx - 2, 118], width: 10 },
    rgba: isHeight ? [166, 166, 166, 255] : [48, 92, 31, 255],
  });

  // Base plump cordate heart-leaf silhouette (rich deep emerald margin)
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeHeartPolygon(cx, 44, 504, 152, 0.16, 0.04) },
    rgba: isHeight ? [150, 150, 150, 255] : [40, 88, 29, 255],
  });

  // Smooth multi-step painterly emerald -> glowing backlit chartreuse gradient
  const layers = [
    { topY: 48, botY: 502, w: 144, cleft: 0.165, col: [54, 110, 35, 255], hCol: [170, 170, 170, 255], op: 120 },
    { topY: 64, botY: 500, w: 134, cleft: 0.16, col: [68, 128, 41, 255], hCol: [184, 184, 184, 255], op: 105 },
    { topY: 112, botY: 500, w: 122, cleft: 0.145, col: [86, 148, 47, 255], hCol: [194, 194, 194, 255], op: 100 },
    { topY: 178, botY: 500, w: 106, cleft: 0.125, col: [108, 168, 53, 255], hCol: [202, 202, 202, 255], op: 100 },
    { topY: 254, botY: 502, w: 86, cleft: 0.10, col: [132, 188, 62, 255], hCol: [208, 208, 208, 255], op: 110 },
    { topY: 334, botY: 503, w: 62, cleft: 0.075, col: [158, 208, 72, 255], hCol: [214, 214, 214, 255], op: 130 },
  ];
  for (const l of layers) {
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: makeHeartPolygon(cx + 1, l.topY, l.botY, l.w, l.cleft, 0.04) },
      rgba: isHeight ? l.hCol : l.col,
      opacity: l.op,
    });
  }

  // Soft sunlit lobe translucency & subtle cool basal pocket shading
  ops.push({
    op: 'paint',
    shape: { kind: 'ellipse', x: 180, y: 90, width: 116, height: 210 },
    rgba: isHeight ? [210, 210, 210, 255] : [136, 192, 62, 255],
    opacity: isHeight ? 80 : 64,
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'ellipse', x: 52, y: 84, width: 104, height: 152 },
    rgba: isHeight ? [146, 146, 146, 255] : [30, 70, 23, 255],
    opacity: isHeight ? 80 : 68,
  });

  // Botanical midrib crease + luminous pale-chartreuse central vein
  const ribPts = [
    [cx - 1, 114],
    [cx + 1, 202],
    [cx + 4, 304],
    [cx + 7, 404],
    [cx + 11, 492],
  ];
  for (let i = 0; i < ribPts.length - 1; i++) {
    const w = Math.max(2, 8 - i * 2);
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: ribPts[i], to: ribPts[i + 1], width: w + 4 },
      rgba: isHeight ? [140, 140, 140, 255] : [34, 78, 25, 255],
      opacity: 85,
    });
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: ribPts[i], to: ribPts[i + 1], width: w },
      rgba: isHeight ? [242, 242, 242, 255] : [172, 216, 86, 255],
      opacity: isHeight ? 235 : 200,
    });
  }

  // Graceful curving lateral veins fanning into both plump lobes & blade
  const veins = [
    { x0: cx + 1, y0: 128, xr: 274, yr: 112, xl: 66, yl: 116, w: 4 },
    { x0: cx + 1, y0: 170, xr: 294, yr: 196, xl: 48, yl: 198, w: 4 },
    { x0: cx + 2, y0: 228, xr: 288, yr: 278, xl: 56, yl: 280, w: 4 },
    { x0: cx + 4, y0: 292, xr: 266, yr: 350, xl: 78, yl: 352, w: 3 },
    { x0: cx + 6, y0: 358, xr: 238, yr: 410, xl: 108, yl: 412, w: 3 },
  ];
  for (const v of veins) {
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [v.x0, v.y0], to: [v.xr, v.yr], width: v.w },
      rgba: isHeight ? [226, 226, 226, 255] : [152, 200, 72, 255],
      opacity: isHeight ? 185 : 138,
    });
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [v.x0 - 1, v.y0], to: [v.xl, v.yl], width: v.w },
      rgba: isHeight ? [222, 222, 222, 255] : [140, 188, 66, 255],
      opacity: isHeight ? 175 : 128,
    });
  }

  return ops;
}

function buildLanceShootOps(isHeight) {
  const ops = [];
  const cx = 170;

  ops.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 0], to: [cx - 1, 72], width: 8 },
    rgba: isHeight ? [168, 168, 168, 255] : [58, 108, 35, 255],
  });

  // Main slender pointed tropical cascade leaf with glowing backlit lime-chartreuse tip
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeLancePolygon(cx, 44, 504, 86, 18) },
    rgba: isHeight ? [154, 154, 154, 255] : [56, 114, 36, 255],
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeLancePolygon(cx, 62, 498, 74, 17) },
    rgba: isHeight ? [184, 184, 184, 255] : [86, 150, 46, 255],
    opacity: 165,
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeLancePolygon(cx + 3, 176, 500, 62, 14) },
    rgba: isHeight ? [204, 204, 204, 255] : [132, 188, 60, 255],
    opacity: 155,
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeLancePolygon(cx + 4, 286, 502, 46, 9) },
    rgba: isHeight ? [214, 214, 214, 255] : [168, 218, 76, 255],
    opacity: 185,
  });

  // Companion young sunlit side-shoot tucked near upper petiole
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSmallLeafPoly(cx - 4, 54, -92, 172, 62) },
    rgba: isHeight ? [168, 168, 168, 255] : [78, 140, 42, 255],
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSmallLeafPoly(cx - 10, 74, -76, 146, 44) },
    rgba: isHeight ? [202, 202, 202, 255] : [144, 196, 64, 255],
    opacity: 165,
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSmallLeafPoly(cx + 6, 44, 88, 134, 50) },
    rgba: isHeight ? [174, 174, 174, 255] : [104, 166, 50, 255],
  });

  // Central pale sunlit midrib
  const mainRib = [
    [cx, 54],
    [cx + 10, 168],
    [cx + 16, 290],
    [cx + 11, 405],
    [cx + 2, 492],
  ];
  for (let i = 0; i < mainRib.length - 1; i++) {
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: mainRib[i], to: mainRib[i + 1], width: Math.max(2, 7 - i) },
      rgba: isHeight ? [242, 242, 242, 255] : [184, 226, 92, 255],
      opacity: 205,
    });
  }

  const lVeins = [
    [136, 232, 186, 118, 182],
    [206, 246, 262, 114, 258],
    [276, 242, 336, 120, 332],
    [346, 224, 402, 134, 398],
  ];
  for (const [y0, xr, yr, xl, yl] of lVeins) {
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx + 11, y0], to: [xr, yr], width: 3 },
      rgba: isHeight ? [224, 224, 224, 255] : [164, 212, 78, 255],
      opacity: 145,
    });
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx + 9, y0], to: [xl, yl], width: 3 },
      rgba: isHeight ? [220, 220, 220, 255] : [152, 200, 72, 255],
      opacity: 135,
    });
  }

  return ops;
}

function buildOrchidTendrilOps(isHeight) {
  const ops = [];
  const cx = 170;

  const stem = [
    [cx, 0],
    [cx - 12, 125],
    [cx + 16, 260],
    [cx - 10, 395],
    [cx + 6, 496],
  ];
  for (let i = 0; i < stem.length - 1; i++) {
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: stem[i], to: stem[i + 1], width: Math.max(4, 8 - i) },
      rgba: isHeight ? [162, 162, 162, 255] : [54, 98, 34, 255],
    });
  }

  const leaves = [
    [cx - 4, 42, -96, 68, 56, [46, 98, 32, 255]],
    [cx + 2, 74, 100, 74, 54, [60, 120, 38, 255]],
    [cx - 8, 178, -94, 84, 50, [72, 134, 43, 255]],
    [cx + 12, 238, 96, 78, 48, [92, 156, 49, 255]],
    [cx + 2, 330, -82, 86, 44, [118, 178, 56, 255]],
    [cx - 4, 392, 74, 80, 40, [138, 194, 62, 255]],
    [cx + 4, 444, -20, 62, 34, [156, 208, 70, 255]],
  ];
  for (const [x0, y0, dx, dy, w, col] of leaves) {
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: makeSmallLeafPoly(x0, y0, dx, dy, w) },
      rgba: isHeight ? [180, 180, 180, 255] : col,
    });
  }

  // 3 luminous tropical magenta-lilac epiphytic orchid blossoms
  const blossoms = [
    { x: cx + 26, y: 122, r: 62, rot: 0.2 },
    { x: cx - 22, y: 266, r: 56, rot: -0.35 },
    { x: cx + 18, y: 392, r: 46, rot: 0.45 },
  ];
  for (const b of blossoms) {
    for (let p = 0; p < 5; p++) {
      const ang = b.rot + (p / 5) * Math.PI * 2;
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: makeOrchidPetal(b.x, b.y, ang, b.r, b.r * 0.64) },
        rgba: isHeight
          ? [206, 206, 206, 255]
          : p % 2 === 0
            ? [206, 86, 192, 255]
            : [232, 132, 220, 255],
      });
    }
    ops.push({
      op: 'paint',
      shape: {
        kind: 'ellipse',
        x: clampInt(b.x - b.r * 0.24, 4, 330),
        y: clampInt(b.y - b.r * 0.24, 4, 500),
        width: clampInt(b.r * 0.48, 8, 60),
        height: clampInt(b.r * 0.48, 8, 60),
      },
      rgba: isHeight ? [232, 232, 232, 255] : [144, 36, 134, 255],
    });
    ops.push({
      op: 'paint',
      shape: {
        kind: 'ellipse',
        x: clampInt(b.x - b.r * 0.12, 4, 330),
        y: clampInt(b.y - b.r * 0.12, 4, 500),
        width: clampInt(b.r * 0.24, 6, 30),
        height: clampInt(b.r * 0.24, 6, 30),
      },
      rgba: isHeight ? [248, 248, 248, 255] : [248, 204, 78, 255],
    });
  }

  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSmallLeafPoly(cx - 10, 434, -36, 46, 26) },
    rgba: isHeight ? [196, 196, 196, 255] : [198, 78, 186, 255],
  });
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSmallLeafPoly(cx + 8, 452, 28, 44, 22) },
    rgba: isHeight ? [196, 196, 196, 255] : [222, 114, 210, 255],
  });

  return ops;
}

// Organically arched, V-cambered 3D leaflet card for repeatAlongCurve.
// Starts cleanly at y = 0.011 (anchored cleanly beside stem -> zero floating parts!).
// Configurable sSegs keeps triangle count comfortably inside 2,000-5,500 budget.
function makeCurvedLeafletGeo(length, width, outwardRatio, droopCurve, cupDepth, yawSkew, sSegs = 3) {
  const tSegs = 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let si = 0; si <= sSegs; si++) {
    const s = si / sSegs;
    const baseX = length * (0.14 * s + droopCurve * s * s);
    const baseY = 0.011 + length * (outwardRatio * s - 0.26 * s * s);
    const camberEnv = Math.sin(Math.PI * s);

    for (let ti = 0; ti <= tSegs; ti++) {
      const u = ti / tSegs;
      const t = u * 2 - 1;
      const z = t * (width * 0.5) + s * yawSkew * width * 0.28;
      const yOffset =
        (Math.abs(t) * 0.52 - (1 - t * t) * 0.48) * cupDepth * camberEnv +
        t * yawSkew * cupDepth * 0.45 * s;
      const xOffset = t * t * cupDepth * 0.16 * camberEnv;
      positions.push(baseX + xOffset, baseY + yOffset, z);
      uvs.push(u, s);
    }
  }

  const row = tSegs + 1;
  for (let si = 0; si < sSegs; si++) {
    for (let ti = 0; ti < tSegs; ti++) {
      const a = si * row + ti;
      const b = a + 1;
      const c = (si + 1) * row + ti;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return meshGeo({ positions, uvs, indices });
}

function mergeGeos(geos) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vOffset = 0;

  for (const g of geos) {
    const pos = g.getAttribute('position');
    let norm = g.getAttribute('normal');
    if (!norm) {
      g.computeVertexNormals();
      norm = g.getAttribute('normal');
    }
    const uv = g.getAttribute('uv');
    const idx = g.getIndex();

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + vOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + vOffset);
      }
    }
    vOffset += pos.count;
  }

  return meshGeo({ positions, normals, uvs, indices });
}

async function build() {
  const root = createRoot('foliage-vine-short');

  // 1. Shared 1024x512 3-column full-height V3 RGBA textureAtlas (mask-rgb-dilate)
  const albedoAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'heart_leaf',
        content: { x: 0, y: 0, width: 340, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 512,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: buildHeartLeafOps(false),
          },
        },
      },
      {
        name: 'lance_shoot',
        content: { x: 342, y: 0, width: 340, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 512,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: buildLanceShootOps(false),
          },
        },
      },
      {
        name: 'orchid_tendril',
        content: { x: 684, y: 0, width: 340, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 512,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: buildOrchidTendrilOps(false),
          },
        },
      },
    ],
  });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'heart_leaf',
        content: { x: 0, y: 0, width: 340, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 512,
            usage: 'albedo',
            background: [128, 128, 128, 255],
            operations: buildHeartLeafOps(true),
          },
        },
      },
      {
        name: 'lance_shoot',
        content: { x: 342, y: 0, width: 340, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 512,
            usage: 'albedo',
            background: [128, 128, 128, 255],
            operations: buildLanceShootOps(true),
          },
        },
      },
      {
        name: 'orchid_tendril',
        content: { x: 684, y: 0, width: 340, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 512,
            usage: 'albedo',
            background: [128, 128, 128, 255],
            operations: buildOrchidTendrilOps(true),
          },
        },
      },
    ],
  });

  const leafNormalMap = normalMapFromHeight(heightAtlas, {
    strength: 4.5,
    name: 'VineLeavesNormal',
  });

  const leafMat = foliageMaterial(albedoAtlas, {
    alphaCutoff: 0.45,
    roughness: 0.50,
    doubleSided: true,
    name: 'VineLeaves',
  });
  leafMat.normalMap = leafNormalMap;
  leafMat.normalScale = new THREE.Vector2(0.85, 0.85);

  // Mossy warm olive-brown tropical woody liana bark material
  const barkTex = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'VineStemBarkAlbedo',
    layers: [
      { op: 'solid', color: 0x4f472c },
      { op: 'stripes', colorA: 0x39331e, colorB: 0x625a37, count: 14, angleDeg: 86, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x2f4320, colorB: 0x607c34, scale: 7, octaves: 4, seed: 31, blend: 'overlay', opacity: 0.55 },
    ],
  });
  const barkNormal = normalMapFromHeight(barkTex, { strength: 4.0, name: 'VineStemBarkNormal' });
  const stemMat = pbrMaterial({
    albedo: barkTex,
    normal: barkNormal,
    roughness: 0.86,
    metalness: 0.0,
    name: 'VineStems',
  });

  // 2. Varied curved 3D leaf archetypes (alternate phyllotaxis + varied outward flare/droop)
  const heartWideGeo = remapUVToAtlas(
    makeCurvedLeafletGeo(0.28, 0.23, 0.72, 0.68, 0.038, 0.22, 3),
    albedoAtlas,
    'heart_leaf',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );
  const heartDroopGeo = remapUVToAtlas(
    makeCurvedLeafletGeo(0.25, 0.20, 0.52, 0.82, 0.032, -0.25, 2),
    albedoAtlas,
    'heart_leaf',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );
  const lanceLeafGeo = remapUVToAtlas(
    makeCurvedLeafletGeo(0.32, 0.16, 0.56, 0.82, 0.028, 0.18, 2),
    albedoAtlas,
    'lance_shoot',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );
  const orchidSprigGeo = remapUVToAtlas(
    makeCurvedLeafletGeo(0.46, 0.26, 0.62, 0.84, 0.034, 0.12, 2),
    albedoAtlas,
    'orchid_tendril',
    { inputOrigin: 'top-left', mode: 'texel-center', axes: 'u-only' },
  );

  // 3. Six organically sinuous S-curved hanging liana strands (catmullRomPath for multi-wave grace!)
  //    Pivot Y = 0.00 m cleanly at TOP attachment; hangs downward to -3.60 m.
  //    Target extents: width ~1.6 m along Z, depth ~0.9 m along X, drop ~3.6 m.
  const strands = [
    {
      // Left-outer sweeping cascade
      pts: [
        [-0.08, -0.04, -0.58],
        [0.10, -0.58, -0.68],
        [-0.12, -1.26, -0.52],
        [0.08, -1.88, -0.62],
        [-0.02, -2.34, -0.55],
      ],
      rTop: 0.010, rBot: 0.0022,
      hA: 11, hB: 10, lance: 7, orchid: 2,
      twist0: 20, twistSpan: 430, up: [1, 0, 0.3],
      scaleRange: [1.04, 0.44],
    },
    {
      // Left-center hero longest sweeping curtain (drops cleanly to Y = -3.60 m!)
      pts: [
        [0.12, -0.04, -0.24],
        [0.26, -0.86, -0.38],
        [-0.06, -1.80, -0.14],
        [0.18, -2.74, -0.32],
        [0.02, -3.52, -0.20],
      ],
      rTop: 0.012, rBot: 0.0022,
      hA: 16, hB: 14, lance: 11, orchid: 3,
      twist0: 85, twistSpan: 640, up: [0.55, 0, 0.84],
      scaleRange: [1.14, 0.42],
    },
    {
      // Paired companion vine weaving organically beside hero strand
      pts: [
        [0.02, -0.04, -0.10],
        [-0.16, -0.70, -0.22],
        [0.14, -1.44, 0.00],
        [-0.10, -2.14, -0.16],
        [0.04, -2.70, -0.08],
      ],
      rTop: 0.011, rBot: 0.0022,
      hA: 12, hB: 11, lance: 8, orchid: 0,
      twist0: 195, twistSpan: 490, up: [-0.75, 0, 0.66],
      scaleRange: [1.06, 0.45],
    },
    {
      // Inner-center shorter dense upper-crown drape (fills upper center depth cleanly!)
      pts: [
        [-0.18, -0.04, 0.04],
        [-0.28, -0.54, -0.06],
        [-0.10, -1.12, 0.14],
        [-0.22, -1.64, 0.02],
        [-0.14, -1.96, 0.08],
      ],
      rTop: 0.010, rBot: 0.0022,
      hA: 10, hB: 9, lance: 7, orchid: 0,
      twist0: 310, twistSpan: 380, up: [-0.9, 0, -0.44],
      scaleRange: [1.10, 0.50],
    },
    {
      // Right-center secondary sweeping long strand
      pts: [
        [0.10, -0.04, 0.28],
        [-0.12, -0.78, 0.42],
        [0.20, -1.64, 0.18],
        [-0.06, -2.44, 0.34],
        [0.08, -3.10, 0.26],
      ],
      rTop: 0.011, rBot: 0.0022,
      hA: 14, hB: 13, lance: 10, orchid: 2,
      twist0: 145, twistSpan: 560, up: [0.35, 0, -0.94],
      scaleRange: [1.10, 0.44],
    },
    {
      // Far-right sweeping curtain edge strand
      pts: [
        [0.20, -0.04, 0.54],
        [0.28, -0.64, 0.66],
        [0.04, -1.34, 0.46],
        [0.22, -1.98, 0.60],
        [0.10, -2.42, 0.52],
      ],
      rTop: 0.010, rBot: 0.0022,
      hA: 11, hB: 9, lance: 7, orchid: 2,
      twist0: 255, twistSpan: 450, up: [-0.6, 0, -0.8],
      scaleRange: [1.02, 0.46],
    },
  ];

  const stemGeos = [];
  const leafGeos = [];

  // Organic undulating upper bough-anchor liana runner tucked cleanly below Y = 0
  const runnerPts = [
    [-0.10, -0.08, -0.58],
    [0.12, -0.12, -0.20],
    [-0.08, -0.10, 0.18],
    [0.18, -0.08, 0.54],
  ];
  const runnerStem = bezierCurve(runnerPts, 10);
  stemGeos.push(
    taperedTube(
      runnerStem,
      runnerStem.map((_, i) => 0.009 + 0.0025 * Math.sin((i / (runnerStem.length - 1)) * Math.PI)),
      { radialSegments: 5, creaseAngle: 180, cap: true, up: [0, 1, 0] },
    ),
  );

  // Two opposing, downward-draping crown-cluster passes (keeps max.y <= 0.00 m & natural wild top!)
  const runnerLeaves = bezierCurve(runnerPts, 20);
  leafGeos.push(
    repeatAlongCurve(heartWideGeo, runnerLeaves, {
      count: 6,
      align: 'tangent',
      up: [0.38, -0.92, 0.0],
      scale: [0.88, 0.94],
      twist: [-24, 30],
      opposite: false,
      start: 0.06,
      end: 0.92,
      merge: true,
    }),
  );
  leafGeos.push(
    repeatAlongCurve(heartDroopGeo, runnerLeaves, {
      count: 6,
      align: 'tangent',
      up: [-0.38, -0.92, 0.0],
      scale: [0.90, 0.84],
      twist: [22, -32],
      opposite: false,
      start: 0.12,
      end: 0.96,
      merge: true,
    }),
  );

  for (const s of strands) {
    // Smooth low-poly stem curve (13 stations x 5 radial) spanning full strand length so ZERO leaves float!
    const stemCurve = catmullRomPath(s.pts, 3);
    const radii = stemCurve.map((_, i) => {
      const t = i / (stemCurve.length - 1);
      return s.rTop * (1 - t) + s.rBot * t;
    });
    stemGeos.push(
      taperedTube(stemCurve, radii, {
        radialSegments: 5,
        creaseAngle: 180,
        cap: true,
        up: s.up,
      }),
    );

    const leafCurve = catmullRomPath(s.pts, 7);

    // True staggered alternate phyllotaxis (Pass A + Pass B offset in arc-length & angle)
    leafGeos.push(
      repeatAlongCurve(heartWideGeo, leafCurve, {
        count: s.hA,
        align: 'tangent',
        up: s.up,
        scale: s.scaleRange,
        twist: [s.twist0, s.twist0 + s.twistSpan],
        opposite: false,
        start: 0.04,
        end: 0.90,
        merge: true,
      }),
    );
    leafGeos.push(
      repeatAlongCurve(heartDroopGeo, leafCurve, {
        count: s.hB,
        align: 'tangent',
        up: s.up,
        scale: [s.scaleRange[0] * 0.94, s.scaleRange[1] * 0.92],
        twist: [s.twist0 + 152, s.twist0 + 152 + s.twistSpan * 1.08],
        opposite: false,
        start: 0.08,
        end: 0.94,
        merge: true,
      }),
    );

    // Sunlit slender pointed tropical cascade shoots interleaved right to the tip
    leafGeos.push(
      repeatAlongCurve(lanceLeafGeo, leafCurve, {
        count: s.lance,
        align: 'tangent',
        up: s.up,
        scale: [s.scaleRange[0] * 0.88, s.scaleRange[1] * 0.94],
        twist: [s.twist0 + 78, s.twist0 + 78 + s.twistSpan * 0.92],
        opposite: false,
        start: 0.12,
        end: 0.98,
        merge: true,
      }),
    );

    // Delicate epiphytic magenta-lilac orchid blossom sprays cascading out of the upper crown
    if (s.orchid > 0) {
      leafGeos.push(
        repeatAlongCurve(orchidSprigGeo, leafCurve, {
          count: s.orchid,
          align: 'tangent',
          up: s.up,
          scale: [0.98, 0.76],
          twist: [s.twist0 + 30, s.twist0 + 155],
          opposite: false,
          start: 0.06,
          end: 0.36,
          merge: true,
        }),
      );
    }
  }

  const mergedStems = mergeGeos(stemGeos);
  createPart('VineStems', mergedStems, stemMat, { parent: root });

  const mergedLeaves = mergeGeos(leafGeos);
  const leavesPart = createPart('VineLeaves', mergedLeaves, leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided alpha-cutout hanging vine foliage cards');

  return root;
}
