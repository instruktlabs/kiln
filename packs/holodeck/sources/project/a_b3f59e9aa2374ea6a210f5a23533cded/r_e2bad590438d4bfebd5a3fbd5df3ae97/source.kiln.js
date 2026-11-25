const meta = {
  name: 'foliage-monstera-b',
  role: 'prop',
};

function mergeGeos(geos) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (uv) {
        uvs.push(uv.getX(i), uv.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }

    const idx = g.getIndex();
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

function makePhilodendronOutline(w, h, opts) {
  const cx = w * 0.5;
  const sinusY = opts.sinusY;
  const tipY = opts.tipY;
  const lobeTopY = opts.lobeTopY;
  const maxHalfW = opts.maxHalfW;
  const shoulderY = opts.shoulderY;
  const taperExp = opts.taperExp;
  const asym = opts.asym || 0;
  const pts = [];

  pts.push([Math.round(cx), Math.round(sinusY)]);

  // Right swept-back hastate/cordate basal lobe (distinct from Monstera A's rounder heart ears!)
  const rightEar = [
    [cx + maxHalfW * 0.16, sinusY - 26],
    [cx + maxHalfW * 0.36, lobeTopY + 10],
    [cx + maxHalfW * 0.60, lobeTopY],
    [cx + maxHalfW * 0.84, lobeTopY + 20],
    [cx + maxHalfW * 0.98, lobeTopY + 56],
    [cx + maxHalfW * 1.00, shoulderY],
  ];
  for (const [x, y] of rightEar) pts.push([Math.round(x), Math.round(y)]);

  const sideSteps = 10;
  for (let i = 1; i <= sideSteps; i++) {
    const t = i / sideSteps;
    const y = shoulderY + t * (tipY - shoulderY);
    const widthFactor = Math.pow(Math.cos(t * Math.PI * 0.5), taperExp) * (1 + 0.08 * Math.sin(t * Math.PI));
    const x = cx + (maxHalfW * (1 + asym * 0.05)) * Math.max(0.015, widthFactor);
    pts.push([Math.round(x), Math.round(y)]);
  }

  pts.push([Math.round(cx), Math.round(tipY)]);

  for (let i = sideSteps; i >= 1; i--) {
    const t = i / sideSteps;
    const y = shoulderY + t * (tipY - shoulderY);
    const widthFactor = Math.pow(Math.cos(t * Math.PI * 0.5), taperExp) * (1 + 0.08 * Math.sin(t * Math.PI));
    const x = cx - (maxHalfW * (1 - asym * 0.05)) * Math.max(0.015, widthFactor);
    pts.push([Math.round(x), Math.round(y)]);
  }

  const leftEar = [
    [cx - maxHalfW * 1.00, shoulderY],
    [cx - maxHalfW * 0.98, lobeTopY + 56],
    [cx - maxHalfW * 0.84, lobeTopY + 20],
    [cx - maxHalfW * 0.60, lobeTopY],
    [cx - maxHalfW * 0.36, lobeTopY + 10],
    [cx - maxHalfW * 0.16, sinusY - 26],
  ];
  for (const [x, y] of leftEar) pts.push([Math.round(x), Math.round(y)]);

  return pts;
}

function buildSplitLeafColumnSpecs(kind) {
  const S = 512;
  const cx = 256;
  const isYoung = kind === 'young';

  // Mature split philodendron / narrow-lobed Monstera vs fresh young emerald unfurling leaf
  const outlineOpts = isYoung
    ? { sinusY: 74, lobeTopY: 28, shoulderY: 132, tipY: 492, maxHalfW: 194, taperExp: 0.92, asym: -0.35 }
    : { sinusY: 82, lobeTopY: 16, shoulderY: 122, tipY: 498, maxHalfW: 230, taperExp: 0.84, asym: 0.35 };

  const outlinePts = makePhilodendronOutline(S, S, outlineOpts);

  // Veins: young leaf has brighter chartreuse veins & gentler sweep; mature has deeper split-philodendron fingers
  const veins = isYoung ? [
    // Right (3 main pairs + subtle tip ribs)
    { y0: 112, xm: 344, ym: 92,  x2: 416, y2: 108, w: 5 },
    { y0: 198, xm: 350, ym: 198, x2: 422, y2: 232, w: 5 },
    { y0: 294, xm: 334, ym: 306, x2: 386, y2: 348, w: 4 },
    { y0: 380, xm: 308, ym: 394, x2: 336, y2: 424, w: 3 },
    // Left
    { y0: 106, xm: 168, ym: 88,  x2: 96,  y2: 104, w: 5 },
    { y0: 188, xm: 162, ym: 188, x2: 90,  y2: 222, w: 5 },
    { y0: 282, xm: 176, ym: 294, x2: 122, y2: 336, w: 4 },
    { y0: 372, xm: 204, ym: 386, x2: 176, y2: 418, w: 3 },
  ] : [
    // Mature split philodendron: 5 sweeping finger veins per side!
    { y0: 100, xm: 356, ym: 68,  x2: 448, y2: 64,  w: 6 },
    { y0: 158, xm: 372, ym: 146, x2: 474, y2: 158, w: 5 },
    { y0: 228, xm: 368, ym: 228, x2: 458, y2: 256, w: 5 },
    { y0: 302, xm: 350, ym: 310, x2: 420, y2: 346, w: 4 },
    { y0: 374, xm: 326, ym: 386, x2: 368, y2: 418, w: 4 },
    // Left
    { y0: 106, xm: 154, ym: 74,  x2: 64,  y2: 72,  w: 6 },
    { y0: 170, xm: 140, ym: 158, x2: 40,  y2: 172, w: 5 },
    { y0: 244, xm: 144, ym: 246, x2: 56,  y2: 276, w: 5 },
    { y0: 318, xm: 164, ym: 328, x2: 94,  y2: 364, w: 4 },
    { y0: 388, xm: 188, ym: 400, x2: 146, y2: 430, w: 4 },
  ];

  // Splits: young leaf has only 2-3 youthful asymmetric clefts (mostly whole glossy heart!),
  // mature has 5 dramatic deep philodendron/monstera finger splits!
  const slits = isYoung ? [
    // Young unfurling emerald leaf: 2 right + 2 left graceful clefts
    { from: [314, 154], to: [518, 166], w: 22 },
    { from: [306, 252], to: [498, 294], w: 20 },
    { from: [204, 146], to: [-8,  156], w: 20 },
    { from: [212, 240], to: [8,   282], w: 19 },
  ] : [
    // Mature deeply-lobed split philodendron (5 right + 5 left sweeping narrow-finger clefts)
    { from: [306, 122], to: [524, 110], w: 24 },
    { from: [292, 192], to: [524, 206], w: 28 },
    { from: [288, 266], to: [512, 302], w: 26 },
    { from: [286, 340], to: [478, 384], w: 22 },
    { from: [284, 408], to: [426, 448], w: 16 },
    // Left
    { from: [204, 134], to: [-12, 124], w: 25 },
    { from: [216, 206], to: [-12, 224], w: 28 },
    { from: [218, 282], to: [2,   320], w: 25 },
    { from: [222, 354], to: [38,  398], w: 21 },
    { from: [228, 418], to: [90,  456], w: 15 },
  ];

  const holes = isYoung ? [] : [
    { kind: 'ellipse', x: 270, y: 164, width: 20, height: 11 },
  ];

  // ---- ALBEDO V3 SPEC ----
  const albedoOps = [];
  albedoOps.push({
    op: 'legacy-v2',
    spec: {
      schemaVersion: 2,
      size: S,
      usage: 'albedo',
      layers: isYoung ? [
        // Vibrant healthy young emerald-chartreuse leaf (never neon!)
        { op: 'solid', color: 0x376d29 },
        { op: 'gradient', from: 0x2a5a21, to: 0x4b8336, angleDeg: 90, blend: 'normal', opacity: 0.56 },
        { op: 'noise', colorA: 0x2a571f, colorB: 0x568d3c, scale: 6, octaves: 2, seed: 503, blend: 'overlay', opacity: 0.42 },
      ] : [
        // Deep lush mature rainforest emerald
        { op: 'solid', color: 0x25501e },
        { op: 'gradient', from: 0x1b3f16, to: 0x366628, angleDeg: 90, blend: 'normal', opacity: 0.52 },
        { op: 'noise', colorA: 0x193a14, colorB: 0x41742f, scale: 6, octaves: 2, seed: 607, blend: 'overlay', opacity: 0.46 },
      ],
    },
  });

  albedoOps.push({
    op: 'stamps',
    shape: { kind: 'ellipse', x: 0, y: 0, width: 78, height: 44 },
    rgba: isYoung ? [90, 146, 58, 255] : [60, 110, 44, 255],
    opacity: 34,
    count: 6,
    seed: isYoung ? 7103 : 8209,
    area: { x: 46, y: 40, width: 380, height: 400 },
  });

  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 74], to: [cx, 480], width: 18 },
    rgba: isYoung ? [36, 76, 28, 255] : [20, 48, 16, 255],
    opacity: 82,
  });

  const veinInner = isYoung ? [116, 168, 72, 255] : [82, 128, 52, 255];
  const veinOuter = isYoung ? [98, 148, 62, 255] : [70, 114, 46, 255];
  for (const v of veins) {
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx, v.y0], to: [v.xm, v.ym], width: v.w },
      rgba: veinInner,
      opacity: 145,
    });
    albedoOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [v.xm, v.ym], to: [v.x2, v.y2], width: Math.max(2, v.w - 2) },
      rgba: veinOuter,
      opacity: 100,
    });
  }

  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 72], to: [cx, 256], width: 9 },
    rgba: isYoung ? [126, 178, 76, 255] : [96, 142, 58, 255],
    opacity: 210,
  });
  albedoOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 252], to: [cx, 484], width: 5 },
    rgba: isYoung ? [112, 162, 68, 255] : [84, 128, 52, 255],
    opacity: 175,
  });

  albedoOps.push({
    op: 'mask',
    shape: { kind: 'polygon', points: outlinePts },
    invert: false,
  });

  for (const s of slits) {
    albedoOps.push({
      op: 'mask',
      shape: { kind: 'line', from: s.from, to: s.to, width: s.w },
      invert: true,
    });
  }

  for (const hShape of holes) {
    albedoOps.push({
      op: 'mask',
      shape: hShape,
      invert: true,
    });
  }

  // ---- DEDICATED HEIGHT V3 SPEC ----
  const heightOps = [];
  heightOps.push({
    op: 'legacy-v2',
    spec: {
      schemaVersion: 2,
      size: S,
      usage: 'albedo',
      layers: [
        { op: 'solid', color: 0x808080 },
        { op: 'noise', colorA: 0x6c6c6c, colorB: 0x969696, scale: 6, octaves: 3, seed: isYoung ? 1103 : 1217, blend: 'normal', opacity: 0.44 },
      ],
    },
  });
  heightOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 74], to: [cx, 380], width: 14 },
    rgba: [104, 104, 104, 255],
    opacity: 115,
  });
  for (const v of veins) {
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [cx, v.y0], to: [v.xm, v.ym], width: v.w + 1 },
      rgba: [184, 184, 184, 255],
      opacity: 165,
    });
    heightOps.push({
      op: 'paint',
      shape: { kind: 'line', from: [v.xm, v.ym], to: [v.x2, v.y2], width: Math.max(2, v.w - 2) },
      rgba: [162, 162, 162, 255],
      opacity: 130,
    });
  }
  heightOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 72], to: [cx, 260], width: 9 },
    rgba: [212, 212, 212, 255],
    opacity: 205,
  });
  heightOps.push({
    op: 'paint',
    shape: { kind: 'line', from: [cx, 256], to: [cx, 456], width: 4 },
    rgba: [182, 182, 182, 255],
    opacity: 160,
  });

  return {
    albedoSpec: {
      schemaVersion: 3,
      width: S,
      height: S,
      usage: 'albedo',
      background: [0, 0, 0, 0],
      operations: albedoOps,
    },
    heightSpec: {
      schemaVersion: 3,
      width: S,
      height: S,
      usage: 'albedo',
      background: [128, 128, 128, 255],
      operations: heightOps,
    },
  };
}

