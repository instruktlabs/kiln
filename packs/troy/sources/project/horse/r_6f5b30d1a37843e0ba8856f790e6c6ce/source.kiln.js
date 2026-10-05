const meta = {
  name: 'Horse',
  role: 'prop'
};

async function build() {
  const root = createRoot('Horse');

  // Pinned pack materials tinted from Troy palette:
  // 1. horseCoat: troy-linen tinted with leather (#7a5536)
  const horseCoat = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'HorseCoat',
    baseColor: 0x7a5536,
    roughness: 0.85,
    metalness: 0.05,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' }
    }
  });

  // 2. darkDetails: troy-timber / linen tinted with pitch (#2b2420) for mane, tail, hooves & leather harness straps
  const darkDetails = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'DarkDetails',
    baseColor: 0x2b2420,
    roughness: 0.90,
    metalness: 0.05,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' }
    }
  });

  // 3. bronzeMetal: troy-bronze tinted with bronze (#b08d57) for bits, phalera, harness fittings
  const bronzeMetal = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'BronzeMetal',
    baseColor: 0xb08d57,
    roughness: 0.45,
    metalness: 0.85,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' }
    }
  });

  // Main articulated body root at Y = 0.95
  const body = createPivot('Body', [0, 0.95, 0], root);

  // --- Torso / Barrel ---
  // Mid barrel (ribcage / abdomen)
  createPart('Torso_Barrel', cylinderGeo(0.23, 0.24, 0.50, 8), horseCoat, {
    position: [0, 0.08, -0.02],
    rotation: [90, 0, 0],
    parent: body
  });

  // Chest / forequarters
  createPart('Torso_Chest', cylinderGeo(0.24, 0.22, 0.36, 8), horseCoat, {
    position: [0, 0.10, 0.26],
    rotation: [90, 0, 0],
    parent: body
  });

  // Breast bulge
  createPart('Chest_Bulge', sphereGeo(0.18, 8, 6), horseCoat, {
    position: [0, 0.04, 0.44],
    scale: [1.1, 1.2, 0.8],
    parent: body
  });

  // Hindquarters / Croup / Haunches
  createPart('Torso_Croup', cylinderGeo(0.22, 0.23, 0.38, 8), horseCoat, {
    position: [0, 0.12, -0.32],
    rotation: [90, 0, 0],
    parent: body
  });

  // Buttocks
  createPart('Buttocks', sphereGeo(0.19, 8, 6), horseCoat, {
    position: [0, 0.08, -0.50],
    scale: [1.15, 1.1, 0.9],
    parent: body
  });

  // Withers ridge (peaks at shoulder height: 0.95 + 0.45 = 1.40 m)
  createPart('Withers_Ridge', boxGeo(0.14, 0.18, 0.30), horseCoat, {
    position: [0, 0.36, 0.28],
    rotation: [25, 0, 0],
    parent: body
  });

  // --- Chariot Harness on Torso ---
  // Girth strap around belly
  createPart('Girth_Strap', cylinderGeo(0.245, 0.245, 0.07, 8), darkDetails, {
    position: [0, 0.08, 0.14],
    rotation: [90, 0, 0],
    parent: body
  });

  // Yoke pad on withers
  createPart('Yoke_Pad', boxGeo(0.20, 0.05, 0.16), darkDetails, {
    position: [0, 0.43, 0.25],
    rotation: [15, 0, 0],
    parent: body
  });

  // Bronze terret / rein guide rings on yoke pad
  createPart('Terret_Ring_L', cylinderGeo(0.03, 0.03, 0.015, 6), bronzeMetal, {
    position: [-0.09, 0.47, 0.25],
    rotation: [0, 0, 90],
    parent: body
  });
  createPart('Terret_Ring_R', cylinderGeo(0.03, 0.03, 0.015, 6), bronzeMetal, {
    position: [0.09, 0.47, 0.25],
    rotation: [0, 0, 90],
    parent: body
  });

  // Chariot breastband / breastcollar across chest
  createPart('Breastcollar', boxGeo(0.44, 0.07, 0.04), darkDetails, {
    position: [0, 0.12, 0.48],
    rotation: [-10, 0, 0],
    parent: body
  });

  // Decorative bronze central boss / phalera on breastcollar
  createPart('Breast_Phalera', cylinderGeo(0.055, 0.055, 0.02, 8), bronzeMetal, {
    position: [0, 0.12, 0.51],
    rotation: [90, 0, 0],
    parent: body
  });

  // --- Neck & Head Hierarchy ---
  const neck = createPivot('Neck', [0, 0.22, 0.34], body);

  // Muscular neck
  createPart('Neck_Lower', cylinderGeo(0.14, 0.20, 0.32, 6), horseCoat, {
    position: [0, 0.15, 0.10],
    rotation: [-42, 0, 0],
    parent: neck
  });
  createPart('Neck_Upper', cylinderGeo(0.11, 0.15, 0.28, 6), horseCoat, {
    position: [0, 0.30, 0.24],
    rotation: [-48, 0, 0],
    parent: neck
  });

  // Bronze Age standing hogged mane along neck crest
  createPart('Mane_Lower', boxGeo(0.05, 0.10, 0.30), darkDetails, {
    position: [0, 0.24, 0.07],
    rotation: [-42, 0, 0],
    parent: neck
  });
  createPart('Mane_Upper', boxGeo(0.05, 0.10, 0.26), darkDetails, {
    position: [0, 0.40, 0.21],
    rotation: [-48, 0, 0],
    parent: neck
  });

  // Head pivot
  const head = createPivot('Head', [0, 0.40, 0.32], neck);

  // Skull / forehead
  createPart('Head_Skull', boxGeo(0.18, 0.18, 0.20), horseCoat, {
    position: [0, 0.04, 0.06],
    rotation: [-18, 0, 0],
    parent: head
  });

  // Jowls / cheeks
  createPart('Cheek_L', sphereGeo(0.07, 6, 4), horseCoat, {
    position: [-0.08, 0.00, 0.02],
    scale: [0.8, 1.1, 1.2],
    parent: head
  });
  createPart('Cheek_R', sphereGeo(0.07, 6, 4), horseCoat, {
    position: [0.08, 0.00, 0.02],
    scale: [0.8, 1.1, 1.2],
    parent: head
  });

  // Tapered muzzle / bridge of nose
  createPart('Head_Muzzle', cylinderGeo(0.065, 0.09, 0.24, 6), horseCoat, {
    position: [0, -0.06, 0.20],
    rotation: [-62, 0, 0],
    parent: head
  });

  // Nose tip & chin
  createPart('Nose_Tip', boxGeo(0.11, 0.09, 0.08), darkDetails, {
    position: [0, -0.12, 0.31],
    rotation: [-45, 0, 0],
    parent: head
  });

  // Ears
  createPart('Ear_L', coneGeo(0.035, 0.14, 4), horseCoat, {
    position: [-0.07, 0.18, -0.01],
    rotation: [15, -12, -15],
    parent: head
  });
  createPart('Ear_R', coneGeo(0.035, 0.14, 4), horseCoat, {
    position: [0.07, 0.18, -0.01],
    rotation: [15, 12, 15],
    parent: head
  });

  // Forelock
  createPart('Forelock', boxGeo(0.04, 0.07, 0.08), darkDetails, {
    position: [0, 0.14, 0.06],
    rotation: [-20, 0, 0],
    parent: head
  });

  // --- Chariot Bridle & Bit on Head ---
  // Browband strap
  createPart('Bridle_Browband', boxGeo(0.20, 0.035, 0.03), darkDetails, {
    position: [0, 0.10, 0.08],
    rotation: [-20, 0, 0],
    parent: head
  });
  // Noseband strap
  createPart('Bridle_Noseband', cylinderGeo(0.075, 0.075, 0.035, 6), darkDetails, {
    position: [0, -0.08, 0.23],
    rotation: [-62, 0, 0],
    parent: head
  });
  // Cheek straps
  createPart('Cheekstrap_L', boxGeo(0.02, 0.16, 0.02), darkDetails, {
    position: [-0.095, -0.02, 0.12],
    rotation: [-38, 0, 0],
    parent: head
  });
  createPart('Cheekstrap_R', boxGeo(0.02, 0.16, 0.02), darkDetails, {
    position: [0.095, -0.02, 0.12],
    rotation: [-38, 0, 0],
    parent: head
  });
  // Bronze bit rings at mouth corners
  createPart('Bit_Ring_L', cylinderGeo(0.035, 0.035, 0.015, 6), bronzeMetal, {
    position: [-0.09, -0.11, 0.28],
    rotation: [0, 0, 90],
    parent: head
  });
  createPart('Bit_Ring_R', cylinderGeo(0.035, 0.035, 0.015, 6), bronzeMetal, {
    position: [0.09, -0.11, 0.28],
    rotation: [0, 0, 90],
    parent: head
  });
  // Bronze bridle boss studs
  createPart('Bridle_Stud_L', sphereGeo(0.02, 4, 3), bronzeMetal, {
    position: [-0.10, 0.08, 0.06],
    parent: head
  });
  createPart('Bridle_Stud_R', sphereGeo(0.02, 4, 3), bronzeMetal, {
    position: [0.10, 0.08, 0.06],
    parent: head
  });

  // --- Tail ---
  const tail = createPivot('Tail', [0, 0.14, -0.56], body);
  createPart('Tail_Base', cylinderGeo(0.06, 0.045, 0.18, 6), horseCoat, {
    position: [0, -0.06, -0.06],
    rotation: [35, 0, 0],
    parent: tail
  });
  createPart('Tail_Hair_Upper', cylinderGeo(0.05, 0.07, 0.32, 6), darkDetails, {
    position: [0, -0.22, -0.12],
    rotation: [25, 0, 0],
    parent: tail
  });
  createPart('Tail_Hair_Lower', cylinderGeo(0.07, 0.03, 0.35, 6), darkDetails, {
    position: [0, -0.48, -0.18],
    rotation: [15, 0, 0],
    parent: tail
  });

  // --- Legs Helper ---
  function buildFrontLeg(prefix, side) {
    const x = side * 0.18;
    const upper = createPivot(`Leg_F${prefix}_Upper`, [x, 0.05, 0.36], body);

    // Shoulder & upper arm
    createPart(`Shoulder_F${prefix}`, cylinderGeo(0.07, 0.05, 0.44, 6), horseCoat, {
      position: [0, -0.22, 0],
      parent: upper
    });

    const lower = createPivot(`Leg_F${prefix}_Lower`, [0, -0.44, 0], upper);

    // Knee joint
    createPart(`Knee_F${prefix}`, cylinderGeo(0.052, 0.045, 0.08, 6), horseCoat, {
      position: [0, 0, 0.01],
      parent: lower
    });
    // Cannon bone
    createPart(`Cannon_F${prefix}`, cylinderGeo(0.042, 0.036, 0.34, 6), horseCoat, {
      position: [0, -0.19, 0],
      parent: lower
    });

    const hoof = createPivot(`Leg_F${prefix}_Hoof`, [0, -0.42, 0], lower);

    // Fetlock & pastern
    createPart(`Fetlock_F${prefix}`, cylinderGeo(0.040, 0.045, 0.06, 6), horseCoat, {
      position: [0, 0.02, 0.01],
      parent: hoof
    });
    // Solid dark hoof: height = 0.14, base sits exactly on ground Y = 0.00
    createPart(`Hoof_F${prefix}`, cylinderGeo(0.052, 0.070, 0.14, 8), darkDetails, {
      position: [0, -0.07, 0.015],
      parent: hoof
    });
  }

  function buildHindLeg(prefix, side) {
    const x = side * 0.18;
    const upper = createPivot(`Leg_B${prefix}_Upper`, [x, 0.08, -0.38], body);

    // Muscular haunch / thigh / gaskin
    createPart(`Thigh_B${prefix}`, cylinderGeo(0.10, 0.065, 0.45, 6), horseCoat, {
      position: [0, -0.225, -0.04],
      rotation: [12, 0, 0],
      parent: upper
    });

    const lower = createPivot(`Leg_B${prefix}_Lower`, [0, -0.45, -0.08], upper);

    // Hock joint (angled backward)
    createPart(`Hock_B${prefix}`, boxGeo(0.08, 0.10, 0.12), horseCoat, {
      position: [0, 0, -0.02],
      parent: lower
    });
    // Hind cannon bone
    createPart(`Cannon_B${prefix}`, cylinderGeo(0.044, 0.038, 0.34, 6), horseCoat, {
      position: [0, -0.19, 0.03],
      rotation: [-8, 0, 0],
      parent: lower
    });

    const hoof = createPivot(`Leg_B${prefix}_Hoof`, [0, -0.42, 0.06], lower);

    // Fetlock & pastern
    createPart(`Fetlock_B${prefix}`, cylinderGeo(0.042, 0.046, 0.06, 6), horseCoat, {
      position: [0, 0.02, 0],
      parent: hoof
    });
    // Solid dark hoof: base sits exactly on ground Y = 0.00
    createPart(`Hoof_B${prefix}`, cylinderGeo(0.052, 0.070, 0.14, 8), darkDetails, {
      position: [0, -0.07, 0.005],
      parent: hoof
    });
  }

  // Front legs: Left (-X) and Right (+X)
  buildFrontLeg('L', -1);
  buildFrontLeg('R', 1);

  // Hind legs: Left (-X) and Right (+X)
  buildHindLeg('L', -1);
  buildHindLeg('R', 1);

  return root;
}

