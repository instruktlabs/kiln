const meta = {
  name: 'foliage-fern-low',
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

/**
 * Computes half-width of the lanceolate tropical fern frond silhouette at t in [0..1]
 * (0 = crown base, 1 = delicate pointed tip).
 */
function frondHalfWidthFrac(t) {
  if (t < 0.06) return 0.0;
  const u = (t - 0.06) / 0.94;
  // Rises smoothly to broad feathery waist at u=0.28..0.62, tapers gracefully to fine tip
  const rise = Math.sin(Math.min(1, u * 3.1) * Math.PI * 0.5);
  const fall = Math.pow(Math.max(0, 1 - Math.pow(u, 1.45)), 0.78);
  return Math.max(0.05, Math.min(1.0, rise * fall * 1.08));
}

/**
 * Builds one compound polygon (<= 56 vertices) covering pinna indices [iStart..iEnd)
 * on one side of the rachis (sideSign = +1 right, -1 left).
 * y=0 is crown base (UV.y = 0), y=H is frond tip (UV.y = 1).
 */
function buildPinnaeGroupPolygon(W, H, totalPinnae, iStart, iEnd, sideSign) {
  const cx = W * 0.5;
  const maxSpan = W * 0.47;
  const yTop = 64;
  const yBot = H - 22;
  const stepY = (yBot - yTop) / totalPinnae;
  const stagger = sideSign > 0 ? 0 : stepY * 0.38;

  const yFirst = Math.max(40, Math.round(yTop + iStart * stepY + stagger));
  const yLast = Math.min(H - 6, Math.round(yTop + iEnd * stepY + stagger));

  const pts = [];
  // Spine anchor at start of group (slight overlap across rachis center for watertight stem contact)
  pts.push([Math.round(cx - sideSign * 3), yFirst]);

  for (let i = iStart; i < iEnd; i++) {
    const t = (i + 0.5) / totalPinnae;
    const wFrac = frondHalfWidthFrac(t);
    const span = Math.max(14, maxSpan * wFrac);
    const yBase = yTop + i * stepY + stagger;
    const pinnaThick = stepY * 0.68;
    const sweepFwd = Math.min(34, span * 0.24); // pinnae angle forward toward frond tip (+Y)

    // 6 vertices per deeply notched pinna:
    // 1. Lower sinus notch near rachis
    const pSinusLo = [Math.round(cx + sideSign * 7), Math.round(yBase + stepY * 0.08)];
    // 2. Lower margin waist
    const pLoMid = [Math.round(cx + sideSign * (span * 0.56)), Math.round(yBase + pinnaThick * 0.12 + sweepFwd * 0.42)];
    // 3. Outer pointed lance tip
    const pTip = [Math.round(cx + sideSign * span), Math.round(Math.min(H - 4, yBase + pinnaThick * 0.48 + sweepFwd))];
    // 4. Upper serrated mid-edge
    const pHiMid = [Math.round(cx + sideSign * (span * 0.62)), Math.round(Math.min(H - 4, yBase + pinnaThick * 0.96 + sweepFwd * 0.52))];
    // 5. Upper basal auricle lobe
    const pHiBase = [Math.round(cx + sideSign * (span * 0.22)), Math.round(Math.min(H - 4, yBase + pinnaThick * 0.98 + sweepFwd * 0.12))];
    // 6. Upper sinus valley returning close to rachis
    const pSinusHi = [Math.round(cx + sideSign * 7), Math.round(Math.min(H - 4, yBase + stepY * 0.96))];

    pts.push(pSinusLo, pLoMid, pTip, pHiMid, pHiBase, pSinusHi);
  }

  // Spine anchor at end of group
  pts.push([Math.round(cx - sideSign * 3), yLast]);

  if (sideSign < 0) pts.reverse();
  return pts;
}

async function buildFullFrondTextures() {
  const W = 512;
  const H = 1024;
  const cx = 256;
  const totalPinnae = 23; // 23 deeply notched pairs = 46 individual pinnae + terminal lance tip!
  const yTop = 64;
  const yBot = H - 22;
  const stepY = (yBot - yTop) / totalPinnae;
  const maxSpan = W * 0.47;

  // 3 groups per side -> 8, 8, 7 pinnae -> max 50 vertices per polygon (<= 64 limit)
  const ranges = [[0, 8], [8, 16], [16, 23]];

  const rachisPoly = [
    [cx - 8, 0], [cx + 8, 0],
    [cx + 6, 280], [cx + 4, 680], [cx + 2, 998],
    [cx, 1018],
    [cx - 2, 998], [cx - 4, 680], [cx - 6, 280],
  ];

  // Crisp pointed terminal tip leaflet at y=976..1020
  const tipPoly = [
    [cx, 972], [cx + 26, 988], [cx + 14, 1006], [cx, 1020],
    [cx - 14, 1006], [cx - 26, 988],
  ];

  const albedoOps = [];
  const heightOps = [];

  // 1. Paint 6 lush deeply-notched pinna silhouette groups (base -> tip tonal richness)
  const groupColors = [
    [88, 148, 48, 255],   // lower mature pinnae
    [104, 166, 56, 255],  // mid sunlit pinnae
    [122, 184, 66, 255],  // upper fresh bright pinnae
  ];
  for (let g = 0; g < ranges.length; g++) {
    const [a, b] = ranges[g];
    const rPoly = buildPinnaeGroupPolygon(W, H, totalPinnae, a, b, 1);
    const lPoly = buildPinnaeGroupPolygon(W, H, totalPinnae, a, b, -1);
    albedoOps.push({ op: 'paint', shape: { kind: 'polygon', points: rPoly }, rgba: groupColors[g] });
    albedoOps.push({ op: 'paint', shape: { kind: 'polygon', points: lPoly }, rgba: groupColors[g] });
    heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: rPoly }, rgba: [134, 134, 134, 255] });
    heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: lPoly }, rgba: [134, 134, 134, 255] });
  }

  // Terminal tip leaflet + central rachis stem (4 ops -> running total 10 ops)
  albedoOps.push({ op: 'paint', shape: { kind: 'polygon', points: tipPoly }, rgba: [132, 192, 72, 255] });
  albedoOps.push({ op: 'paint', shape: { kind: 'polygon', points: rachisPoly }, rgba: [94, 126, 48, 255] });
  albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [cx, 0], to: [cx, 120], width: 12 }, rgba: [76, 86, 40, 255] });
  albedoOps.push({ op: 'paint', shape: { kind: 'line', from: [cx, 100], to: [cx, 1004], width: 4 }, rgba: [158, 206, 94, 235] });

  heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: tipPoly }, rgba: [142, 142, 142, 255] });
  heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: rachisPoly }, rgba: [232, 232, 232, 255] });

  // 2. Crisp radiating pinna midveins (23 pairs = 46 ops -> total 56 ops <= 64 max!)
  for (let i = 0; i < totalPinnae; i++) {
    const t = (i + 0.5) / totalPinnae;
    const wFrac = frondHalfWidthFrac(t);
    const span = Math.max(12, maxSpan * wFrac * 0.88);
    const pinnaThick = stepY * 0.68;
    const sweepFwd = Math.min(34, maxSpan * wFrac * 0.24);

    // Right pinna midvein
    const yr0 = Math.round(yTop + i * stepY + pinnaThick * 0.44);
    const yr1 = Math.round(Math.min(H - 8, yr0 + sweepFwd * 0.92));
    const vw = i < 14 ? 4 : 3;
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx + 4, yr0], to: [Math.round(cx + span), yr1], width: vw },
      rgba: [146, 198, 84, 195],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx + 4, yr0], to: [Math.round(cx + span), yr1], width: vw + 1 },
      rgba: [194, 194, 194, 255],
    });

    // Left pinna midvein (staggered)
    const yl0 = Math.round(yTop + i * stepY + stepY * 0.38 + pinnaThick * 0.44);
    const yl1 = Math.round(Math.min(H - 8, yl0 + sweepFwd * 0.92));
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx - 4, yl0], to: [Math.round(cx - span), yl1], width: vw },
      rgba: [146, 198, 84, 195],
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx - 4, yl0], to: [Math.round(cx - span), yl1], width: vw + 1 },
      rgba: [194, 194, 194, 255],
    });
  }

  const albedo = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'frond',
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

  const heightAtlas = await textureAtlas({
    schemaVersion: 1,
    width: W,
    height: H,
    usage: 'albedo',
    regions: [{
      name: 'frond-h',
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
          background: [108, 108, 108, 255],
          operations: heightOps,
        },
      },
    }],
  });

  const normal = normalMapFromHeight(heightAtlas, { strength: 5.5, name: 'FernLowNormal' });
  normal.flipY = false;
  return { albedo, normal };
}

