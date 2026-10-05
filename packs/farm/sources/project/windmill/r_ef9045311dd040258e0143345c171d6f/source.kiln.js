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
  if (len < 1e-6) return new THREE.BufferGeometry();

  const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
  const geo = copyGeometry(boxGeo(width, len, depth));

  // Scale V texture coordinates along the length
  const uvs = geo.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setY(i, uvs.getY(i) * len * uvRepeat);
  }
  uvs.needsUpdate = true;

  const yUp = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(yUp, dir.clone().normalize());

  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z));
  return geo;
}

/**
 * Creates an authentic polygonal ring in the YZ plane (facing +X).
 */
function createYZRing(radius, radialWidth, axialDepth, segments = 32) {
  const rIn = radius - radialWidth * 0.5;
  const rOut = radius + radialWidth * 0.5;
  const hAx = axialDepth * 0.5;

  const pos = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 4 vertices per segment slice:
    // 0: inner front (+X)
    pos.push(hAx, rIn * cosA, rIn * sinA);
    uvs.push(i / segments, 0);
    // 1: outer front (+X)
    pos.push(hAx, rOut * cosA, rOut * sinA);
    uvs.push(i / segments, 1);
    // 2: outer back (-X)
    pos.push(-hAx, rOut * cosA, rOut * sinA);
    uvs.push(i / segments, 1);
    // 3: inner back (-X)
    pos.push(-hAx, rIn * cosA, rIn * sinA);
    uvs.push(i / segments, 0);
  }

  for (let i = 0; i < segments; i++) {
    const b = i * 4;
    const n = (i + 1) * 4;
    // Front face (+X)
    indices.push(b, b + 1, n + 1, b, n + 1, n);
    // Outer face
    indices.push(b + 1, b + 2, n + 2, b + 1, n + 2, n + 1);
    // Back face (-X)
    indices.push(b + 2, b + 3, n + 3, b + 2, n + 3, n + 2);
    // Inner face
    indices.push(b + 3, b, n, b + 3, n, n + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a chamfered concrete/stone pedestal footing at ground level Y=0.
 */
function createFootingPedestal(x, z, h = 0.22, baseW = 0.32, topW = 0.24) {
  const hb = baseW / 2;
  const ht = topW / 2;

  const pos = [
    // Bottom square at Y = 0
    -hb, 0, -hb,
     hb, 0, -hb,
     hb, 0,  hb,
    -hb, 0,  hb,
    // Top square at Y = h
    -ht, h, -ht,
     ht, h, -ht,
     ht, h,  ht,
    -ht, h,  ht
  ];

  const indices = [
    0, 2, 1, 0, 3, 2, // bottom
    4, 5, 6, 4, 6, 7, // top
    3, 7, 6, 3, 6, 2, // front (+Z)
    1, 5, 4, 1, 4, 0, // back (-Z)
    2, 6, 5, 2, 5, 1, // right (+X)
    0, 4, 7, 0, 7, 3  // left (-X)
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
    const hw = w * 0.5;

    // Station points in local blade frame:
    // Spine is raised forward in +X by camberH
    const xSpine = camberH;
    const ySpine = r;
    const zSpine = 0.0;

    // Leading edge (-hw rotated by pitch)
    const xLead = -hw * sinP;
    const yLead = r;
    const zLead = -hw * cosP;

    // Trailing edge (+hw rotated by pitch)
    const xTrail = hw * sinP;
    const yTrail = r;
    const zTrail = hw * cosP;

    pos.push(xLead, yLead, zLead);
    uvs.push(0, i / (stations.length - 1));

    pos.push(xSpine, ySpine, zSpine);
    uvs.push(0.5, i / (stations.length - 1));

    pos.push(xTrail, yTrail, zTrail);
    uvs.push(1, i / (stations.length - 1));
  }

  // Two longitudinal bays: inner (0 to 1) and outer (1 to 2)
  for (let j = 0; j < 2; j++) {
    const b0 = j * 3;
    const b1 = (j + 1) * 3;

    // Leading half (front face)
    indices.push(b0, b0 + 1, b1 + 1);
    indices.push(b0, b1 + 1, b1);

    // Trailing half (front face)
    indices.push(b0 + 1, b0 + 2, b1 + 2);
    indices.push(b0 + 1, b1 + 2, b1 + 1);

    // Double-sided back faces:
    indices.push(b0, b1 + 1, b0 + 1);
    indices.push(b0, b1, b1 + 1);

    indices.push(b0 + 1, b1 + 2, b0 + 2);
    indices.push(b0 + 1, b1 + 1, b1 + 2);
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

  // Horizontal Tie Beams at 4 tiers (sturdy 0.11m high x 0.11m thick)
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

  // ==========================================
  // 2. CONNECTED INSPECTION LADDER
  // ==========================================
  // Standoff distance: 0.14m from tower rear centerline
  const dStandoff = 0.14;
  const xLadder = (y) => -cX(y) - dStandoff;
  const zLeft = -0.19;
  const zRight = 0.19;

  // A. Continuous Side Rails (from Y = 0.25m to platform level Y = 5.25m)
  const yRailBot = 0.25;
  const yRailDeck = 5.25;
  const railThick = 0.035; // Z dimension
  const railDepth = 0.045; // X dimension

  const leftRail = createOrientedBeam([xLadder(yRailBot), yRailBot, zLeft], [xLadder(yRailDeck), yRailDeck, zLeft], railDepth, railThick);
  const rightRail = createOrientedBeam([xLadder(yRailBot), yRailBot, zRight], [xLadder(yRailDeck), yRailDeck, zRight], railDepth, railThick);
  metalGeos.push(leftRail);
  metalGeos.push(rightRail);

  // B. Upper Safety Grab Handles & Deck Termination (Y = 5.25m to 5.55m)
  // Left and Right rails extend 0.30m above deck, loop forward, and anchor to deck
  const deckSize = (rTop + 0.10) * 2;
  const deckThickness = 0.06;
  const halfD = deckSize / 2;
  const xDeckRear = -halfD; // -0.35m

  for (const z of [zLeft, zRight]) {
    // Vertical extension above platform deck (Y from 5.25 to 5.55)
    metalGeos.push(createOrientedBeam([xLadder(yRailDeck), yRailDeck, z], [xLadder(yRailDeck), 5.55, z], railDepth, railThick));
    // Horizontal forward elbow to platform edge (X from xLadder(5.25) to xDeckRear)
    metalGeos.push(createOrientedBeam([xLadder(yRailDeck), 5.55, z], [xDeckRear, 5.55, z], railDepth, railThick));
    // Vertical drop down to platform deck surface (Y from 5.55 to 5.31)
    metalGeos.push(createOrientedBeam([xDeckRear, 5.55, z], [xDeckRear, yRailDeck + deckThickness, z], railDepth, railThick));
    // Deck mounting anchor plate
    const deckFlange = copyGeometry(boxGeo(0.08, 0.02, 0.08));
    deckFlange.applyMatrix4(new THREE.Matrix4().makeTranslation(xDeckRear, yRailDeck + deckThickness + 0.01, z));
    metalGeos.push(deckFlange);
  }

  // C. Suspended Lower Approach (Y = 0.25m)
  // The ladder side rails terminate cleanly at Y = 0.25m, suspended above the ground.
  // Supported by the 4 structural tier standoff brackets and platform deck grab anchors.

  // D. Standoff Brackets at all 4 Tiers (Y = 0.65, 2.15, 3.65, 5.15)
  // Connects rails directly to the horizontal tie beams
  for (let i = 0; i < tierY.length; i++) {
    const y = tierY[i];
    const xRail = xLadder(y);
    const xBeamFace = -cX(y) - tieW * 0.5;

    for (const z of [zLeft, zRight]) {
      // Horizontal standoff strut spanning from tie beam to ladder rail
      metalGeos.push(createOrientedBeam([xBeamFace, y, z], [xRail, y, z], 0.035, 0.035));
      // Mounting plate on timber tie beam
      const beamPlate = copyGeometry(boxGeo(0.02, 0.08, 0.08));
      beamPlate.applyMatrix4(new THREE.Matrix4().makeTranslation(xBeamFace - 0.01, y, z));
      metalGeos.push(beamPlate);
      // Rail clamp collar
      const railClamp = copyGeometry(boxGeo(0.05, 0.05, 0.045));
      railClamp.applyMatrix4(new THREE.Matrix4().makeTranslation(xRail, y, z));
      metalGeos.push(railClamp);
    }
  }

  // E. 17 Seated Ladder Rungs (Y = 0.40m to 5.20m at 0.30m vertical pitch)
  const numRungs = 17;
  const yRungStart = 0.40;
  const rungPitch = 0.30;
  const rungSize = 0.024;

  for (let r = 0; r < numRungs; r++) {
    const yRung = yRungStart + r * rungPitch;
    const xRung = xLadder(yRung);

    // Rung beam spanning exactly between left and right rails
    metalGeos.push(createOrientedBeam([xRung, yRung, zLeft], [xRung, yRung, zRight], rungSize, rungSize));

    // Seated ferrules / welds at rail joints
    const ferruleL = copyGeometry(boxGeo(0.036, 0.036, 0.012));
    ferruleL.applyMatrix4(new THREE.Matrix4().makeTranslation(xRung, yRung, zLeft + 0.006));
    metalGeos.push(ferruleL);

    const ferruleR = copyGeometry(boxGeo(0.036, 0.036, 0.012));
    ferruleR.applyMatrix4(new THREE.Matrix4().makeTranslation(xRung, yRung, zRight - 0.006));
    metalGeos.push(ferruleR);
  }

  // ==========================================
  // 3. TOP PLATFORM & FASCIA
  // ==========================================
  const deckGeo = copyGeometry(boxGeo(deckSize, deckThickness, deckSize));
  deckGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yTop + deckThickness / 2, 0));
  woodGeos.push(deckGeo);

  // Platform fascia rim with clear 0.44m rear walkway opening between Z = -0.22 and Z = +0.22
  const rimH = 0.10;
  const rimT = 0.05;
  // Front rim (+X)
  woodGeos.push(createOrientedBeam([halfD, yTop + rimH / 2, -halfD], [halfD, yTop + rimH / 2, halfD], rimT, rimH, 1.0));
  // Right rim (+Z)
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, halfD], [halfD, yTop + rimH / 2, halfD], rimH, rimT, 1.0));
  // Left rim (-Z)
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, -halfD], [halfD, yTop + rimH / 2, -halfD], rimH, rimT, 1.0));
  // Rear rim segments (-X) leaving ladder walkway opening
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, -halfD], [-halfD, yTop + rimH / 2, -0.22], rimT, rimH, 1.0));
  woodGeos.push(createOrientedBeam([-halfD, yTop + rimH / 2, 0.22], [-halfD, yTop + rimH / 2, halfD], rimT, rimH, 1.0));

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
  // 4. METAL HARDWARE & FOOTINGS
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
  // 5. TOWER HEAD & DIRECTIONAL TAIL
  // ==========================================
  // Turntable collar (cylindrical metal casting)
  const turntableGeo = copyGeometry(cylinderGeo(0.16, 0.18, 0.09, 14));
  turntableGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yTurntable + 0.045, 0));
  metalGeos.push(turntableGeo);

  // Cast iron rectangular gearbox housing
  const gearBoxGeo = copyGeometry(boxGeo(0.50, 0.24, 0.24));
  gearBoxGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.12, yTurntable + 0.18, 0));
  metalGeos.push(gearBoxGeo);

  // Gearbox top inspection cover
  const gearCoverGeo = copyGeometry(cylinderGeo(0.10, 0.10, 0.04, 8));
  gearCoverGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.12, yTurntable + 0.32, 0));
  metalGeos.push(gearCoverGeo);

  // Fixed Axle shaft along X axis (from X = -0.05 to X = +0.62)
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
  // 6. ARTICULATED ROTOR ASSEMBLY
  // ==========================================
  // Placement: X = 0.58 m, Y = 5.83 m (axle center)
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

  // Front decorative cap
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
