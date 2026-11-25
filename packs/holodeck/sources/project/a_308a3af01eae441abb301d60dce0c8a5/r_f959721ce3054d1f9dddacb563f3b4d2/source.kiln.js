const meta = {
  name: 'foliage-vine-medium',
  role: 'fill',
};

// Lagoon Sanctuary — Mid-Cliff Hanging Vine Curtain (7.5 m drop)
// Pivot Y = 0.00 m at TOP attachment; hangs downward into -Y.
// +X forward, +Y up, +Z right.
// Holodeck wind contract: ONE single-primitive Mesh_VineLeaves with UV.y strictly
// 0.0 at TOP cliff lip (Y = 0) -> 1.0 at BOTTOM hanging tip (Y = -length).
// Uses Kiln 1.9.0 1024x1024 3-column full-height V3 RGBA textureAtlas (mask-rgb-dilate)
// with EXACT world-space aspect-ratio compensation so every leaf & orchid blossom
// renders unstretched and razor-crisp on 3D curved ribbons!

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

// Project world-metre offsets (dxM, dyM) into texture pixels using the ribbon's exact
// local horizontal/vertical texel density at vertical fraction t -> ZERO aspect stretching!
function makeWorldHeartPoly(x0, y0, angleWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H) {
  const ux = Math.cos(angleWorld);
  const uy = Math.sin(angleWorld);
  const nx = -uy;
  const ny = ux;
  const profile = [
    [0.12, 0.00],
    [0.00, 0.44],
    [0.14, 0.92],
    [0.34, 1.00],
    [0.60, 0.72],
    [0.82, 0.32],
    [1.00, 0.00],
    [0.82, -0.32],
    [0.60, -0.72],
    [0.34, -0.96],
    [0.14, -0.90],
    [0.00, -0.42],
  ];
  return profile.map(([s, w]) => {
    const dxM = ux * lenM * s + nx * halfWM * w;
    const dyM = uy * lenM * s + ny * halfWM * w;
    return [clampInt(x0 + dxM * pxPerMX, 3, W - 3), clampInt(y0 + dyM * pxPerMY, 3, H - 3)];
  });
}

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

// Single-op 25-vertex ruffled 5-petal tropical orchid blossom in world metres (perfectly round in 3D!)
function makeWorldOrchidFlowerPoly(cx, cy, radiusM, rotRad, pxPerMX, pxPerMY, W, H) {
  const pts = [];
  const steps = 25;
  for (let i = 0; i < steps; i++) {
    const theta = rotRad + (i / steps) * Math.PI * 2;
    const lobe = Math.abs(Math.sin(2.5 * (theta - rotRad)));
    const r = radiusM * (0.34 + 0.66 * Math.pow(lobe, 0.72));
    const dxM = Math.cos(theta) * r;
    const dyM = Math.sin(theta) * r;
    pts.push([clampInt(cx + dxM * pxPerMX, 3, W - 3), clampInt(cy + dyM * pxPerMY, 3, H - 3)]);
  }
  return pts;
}

// Single-op 10-vertex world-proportioned circle/throat polygon
function makeWorldCirclePoly(cx, cy, radiusM, pxPerMX, pxPerMY, W, H) {
  const pts = [];
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    pts.push([
      clampInt(cx + Math.cos(theta) * radiusM * pxPerMX, 3, W - 3),
      clampInt(cy + Math.sin(theta) * radiusM * pxPerMY, 3, H - 3),
    ]);
  }
  return pts;
}

// Single-op 26-vertex continuous tapering vine cord polygon (mip-safe width all the way to tip!)
function makeSinuousStemPoly(stemXAt, W, H) {
  const left = [];
  const right = [];
  const segs = 12;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = clampInt(t * 1002, 0, H - 6);
    const sx = stemXAt(t);
    const halfW = lerp(7.8, 4.6, t);
    left.push([clampInt(sx - halfW, 4, W - 4), y]);
    right.push([clampInt(sx + halfW, 4, W - 4), y]);
  }
  return left.concat(right.reverse());
}

