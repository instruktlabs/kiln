const meta = {
  name: 'foliage-fern-fountain',
};

function mergeGeometries(geos) {
  let totalVerts = 0;
  let totalIndices = 0;
  let hasColor = false;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    totalVerts += pos.count;
    totalIndices += g.index ? g.index.count : pos.count;
    if (g.getAttribute('color')) hasColor = true;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const col = g.getAttribute('color');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const dst3 = (vOffset + i) * 3;
      const dst2 = (vOffset + i) * 2;
      positions[dst3] = pos.getX(i);
      positions[dst3 + 1] = pos.getY(i);
      positions[dst3 + 2] = pos.getZ(i);
      if (norm) {
        normals[dst3] = norm.getX(i);
        normals[dst3 + 1] = norm.getY(i);
        normals[dst3 + 2] = norm.getZ(i);
      } else {
        normals[dst3] = 0;
        normals[dst3 + 1] = 1;
        normals[dst3 + 2] = 0;
      }
      if (uv) {
        uvs[dst2] = uv.getX(i);
        uvs[dst2 + 1] = uv.getY(i);
      }
      if (colors) {
        if (col) {
          colors[dst3] = col.getX(i);
          colors[dst3 + 1] = col.getY(i);
          colors[dst3 + 2] = col.getZ(i);
        } else {
          colors[dst3] = 1;
          colors[dst3 + 1] = 1;
          colors[dst3 + 2] = 1;
        }
      }
    }

    if (g.index) {
      const idx = g.index;
      for (let i = 0; i < idx.count; i++) {
        indices[iOffset + i] = idx.getX(i) + vOffset;
      }
      iOffset += idx.count;
    } else {
      for (let i = 0; i < count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += count;
    }
    vOffset += count;
  }

  const out = meshGeo({
    positions: Array.from(positions),
    normals: Array.from(normals),
    uvs: Array.from(uvs),
    indices: Array.from(indices),
  });
  if (colors) {
    out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return out;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinearRgb(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function tintGeometryGradient(geo, baseHex, tipHex, getT) {
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const c0 = hexToLinearRgb(baseHex);
  const c1 = hexToLinearRgb(tipHex);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.max(0, Math.min(1, getT(pos.getX(i), pos.getY(i), pos.getZ(i), i)));
    arr[i * 3] = c0[0] + (c1[0] - c0[0]) * t;
    arr[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * t;
    arr[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * t;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function buildSerratedLeafletPolygon(W, H, insetPx) {
  const cx = W * 0.5;
  const halfMax = W * 0.47 - insetPx;
  const yStart = 8 + insetPx;
  const yEnd = H - 8 - insetPx;
  const teeth = 12;
  const rightPts = [];
  const leftPts = [];

  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const yBase = yStart + (yEnd - yStart) * t;
    // Lush tropical sword-fern pinna: full auricled lower blade, holding width cleanly before a crisp pointed tip
    const baseBulge = Math.exp(-Math.pow((t - 0.16) / 0.24, 2)) * 0.16;
    const taper = Math.pow(Math.max(0, 1 - Math.pow(t, 1.35)), 0.58) * Math.sin(Math.min(1, t * 5.0 + 0.28) * Math.PI * 0.5);
    const wFrac = Math.max(0.05, Math.min(1.0, 0.90 * taper + baseBulge * (1 - t)));
    const w = halfMax * wFrac;

    if (i < teeth) {
      const notchIn = w * (i === 0 ? 0.94 : 0.81);
      const tCrest = (i + 0.55) / teeth;
      const yMid = yStart + (yEnd - yStart) * tCrest;
      const taperC = Math.pow(Math.max(0, 1 - Math.pow(tCrest, 1.35)), 0.58) * Math.sin(Math.min(1, tCrest * 5.0 + 0.28) * Math.PI * 0.5);
      const bulgeC = Math.exp(-Math.pow((tCrest - 0.16) / 0.24, 2)) * 0.16;
      const wCrest = halfMax * Math.max(0.06, Math.min(1.0, 0.96 * taperC + bulgeC * (1 - tCrest)));

      rightPts.push([Math.round(cx + notchIn), Math.round(yBase)]);
      rightPts.push([Math.round(cx + wCrest), Math.round(yMid)]);
      leftPts.push([Math.round(cx - notchIn), Math.round(yBase)]);
      leftPts.push([Math.round(cx - wCrest), Math.round(yMid)]);
    }
  }

  const pts = [[Math.round(cx), Math.round(yStart - 4)]];
  for (const p of rightPts) pts.push(p);
  pts.push([Math.round(cx), Math.round(yEnd)]);
  for (let i = leftPts.length - 1; i >= 0; i--) pts.push(leftPts[i]);
  return pts;
}

async function buildLeafletTextures() {
  const W = 512;
  const H = 512;
  const outerPts = buildSerratedLeafletPolygon(W, H, 0);
  const innerPts = buildSerratedLeafletPolygon(W, H, 22);

  const albedoOps = [
    // Luminous sunlit tropical fern base (linear vertex colors modulate outer fronds to #326824 and inner to #5b9433+)
    { op: 'paint', shape: { kind: 'polygon', points: outerPts }, rgba: [118, 178, 66, 255] },
    // Rich botanical emerald interior lamina
    { op: 'paint', shape: { kind: 'polygon', points: innerPts }, rgba: [98, 158, 54, 230] },
    // Gentle deeper tone near rachis attachment
    { op: 'paint', shape: { kind: 'ellipse', x: 96, y: 10, width: 320, height: 210 }, rgba: [76, 132, 40, 105] },
    // Warm sunlit emerald-gold tip glow
    { op: 'paint', shape: { kind: 'ellipse', x: 150, y: 270, width: 212, height: 235 }, rgba: [142, 196, 80, 125] },
    // Subtle botanical organic grain stamps
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 28, height: 46 }, rgba: [80, 136, 44, 38], count: 44, seed: 41, area: { x: 36, y: 16, width: 420, height: 460 } },
    { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 22, height: 36 }, rgba: [146, 200, 84, 36], count: 38, seed: 73, area: { x: 50, y: 36, width: 390, height: 430 } },
  ];

  const veinCount = 12;
  for (let i = 0; i < veinCount; i++) {
    const t = 0.06 + (i / (veinCount - 1)) * 0.84;
    const y0 = Math.round(14 + t * 476);
    const y1 = Math.round(Math.min(502, y0 + 26 + (1 - t) * 24));
    const taper = Math.pow(Math.max(0, 1 - Math.pow(t, 1.35)), 0.58);
    const span = Math.round(Math.max(22, 218 * taper));
    const vw = i < 6 ? 4 : 3;

    if (i < veinCount - 1) {
      const sy0 = Math.round(y0 + 18);
      const sy1 = Math.round(Math.min(504, y1 + 16));
      const sSpan = Math.round(span * 0.88);
      albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [256, sy0], to: [256 + sSpan, sy1], width: 4 }, rgba: [64, 114, 34, 70] });
      albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [256, sy0], to: [256 - sSpan, sy1], width: 4 }, rgba: [64, 114, 34, 70] });
    }
    albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [256, y0], to: [256 + span, y1], width: vw }, rgba: [146, 198, 86, 175] });
    albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [256, y0], to: [256 - span, y1], width: vw }, rgba: [146, 198, 86, 175] });
  }

  // Central pale-chartreuse midrib + bright ridge
  albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [256, 4], to: [256, 496], width: 11 }, rgba: [150, 200, 88, 245] });
  albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [256, 4], to: [256, 480], width: 4 }, rgba: [176, 220, 108, 225] });
  // Crisp final silhouette alpha mask
  albedoOps.push({ op: 'mask', shape: { kind: 'polygon', points: outerPts }, alpha: 255 });

  const albedo = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'leaflet',
      content: { x: 0, y: 0, width: W, height: H },
      gutter: 0,
      edgeMode: 'mask-rgb-dilate',
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: W,
          height: H,
          usage: 'albedo',
          background: [0, 0, 0, 0],
          operations: albedoOps,
        },
      },
    }],
  });

  // Matching height atlas for crisp vein tangent-space normal map
  const heightOps = [
    { op: 'paint', shape: { kind: 'polygon', points: outerPts }, rgba: [122, 122, 122, 255] },
    { op: 'paint', shape: { kind: 'polygon', points: innerPts }, rgba: [138, 138, 138, 255] },
  ];
  for (let i = 0; i < veinCount; i++) {
    const t = 0.06 + (i / (veinCount - 1)) * 0.84;
    const y0 = Math.round(14 + t * 476);
    const y1 = Math.round(Math.min(502, y0 + 26 + (1 - t) * 24));
    const taper = Math.pow(Math.max(0, 1 - Math.pow(t, 1.35)), 0.58);
    const span = Math.round(Math.max(22, 218 * taper));
    if (i < veinCount - 1) {
      const sy0 = Math.round(y0 + 18);
      const sy1 = Math.round(Math.min(504, y1 + 16));
      const sSpan = Math.round(span * 0.88);
      heightOps.push({ op: 'paint', shape: { kind: 'line', from: [256, sy0], to: [256 + sSpan, sy1], width: 5 }, rgba: [92, 92, 92, 255] });
      heightOps.push({ op: 'paint', shape: { kind: 'line', from: [256, sy0], to: [256 - sSpan, sy1], width: 5 }, rgba: [92, 92, 92, 255] });
    }
    heightOps.push({ op: 'paint', shape: { kind: 'line', from: [256, y0], to: [256 + span, y1], width: 5 }, rgba: [184, 184, 184, 255] });
    heightOps.push({ op: 'paint', shape: { kind: 'line', from: [256, y0], to: [256 - span, y1], width: 5 }, rgba: [184, 184, 184, 255] });
  }
  heightOps.push({ op: 'paint', shape: { kind: 'line', from: [256, 4], to: [256, 496], width: 12 }, rgba: [232, 232, 232, 255] });

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'leaflet-h',
      content: { x: 0, y: 0, width: W, height: H },
      gutter: 0,
      edgeMode: 'copy-edge',
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: W,
          height: H,
          usage: 'albedo',
          background: [110, 110, 110, 255],
          operations: heightOps,
        },
      },
    }],
  });

  const normal = normalMapFromHeight(heightAtlas, { strength: 5.5, name: 'FernLeafletNormal' });
  normal.flipY = false;
  return { albedo, normal };
}

