/**
 * Farm watermill asset
 * Coherent cream masonry mill building with charcoal pitched roof,
 * honey-wood waterwheel, and stationary timber mounting gantry.
 * Consolidates geometry by material for high performance (14 mesh draws, 5 materials).
 */

const meta = {
  name: 'Watermill',
  role: 'building',
  author: 'gemini-3.8-flash-high',
  harness: 'agy',
};

// Helper: scale UVs on cloned geometry for physical material repeat
function makeBox(w, h, d, uScale = 1, vScale = 1) {
  const geo = copyGeometry(boxGeo(w, h, d));
  if (uScale !== 1 || vScale !== 1) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
    }
    uv.needsUpdate = true;
  }
  return geo;
}

// Helper: create a 3D segmented polygonal rim ring
function createRimRingGeo(rIn, rOut, zThickness, segments = 24) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const zHalf = zThickness / 2;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const cos0 = Math.cos(a0), sin0 = Math.sin(a0);
    const cos1 = Math.cos(a1), sin1 = Math.sin(a1);

    const addQuad = (p0, p1, p2, p3, nx, ny, nz) => {
      const base = positions.length / 3;
      positions.push(...p0, ...p1, ...p2, ...p3);
      for (let k = 0; k < 4; k++) normals.push(nx, ny, nz);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    // Front face (-Z)
    addQuad(
      [rIn * cos0, rIn * sin0, -zHalf],
      [rOut * cos0, rOut * sin0, -zHalf],
      [rOut * cos1, rOut * sin1, -zHalf],
      [rIn * cos1, rIn * sin1, -zHalf],
      0, 0, -1
    );
    // Back face (+Z)
    addQuad(
      [rIn * cos1, rIn * sin1, zHalf],
      [rOut * cos1, rOut * sin1, zHalf],
      [rOut * cos0, rOut * sin0, zHalf],
      [rIn * cos0, rIn * sin0, zHalf],
      0, 0, 1
    );
    // Outer rim face
    const amid = (a0 + a1) / 2;
    const nOx = Math.cos(amid), nOy = Math.sin(amid);
    addQuad(
      [rOut * cos0, rOut * sin0, -zHalf],
      [rOut * cos0, rOut * sin0, zHalf],
      [rOut * cos1, rOut * sin1, zHalf],
      [rOut * cos1, rOut * sin1, -zHalf],
      nOx, nOy, 0
    );
    // Inner rim face
    addQuad(
      [rIn * cos1, rIn * sin1, -zHalf],
      [rIn * cos1, rIn * sin1, zHalf],
      [rIn * cos0, rIn * sin0, zHalf],
      [rIn * cos0, rIn * sin0, -zHalf],
      -nOx, -nOy, 0
    );
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Helper: create a triangular gable wall geometry with thickness
function createGableGeo(spanZ, riseY, thicknessX) {
  const geo = new THREE.BufferGeometry();
  const halfSpan = spanZ / 2;
  const halfThick = thicknessX / 2;

  const positions = [
    // Front triangle (+X)
    halfThick, 0, -halfSpan,
    halfThick, 0, halfSpan,
    halfThick, riseY, 0,
    // Back triangle (-X)
    -halfThick, 0, halfSpan,
    -halfThick, 0, -halfSpan,
    -halfThick, riseY, 0,
  ];
  const normals = [
    1, 0, 0,  1, 0, 0,  1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];
  const uvs = [
    0, 0, 1, 0, 0.5, 1,
    0, 0, 1, 0, 0.5, 1,
  ];
  const indices = [
    0, 2, 1, // Front (+X outward normal)
    3, 5, 4  // Back (-X outward normal)
  ];

  const addSlopeQuad = (p0, p1, p2, p3, nx, ny, nz) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    for (let k = 0; k < 4; k++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const hyp = Math.hypot(halfSpan, riseY);
  const nLy = halfSpan / hyp, nLz = -riseY / hyp;

  // Left slope (-Z outward normal: [0, nLy, nLz])
  addSlopeQuad(
    [halfThick, 0, -halfSpan],
    [-halfThick, 0, -halfSpan],
    [-halfThick, riseY, 0],
    [halfThick, riseY, 0],
    0, nLy, nLz
  );

  // Right slope (+Z outward normal: [0, nLy, -nLz])
  addSlopeQuad(
    [-halfThick, 0, halfSpan],
    [halfThick, 0, halfSpan],
    [halfThick, riseY, 0],
    [-halfThick, riseY, 0],
    0, nLy, -nLz
  );

  // Bottom quad (-Y downward outward normal: [0, -1, 0])
  addSlopeQuad(
    [-halfThick, 0, -halfSpan],
    [halfThick, 0, -halfSpan],
    [halfThick, 0, halfSpan],
    [-halfThick, 0, halfSpan],
    0, -1, 0
  );

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Helper: consolidate an array of positioned/rotated geometries into one BufferGeometry
function mergeGeometries(items) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  for (const item of items) {
    const geo = item.geometry;
    const pos = item.position || [0, 0, 0];
    const rot = item.rotation || [0, 0, 0]; // Euler XYZ in degrees

    const mat4 = new THREE.Matrix4();
    const euler = new THREE.Euler(
      (rot[0] * Math.PI) / 180,
      (rot[1] * Math.PI) / 180,
      (rot[2] * Math.PI) / 180,
      'XYZ'
    );
    mat4.makeRotationFromEuler(euler);
    mat4.setPosition(pos[0], pos[1], pos[2]);

    const normMat = new THREE.Matrix3().getNormalMatrix(mat4);

    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    const indexAttr = geo.index;

    const vCount = posAttr.count;
    const v3 = new THREE.Vector3();

    for (let i = 0; i < vCount; i++) {
      v3.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v3.applyMatrix4(mat4);
      positions.push(v3.x, v3.y, v3.z);

      if (normAttr) {
        v3.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        v3.applyMatrix3(normMat).normalize();
        normals.push(v3.x, v3.y, v3.z);
      } else {
        normals.push(0, 1, 0);
      }

      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }

    if (indexAttr) {
      for (let j = 0; j < indexAttr.count; j++) {
        indices.push(indexAttr.getX(j) + vertexOffset);
      }
    } else {
      for (let j = 0; j < vCount; j++) {
        indices.push(j + vertexOffset);
      }
    }

    vertexOffset += vCount;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  return merged;
}

async function build() {
  const root = createRoot('Watermill');

  // 1. Compile PBR Materials using approved project pins
  const matMasonry = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Farm cream masonry (restrained blocks)',
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
        resourceId: 'kiln.library.d1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6.base-color'
      },
      normal: {
        kind: 'resource',
        resourceId: 'kiln.library.d1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6.normal'
      },
      metallicRoughness: {
        kind: 'resource',
        resourceId: 'kiln.library.d1c42bd60d214b06715046b8d7bfdcd7b6591c427e02cf8b3eecf7a7f61772b6.metallic-roughness'
      }
    }
  });

  const matRoof = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Farm charcoal roof shingles',
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
        resourceId: 'kiln.library.ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85.base-color'
      },
      normal: {
        kind: 'resource',
        resourceId: 'kiln.library.ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85.normal'
      },
      metallicRoughness: {
        kind: 'resource',
        resourceId: 'kiln.library.ff552c543e787c67a870286f2eb1fab3a342891a4f7b41675a07943fad550f85.metallic-roughness'
      }
    }
  });

  const matWood = await compilePortableMaterialSpecV2({
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

  const matMetal = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Brushed neutral metal',
    roughness: 0.65,
    metalness: 1.0,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
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

  // Neutral transparent portable glass per review guidance (opacity 0.14, roughness 0.05, metalness 0)
  const matGlass = glassMaterial(0xd8e4e8, { opacity: 0.14, roughness: 0.05, metalness: 0 });

  // -------------------------------------------------------------
  // 2. Building Structure (Stationary)
  // Placement center (0, 0) at ground Y = 0.
  // Walls: X span = 5.20m ([-2.60, +2.60]), Z span = 3.60m ([-2.40, +1.20])
  // Building center in Z is -0.60m. Wall height = 3.00m, wall thickness = 0.28m.
  // -------------------------------------------------------------
  const building = new THREE.Group();
  building.name = 'Building';
  root.add(building);

  // Attachment sockets for external composition / inspection
  const doorwaySocket = new THREE.Group();
  doorwaySocket.name = 'Socket_Doorway';
  doorwaySocket.position.set(2.60, 1.05, -0.80);
  building.add(doorwaySocket);

  // 2a. Building Stationary Masonry (Consolidated)
  const plinthH = 0.35;
  const wallH = 2.47; // Wall top at approved eave seat / ceiling line Y = 2.82m (0.35 + 2.47 = 2.82m)
  const wallMidY = plinthH + wallH / 2; // 1.585m
  const buildingMasonryItems = [
    // Foundation plinths
    { geometry: makeBox(0.36, plinthH, 3.68, 0.36, 0.35), position: [2.60, plinthH / 2, -0.60] },
    { geometry: makeBox(0.36, plinthH, 3.68, 0.36, 0.35), position: [-2.60, plinthH / 2, -0.60] },
    { geometry: makeBox(4.88, plinthH, 0.36, 2.44, 0.35), position: [0, plinthH / 2, -2.40] },
    { geometry: makeBox(4.88, plinthH, 0.36, 2.44, 0.35), position: [0, plinthH / 2, 1.20] },
    // Plinth water table cap moulding courses
    { geometry: makeBox(0.38, 0.05, 3.72, 0.38, 0.1), position: [2.60, 0.35, -0.60] },
    { geometry: makeBox(0.38, 0.05, 3.72, 0.38, 0.1), position: [-2.60, 0.35, -0.60] },
    { geometry: makeBox(4.96, 0.05, 0.38, 2.48, 0.1), position: [0, 0.35, -2.40] },
    { geometry: makeBox(4.96, 0.05, 0.38, 2.48, 0.1), position: [0, 0.35, 1.20] },
    // Doorstep
    { geometry: makeBox(0.36, 0.12, 1.20, 0.36, 0.6), position: [2.76, 0.06, -0.80] },
    // Front wall sections (spanning full 3.88m from Z=-2.54m to Z=+1.34m, wall top flush at Y=2.82m)
    { geometry: makeBox(0.28, wallH, 1.24, 0.28, 1.25), position: [2.60, wallMidY, -1.92] }, // Z: [-2.54, -1.30]
    { geometry: makeBox(0.28, 0.72, 1.00, 0.28, 0.35), position: [2.60, 2.46, -0.80] }, // Above door lintel
    { geometry: makeBox(0.32, 0.18, 0.22, 0.3, 0.2), position: [2.62, 2.18, -0.80] }, // Keystone directly over lintel
    { geometry: makeBox(0.28, wallH, 0.30, 0.28, 1.25), position: [2.60, wallMidY, -0.15] }, // Z: [-0.30, 0.00]
    { geometry: makeBox(0.28, 0.85, 0.80, 0.28, 0.45), position: [2.60, 0.775, 0.40] }, // Under front window sill
    { geometry: makeBox(0.28, 0.51, 0.80, 0.28, 0.25), position: [2.60, 2.565, 0.40] }, // Above front window lintel
    { geometry: makeBox(0.28, wallH, 0.54, 0.28, 1.25), position: [2.60, wallMidY, 1.07] }, // Z: [0.80, 1.34]
    // Back wall sections (spanning full 3.88m from Z=-2.54m to Z=+1.34m, wall top flush at Y=2.82m)
    { geometry: makeBox(0.28, wallH, 1.54, 0.28, 1.25), position: [-2.60, wallMidY, -1.77] }, // Z: [-2.54, -1.00]
    { geometry: makeBox(0.28, 0.85, 0.80, 0.28, 0.45), position: [-2.60, 0.775, -0.60] }, // Under back window sill
    { geometry: makeBox(0.28, 0.51, 0.80, 0.28, 0.25), position: [-2.60, 2.565, -0.60] }, // Above back window lintel
    { geometry: makeBox(0.28, wallH, 1.54, 0.28, 1.25), position: [-2.60, wallMidY, 0.57] }, // Z: [-0.20, 1.34]
    // Left wall sections (window at X=0; wall top at Y=2.82m seating under left eave)
    { geometry: makeBox(2.10, wallH, 0.28, 1.05, 1.25), position: [-1.45, wallMidY, -2.40] },
    { geometry: makeBox(0.80, 0.85, 0.28, 0.4, 0.45), position: [0, 0.775, -2.40] }, // Under left window sill
    { geometry: makeBox(0.80, 0.51, 0.28, 0.4, 0.25), position: [0, 2.565, -2.40] }, // Above left window lintel
    { geometry: makeBox(2.10, wallH, 0.28, 1.05, 1.25), position: [1.45, wallMidY, -2.40] },
    // Right wall (solid with axle port sleeve; wall top at Y=2.82m seating under right eave)
    { geometry: makeBox(4.92, wallH, 0.28, 2.46, 1.25), position: [0, wallMidY, 1.20] },
    { geometry: cylinderZGeo(0.28, 0.28, 0.12, 16), position: [0, 1.60, 1.36] },
    // Window stone sills & lintels
    { geometry: makeBox(0.38, 0.10, 0.96, 0.4, 0.2), position: [2.60, 1.25, 0.40] }, // Front sill
    { geometry: makeBox(0.36, 0.12, 0.96, 0.4, 0.2), position: [2.60, 2.25, 0.40] }, // Front lintel
    { geometry: makeBox(0.38, 0.10, 0.96, 0.4, 0.2), position: [-2.60, 1.25, -0.60] }, // Back sill
    { geometry: makeBox(0.36, 0.12, 0.96, 0.4, 0.2), position: [-2.60, 2.25, -0.60] }, // Back lintel
    { geometry: makeBox(0.96, 0.10, 0.38, 0.4, 0.2), position: [0, 1.25, -2.40] }, // Left sill
    { geometry: makeBox(0.96, 0.12, 0.36, 0.4, 0.2), position: [0, 2.25, -2.40] }, // Left lintel
  ];

  // 36 Corner stone quoins (9 levels x 4 corners, top level at Y=2.68m, height 0.22m, top at Y=2.79m under eave line)
  for (let level = 1; level <= 9; level++) {
    const qY = 0.50 + (level - 1) * 0.27;
    const isLongX = level % 2 === 0;
    const qW = isLongX ? 0.40 : 0.32;
    const qD = isLongX ? 0.32 : 0.40;
    const qBox = makeBox(qW, 0.22, qD, 0.4, 0.22);
    buildingMasonryItems.push(
      { geometry: qBox, position: [2.60, qY, 1.20] },
      { geometry: qBox, position: [2.60, qY, -2.40] },
      { geometry: qBox, position: [-2.60, qY, 1.20] },
      { geometry: qBox, position: [-2.60, qY, -2.40] }
    );
  }

  createPart('Building_Masonry', mergeGeometries(buildingMasonryItems), matMasonry, {
    parent: building,
  });

  // 2b. Building Stationary Wood (Floor, Door Frame, Window Frames)
  const buildingWoodItems = [
    // Interior floor
    { geometry: makeBox(4.92, 0.08, 3.32, 2.46, 1.66), position: [0, 0.04, -0.60] },
    // Doorway frame
    { geometry: makeBox(0.28, 2.10, 0.08, 0.15, 1.0), position: [2.60, 1.05, -1.30] },
    { geometry: makeBox(0.28, 2.10, 0.08, 0.15, 1.0), position: [2.60, 1.05, -0.30] },
    { geometry: makeBox(0.28, 0.08, 1.06, 0.15, 0.5), position: [2.60, 2.10, -0.80] },
    // Front window casing & mullions
    { geometry: makeBox(0.16, 0.88, 0.06, 0.15, 0.9), position: [2.60, 1.75, 0.03] },
    { geometry: makeBox(0.16, 0.88, 0.06, 0.15, 0.9), position: [2.60, 1.75, 0.77] },
    { geometry: makeBox(0.16, 0.06, 0.74, 0.15, 0.7), position: [2.60, 2.16, 0.40] },
    { geometry: makeBox(0.16, 0.06, 0.74, 0.15, 0.7), position: [2.60, 1.34, 0.40] },
    { geometry: makeBox(0.12, 0.82, 0.05, 0.12, 0.8), position: [2.60, 1.75, 0.40] },
    { geometry: makeBox(0.12, 0.05, 0.72, 0.12, 0.7), position: [2.60, 1.80, 0.40] },
    // Back window casing & mullions
    { geometry: makeBox(0.16, 0.88, 0.06, 0.15, 0.9), position: [-2.60, 1.75, -0.23] },
    { geometry: makeBox(0.16, 0.88, 0.06, 0.15, 0.9), position: [-2.60, 1.75, -0.97] },
    { geometry: makeBox(0.16, 0.06, 0.74, 0.15, 0.7), position: [-2.60, 2.16, -0.60] },
    { geometry: makeBox(0.16, 0.06, 0.74, 0.15, 0.7), position: [-2.60, 1.34, -0.60] },
    { geometry: makeBox(0.12, 0.82, 0.05, 0.12, 0.8), position: [-2.60, 1.75, -0.60] },
    { geometry: makeBox(0.12, 0.05, 0.72, 0.12, 0.7), position: [-2.60, 1.80, -0.60] },
    // Left window casing & mullions (rotated along X axis)
    { geometry: makeBox(0.06, 0.88, 0.16, 0.15, 0.9), position: [0.37, 1.75, -2.40] },
    { geometry: makeBox(0.06, 0.88, 0.16, 0.15, 0.9), position: [-0.37, 1.75, -2.40] },
    { geometry: makeBox(0.74, 0.06, 0.16, 0.15, 0.7), position: [0, 2.16, -2.40] },
    { geometry: makeBox(0.74, 0.06, 0.16, 0.15, 0.7), position: [0, 1.34, -2.40] },
    { geometry: makeBox(0.05, 0.82, 0.12, 0.12, 0.8), position: [0, 1.75, -2.40] },
    { geometry: makeBox(0.72, 0.05, 0.12, 0.12, 0.7), position: [0, 1.80, -2.40] },
  ];

  createPart('Building_Wood', mergeGeometries(buildingWoodItems), matWood, {
    parent: building,
  });

  // 2c. Open Timber Doorleaf on DoorPivot (Swung inward 35 degrees)
  const doorPivot = new THREE.Group();
  doorPivot.name = 'DoorPivot';
  doorPivot.position.set(2.50, 1.05, -1.26);
  doorPivot.rotation.y = (35 * Math.PI) / 180;
  building.add(doorPivot);

  createPart('DoorLeaf_Wood', makeBox(0.05, 2.04, 0.94, 0.05, 1.0), matWood, {
    position: [0, 0, 0.47],
    parent: doorPivot,
  });

  const doorMetalItems = [
    { geometry: makeBox(0.06, 0.06, 0.60, 0.06, 0.3), position: [0, 0.65, 0.30] }, // Top hinge
    { geometry: makeBox(0.06, 0.06, 0.60, 0.06, 0.3), position: [0, -0.65, 0.30] }, // Bottom hinge
    { geometry: makeBox(0.09, 0.14, 0.04, 0.1, 0.1), position: [0, 0.0, 0.85] }, // Latch handle
  ];
  createPart('DoorLeaf_Metal', mergeGeometries(doorMetalItems), matMetal, {
    parent: doorPivot,
  });

  // 2d. Genuine Transparent See-Through Glass Panes
  createPart('WindowFront_Glass', makeBox(0.02, 0.82, 0.72), matGlass, {
    position: [2.60, 1.75, 0.40],
    parent: building,
  });
  createPart('WindowBack_Glass', makeBox(0.02, 0.82, 0.72), matGlass, {
    position: [-2.60, 1.75, -0.60],
    parent: building,
  });
  createPart('WindowLeft_Glass', makeBox(0.72, 0.82, 0.02), matGlass, {
    position: [0, 1.75, -2.40],
    parent: building,
  });

  // -------------------------------------------------------------
  // 3. Roof Assembly (Includes Continuous Ceiling & Gables)
  // Grouped under 'Roof' for clean lift in kiln_view_interior cutaways
  // -------------------------------------------------------------
  const roof = new THREE.Group();
  roof.name = 'Roof';
  building.add(roof);

  // 3a. Triangular Stone Gable End Walls
  // Base at Y = 2.82m wall head, span 3.88m from Z = -2.54m to Z = +1.34m, rise 1.94m to ridge at Y = 4.76m.
  // Triangle top edges slope at exact 45.0 deg (1.94 / 1.94 = 1.000) flush under the roof underside.
  const gableSpanZ = 3.88;
  const gableRiseY = 1.94;
  const gableFrontGeo = createGableGeo(gableSpanZ, gableRiseY, 0.28);
  const roofMasonryItems = [
    { geometry: gableFrontGeo, position: [2.60, 2.82, -0.60] },
    { geometry: copyGeometry(gableFrontGeo), position: [-2.60, 2.82, -0.60] },
  ];
  createPart('Roof_Masonry', mergeGeometries(roofMasonryItems), matMasonry, {
    parent: roof,
  });

  // 3b. Roof Slopes (Charcoal Shingles)
  // Ridge at Z = -0.60m, Y = 4.82m.
  // Left eave at Z = -2.64m, Y = 2.78m.
  // Right eave at Z = 1.44m, Y = 2.78m.
  // Exact 45.0 deg pitch; roof completely covers walls and gables without gaps or clipping.
  const roofLengthX = 5.80; // 0.16m overhang on front and back gables
  const slopeHyp = Math.hypot(2.04, 2.04); // ~2.885m
  const slopeThick = 0.08;
  const slopeAngle = 45.0 * (Math.PI / 180);

  const roofShingleItems = [
    // Left roof slope
    {
      geometry: makeBox(roofLengthX, slopeThick, slopeHyp, 2.9, 1.4),
      position: [0, (4.82 + 2.78) / 2, (-0.60 - 2.64) / 2],
      rotation: [-45, 0, 0]
    },
    // Right roof slope
    {
      geometry: makeBox(roofLengthX, slopeThick, slopeHyp, 2.9, 1.4),
      position: [0, (4.82 + 2.78) / 2, (-0.60 + 1.44) / 2],
      rotation: [45, 0, 0]
    },
    // Shingle ridge cap
    {
      geometry: makeBox(roofLengthX + 0.04, 0.12, 0.20, 2.9, 0.2),
      position: [0, 4.88, -0.60]
    }
  ];
  createPart('Roof_Shingles', mergeGeometries(roofShingleItems), matRoof, {
    parent: roof,
  });

  // 3c. Roof Timberwork (Ceiling, Joists, Bargeboards, Eaves, Rafter Tails, Gable Timbering, Attic Louvre)
  const roofWoodItems = [
    // Continuous flat ceiling (enclosing room at Y = 2.85m, underside at approved Y = 2.82m)
    { geometry: makeBox(4.92, 0.06, 3.32, 2.46, 1.66), position: [0, 2.85, -0.60] },
    // Eave fascia trims (capping rafter ends directly beneath shingle eave edge)
    { geometry: makeBox(roofLengthX, 0.10, 0.06, 2.9, 0.1), position: [0, 2.74, -2.64] },
    { geometry: makeBox(roofLengthX, 0.10, 0.06, 2.9, 0.1), position: [0, 2.74, 1.44] },
    // Bargeboards trimming gable overhangs
    {
      geometry: makeBox(0.08, 0.14, slopeHyp + 0.10, 0.08, 1.4),
      position: [2.88, (4.82 + 2.78) / 2, (-0.60 - 2.64) / 2],
      rotation: [-45, 0, 0]
    },
    {
      geometry: makeBox(0.08, 0.14, slopeHyp + 0.10, 0.08, 1.4),
      position: [2.88, (4.82 + 2.78) / 2, (-0.60 + 1.44) / 2],
      rotation: [45, 0, 0]
    },
    {
      geometry: makeBox(0.08, 0.14, slopeHyp + 0.10, 0.08, 1.4),
      position: [-2.88, (4.82 + 2.78) / 2, (-0.60 - 2.64) / 2],
      rotation: [-45, 0, 0]
    },
    {
      geometry: makeBox(0.08, 0.14, slopeHyp + 0.10, 0.08, 1.4),
      position: [-2.88, (4.82 + 2.78) / 2, (-0.60 + 1.44) / 2],
      rotation: [45, 0, 0]
    },
    // Gable timber framing (collar tie beams across front/back gables, king post on rear)
    { geometry: makeBox(0.10, 0.12, 2.20, 0.1, 1.1), position: [2.76, 3.80, -0.60] },
    { geometry: makeBox(0.10, 0.12, 2.20, 0.1, 1.1), position: [-2.76, 3.80, -0.60] },
    { geometry: makeBox(0.10, 0.95, 0.10, 0.1, 0.95), position: [-2.76, 4.30, -0.60] },
    // Attic loft wooden ventilation louvre panel (authentic shutter with horizontal angled slats)
    { geometry: makeBox(0.10, 0.44, 0.44, 0.1, 0.44), position: [2.62, 3.85, -0.60] },
    { geometry: makeBox(0.02, 0.08, 0.38, 0.02, 0.4), position: [2.68, 3.77, -0.60], rotation: [25, 0, 0] },
    { geometry: makeBox(0.02, 0.08, 0.38, 0.02, 0.4), position: [2.68, 3.85, -0.60], rotation: [25, 0, 0] },
    { geometry: makeBox(0.02, 0.08, 0.38, 0.02, 0.4), position: [2.68, 3.93, -0.60], rotation: [25, 0, 0] },
  ];

  // 5 Transverse heavy ceiling joists (underside at 2.68m, providing ample headroom)
  for (let j = 0; j < 5; j++) {
    const jX = -1.90 + j * 0.95;
    roofWoodItems.push({
      geometry: makeBox(0.16, 0.14, 3.30, 0.16, 1.65),
      position: [jX, 2.75, -0.60]
    });
  }

  // 14 Rafter tails exposed under roof eaves
  for (let r = 0; r < 7; r++) {
    const rX = -2.40 + r * 0.80;
    roofWoodItems.push(
      { geometry: makeBox(0.10, 0.08, 0.22, 0.1, 0.2), position: [rX, 2.76, -2.54] },
      { geometry: makeBox(0.10, 0.08, 0.22, 0.1, 0.2), position: [rX, 2.76, 1.34] }
    );
  }

  createPart('Roof_Wood', mergeGeometries(roofWoodItems), matWood, {
    parent: roof,
  });

  // -------------------------------------------------------------
  // 4. Stationary Wheel Mounting Gantry & Bearings
  // Stationary axle along Z at [0, 1.60, 1.90], outer post at Z = 2.42m
  // -------------------------------------------------------------
  const gantry = new THREE.Group();
  gantry.name = 'Gantry';
  root.add(gantry);

  // Bearing markers
  const bearingInnerSocket = new THREE.Group();
  bearingInnerSocket.name = 'Socket_BearingInner';
  bearingInnerSocket.position.set(0, 1.60, 1.42);
  gantry.add(bearingInnerSocket);

  const bearingOuterSocket = new THREE.Group();
  bearingOuterSocket.name = 'Socket_BearingOuter';
  bearingOuterSocket.position.set(0, 1.60, 2.42);
  gantry.add(bearingOuterSocket);

  const gantryWoodItems = [
    // Wall corbel beam & knee brace
    { geometry: makeBox(0.42, 0.28, 0.24, 0.42, 0.28), position: [0, 1.46, 1.37] },
    { geometry: makeBox(0.24, 0.38, 0.24, 0.24, 0.38), position: [0, 1.18, 1.32], rotation: [35, 0, 0] },
    { geometry: makeBox(0.28, 0.18, 0.16, 0.28, 0.18), position: [0, 1.55, 1.42] },
    // Outer support frame
    { geometry: makeBox(2.40, 0.16, 0.24, 2.4, 0.24), position: [0, 0.08, 2.42] },
    { geometry: makeBox(0.24, 1.50, 0.24, 0.24, 1.5), position: [0, 0.77, 2.42] },
    { geometry: makeBox(0.16, 1.25, 0.16, 0.16, 1.25), position: [-0.52, 0.85, 2.42], rotation: [0, 0, -36] },
    { geometry: makeBox(0.16, 1.25, 0.16, 0.16, 1.25), position: [0.52, 0.85, 2.42], rotation: [0, 0, 36] },
    { geometry: makeBox(0.30, 0.16, 0.22, 0.3, 0.2), position: [0, 1.52, 2.42] },
    // Ground sill cross-ties to wall
    { geometry: makeBox(0.20, 0.16, 1.22, 0.2, 1.2), position: [-1.05, 0.08, 1.81] },
    { geometry: makeBox(0.20, 0.16, 1.22, 0.2, 1.2), position: [1.05, 0.08, 1.81] },
    // Continuous stationary axle shaft
    { geometry: cylinderZGeo(0.11, 0.11, 1.30, 16), position: [0, 1.60, 1.90] },
  ];
  createPart('Gantry_Wood', mergeGeometries(gantryWoodItems), matWood, {
    parent: gantry,
  });

  const gantryMetalItems = [
    { geometry: makeBox(0.24, 0.14, 0.14), position: [0, 1.62, 1.42] }, // Inner bearing cap
    { geometry: makeBox(0.26, 0.16, 0.18), position: [0, 1.61, 2.42] }, // Outer bearing cap
    { geometry: cylinderZGeo(0.09, 0.09, 0.06, 12), position: [0, 1.60, 2.55] }, // Axle outer end cap
  ];
  createPart('Gantry_Metal', mergeGeometries(gantryMetalItems), matMetal, {
    parent: gantry,
  });

  // -------------------------------------------------------------
  // 5. Waterwheel Rotor (Articulated Hinge)
  // Pivot placed at wheel center [0, 1.60, 1.89].
  // Rotates around Z axis in the XY plane.
  // -------------------------------------------------------------
  const wheelPivot = createPivot('WheelRotor', [0, 1.60, 1.89], root);

  // Stream contact reference marker
  const streamContactSocket = new THREE.Group();
  streamContactSocket.name = 'Socket_StreamContact';
  streamContactSocket.position.set(0, -1.50, 0);
  wheelPivot.add(streamContactSocket);

  // 5a. Wheel Wood (Hub, Rims, Spokes, Cross-Ties, Paddles, Stiffener Spines)
  const rimGeo = createRimRingGeo(1.30, 1.50, 0.08, 24);
  const spokeLen = 0.94;
  const spokeMidR = (0.36 + 1.30) / 2; // 0.83m
  const spokeGeo = makeBox(0.13, spokeLen, 0.08, 0.2, 1.0);
  const paddleGeo = makeBox(0.04, 0.32, 0.58, 0.1, 0.6);
  const paddleSpineGeo = makeBox(0.04, 0.28, 0.05, 0.1, 0.3);
  const paddleMidR = 1.34;

  const wheelWoodItems = [
    // 12-sided wooden hub
    { geometry: cylinderZGeo(0.36, 0.36, 0.54, 12), position: [0, 0, 0] },
    // Inner & Outer rims
    { geometry: rimGeo, position: [0, 0, -0.25] },
    { geometry: copyGeometry(rimGeo), position: [0, 0, 0.25] },
  ];

  // 8 Pairs of radial spokes & cross-ties
  for (let i = 0; i < 8; i++) {
    const angleRad = i * (Math.PI / 4);
    const angleDeg = i * 45;
    const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
    const posX = -sinA * spokeMidR;
    const posY = cosA * spokeMidR;

    wheelWoodItems.push(
      { geometry: spokeGeo, position: [posX, posY, -0.25], rotation: [0, 0, angleDeg] },
      { geometry: spokeGeo, position: [posX, posY, 0.25], rotation: [0, 0, angleDeg] },
      { geometry: makeBox(0.10, 0.10, 0.42, 0.1, 0.4), position: [posX, posY, 0] }
    );
  }

  // 16 Broad timber paddles & spines
  for (let p = 0; p < 16; p++) {
    const pAngleRad = (p / 16) * Math.PI * 2 + (Math.PI / 16);
    const pAngleDeg = (pAngleRad * 180) / Math.PI;
    const pitchDeg = pAngleDeg + 16;
    const pX = Math.cos(pAngleRad) * paddleMidR;
    const pY = Math.sin(pAngleRad) * paddleMidR;

    wheelWoodItems.push(
      { geometry: paddleGeo, position: [pX, pY, 0], rotation: [0, 0, pitchDeg - 90] },
      { geometry: paddleSpineGeo, position: [pX, pY, 0], rotation: [0, 0, pitchDeg - 90] }
    );
  }

  createPart('Wheel_Wood', mergeGeometries(wheelWoodItems), matWood, {
    parent: wheelPivot,
  });

  // 5b. Wheel Metal (Hub Hoops, Collar Clamps, Spoke Straps, Fishplates, Paddle Cleats)
  const wheelMetalItems = [
    { geometry: cylinderZGeo(0.375, 0.375, 0.06, 16), position: [0, 0, -0.22] },
    { geometry: cylinderZGeo(0.375, 0.375, 0.06, 16), position: [0, 0, 0.22] },
    { geometry: cylinderZGeo(0.18, 0.18, 0.05, 12), position: [0, 0, -0.28] },
    { geometry: cylinderZGeo(0.18, 0.18, 0.05, 12), position: [0, 0, 0.28] },
  ];

  // Spoke socket straps
  const socketR = 0.40;
  const strapGeo = makeBox(0.15, 0.08, 0.09);
  for (let i = 0; i < 8; i++) {
    const angleRad = i * (Math.PI / 4);
    const angleDeg = i * 45;
    const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
    wheelMetalItems.push(
      { geometry: strapGeo, position: [-sinA * socketR, cosA * socketR, -0.25], rotation: [0, 0, angleDeg] },
      { geometry: strapGeo, position: [-sinA * socketR, cosA * socketR, 0.25], rotation: [0, 0, angleDeg] }
    );
  }

  // Rim felloe joint fishplates
  const fishplateGeo = makeBox(0.06, 0.14, 0.09, 0.1, 0.1);
  for (let f = 0; f < 8; f++) {
    const fAngleRad = f * (Math.PI / 4) + (Math.PI / 8);
    const fAngleDeg = (fAngleRad * 180) / Math.PI;
    const fX = Math.cos(fAngleRad) * 1.40;
    const fY = Math.sin(fAngleRad) * 1.40;
    wheelMetalItems.push(
      { geometry: fishplateGeo, position: [fX, fY, -0.25], rotation: [0, 0, fAngleDeg - 90] },
      { geometry: fishplateGeo, position: [fX, fY, 0.25], rotation: [0, 0, fAngleDeg - 90] }
    );
  }

  // Paddle mounting cleats
  const cleatGeo = makeBox(0.06, 0.10, 0.03, 0.1, 0.1);
  for (let p = 0; p < 16; p++) {
    const pAngleRad = (p / 16) * Math.PI * 2 + (Math.PI / 16);
    const pAngleDeg = (pAngleRad * 180) / Math.PI;
    const pitchDeg = pAngleDeg + 16;
    const pX = Math.cos(pAngleRad) * paddleMidR;
    const pY = Math.sin(pAngleRad) * paddleMidR;
    wheelMetalItems.push(
      { geometry: cleatGeo, position: [pX, pY, -0.27], rotation: [0, 0, pitchDeg - 90] },
      { geometry: cleatGeo, position: [pX, pY, 0.27], rotation: [0, 0, pitchDeg - 90] }
    );
  }

  createPart('Wheel_Metal', mergeGeometries(wheelMetalItems), matMetal, {
    parent: wheelPivot,
  });

  return root;
}

/**
 * 360-degree rotation animation clip
 * Loop: 6.0 seconds duration (10 RPM), smooth full turn around stationary axle
 */
function animate(root) {
  const track = rotationTrack(
    'Joint_WheelRotor',
    [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 1.5, rotation: [0, 0, -90] },
      { time: 3.0, rotation: [0, 0, -180] },
      { time: 4.5, rotation: [0, 0, -270] },
      { time: 6.0, rotation: [0, 0, -360] },
    ],
    'LINEAR'
  );

  return [createClip('Spin', 6.0, [track])];
}
