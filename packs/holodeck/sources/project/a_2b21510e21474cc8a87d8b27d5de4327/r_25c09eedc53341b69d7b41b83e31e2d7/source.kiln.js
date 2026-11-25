const meta = { name: 'foliage-canopy-emergent' };

function leafPoly(cx, cy, len, wid, angleRad) {
  const ca = Math.cos(angleRad);
  const sa = Math.sin(angleRad);
  const pts = [
    [0.0, 0.0],
    [len * 0.22, -wid * 0.44],
    [len * 0.54, -wid * 0.50],
    [len * 0.84, -wid * 0.25],
    [len, 0.0],
    [len * 0.84, wid * 0.25],
    [len * 0.54, wid * 0.50],
    [len * 0.22, wid * 0.44],
  ];
  return pts.map(([lx, ly]) => [
    Math.max(10, Math.min(245, Math.round(cx + lx * ca - ly * sa))),
    Math.max(4, Math.min(507, Math.round(cy + lx * sa + ly * ca))),
  ]);
}

function buildSprayColumnSpec(seedStr, style) {
  const rng = seededRandom(seedStr);
  const ops = [];

  const stemBaseX = 128 + Math.round(rng.range(-6, 6));
  const midX = 128 + Math.round(rng.range(-12, 12));
  const tipX = 128 + Math.round(rng.range(-14, 14));
  const barkCol = style === 'under' ? [48, 39, 30, 255] : [64, 51, 36, 255];
  const twigCol = style === 'under' ? [56, 52, 34, 255] : [78, 70, 42, 255];

  ops.push({ op: 'paint', shape: { kind: 'line', from: [stemBaseX, 4], to: [midX, 235], width: 7 }, rgba: barkCol });
  ops.push({ op: 'paint', shape: { kind: 'line', from: [midX, 230], to: [tipX, 456], width: 4 }, rgba: twigCol });

  const subBranches = [
    { from: [Math.round((stemBaseX + midX) * 0.5), 96], to: [38 + Math.round(rng.range(-6, 10)), 238 + Math.round(rng.range(-14, 14))], w: 4 },
    { from: [Math.round((stemBaseX + midX) * 0.5), 116], to: [218 + Math.round(rng.range(-10, 6)), 256 + Math.round(rng.range(-14, 14))], w: 4 },
    { from: [midX, 236], to: [44 + Math.round(rng.range(-6, 10)), 398 + Math.round(rng.range(-14, 14))], w: 3 },
    { from: [midX, 252], to: [212 + Math.round(rng.range(-10, 6)), 412 + Math.round(rng.range(-14, 14))], w: 3 },
  ];
  for (const sb of subBranches) {
    ops.push({ op: 'paint', shape: { kind: 'line', from: sb.from, to: sb.to, width: sb.w }, rgba: twigCol });
  }

  const palettes = {
    wide: {
      dark: [[37, 79, 32, 255], [46, 94, 36, 255]],
      mid: [[66, 120, 43, 255], [78, 134, 48, 255]],
      hi: [[112, 158, 57, 255], [130, 174, 65, 255]],
    },
    crown: {
      dark: [[46, 92, 35, 255], [58, 108, 40, 255]],
      mid: [[80, 136, 48, 255], [98, 152, 54, 255]],
      hi: [[126, 172, 64, 255], [152, 194, 74, 255]],
    },
    fringe: {
      dark: [[40, 84, 33, 255], [52, 100, 38, 255]],
      mid: [[72, 126, 44, 255], [88, 142, 50, 255]],
      hi: [[120, 166, 61, 255], [142, 184, 70, 255]],
    },
    under: {
      dark: [[33, 72, 29, 255], [40, 84, 34, 255]],
      mid: [[56, 106, 39, 255], [68, 118, 43, 255]],
      hi: [[88, 136, 49, 255], [104, 152, 56, 255]],
    },
  };
  const pal = palettes[style];

  const isAiry = style === 'fringe' || style === 'under';
  const lenBoost = style === 'crown' ? 1.24 : style === 'wide' ? 1.18 : 1.02;
  const widBoost = style === 'crown' ? 1.30 : style === 'wide' ? 1.24 : 1.04;

  const anchors = [];
  for (let i = 0; i < 14; i++) {
    const t = 0.05 + (i / 13) * 0.88;
    const bx = t < 0.5 ? stemBaseX + (midX - stemBaseX) * (t * 2) : midX + (tipX - midX) * ((t - 0.5) * 2);
    const by = 18 + t * 444;
    const side = i % 2 === 0 ? -1 : 1;
    anchors.push({
      x: bx + side * rng.range(1, 10),
      y: by + rng.range(-7, 7),
      ang: Math.PI * 0.5 + side * rng.range(0.36, 1.14),
      len: rng.range(46, 68) * lenBoost,
      wid: rng.range(22, 34) * widBoost,
      tier: t,
    });
  }
  for (let b = 0; b < subBranches.length; b++) {
    const sb = subBranches[b];
    const dx = sb.to[0] - sb.from[0];
    const dy = sb.to[1] - sb.from[1];
    const baseAng = Math.atan2(dy, dx);
    const count = isAiry ? 9 : 10;
    for (let j = 0; j < count; j++) {
      const t = 0.08 + (j / (count - 1)) * 0.92;
      const sx = sb.from[0] + dx * t;
      const sy = sb.from[1] + dy * t;
      const side = j % 2 === 0 ? -1 : 1;
      const fanOff = j === count - 1 ? rng.range(-0.16, 0.16) : side * rng.range(0.28, 0.96);
      const leafLen = rng.range(42, 64) * lenBoost * (1.06 - 0.24 * t);
      const leafWid = rng.range(20, 31) * widBoost * (1.04 - 0.20 * t);
      anchors.push({
        x: sx + rng.range(-4, 4),
        y: sy + rng.range(-4, 4),
        ang: baseAng + fanOff,
        len: leafLen,
        wid: leafWid,
        tier: Math.min(1, (sy / 512) * 0.72 + t * 0.34),
      });
    }
  }
  for (let k = 0; k < 6; k++) {
    const spread = (k - 2.5) * 0.36 + rng.range(-0.08, 0.08);
    anchors.push({
      x: tipX + rng.range(-10, 10),
      y: 432 + rng.range(-12, 12),
      ang: Math.PI * 0.5 + spread,
      len: rng.range(42, 60) * lenBoost,
      wid: rng.range(18, 28) * widBoost,
      tier: 0.90 + rng.range(0, 0.10),
    });
  }

  const maxLeaves = 64 - ops.length;
  const chosen = anchors.slice(0, maxLeaves);
  chosen.sort((a, b) => a.tier - b.tier);
  for (let i = 0; i < chosen.length; i++) {
    const lf = chosen[i];
    let rgba;
    if (lf.tier < 0.34) rgba = rng.pick(pal.dark);
    else if (lf.tier < 0.70) rgba = rng.pick(pal.mid);
    else rgba = rng.pick(pal.hi);
    ops.push({
      op: 'paint',
      shape: { kind: 'polygon', points: leafPoly(lf.x, lf.y, lf.len, lf.wid, lf.ang) },
      rgba,
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

async function buildCanopyAtlas(seedPrefix) {
  return await textureAtlas({
    schemaVersion: 1,
    width: 1024,
    height: 512,
    usage: 'albedo',
    regions: [
      {
        name: 'bough_wide',
        content: { x: 0, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildSprayColumnSpec(`${seedPrefix}-wide`, 'wide') },
      },
      {
        name: 'bough_crown',
        content: { x: 256, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildSprayColumnSpec(`${seedPrefix}-crown`, 'crown') },
      },
      {
        name: 'bough_fringe',
        content: { x: 512, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildSprayColumnSpec(`${seedPrefix}-fringe`, 'fringe') },
      },
      {
        name: 'bough_under',
        content: { x: 768, y: 0, width: 256, height: 512 },
        gutter: 0,
        edgeMode: 'mask-rgb-dilate',
        source: { kind: 'procedural', spec: buildSprayColumnSpec(`${seedPrefix}-under`, 'under') },
      },
    ],
  });
}

function buildBarkMaterial() {
  const barkAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CanopyBarkAlbedo',
    layers: [
      { op: 'solid', color: 0x4b4034 },
      {
        op: 'cellular',
        colorA: 0x2b231a,
        colorB: 0x645646,
        cellsX: 20,
        cellsY: 5,
        metricX: 1,
        metricY: 3.4,
        jitterX: 0.85,
        jitterY: 0.45,
        feature: 'f2-f1',
        range: 0.42,
        seed: 149,
        blend: 'normal',
        opacity: 0.82,
      },
      {
        op: 'noise',
        colorA: 0x352c22,
        colorB: 0x6c5e4b,
        scale: 18,
        octaves: 4,
        seed: 233,
        blend: 'overlay',
        opacity: 0.5,
      },
      {
        op: 'noise',
        colorA: 0x314c25,
        colorB: 0x4b4034,
        scale: 5,
        octaves: 3,
        seed: 347,
        blend: 'normal',
        opacity: 0.26,
      },
    ],
  });

  const barkHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'CanopyBarkHeight',
    layers: [
      { op: 'solid', color: 0x808080 },
      {
        op: 'cellular',
        colorA: 0x202020,
        colorB: 0xd8d8d8,
        cellsX: 20,
        cellsY: 5,
        metricX: 1,
        metricY: 3.4,
        jitterX: 0.85,
        jitterY: 0.45,
        feature: 'f2-f1',
        range: 0.42,
        seed: 149,
        blend: 'normal',
        opacity: 0.9,
      },
      {
        op: 'noise',
        colorA: 0x404040,
        colorB: 0xc0c0c0,
        scale: 18,
        octaves: 4,
        seed: 233,
        blend: 'overlay',
        opacity: 0.5,
      },
    ],
  });

  const barkNormal = normalMapFromHeight(barkHeight, { strength: 5.5, name: 'CanopyBarkNormal' });
  return pbrMaterial({
    albedo: barkAlbedo,
    normal: barkNormal,
    roughness: 0.91,
    metalness: 0,
    name: 'CanopyBark',
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

function makeCurvedSpray(opts) {
  const { length, width, archY, cupY, droopY, uSegs = 2, vSegs = 3, twistRad = 0 } = opts;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= vSegs; iv++) {
    const v = iv / vSegs;
    const x = v * length;
    const centerY = archY * Math.sin(v * Math.PI) - droopY * v * v;
    const tw = twistRad * v;
    const ct = Math.cos(tw);
    const st = Math.sin(tw);
    const widthScale = 0.68 + 0.38 * Math.sin(Math.min(1, v * 1.05) * Math.PI * 0.80);
    for (let iu = 0; iu <= uSegs; iu++) {
      const u = iu / uSegs;
      const s = u * 2 - 1;
      const localZ = s * (width * 0.5) * widthScale;
      const localY = -cupY * s * s * (0.35 + 0.65 * v);
      const ry = centerY + localY * ct - localZ * st;
      const rz = localY * st + localZ * ct;
      positions.push(x, ry, rz);
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

function addSubCrownDome(leavesList, atlas, center, crownCenter, config, rng) {
  const {
    parasolCount,
    billowCount,
    radSpread,
    lenRange,
    widRange,
    regionOuter,
    regionUpper,
    shadeMin,
    shadeMax,
  } = config;

  const placeOne = (yaw, pitch, roll, len, wid, archMul, cupMul, droopMul, region, yOff, rOff) => {
    const raw = makeCurvedSpray({
      length: len,
      width: wid,
      archY: rng.range(0.20, 0.44) * archMul * (len / 1.9),
      cupY: rng.range(0.16, 0.36) * cupMul * (wid / 1.5),
      droopY: rng.range(0.12, 0.34) * droopMul * (len / 1.9),
      uSegs: 2,
      vSegs: 3,
      twistRad: rng.range(-0.24, 0.24),
    });
    const mapped = remapUVToAtlas(raw, atlas, region, {
      inputOrigin: 'top-left',
      mode: 'texel-center',
      axes: 'u-only',
    });

    const ox = center[0] + Math.cos(yaw) * rOff;
    const oy = center[1] + yOff;
    const oz = center[2] + Math.sin(yaw) * rOff;

    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, oy, oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YXZ')),
      new THREE.Vector3(1, 1, 1)
    );
    mapped.applyMatrix4(m);

    const pos = mapped.getAttribute('position');
    const norm = mapped.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const vTmp = new THREE.Vector3();
    const nTmp = new THREE.Vector3();
    const domeDir = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      vTmp.set(pos.getX(k), pos.getY(k), pos.getZ(k));
      domeDir.set(vTmp.x - crownCenter[0], (vTmp.y - crownCenter[1]) * 1.4 + 1.2, vTmp.z - crownCenter[2]).normalize();
      nTmp.set(norm.getX(k), norm.getY(k), norm.getZ(k)).lerp(domeDir, 0.40).normalize();
      norm.setXYZ(k, nTmp.x, nTmp.y, nTmp.z);

      const hFrac = Math.max(0, Math.min(1, (vTmp.y - 6.6) / 8.4));
      const shade = shadeMin + (shadeMax - shadeMin) * hFrac;
      col[k * 3] = Math.min(1.0, shade * (0.96 + 0.06 * hFrac));
      col[k * 3 + 1] = Math.min(1.0, shade * 1.0);
      col[k * 3 + 2] = Math.min(1.0, shade * (0.97 - 0.06 * hFrac));
    }
    mapped.setAttribute('color', new THREE.BufferAttribute(col, 3));
    leavesList.push(mapped);
  };

  for (let i = 0; i < parasolCount; i++) {
    const yaw = (i / parasolCount) * Math.PI * 2 + rng.range(-0.28, 0.28);
    const pitch = rng.range(-0.30, 0.16);
    const roll = rng.range(-0.32, 0.32);
    const len = rng.range(lenRange[0], lenRange[1]);
    const wid = rng.range(widRange[0], widRange[1]);
    const yOff = rng.range(-0.20, 0.16);
    const rOff = rng.range(0.05, radSpread);
    placeOne(yaw, pitch, roll, len, wid, 1.0, 1.15, 1.20, rng.pick(regionOuter), yOff, rOff);
  }

  for (let j = 0; j < billowCount; j++) {
    const yaw = ((j + 0.5) / billowCount) * Math.PI * 2 + rng.range(-0.32, 0.32);
    const pitch = rng.range(0.28, 0.80);
    const roll = (j % 2 === 0 ? 1 : -1) * rng.range(0.20, 0.58);
    const len = rng.range(lenRange[0] * 0.78, lenRange[1] * 0.88);
    const wid = rng.range(widRange[0] * 0.85, widRange[1] * 1.00);
    const yOff = rng.range(0.05, 0.36);
    const rOff = rng.range(0.0, radSpread * 0.70);
    placeOne(yaw, pitch, roll, len, wid, 1.25, 1.05, 0.90, rng.pick(regionUpper), yOff, rOff);
  }
}

function makeBranch(points, rStart, rEnd, radialSegments, samplesPerSpan, sectionScale) {
  const path = catmullRomPath(points, samplesPerSpan);
  const radii = path.map((_, i) => {
    const t = i / (path.length - 1);
    return rStart * Math.pow(rEnd / rStart, t);
  });
  const opts = { radialSegments, creaseAngle: 180, cap: true };
  if (sectionScale) opts.sectionScale = path.map(() => sectionScale);
  const geo = taperedTube(path, radii, opts);
  return remapUV(geo, { scale: [1.4, Math.max(1.0, path.length * 0.30)] });
}

async function build() {
  const root = createRoot('foliage-canopy-emergent');
  const rng = seededRandom('lagoon-emergent-v2');
  const barkMat = buildBarkMaterial();
  const atlas = await buildCanopyAtlas('emergent-atlas-v2');
  const leafMat = foliageMaterial(atlas, {
    alphaCutoff: 0.5,
    roughness: 0.62,
    doubleSided: true,
    name: 'CanopyLeaves',
  });

  const barkGeos = [];
  const leafGeos = [];

  // 1. Tall sinuous emergent rainforest trunk from Y = -0.80m skirt up to Y = 13.0m
  const trunkPts = [
    [0.0, -0.80, 0.0],
    [0.08, 0.80, -0.05],
    [0.22, 3.50, -0.15],
    [0.12, 6.40, 0.10],
    [-0.16, 9.30, 0.20],
    [-0.06, 11.65, 0.06],
    [0.05, 13.05, -0.04],
  ];
  const trunkPath = catmullRomPath(trunkPts, 2);
  const trunkRadii = trunkPath.map((p, i) => {
    const t = i / (trunkPath.length - 1);
    const flare = p[1] < 2.2 ? 0.38 * Math.pow(Math.max(0, 1 - (p[1] + 0.8) / 3.0), 1.85) : 0;
    return 0.49 - 0.34 * t + flare;
  });
  barkGeos.push(remapUV(taperedTube(trunkPath, trunkRadii, { radialSegments: 9, creaseAngle: 180, cap: true }), { scale: [2.2, 6.0] }));

  // 2. Five seamless flared plank buttresses rooted inside trunk core (r=0) down to Y = -0.80m
  const buttAngles = [0.24, 1.48, 2.70, 3.96, 5.22];
  for (let i = 0; i < buttAngles.length; i++) {
    const a = buttAngles[i] + rng.range(-0.14, 0.14);
    const reach = rng.range(1.02, 1.24);
    const topY = rng.range(2.15, 2.75);
    const pts = [
      [0.04, topY, -0.02],
      [Math.cos(a) * (reach * 0.36), topY * 0.44, Math.sin(a) * (reach * 0.36)],
      [Math.cos(a) * (reach * 0.76), -0.04, Math.sin(a) * (reach * 0.76)],
      [Math.cos(a) * reach, -0.80, Math.sin(a) * reach],
    ];
    barkGeos.push(makeBranch(pts, 0.31, 0.16, 6, 2, [0.62, 1.58]));
  }

  // 3. THREE DISTINCT STEPPED SUNLIT CROWN TIERS (Y ~ 7.5m, 11.0m, 14.8m; spread ~ 10.5m x 9.5m; top ~ 15.0m)
  const leafRng = rng.fork('emergent-sprays-v2');

  // --- TIER 1 (Lower stepped lateral shelf at Y ~ 7.0..8.6m, 3 lush asymmetric bough clusters = 54 sprays) ---
  const tier1Limbs = [
    { ang: 0.38, reach: 2.65, startY: 5.95, endY: 7.30, r0: 0.19, r1: 0.072 },
    { ang: 2.52, reach: 2.85, startY: 6.20, endY: 7.60, r0: 0.19, r1: 0.072 },
    { ang: 4.62, reach: 2.35, startY: 6.10, endY: 7.40, r0: 0.17, r1: 0.065 },
  ];
  for (const lb of tier1Limbs) {
    const ca = Math.cos(lb.ang);
    const sa = Math.sin(lb.ang);
    const mx = ca * lb.reach * 0.55;
    const mz = sa * lb.reach * 0.55;
    const my = (lb.startY + lb.endY) * 0.5 + 0.16;
    const ex = ca * lb.reach;
    const ez = sa * lb.reach;
    barkGeos.push(makeBranch([[0.10, lb.startY, 0.06], [mx, my, mz], [ex, lb.endY, ez]], lb.r0, lb.r1, 5, 2));

    const fAng = lb.ang + 0.38;
    const fx = ex + Math.cos(fAng) * 0.72;
    const fz = ez + Math.sin(fAng) * 0.72;
    barkGeos.push(makeBranch([[ex * 0.80, lb.endY - 0.10, ez * 0.80], [fx, lb.endY + 0.42, fz]], lb.r1, 0.038, 4, 2));

    addSubCrownDome(leafGeos, atlas, [ex * 0.92, lb.endY + 0.14, ez * 0.92], [0, 7.5, 0], {
      parasolCount: 10,
      billowCount: 8,
      radSpread: 0.44,
      lenRange: [1.35, 1.85],
      widRange: [1.15, 1.55],
      regionOuter: ['bough_wide', 'bough_under', 'bough_fringe'],
      regionUpper: ['bough_wide', 'bough_crown', 'bough_fringe'],
      shadeMin: 0.78,
      shadeMax: 0.95,
    }, leafRng);
  }

  // --- TIER 2 (Broad mid-upper spreading crown at Y ~ 10.2..12.2m, hitting 10.5m x 9.5m spread) ---
  const tier2Limbs = [
    { ang: 0.06, reach: 3.10, startY: 9.15, endY: 10.75, r0: 0.21, r1: 0.078 },
    { ang: 1.54, reach: 2.98, startY: 9.40, endY: 11.00, r0: 0.20, r1: 0.074 },
    { ang: 3.12, reach: 3.15, startY: 9.25, endY: 10.70, r0: 0.21, r1: 0.078 },
    { ang: 4.66, reach: 2.94, startY: 9.50, endY: 11.10, r0: 0.19, r1: 0.072 },
  ];
  for (let i = 0; i < tier2Limbs.length; i++) {
    const lb = tier2Limbs[i];
    const ca = Math.cos(lb.ang);
    const sa = Math.sin(lb.ang);
    const side = (i % 2 === 0 ? 1 : -1) * 0.30;
    const mx = ca * lb.reach * 0.52 - sa * side;
    const mz = sa * lb.reach * 0.52 + ca * side;
    const my = (lb.startY + lb.endY) * 0.5 + 0.24;
    const ex = ca * lb.reach;
    const ez = sa * lb.reach;
    barkGeos.push(makeBranch([[-0.10, lb.startY, 0.14], [mx, my, mz], [ex, lb.endY, ez]], lb.r0, lb.r1, 5, 2));

    // Mid-limb bridging spray cluster so Tier 2 reads as a cohesive sweeping rainforest umbrella shelf (no bare pom-pom sticks!)
    addSubCrownDome(leafGeos, atlas, [mx * 1.12, my + 0.34, mz * 1.12], [0, 11.0, 0], {
      parasolCount: 4,
      billowCount: 3,
      radSpread: 0.36,
      lenRange: [1.22, 1.65],
      widRange: [1.05, 1.42],
      regionOuter: ['bough_wide', 'bough_under'],
      regionUpper: ['bough_wide', 'bough_crown'],
      shadeMin: 0.82,
      shadeMax: 0.96,
    }, leafRng);

    for (const sgn of [-1, 1]) {
      const fa = lb.ang + sgn * 0.42;
      const fx = ex + Math.cos(fa) * 0.76;
      const fz = ez + Math.sin(fa) * 0.68;
      const fy = lb.endY + (sgn > 0 ? 0.56 : 0.24);
      barkGeos.push(makeBranch([[ex * 0.84, lb.endY - 0.08, ez * 0.84], [fx, fy, fz]], lb.r1 * 0.94, 0.038, 4, 2));

      addSubCrownDome(leafGeos, atlas, [fx * 0.88, fy + 0.04, fz * 0.88], [0, 11.0, 0], {
        parasolCount: 9,
        billowCount: 7,
        radSpread: 0.40,
        lenRange: [1.30, 1.76],
        widRange: [1.12, 1.54],
        regionOuter: ['bough_wide', 'bough_crown', 'bough_fringe', 'bough_under'],
        regionUpper: ['bough_crown', 'bough_wide', 'bough_fringe'],
        shadeMin: 0.84,
        shadeMax: 0.99,
      }, leafRng);
    }
  }

  // --- TIER 3 (Soaring sunlit emergent apex crown at Y ~ 12.8..15.0m) ---
  const tier3Limbs = [
    { ang: 0.50, reach: 2.10, startY: 11.95, endY: 13.55, r0: 0.14, r1: 0.048 },
    { ang: 2.08, reach: 2.20, startY: 12.05, endY: 13.70, r0: 0.14, r1: 0.048 },
    { ang: 3.68, reach: 2.00, startY: 12.00, endY: 13.50, r0: 0.13, r1: 0.046 },
    { ang: 5.18, reach: 2.10, startY: 12.15, endY: 13.80, r0: 0.13, r1: 0.046 },
  ];
  for (const lb of tier3Limbs) {
    const ca = Math.cos(lb.ang);
    const sa = Math.sin(lb.ang);
    const ex = ca * lb.reach;
    const ez = sa * lb.reach;
    barkGeos.push(makeBranch(
      [[0.02, lb.startY, -0.02], [ex * 0.5, (lb.startY + lb.endY) * 0.5 + 0.20, ez * 0.5], [ex, lb.endY, ez]],
      lb.r0, lb.r1, 5, 2
    ));

    addSubCrownDome(leafGeos, atlas, [ex * 0.88, lb.endY + 0.08, ez * 0.88], [0, 13.7, 0], {
      parasolCount: 10,
      billowCount: 9,
      radSpread: 0.38,
      lenRange: [1.28, 1.74],
      widRange: [1.14, 1.54],
      regionOuter: ['bough_crown', 'bough_wide', 'bough_fringe'],
      regionUpper: ['bough_crown', 'bough_crown', 'bough_fringe'],
      shadeMin: 0.90,
      shadeMax: 1.0,
    }, leafRng);
  }

  // Central emergent apex cap reaching Y ~ 15.00m
  barkGeos.push(makeBranch([[0.05, 12.75, -0.04], [-0.10, 13.45, 0.08], [0.08, 13.98, -0.03]], 0.11, 0.038, 5, 2));
  addSubCrownDome(leafGeos, atlas, [0.06, 13.86, -0.02], [0, 13.8, 0], {
    parasolCount: 10,
    billowCount: 10,
    radSpread: 0.34,
    lenRange: [1.20, 1.62],
    widRange: [1.08, 1.46],
    regionOuter: ['bough_crown', 'bough_wide', 'bough_fringe'],
    regionUpper: ['bough_crown', 'bough_crown', 'bough_fringe'],
    shadeMin: 0.93,
    shadeMax: 1.0,
  }, leafRng);

  const mergedBark = mergeGeos(barkGeos);
  const mergedLeaves = mergeGeos(leafGeos);

  createPart('CanopyBark', mergedBark, barkMat, { parent: root });
  const leavesPart = createPart('CanopyLeaves', mergedLeaves, leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided curved alpha-cutout stepped emergent canopy spray cards');

  return root;
}
