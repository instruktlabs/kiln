const meta = {
  name: 'foliage-vine-long',
  role: 'fill',
};

// Lagoon Sanctuary — Hero Tall Cenote Rim Curtain (13.5 m drop)
// Pivot Y = 0.00 m at TOP attachment; hangs downward into -Y.
// +X forward, +Y up, +Z right.
// Holodeck wind contract: ONE single-primitive Mesh_VineLeaves with UV.y strictly
// 0.0 at TOP cliff rim (Y = 0) -> 1.0 at BOTTOM hanging tip (Y = -length).
// Uses Kiln 1.9.0 1024x1024 3-column full-height V3 RGBA textureAtlas (mask-rgb-dilate)
// with EXACT world-space aspect-ratio compensation & mip-safe continuous stems!

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(cA, cB, t) {
  return [
    clampInt(lerp(cA[0], cB[0], t), 0, 255),
    clampInt(lerp(cA[1], cB[1], t), 0, 255),
    clampInt(lerp(cA[2], cB[2], t), 0, 255),
    255,
  ];
}

// World-metre heart-leaf philodendron silhouette projected via exact local texel density
function makeWorldHeartPoly(x0, y0, angleWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H) {
  const ux = Math.cos(angleWorld);
  const uy = Math.sin(angleWorld);
  const nx = -uy;
  const ny = ux;
  const profile = [
    [0.12, 0.00],
    [0.00, 0.44],
    [0.14, 0.92],
    [0.35, 1.00],
    [0.60, 0.72],
    [0.82, 0.32],
    [1.00, 0.00],
    [0.82, -0.32],
    [0.60, -0.72],
    [0.35, -0.96],
    [0.14, -0.90],
    [0.00, -0.42],
  ];
  return profile.map(([s, w]) => {
    const dxM = ux * lenM * s + nx * halfWM * w;
    const dyM = uy * lenM * s + ny * halfWM * w;
    return [clampInt(x0 + dxM * pxPerMX, 3, W - 3), clampInt(y0 + dyM * pxPerMY, 3, H - 3)];
  });
}

// World-metre slender pointed tropical cascade lance-leaf
function makeWorldLancePoly(x0, y0, angleWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H) {
  const ux = Math.cos(angleWorld);
  const uy = Math.sin(angleWorld);
  const nx = -uy;
  const ny = ux;
  const profile = [
    [0.00, 0.00],
    [0.18, 0.64],
    [0.44, 1.00],
    [0.72, 0.64],
    [0.90, 0.24],
    [1.00, 0.00],
    [0.90, -0.24],
    [0.72, -0.64],
    [0.44, -0.96],
    [0.18, -0.62],
  ];
  return profile.map(([s, w]) => {
    const dxM = ux * lenM * s + nx * halfWM * w;
    const dyM = uy * lenM * s + ny * halfWM * w;
    return [clampInt(x0 + dxM * pxPerMX, 3, W - 3), clampInt(y0 + dyM * pxPerMY, 3, H - 3)];
  });
}

// Single-op 26-vertex continuous mip-safe sinuous vine cord (never breaks up at 15-45 m distance!)
function makeSinuousStemPoly(stemXAt, W, H) {
  const left = [];
  const right = [];
  const segs = 12;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = clampInt(t * 1002, 0, H - 6);
    const sx = stemXAt(t);
    const halfW = lerp(10.5, 6.2, t);
    left.push([clampInt(sx - halfW, 4, W - 4), y]);
    right.push([clampInt(sx + halfW, 4, W - 4), y]);
  }
  return left.concat(right.reverse());
}