// Build a full-height (340 x 1024) V3 RGBA cascading leafy-vine column (<= 64 ops).
// V = 0 (top y=0): lush dense shaded emerald foliage at cliff lip.
// V = 1 (bottom y=1023): tapering lacy backlit sunlit chartreuse-lime wispy shoots!
function buildCascadeColumnOps(variant, isHeight) {
  const W = 340;
  const H = 1024;
  const ops = [];
  const rng = seededRandom('vine-med-v3-' + variant);

  // Nominal ribbon world dimensions for exact world-to-texel aspect compensation
  const nomL = 6.0;
  const nomWTop = 0.66;
  const nomWBot = 0.34;
  const pxPerMY = H / nomL;
  function pxPerMXAt(t) {
    const wM = lerp(nomWTop, nomWBot, Math.pow(t, 0.80));
    return W / wM;
  }

  // Vibrant sunlit cenote palette matching lagoon-sanctuary.png
  const darkEmerald = [34, 82, 26];
  const lushEmerald = [56, 118, 38];
  const brightOlive = [104, 166, 50];
  const sunlitChartreuse = [166, 214, 74];

  const amp = variant === 'lance' ? 20 : 16;
  const phase = variant === 'heart' ? 0.4 : variant === 'lance' ? 1.9 : 3.2;
  function stemXAt(t) {
    return 170 + Math.sin(t * Math.PI * 2.5 + phase) * amp * (1 - 0.30 * t);
  }

  // 1. Continuous mip-safe sinuous vine stem cord (1 op total!)
  ops.push({
    op: 'paint',
    shape: { kind: 'polygon', points: makeSinuousStemPoly(stemXAt, W, H) },
    rgba: isHeight ? [164, 164, 164, 255] : [54, 98, 33, 255],
  });

  // 2. Crisp world-proportioned botanical heart & lance leaves tightly anchored onto the painted stem!
  const leafCount = variant === 'orchid' ? 41 : 45;
  const heroLeaves = [];

  for (let i = 0; i < leafCount; i++) {
    const u = i / (leafCount - 1);
    const t = Math.min(0.968, 0.018 + Math.pow(u, 1.07) * 0.95 + Math.sin(u * Math.PI * 9.0) * 0.010);
    const y0 = t * (H - 34);
    const sx = stemXAt(t);
    const pxPerMX = pxPerMXAt(t);

    const side = i % 6 === 0 && t < 0.42 ? 0 : i % 2 === 0 ? 1 : -1;
    // Gentle organic taper: plump 26-30 cm crown leaves -> delicate 15-18 cm sunlit tip leaves
    const taper = Math.pow(1 - t * 0.48, 0.84);
    const jitter = rng.range(0.86, 1.15);

    let angWorld;
    if (side === 0) {
      angWorld = Math.PI * 0.5 + rng.range(-0.22, 0.22);
    } else {
      const flare = lerp(0.80, 0.44, t) * rng.range(0.84, 1.14);
      angWorld = Math.PI * 0.5 - side * flare;
    }

    const baseLenM = variant === 'lance' ? 0.30 : 0.26;
    const baseHalfWM = variant === 'lance' ? 0.074 : 0.114;
    const lenM = baseLenM * taper * jitter;
    const halfWM = baseHalfWM * taper * rng.range(0.88, 1.12);

    // Anchor petiole directly into the painted stem cord -> ZERO detached leaves at any distance!
    const attachX = sx + side * rng.range(0.0, 0.014) * pxPerMX;

    const poly =
      variant === 'lance' || (t > 0.74 && i % 2 === 1)
        ? makeWorldLancePoly(attachX, y0, angWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H)
        : makeWorldHeartPoly(attachX, y0, angWorld, lenM, halfWM, pxPerMX, pxPerMY, W, H);

    const shadeT = Math.max(0, Math.min(1, t * 0.96 + rng.range(-0.14, 0.16)));
    let col;
    if (shadeT < 0.30) {
      col = mixRgb(darkEmerald, lushEmerald, shadeT / 0.30);
    } else if (shadeT < 0.64) {
      col = mixRgb(lushEmerald, brightOlive, (shadeT - 0.30) / 0.34);
    } else {
      col = mixRgb(brightOlive, sunlitChartreuse, (shadeT - 0.64) / 0.36);
    }

    const hVal = clampInt(162 + rng.range(-12, 22) + t * 20, 146, 214);
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: poly },
      rgba: isHeight ? [hVal, hVal, hVal, 255] : col,
    });

    const maxVeins = variant === 'orchid' ? 9 : 16;
    if (i % 2 === 0 && heroLeaves.length < maxVeins) {
      heroLeaves.push({ x0: attachX, y0, angWorld, lenM, pxPerMX, t });
    }
  }

  // 3. Crisp sunlit midrib vein accents
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
    const veinCol = mixRgb([138, 192, 68], [198, 236, 102], h.t);
    ops.push({
      op: 'paint',
      shape: { kind: 'line', from: p0, to: p1, width: h.t < 0.55 ? 4 : 3 },
      rgba: isHeight ? [242, 242, 242, 255] : veinCol,
      opacity: isHeight ? 230 : 195,
    });
  }

  // 4. Column 3 accent: delicate world-proportioned 5-petal magenta-lilac epiphytic orchid blossoms!
  if (variant === 'orchid') {
    const budSpots = [
      { t: 0.09, side: 1, rM: 0.088, rot: 0.2 },
      { t: 0.16, side: -1, rM: 0.094, rot: -0.35 },
      { t: 0.24, side: 1, rM: 0.082, rot: 0.5 },
      { t: 0.32, side: -1, rM: 0.086, rot: 0.1 },
      { t: 0.41, side: 1, rM: 0.076, rot: -0.45 },
      { t: 0.50, side: -1, rM: 0.068, rot: 0.3 },
    ];
    for (const b of budSpots) {
      const pxPerMX = pxPerMXAt(b.t);
      const bx = clampInt(stemXAt(b.t) + b.side * rng.range(0.035, 0.085) * pxPerMX, 44, W - 44);
      const by = clampInt(b.t * (H - 40), 28, H - 44);
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: makeWorldOrchidFlowerPoly(bx, by, b.rM, b.rot, pxPerMX, pxPerMY, W, H) },
        rgba: isHeight ? [216, 216, 216, 255] : [214, 92, 198, 255],
      });
      ops.push({
        op: 'paint',
        shape: { kind: 'polygon', points: makeWorldCirclePoly(bx, by, b.rM * 0.34, pxPerMX, pxPerMY, W, H) },
        rgba: isHeight ? [246, 246, 246, 255] : [248, 206, 84, 255],
      });
    }
  }

  return ops;
}

