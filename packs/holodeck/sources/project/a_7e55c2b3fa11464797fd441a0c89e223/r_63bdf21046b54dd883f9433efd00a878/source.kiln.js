const meta = { name: 'arrival-stair-terrace-v2', role: 'ground' };

// ============================================================================
// Lagoon Sanctuary V2 — Foreground Descending Flagstone Steps, Extended Viewing Landing,
// Open Waterside Dock Entrance & Flush Viaduct Junction
// Orientation: +X forward (descending toward viaduct), +Y up, +Z right (lagoon side)
// Walkable Elevations (EXACT):
//   Upper Arrival Deck: X in [-3.20, -0.60], Z in [-2.40, +2.20] -> Y =  0.00m (skirt to -1.60m)
//   Step 1:             X in [-0.60,  0.00], Z in [-2.20, +2.00] -> Y = -0.15m
//   Step 2:             X in [ 0.00, +0.60], Z in [-2.20, +2.00] -> Y = -0.30m
//   Step 3:             X in [+0.60, +1.20], Z in [-2.20, +2.00] -> Y = -0.45m
//   Viewing Landing:    X in [+1.20, +4.80], Z in [-2.40, +2.20] -> Y = -0.60m (skirt to -2.40m)
// Key V2 Interfaces:
//   - Hero Square Cap Pedestal shifted to X = +1.50, Z = +1.85 (0.85x0.85m, top Y = +0.35m + moss)
//   - +Z Lagoon Dock Entrance: X in [+1.95, +4.50], Z = +2.16..+2.20 100% OPEN!
//   - +X Viaduct Threshold: X = +4.80, Z in [-2.10, +0.30], Y = -0.60m 100% WIDE OPEN!
//   - -Z Cliff Kerb extended to X = +4.80 flush at Y = -0.38m (+0.22m above landing)
//   - +X L-Return Carved Parapet Wall: X in [+4.50, +4.80], Z in [+0.30, +2.20], top Y = +0.08m
//     anchored by Junction Corner Pier (X=+4.65, Z=+0.45, top +0.16m) & Dock-Cheek Corner Post (X=+4.65, Z=+2.02, top +0.08m).
// ZERO water geometry.
// ============================================================================

function rockNoise3(x, y, z, seedOffset) {
  const s = seedOffset || 0;
  const n1 = Math.sin(x * 7.3 + y * 5.1 + s) * Math.cos(z * 6.7 - y * 4.3 + s * 1.7);
  const n2 = Math.sin(x * 17.9 - z * 14.3 + y * 11.7 + s * 2.3) * 0.5;
  const n3 = Math.cos(x * 31.1 + y * 27.7 + z * 23.9 - s * 0.9) * 0.25;
  return (n1 + n2 + n3) / 1.75;
}

// Build a weathered beveled stone block; optional flatTop keeps walkable surface within exact tolerance!
function buildWeatheredBlock(w, h, d, opts) {
  const o = opts || {};
  const sx = o.sx || 3;
  const sy = o.sy || 2;
  const sz = o.sz || 3;
  const bevel = Math.min(o.bevel != null ? o.bevel : 0.018, Math.min(w, h, d) * 0.35);
  const erode = o.erode != null ? o.erode : 0.008;
  const seed = o.seed || 11;
  const flatTop = o.flatTop || false;
  const flatTopTol = o.flatTopTol != null ? o.flatTopTol : 0.005;
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
    metersPerUnit: o.metersPerUnit || 1.15,
    frame: { origin: [o.uvOffsetX || 0, o.uvOffsetY || 0, o.uvOffsetZ || 0] },
  });
  return creaseNormals(uvGeo, { angle: o.creaseAngle || 48 });
}