// Build a full-height (340 x 1024) V3 RGBA hero cenote-rim curtain column (<= 64 ops).
// V = 0 (top y=0): rich deep emerald-olive mass clinging to high limestone skylight rim.
// V = 1 (bottom y=1023): continuous glowing sunlit golden-chartreuse streamers!
function buildLongColumnOps(variant, isHeight) {
  const W = 340;
  const H = 1024;
  const ops = [];
  const rng = seededRandom('vine-long-v2-' + variant);

  // Nominal strand world dimensions for exact world-to-texel aspect compensation
  const nomL = 10.6;
  const nomWTop = 0.88;
  const nomWBot = 0.36;
  const pxPerMY = H / nomL;
  function pxPerMXAt(t) {
    const wM = lerp(nomWTop, nomWBot, Math.pow(t, 0.78));
    return W / wM;
  }

  // Deep limestone-rim shaded emerald-olive -> vibrant tropical green -> glowing sunlit golden-chartreuse
  const rimEmerald = variant === 'mossy' ? [38, 84, 27] : [30, 76, 24];
  const midEmerald = variant === 'streamer' ? [68, 134, 41] : [54, 114, 36];
  const warmOlive = variant === 'mossy' ? [122, 178, 52] : [108, 168, 50];
  const sunlitGoldGreen = variant === 'streamer' ? [180, 224, 80] : [164, 212, 72];

  const amp = variant === 'streamer' ? 22 : 16;
  const phase = variant === 'heart' ? 0.5 : variant === 'streamer' ? 2.1 : 3.8;
  function stemXAt(t) {
    return 170 + Math.sin(t * Math.PI * 2.8 + phase) * amp * (1 - 0.30 * t);
  }

  // 1. Mip-safe continuous mossy vine stem cord from cliff rim all the way to tip (1 op!)
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSinuousStemPoly(stemXAt, W, H) },
    rgba: isHeight ? [164, 164, 164, 255] : [54, 98, 33, 255],
  });

  // 2. 48 world-proportioned cascading tropical leaves tightly anchored along the continuous stem!
  const leafCount = 48;
  const heroLeaves = [];

  for (let i = 0; i < leafCount; i++) {
    const u = i / (leafCount - 1);
    const t = Math.min(0.966, 0.014 + Math.pow(u, 1.06) * 0.95 + Math.sin(u * Math.PI * 10.0) * 0.009);
    const y0 = t * (H - 30);
    const sx = stemXAt(t);
    const pxPerMX = pxPerMXAt(t);

    const side = i % 5 === 0 && t < 0.38 ? 0 : i % 2 === 0 ? 1 : -1;
    // Bold lush clusters near rim (0.42 m) tapering gracefully into connected 0.24 m glowing shoots!
    const taper = Math.pow(1 - t * 0.44, 0.80);
    const jitter = rng.range(0.86, 1.16);

    let angWorld;
    if (side === 0) {
      angWorld = Math.PI * 0.5 + rng.range(-0.20, 0.20);
    } else {
      const flare = lerp(0.78, 0.38, t) * rng.range(0.84, 1.14);
      angWorld = Math.PI * 0.5 - side * flare;
    }

    const baseLenM = variant === 'streamer' ? 0.46 : variant === 'mossy' ? 0.40 : 0.41;
    const baseHalfWM = variant === 'streamer' ? 0.102 : variant === 'mossy' ? 0.122 : 0.154;
    const lenM = baseLenM * taper * jitter;
    const halfWM = baseHalfWM * taper * rng.range(0.88, 1.14);

    // Anchor petiole tightly into the continuous painted stem cord -> ZERO floating droplets!
    const attachX = sx + side * rng.range(0.0, 0.016) * pxPerMX;

    const useLance = variant === 'streamer' || (variant === 'mossy' && i % 3 !== 0) || (t > 0.72 && i % 2 === 1);
    const poly = useLance
      ? makeWorldLancePoly(attachX, y0, angWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H)
      : makeWorldHeartPoly(attachX, y0, angWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H);

    const shadeT = Math.max(0, Math.min(1, t * 0.98 + rng.range(-0.14, 0.16)));
    let col;
    if (shadeT < 0.28) {
      col = mixRgb(rimEmerald, midEmerald, shadeT / 0.28);
    } else if (shadeT < 0.62) {
      col = mixRgb(midEmerald, warmOlive, (shadeT - 0.28) / 0.34);
    } else {
      col = mixRgb(warmOlive, sunlitGoldGreen, (shadeT - 0.62) / 0.38);
    }

    const hVal = clampInt(160 + rng.range(-12, 22) + t * 22, 145, 216);
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: poly },
      rgba: isHeight ? [hVal, hVal, hVal, 255] : col,
    });

    if (i % 3 === 0 && heroLeaves.length < 15) {
      heroLeaves.push({ x0: attachX, y0, angWorld, lenM, pxPerMX, t });
    }
  }

  // 3. Sunlit golden-chartreuse midrib veins (15 ops -> total 64 ops == 64!)
  for (const h of heroLeaves) {
    const ux = Math.cos(h.angWorld);
    const uy = Math.sin(h.angWorld);
    const p0 = [
      clampInt(h.x0 + ux * h.lenM * 0.16 * h.pxPerMX, 4, W - 4),
      clampInt(h.y0 + uy * h.lenM * 0.16 * pxPerMY, 4, H - 4),
    ];
    const p1 = [
      clampInt(h.x0 + ux * h.lenM * 0.84 * h.pxPerMX, 4, W - 4),
      clampInt(h.y0 + uy * h.lenM * 0.84 * pxPerMY, 4, H - 4),
    ];
    const veinCol = mixRgb([144, 198, 70], [208, 240, 108], h.t);
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: p0, to: p1, width: h.t < 0.55 ? 4 : 3 },
      rgba: isHeight ? [242, 242, 242, 255] : veinCol,
      opacity: isHeight ? 230 : 195,
    });
  }

  return ops;
}

