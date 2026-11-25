const meta = { name: 'sun-stele-pillar', role: 'poi' };

// ============================================================================
// Lagoon Sanctuary — Hero Carved Limestone Sun-Medallion Ruin Pillar
// Footprint: 1.30m x 1.30m (X, Z in [-0.65, +0.65])
// Height: Y in [-0.50, +3.85] (underground plinth skirt -0.50..0.00, hero 0.00..3.85)
// Orientation: +X forward, +Y up, +Z right. Hero Sunburst Medallion on +X and +Z faces.
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
  const sx = o.sx || 4;
  const sy = o.sy || 4;
  const sz = o.sz || 4;
  const bevel = Math.min(o.bevel != null ? o.bevel : 0.018, Math.min(w, h, d) * 0.35);
  const erode = o.erode != null ? o.erode : 0.009;
  const seed = o.seed || 11;
  const brokenCorner = o.brokenCorner || null;
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

    const dx = Math.max(0, Math.abs(x) - (hw - bevel));
    const dy = Math.max(0, Math.abs(y) - (hh - bevel));
    const dz = Math.max(0, Math.abs(z) - (hd - bevel));
    const edgeSum = (dx > 0 ? 1 : 0) + (dy > 0 ? 1 : 0) + (dz > 0 ? 1 : 0);
    if (edgeSum >= 2 && bevel > 0) {
      const pull = bevel * 0.36;
      const fx = dx / bevel;
      const fy = dy / bevel;
      const fz = dz / bevel;
      if (dx > 0 && dy > 0) {
        const c = fx * fy * pull;
        x -= Math.sign(x) * c;
        y -= Math.sign(y) * c;
      }
      if (dy > 0 && dz > 0) {
        const c = fy * fz * pull;
        y -= Math.sign(y) * c;
        z -= Math.sign(z) * c;
      }
      if (dx > 0 && dz > 0) {
        const c = fx * fz * pull;
        x -= Math.sign(x) * c;
        z -= Math.sign(z) * c;
      }
    }

    if (brokenCorner) {
      const bc = brokenCorner;
      const yOk = bc.fullHeight ? true : (y * bc.signY > -hh * 0.15);
      if (x * bc.signX > -hw * 0.15 && yOk && z * bc.signZ > -hd * 0.15) {
        const yTerm = bc.fullHeight
          ? (0.55 + 0.45 * ((y * bc.signY + hh) / Math.max(h, 0.01)))
          : Math.max(0, (y * bc.signY) / hh);
        const proj = Math.max(0, (x * bc.signX) / hw)
          + yTerm
          + Math.max(0, (z * bc.signZ) / hd);
        if (proj > bc.threshold) {
          const excess = proj - bc.threshold;
          const jag = rockNoise3(x * 3.4, y * 3.8, z * 3.4, seed + 91) * bc.roughness;
          const cut = Math.max(0, excess * bc.strength + jag);
          x -= bc.signX * cut * hw * 0.46;
          if (!bc.fullHeight) {
            y -= bc.signY * cut * hh * 0.48;
          } else {
            y -= bc.signY * cut * hh * 0.22;
          }
          z -= bc.signZ * cut * hd * 0.46;
        }
      }
    }

    if (erode > 0) {
      const nx = rockNoise3(x + 1.3, y - 0.7, z + 2.1, seed);
      const ny = rockNoise3(x - 2.1, y + 1.9, z - 0.4, seed + 17);
      const nz = rockNoise3(x + 0.5, y + 2.7, z - 1.8, seed + 37);
      const edgeWeight = 0.52 + 0.48 * Math.max(
        Math.abs(x) / Math.max(hw, 0.01),
        Math.abs(z) / Math.max(hd, 0.01)
      );
      x += nx * erode * edgeWeight;
      y += ny * erode * 0.62;
      z += nz * erode * edgeWeight;
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
    metersPerUnit: o.metersPerUnit || 0.9,
    frame: { origin: [o.uvOffsetX || 0, o.uvOffsetY || 0, o.uvOffsetZ || 0] },
  });
  return creaseNormals(uvGeo, { angle: o.creaseAngle || 48 });
}

