// Benchmark (before): legacy primitives only.
// Authored by: cloud-agent, organic benchmark, before lane.

const meta = { name: 'RockCluster', category: 'prop', role: 'prop' };

function build() {
  const root = createRoot('RockCluster');
  const stone = gameMaterial(0x6a6660, { roughness: 0.95 });

  const rocks = [
    { pos: [0, 0.11, 0], scale: [0.32, 0.26, 0.3], r: 0.2 },
    { pos: [0.1, 0.09, 0.05], scale: [0.2, 0.16, 0.18], r: 0.14 },
    { pos: [-0.1, 0.08, -0.04], scale: [0.18, 0.14, 0.2], r: 0.12 },
    { pos: [-0.03, 0.06, 0.08], scale: [0.12, 0.1, 0.11], r: 0.09 },
    { pos: [0.07, 0.05, -0.08], scale: [0.11, 0.09, 0.1], r: 0.08 },
  ];
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    createPart(`Rock_${i}`, sphereGeo(r.r, 20, 16), stone, {
      position: r.pos,
      scale: r.scale,
      parent: root,
    });
  }
  return root;
}
