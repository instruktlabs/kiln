const meta = { name: 'foliage-cliff-drape' };

function leafPoly(cx, cy, len, wid, angleRad) {
  const ca = Math.cos(angleRad);
  const sa = Math.sin(angleRad);
  const pts = [
    [0.0, 0.0],
    [len * 0.22, -wid * 0.44],
    [len * 0.54, -wid * 0.50],
    [len * 0.84, -wid * 0.24],
    [len, 0.0],
    [len * 0.84, wid * 0.24],
    [len * 0.54, wid * 0.50],
    [len * 0.22, wid * 0.44],
  ];
  return pts.map(([lx, ly]) => [
    Math.max(10, Math.min(245, Math.round(cx + lx * ca - ly * sa))),
    Math.max(4, Math.min(507, Math.round(cy + lx * sa + ly * ca))),
  ]);
}

// Column 0: Arching tropical sword/tree fern frond (V=0 stem base at top -> V=1 pointed tip at bottom)
function buildFernColumnSpec(seedStr) {
  const rng = seededRandom(seedStr);
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'line', from: [128, 4], to: [124, 240], width: 5 }, rgba: [54, 84, 34, 255] });
  ops.push({ op: 'paint', shape: { kind: 'line', from: [124, 238], to: [130, 498], width: 3 }, rgba: [74, 114, 42, 255] });

  const pairs = 28;
  for (let i = 0; i < pairs; i++) {
    const t = 0.04 + (i / (pairs - 1)) * 0.92;
    const cy = Math.round(12 + t * 480);
    const cx = Math.round(128 - 4 * Math.sin(t * Math.PI));
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const pLen = 30 + 88 * env;
    const pWid = 13 + 13 * env;
    const gDark = [40 + Math.round(t * 28), 88 + Math.round(t * 44), 31 + Math.round(t * 16), 255];
    const gBright = [70 + Math.round(t * 54), 126 + Math.round(t * 56), 40 + Math.round(t * 24), 255];
    const colL = i % 3 === 0 ? gDark : gBright;
    const colR = i % 3 === 1 ? gDark : gBright;
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPoly(cx - 1, cy, pLen, pWid, Math.PI - 0.34 + rng.range(-0.07, 0.07)) },
      rgba: colL,
    });
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPoly(cx + 1, cy + 4, pLen, pWid, 0.34 + rng.range(-0.07, 0.07)) },
      rgba: colR,
    });
  }
  return { schemaVersion: 3, width: 256, height: 512, usage: 'albedo', background: [0, 0, 0, 0], operations: ops };
}

// Column 1: Lush cliff-lip tropical shrub broadleaf spray (V=0 base -> V=1 sunlit outer tips)
function buildShrubColumnSpec(seedStr) {
  const rng = seededRandom(seedStr);
  const ops = [];
  ops.push({ op: 'paint', shape: { kind: 'line', from: [128, 5], to: [122, 232], width: 6 }, rgba: [58, 48, 32, 255] });
  ops.push({ op: 'paint', shape: { kind: 'line', from: [122, 226], to: [134, 448], width: 4 }, rgba: [72, 70, 38, 255] });
  const forks = [
    { from: [126, 92], to: [42, 240] },
    { from: [124, 114], to: [214, 260] },
    { from: [125, 235], to: [48, 405] },
    { from: [128, 250], to: [210, 418] },
  ];
  for (const fk of forks) {
    ops.push({ op: 'paint', shape: { kind: 'line', from: fk.from, to: fk.to, width: 3 }, rgba: [72, 70, 38, 255] });
  }

  const leaves = [];
  for (let i = 0; i < 14; i++) {
    const t = 0.06 + (i / 13) * 0.88;
    const side = i % 2 === 0 ? -1 : 1;
    leaves.push({
      x: 126 + side * rng.range(3, 14),
      y: 22 + t * 442,
      ang: Math.PI * 0.5 + side * rng.range(0.36, 1.12),
      len: rng.range(48, 74),
      wid: rng.range(24, 38),
      tier: t,
    });
  }
  for (const fk of forks) {
    const dx = fk.to[0] - fk.from[0];
    const dy = fk.to[1] - fk.from[1];
    const ba = Math.atan2(dy, dx);
    for (let j = 0; j < 10; j++) {
      const t = 0.10 + (j / 9) * 0.90;
      const side = j % 2 === 0 ? -1 : 1;
      leaves.push({
        x: fk.from[0] + dx * t,
        y: fk.from[1] + dy * t,
        ang: ba + (j === 9 ? 0 : side * rng.range(0.30, 0.90)),
        len: rng.range(44, 68) * (1.06 - 0.22 * t),
        wid: rng.range(22, 34) * (1.06 - 0.20 * t),
        tier: Math.min(1, (fk.from[1] + dy * t) / 500),
      });
    }
  }

  const palDark = [[36, 78, 30, 255], [46, 94, 36, 255]];
  const palMid = [[68, 122, 42, 255], [84, 140, 48, 255]];
  const palHi = [[118, 164, 58, 255], [142, 186, 68, 255]];

  const chosen = leaves.slice(0, 64 - ops.length);
  chosen.sort((a, b) => a.tier - b.tier);
  for (const lf of chosen) {
    const rgba = lf.tier < 0.34 ? rng.pick(palDark) : lf.tier < 0.70 ? rng.pick(palMid) : rng.pick(palHi);
    ops.push({ op: 'paint', shape: { kind: 'polygon', points: leafPoly(lf.x, lf.y, lf.len, lf.wid, lf.ang) }, rgba });
  }
  return { schemaVersion: 3, width: 256, height: 512, usage: 'albedo', background: [0, 0, 0, 0], operations: ops };
}