function buildSculptedBlade(opts) {
  const {
    length,
    width,
    uSegs = 8,
    vSegs = 11,
    baseLift = 0.14,
    droop = 1.05,
    cupAmt = 0.12,
    edgeRoll = 0.085,
    waveAmt = 0.026,
    wavePhase = 0,
    sinusV = 0.155,
    twistTip = 0,
  } = opts;

  const dv = 1 / vSegs;
  const cxArr = new Array(vSegs + 1).fill(0);
  const cyArr = new Array(vSegs + 1).fill(0);
  const pitchArr = new Array(vSegs + 1).fill(0);

  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    pitchArr[j] = baseLift - droop * Math.pow(v, 1.45);
  }
  for (let j = 1; j <= vSegs; j++) {
    const pMid = 0.5 * (pitchArr[j - 1] + pitchArr[j]);
    cxArr[j] = cxArr[j - 1] + Math.cos(pMid) * (length * dv);
    cyArr[j] = cyArr[j - 1] + Math.sin(pMid) * (length * dv);
  }

  const sinusIdxF = sinusV * vSegs;
  const s0 = Math.floor(sinusIdxF);
  const s1 = Math.min(vSegs, s0 + 1);
  const sf = sinusIdxF - s0;
  const ox = cxArr[s0] + (cxArr[s1] - cxArr[s0]) * sf;
  const oy = cyArr[s0] + (cyArr[s1] - cyArr[s0]) * sf;
  for (let j = 0; j <= vSegs; j++) {
    cxArr[j] -= ox;
    cyArr[j] -= oy;
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    const pitch = pitchArr[j];
    const upX = -Math.sin(pitch);
    const upY = Math.cos(pitch);
    const twist = twistTip * v * v;
    const ct = Math.cos(twist);
    const st = Math.sin(twist);
    const envV = Math.sin(Math.min(1, v) * Math.PI);
    const earLift = v < 0.22 ? Math.pow((0.22 - v) / 0.22, 1.6) * 0.03 * length : 0;

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const uc = u * 2 - 1;
      const absU = Math.abs(uc);

      const cup = cupAmt * length * Math.pow(absU, 1.35) * (0.28 + 0.72 * envV);
      const roll = -edgeRoll * length * Math.pow(absU, 3.2) * (0.20 + 0.80 * envV);
      const wave = waveAmt * length * Math.sin(v * Math.PI * 3.6 + wavePhase + (uc >= 0 ? 0.5 : -0.25)) * (uc * uc);
      const localH = cup + roll + wave + earLift * (0.3 + 0.7 * absU);
      const localZ = uc * (width * 0.5) * (1 - 0.07 * absU * absU);

      const rz = localZ * ct - localH * st;
      const rh = localZ * st + localH * ct;
      positions.push(cxArr[j] + upX * rh, cyArr[j] + upY * rh, rz);
      uvs.push(u, v);
    }
  }

  const row = uSegs + 1;
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = (j + 1) * row + i;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = meshGeo({ positions, uvs, indices });
  geo.computeVertexNormals();
  return {
    geo,
    ribPoints: [0.18, 0.27, 0.36].map((tv) => {
      const idxF = tv * vSegs;
      const k0 = Math.floor(idxF);
      const k1 = Math.min(vSegs, k0 + 1);
      const kf = idxF - k0;
      const rx = cxArr[k0] + (cxArr[k1] - cxArr[k0]) * kf;
      const ry = cyArr[k0] + (cyArr[k1] - cyArr[k0]) * kf;
      const rp = pitchArr[k0] + (pitchArr[k1] - pitchArr[k0]) * kf;
      return [rx + Math.sin(rp) * 0.0065, ry - Math.cos(rp) * 0.0065, 0];
    }),
  };
}

