// Benchmark (after): seahorse silhouette (lateral reference).
// Authored by: cloud-agent, organic benchmark, after lane.

const meta = { name: 'Seahorse', category: 'prop', role: 'prop' };

async function build() {
  const root = createRoot('Seahorse');
  const H = 0.48;
  const bodyMat = gameMaterial(0xd4a04a, { roughness: 0.55 });
  const finMat = gameMaterial(0xe8c878, { roughness: 0.42, metalness: 0.02 });

  const tailSpiral = spiralPath({
    center: [0, 0.046, 0.042],
    radius: H * 0.068,
    rise: H * 0.2,
    turns: 1.78,
    forward: [0, 0, 1],
    samples: 42,
  });
  const tailRadii = tailSpiral.map((_, i, a) => {
    const t = i / (a.length - 1);
    return Math.max(0.0035, 0.016 * (1 - t * 0.92));
  });
  const tailGeo = taperedTube(tailSpiral, tailRadii, { radialSegments: 22, creaseAngle: 180 });
  createPart('Tail', creaseNormals(tailGeo, { angle: 48 }), bodyMat, {
    parent: root,
    scale: [0.5, 1, 1],
  });

  const trunkCtrl = [
    tailSpiral[tailSpiral.length - 1],
    [0, 0.12, 0.028],
    [0, 0.19, 0.046],
    [0, 0.25, 0.062],
    [0, 0.3, 0.05],
    [-0.004, 0.34, 0.018],
    [-0.003, 0.362, -0.006],
    [-0.002, 0.376, -0.016],
  ];
  const spinePath = catmullRomPath(trunkCtrl, 8);
  const ring = (i) => 1 + 0.055 * Math.sin(i * 1.15);

  const spineRadii = spinePath.map((_, i, a) => {
    const t = i / (a.length - 1);
    const belly = t > 0.32 && t < 0.78 ? 0.042 * Math.sin(((t - 0.32) / 0.46) * Math.PI) : 0;
    const neck = t > 0.82 ? 0.028 - (t - 0.82) * 0.07 : 0;
    const core = 0.014 + (1 - t) * 0.008;
    return Math.max(0.008, (core + belly + neck) * ring(i));
  });

  const bodyGeo = taperedTube(spinePath, spineRadii, { radialSegments: 28, creaseAngle: 180 });
  const bodyScale = [0.48, 1, 1];

  function spineAtY(targetY) {
    let idx = 0;
    for (let i = 1; i < spinePath.length; i++) {
      if (Math.abs(spinePath[i][1] - targetY) < Math.abs(spinePath[idx][1] - targetY)) idx = i;
    }
    return { point: spinePath[idx], radius: spineRadii[idx] };
  }

  const finReach = 0.026;
  const finProfile = [];
  const finSegs = 10;
  for (let i = 0; i <= finSegs; i++) {
    const a = (i / finSegs) * Math.PI;
    const px = Math.cos(a) * finReach * 0.52;
    const py = Math.sin(a) * finReach - (i === 0 || i === finSegs ? 0.008 : 0);
    finProfile.push([px, py]);
  }

  const finYs = [0.238, 0.268, 0.298, 0.318];
  const finPath = finYs.map((y) => {
    const { point, radius } = spineAtY(y);
    return [point[0], point[1] + radius - 0.006, point[2]];
  });
  const dorsalGeo = sweepProfile(finProfile, catmullRomPath(finPath, 3), {
    cap: true,
    creaseAngle: 68,
    up: [0, 0, 1],
  });
  const bodyPart = createPart('BodyMesh', creaseNormals(bodyGeo, { angle: 34 }), bodyMat, {
    scale: bodyScale,
  });
  const finPart = createPart('DorsalMesh', creaseNormals(dorsalGeo, { angle: 58 }), finMat, {
    scale: bodyScale,
  });
  const bodyWithFin = await boolUnion('Body', bodyPart, finPart);
  root.add(bodyWithFin);

  const neckTop = spinePath[spinePath.length - 1];
  const headLen = H / 5;

  const headBendPath = catmullRomPath(
    [
      neckTop,
      [0, 0.371, 0.008],
      [0, 0.36, 0.022],
      [0, 0.35, 0.036],
      [0, 0.346, 0.042],
    ],
    8,
  );
  const headBendRadii = headBendPath.map((_, i, a) => {
    const t = i / (a.length - 1);
    return headLen * (0.37 - t * 0.05);
  });
  const headGeo = taperedTube(headBendPath, headBendRadii, { radialSegments: 36, creaseAngle: 180 });
  createPart('Head', creaseNormals(headGeo, { angle: 88 }), bodyMat, {
    parent: root,
    scale: [0.5, 1, 1],
  });

  const snoutPath = catmullRomPath(
    [
      [0, 0.33, 0.052],
      [0, 0.312, 0.074],
      [0, 0.29, 0.094],
      [0, 0.266, 0.108],
      [0, 0.244, 0.116],
      [0, 0.228, 0.118],
      [0, 0.218, 0.116],
      [0, 0.212, 0.112],
    ],
    8,
  );
  const snoutRadii = snoutPath.map((_, i, a) => {
    const t = i / (a.length - 1);
    const base = headLen * 0.4;
    if (t < 0.06) return base * 0.95;
    if (t > 0.82) return headLen * 0.46;
    return Math.max(0.009, base * (1 - (t - 0.06) * 0.58));
  });
  const snoutGeo = taperedTube(snoutPath, snoutRadii, { radialSegments: 28, creaseAngle: 180 });
  createPart('Snout', creaseNormals(snoutGeo, { angle: 90 }), bodyMat, {
    parent: root,
    scale: [0.5, 1, 1],
  });

  const crown = [0, 0.358, 0.018];
  for (const [name, ox, oy, oz, r] of [
    ['Coronet_L', -0.01, 0.014, -0.006, 0.008],
    ['Coronet_C', 0, 0.02, 0, 0.012],
    ['Coronet_R', 0.01, 0.014, 0.006, 0.008],
  ]) {
    createPart(name, sphereGeo(r, 10, 8), bodyMat, {
      position: [crown[0] + ox, crown[1] + oy, crown[2] + oz],
      parent: root,
    });
  }

  createPart('Eye_L', sphereGeo(0.0075, 12, 10), bodyMat, {
    position: [0.015, 0.352, 0.03],
    parent: root,
  });
  createPart('Eye_R', sphereGeo(0.0075, 12, 10), bodyMat, {
    position: [-0.015, 0.352, 0.03],
    parent: root,
  });

  function pectoralFin(name, side) {
    const base = [side * 0.016, 0.348, 0.018];
    const pecPath = catmullRomPath([base, [side * 0.028, 0.344, 0.022]], 2);
    const fin = sweepProfile(
      [[0, 0], [side * 0.01, 0.001], [side * 0.014, 0.008], [0, 0.01]],
      pecPath,
      {
        cap: 'end',
        creaseAngle: 58,
        scale: pecPath.map((_, i) => (i === 0 ? [0.12, 1] : [1, 1])),
      },
    );
    createPart(name, fin, finMat, { parent: root });
  }
  pectoralFin('Pectoral_L', 1);
  pectoralFin('Pectoral_R', -1);

  return root;
}
