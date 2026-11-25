const meta = {
  name: 'foliage-alocasia',
  role: 'prop',
};

function mergeGeos(geos) {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    totalVerts += pos.count;
    totalIdx += g.index ? g.index.count : pos.count;
  }
  const positions = new Array(totalVerts * 3);
  const normals = new Array(totalVerts * 3);
  const uvs = new Array(totalVerts * 2);
  const indices = new Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const vi = (vOff + i) * 3;
      positions[vi] = pos.getX(i);
      positions[vi + 1] = pos.getY(i);
      positions[vi + 2] = pos.getZ(i);

      let nx = norm ? norm.getX(i) : 0;
      let ny = norm ? norm.getY(i) : 1;
      let nz = norm ? norm.getZ(i) : 0;
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-6) {
        nx /= nl;
        ny /= nl;
        nz /= nl;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }
      normals[vi] = nx;
      normals[vi + 1] = ny;
      normals[vi + 2] = nz;

      const ui = (vOff + i) * 2;
      uvs[ui] = uv ? uv.getX(i) : 0;
      uvs[ui + 1] = uv ? uv.getY(i) : 0;
    }

    if (g.index) {
      const arr = g.index.array;
      for (let i = 0; i < arr.length; i++) {
        indices[iOff++] = arr[i] + vOff;
      }
    } else {
      for (let i = 0; i < count; i++) {
        indices[iOff++] = vOff + i;
      }
    }
    vOff += count;
  }
  return meshGeo({ positions, normals, uvs, indices });
}

// Builds a lush sculptural 3D cupped sagittate/heart-shaped Elephant-Ear Alocasia leaf
// UV.x = 0..1 across width, UV.y = 0.0 at basal ear/petiole end -> 1.0 at acuminate drip-tip!
function buildAlocasiaLeafGeo(attachPos, spec, rng) {
  const segU = 8; // 9 verts across width
  const segV = 9; // 10 verts along length -> 144 tris per leaf
  const cols = segU + 1;
  const rows = segV + 1;

  const len = spec.length;
  const wid = spec.width;
  const az = spec.azimuth;
  const pitch = spec.pitch;
  const roll = spec.roll !== undefined ? spec.roll : rng.range(-0.14, 0.14);
  const cupDepth = spec.cupDepth || 0.080;
  const tipDroop = spec.tipDroop || 0.24;
  const twist = rng.range(-0.07, 0.07);
  const sinusV = 0.235; // UV.y centered squarely on confluence vein node (y=120 px)

  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  // Forward (+X_l) pitched downward, up (+Y_l), right (+Z_l)
  const fx = ca * cp;
  const fy = -sp;
  const fz = sa * cp;
  const u1x = ca * sp;
  const u1y = cp;
  const u1z = sa * sp;
  const r0x = -sa;
  const r0y = 0;
  const r0z = ca;

  const rx = r0x * cr + u1x * sr;
  const ry = r0y * cr + u1y * sr;
  const rz = r0z * cr + u1z * sr;
  const ux = -r0x * sr + u1x * cr;
  const uy = -r0y * sr + u1y * cr;
  const uz = -r0z * sr + u1z * cr;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j < rows; j++) {
    const v = j / segV; // 0.0 (basal elephant ears) -> 1.0 (pointed drip tip)
    const alongFromSinus = v - sinusV;

    const lxBase = alongFromSinus * len;
    // Graceful longitudinal arch: rear ears cup upward & back, blade swells then cascades to drip tip
    const archY =
      alongFromSinus < 0
        ? Math.pow(-alongFromSinus / sinusV, 1.35) * len * 0.105
        : Math.sin(Math.min(1, alongFromSinus / (1 - sinusV)) * Math.PI * 0.62) * len * 0.062 -
          Math.pow(alongFromSinus / (1 - sinusV), 2.08) * len * tipDroop;

    for (let i = 0; i < cols; i++) {
      const u = i / segU;
      const s = u * 2 - 1; // -1..+1
      const absS = Math.abs(s);

      const lzBase = s * (wid * 0.5);

      // Sculptural 3D elephant-ear relief:
      // 1) Bold V-cupped central trough along midrib
      // 2) Plump domed interveinal pillowing + soft wavy scalloped margin undulations
      // 3) Upturned heart-shaped rear elephant ear lobes
      const vCupEnv = Math.sin(Math.min(1, v * 1.12) * Math.PI * 0.86);
      const midribV = absS * cupDepth * (0.46 + 0.68 * vCupEnv);
      const domeWave = Math.sin(absS * Math.PI) * 0.026 * len * vCupEnv;
      const edgeCurl = Math.pow(absS, 2.3) * 0.035 * len * (0.28 + 0.72 * v);
      const ribPhase = (v * 5.2 - absS * 1.45) * Math.PI * 2;
      const ribRipple = Math.sin(ribPhase) * 0.010 * len * Math.sin(absS * Math.PI) * (1 - 0.45 * v);
      const marginRuffle = Math.sin(v * Math.PI * 7.0) * 0.013 * len * Math.pow(absS, 1.8) * (1 - 0.55 * v);
      const rearEarCup = v < 0.34 ? Math.pow(1 - v / 0.34, 1.45) * absS * len * 0.098 : 0;

      const lyBase = archY + midribV + domeWave - edgeCurl + ribRipple + marginRuffle + rearEarCup + s * twist * v * len;

      const wx = attachPos[0] + fx * lxBase + ux * lyBase + rx * lzBase;
      const wy = attachPos[1] + fy * lxBase + uy * lyBase + ry * lzBase;
      const wz = attachPos[2] + fz * lxBase + uz * lyBase + rz * lzBase;

      positions.push(wx, wy, wz);
      uvs.push(u, v);
    }
  }

  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = (j + 1) * cols + i;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  return {
    geo: meshGeo({ positions, uvs, indices }),
    forward: [fx, fy, fz],
    up: [ux, uy, uz],
  };
}

