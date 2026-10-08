// Benchmark (before): legacy primitives only.
// Authored by: cloud-agent, organic benchmark, before lane.

const meta = { name: 'Seahorse', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('Seahorse');
  const bodyMat = gameMaterial(0xd4a04a, { roughness: 0.55 });
  const finMat = gameMaterial(0xe8c878, { roughness: 0.6 });

  const spine = pipeAlongPath(
    [[0, 0.05, 0], [0.02, 0.2, 0], [0.05, 0.32, 0], [0.02, 0.42, 0], [-0.02, 0.48, 0]],
    0.04,
    { tubularSegments: 24, radialSegments: 10 },
  );
  createPart('Body', spine, bodyMat, { parent: root });

  createPart('Head', sphereGeo(0.05, 10, 8), bodyMat, { position: [0.03, 0.46, 0], parent: root });
  createPart('Snout', cylinderGeo(0.012, 0.012, 0.08, 6), bodyMat, {
    position: [0.1, 0.47, 0],
    rotation: [0, 0, -12],
    parent: root,
  });
  createPart('DorsalFin', boxGeo(0.02, 0.12, 0.06), finMat, {
    position: [-0.04, 0.3, 0],
    rotation: [0, 0, 18],
    parent: root,
  });
  return root;
}
