const meta = { name: 'stone-brazier', role: 'prop' };

// ============================================================================
// Lagoon Sanctuary — Carved Mossy Stone Fire Brazier for the Viaduct Bend
// Orientation: +X forward, +Y up, +Z right
// Base at Y = 0.00m, height 1.20m (Y in [0.00, +1.20]), width 0.78m x 0.78m
// Carved stepped Mayan pedestal (Y = 0.00..0.75m) with fretwork relief & moss base
// Wide carved shallow stone fire bowl (0.78m dia, Y = 0.75..1.12m)
// Sculpted dark charred logs/coals + glowing ember core (#ff9e3d, emissiveIntensity: 2.2)
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
  const bevel = Math.min(o.bevel != null ? o.bevel : 0.015, Math.min(w, h, d) * 0.35);
  const erode = o.erode != null ? o.erode : 0.006;
  const seed = o.seed || 11;
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

    if (erode > 0) {
      const nx = rockNoise3(x + 1.3, y - 0.7, z + 2.1, seed);
      const ny = rockNoise3(x - 2.1, y + 1.9, z - 0.4, seed + 17);
      const nz = rockNoise3(x + 0.5, y + 2.7, z - 1.8, seed + 37);
      x += nx * erode;
      y += ny * erode * 0.6;
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
    metersPerUnit: o.metersPerUnit || 0.75,
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
    const n1 = rockNoise3(x * 2.0, y * 1.6, z * 2.0, seed);
    const n2 = rockNoise3(x * 4.5, y * 3.8, z * 4.5, seed + 53) * 0.42;
    const lump = 1.0 + (n1 * 0.22 + n2 * 0.14);

    let px = x * rx * lump;
    let py = y * ry * (1.0 + n1 * 0.24 + n2 * 0.15);
    let pz = z * rz * lump;

    if (drape > 0 && rHoriz > 0.65 && y <= 0.15) {
      py -= drape * Math.pow((rHoriz - 0.65) / 0.35, 1.5) * (0.7 + 0.3 * Math.max(0, n1));
    }

    pos.setXYZ(i, px, py, pz);
  }

  const uvGeo = projectUV(baseGeo, { projection: 'box', metersPerUnit: 0.40 });
  return creaseNormals(uvGeo, { angle: 85 });
}

// Sculpted organic coal / ember chunk (displaced faceted rock lump)
function buildCoalChunk(rx, ry, rz, seed, wSeg, hSeg) {
  const baseGeo = new THREE.SphereGeometry(1, wSeg || 7, hSeg || 5);
  const pos = baseGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n1 = rockNoise3(x * 2.4, y * 2.4, z * 2.4, seed);
    const n2 = rockNoise3(x * 5.2, y * 5.2, z * 5.2, seed + 31) * 0.35;
    const s = 0.88 + (n1 * 0.24 + n2 * 0.14);
    pos.setXYZ(i, x * rx * s, y * ry * s, z * rz * s);
  }
  const uvGeo = projectUV(baseGeo, { projection: 'box', metersPerUnit: 0.30 });
  return creaseNormals(uvGeo, { angle: 42 });
}

// Sculpted charred billet log lying along local Y
function buildCharredLog(radius, length, seed) {
  const baseGeo = new THREE.CylinderGeometry(radius * 0.86, radius * 1.06, length, 9, 5);
  const pos = baseGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = rockNoise3(x * 16, y * 7, z * 16, seed);
    const r = Math.hypot(x, z);
    if (r > 0.002) {
      const sc = 1.0 + n * 0.18;
      x *= sc;
      z *= sc;
    }
    // Slight organic crook
    x += Math.sin((y / length) * Math.PI) * 0.012 * (seed % 2 === 0 ? 1 : -1);
    pos.setXYZ(i, x, y, z);
  }
  const uvGeo = projectUV(baseGeo, { projection: 'box', metersPerUnit: 0.35 });
  return creaseNormals(uvGeo, { angle: 46 });
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