// Smooth organic 48-vertex scalloped sagittate Elephant-Ear Alocasia silhouette mask
// Top-left origin: y=0 basal elephant ears -> y=511 pointed acuminate drip tip
function buildAlocasiaMaskPolygon() {
  const rightHalf = [
    [256, 114], // deep graceful basal heart sinus
    [270, 78],
    [292, 46],
    [322, 24],  // lush rounded elephant-ear lobe crest
    [358, 16],
    [396, 22],
    [432, 42],
    [460, 72],
    [480, 108],
    [488, 134], // smooth undulating lobe 1
    [478, 158], // soft scallop valley 1
    [484, 186], // lobe 2
    [468, 214], // valley 2
    [468, 244], // lobe 3
    [448, 272], // valley 3
    [444, 302], // lobe 4
    [418, 330], // valley 4
    [410, 358], // lobe 5
    [380, 386], // valley 5
    [364, 412], // lobe 6
    [332, 438],
    [302, 462],
    [276, 486],
    [256, 504], // dramatic acuminate drip-tip apex
  ];
  // 24 right verts + 22 mirrored left verts = 46 smooth polygon vertices (<= 64 limit!)
  const pts = rightHalf.slice();
  for (let i = rightHalf.length - 2; i >= 1; i--) {
    pts.push([512 - rightHalf[i][0], rightHalf[i][1]]);
  }
  return pts;
}

// Generates a single continuously curved, organically tapered polygon ribbon along a cubic Bezier vein!
// Eliminates ALL round-cap joint blobs and width step-downs seen with piecewise line segments.
function makeCurvedTaperedVeinPolygon(p0, p1, p2, p3, startHalfW, endHalfW, steps) {
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    samples.push([x, y, t]);
  }
  const leftSide = [];
  const rightSide = [];
  for (let i = 0; i <= steps; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(steps, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const t = samples[i][2];
    const hw = startHalfW * Math.pow(1 - t, 1.15) + endHalfW * (1 - Math.pow(1 - t, 1.15));
    const lx = Math.max(0, Math.min(511, Math.round(samples[i][0] + nx * hw)));
    const ly = Math.max(0, Math.min(511, Math.round(samples[i][1] + ny * hw)));
    const rx = Math.max(0, Math.min(511, Math.round(samples[i][0] - nx * hw)));
    const ry = Math.max(0, Math.min(511, Math.round(samples[i][1] - ny * hw)));
    leftSide.push([lx, ly]);
    rightSide.push([rx, ry]);
  }
  return leftSide.concat(rightSide.reverse());
}

function mirrorPolygonX(pts) {
  return pts.map(([x, y]) => [511 - x, y]);
}

