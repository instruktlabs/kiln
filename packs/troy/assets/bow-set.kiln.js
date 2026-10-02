const meta = {
  name: 'Bow, arrows and quiver',
  role: 'prop',
};

async function build() {
  const root = createRoot('BowSet');

  // Pinned pack materials for Project Troy
  const timberMat = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy Timber',
    baseColor: 0x6b4a2e,
    roughness: 0.8,
    metalness: 0.05,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' },
    },
  });

  const bronzeMat = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy Bronze',
    baseColor: 0xb08d57,
    roughness: 0.35,
    metalness: 0.85,
    textures: {
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
    },
  });

  // --- BOW ---
  // The bow node origin is centered at the hand grip [0,0,0] for hand parenting.
  // Angled around Y so both limb width and recurve curve are readable in front/side/3-4 views.
  const bowNode = createPivot('Bow', [-0.10, 0.602, 0.04], root);
  bowNode.rotation.y = -25 * Math.PI / 180;

  // Hand grip: exactly 0.03 m radius, 0.11 m long, centered at [0,0,0]
  const gripGeo = cylinderGeo(0.03, 0.03, 0.11, 12);
  createPart('Bow_Grip', gripGeo, timberMat, { position: [0, 0, 0], parent: bowNode });

  // Bronze ferrule rings at grip ends
  const ferruleGeo = cylinderGeo(0.032, 0.032, 0.012, 12);
  createPart('Bow_Grip_TopRing', ferruleGeo, bronzeMat, { position: [0, 0.055, 0], parent: bowNode });
  createPart('Bow_Grip_BottomRing', ferruleGeo, bronzeMat, { position: [0, -0.055, 0], parent: bowNode });

  // Recurved limbs using sweepProfile
  const limbProfile = [
    [-0.018, -0.008],
    [ 0.018, -0.008],
    [ 0.020, -0.004],
    [ 0.020,  0.004],
    [ 0.018,  0.008],
    [-0.018,  0.008],
    [-0.020,  0.004],
    [-0.020, -0.004],
  ];
  const limbPath = [
    [0, 0.055, 0.000],
    [0, 0.180, 0.035],
    [0, 0.320, 0.025],
    [0, 0.440, -0.020],
    [0, 0.520, -0.070],
    [0, 0.575, -0.090],
  ];
  const limbScale = [
    [1.0, 1.0],
    [0.90, 0.85],
    [0.78, 0.72],
    [0.65, 0.60],
    [0.52, 0.50],
    [0.40, 0.40],
  ];

  const limbGeo = sweepProfile(limbProfile, limbPath, { cap: true, scale: limbScale });

  // Upper limb
  createPart('Bow_Limb_Upper', limbGeo, timberMat, { position: [0, 0, 0], parent: bowNode });

  // Lower limb (rotated 180 around Z for exact symmetric downward recurve)
  createPart('Bow_Limb_Lower', limbGeo, timberMat, { position: [0, 0, 0], rotation: [0, 0, 180], parent: bowNode });

  // Bronze nocks at tips
  const nockGeo = coneGeo(0.010, 0.035, 8);
  createPart('Bow_Nock_Top', nockGeo, bronzeMat, { position: [0, 0.585, -0.092], rotation: [15, 0, 0], parent: bowNode });
  createPart('Bow_Nock_Bottom', nockGeo, bronzeMat, { position: [0, -0.585, -0.092], rotation: [-15, 0, 180], parent: bowNode });

  // Bowstring (spans between nocks at Z = -0.09)
  const stringGeo = cylinderGeo(0.0025, 0.0025, 1.15, 6);
  createPart('Bow_String', stringGeo, bronzeMat, { position: [0, 0, -0.090], parent: bowNode });

  // --- QUIVER ---
  const quiverNode = createPivot('Quiver', [0.08, 0, -0.04], root);

  // Quiver main body: height 0.56 m so top rim forms an open lip around the mouth
  const quiverBodyGeo = cylinderGeo(0.062, 0.055, 0.56, 12);
  createPart('Quiver_Body', quiverBodyGeo, timberMat, { position: [0, 0.28, 0], parent: quiverNode });

  // Bronze reinforcement bands
  const baseCapGeo = cylinderGeo(0.058, 0.058, 0.04, 12);
  createPart('Quiver_BaseCap', baseCapGeo, bronzeMat, { position: [0, 0.02, 0], parent: quiverNode });

  // Hollow bronze rim collar at mouth using lathe
  const rimProfile = [
    [0.060, -0.03],
    [0.068, -0.03],
    [0.068,  0.03],
    [0.060,  0.03],
    [0.060, -0.03],
  ];
  const topRimGeo = lathe(rimProfile, 12);
  createPart('Quiver_TopRim', topRimGeo, bronzeMat, { position: [0, 0.59, 0], parent: quiverNode });

  const midBandGeo = cylinderGeo(0.061, 0.061, 0.025, 12);
  createPart('Quiver_MidBand', midBandGeo, bronzeMat, { position: [0, 0.33, 0], parent: quiverNode });

  // Quiver rings & strap (hugs the quiver body closely)
  const ringGeo = torusGeo(0.016, 0.003, 6, 8);
  createPart('Quiver_Ring_Top', ringGeo, bronzeMat, { position: [0.068, 0.55, 0], rotation: [0, 90, 0], parent: quiverNode });
  createPart('Quiver_Ring_Bottom', ringGeo, bronzeMat, { position: [0.063, 0.33, 0], rotation: [0, 90, 0], parent: quiverNode });

  const strapPath = [[0.066, 0.55, 0], [0.082, 0.44, 0], [0.061, 0.33, 0]];
  const strapGeo = pipeAlongPath(strapPath, 0.007, { bendRadius: 0.03, tubularSegments: 12, radialSegments: 6 });
  createPart('Quiver_Strap', strapGeo, bronzeMat, { parent: quiverNode });

  // Interior cavity floor recessed inside the mouth
  const interiorGeo = cylinderGeo(0.059, 0.059, 0.008, 12);
  createPart('Quiver_Interior', interiorGeo, bronzeMat, { position: [0, 0.555, 0], parent: quiverNode });

  // --- THREE ARROWS ---
  const shaftGeo = cylinderGeo(0.0045, 0.0045, 0.72, 6);
  const headGeo = coneGeo(0.012, 0.04, 4);
  const nockEndGeo = cylinderGeo(0.005, 0.005, 0.015, 6);
  const vaneGeo = boxGeo(0.0015, 0.08, 0.020);

  function makeArrow(name, parent, pos, rot) {
    const arrowNode = createPivot(name, pos, parent);
    if (rot) {
      arrowNode.rotation.x = rot[0] * Math.PI / 180;
      arrowNode.rotation.y = rot[1] * Math.PI / 180;
      arrowNode.rotation.z = rot[2] * Math.PI / 180;
    }
    createPart(name + '_Shaft', shaftGeo, timberMat, { position: [0, 0, 0], parent: arrowNode });
    createPart(name + '_Head', headGeo, bronzeMat, { position: [0, -0.37, 0], rotation: [0, 0, 180], parent: arrowNode });
    createPart(name + '_Nock', nockEndGeo, bronzeMat, { position: [0, 0.365, 0], parent: arrowNode });

    for (let i = 0; i < 3; i++) {
      const angle = i * 120;
      const rad = angle * Math.PI / 180;
      const r = 0.012;
      const vx = r * Math.sin(rad);
      const vz = r * Math.cos(rad);
      createPart(name + '_Vane_' + i, vaneGeo, bronzeMat, { position: [vx, 0.310, vz], rotation: [0, angle, 0], parent: arrowNode });
    }
    return arrowNode;
  }

  makeArrow('Arrow_1', quiverNode, [0.00, 0.42, 0.00], [0, 0, 0]);
  makeArrow('Arrow_2', quiverNode, [-0.025, 0.44, -0.015], [6, 20, -5]);
  makeArrow('Arrow_3', quiverNode, [0.022, 0.40, 0.018], [-5, -25, 6]);

  return root;
}