// Columns 2 & 3: Cascading rainforest hanging creeper curtains (V=0 cliff lip at top -> V=1 delicate hanging tips at bottom)
function buildCreeperColumnSpec(seedStr, denseTop) {
  const rng = seededRandom(seedStr);
  const ops = [];
  const vines = [
    { x0: 62, x1: 54, x2: 68, endY: denseTop ? 430 : 492 },
    { x0: 128, x1: 138, x2: 122, endY: 504 },
    { x0: 194, x1: 184, x2: 198, endY: denseTop ? 418 : 478 },
  ];
  for (const v of vines) {
    ops.push({ op: 'paint', shape: { kind: 'line', from: [v.x0, 4], to: [v.x1, Math.round(v.endY * 0.5)], width: 4 }, rgba: [54, 72, 34, 255] });
    ops.push({ op: 'paint', shape: { kind: 'line', from: [v.x1, Math.round(v.endY * 0.5)], to: [v.x2, v.endY], width: 3 }, rgba: [68, 92, 38, 255] });
  }

  const palDark = [[34, 74, 28, 255], [44, 88, 34, 255]];
  const palMid = [[66, 120, 42, 255], [80, 136, 47, 255]];
  const palHi = [[114, 162, 57, 255], [138, 182, 66, 255]];

  const leaves = [];
  for (let vi = 0; vi < vines.length; vi++) {
    const v = vines[vi];
    const n = vi === 1 ? 22 : 18;
    for (let j = 0; j < n; j++) {
      const t = 0.02 + (j / (n - 1)) * 0.96;
      const py = 8 + t * (v.endY - 12);
      const px = t < 0.5
        ? v.x0 + (v.x1 - v.x0) * (t * 2)
        : v.x1 + (v.x2 - v.x1) * ((t - 0.5) * 2);
      const side = (j + vi) % 2 === 0 ? -1 : 1;
      const taper = denseTop ? (1.42 - 0.78 * t) : (1.16 - 0.52 * t);
      const len = rng.range(34, 52) * taper;
      const wid = rng.range(18, 30) * taper;
      const ang = Math.PI * 0.5 + side * rng.range(0.32, 0.94);
      leaves.push({
        x: px + side * rng.range(1, 5),
        y: py + rng.range(-5, 5),
        ang,
        len,
        wid,
        tier: t,
      });
    }
  }

  const chosen = leaves.slice(0, 64 - ops.length);
  chosen.sort((a, b) => a.tier - b.tier);
  for (const lf of chosen) {
    const r = rng.next();
    let rgba;
    if (lf.tier < 0.28) rgba = r < 0.60 ? rng.pick(palDark) : rng.pick(palMid);
    else if (lf.tier < 0.72) rgba = r < 0.22 ? rng.pick(palDark) : (r < 0.78 ? rng.pick(palMid) : rng.pick(palHi));
    else rgba = r < 0.42 ? rng.pick(palMid) : rng.pick(palHi);
    ops.push({ op: 'paint', shape: { kind: 'polygon', points: leafPoly(lf.x, lf.y, lf.len, lf.wid, lf.ang) }, rgba });
  }
  return { schemaVersion: 3, width: 256, height: 512, usage: 'albedo', background: [0, 0, 0, 0], operations: ops };
}