// Gracefully twisted, V-cambered 3D hanging ribbon along a sampled spline.
// UV.y runs strictly from 0.0 at TOP (Y = 0) to 1.0 at BOTTOM tip.
function makeCamberedRibbonAlongCurve(pts, opts) {
  const {
    widthTop,
    widthBot,
    twistStartDeg,
    twistEndDeg,
    camber,
    radialOffset = 0.0,
    waveAmp = 0.0,
    waveFreq = 2.0,
  } = opts;

  const n = pts.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  const arcLen = [0];
  for (let i = 1; i < n; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const dz = pts[i][2] - pts[i - 1][2];
    arcLen.push(arcLen[i - 1] + Math.hypot(dx, dy, dz));
  }
  const totalLen = arcLen[n - 1] || 1;

  for (let i = 0; i < n; i++) {
    const v = arcLen[i] / totalLen;
    let tx, ty, tz;
    if (i === 0) {
      tx = 0;
      ty = -1;
      tz = 0;
    } else {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      tx = next[0] - prev[0];
      ty = next[1] - prev[1];
      tz = next[2] - prev[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
    }

    let rx = 1;
    let ry = 0;
    let rz = 0;
    const dot = rx * tx + ry * ty + rz * tz;
    rx -= dot * tx;
    ry -= dot * ty;
    rz -= dot * tz;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;

    const bx = ty * rz - tz * ry;
    const by = tz * rx - tx * rz;
    const bz = tx * ry - ty * rx;

    const ang = ((twistStartDeg + (twistEndDeg - twistStartDeg) * v) * Math.PI) / 180;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const wx = rx * ca + bx * sa;
    const wy = ry * ca + by * sa;
    const wz = rz * ca + bz * sa;
    const nx = -rx * sa + bx * ca;
    const ny = -ry * sa + by * ca;
    const nz = -rz * sa + bz * ca;

    const halfW = 0.5 * lerp(widthTop, widthBot, Math.pow(v, 0.78));
    const wave = Math.sin(v * Math.PI * waveFreq) * waveAmp * Math.sin(Math.PI * v);
    const cx = pts[i][0] + nx * (radialOffset + wave);
    const cy = pts[i][1] + ny * (radialOffset + wave);
    const cz = pts[i][2] + nz * (radialOffset + wave);

    const camb = camber * (1 - 0.45 * v);

    positions.push(
      cx - wx * halfW,
      cy - wy * halfW,
      cz - wz * halfW,
      cx + nx * camb,
      cy + ny * camb,
      cz + nz * camb,
      cx + wx * halfW,
      cy + wy * halfW,
      cz + wz * halfW,
    );
    uvs.push(0.0, v, 0.5, v, 1.0, v);
  }

  for (let i = 0; i < n - 1; i++) {
    const r0 = i * 3;
    const r1 = (i + 1) * 3;
    indices.push(r0, r1, r0 + 1);
    indices.push(r0 + 1, r1, r1 + 1);
    indices.push(r0 + 1, r1 + 1, r0 + 2);
    indices.push(r0 + 2, r1 + 1, r1 + 2);
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
  const root = createRoot('foliage-vine-long');

  // 1. Shared 1024x1024 3-column full-height V3 RGBA textureAtlas (mask-rgb-dilate)
  const albedoAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 1024,
    usage: 'albedo',
    regions: [
      {
        name: 'heart_curtain',
        content: { x: 0, y: 0, width: 340, height: 1024 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 1024,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: buildLongColumnOps('heart', false),
          },
        },
      },
      {
        name: 'sunlit_streamer',
        content: { x: 342, y: 0, width: 340, height: 1024 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 1024,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: buildLongColumnOps('streamer', false),
          },
        },
      },
      {
        name: 'mossy_tendril',
        content: { x: 684, y: 0, width: 340, height: 1024 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 1024,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: buildLongColumnOps('mossy', false),
          },
        },
      },
    ],
  });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 1024,
    usage: 'albedo',
    regions: [
      {
        name: 'heart_curtain',
        content: { x: 0, y: 0, width: 340, height: 1024 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 1024,
            usage: 'albedo',
            background: [128, 128, 128, 255],
            operations: buildLongColumnOps('heart', true),
          },
        },
      },
      {
        name: 'sunlit_streamer',
        content: { x: 342, y: 0, width: 340, height: 1024 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 1024,
            usage: 'albedo',
            background: [128, 128, 128, 255],
            operations: buildLongColumnOps('streamer', true),
          },
        },
      },
      {
        name: 'mossy_tendril',
        content: { x: 684, y: 0, width: 340, height: 1024 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 340,
            height: 1024,
            usage: 'albedo',
            background: [128, 128, 128, 255],
            operations: buildLongColumnOps('mossy', true),
          },
        },
      },
    ],
  });

  const leafNormalMap = normalMapFromHeight(heightAtlas, {
    strength: 4.8,
    name: 'VineLongNormal',
  });

  const leafMat = foliageMaterial(albedoAtlas, {
    alphaCutoff: 0.45,
    roughness: 0.50,
    doubleSided: true,
    name: 'VineLeaves',
  });
  leafMat.normalMap = leafNormalMap;
  leafMat.normalScale = new THREE.Vector2(0.85, 0.85);

  // Mossy olive-green-brown tropical cliff-liana bark material
  const barkTex = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'VineStemBarkAlbedo',
    layers: [
      { op: 'solid', color: 0x4f4e2c },
      { op: 'stripes', colorA: 0x39381e, colorB: 0x626036, count: 14, angleDeg: 86, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x2f4820, colorB: 0x628034, scale: 7, octaves: 4, seed: 73, blend: 'overlay', opacity: 0.58 },
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

  // 2. Nine sweeping asymmetrical hero hanging strands (7.1 m to 13.5 m drop)
  //    Target bounds: Width ~3.6 m along Z, Depth ~1.3 m along X, Drop ~13.5 m (Y = 0.00 to -13.50 m).
  const mainStrands = [
    {
      pts: [[-0.10, -0.22, -1.42], [0.12, -2.58, -1.52], [-0.14, -5.22, -1.28], [0.06, -7.65, -1.38]],
      wTop: 0.78, wBot: 0.34, twist0: 18, twistSpan: 90,
      colA: 'heart_curtain', colB: 'mossy_tendril', rTop: 0.017, rBot: 0.0038,
    },
    {
      pts: [[0.14, -0.04, -1.04], [0.28, -3.65, -1.18], [-0.08, -7.55, -0.88], [0.14, -11.20, -1.02]],
      wTop: 0.88, wBot: 0.36, twist0: 66, twistSpan: 118,
      colA: 'heart_curtain', colB: 'sunlit_streamer', rTop: 0.019, rBot: 0.004,
    },
    {
      pts: [[-0.22, -0.10, -0.78], [-0.32, -2.95, -0.90], [-0.10, -6.05, -0.64], [-0.20, -8.90, -0.76]],
      wTop: 0.80, wBot: 0.34, twist0: 132, twistSpan: -94,
      colA: 'mossy_tendril', colB: 'sunlit_streamer', rTop: 0.017, rBot: 0.0038,
    },
    {
      // Hero longest sweeping cenote waterfall-rim curtain reaching Y = -13.50 m!
      pts: [[0.10, 0.0, -0.32], [0.26, -4.35, -0.48], [-0.10, -9.05, -0.12], [0.14, -13.50, -0.28]],
      wTop: 0.94, wBot: 0.38, twist0: 28, twistSpan: 138,
      colA: 'heart_curtain', colB: 'sunlit_streamer', rTop: 0.020, rBot: 0.0042,
    },
    {
      pts: [[-0.16, -0.04, 0.06], [0.10, -3.90, 0.22], [-0.22, -8.15, -0.08], [-0.04, -12.10, 0.10]],
      wTop: 0.86, wBot: 0.36, twist0: 162, twistSpan: -124,
      colA: 'sunlit_streamer', colB: 'mossy_tendril', rTop: 0.019, rBot: 0.004,
    },
    {
      pts: [[0.20, -0.10, 0.56], [0.32, -3.10, 0.70], [0.02, -6.35, 0.42], [0.16, -9.40, 0.56]],
      wTop: 0.84, wBot: 0.34, twist0: 84, twistSpan: 102,
      colA: 'heart_curtain', colB: 'mossy_tendril', rTop: 0.018, rBot: 0.0038,
    },
    {
      pts: [[-0.24, -0.16, 0.86], [-0.34, -2.35, 0.98], [-0.10, -4.80, 0.74], [-0.18, -7.15, 0.84]],
      wTop: 0.76, wBot: 0.32, twist0: 214, twistSpan: -82,
      colA: 'mossy_tendril', colB: 'heart_curtain', rTop: 0.016, rBot: 0.0035,
    },
    {
      pts: [[0.08, -0.06, 1.18], [0.24, -3.45, 1.32], [-0.08, -7.10, 1.02], [0.10, -10.60, 1.16]],
      wTop: 0.86, wBot: 0.34, twist0: 46, twistSpan: 110,
      colA: 'sunlit_streamer', colB: 'heart_curtain', rTop: 0.018, rBot: 0.0038,
    },
    {
      pts: [[-0.12, -0.20, 1.44], [0.08, -2.68, 1.54], [-0.14, -5.48, 1.32], [0.02, -8.10, 1.42]],
      wTop: 0.76, wBot: 0.32, twist0: 112, twistSpan: -88,
      colA: 'mossy_tendril', colB: 'sunlit_streamer', rTop: 0.016, rBot: 0.0035,
    },
  ];

  // 3. Seven lush upper cliff-rim mantle strands (Y = 0 to -4.6 m)
  const crownStrands = [
    { pts: [[0.18, -0.10, -1.24], [0.28, -1.65, -1.32], [0.14, -3.65, -1.16]], wTop: 0.86, wBot: 0.44, twist0: 24, col: 'heart_curtain' },
    { pts: [[-0.14, -0.02, -0.62], [-0.24, -2.00, -0.70], [-0.06, -4.45, -0.54]], wTop: 0.92, wBot: 0.46, twist0: 108, col: 'mossy_tendril' },
    { pts: [[0.24, 0.0, -0.14], [0.34, -1.85, -0.22], [0.18, -4.10, -0.06]], wTop: 0.94, wBot: 0.48, twist0: 14, col: 'heart_curtain' },
    { pts: [[-0.22, -0.06, 0.32], [-0.32, -1.60, 0.24], [-0.14, -3.55, 0.38]], wTop: 0.88, wBot: 0.44, twist0: 146, col: 'heart_curtain' },
    { pts: [[0.22, -0.02, 0.76], [0.32, -2.05, 0.84], [0.14, -4.55, 0.68]], wTop: 0.90, wBot: 0.44, twist0: 72, col: 'sunlit_streamer' },
    { pts: [[-0.16, -0.10, 1.06], [-0.26, -1.55, 1.14], [-0.08, -3.40, 0.98]], wTop: 0.84, wBot: 0.42, twist0: 188, col: 'mossy_tendril' },
    { pts: [[0.12, -0.14, 1.36], [0.22, -1.45, 1.44], [0.06, -3.15, 1.28]], wTop: 0.80, wBot: 0.40, twist0: 54, col: 'heart_curtain' },
  ];

  const stemGeos = [];
  const leafGeos = [];

  for (const s of mainStrands) {
    // End woody liana stems cleanly at 84% length so bottom streamers are pure delicate sunlit shoots
    const fullStem = bezierCurve(s.pts, 14);
    const stemCurve = fullStem.slice(0, Math.max(4, Math.floor(fullStem.length * 0.84)));
    const radii = stemCurve.map((_, i) => lerp(s.rTop, s.rBot, i / (stemCurve.length - 1)));
    stemGeos.push(
      taperedTube(stemCurve, radii, {
        radialSegments: 5,
        creaseAngle: 180,
        cap: true,
        up: [1, 0, 0],
      }),
    );

    const ribbonPts = bezierCurve(s.pts, 20);

    // Crossed cambered 3D ribbons (angled 82 deg apart, opposite helical drift, zero coplanar faces)
    const rawA = makeCamberedRibbonAlongCurve(ribbonPts, {
      widthTop: s.wTop,
      widthBot: s.wBot,
      twistStartDeg: s.twist0,
      twistEndDeg: s.twist0 + s.twistSpan,
      camber: 0.082,
      radialOffset: 0.028,
      waveAmp: 0.060,
      waveFreq: 3.0,
    });
    leafGeos.push(
      remapUVToAtlas(rawA, albedoAtlas, s.colA, {
        inputOrigin: 'top-left',
        mode: 'texel-center',
        axes: 'u-only',
      }),
    );

    const rawB = makeCamberedRibbonAlongCurve(ribbonPts, {
      widthTop: s.wTop * 0.90,
      widthBot: s.wBot * 0.90,
      twistStartDeg: s.twist0 + 82,
      twistEndDeg: s.twist0 + 82 + s.twistSpan * 0.85,
      camber: 0.072,
      radialOffset: 0.030,
      waveAmp: 0.050,
      waveFreq: 3.5,
    });
    leafGeos.push(
      remapUVToAtlas(rawB, albedoAtlas, s.colB, {
        inputOrigin: 'top-left',
        mode: 'texel-center',
        axes: 'u-only',
      }),
    );
  }

  for (const c of crownStrands) {
    const ribbonPts = bezierCurve(c.pts, 10);
    const rawA = makeCamberedRibbonAlongCurve(ribbonPts, {
      widthTop: c.wTop,
      widthBot: c.wBot,
      twistStartDeg: c.twist0,
      twistEndDeg: c.twist0 + 52,
      camber: 0.085,
      radialOffset: 0.0,
      waveAmp: 0.04,
      waveFreq: 1.5,
    });
    leafGeos.push(
      remapUVToAtlas(rawA, albedoAtlas, c.col, {
        inputOrigin: 'top-left',
        mode: 'texel-center',
        axes: 'u-only',
      }),
    );

    const rawB = makeCamberedRibbonAlongCurve(ribbonPts, {
      widthTop: c.wTop * 0.86,
      widthBot: c.wBot * 0.86,
      twistStartDeg: c.twist0 + 86,
      twistEndDeg: c.twist0 + 132,
      camber: 0.074,
      radialOffset: 0.0,
      waveAmp: 0.035,
      waveFreq: 2.0,
    });
    leafGeos.push(
      remapUVToAtlas(rawB, albedoAtlas, 'sunlit_streamer', {
        inputOrigin: 'top-left',
        mode: 'texel-center',
        axes: 'u-only',
      }),
    );
  }

  const mergedStems = mergeGeos(stemGeos);
  createPart('VineStems', mergedStems, stemMat, { parent: root });

  const mergedLeaves = mergeGeos(leafGeos);
  const leavesPart = createPart('VineLeaves', mergedLeaves, leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided alpha-cutout tall cenote vine curtain ribbons');

  return root;
}
