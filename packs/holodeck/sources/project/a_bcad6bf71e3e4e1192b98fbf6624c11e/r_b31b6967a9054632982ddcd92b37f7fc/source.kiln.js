const meta = { name: 'waterside-stone-dock', role: 'ground' };

// ============================================================================
// Lagoon Sanctuary — Stepped Waterside Stone Jetty & Carved Corner Bollards
// Orientation: +X forward (toward turquoise water), +Y up, +Z right
// Pivot Y = 0.00m = bottom water-edge stone jetty deck surface!
// 6 Broad Stone Steps along X in [-2.40, 0.00], Z in [-1.35, +1.35]:
//   Climbs from Y = 0.00m at X = 0.00 UP to Y = +1.25m at X = -2.40 (0.2083m rise x 0.40m tread)
// Jetty Platform: X in [0.00, +3.20], Z in [-1.60, +1.60], top Y = 0.00m, foundation to Y = -1.60m
// Two Carved Corner Stone Bollards at X = +2.85, Z = ±1.25 (0.44 x 0.72 x 0.44m above deck)
// Low Weathered Stone Kerb Rail along -Z stair cheek (0.55m high) with sculpted moss patches.
// ZERO water geometry.
// ============================================================================

function rockNoise3(x, y, z, seedOffset) {
  const s = seedOffset || 0;
  const n1 = Math.sin(x * 7.3 + y * 5.1 + s) * Math.cos(z * 6.7 - y * 4.3 + s * 1.7);
  const n2 = Math.sin(x * 17.9 - z * 14.3 + y * 11.7 + s * 2.3) * 0.5;
  const n3 = Math.cos(x * 31.1 + y * 27.7 + z * 23.9 - s * 0.9) * 0.25;
  return (n1 + n2 + n3) / 1.75;
}

function buildWeatheredBlock(w, h, d, opts) {
  const o = opts || {};
  const sx = o.sx || 3;
  const sy = o.sy || 2;
  const sz = o.sz || 3;
  const bevel = Math.min(o.bevel != null ? o.bevel : 0.018, Math.min(w, h, d) * 0.35);
  const erode = o.erode != null ? o.erode : 0.008;
  const seed = o.seed || 11;
  const flatTop = o.flatTop || false;
  const flatTopTol = o.flatTopTol != null ? o.flatTopTol : 0.004;
  const taperTop = o.taperTop != null ? o.taperTop : 1.0;

  const baseGeo = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const pos = baseGeo.attributes.position;
  const hw = w * 0.5;
  const hh = h * 0.5;
  const hd = d * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    if (taperTop !== 1.0) {
      const ty = (y + hh) / h;
      const sc = 1.0 + (taperTop - 1.0) * ty;
      x *= sc;
      z *= sc;
    }

    const isTopSurface = y > hh - 0.002;
    const dx = Math.max(0, Math.abs(x) - (hw - bevel));
    const dy = Math.max(0, Math.abs(y) - (hh - bevel));
    const dz = Math.max(0, Math.abs(z) - (hd - bevel));
    const edgeSum = (dx > 0 ? 1 : 0) + (dy > 0 ? 1 : 0) + (dz > 0 ? 1 : 0);
    if (edgeSum >= 2 && bevel > 0) {
      const pull = bevel * 0.38;
      const fx = dx / bevel;
      const fy = dy / bevel;
      const fz = dz / bevel;
      if (dx > 0 && dy > 0) {
        const c = fx * fy * pull;
        x -= Math.sign(x) * c;
        y -= Math.sign(y) * (flatTop && y > 0 ? c * 0.72 : c);
      }
      if (dy > 0 && dz > 0) {
        const c = fy * fz * pull;
        y -= Math.sign(y) * (flatTop && y > 0 ? c * 0.72 : c);
        z -= Math.sign(z) * c;
      }
      if (dx > 0 && dz > 0) {
        const c = fx * fz * pull;
        x -= Math.sign(x) * c;
        z -= Math.sign(z) * c;
      }
    }

    if (erode > 0) {
      const nx = rockNoise3(x + 1.3, y - 0.7, z + 2.1, seed);
      const ny = rockNoise3(x - 2.1, y + 1.9, z - 0.4, seed + 17);
      const nz = rockNoise3(x + 0.5, y + 2.7, z - 1.8, seed + 37);
      x += nx * erode;
      if (flatTop && isTopSurface) {
        y += ny * flatTopTol;
      } else {
        y += ny * erode * 0.6;
      }
      z += nz * erode;
    }

    if (o.clampBounds) {
      x = Math.max(-hw, Math.min(hw, x));
      y = Math.max(-hh, Math.min(hh, y));
      z = Math.max(-hd, Math.min(hd, z));
    }

    pos.setXYZ(i, x, y, z);
  }

  const uvGeo = projectUV(baseGeo, {
    projection: 'box',
    metersPerUnit: o.metersPerUnit || 1.05,
    frame: { origin: [o.uvOffsetX || 0, o.uvOffsetY || 0, o.uvOffsetZ || 0] },
  });
  return creaseNormals(uvGeo, { angle: o.creaseAngle || 48 });
}