function createBrazierMaterials() {
  const packedMR = (roughByte) => (255 << 16) | (roughByte << 8);

  // 1. Weathered Pale Limestone
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

  // 2. Carved Relief Shadow / Grout
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

  // 3. Velvety Stone Moss
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

  // 4. Charred Wood & Dark Coals (warm dark ash charcoal with sculpted relief)
  const coalAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'CharredCoalAlbedo',
    layers: [
      { op: 'solid', color: 0x3b322c },
      { op: 'cellular', cellsX: 10, cellsY: 10, seed: 111, jitterX: 0.85, jitterY: 0.85, feature: 'f2-f1', range: 0.45, colorA: 0x201a16, colorB: 0x56483e, blend: 'overlay', opacity: 0.72 },
      { op: 'noise', colorA: 0x241d19, colorB: 0x625246, scale: 28, octaves: 4, seed: 112, blend: 'overlay', opacity: 0.5 },
    ],
  });
  const coalMat = pbrMaterial({
    albedo: coalAlbedo,
    normal: normalMapFromHeight(coalAlbedo, { strength: 6.0, name: 'CharredCoalNormal' }),
    roughness: 0.94,
    metalness: 0,
    name: 'CharredWoodCoal',
  });
  coalMat.vertexColors = true;

  // 5. Glowing Brazier Ember Core (#ff9e3d, emissiveIntensity: 2.2)
  const emberAlbedo = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'albedo',
    name: 'BrazierEmberAlbedo',
    layers: [
      { op: 'solid', color: 0xff9e3d },
      { op: 'cellular', cellsX: 8, cellsY: 8, seed: 131, jitterX: 0.85, jitterY: 0.85, feature: 'f2-f1', range: 0.55, colorA: 0xff5a18, colorB: 0xffcc66, blend: 'overlay', opacity: 0.75 },
      { op: 'noise', colorA: 0xd84612, colorB: 0xffe08a, scale: 18, octaves: 4, seed: 132, blend: 'overlay', opacity: 0.50 },
    ],
  });
  const emberEmissive = proceduralTexture({
    schemaVersion: 2,
    size: 256,
    usage: 'emissive',
    name: 'BrazierEmberEmissive',
    layers: [
      { op: 'solid', color: 0xff9e3d },
      { op: 'cellular', cellsX: 8, cellsY: 8, seed: 131, jitterX: 0.85, jitterY: 0.85, feature: 'f2-f1', range: 0.55, colorA: 0xff4810, colorB: 0xffc65c, blend: 'overlay', opacity: 0.80 },
    ],
  });
  const emberMat = pbrMaterial({
    albedo: emberAlbedo,
    normal: normalMapFromHeight(emberAlbedo, { strength: 4.0, name: 'BrazierEmberNormal' }),
    emissive: emberEmissive,
    emissiveIntensity: 2.2,
    roughness: 0.65,
    metalness: 0,
    name: 'BrazierEmbers',
  });
  emberMat.vertexColors = true;

  return { limestoneMat, groutMat, mossMat, coalMat, emberMat };
}

