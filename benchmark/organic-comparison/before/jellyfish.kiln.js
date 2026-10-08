// Benchmark (before): legacy primitives only.
// Authored by: cloud-agent, organic benchmark, before lane.

const meta = { name: 'Jellyfish', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('Jellyfish');
  const bellMat = gameMaterial(0xc8b8ff, { roughness: 0.35, metalness: 0.05 });
  const tentMat = gameMaterial(0xe8e0ff, { roughness: 0.5 });

  createPart('Bell', sphereGeo(0.11, 20, 14), bellMat, {
    position: [0, 0.42, 0],
    scale: [1, 0.65, 1],
    parent: root,
  });

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.08;
    const z = Math.sin(a) * 0.08;
    const tent = pipeAlongPath([[x, 0.36, z], [x * 1.1, 0.22, z * 1.1], [x * 0.9, 0.12, z * 0.9]], 0.008, {
      tubularSegments: 16,
      radialSegments: 8,
    });
    createPart(`Tentacle_${i}`, tent, tentMat, { parent: root });
  }
  return root;
}