function buildMossCushion(rx, ry, rz, seed, opts) {
  const o = opts || {};
  const wSeg = o.wSeg || 8;
  const hSeg = o.hSeg || 5;
  const drape = o.drape || 0.0;
  const baseGeo = new THREE.SphereGeometry(1, wSeg, hSeg);
  const pos = baseGeo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    if (y < 0) {
      y *= 0.25;
    } else {
      y = Math.pow(y, 0.78);
    }

    const rHoriz = Math.hypot(x, z);
    const n1 = rockNoise3(x * 1.8, y * 1.5, z * 1.8, seed);
    const n2 = rockNoise3(x * 4.2, y * 3.6, z * 4.2, seed + 53) * 0.42;
    const lump = 1.0 + (n1 * 0.22 + n2 * 0.14);

    let px = x * rx * lump;
    let py = y * ry * (1.0 + n1 * 0.24 + n2 * 0.15);
    let pz = z * rz * lump;

    if (drape > 0 && rHoriz > 0.65 && y <= 0.15) {
      py -= drape * Math.pow((rHoriz - 0.65) / 0.35, 1.5) * (0.7 + 0.3 * Math.max(0, n1));
    }

    pos.setXYZ(i, px, py, pz);
  }

  const uvGeo = projectUV(baseGeo, { projection: 'box', metersPerUnit: 0.45 });
  return creaseNormals(uvGeo, { angle: 85 });
}

