// Benchmark (before): legacy primitives only — same brief as after/stylised-newt.kiln.js
// Authored by: cloud-agent, organic benchmark, before lane.

const meta = { name: 'StylisedNewt', category: 'prop', role: 'prop' };

async function build() {
  const root = createRoot('StylisedNewt');
  const skin = gameMaterial(0x3d6b4f, { roughness: 0.72 });
  const belly = gameMaterial(0x8a9a6b, { roughness: 0.8 });

  createPart('Head', sphereGeo(0.09, 16, 12), skin, { position: [0.38, 0.07, 0], parent: root });
  createPart('Snout', sphereGeo(0.05, 12, 8), skin, { position: [0.46, 0.06, 0], parent: root });
  createPart('Torso', sphereGeo(0.11, 16, 12), skin, { position: [0.22, 0.06, 0], parent: root });
  createPart('Hind', sphereGeo(0.1, 16, 12), skin, { position: [0.05, 0.055, 0], parent: root });
  createPart('BellyPlate', sphereGeo(0.08, 10, 6), belly, {
    position: [0.24, 0.03, 0],
    scale: [1.2, 0.35, 0.9],
    parent: root,
  });

  const tail = pipeAlongPath(
    [[-0.02, 0.055, 0], [-0.12, 0.07, 0], [-0.22, 0.1, 0], [-0.32, 0.12, 0.02]],
    0.035,
    { tubularSegments: 20, radialSegments: 10 },
  );
  createPart('Tail', tail, skin, { parent: root });

  for (const [name, x, z] of [
    ['Leg_FL', 0.28, 0.05],
    ['Leg_FR', 0.28, -0.05],
    ['Leg_BL', 0.1, 0.055],
    ['Leg_BR', 0.1, -0.055],
  ]) {
    createPart(name, cylinderGeo(0.018, 0.018, 0.05, 6), skin, {
      position: [x, 0.025, z],
      parent: root,
    });
  }

  return root;
}