function transformGeo(geo, pos, yawRad, pitchRad, rollRad) {
  const g = copyGeometry(geo);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rollRad, yawRad, pitchRad, 'YXZ'));
  m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function transformPoint(pt, pos, yawRad, pitchRad, rollRad) {
  const v = new THREE.Vector3(pt[0], pt[1], pt[2]);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rollRad, yawRad, pitchRad, 'YXZ'));
  v.applyQuaternion(q).add(new THREE.Vector3(pos[0], pos[1], pos[2]));
  return [v.x, v.y, v.z];
}

async function build() {
  const root = createRoot('MonsteraSpreadingB');
  const rng = seededRandom('lagoon-monstera-b-v1');

  const colMature = buildSplitLeafColumnSpecs('mature');
  const colYoung = buildSplitLeafColumnSpecs('young');

  const leafAtlas = await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'leaf_split',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colMature.albedoSpec },
      },
      {
        name: 'leaf_young',
        content: { x: 512, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: colYoung.albedoSpec },
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
        name: 'leaf_split',
        content: { x: 0, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: colMature.heightSpec },
      },
      {
        name: 'leaf_young',
        content: { x: 512, y: 0, width: 512, height: 512 },
        gutter: 0,
        edgeMode: 'copy-edge',
        source: { kind: 'procedural', spec: colYoung.heightSpec },
      },
    ],
  });

  const leafNormal = normalMapFromHeight(heightAtlas, { strength: 3.8, name: 'MonsteraBLeafNormal' });

  const leafMat = pbrMaterial({
    albedo: leafAtlas,
    normal: leafNormal,
    roughness: 0.43,
    metalness: 0,
    alphaMode: 'mask',
    alphaCutoff: 0.5,
    doubleSided: true,
    name: 'MonsteraBLeaves',
  });

  const stemAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'MonsteraBStemAlbedo',
    layers: [
      { op: 'solid', color: 0x355c25 },
      { op: 'stripes', colorA: 0x2c4f1e, colorB: 0x45702f, count: 16, angleDeg: 0, blend: 'overlay', opacity: 0.30 },
      { op: 'noise', colorA: 0x28471b, colorB: 0x4a7532, scale: 10, octaves: 4, seed: 89, blend: 'overlay', opacity: 0.34 },
    ],
  });
  const stemNormal = normalMapFromHeight(stemAlbedo, { strength: 3.0, name: 'MonsteraBStemNormal' });
  const stemMat = pbrMaterial({
    albedo: stemAlbedo,
    normal: stemNormal,
    roughness: 0.64,
    metalness: 0,
    name: 'MonsteraBStems',
  });

  // 12 asymmetrical, lower, wider-spreading split leaves + vibrant young emerald inner shoots
  // Target bounds: ~1.35 m wide x 0.95 m tall x 1.25 m deep, root collar to Y = -0.095 m
  const specs = [
    // Inner fresh young unfurling emerald leaves (3 cupped upright-arching new shoots!)
    { azDeg: 45,  reach: 0.14, tipY: 0.72, len: 0.36, wid: 0.28, pitchDeg: -8,  rollDeg: 8,  droop: 0.86, cup: 0.18, col: 'leaf_young' },
    { azDeg: 190, reach: 0.16, tipY: 0.79, len: 0.40, wid: 0.31, pitchDeg: -12, rollDeg: -6, droop: 0.92, cup: 0.16, col: 'leaf_young' },
    { azDeg: 300, reach: 0.19, tipY: 0.65, len: 0.34, wid: 0.26, pitchDeg: -14, rollDeg: 5,  droop: 0.90, cup: 0.17, col: 'leaf_young' },

    // Mid sweeping asymmetrical crown (4 wide-reaching split philodendron leaves)
    { azDeg: 88,  reach: 0.36, tipY: 0.75, len: 0.47, wid: 0.40, pitchDeg: -22, rollDeg: -7, droop: 1.12, cup: 0.11, col: 'leaf_split' },
    { azDeg: 158, reach: 0.39, tipY: 0.67, len: 0.46, wid: 0.39, pitchDeg: -26, rollDeg: 8,  droop: 1.16, cup: 0.11, col: 'leaf_split' },
    { azDeg: 244, reach: 0.38, tipY: 0.70, len: 0.48, wid: 0.41, pitchDeg: -24, rollDeg: -8, droop: 1.14, cup: 0.11, col: 'leaf_split' },
    { azDeg: 356, reach: 0.41, tipY: 0.63, len: 0.46, wid: 0.38, pitchDeg: -28, rollDeg: 6,  droop: 1.18, cup: 0.11, col: 'leaf_split' },

    // Low wide bank-hugging skirt (5 sprawling outward leaves, asymmetrical reach)
    { azDeg: 18,  reach: 0.45, tipY: 0.38, len: 0.43, wid: 0.36, pitchDeg: -32, rollDeg: -6, droop: 1.15, cup: 0.10, col: 'leaf_split' },
    { azDeg: 112, reach: 0.42, tipY: 0.34, len: 0.43, wid: 0.37, pitchDeg: -34, rollDeg: 7,  droop: 1.16, cup: 0.10, col: 'leaf_split' },
    { azDeg: 192, reach: 0.44, tipY: 0.36, len: 0.42, wid: 0.35, pitchDeg: -34, rollDeg: -7, droop: 1.14, cup: 0.10, col: 'leaf_split' },
    { azDeg: 282, reach: 0.43, tipY: 0.40, len: 0.44, wid: 0.38, pitchDeg: -30, rollDeg: 8,  droop: 1.18, cup: 0.10, col: 'leaf_split' },
    { azDeg: 326, reach: 0.36, tipY: 0.32, len: 0.37, wid: 0.30, pitchDeg: -36, rollDeg: -5, droop: 1.10, cup: 0.12, col: 'leaf_young' },
  ];

  const stemGeos = [];
  const leafGeos = [];

  // Slightly angled creeping rhizome crown (natural bank/crevice habit!)
  const collarPath = [
    [-0.02, -0.095, -0.01],
    [0.00,  -0.04,   0.005],
    [0.015,  0.01,   0.012],
    [0.01,   0.05,   0.005],
  ];
  stemGeos.push(taperedTube(collarPath, [0.044, 0.048, 0.040, 0.028], { radialSegments: 8, creaseAngle: 180, cap: true }));

  for (let idx = 0; idx < specs.length; idx++) {
    const s = specs[idx];
    const f = rng.fork(`b-leaf-${idx}`);
    const az = (s.azDeg + f.range(-6, 6)) * (Math.PI / 180);
    const dirX = Math.cos(az);
    const dirZ = Math.sin(az);
    const perpX = -dirZ;
    const perpZ = dirX;
    const sideBend = f.range(-0.04, 0.04);

    const baseR = f.range(0.015, 0.055);
    const baseY = -0.090 + f.range(0, 0.025);
    const p0 = [dirX * baseR, baseY, dirZ * baseR];
    const p1 = [dirX * (baseR + s.reach * 0.25) + perpX * sideBend * 0.5, s.tipY * 0.38, dirZ * (baseR + s.reach * 0.25) + perpZ * sideBend * 0.5];
    const p2 = [dirX * (s.reach * 0.70) + perpX * sideBend, s.tipY * 0.85, dirZ * (s.reach * 0.70) + perpZ * sideBend];
    const tipPos = [dirX * s.reach, s.tipY, dirZ * s.reach];

    const yawRad = -az + f.range(-0.10, 0.10);
    const pitchRad = (s.pitchDeg + f.range(-3, 3)) * (Math.PI / 180);
    const rollRad = (s.rollDeg + f.range(-4, 4)) * (Math.PI / 180);

    const { geo: localBlade, ribPoints } = buildSculptedBlade({
      length: s.len,
      width: s.wid,
      uSegs: 8,
      vSegs: 11,
      baseLift: 0.14 + f.range(-0.04, 0.05),
      droop: s.droop + f.range(-0.07, 0.07),
      cupAmt: s.cup + f.range(-0.015, 0.02),
      edgeRoll: 0.085 + f.range(-0.01, 0.015),
      waveAmt: 0.026 + f.range(-0.006, 0.008),
      wavePhase: f.range(0, Math.PI * 2),
      twistTip: f.range(-0.14, 0.14),
    });

    const remappedBlade = remapUVToAtlas(localBlade, leafAtlas, s.col, {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });
    leafGeos.push(transformGeo(remappedBlade, tipPos, yawRad, pitchRad, rollRad));

    const worldSinusUnder = transformPoint([-0.008, -0.010, 0], tipPos, yawRad, pitchRad, rollRad);
    const worldRibPts = ribPoints.map((pt) => transformPoint(pt, tipPos, yawRad, pitchRad, rollRad));
    const fullStemCtrl = [p0, p1, p2, worldSinusUnder, worldRibPts[0], worldRibPts[2]];
    const stemPath = catmullRomPath(fullStemCtrl, 3);
    const nPts = stemPath.length;
    const baseRadius = 0.012 + (s.len - 0.34) * 0.016;
    const radii = stemPath.map((_, k) => {
      const t = k / (nPts - 1);
      if (t < 0.14) return baseRadius * (1.24 - 1.5 * t);
      if (t < 0.72) return baseRadius * (1.03 - 0.42 * ((t - 0.14) / 0.58));
      const rt = (t - 0.72) / 0.28;
      return Math.max(0.0018, baseRadius * 0.60 * (1 - 0.82 * rt));
    });
    stemGeos.push(taperedTube(stemPath, radii, { radialSegments: 6, creaseAngle: 180, cap: true }));
  }

  createPart('MonsteraStems', mergeGeos(stemGeos), stemMat, { parent: root });
  const leavesPart = createPart('MonsteraLeaves', mergeGeos(leafGeos), leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided botanical Monstera/split-philodendron leaf blades with alpha cutout silhouette');

  return root;
}
