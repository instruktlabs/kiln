const meta = { name: 'foliage-canopy-umbrella' };

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

// Rich botanical rainforest bough spray column (256x512, V=0 branch attachment at top -> V=1 outer foliage tips at bottom)
// 52-56 individually oriented pointed tropical leaves along forked woody twigs with deliberate airy sky-filtering gaps!
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

  // Rainforest canopy palette: deep cool undersides #254f20, rich sunlit tropical #467c2c, warm backlit highlights #76a33c
  const palettes = {
    wide: {
      dark: [[37, 79, 32, 255], [46, 94, 36, 255]],
      mid: [[66, 120, 43, 255], [78, 134, 48, 255]],
      hi: [[112, 158, 57, 255], [128, 172, 64, 255]],
    },
    crown: {
      dark: [[44, 90, 34, 255], [56, 106, 39, 255]],
      mid: [[78, 134, 47, 255], [96, 150, 53, 255]],
      hi: [[124, 170, 62, 255], [148, 190, 72, 255]],
    },
    fringe: {
      dark: [[39, 82, 33, 255], [50, 98, 37, 255]],
      mid: [[70, 124, 44, 255], [86, 140, 50, 255]],
      hi: [[118, 163, 60, 255], [138, 180, 68, 255]],
    },
    under: {
      dark: [[33, 72, 29, 255], [39, 83, 33, 255]],
      mid: [[55, 105, 38, 255], [68, 118, 43, 255]],
      hi: [[88, 136, 49, 255], [102, 150, 55, 255]],
    },
  };
  const pal = palettes[style];

  const isAiry = style === 'fringe' || style === 'under';
  const lenBoost = style === 'crown' ? 1.24 : style === 'wide' ? 1.18 : 1.02;
  const widBoost = style === 'crown' ? 1.30 : style === 'wide' ? 1.24 : 1.04;

  const anchors = [];
  // 14 leaves along main central bough spine
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
  // 9-10 leaves along each of the 4 lateral sub-twigs (36-40 leaves)
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
  // 6 sunlit terminal tip leaflets fanning gracefully toward V=1
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
        colorA: 0x2c241b,
        colorB: 0x645645,
        cellsX: 20,
        cellsY: 5,
        metricX: 1,
        metricY: 3.4,
        jitterX: 0.85,
        jitterY: 0.45,
        feature: 'f2-f1',
        range: 0.42,
        seed: 117,
        blend: 'normal',
        opacity: 0.82,
      },
      {
        op: 'noise',
        colorA: 0x352c22,
        colorB: 0x6b5d4a,
        scale: 18,
        octaves: 4,
        seed: 211,
        blend: 'overlay',
        opacity: 0.5,
      },
      {
        op: 'noise',
        colorA: 0x304a24,
        colorB: 0x4b4034,
        scale: 5,
        octaves: 3,
        seed: 317,
        blend: 'normal',
        opacity: 0.28,
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
        colorA: 0x222222,
        colorB: 0xd8d8d8,
        cellsX: 20,
        cellsY: 5,
        metricX: 1,
        metricY: 3.4,
        jitterX: 0.85,
        jitterY: 0.45,
        feature: 'f2-f1',
        range: 0.42,
        seed: 117,
        blend: 'normal',
        opacity: 0.9,
      },
      {
        op: 'noise',
        colorA: 0x404040,
        colorB: 0xc0c0c0,
        scale: 18,
        octaves: 4,
        seed: 211,
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

// Cupped curved 3D bough spray card (2x3 grid = 12 tris, UV.y = 0 at attachment -> 1 at outer leaf tip)
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

// Volumetric botanical sub-crown dome built from layered low-pitch umbrella sprays + lifted billowing sprays + rim droop cards
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
      archY: rng.range(0.22, 0.48) * archMul * (len / 2.0),
      cupY: rng.range(0.18, 0.40) * cupMul * (wid / 1.6),
      droopY: rng.range(0.14, 0.38) * droopMul * (len / 2.0),
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
      domeDir.set(vTmp.x - crownCenter[0], (vTmp.y - crownCenter[1]) * 1.45 + 1.4, vTmp.z - crownCenter[2]).normalize();
      nTmp.set(norm.getX(k), norm.getY(k), norm.getZ(k)).lerp(domeDir, 0.42).normalize();
      norm.setXYZ(k, nTmp.x, nTmp.y, nTmp.z);

      const hFrac = Math.max(0, Math.min(1, (vTmp.y - 5.6) / 5.9));
      const shade = shadeMin + (shadeMax - shadeMin) * hFrac;
      col[k * 3] = Math.min(1.0, shade * (0.97 + 0.05 * hFrac));
      col[k * 3 + 1] = Math.min(1.0, shade * 1.0);
      col[k * 3 + 2] = Math.min(1.0, shade * (0.97 - 0.06 * hFrac));
    }
    mapped.setAttribute('color', new THREE.BufferAttribute(col, 3));
    leavesList.push(mapped);
  };

  // Layer 1: Radiating spreading umbrella parasol sprays (creates lush canopy width + crisp underside silhouettes)
  for (let i = 0; i < parasolCount; i++) {
    const yaw = (i / parasolCount) * Math.PI * 2 + rng.range(-0.28, 0.28);
    const pitch = rng.range(-0.32, 0.16);
    const roll = rng.range(-0.34, 0.34);
    const len = rng.range(lenRange[0], lenRange[1]);
    const wid = rng.range(widRange[0], widRange[1]);
    const yOff = rng.range(-0.24, 0.18);
    const rOff = rng.range(0.05, radSpread);
    placeOne(yaw, pitch, roll, len, wid, 1.0, 1.15, 1.25, rng.pick(regionOuter), yOff, rOff);
  }

  // Layer 2: Lifted, angled 3D crown billow sprays (creates lush rounded botanical depth from side & 3/4 views!)
  for (let j = 0; j < billowCount; j++) {
    const yaw = ((j + 0.5) / billowCount) * Math.PI * 2 + rng.range(-0.32, 0.32);
    const pitch = rng.range(0.28, 0.84);
    const roll = (j % 2 === 0 ? 1 : -1) * rng.range(0.22, 0.62);
    const len = rng.range(lenRange[0] * 0.78, lenRange[1] * 0.88);
    const wid = rng.range(widRange[0] * 0.85, widRange[1] * 1.02);
    const yOff = rng.range(0.05, 0.42);
    const rOff = rng.range(0.0, radSpread * 0.72);
    placeOne(yaw, pitch, roll, len, wid, 1.25, 1.05, 0.95, rng.pick(regionUpper), yOff, rOff);
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
  const root = createRoot('foliage-canopy-umbrella');
  const rng = seededRandom('lagoon-umbrella-v2');
  const barkMat = buildBarkMaterial();
  const atlas = await buildCanopyAtlas('umbrella-atlas-v2');
  const leafMat = foliageMaterial(atlas, {
    alphaCutoff: 0.5,
    roughness: 0.62,
    doubleSided: true,
    name: 'CanopyLeaves',
  });

  const barkGeos = [];
  const leafGeos = [];

  // 1. Main sinuous tropical trunk from Y = -0.80m root skirt up to crown fork at Y = 6.1m
  const trunkPts = [
    [0.0, -0.80, 0.0],
    [0.07, 0.35, -0.04],
    [0.20, 1.95, -0.12],
    [0.10, 3.80, 0.08],
    [-0.08, 5.25, 0.14],
    [0.02, 6.20, 0.04],
  ];
  const trunkPath = catmullRomPath(trunkPts, 2);
  const trunkRadii = trunkPath.map((p, i) => {
    const t = i / (trunkPath.length - 1);
    const flare = p[1] < 1.6 ? 0.36 * Math.pow(Math.max(0, 1 - (p[1] + 0.8) / 2.4), 1.8) : 0;
    return 0.50 - 0.16 * t + flare;
  });
  barkGeos.push(remapUV(taperedTube(trunkPath, trunkRadii, { radialSegments: 9, creaseAngle: 180, cap: true }), { scale: [2.2, 4.0] }));

  // 2. Five seamless flared rainforest plank buttresses originating cleanly inside trunk core (r=0) and sweeping to Y=-0.80m
  const buttAngles = [0.20, 1.42, 2.62, 3.88, 5.14];
  for (let i = 0; i < buttAngles.length; i++) {
    const a = buttAngles[i] + rng.range(-0.14, 0.14);
    const reach = rng.range(0.96, 1.18);
    const topY = rng.range(1.90, 2.45);
    // Start embedded inside trunk core at topY and flare seamlessly with the root skirt
    const pts = [
      [0.04, topY, -0.02],
      [Math.cos(a) * (reach * 0.36), topY * 0.44, Math.sin(a) * (reach * 0.36)],
      [Math.cos(a) * (reach * 0.76), -0.04, Math.sin(a) * (reach * 0.76)],
      [Math.cos(a) * reach, -0.80, Math.sin(a) * reach],
    ];
    barkGeos.push(makeBranch(pts, 0.30, 0.16, 6, 2, [0.65, 1.55]));
  }

  // 3. Six wide spreading primary umbrella limbs + 12 forked secondary boughs
  // Calibrated so total bounds hit ~13.0m (X) x 12.3m (Y: -0.80 to +11.50) x 12.0m (Z)
  const limbs = [
    { ang: 0.05, reach: 3.35, startY: 5.10, endY: 8.15, r0: 0.25, r1: 0.10 },
    { ang: 1.08, reach: 3.62, startY: 5.35, endY: 8.50, r0: 0.23, r1: 0.095 },
    { ang: 2.04, reach: 3.72, startY: 5.20, endY: 8.05, r0: 0.24, r1: 0.10 },
    { ang: 3.14, reach: 3.40, startY: 5.00, endY: 8.25, r0: 0.25, r1: 0.10 },
    { ang: 4.18, reach: 3.65, startY: 5.45, endY: 8.60, r0: 0.23, r1: 0.095 },
    { ang: 5.20, reach: 3.68, startY: 5.25, endY: 8.00, r0: 0.23, r1: 0.095 },
  ];

  const subCrowns = [];
  for (let i = 0; i < limbs.length; i++) {
    const lb = limbs[i];
    const ca = Math.cos(lb.ang);
    const sa = Math.sin(lb.ang);
    const side = (i % 2 === 0 ? 1 : -1) * 0.36;
    const mx = ca * lb.reach * 0.54 - sa * side;
    const mz = sa * lb.reach * 0.54 + ca * side;
    const my = lb.startY + (lb.endY - lb.startY) * 0.58 + 0.32;
    const ex = ca * lb.reach;
    const ez = sa * lb.reach;
    const ey = lb.endY;

    barkGeos.push(makeBranch([[ca * 0.08, lb.startY, sa * 0.08], [mx, my, mz], [ex, ey, ez]], lb.r0, lb.r1, 6, 2));

    // Fork 1: outer spreading parasol bough
    const f1Ang = lb.ang - 0.34;
    const f1x = ex + Math.cos(f1Ang) * 1.08;
    const f1z = ez + Math.sin(f1Ang) * 0.98;
    const f1y = ey + rng.range(0.45, 0.88);
    barkGeos.push(makeBranch(
      [[mx * 0.28 + ex * 0.72, my * 0.28 + ey * 0.72, mz * 0.28 + ez * 0.72],
       [(ex + f1x) * 0.5, (ey + f1y) * 0.5 + 0.16, (ez + f1z) * 0.5],
       [f1x, f1y, f1z]],
      lb.r1 * 1.02, 0.044, 5, 2
    ));

    // Fork 2: upper-mid rising parasol bough
    const f2Ang = lb.ang + 0.38;
    const f2x = ex + Math.cos(f2Ang) * 0.95;
    const f2z = ez + Math.sin(f2Ang) * 0.88;
    const f2y = ey + rng.range(0.95, 1.45);
    barkGeos.push(makeBranch(
      [[ex * 0.86 + mx * 0.14, ey * 0.86 + my * 0.14, ez * 0.86 + mz * 0.14],
       [(ex + f2x) * 0.5, (ey + f2y) * 0.5 + 0.18, (ez + f2z) * 0.5],
       [f2x, f2y, f2z]],
      lb.r1 * 0.94, 0.042, 5, 2
    ));

    subCrowns.push({ pos: [f1x * 0.92, f1y - 0.10, f1z * 0.92], tier: 'outer' });
    subCrowns.push({ pos: [f2x * 0.84, f2y + 0.12, f2z * 0.84], tier: 'mid' });
  }

  // Central ascending crown leader forks supporting sunlit upper umbrella cap up to Y ~ 11.5m
  const apexForks = [
    { pts: [[0.0, 5.95, 0.04], [0.58, 7.70, -0.34], [1.28, 9.65, -0.68]], r0: 0.19, r1: 0.052 },
    { pts: [[0.0, 6.00, 0.04], [-0.68, 7.85, 0.42], [-1.32, 9.80, 0.72]], r0: 0.18, r1: 0.050 },
    { pts: [[0.0, 6.05, 0.04], [-0.18, 8.20, -0.42], [0.22, 10.20, -0.14]], r0: 0.16, r1: 0.046 },
  ];
  for (const af of apexForks) {
    barkGeos.push(makeBranch(af.pts, af.r0, af.r1, 5, 2));
  }

  // 4. LUSH, VOLUMETRIC, AIRY MULTI-TIER UMBRELLA CROWN (~276 curved bough sprays -> ~3,312 leaf tris!)
  // Organized into 15 distinct organic botanical billows with deliberate sunlit sky gaps between limb groups!
  const crownCenter = [0, 8.3, 0];
  const leafRng = rng.fork('canopy-sprays-v2');

  for (let i = 0; i < subCrowns.length; i++) {
    const sc = subCrowns[i];
    if (sc.tier === 'outer') {
      // 6 outer sub-crowns x (10 parasol + 7 billow) = 102 sprays
      addSubCrownDome(leafGeos, atlas, sc.pos, crownCenter, {
        parasolCount: 10,
        billowCount: 7,
        radSpread: 0.52,
        lenRange: [1.65, 2.20],
        widRange: [1.35, 1.85],
        regionOuter: ['bough_wide', 'bough_fringe', 'bough_under', 'bough_wide'],
        regionUpper: ['bough_wide', 'bough_crown', 'bough_fringe'],
        shadeMin: 0.78,
        shadeMax: 0.98,
      }, leafRng);
    } else {
      // 6 mid-upper sub-crowns x (9 parasol + 8 billow) = 102 sprays
      addSubCrownDome(leafGeos, atlas, sc.pos, crownCenter, {
        parasolCount: 9,
        billowCount: 8,
        radSpread: 0.48,
        lenRange: [1.55, 2.08],
        widRange: [1.30, 1.78],
        regionOuter: ['bough_wide', 'bough_crown', 'bough_fringe'],
        regionUpper: ['bough_crown', 'bough_wide', 'bough_crown'],
        shadeMin: 0.85,
        shadeMax: 1.0,
      }, leafRng);
    }
  }

  // Three sunlit apex crown billows reaching Y ~ 11.50m (3 x 18 = 54 sprays)
  const apexNodes = [
    [1.18, 9.75, -0.62],
    [-1.22, 9.90, 0.65],
    [0.20, 10.28, -0.10],
  ];
  for (const ap of apexNodes) {
    addSubCrownDome(leafGeos, atlas, ap, crownCenter, {
      parasolCount: 10,
      billowCount: 8,
      radSpread: 0.46,
      lenRange: [1.45, 1.98],
      widRange: [1.28, 1.72],
      regionOuter: ['bough_wide', 'bough_crown', 'bough_fringe'],
      regionUpper: ['bough_crown', 'bough_crown', 'bough_fringe'],
      shadeMin: 0.90,
      shadeMax: 1.0,
    }, leafRng);
  }

  // 18 delicate underside-fork bough accents gripping mid-limbs so look-up views feel richly clothed while preserving open sky windows!
  for (let i = 0; i < limbs.length; i++) {
    const lb = limbs[i];
    const ux = Math.cos(lb.ang) * (lb.reach * 0.62);
    const uz = Math.sin(lb.ang) * (lb.reach * 0.62);
    const uy = lb.startY + (lb.endY - lb.startY) * 0.70;
    addSubCrownDome(leafGeos, atlas, [ux, uy, uz], crownCenter, {
      parasolCount: 3,
      billowCount: 1,
      radSpread: 0.30,
      lenRange: [1.30, 1.75],
      widRange: [1.05, 1.45],
      regionOuter: ['bough_under', 'bough_fringe'],
      regionUpper: ['bough_wide'],
      shadeMin: 0.74,
      shadeMax: 0.88,
    }, leafRng);
  }

  const mergedBark = mergeGeos(barkGeos);
  const mergedLeaves = mergeGeos(leafGeos);

  createPart('CanopyBark', mergedBark, barkMat, { parent: root });
  const leavesPart = createPart('CanopyLeaves', mergedLeaves, leafMat, { parent: root });
  markOpenShell(leavesPart, 'Double-sided curved alpha-cutout rainforest canopy bough spray cards');

  return root;
}
