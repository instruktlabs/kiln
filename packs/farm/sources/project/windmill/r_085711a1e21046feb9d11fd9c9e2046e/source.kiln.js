const meta = {
  name: 'Windmill',
  role: 'building'
};

/**
 * Merges multiple BufferGeometries into a single BufferGeometry.
 * Preserves position, normal, and uv attributes.
 * @param {THREE.BufferGeometry[]} geometries
 * @returns {THREE.BufferGeometry}
 */
function mergeGeometries(geometries) {
  if (!geometries || geometries.length === 0) {
    return new THREE.BufferGeometry();
  }
  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of geometries) {
    totalVerts += g.attributes.position.count;
    if (g.index) totalIndices += g.index.count;
  }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const indices = new (totalVerts < 65535 ? Uint16Array : Uint32Array)(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geometries) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    pos.set(p, vOffset * 3);
    norm.set(n, vOffset * 3);
    uv.set(u, vOffset * 2);
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) {
        indices[iOffset + i] = idx[i] + vOffset;
      }
      iOffset += idx.length;
    }
    vOffset += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/**
 * Creates an oriented box beam between endpoints p1 and p2.
 * Scales UV along length so wood grain repeats uniformly.
 */
function createOrientedBeam(p1, p2, width, depth, uvRepeat = 1.0) {
  const v1 = new THREE.Vector3(...p1);
  const v2 = new THREE.Vector3(...p2);
  const dir = new THREE.Vector3().subVectors(v2, v1);
  const len = dir.length();
  if (len < 1e-4) return new THREE.BufferGeometry();
  dir.normalize();

  const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
  const geo = copyGeometry(boxGeo(width, len, depth));

  const uvAttr = geo.attributes.uv;
  const uvScaleY = len / uvRepeat;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setY(i, uvAttr.getY(i) * uvScaleY);
  }

  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const matrix = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(matrix);
  return geo;
}

/**
 * Creates a circular band/ring in the YZ plane at radius r.
 */
