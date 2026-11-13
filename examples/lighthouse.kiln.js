// Authored by: opencode-go/muse-spark-1.3-contributor, via opencode.
//
// Written by the model itself through the Kiln MCP tools: it wrote the
// program, rendered it, looked at its own six-view contact sheet, and
// revised. The original geometry was authored by that model.
// Maintainer revision: preserve rock UVs during subdivision (2026-09-05).
// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 3 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
//
// Dispatched into a clean directory containing only the brief and the Kiln
// skills, with no access to this repository or to any finished example.

const meta = { name: 'Lighthouse', category: 'prop' };

async function build() {
  const root = createRoot('Lighthouse');

  const stone = gameMaterial(0xb8ad98, { roughness: 0.93 });
  const stoneDark = gameMaterial(0x8d8471, { roughness: 0.95 });
  const trimWhite = gameMaterial(0xe8e2d4, { roughness: 0.85 });
  const plinthGray = gameMaterial(0x7d7a74, { roughness: 0.95 });
  const iron = gameMaterial(0x1e2126, { roughness: 0.55, metalness: 0.75 });
  const copper = gameMaterial(0x8a5a33, { roughness: 0.45, metalness: 0.85 });
  const copperDark = gameMaterial(0x5e3d24, { roughness: 0.6, metalness: 0.7 });
  const glassMat = glassMaterial(0xbfe3ef, { opacity: 0.35, roughness: 0.1 });
  const lensMat = gameMaterial(0xffe9a8, { emissive: 0xffc63a, emissiveIntensity: 2.2, roughness: 0.3 });
  const lampMat = gameMaterial(0xfff6d8, { emissive: 0xfff2b0, emissiveIntensity: 3.5, roughness: 0.4 });
  const woodDoor = gameMaterial(0x4a3220, { roughness: 0.85 });
  const slate = gameMaterial(0x46505a, { roughness: 0.85 });
  const rockMat = gameMaterial(0x6f6e68, { roughness: 0.98 });
  const rockDark = gameMaterial(0x55544f, { roughness: 0.98 });
  const grassMat = gameMaterial(0x5a6b46, { roughness: 0.95 });

  // rock island
  createPart('BasePlatform', cylinderGeo(5.6, 6.1, 0.5, 28), rockDark, { position: [0, 0.25, 0], parent: root });
  createPart('GrassTop', cylinderGeo(5.35, 5.5, 0.12, 28), grassMat, { position: [0, 0.55, 0], parent: root });

  function makeRock(name, px, pz, s, sy, rotY, mat, seed) {
    let g = boxGeo(s, sy, s * 0.8);
    g = mergeVertices(g);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const j = Math.sin(vx * 12.9898 + seed * 78.233 + vz * 37.719) * 0.16 + Math.cos(vy * 9.5 + seed * 13.7) * 0.1;
      pos.setXYZ(i, vx * (1 + j * 0.5), vy * (1 + j * 0.35), vz * (1 + j * 0.5));
    }
    g.computeVertexNormals();
    g = subdivide(g, 2, { preserveUV: true });
    createPart(name, g, mat, { position: [px, 0.35 + sy * 0.25, pz], rotation: [0, rotY, 0], parent: root });
  }
  makeRock('Rock1', 4.4, 1.2, 1.5, 1.1, 20, rockMat, 1);
  makeRock('Rock2', -4.2, 2.2, 1.8, 1.3, 65, rockMat, 2);
  makeRock('Rock3', 3.4, -3.6, 1.6, 1.0, 110, rockDark, 3);
  makeRock('Rock4', -3.6, -3.4, 2.0, 1.4, 40, rockMat, 4);
  makeRock('Rock5', 0.8, 4.7, 1.3, 0.9, 80, rockDark, 5);
  makeRock('Rock6', -1.2, -4.9, 1.4, 1.0, 15, rockMat, 6);
  makeRock('Rock7', 5.3, -1.1, 1.1, 0.8, 130, rockMat, 7);
  makeRock('Rock8', -5.3, -0.4, 1.2, 0.9, 95, rockDark, 8);

  // tower plinth
  createPart('PlinthStep1', cylinderGeo(2.15, 2.3, 0.35, 28), plinthGray, { position: [0, 0.78, 0], parent: root });
  createPart('PlinthStep2', cylinderGeo(1.9, 2.05, 0.35, 28), stoneDark, { position: [0, 1.1, 0], parent: root });

  // tapered tower
  const towerH = 7.2;
  const towerY = 1.275 + towerH / 2;
  createPart('Tower', cylinderGeo(1.15, 1.68, towerH, 40), stone, { position: [0, towerY, 0], parent: root });

  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const r = 1.68 + (1.15 - 1.68) * t;
    const y = 1.275 + 0.35 + t * (towerH - 0.5);
    createPart('Course' + i, torusGeo(r + 0.015, 0.028, 6, 36), stoneDark, { position: [0, y, 0], rotation: [90, 0, 0], parent: root });
  }
  for (let c = 0; c < 10; c++) {
    const t = (c + 0.5) / 10;
    const r = 1.68 + (1.15 - 1.68) * t;
    const y = 1.275 + 0.35 + t * (towerH - 0.5);
    const n = 18;
    for (let k = 0; k < n; k++) {
      if ((k + c) % 2 === 0) continue;
      const a = (k / n) * Math.PI * 2 + c * 0.17;
      createPart('Joint_c' + c + '_' + k, boxGeo(0.03, 0.5, 0.035), stoneDark, { position: [Math.cos(a) * (r + 0.008), y + 0.3, Math.sin(a) * (r + 0.008)], rotation: [0, -a * 180 / Math.PI, 0], parent: root });
    }
  }

  createPart('TowerBaseTrim', torusGeo(1.78, 0.07, 8, 36), trimWhite, { position: [0, 1.65, 0], rotation: [90, 0, 0], parent: root });
  createPart('TowerMidTrim', torusGeo(1.42, 0.055, 8, 36), trimWhite, { position: [0, 5.2, 0], rotation: [90, 0, 0], parent: root });

  // door (+X)
  const doorX = 1.62;
  createPart('DoorFrame', boxGeo(0.18, 2.1, 1.2), trimWhite, { position: [doorX, 2.2, 0], parent: root });
  createPart('Door', boxGeo(0.16, 1.85, 0.9), woodDoor, { position: [doorX + 0.04, 2.1, 0], parent: root });
  createPart('DoorLintel', boxGeo(0.3, 0.18, 1.35), stoneDark, { position: [doorX, 3.32, 0], parent: root });
  createPart('DoorHood', boxGeo(0.5, 0.08, 1.4), iron, { position: [doorX + 0.15, 3.48, 0], parent: root });
  createPart('DoorStep', boxGeo(0.7, 0.18, 1.3), plinthGray, { position: [doorX + 0.35, 1.2, 0], parent: root });
  createPart('DoorKnob', sphereGeo(0.05, 8, 6), iron, { position: [doorX + 0.14, 2.05, 0.3], parent: root });

  // windows spiral
  const winAngles = [0.9, 2.6, 4.4];
  const winHeights = [3.6, 5.1, 6.6];
  for (let i = 0; i < 3; i++) {
    const a = winAngles[i], y = winHeights[i];
    const r = 1.68 + (1.15 - 1.68) * ((y - 1.275) / towerH);
    const px = Math.cos(a) * (r - 0.02), pz = Math.sin(a) * (r - 0.02);
    const deg = -a * 180 / Math.PI;
    createPart('WinFrame' + i, boxGeo(0.12, 0.9, 0.64), trimWhite, { position: [px, y, pz], rotation: [0, deg, 0], parent: root });
    createPart('WinGlass' + i, boxGeo(0.14, 0.68, 0.44), iron, { position: [px, y, pz], rotation: [0, deg, 0], parent: root });
    createPart('WinMullV' + i, boxGeo(0.15, 0.68, 0.05), trimWhite, { position: [px, y, pz], rotation: [0, deg, 0], parent: root });
    createPart('WinSill' + i, boxGeo(0.26, 0.09, 0.74), trimWhite, { position: [Math.cos(a) * (r + 0.02), y - 0.5, Math.sin(a) * (r + 0.02)], rotation: [0, deg, 0], parent: root });
  }

  // corbelled gallery
  const galBase = 1.275 + towerH;
  createPart('Corbel1', cylinderGeo(1.3, 1.12, 0.28, 28), stoneDark, { position: [0, galBase + 0.14, 0], parent: root });
  createPart('Corbel2', cylinderGeo(1.55, 1.28, 0.28, 28), stone, { position: [0, galBase + 0.42, 0], parent: root });
  createPart('Corbel3', cylinderGeo(1.8, 1.53, 0.3, 28), stoneDark, { position: [0, galBase + 0.7, 0], parent: root });
  createPart('GalleryDeck', cylinderGeo(1.92, 1.92, 0.16, 28), plinthGray, { position: [0, galBase + 0.9, 0], parent: root });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    createPart('CorbelBlock' + i, boxGeo(0.22, 0.3, 0.22), stoneDark, { position: [Math.cos(a) * 1.35, galBase + 0.3, Math.sin(a) * 1.35], rotation: [0, -a * 180 / Math.PI, 0], parent: root });
  }
  // deck anchor bolts
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    createPart('DeckBolt' + i, cylinderGeo(0.035, 0.035, 0.07, 6), iron, { position: [Math.cos(a) * 1.65, galBase + 1.0, Math.sin(a) * 1.65], parent: root });
  }

  // railing
  const railY = galBase + 0.98;
  const railR = 1.8;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    createPart('RailPost' + i, cylinderGeo(0.03, 0.03, 1.0, 8), iron, { position: [Math.cos(a) * railR, railY + 0.5, Math.sin(a) * railR], parent: root });
  }
  createPart('RailTop', torusGeo(railR, 0.045, 8, 36), iron, { position: [0, railY + 1.0, 0], rotation: [90, 0, 0], parent: root });
  createPart('RailMid', torusGeo(railR, 0.03, 6, 36), iron, { position: [0, railY + 0.55, 0], rotation: [90, 0, 0], parent: root });
  // gallery access hatch (iron trap on deck)
  createPart('DeckHatch', boxGeo(0.6, 0.06, 0.6), iron, { position: [0.9, galBase + 1.0, 0.9], parent: root });

  // lantern room
  const lantBase = galBase + 0.98;
  createPart('LanternFloor', cylinderGeo(1.32, 1.32, 0.14, 24), iron, { position: [0, lantBase + 0.05, 0], parent: root });
  createPart('LanternSillRing', torusGeo(1.3, 0.06, 8, 24), iron, { position: [0, lantBase + 0.14, 0], rotation: [90, 0, 0], parent: root });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    createPart('Mullion' + i, boxGeo(0.09, 1.6, 0.09), iron, { position: [Math.cos(a) * 1.28, lantBase + 0.93, Math.sin(a) * 1.28], rotation: [0, -a * 180 / Math.PI, 0], parent: root });
  }
  createPart('LanternGlass', cylinderGeo(1.28, 1.28, 1.55, 8), glassMat, { position: [0, lantBase + 0.93, 0], parent: root });
  createPart('LanternTopRing', torusGeo(1.3, 0.06, 8, 24), iron, { position: [0, lantBase + 1.72, 0], rotation: [90, 0, 0], parent: root });

  createPart('FresnelLens', cylinderGeo(0.55, 0.62, 1.15, 8), lensMat, { position: [0, lantBase + 0.93, 0], parent: root });
  createPart('FresnelRing1', torusGeo(0.6, 0.035, 6, 8), iron, { position: [0, lantBase + 0.65, 0], rotation: [90, 22.5, 0], parent: root });
  createPart('FresnelRing2', torusGeo(0.585, 0.035, 6, 8), iron, { position: [0, lantBase + 0.93, 0], rotation: [90, 22.5, 0], parent: root });
  createPart('FresnelRing3', torusGeo(0.565, 0.035, 6, 8), iron, { position: [0, lantBase + 1.2, 0], rotation: [90, 22.5, 0], parent: root });
  createPart('LensCapTop', cylinderGeo(0.58, 0.58, 0.08, 8), iron, { position: [0, lantBase + 1.53, 0], parent: root });
  createPart('LensCapBot', cylinderGeo(0.65, 0.65, 0.08, 8), iron, { position: [0, lantBase + 0.33, 0], parent: root });
  createPart('LampBulb', sphereGeo(0.22, 12, 8), lampMat, { position: [0, lantBase + 0.93, 0], parent: root });
  createPart('LampPedestal', cylinderGeo(0.12, 0.2, 0.35, 12), iron, { position: [0, lantBase + 0.28, 0], parent: root });

  // copper dome + weathervane
  const roofY = lantBase + 1.78;
  const dome = createPart('CopperDome', sphereGeo(1.5, 20, 12), copper, { position: [0, roofY + 0.1, 0], parent: root });
  dome.scale.set(1, 0.62, 1);
  createPart('DomeRim', torusGeo(1.48, 0.07, 8, 28), copperDark, { position: [0, roofY + 0.12, 0], rotation: [90, 0, 0], parent: root });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    beamBetween('DomeRib' + i, [0, roofY + 1.0, 0], [Math.cos(a) * 1.42, roofY + 0.12, Math.sin(a) * 1.42], 0.028, copperDark, { parent: root });
  }
  createPart('FinialBall', sphereGeo(0.14, 12, 8), copperDark, { position: [0, roofY + 1.12, 0], parent: root });
  createPart('VaneRod', cylinderGeo(0.025, 0.025, 1.0, 8), iron, { position: [0, roofY + 1.6, 0], parent: root });
  createPart('VaneArrow', boxGeo(0.7, 0.04, 0.04), iron, { position: [0.05, roofY + 1.85, 0], parent: root });
  createPart('VaneHead', coneXGeo(0.09, 0.22, 8), iron, { position: [0.5, roofY + 1.85, 0], parent: root });
  createPart('VaneTail', boxGeo(0.04, 0.22, 0.16), iron, { position: [-0.3, roofY + 1.85, 0], parent: root });
  createPart('VaneCrossX', boxGeo(0.04, 0.04, 0.5), iron, { position: [0, roofY + 1.65, 0], parent: root });
  createPart('VaneCrossZ', boxGeo(0.5, 0.04, 0.04), iron, { position: [0, roofY + 1.55, 0], parent: root });

  // keeper's cottage
  //
  // The gable ends are pentagons cut to the roof, not rectangles. The first
  // version stood a plain 1.1 m slab on each end wall and let the roof pass
  // across it, which left most of a metre of tan stone standing above the
  // slate at both eaves -- the cottage read as a roofless shell with a roof
  // dropped inside it. A gable is the wall that FILLS the triangle under the
  // pitch, so it is derived from the pitch rather than guessed: same ridge
  // line, same slope, tucked 20 mm under the roof underside so the two can
  // never fight for the same pixel.
  const cx = -0.6, cz = 3.6;
  const roofPitch = 30;
  const roofSlope = Math.tan((roofPitch * Math.PI) / 180);
  const roofT = 0.1;                                  // slate slab thickness
  const ridgeMidY = 3.38 + 0.975 * Math.sin((roofPitch * Math.PI) / 180);
  const roofUnderY = (dz) =>
    ridgeMidY - roofT / 2 / Math.cos((roofPitch * Math.PI) / 180) - roofSlope * Math.abs(dz);
  const gableHalfZ = 1.596;                            // outer face of the end walls
  const gableGeo = await extrudeProfile(
    [
      [-gableHalfZ, 2.70],                            // buried 0.2 m into the wall below
      [gableHalfZ, 2.70],
      [gableHalfZ, roofUnderY(gableHalfZ) - 0.02],
      [0, roofUnderY(0) - 0.02],
      [-gableHalfZ, roofUnderY(gableHalfZ) - 0.02],
    ],
    { depth: 0.176, axis: 'x' },
  );
  createPart('CottageWallN', boxGeo(3.6, 2.3, 0.18), stone, { position: [cx, 1.75, cz + 1.5], parent: root });
  createPart('CottageWallS', boxGeo(3.6, 2.3, 0.18), stone, { position: [cx, 1.75, cz - 1.5], parent: root });
  createPart('CottageWallW', boxGeo(0.18, 2.3, 3.2), stone, { position: [cx - 1.8, 1.75, cz], parent: root });
  createPart('CottageWallE', boxGeo(0.18, 2.3, 3.2), stone, { position: [cx + 1.8, 1.75, cz], parent: root });
  createPart('CottageFloor', boxGeo(3.8, 0.15, 3.4), plinthGray, { position: [cx, 0.68, cz], parent: root });
  createPart('CottageGableW', gableGeo, stoneDark, { position: [cx - 1.8, 0, cz], parent: root });
  createPart('CottageGableE', gableGeo, stoneDark, { position: [cx + 1.8, 0, cz], parent: root });
  createPart('CottageRoofL', boxGeo(4.2, 0.1, 1.95), slate, { position: [cx, 3.38, cz + 0.82], rotation: [30, 0, 0], parent: root });
  createPart('CottageRoofR', boxGeo(4.2, 0.1, 1.95), slate, { position: [cx, 3.38, cz - 0.82], rotation: [-30, 0, 0], parent: root });
  createPart('CottageRidge', boxGeo(4.20, 0.09, 0.2), stoneDark, { position: [cx, 3.86, cz], parent: root });
  // roof battens (slate courses)
  for (let i = 0; i < 3; i++) {
    createPart('BattenL' + i, boxGeo(4.20, 0.05, 0.08), stoneDark, { position: [cx, 3.18 + i * 0.24, cz + 1.18 - i * 0.4], rotation: [30, 0, 0], parent: root });
    createPart('BattenR' + i, boxGeo(4.20, 0.05, 0.08), stoneDark, { position: [cx, 3.18 + i * 0.24, cz - 1.18 + i * 0.4], rotation: [-30, 0, 0], parent: root });
  }
  createPart('Chimney', boxGeo(0.5, 1.7, 0.5), stoneDark, { position: [cx - 1.0, 3.9, cz + 0.3], parent: root });
  createPart('ChimneyCap', boxGeo(0.66, 0.12, 0.66), plinthGray, { position: [cx - 1.0, 4.78, cz + 0.3], parent: root });
  createPart('ChimneyPot', cylinderGeo(0.12, 0.16, 0.35, 10), stoneDark, { position: [cx - 1.0, 5.0, cz + 0.3], parent: root });
  createPart('CottageDoor', boxGeo(0.1, 1.7, 0.85), woodDoor, { position: [cx + 1.92, 1.55, cz], parent: root });
  createPart('CottageDoorTrim', boxGeo(0.08, 1.9, 1.05), trimWhite, { position: [cx + 1.88, 1.6, cz], parent: root });
  createPart('CottageDoorStep', boxGeo(0.5, 0.14, 1.1), plinthGray, { position: [cx + 2.2, 0.72, cz], parent: root });
  createPart('CottageWinN', boxGeo(1.0, 0.7, 0.1), iron, { position: [cx + 0.3, 2.0, cz + 1.55], parent: root });
  createPart('CottageWinTrimN', boxGeo(1.15, 0.85, 0.06), trimWhite, { position: [cx + 0.3, 2.0, cz + 1.52], parent: root });
  createPart('CottageMullVN', boxGeo(0.06, 0.7, 0.116), trimWhite, { position: [cx + 0.3, 2.0, cz + 1.562], parent: root });
  createPart('CottageWinS', boxGeo(1.0, 0.7, 0.1), iron, { position: [cx + 0.3, 2.0, cz - 1.55], parent: root });
  createPart('CottageWinTrimS', boxGeo(1.15, 0.85, 0.06), trimWhite, { position: [cx + 0.3, 2.0, cz - 1.52], parent: root });
  createPart('CottageMullVS', boxGeo(0.06, 0.7, 0.116), trimWhite, { position: [cx + 0.3, 2.0, cz - 1.562], parent: root });
  createPart('Passage', boxGeo(1.6, 1.9, 1.4), stone, { position: [-0.3, 1.6, 2.2], rotation: [0, 25, 0], parent: root });
  // stone path: tower door to cottage + edge
  createPart('Path1', boxGeo(1.0, 0.08, 1.1), plinthGray, { position: [2.6, 0.65, 0.4], parent: root });
  createPart('Path2', boxGeo(0.9, 0.08, 1.0), plinthGray, { position: [2.7, 0.65, 1.6], parent: root });
  createPart('Path3', boxGeo(0.9, 0.08, 1.0), plinthGray, { position: [2.2, 0.65, 2.7], parent: root });
  createPart('Path4', boxGeo(0.8, 0.08, 0.9), plinthGray, { position: [1.6, 0.65, 3.4], parent: root });

  return root;
}