async function buildDrapeAtlas() {
  return await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'fern_frond',
        content: { x: 0, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildFernColumnSpec('drape-fern-v2') },
      },
      {
        name: 'shrub_spray',
        content: { x: 256, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildShrubColumnSpec('drape-shrub-v2') },
      },
      {
        name: 'creeper_long',
        content: { x: 512, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildCreeperColumnSpec('drape-creeper-long-v2', false) },
      },
      {
        name: 'creeper_mossy',
        content: { x: 768, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildCreeperColumnSpec('drape-creeper-mossy-v2', true) },
      },
    ],
  });
}

function buildMossMaterial() {
  const mossAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DrapeMossAlbedo',
    layers: [
      { op: 'solid', color: 0x2f5223 },
      {
        op: 'cellular',
        colorA: 0x223d1a,
        colorB: 0x4b7430,
        cellsX: 16,
        cellsY: 16,
        jitterX: 0.9,
        jitterY: 0.9,
        feature: 'f1',
        range: 0.85,
        seed: 73,
        blend: 'normal',
        opacity: 0.72,
      },
      {
        op: 'noise',
        colorA: 0x383224,
        colorB: 0x628c36,
        scale: 12,
        octaves: 4,
        seed: 131,
        blend: 'overlay',
        opacity: 0.55,
      },
    ],
  });

  const mossHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DrapeMossHeight',
    layers: [
      { op: 'solid', color: 0x808080 },
      {
        op: 'cellular',
        colorA: 0x303030,
        colorB: 0xd0d0d0,
        cellsX: 16,
        cellsY: 16,
        jitterX: 0.9,
        jitterY: 0.9,
        feature: 'f1',
        range: 0.85,
        seed: 73,
        blend: 'normal',
        opacity: 0.85,
      },
      {
        op: 'noise',
        colorA: 0x444444,
        colorB: 0xbcbbbb,
        scale: 14,
        octaves: 4,
        seed: 131,
        blend: 'overlay',
        opacity: 0.5,
      },
    ],
  });

  const mossNormal = normalMapFromHeight(mossHeight, { strength: 5.0, name: 'DrapeMossNormal' });
  return pbrMaterial({
    albedo: mossAlbedo,
    normal: mossNormal,
    roughness: 0.88,
    metalness: 0,
    name: 'DrapeMoss',
  });
}

function mergeGeos(geos) {
  let totalVerts = 0;
  let totalIdx = 0;
  let hasColor = false;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    if (g.getAttribute('color')) hasColor = true;
    totalVerts += pos.count;
    const idx = g.getIndex();
    totalIdx += idx ? idx.count : pos.count;
  }
  const positions = new Array(totalVerts * 3);
  const normals = new Array(totalVerts * 3);
  const uvs = new Array(totalVerts * 2);
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const indices = new Array(totalIdx);
  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos || pos.count === 0) continue;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const p3 = (vOff + i) * 3;
      positions[p3] = pos.getX(i);
      positions[p3 + 1] = pos.getY(i);
      positions[p3 + 2] = pos.getZ(i);
      normals[p3] = norm ? norm.getX(i) : 0;
      normals[p3 + 1] = norm ? norm.getY(i) : 1;
      normals[p3 + 2] = norm ? norm.getZ(i) : 0;
      const p2 = (vOff + i) * 2;
      uvs[p2] = uv ? uv.getX(i) : 0;
      uvs[p2 + 1] = uv ? uv.getY(i) : 0;
      if (colors) {
        colors[p3] = col ? col.getX(i) : 1;
        colors[p3 + 1] = col ? col.getY(i) : 1;
        colors[p3 + 2] = col ? col.getZ(i) : 1;
      }
    }
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[iOff++] = idx.getX(i) + vOff;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOff++] = i + vOff;
    }
    vOff += pos.count;
  }
  const merged = meshGeo({ positions, normals, uvs, indices });
  if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