function createYZRing(radius, widthX, thicknessR, segments = 32) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const rIn = radius - thicknessR / 2;
  const rOut = radius + thicknessR / 2;
  const halfW = widthX / 2;

  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    positions.push(halfW, rIn * cosT, rIn * sinT);
    normals.push(1, 0, 0);
    uvs.push(s / segments * 4, 0);

    positions.push(halfW, rOut * cosT, rOut * sinT);
    normals.push(1, 0, 0);
    uvs.push(s / segments * 4, 1);

    positions.push(-halfW, rOut * cosT, rOut * sinT);
    normals.push(0, cosT, sinT);
    uvs.push(s / segments * 4, 1);

    positions.push(-halfW, rIn * cosT, rIn * sinT);
    normals.push(0, -cosT, -sinT);
    uvs.push(s / segments * 4, 0);

    if (s > 0) {
      const curr = s * 4;
      const prev = (s - 1) * 4;
      indices.push(prev + 0, curr + 0, curr + 1);
      indices.push(prev + 0, curr + 1, prev + 1);
      indices.push(prev + 1, curr + 1, curr + 2);
      indices.push(prev + 1, curr + 2, prev + 2);
      indices.push(prev + 2, curr + 2, curr + 3);
      indices.push(prev + 2, curr + 3, prev + 3);
      indices.push(prev + 3, curr + 3, curr + 0);
      indices.push(prev + 3, curr + 0, prev + 0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a chamfered stone/concrete footing pedestal at [x, 0, z].
 */
function createFootingPedestal(x, z, h = 0.22, baseW = 0.32, topW = 0.24) {
  const hb = baseW / 2;
  const ht = topW / 2;
  const pos = [
    -hb, 0, -hb,
     hb, 0, -hb,
     hb, 0,  hb,
    -hb, 0,  hb,
    -ht, h, -ht,
     ht, h, -ht,
     ht, h,  ht,
    -ht, h,  ht
  ];

  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    3, 7, 6, 3, 6, 2,
    1, 5, 4, 1, 4, 0,
    2, 6, 5, 2, 5, 1,
    0, 4, 7, 0, 7, 3
  ];

  const uvs = [
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(x, 0, z));
  return geo;
}

/**
 * Creates an authentic trapezoidal windpump tail vane in the XY plane.
 * Front at xFront (narrower), trailing edge at xRear (taller).
 */
function createTailVaneGeo(xFront, xRear, yCenter, hFront, hRear, thickness) {
  const ht = thickness / 2;
  const pos = [];
  const uvs = [];
  const indices = [];

  const yF_top = yCenter + hFront / 2;
  const yF_bot = yCenter - hFront / 2;
  const yR_top = yCenter + hRear / 2;
  const yR_bot = yCenter - hRear / 2;

  const zOffsets = [ht, -ht];
  for (let s = 0; s < 2; s++) {
    const z = zOffsets[s];
    pos.push(xFront, yF_bot, z);
    uvs.push(0, 0);
    pos.push(xFront, yF_top, z);
    uvs.push(0, 1);
    pos.push(xRear, yR_top, z);
    uvs.push(1, 1);
    pos.push(xRear, yR_bot, z);
    uvs.push(1, 0);
  }

  // +Z face (view from +Z)
  indices.push(0, 1, 2, 0, 2, 3);
  // -Z face (view from -Z)
  indices.push(4, 7, 6, 4, 6, 5);
  // Top face (view from +Y)
  indices.push(1, 2, 6, 1, 6, 5);
  // Bottom face (view from -Y)
  indices.push(0, 4, 7, 0, 7, 3);
  // Front edge (view from +X)
  indices.push(0, 1, 5, 0, 5, 4);
  // Rear edge (view from -X)
  indices.push(3, 7, 6, 3, 6, 2);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates one faceted aerodynamic windpump blade.
 * Has a longitudinal crease (spine) with cambered facets and pitch angle.
 */
function createCreasedBladeGeo(rInner, rOuter, wInner, wOuter, pitchDeg = 24, camberH = 0.018) {
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  const rMid = (rInner + rOuter) * 0.5;
  const wMid = (wInner + wOuter) * 0.5;

  const stations = [
    { r: rInner, w: wInner },
    { r: rMid, w: wMid },
    { r: rOuter, w: wOuter }
  ];

  const pos = [];
  const uvs = [];
  const indices = [];

  // Each station has 3 points: Leading Edge, Center Spine (creased), Trailing Edge
  for (let i = 0; i < stations.length; i++) {
    const { r, w } = stations[i];
    const halfW = w * 0.5;

    // Point 0: Leading edge
    const x0 = -halfW * sinP;
    const z0 = -halfW * cosP;
    pos.push(x0, r, z0);
    uvs.push(0, i / 2);

    // Point 1: Center spine (elevated along blade normal for camber / crease)
    const x1 = camberH * cosP;
    const z1 = -camberH * sinP;
    pos.push(x1, r, z1);
    uvs.push(0.5, i / 2);

    // Point 2: Trailing edge
    const x2 = halfW * sinP;
    const z2 = halfW * cosP;
    pos.push(x2, r, z2);
    uvs.push(1, i / 2);

    if (i > 0) {
      const c = i * 3;
      const p = (i - 1) * 3;

      // Facet A: Leading half (Front CCW)
      indices.push(p + 0, c + 0, c + 1);
      indices.push(p + 0, c + 1, p + 1);

      // Facet B: Trailing half (Front CCW)
      indices.push(p + 1, c + 1, c + 2);
      indices.push(p + 1, c + 2, p + 2);

      // Double-sided back faces (Back CCW)
      indices.push(p + 0, c + 1, c + 0);
      indices.push(p + 0, p + 1, c + 1);

      indices.push(p + 1, c + 2, c + 1);
      indices.push(p + 1, p + 2, c + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

async function build() {
  const root = createRoot('Windmill');

  // Load approved materials via strict portable specs
  const honeyWood = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Farm honey wood (subdued grain derivative)',
    baseColor: 16777215,
    roughness: 1,
    metalness: 0,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: {
        kind: 'resource',
        resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.base-color'
      },
      normal: {
        kind: 'resource',
        resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.normal'
      },
      metallicRoughness: {
        kind: 'resource',
        resourceId: 'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.metallic-roughness'
      }
    }
  });

  const brushedMetal = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Brushed neutral metal',
    baseColor: 16777215,
    roughness: 1,
    metalness: 1,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: true,
    textures: {
      baseColor: {
        kind: 'resource',
        resourceId: 'kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.base-color'
      },
      normal: {
        kind: 'resource',
        resourceId: 'kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.normal'
      },
      metallicRoughness: {
        kind: 'resource',
        resourceId: 'kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.metallic-roughness'
      }
    }
  });

  // ==========================================
  // 1. TOWER FRAME (Stationary Timber Structure)
  // ==========================================
  const woodGeos = [];
  const metalGeos = [];

  const yBase = 0.22;
  const yTop = 5.25;
  const rBase = 0.80;
  const rTop = 0.25;

  const cX = (y) => {
    const t = (y - yBase) / (yTop - yBase);
    return rBase + t * (rTop - rBase);
  };

  // 4 Corner Posts (Substantial 0.16m x 0.16m square timbers)
  const postW = 0.16;
  const corners = [
    [1, 1],   // Front-Right (+X, +Z)
    [1, -1],  // Front-Left (+X, -Z)
    [-1, -1], // Back-Left (-X, -Z)
    [-1, 1]   // Back-Right (-X, +Z)
  ];

  for (const [sx, sz] of corners) {
    const p1 = [sx * rBase, yBase, sz * rBase];
    const p2 = [sx * rTop, yTop, sz * rTop];
    woodGeos.push(createOrientedBeam(p1, p2, postW, postW, 1.0));
  }

  // Horizontal Tie Beams at 4 tiers (sturdy 0.12m high x 0.11m thick)
  const tierY = [0.65, 2.15, 3.65, 5.15];
  const tieW = 0.11;
  const tieH = 0.11;

  for (let i = 0; i < tierY.length; i++) {
    const y = tierY[i];
    const c = cX(y);
    woodGeos.push(createOrientedBeam([c, y, -c], [c, y, c], tieH, tieW, 1.0));
    woodGeos.push(createOrientedBeam([-c, y, -c], [-c, y, c], tieH, tieW, 1.0));
    woodGeos.push(createOrientedBeam([-c, y, c], [c, y, c], tieW, tieH, 1.0));
    woodGeos.push(createOrientedBeam([-c, y, -c], [c, y, -c], tieW, tieH, 1.0));
  }

  // Diagonal X-Braces between tiers (3 bays, 4 faces = 24 cross braces)
  const braceW = 0.085;
  const braceD = 0.07;

  for (let b = 0; b < 3; b++) {
    const yLo = tierY[b];
    const yHi = tierY[b + 1];
    const cLo = cX(yLo);
    const cHi = cX(yHi);

    // Front face (+X)
    woodGeos.push(createOrientedBeam([cLo, yLo, -cLo], [cHi, yHi, cHi], braceW, braceD, 1.0));
    woodGeos.push(createOrientedBeam([cLo, yLo, cLo], [cHi, yHi, -cHi], braceW, braceD, 1.0));

    // Back face (-X)
    woodGeos.push(createOrientedBeam([-cLo, yLo, -cLo], [-cHi, yHi, cHi], braceW, braceD, 1.0));
    woodGeos.push(createOrientedBeam([-cLo, yLo, cLo], [-cHi, yHi, -cHi], braceW, braceD, 1.0));

    // Right face (+Z)
    woodGeos.push(createOrientedBeam([-cLo, yLo, cLo], [cHi, yHi, cHi], braceD, braceW, 1.0));
    woodGeos.push(createOrientedBeam([cLo, yLo, cLo], [-cHi, yHi, cHi], braceD, braceW, 1.0));

    // Left face (-Z)
    woodGeos.push(createOrientedBeam([-cLo, yLo, -cLo], [cHi, yHi, -cHi], braceD, braceW, 1.0));
    woodGeos.push(createOrientedBeam([cLo, yLo, -cLo], [-cHi, yHi, -cHi], braceD, braceW, 1.0));
  }

  // Inspection ladder rungs on Back face (-X)
  const numRungs = 13;
  for (let r = 0; r < numRungs; r++) {
    const yRung = 0.80 + r * 0.34;
    if (yRung > 5.15) break;
    const c = cX(yRung);
    const rungGeo = copyGeometry(boxGeo(0.04, 0.035, 0.42));
    rungGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-c, yRung, 0));
    woodGeos.push(rungGeo);

    // Metal mounting brackets on ends of rung
    const bkt1 = copyGeometry(boxGeo(0.045, 0.045, 0.03));
    bkt1.applyMatrix4(new THREE.Matrix4().makeTranslation(-c, yRung, -0.21));
    metalGeos.push(bkt1);

    const bkt2 = copyGeometry(boxGeo(0.045, 0.045, 0.03));
    bkt2.applyMatrix4(new THREE.Matrix4().makeTranslation(-c, yRung, 0.21));
    metalGeos.push(bkt2);
  }

  // Top platform deck at yTop = 5.25m
  const deckSize = (rTop + 0.10) * 2;
  const deckThickness = 0.06;
  const deckGeo = copyGeometry(boxGeo(deckSize, deckThickness, deckSize));
  deckGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yTop + deckThickness / 2, 0));
  woodGeos.push(deckGeo);

  // Platform fascia rim
  const rimH = 0.10;
  const rimT = 0.05;
  const halfD = deckSize / 2;
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, halfD], [halfD, yTop + rimH / 2, halfD], rimT, rimH, 1.0));
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, -halfD], [halfD, yTop + rimH / 2, -halfD], rimT, rimH, 1.0));
  woodGeos.push(createOrientedBeam([halfD, yTop + rimH / 2, -halfD], [halfD, yTop + rimH / 2, halfD], rimH, rimT, 1.0));
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, -halfD], [-halfD, yTop + rimH / 2, halfD], rimH, rimT, 1.0));

  // 4 Top Head Struts (substantial 0.11m x 0.11m timbers tapering to turntable at Y=5.65)
  const yTurntable = 5.65;
  for (const [sx, sz] of corners) {
    const p1 = [sx * (rTop - 0.03), yTop + deckThickness, sz * (rTop - 0.03)];
    const p2 = [sx * 0.09, yTurntable, sz * 0.09];
    woodGeos.push(createOrientedBeam(p1, p2, 0.11, 0.11, 1.0));
  }

  // Central wooden mast cap / head block
  const mastBlockGeo = copyGeometry(boxGeo(0.24, 0.20, 0.24));
  mastBlockGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yTurntable - 0.10, 0));
  woodGeos.push(mastBlockGeo);

  // ==========================================
  // 2. METAL HARDWARE & FOOTINGS
  // ==========================================
  // 4 Ground Chamfered Pedestals
  for (const [sx, sz] of corners) {
    metalGeos.push(createFootingPedestal(sx * rBase, sz * rBase, yBase, 0.32, 0.24));

    // Base clamp plate on each post
    const clampGeo = copyGeometry(boxGeo(0.20, 0.06, 0.20));
    clampGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(sx * rBase, yBase + 0.03, sz * rBase));
    metalGeos.push(clampGeo);
  }

  // Joint bolt plates with square bolt heads at each tier
  for (let i = 0; i < tierY.length; i++) {
    const y = tierY[i];
    const c = cX(y);
    for (const [sx, sz] of corners) {
      const plate = copyGeometry(boxGeo(0.18, 0.14, 0.18));
      plate.applyMatrix4(new THREE.Matrix4().makeTranslation(sx * c, y, sz * c));
      metalGeos.push(plate);

      // Visible square bolt head on outer corner
      const boltHeadX = copyGeometry(boxGeo(0.04, 0.04, 0.03));
      boltHeadX.applyMatrix4(new THREE.Matrix4().makeTranslation(sx * (c + 0.095), y, sz * c));
      metalGeos.push(boltHeadX);

      const boltHeadZ = copyGeometry(boxGeo(0.03, 0.04, 0.04));
      boltHeadZ.applyMatrix4(new THREE.Matrix4().makeTranslation(sx * c, y, sz * (c + 0.095)));
      metalGeos.push(boltHeadZ);
    }
  }

  // ==========================================
  // 3. TOWER HEAD & DIRECTIONAL TAIL
  // ==========================================
  // Turntable collar (cylindrical metal casting)
  const turntableGeo = copyGeometry(cylinderGeo(0.16, 0.18, 0.09, 14));
  turntableGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yTurntable + 0.045, 0));
  metalGeos.push(turntableGeo);

  // Cast iron gearbox / axle housing
  const gearBoxGeo = copyGeometry(boxGeo(0.50, 0.24, 0.24));
  gearBoxGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.12, yTurntable + 0.18, 0));
  metalGeos.push(gearBoxGeo);

  // Gearbox top inspection cover
  const gearCoverGeo = copyGeometry(cylinderGeo(0.10, 0.10, 0.04, 8));
  gearCoverGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.12, yTurntable + 0.32, 0));
  metalGeos.push(gearCoverGeo);

  // Fixed Axle shaft (along X axis, from X = -0.05 to X = +0.62)
  const axleY = yTurntable + 0.18; // 5.83 m
  const axleLen = 0.68;
  const axleGeo = copyGeometry(cylinderGeo(0.04, 0.04, axleLen, 12));
  axleGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  axleGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.28, axleY, 0));
  metalGeos.push(axleGeo);

  // Front axle bearing collar
  const bearingCollar = copyGeometry(cylinderGeo(0.075, 0.075, 0.08, 12));
  bearingCollar.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  bearingCollar.applyMatrix4(new THREE.Matrix4().makeTranslation(0.40, axleY, 0));
  metalGeos.push(bearingCollar);

  // Tail Boom (extends backward from X = -0.12 to X = -1.90)
  const boomLen = 1.78;
  const boomGeo = copyGeometry(cylinderGeo(0.035, 0.035, boomLen, 8));
  boomGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  boomGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.12 - boomLen / 2, axleY, 0));
  metalGeos.push(boomGeo);

  // Tail boom diagonal support struts
  const tailStrut1_P1 = [0.0, yTurntable + 0.045, 0.0];
  const tailStrut1_P2 = [-0.95, axleY, 0.0];
  metalGeos.push(createOrientedBeam(tailStrut1_P1, tailStrut1_P2, 0.045, 0.045));

  const tailStrut2_P1 = [-0.10, axleY - 0.10, 0.0];
  const tailStrut2_P2 = [-1.40, axleY, 0.0];
  metalGeos.push(createOrientedBeam(tailStrut2_P1, tailStrut2_P2, 0.035, 0.035));

  // Authentic Trapezoidal Tail Vane (honey wood with metal frame)
  // X from -1.15 to -1.90, height from 0.42m at front to 0.96m at back
  const vaneGeo = createTailVaneGeo(-1.15, -1.90, axleY, 0.42, 0.96, 0.036);
  woodGeos.push(vaneGeo);

  // Metal perimeter frame around tail vane
  const vaneSpine = copyGeometry(boxGeo(0.75, 0.05, 0.046));
  vaneSpine.applyMatrix4(new THREE.Matrix4().makeTranslation(-1.525, axleY, 0));
  metalGeos.push(vaneSpine);

  // Top angled frame rib
  const topRibP1 = [-1.15, axleY + 0.21, 0];
  const topRibP2 = [-1.90, axleY + 0.48, 0];
  metalGeos.push(createOrientedBeam(topRibP1, topRibP2, 0.045, 0.042));

  // Bottom angled frame rib
  const botRibP1 = [-1.15, axleY - 0.21, 0];
  const botRibP2 = [-1.90, axleY - 0.48, 0];
  metalGeos.push(createOrientedBeam(botRibP1, botRibP2, 0.045, 0.042));

  // Rear vertical frame rib
  const rearRibP1 = [-1.90, axleY - 0.48, 0];
  const rearRibP2 = [-1.90, axleY + 0.48, 0];
  metalGeos.push(createOrientedBeam(rearRibP1, rearRibP2, 0.045, 0.042));

  // Create merged static meshes
  const mergedTowerWood = mergeGeometries(woodGeos);
  createPart('TowerWood', mergedTowerWood, honeyWood, { parent: root });

  const mergedTowerMetal = mergeGeometries(metalGeos);
  createPart('TowerMetal', mergedTowerMetal, brushedMetal, { parent: root });

  // ==========================================
  // 4. ARTICULATED ROTOR ASSEMBLY
  // ==========================================
  // Placement: X = 0.58 m (providing > 12 cm surface clearance from tower legs)
  const rotorPivot = createPivot('Rotor', [0.58, axleY, 0], root);

  const hubGeos = [];
  const bladeGeos = [];

  // Central Hub:
  // Rear axle sleeve
  const sleeveGeo = copyGeometry(cylinderGeo(0.08, 0.08, 0.12, 12));
  sleeveGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  sleeveGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.06, 0, 0));
  hubGeos.push(sleeveGeo);

  // Rear spider mounting disc
  const spiderDisc = copyGeometry(cylinderGeo(0.24, 0.24, 0.03, 16));
  spiderDisc.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  spiderDisc.applyMatrix4(new THREE.Matrix4().makeTranslation(0.0, 0, 0));
  hubGeos.push(spiderDisc);

  // Faceted conical nose cone (12 facets, tapering forward to apex)
  const coneGeo = copyGeometry(cylinderGeo(0.04, 0.23, 0.18, 12));
  coneGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  coneGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.10, 0, 0));
  hubGeos.push(coneGeo);

  // Front decorative faceted cap
  const nutGeo = copyGeometry(cylinderGeo(0.02, 0.045, 0.05, 8));
  nutGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  nutGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.21, 0, 0));
  hubGeos.push(nutGeo);

  // Concentric Rings in YZ plane:
  // Inner ring at radius 0.65m
  const innerRing = createYZRing(0.65, 0.026, 0.018, 32);
  hubGeos.push(innerRing);

  // Outer ring at radius 1.12m
  const outerRing = createYZRing(1.12, 0.026, 0.018, 48);
  hubGeos.push(outerRing);

  // 16 Radial Spokes (connecting hub spider to outer ring)
  const numBlades = 16;
  const spokeRadius = 1.18;
  for (let k = 0; k < numBlades; k++) {
    const angle = (k / numBlades) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const pInner = [0.0, 0.20 * cosA, 0.20 * sinA];
    const pOuter = [0.0, spokeRadius * cosA, spokeRadius * sinA];
    hubGeos.push(createOrientedBeam(pInner, pOuter, 0.018, 0.018));

    // Blade clamp brackets at inner ring (r = 0.65)
    const inClamp = copyGeometry(boxGeo(0.024, 0.038, 0.038));
    inClamp.applyMatrix4(new THREE.Matrix4().makeTranslation(0.008, 0.65 * cosA, 0.65 * sinA));
    hubGeos.push(inClamp);

    // Blade clamp brackets at outer ring (r = 1.12)
    const outClamp = copyGeometry(boxGeo(0.024, 0.048, 0.048));
    outClamp.applyMatrix4(new THREE.Matrix4().makeTranslation(0.008, 1.12 * cosA, 1.12 * sinA));
    hubGeos.push(outClamp);
  }

  // 16 Aerodynamic Metal Blades with 3D Center Crease
  // Total rotor radius: 1.25 m (diameter 2.50 m)
  const rInner = 0.58;
  const rOuter = 1.25;
  const wInner = 0.17;
  const wOuter = 0.27;
  const baseBlade = createCreasedBladeGeo(rInner, rOuter, wInner, wOuter, 24, 0.018);

  for (let k = 0; k < numBlades; k++) {
    const angle = (k / numBlades) * Math.PI * 2;
    const bGeo = copyGeometry(baseBlade);
    bGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(angle));
    bladeGeos.push(bGeo);
  }

  // Merge rotor components
  const mergedHub = mergeGeometries(hubGeos);
  createPart('RotorHub', mergedHub, brushedMetal, { parent: rotorPivot });

  const mergedBlades = mergeGeometries(bladeGeos);
  createPart('RotorBlades', mergedBlades, brushedMetal, { parent: rotorPivot });

  return root;
}

/**
 * Declares the smooth 'Spin' animation loop.
 * - Direction: clockwise looking from front (+X toward -X)
 * - Axis: local X axis
 * - Duration: 4.0 seconds (15 RPM)
 * - Keyframes: 5 quarter-turn keys encoding a complete 360° revolution
 */
function animate(root) {
  const duration = 4.0;
  const track = rotationTrack('Joint_Rotor', [
    { time: 0.0, rotation: [0, 0, 0] },
    { time: 1.0, rotation: [-90, 0, 0] },
    { time: 2.0, rotation: [-180, 0, 0] },
    { time: 3.0, rotation: [-270, 0, 0] },
    { time: 4.0, rotation: [-360, 0, 0] }
  ]);
  return [createClip('Spin', duration, [track])];
}
