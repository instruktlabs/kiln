// A bunker door frame delivered as a modular kit piece: the end-to-end fixture of the
// game delivery contract (docs/delivery-contract.md).
//
// It is one kit.module with two ports, a box collider, three anchors, a two-tier
// defineLod plus an impostor, baked _EDGE/_CAVITY, a packed atlas with two procedural
// regions, a triangle budget, a required solid and repeated bolts marked for
// instancing. Render it with:
//
//   kiln render src/__tests__/fixtures/bunker-door-frame.kiln.js --out frame.glb
//
// Kiln's frame is +X forward, +Y up, +Z right. Everything sits on Y=0.

const meta = { name: 'BunkerDoorFrame', category: 'prop' };

const W = 3.2; // module width along X
const D = 0.6; // wall depth along Z
const H = 3.2; // module height
const OPEN_W = 1.8; // door opening width
const OPEN_H = 2.4; // door opening height

async function build() {
  const root = createRoot('BunkerDoorFrame');
  defineModule(root, { footprint: [W, D], height: H, snapAxis: 'x', origin: 'center' });
  port('west', { parent: root, position: [-W / 2, 0, 0], rotation: [0, 180, 0] });
  port('east', { parent: root, position: [W / 2, 0, 0] });
  // LOD2 keeps the shared bolts beside the card, so its budget counts them.
  defineBudget({ triangles: { LOD0: 3000, LOD1: 800, LOD2: 100 }, draws: 12 });

  // Two procedural regions packed into one sheet; no rectangle is laid out by hand.
  const atlas = await textureAtlas({
    schemaVersion: 1,
    usage: 'albedo',
    pack: { edge: 1024, gutter: 4 },
    regions: [
      {
        name: 'concrete',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 128,
            height: 128,
            background: [118, 116, 110, 255],
            operations: [
              { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 60, width: 128, height: 4 }, rgba: [92, 90, 86, 255] },
              { op: 'paint', shape: { kind: 'ellipse', x: 20, y: 18, width: 30, height: 16 }, rgba: [104, 101, 95, 255] },
            ],
          },
        },
      },
      {
        name: 'steel',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 64,
            height: 64,
            background: [96, 100, 106, 255],
            operations: [
              { op: 'paint', shape: { kind: 'line', from: [0, 8], to: [64, 8], width: 2 }, rgba: [128, 72, 40, 255] },
            ],
          },
        },
      },
    ],
  });
  const concrete = pbrMaterial({ albedo: atlas, roughness: 0.92, metalness: 0 });
  const steel = pbrMaterial({ albedo: atlas, roughness: 0.5, metalness: 0.7 });
  const uv = (geometry, region) =>
    remapUVToAtlas(geometry, atlas, region, { inputOrigin: 'bottom-left', mode: 'content-boundary' });

  // The frame: a U outline extruded through the wall, a closed solid with bevelled edges.
  const outline = [
    [-W / 2, 0],
    [-OPEN_W / 2, 0],
    [-OPEN_W / 2, OPEN_H],
    [OPEN_W / 2, OPEN_H],
    [OPEN_W / 2, 0],
    [W / 2, 0],
    [W / 2, H],
    [-W / 2, H],
  ];
  // extrudeProfile writes no UV0; a box projection in the geometry frame gives unit UVs.
  const frameGeo = projectUV(await extrudeProfile(outline, { depth: D, axis: 'z', bevel: 0.04 }), {
    projection: 'box',
  });
  const tiers = ['Frame_LOD0', 'Frame_LOD1', 'Frame_LOD2'].map((name) => {
    const group = new THREE.Group();
    group.name = name;
    root.add(group);
    return group;
  });
  const frame = createPart('Frame', uv(frameGeo, 'concrete'), concrete, { parent: tiers[0] });
  requireSolid(frame);

  // Steel jamb plates on both faces of the opening, and the lintel beam.
  for (const side of [-1, 1]) {
    createPart(`Jamb_${side < 0 ? 'L' : 'R'}`, uv(boxGeo(0.08, OPEN_H, D + 0.04), 'steel'), steel, {
      parent: tiers[0],
      position: [side * (OPEN_W / 2 - 0.04), OPEN_H / 2, 0],
    });
  }
  createPart('Lintel', uv(boxGeo(OPEN_W, 0.12, D + 0.04), 'steel'), steel, {
    parent: tiers[0],
    position: [0, OPEN_H - 0.06, 0],
  });

  // LOD1: the frame as three boxes; LOD2: a single card impostor.
  createPart('Frame_Low_L', uv(boxGeo((W - OPEN_W) / 2, H, D), 'concrete'), concrete, {
    parent: tiers[1],
    position: [-(W + OPEN_W) / 4, H / 2, 0],
  });
  createPart('Frame_Low_R', uv(boxGeo((W - OPEN_W) / 2, H, D), 'concrete'), concrete, {
    parent: tiers[1],
    position: [(W + OPEN_W) / 4, H / 2, 0],
  });
  createPart('Frame_Low_Top', uv(boxGeo(OPEN_W, H - OPEN_H, D), 'concrete'), concrete, {
    parent: tiers[1],
    position: [0, (H + OPEN_H) / 2, 0],
  });
  createPart('Frame_Card', uv(planeGeo(W, H), 'concrete'), concrete, {
    parent: tiers[2],
    position: [0, H / 2, D / 2],
  });
  defineLod(tiers, { screenCoverage: [0.3, 0.05, 0], impostor: true });

  // Six identical bolt heads share one geometry and material, outside the LOD set so every
  // tier keeps them; the three.js runtime export turns them into one instanced mesh.
  const bolts = new THREE.Group();
  bolts.name = 'Bolts';
  root.add(bolts);
  const boltGeo = uv(boxGeo(0.06, 0.06, 0.03), 'steel');
  for (let i = 0; i < 6; i++)
    createPart('Bolt_' + i, boltGeo, steel, {
      parent: bolts,
      position: [-1.2 + i * 0.48, OPEN_H + 0.3, D / 2 + 0.015],
    });
  repeatInstances(bolts);

  // One collider for the frame's solid mass; anchors where gameplay attaches.
  colliderBox([W, H, D], { id: 'frame', parent: root, position: [0, H / 2, 0] });
  anchor('door', 'main', { parent: root, position: [0, 0, 0] });
  anchor('light', 'lintel', { parent: root, position: [0, H - 0.2, D / 2 + 0.05] });
  anchor('decal', 'stencil', { parent: root, position: [-1.2, 2.6, D / 2 + 0.01] });

  bakeSurfaceAttributes(tiers[0], { edge: { thresholdDegrees: 35 }, cavity: { rays: 16 } });
  return root;
}