/**
 * Builds ONE sculpted 3D curved V-folded arched frond ribbon (14x4 grid = 112 triangles).
 * UV.y runs strictly 0.0 at crown base -> 1.0 at frond tip for Holodeck foliage wind sway!
 */
function buildSculptedFrondRibbon(opts) {
  const {
    az, reach, peakY, tipY, maxHalfWidth,
    baseR, baseY, swayLat, twistDeg, vFoldDepth, archBillow,
    baseColorHex, tipColorHex,
  } = opts;

  const rows = 14;
  const cols = 4; // u = 0, 0.25, 0.5, 0.75, 1.0 -> crisp V-fold + convex billowing pinna halves!

  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const sideX = -sa;
  const sideZ = ca;

  const p0 = [ca * baseR, baseY, sa * baseR];
  const p1 = [
    ca * (baseR + reach * 0.28) + sideX * swayLat * 0.3,
    peakY * 0.90,
    sa * (baseR + reach * 0.28) + sideZ * swayLat * 0.3,
  ];
  const p2 = [
    ca * (baseR + reach * 0.74) + sideX * swayLat * 0.85,
    peakY * 1.12,
    sa * (baseR + reach * 0.74) + sideZ * swayLat * 0.85,
  ];
  const p3 = [
    ca * (baseR + reach) + sideX * swayLat,
    tipY,
    sa * (baseR + reach) + sideZ * swayLat,
  ];

  const spine = bezierCurve([p0, p1, p2, p3], rows);
  const c0 = hexToLinearRgb(baseColorHex);
  const c1 = hexToLinearRgb(tipColorHex);

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // STRICT 0.0 at base -> 1.0 at tip!
    const pt = spine[r];
    const pPrev = spine[Math.max(0, r - 1)];
    const pNext = spine[Math.min(rows, r + 1)];

    // Tangent along spine
    let tx = pNext[0] - pPrev[0];
    let ty = pNext[1] - pPrev[1];
    let tz = pNext[2] - pPrev[2];
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;

    // Right vector perpendicular to tangent and world-ish up, with subtle organic lengthwise twist
    const roll = (twistDeg * Math.PI / 180) * v;
    let rx = sideX;
    let ry = 0;
    let rz = sideZ;
    // Orthogonalize right vector to tangent
    const dotRT = rx * tx + ry * ty + rz * tz;
    rx -= dotRT * tx; ry -= dotRT * ty; rz -= dotRT * tz;
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen; ry /= rLen; rz /= rLen;

    // Local "up" normal of frond = right x tangent (pointing skyward)
    let ux = ry * tz - rz * ty;
    let uy = rz * tx - rx * tz;
    let uz = rx * ty - ry * tx;
    if (uy < 0) { ux = -ux; uy = -uy; uz = -uz; }

    // Apply subtle organic roll around tangent
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const rrx = rx * cr + ux * sr;
    const rry = ry * cr + uy * sr;
    const rrz = rz * cr + uz * sr;
    const uux = ux * cr - rx * sr;
    const uuy = uy * cr - ry * sr;
    const uuz = uz * cr - rz * sr;

    // Ribbon width stays generous so the V3 pinnate texture never clips its pinna tips,
    // tapering slightly at the very base and tip for minimal transparent overdraw
    const widthEnv = 0.72 + 0.28 * Math.sin(Math.min(1, v * 1.15 + 0.1) * Math.PI);
    const halfW = maxHalfWidth * widthEnv;

    // Smooth base-to-tip botanical color ramp
    const colT = Math.pow(v, 0.85);
    const vr = c0[0] + (c1[0] - c0[0]) * colT;
    const vg = c0[1] + (c1[1] - c0[1]) * colT;
    const vb = c0[2] + (c1[2] - c0[2]) * colT;

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const s = (u - 0.5) * 2; // -1, -0.5, 0, +0.5, +1
      const absS = Math.abs(s);

      // 3D cross-section: V-folded rachis trough at center (s=0), convex upward billow at |s|=0.5, gently relaxed tip margin at |s|=1
      const crossLift = (vFoldDepth * absS + archBillow * Math.sin(absS * Math.PI)) * (0.35 + 0.65 * Math.sin(v * Math.PI));
      const lat = s * halfW;

      const px = pt[0] + rrx * lat + uux * crossLift;
      const py = Math.max(0.002, pt[1] + rry * lat + uuy * crossLift);
      const pz = pt[2] + rrz * lat + uuz * crossLift;

      positions.push(px, py, pz);
      uvs.push(u, v);
      colors.push(vr, vg, vb);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      indices.push(a, d, e, a, e, b);
    }
  }

  const geo = meshGeo({ positions, uvs, indices });
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  return geo;
}