/**
 * Builds ONE 3D sculpted curved + V-creased + slightly shingled sword-fern pinna (8 triangles).
 * +X follows frond tangent (forward sweep), +Y extends out from rachis,
 * skySign = -1 for right-side (up = +S where +Z points down), +1 for left-side (up = -S where +Z points up).
 */
function buildCurvedPinnaGeo(width, length, skySign) {
  const cols = 2;
  const rows = 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 = rachis attachment, 1 = pinna tip
    const y = -0.005 + v * length; // tiny embed into rachis so zero gap
    const xSweep = 0.24 * length * v + 0.04 * length * v * v;
    const wScale = v < 0.72 ? 1.0 : 0.78;
    // Graceful upward V-lift (~20 deg) arching smoothly and softening at tip so visible from side AND top
    const archSky = length * (0.28 * v - 0.13 * v * v);

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const uCentered = (u - 0.5) * 2; // -1, 0, +1
      const x = xSweep + uCentered * (width * 0.5) * wScale;
      // Subtle Venetian-blind pitch + V-trough crease so side-on views catch sunlit emerald faces!
      const shinglePitch = uCentered * width * 0.22;
      const vCup = Math.abs(uCentered) * width * 0.16;
      const z = skySign * (archSky + vCup + shinglePitch);

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      if (skySign > 0) {
        indices.push(a, b, e, a, e, d);
      } else {
        indices.push(a, e, b, a, d, e);
      }
    }
  }

  return meshGeo({ positions, uvs, indices });
}

