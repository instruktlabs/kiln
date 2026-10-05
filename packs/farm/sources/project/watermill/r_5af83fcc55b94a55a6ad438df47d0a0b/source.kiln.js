/**
 * Farm watermill asset
 * Coherent cream masonry mill building with charcoal pitched roof,
 * honey-wood waterwheel, and stationary timber mounting gantry.
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
function createRimRingGeo(rIn, rOut, zThickness, segments = 16) {
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
  const indices = [0, 1, 2, 3, 4, 5];

  const addSlopeQuad = (p0, p1, p2, p3, nx, ny, nz) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    for (let k = 0; k < 4; k++) normals.push(nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const hyp = Math.hypot(halfSpan, riseY);
  const nLy = halfSpan / hyp, nLz = -riseY / hyp;

  // Left slope (-Z)
  addSlopeQuad(
    [-halfThick, 0, -halfSpan],
    [halfThick, 0, -halfSpan],
    [halfThick, riseY, 0],
    [-halfThick, riseY, 0],
    0, nLy, nLz
  );

  // Right slope (+Z)
  addSlopeQuad(
    [halfThick, 0, halfSpan],
    [-halfThick, 0, halfSpan],
    [-halfThick, riseY, 0],
    [halfThick, riseY, 0],
    0, nLy, -nLz
  );

  // Bottom quad
  addSlopeQuad(
    [-halfThick, 0, halfSpan],
    [halfThick, 0, halfSpan],
    [halfThick, 0, -halfSpan],
    [-halfThick, 0, -halfSpan],
    0, -1, 0
  );

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
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

  const matGlass = glassMaterial(0xd0e4e8, { opacity: 0.38, roughness: 0.12, metalness: 0.08 });

  // -------------------------------------------------------------
  // 2. Building Structure (Static)
  // Placement center (0, 0) at ground Y = 0.
  // Walls: X span = 5.20m ([-2.60, +2.60]), Z span = 3.60m ([-2.40, +1.20])
  // Building center in Z is -0.60m. Wall height = 3.00m, wall thickness = 0.28m.
  // -------------------------------------------------------------
  const building = new THREE.Group();
  building.name = 'Building';
  root.add(building);

  // 2a. Stone Foundation Plinth (Y = 0 to 0.35m, 0.04m projection)
  const plinthH = 0.35;
  // Front plinth (runs Z from -2.44 to +1.24)
  createPart('PlinthFront', makeBox(0.36, plinthH, 3.68, 0.36, 0.35), matMasonry, {
    position: [2.60, plinthH / 2, -0.60],
    parent: building,
  });
  // Back plinth
  createPart('PlinthBack', makeBox(0.36, plinthH, 3.68, 0.36, 0.35), matMasonry, {
    position: [-2.60, plinthH / 2, -0.60],
    parent: building,
  });
  // Left plinth (-Z wall)
  createPart('PlinthLeft', makeBox(4.88, plinthH, 0.36, 2.44, 0.35), matMasonry, {
    position: [0, plinthH / 2, -2.40],
    parent: building,
  });
  // Right plinth (+Z wall under waterwheel)
  createPart('PlinthRight', makeBox(4.88, plinthH, 0.36, 2.44, 0.35), matMasonry, {
    position: [0, plinthH / 2, 1.20],
    parent: building,
  });

  // Plinth water table cap moulding (Y = 0.35m)
  createPart('PlinthCapFront', makeBox(0.38, 0.05, 3.72, 0.38, 0.1), matMasonry, {
    position: [2.60, 0.35, -0.60],
    parent: building,
  });
  createPart('PlinthCapBack', makeBox(0.38, 0.05, 3.72, 0.38, 0.1), matMasonry, {
    position: [-2.60, 0.35, -0.60],
    parent: building,
  });
  createPart('PlinthCapLeft', makeBox(4.96, 0.05, 0.38, 2.48, 0.1), matMasonry, {
    position: [0, 0.35, -2.40],
    parent: building,
  });
  createPart('PlinthCapRight', makeBox(4.96, 0.05, 0.38, 2.48, 0.1), matMasonry, {
    position: [0, 0.35, 1.20],
    parent: building,
  });

  // 2b. Stone Doorstep at front (X = 2.76m, Z = -0.80m)
  createPart('DoorStep', makeBox(0.36, 0.12, 1.20, 0.36, 0.6), matMasonry, {
    position: [2.76, 0.06, -0.80],
    parent: building,
  });

  // 2c. Walls with Real Apertures
  // Front Wall (+X = 2.60m): Doorway at Z = -0.80m (1.0m x 2.1m), Window at Z = 0.40m (0.8m x 0.9m)
  createPart('WallFrontLeft', makeBox(0.28, 2.65, 1.10, 0.28, 1.35), matMasonry, {
    position: [2.60, 1.675, -1.85],
    parent: building,
  });
  createPart('DoorLintel', makeBox(0.28, 0.90, 1.00, 0.28, 0.45), matMasonry, {
    position: [2.60, 2.55, -0.80],
    parent: building,
  });
  createPart('DoorKeystone', makeBox(0.32, 0.22, 0.22, 0.3, 0.2), matMasonry, {
    position: [2.62, 2.99, -0.80],
    parent: building,
  });
  createPart('WallFrontMid', makeBox(0.28, 2.65, 0.30, 0.28, 1.35), matMasonry, {
    position: [2.60, 1.675, -0.15],
    parent: building,
  });
  createPart('WallFrontWinBelow', makeBox(0.28, 0.95, 0.80, 0.28, 0.5), matMasonry, {
    position: [2.60, 0.825, 0.40],
    parent: building,
  });
  createPart('WallFrontWinAbove', makeBox(0.28, 0.80, 0.80, 0.28, 0.4), matMasonry, {
    position: [2.60, 2.60, 0.40],
    parent: building,
  });
  createPart('WallFrontRight', makeBox(0.28, 2.65, 0.40, 0.28, 1.35), matMasonry, {
    position: [2.60, 1.675, 1.00],
    parent: building,
  });

  // Back Wall (-X = -2.60m): Window at Z = -0.60m
  createPart('WallBackLeft', makeBox(0.28, 2.65, 1.40, 0.28, 1.35), matMasonry, {
    position: [-2.60, 1.675, -1.70],
    parent: building,
  });
  createPart('WallBackWinBelow', makeBox(0.28, 0.95, 0.80, 0.28, 0.5), matMasonry, {
    position: [-2.60, 0.825, -0.60],
    parent: building,
  });
  createPart('WallBackWinAbove', makeBox(0.28, 0.80, 0.80, 0.28, 0.4), matMasonry, {
    position: [-2.60, 2.60, -0.60],
    parent: building,
  });
  createPart('WallBackRight', makeBox(0.28, 2.65, 1.40, 0.28, 1.35), matMasonry, {
    position: [-2.60, 1.675, 0.50],
    parent: building,
  });

  // Left Wall (-Z = -2.40m): Window at X = 0
  createPart('WallLeftBack', makeBox(2.10, 2.65, 0.28, 1.05, 1.35), matMasonry, {
    position: [-1.45, 1.675, -2.40],
    parent: building,
  });
  createPart('WallLeftWinBelow', makeBox(0.80, 0.95, 0.28, 0.4, 0.5), matMasonry, {
    position: [0, 0.825, -2.40],
    parent: building,
  });
  createPart('WallLeftWinAbove', makeBox(0.80, 0.80, 0.28, 0.4, 0.4), matMasonry, {
    position: [0, 2.60, -2.40],
    parent: building,
  });
  createPart('WallLeftFront', makeBox(2.10, 2.65, 0.28, 1.05, 1.35), matMasonry, {
    position: [1.45, 1.675, -2.40],
    parent: building,
  });

  // Right Wall (+Z = 1.20m, wheel side): Solid masonry with axle port
  createPart('WallRightMain', makeBox(4.92, 2.65, 0.28, 2.46, 1.35), matMasonry, {
    position: [0, 1.675, 1.20],
    parent: building,
  });
  // Axle stone sleeve reinforcement
  createPart('AxleCollar', cylinderZGeo(0.28, 0.28, 0.12, 16), matMasonry, {
    position: [0, 1.60, 1.36],
    parent: building,
  });

  // 2d. Corner Stone Quoins (staggered stone blocks along corners)
  const quoinH = 0.28;
  for (let level = 1; level <= 9; level++) {
    const qY = level * quoinH + 0.22;
    const isLongX = level % 2 === 0;
    const qW = isLongX ? 0.40 : 0.32;
    const qD = isLongX ? 0.32 : 0.40;
    createPart(`Quoin_FL_${level}`, makeBox(qW, 0.24, qD, 0.4, 0.24), matMasonry, {
      position: [2.60, qY, 1.20],
      parent: building,
    });
    createPart(`Quoin_FR_${level}`, makeBox(qW, 0.24, qD, 0.4, 0.24), matMasonry, {
      position: [2.60, qY, -2.40],
      parent: building,
    });
    createPart(`Quoin_BL_${level}`, makeBox(qW, 0.24, qD, 0.4, 0.24), matMasonry, {
      position: [-2.60, qY, 1.20],
      parent: building,
    });
    createPart(`Quoin_BR_${level}`, makeBox(qW, 0.24, qD, 0.4, 0.24), matMasonry, {
      position: [-2.60, qY, -2.40],
      parent: building,
    });
  }

  // 2e. Usable Doorway with Open Timber Plank Door Ajar
  // Recessed door frame jambs and head
  createPart('DoorJambLeft', makeBox(0.28, 2.10, 0.08, 0.15, 1.0), matWood, {
    position: [2.60, 1.05, -1.30],
    parent: building,
  });
  createPart('DoorJambRight', makeBox(0.28, 2.10, 0.08, 0.15, 1.0), matWood, {
    position: [2.60, 1.05, -0.30],
    parent: building,
  });
  createPart('DoorFrameHead', makeBox(0.28, 0.08, 1.06, 0.15, 0.5), matWood, {
    position: [2.60, 2.10, -0.80],
    parent: building,
  });
  // Real timber door standing ajar (swung inward 35 degrees)
  const doorPivot = new THREE.Group();
  doorPivot.name = 'DoorPivot';
  doorPivot.position.set(2.50, 1.05, -1.26);
  doorPivot.rotation.y = (35 * Math.PI) / 180;
  building.add(doorPivot);

  createPart('DoorLeaf', makeBox(0.05, 2.04, 0.94, 0.05, 1.0), matWood, {
    position: [0, 0, 0.47],
    parent: doorPivot,
  });
  // Iron strap hinges on door
  createPart('DoorHingeTop', makeBox(0.06, 0.06, 0.60, 0.06, 0.3), matMetal, {
    position: [0, 0.65, 0.30],
    parent: doorPivot,
  });
  createPart('DoorHingeBottom', makeBox(0.06, 0.06, 0.60, 0.06, 0.3), matMetal, {
    position: [0, -0.65, 0.30],
    parent: doorPivot,
  });
  // Iron latch handle
  createPart('DoorLatch', makeBox(0.09, 0.14, 0.04, 0.1, 0.1), matMetal, {
    position: [0, 0.0, 0.85],
    parent: doorPivot,
  });

  // 2f. Window Assemblies (Sills, Frames, Mullions, Real Glass)
  const buildWindowAssembly = (name, posX, posY, posZ, rotYDeg) => {
    const winGrp = new THREE.Group();
    winGrp.name = name;
    winGrp.position.set(posX, posY, posZ);
    if (rotYDeg) winGrp.rotation.y = (rotYDeg * Math.PI) / 180;
    building.add(winGrp);

    // Stone sill protruding 0.06m outward
    createPart(`${name}_Sill`, makeBox(0.38, 0.10, 0.96, 0.4, 0.2), matMasonry, {
      position: [0, -0.50, 0],
      parent: winGrp,
    });
    // Stone lintel
    createPart(`${name}_Lintel`, makeBox(0.36, 0.12, 0.96, 0.4, 0.2), matMasonry, {
      position: [0, 0.50, 0],
      parent: winGrp,
    });
    // Wooden outer frame casing (recessed inside aperture)
    createPart(`${name}_WoodLeft`, makeBox(0.16, 0.88, 0.06, 0.15, 0.9), matWood, {
      position: [0, 0, -0.37],
      parent: winGrp,
    });
    createPart(`${name}_WoodRight`, makeBox(0.16, 0.88, 0.06, 0.15, 0.9), matWood, {
      position: [0, 0, 0.37],
      parent: winGrp,
    });
    createPart(`${name}_WoodTop`, makeBox(0.16, 0.06, 0.74, 0.15, 0.7), matWood, {
      position: [0, 0.41, 0],
      parent: winGrp,
    });
    createPart(`${name}_WoodBottom`, makeBox(0.16, 0.06, 0.74, 0.15, 0.7), matWood, {
      position: [0, -0.41, 0],
      parent: winGrp,
    });
    // Central vertical mullion & horizontal transom
    createPart(`${name}_Mullion`, makeBox(0.12, 0.82, 0.05, 0.12, 0.8), matWood, {
      position: [0, 0, 0],
      parent: winGrp,
    });
    createPart(`${name}_Transom`, makeBox(0.12, 0.05, 0.72, 0.12, 0.7), matWood, {
      position: [0, 0.05, 0],
      parent: winGrp,
    });
    // Real see-through glass pane
    createPart(`${name}_Glass`, makeBox(0.02, 0.82, 0.72), matGlass, {
      position: [0, 0, 0],
      parent: winGrp,
    });
  };

  buildWindowAssembly('WindowFront', 2.60, 1.75, 0.40, 0);
  buildWindowAssembly('WindowBack', -2.60, 1.75, -0.60, 180);
  buildWindowAssembly('WindowLeft', 0, 1.75, -2.40, 90);

  // 2g. Interior Floor (Solid Honey-Wood Planks)
  // Inside room bounds: X in [-2.46, +2.46], Z in [-2.26, +1.06]
  createPart('InteriorFloor', makeBox(4.92, 0.08, 3.32, 2.46, 1.66), matWood, {
    position: [0, 0.04, -0.60],
    parent: building,
  });

  // -------------------------------------------------------------
  // 3. Roof Assembly (Includes Continuous Interior Ceiling & Joists)
  // Gable roof along X axis. Ridge at Z = -0.60m, Y = 4.85m (height ~5m).
  // -------------------------------------------------------------
  const roof = new THREE.Group();
  roof.name = 'Roof';
  building.add(roof);

  // 3a. Interior Continuous Flat Ceiling & Heavy Timber Joists
  // Sits cleanly at Y = 2.85m, covering the occupied room below
  createPart('InteriorCeiling', makeBox(4.92, 0.06, 3.32, 2.46, 1.66), matWood, {
    position: [0, 2.85, -0.60],
    parent: roof,
  });
  // 5 transverse heavy ceiling joist beams
  for (let j = 0; j < 5; j++) {
    const jX = -1.90 + j * 0.95;
    createPart(`CeilingJoist_${j + 1}`, makeBox(0.16, 0.14, 3.30, 0.16, 1.65), matWood, {
      position: [jX, 2.76, -0.60],
      parent: roof,
    });
  }

  // 3b. Triangular Stone Gable End Walls
  // Span = 3.60m, rise = 1.85m, thickness = 0.28m
  const gableFrontGeo = createGableGeo(3.60, 1.85, 0.28);
  createPart('GableFront', gableFrontGeo, matMasonry, {
    position: [2.60, 3.00, -0.60],
    parent: roof,
  });
  createPart('GableBack', copyGeometry(gableFrontGeo), matMasonry, {
    position: [-2.60, 3.00, -0.60],
    parent: roof,
  });

  // Attic loft window with frame on front gable
  createPart('AtticWindowFrame', makeBox(0.32, 0.44, 0.44, 0.32, 0.44), matWood, {
    position: [2.62, 3.85, -0.60],
    parent: roof,
  });
  createPart('AtticWindowGlass', makeBox(0.04, 0.36, 0.36), matGlass, {
    position: [2.62, 3.85, -0.60],
    parent: roof,
  });

  // Horizontal timber collar tie beams across gables
  createPart('GableCollarBeamFront', makeBox(0.10, 0.12, 2.20, 0.1, 1.1), matWood, {
    position: [2.76, 3.80, -0.60],
    parent: roof,
  });
  createPart('GableCollarBeamBack', makeBox(0.10, 0.12, 2.20, 0.1, 1.1), matWood, {
    position: [-2.76, 3.80, -0.60],
    parent: roof,
  });
  createPart('GableKingPostBack', makeBox(0.10, 0.95, 0.10, 0.1, 0.95), matWood, {
    position: [-2.76, 4.30, -0.60],
    parent: roof,
  });

  // 3c. Roof Slopes (Charcoal Shingles)
  // Length along X = 5.80m (0.30m gable overhangs on front and back)
  // Ridge at Z = -0.60m, Y = 4.85m.
  // Left eave at Z = -2.62m, Y = 2.82m.
  // Right eave at Z = +1.40m, Y = 2.85m (gives 0.20m clear gap to wheel inner face at Z = 1.60m).
  const roofLengthX = 5.80;
  const slopeLeftHyp = Math.hypot(2.02, 2.03); // ~2.86m
  const slopeRightHyp = Math.hypot(2.00, 2.00); // ~2.83m
  const slopeThick = 0.08;

  const angleLeft = Math.atan2(2.03, 2.02);
  const angleRight = Math.atan2(2.00, 2.00);

  // Left slope
  createPart('RoofSlopeLeft', makeBox(roofLengthX, slopeThick, slopeLeftHyp, 2.9, 1.4), matRoof, {
    position: [0, (4.85 + 2.82) / 2, (-0.60 - 2.62) / 2],
    rotation: [-angleLeft * (180 / Math.PI), 0, 0],
    parent: roof,
  });
  // Right slope
  createPart('RoofSlopeRight', makeBox(roofLengthX, slopeThick, slopeRightHyp, 2.9, 1.4), matRoof, {
    position: [0, (4.85 + 2.85) / 2, (-0.60 + 1.40) / 2],
    rotation: [angleRight * (180 / Math.PI), 0, 0],
    parent: roof,
  });

  // Roof Ridge Cap
  createPart('RoofRidgeCap', makeBox(roofLengthX + 0.04, 0.12, 0.20, 2.9, 0.2), matRoof, {
    position: [0, 4.90, -0.60],
    parent: roof,
  });

  // Rafter tails exposed under roof eaves
  for (let r = 0; r < 7; r++) {
    const rX = -2.40 + r * 0.80;
    createPart(`RafterTailLeft_${r + 1}`, makeBox(0.10, 0.10, 0.24, 0.1, 0.2), matWood, {
      position: [rX, 2.82, -2.52],
      parent: roof,
    });
    createPart(`RafterTailRight_${r + 1}`, makeBox(0.10, 0.10, 0.24, 0.1, 0.2), matWood, {
      position: [rX, 2.85, 1.30],
      parent: roof,
    });
  }

  // Eave Fascia / Soffit Trims along length (under slopes)
  createPart('EaveFasciaLeft', makeBox(roofLengthX, 0.12, 0.06, 2.9, 0.1), matWood, {
    position: [0, 2.78, -2.64],
    parent: roof,
  });
  createPart('EaveFasciaRight', makeBox(roofLengthX, 0.12, 0.06, 2.9, 0.1), matWood, {
    position: [0, 2.81, 1.42],
    parent: roof,
  });

  // Wooden Bargeboards along Front & Rear Gable Verges
  createPart('BargeboardFrontLeft', makeBox(0.08, 0.14, slopeLeftHyp + 0.10, 0.08, 1.4), matWood, {
    position: [2.90, (4.85 + 2.82) / 2, (-0.60 - 2.62) / 2],
    rotation: [-angleLeft * (180 / Math.PI), 0, 0],
    parent: roof,
  });
  createPart('BargeboardFrontRight', makeBox(0.08, 0.14, slopeRightHyp + 0.10, 0.08, 1.4), matWood, {
    position: [2.90, (4.85 + 2.85) / 2, (-0.60 + 1.40) / 2],
    rotation: [angleRight * (180 / Math.PI), 0, 0],
    parent: roof,
  });
  createPart('BargeboardBackLeft', makeBox(0.08, 0.14, slopeLeftHyp + 0.10, 0.08, 1.4), matWood, {
    position: [-2.90, (4.85 + 2.82) / 2, (-0.60 - 2.62) / 2],
    rotation: [-angleLeft * (180 / Math.PI), 0, 0],
    parent: roof,
  });
  createPart('BargeboardBackRight', makeBox(0.08, 0.14, slopeRightHyp + 0.10, 0.08, 1.4), matWood, {
    position: [-2.90, (4.85 + 2.85) / 2, (-0.60 + 1.40) / 2],
    rotation: [angleRight * (180 / Math.PI), 0, 0],
    parent: roof,
  });

  // -------------------------------------------------------------
  // 4. Stationary Wheel Mounting Gantry & Bearings
  // Axle centerline: X = 0, Y = 1.60m, along Z.
  // Wheel radius: 1.50m (bottom at Y = 0.10m, top at Y = 3.10m).
  // Inner rim at Z = 1.60m, outer rim at Z = 2.18m.
  // Wall at Z = 1.25m (clearance to inner rim = 0.35m).
  // Outer support gantry at Z = 2.36m (clearance to outer rim = 0.18m).
  // -------------------------------------------------------------
  const gantry = new THREE.Group();
  gantry.name = 'Gantry';
  root.add(gantry);

  // 4a. Heavy Wall Cantilever Bracket & Knee-Brace (Inner Bearing)
  // Wall corbel block: Z = 1.25m to 1.48m, Y = 1.46m
  createPart('WallCorbelBeam', makeBox(0.42, 0.28, 0.24, 0.42, 0.28), matWood, {
    position: [0, 1.46, 1.37],
    parent: gantry,
  });
  // Diagonal 45-degree knee brace underneath
  createPart('WallCorbelKneeBrace', makeBox(0.24, 0.38, 0.24, 0.24, 0.38), matWood, {
    position: [0, 1.18, 1.32],
    rotation: [35, 0, 0],
    parent: gantry,
  });
  // Inner iron bearing pillow block with cap bolts
  createPart('InnerBearingBlock', makeBox(0.28, 0.18, 0.16, 0.28, 0.18), matWood, {
    position: [0, 1.55, 1.42],
    parent: gantry,
  });
  createPart('InnerBearingCap', makeBox(0.24, 0.14, 0.14), matMetal, {
    position: [0, 1.62, 1.42],
    parent: gantry,
  });

  // 4b. Outer Timber Support Gantry (Heavy Post, Braces, Ground Sill, Outer Bearing)
  // Ground timber sill plate at Z = 2.42m
  createPart('OuterGroundSill', makeBox(2.40, 0.16, 0.24, 2.4, 0.24), matWood, {
    position: [0, 0.08, 2.42],
    parent: gantry,
  });
  // Heavy vertical timber pillar (0.24m x 0.24m) under outer bearing
  createPart('OuterVerticalPost', makeBox(0.24, 1.50, 0.24, 0.24, 1.5), matWood, {
    position: [0, 0.77, 2.42],
    parent: gantry,
  });
  // Diagonal timber braces on outer frame along X
  createPart('OuterBraceLeft', makeBox(0.16, 1.25, 0.16, 0.16, 1.25), matWood, {
    position: [-0.52, 0.85, 2.42],
    rotation: [0, 0, -36],
    parent: gantry,
  });
  createPart('OuterBraceRight', makeBox(0.16, 1.25, 0.16, 0.16, 1.25), matWood, {
    position: [0.52, 0.85, 2.42],
    rotation: [0, 0, 36],
    parent: gantry,
  });
  // Outer bearing pillow block with iron cap and strap
  createPart('OuterBearingBase', makeBox(0.30, 0.16, 0.22, 0.3, 0.2), matWood, {
    position: [0, 1.52, 2.42],
    parent: gantry,
  });
  createPart('OuterBearingCap', makeBox(0.26, 0.16, 0.18), matMetal, {
    position: [0, 1.61, 2.42],
    parent: gantry,
  });

  // Heavy cross-tie timber between outer gantry sill and wall plinth (at ground level, X = -1.05m outside wheel sweep)
  createPart('GantrySillTieRear', makeBox(0.20, 0.16, 1.22, 0.2, 1.2), matWood, {
    position: [-1.05, 0.08, 1.81],
    parent: gantry,
  });
  createPart('GantrySillTieFront', makeBox(0.20, 0.16, 1.22, 0.2, 1.2), matWood, {
    position: [1.05, 0.08, 1.81],
    parent: gantry,
  });

  // 4c. Continuous Stationary Axle Shaft
  // Runs along Z from Z = 1.25m (wall) to Z = 2.54m (outer bearing)
  createPart('AxleShaft', cylinderZGeo(0.11, 0.11, 1.30, 16), matWood, {
    position: [0, 1.60, 1.90],
    parent: gantry,
  });
  // Heavy cast iron journal sleeves and outer end cap
  createPart('AxleOuterCap', cylinderZGeo(0.09, 0.09, 0.06, 12), matMetal, {
    position: [0, 1.60, 2.55],
    parent: gantry,
  });

  // -------------------------------------------------------------
  // 5. Waterwheel Rotor (Articulated Hinge)
  // Pivot placed at wheel center [0, 1.60, 1.89].
  // Rotates around Z axis in the XY plane.
  // -------------------------------------------------------------
  const wheelPivot = createPivot('WheelRotor', [0, 1.60, 1.89], root);

  // 5a. Heavy 12-sided Wooden Hub with Iron Hoops
  // Radius = 0.36m, length along Z = 0.54m (local Z in [-0.27, +0.27])
  createPart('WheelHub', cylinderZGeo(0.36, 0.36, 0.54, 12), matWood, {
    position: [0, 0, 0],
    parent: wheelPivot,
  });
  // Two heavy iron reinforcing hoops
  createPart('HubIronHoopInner', cylinderZGeo(0.375, 0.375, 0.06, 16), matMetal, {
    position: [0, 0, -0.22],
    parent: wheelPivot,
  });
  createPart('HubIronHoopOuter', cylinderZGeo(0.375, 0.375, 0.06, 16), matMetal, {
    position: [0, 0, 0.22],
    parent: wheelPivot,
  });
  // Iron axle collar clamps
  createPart('HubCollarInner', cylinderZGeo(0.18, 0.18, 0.05, 12), matMetal, {
    position: [0, 0, -0.28],
    parent: wheelPivot,
  });
  createPart('HubCollarOuter', cylinderZGeo(0.18, 0.18, 0.05, 12), matMetal, {
    position: [0, 0, 0.28],
    parent: wheelPivot,
  });

  // 5b. Inner & Outer Segmented Wooden Rims
  // Outer radius = 1.50m (diameter 3.00m), inner radius = 1.30m (radial depth 0.20m).
  // Axial rim thickness = 0.08m.
  // Local positions: inner rim at Z = -0.25m, outer rim at Z = +0.25m
  const rimGeo = createRimRingGeo(1.30, 1.50, 0.08, 24);
  createPart('InnerRim', rimGeo, matWood, {
    position: [0, 0, -0.25],
    parent: wheelPivot,
  });
  createPart('OuterRim', copyGeometry(rimGeo), matWood, {
    position: [0, 0, 0.25],
    parent: wheelPivot,
  });

  // 5c. Sturdy Radial Spokes (8 Pairs = 16 Radial Beams)
  // Connect hub (r = 0.36m) to rim (r = 1.30m). Spoke length = 0.94m.
  // Spoke width = 0.13m, depth = 0.08m.
  const spokeLen = 0.94;
  const spokeMidR = (0.36 + 1.30) / 2; // 0.83m
  const spokeGeo = makeBox(0.13, spokeLen, 0.08, 0.2, 1.0);

  for (let i = 0; i < 8; i++) {
    const angleRad = i * (Math.PI / 4);
    const angleDeg = i * 45;
    const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
    const posX = -sinA * spokeMidR;
    const posY = cosA * spokeMidR;

    // Inner spoke (Z = -0.25m)
    createPart(`SpokeInner_${i + 1}`, spokeGeo, matWood, {
      position: [posX, posY, -0.25],
      rotation: [0, 0, angleDeg],
      parent: wheelPivot,
    });
    // Outer spoke (Z = +0.25m)
    createPart(`SpokeOuter_${i + 1}`, spokeGeo, matWood, {
      position: [posX, posY, 0.25],
      rotation: [0, 0, angleDeg],
      parent: wheelPivot,
    });
    // Transverse spacer strut bridging inner and outer spokes
    createPart(`SpokeBridge_${i + 1}`, makeBox(0.10, 0.10, 0.42, 0.1, 0.4), matWood, {
      position: [posX, posY, 0],
      parent: wheelPivot,
    });
    // Iron spoke socket strap at hub
    const socketR = 0.40;
    createPart(`SpokeStrapInner_${i + 1}`, makeBox(0.15, 0.08, 0.09), matMetal, {
      position: [-sinA * socketR, cosA * socketR, -0.25],
      rotation: [0, 0, angleDeg],
      parent: wheelPivot,
    });
    createPart(`SpokeStrapOuter_${i + 1}`, makeBox(0.15, 0.08, 0.09), matMetal, {
      position: [-sinA * socketR, cosA * socketR, 0.25],
      rotation: [0, 0, angleDeg],
      parent: wheelPivot,
    });
  }

  // Iron fishplates binding rim segment felloes
  const fishplateGeo = makeBox(0.06, 0.14, 0.09, 0.1, 0.1);
  for (let f = 0; f < 8; f++) {
    const fAngleRad = f * (Math.PI / 4) + (Math.PI / 8);
    const fAngleDeg = (fAngleRad * 180) / Math.PI;
    const fX = Math.cos(fAngleRad) * 1.40;
    const fY = Math.sin(fAngleRad) * 1.40;
    createPart(`RimFishplateIn_${f + 1}`, fishplateGeo, matMetal, {
      position: [fX, fY, -0.25],
      rotation: [0, 0, fAngleDeg - 90],
      parent: wheelPivot,
    });
    createPart(`RimFishplateOut_${f + 1}`, fishplateGeo, matMetal, {
      position: [fX, fY, 0.25],
      rotation: [0, 0, fAngleDeg - 90],
      parent: wheelPivot,
    });
  }

  // 5d. 16 Broad Timber Paddles (Buckets) with Side Brackets & Center Spines
  // Spanning from inner rim to outer rim (width along Z = 0.58m, from Z = -0.29 to +0.29)
  // Radial depth = 0.32m (from r = 1.50m down to 1.18m), thickness = 0.04m
  const paddleGeo = makeBox(0.04, 0.32, 0.58, 0.1, 0.6);
  const paddleSpineGeo = makeBox(0.04, 0.28, 0.05, 0.1, 0.3);
  const paddleMidR = 1.34;

  for (let p = 0; p < 16; p++) {
    const pAngleRad = (p / 16) * Math.PI * 2 + (Math.PI / 16);
    const pAngleDeg = (pAngleRad * 180) / Math.PI;
    // 16-degree backward pitch for authentic scoop action
    const pitchDeg = pAngleDeg + 16;
    const pX = Math.cos(pAngleRad) * paddleMidR;
    const pY = Math.sin(pAngleRad) * paddleMidR;

    createPart(`Paddle_${p + 1}`, paddleGeo, matWood, {
      position: [pX, pY, 0],
      rotation: [0, 0, pitchDeg - 90],
      parent: wheelPivot,
    });

    // Central stiffening spine along paddle back
    createPart(`PaddleSpine_${p + 1}`, paddleSpineGeo, matWood, {
      position: [pX, pY, 0],
      rotation: [0, 0, pitchDeg - 90],
      parent: wheelPivot,
    });

    // Side mounting cleats / brackets holding paddle to inner and outer rims
    const cleatGeo = makeBox(0.06, 0.10, 0.03, 0.1, 0.1);
    createPart(`PaddleCleatIn_${p + 1}`, cleatGeo, matMetal, {
      position: [pX, pY, -0.27],
      rotation: [0, 0, pitchDeg - 90],
      parent: wheelPivot,
    });
    createPart(`PaddleCleatOut_${p + 1}`, cleatGeo, matMetal, {
      position: [pX, pY, 0.27],
      rotation: [0, 0, pitchDeg - 90],
      parent: wheelPivot,
    });
  }

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
