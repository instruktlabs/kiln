const meta = { name: 'Wall section' };

async function build() {
  const root = createRoot('WallSection');

  const masonry = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Warm brick and mortar',
    roughness: 1,
    metalness: 1,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.metallic-roughness' }
    }
  });

  const timber = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Warm straight wood grain',
    roughness: 1,
    metalness: 1,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' }
    }
  });

  // Helper: compute exact vertical half-extent for rotated box (Three.js Euler XYZ order)
  function getRotatedHalfY(size, rotDeg) {
    if (!rotDeg || (rotDeg[0] === 0 && rotDeg[1] === 0 && rotDeg[2] === 0)) {
      return size[1] / 2;
    }
    const rx = (rotDeg[0] || 0) * Math.PI / 180;
    const ry = (rotDeg[1] || 0) * Math.PI / 180;
    const rz = (rotDeg[2] || 0) * Math.PI / 180;
    const a = Math.cos(rx), b = Math.sin(rx);
    const c = Math.cos(ry), d = Math.sin(ry);
    const e = Math.cos(rz), f = Math.sin(rz);
    // Row 1 of rotation matrix M = Rx * Ry * Rz:
    const m10 = a * f + b * e * d;
    const m11 = a * e - b * f * d;
    const m12 = -b * c;
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    return Math.abs(m10) * hx + Math.abs(m11) * hy + Math.abs(m12) * hz;
  }

  // --- BREACHED WALL SECTION ---
  // A 6 m wall section with a central breach gap (~2.6 m wide at base, widening upward to 3.8 m)
  // wide enough for three soldiers abreast (soldier width ~0.8 m -> 2.4 m requirement),
  // with rubble accumulated at its foot and in the breach.
  // The outer ends at X = -3.0 and X = +3.0 remain completely intact so the section
  // still tiles seamlessly with adjacent intact wall sections.

  // Sloped stone footings on left and right flanks (2 m tall, 3.4 m base / 2.8 m top)
  // Left flank footing: X = -3.0 to -1.5 (length 1.5 m, center X = -2.25)
  const footingLeftGeo = remapUV(taper(boxGeo(1.5, 2, 2.8), {
    startScale: [1, 3.4 / 2.8],
    endScale: [1, 1]
  }), { scale: [0.75, 1] });
  createPart('Footing_Left', footingLeftGeo, masonry, { position: [-2.25, 1, 0], parent: root });

  // Right flank footing: X = +1.5 to +3.0 (length 1.5 m, center X = +2.25)
  const footingRightGeo = remapUV(taper(boxGeo(1.5, 2, 2.8), {
    startScale: [1, 3.4 / 2.8],
    endScale: [1, 1]
  }), { scale: [0.75, 1] });
  createPart('Footing_Right', footingRightGeo, masonry, { position: [2.25, 1, 0], parent: root });

  // Jagged fractured footing spurs projecting into the breach edges
  const spurSize = [0.32, 0.95, 2.2];
  const spurLeftRot = [0, 5, 6];
  const spurRightRot = [0, -5, -6];
  const spurLeftHalfY = getRotatedHalfY(spurSize, spurLeftRot);
  const spurRightHalfY = getRotatedHalfY(spurSize, spurRightRot);
  const footingSpurGeo = remapUV(boxGeo(spurSize[0], spurSize[1], spurSize[2]), { scale: [0.32, 1] });
  createPart('FootingSpur_Left', footingSpurGeo, masonry, {
    position: [-1.38, spurLeftHalfY, 0],
    rotation: spurLeftRot,
    parent: root
  });
  createPart('FootingSpur_Right', footingSpurGeo, masonry, {
    position: [1.38, spurRightHalfY, 0],
    rotation: spurRightRot,
    parent: root
  });

  // Mudbrick wall body on flanks: stepped collapse creates an irregular V-shaped breach
  // Lower body (Y 2.0..4.3, height 2.3):
  // Left: X = -3.0 to -1.55 (length 1.45, center -2.275)
  const bodyLowerLeftGeo = remapUV(boxGeo(1.45, 2.3, 2.6), { scale: [0.75, 1.15] });
  createPart('WallBody_Lower_Left', bodyLowerLeftGeo, masonry, { position: [-2.275, 3.15, 0], parent: root });
  // Right: X = +1.55 to +3.0 (length 1.45, center +2.275)
  const bodyLowerRightGeo = remapUV(boxGeo(1.45, 2.3, 2.6), { scale: [0.75, 1.15] });
  createPart('WallBody_Lower_Right', bodyLowerRightGeo, masonry, { position: [2.275, 3.15, 0], parent: root });

  // Upper body (Y 4.3..6.6, height 2.3):
  // Left: X = -3.0 to -1.9 (length 1.1, center -2.45)
  const bodyUpperLeftGeo = remapUV(boxGeo(1.1, 2.3, 2.6), { scale: [0.55, 1.15] });
  createPart('WallBody_Upper_Left', bodyUpperLeftGeo, masonry, { position: [-2.45, 5.45, 0], parent: root });
  // Right: X = +1.9 to +3.0 (length 1.1, center +2.45)
  const bodyUpperRightGeo = remapUV(boxGeo(1.1, 2.3, 2.6), { scale: [0.55, 1.15] });
  createPart('WallBody_Upper_Right', bodyUpperRightGeo, masonry, { position: [2.45, 5.45, 0], parent: root });

  // Fractured mudbrick blocks on the breach face
  const fractureMidGeo = remapUV(boxGeo(0.4, 0.7, 0.9), { scale: [0.4, 0.7] });
  createPart('Fracture_Mid_Left', fractureMidGeo, masonry, {
    position: [-1.45, 2.5, 0.3],
    rotation: [4, 8, 10],
    parent: root
  });
  createPart('Fracture_Mid_Right', fractureMidGeo, masonry, {
    position: [1.45, 2.6, -0.3],
    rotation: [-4, -7, -10],
    parent: root
  });
  const fractureUpperGeo = remapUV(boxGeo(0.35, 0.6, 0.8), { scale: [0.35, 0.6] });
  createPart('Fracture_Upper_Left', fractureUpperGeo, masonry, {
    position: [-1.75, 4.2, -0.2],
    rotation: [-3, -6, 6],
    parent: root
  });
  createPart('Fracture_Upper_Right', fractureUpperGeo, masonry, {
    position: [1.72, 4.3, 0.2],
    rotation: [3, 8, -6],
    parent: root
  });

  // Snapped timber lacing beams flush at outer ends (X = +-3), protruding into breach
  const beamFaces = [1.39, -1.39];
  for (let fi = 0; fi < 2; fi++) {
    const z = beamFaces[fi];
    // Lower beam Y = 3.2: Left length 1.55 (X -3.0..-1.45), Right length 1.55 (X 1.45..3.0)
    const lowerBeamGeo = remapUV(boxGeo(1.55, 0.18, 0.18), { scale: [1.55, 1] });
    createPart('Beam_Lower_Left_' + fi, lowerBeamGeo, timber, { position: [-2.225, 3.2, z], parent: root });
    createPart('Beam_Lower_Right_' + fi, lowerBeamGeo, timber, { position: [2.225, 3.2, z], parent: root });

    // Upper beam Y = 5.2: Left length 1.22 (X -3.0..-1.78), Right length 1.22 (X 1.78..3.0)
    const upperBeamGeo = remapUV(boxGeo(1.22, 0.18, 0.18), { scale: [1.22, 1] });
    createPart('Beam_Upper_Left_' + fi, upperBeamGeo, timber, { position: [-2.39, 5.2, z], parent: root });
    createPart('Beam_Upper_Right_' + fi, upperBeamGeo, timber, { position: [2.39, 5.2, z], parent: root });
  }

  // Parapet and walkway: intact ends flush at X = +-3, broken open across the breach
  // Left parapet base: X = -3.0 to -1.95 (length 1.05, center -2.475)
  const parapetLeftGeo = remapUV(boxGeo(1.05, 0.7, 0.6), { scale: [0.55, 0.35] });
  createPart('ParapetBase_Left', parapetLeftGeo, masonry, { position: [-2.475, 6.95, 1.0], parent: root });
  // Right parapet base: X = +1.95 to +3.0 (length 1.05, center +2.475)
  const parapetRightGeo = remapUV(boxGeo(1.05, 0.7, 0.6), { scale: [0.55, 0.35] });
  createPart('ParapetBase_Right', parapetRightGeo, masonry, { position: [2.475, 6.95, 1.0], parent: root });

  // Intact outer merlons: Merlon_0 at X = -2.5 and Merlon_5 at X = +2.5 preserve end-tiling
  const merlonGeo = remapUV(boxGeo(0.6, 0.7, 0.6), { scale: [0.3, 0.35] });
  createPart('Merlon_0', merlonGeo, masonry, { position: [-2.5, 7.65, 1.0], parent: root });
  createPart('Merlon_5', merlonGeo, masonry, { position: [2.5, 7.65, 1.0], parent: root });

  // Inner curbs on remaining wall walk: X = -3.0..-1.95 and +1.95..+3.0
  const curbGeo = remapUV(boxGeo(1.05, 0.3, 0.2), { scale: [0.55, 0.15] });
  createPart('InnerCurb_Left', curbGeo, masonry, { position: [-2.475, 6.75, -1.2], parent: root });
  createPart('InnerCurb_Right', curbGeo, masonry, { position: [2.475, 6.75, -1.2], parent: root });

  // --- RUBBLE AT THE FOOT OF THE WALL AND IN THE BREACH ---
  // Central walkable rubble apron: low threshold through the breach for 3 soldiers abreast
  const apronGeo = remapUV(taper(boxGeo(2.6, 0.22, 4.2), {
    startScale: [1, 1],
    endScale: [0.95, 0.9]
  }), { scale: [1.3, 2.1] });
  createPart('RubbleApron', apronGeo, masonry, { position: [0, 0.11, 0], parent: root });

  // Tumbled stone & mudbrick blocks piled at the foot of the wall and breach flanks
  const rubbleSpecs = [
    // Outer foot (+Z): collapsed blocks spilled out onto the plain
    { name: 'Rubble_Outer_1', size: [0.65, 0.42, 0.52], pos: [-0.95, 0.21, 1.45], rot: [8, -15, 6] },
    { name: 'Rubble_Outer_2', size: [0.6, 0.45, 0.55], pos: [0.9, 0.225, 1.4], rot: [-6, 22, -8] },
    { name: 'Rubble_Outer_3', size: [0.55, 0.35, 0.5], pos: [-0.35, 0.175, 2.05], rot: [12, 35, -5] },
    { name: 'Rubble_Outer_4', size: [0.58, 0.32, 0.48], pos: [0.45, 0.16, 2.1], rot: [-8, -25, 10] },
    { name: 'Rubble_Outer_5', size: [0.52, 0.38, 0.46], pos: [-1.55, 0.19, 1.8], rot: [10, 15, -12] },
    { name: 'Rubble_Outer_6', size: [0.5, 0.36, 0.44], pos: [1.5, 0.18, 1.85], rot: [-12, -20, 7] },

    // Inner foot (-Z): collapsed debris fallen into the city
    { name: 'Rubble_Inner_1', size: [0.62, 0.4, 0.52], pos: [-0.9, 0.2, -1.4], rot: [-7, 20, -5] },
    { name: 'Rubble_Inner_2', size: [0.65, 0.44, 0.5], pos: [0.85, 0.22, -1.45], rot: [8, -18, 7] },
    { name: 'Rubble_Inner_3', size: [0.54, 0.32, 0.48], pos: [-0.3, 0.16, -2.0], rot: [-10, -30, 8] },
    { name: 'Rubble_Inner_4', size: [0.56, 0.34, 0.46], pos: [0.4, 0.17, -2.05], rot: [6, 40, -6] },
    { name: 'Rubble_Inner_5', size: [0.48, 0.32, 0.42], pos: [-1.5, 0.16, -1.75], rot: [14, -12, 9] },
    { name: 'Rubble_Inner_6', size: [0.5, 0.35, 0.4], pos: [1.45, 0.175, -1.7], rot: [-9, 25, -11] },

    // In-passage low debris stones along the flanks leaving center open
    { name: 'Rubble_Passage_1', size: [0.45, 0.18, 0.38], pos: [-0.85, 0.2, 0.3], rot: [3, 14, -4] },
    { name: 'Rubble_Passage_2', size: [0.42, 0.16, 0.36], pos: [0.8, 0.19, -0.3], rot: [-4, -18, 5] }
  ];

  for (const r of rubbleSpecs) {
    const geo = remapUV(boxGeo(r.size[0], r.size[1], r.size[2]), { scale: [r.size[0], r.size[1]] });
    const halfY = getRotatedHalfY(r.size, r.rot);
    const yPos = Math.max(r.pos[1], halfY);
    createPart(r.name, geo, masonry, { position: [r.pos[0], yPos, r.pos[2]], rotation: r.rot, parent: root });
  }

  // Fallen timber beams in the rubble
  const beamFallenSpecs = [
    { name: 'Beam_Fallen_1', size: [1.5, 0.18, 0.18], pos: [-0.15, 0.35, 0.9], rot: [7, -26, 10] },
    { name: 'Beam_Fallen_2', size: [1.3, 0.18, 0.18], pos: [0.2, 0.3, -0.8], rot: [-5, 30, -7] },
    { name: 'Beam_Fallen_3', size: [0.95, 0.16, 0.16], pos: [-0.65, 0.18, 1.75], rot: [12, 50, -4] }
  ];

  for (const b of beamFallenSpecs) {
    const geo = remapUV(boxGeo(b.size[0], b.size[1], b.size[2]), { scale: [b.size[0], 1] });
    const halfY = getRotatedHalfY(b.size, b.rot);
    const yPos = Math.max(b.pos[1], halfY);
    createPart(b.name, geo, timber, { position: [b.pos[0], yPos, b.pos[2]], rotation: b.rot, parent: root });
  }

  return root;
}