function buildStemCrownCore(rng) {
  // Compact closed mossy fibrous rootstock tuft at Y=0..0.048m (organic mossy tuft nestled beneath basal pinnae)
  const parts = [];
  const rawCrown = copyGeometry(cylinderGeo(0.036, 0.062, 0.044, 12, 3));
  const crownGeo = displace(rawCrown, ([x, y, z]) => {
    const ang = Math.atan2(z, x);
    const h = (y + 0.022) / 0.044;
    const radScale = h > 0.08 ? (1 + 0.16 * Math.sin(ang * 5 + 0.4) + 0.10 * Math.cos(ang * 3 - 1.1)) : 1;
    const domeY = h > 0.85 ? 0.010 * (1 - Math.min(1, Math.hypot(x, z) / 0.042)) : 0;
    return [x * (radScale - 1), 0.022 + domeY, z * (radScale - 1)];
  });
  tintGeometryGradient(crownGeo, 0x6f5f3c, 0x948454, (_x, y) => Math.min(1, y / 0.055));
  parts.push(crownGeo);

  // 5 emerging mossy-olive young curled fiddlehead crosiers filling the center crown
  for (let i = 0; i < 5; i++) {
    const az = (i / 5) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const h = rng.range(0.11, 0.20);
    const r0 = rng.range(0.014, 0.032);
    const pts = [];
    const radii = [];
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t = s / (steps - 1);
      let radOut, yPos;
      if (t < 0.65) {
        const k = t / 0.65;
        radOut = r0 + 0.044 * k;
        yPos = 0.016 + h * k;
      } else {
        const k = (t - 0.65) / 0.35;
        const ang = k * Math.PI * 1.45;
        radOut = r0 + 0.044 + 0.019 * Math.sin(ang);
        yPos = 0.016 + h + 0.019 * (1 - Math.cos(ang)) * 0.55;
      }
      pts.push([ca * radOut, yPos, sa * radOut]);
      radii.push(0.0068 * (1 - 0.50 * t));
    }
    const shoot = taperedTube(pts, radii, { radialSegments: 4, creaseAngle: 180, cap: true });
    tintGeometryGradient(shoot, 0x7d7446, 0xb2d872, (_x, y) => Math.max(0, (y - 0.02) / h));
    parts.push(shoot);
  }
  return parts;
}

