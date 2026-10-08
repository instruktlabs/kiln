// Authored by: cloud-agent (FaberVi/kiln organic showcase).

const meta = { name: 'RockCluster', category: 'prop', role: 'prop' };

async function build() {
  const root = createRoot('RockCluster');
  const stone = gameMaterial(0x6a6660, { roughness: 0.95 });

  const rocks = [
    { pos: [0, 0, 0.02], half: [0.16, 0.11, 0.14], seed: 17, bury: 0.42 },
    { pos: [0.1, 0, 0.05], half: [0.1, 0.075, 0.09], seed: 7, bury: 0.38 },
    { pos: [-0.1, 0, -0.045], half: [0.11, 0.07, 0.1], seed: 11, bury: 0.4 },
    { pos: [-0.035, 0, 0.075], half: [0.07, 0.055, 0.065], seed: 19, bury: 0.35 },
  ];
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    const hy = r.half[1];
    const geo = await rockBoulder({ halfExtents: r.half, seed: r.seed, facetingAngle: 28 });
    createPart(`Rock_${i}`, geo, stone, {
      position: [r.pos[0], hy * (1 - r.bury), r.pos[2]],
      rotation: [(r.seed % 5) * 7, (r.seed % 7) * 11, (r.seed % 3) * 13],
      parent: root,
    });
  }
  return root;
}
