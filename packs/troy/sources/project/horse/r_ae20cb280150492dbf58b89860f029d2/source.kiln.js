const meta = {
  name: 'Horse',
  role: 'prop'
};

// Anatomy repair by gpt-6-astra / codex; requested effort max.
// Original author/provenance remains in the immutable parent revision.
// Sparse elliptical stations describe actual silhouette changes, not subdivided boxes.
function contour(axis, rows, sides = 12) {
  const positions = [], indices = [], uvs = [];
  for (let i = 0; i < rows.length; i++) {
    const [a, c, rx, rd, cx = 0] = rows[i];
    for (let j = 0; j < sides; j++) {
      const t = j * Math.PI * 2 / sides;
      if (axis === 'z') positions.push(cx + rx * Math.cos(t), c + rd * Math.sin(t), a);
      else positions.push(cx + rx * Math.cos(t), a, c - rd * Math.sin(t));
      uvs.push(j / sides, (a - rows[0][0]) * 2);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides;
    const c = a + sides, d = b + sides;
    indices.push(a, b, c, b, d, c);
  }
  for (let end = 0; end < 2; end++) {
    const row = end ? rows.length - 1 : 0, r = rows[row], center = positions.length / 3;
    if (axis === 'z') positions.push(r[4] || 0, r[1], r[0]); else positions.push(r[4] || 0, r[0], r[1]);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < sides; j++) {
      const a = row * sides + j, b = row * sides + (j + 1) % sides;
      if (end) indices.push(center, a, b); else indices.push(center, b, a);
    }
  }
  return meshGeo({ positions, indices, uvs });
}
// A closed narrow ribbon following a path on one side of the head.
function cheekRibbon(side) {
  // Owner feedback: keep a clear orbital area; descend behind the eye, then below it.
  const points = [[side * 0.085,0.116,0.014],[side * 0.101,0.06,0.014],
    [side * 0.099,0.004,0.027],[side * 0.081,-0.05,0.115],
    [side * 0.065,-0.084,0.205],[side * 0.086,-0.11,0.28]];
  const sections = points.map((p,i) => {
    const a = points[Math.max(0,i-1)], b = points[Math.min(points.length-1,i+1)];
    const dy=b[1]-a[1], dz=b[2]-a[2], l=Math.hypot(dy,dz);
    return { profile:[[-0.004,-0.006],[0.004,-0.006],[0.004,0.006],[-0.004,0.006]],
      frame:{origin:p,rotation:[Math.atan2(dz,dy)*180/Math.PI,0,0]} };
  });
  return loftProfiles(sections);
}