async function buildAlocasiaTextures() {
  const maskPts = buildAlocasiaMaskPolygon();

  // 1. Juicy damp-bank fleshy green petiole stem texture + normal map
  const stemAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'AlocasiaStemAlbedo',
    layers: [
      { op: 'solid', color: 0x45752d },
      { op: 'stripes', colorA: 0x355e21, colorB: 0x61943c, count: 22, angleDeg: 0, blend: 'overlay', opacity: 0.45 },
      { op: 'noise', colorA: 0x2b501b, colorB: 0x6ea044, scale: 12, octaves: 4, seed: 61, blend: 'overlay', opacity: 0.36 },
      // Moist darker olive-moss sheath near ground transitioning smoothly to bright chartreuse-green near leaf sinus
      { op: 'gradient', from: 0x28471a, to: 0x8bc052, angleDeg: 90, blend: 'multiply', opacity: 0.44 },
    ],
  });
  const stemNormal = normalMapFromHeight(stemAlbedo, { strength: 3.5, name: 'AlocasiaStemNormal' });

  // 2. V3 RGBA Cutout Elephant-Ear Alocasia Leaf Albedo (512x512, textureAtlas + mask-rgb-dilate!)
  // Smoothly curved, continuously tapered cubic-Bezier polygon veins (zero overlap dots or sharp elbows!)
  const veinDefs = [
    // Basal elephant-ear ribs sweeping smoothly up & back into rounded ear lobes
    { p0: [256, 118], p1: [298, 92], p2: [342, 56], p3: [388, 38], hw0: 4.4, hw1: 0.9 },
    { p0: [256, 124], p1: [332, 112], p2: [406, 110], p3: [468, 126], hw0: 4.5, hw1: 1.0 },
    // Main gracefully curving lateral ribs arching toward scallops 2..6
    { p0: [256, 168], p1: [336, 162], p2: [408, 168], p3: [466, 186], hw0: 4.2, hw1: 0.9 },
    { p0: [256, 222], p1: [330, 220], p2: [396, 228], p3: [452, 246], hw0: 3.9, hw1: 0.8 },
    { p0: [256, 276], p1: [318, 278], p2: [378, 286], p3: [426, 304], hw0: 3.5, hw1: 0.8 },
    { p0: [256, 332], p1: [306, 336], p2: [352, 344], p3: [392, 360], hw0: 3.1, hw1: 0.7 },
    { p0: [256, 386], p1: [292, 390], p2: [324, 398], p3: [350, 412], hw0: 2.6, hw1: 0.6 },
  ];

  const midribHaloPoly = makeCurvedTaperedVeinPolygon([256, 114], [256, 230], [256, 365], [256, 496], 11.5, 2.5, 6);
  const midribCorePoly = makeCurvedTaperedVeinPolygon([256, 114], [256, 230], [256, 365], [256, 496], 5.4, 1.1, 6);

  // Total V3 ops stays well under 64 limit!
  const leafOps = [
    // Deep rich velvety jade-emerald botanical lamina (#255321 to #3f782d) with natural chlorophyll variation
    {
      op: 'legacy-v2',
      spec: {
        schemaVersion: 2,
        size: 512,
        usage: 'albedo',
        layers: [
          { op: 'solid', color: 0x295b21 },
          { op: 'noise', colorA: 0x1b4416, colorB: 0x417c2c, scale: 7, octaves: 5, seed: 89, blend: 'overlay', opacity: 0.50 },
          { op: 'noise', colorA: 0x204d1b, colorB: 0x4b8935, scale: 3, octaves: 3, seed: 147, blend: 'overlay', opacity: 0.30 },
          { op: 'gradient', from: 0x214e1c, to: 0x498633, angleDeg: 90, blend: 'screen', opacity: 0.20 },
        ],
      },
    },
    // Subtle velvety dark-emerald depth along outer lamina perimeter
    { op: 'paint', shape: { kind: 'ellipse', x: 64, y: 40, width: 384, height: 420 }, rgba: [54, 108, 40, 255], opacity: 38 },

    // Soft sage-green botanical glow along full midrib + lateral ribs (smooth continuous tapered polygons, ZERO blobs!)
    { op: 'paint', shape: { kind: 'polygon', points: midribHaloPoly }, rgba: [86, 138, 48, 255], opacity: 96 },
  ];

  // Add subtle sage-emerald soft vein halos first
  for (const v of veinDefs) {
    const haloR = makeCurvedTaperedVeinPolygon(v.p0, v.p1, v.p2, v.p3, v.hw0 + 4.0, v.hw1 + 1.4, 6);
    leafOps.push({ op: 'paint', shape: { kind: 'polygon', points: haloR }, rgba: [84, 136, 48, 255], opacity: 82 });
    leafOps.push({ op: 'paint', shape: { kind: 'polygon', points: mirrorPolygonX(haloR) }, rgba: [84, 136, 48, 255], opacity: 82 });
  }

  // Crisp pale chartreuse-cream primary lateral ribs cleanly on top
  for (const v of veinDefs) {
    const coreR = makeCurvedTaperedVeinPolygon(v.p0, v.p1, v.p2, v.p3, v.hw0, v.hw1, 6);
    leafOps.push({ op: 'paint', shape: { kind: 'polygon', points: coreR }, rgba: [168, 206, 106, 255], opacity: 242 });
    leafOps.push({ op: 'paint', shape: { kind: 'polygon', points: mirrorPolygonX(coreR) }, rgba: [168, 206, 106, 255], opacity: 242 });
  }

  // Prominent central midrib core & basal sinus confluence cleanly bridging all ribs
  leafOps.push({ op: 'paint', shape: { kind: 'polygon', points: midribCorePoly }, rgba: [184, 218, 120, 255], opacity: 252 });
  leafOps.push({ op: 'paint', shape: { kind: 'ellipse', x: 247, y: 111, width: 18, height: 16 }, rgba: [192, 224, 126, 255], opacity: 255 });

  // Crisp RGBA cutout mask: smooth scalloped sagittate Elephant-Ear silhouette!
  leafOps.push({ op: 'mask', shape: { kind: 'polygon', points: maskPts } });

  const leafAlbedo = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'alocasia_leaf',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 512,
            height: 512,
            usage: 'albedo',
            background: [0, 0, 0, 0],
            operations: leafOps,
          },
        },
      },
    ],
  });

  // 3. Matching Smooth Curved Vein Relief Height Map -> normalMapFromHeight (flipY=false aligned!)
  const heightOps = [
    { op: 'paint', shape: { kind: 'polygon', points: midribHaloPoly }, rgba: [168, 168, 168, 255], opacity: 185 },
  ];
  for (const v of veinDefs) {
    const haloR = makeCurvedTaperedVeinPolygon(v.p0, v.p1, v.p2, v.p3, v.hw0 + 4.5, v.hw1 + 1.8, 6);
    heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: haloR }, rgba: [162, 162, 162, 255], opacity: 160 });
    heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: mirrorPolygonX(haloR) }, rgba: [162, 162, 162, 255], opacity: 160 });
  }
  for (const v of veinDefs) {
    const coreR = makeCurvedTaperedVeinPolygon(v.p0, v.p1, v.p2, v.p3, v.hw0 + 0.6, v.hw1 + 0.3, 6);
    heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: coreR }, rgba: [236, 236, 236, 255], opacity: 250 });
    heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: mirrorPolygonX(coreR) }, rgba: [236, 236, 236, 255], opacity: 250 });
  }
  heightOps.push({ op: 'paint', shape: { kind: 'polygon', points: midribCorePoly }, rgba: [252, 252, 252, 255], opacity: 255 });

  const leafHeight = await textureAtlas({
    schemaVersion: 1,
    width: 512,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'alocasia_leaf_h',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 512,
            height: 512,
            usage: 'albedo',
            background: [104, 104, 104, 255],
            operations: heightOps,
          },
        },
      },
    ],
  });
  const leafNormal = normalMapFromHeight(leafHeight, { strength: 5.5, name: 'AlocasiaLeafNormal' });

  return { stemAlbedo, stemNormal, leafAlbedo, leafNormal };
}