function mergeEntries(entries) {
  let totalVerts = 0;
  const prepared = [];
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vPos = new THREE.Vector3();
  const vSc = new THREE.Vector3();
  const nMat = new THREE.Matrix3();
  const vTmp = new THREE.Vector3();
  const nTmp = new THREE.Vector3();

  for (let i = 0; i < entries.length; i++) {
    const ent = entries[i];
    const g = ent.geo.index ? ent.geo.toNonIndexed() : ent.geo;
    const count = g.attributes.position.count;
    totalVerts += count;
    prepared.push({ ent, g, count });
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  let vOffset = 0;
  for (let i = 0; i < prepared.length; i++) {
    const { ent, g, count } = prepared[i];
    const p = ent.pos || [0, 0, 0];
    const r = ent.rot || [0, 0, 0];
    const s = ent.scale || [1, 1, 1];
    vPos.set(p[0], p[1], p[2]);
    eul.set(
      (r[0] * Math.PI) / 180,
      (r[1] * Math.PI) / 180,
      (r[2] * Math.PI) / 180,
      'XYZ'
    );
    q.setFromEuler(eul);
    vSc.set(s[0], s[1], s[2]);
    mat4.compose(vPos, q, vSc);
    nMat.getNormalMatrix(mat4);

    const posAttr = g.attributes.position;
    const normAttr = g.attributes.normal;
    const uvAttr = g.attributes.uv;
    const baseCol = ent.color || [1, 1, 1];

    for (let j = 0; j < count; j++) {
      vTmp.set(posAttr.getX(j), posAttr.getY(j), posAttr.getZ(j)).applyMatrix4(mat4);
      if (normAttr) {
        nTmp.set(normAttr.getX(j), normAttr.getY(j), normAttr.getZ(j)).applyMatrix3(nMat).normalize();
      } else {
        nTmp.set(0, 1, 0);
      }

      const idx3 = (vOffset + j) * 3;
      const idx2 = (vOffset + j) * 2;
      positions[idx3] = vTmp.x;
      positions[idx3 + 1] = vTmp.y;
      positions[idx3 + 2] = vTmp.z;

      normals[idx3] = nTmp.x;
      normals[idx3 + 1] = nTmp.y;
      normals[idx3 + 2] = nTmp.z;

      if (uvAttr) {
        uvs[idx2] = uvAttr.getX(j);
        uvs[idx2 + 1] = uvAttr.getY(j);
      }

      let cr = baseCol[0];
      let cg = baseCol[1];
      let cb = baseCol[2];
      if (ent.colorFn) {
        const mod = ent.colorFn(vTmp.x, vTmp.y, vTmp.z, nTmp.x, nTmp.y, nTmp.z);
        cr *= mod[0];
        cg *= mod[1];
        cb *= mod[2];
      }
      colors[idx3] = Math.max(0.05, Math.min(1.0, cr));
      colors[idx3 + 1] = Math.max(0.05, Math.min(1.0, cg));
      colors[idx3 + 2] = Math.max(0.05, Math.min(1.0, cb));
    }
    vOffset += count;
  }

  const out = meshGeo({
    positions: Array.from(positions),
    normals: Array.from(normals),
    uvs: Array.from(uvs),
  });
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return out;
}

function createSanctuaryMaterials() {
  const packedMR = (roughByte) => (255 << 16) | (roughByte << 8);

  const stoneBeds = { cellsX: 5, cellsY: 9, seed: 41, jitterX: 0.72, jitterY: 0.34, metricY: 1.75, weight: 0.22 };
  const stoneFacets = { ...stoneBeds, feature: 'facet', facetSlope: 0.55, facetBlend: 0.32 };
  const stoneCracks = { ...stoneBeds, feature: 'border', borderOpen: 0.42, borderWidth: 0.030, blend: 'multiply' };

  const limestoneAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'LimestoneWeatheredAlbedo',
    layers: [
      { op: 'cellular', ...stoneBeds, feature: 'cell', colorA: 0xb5ab94, colorB: 0xd0c6ae },
      { op: 'noise', colorA: 0x9c927d, colorB: 0xddd4be, scale: 18, octaves: 5, seed: 42, blend: 'overlay', opacity: 0.44 },
      { op: 'noise', colorA: 0x827966, colorB: 0xede6d5, scale: 48, octaves: 4, seed: 43, blend: 'overlay', opacity: 0.28 },
      { op: 'cellular', ...stoneFacets, colorA: 0xb8b0a0, colorB: 0xffffff, blend: 'multiply', opacity: 0.26 },
      { op: 'cellular', ...stoneCracks, colorA: 0xffffff, colorB: 0x6f6757, opacity: 0.65 },
    ],
  });
  const limestoneHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'LimestoneWeatheredHeight',
    layers: [
      { op: 'cellular', ...stoneFacets, colorA: 0x555555, colorB: 0xe6e6e6 },
      { op: 'noise', colorA: 0x404040, colorB: 0xd8d8d8, scale: 26, octaves: 5, seed: 42, blend: 'overlay', opacity: 0.55 },
      { op: 'cellular', ...stoneCracks, colorA: 0xffffff, colorB: 0x101010 },
    ],
  });
  const limestoneMR = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'metallicRoughness',
    name: 'LimestoneWeatheredMR',
    layers: [
      { op: 'cellular', ...stoneBeds, feature: 'cell', colorA: packedMR(217), colorB: packedMR(235) },
      { op: 'noise', colorA: packedMR(214), colorB: packedMR(238), scale: 14, octaves: 3, seed: 44, blend: 'overlay', opacity: 0.35 },
    ],
  });
  const limestoneMat = pbrMaterial({
    albedo: limestoneAlbedo,
    normal: normalMapFromHeight(limestoneHeight, { strength: 4.5, name: 'LimestoneWeatheredNormal' }),
    metallicRoughness: limestoneMR,
    roughness: 1,
    metalness: 0,
    name: 'LimestoneWeathered',
  });
  limestoneMat.vertexColors = true;

  const groutAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'CarvedGroutAlbedo',
    layers: [
      { op: 'solid', color: 0x847b69 },
      { op: 'noise', colorA: 0x5d5648, colorB: 0xa29884, scale: 22, octaves: 5, seed: 61, blend: 'overlay', opacity: 0.52 },
      { op: 'cellular', cellsX: 8, cellsY: 8, seed: 62, jitterX: 0.85, jitterY: 0.85, feature: 'f2-f1', range: 0.35, colorA: 0x696152, colorB: 0x998f7c, blend: 'multiply', opacity: 0.42 },
    ],
  });
  const groutMat = pbrMaterial({
    albedo: groutAlbedo,
    normal: normalMapFromHeight(groutAlbedo, { strength: 5.0, name: 'CarvedGroutNormal' }),
    roughness: 0.90,
    metalness: 0,
    name: 'CarvedReliefGrout',
  });
  groutMat.vertexColors = true;

  const dampBeds = { cellsX: 6, cellsY: 10, seed: 71, jitterX: 0.75, jitterY: 0.35, metricY: 1.85, weight: 0.25 };
  const dampFacets = { ...dampBeds, feature: 'facet', facetSlope: 0.65, facetBlend: 0.28 };
  const dampCracks = { ...dampBeds, feature: 'border', borderOpen: 0.55, borderWidth: 0.035, blend: 'multiply' };
  const dampAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DampLowerMasonryAlbedo',
    layers: [
      { op: 'cellular', ...dampBeds, feature: 'cell', colorA: 0x626052, colorB: 0x7c796a },
      { op: 'noise', colorA: 0x4b4c40, colorB: 0x908c7a, scale: 16, octaves: 5, seed: 72, blend: 'overlay', opacity: 0.48 },
      { op: 'cellular', ...dampCracks, colorA: 0xffffff, colorB: 0x3b3a31, opacity: 0.72 },
    ],
  });
  const dampHeight = proceduralTexture({
    schemaVersion: 2,
    size: 512,
    usage: 'albedo',
    name: 'DampLowerMasonryHeight',
    layers: [
      { op: 'cellular', ...dampFacets, colorA: 0x454545, colorB: 0xdfdfdf },
      { op: 'noise', colorA: 0x383838, colorB: 0xd0d0d0, scale: 24, octaves: 4, seed: 73, blend: 'overlay', opacity: 0.5 },
      { op: 'cellular', ...dampCracks, colorA: 0xffffff, colorB: 0x101010 },
    ],
  });
  const dampMat = pbrMaterial({
    albedo: dampAlbedo,
    normal: normalMapFromHeight(dampHeight, { strength: 5.2, name: 'DampLowerMasonryNormal' }),
    roughness: 0.78,
    metalness: 0,
    name: 'DampLowerMasonry',
  });
  dampMat.vertexColors = true;

  const mossAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'VelvetMossAlbedo',
    layers: [
      { op: 'solid', color: 0x4a6e31 },
      { op: 'cellular', cellsX: 18, cellsY: 18, seed: 91, jitterX: 0.9, jitterY: 0.9, feature: 'f1', range: 0.85, colorA: 0x5c833c, colorB: 0x314e20, blend: 'overlay', opacity: 0.65 },
      { op: 'noise', colorA: 0x2c471d, colorB: 0x6f9449, scale: 36, octaves: 5, seed: 92, blend: 'overlay', opacity: 0.55 },
    ],
  });
  const mossMat = pbrMaterial({
    albedo: mossAlbedo,
    normal: normalMapFromHeight(mossAlbedo, { strength: 6.5, name: 'VelvetMossNormal' }),
    roughness: 0.92,
    metalness: 0,
    name: 'VelvetStoneMoss',
  });
  mossMat.vertexColors = true;

  return { limestoneMat, groutMat, dampMat, mossMat };
}