function animate(root) {
  // -------------------------------------------------------------
  // Clip 1: Stand (Idle breathing, alert, planted hooves)
  // -------------------------------------------------------------
  const standDuration = 2.4;
  const standTracks = [
    // Subtle breathing rise and fall
    positionTrack('Joint_Body', [
      { time: 0.0, position: [0, 0.95, 0] },
      { time: 0.6, position: [0, 0.954, 0] },
      { time: 1.2, position: [0, 0.95, 0] },
      { time: 1.8, position: [0, 0.948, 0] },
      { time: 2.4, position: [0, 0.95, 0] }
    ], 'CUBICSPLINE'),

    rotationTrack('Joint_Body', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.6, rotation: [0.4, 0, 0] },
      { time: 1.2, rotation: [0, 0, 0] },
      { time: 1.8, rotation: [-0.3, 0, 0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    // Alert head & neck breathing motions
    rotationTrack('Joint_Neck', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.8, rotation: [1.8, 0, 0] },
      { time: 1.6, rotation: [-1.0, 1.2, 0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    rotationTrack('Joint_Head', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.8, rotation: [-1.2, 0, 0] },
      { time: 1.6, rotation: [0.8, -1.8, 0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    // Tail gentle resting swish
    rotationTrack('Joint_Tail', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.6, rotation: [-2.0, 4.0, 1.0] },
      { time: 1.2, rotation: [0, 0, 0] },
      { time: 1.8, rotation: [-1.5, -4.0, -1.0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    // All leg joints held firmly in rest pose (touching ground)
    rotationTrack('Joint_Leg_FL_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FL_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FL_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),

    rotationTrack('Joint_Leg_FR_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FR_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FR_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),

    rotationTrack('Joint_Leg_BL_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BL_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BL_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),

    rotationTrack('Joint_Leg_BR_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BR_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BR_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR')
  ];

  // -------------------------------------------------------------
  // Clip 2: Gallop (Dynamic, looped rotary gallop cycle)
  // -------------------------------------------------------------
  const gallopDuration = 0.64;
  const gallopTracks = [
    // Body translation (surge and vertical leap)
    positionTrack('Joint_Body', [
      { time: 0.00, position: [0, 0.93, 0.00] },
      { time: 0.16, position: [0, 0.98, 0.02] },
      { time: 0.32, position: [0, 1.03, 0.04] },
      { time: 0.48, position: [0, 0.95, 0.01] },
      { time: 0.64, position: [0, 0.93, 0.00] }
    ], 'CUBICSPLINE'),

    // Body pitch (positive X tilts top forward/down)
    rotationTrack('Joint_Body', [
      { time: 0.00, rotation: [-5, 0, 0] },
      { time: 0.16, rotation: [8, 0, -1] },
      { time: 0.32, rotation: [2, 0, 0] },
      { time: 0.48, rotation: [-7, 0, 1] },
      { time: 0.64, rotation: [-5, 0, 0] }
    ], 'CUBICSPLINE'),

    // Neck counter-balancing pitch
    rotationTrack('Joint_Neck', [
      { time: 0.00, rotation: [-6, 0, 0] },
      { time: 0.16, rotation: [7, 0, 0] },
      { time: 0.32, rotation: [-4, 0, 0] },
      { time: 0.48, rotation: [-8, 0, 0] },
      { time: 0.64, rotation: [-6, 0, 0] }
    ], 'CUBICSPLINE'),

    // Head stabilization
    rotationTrack('Joint_Head', [
      { time: 0.00, rotation: [3, 0, 0] },
      { time: 0.16, rotation: [-4, 0, 0] },
      { time: 0.32, rotation: [2, 0, 0] },
      { time: 0.48, rotation: [4, 0, 0] },
      { time: 0.64, rotation: [3, 0, 0] }
    ], 'CUBICSPLINE'),

    // Tail streaming in the wind
    rotationTrack('Joint_Tail', [
      { time: 0.00, rotation: [-20, 0, 0] },
      { time: 0.16, rotation: [-32, 2, 0] },
      { time: 0.32, rotation: [-40, -1, 0] },
      { time: 0.48, rotation: [-28, 2, 0] },
      { time: 0.64, rotation: [-20, 0, 0] }
    ], 'CUBICSPLINE'),

    // Front Left Leg (trailing foreleg)
    rotationTrack('Joint_Leg_FL_Upper', [
      { time: 0.00, rotation: [35, 0, 0] },
      { time: 0.16, rotation: [-15, 0, 0] },
      { time: 0.32, rotation: [-45, 0, 0] },
      { time: 0.48, rotation: [-10, 0, 0] },
      { time: 0.64, rotation: [35, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FL_Lower', [
      { time: 0.00, rotation: [75, 0, 0] },
      { time: 0.16, rotation: [10, 0, 0] },
      { time: 0.32, rotation: [5, 0, 0] },
      { time: 0.48, rotation: [15, 0, 0] },
      { time: 0.64, rotation: [75, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FL_Hoof', [
      { time: 0.00, rotation: [-25, 0, 0] },
      { time: 0.16, rotation: [5, 0, 0] },
      { time: 0.32, rotation: [0, 0, 0] },
      { time: 0.48, rotation: [-10, 0, 0] },
      { time: 0.64, rotation: [-25, 0, 0] }
    ], 'CUBICSPLINE'),

    // Front Right Leg (lead foreleg)
    rotationTrack('Joint_Leg_FR_Upper', [
      { time: 0.00, rotation: [42, 0, 0] },
      { time: 0.16, rotation: [-25, 0, 0] },
      { time: 0.32, rotation: [-52, 0, 0] },
      { time: 0.48, rotation: [-20, 0, 0] },
      { time: 0.64, rotation: [42, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FR_Lower', [
      { time: 0.00, rotation: [85, 0, 0] },
      { time: 0.16, rotation: [15, 0, 0] },
      { time: 0.32, rotation: [5, 0, 0] },
      { time: 0.48, rotation: [10, 0, 0] },
      { time: 0.64, rotation: [85, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FR_Hoof', [
      { time: 0.00, rotation: [-30, 0, 0] },
      { time: 0.16, rotation: [10, 0, 0] },
      { time: 0.32, rotation: [0, 0, 0] },
      { time: 0.48, rotation: [-5, 0, 0] },
      { time: 0.64, rotation: [-30, 0, 0] }
    ], 'CUBICSPLINE'),

    // Hind Left Leg (lead hind leg)
    rotationTrack('Joint_Leg_BL_Upper', [
      { time: 0.00, rotation: [-35, 0, 0] },
      { time: 0.16, rotation: [15, 0, 0] },
      { time: 0.32, rotation: [48, 0, 0] },
      { time: 0.48, rotation: [-5, 0, 0] },
      { time: 0.64, rotation: [-35, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BL_Lower', [
      { time: 0.00, rotation: [-55, 0, 0] },
      { time: 0.16, rotation: [-15, 0, 0] },
      { time: 0.32, rotation: [-40, 0, 0] },
      { time: 0.48, rotation: [30, 0, 0] },
      { time: 0.64, rotation: [-55, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BL_Hoof', [
      { time: 0.00, rotation: [15, 0, 0] },
      { time: 0.16, rotation: [-10, 0, 0] },
      { time: 0.32, rotation: [-25, 0, 0] },
      { time: 0.48, rotation: [10, 0, 0] },
      { time: 0.64, rotation: [15, 0, 0] }
    ], 'CUBICSPLINE'),

    // Hind Right Leg (trailing hind leg)
    rotationTrack('Joint_Leg_BR_Upper', [
      { time: 0.00, rotation: [-45, 0, 0] },
      { time: 0.16, rotation: [5, 0, 0] },
      { time: 0.32, rotation: [40, 0, 0] },
      { time: 0.48, rotation: [-15, 0, 0] },
      { time: 0.64, rotation: [-45, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BR_Lower', [
      { time: 0.00, rotation: [-65, 0, 0] },
      { time: 0.16, rotation: [-5, 0, 0] },
      { time: 0.32, rotation: [-35, 0, 0] },
      { time: 0.48, rotation: [40, 0, 0] },
      { time: 0.64, rotation: [-65, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BR_Hoof', [
      { time: 0.00, rotation: [20, 0, 0] },
      { time: 0.16, rotation: [-5, 0, 0] },
      { time: 0.32, rotation: [-20, 0, 0] },
      { time: 0.48, rotation: [15, 0, 0] },
      { time: 0.64, rotation: [20, 0, 0] }
    ], 'CUBICSPLINE')
  ];

  return [
    createClip('Stand', standDuration, standTracks, { loop: true }),
    createClip('Gallop', gallopDuration, gallopTracks, { loop: true }),
    createClip('stand', standDuration, standTracks, { loop: true }),
    createClip('gallop', gallopDuration, gallopTracks, { loop: true })
  ];
}
