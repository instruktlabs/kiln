// Authored by: cloud-agent (FaberVi/kiln organic showcase).

const meta = { name: 'StylisedNewt', category: 'prop', role: 'prop' };

async function build() {
  const root = createRoot('StylisedNewt');
  const skin = gameMaterial(0x3d6b4f, { roughness: 0.72 });
  const belly = gameMaterial(0x8a9a6b, { roughness: 0.8 });
  const eye = gameMaterial(0x1a1a1a, { roughness: 0.3 });

  const bodyGeo = await metaballSurface(
    [
      { center: [0.02, 0.061, 0], radius: 0.095 },
      { center: [0.08, 0.06, 0], radius: 0.098 },
      { center: [0.2, 0.064, 0], radius: 0.105 },
      { center: [0.34, 0.066, 0], radius: 0.098 },
      { center: [0.44, 0.064, 0], radius: 0.042 },
    ],
    {
      bounds: { min: [-0.06, -0.02, -0.15], max: [0.5, 0.14, 0.15] },
      edgeLength: 0.038,
      blend: 0.072,
    },
  );
  createPart('Torso', creaseNormals(bodyGeo, { angle: 50 }), skin, { parent: root });

  const headGeo = await metaballSurface(
    [
      { center: [0.46, 0.07, 0], radius: 0.072 },
      { center: [0.52, 0.068, 0], radius: 0.055 },
      { center: [0.56, 0.064, 0], radius: 0.032 },
    ],
    {
      bounds: { min: [0.38, 0.02, -0.12], max: [0.6, 0.12, 0.12] },
      edgeLength: 0.032,
      blend: 0.055,
    },
  );
  createPart('Head', creaseNormals(headGeo, { angle: 48 }), skin, {
    parent: root,
    scale: [1, 0.72, 1.22],
  });

  createPart('Eye_L', sphereGeo(0.016, 12, 10), eye, { position: [0.51, 0.092, 0.042], parent: root });
  createPart('Eye_R', sphereGeo(0.016, 12, 10), eye, { position: [0.51, 0.092, -0.042], parent: root });

  const tailCtrl = [
    [0.085, 0.061, 0],
    [0.055, 0.062, 0],
    [0.035, 0.063, 0],
    [0.01, 0.064, 0.002],
    [-0.08, 0.067, 0.008],
    [-0.18, 0.071, 0.014],
    [-0.28, 0.073, 0.018],
    [-0.38, 0.068, 0.02],
    [-0.46, 0.058, 0.021],
    [-0.52, 0.048, 0.02],
  ];
  const tailPath = catmullRomPath(tailCtrl, 12);
  const hipRadius = 0.106;
  const tailRadii = tailPath.map((_, i, a) => {
    const t = i / (a.length - 1);
    const s = Math.max(0.02, (1 - t) ** 0.68);
    return hipRadius * s;
  });
  createPart(
    'Tail',
    creaseNormals(taperedTube(tailPath, tailRadii, { radialSegments: 18 }), { angle: 52 }),
    skin,
    { parent: root, scale: [1, 0.62, 1.38] },
  );

  function salamanderLeg(name, hipX, hipZ, side) {
    const hip = [hipX, 0.052, hipZ];
    const elbow = [hipX - 0.012, 0.034, hipZ + side * 0.042];
    const knee = [hipX - 0.022, 0.018, hipZ + side * 0.055];
    const ankle = [hipX - 0.028, 0.01, hipZ + side * 0.062];
    const foot = [hipX - 0.03, 0.006, hipZ + side * 0.068];

    const upperPath = catmullRomPath([hip, elbow, knee], 8);
    const upperR = upperPath.map((_, i, arr) => 0.02 * (1 - i / (arr.length - 1) * 0.15) + 0.014);
    createPart(
      `${name}_Upper`,
      creaseNormals(taperedTube(upperPath, upperR, { radialSegments: 14 }), { angle: 42 }),
      skin,
      { parent: root },
    );

    const lowerPath = catmullRomPath([knee, ankle, foot], 8);
    const lowerR = lowerPath.map((_, i, arr) => 0.016 * (1 - i / (arr.length - 1) * 0.35) + 0.009);
    createPart(
      `${name}_Lower`,
      creaseNormals(taperedTube(lowerPath, lowerR, { radialSegments: 12 }), { angle: 42 }),
      skin,
      { parent: root },
    );

    createPart(`${name}_Foot`, sphereGeo(0.022, 12, 10), skin, {
      position: foot,
      scale: [1.15, 0.55, 1.35],
      parent: root,
    });
    for (let t = 0; t < 3; t++) {
      const toe = [foot[0] - 0.012, foot[1], foot[2] + side * (0.014 + t * 0.01)];
      createPart(`${name}_Toe_${t}`, taperedTube([foot, toe], [0.009, 0.004], { radialSegments: 6 }), skin, {
        parent: root,
      });
    }
  }

  salamanderLeg('Leg_FL', 0.32, 0.058, 1);
  salamanderLeg('Leg_FR', 0.32, -0.058, -1);
  salamanderLeg('Leg_BL', 0.15, 0.062, 1);
  salamanderLeg('Leg_BR', 0.15, -0.062, -1);

  createPart('Belly', sphereGeo(0.078, 16, 12), belly, {
    position: [0.26, 0.03, 0],
    scale: [1.45, 0.32, 1.1],
    parent: root,
  });

  return root;
}
