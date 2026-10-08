// Authored by: cloud-agent (FaberVi/kiln organic showcase).

const meta = { name: 'PineTree', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('PineTree');
  const bark = gameMaterial(0x4a3528, { roughness: 0.9 });
  const needle = gameMaterial(0x2f5a38, { roughness: 0.85 });

  const trunkPath = catmullRomPath([[0, 0, 0], [0.01, 0.25, 0], [0, 0.5, -0.01], [0, 0.55, 0]], 8);
  const trunkR = trunkPath.map((_, i, a) => 0.09 - (i / (a.length - 1)) * 0.02);
  createPart('Trunk', taperedTube(trunkPath, trunkR, { radialSegments: 14 }), bark, { parent: root });

  const tiers = [
    { y: 0.55, r: 0.38, h: 0.22 },
    { y: 0.72, r: 0.3, h: 0.2 },
    { y: 0.86, r: 0.22, h: 0.18 },
    { y: 0.98, r: 0.14, h: 0.14 },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    createPart(`Canopy_${i}`, coneGeo(t.r, t.h, 20), needle, { position: [0, t.y, 0], parent: root });
  }

  return root;
}