async function build() {
  const root = createRoot('WatersideStoneDock');
  const rng = seededRandom('waterside-stone-dock-v1');
  const mats = createSanctuaryMaterials();

  const limestoneParts = [];
  const groutParts = [];
  const dampParts = [];
  const mossParts = [];

  const stoneTint = (tone, warm) => (x, y, z, nx, ny, nz) => {
    const up = ny > 0.4 ? 1.03 : (ny < -0.3 ? 0.82 : 0.96);
    const wb = warm || 0;
    // Slightly cooler/damper right near water level (Y <= 0.15)
    const dampCool = y < 0.20 ? 0.94 : 1.0;
    return [
      tone * up * dampCool * (1.0 + wb * 0.04),
      tone * up * dampCool * (1.0 + wb * 0.01),
      tone * up * (0.97 + (1 - dampCool) * 0.4),
    ];
  };

  const dampTint = (tone) => (x, y, z, nx, ny, nz) => {
    // Rich water-stained vertical gradient from underwater (-1.60) to splash zone (-0.15)
    const h = Math.max(0, Math.min(1, (y + 1.60) / 1.60));
    const v = tone * (0.70 + 0.34 * h);
    return [v * 0.94, v * 0.98, v * 0.92];
  };

  const mossTint = (tone) => (x, y, z, nx, ny, nz) => {
    const top = Math.max(0, Math.min(1, (ny + 0.35) / 1.35));
    return [
      tone * (0.68 + 0.44 * top),
      tone * (0.72 + 0.38 * top),
      tone * (0.64 + 0.32 * top),
    ];
  };

  // -------------------------------------------------------------------------
  // 1. SOLID DAMP MASONRY JETTY FOUNDATION & UNDERWATER STEPPED WALLS
  //    X in [0.00, +3.20], Z in [-1.60, +1.60], Y down to -1.60m!
  // -------------------------------------------------------------------------
  // Lower submerged stepped plinth base (Y = -1.60 .. -0.96, overlaps cleanly back to X = -0.14 into stair base!)
  dampParts.push({
    geo: buildWeatheredBlock(3.32, 0.66, 3.18, {
      sx: 5, sy: 3, sz: 5, bevel: 0.028, erode: 0.016, seed: 101, taperTop: 0.98, clampBounds: true, metersPerUnit: 1.25,
    }),
    pos: [1.53, -1.27, 0],
    colorFn: dampTint(0.92),
  });

  // Main damp masonry jetty core (Y = -0.98 .. -0.14, overlaps cleanly back to X = -0.16 into stair foundation -> ZERO seam!)
  dampParts.push({
    geo: buildWeatheredBlock(3.26, 0.84, 3.04, {
      sx: 5, sy: 3, sz: 5, bevel: 0.024, erode: 0.013, seed: 102, clampBounds: true, metersPerUnit: 1.2,
    }),
    pos: [1.47, -0.56, 0],
    colorFn: dampTint(0.98),
  });

  // Coursed projecting damp ashlar blocks wrapping the 3 exposed water faces (+X, +Z, -Z) of the jetty!
  const wallCourses = [
    { y: -0.42, h: 0.38, out: 0.06, seed: 110, tone: 1.01 },
    { y: -0.82, h: 0.38, out: 0.09, seed: 130, tone: 0.94 },
  ];
  for (let c = 0; c < wallCourses.length; c++) {
    const wc = wallCourses[c];
    // +Z and -Z side ashlar blocks along X = 0.05..3.10
    const xRuns = c === 0 ? [0.06, 0.88, 1.72, 2.48, 3.12] : [0.06, 0.65, 1.48, 2.26, 3.12];
    for (let sgnZ = -1; sgnZ <= 1; sgnZ += 2) {
      for (let i = 0; i < xRuns.length - 1; i++) {
        const bx = (xRuns[i] + xRuns[i + 1]) * 0.5;
        const bw = (xRuns[i + 1] - xRuns[i]) - 0.024;
        dampParts.push({
          geo: buildWeatheredBlock(bw, wc.h, 0.16, {
            sx: 2, sy: 2, sz: 1, bevel: 0.020, erode: 0.010, seed: wc.seed + i + (sgnZ > 0 ? 10 : 0), clampBounds: true,
          }),
          pos: [bx, wc.y, sgnZ * (1.49 + wc.out * 0.5 + (i % 2) * 0.008)],
          colorFn: dampTint(wc.tone + (i % 3 - 1) * 0.04),
        });
      }
    }
    // +X water-end face ashlar blocks along Z = -1.48..+1.48
    const zRuns = c === 0 ? [-1.48, -0.68, 0.14, 0.88, 1.48] : [-1.48, -0.90, -0.06, 0.76, 1.48];
    for (let i = 0; i < zRuns.length - 1; i++) {
      const bz = (zRuns[i] + zRuns[i + 1]) * 0.5;
      const bd = (zRuns[i + 1] - zRuns[i]) - 0.024;
      dampParts.push({
        geo: buildWeatheredBlock(0.16, wc.h, bd, {
          sx: 1, sy: 2, sz: 2, bevel: 0.020, erode: 0.010, seed: wc.seed + 20 + i, clampBounds: true,
        }),
        pos: [3.08 + wc.out * 0.5 + (i % 2) * 0.008, wc.y, bz],
        colorFn: dampTint(wc.tone + (i % 3 - 1) * 0.04),
      });
    }
  }

  // Carved overhanging weathered limestone drip cornice band right below jetty deck (Y = -0.24 .. -0.11)
  limestoneParts.push({
    geo: buildWeatheredBlock(3.20, 0.135, 3.20, {
      sx: 5, sy: 2, sz: 5, bevel: 0.020, erode: 0.009, seed: 160, clampBounds: true,
    }),
    pos: [1.60, -0.175, 0],
    colorFn: stoneTint(0.86, -0.3),
  });

  // -------------------------------------------------------------------------
  // 2. WATERSIDE STONE JETTY DECK FLAGSTONES (X in [0.00, +3.20], Z in [-1.60, +1.60], Y = 0.00m!)
  // -------------------------------------------------------------------------
  // Recessed mortar bed strictly below flagstone top (top at Y = -0.024)
  groutParts.push({
    geo: buildWeatheredBlock(3.12, 0.12, 3.12, { sx: 3, sy: 1, sz: 3, bevel: 0.008, erode: 0.003, seed: 170 }),
    pos: [1.60, -0.085, 0],
    color: [0.78, 0.76, 0.72],
  });

  const deckRng = rng.fork('jetty-deck');
  const deckRowsX = [0.00, 0.66, 1.32, 1.98, 2.60, 3.20];
  for (let rx = 0; rx < deckRowsX.length - 1; rx++) {
    const x0 = deckRowsX[rx];
    const x1 = deckRowsX[rx + 1];
    const zSplits = (rx % 2 === 0)
      ? [-1.60, -0.94, -0.24, 0.44, 1.06, 1.60]
      : [-1.60, -1.08, -0.44, 0.24, 0.92, 1.60];
    for (let rz = 0; rz < zSplits.length - 1; rz++) {
      const z0 = zSplits[rz];
      const z1 = zSplits[rz + 1];
      const gap = 0.015;
      const sw = (x1 - x0) - gap;
      const sd = (z1 - z0) - gap;
      const th = 0.135 + deckRng.range(-0.006, 0.005);
      // Strictly within [-0.006, +0.006]m of Y = 0.00m!
      const dy = deckRng.range(-0.006, 0.006);
      const cx = (x0 + x1) * 0.5;
      const cz = (z0 + z1) * 0.5;
      const isEdge = (rx === deckRowsX.length - 2 || rz === 0 || rz === zSplits.length - 2);
      const tone = deckRng.range(isEdge ? 0.87 : 0.91, isEdge ? 1.01 : 1.06);

      limestoneParts.push({
        geo: buildWeatheredBlock(sw, th, sd, {
          sx: 2, sy: 1, sz: 2, bevel: 0.015, erode: 0.006, flatTop: true, flatTopTol: 0.004,
          seed: 200 + rx * 17 + rz, clampBounds: true, uvOffsetX: cx, uvOffsetZ: cz, metersPerUnit: 1.0,
        }),
        pos: [cx, dy - th * 0.5, cz],
        colorFn: stoneTint(tone, deckRng.range(-0.6, 0.6)),
      });

      // Subtle edge-joint moss along deck perimeter crevices (keeps central walkway unobstructed!)
      if (isEdge && deckRng.next() < 0.32) {
        mossParts.push({
          geo: buildMossCushion(deckRng.range(0.08, 0.15), 0.022, deckRng.range(0.07, 0.12), 260 + rx * 13 + rz, { wSeg: 7, hSeg: 4, drape: 0.015 }),
          pos: [cx + (rx === deckRowsX.length - 2 ? sw * 0.35 : 0), -0.004, rz === 0 ? -1.48 : (rz === zSplits.length - 2 ? 1.48 : cz)],
          colorFn: mossTint(deckRng.range(0.92, 1.06)),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. SIX BROAD DESCENDING STONE STEPS (X in [-2.40, 0.00], Z in [-1.35, +1.35])
  //    Climbs from Y = 0.00m at X = 0.00 UP to Y = +1.25m at X = -2.40!
  //    Each tread: 0.40m deep, 0.20833m rise!
  // -------------------------------------------------------------------------
  const stepRng = rng.fork('dock-steps');
  const numSteps = 6;
  const treadLen = 0.40;
  const stepRise = 1.25 / numSteps; // 0.208333...m

  for (let s = 0; s < numSteps; s++) {
    // s = 0 is lowest step next to deck (X in [-0.40, 0.00], topY = 0.2083m)
    // s = 5 is topmost step meeting viewing landing (X in [-2.40, -2.00], topY = 1.250m)
    const x1 = -s * treadLen;
    const x0 = x1 - treadLen;
    const topY = (s + 1) * stepRise;
    const cx = (x0 + x1) * 0.5;

    // Solid damp masonry stair foundation directly underneath each step all the way down to Y = -1.60m!
    const foundTop = topY - 0.11;
    const foundH = foundTop - (-1.60);
    dampParts.push({
      geo: buildWeatheredBlock(treadLen + 0.04, foundH, 2.74, {
        sx: 2, sy: 3, sz: 4, bevel: 0.020, erode: 0.012, seed: 300 + s * 5, clampBounds: true, metersPerUnit: 1.2,
      }),
      pos: [cx - 0.01, -1.60 + foundH * 0.5, 0],
      colorFn: dampTint(0.94 + (s % 2) * 0.04),
    });

    // Recessed grout bed directly beneath step treads
    groutParts.push({
      geo: buildWeatheredBlock(treadLen - 0.02, 0.16, 2.66, { sx: 1, sy: 1, sz: 3, bevel: 0.008, erode: 0.003, seed: 350 + s }),
      pos: [cx - 0.015, topY - 0.105, 0],
      color: [0.77, 0.75, 0.71],
    });

    // Individual carved weathered flagstone tread slabs across Z in [-1.35, +1.35]
    const zSplits = (s % 2 === 0)
      ? [-1.35, -0.58, 0.18, 0.88, 1.35]
      : [-1.35, -0.78, -0.06, 0.68, 1.35];
    for (let k = 0; k < zSplits.length - 1; k++) {
      const zs0 = zSplits[k];
      const zs1 = zSplits[k + 1];
      const slabZ = (zs1 - zs0) - 0.020;
      const slabX = treadLen + 0.018; // subtle 1.8cm overhanging nosing lip!
      const slabH = 0.125;
      const dy = stepRng.range(-0.005, 0.005);
      const cz = (zs0 + zs1) * 0.5;
      const tone = stepRng.range(0.90, 1.07);

      limestoneParts.push({
        geo: buildWeatheredBlock(slabX, slabH, slabZ, {
          sx: 2, sy: 1, sz: 2, bevel: 0.020, erode: 0.006, flatTop: true, flatTopTol: 0.003,
          seed: 400 + s * 20 + k, clampBounds: true, uvOffsetX: cx, uvOffsetZ: cz, metersPerUnit: 1.0,
        }),
        pos: [cx + 0.008, topY + dy - slabH * 0.5, cz],
        colorFn: stoneTint(tone, stepRng.range(-0.6, 0.6)),
      });

      // Carved stone riser block tucked beneath each tread overhang
      limestoneParts.push({
        geo: buildWeatheredBlock(0.065, stepRise - 0.06, slabZ - 0.01, {
          sx: 1, sy: 1, sz: 2, bevel: 0.010, erode: 0.005, seed: 460 + s * 20 + k, clampBounds: true,
        }),
        pos: [x1 - 0.036, topY - slabH * 0.5 - stepRise * 0.44, cz],
        colorFn: stoneTint(tone * 0.90, -0.2),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. TWO CARVED CORNER STONE BOLLARDS AT X = +2.85, Z = ±1.25
  //    Dimensions: 0.44m x 0.72m x 0.44m above deck (Y = 0.00 .. +0.72m)!
  // -------------------------------------------------------------------------
  const bollardZs = [-1.25, 1.25];
  for (let b = 0; b < 2; b++) {
    const bx = 2.85;
    const bz = bollardZs[b];
    const sd = 520 + b * 40;

    // Stepped chamfered stone plinth base (0.44 x 0.14 x 0.44m, Y = -0.02 .. +0.14)
    limestoneParts.push({
      geo: buildWeatheredBlock(0.44, 0.16, 0.44, {
        sx: 3, sy: 2, sz: 3, bevel: 0.020, erode: 0.008, seed: sd, clampBounds: true,
      }),
      pos: [bx, 0.06, bz],
      colorFn: stoneTint(0.92, -0.2),
    });

    // Recessed carved shadow band core (0.31 x 0.44 x 0.31m, Y = 0.13 .. 0.57)
    groutParts.push({
      geo: buildWeatheredBlock(0.31, 0.44, 0.31, { sx: 2, sy: 2, sz: 2, bevel: 0.008, erode: 0.003, seed: sd + 1 }),
      pos: [bx, 0.35, bz],
      color: [0.76, 0.74, 0.70],
    });

    // 4 Corner stone pilasters around bollard shaft (outer span 0.38m)
    const bCorners = [[-0.145, -0.145], [0.145, -0.145], [-0.145, 0.145], [0.145, 0.145]];
    for (let c = 0; c < 4; c++) {
      limestoneParts.push({
        geo: buildWeatheredBlock(0.095, 0.425, 0.095, {
          sx: 2, sy: 2, sz: 2, bevel: 0.012, erode: 0.005, seed: sd + 4 + c, clampBounds: true,
        }),
        pos: [bx + bCorners[c][0], 0.35, bz + bCorners[c][1]],
        colorFn: stoneTint(0.98 + (c % 2) * 0.03, 0.2),
      });
    }

    // Carved Mayan stepped relief frame & central glyph boss on all 4 sides of bollard shaft!
    // Solid horizontal stone collars + proud stepped relief (distinct X depths -> ZERO FLUSH_FACES!)
    limestoneParts.push({
      geo: buildWeatheredBlock(0.37, 0.058, 0.37, { sx: 2, sy: 1, sz: 2, bevel: 0.010, erode: 0.004, seed: sd + 9, clampBounds: true }),
      pos: [bx, 0.175, bz],
      colorFn: stoneTint(0.95, 0.05),
    });
    limestoneParts.push({
      geo: buildWeatheredBlock(0.37, 0.058, 0.37, { sx: 2, sy: 1, sz: 2, bevel: 0.010, erode: 0.004, seed: sd + 10, clampBounds: true }),
      pos: [bx, 0.525, bz],
      colorFn: stoneTint(0.97, 0.1),
    });
    for (let f = 0; f < 4; f++) {
      const rotY = f * 90;
      const tab = buildWeatheredBlock(0.050, 0.25, 0.21, {
        sx: 1, sy: 2, sz: 2, bevel: 0.011, erode: 0.003, seed: sd + 12 + f, clampBounds: true,
      });
      tab.translate(0.162, 0, 0);
      const boss = buildWeatheredBlock(0.030, 0.125, 0.105, {
        sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.002, seed: sd + 16 + f, clampBounds: true,
      });
      boss.translate(0.184, 0, 0);
      limestoneParts.push(
        { geo: tab, rot: [0, rotY, 0], pos: [bx, 0.35, bz], colorFn: stoneTint(0.99, 0.18) },
        { geo: boss, rot: [0, rotY, 0], pos: [bx, 0.35, bz], colorFn: stoneTint(1.05, 0.25) }
      );
    }

    // Stepped overhanging carved stone cap (0.44 x 0.155 x 0.44m, Y = 0.565 .. 0.720m!)
    limestoneParts.push({
      geo: buildWeatheredBlock(0.44, 0.155, 0.44, {
        sx: 3, sy: 2, sz: 3, bevel: 0.022, erode: 0.009, seed: sd + 20, taperTop: 0.94, clampBounds: true,
      }),
      pos: [bx, 0.642, bz],
      colorFn: stoneTint(1.01, 0.1),
    });

    // Subtle sculpted moss cap edge cushion & base tuft
    mossParts.push({
      geo: buildMossCushion(0.12, 0.038, 0.11, sd + 25, { wSeg: 7, hSeg: 5, drape: 0.025 }),
      pos: [bx - 0.08, 0.722, bz + (b === 0 ? -0.07 : 0.07)],
      colorFn: mossTint(1.02 + b * 0.04),
    });
    mossParts.push({
      geo: buildMossCushion(0.10, 0.030, 0.10, sd + 26, { wSeg: 6, hSeg: 4 }),
      pos: [bx - 0.20, 0.005, bz + (b === 0 ? 0.16 : -0.16)],
      colorFn: mossTint(0.94),
    });
  }

  // -------------------------------------------------------------------------
  // 5. LOW WEATHERED STONE KERB RAIL ALONG -Z STAIR CHEEK (0.55m high!)
  //    Plus a subtle low outer curb cheek on +Z stair side!
  // -------------------------------------------------------------------------
  const kerbZ = -1.42; // spans Z in [-1.58, -1.26] (0.32m thick)
  for (let s = 0; s < numSteps; s++) {
    const x1 = -s * treadLen;
    const x0 = x1 - treadLen;
    const stepTop = (s + 1) * stepRise;
    const kerbTop = stepTop + 0.55; // EXACT 0.55m above each step!
    const kerbBase = stepTop - 0.18;
    const kh = kerbTop - kerbBase;
    const cx = (x0 + x1) * 0.5;
    const sd = 620 + s * 10;

    // Recessed grout core inside kerb step
    groutParts.push({
      geo: buildWeatheredBlock(treadLen - 0.02, kh - 0.08, 0.24, { sx: 1, sy: 2, sz: 1, bevel: 0.007, erode: 0.003, seed: sd }),
      pos: [cx, (kerbTop + kerbBase) * 0.5, kerbZ],
      color: [0.78, 0.76, 0.72],
    });
    // Lower kerb stone course & upright framing rib
    limestoneParts.push({
      geo: buildWeatheredBlock(treadLen - 0.006, kh - 0.10, 0.30, {
        sx: 2, sy: 2, sz: 2, bevel: 0.018, erode: 0.008, seed: sd + 1, clampBounds: true,
      }),
      pos: [cx, (kerbTop + kerbBase) * 0.5 - 0.04, kerbZ],
      colorFn: stoneTint(0.94 + (s % 2) * 0.04, 0.1),
    });
    // Bevelled stone coping cap on top of each stepped kerb bay
    limestoneParts.push({
      geo: buildWeatheredBlock(treadLen + 0.022, 0.105, 0.36, {
        sx: 2, sy: 1, sz: 2, bevel: 0.018, erode: 0.008, seed: sd + 3, clampBounds: true,
      }),
      pos: [cx, kerbTop - 0.052, kerbZ],
      colorFn: stoneTint(1.01, 0.15),
    });
    // Organic asymmetric multi-lobe moss clusters draping over select kerb step creases (not identical green dots!)
    if (s === 0 || s === 3) {
      mossParts.push({
        geo: buildMossCushion(0.16, 0.046, 0.13, sd + 6, { wSeg: 8, hSeg: 5, drape: 0.04 }),
        pos: [x0 + 0.14, kerbTop + 0.004, kerbZ - 0.05],
        colorFn: mossTint(0.97 + (s % 2) * 0.07),
      });
      mossParts.push({
        geo: buildMossCushion(0.11, 0.036, 0.10, sd + 8, { wSeg: 7, hSeg: 4, drape: 0.03 }),
        pos: [x0 + 0.28, kerbTop + 0.002, kerbZ + 0.03],
        colorFn: mossTint(1.05),
      });
      mossParts.push({
        geo: buildMossCushion(0.13, 0.032, 0.09, sd + 7, { wSeg: 7, hSeg: 4 }),
        pos: [cx, stepTop + 0.004, kerbZ + 0.19],
        colorFn: mossTint(0.93),
      });
    }
    if (s === 5) {
      mossParts.push({
        geo: buildMossCushion(0.12, 0.036, 0.11, sd + 9, { wSeg: 7, hSeg: 4, drape: 0.025 }),
        pos: [x1 - 0.10, kerbTop + 0.003, kerbZ - 0.04],
        colorFn: mossTint(1.02),
      });
    }
  }
  // Compact stepped newel stone block terminating the -Z kerb rail at the jetty deck (X = +0.16, Z = -1.42)
  limestoneParts.push({
    geo: buildWeatheredBlock(0.38, 0.58, 0.38, {
      sx: 2, sy: 2, sz: 2, bevel: 0.020, erode: 0.009, seed: 710, clampBounds: true,
    }),
    pos: [0.18, 0.27, kerbZ],
    colorFn: stoneTint(0.98, 0.1),
  });
  mossParts.push({
    geo: buildMossCushion(0.14, 0.048, 0.13, 712, { wSeg: 7, hSeg: 5, drape: 0.035 }),
    pos: [0.14, 0.562, kerbZ - 0.04],
    colorFn: mossTint(1.04),
  });

  // Low stepped weathered cheek curb along +Z stair edge (keeps open lagoon feel while cleanly edging the stairs!)
  for (let s = 0; s < numSteps; s++) {
    const x1 = -s * treadLen;
    const x0 = x1 - treadLen;
    const stepTop = (s + 1) * stepRise;
    const cx = (x0 + x1) * 0.5;
    limestoneParts.push({
      geo: buildWeatheredBlock(treadLen + 0.01, 0.24, 0.22, {
        sx: 2, sy: 1, sz: 2, bevel: 0.018, erode: 0.008, seed: 740 + s, clampBounds: true,
      }),
      pos: [cx, stepTop + 0.01, 1.44],
      colorFn: stoneTint(0.93 + (s % 2) * 0.04, -0.1),
    });
  }

  // Merge all 4 material buckets into 4 single-draw meshes!
  const limestoneGeo = mergeEntries(limestoneParts);
  const groutGeo = mergeEntries(groutParts);
  const dampGeo = mergeEntries(dampParts);
  const mossGeo = mergeEntries(mossParts);

  createPart('DockLimestone', limestoneGeo, mats.limestoneMat, { parent: root });
  createPart('DockCarvedGrout', groutGeo, mats.groutMat, { parent: root });
  createPart('DockDampFoundation', dampGeo, mats.dampMat, { parent: root });
  createPart('DockMossCushions', mossGeo, mats.mossMat, { parent: root });

  return root;
}