// Fitted leather bands have thickness and follow the reshaped skin.
function bandZ(rows, thickness, sides = 16) {
  const positions=[],indices=[],uvs=[];
  for (let r=0;r<4;r++) {
    const end=r%2, inner=r>=2, [z,y,rx,ry]=rows[end];
    for(let j=0;j<sides;j++) {
      const t=j*2*Math.PI/sides;
      positions.push((rx-(inner?thickness:0))*Math.cos(t),y+(ry-(inner?thickness:0))*Math.sin(t),z);
      uvs.push(j/sides,end);
    }
  }
  function join(ra,rb,flip) {
    for(let j=0;j<sides;j++) {
      const a=ra*sides+j,b=ra*sides+(j+1)%sides,c=rb*sides+j,d=rb*sides+(j+1)%sides;
      if(flip)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
    }
  }
  join(0,1,false);join(2,3,true);join(0,2,true);join(1,3,false);
  return meshGeo({positions,indices,uvs});
}
function breastRibbon() {
  const pts=[[-0.187,0.12,0.14],[-0.177,0.12,0.29],[-0.147,0.12,0.40],
    [-0.09,0.12,0.471],[0,0.12,0.5],[0.09,0.12,0.471],
    [0.147,0.12,0.40],[0.177,0.12,0.29],[0.187,0.12,0.14]];
  return loftProfiles(pts.map((p,i)=>{
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
    return {profile:[[-0.027,-0.007],[0.027,-0.007],[0.027,0.007],[-0.027,0.007]],
      frame:{origin:p,rotation:[0,-Math.atan2(b[2]-a[2],b[0]-a[0])*180/Math.PI,-90]}};
  }));
}
async function build() {
  const root = createRoot('Horse');

  // Revision 2 (material pass, 2 October 2026): a slimmer body. The barrel, chest and croup are
  // 0.8 to 0.84 as wide as deep, the chest and rump bulges and the neck follow, the harness
  // hugs the narrower barrel and the legs hang 0.16 m off centre. Materials, pivots, joint
  // names and both clips are revision 1's.
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

  // Continuous ribcage: rounded croup, tucked loin, deep forechest.
  createPart('Torso_Barrel', contour('z', [
    [-0.65,0.10,0.013,0.026],[-0.60,0.105,0.11,0.13],
    [-0.49,0.095,0.18,0.207],[-0.34,0.083,0.194,0.232],
    [-0.18,0.052,0.184,0.237],[-0.02,0.052,0.188,0.247],
    [0.14,0.08,0.183,0.233],[0.29,0.12,0.172,0.245],
    [0.40,0.09,0.145,0.219],[0.48,0.025,0.095,0.148],
    [0.525,-0.018,0.012,0.035]
  ],16), horseCoat, {parent:body});
  // Rounded withers support the unchanged yoke pad and terret anchors.
  createPart('Withers_Ridge', contour('z', [
    [-0.025,0.24,0.028,0.025],[0.08,0.28,0.077,0.081],
    [0.19,0.329,0.078,0.099],[0.28,0.322,0.077,0.112],
    [0.38,0.26,0.09,0.13],[0.43,0.19,0.065,0.09]
  ]), horseCoat, {parent:body});

  // --- Chariot Harness on Torso ---
  // Fitted girth, same circumferential position and width.
  createPart('Girth_Strap', bandZ([
    [0.105,0.074,0.19,0.242],[0.175,0.089,0.187,0.242]
  ],0.012), darkDetails, {parent:body});

  // Yoke pad on withers
  createPart('Yoke_Pad', boxGeo(0.17, 0.05, 0.16), darkDetails, {
    position: [0, 0.43, 0.25],
    rotation: [15, 0, 0],
    parent: body
  });

  // Bronze terret / rein guide rings on yoke pad
  createPart('Terret_Ring_L', cylinderGeo(0.03, 0.03, 0.015, 6), bronzeMetal, {
    position: [-0.075, 0.47, 0.25],
    rotation: [0, 0, 90],
    parent: body
  });
  createPart('Terret_Ring_R', cylinderGeo(0.03, 0.03, 0.015, 6), bronzeMetal, {
    position: [0.075, 0.47, 0.25],
    rotation: [0, 0, 90],
    parent: body
  });

  // Collar bends around the chest and reaches the girth at both sides.
  // Central phalera and yoke/ring anchor coordinates remain unchanged.
  createPart('Breastcollar', breastRibbon(), darkDetails, {parent:body});

  // Decorative bronze central boss / phalera on breastcollar
  createPart('Breast_Phalera', cylinderGeo(0.055, 0.055, 0.02, 8), bronzeMetal, {
    position: [0, 0.12, 0.51],
    rotation: [90, 0, 0],
    parent: body
  });

  // --- Neck & Head Hierarchy ---
  const neck = createPivot('Neck', [0, 0.22, 0.34], body);

  // Swept neck silhouette with a curved crest and tapered throatlatch.
  // Root penetrates the chest; the poll overlaps the retained head joint.
  createPart('Neck_Lower', contour('y', [
    [-0.16,-0.055,0.103,0.11],[-0.055,-0.025,0.147,0.181],
    [0.055,0.025,0.132,0.207],[0.16,0.112,0.108,0.169],
    [0.265,0.203,0.086,0.129],[0.365,0.270,0.075,0.098],
    [0.44,0.295,0.067,0.071],[0.49,0.30,0.025,0.035]
  ],16), horseCoat, {parent:neck});
  createPart('Mane_Lower', contour('y', [
    [0.005,-0.166,0.022,0.022],[0.07,-0.166,0.026,0.035],
    [0.17,-0.061,0.025,0.04],[0.265,0.067,0.024,0.034],
    [0.365,0.162,0.022,0.033],[0.44,0.216,0.021,0.027],
    [0.48,0.255,0.016,0.02]
  ],8), darkDetails, {parent:neck});

  // Head pivot
  const head = createPivot('Head', [0, 0.40, 0.32], neck);

  // Rounded poll and forehead; broad at eyes, narrowing toward nasal bridge.
  createPart('Head_Skull', contour('z', [
    [-0.09,0.032,0.017,0.037],[-0.065,0.04,0.068,0.08],
    [-0.025,0.042,0.097,0.107],[0.035,0.035,0.102,0.112],
    [0.095,0.008,0.087,0.097],[0.145,-0.035,0.068,0.069],
    [0.175,-0.057,0.059,0.052]
  ],16), horseCoat, {parent:head});
  // Tapered lower jaw ties the cheeks into the muzzle rather than ball-like jowls.
  createPart('Head_Jaw', contour('z', [
    [-0.05,-0.025,0.043,0.031],[-0.005,-0.034,0.086,0.068],
    [0.06,-0.055,0.081,0.067],[0.13,-0.09,0.059,0.04],
    [0.22,-0.115,0.052,0.024],[0.29,-0.132,0.045,0.02]
  ]), horseCoat, {parent:head});
  createPart('Head_Muzzle', contour('z', [
    [0.092,0.002,0.073,0.081],[0.16,-0.042,0.064,0.066],
    [0.23,-0.086,0.064,0.058],[0.29,-0.111,0.071,0.053],
    [0.335,-0.12,0.067,0.044],[0.353,-0.12,0.051,0.034]
  ],12), horseCoat, {parent:head});
  createPart('Nose_Tip', contour('z', [
    [0.30,-0.128,0.058,0.034],[0.344,-0.126,0.066,0.038],
    [0.367,-0.126,0.046,0.029]
  ],12), darkDetails, {parent:head});

  // Ear root rings are buried within the skull, all rigid under Joint_Head.
  // First ring y=.081 is the exported root boundary checked during QA.
  for (const side of [-1,1]) {
    const suffix = side < 0 ? 'L' : 'R';
    createPart('Ear_' + suffix, contour('y', [
      [0,0,0.023,0.022],[0.035,0.002,0.030,0.024],
      [0.082,0.007,0.026,0.020],[0.132,0.011,0.016,0.013],
      [0.164,0.015,0.002,0.003]
    ],10), horseCoat, {position:[side*0.060,0.081,-0.021],
      rotation:[7,side*8,-side*9],parent:head});
    // Shallow inner pinna, attached in the same ear frame.
    createPart('Ear_Inner_' + suffix, contour('y', [
      [0.052,0.022,0.014,0.004],[0.085,0.027,0.017,0.004],
      [0.128,0.024,0.009,0.003],[0.149,0.020,0.001,0.002]
    ],8), darkDetails, {position:[side*0.060,0.081,-0.021],
      rotation:[7,side*8,-side*9],parent:head});
    createPart('Eye_' + suffix, sphereGeo(0.014,8,6), darkDetails, {
      position:[side*0.082,0.038,0.096],scale:[0.42,0.85,1.18],parent:head});
    createPart('Nostril_' + suffix, sphereGeo(0.018,8,4), darkDetails, {
      position:[side*0.063,-0.104,0.321],scale:[0.28,0.7,1.1],rotation:[0,side*10,-side*20],parent:head});
  }
  createPart('Forelock', contour('y', [
    [0.055,0.129,0.005,0.01],[0.10,0.109,0.018,0.018],
    [0.144,0.04,0.025,0.032],[0.154,0.01,0.015,0.02]
  ],8), darkDetails, {parent:head});

  // --- Chariot Bridle & Bit on Head ---
  createPart('Bridle_Browband', loftProfiles([
    [-0.085,0.116,0.014],[-0.055,0.135,0.033],[0,0.145,0.045],
    [0.055,0.135,0.033],[0.085,0.116,0.014]
  ].map(p=>({profile:[[-0.009,-0.005],[0.009,-0.005],[0.009,0.005],[-0.009,0.005]],
    frame:{origin:p,rotation:[0,0,-90]}}))),darkDetails,{parent:head});
  createPart('Bridle_Noseband', bandZ([
    [0.211,-0.075,0.07,0.064],[0.244,-0.092,0.071,0.064]
  ],0.011,12),darkDetails,{parent:head});
  // Bit shaft links the retained bronze mouth-corner fittings through the mouth.
  createPart('Mouth_Bit', cylinderGeo(0.007,0.007,0.18,8),bronzeMetal,{
    position:[0,-0.11,0.28],rotation:[0,0,90],parent:head});

  // Cheek straps now run continuously between retained brow studs and bit rings.
  createPart('Cheekstrap_L', cheekRibbon(-1), darkDetails, {parent:head});
  createPart('Cheekstrap_R', cheekRibbon(1), darkDetails, {parent:head});

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
    position: [-0.085, 0.116, 0.014],
    parent: head
  });
  createPart('Bridle_Stud_R', sphereGeo(0.02, 4, 3), bronzeMetal, {
    position: [0.085, 0.116, 0.014],
    parent: head
  });

  // --- Tail ---
  const tail = createPivot('Tail', [0, 0.14, -0.56], body);
  createPart('Tail_Base', contour('y',[
    [-0.18,-0.09,0.029,0.038],[-0.09,-0.055,0.043,0.049],
    [0.025,0.005,0.05,0.057]
  ],10),horseCoat,{parent:tail});
  createPart('Tail_Hair_Upper', contour('y',[
    [-0.66,-0.218,0.009,0.019],[-0.60,-0.215,0.023,0.032],
    [-0.48,-0.196,0.034,0.047],[-0.35,-0.147,0.041,0.054],
    [-0.22,-0.102,0.043,0.052],[-0.12,-0.07,0.035,0.046],
    [-0.08,-0.045,0.024,0.031]
  ],10),darkDetails,{parent:tail});

  // --- Legs Helper ---
  function buildFrontLeg(prefix, side) {
    const x = side * 0.16;
    const upper = createPivot(`Leg_F${prefix}_Upper`, [x, 0.05, 0.36], body);

    // Shoulder, elbow and forearm taper continuously to the knee joint.
    createPart(`Shoulder_F${prefix}`, contour('y', [
      [-0.46,0,0.039,0.043],[-0.37,-0.01,0.044,0.057],
      [-0.23,-0.03,0.056,0.075],[-0.10,-0.024,0.073,0.102],
      [0.01,-0.022,0.073,0.114,-side*0.009],
      [0.13,-0.042,0.036,0.068,-side*0.038],[0.18,-0.04,0.012,0.026,-side*0.047]
    ],10), horseCoat, {parent:upper});

    const lower = createPivot(`Leg_F${prefix}_Lower`, [0, -0.44, 0], upper);

    createPart(`Knee_F${prefix}`, sphereGeo(0.051,10,6), horseCoat, {
      position:[0,-0.005,0.002],scale:[0.95,1.14,1.04],parent:lower});
    createPart(`Cannon_F${prefix}`, contour('y', [
      [-0.405,0,0.029,0.032],[-0.355,0,0.034,0.035],
      [-0.23,-0.004,0.026,0.029],[-0.075,-0.002,0.03,0.034],
      [-0.01,0,0.036,0.04]
    ],8), horseCoat, {parent:lower});

    const hoof = createPivot(`Leg_F${prefix}_Hoof`, [0, -0.42, 0], lower);

    createPart(`Fetlock_F${prefix}`, contour('y', [
      [-0.035,0.012,0.035,0.043],[0.012,0.008,0.039,0.048],
      [0.063,-0.005,0.03,0.033]
    ],8), horseCoat, {parent:hoof});
    createPart(`Hoof_F${prefix}`, contour('y', [
      [-0.14,0.024,0.065,0.075],[-0.118,0.024,0.065,0.077],
      [-0.026,0.005,0.045,0.052],[-0.005,0,0.035,0.038]
    ],10), darkDetails, {parent:hoof});
  }


  function buildHindLeg(prefix, side) {
    const x = side * 0.16;
    const upper = createPivot(`Leg_B${prefix}_Upper`, [x, 0.08, -0.38], body);

    // Forward stifle bulge flows back into a slender hock.
    createPart(`Thigh_B${prefix}`, contour('y', [
      [-0.478,-0.08,0.038,0.043],[-0.365,-0.064,0.048,0.062],
      [-0.24,0.009,0.062,0.093],[-0.13,0.049,0.08,0.122],
      [0.005,0.004,0.086,0.15],[0.13,-0.038,0.059,0.103],
      [0.20,-0.04,0.026,0.046]
    ],12), horseCoat, {parent:upper});

    const lower = createPivot(`Leg_B${prefix}_Lower`, [0, -0.45, -0.08], upper);

    createPart(`Hock_B${prefix}`, sphereGeo(0.051,10,6), horseCoat, {
      position:[0,0,-0.018],scale:[0.85,1.25,1.18],parent:lower});
    createPart(`Cannon_B${prefix}`, contour('y', [
      [-0.414,0.06,0.027,0.031],[-0.35,0.047,0.033,0.034],
      [-0.23,0.029,0.025,0.029],[-0.08,0.004,0.03,0.036],
      [0,-0.007,0.038,0.043]
    ],8), horseCoat, {parent:lower});

    const hoof = createPivot(`Leg_B${prefix}_Hoof`, [0, -0.42, 0.06], lower);

    createPart(`Fetlock_B${prefix}`, contour('y', [
      [-0.035,0.009,0.035,0.042],[0.015,0.003,0.038,0.046],
      [0.065,-0.011,0.029,0.033]
    ],8), horseCoat, {parent:hoof});
    createPart(`Hoof_B${prefix}`, contour('y', [
      [-0.16,0.021,0.064,0.073],[-0.137,0.021,0.064,0.075],
      [-0.025,0.003,0.044,0.051],[-0.003,0,0.035,0.038]
    ],10), darkDetails, {parent:hoof});
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