function buildMossCushion(rx, ry, rz, seed, opts) {
  const o = opts || {};
  const wSeg = o.wSeg || 9;
  const hSeg = o.hSeg || 6;
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
  const root = createRoot('ArrivalStairTerraceV2');
  const rng = seededRandom('arrival-stair-terrace-v2');
  const mats = createSanctuaryMaterials();

  const limestoneParts = [];
  const groutParts = [];
  const dampParts = [];
  const mossParts = [];

  const stoneTint = (tone, warmBias) => (x, y, z, nx, ny, nz) => {
    const up = ny > 0.4 ? 1.03 : (ny < -0.3 ? 0.82 : 0.96);
    const wb = warmBias || 0;
    return [
      tone * up * (1.0 + wb * 0.04),
      tone * up * (1.0 + wb * 0.01),
      tone * up * (0.98 - wb * 0.03),
    ];
  };

  const dampTint = (tone) => (x, y, z, nx, ny, nz) => {
    // Darker & damper near bottom Y = -2.40, warmer near upper edge Y = -0.30
    const h = Math.max(0, Math.min(1, (y + 2.40) / 2.20));
    const v = tone * (0.76 + 0.28 * h);
    return [v * 0.98, v, v * 0.95];
  };

  const mossTint = (tone) => (x, y, z, nx, ny, nz) => {
    const top = Math.max(0, Math.min(1, (ny + 0.35) / 1.35));
    return [
      tone * (0.68 + 0.44 * top),
      tone * (0.72 + 0.38 * top),
      tone * (0.64 + 0.32 * top),
    ];
  };

  // Helper: lay a staggered course of weathered bevelled flagstones across [x0, x1] x [z0, z1]
  // with top surface at exact topY ± 0.007m and recessed dark grout bed beneath at topY - 0.024m.
  function layFlagstoneDeck(x0, x1, z0, z1, topY, slabThick, rowDepths, colSeed, mossChance, opts) {
    const o = opts || {};
    const rLocal = rng.fork('deck-' + colSeed);
    const totalX = x1 - x0;
    const totalZ = z1 - z0;
    const groutInsetXMax = o.groutInsetXMax != null ? o.groutInsetXMax : 0.05;
    const groutX0 = x0 + 0.05;
    const groutX1 = x1 - groutInsetXMax;

    // Dark recessed mortar bed inset horizontally and 0.024m below topY
    groutParts.push({
      geo: buildWeatheredBlock(groutX1 - groutX0, slabThick * 0.85, totalZ - 0.10, {
        sx: 3, sy: 1, sz: 3, bevel: 0.008, erode: 0.003, seed: colSeed + 1, clampBounds: true,
      }),
      pos: [(groutX0 + groutX1) * 0.5, topY - 0.024 - slabThick * 0.425, (z0 + z1) * 0.5],
      color: [0.80, 0.78, 0.74],
    });

    let curX = x0;
    let rowIdx = 0;
    while (curX < x1 - 0.05) {
      const targetDx = rowDepths[rowIdx % rowDepths.length];
      const nextX = Math.min(x1, curX + targetDx);
      const rowEndX = (x1 - nextX < 0.28) ? x1 : nextX;
      const rowLenX = rowEndX - curX;
      const isFlushPlusX = (o.flushPlusX && Math.abs(rowEndX - x1) < 0.005);

      let curZ = z0;
      let colIdx = 0;
      const zStagger = (rowIdx % 2 === 1) ? 0.34 : 0.0;
      while (curZ < z1 - 0.05) {
        let baseW = colIdx === 0 && zStagger > 0 ? 0.56 : rLocal.range(0.56, 0.92);
        let nextZ = Math.min(z1, curZ + baseW);
        const cellEndZ = (z1 - nextZ < 0.32) ? z1 : nextZ;
        const cellLenZ = cellEndZ - curZ;

        const gap = 0.015;
        // At flushPlusX edge (X=+4.80 viaduct seam), keep half-gap on inner side only so flagstones finish cleanly at X=4.795!
        const sw = Math.max(0.18, isFlushPlusX ? (rowLenX - gap * 0.6) : (rowLenX - gap));
        const sd = Math.max(0.18, cellLenZ - gap);
        const dy = rLocal.range(-0.005, 0.005);
        const stoneTop = topY + dy;
        const th = slabThick + rLocal.range(-0.006, 0.005);
        const cx = isFlushPlusX ? (rowEndX - sw * 0.5 - 0.004) : (curX + rowLenX * 0.5);
        const cz = curZ + cellLenZ * 0.5;

        const tone = rLocal.range(0.89, 1.06);
        const warm = rLocal.range(-0.8, 0.8);

        limestoneParts.push({
          geo: buildWeatheredBlock(sw, th, sd, {
            sx: 2, sy: 1, sz: 2, bevel: 0.014, erode: 0.005, flatTop: true, flatTopTol: 0.002,
            seed: colSeed * 100 + rowIdx * 19 + colIdx, clampBounds: true,
            uvOffsetX: cx * 0.7, uvOffsetZ: cz * 0.7, metersPerUnit: 1.05,
          }),
          pos: [cx, stoneTop - th * 0.5, cz],
          colorFn: stoneTint(tone, warm),
        });

        // Subtle flat mossy tufts tucked into joints near edges (keep clear of open dock & viaduct thresholds!)
        const nearEdge = (cz < z0 + 0.65 || cz > z1 - 0.75);
        const skipOpenDock = (o.keepOpenDock && cx > 1.85 && cz > 1.35);
        const skipViaductEdge = (o.flushPlusX && cx > 4.25 && cz < 0.35);
        if (mossChance > 0 && nearEdge && !skipOpenDock && !skipViaductEdge && rLocal.next() < mossChance) {
          const mx = curX + gap * 0.3 + rLocal.range(0.05, Math.max(0.08, rowLenX - 0.1));
          const mz = cellEndZ - gap * 0.5;
          if (mz > z0 + 0.1 && mz < z1 - 0.1) {
            mossParts.push({
              geo: buildMossCushion(rLocal.range(0.09, 0.17), 0.018, rLocal.range(0.06, 0.11), colSeed + rowIdx * 13 + colIdx, { wSeg: 7, hSeg: 4 }),
              pos: [mx, topY - 0.006, mz],
              colorFn: mossTint(rLocal.range(0.92, 1.08)),
            });
          }
        }

        curZ = cellEndZ;
        colIdx++;
      }
      curX = rowEndX;
      rowIdx++;
    }
  }

  // -------------------------------------------------------------------------
  // 1. SOLID MASONRY FOUNDATION APRONS & STEPPED RETAINING SKIRTS
  //    Upper apron:   X in [-3.20, +1.20], Z in [-2.40, +2.20], down to Y = -1.60m
  //    Landing apron: X in [+1.20, +4.80], Z in [-2.40, +2.20], down to Y = -2.40m
  // -------------------------------------------------------------------------
  // Upper deck solid masonry foundation core (X in [-3.18, -0.58], Y = -1.60 .. -0.10)
  dampParts.push({
    geo: buildWeatheredBlock(2.58, 1.48, 4.54, {
      sx: 5, sy: 4, sz: 5, bevel: 0.025, erode: 0.014, seed: 101, clampBounds: true, metersPerUnit: 1.3,
    }),
    pos: [-1.88, -0.86, -0.10],
    colorFn: dampTint(0.98),
  });

  // Solid stepped damp masonry foundation beneath the 3 descending stairs (X in [-0.62, +1.22], Y = -1.60 up to tread undersides)
  dampParts.push({
    geo: buildWeatheredBlock(0.64, 1.40, 4.46, {
      sx: 3, sy: 3, sz: 4, bevel: 0.020, erode: 0.012, seed: 105, clampBounds: true, metersPerUnit: 1.3,
    }),
    pos: [-0.30, -0.90, -0.10],
    colorFn: dampTint(0.96),
  });
  dampParts.push({
    geo: buildWeatheredBlock(0.64, 1.25, 4.46, {
      sx: 3, sy: 3, sz: 4, bevel: 0.020, erode: 0.012, seed: 106, clampBounds: true, metersPerUnit: 1.3,
    }),
    pos: [0.30, -0.975, -0.10],
    colorFn: dampTint(0.95),
  });
  dampParts.push({
    geo: buildWeatheredBlock(0.64, 1.10, 4.46, {
      sx: 3, sy: 3, sz: 4, bevel: 0.020, erode: 0.012, seed: 107, clampBounds: true, metersPerUnit: 1.3,
    }),
    pos: [0.90, -1.05, -0.10],
    colorFn: dampTint(0.94),
  });

  // Extended Viewing Landing massive damp masonry foundation (X in [+1.18, +4.78], Z in [-2.38, +2.18], Y = -2.40 .. -0.72)
  dampParts.push({
    geo: buildWeatheredBlock(3.60, 1.66, 4.52, {
      sx: 6, sy: 5, sz: 6, bevel: 0.028, erode: 0.016, seed: 110, clampBounds: true, metersPerUnit: 1.35,
    }),
    pos: [2.98, -1.57, -0.10],
    colorFn: dampTint(0.97),
  });

  // Coursed projecting damp ashlar foundation blocks along the exposed lagoon (+Z) retaining wall
  const skirtBlocksZ = [
    // Upper +Z wall below parapet (X = -3.15..+1.05, Y = -1.58..-0.40)
    [-2.50, -0.98, 1.15, 0.85, 0.16, 120],
    [-1.25, -1.04, 1.20, 0.82, 0.18, 121],
    [-0.02, -1.10, 1.12, 0.78, 0.16, 122],
    // Extended Landing +Z retaining wall (X = +1.96..+4.76, two staggered ashlar courses Y = -2.38..-0.75)
    [ 2.48, -1.15, 1.02, 0.72, 0.18, 124],
    [ 3.56, -1.16, 1.08, 0.72, 0.16, 125],
    [ 4.42, -1.15, 0.66, 0.72, 0.18, 126],
    [ 2.38, -1.92, 0.94, 0.82, 0.22, 127],
    [ 3.40, -1.94, 1.06, 0.80, 0.20, 128],
    [ 4.35, -1.93, 0.80, 0.82, 0.22, 129],
  ];
  for (let i = 0; i < skirtBlocksZ.length; i++) {
    const [bx, by, bw, bh, bd, sd] = skirtBlocksZ[i];
    dampParts.push({
      geo: buildWeatheredBlock(bw, bh, bd, {
        sx: 3, sy: 2, sz: 2, bevel: 0.022, erode: 0.012, seed: sd, clampBounds: true,
      }),
      pos: [bx, by, 2.12 + (i % 2) * 0.015],
      colorFn: dampTint(0.94 + (i % 3) * 0.05),
    });
  }

  // Solid stepped stone buttress pilaster anchoring the shifted Square Cap Pedestal (X = +1.50, Z = +1.85) down into the lagoon wall!
  dampParts.push({
    geo: buildWeatheredBlock(0.86, 1.68, 0.34, {
      sx: 3, sy: 4, sz: 2, bevel: 0.024, erode: 0.014, seed: 142, taperTop: 0.96, clampBounds: true, metersPerUnit: 1.25,
    }),
    pos: [1.50, -1.56, 2.13],
    colorFn: dampTint(0.95),
  });
  limestoneParts.push({
    geo: buildWeatheredBlock(0.90, 0.16, 0.38, {
      sx: 3, sy: 2, sz: 2, bevel: 0.020, erode: 0.009, seed: 144, clampBounds: true,
    }),
    pos: [1.50, -0.76, 2.14],
    colorFn: stoneTint(0.90, -0.2),
  });

  // Exposed +X front retaining wall of Viewing Landing (strictly <= X = +4.80 so viaduct pier 0 sits flush!)
  const frontSkirtBlocks = [
    [-1.70, -1.15, 0.14, 0.74, 1.25, 132],
    [-0.35, -1.16, 0.13, 0.74, 1.32, 133],
    [ 0.98, -1.15, 0.14, 0.74, 1.22, 134],
    [-1.55, -1.93, 0.15, 0.82, 1.45, 135],
    [-0.05, -1.94, 0.14, 0.82, 1.42, 136],
    [ 1.35, -1.93, 0.15, 0.82, 1.35, 137],
  ];
  for (let i = 0; i < frontSkirtBlocks.length; i++) {
    const [bz, by, bw, bh, bd, sd] = frontSkirtBlocks[i];
    dampParts.push({
      geo: buildWeatheredBlock(bw, bh, bd, {
        sx: 2, sy: 2, sz: 3, bevel: 0.022, erode: 0.012, seed: sd, clampBounds: true,
      }),
      pos: [4.71 + (i % 2) * 0.008, by, bz],
      colorFn: dampTint(0.93 + (i % 3) * 0.05),
    });
  }

  // -------------------------------------------------------------------------
  // 2. UPPER ARRIVAL FLAGSTONE DECK (X in [-3.20, -0.60], Z in [-2.40, +2.20], Y = 0.00m)
  // -------------------------------------------------------------------------
  layFlagstoneDeck(-3.20, -0.60, -2.36, 1.72, 0.00, 0.16, [0.68, 0.62, 0.66, 0.64], 201, 0.55);

  // Weathered carved limestone vertical riser stones beneath the upper deck drop at X = -0.60 (Y = -0.16..-0.01)
  groutParts.push({
    geo: buildWeatheredBlock(0.12, 0.16, 4.10, { sx: 1, sy: 1, sz: 4, bevel: 0.008, erode: 0.004, seed: 240 }),
    pos: [-0.70, -0.09, -0.10],
    color: [0.76, 0.74, 0.70],
  });
  const topRiserSplits = [-2.18, -1.32, -0.46, 0.40, 1.18, 1.72];
  for (let r = 0; r < topRiserSplits.length - 1; r++) {
    const rz0 = topRiserSplits[r];
    const rz1 = topRiserSplits[r + 1];
    limestoneParts.push({
      geo: buildWeatheredBlock(0.072, 0.135, (rz1 - rz0) - 0.016, {
        sx: 1, sy: 1, sz: 2, bevel: 0.012, erode: 0.004, seed: 245 + r, clampBounds: true,
      }),
      pos: [-0.628, -0.105, (rz0 + rz1) * 0.5],
      colorFn: stoneTint(0.89 + (r % 3) * 0.04, -0.2),
    });
  }

  // -------------------------------------------------------------------------
  // 3. THREE DESCENDING BROAD WEATHERED FLAGSTONE STEPS
  //    Step 1: X in [-0.60, 0.00], Z in [-2.20, +2.00] -> top Y = -0.15m
  //    Step 2: X in [ 0.00,+0.60], Z in [-2.20, +2.00] -> top Y = -0.30m
  //    Step 3: X in [+0.60,+1.20], Z in [-2.20, +2.00] -> top Y = -0.45m
  // -------------------------------------------------------------------------
  const stepSpecs = [
    { idx: 1, x0: -0.60, x1:  0.00, topY: -0.15, seed: 310 },
    { idx: 2, x0:  0.00, x1:  0.60, topY: -0.30, seed: 340 },
    { idx: 3, x0:  0.60, x1:  1.20, topY: -0.45, seed: 370 },
  ];

  const stepRng = rng.fork('steps');
  for (let s = 0; s < stepSpecs.length; s++) {
    const st = stepSpecs[s];
    groutParts.push({
      geo: buildWeatheredBlock(0.62, 0.24, 4.10, {
        sx: 2, sy: 1, sz: 4, bevel: 0.010, erode: 0.004, seed: st.seed,
      }),
      pos: [(st.x0 + st.x1) * 0.5 - 0.03, st.topY - 0.145, -0.10],
      color: [0.78, 0.76, 0.72],
    });

    const zSplits = (s % 2 === 0)
      ? [-2.20, -1.35, -0.45, 0.42, 1.18, 1.82]
      : [-2.20, -1.52, -0.70, 0.18, 0.98, 1.82];

    for (let k = 0; k < zSplits.length - 1; k++) {
      const zs0 = zSplits[k];
      const zs1 = zSplits[k + 1];
      const gapZ = 0.015;
      const slabZ = (zs1 - zs0) - gapZ;
      const slabX = 0.618;
      const slabH = 0.092;
      const dy = stepRng.range(-0.006, 0.006);
      const tone = stepRng.range(0.90, 1.07);
      const warm = stepRng.range(-0.7, 0.7);
      const cx = (st.x0 + st.x1) * 0.5 + 0.006;
      const cz = (zs0 + zs1) * 0.5;

      limestoneParts.push({
        geo: buildWeatheredBlock(slabX, slabH, slabZ, {
          sx: 3, sy: 2, sz: 2, bevel: 0.016, erode: 0.006, flatTop: true, flatTopTol: 0.004,
          seed: st.seed + 10 + k, clampBounds: true, uvOffsetX: cx, uvOffsetZ: cz, metersPerUnit: 1.05,
        }),
        pos: [cx, st.topY + dy - slabH * 0.5, cz],
        colorFn: stoneTint(tone, warm),
      });

      limestoneParts.push({
        geo: buildWeatheredBlock(0.068, 0.085, slabZ - 0.012, {
          sx: 1, sy: 1, sz: 2, bevel: 0.010, erode: 0.004, seed: st.seed + 30 + k, clampBounds: true,
        }),
        pos: [st.x1 - 0.036, st.topY - slabH - 0.035, cz],
        colorFn: stoneTint(tone * 0.89, -0.25),
      });

      if ((k === 0 && s !== 1) || (k === zSplits.length - 2 && s !== 0)) {
        const mz = k === 0 ? -2.01 : 1.56;
        // Skip right-side moss on Step 3 where shifted pedestal at X=1.50 meets Z=+1.425
        if (!(s === 2 && k === zSplits.length - 2)) {
          mossParts.push({
            geo: buildMossCushion(0.11, 0.032, 0.12, st.seed + 50 + k, { wSeg: 8, hSeg: 5 }),
            pos: [st.x0 + 0.09, st.topY + 0.004, mz],
            colorFn: mossTint(0.96 + (s % 2) * 0.08),
          });
          mossParts.push({
            geo: buildMossCushion(0.075, 0.024, 0.08, st.seed + 55 + k, { wSeg: 7, hSeg: 4 }),
            pos: [st.x0 + 0.19, st.topY + 0.002, mz + (k === 0 ? 0.06 : -0.06)],
            colorFn: mossTint(1.03),
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. EXTENDED VIEWING LANDING BROAD FLAGSTONE TERRACE
  //    X in [+1.20, +4.80], Z in [-2.40, +2.20] -> EXACT flat surface Y = -0.60m!
  //    Open +Z dock stair entrance: X in [+1.95, +4.50] along Z = +2.16..+2.20!
  //    Open +X viaduct threshold:   X = +4.80, Z in [-2.10, +0.30] (2.40m clear)!
  // -------------------------------------------------------------------------
  layFlagstoneDeck(1.20, 4.80, -2.38, 2.18, -0.60, 0.17, [0.60, 0.62, 0.58, 0.62, 0.60, 0.58], 401, 0.40, {
    flushPlusX: true,
    groutInsetXMax: 0.02,
    keepOpenDock: true,
  });

  // Carved cornice drip band tucked snugly right beneath the extended landing flagstones (X in [1.18, 4.80], Y = -0.84..-0.71)
  limestoneParts.push({
    geo: buildWeatheredBlock(3.62, 0.145, 4.60, {
      sx: 6, sy: 2, sz: 5, bevel: 0.020, erode: 0.008, seed: 490, clampBounds: true,
    }),
    pos: [2.99, -0.775, -0.10],
    colorFn: stoneTint(0.88, -0.3),
  });

  // -------------------------------------------------------------------------
  // 5. STEPPED CARVED STONE PARAPET WALL ALONG +Z (Lagoon/Right Edge)
  //    X in [-3.18, +1.13], Z in [+1.66, +2.18], rises 0.65m above steps:
  //      Upper deck section (X = -3.18..-0.60): top Y = +0.65m
  //      Step 1 section     (X = -0.60.. 0.00): top Y = +0.50m
  //      Step 2 section     (X =  0.00..+0.60): top Y = +0.35m
  //      Step 3 section     (X = +0.60..+1.13): top Y = +0.20m (bonds cleanly into shifted pedestal at X=+1.50!)
  // -------------------------------------------------------------------------
  const parapetBays = [
    [-3.18, -1.88, -0.22,  0.65, 510],
    [-1.88, -0.60, -0.22,  0.65, 520],
    [-0.60,  0.00, -0.36,  0.50, 530],
    [ 0.00,  0.60, -0.50,  0.35, 540],
    [ 0.60,  1.13, -0.66,  0.20, 550],
  ];

  for (let b = 0; b < parapetBays.length; b++) {
    const [bx0, bx1, by0, by1, sd] = parapetBays[b];
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    const cx = (bx0 + bx1) * 0.5;
    const zCenter = 1.92;

    groutParts.push({
      geo: buildWeatheredBlock(bw - 0.02, bh - 0.14, 0.39, {
        sx: 2, sy: 2, sz: 2, bevel: 0.008, erode: 0.004, seed: sd,
      }),
      pos: [cx, (by0 + by1) * 0.5 - 0.03, zCenter],
      color: [0.80, 0.78, 0.74],
    });

    limestoneParts.push({
      geo: buildWeatheredBlock(bw - 0.008, 0.24, 0.50, {
        sx: 3, sy: 2, sz: 2, bevel: 0.018, erode: 0.008, seed: sd + 1, clampBounds: true,
      }),
      pos: [cx, by0 + 0.12, zCenter],
      colorFn: stoneTint(0.94 + (b % 2) * 0.03, 0.1),
    });

    const postW = Math.min(0.14, bw * 0.24);
    const pilH = Math.max(0.24, bh - 0.34);
    const pilY = by0 + 0.24 + pilH * 0.5;
    for (let side = -1; side <= 1; side += 2) {
      limestoneParts.push({
        geo: buildWeatheredBlock(postW, pilH, 0.482, {
          sx: 2, sy: 2, sz: 2, bevel: 0.014, erode: 0.006, seed: sd + 3 + side, clampBounds: true,
        }),
        pos: [cx + side * (bw * 0.5 - postW * 0.5 - 0.008), pilY, zCenter],
        colorFn: stoneTint(0.98, 0.2),
      });
    }

    const panelInnerW = bw - postW * 2 - 0.06;
    if (panelInnerW > 0.20 && pilH > 0.28) {
      const nGlyphs = Math.max(1, Math.round(panelInnerW / 0.36));
      const stepU = panelInnerW / nGlyphs;
      for (let g = 0; g < nGlyphs; g++) {
        const gx = cx - panelInnerW * 0.5 + stepU * (g + 0.5);
        for (let faceZ = -1; faceZ <= 1; faceZ += 2) {
          const fz = zCenter + faceZ * 0.212;
          limestoneParts.push({
            geo: buildWeatheredBlock(stepU * 0.72, pilH * 0.62, 0.055, {
              sx: 2, sy: 2, sz: 1, bevel: 0.010, erode: 0.004, seed: sd + 20 + g * 3 + faceZ, clampBounds: true,
            }),
            pos: [gx, pilY, fz],
            colorFn: stoneTint(1.01, 0.3),
          });
          groutParts.push({
            geo: buildWeatheredBlock(stepU * 0.34, pilH * 0.28, 0.022, {
              sx: 1, sy: 1, sz: 1, bevel: 0.004, erode: 0.002, seed: sd + 40 + g * 3 + faceZ,
            }),
            pos: [gx, pilY, fz + faceZ * 0.022],
            color: [0.76, 0.74, 0.70],
          });
        }
      }
    }

    limestoneParts.push({
      geo: buildWeatheredBlock(bw + 0.02, 0.125, 0.56, {
        sx: 3, sy: 2, sz: 2, bevel: 0.020, erode: 0.009, seed: sd + 8, clampBounds: true,
      }),
      pos: [cx, by1 - 0.062, zCenter],
      colorFn: stoneTint(1.02 - (b % 2) * 0.03, 0.2),
    });

    if (b === 0 || b === 2 || b === 4) {
      mossParts.push({
        geo: buildMossCushion(0.22, 0.050, 0.14, sd + 60, { wSeg: 8, hSeg: 5, drape: 0.045 }),
        pos: [bx0 + 0.18, by1 + 0.004, zCenter + 0.15],
        colorFn: mossTint(0.96 + (b % 2) * 0.08),
      });
      if (b !== 4) {
        mossParts.push({
          geo: buildMossCushion(0.14, 0.042, 0.11, sd + 61, { wSeg: 7, hSeg: 4, drape: 0.03 }),
          pos: [bx0 + 0.34, by1 + 0.002, zCenter + 0.19],
          colorFn: mossTint(1.04),
        });
      }
    }
    if (b === 1 || b === 3) {
      mossParts.push({
        geo: buildMossCushion(0.28, 0.032, 0.08, sd + 65, { wSeg: 7, hSeg: 4 }),
        pos: [cx, by0 + 0.225, zCenter - 0.27],
        colorFn: mossTint(0.94),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. HERO SQUARE CARVED STONE CAP PEDESTAL AT X = +1.50, Z = +1.85
  //    Footprint 0.85m x 0.85m (X in [+1.075, +1.925]), stone top Y = +0.35m + 3D moss!
  //    Leaves X in [+1.95, +4.50] along +Z 100% OPEN for waterside-stone-dock stairs!
  // -------------------------------------------------------------------------
  const pedX = 1.50;
  const pedZ = 1.85;
  limestoneParts.push({
    geo: buildWeatheredBlock(0.85, 0.30, 0.85, {
      sx: 4, sy: 2, sz: 4, bevel: 0.022, erode: 0.010, seed: 601, clampBounds: true,
    }),
    pos: [pedX, -0.49, pedZ],
    colorFn: stoneTint(0.94, -0.1),
  });
  groutParts.push({
    geo: buildWeatheredBlock(0.66, 0.56, 0.66, {
      sx: 3, sy: 2, sz: 3, bevel: 0.010, erode: 0.004, seed: 602,
    }),
    pos: [pedX, -0.07, pedZ],
    color: [0.78, 0.76, 0.72],
  });
  const pedCorners = [[-0.31, -0.31], [0.31, -0.31], [-0.31, 0.31], [0.31, 0.31]];
  for (let c = 0; c < 4; c++) {
    limestoneParts.push({
      geo: buildWeatheredBlock(0.145, 0.54, 0.145, {
        sx: 2, sy: 3, sz: 2, bevel: 0.016, erode: 0.007, seed: 605 + c, clampBounds: true,
      }),
      pos: [pedX + pedCorners[c][0], -0.07, pedZ + pedCorners[c][1]],
      colorFn: stoneTint(0.99 + (c % 2) * 0.03, 0.2),
    });
  }
  // Carved Mayan glyph relief tablets on exposed sides (+X dock-facing, -Z stair-facing, +Z lagoon-facing; -X meets parapet)
  const pedAngles = [0, 90, 270];
  for (let s = 0; s < pedAngles.length; s++) {
    const rotY = pedAngles[s];
    const outerTab = buildWeatheredBlock(0.056, 0.34, 0.34, {
      sx: 1, sy: 2, sz: 2, bevel: 0.012, erode: 0.004, seed: 615 + s, clampBounds: true,
    });
    outerTab.translate(0.348, 0, 0);
    const innerGroove = buildWeatheredBlock(0.022, 0.22, 0.22, {
      sx: 1, sy: 1, sz: 1, bevel: 0.004, erode: 0.002, seed: 625 + s,
    });
    innerGroove.translate(0.370, 0, 0);
    const centerBoss = buildWeatheredBlock(0.032, 0.11, 0.11, {
      sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.002, seed: 635 + s, clampBounds: true,
    });
    centerBoss.translate(0.382, 0, 0);
    limestoneParts.push(
      { geo: outerTab, rot: [0, rotY, 0], pos: [pedX, -0.07, pedZ], colorFn: stoneTint(1.01, 0.2) },
      { geo: centerBoss, rot: [0, rotY, 0], pos: [pedX, -0.07, pedZ], colorFn: stoneTint(1.05, 0.3) }
    );
    groutParts.push({
      geo: innerGroove, rot: [0, rotY, 0], pos: [pedX, -0.07, pedZ], color: [0.76, 0.74, 0.70],
    });
  }
  limestoneParts.push({
    geo: buildWeatheredBlock(0.85, 0.16, 0.85, {
      sx: 4, sy: 2, sz: 4, bevel: 0.022, erode: 0.010, seed: 645, taperTop: 1.02, clampBounds: true,
    }),
    pos: [pedX, 0.27, pedZ],
    colorFn: stoneTint(1.02, 0.15),
  });
  const pedMoss = [
    [-0.10, 0.355,  0.08, 0.28, 0.125, 0.27, 0.05, 660, 1.05],
    [ 0.14, 0.352, -0.08, 0.24, 0.105, 0.23, 0.04, 661, 1.00],
    [ 0.08, 0.350,  0.18, 0.19, 0.088, 0.18, 0.05, 662, 1.08],
    [-0.18, 0.348, -0.16, 0.18, 0.082, 0.17, 0.04, 663, 0.96],
  ];
  for (let m = 0; m < pedMoss.length; m++) {
    const [dx, my, dz, rx, ry, rz, dr, sd, tone] = pedMoss[m];
    mossParts.push({
      geo: buildMossCushion(rx, ry, rz, sd, { wSeg: 9, hSeg: 6, drape: dr }),
      pos: [pedX + dx, my, pedZ + dz],
      colorFn: mossTint(tone),
    });
  }

  // -------------------------------------------------------------------------
  // 7. SCULPTED CARVED STONE L-RETURN PARAPET WALL ON FAR +X EDGE
  //    X in [+4.50, +4.80], Z in [+0.30, +2.20], base Y = -0.64m, coping top Y = +0.08m (+0.68m above landing!)
  //    Anchored by:
  //      - Junction Corner Pier at X = +4.65, Z = +0.45 (0.36 x 0.78 x 0.36m, top Y = +0.16m)
  //      - Dock-Cheek Corner Post at X = +4.65, Z = +2.02 (0.36 x 0.70 x 0.36m, top Y = +0.08m)
  //    Leaves X = +4.80, Z in [-2.10, +0.30] (2.40m clear) 100% WIDE OPEN for lagoon-curved-viaduct!
  // -------------------------------------------------------------------------
  const lWallX = 4.65;

  // Helper to build a richly carved square sanctuary corner pier
  function addCornerPier(px, pz, baseY, topY, capW, seedBase, glyphAngles) {
    const totalH = topY - baseY;
    const plinthH = 0.18;
    const capH = 0.12;
    const shaftH = Math.max(0.24, totalH - plinthH - capH);
    const shaftY = baseY + plinthH + shaftH * 0.5;
    const shaftW = capW - 0.05; // 0.31m shaft under 0.36m overhanging cap

    // Base plinth
    limestoneParts.push({
      geo: buildWeatheredBlock(capW - 0.02, plinthH, capW - 0.02, {
        sx: 2, sy: 1, sz: 2, bevel: 0.016, erode: 0.006, seed: seedBase + 1, clampBounds: true,
      }),
      pos: [px, baseY + plinthH * 0.5, pz],
      colorFn: stoneTint(0.95, -0.05),
    });
    // Recessed dark grout core
    groutParts.push({
      geo: buildWeatheredBlock(shaftW - 0.06, shaftH + 0.02, shaftW - 0.06, {
        sx: 2, sy: 2, sz: 2, bevel: 0.008, erode: 0.003, seed: seedBase + 2,
      }),
      pos: [px, shaftY, pz],
      color: [0.78, 0.76, 0.72],
    });
    // 4 vertical corner framing ribs
    const cOff = (shaftW - 0.085) * 0.5;
    const corners = [[-cOff, -cOff], [cOff, -cOff], [-cOff, cOff], [cOff, cOff]];
    for (let c = 0; c < 4; c++) {
      limestoneParts.push({
        geo: buildWeatheredBlock(0.085, shaftH + 0.01, 0.085, {
          sx: 1, sy: 2, sz: 1, bevel: 0.010, erode: 0.004, seed: seedBase + 5 + c, clampBounds: true,
        }),
        pos: [px + corners[c][0], shaftY, pz + corners[c][1]],
        colorFn: stoneTint(0.99 + (c % 2) * 0.02, 0.18),
      });
    }
    // Carved Mayan boss tablets on exposed faces
    for (let g = 0; g < glyphAngles.length; g++) {
      const rotY = glyphAngles[g];
      const tab = buildWeatheredBlock(0.040, shaftH * 0.58, shaftW * 0.44, {
        sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.003, seed: seedBase + 15 + g, clampBounds: true,
      });
      tab.translate(shaftW * 0.46, 0, 0);
      const boss = buildWeatheredBlock(0.026, shaftH * 0.26, shaftW * 0.22, {
        sx: 1, sy: 1, sz: 1, bevel: 0.006, erode: 0.002, seed: seedBase + 25 + g, clampBounds: true,
      });
      boss.translate(shaftW * 0.505, 0, 0);
      limestoneParts.push(
        { geo: tab, rot: [0, rotY, 0], pos: [px, shaftY, pz], colorFn: stoneTint(1.01, 0.2) },
        { geo: boss, rot: [0, rotY, 0], pos: [px, shaftY, pz], colorFn: stoneTint(1.05, 0.3) }
      );
    }
    // Overhanging beveled square coping cap (EXACT topY!)
    limestoneParts.push({
      geo: buildWeatheredBlock(capW, capH, capW, {
        sx: 3, sy: 2, sz: 3, bevel: 0.018, erode: 0.007, flatTop: true, flatTopTol: 0.003,
        seed: seedBase + 35, taperTop: 1.02, clampBounds: true,
      }),
      pos: [px, topY - capH * 0.5, pz],
      colorFn: stoneTint(1.02, 0.16),
    });
  }

  // 7a. Junction Corner Pier at X = +4.65, Z = +0.45 (0.36 x 0.78 x 0.36m, base -0.62 -> top +0.16m)
  // Meets lagoon-curved-viaduct's +s lagoon parapet (Z in [+0.30, +0.60]) cleanly flush!
  addCornerPier(lWallX, 0.45, -0.62, 0.16, 0.36, 710, [0, 90, 180]);
  // Slight 3D moss accent tucked asymmetrically on the junction corner pier top
  mossParts.push({
    geo: buildMossCushion(0.115, 0.036, 0.105, 745, { wSeg: 8, hSeg: 5, drape: 0.025 }),
    pos: [lWallX - 0.06, 0.162, 0.51],
    colorFn: mossTint(1.02),
  });
  mossParts.push({
    geo: buildMossCushion(0.075, 0.026, 0.075, 746, { wSeg: 7, hSeg: 4, drape: 0.018 }),
    pos: [lWallX + 0.04, 0.160, 0.55],
    colorFn: mossTint(0.95),
  });

  // 7b. Dock-Cheek Corner Post at X = +4.65, Z = +2.02 (0.36 x 0.70 x 0.36m, base -0.62 -> top +0.08m)
  // Meets waterside-stone-dock's outer stone cheek wall right at Z = +2.20!
  addCornerPier(lWallX, 2.02, -0.62, 0.08, 0.36, 750, [0, 180, 270]);
  // Subtle moss tuft on outer dock-cheek post corner
  mossParts.push({
    geo: buildMossCushion(0.11, 0.034, 0.105, 785, { wSeg: 8, hSeg: 5, drape: 0.025 }),
    pos: [lWallX + 0.05, 0.082, 2.08],
    colorFn: mossTint(0.98),
  });

  // 7c. Carved Mayan Fretwork L-Return Parapet Bay spanning Z in [+0.62, +1.85] (X in [+4.50, +4.80], base -0.64 -> top +0.08m)
  const lBayZ0 = 0.62;
  const lBayZ1 = 1.85;
  const lBayLen = lBayZ1 - lBayZ0; // 1.23m
  const lBayCz = (lBayZ0 + lBayZ1) * 0.5; // 1.235m

  // Recessed dark carved grout panel core (0.18m thick -> deep 5.5cm relief pockets on BOTH -X & +X faces!)
  groutParts.push({
    geo: buildWeatheredBlock(0.18, 0.46, lBayLen + 0.02, {
      sx: 1, sy: 2, sz: 3, bevel: 0.006, erode: 0.003, seed: 790,
    }),
    pos: [lWallX, -0.27, lBayCz],
    color: [0.78, 0.76, 0.72],
  });
  // Lower solid plinth rail (Y = -0.64 .. -0.46)
  limestoneParts.push({
    geo: buildWeatheredBlock(0.295, 0.18, lBayLen + 0.02, {
      sx: 2, sy: 1, sz: 3, bevel: 0.015, erode: 0.006, seed: 791, clampBounds: true,
    }),
    pos: [lWallX, -0.55, lBayCz],
    colorFn: stoneTint(0.95, 0.05),
  });
  // Upper overhanging beveled stone coping rail (EXACT top Y = +0.08m!)
  limestoneParts.push({
    geo: buildWeatheredBlock(0.32, 0.125, lBayLen + 0.02, {
      sx: 2, sy: 1, sz: 3, bevel: 0.016, erode: 0.007, flatTop: true, flatTopTol: 0.003,
      seed: 792, clampBounds: true,
    }),
    pos: [lWallX, 0.0175, lBayCz],
    colorFn: stoneTint(1.01, 0.15),
  });

  // 3 Carved Mayan Step-Fret Relief Panels on BOTH landing (-X) and outer (+X) faces!
  const lNumPanels = 3;
  const lStepZ = (lBayLen - 0.10) / lNumPanels;
  for (let p = 0; p < lNumPanels; p++) {
    const gz = lBayZ0 + 0.05 + lStepZ * (p + 0.5);
    for (let fx = -1; fx <= 1; fx += 2) {
      const xFace = lWallX + fx * 0.108;
      // Top & bottom fret bars
      limestoneParts.push({
        geo: buildWeatheredBlock(0.052, 0.056, lStepZ * 0.76, {
          sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.003, seed: 795 + p * 7 + fx, clampBounds: true,
        }),
        pos: [xFace, -0.145, gz],
        colorFn: stoneTint(1.02, 0.2),
      });
      limestoneParts.push({
        geo: buildWeatheredBlock(0.052, 0.056, lStepZ * 0.76, {
          sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.003, seed: 797 + p * 7 + fx, clampBounds: true,
        }),
        pos: [xFace, -0.375, gz],
        colorFn: stoneTint(0.98, 0.1),
      });
      // Vertical side bars (slightly recessed 4mm along X to avoid coplanar ties!)
      limestoneParts.push({
        geo: buildWeatheredBlock(0.046, 0.19, 0.058, {
          sx: 1, sy: 1, sz: 1, bevel: 0.007, erode: 0.003, seed: 799 + p * 7 + fx, clampBounds: true,
        }),
        pos: [xFace - fx * 0.004, -0.26, gz - lStepZ * 0.29],
        colorFn: stoneTint(1.00, 0.15),
      });
      limestoneParts.push({
        geo: buildWeatheredBlock(0.046, 0.19, 0.058, {
          sx: 1, sy: 1, sz: 1, bevel: 0.007, erode: 0.003, seed: 801 + p * 7 + fx, clampBounds: true,
        }),
        pos: [xFace - fx * 0.004, -0.26, gz + lStepZ * 0.29],
        colorFn: stoneTint(1.00, 0.15),
      });
      // Proud central Mayan eye boss
      limestoneParts.push({
        geo: buildWeatheredBlock(0.056, 0.105, lStepZ * 0.28, {
          sx: 1, sy: 1, sz: 1, bevel: 0.008, erode: 0.003, seed: 803 + p * 7 + fx, clampBounds: true,
        }),
        pos: [xFace + fx * 0.004, -0.26, gz],
        colorFn: stoneTint(1.05, 0.25),
      });
    }
  }
  // Organic moss cluster creeping along the inner base & coping crease of the L-return parapet
  mossParts.push({
    geo: buildMossCushion(0.085, 0.032, 0.16, 807, { wSeg: 7, hSeg: 4, drape: 0.025 }),
    pos: [lWallX + 0.08, 0.082, 0.86],
    colorFn: mossTint(0.96),
  });
  mossParts.push({
    geo: buildMossCushion(0.065, 0.026, 0.14, 808, { wSeg: 7, hSeg: 4 }),
    pos: [lWallX - 0.16, -0.596, 1.48],
    colorFn: mossTint(0.93),
  });

  // -------------------------------------------------------------------------
  // 8. LOW WEATHERED STONE RETAINING KERB ALONG LEFT (-Z) CLIFF EDGE
  //    Z in [-2.39, -2.09] (center Z = -2.24), extended cleanly to X = +4.80!
  //    Viewing Landing kerb top DEAD-FLUSH at Y = -0.38m (+0.22m above -0.60m deck),
  //    matching lagoon-curved-viaduct's -s cliff kerb dead-flush at u = 0!
  // -------------------------------------------------------------------------
  const leftKerbs = [
    // [x0, x1, topY, baseY, seed]
    [-3.18, -1.90,  0.22, -0.12, 810],
    [-1.88, -0.62,  0.20, -0.12, 812],
    [-0.60,  0.00,  0.04, -0.25, 814],
    [ 0.02,  0.60, -0.11, -0.40, 816],
    [ 0.62,  1.22, -0.26, -0.55, 818],
    [ 1.24,  2.42, -0.38, -0.72, 820],
    [ 2.44,  3.62, -0.38, -0.72, 822],
    [ 3.64,  4.80, -0.38, -0.72, 824],
  ];
  for (let k = 0; k < leftKerbs.length; k++) {
    const [kx0, kx1, kyTop, kyBase, sd] = leftKerbs[k];
    const kw = kx1 - kx0;
    const kh = kyTop - kyBase;
    const isLandingKerb = (k >= 5);
    limestoneParts.push({
      geo: buildWeatheredBlock(kw, kh, 0.30, {
        sx: 3, sy: 2, sz: 2, bevel: 0.020, erode: isLandingKerb ? 0.008 : 0.011,
        flatTop: isLandingKerb, flatTopTol: 0.003, seed: sd, clampBounds: true,
      }),
      pos: [(kx0 + kx1) * 0.5, (kyTop + kyBase) * 0.5, -2.24],
      colorFn: stoneTint(0.92 + (k % 3) * 0.04, -0.2),
    });
    // Asymmetric multi-lobe moss clusters hugging select left (-Z) cliff kerb joints (clear of X=4.80 seam!)
    if (k === 0 || k === 3 || k === 6) {
      const mx = k === 0 ? (kx0 + 0.38) : (k === 3 ? (kx0 + 0.24) : (kx0 + 0.48));
      mossParts.push({
        geo: buildMossCushion(0.22, 0.056, 0.14, sd + 5, { wSeg: 9, hSeg: 5, drape: 0.035 }),
        pos: [mx, kyTop + 0.005, -2.23],
        colorFn: mossTint(0.96 + (k % 2) * 0.08),
      });
      mossParts.push({
        geo: buildMossCushion(0.14, 0.042, 0.11, sd + 6, { wSeg: 7, hSeg: 4, drape: 0.025 }),
        pos: [mx + 0.21, kyTop + 0.003, -2.18],
        colorFn: mossTint(1.04),
      });
    }
  }

  // Merge all 4 material buckets into 4 single-draw meshes!
  const limestoneGeo = mergeEntries(limestoneParts);
  const groutGeo = mergeEntries(groutParts);
  const dampGeo = mergeEntries(dampParts);
  const mossGeo = mergeEntries(mossParts);

  createPart('TerraceLimestone', limestoneGeo, mats.limestoneMat, { parent: root });
  createPart('TerraceCarvedGrout', groutGeo, mats.groutMat, { parent: root });
  createPart('TerraceDampSkirt', dampGeo, mats.dampMat, { parent: root });
  createPart('TerraceMossCushions', mossGeo, mats.mossMat, { parent: root });

  return root;
}