// Sculpted 3D faceted pyramidal/beveled triangular Sun Ray in local YZ plane protruding along +X.
// Verified right-handed CCW winding: outward normal on front facets points toward +X!
function buildSunRayGeo(rInner, rOuter, halfWidthBase, depthBase, depthTip, theta, seed, xBackOffset) {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const toWorld = (px, r, t) => [
    px,
    r * cosT - t * sinT,
    r * sinT + t * cosT,
  ];

  const n1 = rockNoise3(cosT * 3.1, sinT * 3.1, seed, 13) * 0.0025;
  const rMid = rInner + (rOuter - rInner) * 0.42;
  const hwMid = halfWidthBase * 0.56;
  const dRidge = depthBase * 1.15 + n1;
  const dBaseEdge = depthBase * 0.58;
  const dMidEdge = depthBase * 0.48;
  const xBack = xBackOffset != null ? xBackOffset : -0.010;

  const p = [
    toWorld(xBack,            rInner, -halfWidthBase),        // 0: base back L (-t)
    toWorld(xBack,            rInner,  halfWidthBase),        // 1: base back R (+t)
    toWorld(dBaseEdge,        rInner, -halfWidthBase * 0.82), // 2: base front L
    toWorld(dRidge,           rInner,  0),                    // 3: base ridge center
    toWorld(dBaseEdge,        rInner,  halfWidthBase * 0.82), // 4: base front R

    toWorld(xBack,            rMid,   -hwMid),                // 5: mid back L
    toWorld(xBack,            rMid,    hwMid),                // 6: mid back R
    toWorld(dMidEdge,         rMid,   -hwMid * 0.78),         // 7: mid front L
    toWorld(dRidge * 0.80,    rMid,    0),                    // 8: mid ridge center
    toWorld(dMidEdge,         rMid,    hwMid * 0.78),         // 9: mid front R

    toWorld(xBack,            rOuter,  0),                    // 10: tip back
    toWorld(depthTip,         rOuter - 0.010, 0),             // 11: tip front apex
  ];

  // Right-handed check: (e_r x e_t) = +e_x.
  // So front facets need (dr > 0) x (dt > 0) => e.g. [2, 7, 8] has (7-2)=(+r) and (8-2)=(+r,+t) -> +x!
  const tris = [
    // Base cap facing -r (toward center)
    [0, 2, 3], [0, 3, 1], [1, 3, 4],

    // Segment 1 (Base -> Mid):
    // Left side wall (normal ~ -t, +x)
    [0, 5, 7], [0, 7, 2],
    // Left front slope (normal ~ +x, -t)
    [2, 7, 8], [2, 8, 3],
    // Right front slope (normal ~ +x, +t)
    [3, 8, 9], [3, 9, 4],
    // Right side wall (normal ~ +t, +x)
    [4, 9, 6], [4, 6, 1],

    // Segment 2 (Mid -> Tip):
    // Left side wall
    [5, 10, 7],
    [7, 10, 11],
    // Left front slope
    [7, 11, 8],
    // Right front slope
    [8, 11, 9],
    // Right side wall
    [9, 11, 10],
    [9, 10, 6],

    // Back cap (normal = -x)
    [0, 6, 5], [0, 1, 6],
    [5, 6, 10],
  ];

  const positions = [];
  for (let i = 0; i < tris.length; i++) {
    const [a, b, c] = tris[i];
    positions.push(...p[a], ...p[b], ...p[c]);
  }
  const raw = meshGeo({ positions });
  const uvGeo = projectUV(raw, { projection: 'box', metersPerUnit: 0.55 });
  return creaseNormals(uvGeo, { angle: 30 });
}