// ONE continuous, sleek low-profile overhanging mossy cliff-lip turf shelf spanning Z in [-2.60, +2.60], X in [-0.96, +0.56], Y in [-0.24, +0.30]
// Explicit up:[0,1,0] keeps the shelf WIDE horizontally across X and LOW vertically in Y (no hanging belly!)
function makeContinuousMossShelf() {
  const stations = 16;
  const path = [];
  const radii = [];
  const scales = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const s = t * 2 - 1;
    const env = Math.pow(Math.max(0.06, 1 - Math.pow(Math.abs(s), 2.8)), 0.55);
    const z = s * 2.58;
    const x = -0.18 + 0.10 * Math.sin(t * Math.PI * 3.0 + 0.3);
    const y = 0.04 + 0.05 * Math.sin(t * Math.PI * 5.0);
    path.push([x, y, z]);
    radii.push(0.24 * env);
    // With path along +Z and up:[0,1,0]: side (+X) = 3.15 (~0.75m half-depth along X), depth (+Y) = 0.92 (~0.22m half-height along Y)!
    scales.push([3.15, 0.92]);
  }
  const geo = taperedTube(path, radii, { radialSegments: 10, creaseAngle: 180, cap: true, up: [0, 1, 0], sectionScale: scales });
  const disp = displace(geo, ([x, y, z]) => {
    const n = 0.05 * Math.sin(z * 2.4 + x * 3.2) + 0.03 * Math.cos(z * 5.2 - y * 4.0);
    // Curve the front +X lip gently downward over the cliff cornice
    const lipTurn = x > 0.14 ? -0.52 * (x - 0.14) * (x - 0.14) : 0;
    return [n * 0.5, n + lipTurn, 0];
  });
  return remapUV(disp, { scale: [2.5, 6.0] });
}