async function build() {
  const root = createRoot('foliage-fern-low');
  const rng = seededRandom('lagoon-fern-low-v1');

  const { albedo, normal } = await buildFullFrondTextures();

  const frondMat = pbrMaterial({
    albedo,
    normal,
    roughness: 0.56,
    metalness: 0.0,
    alphaMode: 'mask',
    alphaCutoff: 0.45,
    doubleSided: true,
    name: 'Mat_FernLowFronds',
  });
  frondMat.vertexColors = true;

  // 13 sculpted 3D arched V-folded frond ribbons in 3 whorls -> ~1,456 tris, 1 material, 1 draw slot!
  // Target dimensions: ~1.25 m diameter (radius ~0.625 m) x ~0.68 m tall, base at Y=0.00m
  const whorls = [
    // Outer low sweeping fronds (5)
    {
      count: 5,
      azOffset: 0.0,
      reachMin: 0.56, reachMax: 0.63,
      peakYMin: 0.30, peakYMax: 0.39,
      tipYMin: 0.05, tipYMax: 0.14,
      halfWMin: 0.145, halfWMax: 0.172,
      baseR: 0.028, baseY: 0.004,
      baseCol: 0x8ea680, tipCol: 0xc2d8aa,
    },
    // Middle full arching fronds (5)
    {
      count: 5,
      azOffset: Math.PI / 5,
      reachMin: 0.43, reachMax: 0.52,
      peakYMin: 0.48, peakYMax: 0.58,
      tipYMin: 0.28, tipYMax: 0.40,
      halfWMin: 0.132, halfWMax: 0.155,
      baseR: 0.020, baseY: 0.016,
      baseCol: 0xa4be92, tipCol: 0xdcf0ba,
    },
    // Inner upright sunlit young fronds (3)
    {
      count: 3,
      azOffset: Math.PI / 7,
      reachMin: 0.23, reachMax: 0.31,
      peakYMin: 0.61, peakYMax: 0.68,
      tipYMin: 0.55, tipYMax: 0.65,
      halfWMin: 0.105, halfWMax: 0.125,
      baseR: 0.010, baseY: 0.026,
      baseCol: 0xc2da9c, tipCol: 0xf6ffd4,
    },
  ];

  const fRng = rng.fork('fronds');
  const frondGeos = [];
  for (let wIdx = 0; wIdx < whorls.length; wIdx++) {
    const w = whorls[wIdx];
    for (let i = 0; i < w.count; i++) {
      const az = w.azOffset + (i / w.count) * Math.PI * 2 + fRng.range(-0.18, 0.18);
      const reach = fRng.range(w.reachMin, w.reachMax);
      const peakY = fRng.range(w.peakYMin, w.peakYMax);
      const tipY = fRng.range(w.tipYMin, w.tipYMax);
      const maxHalfWidth = fRng.range(w.halfWMin, w.halfWMax);
      const swayLat = fRng.range(-0.06, 0.06) * reach;
      const twistDeg = fRng.range(-14, 14);

      frondGeos.push(buildSculptedFrondRibbon({
        az,
        reach,
        peakY,
        tipY,
        maxHalfWidth,
        baseR: w.baseR,
        baseY: w.baseY + i * 0.002, // tiny vertical stagger at crown -> zero flush faces
        swayLat,
        twistDeg,
        vFoldDepth: 0.026,
        archBillow: 0.018,
        baseColorHex: w.baseCol,
        tipColorHex: w.tipCol,
      }));
    }
  }

  const mergedFronds = mergeGeometries(frondGeos);
  const frondsPart = createPart('FernFronds', mergedFronds, frondMat, { parent: root });
  markOpenShell(frondsPart, 'Double-sided sculpted V-folded pinnate fern frond ribbons');

  return root;
}