function buildMossCushion(rx, ry, rz, seed, opts) {
  const o = opts || {};
  const wSeg = o.wSeg || 10;
  const hSeg = o.hSeg || 7;
  const drape = o.drape || 0.0;
  const baseGeo = new THREE.SphereGeometry(1, wSeg, hSeg);
  const pos = baseGeo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    if (y < 0) {
      y *= 0.28;
    } else {
      y = Math.pow(y, 0.78);
    }

    const rHoriz = Math.hypot(x, z);
    const n1 = rockNoise3(x * 1.8, y * 1.5, z * 1.8, seed);
    const n2 = rockNoise3(x * 4.3, y * 3.7, z * 4.3, seed + 53) * 0.45;
    const lump = 1.0 + (n1 * 0.22 + n2 * 0.14);

    let px = x * rx * lump;
    let py = y * ry * (1.0 + n1 * 0.24 + n2 * 0.16);
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
  const root = createRoot('SunStelePillar');
  const mats = createSanctuaryMaterials();

  const limestoneParts = [];
  const groutParts = [];
  const dampParts = [];
  const mossParts = [];

  const limestoneTint = (tone) => (x, y, z, nx, ny, nz) => {
    const hFactor = Math.max(0, Math.min(1, (y + 0.2) / 3.8));
    const base = tone * (0.91 + 0.11 * hFactor);
    const upBoost = ny > 0.35 ? 1.04 : (ny < -0.35 ? 0.84 : 1.0);
    const patina = (y < 0.85 || y > 3.40) ? 0.97 : 1.0;
    return [base * upBoost * patina, base * upBoost, base * upBoost * (0.96 + 0.04 * hFactor)];
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
  // 1. UNDERGROUND PLINTH SKIRT (Y = -0.50 .. +0.02) — DampLowerMasonry
  // -------------------------------------------------------------------------
  dampParts.push({
    geo: buildWeatheredBlock(1.29, 0.52, 1.29, {
      sx: 3, sy: 2, sz: 3, bevel: 0.022, erode: 0.012, seed: 101, taperTop: 0.96, clampBounds: true,
    }),
    pos: [0, -0.24, 0],
    color: [0.92, 0.93, 0.90],
  });

  // -------------------------------------------------------------------------
  // 2. STEPPED WEATHERED STONE BASE PLINTH (Y = 0.00 .. 0.82)
  // -------------------------------------------------------------------------
  // Tier 1 Lower Plinth (Y = 0.00 .. 0.38, footprint 1.26m x 1.26m) — Damp weathered stone blocks
  groutParts.push({
    geo: buildWeatheredBlock(1.16, 0.36, 1.16, { sx: 2, sy: 2, sz: 2, bevel: 0.01, erode: 0.004, seed: 102 }),
    pos: [0, 0.19, 0],
    color: [0.85, 0.84, 0.81],
  });
  const plinthCornerOffsets = [
    [-0.318, -0.318, 103, 0.98],
    [ 0.318, -0.318, 104, 1.05],
    [-0.318,  0.318, 105, 1.03],
    [ 0.318,  0.318, 106, 0.96],
  ];
  for (let i = 0; i < plinthCornerOffsets.length; i++) {
    const [cx, cz, sd, tone] = plinthCornerOffsets[i];
    dampParts.push({
      geo: buildWeatheredBlock(0.614, 0.376, 0.614, {
        sx: 3, sy: 3, sz: 3, bevel: 0.028, erode: 0.011, seed: sd, clampBounds: true,
        uvOffsetX: cx, uvOffsetZ: cz,
      }),
      pos: [cx, 0.192, cz],
      color: [tone * 1.05, tone * 1.04, tone * 1.00],
    });
  }
  // Stepped bevelled coping collar on top of Tier 1 (Y = 0.36 .. 0.43, warm weathered limestone!)
  limestoneParts.push({
    geo: buildWeatheredBlock(1.22, 0.072, 1.22, {
      sx: 4, sy: 2, sz: 4, bevel: 0.018, erode: 0.008, seed: 109, taperTop: 0.97, clampBounds: true,
    }),
    pos: [0, 0.396, 0],
    colorFn: limestoneTint(0.92),
  });

  // Tier 2 Upper Plinth (Y = 0.42 .. 0.72, footprint 1.14m x 1.14m) — LimestoneWeathered
  groutParts.push({
    geo: buildWeatheredBlock(1.04, 0.29, 1.04, { sx: 2, sy: 2, sz: 2, bevel: 0.01, erode: 0.004, seed: 110 }),
    pos: [0, 0.57, 0],
    color: [0.87, 0.86, 0.83],
  });
  const tier2Blocks = [
    [-0.285, -0.285, 0.552, 0.304, 0.552, 111, 0.97],
    [ 0.285, -0.285, 0.552, 0.304, 0.552, 112, 1.03],
    [-0.285,  0.285, 0.552, 0.304, 0.552, 113, 1.01],
    [ 0.285,  0.285, 0.552, 0.304, 0.552, 114, 0.95],
  ];
  for (let i = 0; i < tier2Blocks.length; i++) {
    const [cx, cz, bw, bh, bd, sd, tone] = tier2Blocks[i];
    limestoneParts.push({
      geo: buildWeatheredBlock(bw, bh, bd, {
        sx: 3, sy: 3, sz: 3, bevel: 0.024, erode: 0.010, seed: sd, clampBounds: true,
        uvOffsetX: cx * 1.1, uvOffsetZ: cz * 1.1,
      }),
      pos: [cx, 0.572, cz],
      colorFn: limestoneTint(tone),
    });
  }

  // Plinth Cornice Ledge (Y = 0.71 .. 0.82, footprint 1.21m x 1.21m)
  limestoneParts.push({
    geo: buildWeatheredBlock(1.20, 0.112, 1.20, {
      sx: 5, sy: 2, sz: 5, bevel: 0.022, erode: 0.009, seed: 118, taperTop: 1.02, clampBounds: true,
    }),
    pos: [0, 0.768, 0],
    colorFn: limestoneTint(1.01),
  });

  // -------------------------------------------------------------------------
  // 3. LOWER MESOAMERICAN STEP-FRET & GEOMETRIC SCROLL RELIEF BAND (Y = 0.82..1.38)
  // -------------------------------------------------------------------------
  groutParts.push({
    geo: buildWeatheredBlock(0.94, 0.54, 0.94, {
      sx: 3, sy: 2, sz: 3, bevel: 0.008, erode: 0.003, seed: 120,
    }),
    pos: [0, 1.10, 0],
    color: [0.80, 0.79, 0.76],
  });

  limestoneParts.push({
    geo: buildWeatheredBlock(1.09, 0.082, 1.09, {
      sx: 4, sy: 2, sz: 4, bevel: 0.015, erode: 0.007, seed: 121, clampBounds: true,
    }),
    pos: [0, 0.862, 0],
    colorFn: limestoneTint(0.98),
  });
  limestoneParts.push({
    geo: buildWeatheredBlock(1.11, 0.086, 1.11, {
      sx: 4, sy: 2, sz: 4, bevel: 0.016, erode: 0.007, seed: 122, clampBounds: true,
    }),
    pos: [0, 1.342, 0],
    colorFn: limestoneTint(1.02),
  });

  const fretCorners = [[-0.485, -0.485], [0.485, -0.485], [-0.485, 0.485], [0.485, 0.485]];
  for (let c = 0; c < 4; c++) {
    limestoneParts.push({
      geo: buildWeatheredBlock(0.115, 0.404, 0.115, {
        sx: 2, sy: 3, sz: 2, bevel: 0.014, erode: 0.006, seed: 125 + c, clampBounds: true,
      }),
      pos: [fretCorners[c][0], 1.102, fretCorners[c][1]],
      colorFn: limestoneTint(0.99 + (c % 2) * 0.03),
    });
  }

  const fretBarDepth = 0.085;
  const fretDepthCenter = 0.478;
  const fretGlyphSegs = [
    // Left squared spiral scroll
    [-0.280, 1.250, 0.215, 0.044],
    [-0.365, 1.080, 0.044, 0.292],
    [-0.268, 0.954, 0.148, 0.044],
    [-0.194, 1.078, 0.044, 0.200],
    [-0.258, 1.158, 0.082, 0.042],
    [-0.298, 1.088, 0.042, 0.095],
    [-0.266, 1.052, 0.024, 0.040],
    // Left vertical divider
    [-0.128, 1.100, 0.044, 0.342],
    // Center step-fret temple glyph
    [ 0.000, 0.954, 0.168, 0.046],
    [ 0.000, 1.024, 0.118, 0.092],
    [ 0.000, 1.106, 0.068, 0.070],
    [-0.064, 1.202, 0.040, 0.136],
    [ 0.064, 1.202, 0.040, 0.136],
    [ 0.000, 1.250, 0.086, 0.042],
    // Right vertical divider
    [ 0.128, 1.100, 0.044, 0.342],
    // Right squared spiral scroll
    [ 0.280, 1.250, 0.215, 0.044],
    [ 0.365, 1.080, 0.044, 0.292],
    [ 0.268, 0.954, 0.148, 0.044],
    [ 0.194, 1.078, 0.044, 0.200],
    [ 0.258, 1.158, 0.082, 0.042],
    [ 0.298, 1.088, 0.042, 0.095],
    [ 0.266, 1.052, 0.024, 0.040],
  ];

  const sideAngles = [0, 90, 180, 270];
  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const rotY = sideAngles[sIdx];
    const rad = (rotY * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (let gIdx = 0; gIdx < fretGlyphSegs.length; gIdx++) {
      const [u, yc, uw, yh] = fretGlyphSegs[gIdx];
      const depthJitter = ((gIdx % 3) - 1) * 0.003;
      const dLoc = fretBarDepth + depthJitter;
      const xLoc = fretDepthCenter + depthJitter * 0.5;
      const wx = xLoc * cosA + u * sinA;
      const wz = -xLoc * sinA + u * cosA;
      const tone = 0.98 + ((gIdx * 7 + sIdx * 3) % 5) * 0.015;
      limestoneParts.push({
        geo: buildWeatheredBlock(dLoc, yh, uw, {
          sx: 1, sy: 1, sz: 1, bevel: 0.007, erode: 0.0025, seed: 200 + sIdx * 40 + gIdx, clampBounds: true,
        }),
        pos: [wx, yc, wz],
        rot: [0, rotY, 0],
        colorFn: limestoneTint(tone),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. HERO SUNBURST MEDALLION DRUM (Y = 1.38 .. 2.52)
  // -------------------------------------------------------------------------
  groutParts.push({
    geo: buildWeatheredBlock(0.94, 1.14, 0.94, {
      sx: 3, sy: 3, sz: 3, bevel: 0.01, erode: 0.004, seed: 300,
    }),
    pos: [0, 1.95, 0],
    color: [0.80, 0.79, 0.76],
  });

  const shaftCorners = [[-0.465, -0.465], [0.465, -0.465], [-0.465, 0.465], [0.465, 0.465]];
  for (let c = 0; c < 4; c++) {
    limestoneParts.push({
      geo: buildWeatheredBlock(0.162, 0.558, 0.162, {
        sx: 3, sy: 3, sz: 3, bevel: 0.020, erode: 0.008, seed: 310 + c * 2, clampBounds: true,
      }),
      pos: [shaftCorners[c][0], 1.662, shaftCorners[c][1]],
      colorFn: limestoneTint(0.97 + (c % 2) * 0.04),
    });
    limestoneParts.push({
      geo: buildWeatheredBlock(0.162, 0.558, 0.162, {
        sx: 3, sy: 3, sz: 3, bevel: 0.020, erode: 0.008, seed: 311 + c * 2, clampBounds: true,
      }),
      pos: [shaftCorners[c][0], 2.238, shaftCorners[c][1]],
      colorFn: limestoneTint(1.01 - (c % 2) * 0.03),
    });
  }

  limestoneParts.push({
    geo: buildWeatheredBlock(1.072, 0.088, 1.072, {
      sx: 4, sy: 2, sz: 4, bevel: 0.015, erode: 0.006, seed: 320, clampBounds: true,
    }),
    pos: [0, 1.428, 0],
    colorFn: limestoneTint(0.99),
  });
  limestoneParts.push({
    geo: buildWeatheredBlock(1.072, 0.088, 1.072, {
      sx: 4, sy: 2, sz: 4, bevel: 0.015, erode: 0.006, seed: 321, clampBounds: true,
    }),
    pos: [0, 2.472, 0],
    colorFn: limestoneTint(1.02),
  });

  function addSunburstMedallion(rotYDeg, seedBase) {
    const faceBaseX = 0.470;
    const yCenter = 1.95;

    // Outer continuous carved stone medallion border ring (0.88m outer diameter -> r=0.415, tube=0.025)
    const outerRing = new THREE.TorusGeometry(0.415, 0.026, 8, 32);
    outerRing.rotateY(Math.PI * 0.5);
    const orPos = outerRing.attributes.position;
    for (let k = 0; k < orPos.count; k++) {
      let px = orPos.getX(k), py = orPos.getY(k), pz = orPos.getZ(k);
      px *= 1.15;
      const n = rockNoise3(px * 7, py * 7, pz * 7, seedBase + 15) * 0.003;
      orPos.setXYZ(k, px + n, py + n, pz + n);
    }
    const outerRingUV = creaseNormals(projectUV(outerRing, { projection: 'box', metersPerUnit: 0.55 }), { angle: 55 });
    outerRingUV.translate(faceBaseX + 0.018, 0, 0);
    limestoneParts.push({
      geo: outerRingUV,
      rot: [0, rotYDeg, 0],
      pos: [0, yCenter, 0],
      colorFn: limestoneTint(0.96),
    });

    // 12 Bold Carved Sculpted 3D Triangular Sunburst Rays (diameter = 0.88m -> rOuter = 0.420m inside ring)
    const numRays = 12;
    for (let i = 0; i < numRays; i++) {
      const theta = (i / numRays) * Math.PI * 2;
      const isMajor = (i % 2 === 0);
      const rInner = 0.148;
      const rOuter = isMajor ? 0.418 : 0.382;
      const halfW = isMajor ? 0.068 : 0.054;
      const dBase = isMajor ? 0.072 : 0.058;
      const dTip = isMajor ? 0.024 : 0.018;
      const xBackOff = -0.008 - (i % 4) * 0.005;
      const rayGeo = buildSunRayGeo(rInner, rOuter, halfW, dBase, dTip, theta, seedBase + 100 + i, xBackOff);
      rayGeo.translate(faceBaseX, 0, 0);
      limestoneParts.push({
        geo: rayGeo,
        rot: [0, rotYDeg, 0],
        pos: [0, yCenter, 0],
        colorFn: limestoneTint(isMajor ? 1.06 : 1.00),
      });
    }

    // 12 Sculpted Intermediate Chevron Spurs tucked between the 12 main rays
    for (let i = 0; i < numRays; i++) {
      const theta = ((i + 0.5) / numRays) * Math.PI * 2;
      const xBackOff = -0.028 - (i % 3) * 0.005;
      const spurGeo = buildSunRayGeo(0.158, 0.285, 0.036, 0.044, 0.012, theta, seedBase + 150 + i, xBackOff);
      spurGeo.translate(faceBaseX, 0, 0);
      limestoneParts.push({
        geo: spurGeo,
        rot: [0, rotYDeg, 0],
        pos: [0, yCenter, 0],
        colorFn: limestoneTint(0.93),
      });
    }

    // Raised Carved Collar Ring surrounding the central domed sun disc
    const collarTorus = new THREE.TorusGeometry(0.168, 0.024, 8, 24);
    collarTorus.rotateY(Math.PI * 0.5);
    const cPos = collarTorus.attributes.position;
    for (let k = 0; k < cPos.count; k++) {
      const px = cPos.getX(k), py = cPos.getY(k), pz = cPos.getZ(k);
      const n = rockNoise3(px * 8, py * 8, pz * 8, seedBase + 201) * 0.0025;
      cPos.setXYZ(k, px + n, py + n, pz + n);
    }
    const collarUV = creaseNormals(projectUV(collarTorus, { projection: 'box', metersPerUnit: 0.45 }), { angle: 65 });
    collarUV.translate(faceBaseX + 0.046, 0, 0);
    limestoneParts.push({
      geo: collarUV,
      rot: [0, rotYDeg, 0],
      pos: [0, yCenter, 0],
      colorFn: limestoneTint(1.04),
    });

    // Recessed Dark Grout Ring inside collar (use independent copyGeometry so cached cylinderGeo is NEVER mutated!)
    const grooveCyl = copyGeometry(cylinderGeo(0.150, 0.150, 0.034, 20));
    grooveCyl.rotateZ(-Math.PI * 0.5);
    const grooveUV = creaseNormals(projectUV(grooveCyl, { projection: 'box', metersPerUnit: 0.4 }), { angle: 50 });
    grooveUV.translate(faceBaseX + 0.025, 0, 0);
    groutParts.push({
      geo: grooveUV,
      rot: [0, rotYDeg, 0],
      pos: [0, yCenter, 0],
      color: [0.74, 0.72, 0.69],
    });

    // Sculpted Central Domed Sun Disc (radius = 0.138m)
    const domeSphere = new THREE.SphereGeometry(0.138, 20, 12);
    const dPos = domeSphere.attributes.position;
    for (let k = 0; k < dPos.count; k++) {
      let px = dPos.getX(k);
      let py = dPos.getY(k);
      let pz = dPos.getZ(k);
      if (px < 0) {
        px *= 0.25;
      } else {
        px *= 0.48;
      }
      const rRad = Math.hypot(py, pz);
      if (px > 0) {
        const ringGroove = Math.exp(-Math.pow((rRad - 0.084) / 0.014, 2)) * 0.012;
        px -= ringGroove;
        const n = rockNoise3(px * 9, py * 9, pz * 9, seedBase + 220) * 0.002;
        px += n;
      }
      dPos.setXYZ(k, px, py, pz);
    }
    const domeUV = creaseNormals(projectUV(domeSphere, { projection: 'box', metersPerUnit: 0.4 }), { angle: 65 });
    domeUV.translate(faceBaseX + 0.038, 0, 0);
    limestoneParts.push({
      geo: domeUV,
      rot: [0, rotYDeg, 0],
      pos: [0, yCenter, 0],
      colorFn: limestoneTint(1.07),
    });

    // 4 Carved Corner Spandrel Bosses
    const spandrels = [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]];
    for (let sp = 0; sp < 4; sp++) {
      const [sy, sz] = spandrels[sp];
      const boss = buildWeatheredBlock(0.056, 0.115, 0.115, {
        sx: 2, sy: 2, sz: 2, bevel: 0.014, erode: 0.004, seed: seedBase + 250 + sp, clampBounds: true,
      });
      boss.translate(faceBaseX + 0.018, sy, sz);
      limestoneParts.push({
        geo: boss,
        rot: [0, rotYDeg, 0],
        pos: [0, yCenter, 0],
        colorFn: limestoneTint(0.97),
      });
    }
  }

  // Hero Sunburst Medallion on BOTH +X (0 deg) and +Z (-90 deg) faces!
  addSunburstMedallion(0, 400);
  addSunburstMedallion(-90, 500);

  // Back faces (-X = 180 deg, -Z = +90 deg): Framed Carved Mayan Stepped Relief Panels (staggered X depths -> ZERO FLUSH_FACES!)
  function addBackReliefPanel(rotYDeg, seedBase) {
    const faceBaseX = 0.470;
    const yCenter = 1.95;
    // [depth, backOffset, ly, lz, bh, bw] — distinct back offsets prevent coplanar back faces!
    const panelSegs = [
      [0.056, -0.008,  0.34,  0.00, 0.075, 0.68], // top bar
      [0.056, -0.008, -0.34,  0.00, 0.075, 0.68], // bottom bar
      [0.052, -0.014,  0.00, -0.30, 0.59,  0.075], // left bar (distinct back & front planes)
      [0.052, -0.014,  0.00,  0.30, 0.59,  0.075], // right bar
      // Central carved Mayan stepped cross totem (distinct back & front planes!)
      [0.062, -0.016,  0.00,  0.00, 0.44,  0.14],
      [0.074, -0.008,  0.00,  0.00, 0.24,  0.36],
      [0.058, -0.011,  0.22, -0.17, 0.11,  0.11],
      [0.058, -0.011,  0.22,  0.17, 0.11,  0.11],
      [0.058, -0.011, -0.22, -0.17, 0.11,  0.11],
      [0.058, -0.011, -0.22,  0.17, 0.11,  0.11],
    ];
    for (let i = 0; i < panelSegs.length; i++) {
      const [depth, backOff, ly, lz, bh, bw] = panelSegs[i];
      const b = buildWeatheredBlock(depth, bh, bw, {
        sx: 1, sy: 2, sz: 2, bevel: 0.011, erode: 0.004, seed: seedBase + i, clampBounds: true,
      });
      b.translate(faceBaseX + depth * 0.5 + backOff, ly, lz);
      limestoneParts.push({
        geo: b,
        rot: [0, rotYDeg, 0],
        pos: [0, yCenter, 0],
        colorFn: limestoneTint(0.95 + (i % 3) * 0.03),
      });
    }
  }
  addBackReliefPanel(180, 600);
  addBackReliefPanel(90, 650);

  // -------------------------------------------------------------------------
  // 5. UPPER WEATHERED LINTEL BLOCK (Y = 2.52 .. 3.58)
  //    Deep carved glyph panel + authentic fractured limestone broken corner!
  // -------------------------------------------------------------------------
  groutParts.push({
    geo: buildWeatheredBlock(0.96, 0.10, 0.96, {
      sx: 3, sy: 2, sz: 3, bevel: 0.01, erode: 0.004, seed: 700,
    }),
    pos: [0, 2.565, 0],
    color: [0.80, 0.79, 0.76],
  });

  // Corbelled lower lintel overhang molding (Y = 2.60 .. 2.77)
  limestoneParts.push({
    geo: buildWeatheredBlock(1.14, 0.17, 1.14, {
      sx: 4, sy: 2, sz: 4, bevel: 0.022, erode: 0.009, seed: 702, taperTop: 1.05, clampBounds: true,
    }),
    pos: [0, 2.685, 0],
    colorFn: limestoneTint(0.99),
  });

  // Recessed dark grout backing for the upper lintel glyph niches (retracted cleanly inside the fractured (+X, -Z) limestone core!)
  groutParts.push({
    geo: buildWeatheredBlock(1.13, 0.42, 1.13, {
      sx: 4, sy: 3, sz: 4, bevel: 0.014, erode: 0.006, seed: 705, clampBounds: true,
      brokenCorner: { signX: 1, signY: 1, signZ: -1, fullHeight: true, threshold: 1.12, strength: 1.15, roughness: 0.08 },
    }),
    pos: [0, 3.06, 0],
    color: [0.78, 0.77, 0.74],
  });

  // 4 Sturdy upper lintel corner pilasters framing the recessed glyph panels (with (+X, -Z) corner solidly fractured!)
  const lintelCornerSpecs = [
    [-0.515, -0.515, 0.175, 0.56, 0.175, 710, 0.97, null],
    [-0.515,  0.515, 0.175, 0.56, 0.175, 711, 1.02, null],
    [ 0.515,  0.515, 0.175, 0.56, 0.175, 712, 1.00, null],
    // Broken corner stump on (+X, -Z): solid weathered lower corner shoulder (no hollow notch!)
    [ 0.460, -0.460, 0.220, 0.24, 0.220, 713, 0.94, {
      signX: 1, signY: 1, signZ: -1, threshold: 1.05, strength: 0.55, roughness: 0.14,
    }],
  ];
  for (let i = 0; i < lintelCornerSpecs.length; i++) {
    const [cx, cz, bw, bh, bd, sd, tone, broken] = lintelCornerSpecs[i];
    const yc = i === 3 ? 2.89 : 3.055;
    limestoneParts.push({
      geo: buildWeatheredBlock(bw, bh, bd, {
        sx: 3, sy: 3, sz: 3, bevel: 0.018, erode: 0.010, seed: sd, brokenCorner: broken, clampBounds: true,
      }),
      pos: [cx, yc, cz],
      colorFn: limestoneTint(tone),
    });
  }

  // Horizontal framing sills & lintel beam for glyph frieze (Y = 2.77..2.85)
  limestoneParts.push({
    geo: buildWeatheredBlock(1.18, 0.082, 1.18, {
      sx: 4, sy: 2, sz: 4, bevel: 0.015, erode: 0.008, seed: 716, clampBounds: true,
    }),
    pos: [0, 2.812, 0],
    colorFn: limestoneTint(0.98),
  });
  // Solid broken-corner limestone upper core (forms continuous sheared rock body beneath the fractured cap slab!)
  limestoneParts.push({
    geo: buildWeatheredBlock(1.12, 0.50, 1.12, {
      sx: 5, sy: 4, sz: 5, bevel: 0.020, erode: 0.012, seed: 718,
      brokenCorner: { signX: 1, signY: 1, signZ: -1, fullHeight: true, threshold: 1.56, strength: 0.80, roughness: 0.15 },
      clampBounds: true,
    }),
    pos: [0, 3.11, 0],
    colorFn: limestoneTint(0.95),
  });

  // Carved Glyph Panels standing proud against the dark recessed glyph niches (Y = 2.86..3.26)
  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const rotY = sideAngles[sIdx];
    const glyphUs = [-0.27, 0.0, 0.27];
    for (let gi = 0; gi < 3; gi++) {
      if (rotY === 0 && gi === 0) continue;
      if (rotY === 90 && gi === 2) continue;
      const u = glyphUs[gi];
      // Outer carved cartouche tablet sitting proud of grout backing (x=0.565) out to x=0.608
      const cartouche = buildWeatheredBlock(0.056, 0.28, 0.21, {
        sx: 2, sy: 2, sz: 2, bevel: 0.014, erode: 0.004, seed: 740 + sIdx * 10 + gi, clampBounds: true,
      });
      cartouche.translate(0.580, 0, u);
      limestoneParts.push({
        geo: cartouche,
        rot: [0, rotY, 0],
        pos: [0, 3.06, 0],
        colorFn: limestoneTint(1.00 + (gi % 2) * 0.03),
      });
      // Recessed mini-channel inside cartouche
      const subGroove = buildWeatheredBlock(0.020, 0.20, 0.145, {
        sx: 1, sy: 1, sz: 1, bevel: 0.004, erode: 0.002, seed: 760 + sIdx * 10 + gi,
      });
      subGroove.translate(0.604, 0, u);
      groutParts.push({
        geo: subGroove,
        rot: [0, rotY, 0],
        pos: [0, 3.06, 0],
        color: [0.76, 0.74, 0.71],
      });
      // Authentic Mayan stepped geometric relief bars inside each carved stone cartouche
      if (gi === 1) {
        // Center cartouche: Mayan stepped temple pyramid / solar cross emblem
        const b1 = buildWeatheredBlock(0.030, 0.044, 0.125, { sx: 1, sy: 1, sz: 1, bevel: 0.006, erode: 0.002, seed: 780 + sIdx * 10, clampBounds: true });
        b1.translate(0.613, -0.056, u);
        const b2 = buildWeatheredBlock(0.030, 0.056, 0.084, { sx: 1, sy: 1, sz: 1, bevel: 0.006, erode: 0.002, seed: 781 + sIdx * 10, clampBounds: true });
        b2.translate(0.615, 0.000, u);
        const b3 = buildWeatheredBlock(0.030, 0.044, 0.048, { sx: 1, sy: 1, sz: 1, bevel: 0.006, erode: 0.002, seed: 782 + sIdx * 10, clampBounds: true });
        b3.translate(0.617, 0.054, u);
        limestoneParts.push(
          { geo: b1, rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.05) },
          { geo: b2, rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.07) },
          { geo: b3, rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.04) }
        );
      } else {
        // Flanking cartouches: Mayan interlocking L-fret & double reed bar glyph
        const flip = gi === 0 ? -1 : 1;
        const gTop = buildWeatheredBlock(0.028, 0.040, 0.118, { sx: 1, sy: 1, sz: 1, bevel: 0.005, erode: 0.002, seed: 790 + sIdx * 10 + gi, clampBounds: true });
        gTop.translate(0.613, 0.058, u);
        const gSide = buildWeatheredBlock(0.030, 0.112, 0.040, { sx: 1, sy: 1, sz: 1, bevel: 0.005, erode: 0.002, seed: 794 + sIdx * 10 + gi, clampBounds: true });
        gSide.translate(0.615, -0.022, u + flip * 0.038);
        const gLow = buildWeatheredBlock(0.026, 0.042, 0.068, { sx: 1, sy: 1, sz: 1, bevel: 0.005, erode: 0.002, seed: 798 + sIdx * 10 + gi, clampBounds: true });
        gLow.translate(0.612, -0.056, u - flip * 0.022);
        const gMid = buildWeatheredBlock(0.032, 0.042, 0.042, { sx: 1, sy: 1, sz: 1, bevel: 0.006, erode: 0.002, seed: 802 + sIdx * 10 + gi, clampBounds: true });
        gMid.translate(0.616, 0.002, u - flip * 0.028);
        limestoneParts.push(
          { geo: gTop,  rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.05) },
          { geo: gSide, rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.03) },
          { geo: gLow,  rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.06) },
          { geo: gMid,  rot: [0, rotY, 0], pos: [0, 3.06, 0], colorFn: limestoneTint(1.08) }
        );
      }
    }
  }

  // Upper Weathered Crown Cap Slab (Y = 3.31 .. 3.58) with clean full-height sheared (+X, -Z) corner!
  limestoneParts.push({
    geo: buildWeatheredBlock(1.22, 0.27, 1.22, {
      sx: 6, sy: 3, sz: 6, bevel: 0.026, erode: 0.016, seed: 860,
      brokenCorner: { signX: 1, signY: 1, signZ: -1, fullHeight: true, threshold: 1.48, strength: 0.95, roughness: 0.20 },
      clampBounds: true,
    }),
    pos: [0, 3.445, 0],
    colorFn: limestoneTint(0.97),
  });

  // -------------------------------------------------------------------------
  // 6. SCULPTED 3D VELVETY MOSS CUSHIONS (Crown Y = 3.55..3.85 + Ledges)
  // -------------------------------------------------------------------------
  const topMossSpecs = [
    [-0.18, 3.58,  0.14, 0.38, 0.24, 0.36, 0.06, 901, 1.02],
    [ 0.16, 3.57,  0.22, 0.32, 0.20, 0.29, 0.07, 902, 1.06],
    [-0.24, 3.56, -0.22, 0.31, 0.18, 0.30, 0.05, 903, 0.96],
    [ 0.12, 3.46, -0.14, 0.24, 0.15, 0.23, 0.08, 904, 0.94],
    [-0.02, 3.60,  0.02, 0.28, 0.22, 0.26, 0.02, 905, 1.09],
    [ 0.38, 3.55,  0.34, 0.19, 0.12, 0.18, 0.08, 906, 1.04],
    [-0.42, 3.55,  0.32, 0.18, 0.11, 0.19, 0.07, 907, 0.98],
    [-0.38, 3.55, -0.36, 0.17, 0.10, 0.16, 0.06, 908, 0.94],
  ];
  for (let i = 0; i < topMossSpecs.length; i++) {
    const [mx, my, mz, rx, ry, rz, dr, sd, tone] = topMossSpecs[i];
    mossParts.push({
      geo: buildMossCushion(rx, ry, rz, sd, { wSeg: 14, hSeg: 9, drape: dr }),
      pos: [mx, my, mz],
      colorFn: mossTint(tone),
    });
  }

  // Rich pillowed moss draped across plinth shoulders & cornice ledges
  const ledgeMossSpecs = [
    [ 0.44, 0.82,  0.42, 0.21, 0.105, 0.20, 0.06, 920, 1.06],
    [ 0.20, 0.82,  0.51, 0.18, 0.080, 0.13, 0.05, 921, 1.01],
    [ 0.51, 0.82,  0.16, 0.13, 0.078, 0.18, 0.05, 922, 0.98],
    [-0.43, 0.82,  0.43, 0.18, 0.088, 0.18, 0.05, 923, 0.95],
    [ 0.43, 0.82, -0.42, 0.17, 0.082, 0.17, 0.05, 924, 0.93],
    [-0.44, 0.82, -0.43, 0.18, 0.084, 0.17, 0.05, 925, 0.91],

    // Tier 1 step ledge moss (Y ~ 0.43)
    [ 0.48, 0.43,  0.46, 0.18, 0.082, 0.18, 0.06, 930, 0.98],
    [ 0.14, 0.43,  0.55, 0.16, 0.060, 0.09, 0.04, 931, 0.93],
    [ 0.55, 0.43, -0.15, 0.09, 0.058, 0.16, 0.04, 932, 0.91],
    [-0.48, 0.43,  0.48, 0.16, 0.075, 0.16, 0.05, 933, 0.95],

    // Crevice moss on fret shelf, lintel ledge & fractured broken corner shelf
    [ 0.44, 1.385, 0.44, 0.12, 0.050, 0.12, 0.03, 940, 1.04],
    [-0.44, 1.385, 0.44, 0.11, 0.045, 0.11, 0.03, 941, 0.98],
    [ 0.46, 2.52,  0.45, 0.12, 0.052, 0.12, 0.03, 942, 1.02],
    [ 0.42, 3.01, -0.42, 0.17, 0.068, 0.17, 0.05, 943, 0.99],
    [ 0.30, 3.04, -0.34, 0.13, 0.055, 0.13, 0.04, 944, 1.04],
  ];
  for (let i = 0; i < ledgeMossSpecs.length; i++) {
    const [mx, my, mz, rx, ry, rz, dr, sd, tone] = ledgeMossSpecs[i];
    mossParts.push({
      geo: buildMossCushion(rx, ry, rz, sd, { wSeg: 8, hSeg: 6, drape: dr }),
      pos: [mx, my, mz],
      colorFn: mossTint(tone),
    });
  }

  const limestoneGeo = mergeEntries(limestoneParts);
  const groutGeo = mergeEntries(groutParts);
  const dampGeo = mergeEntries(dampParts);
  const mossGeo = mergeEntries(mossParts);

  const mPos = mossGeo.attributes.position;
  for (let i = 0; i < mPos.count; i++) {
    mPos.setXYZ(
      i,
      Math.max(-0.645, Math.min(0.645, mPos.getX(i))),
      Math.max(-0.48, Math.min(3.845, mPos.getY(i))),
      Math.max(-0.645, Math.min(0.645, mPos.getZ(i)))
    );
  }
  mossGeo.computeBoundingBox();
  mossGeo.computeBoundingSphere();

  createPart('SteleLimestone', limestoneGeo, mats.limestoneMat, { parent: root });
  createPart('SteleCarvedGrout', groutGeo, mats.groutMat, { parent: root });
  createPart('SteleDampPlinth', dampGeo, mats.dampMat, { parent: root });
  createPart('SteleMossCushions', mossGeo, mats.mossMat, { parent: root });

  return root;
}