function makeArchingCard(opts) {
  const { length, width, riseY, droopY, cupY, uSegs = 2, vSegs = 4, twistRad = 0 } = opts;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let iv = 0; iv <= vSegs; iv++) {
    const v = iv / vSegs;
    const x = v * length;
    const cy = riseY * Math.sin(v * Math.PI * 0.85) - droopY * v * v;
    const tw = twistRad * v;
    const ct = Math.cos(tw);
    const st = Math.sin(tw);
    const wScale = 0.60 + 0.44 * Math.sin(Math.min(1, v * 1.05) * Math.PI * 0.82);
    for (let iu = 0; iu <= uSegs; iu++) {
      const u = iu / uSegs;
      const s = u * 2 - 1;
      const lz = s * (width * 0.5) * wScale;
      const ly = -cupY * s * s * (0.3 + 0.7 * v);
      positions.push(x, cy + ly * ct - lz * st, ly * st + lz * ct);
      uvs.push(u, v);
    }
  }
  const row = uSegs + 1;
  for (let iv = 0; iv < vSegs; iv++) {
    for (let iu = 0; iu < uSegs; iu++) {
      const a = iv * row + iu;
      const b = a + 1;
      const c = (iv + 1) * row + iu;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return meshGeo({ positions, uvs, indices });
}

function makeHangingCurtain(opts) {
  const { dropLen, width, bulgeX, swayZ, waveAmp, waveFreq, phase, uSegs = 2, vSegs = 5 } = opts;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let iv = 0; iv <= vSegs; iv++) {
    const v = iv / vSegs;
    const y = -v * dropLen;
    const cx = bulgeX * Math.sin(Math.min(1, v * 1.45) * Math.PI * 0.5) + waveAmp * Math.sin(v * Math.PI * waveFreq + phase);
    const cz = swayZ * v * v + waveAmp * 0.6 * Math.cos(v * Math.PI * (waveFreq * 0.8) + phase);
    const wScale = 1.06 - 0.30 * v * v;
    for (let iu = 0; iu <= uSegs; iu++) {
      const u = iu / uSegs;
      const s = u * 2 - 1;
      const lx = cx - 0.12 * s * s * (0.4 + 0.6 * v);
      const lz = cz + s * (width * 0.5) * wScale;
      positions.push(lx, y, lz);
      uvs.push(u, v);
    }
  }
  const row = uSegs + 1;
  for (let iv = 0; iv < vSegs; iv++) {
    for (let iu = 0; iu < uSegs; iu++) {
      const a = iv * row + iu;
      const b = a + 1;
      const c = (iv + 1) * row + iu;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return meshGeo({ positions, uvs, indices });
}

function tintAndTransform(geo, atlas, region, matrix, colorFn) {
  const mapped = remapUVToAtlas(geo, atlas, region, {
    inputOrigin: 'top-left',
    mode: 'texel-center',
    axes: 'u-only',
  });
  mapped.applyMatrix4(matrix);
  const pos = mapped.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [r, g, b] = colorFn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = r;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = b;
  }
  mapped.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return mapped;
}

async function build() {
  const root = createRoot('foliage-cliff-drape');
  const rng = seededRandom('lagoon-cliff-drape-v2');
  const mossMat = buildMossMaterial();
  const atlas = await buildDrapeAtlas();
  const leafMat = foliageMaterial(atlas, {
    alphaCutoff: 0.5,
    roughness: 0.62,
    doubleSided: true,
    name: 'DrapeLeaves',
  });

  // 1. Sleek continuous mossy lip shelf (Mesh_DrapeMoss)
  const mergedMoss = makeContinuousMossShelf();

  // 2. All foliage merged into ONE single-primitive mesh (Mesh_DrapeLeaves)
  // Calibrated tightly to BRIEF.md: Z in [-3.25, +3.25] (6.5m), X in [-1.20, +1.60] (2.8m), Y in [-3.80, +1.40], pivot Y=0 at lip!
  const leafGeos = [];
  const leafTint = (x, y) => {
    const h = Math.max(0, Math.min(1, (y + 3.8) / 5.2));
    const front = Math.max(0, Math.min(1, (x + 1.2) / 2.8));
    const s = 0.78 + 0.16 * h + 0.06 * front;
    return [Math.min(1, s * 0.98), Math.min(1, s), Math.min(1, s * 0.94)];
  };

  // 2A. Dense bushy cliff-top shrub crown (36 cupped sprays along Z in [-2.25, +2.25], X in [-1.15, +1.05], crowning cleanly to Y ~ +1.40m!)
  const shrubClusters = [-2.02, -1.24, -0.46, 0.34, 1.14, 1.94];
  for (let ci = 0; ci < shrubClusters.length; ci++) {
    const zc = shrubClusters[ci];
    for (let k = 0; k < 6; k++) {
      let yaw = (k / 6) * Math.PI * 2 + rng.range(-0.30, 0.30);
      if (zc < -1.6 && Math.sin(yaw) < -0.25) yaw = rng.range(-0.3, 0.9);
      if (zc > 1.6 && Math.sin(yaw) > 0.25) yaw = rng.range(-0.9, 0.3);
      const pitch = rng.range(0.42, 0.96);
      const roll = rng.range(-0.32, 0.32);
      const len = rng.range(0.95, 1.30);
      const wid = rng.range(0.78, 1.06);
      const card = makeArchingCard({
        length: len,
        width: wid,
        riseY: rng.range(0.24, 0.44),
        droopY: rng.range(0.08, 0.22),
        cupY: rng.range(0.12, 0.24),
        uSegs: 2,
        vSegs: 3,
        twistRad: rng.range(-0.20, 0.20),
      });
      const ox = rng.range(-0.26, 0.30);
      const oy = rng.range(0.14, 0.38);
      const oz = zc + rng.range(-0.20, 0.20);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(ox, oy, oz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YXZ')),
        new THREE.Vector3(1, 1, 1)
      );
      leafGeos.push(tintAndTransform(card, atlas, 'shrub_spray', m, leafTint));
    }
  }

  // 2B. Arching tropical cliff-edge fern fronds (32 fronds fanning out over the +X cliff lip & sides, crowning to Y ~ +1.42m)
  const fernClumps = [-2.12, -1.42, -0.70, 0.04, 0.78, 1.48, 2.10];
  for (let fi = 0; fi < fernClumps.length; fi++) {
    const zc = fernClumps[fi];
    const frondsHere = (fi === 0 || fi === fernClumps.length - 1) ? 4 : 5;
    for (let k = 0; k < frondsHere; k++) {
      let yaw = k === frondsHere - 1
        ? rng.range(2.40, 3.85)
        : rng.range(-0.85, 0.85);
      if (fi === 0 && Math.sin(yaw) < -0.15) yaw = Math.abs(yaw) * 0.60;
      if (fi === fernClumps.length - 1 && Math.sin(yaw) > 0.15) yaw = -Math.abs(yaw) * 0.60;

      const isBack = k === frondsHere - 1;
      const pitch = isBack ? rng.range(0.55, 0.88) : rng.range(0.32, 0.74);
      const roll = rng.range(-0.22, 0.22);
      const len = isBack ? rng.range(0.82, 1.06) : rng.range(1.02, 1.38);
      const wid = rng.range(0.52, 0.74);
      const card = makeArchingCard({
        length: len,
        width: wid,
        riseY: rng.range(0.34, 0.62),
        droopY: rng.range(0.36, 0.68),
        cupY: rng.range(0.08, 0.16),
        uSegs: 2,
        vSegs: 4,
        twistRad: rng.range(-0.18, 0.18),
      });
      const ox = isBack ? rng.range(-0.20, 0.10) : rng.range(-0.08, 0.28);
      const oy = rng.range(0.10, 0.34);
      const oz = zc + rng.range(-0.18, 0.18);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(ox, oy, oz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YXZ')),
        new THREE.Vector3(1, 1, 1)
      );
      leafGeos.push(tintAndTransform(card, atlas, 'fern_frond', m, leafTint));
    }
  }

  // 2C. Lush lip-spill overhanging shrub/moss skirts (20 angled downward-spilling broadleaf boughs covering the mossy lip edge!)
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const zPos = -2.35 + t * 4.70 + rng.range(-0.08, 0.08);
    const yaw = rng.range(-0.48, 0.48);
    const pitch = rng.range(-1.22, -0.62);
    const roll = rng.range(-0.28, 0.28);
    const len = rng.range(0.92, 1.38);
    const wid = rng.range(0.74, 1.02);
    const card = makeArchingCard({
      length: len,
      width: wid,
      riseY: rng.range(0.14, 0.26),
      droopY: rng.range(0.12, 0.24),
      cupY: rng.range(0.12, 0.22),
      uSegs: 2,
      vSegs: 3,
      twistRad: rng.range(-0.18, 0.18),
    });
    const ox = rng.range(0.24, 0.50);
    const oy = rng.range(-0.04, 0.14);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, oy, zPos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YXZ')),
      new THREE.Vector3(1, 1, 1)
    );
    leafGeos.push(tintAndTransform(card, atlas, i % 3 === 0 ? 'fern_frond' : 'shrub_spray', m, leafTint));
  }

  // 2D. Cascading cliff-face creeper & vine curtains (26 main + 13 angled cross-curtains, hanging down to Y = -1.7..-3.80m!)
  const curtainCount = 26;
  for (let i = 0; i < curtainCount; i++) {
    const t = i / (curtainCount - 1);
    const zPos = -2.52 + t * 5.04 + rng.range(-0.08, 0.08);
    const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 3.1 + 0.35);
    const edgeTaper = 0.72 + 0.28 * Math.sin(t * Math.PI);
    const dropLen = Math.min(3.82, (1.75 + 2.25 * wave) * edgeTaper + rng.range(-0.18, 0.20));
    const width = rng.range(0.70, 1.02);
    const bulgeX = rng.range(0.28, 0.54);
    const region = i % 2 === 0 ? 'creeper_long' : 'creeper_mossy';

    const curtain = makeHangingCurtain({
      dropLen,
      width,
      bulgeX,
      swayZ: rng.range(-0.10, 0.10),
      waveAmp: rng.range(0.06, 0.12),
      waveFreq: rng.range(1.2, 2.2),
      phase: rng.range(0, Math.PI * 2),
    });
    const ox = rng.range(0.32, 0.62);
    const oy = rng.range(-0.06, 0.10);
    const yaw = rng.range(-0.30, 0.30);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, oy, zPos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1)
    );
    leafGeos.push(tintAndTransform(curtain, atlas, region, m, leafTint));

    if (i % 2 === 0) {
      const cross = makeHangingCurtain({
        dropLen: dropLen * rng.range(0.74, 0.92),
        width: width * 0.80,
        bulgeX: bulgeX * 0.80,
        swayZ: rng.range(-0.08, 0.08),
        waveAmp: rng.range(0.05, 0.10),
        waveFreq: rng.range(1.1, 2.0),
        phase: rng.range(0, Math.PI * 2),
      });
      const crossYaw = (i % 4 === 0 ? 1 : -1) * rng.range(0.60, 0.94);
      const mc = new THREE.Matrix4().compose(
        new THREE.Vector3(ox + 0.08, oy - 0.04, zPos + rng.range(-0.08, 0.08)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, crossYaw, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1)
      );
      leafGeos.push(tintAndTransform(cross, atlas, 'creeper_long', mc, leafTint));
    }
  }

  const mergedLeaves = mergeGeos(leafGeos);

  createPart('DrapeMoss', mergedMoss, mossMat, { parent: root });
  const leavesPart = createPart('DrapeLeaves', mergedLeaves, leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided curved alpha-cutout cliff-edge fern, shrub, and cascading creeper cards');

  return root;
}