// Gracefully twisted, V-cambered 3D hanging ribbon along a sampled spline.
// UV.y runs strictly from 0.0 at TOP (station 0, Y = 0) to 1.0 at BOTTOM tip.
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

    const halfW = 0.5 * lerp(widthTop, widthBot, Math.pow(v, 0.80));
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
  const root = createRoot('foliage-vine-medium');

  // 1. Shared 1024x1024 3-column full-height V3 RGBA textureAtlas (mask-rgb-dilate)
  const albedoAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 1024,
    usage: 'albedo',
    regions: [
      {
        name: 'heart_cascade',
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
            operations: buildCascadeColumnOps('heart', false),
          },
        },
      },
      {
        name: 'lance_cascade',
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
            operations: buildCascadeColumnOps('lance', false),
          },
        },
      },
      {
        name: 'orchid_cascade',
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
            operations: buildCascadeColumnOps('orchid', false),
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
        name: 'heart_cascade',
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
            operations: buildCascadeColumnOps('heart', true),
          },
        },
      },
      {
        name: 'lance_cascade',
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
            operations: buildCascadeColumnOps('lance', true),
          },
        },
      },
      {
        name: 'orchid_cascade',
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
            operations: buildCascadeColumnOps('orchid', true),
          },
        },
      },
    ],
  });

  const leafNormalMap = normalMapFromHeight(heightAtlas, {
    strength: 4.8,
    name: 'VineMediumNormal',
  });

  const leafMat = foliageMaterial(albedoAtlas, {
    alphaCutoff: 0.45,
    roughness: 0.50,
    doubleSided: true,
    name: 'VineLeaves',
  });
  leafMat.normalMap = leafNormalMap;
  leafMat.normalScale = new THREE.Vector2(0.85, 0.85);

  // Mossy warm olive-green-brown tropical liana bark material
  const barkTex = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'VineStemBarkAlbedo',
    layers: [
      { op: 'solid', color: 0x4f4c2c },
      { op: 'stripes', colorA: 0x39361e, colorB: 0x625f36, count: 14, angleDeg: 86, blend: 'overlay', opacity: 0.55 },
      { op: 'noise', colorA: 0x2f4820, colorB: 0x638234, scale: 7, octaves: 4, seed: 47, blend: 'overlay', opacity: 0.58 },
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

  // 2. Eight organically clustered asymmetrical cascading main strands (4.1 m to 7.5 m drop)
  //    Staggered top Y (0.00 to -0.18 m) creates organic undulating cliff-arch drape!
  const mainStrands = [
    {
      pts: [[-0.08, -0.18, -1.10], [0.10, -1.52, -1.18], [-0.12, -3.00, -0.98], [0.04, -4.35, -1.08]],
      wTop: 0.62, wBot: 0.34, twist0: 16, twistSpan: 78,
      colA: 'heart_cascade', colB: 'lance_cascade', rTop: 0.013, rBot: 0.003,
    },
    {
      pts: [[0.14, -0.04, -0.78], [0.28, -2.02, -0.90], [-0.06, -4.28, -0.64], [0.14, -6.28, -0.76]],
      wTop: 0.68, wBot: 0.36, twist0: 62, twistSpan: 95,
      colA: 'orchid_cascade', colB: 'heart_cascade', rTop: 0.014, rBot: 0.0032,
    },
    {
      pts: [[-0.22, -0.09, -0.56], [-0.32, -1.62, -0.66], [-0.10, -3.38, -0.44], [-0.20, -4.95, -0.54]],
      wTop: 0.62, wBot: 0.34, twist0: 122, twistSpan: -86,
      colA: 'heart_cascade', colB: 'lance_cascade', rTop: 0.013, rBot: 0.003,
    },
    {
      // Hero longest sweeping curtain strand reaching Y = -7.50 m!
      pts: [[0.08, 0.0, -0.18], [0.26, -2.42, -0.32], [-0.10, -5.08, -0.02], [0.12, -7.50, -0.16]],
      wTop: 0.72, wBot: 0.36, twist0: 24, twistSpan: 112,
      colA: 'heart_cascade', colB: 'lance_cascade', rTop: 0.015, rBot: 0.0035,
    },
    {
      pts: [[-0.14, -0.04, 0.14], [0.08, -2.18, 0.28], [-0.22, -4.58, 0.02], [-0.04, -6.78, 0.18]],
      wTop: 0.66, wBot: 0.34, twist0: 155, twistSpan: -98,
      colA: 'lance_cascade', colB: 'orchid_cascade', rTop: 0.014, rBot: 0.0032,
    },
    {
      pts: [[0.20, -0.08, 0.58], [0.30, -1.78, 0.70], [0.02, -3.72, 0.46], [0.14, -5.38, 0.58]],
      wTop: 0.64, wBot: 0.34, twist0: 88, twistSpan: 85,
      colA: 'heart_cascade', colB: 'lance_cascade', rTop: 0.013, rBot: 0.003,
    },
    {
      pts: [[-0.20, -0.14, 0.86], [-0.30, -1.42, 0.96], [-0.08, -2.92, 0.74], [-0.16, -4.18, 0.84]],
      wTop: 0.58, wBot: 0.32, twist0: 205, twistSpan: -72,
      colA: 'lance_cascade', colB: 'heart_cascade', rTop: 0.012, rBot: 0.003,
    },
    {
      pts: [[0.04, -0.16, 1.10], [0.18, -1.90, 1.20], [-0.10, -3.94, 0.98], [0.06, -5.82, 1.08]],
      wTop: 0.62, wBot: 0.32, twist0: 42, twistSpan: 88,
      colA: 'orchid_cascade', colB: 'lance_cascade', rTop: 0.013, rBot: 0.003,
    },
  ];

  // 3. Six lush staggered upper cliff-drape clusters (Y = 0 to -2.9 m)
  const crownStrands = [
    { pts: [[0.18, -0.06, -0.94], [0.30, -1.04, -1.00], [0.14, -2.35, -0.88]], wTop: 0.66, wBot: 0.38, twist0: 32, col: 'heart_cascade' },
    { pts: [[-0.12, 0.0, -0.40], [-0.24, -1.16, -0.46], [-0.06, -2.85, -0.34]], wTop: 0.70, wBot: 0.40, twist0: 112, col: 'orchid_cascade' },
    { pts: [[0.24, -0.02, -0.04], [0.34, -1.08, -0.10], [0.18, -2.55, 0.02]], wTop: 0.72, wBot: 0.40, twist0: 18, col: 'heart_cascade' },
    { pts: [[-0.24, -0.08, 0.34], [-0.34, -1.00, 0.28], [-0.16, -2.25, 0.40]], wTop: 0.66, wBot: 0.38, twist0: 148, col: 'heart_cascade' },
    { pts: [[0.22, -0.03, 0.72], [0.32, -1.18, 0.78], [0.14, -2.80, 0.66]], wTop: 0.68, wBot: 0.38, twist0: 74, col: 'orchid_cascade' },
    { pts: [[-0.10, -0.12, 0.98], [-0.20, -0.94, 1.04], [-0.02, -2.18, 0.92]], wTop: 0.62, wBot: 0.36, twist0: 192, col: 'heart_cascade' },
  ];

  const stemGeos = [];
  const leafGeos = [];

  for (const s of mainStrands) {
    // End woody stem cleanly at 82% length so bottom tips are pure sunlit trailing shoots
    const fullStem = bezierCurve(s.pts, 14);
    const stemCurve = fullStem.slice(0, Math.max(4, Math.floor(fullStem.length * 0.82)));
    const radii = stemCurve.map((_, i) => lerp(s.rTop, s.rBot, i / (stemCurve.length - 1)));
    stemGeos.push(
      taperedTube(stemCurve, radii, {
        radialSegments: 5,
        creaseAngle: 180,
        cap: true,
        up: [1, 0, 0],
      }),
    );

    const ribbonPts = bezierCurve(s.pts, 18);

    // Crossed cambered 3D ribbons (radialOffset clears slender stems cleanly -> zero penetration!)
    const rawA = makeCamberedRibbonAlongCurve(ribbonPts, {
      widthTop: s.wTop,
      widthBot: s.wBot,
      twistStartDeg: s.twist0,
      twistEndDeg: s.twist0 + s.twistSpan,
      camber: 0.062,
      radialOffset: 0.026,
      waveAmp: 0.045,
      waveFreq: 2.5,
    });
    leafGeos.push(
      remapUVToAtlas(rawA, albedoAtlas, s.colA, {
        inputOrigin: 'top-left',
        mode: 'texel-center',
        axes: 'u-only',
      }),
    );

    const rawB = makeCamberedRibbonAlongCurve(ribbonPts, {
      widthTop: s.wTop * 0.92,
      widthBot: s.wBot * 0.92,
      twistStartDeg: s.twist0 + 82,
      twistEndDeg: s.twist0 + 82 + s.twistSpan * 0.85,
      camber: 0.056,
      radialOffset: 0.028,
      waveAmp: 0.040,
      waveFreq: 3.0,
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
      twistEndDeg: c.twist0 + 48,
      camber: 0.068,
      radialOffset: 0.0,
      waveAmp: 0.03,
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
      widthTop: c.wTop * 0.88,
      widthBot: c.wBot * 0.88,
      twistStartDeg: c.twist0 + 86,
      twistEndDeg: c.twist0 + 128,
      camber: 0.058,
      radialOffset: 0.0,
      waveAmp: 0.025,
      waveFreq: 2.0,
    });
    leafGeos.push(
      remapUVToAtlas(rawB, albedoAtlas, 'lance_cascade', {
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
  markOpenShell(leavesPart, 'Double-sided alpha-cutout hanging vine curtain ribbons');

  return root;
}