async function build() {
  const root = createRoot('StoneBrazier');
  const rng = seededRandom('stone-brazier-v1');
  const mats = createBrazierMaterials();

  const limestoneParts = [];
  const groutParts = [];
  const mossParts = [];
  const coalParts = [];
  const emberParts = [];

  const stoneTint = (tone, sootTop) => (x, y, z, nx, ny, nz) => {
    const up = ny > 0.35 ? 1.03 : (ny < -0.35 ? 0.82 : 0.96);
    // Subtle dark fire-soot patina inside upper bowl cavity (Y > 0.88 and near center)
    let soot = 1.0;
    if (sootTop && y > 0.85) {
      const r = Math.hypot(x, z);
      if (r < 0.32 && ny > 0.15) {
        soot = 0.52 + 0.48 * Math.min(1, r / 0.32);
      }
    }
    // Slight damp olive darkening near ground Y = 0
    const groundDamp = y < 0.18 ? 0.84 + 0.16 * (y / 0.18) : 1.0;
    return [
      tone * up * soot * groundDamp,
      tone * up * soot * groundDamp,
      tone * up * soot * groundDamp * 0.96,
    ];
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
  // 1. CARVED STEPPED MAYAN LIMESTONE PEDESTAL (Y = 0.00 .. 0.76m)
  // -------------------------------------------------------------------------
  // Lower stepped base plinth (Y = 0.00 .. 0.12m, 0.72m x 0.72m)
  limestoneParts.push({
    geo: buildWeatheredBlock(0.72, 0.12, 0.72, {
      sx: 3, sy: 2, sz: 3, bevel: 0.020, erode: 0.008, seed: 101, taperTop: 0.97, clampBounds: true,
    }),
    pos: [0, 0.06, 0],
    colorFn: stoneTint(0.86, false),
  });
  // Upper stepped base plinth (Y = 0.11 .. 0.22m, 0.60m x 0.60m)
  limestoneParts.push({
    geo: buildWeatheredBlock(0.60, 0.11, 0.60, {
      sx: 3, sy: 2, sz: 3, bevel: 0.018, erode: 0.007, seed: 103, taperTop: 0.96, clampBounds: true,
    }),
    pos: [0, 0.165, 0],
    colorFn: stoneTint(0.93, false),
  });

  // Recessed carved Mayan fretwork pedestal core (Y = 0.22 .. 0.64m, 0.40m x 0.40m)
  groutParts.push({
    geo: buildWeatheredBlock(0.40, 0.42, 0.40, { sx: 2, sy: 2, sz: 2, bevel: 0.008, erode: 0.003, seed: 105 }),
    pos: [0, 0.43, 0],
    color: [0.77, 0.75, 0.71],
  });

  // 4 Carved Corner Pilasters on pedestal shaft (outer span 0.48m, Y = 0.21 .. 0.64m)
  const pedC = [[-0.185, -0.185], [0.185, -0.185], [-0.185, 0.185], [0.185, 0.185]];
  for (let c = 0; c < 4; c++) {
    limestoneParts.push({
      geo: buildWeatheredBlock(0.115, 0.43, 0.115, {
        sx: 2, sy: 2, sz: 2, bevel: 0.014, erode: 0.005, seed: 110 + c, clampBounds: true,
      }),
      pos: [pedC[c][0], 0.425, pedC[c][1]],
      colorFn: stoneTint(0.98 + (c % 2) * 0.03, false),
    });
  }

  // Carved Mayan Step-Fret Relief on all 4 sides of the pedestal (Y = 0.25 .. 0.60m)
  for (let s = 0; s < 4; s++) {
    const rotY = s * 90;
    // Outer U-fret + stepped central temple pyramid boss (staggered X depths -> ZERO FLUSH_FACES!)
    const segs = [
      [0.044, 0.214,  0.125, 0.000, 0.046, 0.24], // top bar
      [0.044, 0.214, -0.125, 0.000, 0.046, 0.24], // bottom bar
      [0.040, 0.210,  0.000, -0.098, 0.20, 0.046], // left vertical
      [0.040, 0.210,  0.000,  0.098, 0.20, 0.046], // right vertical
      [0.052, 0.218, -0.025, 0.000, 0.095, 0.11], // central stepped glyph base
      [0.056, 0.220,  0.040, 0.000, 0.055, 0.06], // central stepped glyph peak
    ];
    for (let g = 0; g < segs.length; g++) {
      const [dx, xOff, ly, lz, bh, bw] = segs[g];
      const b = buildWeatheredBlock(dx, bh, bw, {
        sx: 1, sy: 1, sz: 1, bevel: 0.007, erode: 0.0025, seed: 130 + s * 10 + g, clampBounds: true,
      });
      b.translate(xOff, ly, lz);
      limestoneParts.push({
        geo: b, rot: [0, rotY, 0], pos: [0, 0.425, 0], colorFn: stoneTint(1.00 + (g % 2) * 0.04, false),
      });
    }
  }

  // Flaring stepped corbel neck collar supporting the wide stone bowl (Y = 0.63 .. 0.77m)
  limestoneParts.push({
    geo: buildWeatheredBlock(0.56, 0.14, 0.56, {
      sx: 3, sy: 2, sz: 3, bevel: 0.020, erode: 0.007, seed: 180, taperTop: 1.08, clampBounds: true,
    }),
    pos: [0, 0.70, 0],
    colorFn: stoneTint(0.97, false),
  });

  // -------------------------------------------------------------------------
  // 2. WIDE CARVED SHALLOW STONE FIRE BOWL (0.78m diameter, Y = 0.75 .. 1.12m)
  //    Watertight revolved solid via await revolveProfile + carved exterior lug bosses!
  // -------------------------------------------------------------------------
  const bowlProfile = [
    [0.00, 0.750], // bottom axis center
    [0.23, 0.750], // base seat on corbel collar
    [0.31, 0.820], // lower belly flare
    [0.36, 0.930], // mid carved wall
    [0.39, 1.035], // widest outer rim shoulder (0.78m exact diameter!)
    [0.39, 1.115], // outer upper rim lip
    [0.33, 1.120], // beveled top rim edge
    [0.30, 1.045], // inner slanted stone basin wall
    [0.21, 0.935], // inner fire pit slope
    [0.00, 0.895], // inner basin floor center
  ];
  const bowlRaw = await revolveProfile(bowlProfile, { segments: 32, bevel: 0.010, bevelSegments: 3, smooth: false });
  // Smooth low-frequency hand-chiseled limestone contour (zero harsh diagonal facet streaks!)
  const bPos = bowlRaw.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    let x = bPos.getX(i), y = bPos.getY(i), z = bPos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.05) {
      const n = rockNoise3(x * 3.8, y * 4.2, z * 3.8, 210) * 0.0032;
      const sc = Math.min(0.388 / Math.max(r, 0.001), 1.0 + n / Math.max(r, 0.08));
      x *= sc;
      z *= sc;
      y += rockNoise3(x * 4.5, y * 4.5, z * 4.5, 215) * 0.0022;
      y = Math.min(1.122, y);
    }
    bPos.setXYZ(i, x, y, z);
  }
  const bowlGeo = creaseNormals(projectUV(bowlRaw, { projection: 'box', metersPerUnit: 0.70 }), { angle: 54 });
  limestoneParts.push({
    geo: bowlGeo,
    colorFn: stoneTint(1.01, true),
  });

  // 8 Carved Mayan exterior decorative vertical ribs / lug tabs ringing the bowl belly!
  // Positioned cleanly within R <= 0.388m so footprint stays strictly <= 0.78 x 0.78m!
  for (let i = 0; i < 8; i++) {
    const angDeg = i * 45;
    const isCardinal = (i % 2 === 0);
    const rib = buildWeatheredBlock(isCardinal ? 0.056 : 0.044, isCardinal ? 0.175 : 0.145, isCardinal ? 0.095 : 0.068, {
      sx: 1, sy: 2, sz: 1, bevel: 0.010, erode: 0.0025, seed: 240 + i, clampBounds: true,
    });
    rib.translate(isCardinal ? 0.358 : 0.352, 0.965, 0);
    limestoneParts.push({
      geo: rib,
      rot: [0, angDeg, 0],
      colorFn: stoneTint(isCardinal ? 1.05 : 0.97, false),
    });
  }

  // -------------------------------------------------------------------------
  // 3. SCULPTED VELVETY MOSS CUSHIONS AROUND PEDESTAL BASE & LOWER LEDGES
  // -------------------------------------------------------------------------
  const mossSpecs = [
    [-0.27, 0.115,  0.25, 0.12, 0.055, 0.11, 0.04, 301, 1.04],
    [ 0.28, 0.112,  0.22, 0.10, 0.048, 0.11, 0.04, 302, 0.98],
    [-0.24, 0.110, -0.26, 0.11, 0.050, 0.10, 0.03, 303, 0.95],
    [ 0.25, 0.110, -0.25, 0.09, 0.044, 0.09, 0.03, 304, 0.93],
    // Stepped upper base corner tufts (Y = 0.22)
    [-0.22, 0.222,  0.20, 0.08, 0.036, 0.08, 0.02, 305, 1.06],
    [ 0.21, 0.220, -0.20, 0.08, 0.034, 0.07, 0.02, 306, 0.97],
    // Subtle moss patch on cool underside ledge of corbel (Y = 0.64)
    [-0.22, 0.642,  0.21, 0.07, 0.028, 0.07, 0.02, 307, 1.02],
  ];
  for (let m = 0; m < mossSpecs.length; m++) {
    const [mx, my, mz, rx, ry, rz, dr, sd, tone] = mossSpecs[m];
    mossParts.push({
      geo: buildMossCushion(rx, ry, rz, sd, { wSeg: 7, hSeg: 5, drape: dr }),
      pos: [mx, my, mz],
      colorFn: mossTint(tone),
    });
  }

  // -------------------------------------------------------------------------
  // 4. CHARRED WOOD LOGS & DARK CHARCOAL BED (Y = 0.90 .. 1.19m)
  // -------------------------------------------------------------------------
  const fireRng = rng.fork('fire-bed');
  // Warm ember-underlit vertex tinting on charcoal & logs (glowing scorched undersides facing ember heart!)
  const coalFireTint = (baseTone) => (x, y, z, nx, ny, nz) => {
    const r = Math.hypot(x, z);
    const glowProx = Math.max(0, 1.0 - r / 0.25) * Math.max(0, 1.0 - Math.abs(y - 1.01) / 0.16);
    const under = Math.max(0, -ny * 0.6 + 0.4);
    const heat = glowProx * under;
    return [
      Math.min(1.0, baseTone * 0.92 + heat * 0.55),
      Math.min(1.0, baseTone * 0.86 + heat * 0.20),
      Math.min(1.0, baseTone * 0.82 + heat * 0.04),
    ];
  };

  // Continuous sculpted dark ash & charcoal bed filling the inner basin (eliminates pale gaps between coals!)
  coalParts.push({
    geo: buildCoalChunk(0.285, 0.055, 0.285, 395, 12, 6),
    pos: [0, 0.945, 0],
    colorFn: coalFireTint(0.82),
  });

  // Outer ring of dark charred coal lumps nestled against inner bowl walls
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * Math.PI * 2 + fireRng.range(-0.15, 0.15);
    const rad = fireRng.range(0.15, 0.245);
    const cx = Math.cos(th) * rad;
    const cz = Math.sin(th) * rad;
    const cy = 0.965 + fireRng.range(0.0, 0.052);
    coalParts.push({
      geo: buildCoalChunk(fireRng.range(0.058, 0.090), fireRng.range(0.042, 0.068), fireRng.range(0.055, 0.086), 400 + i, 7, 5),
      pos: [cx, cy, cz],
      rot: [fireRng.range(-25, 25), fireRng.range(0, 180), fireRng.range(-25, 25)],
      colorFn: coalFireTint(fireRng.range(0.80, 1.05)),
    });
  }

  // 5 Crossed Sculpted Charred Firewood Billets framing the glowing ember heart!
  const logSpecs = [
    // [pos, rotDeg, r, len, seed]
    [[ 0.06, 1.075,  0.04], [ 62,  25,  14], 0.036, 0.36, 440],
    [[-0.07, 1.080,  0.03], [ 58, 145, -18], 0.034, 0.35, 441],
    [[ 0.01, 1.090, -0.07], [ 64, 265,  12], 0.035, 0.34, 442],
    [[-0.04, 1.055, -0.04], [ 76,  82,  22], 0.030, 0.30, 443],
    [[ 0.05, 1.050,  0.08], [ 74, 205, -20], 0.029, 0.29, 444],
  ];
  for (let l = 0; l < logSpecs.length; l++) {
    const [pos, rot, r, len, sd] = logSpecs[l];
    coalParts.push({
      geo: buildCharredLog(r, len, sd),
      pos,
      rot,
      colorFn: coalFireTint(0.95),
    });
  }

  // -------------------------------------------------------------------------
  // 5. WARM GLOWING EMBER HEART (#ff9e3d, emissiveIntensity: 2.2)
  //    Nestled in the center between the charred logs (Y = 0.95 .. 1.16m)!
  // -------------------------------------------------------------------------
  // Main glowing ember mound heart
  emberParts.push({
    geo: buildCoalChunk(0.165, 0.085, 0.160, 501, 10, 7),
    pos: [0, 0.995, 0],
    color: [1.0, 0.98, 0.92],
  });
  // Hot glowing ember coals poking brightly up between the crossed logs!
  const emberSpecs = [
    [ 0.00, 1.065,  0.00, 0.095, 0.068, 0.092, 502],
    [ 0.08, 1.030, -0.04, 0.068, 0.052, 0.064, 503],
    [-0.08, 1.035,  0.05, 0.066, 0.050, 0.068, 504],
    [ 0.04, 1.028,  0.09, 0.062, 0.046, 0.060, 505],
    [-0.05, 1.025, -0.08, 0.064, 0.048, 0.062, 506],
    [ 0.01, 1.105,  0.01, 0.054, 0.048, 0.052, 507],
  ];
  for (let e = 0; e < emberSpecs.length; e++) {
    const [ex, ey, ez, rx, ry, rz, sd] = emberSpecs[e];
    emberParts.push({
      geo: buildCoalChunk(rx, ry, rz, sd, 8, 6),
      pos: [ex, ey, ez],
      color: [1.0, 0.96, 0.90],
    });
  }

  // Merge into 5 single-draw meshes (strictly <= 5 materials / draw slots!)
  const limestoneGeo = mergeEntries(limestoneParts);
  const groutGeo = mergeEntries(groutParts);
  const mossGeo = mergeEntries(mossParts);
  const coalGeo = mergeEntries(coalParts);
  const emberGeo = mergeEntries(emberParts);

  // Clamp coal tips strictly <= Y = 1.20m and footprint strictly within ±0.390m (exact 0.78 x 1.20 x 0.78m!)
  const clampEnv = (g, maxY) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(
        i,
        Math.max(-0.390, Math.min(0.390, p.getX(i))),
        Math.max(0.0, Math.min(maxY, p.getY(i))),
        Math.max(-0.390, Math.min(0.390, p.getZ(i)))
      );
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
  };
  clampEnv(limestoneGeo, 1.125);
  clampEnv(mossGeo, 1.125);
  clampEnv(coalGeo, 1.198);

  createPart('BrazierLimestone', limestoneGeo, mats.limestoneMat, { parent: root });
  createPart('BrazierCarvedGrout', groutGeo, mats.groutMat, { parent: root });
  createPart('BrazierMossCushions', mossGeo, mats.mossMat, { parent: root });
  createPart('BrazierCharredLogs', coalGeo, mats.coalMat, { parent: root });
  createPart('BrazierEmberCore', emberGeo, mats.emberMat, { parent: root });

  return root;
}