async function build() {
  const root = createRoot('FoliageAlocasia');
  const rng = seededRandom('lagoon-alocasia-v3');
  const stemRng = rng.fork('stems');
  const leafRng = rng.fork('leaves');

  const { stemAlbedo, stemNormal, leafAlbedo, leafNormal } = await buildAlocasiaTextures();

  const stemMat = pbrMaterial({
    albedo: stemAlbedo,
    normal: stemNormal,
    roughness: 0.46,
    metalness: 0,
    name: 'Mat_AlocasiaStems',
  });

  const leafMat = foliageMaterial(leafAlbedo, {
    alphaCutoff: 0.5,
    roughness: 0.45,
    doubleSided: true,
    name: 'Mat_AlocasiaLeaves',
  });
  leafMat.normalMap = leafNormal;
  leafMat.normalScale.set(0.85, 0.85);

  // Lush overlapping Elephant-Ear Alocasia clump: ~2.20 m wide (X) x 1.55 m tall (Y) x 2.00 m deep (Z)
  // 16 stout S-curved fleshy stalks lifting broad cupped elephant-ear leaves (0.46 - 0.72 m long)
  // Including 2 young central heart leaves filling the rosette core + low splayed skirt leaves!
  const clumpSpecs = [
    // Inner young heart shoots (2 smaller upright center leaves closing top-down core gap!)
    { az: 1.12, baseR: 0.02, reach: 0.11, topY: 0.96, len: 0.48, wid: 0.39, pitch: 0.24, cupDepth: 0.068, tipDroop: 0.18, stemBaseR: 0.036, stemTipR: 0.009 },
    { az: 4.28, baseR: 0.02, reach: 0.12, topY: 0.90, len: 0.46, wid: 0.38, pitch: 0.26, cupDepth: 0.066, tipDroop: 0.18, stemBaseR: 0.035, stemTipR: 0.009 },

    // Inner hero crown tier (4 majestic tall elephant ears peaking right around Y ~ 1.50 - 1.54 m!)
    { az: 0.38, baseR: 0.05, reach: 0.29, topY: 1.24, len: 0.72, wid: 0.58, pitch: 0.36, cupDepth: 0.082, tipDroop: 0.23, stemBaseR: 0.050, stemTipR: 0.010 },
    { az: 1.94, baseR: 0.05, reach: 0.27, topY: 1.20, len: 0.70, wid: 0.56, pitch: 0.40, cupDepth: 0.078, tipDroop: 0.22, stemBaseR: 0.049, stemTipR: 0.010 },
    { az: 3.52, baseR: 0.05, reach: 0.31, topY: 1.26, len: 0.72, wid: 0.58, pitch: 0.35, cupDepth: 0.082, tipDroop: 0.23, stemBaseR: 0.050, stemTipR: 0.010 },
    { az: 5.08, baseR: 0.05, reach: 0.27, topY: 1.16, len: 0.68, wid: 0.54, pitch: 0.42, cupDepth: 0.076, tipDroop: 0.21, stemBaseR: 0.048, stemTipR: 0.010 },

    // Mid overlapping rosette tier (5 broad sculptural arching elephant ears at 0.80 - 0.92 m)
    { az: 0.00, baseR: 0.09, reach: 0.47, topY: 0.88, len: 0.69, wid: 0.55, pitch: 0.48, cupDepth: 0.072, tipDroop: 0.22, stemBaseR: 0.046, stemTipR: 0.010 },
    { az: 1.26, baseR: 0.09, reach: 0.43, topY: 0.84, len: 0.65, wid: 0.52, pitch: 0.50, cupDepth: 0.068, tipDroop: 0.21, stemBaseR: 0.045, stemTipR: 0.010 },
    { az: 2.52, baseR: 0.10, reach: 0.46, topY: 0.90, len: 0.67, wid: 0.54, pitch: 0.46, cupDepth: 0.070, tipDroop: 0.22, stemBaseR: 0.046, stemTipR: 0.010 },
    { az: 3.78, baseR: 0.09, reach: 0.43, topY: 0.82, len: 0.65, wid: 0.52, pitch: 0.52, cupDepth: 0.068, tipDroop: 0.21, stemBaseR: 0.044, stemTipR: 0.010 },
    { az: 5.62, baseR: 0.10, reach: 0.45, topY: 0.86, len: 0.67, wid: 0.53, pitch: 0.48, cupDepth: 0.070, tipDroop: 0.22, stemBaseR: 0.045, stemTipR: 0.010 },

    // Low outer damp-bank skirt tier (5 lush splayed leaves cascading to ~2.20 x 2.00 m spread!)
    { az: 0.68, baseR: 0.14, reach: 0.54, topY: 0.54, len: 0.64, wid: 0.52, pitch: 0.56, cupDepth: 0.062, tipDroop: 0.19, stemBaseR: 0.042, stemTipR: 0.009 },
    { az: 1.82, baseR: 0.13, reach: 0.51, topY: 0.49, len: 0.62, wid: 0.50, pitch: 0.58, cupDepth: 0.060, tipDroop: 0.18, stemBaseR: 0.041, stemTipR: 0.009 },
    { az: 3.12, baseR: 0.15, reach: 0.56, topY: 0.52, len: 0.65, wid: 0.53, pitch: 0.54, cupDepth: 0.064, tipDroop: 0.19, stemBaseR: 0.043, stemTipR: 0.009 },
    { az: 4.35, baseR: 0.13, reach: 0.51, topY: 0.47, len: 0.60, wid: 0.48, pitch: 0.58, cupDepth: 0.058, tipDroop: 0.18, stemBaseR: 0.041, stemTipR: 0.009 },
    { az: 5.32, baseR: 0.14, reach: 0.53, topY: 0.50, len: 0.62, wid: 0.50, pitch: 0.56, cupDepth: 0.060, tipDroop: 0.18, stemBaseR: 0.041, stemTipR: 0.009 },
  ];

  const stemGeos = [];
  const leafGeos = [];

  // Compact internal basal rhizome core tucked neatly inside clasping petiole sheaths (no sticking-out cone skirt!)
  const rhizomePts = [
    [0, -0.045, 0],
    [0.005, 0.02, -0.005],
    [0.00, 0.11, 0.00],
  ];
  const rhizome = taperedTube(rhizomePts, [0.13, 0.12, 0.07], { radialSegments: 8, creaseAngle: 180, cap: true });
  stemGeos.push(rhizome);

  for (const s of clumpSpecs) {
    const az = s.az + stemRng.range(-0.07, 0.07);
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const sideX = -sa;
    const sideZ = ca;
    const sway = stemRng.range(-0.035, 0.035);

    // Subtle organic ellipse: ~2.20 m along X by ~2.00 m along Z
    const xScale = 1.04;
    const zScale = 0.94;

    const tip = [
      ca * (s.baseR + s.reach) * xScale + sideX * sway,
      s.topY,
      sa * (s.baseR + s.reach) * zScale + sideZ * sway,
    ];

    // Mount cupped Elephant-Ear blade directly onto petiole apex first so stem follows leaf underside cleanly!
    const builtLeaf = buildAlocasiaLeafGeo(
      tip,
      {
        azimuth: az,
        length: s.len,
        width: s.wid,
        pitch: s.pitch,
        cupDepth: s.cupDepth,
        tipDroop: s.tipDroop,
      },
      leafRng,
    );
    leafGeos.push(builtLeaf.geo);

    // S-curved arching petiole rising from natural staggered rhizome base and flowing smoothly into underside midrib!
    const p0 = [ca * s.baseR * 1.15 * xScale, -0.045, sa * s.baseR * 1.15 * zScale];
    const p1 = [
      ca * (s.baseR + s.reach * 0.26) * xScale + sideX * sway * 0.35,
      s.topY * 0.42,
      sa * (s.baseR + s.reach * 0.26) * zScale + sideZ * sway * 0.35,
    ];
    const p2 = [
      ca * (s.baseR + s.reach * 0.72) * xScale + sideX * sway * 0.75,
      s.topY * 0.90,
      sa * (s.baseR + s.reach * 0.72) * zScale + sideZ * sway * 0.75,
    ];
    // Petiole flows seamlessly forward along underside midrib (never a chopped-off vertical pipe end!)
    const stemJoin = [
      tip[0] + builtLeaf.forward[0] * 0.055 - builtLeaf.up[0] * 0.014,
      tip[1] + builtLeaf.forward[1] * 0.055 - builtLeaf.up[1] * 0.014,
      tip[2] + builtLeaf.forward[2] * 0.055 - builtLeaf.up[2] * 0.014,
    ];

    const stemPath = catmullRomPath([p0, p1, p2, stemJoin], 2);
    const radii = stemPath.map((_, idx) => {
      const k = idx / (stemPath.length - 1);
      // Thick clasping basal sheath tapering cleanly into curved fleshy petiole -> underside midrib
      return s.stemBaseR * Math.pow(1 - k, 1.38) + s.stemTipR * (1 - Math.pow(1 - k, 1.38));
    });
    stemGeos.push(taperedTube(stemPath, radii, { radialSegments: 6, creaseAngle: 180, cap: true }));
  }

  const mergedStemsGeo = mergeGeos(stemGeos);
  createPart('AlocasiaStems', mergedStemsGeo, stemMat, { parent: root });

  const mergedLeavesGeo = mergeGeos(leafGeos);
  const alocasiaLeaves = createPart('AlocasiaLeaves', mergedLeavesGeo, leafMat, { parent: root });
  markOpenShell(alocasiaLeaves, 'Broad sculptural double-sided alpha-cutout Elephant-Ear Alocasia leaves');

  return root;
}