async function build() {
  const root = createRoot('foliage-fern-fountain');
  const rng = seededRandom('lagoon-fern-fountain-v1');

  const { albedo: leafAlbedo, normal: leafNormal } = await buildLeafletTextures();

  // Stem material: dark fibrous olive-brown woody rachis
  const stemTex = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'FernStemAlbedo',
    layers: [
      { op: 'solid', color: 0x6b7c42 },
      { op: 'stripes', colorA: 0x4d5d2d, colorB: 0x7c8f4c, count: 14, angleDeg: 0, blend: 'overlay', opacity: 0.45 },
      { op: 'noise', colorA: 0x3a4722, colorB: 0x8a9c56, scale: 8, octaves: 3, seed: 19, blend: 'multiply', opacity: 0.55 },
    ],
  });
  const stemNormal = normalMapFromHeight(stemTex, { strength: 4.0, name: 'FernStemNormal' });

  const stemMat = pbrMaterial({
    albedo: stemTex,
    normal: stemNormal,
    roughness: 0.78,
    metalness: 0.0,
    name: 'Mat_FernStems',
  });
  stemMat.vertexColors = true;

  const frondMat = pbrMaterial({
    albedo: leafAlbedo,
    normal: leafNormal,
    roughness: 0.56,
    metalness: 0.0,
    alphaMode: 'mask',
    alphaCutoff: 0.45,
    doubleSided: true,
    name: 'Mat_FernFronds',
  });
  frondMat.vertexColors = true;

  const pinnaRightGeo = buildCurvedPinnaGeo(0.088, 0.215, -1);
  const pinnaLeftGeo = buildCurvedPinnaGeo(0.088, 0.215, 1);
  const terminalTipGeo = buildCurvedPinnaGeo(0.052, 0.110, -1);

  const stemGeos = buildStemCrownCore(rng.fork('crown'));
  const frondGeos = [];

  // 3 staggered whorls = 18 lush gracefully arching tropical sword-fern fronds
  // Target bounds: ~1.90m diameter (radius ~0.95m), ~1.15m height
  const whorls = [
    // Outer low drooping mature fronds (7)
    {
      count: 7,
      azOffset: 0.0,
      reachMin: 0.84, reachMax: 0.93,
      peakYMin: 0.54, peakYMax: 0.66,
      tipYMin: 0.14, tipYMax: 0.26,
      baseR: 0.032, baseY: 0.012,
      pinnaScale: 1.06,
      pairsLow: 5, pairsMid: 8, pairsTip: 6,
      baseCol: 0x8ea682, tipCol: 0xbdd4a8, // multiplies texture -> rich botanical #326824 to #4c862e
      stemBaseCol: 0x7e7246, stemTipCol: 0xa4c85e,
    },
    // Middle full arching fronds (6)
    {
      count: 6,
      azOffset: Math.PI / 7,
      reachMin: 0.64, reachMax: 0.76,
      peakYMin: 0.84, peakYMax: 0.98,
      tipYMin: 0.50, tipYMax: 0.66,
      baseR: 0.024, baseY: 0.024,
      pinnaScale: 0.96,
      pairsLow: 5, pairsMid: 8, pairsTip: 6,
      baseCol: 0xa6be94, tipCol: 0xd8ebb8, // vibrant mid tropical emerald
      stemBaseCol: 0x887f4a, stemTipCol: 0xb2d868,
    },
    // Inner upright sunlit new-growth fountain plumes (5)
    {
      count: 5,
      azOffset: Math.PI / 10,
      reachMin: 0.34, reachMax: 0.45,
      peakYMin: 1.05, peakYMax: 1.16,
      tipYMin: 0.93, tipYMax: 1.10,
      baseR: 0.014, baseY: 0.034,
      pinnaScale: 0.80,
      pairsLow: 4, pairsMid: 7, pairsTip: 5,
      baseCol: 0xc4db9e, tipCol: 0xf4fccf, // warm sunlit inner emerald-gold (#5b9433+)
      stemBaseCol: 0x949450, stemTipCol: 0xc8ea74,
    },
  ];

  const fRng = rng.fork('fronds');
  for (let wIdx = 0; wIdx < whorls.length; wIdx++) {
    const w = whorls[wIdx];
    for (let i = 0; i < w.count; i++) {
      const az = w.azOffset + (i / w.count) * Math.PI * 2 + fRng.range(-0.14, 0.14);
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const sideX = -sa;
      const sideZ = ca;

      const reach = fRng.range(w.reachMin, w.reachMax);
      const peakY = fRng.range(w.peakYMin, w.peakYMax);
      const tipY = fRng.range(w.tipYMin, w.tipYMax);
      const swayLat = fRng.range(-0.06, 0.06) * reach;
      const rollDeg = fRng.range(-8, 8);

      const p0 = [ca * w.baseR, w.baseY, sa * w.baseR];
      const p1 = [
        ca * (w.baseR + reach * 0.28) + sideX * swayLat * 0.3,
        peakY * 0.88,
        sa * (w.baseR + reach * 0.28) + sideZ * swayLat * 0.3,
      ];
      const p2 = [
        ca * (w.baseR + reach * 0.72) + sideX * swayLat * 0.8,
        peakY * 1.12,
        sa * (w.baseR + reach * 0.72) + sideZ * swayLat * 0.8,
      ];
      const p3 = [
        ca * (w.baseR + reach) + sideX * swayLat,
        tipY,
        sa * (w.baseR + reach) + sideZ * swayLat,
      ];

      const curvePts = bezierCurve([p0, p1, p2, p3], 20);
      const stemPts = bezierCurve([p0, p1, p2, p3], 12);
      const stemRadii = stemPts.map((_, idx) => {
        const t = idx / (stemPts.length - 1);
        return 0.0072 * Math.pow(1 - t * 0.78, 1.15);
      });
      const stemGeo = taperedTube(stemPts, stemRadii, { radialSegments: 4, creaseAngle: 180, cap: true });
      tintGeometryGradient(stemGeo, w.stemBaseCol, w.stemTipCol, (x, _y, z) => {
        const dist = Math.hypot(x, z);
        return dist / Math.max(0.1, reach);
      });
      stemGeos.push(stemGeo);

      const s = w.pinnaScale * fRng.range(0.94, 1.06);
      const upRight = [sideX, 0, sideZ];
      const upLeft = [-sideX, 0, -sideZ];

      // 3-zone lanceolate envelope: narrow base -> lush broad mid plume (30..72%) -> crisp feathered tip!
      const rLow = repeatAlongCurve(pinnaRightGeo, curvePts, {
        count: w.pairsLow,
        up: upRight,
        scale: [0.45 * s, 1.02 * s],
        twist: [rollDeg + 10, rollDeg + 2],
        start: 0.045,
        end: 0.28,
        merge: true,
      });
      const lLow = repeatAlongCurve(pinnaLeftGeo, curvePts, {
        count: w.pairsLow,
        up: upLeft,
        scale: [0.45 * s, 1.02 * s],
        twist: [-rollDeg - 10, -rollDeg - 2],
        start: 0.065,
        end: 0.30,
        merge: true,
      });

      const rMid = repeatAlongCurve(pinnaRightGeo, curvePts, {
        count: w.pairsMid,
        up: upRight,
        scale: [1.02 * s, 0.80 * s],
        twist: [rollDeg + 2, rollDeg - 4],
        start: 0.33,
        end: 0.70,
        merge: true,
      });
      const lMid = repeatAlongCurve(pinnaLeftGeo, curvePts, {
        count: w.pairsMid,
        up: upLeft,
        scale: [1.02 * s, 0.80 * s],
        twist: [-rollDeg - 2, -rollDeg + 4],
        start: 0.35,
        end: 0.72,
        merge: true,
      });

      const rTip = repeatAlongCurve(pinnaRightGeo, curvePts, {
        count: w.pairsTip,
        up: upRight,
        scale: [0.74 * s, 0.22 * s],
        twist: [rollDeg - 4, rollDeg - 12],
        start: 0.75,
        end: 0.96,
        merge: true,
      });
      const lTip = repeatAlongCurve(pinnaLeftGeo, curvePts, {
        count: w.pairsTip,
        up: upLeft,
        scale: [0.74 * s, 0.22 * s],
        twist: [-rollDeg + 4, -rollDeg + 12],
        start: 0.77,
        end: 0.975,
        merge: true,
      });

      const tipBlade = repeatAlongCurve(terminalTipGeo, curvePts, {
        count: 1,
        up: upRight,
        scale: 0.62 * s,
        twist: rollDeg,
        start: 0.985,
        end: 0.995,
        merge: true,
      });

      const frondBatch = [rLow, lLow, rMid, lMid, rTip, lTip, tipBlade];
      for (const fg of frondBatch) {
        tintGeometryGradient(fg, w.baseCol, w.tipCol, (x, y, z) => {
          const rDist = Math.hypot(x, z) / Math.max(0.1, reach);
          const hFrac = y / Math.max(0.2, peakY);
          return 0.65 * rDist + 0.35 * hFrac;
        });
        frondGeos.push(fg);
      }
    }
  }

  const mergedStems = mergeGeometries(stemGeos);
  const mergedFronds = mergeGeometries(frondGeos);

  createPart('FernStems', mergedStems, stemMat, { parent: root });
  const frondsPart = createPart('FernFronds', mergedFronds, frondMat, { parent: root });
  markOpenShell(frondsPart, 'Double-sided sculpted alpha-cutout fern pinna cards');

  return root;
}
