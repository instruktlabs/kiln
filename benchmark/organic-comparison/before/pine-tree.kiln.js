// Benchmark (before): legacy primitives only.
// Authored by: cloud-agent, organic benchmark, before lane.

const meta = { name: 'PineTree', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('PineTree');
  const bark = gameMaterial(0x4a3528, { roughness: 0.9 });
  const needle = gameMaterial(0x2f5a38, { roughness: 0.85 });

  createPart('Trunk', cylinderGeo(0.08, 0.1, 0.55, 8), bark, { position: [0, 0.275, 0], parent: root });

  const tiers = [
    { y: 0.55, r: 0.38, h: 0.22 },
    { y: 0.72, r: 0.3, h: 0.2 },
    { y: 0.86, r: 0.22, h: 0.18 },
    { y: 0.98, r: 0.14, h: 0.14 },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    createPart(`Canopy_${i}`, coneGeo(t.r, t.h, 8), needle, { position: [0, t.y, 0], parent: root });
  }

  return root;
}
