const ASSET_wall = (() => {
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

  const LEN = 6;

  // Sloped stone footing: 2 m tall, 3.4 m wide at base, 2.8 m at top, 6 m long.
  const footingGeo = remapUV(taper(boxGeo(LEN, 2, 2.8), {
    startScale: [1, 3.4 / 2.8],
    endScale: [1, 1]
  }), { scale: [3, 1] });
  createPart('Footing', footingGeo, masonry, { position: [0, 1, 0], parent: root });

  // Mudbrick wall body: Y 2.0..6.6, 2.6 m thick, centred on Z=0.
  const bodyGeo = remapUV(boxGeo(LEN, 4.6, 2.6), { scale: [3, 2.3] });
  createPart('WallBody', bodyGeo, masonry, { position: [0, 4.3, 0], parent: root });

  // Timber lacing courses through the mudbrick, outer and inner faces.
  const beamGeo = remapUV(boxGeo(LEN, 0.18, 0.18), { scale: [6, 1] });
  const beamLevels = [3.2, 5.2];
  const beamFaces = [1.39, -1.39];
  let bi = 0;
  for (const y of beamLevels) {
    for (const z of beamFaces) {
      bi += 1;
      createPart('Beam_' + bi, beamGeo, timber, { position: [0, y, z], parent: root });
    }
  }

  // Parapet: solid base course Y 6.6..7.3, then 6 merlons to Y 8.0.
  // Merlon 0.6 + gap 0.4 = 1 m period; half-gaps at each end tile into a full gap.
  const parapetGeo = remapUV(boxGeo(LEN, 0.7, 0.6), { scale: [3, 0.35] });
  createPart('ParapetBase', parapetGeo, masonry, { position: [0, 6.95, 1.0], parent: root });
  const merlonGeo = remapUV(boxGeo(0.6, 0.7, 0.6), { scale: [0.3, 0.35] });
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i * 1.0;
    createPart('Merlon_' + i, merlonGeo, masonry, { position: [x, 7.65, 1.0], parent: root });
  }

  // Low inner curb marking the 2 m wall walk's inner edge.
  const curbGeo = remapUV(boxGeo(LEN, 0.3, 0.2), { scale: [3, 0.15] });
  createPart('InnerCurb', curbGeo, masonry, { position: [0, 6.75, -1.2], parent: root });

  return root;
}
return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_breach = (() => {
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
return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_gate = (() => {
const meta = { name: 'City gate', role: 'building' };

// Gate module between two 6 m wall sections. Origin on the ground at the footprint centre.
// X runs along the wall, Y is up, +Z faces the plain (outside); doors swing inward (-Z).
const P = {
  width: 6.0,        // module length along the wall, matches the 6 m wall tiling
  depth: 3.2,        // wall thickness at the walk: 2 m walk + two 0.6 m parapets
  footingDepth: 4.0, // footing flares out at the base
  footingH: 1.5,
  passage: 3.0,      // clear width of the passage
  passageH: 3.8,     // clear height under the lintel
  lintelH: 0.4,
  deckY: 7.0,
  parapetH: 1.0,     // wall top is deckY + parapetH = 8 m
  doorT: 0.18,
  doorZ: 0.6,        // closed door plane, inside the passage
  openDeg: 86,
};

// UVs from world position so brick courses and grain stay continuous across separate blocks.
function worldUV(geo, c, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + c[0], y = p.getY(i) + c[1], z = p.getZ(i) + c[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, z / tile, y / tile);
    else if (ay >= az) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

// Static geometry is baked per (parent, material) so the gate costs a handful of draw calls.
const LABELS = new Map();
const BUCKETS = new Map();

function bucketAdd(parent, mat, geo, pos) {
  if (!BUCKETS.has(parent)) BUCKETS.set(parent, new Map());
  const byMat = BUCKETS.get(parent);
  if (!byMat.has(mat)) byMat.set(mat, []);
  byMat.get(mat).push({ geo, pos });
}

function flushBuckets() {
  for (const [parent, byMat] of BUCKETS) {
    for (const [mat, items] of byMat) {
      const positions = [], normals = [], uvs = [], indices = [];
      for (const { geo, pos } of items) {
        const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        const base = positions.length / 3;
        for (let i = 0; i < p.count; i++) {
          positions.push(p.getX(i) + pos[0], p.getY(i) + pos[1], p.getZ(i) + pos[2]);
          normals.push(n.getX(i), n.getY(i), n.getZ(i));
          uvs.push(uv.getX(i), uv.getY(i));
        }
        if (geo.index) for (let i = 0; i < geo.index.count; i++) indices.push(base + geo.index.getX(i));
        else for (let i = 0; i < p.count; i++) indices.push(base + i);
      }
      createPart(parent.name + '_' + LABELS.get(mat), meshGeo({ positions, normals, uvs, indices }), mat, { parent });
    }
  }
  BUCKETS.clear();
}

function block(name, w, h, d, pos, mat, tile, parent) {
  bucketAdd(parent, mat, worldUV(copyGeometry(boxGeo(w, h, d)), pos, tile), pos);
}

// Sloped footing: trapezoid in Z/Y, running along X from x0 to x1.
function footingGeo(x0, x1, tile) {
  const hw0 = P.footingDepth / 2, hw1 = P.depth / 2, h = P.footingH;
  const v = [
    [x0, 0, -hw0], [x1, 0, -hw0], [x1, 0, hw0], [x0, 0, hw0],
    [x0, h, -hw1], [x1, h, -hw1], [x1, h, hw1], [x0, h, hw1],
  ];
  const mid = [(x0 + x1) / 2, h / 2, 0];
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [3, 2, 6, 7], [0, 1, 5, 4], [0, 3, 7, 4], [1, 2, 6, 5]];
  const positions = [], indices = [], uvs = [];
  for (let f of faces) {
    let q = f.map(i => v[i]);
    const a = q[0], b = q[1], c = q[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
    const cx = (q[0][0] + q[2][0]) / 2 - mid[0], cy = (q[0][1] + q[2][1]) / 2 - mid[1], cz = (q[0][2] + q[2][2]) / 2 - mid[2];
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) q = [q[0], q[3], q[2], q[1]];
    const base = positions.length / 3;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    for (const p of q) {
      positions.push(p[0], p[1], p[2]);
      if (ax >= ay && ax >= az) uvs.push(p[2] / tile, p[1] / tile);
      else if (ay >= az) uvs.push(p[0] / tile, p[2] / tile);
      else uvs.push(p[0] / tile, p[1] / tile);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return meshGeo({ positions, indices, uvs });
}

async function build() {
  BUCKETS.clear();
  const root = createRoot('CityGate');
  const portable = (spec) => compilePortableMaterialSpecV2(spec);

  const mudbrickSpec = {
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Mudbrick', baseColor: 0xcdf5ff,
    roughness: 1, metalness: 1,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.metallic-roughness' },
    },
  };
  const mudbrick = await portable(mudbrickSpec);
  const limestone = await portable({ ...mudbrickSpec, name: 'Limestone footing', baseColor: 0xb8e0f0 });
  const timber = await portable({
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Timber', baseColor: 0xb8afa8,
    roughness: 1, metalness: 1,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' },
    },
  });
  const bronze = await portable({
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Bronze', baseColor: 0xffcf7a,
    roughness: 0.7, metalness: 0.9,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
    },
  });

  LABELS.set(mudbrick, 'mudbrick'); LABELS.set(limestone, 'limestone');
  LABELS.set(timber, 'timber'); LABELS.set(bronze, 'bronze');
  const MT = 3, TT = 1; // texture tile sizes in metres (coarse masonry for 20 m readability)
  const hw = P.width / 2, hp = P.passage / 2, hd = P.depth / 2;
  const pierTop = P.passageH + P.lintelH;

  // Footings and jambs (the passage stays open between them)
  const walls = createPivot('Walls', [0, 0, 0], root);
  walls.name = 'walls';
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw : hp, x1 = s < 0 ? -hp : hw;
    bucketAdd(walls, limestone, footingGeo(x0, x1, MT), [0, 0, 0]);
    block(s < 0 ? 'pier_left' : 'pier_right', hw - hp, pierTop - P.footingH, P.depth,
      [s * (hw + hp) / 2, (P.footingH + pierTop) / 2, 0], mudbrick, MT, walls);
  }
  // Mudbrick over the passage up to the wall walk
  block('gate_head', P.width, P.deckY - pierTop, P.depth, [0, (pierTop + P.deckY) / 2, 0], mudbrick, MT, walls);

  // Timber lintel: four beams side by side, bearing into the piers, proud of the faces by 0.05
  const lintelLen = P.passage + 0.8, lintelD = P.depth + 0.1, nb = 4;
  for (let i = 0; i < nb; i++) {
    block('lintel_beam_' + (i + 1), lintelLen, P.lintelH, lintelD / nb,
      [0, P.passageH + P.lintelH / 2, -lintelD / 2 + lintelD / nb * (i + 0.5)], timber, TT, walls);
  }

  // Parapet: low wall with merlons on a 1.5 m pitch so it repeats across 6 m wall sections
  const pitch = 1.5, pT = 0.6, baseH = P.parapetH / 2;
  for (const s of [-1, 1]) {
    const z = s * (hd - pT / 2);
    const side = s > 0 ? 'front' : 'back';
    block('parapet_' + side, P.width, baseH, pT, [0, P.deckY + baseH / 2, z], mudbrick, MT, walls);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * pitch;
      block('merlon_' + side + '_' + (k + 1), 1.0, P.parapetH - baseH, pT, [x, P.deckY + baseH + (P.parapetH - baseH) / 2, z], mudbrick, MT, walls);
      // beam head projecting under the walk
      block('beam_head_' + side + '_' + (k + 1), 0.3, 0.3, 0.2, [x, P.deckY - 0.45, s * (hd + 0.1)], timber, TT, walls);
    }
  }

  // Doors: pivot on the jamb face, leaf thickness on the +Z side so it folds flat against the jamb inward
  const leafW = hp - 0.01, leafH = P.passageH - 0.1, leafY = 0.05 + leafH / 2;
  function door(s) {
    const name = s < 0 ? 'door_left' : 'door_right';
    const pivot = createPivot(name, [s * hp, 0, P.doorZ], root);
    pivot.name = name;
    const cx = -s * leafW / 2;
    block('leaf', leafW, leafH, P.doorT, [cx, leafY, P.doorT / 2], timber, TT, pivot);
    for (const y of [0.55, leafH / 2 + 0.05, leafH - 0.45]) {
      block('batten', leafW - 0.1, 0.22, 0.06, [cx, y, P.doorT + 0.03], timber, TT, pivot);
    }
    for (const y of [0.55, leafH - 0.45]) {
      block('strap', 0.7, 0.12, 0.04, [-s * 0.35, y, P.doorT + 0.08], bronze, 1, pivot);
      block('pin', 0.08, 0.08, 0.06, [-s * 0.62, y, P.doorT + 0.11], bronze, 1, pivot);
    }
    return pivot;
  }
  door(-1);
  door(1);
  flushBuckets();
  return root;
}

function animate(root) {
  const a = P.openDeg;
  const track = (name, sign, from, to) => rotationTrack(name, [
    { time: 0, rotation: [0, sign * from, 0] }, { time: 2, rotation: [0, sign * to, 0] },
  ], 'EASE_IN_OUT');
  return [
    createClip('open', 2, [track('door_left', 1, 0, a), track('door_right', -1, 0, a)], { loop: false }),
    createClip('close', 2, [track('door_left', 1, a, 0), track('door_right', -1, a, 0)], { loop: false }),
  ];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_house = (() => {
const meta = { name: 'Trojan Walk-in House', role: 'building' };
const D = { width:6, depth:5, wall:0.45, floor:0.12, stoneTop:0.62, ceiling:3.0,
  doorwayWidth:1.4, doorwayHeight:2.35, jamb:0.18, roofThickness:0.24 };
async function build() {
  const root = createRoot('TrojanHouse');
  root.userData = { forward:'+Z', units:'metres', soldierHeight:1.8, doorClearWidth:D.doorwayWidth,
    doorClearHeight:D.doorwayHeight, floorHeight:D.floor, entry:'Open passage with shallow approach ramp' };
  const masonrySpec = {"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Warm brick and mortar","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.metallic-roughness"}}};
  const timberSpec = {"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Warm straight wood grain","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness"}}};
  const mud = await compilePortableMaterialSpecV2({...masonrySpec, name:'Troy mudbrick', baseColor:0xa9825b,
    textures:{normal:masonrySpec.textures.normal,metallicRoughness:masonrySpec.textures.metallicRoughness}});
  // Palette variants of pinned masonry; retain its packed roughness map, avoid double tinting albedo.
  const stone = await compilePortableMaterialSpecV2({...masonrySpec, name:'Troy limestone', baseColor:0xcdbf9f,
    textures:{metallicRoughness:masonrySpec.textures.metallicRoughness}});
  const plaster = await compilePortableMaterialSpecV2({...masonrySpec, name:'Troy plaster', baseColor:0xe3d8c0,
    textures:{metallicRoughness:masonrySpec.textures.metallicRoughness}});
  const wood = await compilePortableMaterialSpecV2({...timberSpec,name:'Troy timber',
    textures:{baseColor:timberSpec.textures.baseColor,metallicRoughness:timberSpec.textures.metallicRoughness}});
  const batches = {};
  function add(bucket, geo, position=[0,0,0], rotation=[0,0,0]) {
    const g = geo.clone();
    const e = new THREE.Euler(...rotation.map(v=>v*Math.PI/180));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
    g.translate(...position);
    (batches[bucket] || (batches[bucket]=[])).push(g);
  }
  function box(bucket,size,p,rot) {add(bucket,boxGeo(...size),p,rot);}
  function flush(bucket,name,mat,parent=root) {
    const geos=batches[bucket] || [];
    const positions=[],normals=[],uvs=[];
    for(const geo of geos) {
      const g=geo.index ? geo.toNonIndexed() : geo;
      const p=g.getAttribute('position'), n=g.getAttribute('normal'), uv=g.getAttribute('uv');
      for(let i=0;i<p.count;i++) {
        positions.push(p.getX(i),p.getY(i),p.getZ(i));
        normals.push(n.getX(i),n.getY(i),n.getZ(i));
        uvs.push(uv ? uv.getX(i):0,uv ? uv.getY(i):0);
      }
    }
    const result=createPart(name,meshGeo({positions,normals,uvs}),mat,{parent});
    return result;
  }
  function rect(x0,x1,z0,z1){return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];}
  function footing(x0,x1,z0,z1,expandX,expandZ) {
    add('stone',loftProfiles([
      {profile:rect(x0-expandX,x1+expandX,z0-expandZ,z1+expandZ),frame:{origin:[0,0,0]}},
      {profile:rect(x0,x1,z0,z1),frame:{origin:[0,D.stoneTop,0]}}
    ]));
  }
  const halfDoor=D.doorwayWidth/2, roughHalf=halfDoor+D.jamb;
  // Footings are split at the opening: no continuous plinth across the entrance.
  footing(-3,-2.55,-2.05,2.05,0.12,0);
  footing(2.55,3,-2.05,2.05,0.12,0);
  footing(-3,3,-2.5,-2.05,0.12,0.12);
  footing(-3,-roughHalf,2.05,2.5,0,0.12);
  footing(roughHalf,3,2.05,2.5,0,0.12);
  const wallH=D.ceiling-D.stoneTop;
  box('mud',[0.45,wallH,4.1],[-2.775,D.stoneTop+wallH/2,0]);
  box('mud',[0.45,wallH,4.1],[2.775,D.stoneTop+wallH/2,0]);
  // A high rear vent is a real aperture.
  box('mud',[2.65,wallH,0.45],[-1.675,D.stoneTop+wallH/2,-2.275]);
  box('mud',[2.65,wallH,0.45],[1.675,D.stoneTop+wallH/2,-2.275]);
  box('mud',[0.7,1.38,0.45],[0,D.stoneTop+0.69,-2.275]);
  box('mud',[0.7,0.4,0.45],[0,2.8,-2.275]);
  const frontPierW=3-roughHalf, lintelY=D.floor+D.doorwayHeight;
  box('mud',[frontPierW,wallH,0.45],[-(3+roughHalf)/2,D.stoneTop+wallH/2,2.275]);
  box('mud',[frontPierW,wallH,0.45],[(3+roughHalf)/2,D.stoneTop+wallH/2,2.275]);
  box('mud',[roughHalf*2,D.ceiling-lintelY-0.22,0.45],
    [0,(D.ceiling+lintelY+0.22)/2,2.275]);
  // Clear opening is measured between these finished timber jamb faces.
  createPart('DoorJambLeft',boxGeo(D.jamb,D.doorwayHeight,0.52),wood,
    {position:[-halfDoor-D.jamb/2,D.floor+D.doorwayHeight/2,2.275],parent:root});
  createPart('DoorJambRight',boxGeo(D.jamb,D.doorwayHeight,0.52),wood,
    {position:[halfDoor+D.jamb/2,D.floor+D.doorwayHeight/2,2.275],parent:root});
  createPart('DoorLintel',boxGeo(2.12,0.22,0.56),wood,
    {position:[0,lintelY+0.11,2.275],parent:root});
  // One room; the main 1.4 m entry lane remains clear to the back wall.
  box('floor',[5.1,D.floor,4.1],[0,D.floor/2,0]);
  // Closed wedge ramp joins exactly to the floor at z=2.05.
  const ramp=boxGeo(1.4,D.floor,1.4).clone();
  const rp=ramp.getAttribute('position');
  for(let i=0;i<rp.count;i++) {
    const z=rp.getZ(i)+2.75;
    const y=rp.getY(i)>0 ? D.floor*(3.45-z)/1.4 : 0;
    rp.setXYZ(i,rp.getX(i),y,z);
  }
  ramp.computeVertexNormals();
  add('floor',ramp);
  // Low octagonal hearth placed to the left, away from the entry route.
  const cx=-1.45,cz=-0.45;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    box('stone',[0.44,0.16,0.22],[cx+0.58*Math.sin(a),D.floor+0.08,cz+0.58*Math.cos(a)],[0,i*45,0]);
  }
  add('wood',cylinderGeo(0.065,0.065,0.65,6),[cx,D.floor+0.085,cz],[0,0,90]);
  add('wood',cylinderGeo(0.055,0.055,0.55,6),[cx,D.floor+0.10,cz],[90,20,0]);
  // Visible load-bearing ceiling timbers meet both side walls.
  for(let i=0;i<6;i++){
    const z=-1.75+i*0.7;
    box('wood',[6.0,0.18,0.20],[0,D.ceiling-0.09,z]);
  }
  // Flat earthen roof and low rim. Roof is a separate named subtree for cutaway review.
  const roof=new THREE.Group();roof.name='Roof';root.add(roof);
  roof.userData={role:'roof',top:D.ceiling+D.roofThickness};
  box('roof',[6.12,D.roofThickness,5.12],[0,D.ceiling+D.roofThickness/2,0]);
  box('roof',[6.0,0.22,0.18],[0,3.35,-2.4]);
  box('roof',[6.0,0.22,0.18],[0,3.35,2.4]);
  box('roof',[0.18,0.22,4.8],[-2.91,3.35,0]);
  // Right rim leaves a landing gap at the ladder.
  box('roof',[0.18,0.22,2.35],[2.91,3.35,-1.225]);
  box('roof',[0.18,0.22,1.15],[2.91,3.35,1.825]);
  // Timber ladder along the right flank. Extended rails provide handholds above the roof.
  const ladder=createLadder('RoofLadder',{
    bottom:[4.15,0.055,0.55],top:[3.06,3.95,0.55],width:0.72,
    rungCount:12,railRadius:0.055,rungRadius:0.037,segments:6,widthDirection:[0,0,1],
    material:wood,parent:root});
  // Consolidate its static parts with the house timbers, preserving one material draw.
  ladder.root.updateMatrixWorld(true);
  ladder.root.traverse(o=>{
    if(o.isMesh){
      const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
      (batches.wood || (batches.wood=[])).push(g);
    }
  });
  root.remove(ladder.root);
  // The handhold above the roof leans out; short cross ties meet the roof edge.
  box('wood',[0.30,0.10,0.10],[3.01,3.19,0.19]);
  box('wood',[0.30,0.10,0.10],[3.01,3.19,0.91]);
  flush('stone','StoneFootingsAndHearth',stone);
  flush('mud','MudbrickWalls',mud);
  flush('floor','FloorAndEntranceRamp',plaster);
  flush('wood','CeilingTimbersAndRoofLadder',wood);
  flush('roof','FlatRoofAndRim',plaster,roof);
  return root;
}
return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_temple = (() => {
const meta = { name: 'Troy Citadel Temple Hall', role: 'building' };
async function build() {
  const root = createRoot('TroyCitadelTempleHall');
  // Pack frame: +Z faces the approach, Y=0 is the ground datum.
  const P = { width: 8.4, rear: -7, front: 7, hallFront: 3.6, floor: 0.45, wallTop: 4.65, doorWidth: 2.4, doorHeight: 3.1, hearthZ: -1 };
  root.userData = { project: 'troy', inventoryId: 'temple-hall', forward: '+Z', clearDoorWidth: P.doorWidth, clearDoorHeight: P.doorHeight };
  const masonrySpec = { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Warm brick and mortar', roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: {
    baseColor: {kind:'resource',resourceId:'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.base-color'},
    normal: {kind:'resource',resourceId:'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.normal'},
    metallicRoughness: {kind:'resource',resourceId:'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.metallic-roughness'} } };
  const timberSpec = { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Warm straight wood grain', roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: {
    baseColor: {kind:'resource',resourceId:'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color'},
    normal: {kind:'resource',resourceId:'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal'},
    metallicRoughness: {kind:'resource',resourceId:'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness'} } };
  const stone = await compilePortableMaterialSpecV2({...masonrySpec, name:'Troy limestone',baseColor:0xcdbf9f});
  const plaster = await compilePortableMaterialSpecV2({...masonrySpec,name:'Troy plastered mudbrick',baseColor:0xe3d8c0});
  const timber = await compilePortableMaterialSpecV2({...timberSpec,name:'Troy timber',baseColor:0x6b4a2e});
  const crimson = await compilePortableMaterialSpecV2({...timberSpec,name:'Troy crimson painted timber',baseColor:0x8c2f2a});
  // Limestone and plaster finishes derive from the pinned masonry material.
  // Smooth opaque surfaces retain its packed roughness response; timber keeps its grain.
  for (const m of [stone,plaster]) { m.map=null; m.normalMap=null; }
  for (const m of [stone,plaster,timber,crimson]) {
    for(const key of ['map','normalMap','metalnessMap','roughnessMap']) if(m[key]) {m[key].wrapS=THREE.RepeatWrapping;m[key].wrapT=THREE.RepeatWrapping;}
  }
  // Merge static primitives by material and architectural role while keeping a removable roof.
  const batches = {};
  const roof = new THREE.Group(); roof.name='Roof'; root.add(roof);
  function put(name, mat, geo, pos, parent=root) {
    const g=geo.clone(); g.translate(...pos);
    if(!batches[name]) batches[name]={mat,parent,geos:[]};
    batches[name].geos.push(g);
  }
  function box(name,mat,size,pos,parent=root) {
    const g=boxGeo(...size).clone(); const a=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
    const repeat=mat===stone||mat===plaster?2:1;
    for(let i=0;i<a.count;i++) {
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));
      const u=nx>.5?a.getZ(i):a.getX(i),v=ny>.5?a.getZ(i):a.getY(i);
      uv.setXY(i,u/repeat,v/repeat);
    }
    put(name,mat,g,pos,parent);
  }
  function cyl(name,mat,rt,rb,h,pos) {put(name,mat,remapUV(cylinderGeo(rt,rb,h,12),{scale:[1,h]}),pos);}
  function footing(name,size,pos) {
    const g=boxGeo(...size).clone(),a=g.getAttribute('position');
    for(let i=0;i<a.count;i++) if(a.getY(i)<0) a.setX(i,a.getX(i)*1.28);
    g.computeVertexNormals();put(name,stone,g,pos);
  }
  box('FoundationAndFloor',stone,[8.8,.45,14.4],[0,.225,0]);
  // Shallow approach steps leave a full-width path to the porch and doorway.
  box('FoundationAndFloor',stone,[4.7,.15,.55],[0,.075,7.975]);
  box('FoundationAndFloor',stone,[4.7,.30,.55],[0,.15,7.425]);
  footing('SlopedStoneFootings',[.8,.75,10.8],[-3.8,.825,-1.6]);
  footing('SlopedStoneFootings',[.8,.75,10.8],[3.8,.825,-1.6]);
  box('SlopedStoneFootings',stone,[6.8,.75,.8],[0,.825,-6.6]);
  box('HallWalls',plaster,[.65,3.45,10.6],[-3.875,2.925,-1.7]);
  box('HallWalls',plaster,[.65,3.45,10.6],[3.875,2.925,-1.7]);
  box('HallWalls',plaster,[7.1,3.45,.65],[0,2.925,-6.675]);
  // Front wall pieces expose exact finished doorway clearance for inspection.
  const jambW=(P.width-P.doorWidth)/2;
  box('DoorwayLeftPier',plaster,[jambW,4.2,.65],[-(P.doorWidth+jambW)/2,2.55,P.hallFront]);
  box('DoorwayRightPier',plaster,[jambW,4.2,.65],[(P.doorWidth+jambW)/2,2.55,P.hallFront]);
  box('DoorwayHeader',plaster,[P.doorWidth,1.1,.65],[0,4.1,P.hallFront]);
  // Timber surround lies outside the clear 2.4 x 3.1 m portal.
  for(const s of [-1,1]) box('DoorwayTimber',timber,[.20,3.1,.82],[s*1.3,2,P.hallFront]);
  box('DoorwayLintel',timber,[3.02,.30,.90],[0,3.70,P.hallFront]);
  for(const s of [-1,1]) {
    footing('SlopedStoneFootings',[.8,.75,2.8],[s*3.8,.825,5]);
    box('PorchAntae',plaster,[.65,3.45,2.8],[s*3.875,2.925,5]);
    box('PorchAntaeCaps',stone,[.86,.20,.72],[s*3.875,4.75,6.08]);
  }
  function column(name,x,z) {
    cyl('ColumnStoneBases',stone,.46,.5,.20,[x,.55,z]);
    cyl(name,crimson,.34,.29,3.55,[x,2.425,z]);
    cyl('ColumnCapitals',timber,.48,.36,.18,[x,4.29,z]);
    box('ColumnAbaci',timber,[1.02,.27,.95],[x,4.515,z]);
  }
  for(const x of [-1.65,1.65]) column('PorchColumns',x,6.05);
  for(const x of [-1.85,1.85]) for(const z of [-2.85,.85]) column('HallColumns',x,z);
  box('PorchEntablature',timber,[8.55,.34,.52],[0,4.48,6.05]);
  for(const x of [-1.85,1.85]) box('HallRoofBeams',timber,[.42,.32,10.0],[x,4.49,-1.55]);
  for(const z of [-2.85,.85]) box('HallRoofBeams',timber,[7.75,.32,.42],[0,4.49,z]);
  // Hearth rim: solid annular prism, with an inset wood/ash bed and a clear walking ring.
  const hp=[],hu=[];
  function quad(a,b,c,d){for(const v of [a,c,b,a,d,c]){hp.push(...v);hu.push(v[0]/2,v[2]/2);}}
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8,lo=.45,hi=.70;
    const v=(r,t,y)=>[r*Math.cos(t),y,P.hearthZ+r*Math.sin(t)];
    quad(v(1.1,a,hi),v(1.1,b,hi),v(.85,b,hi),v(.85,a,hi));
    quad(v(1.1,a,lo),v(1.1,b,lo),v(1.1,b,hi),v(1.1,a,hi));
    quad(v(.85,b,lo),v(.85,a,lo),v(.85,a,hi),v(.85,b,hi));
    quad(v(.85,a,lo),v(.85,b,lo),v(1.1,b,lo),v(1.1,a,lo));
  }
  const hearth=new THREE.BufferGeometry();hearth.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));hearth.setAttribute('uv',new THREE.Float32BufferAttribute(hu,2));hearth.computeVertexNormals();
  put('HearthStoneRim',stone,hearth,[0,0,0]);
  cyl('HearthFuelBed',timber,.84,.84,.07,[0,.485,P.hearthZ]);
  for(const z of [-1.22,-.98,-.74]) box('HearthFuelBed',timber,[1.0,.09,.12],[0,.565,z]);
  // Rear offering dais and low side benches support the ceremonial use of the hall.
  box('InteriorStoneFurnishings',stone,[2.6,.18,1.45],[0,.54,-5.4]);
  box('InteriorStoneFurnishings',stone,[1.45,.78,.70],[0,1.02,-5.6]);
  for(const x of [-2.8,2.8]) {
    box('InteriorStoneFurnishings',stone,[.70,.46,3.1],[x,.68,-4.05]);
    box('InteriorTimberSeats',timber,[.78,.12,3.2],[x,.97,-4.05]);
  }
  // Restrained, readable crimson bands rather than tiny sculptural ornament.
  for(const x of [-3.53,3.53]) box('CrimsonWallBands',crimson,[.05,.20,9.8],[x,3.65,-1.55]);
  box('CrimsonWallBands',crimson,[7.05,.20,.05],[0,3.65,-6.32]);
  box('PorchFrieze',crimson,[8.58,.16,.055],[0,4.51,6.335]);
  for(let i=-3;i<=3;i++) box('PorchFrieze',crimson,[.24,.34,.08],[i*.95,4.68,6.35]);
  // A flat roof with a real 2.2 m square smoke/light aperture over the hearth.
  const roofMin=-7.35,roofMax=6.65,holeMin=-2.1,holeMax=.1;
  box('RoofSlab',plaster,[9.15,.32,holeMin-roofMin],[0,4.81,(roofMin+holeMin)/2],roof);
  box('RoofSlab',plaster,[9.15,.32,roofMax-holeMax],[0,4.81,(roofMax+holeMax)/2],roof);
  for(const x of [-2.8375,2.8375]) box('RoofSlab',plaster,[3.475,.32,2.2],[x,4.81,-1],roof);
  for(const x of [-4.50,4.50]) box('RoofFascia',timber,[.20,.28,14.1],[x,4.72,-.35],roof);
  for(const z of [-7.35,6.65]) box('RoofFascia',timber,[9.2,.28,.20],[0,4.72,z],roof);
  for(const x of [-4.32,4.32]) box('RoofParapet',stone,[.25,.32,13.80],[x,5.13,-.35],roof);
  for(const z of [-7.12,6.42]) box('RoofParapet',stone,[8.42,.32,.25],[0,5.13,z],roof);
  for(const x of [-1.2,1.2]) box('LightwellCurb',stone,[.20,.30,2.60],[x,5.12,-1],roof);
  for(const z of [-2.2,.2]) box('LightwellCurb',stone,[2.2,.30,.20],[0,5.12,z],roof);
  // Exposed end-grain beam tails establish the timber roof construction in silhouette.
  for(const z of [-6,-4.5,-3,0,1.5,3,4.5]) for(const x of [-4.43,4.43]) box('RoofFascia',timber,[.48,.20,.24],[x,4.57,z],roof);
  // Consolidate each rigid material batch; retain the floor, hearth and doorway as useful inspection subjects.
  const rigid = {};
  for(const [role,b] of Object.entries(batches)) {
    const keep=['FoundationAndFloor','HearthStoneRim','DoorwayLeftPier','DoorwayRightPier','DoorwayHeader'].includes(role);
    const finish=b.mat===stone?'Stone':b.mat===plaster?'Plaster':b.mat===timber?'Timber':'Crimson';
    const name=keep?role:(b.parent===roof?'Roof':'Hall')+finish;
    if(!rigid[name]) rigid[name]={mat:b.mat,parent:b.parent,geos:[],roles:[]};
    rigid[name].geos.push(...b.geos);rigid[name].roles.push(role);
  }
  for(const [name,b] of Object.entries(rigid)) {
    const positions=[],normals=[],uvs=[];
    for(const source of b.geos) {
      const g=source.index?source.toNonIndexed():source;
      positions.push(...g.getAttribute('position').array);normals.push(...g.getAttribute('normal').array);uvs.push(...g.getAttribute('uv').array);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const part=createPart(name,g,b.mat,{parent:b.parent});
    part.userData={architecturalRoles:b.roles};
  }
  return root;
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_galley = (() => {
const meta = { name: "Greek War Galley", role: "vehicle" };
async function build() {
  const root = createRoot("GreekWarGalley");
  const body = new THREE.Group(); body.name = "GalleyConstruction"; root.add(body);
  // Author in +X, then turn the complete ship to Troy's +Z convention.
  body.rotation.y = -Math.PI / 2;
  const timberSpec = {
    schemaVersion: 2, model: "pbrMetallicRoughness", name: "Troy timber",
    roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: "opaque", alphaCutoff: .5, doubleSided: false,
    textures: {
      baseColor: { kind: "resource", resourceId: "kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color" },
      metallicRoughness: { kind: "resource", resourceId: "kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness" }
    }
  };
  const linenSpec = {
    schemaVersion: 2, model: "pbrMetallicRoughness", name: "Troy linen",
    roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: "opaque", alphaCutoff: .5, doubleSided: true,
    textures: {
      baseColor: { kind: "resource", resourceId: "kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color" },
      metallicRoughness: { kind: "resource", resourceId: "kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness" }
    }
  };
  const timber = await compilePortableMaterialSpecV2(timberSpec);
  const pitch = await compilePortableMaterialSpecV2({ ...timberSpec, name: "Pitch black timber", baseColor: 0x2b2420 });
  const linen = await compilePortableMaterialSpecV2(linenSpec);
  const blue = await compilePortableMaterialSpecV2({ ...linenSpec, name: "Greek blue woven sail marking", baseColor: 0x2f4a6b });
  const woodParts = [], blackParts = [], blueParts = [];
  function queue(geo, material, name, position = [0,0,0], rotation = [0,0,0]) {
    const mesh = new THREE.Mesh(geo, material); mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation.map(n => n * Math.PI / 180));
    mesh.updateMatrix();
    (material === pitch ? blackParts : material === blue ? blueParts : woodParts).push(mesh);
    return mesh;
  }
  function rod(name, a, b, r, material = timber, segments = 6) {
    const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const mesh = new THREE.Mesh(cylinderGeo(r,r,delta.length(),segments), material);
    mesh.name = name; mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    mesh.updateMatrix();
    (material === pitch ? blackParts : woodParts).push(mesh);
  }
  function merged(parts) {
    const p=[], n=[], uv=[];
    for (const item of parts) {
      let geo = item.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      geo.applyMatrix4(item.matrix);
      const pa=geo.getAttribute("position"), na=geo.getAttribute("normal"), ua=geo.getAttribute("uv");
      for(let i=0;i<pa.count;i++) {
        p.push(pa.getX(i),pa.getY(i),pa.getZ(i)); n.push(na.getX(i),na.getY(i),na.getZ(i));
        uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      }
    }
    return meshGeo({positions:p,normals:n,uvs:uv});
  }
  function facesGeometry(faces) {
    const p=[], uv=[];
    for(const face of faces) {
      for(const i of [0,1,2,0,2,3]) { p.push(...face[i]); uv.push(face[i][0],face[i][1]); }
    }
    return meshGeo({positions:p,uvs:uv});
  }
  // x, half beam, keel height, sheer height. A closed thick U-section leaves the cockpit open.
  const stations=[
    [-8.75,.10,2.55,3.65],[-8.25,.28,1.28,2.90],[-7.4,.62,.46,2.25],
    [-6.25,1.02,.14,1.96],[-4.8,1.37,.04,1.87],[-2.4,1.50,0,1.84],
    [0,1.53,0,1.84],[2.4,1.48,.01,1.87],[4.8,1.30,.10,1.98],
    [6.5,.91,.32,2.22],[7.6,.47,.80,2.66],[8.65,.08,1.68,3.35]
  ];
  function hullAt(x) {
    for(let i=0;i<stations.length-1;i++) {
      const a=stations[i],b=stations[i+1];
      if(x>=a[0] && x<=b[0]) {
        const t=(x-a[0])/(b[0]-a[0]);
        return { width:a[1]+(b[1]-a[1])*t, top:a[3]+(b[3]-a[3])*t };
      }
    }
    return {width:.1,top:3};
  }
  function deckPanel(name,x0,x1,y) {
    const w0=hullAt(x0).width*.80-.12,w1=hullAt(x1).width*.80-.12;
    const v=[[x0,y-.075,-w0],[x1,y-.075,-w1],[x1,y-.075,w1],[x0,y-.075,w0],
      [x0,y+.075,-w0],[x1,y+.075,-w1],[x1,y+.075,w1],[x0,y+.075,w0]];
    const faces=[[v[0],v[3],v[2],v[1]],[v[4],v[5],v[6],v[7]],
      [v[0],v[1],v[5],v[4]],[v[1],v[2],v[6],v[5]],
      [v[2],v[3],v[7],v[6]],[v[3],v[0],v[4],v[7]]];
    queue(facesGeometry(faces.map(face => face.slice().reverse())),timber,name);
  }
  function ring(s) {
    const [x,w,k,t]=s, inset=Math.min(.13,w*.36);
    const z=[-1,-.98,-.73,0,.73,.98,1], h=[1,.61,.18,0,.18,.61,1];
    const outer=z.map((v,i)=>[x,k+(t-k)*h[i],w*v]);
    const inner=z.map((v,i)=>[x,k+.14+(t-k-.14)*h[i],(w-inset)*v]).reverse();
    return outer.concat(inner);
  }
  const rings=stations.map(ring), hullFaces=[];
  for(let j=0;j<rings.length-1;j++) for(let i=0;i<14;i++) {
    const q=(i+1)%14;
    hullFaces.push([rings[j][i],rings[j+1][i],rings[j+1][q],rings[j][q]]);
  }
  let hull = facesGeometry(hullFaces);
  // Close the narrow end sections explicitly with a triangulated strip across the U wall.
  const endP=[], endUV=[];
  for(const end of [0,rings.length-1]) for(let i=0;i<6;i++) {
    let a=rings[end][i], b=rings[end][i+1], c=rings[end][12-i], d=rings[end][13-i];
    const quad=end===0 ? [a,b,c,d] : [d,c,b,a];
    for(const v of [quad[0],quad[1],quad[2],quad[0],quad[2],quad[3]]) {endP.push(...v);endUV.push(v[2],v[1]);}
  }
  queue(hull,pitch,"ThickOpenHull");
  queue(meshGeo({positions:endP,uvs:endUV}),pitch,"HullEndClosures");
  // Long timber gunwales, lower black wale and a substantial centre keel.
  for(const side of [-1,1]) {
    for(let j=0;j<stations.length-1;j++) {
      const a=stations[j],b=stations[j+1];
      rod("Gunwale_"+side+"_"+j,[a[0],a[3],side*a[1]],[b[0],b[3],side*b[1]],.085);
      rod("Wale_"+side+"_"+j,[a[0],a[2]+.64*(a[3]-a[2]),side*.97*a[1]],
        [b[0],b[2]+.64*(b[3]-b[2]),side*.97*b[1]],.045,pitch);
    }
  }
  for(let j=0;j<stations.length-1;j++) {
    const a=stations[j],b=stations[j+1];
    rod("Keel_"+j,[a[0],a[2]+.08,0],[b[0],b[2]+.08,0],.085,pitch);
  }
  // Rowers' footboards and transverse benches, with a clear centre passage.
  for(let z=-.72;z<=.73;z+=.36) queue(boxGeo(12.5,.10,.32),timber,"Footboard_"+z,[0,1.00,z]);
  for(let i=0;i<14;i++) {
    const x=-5.8+i*.89;
    const span=Math.min(2.58,2*(hullAt(x).width*.94-.16));
    queue(boxGeo(.27,.13,span),timber,"RowingBench_"+i,[x,1.50,0]);
    for(const side of [-1,1]) queue(boxGeo(.14,.48,.13),timber,"BenchLeg_"+i+"_"+side,[x,1.21,side*span*.35]);
  }
  deckPanel("SternPlatform",-7.7,-5.6,1.65);
  deckPanel("BowPlatform",5.75,7.35,1.77);
  // Short raised stern rail, joined to the sheer by uprights.
  for(const side of [-1,1]) {
    rod("SternRail_"+side,[-7.35,2.8,side*.59],[-5.85,2.40,side*1.10],.065);
    rod("SternRailPostA_"+side,[-7.35,2.25,side*.59],[-7.35,2.8,side*.59],.06);
    rod("SternRailPostB_"+side,[-5.85,1.98,side*1.10],[-5.85,2.40,side*1.10],.06);
  }
  // One tapered mast and transverse yard. Mast foot enters its load-bearing socket.
  const mastX=.35, yardY=8.65, yardX=.53, sailHalfWidth=3.85;
  queue(boxGeo(.65,.35,.65),timber,"MastSocket",[mastX,1.12,0]);
  queue(cylinderGeo(.105,.19,8.05,8),timber,"Mast",[mastX,5.075,0]);
  rod("Yard",[yardX,yardY,-4.12],[yardX,yardY,4.12],.105);
  // Sail shares this equation with its bolt ropes and woven blue emblem.
  function sailPoint(u,v,offset=0) {
    const z=(u*2-1)*sailHalfWidth*(1-.12*(1-v));
    const bottom=4.28-.42*Math.sin(Math.PI*u);
    const y=bottom+(yardY-bottom)*v;
    const x=yardX+.85*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)+offset;
    return [x,y,z];
  }
  const p=[],uv=[],idx=[], nu=16,nv=10;
  for(let j=0;j<=nv;j++) for(let i=0;i<=nu;i++) {p.push(...sailPoint(i/nu,j/nv));uv.push(i/nu*8,j/nv*9);}
  for(let j=0;j<nv;j++) for(let i=0;i<nu;i++) {
    const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1; idx.push(a,c,b,b,c,d);
  }
  const sail=createPart("SetLinenSail",meshGeo({positions:p,indices:idx,uvs:uv}),linen,{parent:body});
  markOpenShell(sail,"A deliberately thin, double-sided linen sail.");
  for(let i=0;i<16;i++) {
    rod("SailFoot_"+i,sailPoint(i/16,0),sailPoint((i+1)/16,0),.027);
    rod("SailHead_"+i,sailPoint(i/16,1),sailPoint((i+1)/16,1),.026);
  }
  for(const u of [0,1]) for(let j=0;j<10;j++) rod("SailLeech_"+u+"_"+j,sailPoint(u,j/10),sailPoint(u,(j+1)/10),.027);
  // Simple blue woven vertical bands, conforming to the billowing sail.
  for(const u0 of [.16,.81]) {
    const bp=[],buv=[],bi=[];
    for(let j=0;j<=10;j++) for(let i=0;i<=1;i++) {bp.push(...sailPoint(u0+i*.035,j/10,.012));buv.push(i,j/10);}
    for(let j=0;j<10;j++){const a=j*2;bi.push(a,a+2,a+1,a+1,a+2,a+3);}
    queue(meshGeo({positions:bp,indices:bi,uvs:buv}),blue,"GreekSailBand_"+u0);
  }
  // Standing rigging and the sheets tied to the hull, clear of the set sail.
  rod("Forestay",[mastX,9.05,0],[7.4,2.44,0],.035);
  rod("Backstay",[mastX,9.05,0],[-7.3,2.4,0],.035);
  for(const side of [-1,1]) {
    rod("Shroud_"+side,[mastX,8.95,0],[-1.5,1.9,side*1.48],.031);
    rod("YardBrace_"+side,[yardX,yardY,side*4.03],[-5.8,2.0,side*1.1],.03);
    rod("SailSheet_"+side,sailPoint(side===-1?0:1,0),[4.5,1.96,side*1.28],.033);
  }
  // Fourteen matched oars per side; broadened blades are solid six-sided prisms.
  function blade(name,a,b,width,thickness) {
    const forward=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
    const cross=new THREE.Vector3(1,0,0);
    cross.addScaledVector(forward,-cross.dot(forward)).normalize();
    const normal=new THREE.Vector3().crossVectors(forward,cross).normalize();
    const points=[];
    for(const [t,w] of [[0,.34],[.12,1],[.87,1],[1,.72]]) for(const side of [-1,1])
      points.push(new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),t).addScaledVector(cross,side*width/2*w));
    const shape=[0,2,4,6,7,5,3,1], verts=[];
    for(const s of [-1,1]) for(const v of shape) verts.push(points[v].clone().addScaledVector(normal,s*thickness/2).toArray());
    const pp=verts.flat(),ii=[];
    for(let i=1;i<7;i++){ii.push(0,i+1,i);ii.push(8,8+i,9+i);}
    for(let i=0;i<8;i++){const q=(i+1)%8;ii.push(i,q,8+q,i,8+q,8+i);}
    queue(meshGeo({positions:pp,indices:ii,uvs:verts.flatMap(v=>[v[0],v[2]])}),timber,name);
  }
  for(let i=0;i<14;i++) for(const side of [-1,1]) {
    const x=-5.8+i*.89;
    const section=hullAt(x), pivot=[x,section.top+.05,side*section.width];
    const throat=[x-.50,.57,side*4.13],tip=[x-.67,.21,side*5.00];
    const lever=(section.width-.30)/(4.13-section.width);
    const start=[x+.50*lever,pivot[1]+(pivot[1]-.57)*lever,side*.30];
    rod("OarShaft_"+i+"_"+side,start,throat,.055);
    blade("OarBlade_"+i+"_"+side,throat,tip,.27,.065);
    rod("TholePin_"+i+"_"+side,[x-.065,section.top-.06,side*section.width],[x-.065,section.top+.23,side*section.width],.045);
  }
  // Starboard quarter steering oar, larger than the rowing blades.
  const steeringA=[-6.2,2.35,1.0],steeringB=[-8.0,.69,2.38],steeringC=[-8.7,.15,2.92];
  rod("SteeringOarShaft",steeringA,steeringB,.082);
  blade("SteeringOarBlade",steeringB,steeringC,.48,.085);
  rod("SteeringMount",[-6.8,2.10,.79],[-6.8,1.7967,1.46],.08);
  // Converging prow with a simple blue bow accent, avoiding later-period trireme furniture.
  for(const side of [-1,1]) {
    queue(boxGeo(.65,.08,.025),blue,"BowFactionMark_"+side,[6.25,2.12,side*.98],[0,side*14,0]);
  }
  createPart("PitchHullAndKeel",merged(blackParts),pitch,{parent:body});
  createPart("TimberMastOarsAndRigging",merged(woodParts),timber,{parent:body});
  const blueMesh=createPart("GreekBlueSailBands",merged(blueParts),blue,{parent:body});
  markOpenShell(blueMesh,"Thin woven bands applied to the sail.");
  root.userData = { design: "Troy pack, 18 m class black galley with single set sail and 28 rowing oars", forward: "+Z", units: "metres" };
  return root;
}
return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_chariot = (() => {
const meta = {name: 'Late Bronze Age war chariot', role: 'vehicle'};
const materialSpecs = {"wood":{"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Warm straight wood grain","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness"}}},"bronze":{"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Brushed neutral metal","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness"}}},"linen":{"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Neutral woven fabric","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness"}}}};
const D = {wheelRadius: .60, wheelX: .85, axleZ: -.39, floorY: .70, halfWidth: .60, poleEnd: 2.75};
function mergePieces(pieces) {
  const positions=[], normals=[], uvs=[];
  for (const obj of pieces) {
    obj.updateMatrix();
    let g=obj.geometry.clone().applyMatrix4(obj.matrix);
    if(g.index) g=g.toNonIndexed();
    const p=g.getAttribute('position'), n=g.getAttribute('normal'), u=g.getAttribute('uv');
    for(let i=0;i<p.count;i++){
      positions.push(p.getX(i),p.getY(i),p.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      uvs.push(u?u.getX(i):0,u?u.getY(i):0);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  return g;
}
function rimGeometry(inner,outer,width,segments=32){
  const pos=[], uv=[];
  function quad(a,b,c,d,u0,u1){
    for(const [p,u,v] of [[a,u0,0],[b,u1,0],[c,u1,1],[a,u0,0],[c,u1,1],[d,u0,1]]){pos.push(...p);uv.push(u,v);}
  }
  for(let i=0;i<segments;i++){
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
    const v=(r,t,x)=>[x,r*Math.cos(t),r*Math.sin(t)];
    const l=-width/2,h=width/2;
    quad(v(outer,a,l),v(outer,b,l),v(outer,b,h),v(outer,a,h),i/segments,(i+1)/segments);
    quad(v(inner,a,h),v(inner,b,h),v(inner,b,l),v(inner,a,l),i/segments,(i+1)/segments);
    quad(v(inner,a,l),v(inner,b,l),v(outer,b,l),v(outer,a,l),i/segments,(i+1)/segments);
    quad(v(outer,a,h),v(outer,b,h),v(inner,b,h),v(inner,a,h),i/segments,(i+1)/segments);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();return g;
}
async function build(){
  const root=createRoot('WarChariot');
  root.position.z=-.93;
  root.userData={period:'Late Bronze Age, about 1200 BC',style:'Aegean rail chariot interpretation',forward:'+Z',units:'metres',crewCapacity:2};
  const wood=await compilePortableMaterialSpecV2(materialSpecs.wood);
  wood.name='Troy timber';
  const bronze=await compilePortableMaterialSpecV2({...materialSpecs.bronze,baseColor:0xb08d57});
  bronze.name='Troy bronze';
  const cloth=await compilePortableMaterialSpecV2({...materialSpecs.linen,baseColor:0x8c2f2a});
  cloth.name='Troy crimson woven screen';
  const frame=[],fittings=[],screens=[];
  const add=(list,name,g,m,p=[0,0,0],r=[0,0,0])=>list.push(createPart(name,g,m,{position:p,rotation:r}));
  const beam=(list,name,a,b,rad,m)=>list.push(beamBetween(name,a,b,rad,m,{segments:8}));
  for(let i=0;i<8;i++){
    const left=-.5985+i*.15,right=left+.147;
    const shape=new THREE.Shape();
    shape.moveTo(left,-.50);shape.lineTo(right,-.50);
    for(let k=0;k<=4;k++){
      const x=right+(left-right)*k/4;
      shape.lineTo(x,.12+.48*Math.sqrt(Math.max(0,1-(x/.60)**2)));
    }
    shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false,steps:1});
    g.rotateX(Math.PI/2);
    add(frame,'floor_plank_'+i,g,wood,[0,D.floorY,0]);
  }
  for(const x of [-.46,.46]) add(frame,'longitudinal_sill_'+x,boxGeo(.075,.095,.91),wood,[x,.603,-.045]);
  for(const z of [D.axleZ,.34]) add(frame,'floor_bolster_'+z,boxGeo(z===D.axleZ?1.28:.99,.08,.12),wood,[0,.625,z]);
  const railPath=[[-.60,1.17,-.50],[-.60,1.30,.12]];
  for(let i=1;i<=12;i++){const a=i*Math.PI/12;railPath.push([-.60*Math.cos(a),1.30+.08*Math.sin(a),.12+.48*Math.sin(a)]);}
  railPath.push([.60,1.17,-.50]);
  const profile=Array.from({length:8},(_,i)=>[.038*Math.cos(i*Math.PI/4),.038*Math.sin(i*Math.PI/4)]);
  add(frame,'bent_upper_rail',sweepProfile(profile,railPath,{up:[0,1,0],creaseAngle:40}),wood);
  const lowerPath=railPath.map(p=>[p[0],.72,p[2]]);
  add(frame,'lower_car_rail',sweepProfile(profile,lowerPath,{up:[0,1,0],creaseAngle:40}),wood);
  const stations=[railPath[0],railPath[1],railPath[4],railPath[7],railPath[10],railPath[13],railPath[14]];
  stations.forEach((p,i)=>{
    beam(frame,'rail_post_'+i,[p[0],.69,p[2]],p,.031,wood);
    add(fittings,'post_socket_'+i,cylinderGeo(.045,.045,.075,8),bronze,[p[0],.742,p[2]]);
  });
  for(const side of [-1,1]){
    beam(frame,'side_diagonal_'+side,[side*.60,.72,-.48],[side*.60,1.30,.12],.024,wood);
    add(fittings,'axle_mount_'+side,boxGeo(.14,.16,.17),bronze,[side*.46,.60,D.axleZ]);
  }
  // Lower front screen remains below the open handrail and leaves the rear open.
  for(let i=1;i<13;i++){
    const a=lowerPath[i],b=lowerPath[i+1];
    const mid=[(a[0]+b[0])/2,.918,(a[2]+b[2])/2];
    const len=Math.hypot(b[0]-a[0],b[2]-a[2]);
    const angle=Math.atan2(-(b[2]-a[2]),b[0]-a[0])*180/Math.PI;
    add(screens,'front_screen_'+i,boxGeo(len+.005,.345,.017),cloth,mid,[0,angle,0]);
  }
  createPart('car_frame',mergePieces(frame),wood,{parent:root});
  createPart('bronze_fittings',mergePieces(fittings),bronze,{parent:root});
  createPart('crimson_front_screen',mergePieces(screens),cloth,{parent:root});
  createPart('axle',cylinderGeo(.058,.058,1.96,12),wood,{position:[0,.60,D.axleZ],rotation:[0,0,90],parent:root});
  const polePath=[[0,.57,D.axleZ],[0,.58,.30],[0,.66,.75],[0,.95,1.55],[0,1.19,2.35],[0,1.24,D.poleEnd]];
  const poleProfile=[[-.044,-.045],[.044,-.045],[.044,.045],[-.044,.045]];
  createPart('draft_pole',sweepProfile(poleProfile,polePath,{up:[0,1,0],creaseAngle:60}),wood,{parent:root});
  const yokePath=[[-1.04,1.28,2.75],[-.82,1.29,2.75],[-.61,1.18,2.75],[-.36,1.18,2.75],[-.17,1.26,2.75],[.17,1.26,2.75],[.36,1.18,2.75],[.61,1.18,2.75],[.82,1.29,2.75],[1.04,1.28,2.75]];
  createPart('two_horse_yoke',sweepProfile([[-.045,-.045],[.045,-.045],[.045,.045],[-.045,.045]],yokePath,{up:[0,1,0]}),wood,{parent:root});
  const yokeFittings=[];
  for(const x of [-.50,.50]){
    add(yokeFittings,'yoke_pad_'+x,boxGeo(.31,.095,.20),cloth,[x,1.115,2.75]);
  }
  add(yokeFittings,'pole_yoke_lashing',boxGeo(.125,.16,.15),cloth,[0,1.24,2.75]);
  createPart('yoke_bindings',mergePieces(yokeFittings),cloth,{parent:root});
  for(const [side,x] of [['left',-D.wheelX],['right',D.wheelX]]){
    const pivot=new THREE.Group();pivot.name='wheel_'+side;pivot.position.set(x,.60,D.axleZ);root.add(pivot);
    pivot.userData={axis:[1,0,0],radius:D.wheelRadius};
    const pieces=[];
    add(pieces,side+'_rim',rimGeometry(.48,.60,.15),wood);
    add(pieces,side+'_hub',cylinderGeo(.086,.086,.27,12),wood,[0,0,0],[0,0,90]);
    for(let i=0;i<4;i++){
      const a=Math.PI/4+i*Math.PI/2;
      beam(pieces,side+'_spoke_'+i,[0,.055*Math.cos(a),.055*Math.sin(a)],[0,.542*Math.cos(a),.542*Math.sin(a)],.032,wood);
    }
    createPart(side+'_wooden_wheel',mergePieces(pieces),wood,{parent:pivot});
    const metal=[];
    for(const dx of [-.093,.093]) add(metal,side+'_hub_band_'+dx,rimGeometry(.082,.091,.035,12),bronze,[dx,0,0]);
    const outer=side==='left'?-.143:.143;
    add(metal,side+'_axle_cap',cylinderGeo(.059,.059,.027,8),bronze,[outer,0,0],[0,0,90]);
    createPart(side+'_hub_fittings',mergePieces(metal),bronze,{parent:pivot});
  }
  // A hollow side quiver stays forward of the spinning right wheel.
  const quiver=new THREE.Group();quiver.name='right_javelin_quiver';
  quiver.position.set(.69,.80,.28);quiver.rotation.x=12*Math.PI/180;root.add(quiver);
  const sheath=await compilePortableMaterialSpecV2({...materialSpecs.linen,baseColor:0x7a5536});
  sheath.name='Troy leather-coloured quiver';
  const casing=[],quiverMetal=[],shafts=[];
  add(casing,'hollow_quiver_body',rimGeometry(.085,.105,.63,12),sheath,[0,.315,0],[0,0,90]);
  add(casing,'quiver_closed_bottom',cylinderGeo(.105,.105,.035,12),sheath,[0,.0175,0]);
  for(const y of [.10,.56]) add(quiverMetal,'quiver_band_'+y,rimGeometry(.103,.115,.045,12),bronze,[0,y,0],[0,0,90]);
  const javelins=[[-.043,-.030,1.55],[.014,-.042,1.67],[.052,.006,1.60],[-.010,.018,1.72],[-.047,.035,1.63]];
  javelins.forEach(([x,z,h],i)=>{
    add(shafts,'javelin_shaft_'+i,cylinderGeo(.014,.017,h-.035,8),wood,[x,(h+.035)/2,z]);
    add(quiverMetal,'javelin_socket_'+i,cylinderGeo(.020,.024,.065,8),bronze,[x,h-.015,z]);
    add(quiverMetal,'javelin_head_'+i,bladeGeo({length:.21,baseWidth:.075,thickness:.014,tipLength:.16,edgeBevel:1}),bronze,[x,h,z],[0,i*37,0]);
  });
  createPart('quiver_sheath',mergePieces(casing),sheath,{parent:quiver});
  createPart('quiver_bands_and_javelin_heads',mergePieces(quiverMetal),bronze,{parent:quiver});
  createPart('five_javelin_shafts',mergePieces(shafts),wood,{parent:quiver});
  for(const [name,y] of [['lower',.10],['upper',.56]]){
    const angle=12*Math.PI/180;
    const qy=.80+y*Math.cos(angle),qz=.28+y*Math.sin(angle);
    const end=[.645,qy+.095*Math.sin(angle),qz-.095*Math.cos(angle)];
    beamBetween('quiver_'+name+'_mount',[.60,qy,.12],end,.022,bronze,{segments:8,parent:root});
  }
  return root;
}
function animate(){
  const keys=Array.from({length:9},(_,i)=>({time:i*.25,rotation:[i*45,0,0]}));
  return [createClip('wheel_spin',2,[rotationTrack('wheel_left',keys),rotationTrack('wheel_right',keys)],{loop:true})];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_horse = (() => {
const meta = {
  name: 'Horse',
  role: 'prop'
};

async function build() {
  const root = createRoot('Horse');

  // Pinned pack materials tinted from Troy palette:
  // 1. horseCoat: troy-linen tinted with leather (#7a5536)
  const horseCoat = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'HorseCoat',
    baseColor: 0x7a5536,
    roughness: 0.85,
    metalness: 0.05,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' }
    }
  });

  // 2. darkDetails: troy-timber / linen tinted with pitch (#2b2420) for mane, tail, hooves & leather harness straps
  const darkDetails = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'DarkDetails',
    baseColor: 0x2b2420,
    roughness: 0.90,
    metalness: 0.05,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' }
    }
  });

  // 3. bronzeMetal: troy-bronze tinted with bronze (#b08d57) for bits, phalera, harness fittings
  const bronzeMetal = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'BronzeMetal',
    baseColor: 0xb08d57,
    roughness: 0.45,
    metalness: 0.85,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' }
    }
  });

  // Main articulated body root at Y = 0.95
  const body = createPivot('Body', [0, 0.95, 0], root);

  // --- Torso / Barrel ---
  // Mid barrel (ribcage / abdomen)
  createPart('Torso_Barrel', cylinderGeo(0.23, 0.24, 0.50, 8), horseCoat, {
    position: [0, 0.08, -0.02],
    rotation: [90, 0, 0],
    parent: body
  });

  // Chest / forequarters
  createPart('Torso_Chest', cylinderGeo(0.24, 0.22, 0.36, 8), horseCoat, {
    position: [0, 0.10, 0.26],
    rotation: [90, 0, 0],
    parent: body
  });

  // Breast bulge
  createPart('Chest_Bulge', sphereGeo(0.18, 8, 6), horseCoat, {
    position: [0, 0.04, 0.44],
    scale: [1.1, 1.2, 0.8],
    parent: body
  });

  // Hindquarters / Croup / Haunches
  createPart('Torso_Croup', cylinderGeo(0.22, 0.23, 0.38, 8), horseCoat, {
    position: [0, 0.12, -0.32],
    rotation: [90, 0, 0],
    parent: body
  });

  // Buttocks
  createPart('Buttocks', sphereGeo(0.19, 8, 6), horseCoat, {
    position: [0, 0.08, -0.50],
    scale: [1.15, 1.1, 0.9],
    parent: body
  });

  // Withers ridge (peaks at shoulder height: 0.95 + 0.45 = 1.40 m)
  createPart('Withers_Ridge', boxGeo(0.14, 0.18, 0.30), horseCoat, {
    position: [0, 0.36, 0.28],
    rotation: [25, 0, 0],
    parent: body
  });

  // --- Chariot Harness on Torso ---
  // Girth strap around belly
  createPart('Girth_Strap', cylinderGeo(0.245, 0.245, 0.07, 8), darkDetails, {
    position: [0, 0.08, 0.14],
    rotation: [90, 0, 0],
    parent: body
  });

  // Yoke pad on withers
  createPart('Yoke_Pad', boxGeo(0.20, 0.05, 0.16), darkDetails, {
    position: [0, 0.43, 0.25],
    rotation: [15, 0, 0],
    parent: body
  });

  // Bronze terret / rein guide rings on yoke pad
  createPart('Terret_Ring_L', cylinderGeo(0.03, 0.03, 0.015, 6), bronzeMetal, {
    position: [-0.09, 0.47, 0.25],
    rotation: [0, 0, 90],
    parent: body
  });
  createPart('Terret_Ring_R', cylinderGeo(0.03, 0.03, 0.015, 6), bronzeMetal, {
    position: [0.09, 0.47, 0.25],
    rotation: [0, 0, 90],
    parent: body
  });

  // Chariot breastband / breastcollar across chest
  createPart('Breastcollar', boxGeo(0.44, 0.07, 0.04), darkDetails, {
    position: [0, 0.12, 0.48],
    rotation: [-10, 0, 0],
    parent: body
  });

  // Decorative bronze central boss / phalera on breastcollar
  createPart('Breast_Phalera', cylinderGeo(0.055, 0.055, 0.02, 8), bronzeMetal, {
    position: [0, 0.12, 0.51],
    rotation: [90, 0, 0],
    parent: body
  });

  // --- Neck & Head Hierarchy ---
  const neck = createPivot('Neck', [0, 0.22, 0.34], body);

  // Muscular neck
  createPart('Neck_Lower', cylinderGeo(0.14, 0.20, 0.32, 6), horseCoat, {
    position: [0, 0.15, 0.10],
    rotation: [-42, 0, 0],
    parent: neck
  });
  createPart('Neck_Upper', cylinderGeo(0.11, 0.15, 0.28, 6), horseCoat, {
    position: [0, 0.30, 0.24],
    rotation: [-48, 0, 0],
    parent: neck
  });

  // Bronze Age standing hogged mane along neck crest
  createPart('Mane_Lower', boxGeo(0.05, 0.10, 0.30), darkDetails, {
    position: [0, 0.24, 0.07],
    rotation: [-42, 0, 0],
    parent: neck
  });
  createPart('Mane_Upper', boxGeo(0.05, 0.10, 0.26), darkDetails, {
    position: [0, 0.40, 0.21],
    rotation: [-48, 0, 0],
    parent: neck
  });

  // Head pivot
  const head = createPivot('Head', [0, 0.40, 0.32], neck);

  // Skull / forehead
  createPart('Head_Skull', boxGeo(0.18, 0.18, 0.20), horseCoat, {
    position: [0, 0.04, 0.06],
    rotation: [-18, 0, 0],
    parent: head
  });

  // Jowls / cheeks
  createPart('Cheek_L', sphereGeo(0.07, 6, 4), horseCoat, {
    position: [-0.08, 0.00, 0.02],
    scale: [0.8, 1.1, 1.2],
    parent: head
  });
  createPart('Cheek_R', sphereGeo(0.07, 6, 4), horseCoat, {
    position: [0.08, 0.00, 0.02],
    scale: [0.8, 1.1, 1.2],
    parent: head
  });

  // Tapered muzzle / bridge of nose
  createPart('Head_Muzzle', cylinderGeo(0.065, 0.09, 0.24, 6), horseCoat, {
    position: [0, -0.06, 0.20],
    rotation: [-62, 0, 0],
    parent: head
  });

  // Nose tip & chin
  createPart('Nose_Tip', boxGeo(0.11, 0.09, 0.08), darkDetails, {
    position: [0, -0.12, 0.31],
    rotation: [-45, 0, 0],
    parent: head
  });

  // Ears
  createPart('Ear_L', coneGeo(0.035, 0.14, 4), horseCoat, {
    position: [-0.07, 0.18, -0.01],
    rotation: [15, -12, -15],
    parent: head
  });
  createPart('Ear_R', coneGeo(0.035, 0.14, 4), horseCoat, {
    position: [0.07, 0.18, -0.01],
    rotation: [15, 12, 15],
    parent: head
  });

  // Forelock
  createPart('Forelock', boxGeo(0.04, 0.07, 0.08), darkDetails, {
    position: [0, 0.14, 0.06],
    rotation: [-20, 0, 0],
    parent: head
  });

  // --- Chariot Bridle & Bit on Head ---
  // Browband strap
  createPart('Bridle_Browband', boxGeo(0.20, 0.035, 0.03), darkDetails, {
    position: [0, 0.10, 0.08],
    rotation: [-20, 0, 0],
    parent: head
  });
  // Noseband strap
  createPart('Bridle_Noseband', cylinderGeo(0.075, 0.075, 0.035, 6), darkDetails, {
    position: [0, -0.08, 0.23],
    rotation: [-62, 0, 0],
    parent: head
  });
  // Cheek straps
  createPart('Cheekstrap_L', boxGeo(0.02, 0.16, 0.02), darkDetails, {
    position: [-0.095, -0.02, 0.12],
    rotation: [-38, 0, 0],
    parent: head
  });
  createPart('Cheekstrap_R', boxGeo(0.02, 0.16, 0.02), darkDetails, {
    position: [0.095, -0.02, 0.12],
    rotation: [-38, 0, 0],
    parent: head
  });
  // Bronze bit rings at mouth corners
  createPart('Bit_Ring_L', cylinderGeo(0.035, 0.035, 0.015, 6), bronzeMetal, {
    position: [-0.09, -0.11, 0.28],
    rotation: [0, 0, 90],
    parent: head
  });
  createPart('Bit_Ring_R', cylinderGeo(0.035, 0.035, 0.015, 6), bronzeMetal, {
    position: [0.09, -0.11, 0.28],
    rotation: [0, 0, 90],
    parent: head
  });
  // Bronze bridle boss studs
  createPart('Bridle_Stud_L', sphereGeo(0.02, 4, 3), bronzeMetal, {
    position: [-0.10, 0.08, 0.06],
    parent: head
  });
  createPart('Bridle_Stud_R', sphereGeo(0.02, 4, 3), bronzeMetal, {
    position: [0.10, 0.08, 0.06],
    parent: head
  });

  // --- Tail ---
  const tail = createPivot('Tail', [0, 0.14, -0.56], body);
  createPart('Tail_Base', cylinderGeo(0.06, 0.045, 0.18, 6), horseCoat, {
    position: [0, -0.06, -0.06],
    rotation: [35, 0, 0],
    parent: tail
  });
  createPart('Tail_Hair_Upper', cylinderGeo(0.05, 0.07, 0.32, 6), darkDetails, {
    position: [0, -0.22, -0.12],
    rotation: [25, 0, 0],
    parent: tail
  });
  createPart('Tail_Hair_Lower', cylinderGeo(0.07, 0.03, 0.35, 6), darkDetails, {
    position: [0, -0.48, -0.18],
    rotation: [15, 0, 0],
    parent: tail
  });

  // --- Legs Helper ---
  function buildFrontLeg(prefix, side) {
    const x = side * 0.18;
    const upper = createPivot(`Leg_F${prefix}_Upper`, [x, 0.05, 0.36], body);

    // Shoulder & upper arm
    createPart(`Shoulder_F${prefix}`, cylinderGeo(0.07, 0.05, 0.44, 6), horseCoat, {
      position: [0, -0.22, 0],
      parent: upper
    });

    const lower = createPivot(`Leg_F${prefix}_Lower`, [0, -0.44, 0], upper);

    // Knee joint
    createPart(`Knee_F${prefix}`, cylinderGeo(0.052, 0.045, 0.08, 6), horseCoat, {
      position: [0, 0, 0.01],
      parent: lower
    });
    // Cannon bone
    createPart(`Cannon_F${prefix}`, cylinderGeo(0.042, 0.036, 0.34, 6), horseCoat, {
      position: [0, -0.19, 0],
      parent: lower
    });

    const hoof = createPivot(`Leg_F${prefix}_Hoof`, [0, -0.42, 0], lower);

    // Fetlock & pastern
    createPart(`Fetlock_F${prefix}`, cylinderGeo(0.040, 0.045, 0.06, 6), horseCoat, {
      position: [0, 0.02, 0.01],
      parent: hoof
    });
    // Solid dark hoof: height = 0.14, base sits exactly on ground Y = 0.00
    createPart(`Hoof_F${prefix}`, cylinderGeo(0.052, 0.070, 0.14, 8), darkDetails, {
      position: [0, -0.07, 0.015],
      parent: hoof
    });
  }

  function buildHindLeg(prefix, side) {
    const x = side * 0.18;
    const upper = createPivot(`Leg_B${prefix}_Upper`, [x, 0.08, -0.38], body);

    // Muscular haunch / thigh / gaskin
    createPart(`Thigh_B${prefix}`, cylinderGeo(0.10, 0.065, 0.45, 6), horseCoat, {
      position: [0, -0.225, -0.04],
      rotation: [12, 0, 0],
      parent: upper
    });

    const lower = createPivot(`Leg_B${prefix}_Lower`, [0, -0.45, -0.08], upper);

    // Hock joint (angled backward)
    createPart(`Hock_B${prefix}`, boxGeo(0.08, 0.10, 0.12), horseCoat, {
      position: [0, 0, -0.02],
      parent: lower
    });
    // Hind cannon bone
    createPart(`Cannon_B${prefix}`, cylinderGeo(0.044, 0.038, 0.34, 6), horseCoat, {
      position: [0, -0.19, 0.03],
      rotation: [-8, 0, 0],
      parent: lower
    });

    const hoof = createPivot(`Leg_B${prefix}_Hoof`, [0, -0.42, 0.06], lower);

    // Fetlock & pastern
    createPart(`Fetlock_B${prefix}`, cylinderGeo(0.042, 0.046, 0.06, 6), horseCoat, {
      position: [0, 0.02, 0],
      parent: hoof
    });
    // Solid dark hoof: base sits exactly on ground Y = 0.00
    createPart(`Hoof_B${prefix}`, cylinderGeo(0.052, 0.070, 0.14, 8), darkDetails, {
      position: [0, -0.07, 0.005],
      parent: hoof
    });
  }

  // Front legs: Left (-X) and Right (+X)
  buildFrontLeg('L', -1);
  buildFrontLeg('R', 1);

  // Hind legs: Left (-X) and Right (+X)
  buildHindLeg('L', -1);
  buildHindLeg('R', 1);

  return root;
}

function animate(root) {
  // -------------------------------------------------------------
  // Clip 1: Stand (Idle breathing, alert, planted hooves)
  // -------------------------------------------------------------
  const standDuration = 2.4;
  const standTracks = [
    // Subtle breathing rise and fall
    positionTrack('Joint_Body', [
      { time: 0.0, position: [0, 0.95, 0] },
      { time: 0.6, position: [0, 0.954, 0] },
      { time: 1.2, position: [0, 0.95, 0] },
      { time: 1.8, position: [0, 0.948, 0] },
      { time: 2.4, position: [0, 0.95, 0] }
    ], 'CUBICSPLINE'),

    rotationTrack('Joint_Body', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.6, rotation: [0.4, 0, 0] },
      { time: 1.2, rotation: [0, 0, 0] },
      { time: 1.8, rotation: [-0.3, 0, 0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    // Alert head & neck breathing motions
    rotationTrack('Joint_Neck', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.8, rotation: [1.8, 0, 0] },
      { time: 1.6, rotation: [-1.0, 1.2, 0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    rotationTrack('Joint_Head', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.8, rotation: [-1.2, 0, 0] },
      { time: 1.6, rotation: [0.8, -1.8, 0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    // Tail gentle resting swish
    rotationTrack('Joint_Tail', [
      { time: 0.0, rotation: [0, 0, 0] },
      { time: 0.6, rotation: [-2.0, 4.0, 1.0] },
      { time: 1.2, rotation: [0, 0, 0] },
      { time: 1.8, rotation: [-1.5, -4.0, -1.0] },
      { time: 2.4, rotation: [0, 0, 0] }
    ], 'CUBICSPLINE'),

    // All leg joints held firmly in rest pose (touching ground)
    rotationTrack('Joint_Leg_FL_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FL_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FL_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),

    rotationTrack('Joint_Leg_FR_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FR_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_FR_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),

    rotationTrack('Joint_Leg_BL_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BL_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BL_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),

    rotationTrack('Joint_Leg_BR_Upper', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BR_Lower', [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR'),
    rotationTrack('Joint_Leg_BR_Hoof',  [{ time: 0.0, rotation: [0, 0, 0] }, { time: 2.4, rotation: [0, 0, 0] }], 'LINEAR')
  ];

  // -------------------------------------------------------------
  // Clip 2: Gallop (Dynamic, looped rotary gallop cycle)
  // -------------------------------------------------------------
  const gallopDuration = 0.64;
  const gallopTracks = [
    // Body translation (surge and vertical leap)
    positionTrack('Joint_Body', [
      { time: 0.00, position: [0, 0.93, 0.00] },
      { time: 0.16, position: [0, 0.98, 0.02] },
      { time: 0.32, position: [0, 1.03, 0.04] },
      { time: 0.48, position: [0, 0.95, 0.01] },
      { time: 0.64, position: [0, 0.93, 0.00] }
    ], 'CUBICSPLINE'),

    // Body pitch (positive X tilts top forward/down)
    rotationTrack('Joint_Body', [
      { time: 0.00, rotation: [-5, 0, 0] },
      { time: 0.16, rotation: [8, 0, -1] },
      { time: 0.32, rotation: [2, 0, 0] },
      { time: 0.48, rotation: [-7, 0, 1] },
      { time: 0.64, rotation: [-5, 0, 0] }
    ], 'CUBICSPLINE'),

    // Neck counter-balancing pitch
    rotationTrack('Joint_Neck', [
      { time: 0.00, rotation: [-6, 0, 0] },
      { time: 0.16, rotation: [7, 0, 0] },
      { time: 0.32, rotation: [-4, 0, 0] },
      { time: 0.48, rotation: [-8, 0, 0] },
      { time: 0.64, rotation: [-6, 0, 0] }
    ], 'CUBICSPLINE'),

    // Head stabilization
    rotationTrack('Joint_Head', [
      { time: 0.00, rotation: [3, 0, 0] },
      { time: 0.16, rotation: [-4, 0, 0] },
      { time: 0.32, rotation: [2, 0, 0] },
      { time: 0.48, rotation: [4, 0, 0] },
      { time: 0.64, rotation: [3, 0, 0] }
    ], 'CUBICSPLINE'),

    // Tail streaming in the wind
    rotationTrack('Joint_Tail', [
      { time: 0.00, rotation: [-20, 0, 0] },
      { time: 0.16, rotation: [-32, 2, 0] },
      { time: 0.32, rotation: [-40, -1, 0] },
      { time: 0.48, rotation: [-28, 2, 0] },
      { time: 0.64, rotation: [-20, 0, 0] }
    ], 'CUBICSPLINE'),

    // Front Left Leg (trailing foreleg)
    rotationTrack('Joint_Leg_FL_Upper', [
      { time: 0.00, rotation: [35, 0, 0] },
      { time: 0.16, rotation: [-15, 0, 0] },
      { time: 0.32, rotation: [-45, 0, 0] },
      { time: 0.48, rotation: [-10, 0, 0] },
      { time: 0.64, rotation: [35, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FL_Lower', [
      { time: 0.00, rotation: [75, 0, 0] },
      { time: 0.16, rotation: [10, 0, 0] },
      { time: 0.32, rotation: [5, 0, 0] },
      { time: 0.48, rotation: [15, 0, 0] },
      { time: 0.64, rotation: [75, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FL_Hoof', [
      { time: 0.00, rotation: [-25, 0, 0] },
      { time: 0.16, rotation: [5, 0, 0] },
      { time: 0.32, rotation: [0, 0, 0] },
      { time: 0.48, rotation: [-10, 0, 0] },
      { time: 0.64, rotation: [-25, 0, 0] }
    ], 'CUBICSPLINE'),

    // Front Right Leg (lead foreleg)
    rotationTrack('Joint_Leg_FR_Upper', [
      { time: 0.00, rotation: [42, 0, 0] },
      { time: 0.16, rotation: [-25, 0, 0] },
      { time: 0.32, rotation: [-52, 0, 0] },
      { time: 0.48, rotation: [-20, 0, 0] },
      { time: 0.64, rotation: [42, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FR_Lower', [
      { time: 0.00, rotation: [85, 0, 0] },
      { time: 0.16, rotation: [15, 0, 0] },
      { time: 0.32, rotation: [5, 0, 0] },
      { time: 0.48, rotation: [10, 0, 0] },
      { time: 0.64, rotation: [85, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_FR_Hoof', [
      { time: 0.00, rotation: [-30, 0, 0] },
      { time: 0.16, rotation: [10, 0, 0] },
      { time: 0.32, rotation: [0, 0, 0] },
      { time: 0.48, rotation: [-5, 0, 0] },
      { time: 0.64, rotation: [-30, 0, 0] }
    ], 'CUBICSPLINE'),

    // Hind Left Leg (lead hind leg)
    rotationTrack('Joint_Leg_BL_Upper', [
      { time: 0.00, rotation: [-35, 0, 0] },
      { time: 0.16, rotation: [15, 0, 0] },
      { time: 0.32, rotation: [48, 0, 0] },
      { time: 0.48, rotation: [-5, 0, 0] },
      { time: 0.64, rotation: [-35, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BL_Lower', [
      { time: 0.00, rotation: [-55, 0, 0] },
      { time: 0.16, rotation: [-15, 0, 0] },
      { time: 0.32, rotation: [-40, 0, 0] },
      { time: 0.48, rotation: [30, 0, 0] },
      { time: 0.64, rotation: [-55, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BL_Hoof', [
      { time: 0.00, rotation: [15, 0, 0] },
      { time: 0.16, rotation: [-10, 0, 0] },
      { time: 0.32, rotation: [-25, 0, 0] },
      { time: 0.48, rotation: [10, 0, 0] },
      { time: 0.64, rotation: [15, 0, 0] }
    ], 'CUBICSPLINE'),

    // Hind Right Leg (trailing hind leg)
    rotationTrack('Joint_Leg_BR_Upper', [
      { time: 0.00, rotation: [-45, 0, 0] },
      { time: 0.16, rotation: [5, 0, 0] },
      { time: 0.32, rotation: [40, 0, 0] },
      { time: 0.48, rotation: [-15, 0, 0] },
      { time: 0.64, rotation: [-45, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BR_Lower', [
      { time: 0.00, rotation: [-65, 0, 0] },
      { time: 0.16, rotation: [-5, 0, 0] },
      { time: 0.32, rotation: [-35, 0, 0] },
      { time: 0.48, rotation: [40, 0, 0] },
      { time: 0.64, rotation: [-65, 0, 0] }
    ], 'CUBICSPLINE'),
    rotationTrack('Joint_Leg_BR_Hoof', [
      { time: 0.00, rotation: [20, 0, 0] },
      { time: 0.16, rotation: [-5, 0, 0] },
      { time: 0.32, rotation: [-20, 0, 0] },
      { time: 0.48, rotation: [15, 0, 0] },
      { time: 0.64, rotation: [20, 0, 0] }
    ], 'CUBICSPLINE')
  ];

  return [
    createClip('Stand', standDuration, standTracks, { loop: true }),
    createClip('Gallop', gallopDuration, gallopTracks, { loop: true }),
    createClip('stand', standDuration, standTracks, { loop: true }),
    createClip('gallop', gallopDuration, gallopTracks, { loop: true })
  ];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_wooden = (() => {
const meta = { name: 'Trojan Horse', role: 'wonder' };

const TIMBER_SPEC = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Warm straight wood grain',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' },
  },
};
const BRONZE_SPEC = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};

// Named dimensions (metres)
const P = {
  deckHalfW: 1.6, deckHalfL: 3.2, deckTop: 1.0, deckThick: 0.26,
  wheelR: 0.6, wheelX: 1.9, axleZ: 2.1,
  torsoY: 4.7, wall: 0.14, bellyY: 3.85,
  hatchW: 0.8, hatchL: 1.5, hatchOpenDeg: 85,
};

// Cross-section for lofts, in the profile's XZ plane. zn is the extent toward -z' (the crest/top side), zp toward +z'.
function ring(w, zn, zp) {
  return [[0.7 * w, -zn], [w, -0.5 * zn], [w, 0.5 * zp], [0.7 * w, zp],
    [-0.7 * w, zp], [-w, 0.5 * zp], [-w, -0.5 * zn], [-0.7 * w, -zn]];
}
// Loft along local Y; rings: [y, w, zn, zp]
function loftY(rings) {
  return loftProfiles(rings.map(([y, w, zn, zp]) => ({ profile: ring(w, zn, zp), frame: { origin: [0, y, 0] } })), { cap: true });
}
// Tapered cylinder from point a to point b in the YZ plane (x equal); rA at a, rB at b.
function limb(name, a, b, rA, rB, mat, parent, segs = 6) {
  const dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dy, dz);
  return createPart(name, cylinderGeo(rB, rA, len, segs), mat, {
    position: [a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    rotation: [Math.atan2(dz, dy) * 180 / Math.PI, 0, 0], parent,
  });
}

async function build() {
  // Tints are factors over the pack textures, chosen so factor x texture lands near the palette (timber #6b4a2e, bronze #b08d57).
  const timber = await compilePortableMaterialSpecV2({ ...TIMBER_SPEC, baseColor: 0xb0a89e });
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE_SPEC, baseColor: 0xf7ca80 });
  const dark = await compilePortableMaterialSpecV2({ ...TIMBER_SPEC, baseColor: 0x6a6a6a });
  const labels = new Map([[timber, 'timber'], [dark, 'dark'], [bronze, 'bronze']]);

  const root = createRoot('TrojanHorse');

  // ---- Wheeled platform ----
  const deckY = P.deckTop - P.deckThick / 2;
  createPart('platform_deck', boxGeo(P.deckHalfW * 2, P.deckThick, P.deckHalfL * 2), timber, { position: [0, deckY, 0], parent: root });
  for (const s of [-1, 1]) {
    createPart('platform_rail_' + (s < 0 ? 'right' : 'left'), boxGeo(0.2, 0.22, P.deckHalfL * 2 + 0.3), dark,
      { position: [s * (P.deckHalfW + 0.1), deckY - 0.02, 0], parent: root });
  }
  for (const s of [-1, 1]) {
    createPart('axle_' + (s < 0 ? 'rear' : 'front'), cylinderGeo(0.15, 0.15, P.wheelX * 2, 8), dark,
      { position: [0, P.wheelR, s * P.axleZ], rotation: [0, 0, 90], parent: root });
  }
  createPart('tow_bracket', boxGeo(0.5, 0.12, 0.5), bronze, { position: [0, deckY, P.deckHalfL + 0.1], parent: root });

  // Wheels: each a named pivot at its axle, spinning about X
  const tireRaw = await extrudeProfile(
    Array.from({ length: 16 }, (_, i) => [P.wheelR * Math.cos(i / 16 * 2 * Math.PI), P.wheelR * Math.sin(i / 16 * 2 * Math.PI)]),
    { depth: 0.26, axis: 'x', holes: [Array.from({ length: 16 }, (_, i) => [0.5 * Math.cos(i / 16 * 2 * Math.PI), 0.5 * Math.sin(i / 16 * 2 * Math.PI)])] });
  const tireGeo = await autoUnwrap(tireRaw, { resolution: 256 });
  const wheelNames = [];
  for (const [fz, fname] of [[1, 'front'], [-1, 'rear']]) {
    for (const [sx, sname] of [[1, 'left'], [-1, 'right']]) {
      const name = `wheel_${fname}_${sname}`;
      wheelNames.push(name);
      const pivot = createPivot(name, [sx * P.wheelX, P.wheelR, fz * P.axleZ], root);
      pivot.name = name;
      createPart(name + '_disc', cylinderGeo(0.54, 0.54, 0.3, 14), timber, { rotation: [0, 0, 90], parent: pivot });
      createPart(name + '_tire', tireGeo, bronze, { parent: pivot });
      createPart(name + '_hub', cylinderGeo(0.2, 0.2, 0.44, 8), bronze, { rotation: [0, 0, 90], parent: pivot });
      createPart(name + '_plank_a', boxGeo(0.06, 1.0, 0.2), timber, { position: [sx * 0.18, 0, 0], parent: pivot });
      createPart(name + '_plank_b', boxGeo(0.06, 1.0, 0.2), timber, { position: [sx * 0.21, 0, 0], rotation: [90, 0, 0], parent: pivot });
    }
  }

  // ---- Hollow torso ----
  const wallT = P.wall;
  const outerRings = [[-2.15, 0.5, 0.55, 0.5], [-1.75, 0.82, 0.85, 0.9], [-0.4, 0.85, 0.85, 0.9],
    [1.2, 0.85, 0.95, 0.9], [1.75, 0.78, 0.85, 0.9], [2.1, 0.55, 0.65, 0.7]];
  const innerRings = [[-2.0, 0.48, 0.53, 0.52], [-1.75, 0.82 - wallT, 0.85 - wallT, 0.9 - wallT], [-0.4, 0.85 - wallT, 0.85 - wallT, 0.9 - wallT],
    [1.2, 0.85 - wallT, 0.95 - wallT, 0.9 - wallT], [1.75, 0.78 - wallT, 0.85 - wallT, 0.9 - wallT], [1.95, 0.51, 0.60, 0.65]];
  const bake = (g) => { g.rotateX(Math.PI / 2); g.translate(0, P.torsoY, 0); return g; };
  const outer = new THREE.Mesh(bake(loftY(outerRings)), timber);
  const inner = new THREE.Mesh(bake(loftY(innerRings)), timber);
  const hatchCut = new THREE.Mesh(new THREE.BoxGeometry(P.hatchW, 0.7, P.hatchL).translate(0, P.bellyY, 0), timber);
  const torso = await boolDiff('Torso', outer, inner, hatchCut, { preserveAttributes: true });
  root.add(torso);

  const wAt = (z) => (z < 1.2 ? 0.85 : 0.85 - (z - 1.2) / 0.55 * 0.07);
  for (const z of [-1.4, -0.7, 0, 0.7, 1.4]) {
    for (const s of [-1, 1]) {
      createPart('batten', boxGeo(0.1, 0.8, 0.2), dark, { position: [s * wAt(z), P.torsoY - 0.01, z], parent: root });
    }
  }

  // ---- Hatch in the belly ----
  const hatch = createPivot('hatch', [0, P.bellyY, -P.hatchL / 2 + 0.01], root);
  hatch.name = 'hatch';
  createPart('hatch_panel', boxGeo(P.hatchW - 0.04, 0.12, P.hatchL - 0.04), timber, { position: [0, 0.06, (P.hatchL - 0.04) / 2 + 0.01], parent: hatch });
  for (const z of [0.35, 1.1]) {
    createPart('hatch_strap', boxGeo(P.hatchW + 0.02, 0.03, 0.12), bronze, { position: [0, -0.012, z], parent: hatch });
  }
  createPart('hatch_pull', boxGeo(0.2, 0.05, 0.06), bronze, { position: [0, -0.03, 1.32], parent: hatch });
  createPart('hatch_hinge', cylinderGeo(0.05, 0.05, P.hatchW + 0.1, 8), bronze,
    { position: [0, P.bellyY - 0.02, -P.hatchL / 2 + 0.01], rotation: [0, 0, 90], parent: root });

  // ---- Legs ----
  for (const [s, side] of [[1, 'left'], [-1, 'right']]) {
    const x = s * 0.55;
    limb(`leg_front_${side}`, [x, 3.97, 1.4], [x, 1.2, 1.52], 0.4, 0.22, timber, root);
    limb(`leg_rear_upper_${side}`, [x, 3.97, -1.3], [x, 2.3, -1.9], 0.42, 0.28, timber, root);
    limb(`leg_rear_lower_${side}`, [x, 2.3, -1.9], [x, 1.2, -1.65], 0.28, 0.2, timber, root);
    createPart(`hoof_front_${side}`, boxGeo(0.5, 0.2, 0.56), dark, { position: [x, 1.1, 1.54], parent: root });
    createPart(`hoof_rear_${side}`, boxGeo(0.5, 0.2, 0.56), dark, { position: [x, 1.1, -1.67], parent: root });
  }

  // ---- Neck and head ----
  const nb = [4.95, 1.95], np = [6.4, 2.9];
  const ndy = np[0] - nb[0], ndz = np[1] - nb[1];
  const nlen = Math.hypot(ndy, ndz), nang = Math.atan2(ndz, ndy);
  createPart('neck', loftY([[0, 0.6, 0.6, 0.55], [0.8, 0.5, 0.5, 0.48], [nlen, 0.4, 0.42, 0.4]]), timber,
    { position: [0, nb[0], nb[1]], rotation: [nang * 180 / Math.PI, 0, 0], parent: root });
  for (let i = 0; i < 7; i++) {
    const t = 0.15 + i * (nlen - 0.4) / 6;
    const zn = 0.6 - 0.2 * (t / nlen);
    const off = zn + 0.1;
    createPart('mane', boxGeo(0.14, 0.3, 0.3), dark, {
      position: [0, nb[0] + t * Math.cos(nang) + off * Math.sin(nang), nb[1] + t * Math.sin(nang) - off * Math.cos(nang)],
      rotation: [nang * 180 / Math.PI, 0, 0], parent: root,
    });
  }
  const h0 = [6.45, 2.85], hl = 1.35;
  const hang = Math.atan2(1.1, -0.75);
  createPart('head', loftY([[0, 0.42, 0.44, 0.44], [0.55, 0.36, 0.38, 0.4], [1.0, 0.27, 0.28, 0.3], [hl, 0.25, 0.25, 0.27]]), timber,
    { position: [0, h0[0], h0[1]], rotation: [hang * 180 / Math.PI, 0, 0], parent: root });
  for (const s of [-1, 1]) {
    createPart('ear', cylinderGeo(0, 0.09, 0.35, 4), dark, { position: [s * 0.2, 6.95, 2.78], rotation: [-10, 0, -s * 8], parent: root });
    createPart('eye', boxGeo(0.06, 0.12, 0.12), bronze, {
      position: [s * 0.39, h0[0] + 0.45 * Math.cos(hang), h0[1] + 0.45 * Math.sin(hang)], rotation: [hang * 180 / Math.PI, 0, 0], parent: root });
  }

  // ---- Tail ----
  limb('tail', [0, 5.15, -2.1], [0, 3.7, -2.55], 0.16, 0.07, dark, root, 5);

  // Bake static parts into one mesh per material; moving nodes keep their own merged meshes.
  // One call per material: a single multi-material pass was rejected by the evaluator.
  const movers = [hatch.name, ...wheelNames];
  const pivots = [hatch, ...wheelNames.map((n) => root.getObjectByName(n))];
  for (const only of ['timber', 'dark', 'bronze']) {
    mergeMeshes(root, 'static', movers, ['Torso'], labels, only);
    for (const node of pivots) mergeMeshes(node, node.name, [], [], labels, only);
  }

  return root;
}

// Merge the meshes under container (stopping at movers) into one baked mesh per material.
function mergeMeshes(container, prefix, movers, skipName, labels, only) {
  const all = [];
  const collect = (node) => {
    for (const c of node.children.slice()) {
      if (movers.includes(c.name) || skipName.includes(c.name)) continue;
      if (c.isMesh && labels.get(c.material) === only) all.push(c);
      collect(c);
    }
  };
  collect(container);
  const mats = [];
  for (const m of all) if (!mats.includes(m.material)) mats.push(m.material);
  for (const mat of mats) {
    const meshes = all.filter((m) => m.material === mat);
    const pos = [], nor = [], uv = [], idx = [];
    let base = 0;
    for (const m of meshes) {
      const g = m.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
      else for (let i = 0; i < p.count; i++) idx.push(i + base);
      base += p.count;
      m.parent.remove(m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `Mesh_${prefix}_${labels.get(mat)}`;
    container.add(mesh);
  }
}

function animate(root) {
  const wheels = ['wheel_front_left', 'wheel_front_right', 'wheel_rear_left', 'wheel_rear_right'];
  const spin = [0, 90, 180, 270, 360].map((d, i) => ({ time: i * 0.5, rotation: [d, 0, 0] }));
  return [
    createClip('hatch_open', 1.2, [rotationTrack('hatch', [
      { time: 0, rotation: [0, 0, 0] }, { time: 1.2, rotation: [P.hatchOpenDeg, 0, 0] }], 'EASE_IN_OUT')], { loop: false }),
    createClip('wheels_roll', 2, wheels.map((w) => rotationTrack(w, spin)), { loop: true }),
  ];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_trojan = (() => {
const meta = { name: 'Trojan soldier' };

// Troy pack conventions: metres, +Y up, the soldier faces +Z, so his right side is -X.
// Rigid segments on named joints (the runtime exports no skinning); joint rotations are
// Euler XYZ degrees. For hanging limbs negative X swings forward; for the spine positive X
// leans forward.
const D2R = Math.PI / 180;

// Pinned pack materials (portableSpec copied from kiln_material get).
const LINEN = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Neutral woven fabric',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' },
  },
};
const BRONZE = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};
// Base-colour factors chosen so factor x mean map colour (linear) ~= the palette colour:
// trojan-crimson #8c2f2a, skin #c59a78 (red clamps at 1), bronze #b08d57.
const TINT = { crimson: 0xcb4d50, skin: 0xffecd2, bronze: 0xfcc77b };

// Body: hips joint height, segment lengths, joint offsets.
const BODY = {
  hipsY: 0.95, hipX: 0.095, hipDrop: -0.03, thigh: 0.42, shin: 0.415, ankleY: 0.085,
  spineUp: 0.10, neckUp: 0.40, headUp: 0.08,
  shoulderX: 0.205, shoulderUp: 0.35, upperArm: 0.29, forearm: 0.25,
};
// Pack hand grip: every held item has a 0.03 m radius, 0.11 m grip centred on its origin
// along its +Y; the fist closes to it. The socket tilts the grip 45 deg forward-down from
// the forearm, as a sword sits diagonally across a closed palm.
const GRIP = { radius: 0.03, length: 0.11, fistOuter: 0.05, fistLength: 0.09, socket: [0, -0.07, 0.01], tilt: 135 };
// Feet stay planted at these depths in every clip; legs are solved from the hips position.
const STANCE = { left: 0.15, right: -0.14 };

// ---------- geometry helpers ----------
function xf(t = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.r || [0, 0, 0]).map(d => d * D2R), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...(t.p || [0, 0, 0])), q, new THREE.Vector3(...(t.s || [1, 1, 1])));
}

// Collects transformed triangles for one mesh (one material, one rigid segment).
function shape(uvScale) {
  const pos = [];
  const v = new THREE.Vector3();
  const api = {
    add(geo, ...ts) {
      const m = new THREE.Matrix4();
      for (const t of ts) m.multiply(xf(t));
      const src = geo.index ? geo.toNonIndexed() : geo;
      const a = src.getAttribute('position');
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
      return api;
    },
    geometry() {
      const uvs = [];
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
        for (let k = 0; k < 9; k += 3) {
          const x = pos[i + k], y = pos[i + k + 1], z = pos[i + k + 2];
          if (nx >= ny && nx >= nz) uvs.push(z / uvScale, y / uvScale);
          else if (ny >= nz) uvs.push(x / uvScale, z / uvScale);
          else uvs.push(x / uvScale, y / uvScale);
        }
      }
      return meshGeo({ positions: pos, uvs });
    },
  };
  return api;
}

// Triangle soup whose faces are turned to face `out`; zero-area faces are dropped.
function soup() {
  const pos = [];
  const tri = (a, b, c, out) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(...n) < 1e-12) return;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  return { tri, quad, geo };
}

// Surface of revolution about Y. Profile entries [r, y, zScale?] run up the outside and back
// down any inside, so (dy, -dr) is the outward profile normal.
function revolve(profile, segs) {
  const s = soup();
  const P = (e, a) => [e[0] * Math.cos(a), e[1], e[0] * Math.sin(a) * (e[2] ?? 1)];
  for (let k = 0; k < profile.length - 1; k++) {
    const e0 = profile[k], e1 = profile[k + 1];
    const nr = e1[1] - e0[1], ny = -(e1[0] - e0[0]);
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
      s.quad(P(e0, a0), P(e0, a1), P(e1, a1), P(e1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  return s.geo();
}

// Convex polygon [[u, v]] in the Z-Y plane (u -> z, v -> y), extruded across X.
function prism(poly, width) {
  const s = soup(), h = width / 2;
  const c = poly.reduce((m, p) => [m[0] + p[0] / poly.length, m[1] + p[1] / poly.length], [0, 0]);
  for (let i = 1; i < poly.length - 1; i++) {
    s.tri([h, poly[0][1], poly[0][0]], [h, poly[i][1], poly[i][0]], [h, poly[i + 1][1], poly[i + 1][0]], [1, 0, 0]);
    s.tri([-h, poly[0][1], poly[0][0]], [-h, poly[i][1], poly[i][0]], [-h, poly[i + 1][1], poly[i + 1][0]], [-1, 0, 0]);
  }
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const out = [0, (p[1] + q[1]) / 2 - c[1], (p[0] + q[0]) / 2 - c[0]];
    s.quad([h, p[1], p[0]], [h, q[1], q[0]], [-h, q[1], q[0]], [-h, p[1], p[0]], out);
  });
  return s.geo();
}

// Band between two matching polylines in the Z-Y plane, extruded across X (crest).
function band(outer, inner, width) {
  const s = soup(), h = width / 2, n = outer.length;
  const V = (p, x) => [x, p[1], p[0]];
  for (let i = 0; i < n - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    s.quad(V(o0, h), V(o1, h), V(i1, h), V(i0, h), [1, 0, 0]);
    s.quad(V(o0, -h), V(o1, -h), V(i1, -h), V(i0, -h), [-1, 0, 0]);
    const oo = [0, (o0[1] + o1[1] - i0[1] - i1[1]) / 2, (o0[0] + o1[0] - i0[0] - i1[0]) / 2];
    s.quad(V(o0, h), V(o1, h), V(o1, -h), V(o0, -h), oo);
    s.quad(V(i0, h), V(i1, h), V(i1, -h), V(i0, -h), oo.map(x => -x));
  }
  const cap = (k, j) => {
    const out = [0, outer[k][1] + inner[k][1] - outer[j][1] - inner[j][1], outer[k][0] + inner[k][0] - outer[j][0] - inner[j][0]];
    s.quad(V(outer[k], h), V(inner[k], h), V(inner[k], -h), V(outer[k], -h), out);
  };
  cap(0, 1); cap(n - 1, n - 2);
  return s.geo();
}

// Thick tube along Y: the closed fist around the pack grip.
function tube(rIn, rOut, length, segs) {
  const s = soup(), h = length / 2;
  const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
    const rad = [Math.cos(am), 0, Math.sin(am)];
    s.quad(P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h), rad);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h), rad.map(x => -x));
    s.quad(P(rIn, a0, h), P(rIn, a1, h), P(rOut, a1, h), P(rOut, a0, h), [0, 1, 0]);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rOut, a1, -h), P(rOut, a0, -h), [0, -1, 0]);
  }
  return s.geo();
}

// Leaf-shaped blade along +Y with a diamond section: width along Z, ribbed thickness along X.
function blade(stations) {
  const s = soup();
  const ring = st => [[0, st[0], st[1]], [st[2], st[0], 0], [0, st[0], -st[1]], [-st[2], st[0], 0]];
  for (let k = 0; k < stations.length - 1; k++) {
    const r0 = ring(stations[k]), r1 = ring(stations[k + 1]);
    for (let j = 0; j < 4; j++) {
      const a = r0[j], b = r0[(j + 1) % 4], c = r1[(j + 1) % 4], d = r1[j];
      s.quad(a, b, c, d, [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4]);
    }
  }
  const r0 = ring(stations[0]);
  s.quad(r0[0], r0[1], r0[2], r0[3], [0, -1, 0]);
  return s.geo();
}

// ---------- pose ----------
const UPPER = ['spine', 'neck', 'head', 'shoulder_right', 'elbow_right', 'wrist_right', 'shoulder_left', 'elbow_left', 'wrist_left'];
const LEGS = ['hip_right', 'knee_right', 'ankle_right', 'hip_left', 'knee_left', 'ankle_left'];

// Guard stance: left foot leads, sword held forward and up, left arm relaxed.
const GUARD = {
  hips: [0, 0.91, 0.01],
  spine: [6, -12, 0], neck: [-2, 0, 0], head: [-2, 10, 0],
  shoulder_right: [-20, 0, -10], elbow_right: [-55, 0, 0], wrist_right: [-15, 0, 0],
  shoulder_left: [-8, 0, 10], elbow_left: [-30, 0, 0], wrist_left: [0, 0, 0],
};
const pose = o => ({ ...GUARD, ...o });

const IDLE_KEYS = [
  { t: 0, ...GUARD },
  { t: 1.5, ...pose({ hips: [0, 0.898, 0.02], spine: [8, -8, 1], neck: [-3, 0, 0], head: [-1, -2, 0], shoulder_right: [-24, 0, -11], elbow_right: [-63, 0, 0], wrist_right: [-10, 0, 0], shoulder_left: [-11, 0, 12], elbow_left: [-36, 0, 0] }) },
  { t: 3, ...GUARD },
];

// Forehand diagonal cut: cock the sword behind the right shoulder, swing down across to
// the left hip while the weight shifts onto the lead leg, then recover to guard.
const ATTACK_KEYS = [
  { t: 0, ...GUARD },
  { t: 0.38, ...pose({ hips: [0, 0.905, -0.04], spine: [-6, -38, 4], neck: [0, 0, 0], head: [0, 25, 0], shoulder_right: [-150, 0, -25], elbow_right: [-60, 0, 0], wrist_right: [-25, 0, 0], shoulder_left: [-70, 0, 15], elbow_left: [-20, 0, 0] }) },
  { t: 0.54, ...pose({ hips: [0, 0.87, 0.07], spine: [14, 10, -3], head: [-6, -8, 0], shoulder_right: [-75, 0, -5], elbow_right: [-5, 0, 0], wrist_right: [40, 0, 0], shoulder_left: [20, 0, 12], elbow_left: [-75, 0, 0] }) },
  { t: 0.7, ...pose({ hips: [0, 0.865, 0.08], spine: [18, 30, -4], head: [-8, -22, 0], shoulder_right: [-55, 0, 15], elbow_right: [-10, 0, 0], wrist_right: [45, 0, 0], shoulder_left: [25, 0, 15], elbow_left: [-80, 0, 0] }) },
  { t: 1.1, ...pose({ hips: [0, 0.9, 0.03], spine: [8, -5, 0], head: [-3, 6, 0], shoulder_right: [-30, 0, -8], elbow_right: [-50, 0, 0], wrist_right: [-5, 0, 0], shoulder_left: [-5, 0, 10], elbow_left: [-40, 0, 0] }) },
  { t: 1.5, ...GUARD },
];

// Two-bone leg in its sagittal plane, foot kept level at its planted depth.
function legIK(hips, side) {
  const hy = hips[1] + BODY.hipDrop, hz = hips[2];
  const dy = BODY.ankleY - hy, dz = STANCE[side] - hz;
  const L = Math.min(Math.hypot(dy, dz), BODY.thigh + BODY.shin - 1e-4);
  const a = Math.acos((BODY.thigh ** 2 + L * L - BODY.shin ** 2) / (2 * BODY.thigh * L));
  const b = Math.acos((BODY.shin ** 2 + L * L - BODY.thigh ** 2) / (2 * BODY.shin * L));
  const phi = Math.atan2(dz, -dy);
  const hip = -(phi + a) / D2R, knee = (a + b) / D2R;
  return { ['hip_' + side]: [hip, 0, 0], ['knee_' + side]: [knee, 0, 0], ['ankle_' + side]: [-(hip + knee), 0, 0] };
}
const solve = p => ({ ...p, ...legIK(p.hips, 'right'), ...legIK(p.hips, 'left') });

// Monotone cubic (Fritsch-Carlson) through the key values; flat at the ends.
function pchip(ts, vs, t) {
  const n = ts.length;
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const slope = k => {
    if (k === 0 || k === n - 1) return 0;
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
    const d0 = (vs[k] - vs[k - 1]) / h0, d1 = (vs[k + 1] - vs[k]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  };
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * slope(i) * h + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * slope(i + 1) * h;
}
function poseAt(keys, t) {
  const ts = keys.map(k => k.t);
  const p = {};
  for (const name of ['hips', ...UPPER]) p[name] = [0, 1, 2].map(c => pchip(ts, keys.map(k => k[name][c]), t));
  return solve(p);
}

// Samples the key poses so the planted feet stay consistent with the hips between keys.
function sampleClip(name, keys, fps, loop) {
  const duration = keys[keys.length - 1].t;
  const n = Math.round(duration * fps);
  const times = [...Array(n + 1)].map((_, i) => (i * duration) / n);
  const poses = times.map(t => poseAt(keys, t));
  const tracks = [positionTrack('Joint_hips', times.map((time, i) => ({ time, position: poses[i].hips })), 'LINEAR')];
  for (const j of [...UPPER, ...LEGS]) {
    tracks.push(rotationTrack('Joint_' + j, times.map((time, i) => ({ time, rotation: poses[i][j] })), 'LINEAR'));
  }
  return createClip(name, duration, tracks, { loop });
}

// ---------- build ----------
async function build() {
  const crimson = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Trojan crimson linen', baseColor: TINT.crimson });
  const skin = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Skin', baseColor: TINT.skin });
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE, name: 'Bronze', baseColor: TINT.bronze });
  // UV repeat in metres: cloth and bronze at their physical map size; skin samples the linen
  // maps at a fine repeat so the weave averages out to an even tone.
  const mats = { crimson: [crimson, 0.5], skin: [skin, 0.04], bronze: [bronze, 1] };
  const part = (name, mat, parent, fill) => {
    const sh = shape(mats[mat][1]);
    fill(sh);
    return createPart(name, sh.geometry(), mats[mat][0], { parent });
  };

  const root = createRoot('TrojanSoldier');
  const J = {};
  J.hips = createPivot('hips', [0, BODY.hipsY, 0], root);
  J.spine = createPivot('spine', [0, BODY.spineUp, 0], J.hips);
  J.neck = createPivot('neck', [0, BODY.neckUp, 0], J.spine);
  J.head = createPivot('head', [0, BODY.headUp, 0], J.neck);

  // Kilt of linen strips: flares so the thighs swing inside it; top tucks under the cuirass.
  part('kilt', 'crimson', J.hips, s => s
    .add(revolve([[0.225, -0.27, 0.95], [0.19, -0.05, 0.85], [0.14, 0.06, 0.72], [0.128, 0.06, 0.72], [0.178, -0.05, 0.85], [0.213, -0.27, 0.95], [0.225, -0.27, 0.95]], 12))
    .add(boxGeo(0.24, 0.14, 0.17), { p: [0, -0.07, 0] }));

  // Linen cuirass with shoulder flaps, bronze belt.
  part('cuirass', 'crimson', J.spine, s => {
    s.add(revolve([[0.155, -0.07], [0.145, -0.02], [0.148, 0.08], [0.168, 0.2], [0.172, 0.29], [0.15, 0.36], [0.09, 0.4], [0.05, 0.41], [0, 0.41]], 10), { s: [1, 1, 0.72] });
    for (const x of [-1, 1]) s.add(boxGeo(0.15, 0.025, 0.2), { p: [x * 0.125, 0.39, 0], r: [0, 0, -x * 12] });
  });
  part('belt', 'bronze', J.spine, s => s.add(revolve([[0.162, -0.075], [0.166, -0.06], [0.166, -0.03], [0.162, -0.015]], 10), { s: [1, 1, 0.72] }));

  part('neck', 'skin', J.neck, s => s.add(cylinderGeo(0.05, 0.056, 0.14, 8), { p: [0, 0.05, 0] }));

  // Head and helmet. The helmet frame sits on the brow, above the eyes.
  const HELM = { p: [0, 0.145, 0.005] };
  part('head', 'skin', J.head, s => s
    .add(sphereGeo(1, 10, 8), { p: [0, 0.115, 0.005], s: [0.085, 0.118, 0.098] })
    .add(prism([[0, 0.03], [0.026, -0.022], [0, -0.032]], 0.026), { p: [0, 0.1, 0.09] }));
  part('helmet', 'bronze', J.head, s => {
    s.add(revolve([[0.124, -0.012], [0.113, 0.008], [0.113, 0.04], [0.102, 0.075], [0.078, 0.104], [0.042, 0.122], [0, 0.128]], 12), HELM, { s: [0.92, 1, 1.05] });
    for (const x of [-1, 1]) s.add(prism([[-0.035, 0.012], [0.07, 0.012], [0.058, -0.06], [0.03, -0.095], [-0.028, -0.085]], 0.012), HELM, { p: [x * 0.099, 0, 0], r: [0, 0, -x * 9] });
    s.add(boxGeo(0.15, 0.055, 0.012), HELM, { p: [0, -0.025, -0.118], r: [25, 0, 0] });
    s.add(boxGeo(0.022, 0.03, 0.2), HELM, { p: [0, 0.135, -0.01] });
  });
  // Horsehair crest sweeping from the brow over the crown and down the back.
  const crestArc = (cz, cy, rz, ry) => [...Array(12)].map((_, i) => {
    const a = (35 + (150 * i) / 11) * D2R;
    return [cz + rz * Math.cos(a), cy + ry * Math.sin(a)];
  });
  part('crest', 'crimson', J.head, s => s.add(band(crestArc(-0.01, 0.03, 0.21, 0.25), crestArc(0, 0, 0.122, 0.138), 0.05), HELM));

  for (const side of ['right', 'left']) {
    const x = side === 'right' ? -1 : 1;
    J['shoulder_' + side] = createPivot('shoulder_' + side, [x * BODY.shoulderX, BODY.shoulderUp, 0], J.spine);
    J['elbow_' + side] = createPivot('elbow_' + side, [0, -BODY.upperArm, 0], J['shoulder_' + side]);
    J['wrist_' + side] = createPivot('wrist_' + side, [0, -BODY.forearm, 0], J['elbow_' + side]);
    const socket = createPivot('socket_' + side, GRIP.socket, J['wrist_' + side]);
    socket.name = 'socket_hand_' + side;
    socket.rotation.set(GRIP.tilt * D2R, 0, 0);

    part('sleeve_' + side, 'crimson', J['shoulder_' + side], s => s
      .add(cylinderGeo(0.06, 0.056, 0.11, 8), { p: [0, -0.045, 0] })
      .add(sphereGeo(0.062, 8, 6), { p: [0, 0, 0] }));
    part('upper_arm_' + side, 'skin', J['shoulder_' + side], s => s.add(cylinderGeo(0.05, 0.042, 0.3, 8), { p: [0, -0.145, 0] }));
    part('forearm_' + side, 'skin', J['elbow_' + side], s => s
      .add(cylinderGeo(0.042, 0.032, 0.26, 8), { p: [0, -0.125, 0] })
      .add(sphereGeo(0.043, 8, 6)));
    part('hand_' + side, 'skin', J['wrist_' + side], s => s
      .add(boxGeo(0.05, 0.07, 0.075), { p: [0, -0.035, 0.005] })
      .add(tube(GRIP.radius, GRIP.fistOuter, GRIP.fistLength, 8), { p: GRIP.socket, r: [GRIP.tilt, 0, 0] }));

    J['hip_' + side] = createPivot('hip_' + side, [x * BODY.hipX, BODY.hipDrop, 0], J.hips);
    J['knee_' + side] = createPivot('knee_' + side, [0, -BODY.thigh, 0], J['hip_' + side]);
    J['ankle_' + side] = createPivot('ankle_' + side, [0, -BODY.shin, 0], J['knee_' + side]);
    part('thigh_' + side, 'skin', J['hip_' + side], s => s.add(cylinderGeo(0.072, 0.052, 0.44, 8), { p: [0, -0.21, 0] }));
    part('shin_' + side, 'skin', J['knee_' + side], s => s.add(cylinderGeo(0.05, 0.034, 0.45, 8), { p: [0, -0.215, 0] }));
    part('greave_' + side, 'bronze', J['knee_' + side], s => s.add(cylinderGeo(0.062, 0.044, 0.4, 8), { p: [0, -0.17, 0] }));
    part('foot_' + side, 'skin', J['ankle_' + side], s => s.add(prism([[-0.055, -0.085], [0.185, -0.085], [0.185, -0.058], [0.04, -0.01], [-0.055, -0.02]], 0.095)));
  }

  // Bronze leaf sword, grip centred on its origin in the right-hand socket (pack sword ~0.7 m).
  const sword = part('sword', 'bronze', root.getObjectByName('socket_hand_right'), s => s
    .add(cylinderGeo(GRIP.radius, GRIP.radius, GRIP.length, 8))
    .add(cylinderGeo(0.03, 0.042, 0.03, 8), { p: [0, -GRIP.length / 2 - 0.015, 0] })
    .add(boxGeo(0.034, 0.024, 0.11), { p: [0, GRIP.length / 2 + 0.012, 0] })
    .add(blade([[0.079, 0.022, 0.007], [0.12, 0.02, 0.007], [0.3, 0.018, 0.0065], [0.47, 0.028, 0.0065], [0.57, 0.022, 0.005], [0.635, 0.008, 0.003], [0.665, 0, 0]])));
  sword.name = 'sword';

  // Rest pose is the first idle frame, so a static instance stands in guard.
  const p0 = solve(GUARD);
  J.hips.position.set(...p0.hips);
  for (const j of [...UPPER, ...LEGS]) J[j].rotation.set(...p0[j].map(d => d * D2R), 'XYZ');
  return root;
}

function animate() {
  return [sampleClip('idle', IDLE_KEYS, 15, true), sampleClip('attack', ATTACK_KEYS, 30, false)];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_greek = (() => {
const meta = { name: 'Greek soldier' };

// Troy pack conventions: metres, +Y up, the soldier faces +Z, so his right side is -X.
// Rigid segments on named joints (the runtime exports no skinning); joint rotations are
// Euler XYZ degrees. For hanging limbs negative X swings forward; for the spine positive X
// leans forward.
const D2R = Math.PI / 180;

// Pinned pack materials (portableSpec copied from kiln_material get).
const LINEN = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Neutral woven fabric',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' },
  },
};
const BRONZE = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};
// Base-colour factors chosen so factor x mean map colour (linear) ~= the palette colour:
// greek-blue #2f4a6b, skin #c59a78 (red clamps at 1), bronze #b08d57.
const TINT = { blue: 0x4875bd, skin: 0xffecd2, bronze: 0xfcc77b };

// Body: hips joint height, segment lengths, joint offsets.
const BODY = {
  hipsY: 0.95, hipX: 0.095, hipDrop: -0.03, thigh: 0.42, shin: 0.415, ankleY: 0.085,
  spineUp: 0.10, neckUp: 0.40, headUp: 0.08,
  shoulderX: 0.205, shoulderUp: 0.35, upperArm: 0.29, forearm: 0.25,
};
// Pack hand grip: every held item has a 0.03 m radius, 0.11 m grip centred on its origin
// along its +Y; the fist closes to it. The socket tilts the grip 45 deg forward-down from
// the forearm, as a sword sits diagonally across a closed palm.
const GRIP = { radius: 0.03, length: 0.11, fistOuter: 0.05, fistLength: 0.09, socket: [0, -0.07, 0.01], tilt: 135 };
// Feet stay planted at these depths in every clip; legs are solved from the hips position.
const STANCE = { left: 0.15, right: -0.14 };

// ---------- geometry helpers ----------
function xf(t = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.r || [0, 0, 0]).map(d => d * D2R), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...(t.p || [0, 0, 0])), q, new THREE.Vector3(...(t.s || [1, 1, 1])));
}

// Collects transformed triangles for one mesh (one material, one rigid segment).
function shape(uvScale) {
  const pos = [];
  const v = new THREE.Vector3();
  const api = {
    add(geo, ...ts) {
      const m = new THREE.Matrix4();
      for (const t of ts) m.multiply(xf(t));
      const src = geo.index ? geo.toNonIndexed() : geo;
      const a = src.getAttribute('position');
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
      return api;
    },
    geometry() {
      const uvs = [];
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
        for (let k = 0; k < 9; k += 3) {
          const x = pos[i + k], y = pos[i + k + 1], z = pos[i + k + 2];
          if (nx >= ny && nx >= nz) uvs.push(z / uvScale, y / uvScale);
          else if (ny >= nz) uvs.push(x / uvScale, z / uvScale);
          else uvs.push(x / uvScale, y / uvScale);
        }
      }
      return meshGeo({ positions: pos, uvs });
    },
  };
  return api;
}

// Triangle soup whose faces are turned to face `out`; zero-area faces are dropped.
function soup() {
  const pos = [];
  const tri = (a, b, c, out) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(...n) < 1e-12) return;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  return { tri, quad, geo };
}

// Surface of revolution about Y. Profile entries [r, y, zScale?] run up the outside and back
// down any inside, so (dy, -dr) is the outward profile normal.
function revolve(profile, segs) {
  const s = soup();
  const P = (e, a) => [e[0] * Math.cos(a), e[1], e[0] * Math.sin(a) * (e[2] ?? 1)];
  for (let k = 0; k < profile.length - 1; k++) {
    const e0 = profile[k], e1 = profile[k + 1];
    const nr = e1[1] - e0[1], ny = -(e1[0] - e0[0]);
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
      s.quad(P(e0, a0), P(e0, a1), P(e1, a1), P(e1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  return s.geo();
}

// Convex polygon [[u, v]] in the Z-Y plane (u -> z, v -> y), extruded across X.
function prism(poly, width) {
  const s = soup(), h = width / 2;
  const c = poly.reduce((m, p) => [m[0] + p[0] / poly.length, m[1] + p[1] / poly.length], [0, 0]);
  for (let i = 1; i < poly.length - 1; i++) {
    s.tri([h, poly[0][1], poly[0][0]], [h, poly[i][1], poly[i][0]], [h, poly[i + 1][1], poly[i + 1][0]], [1, 0, 0]);
    s.tri([-h, poly[0][1], poly[0][0]], [-h, poly[i][1], poly[i][0]], [-h, poly[i + 1][1], poly[i + 1][0]], [-1, 0, 0]);
  }
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const out = [0, (p[1] + q[1]) / 2 - c[1], (p[0] + q[0]) / 2 - c[0]];
    s.quad([h, p[1], p[0]], [h, q[1], q[0]], [-h, q[1], q[0]], [-h, p[1], p[0]], out);
  });
  return s.geo();
}

// Band between two matching polylines in the Z-Y plane, extruded across X (crest).
function band(outer, inner, width) {
  const s = soup(), h = width / 2, n = outer.length;
  const V = (p, x) => [x, p[1], p[0]];
  for (let i = 0; i < n - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    s.quad(V(o0, h), V(o1, h), V(i1, h), V(i0, h), [1, 0, 0]);
    s.quad(V(o0, -h), V(o1, -h), V(i1, -h), V(i0, -h), [-1, 0, 0]);
    const oo = [0, (o0[1] + o1[1] - i0[1] - i1[1]) / 2, (o0[0] + o1[0] - i0[0] - i1[0]) / 2];
    s.quad(V(o0, h), V(o1, h), V(o1, -h), V(o0, -h), oo);
    s.quad(V(i0, h), V(i1, h), V(i1, -h), V(i0, -h), oo.map(x => -x));
  }
  const cap = (k, j) => {
    const out = [0, outer[k][1] + inner[k][1] - outer[j][1] - inner[j][1], outer[k][0] + inner[k][0] - outer[j][0] - inner[j][0]];
    s.quad(V(outer[k], h), V(inner[k], h), V(inner[k], -h), V(outer[k], -h), out);
  };
  cap(0, 1); cap(n - 1, n - 2);
  return s.geo();
}

// Rectangular section swept along a polyline in the Z-Y plane: stations [z, y, halfThickness,
// halfWidth], thickness in the plane and width across X (horsehair plume).
function sweep(stations) {
  const s = soup(), n = stations.length;
  const tangent = i => {
    const a = stations[Math.max(i - 1, 0)], b = stations[Math.min(i + 1, n - 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const corners = i => {
    const [z, y, t, w] = stations[i], [tz, ty] = tangent(i), nz = -ty * t, ny = tz * t;
    return [[w, y + ny, z + nz], [-w, y + ny, z + nz], [-w, y - ny, z - nz], [w, y - ny, z - nz]];
  };
  for (let i = 0; i < n - 1; i++) {
    const c0 = corners(i), c1 = corners(i + 1);
    const my = (stations[i][1] + stations[i + 1][1]) / 2, mz = (stations[i][0] + stations[i + 1][0]) / 2;
    for (let k = 0; k < 4; k++) {
      const a = c0[k], b = c0[(k + 1) % 4], c = c1[(k + 1) % 4], d = c1[k];
      s.quad(a, b, c, d, [a[0] + b[0] + c[0] + d[0], a[1] + b[1] + c[1] + d[1] - 4 * my, a[2] + b[2] + c[2] + d[2] - 4 * mz]);
    }
  }
  const t0 = tangent(0), t1 = tangent(n - 1), e0 = corners(0), e1 = corners(n - 1);
  s.quad(e0[0], e0[1], e0[2], e0[3], [0, -t0[1], -t0[0]]);
  s.quad(e1[0], e1[1], e1[2], e1[3], [0, t1[1], t1[0]]);
  return s.geo();
}

// Thick tube along Y: the closed fist around the pack grip.
function tube(rIn, rOut, length, segs) {
  const s = soup(), h = length / 2;
  const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
    const rad = [Math.cos(am), 0, Math.sin(am)];
    s.quad(P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h), rad);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h), rad.map(x => -x));
    s.quad(P(rIn, a0, h), P(rIn, a1, h), P(rOut, a1, h), P(rOut, a0, h), [0, 1, 0]);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rOut, a1, -h), P(rOut, a0, -h), [0, -1, 0]);
  }
  return s.geo();
}

// Leaf-shaped blade along +Y with a diamond section: width along Z, ribbed thickness along X.
function blade(stations) {
  const s = soup();
  const ring = st => [[0, st[0], st[1]], [st[2], st[0], 0], [0, st[0], -st[1]], [-st[2], st[0], 0]];
  for (let k = 0; k < stations.length - 1; k++) {
    const r0 = ring(stations[k]), r1 = ring(stations[k + 1]);
    for (let j = 0; j < 4; j++) {
      const a = r0[j], b = r0[(j + 1) % 4], c = r1[(j + 1) % 4], d = r1[j];
      s.quad(a, b, c, d, [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4]);
    }
  }
  const r0 = ring(stations[0]);
  s.quad(r0[0], r0[1], r0[2], r0[3], [0, -1, 0]);
  return s.geo();
}

// ---------- pose ----------
const UPPER = ['spine', 'neck', 'head', 'shoulder_right', 'elbow_right', 'wrist_right', 'shoulder_left', 'elbow_left', 'wrist_left'];
const LEGS = ['hip_right', 'knee_right', 'ankle_right', 'hip_left', 'knee_left', 'ankle_left'];

// Guard stance: left foot leads, sword held forward and up, left arm relaxed.
const GUARD = {
  hips: [0, 0.91, 0.01],
  spine: [6, -12, 0], neck: [-2, 0, 0], head: [-2, 10, 0],
  shoulder_right: [-20, 0, -10], elbow_right: [-55, 0, 0], wrist_right: [-15, 0, 0],
  shoulder_left: [-8, 0, 10], elbow_left: [-30, 0, 0], wrist_left: [0, 0, 0],
};
const pose = o => ({ ...GUARD, ...o });

const IDLE_KEYS = [
  { t: 0, ...GUARD },
  { t: 1.5, ...pose({ hips: [0, 0.898, 0.02], spine: [8, -8, 1], neck: [-3, 0, 0], head: [-1, -2, 0], shoulder_right: [-24, 0, -11], elbow_right: [-63, 0, 0], wrist_right: [-10, 0, 0], shoulder_left: [-11, 0, 12], elbow_left: [-36, 0, 0] }) },
  { t: 3, ...GUARD },
];

// Forehand diagonal cut: cock the sword behind the right shoulder, swing down across to
// the left hip while the weight shifts onto the lead leg, then recover to guard.
const ATTACK_KEYS = [
  { t: 0, ...GUARD },
  { t: 0.38, ...pose({ hips: [0, 0.905, -0.04], spine: [-6, -38, 4], neck: [0, 0, 0], head: [0, 25, 0], shoulder_right: [-150, 0, -25], elbow_right: [-60, 0, 0], wrist_right: [-25, 0, 0], shoulder_left: [-70, 0, 15], elbow_left: [-20, 0, 0] }) },
  { t: 0.54, ...pose({ hips: [0, 0.87, 0.07], spine: [14, 10, -3], head: [-6, -8, 0], shoulder_right: [-75, 0, -5], elbow_right: [-5, 0, 0], wrist_right: [40, 0, 0], shoulder_left: [20, 0, 12], elbow_left: [-75, 0, 0] }) },
  { t: 0.7, ...pose({ hips: [0, 0.865, 0.08], spine: [18, 30, -4], head: [-8, -22, 0], shoulder_right: [-55, 0, 15], elbow_right: [-10, 0, 0], wrist_right: [45, 0, 0], shoulder_left: [25, 0, 15], elbow_left: [-80, 0, 0] }) },
  { t: 1.1, ...pose({ hips: [0, 0.9, 0.03], spine: [8, -5, 0], head: [-3, 6, 0], shoulder_right: [-30, 0, -8], elbow_right: [-50, 0, 0], wrist_right: [-5, 0, 0], shoulder_left: [-5, 0, 10], elbow_left: [-40, 0, 0] }) },
  { t: 1.5, ...GUARD },
];

// Two-bone leg in its sagittal plane, foot kept level at its planted depth.
function legIK(hips, side) {
  const hy = hips[1] + BODY.hipDrop, hz = hips[2];
  const dy = BODY.ankleY - hy, dz = STANCE[side] - hz;
  const L = Math.min(Math.hypot(dy, dz), BODY.thigh + BODY.shin - 1e-4);
  const a = Math.acos((BODY.thigh ** 2 + L * L - BODY.shin ** 2) / (2 * BODY.thigh * L));
  const b = Math.acos((BODY.shin ** 2 + L * L - BODY.thigh ** 2) / (2 * BODY.shin * L));
  const phi = Math.atan2(dz, -dy);
  const hip = -(phi + a) / D2R, knee = (a + b) / D2R;
  return { ['hip_' + side]: [hip, 0, 0], ['knee_' + side]: [knee, 0, 0], ['ankle_' + side]: [-(hip + knee), 0, 0] };
}
const solve = p => ({ ...p, ...legIK(p.hips, 'right'), ...legIK(p.hips, 'left') });

// Monotone cubic (Fritsch-Carlson) through the key values; flat at the ends.
function pchip(ts, vs, t) {
  const n = ts.length;
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const slope = k => {
    if (k === 0 || k === n - 1) return 0;
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
    const d0 = (vs[k] - vs[k - 1]) / h0, d1 = (vs[k + 1] - vs[k]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  };
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * slope(i) * h + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * slope(i + 1) * h;
}
function poseAt(keys, t) {
  const ts = keys.map(k => k.t);
  const p = {};
  for (const name of ['hips', ...UPPER]) p[name] = [0, 1, 2].map(c => pchip(ts, keys.map(k => k[name][c]), t));
  return solve(p);
}

// Samples the key poses so the planted feet stay consistent with the hips between keys.
function sampleClip(name, keys, fps, loop) {
  const duration = keys[keys.length - 1].t;
  const n = Math.round(duration * fps);
  const times = [...Array(n + 1)].map((_, i) => (i * duration) / n);
  const poses = times.map(t => poseAt(keys, t));
  const tracks = [positionTrack('Joint_hips', times.map((time, i) => ({ time, position: poses[i].hips })), 'LINEAR')];
  for (const j of [...UPPER, ...LEGS]) {
    tracks.push(rotationTrack('Joint_' + j, times.map((time, i) => ({ time, rotation: poses[i][j] })), 'LINEAR'));
  }
  return createClip(name, duration, tracks, { loop });
}

// ---------- build ----------
async function build() {
  const blue = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Greek blue linen', baseColor: TINT.blue });
  const skin = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Skin', baseColor: TINT.skin });
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE, name: 'Bronze', baseColor: TINT.bronze });
  // UV repeat in metres: cloth and bronze at their physical map size; skin samples the linen
  // maps at a fine repeat so the weave averages out to an even tone.
  const mats = { blue: [blue, 0.5], skin: [skin, 0.04], bronze: [bronze, 1] };
  const part = (name, mat, parent, fill) => {
    const sh = shape(mats[mat][1]);
    fill(sh);
    return createPart(name, sh.geometry(), mats[mat][0], { parent });
  };

  const root = createRoot('GreekSoldier');
  const J = {};
  J.hips = createPivot('hips', [0, BODY.hipsY, 0], root);
  J.spine = createPivot('spine', [0, BODY.spineUp, 0], J.hips);
  J.neck = createPivot('neck', [0, BODY.neckUp, 0], J.spine);
  J.head = createPivot('head', [0, BODY.headUp, 0], J.neck);

  // Kilt of linen strips: flares so the thighs swing inside it; top tucks under the cuirass.
  part('kilt', 'blue', J.hips, s => s
    .add(revolve([[0.225, -0.27, 0.95], [0.19, -0.05, 0.85], [0.14, 0.06, 0.72], [0.128, 0.06, 0.72], [0.178, -0.05, 0.85], [0.213, -0.27, 0.95], [0.225, -0.27, 0.95]], 12))
    .add(boxGeo(0.24, 0.14, 0.17), { p: [0, -0.07, 0] }));

  // Linen cuirass with shoulder flaps, bronze belt.
  part('cuirass', 'blue', J.spine, s => {
    s.add(revolve([[0.155, -0.07], [0.145, -0.02], [0.148, 0.08], [0.168, 0.2], [0.172, 0.29], [0.15, 0.36], [0.09, 0.4], [0.05, 0.41], [0, 0.41]], 10), { s: [1, 1, 0.72] });
    for (const x of [-1, 1]) s.add(boxGeo(0.15, 0.025, 0.2), { p: [x * 0.125, 0.39, 0], r: [0, 0, -x * 12] });
  });
  part('belt', 'bronze', J.spine, s => s.add(revolve([[0.162, -0.075], [0.166, -0.06], [0.166, -0.03], [0.162, -0.015]], 10), { s: [1, 1, 0.72] }));

  part('neck', 'skin', J.neck, s => s.add(cylinderGeo(0.05, 0.056, 0.14, 8), { p: [0, 0.05, 0] }));

  // Head and helmet. The helmet frame sits on the brow, above the eyes.
  const HELM = { p: [0, 0.145, 0.005] };
  part('head', 'skin', J.head, s => s
    .add(sphereGeo(1, 10, 8), { p: [0, 0.115, 0.005], s: [0.085, 0.118, 0.098] })
    .add(prism([[0, 0.03], [0.026, -0.022], [0, -0.032]], 0.026), { p: [0, 0.1, 0.09] }));
  // Achaean helmet: a tall cone of stepped rows (the boar's-tusk tiers, cast in bronze) rising
  // to a plume knob, with the same cheek and neck guards as the Trojan one.
  part('helmet', 'bronze', J.head, s => {
    s.add(revolve([[0.126, -0.015], [0.115, 0.035], [0.103, 0.035], [0.094, 0.075], [0.082, 0.075], [0.073, 0.11], [0.062, 0.11], [0.052, 0.142], [0.04, 0.142], [0.02, 0.166], [0.017, 0.188], [0.031, 0.198], [0.025, 0.213], [0, 0.215]], 12), HELM, { s: [0.92, 1, 1.05] });
    for (const x of [-1, 1]) s.add(prism([[-0.035, 0.012], [0.07, 0.012], [0.058, -0.06], [0.03, -0.095], [-0.028, -0.085]], 0.012), HELM, { p: [x * 0.099, 0, 0], r: [0, 0, -x * 9] });
    s.add(boxGeo(0.15, 0.055, 0.012), HELM, { p: [0, -0.025, -0.118], r: [25, 0, 0] });
  });
  // Horsehair plume springing from the knob, arching back and fanning out as it falls
  // behind the helmet; it reaches no further back or lower than the Trojan crest.
  part('crest', 'blue', J.head, s => s.add(sweep([
    [0, 0.195, 0.016, 0.016], [-0.005, 0.232, 0.02, 0.022], [-0.035, 0.252, 0.024, 0.03],
    [-0.08, 0.256, 0.028, 0.036], [-0.125, 0.238, 0.03, 0.042], [-0.165, 0.2, 0.032, 0.048],
    [-0.192, 0.152, 0.032, 0.052], [-0.21, 0.096, 0.03, 0.054], [-0.22, 0.042, 0.024, 0.05],
    [-0.225, 0.0, 0.012, 0.04],
  ]), HELM));

  for (const side of ['right', 'left']) {
    const x = side === 'right' ? -1 : 1;
    J['shoulder_' + side] = createPivot('shoulder_' + side, [x * BODY.shoulderX, BODY.shoulderUp, 0], J.spine);
    J['elbow_' + side] = createPivot('elbow_' + side, [0, -BODY.upperArm, 0], J['shoulder_' + side]);
    J['wrist_' + side] = createPivot('wrist_' + side, [0, -BODY.forearm, 0], J['elbow_' + side]);
    const socket = createPivot('socket_' + side, GRIP.socket, J['wrist_' + side]);
    socket.name = 'socket_hand_' + side;
    socket.rotation.set(GRIP.tilt * D2R, 0, 0);

    part('sleeve_' + side, 'blue', J['shoulder_' + side], s => s
      .add(cylinderGeo(0.06, 0.056, 0.11, 8), { p: [0, -0.045, 0] })
      .add(sphereGeo(0.062, 8, 6), { p: [0, 0, 0] }));
    part('upper_arm_' + side, 'skin', J['shoulder_' + side], s => s.add(cylinderGeo(0.05, 0.042, 0.3, 8), { p: [0, -0.145, 0] }));
    part('forearm_' + side, 'skin', J['elbow_' + side], s => s
      .add(cylinderGeo(0.042, 0.032, 0.26, 8), { p: [0, -0.125, 0] })
      .add(sphereGeo(0.043, 8, 6)));
    part('hand_' + side, 'skin', J['wrist_' + side], s => s
      .add(boxGeo(0.05, 0.07, 0.075), { p: [0, -0.035, 0.005] })
      .add(tube(GRIP.radius, GRIP.fistOuter, GRIP.fistLength, 8), { p: GRIP.socket, r: [GRIP.tilt, 0, 0] }));

    J['hip_' + side] = createPivot('hip_' + side, [x * BODY.hipX, BODY.hipDrop, 0], J.hips);
    J['knee_' + side] = createPivot('knee_' + side, [0, -BODY.thigh, 0], J['hip_' + side]);
    J['ankle_' + side] = createPivot('ankle_' + side, [0, -BODY.shin, 0], J['knee_' + side]);
    part('thigh_' + side, 'skin', J['hip_' + side], s => s.add(cylinderGeo(0.072, 0.052, 0.44, 8), { p: [0, -0.21, 0] }));
    part('shin_' + side, 'skin', J['knee_' + side], s => s.add(cylinderGeo(0.05, 0.034, 0.45, 8), { p: [0, -0.215, 0] }));
    part('greave_' + side, 'bronze', J['knee_' + side], s => s.add(cylinderGeo(0.062, 0.044, 0.4, 8), { p: [0, -0.17, 0] }));
    part('foot_' + side, 'skin', J['ankle_' + side], s => s.add(prism([[-0.055, -0.085], [0.185, -0.085], [0.185, -0.058], [0.04, -0.01], [-0.055, -0.02]], 0.095)));
  }

  // Bronze leaf sword, grip centred on its origin in the right-hand socket (pack sword ~0.7 m).
  const sword = part('sword', 'bronze', root.getObjectByName('socket_hand_right'), s => s
    .add(cylinderGeo(GRIP.radius, GRIP.radius, GRIP.length, 8))
    .add(cylinderGeo(0.03, 0.042, 0.03, 8), { p: [0, -GRIP.length / 2 - 0.015, 0] })
    .add(boxGeo(0.034, 0.024, 0.11), { p: [0, GRIP.length / 2 + 0.012, 0] })
    .add(blade([[0.079, 0.022, 0.007], [0.12, 0.02, 0.007], [0.3, 0.018, 0.0065], [0.47, 0.028, 0.0065], [0.57, 0.022, 0.005], [0.635, 0.008, 0.003], [0.665, 0, 0]])));
  sword.name = 'sword';

  // Rest pose is the first idle frame, so a static instance stands in guard.
  const p0 = solve(GUARD);
  J.hips.position.set(...p0.hips);
  for (const j of [...UPPER, ...LEGS]) J[j].rotation.set(...p0[j].map(d => d * D2R), 'XYZ');
  return root;
}

function animate() {
  return [sampleClip('idle', IDLE_KEYS, 15, true), sampleClip('attack', ATTACK_KEYS, 30, false)];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_hector = (() => {
const meta = { name: 'Hector' };

// Troy pack conventions: metres, +Y up, the soldier faces +Z, so his right side is -X.
// Rigid segments on named joints (the runtime exports no skinning); joint rotations are
// Euler XYZ degrees. For hanging limbs negative X swings forward; for the spine positive X
// leans forward.
const D2R = Math.PI / 180;

// Pinned pack materials (portableSpec copied from kiln_material get).
const LINEN = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Neutral woven fabric',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' },
  },
};
const BRONZE = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};
// Base-colour factors chosen so factor x mean map colour (linear) ~= the palette colour:
// trojan-crimson #8c2f2a, skin #c59a78 (red clamps at 1), bronze #b08d57.
const TINT = { crimson: 0xcb4d50, skin: 0xffecd2, bronze: 0xfcc77b };

// Body: hips joint height, segment lengths, joint offsets.
const BODY = {
  hipsY: 0.95, hipX: 0.095, hipDrop: -0.03, thigh: 0.42, shin: 0.415, ankleY: 0.085,
  spineUp: 0.10, neckUp: 0.40, headUp: 0.08,
  shoulderX: 0.205, shoulderUp: 0.35, upperArm: 0.29, forearm: 0.25,
};
// Pack hand grip: every held item has a 0.03 m radius, 0.11 m grip centred on its origin
// along its +Y; the fist closes to it. The socket tilts the grip 45 deg forward-down from
// the forearm, as a sword sits diagonally across a closed palm.
const GRIP = { radius: 0.03, length: 0.11, fistOuter: 0.05, fistLength: 0.09, socket: [0, -0.07, 0.01], tilt: 135 };
// Feet stay planted at these depths in every clip; legs are solved from the hips position.
const STANCE = { left: 0.15, right: -0.14 };

// ---------- geometry helpers ----------
function xf(t = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.r || [0, 0, 0]).map(d => d * D2R), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...(t.p || [0, 0, 0])), q, new THREE.Vector3(...(t.s || [1, 1, 1])));
}

// Collects transformed triangles for one mesh (one material, one rigid segment).
function shape(uvScale) {
  const pos = [];
  const v = new THREE.Vector3();
  const api = {
    add(geo, ...ts) {
      const m = new THREE.Matrix4();
      for (const t of ts) m.multiply(xf(t));
      const src = geo.index ? geo.toNonIndexed() : geo;
      const a = src.getAttribute('position');
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
      return api;
    },
    geometry() {
      const uvs = [];
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
        for (let k = 0; k < 9; k += 3) {
          const x = pos[i + k], y = pos[i + k + 1], z = pos[i + k + 2];
          if (nx >= ny && nx >= nz) uvs.push(z / uvScale, y / uvScale);
          else if (ny >= nz) uvs.push(x / uvScale, z / uvScale);
          else uvs.push(x / uvScale, y / uvScale);
        }
      }
      return meshGeo({ positions: pos, uvs });
    },
  };
  return api;
}

// Triangle soup whose faces are turned to face `out`; zero-area faces are dropped.
function soup() {
  const pos = [];
  const tri = (a, b, c, out) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(...n) < 1e-12) return;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  return { tri, quad, geo };
}

// Surface of revolution about Y. Profile entries [r, y, zScale?] run up the outside and back
// down any inside, so (dy, -dr) is the outward profile normal.
function revolve(profile, segs) {
  const s = soup();
  const P = (e, a) => [e[0] * Math.cos(a), e[1], e[0] * Math.sin(a) * (e[2] ?? 1)];
  for (let k = 0; k < profile.length - 1; k++) {
    const e0 = profile[k], e1 = profile[k + 1];
    const nr = e1[1] - e0[1], ny = -(e1[0] - e0[0]);
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
      s.quad(P(e0, a0), P(e0, a1), P(e1, a1), P(e1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  return s.geo();
}

// Convex polygon [[u, v]] in the Z-Y plane (u -> z, v -> y), extruded across X.
function prism(poly, width) {
  const s = soup(), h = width / 2;
  const c = poly.reduce((m, p) => [m[0] + p[0] / poly.length, m[1] + p[1] / poly.length], [0, 0]);
  for (let i = 1; i < poly.length - 1; i++) {
    s.tri([h, poly[0][1], poly[0][0]], [h, poly[i][1], poly[i][0]], [h, poly[i + 1][1], poly[i + 1][0]], [1, 0, 0]);
    s.tri([-h, poly[0][1], poly[0][0]], [-h, poly[i][1], poly[i][0]], [-h, poly[i + 1][1], poly[i + 1][0]], [-1, 0, 0]);
  }
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const out = [0, (p[1] + q[1]) / 2 - c[1], (p[0] + q[0]) / 2 - c[0]];
    s.quad([h, p[1], p[0]], [h, q[1], q[0]], [-h, q[1], q[0]], [-h, p[1], p[0]], out);
  });
  return s.geo();
}

// Band between two matching polylines in the Z-Y plane, extruded across X (crest).
function band(outer, inner, width) {
  const s = soup(), h = width / 2, n = outer.length;
  const V = (p, x) => [x, p[1], p[0]];
  for (let i = 0; i < n - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    s.quad(V(o0, h), V(o1, h), V(i1, h), V(i0, h), [1, 0, 0]);
    s.quad(V(o0, -h), V(o1, -h), V(i1, -h), V(i0, -h), [-1, 0, 0]);
    const oo = [0, (o0[1] + o1[1] - i0[1] - i1[1]) / 2, (o0[0] + o1[0] - i0[0] - i1[0]) / 2];
    s.quad(V(o0, h), V(o1, h), V(o1, -h), V(o0, -h), oo);
    s.quad(V(i0, h), V(i1, h), V(i1, -h), V(i0, -h), oo.map(x => -x));
  }
  const cap = (k, j) => {
    const out = [0, outer[k][1] + inner[k][1] - outer[j][1] - inner[j][1], outer[k][0] + inner[k][0] - outer[j][0] - inner[j][0]];
    s.quad(V(outer[k], h), V(inner[k], h), V(inner[k], -h), V(outer[k], -h), out);
  };
  cap(0, 1); cap(n - 1, n - 2);
  return s.geo();
}

// Thick tube along Y: the closed fist around the pack grip.
function tube(rIn, rOut, length, segs) {
  const s = soup(), h = length / 2;
  const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
    const rad = [Math.cos(am), 0, Math.sin(am)];
    s.quad(P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h), rad);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h), rad.map(x => -x));
    s.quad(P(rIn, a0, h), P(rIn, a1, h), P(rOut, a1, h), P(rOut, a0, h), [0, 1, 0]);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rOut, a1, -h), P(rOut, a0, -h), [0, -1, 0]);
  }
  return s.geo();
}

// Leaf-shaped blade along +Y with a diamond section: width along Z, ribbed thickness along X.
function blade(stations) {
  const s = soup();
  const ring = st => [[0, st[0], st[1]], [st[2], st[0], 0], [0, st[0], -st[1]], [-st[2], st[0], 0]];
  for (let k = 0; k < stations.length - 1; k++) {
    const r0 = ring(stations[k]), r1 = ring(stations[k + 1]);
    for (let j = 0; j < 4; j++) {
      const a = r0[j], b = r0[(j + 1) % 4], c = r1[(j + 1) % 4], d = r1[j];
      s.quad(a, b, c, d, [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4]);
    }
  }
  const r0 = ring(stations[0]);
  s.quad(r0[0], r0[1], r0[2], r0[3], [0, -1, 0]);
  return s.geo();
}

// Cloak sheet hanging down the back. Rows [y, halfWidth, zCentre, zEdge] run from over the
// shoulders to the hem; each row curves forward to its edges and soft folds deepen toward the
// hem. Thickness is taken across the sheet; faces turn away from the spine axis.
function drape(rows, segs, thick, fold) {
  const s = soup(), n = rows.length;
  const nrm = rows.map((_, k) => {
    const a = rows[Math.max(k - 1, 0)], b = rows[Math.min(k + 1, n - 1)];
    const ty = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(ty, tz);
    return [-tz / l, ty / l];
  });
  const P = (k, j, side) => {
    const [y, hw, zc, ze] = rows[k], u = (2 * j) / segs - 1, v = k / (n - 1), h = (side * thick) / 2;
    const z = zc + (ze - zc) * u * u - fold * v * v * Math.cos(2.5 * Math.PI * u);
    return [u * hw, y + h * nrm[k][0], z + h * nrm[k][1]];
  };
  for (let k = 0; k < n - 1; k++) {
    const ny = (nrm[k][0] + nrm[k + 1][0]) / 2, nz = (nrm[k][1] + nrm[k + 1][1]) / 2;
    for (let j = 0; j < segs; j++) {
      const out = [((2 * j + 1) / segs - 1) * rows[k][1], ny, nz];
      s.quad(P(k, j, 1), P(k, j + 1, 1), P(k + 1, j + 1, 1), P(k + 1, j, 1), out);
      s.quad(P(k, j, -1), P(k, j + 1, -1), P(k + 1, j + 1, -1), P(k + 1, j, -1), out.map(c => -c));
    }
    for (const j of [0, segs]) s.quad(P(k, j, 1), P(k + 1, j, 1), P(k + 1, j, -1), P(k, j, -1), [j ? 1 : -1, 0, 0]);
  }
  for (const [k, l] of [[0, 1], [n - 1, n - 2]]) {
    const out = [0, rows[k][0] - rows[l][0], rows[k][2] - rows[l][2]];
    for (let j = 0; j < segs; j++) s.quad(P(k, j, 1), P(k, j + 1, 1), P(k, j + 1, -1), P(k, j, -1), out);
  }
  return s.geo();
}

// ---------- pose ----------
const UPPER = ['spine', 'neck', 'head', 'shoulder_right', 'elbow_right', 'wrist_right', 'shoulder_left', 'elbow_left', 'wrist_left'];
const LEGS = ['hip_right', 'knee_right', 'ankle_right', 'hip_left', 'knee_left', 'ankle_left'];

// Guard stance: left foot leads, sword held forward and up, left arm relaxed.
const GUARD = {
  hips: [0, 0.91, 0.01],
  spine: [6, -12, 0], neck: [-2, 0, 0], head: [-2, 10, 0],
  shoulder_right: [-20, 0, -10], elbow_right: [-55, 0, 0], wrist_right: [-15, 0, 0],
  shoulder_left: [-8, 0, 10], elbow_left: [-30, 0, 0], wrist_left: [0, 0, 0],
};
const pose = o => ({ ...GUARD, ...o });

const IDLE_KEYS = [
  { t: 0, ...GUARD },
  { t: 1.5, ...pose({ hips: [0, 0.898, 0.02], spine: [8, -8, 1], neck: [-3, 0, 0], head: [-1, -2, 0], shoulder_right: [-24, 0, -11], elbow_right: [-63, 0, 0], wrist_right: [-10, 0, 0], shoulder_left: [-11, 0, 12], elbow_left: [-36, 0, 0] }) },
  { t: 3, ...GUARD },
];

// Forehand diagonal cut: cock the sword behind the right shoulder, swing down across to
// the left hip while the weight shifts onto the lead leg, then recover to guard.
const ATTACK_KEYS = [
  { t: 0, ...GUARD },
  { t: 0.38, ...pose({ hips: [0, 0.905, -0.04], spine: [-6, -38, 4], neck: [0, 0, 0], head: [0, 25, 0], shoulder_right: [-150, 0, -25], elbow_right: [-60, 0, 0], wrist_right: [-25, 0, 0], shoulder_left: [-70, 0, 15], elbow_left: [-20, 0, 0] }) },
  { t: 0.54, ...pose({ hips: [0, 0.87, 0.07], spine: [14, 10, -3], head: [-6, -8, 0], shoulder_right: [-75, 0, -5], elbow_right: [-5, 0, 0], wrist_right: [40, 0, 0], shoulder_left: [20, 0, 12], elbow_left: [-75, 0, 0] }) },
  { t: 0.7, ...pose({ hips: [0, 0.865, 0.08], spine: [18, 30, -4], head: [-8, -22, 0], shoulder_right: [-55, 0, 15], elbow_right: [-10, 0, 0], wrist_right: [45, 0, 0], shoulder_left: [25, 0, 15], elbow_left: [-80, 0, 0] }) },
  { t: 1.1, ...pose({ hips: [0, 0.9, 0.03], spine: [8, -5, 0], head: [-3, 6, 0], shoulder_right: [-30, 0, -8], elbow_right: [-50, 0, 0], wrist_right: [-5, 0, 0], shoulder_left: [-5, 0, 10], elbow_left: [-40, 0, 0] }) },
  { t: 1.5, ...GUARD },
];

// Two-bone leg in its sagittal plane, foot kept level at its planted depth.
function legIK(hips, side) {
  const hy = hips[1] + BODY.hipDrop, hz = hips[2];
  const dy = BODY.ankleY - hy, dz = STANCE[side] - hz;
  const L = Math.min(Math.hypot(dy, dz), BODY.thigh + BODY.shin - 1e-4);
  const a = Math.acos((BODY.thigh ** 2 + L * L - BODY.shin ** 2) / (2 * BODY.thigh * L));
  const b = Math.acos((BODY.shin ** 2 + L * L - BODY.thigh ** 2) / (2 * BODY.shin * L));
  const phi = Math.atan2(dz, -dy);
  const hip = -(phi + a) / D2R, knee = (a + b) / D2R;
  return { ['hip_' + side]: [hip, 0, 0], ['knee_' + side]: [knee, 0, 0], ['ankle_' + side]: [-(hip + knee), 0, 0] };
}
const solve = p => ({ ...p, ...legIK(p.hips, 'right'), ...legIK(p.hips, 'left') });

// Monotone cubic (Fritsch-Carlson) through the key values; flat at the ends.
function pchip(ts, vs, t) {
  const n = ts.length;
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const slope = k => {
    if (k === 0 || k === n - 1) return 0;
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
    const d0 = (vs[k] - vs[k - 1]) / h0, d1 = (vs[k + 1] - vs[k]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  };
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * slope(i) * h + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * slope(i + 1) * h;
}
function poseAt(keys, t) {
  const ts = keys.map(k => k.t);
  const p = {};
  for (const name of ['hips', ...UPPER]) p[name] = [0, 1, 2].map(c => pchip(ts, keys.map(k => k[name][c]), t));
  return solve(p);
}

// Samples the key poses so the planted feet stay consistent with the hips between keys.
function sampleClip(name, keys, fps, loop) {
  const duration = keys[keys.length - 1].t;
  const n = Math.round(duration * fps);
  const times = [...Array(n + 1)].map((_, i) => (i * duration) / n);
  const poses = times.map(t => poseAt(keys, t));
  const tracks = [positionTrack('Joint_hips', times.map((time, i) => ({ time, position: poses[i].hips })), 'LINEAR')];
  for (const j of [...UPPER, ...LEGS]) {
    tracks.push(rotationTrack('Joint_' + j, times.map((time, i) => ({ time, rotation: poses[i][j] })), 'LINEAR'));
  }
  return createClip(name, duration, tracks, { loop });
}

// ---------- build ----------
async function build() {
  const crimson = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Trojan crimson linen', baseColor: TINT.crimson });
  const skin = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Skin', baseColor: TINT.skin });
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE, name: 'Bronze', baseColor: TINT.bronze });
  // UV repeat in metres: cloth and bronze at their physical map size; skin samples the linen
  // maps at a fine repeat so the weave averages out to an even tone.
  const mats = { crimson: [crimson, 0.5], skin: [skin, 0.04], bronze: [bronze, 1] };
  const part = (name, mat, parent, fill) => {
    const sh = shape(mats[mat][1]);
    fill(sh);
    return createPart(name, sh.geometry(), mats[mat][0], { parent });
  };

  const root = createRoot('Hector');
  const J = {};
  J.hips = createPivot('hips', [0, BODY.hipsY, 0], root);
  J.spine = createPivot('spine', [0, BODY.spineUp, 0], J.hips);
  J.neck = createPivot('neck', [0, BODY.neckUp, 0], J.spine);
  J.head = createPivot('head', [0, BODY.headUp, 0], J.neck);

  // Kilt of linen strips: flares so the thighs swing inside it; top tucks under the cuirass.
  part('kilt', 'crimson', J.hips, s => s
    .add(revolve([[0.225, -0.27, 0.95], [0.19, -0.05, 0.85], [0.14, 0.06, 0.72], [0.128, 0.06, 0.72], [0.178, -0.05, 0.85], [0.213, -0.27, 0.95], [0.225, -0.27, 0.95]], 12))
    .add(boxGeo(0.24, 0.14, 0.17), { p: [0, -0.07, 0] }));

  // Bronze bell cuirass with a flared lower rim, shoulder plates and the cloak's brooches;
  // crimson sash at the waist.
  part('cuirass', 'bronze', J.spine, s => {
    s.add(revolve([[0.178, -0.092], [0.171, -0.075], [0.152, -0.05], [0.147, -0.02], [0.15, 0.08], [0.17, 0.2], [0.174, 0.29], [0.152, 0.36], [0.09, 0.4], [0.05, 0.41], [0, 0.41]], 10), { s: [1, 1, 0.72] });
    for (const x of [-1, 1]) s.add(boxGeo(0.15, 0.025, 0.2), { p: [x * 0.125, 0.39, 0], r: [0, 0, -x * 12] });
    for (const x of [-1, 1]) s.add(cylinderGeo(0.024, 0.024, 0.012, 8), { p: [x * 0.14, 0.445, 0.004], r: [30, 0, 0] });
  });
  part('belt', 'crimson', J.spine, s => s.add(revolve([[0.152, -0.048], [0.157, -0.04], [0.157, -0.012], [0.151, -0.004]], 10), { s: [1, 1, 0.72] }));
  // Crimson cloak pinned at both shoulders, over the shoulder plates and down the back to
  // above the knees. Rigid on the spine joint, so the rig and its channels are unchanged.
  part('cloak', 'crimson', J.spine, s => s.add(drape([[0.435, 0.14, -0.07, 0], [0.425, 0.165, -0.128, -0.07], [0.33, 0.178, -0.158, -0.098], [0.15, 0.2, -0.182, -0.125], [-0.1, 0.24, -0.226, -0.156], [-0.47, 0.3, -0.31, -0.2]], 10, 0.012, 0.022)));

  part('neck', 'skin', J.neck, s => s.add(cylinderGeo(0.05, 0.056, 0.14, 8), { p: [0, 0.05, 0] }));

  // Head and helmet. The helmet frame sits on the brow, above the eyes.
  const HELM = { p: [0, 0.145, 0.005] };
  part('head', 'skin', J.head, s => s
    .add(sphereGeo(1, 10, 8), { p: [0, 0.115, 0.005], s: [0.085, 0.118, 0.098] })
    .add(prism([[0, 0.03], [0.026, -0.022], [0, -0.032]], 0.026), { p: [0, 0.1, 0.09] }));
  part('helmet', 'bronze', J.head, s => {
    s.add(revolve([[0.124, -0.012], [0.113, 0.008], [0.113, 0.04], [0.102, 0.075], [0.078, 0.104], [0.042, 0.122], [0, 0.128]], 12), HELM, { s: [0.92, 1, 1.05] });
    for (const x of [-1, 1]) s.add(prism([[-0.035, 0.012], [0.07, 0.012], [0.058, -0.06], [0.03, -0.095], [-0.028, -0.085]], 0.012), HELM, { p: [x * 0.099, 0, 0], r: [0, 0, -x * 9] });
    s.add(boxGeo(0.15, 0.055, 0.012), HELM, { p: [0, -0.025, -0.118], r: [25, 0, 0] });
    s.add(boxGeo(0.022, 0.03, 0.2), HELM, { p: [0, 0.135, -0.01] });
  });
  // Champion's tall horsehair crest sweeping from the brow over the crown and down the back.
  const crestArc = (cz, cy, rz, ry) => [...Array(12)].map((_, i) => {
    const a = (35 + (150 * i) / 11) * D2R;
    return [cz + rz * Math.cos(a), cy + ry * Math.sin(a)];
  });
  part('crest', 'crimson', J.head, s => s.add(band(crestArc(-0.03, 0.04, 0.24, 0.34), crestArc(0, 0, 0.122, 0.138), 0.055), HELM));

  for (const side of ['right', 'left']) {
    const x = side === 'right' ? -1 : 1;
    J['shoulder_' + side] = createPivot('shoulder_' + side, [x * BODY.shoulderX, BODY.shoulderUp, 0], J.spine);
    J['elbow_' + side] = createPivot('elbow_' + side, [0, -BODY.upperArm, 0], J['shoulder_' + side]);
    J['wrist_' + side] = createPivot('wrist_' + side, [0, -BODY.forearm, 0], J['elbow_' + side]);
    const socket = createPivot('socket_' + side, GRIP.socket, J['wrist_' + side]);
    socket.name = 'socket_hand_' + side;
    socket.rotation.set(GRIP.tilt * D2R, 0, 0);

    part('sleeve_' + side, 'crimson', J['shoulder_' + side], s => s
      .add(cylinderGeo(0.06, 0.056, 0.11, 8), { p: [0, -0.045, 0] })
      .add(sphereGeo(0.062, 8, 6), { p: [0, 0, 0] }));
    part('upper_arm_' + side, 'skin', J['shoulder_' + side], s => s.add(cylinderGeo(0.05, 0.042, 0.3, 8), { p: [0, -0.145, 0] }));
    part('forearm_' + side, 'skin', J['elbow_' + side], s => s
      .add(cylinderGeo(0.042, 0.032, 0.26, 8), { p: [0, -0.125, 0] })
      .add(sphereGeo(0.043, 8, 6)));
    part('hand_' + side, 'skin', J['wrist_' + side], s => s
      .add(boxGeo(0.05, 0.07, 0.075), { p: [0, -0.035, 0.005] })
      .add(tube(GRIP.radius, GRIP.fistOuter, GRIP.fistLength, 8), { p: GRIP.socket, r: [GRIP.tilt, 0, 0] }));

    J['hip_' + side] = createPivot('hip_' + side, [x * BODY.hipX, BODY.hipDrop, 0], J.hips);
    J['knee_' + side] = createPivot('knee_' + side, [0, -BODY.thigh, 0], J['hip_' + side]);
    J['ankle_' + side] = createPivot('ankle_' + side, [0, -BODY.shin, 0], J['knee_' + side]);
    part('thigh_' + side, 'skin', J['hip_' + side], s => s.add(cylinderGeo(0.072, 0.052, 0.44, 8), { p: [0, -0.21, 0] }));
    part('shin_' + side, 'skin', J['knee_' + side], s => s.add(cylinderGeo(0.05, 0.034, 0.45, 8), { p: [0, -0.215, 0] }));
    part('greave_' + side, 'bronze', J['knee_' + side], s => s.add(cylinderGeo(0.062, 0.044, 0.4, 8), { p: [0, -0.17, 0] }));
    part('foot_' + side, 'skin', J['ankle_' + side], s => s.add(prism([[-0.055, -0.085], [0.185, -0.085], [0.185, -0.058], [0.04, -0.01], [-0.055, -0.02]], 0.095)));
  }

  // Bronze leaf sword, grip centred on its origin in the right-hand socket (pack sword ~0.7 m).
  const sword = part('sword', 'bronze', root.getObjectByName('socket_hand_right'), s => s
    .add(cylinderGeo(GRIP.radius, GRIP.radius, GRIP.length, 8))
    .add(cylinderGeo(0.03, 0.042, 0.03, 8), { p: [0, -GRIP.length / 2 - 0.015, 0] })
    .add(boxGeo(0.034, 0.024, 0.11), { p: [0, GRIP.length / 2 + 0.012, 0] })
    .add(blade([[0.079, 0.022, 0.007], [0.12, 0.02, 0.007], [0.3, 0.018, 0.0065], [0.47, 0.028, 0.0065], [0.57, 0.022, 0.005], [0.635, 0.008, 0.003], [0.665, 0, 0]])));
  sword.name = 'sword';

  // Rest pose is the first idle frame, so a static instance stands in guard.
  const p0 = solve(GUARD);
  J.hips.position.set(...p0.hips);
  for (const j of [...UPPER, ...LEGS]) J[j].rotation.set(...p0[j].map(d => d * D2R), 'XYZ');
  return root;
}

function animate() {
  return [sampleClip('idle', IDLE_KEYS, 15, true), sampleClip('attack', ATTACK_KEYS, 30, false)];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_achilles = (() => {
const meta = { name: 'Achilles' };

// Troy pack conventions: metres, +Y up, the soldier faces +Z, so his right side is -X.
// Rigid segments on named joints (the runtime exports no skinning); joint rotations are
// Euler XYZ degrees. For hanging limbs negative X swings forward; for the spine positive X
// leans forward.
const D2R = Math.PI / 180;

// Pinned pack materials (portableSpec copied from kiln_material get).
const LINEN = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Neutral woven fabric',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness' },
  },
};
const BRONZE = {
  schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Brushed neutral metal',
  roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
  textures: {
    baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
    normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
    metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
  },
};
// Base-colour factors chosen so factor x mean map colour (linear) ~= the palette colour:
// greek-blue #2f4a6b, skin #c59a78 (red clamps at 1), bronze #b08d57.
const TINT = { blue: 0x4875bd, skin: 0xffecd2, bronze: 0xfcc77b };

// Body: hips joint height, segment lengths, joint offsets.
const BODY = {
  hipsY: 0.95, hipX: 0.095, hipDrop: -0.03, thigh: 0.42, shin: 0.415, ankleY: 0.085,
  spineUp: 0.10, neckUp: 0.40, headUp: 0.08,
  shoulderX: 0.205, shoulderUp: 0.35, upperArm: 0.29, forearm: 0.25,
};
// Pack hand grip: every held item has a 0.03 m radius, 0.11 m grip centred on its origin
// along its +Y; the fist closes to it. The socket tilts the grip 45 deg forward-down from
// the forearm, as a sword sits diagonally across a closed palm.
const GRIP = { radius: 0.03, length: 0.11, fistOuter: 0.05, fistLength: 0.09, socket: [0, -0.07, 0.01], tilt: 135 };
// Feet stay planted at these depths in every clip; legs are solved from the hips position.
const STANCE = { left: 0.15, right: -0.14 };

// ---------- geometry helpers ----------
function xf(t = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.r || [0, 0, 0]).map(d => d * D2R), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...(t.p || [0, 0, 0])), q, new THREE.Vector3(...(t.s || [1, 1, 1])));
}

// Collects transformed triangles for one mesh (one material, one rigid segment).
function shape(uvScale) {
  const pos = [];
  const v = new THREE.Vector3();
  const api = {
    add(geo, ...ts) {
      const m = new THREE.Matrix4();
      for (const t of ts) m.multiply(xf(t));
      const src = geo.index ? geo.toNonIndexed() : geo;
      const a = src.getAttribute('position');
      for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
      return api;
    },
    geometry() {
      const uvs = [];
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
        const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
        const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
        for (let k = 0; k < 9; k += 3) {
          const x = pos[i + k], y = pos[i + k + 1], z = pos[i + k + 2];
          if (nx >= ny && nx >= nz) uvs.push(z / uvScale, y / uvScale);
          else if (ny >= nz) uvs.push(x / uvScale, z / uvScale);
          else uvs.push(x / uvScale, y / uvScale);
        }
      }
      return meshGeo({ positions: pos, uvs });
    },
  };
  return api;
}

// Triangle soup whose faces are turned to face `out`; zero-area faces are dropped.
function soup() {
  const pos = [];
  const tri = (a, b, c, out) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(...n) < 1e-12) return;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  return { tri, quad, geo };
}

// Surface of revolution about Y. Profile entries [r, y, zScale?] run up the outside and back
// down any inside, so (dy, -dr) is the outward profile normal.
function revolve(profile, segs) {
  const s = soup();
  const P = (e, a) => [e[0] * Math.cos(a), e[1], e[0] * Math.sin(a) * (e[2] ?? 1)];
  for (let k = 0; k < profile.length - 1; k++) {
    const e0 = profile[k], e1 = profile[k + 1];
    const nr = e1[1] - e0[1], ny = -(e1[0] - e0[0]);
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
      s.quad(P(e0, a0), P(e0, a1), P(e1, a1), P(e1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  return s.geo();
}

// Convex polygon [[u, v]] in the Z-Y plane (u -> z, v -> y), extruded across X.
function prism(poly, width) {
  const s = soup(), h = width / 2;
  const c = poly.reduce((m, p) => [m[0] + p[0] / poly.length, m[1] + p[1] / poly.length], [0, 0]);
  for (let i = 1; i < poly.length - 1; i++) {
    s.tri([h, poly[0][1], poly[0][0]], [h, poly[i][1], poly[i][0]], [h, poly[i + 1][1], poly[i + 1][0]], [1, 0, 0]);
    s.tri([-h, poly[0][1], poly[0][0]], [-h, poly[i][1], poly[i][0]], [-h, poly[i + 1][1], poly[i + 1][0]], [-1, 0, 0]);
  }
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const out = [0, (p[1] + q[1]) / 2 - c[1], (p[0] + q[0]) / 2 - c[0]];
    s.quad([h, p[1], p[0]], [h, q[1], q[0]], [-h, q[1], q[0]], [-h, p[1], p[0]], out);
  });
  return s.geo();
}

// Band between two matching polylines in the Z-Y plane, extruded across X (crest).
function band(outer, inner, width) {
  const s = soup(), h = width / 2, n = outer.length;
  const V = (p, x) => [x, p[1], p[0]];
  for (let i = 0; i < n - 1; i++) {
    const o0 = outer[i], o1 = outer[i + 1], i0 = inner[i], i1 = inner[i + 1];
    s.quad(V(o0, h), V(o1, h), V(i1, h), V(i0, h), [1, 0, 0]);
    s.quad(V(o0, -h), V(o1, -h), V(i1, -h), V(i0, -h), [-1, 0, 0]);
    const oo = [0, (o0[1] + o1[1] - i0[1] - i1[1]) / 2, (o0[0] + o1[0] - i0[0] - i1[0]) / 2];
    s.quad(V(o0, h), V(o1, h), V(o1, -h), V(o0, -h), oo);
    s.quad(V(i0, h), V(i1, h), V(i1, -h), V(i0, -h), oo.map(x => -x));
  }
  const cap = (k, j) => {
    const out = [0, outer[k][1] + inner[k][1] - outer[j][1] - inner[j][1], outer[k][0] + inner[k][0] - outer[j][0] - inner[j][0]];
    s.quad(V(outer[k], h), V(inner[k], h), V(inner[k], -h), V(outer[k], -h), out);
  };
  cap(0, 1); cap(n - 1, n - 2);
  return s.geo();
}

// Rectangular section swept along a polyline in the Z-Y plane: stations [z, y, halfThickness,
// halfWidth], thickness in the plane and width across X (horsehair plume).
function sweep(stations) {
  const s = soup(), n = stations.length;
  const tangent = i => {
    const a = stations[Math.max(i - 1, 0)], b = stations[Math.min(i + 1, n - 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const corners = i => {
    const [z, y, t, w] = stations[i], [tz, ty] = tangent(i), nz = -ty * t, ny = tz * t;
    return [[w, y + ny, z + nz], [-w, y + ny, z + nz], [-w, y - ny, z - nz], [w, y - ny, z - nz]];
  };
  for (let i = 0; i < n - 1; i++) {
    const c0 = corners(i), c1 = corners(i + 1);
    const my = (stations[i][1] + stations[i + 1][1]) / 2, mz = (stations[i][0] + stations[i + 1][0]) / 2;
    for (let k = 0; k < 4; k++) {
      const a = c0[k], b = c0[(k + 1) % 4], c = c1[(k + 1) % 4], d = c1[k];
      s.quad(a, b, c, d, [a[0] + b[0] + c[0] + d[0], a[1] + b[1] + c[1] + d[1] - 4 * my, a[2] + b[2] + c[2] + d[2] - 4 * mz]);
    }
  }
  const t0 = tangent(0), t1 = tangent(n - 1), e0 = corners(0), e1 = corners(n - 1);
  s.quad(e0[0], e0[1], e0[2], e0[3], [0, -t0[1], -t0[0]]);
  s.quad(e1[0], e1[1], e1[2], e1[3], [0, t1[1], t1[0]]);
  return s.geo();
}

// Thick tube along Y: the closed fist around the pack grip.
function tube(rIn, rOut, length, segs) {
  const s = soup(), h = length / 2;
  const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * 2 * Math.PI, a1 = ((j + 1) / segs) * 2 * Math.PI, am = (a0 + a1) / 2;
    const rad = [Math.cos(am), 0, Math.sin(am)];
    s.quad(P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h), rad);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h), rad.map(x => -x));
    s.quad(P(rIn, a0, h), P(rIn, a1, h), P(rOut, a1, h), P(rOut, a0, h), [0, 1, 0]);
    s.quad(P(rIn, a0, -h), P(rIn, a1, -h), P(rOut, a1, -h), P(rOut, a0, -h), [0, -1, 0]);
  }
  return s.geo();
}

// Leaf-shaped blade along +Y with a diamond section: width along Z, ribbed thickness along X.
function blade(stations) {
  const s = soup();
  const ring = st => [[0, st[0], st[1]], [st[2], st[0], 0], [0, st[0], -st[1]], [-st[2], st[0], 0]];
  for (let k = 0; k < stations.length - 1; k++) {
    const r0 = ring(stations[k]), r1 = ring(stations[k + 1]);
    for (let j = 0; j < 4; j++) {
      const a = r0[j], b = r0[(j + 1) % 4], c = r1[(j + 1) % 4], d = r1[j];
      s.quad(a, b, c, d, [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4]);
    }
  }
  const r0 = ring(stations[0]);
  s.quad(r0[0], r0[1], r0[2], r0[3], [0, -1, 0]);
  return s.geo();
}

// ---------- pose ----------
const UPPER = ['spine', 'neck', 'head', 'shoulder_right', 'elbow_right', 'wrist_right', 'shoulder_left', 'elbow_left', 'wrist_left'];
const LEGS = ['hip_right', 'knee_right', 'ankle_right', 'hip_left', 'knee_left', 'ankle_left'];

// Guard stance: left foot leads, sword held forward and up, left arm relaxed.
const GUARD = {
  hips: [0, 0.91, 0.01],
  spine: [6, -12, 0], neck: [-2, 0, 0], head: [-2, 10, 0],
  shoulder_right: [-20, 0, -10], elbow_right: [-55, 0, 0], wrist_right: [-15, 0, 0],
  shoulder_left: [-8, 0, 10], elbow_left: [-30, 0, 0], wrist_left: [0, 0, 0],
};
const pose = o => ({ ...GUARD, ...o });

const IDLE_KEYS = [
  { t: 0, ...GUARD },
  { t: 1.5, ...pose({ hips: [0, 0.898, 0.02], spine: [8, -8, 1], neck: [-3, 0, 0], head: [-1, -2, 0], shoulder_right: [-24, 0, -11], elbow_right: [-63, 0, 0], wrist_right: [-10, 0, 0], shoulder_left: [-11, 0, 12], elbow_left: [-36, 0, 0] }) },
  { t: 3, ...GUARD },
];

// Forehand diagonal cut: cock the sword behind the right shoulder, swing down across to
// the left hip while the weight shifts onto the lead leg, then recover to guard.
const ATTACK_KEYS = [
  { t: 0, ...GUARD },
  { t: 0.38, ...pose({ hips: [0, 0.905, -0.04], spine: [-6, -38, 4], neck: [0, 0, 0], head: [0, 25, 0], shoulder_right: [-150, 0, -25], elbow_right: [-60, 0, 0], wrist_right: [-25, 0, 0], shoulder_left: [-70, 0, 15], elbow_left: [-20, 0, 0] }) },
  { t: 0.54, ...pose({ hips: [0, 0.87, 0.07], spine: [14, 10, -3], head: [-6, -8, 0], shoulder_right: [-75, 0, -5], elbow_right: [-5, 0, 0], wrist_right: [40, 0, 0], shoulder_left: [20, 0, 12], elbow_left: [-75, 0, 0] }) },
  { t: 0.7, ...pose({ hips: [0, 0.865, 0.08], spine: [18, 30, -4], head: [-8, -22, 0], shoulder_right: [-55, 0, 15], elbow_right: [-10, 0, 0], wrist_right: [45, 0, 0], shoulder_left: [25, 0, 15], elbow_left: [-80, 0, 0] }) },
  { t: 1.1, ...pose({ hips: [0, 0.9, 0.03], spine: [8, -5, 0], head: [-3, 6, 0], shoulder_right: [-30, 0, -8], elbow_right: [-50, 0, 0], wrist_right: [-5, 0, 0], shoulder_left: [-5, 0, 10], elbow_left: [-40, 0, 0] }) },
  { t: 1.5, ...GUARD },
];

// Two-bone leg in its sagittal plane, foot kept level at its planted depth.
function legIK(hips, side) {
  const hy = hips[1] + BODY.hipDrop, hz = hips[2];
  const dy = BODY.ankleY - hy, dz = STANCE[side] - hz;
  const L = Math.min(Math.hypot(dy, dz), BODY.thigh + BODY.shin - 1e-4);
  const a = Math.acos((BODY.thigh ** 2 + L * L - BODY.shin ** 2) / (2 * BODY.thigh * L));
  const b = Math.acos((BODY.shin ** 2 + L * L - BODY.thigh ** 2) / (2 * BODY.shin * L));
  const phi = Math.atan2(dz, -dy);
  const hip = -(phi + a) / D2R, knee = (a + b) / D2R;
  return { ['hip_' + side]: [hip, 0, 0], ['knee_' + side]: [knee, 0, 0], ['ankle_' + side]: [-(hip + knee), 0, 0] };
}
const solve = p => ({ ...p, ...legIK(p.hips, 'right'), ...legIK(p.hips, 'left') });

// Monotone cubic (Fritsch-Carlson) through the key values; flat at the ends.
function pchip(ts, vs, t) {
  const n = ts.length;
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const slope = k => {
    if (k === 0 || k === n - 1) return 0;
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
    const d0 = (vs[k] - vs[k - 1]) / h0, d1 = (vs[k + 1] - vs[k]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  };
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * slope(i) * h + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * slope(i + 1) * h;
}
function poseAt(keys, t) {
  const ts = keys.map(k => k.t);
  const p = {};
  for (const name of ['hips', ...UPPER]) p[name] = [0, 1, 2].map(c => pchip(ts, keys.map(k => k[name][c]), t));
  return solve(p);
}

// Samples the key poses so the planted feet stay consistent with the hips between keys.
function sampleClip(name, keys, fps, loop) {
  const duration = keys[keys.length - 1].t;
  const n = Math.round(duration * fps);
  const times = [...Array(n + 1)].map((_, i) => (i * duration) / n);
  const poses = times.map(t => poseAt(keys, t));
  const tracks = [positionTrack('Joint_hips', times.map((time, i) => ({ time, position: poses[i].hips })), 'LINEAR')];
  for (const j of [...UPPER, ...LEGS]) {
    tracks.push(rotationTrack('Joint_' + j, times.map((time, i) => ({ time, rotation: poses[i][j] })), 'LINEAR'));
  }
  return createClip(name, duration, tracks, { loop });
}

// ---------- build ----------
async function build() {
  const blue = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Greek blue linen', baseColor: TINT.blue });
  const skin = await compilePortableMaterialSpecV2({ ...LINEN, name: 'Skin', baseColor: TINT.skin });
  const bronze = await compilePortableMaterialSpecV2({ ...BRONZE, name: 'Bronze', baseColor: TINT.bronze });
  // UV repeat in metres: cloth and bronze at their physical map size; skin samples the linen
  // maps at a fine repeat so the weave averages out to an even tone.
  const mats = { blue: [blue, 0.5], skin: [skin, 0.04], bronze: [bronze, 1] };
  const part = (name, mat, parent, fill) => {
    const sh = shape(mats[mat][1]);
    fill(sh);
    return createPart(name, sh.geometry(), mats[mat][0], { parent });
  };

  const root = createRoot('Achilles');
  const J = {};
  J.hips = createPivot('hips', [0, BODY.hipsY, 0], root);
  J.spine = createPivot('spine', [0, BODY.spineUp, 0], J.hips);
  J.neck = createPivot('neck', [0, BODY.neckUp, 0], J.spine);
  J.head = createPivot('head', [0, BODY.headUp, 0], J.neck);

  // Kilt of linen strips: flares so the thighs swing inside it; top tucks under the cuirass.
  part('kilt', 'blue', J.hips, s => s
    .add(revolve([[0.225, -0.27, 0.95], [0.19, -0.05, 0.85], [0.14, 0.06, 0.72], [0.128, 0.06, 0.72], [0.178, -0.05, 0.85], [0.213, -0.27, 0.95], [0.225, -0.27, 0.95]], 12))
    .add(boxGeo(0.24, 0.14, 0.17), { p: [0, -0.07, 0] }));
  // Two bronze hoops (Dendra-style lames) girdle the top of the kilt, stepping out just clear
  // of its flare so the thighs still swing inside.
  part('lames', 'bronze', J.hips, s => s
    .add(revolve([[0.214, -0.09, 0.875], [0.207, -0.05, 0.86], [0.186, -0.005, 0.8], [0.176, -0.005, 0.8], [0.197, -0.05, 0.86], [0.204, -0.09, 0.875], [0.214, -0.09, 0.875]], 12))
    .add(revolve([[0.228, -0.17, 0.91], [0.224, -0.09, 0.875], [0.214, -0.09, 0.875], [0.218, -0.17, 0.91], [0.228, -0.17, 0.91]], 12)));

  // Achilles' bronze cuirass: the linen cuirass's profile and shoulder flaps cast in bronze,
  // with a high neck guard rising from the dome; bronze belt.
  part('cuirass', 'bronze', J.spine, s => {
    s.add(revolve([[0.155, -0.07], [0.145, -0.02], [0.148, 0.08], [0.168, 0.2], [0.172, 0.29], [0.15, 0.36], [0.09, 0.4], [0.05, 0.41], [0, 0.41]], 10), { s: [1, 1, 0.72] });
    for (const x of [-1, 1]) s.add(boxGeo(0.15, 0.025, 0.2), { p: [x * 0.125, 0.39, 0], r: [0, 0, -x * 12] });
    s.add(revolve([[0.098, 0.36, 0.82], [0.084, 0.445, 0.85], [0.072, 0.445, 0.85], [0.082, 0.37, 0.82], [0.098, 0.36, 0.82]], 10));
  });
  part('belt', 'bronze', J.spine, s => s.add(revolve([[0.162, -0.075], [0.166, -0.06], [0.166, -0.03], [0.162, -0.015]], 10), { s: [1, 1, 0.72] }));

  part('neck', 'skin', J.neck, s => s.add(cylinderGeo(0.05, 0.056, 0.14, 8), { p: [0, 0.05, 0] }));

  // Head and helmet. The helmet frame sits on the brow, above the eyes.
  const HELM = { p: [0, 0.145, 0.005] };
  part('head', 'skin', J.head, s => s
    .add(sphereGeo(1, 10, 8), { p: [0, 0.115, 0.005], s: [0.085, 0.118, 0.098] })
    .add(prism([[0, 0.03], [0.026, -0.022], [0, -0.032]], 0.026), { p: [0, 0.1, 0.09] }));
  // Achaean helmet: a tall cone of stepped rows (the boar's-tusk tiers, cast in bronze) rising
  // to a plume knob, with the same cheek and neck guards as the Trojan one.
  part('helmet', 'bronze', J.head, s => {
    s.add(revolve([[0.126, -0.015], [0.115, 0.035], [0.103, 0.035], [0.094, 0.075], [0.082, 0.075], [0.073, 0.11], [0.062, 0.11], [0.052, 0.142], [0.04, 0.142], [0.02, 0.166], [0.017, 0.188], [0.031, 0.198], [0.025, 0.213], [0, 0.215]], 12), HELM, { s: [0.92, 1, 1.05] });
    for (const x of [-1, 1]) s.add(prism([[-0.035, 0.012], [0.07, 0.012], [0.058, -0.06], [0.03, -0.095], [-0.028, -0.085]], 0.012), HELM, { p: [x * 0.099, 0, 0], r: [0, 0, -x * 9] });
    s.add(boxGeo(0.15, 0.055, 0.012), HELM, { p: [0, -0.025, -0.118], r: [25, 0, 0] });
    // Crest holder: a short bronze stilt on the knob carries the champion's tall crest.
    s.add(cylinderGeo(0.012, 0.015, 0.07, 6), HELM, { p: [0, 0.235, 0] });
  });
  // Tall horsehair crest standing on the stilt: it rises high over the brow, then sweeps back
  // and down behind the helmet, reaching no further back or lower than the Greek plume did.
  part('crest', 'blue', J.head, s => s.add(band(
    [[0.06, 0.262], [0.075, 0.32], [0.055, 0.375], [0.005, 0.41], [-0.06, 0.408], [-0.12, 0.37], [-0.17, 0.3], [-0.205, 0.21], [-0.222, 0.1]],
    [[0.045, 0.255], [0.03, 0.262], [0.01, 0.265], [-0.015, 0.266], [-0.045, 0.262], [-0.08, 0.25], [-0.12, 0.215], [-0.155, 0.16], [-0.18, 0.09]],
    0.05), HELM));

  for (const side of ['right', 'left']) {
    const x = side === 'right' ? -1 : 1;
    J['shoulder_' + side] = createPivot('shoulder_' + side, [x * BODY.shoulderX, BODY.shoulderUp, 0], J.spine);
    J['elbow_' + side] = createPivot('elbow_' + side, [0, -BODY.upperArm, 0], J['shoulder_' + side]);
    J['wrist_' + side] = createPivot('wrist_' + side, [0, -BODY.forearm, 0], J['elbow_' + side]);
    const socket = createPivot('socket_' + side, GRIP.socket, J['wrist_' + side]);
    socket.name = 'socket_hand_' + side;
    socket.rotation.set(GRIP.tilt * D2R, 0, 0);

    part('sleeve_' + side, 'blue', J['shoulder_' + side], s => s
      .add(cylinderGeo(0.06, 0.056, 0.11, 8), { p: [0, -0.045, 0] })
      .add(sphereGeo(0.062, 8, 6), { p: [0, 0, 0] }));
    // Dendra-style shoulder guard: a curved bronze plate from the collar side over the shoulder
    // and down the outside of the arm, riding the shoulder joint and bedded on the sleeve.
    const arc = r => [115, 85, 55, 25, -5, -30].map(a => [x * r * Math.cos(a * D2R), r * Math.sin(a * D2R)]);
    part('pauldron_' + side, 'bronze', J['shoulder_' + side], s => s.add(band(arc(0.086), arc(0.066), 0.15), { r: [0, 90, 0] }));
    part('upper_arm_' + side, 'skin', J['shoulder_' + side], s => s.add(cylinderGeo(0.05, 0.042, 0.3, 8), { p: [0, -0.145, 0] }));
    part('forearm_' + side, 'skin', J['elbow_' + side], s => s
      .add(cylinderGeo(0.042, 0.032, 0.26, 8), { p: [0, -0.125, 0] })
      .add(sphereGeo(0.043, 8, 6)));
    part('hand_' + side, 'skin', J['wrist_' + side], s => s
      .add(boxGeo(0.05, 0.07, 0.075), { p: [0, -0.035, 0.005] })
      .add(tube(GRIP.radius, GRIP.fistOuter, GRIP.fistLength, 8), { p: GRIP.socket, r: [GRIP.tilt, 0, 0] }));

    J['hip_' + side] = createPivot('hip_' + side, [x * BODY.hipX, BODY.hipDrop, 0], J.hips);
    J['knee_' + side] = createPivot('knee_' + side, [0, -BODY.thigh, 0], J['hip_' + side]);
    J['ankle_' + side] = createPivot('ankle_' + side, [0, -BODY.shin, 0], J['knee_' + side]);
    part('thigh_' + side, 'skin', J['hip_' + side], s => s.add(cylinderGeo(0.072, 0.052, 0.44, 8), { p: [0, -0.21, 0] }));
    part('shin_' + side, 'skin', J['knee_' + side], s => s.add(cylinderGeo(0.05, 0.034, 0.45, 8), { p: [0, -0.215, 0] }));
    part('greave_' + side, 'bronze', J['knee_' + side], s => s.add(cylinderGeo(0.062, 0.044, 0.4, 8), { p: [0, -0.17, 0] }));
    part('foot_' + side, 'skin', J['ankle_' + side], s => s.add(prism([[-0.055, -0.085], [0.185, -0.085], [0.185, -0.058], [0.04, -0.01], [-0.055, -0.02]], 0.095)));
  }

  // Bronze leaf sword, grip centred on its origin in the right-hand socket (pack sword ~0.7 m).
  const sword = part('sword', 'bronze', root.getObjectByName('socket_hand_right'), s => s
    .add(cylinderGeo(GRIP.radius, GRIP.radius, GRIP.length, 8))
    .add(cylinderGeo(0.03, 0.042, 0.03, 8), { p: [0, -GRIP.length / 2 - 0.015, 0] })
    .add(boxGeo(0.034, 0.024, 0.11), { p: [0, GRIP.length / 2 + 0.012, 0] })
    .add(blade([[0.079, 0.022, 0.007], [0.12, 0.02, 0.007], [0.3, 0.018, 0.0065], [0.47, 0.028, 0.0065], [0.57, 0.022, 0.005], [0.635, 0.008, 0.003], [0.665, 0, 0]])));
  sword.name = 'sword';

  // Rest pose is the first idle frame, so a static instance stands in guard.
  const p0 = solve(GUARD);
  J.hips.position.set(...p0.hips);
  for (const j of [...UPPER, ...LEGS]) J[j].rotation.set(...p0[j].map(d => d * D2R), 'XYZ');
  return root;
}

function animate() {
  return [sampleClip('idle', IDLE_KEYS, 15, true), sampleClip('attack', ATTACK_KEYS, 30, false)];
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_shield = (() => {
const meta = { name: 'Round shield' };
async function build() {
  const root = createRoot('RoundShield');
  const bronze = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy bronze',
    baseColor: 0xb08d57,
    roughness: 1,
    metalness: 1,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' }
    }
  });
  const hide = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Ox-hide over timber',
    baseColor: 0x7a5536,
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

  const SHIELD_Z = 0.08;
  // Hide/wood base: shallow domed solid, radius 0.44
  const boardProfile = [[0, 0.033], [0.15, 0.028], [0.30, 0.018], [0.44, 0.0], [0.44, -0.012], [0.30, 0.006], [0.15, 0.016], [0, 0.021]];
  const boardRaw = await revolveProfile(boardProfile, { segments: 20, axis: 'y' });
  const boardGeo = await autoUnwrap(boardRaw);
  createPart('Board', boardGeo, hide, { position: [0, 0, SHIELD_Z], rotation: [90, 0, 0], parent: root });

  // Bronze face: thin domed solid just in front of the board, radius 0.45
  const faceProfile = [[0, 0.060], [0.15, 0.055], [0.30, 0.040], [0.45, 0.012], [0.45, 0.0], [0.30, 0.028], [0.15, 0.043], [0, 0.048]];
  const faceRaw = await revolveProfile(faceProfile, { segments: 20, axis: 'y' });
  const faceGeo = await autoUnwrap(faceRaw);
  createPart('Face', faceGeo, bronze, { position: [0, 0, SHIELD_Z], rotation: [90, 0, 0], parent: root });

  // Bronze rim around the edge
  const rimGeo = torusGeo(0.448, 0.014, 6, 20);
  createPart('Rim', rimGeo, bronze, { position: [0, 0, SHIELD_Z + 0.006], parent: root });

  // Central boss: flattened bronze dome, seated on the face so it does not poke through the back
  const bossGeo = sphereGeo(0.11, 12, 8);
  createPart('Boss', bossGeo, bronze, { position: [0, 0, SHIELD_Z + 0.07], scale: [1, 1, 0.45], parent: root });

  // Hand grip at the origin: pack-size grip 0.03 radius, 0.11 long, vertical
  const gripGeo = cylinderGeo(0.03, 0.03, 0.11, 12);
  createPart('Grip', gripGeo, hide, { position: [0, 0, 0], parent: root });

  // Two bronze brackets from grip ends to the board back
  const bracketGeo = cylinderZGeo(0.014, 0.014, 0.10, 10);
  createPart('BracketTop', bracketGeo, bronze, { position: [0, 0.055, 0.05], parent: root });
  createPart('BracketBottom', bracketGeo, bronze, { position: [0, -0.055, 0.05], parent: root });

  // Forearm band: leather loop behind the grip, hole along Z
  const bandGeo = torusGeo(0.06, 0.018, 6, 16);
  createPart('ArmBand', bandGeo, hide, { position: [0, 0, -0.035], parent: root });

  // Two short struts from the band sides to the board back
  const strutGeo = cylinderZGeo(0.012, 0.012, 0.115, 8);
  createPart('BandStrutL', strutGeo, bronze, { position: [-0.06, 0, 0.0225], parent: root });
  createPart('BandStrutR', strutGeo, bronze, { position: [0.06, 0, 0.0225], parent: root });

  return root;
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_sword = (() => {
const meta = { name: 'Bronze Age Sword' };
async function build() {
  const root = createRoot('Sword');
  const bronze = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy bronze',
    baseColor: 0xb08d57,
    roughness: 1,
    metalness: 1,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' }
    }
  });
  const wood = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy timber',
    baseColor: 0x6b4a2e,
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

  // Grip: pack-size, centred on origin, axis Y. r=0.03, len=0.11
  createPart('Grip', cylinderGeo(0.03, 0.03, 0.11, 12), wood, { position: [0, 0, 0], parent: root });
  // Guard: straight bar, width X 0.12
  createPart('Guard', boxGeo(0.028, 0.016, 0.12), bronze, { position: [0, 0.063, 0], parent: root });
  // Pommel: flattened disc below grip
  createPart('Pommel', cylinderGeo(0.035, 0.028, 0.022, 12), bronze, { position: [0, -0.066, 0], parent: root });

  // Leaf-shaped blade via lofted diamond sections in XZ, rising +Y.
  // [halfWidth, halfThick, y]
  const stations = [
    [0.023, 0.005, 0.071],
    [0.028, 0.006, 0.15],
    [0.033, 0.006, 0.27],
    [0.028, 0.005, 0.39],
    [0.018, 0.004, 0.49],
    [0.008, 0.0025, 0.57],
    [0.0015, 0.001, 0.621]
  ];
  const sections = stations.map(([hw, ht, y]) => ({
    profile: [[-ht, 0], [0, hw], [ht, 0], [0, -hw]],
    frame: { origin: [0, y, 0], rotation: [0, 0, 0] }
  }));
  const blade = loftProfiles(sections, { cap: true });
  createPart('Blade', blade, bronze, { position: [0, 0, 0], parent: root });

  return root;
}
return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSET_bow = (() => {
const meta = {
  name: 'Bow, arrows and quiver',
  role: 'prop',
};

async function build() {
  const root = createRoot('BowSet');

  // Pinned pack materials for Project Troy
  const timberMat = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy Timber',
    baseColor: 0x6b4a2e,
    roughness: 0.8,
    metalness: 0.05,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color' },
      normal: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness' },
    },
  });

  const bronzeMat = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy Bronze',
    baseColor: 0xb08d57,
    roughness: 0.35,
    metalness: 0.85,
    textures: {
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness' },
    },
  });

  // --- BOW ---
  // The bow node origin is centered at the hand grip [0,0,0] for hand parenting.
  // Angled around Y so both limb width and recurve curve are readable in front/side/3-4 views.
  const bowNode = createPivot('Bow', [-0.10, 0.602, 0.04], root);
  bowNode.rotation.y = -25 * Math.PI / 180;

  // Hand grip: exactly 0.03 m radius, 0.11 m long, centered at [0,0,0]
  const gripGeo = cylinderGeo(0.03, 0.03, 0.11, 12);
  createPart('Bow_Grip', gripGeo, timberMat, { position: [0, 0, 0], parent: bowNode });

  // Bronze ferrule rings at grip ends
  const ferruleGeo = cylinderGeo(0.032, 0.032, 0.012, 12);
  createPart('Bow_Grip_TopRing', ferruleGeo, bronzeMat, { position: [0, 0.055, 0], parent: bowNode });
  createPart('Bow_Grip_BottomRing', ferruleGeo, bronzeMat, { position: [0, -0.055, 0], parent: bowNode });

  // Recurved limbs using sweepProfile
  const limbProfile = [
    [-0.018, -0.008],
    [ 0.018, -0.008],
    [ 0.020, -0.004],
    [ 0.020,  0.004],
    [ 0.018,  0.008],
    [-0.018,  0.008],
    [-0.020,  0.004],
    [-0.020, -0.004],
  ];
  const limbPath = [
    [0, 0.055, 0.000],
    [0, 0.180, 0.035],
    [0, 0.320, 0.025],
    [0, 0.440, -0.020],
    [0, 0.520, -0.070],
    [0, 0.575, -0.090],
  ];
  const limbScale = [
    [1.0, 1.0],
    [0.90, 0.85],
    [0.78, 0.72],
    [0.65, 0.60],
    [0.52, 0.50],
    [0.40, 0.40],
  ];

  const limbGeo = sweepProfile(limbProfile, limbPath, { cap: true, scale: limbScale });

  // Upper limb
  createPart('Bow_Limb_Upper', limbGeo, timberMat, { position: [0, 0, 0], parent: bowNode });

  // Lower limb (rotated 180 around Z for exact symmetric downward recurve)
  createPart('Bow_Limb_Lower', limbGeo, timberMat, { position: [0, 0, 0], rotation: [0, 0, 180], parent: bowNode });

  // Bronze nocks at tips
  const nockGeo = coneGeo(0.010, 0.035, 8);
  createPart('Bow_Nock_Top', nockGeo, bronzeMat, { position: [0, 0.585, -0.092], rotation: [15, 0, 0], parent: bowNode });
  createPart('Bow_Nock_Bottom', nockGeo, bronzeMat, { position: [0, -0.585, -0.092], rotation: [-15, 0, 180], parent: bowNode });

  // Bowstring (spans between nocks at Z = -0.09)
  const stringGeo = cylinderGeo(0.0025, 0.0025, 1.15, 6);
  createPart('Bow_String', stringGeo, bronzeMat, { position: [0, 0, -0.090], parent: bowNode });

  // --- QUIVER ---
  const quiverNode = createPivot('Quiver', [0.08, 0, -0.04], root);

  // Quiver main body: height 0.56 m so top rim forms an open lip around the mouth
  const quiverBodyGeo = cylinderGeo(0.062, 0.055, 0.56, 12);
  createPart('Quiver_Body', quiverBodyGeo, timberMat, { position: [0, 0.28, 0], parent: quiverNode });

  // Bronze reinforcement bands
  const baseCapGeo = cylinderGeo(0.058, 0.058, 0.04, 12);
  createPart('Quiver_BaseCap', baseCapGeo, bronzeMat, { position: [0, 0.02, 0], parent: quiverNode });

  // Hollow bronze rim collar at mouth using lathe
  const rimProfile = [
    [0.060, -0.03],
    [0.068, -0.03],
    [0.068,  0.03],
    [0.060,  0.03],
    [0.060, -0.03],
  ];
  const topRimGeo = lathe(rimProfile, 12);
  createPart('Quiver_TopRim', topRimGeo, bronzeMat, { position: [0, 0.59, 0], parent: quiverNode });

  const midBandGeo = cylinderGeo(0.061, 0.061, 0.025, 12);
  createPart('Quiver_MidBand', midBandGeo, bronzeMat, { position: [0, 0.33, 0], parent: quiverNode });

  // Quiver rings & strap (hugs the quiver body closely)
  const ringGeo = torusGeo(0.016, 0.003, 6, 8);
  createPart('Quiver_Ring_Top', ringGeo, bronzeMat, { position: [0.068, 0.55, 0], rotation: [0, 90, 0], parent: quiverNode });
  createPart('Quiver_Ring_Bottom', ringGeo, bronzeMat, { position: [0.063, 0.33, 0], rotation: [0, 90, 0], parent: quiverNode });

  const strapPath = [[0.066, 0.55, 0], [0.082, 0.44, 0], [0.061, 0.33, 0]];
  const strapGeo = pipeAlongPath(strapPath, 0.007, { bendRadius: 0.03, tubularSegments: 12, radialSegments: 6 });
  createPart('Quiver_Strap', strapGeo, bronzeMat, { parent: quiverNode });

  // Interior cavity floor recessed inside the mouth
  const interiorGeo = cylinderGeo(0.059, 0.059, 0.008, 12);
  createPart('Quiver_Interior', interiorGeo, bronzeMat, { position: [0, 0.555, 0], parent: quiverNode });

  // --- THREE ARROWS ---
  const shaftGeo = cylinderGeo(0.0045, 0.0045, 0.72, 6);
  const headGeo = coneGeo(0.012, 0.04, 4);
  const nockEndGeo = cylinderGeo(0.005, 0.005, 0.015, 6);
  const vaneGeo = boxGeo(0.0015, 0.08, 0.020);

  function makeArrow(name, parent, pos, rot) {
    const arrowNode = createPivot(name, pos, parent);
    if (rot) {
      arrowNode.rotation.x = rot[0] * Math.PI / 180;
      arrowNode.rotation.y = rot[1] * Math.PI / 180;
      arrowNode.rotation.z = rot[2] * Math.PI / 180;
    }
    createPart(name + '_Shaft', shaftGeo, timberMat, { position: [0, 0, 0], parent: arrowNode });
    createPart(name + '_Head', headGeo, bronzeMat, { position: [0, -0.37, 0], rotation: [0, 0, 180], parent: arrowNode });
    createPart(name + '_Nock', nockEndGeo, bronzeMat, { position: [0, 0.365, 0], parent: arrowNode });

    for (let i = 0; i < 3; i++) {
      const angle = i * 120;
      const rad = angle * Math.PI / 180;
      const r = 0.012;
      const vx = r * Math.sin(rad);
      const vz = r * Math.cos(rad);
      createPart(name + '_Vane_' + i, vaneGeo, bronzeMat, { position: [vx, 0.310, vz], rotation: [0, angle, 0], parent: arrowNode });
    }
    return arrowNode;
  }

  makeArrow('Arrow_1', quiverNode, [0.00, 0.42, 0.00], [0, 0, 0]);
  makeArrow('Arrow_2', quiverNode, [-0.025, 0.44, -0.015], [6, 20, -5]);
  makeArrow('Arrow_3', quiverNode, [0.022, 0.40, 0.018], [-5, -25, 6]);

  return root;
}

return { build, animate: typeof animate === 'function' ? animate : null };
})();

const ASSETS = { wall: ASSET_wall, breach: ASSET_breach, gate: ASSET_gate, house: ASSET_house, temple: ASSET_temple, galley: ASSET_galley, chariot: ASSET_chariot, horse: ASSET_horse, wooden: ASSET_wooden, trojan: ASSET_trojan, greek: ASSET_greek, hector: ASSET_hector, achilles: ASSET_achilles, shield: ASSET_shield, sword: ASSET_sword, bow: ASSET_bow };

// ---- scene helpers -------------------------------------------------------
const D2R = Math.PI / 180;

function texId(t) { return t ? (t.name || (t.source && t.source.uuid) || t.uuid) : ''; }
function matKey(m) {
  const hex = c => (c ? c.getHex() : '');
  return [m.type, hex(m.color), hex(m.emissive), m.roughness, m.metalness, m.opacity, m.transparent, m.side, m.alphaTest,
    texId(m.map), texId(m.normalMap), texId(m.metalnessMap), texId(m.roughnessMap), texId(m.aoMap), texId(m.emissiveMap)].join('|');
}

const MATS = new Map();
function sharedMaterial(m) {
  const k = matKey(m);
  if (!MATS.has(k)) MATS.set(k, m);
  return MATS.get(k);
}

// Bakes an asset's current pose into one mesh per distinct material (geometry in the root's local frame).
// Nodes listed in keep stay live (returned in .kept) so doors and hatches remain separate named nodes.
function bake(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const keptNodes = keep.map(n => root.getObjectByName(n)).filter(Boolean);
  const isKept = o => { for (let p = o; p; p = p.parent) if (keptNodes.includes(p)) return true; return false; };
  const buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.visible || isKept(o)) return;
    const g = o.geometry.clone();
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const total = g.index ? g.index.count : g.attributes.position.count;
    const src = g.index ? g.index.array : null;
    const flip = m.determinant() < 0;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const ranges = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (const r of ranges) {
      const mat = sharedMaterial(mats[r.materialIndex || 0]);
      const end = Math.min(total, r.start + r.count);
      const index = [];
      for (let i = r.start; i + 2 < end + 0; i += 3) {
        const t = [i, i + 1, i + 2].map(k => (src ? src[k] : k));
        if (flip) { const x = t[1]; t[1] = t[2]; t[2] = x; }
        index.push(t[0], t[1], t[2]);
      }
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push({ g, index });
    }
  });
  const parts = [];
  for (const [mat, items] of buckets) {
    const useTan = items.every(it => it.g.attributes.tangent);
    const pos = [], nor = [], uv = [], tan = [], idx = [];
    for (const it of items) {
      const a = it.g.attributes;
      const remap = new Map();
      for (const old of it.index) {
        let nv = remap.get(old);
        if (nv === undefined) {
          nv = pos.length / 3;
          remap.set(old, nv);
          pos.push(a.position.getX(old), a.position.getY(old), a.position.getZ(old));
          nor.push(a.normal.getX(old), a.normal.getY(old), a.normal.getZ(old));
          if (a.uv) uv.push(a.uv.getX(old), a.uv.getY(old)); else uv.push(0, 0);
          if (useTan) tan.push(a.tangent.getX(old), a.tangent.getY(old), a.tangent.getZ(old), a.tangent.getW(old));
        }
        idx.push(nv);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    if (useTan) geo.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array(tan), 4));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    parts.push({ geo, mat });
  }
  const kept = keptNodes.map(n => ({ node: n, matrix: new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld) }));
  return { name: root.name, parts, kept };
}

// Places one baked kit: a group whose meshes share the kit's geometry and materials.
function place(kit, parent, name, pos = [0, 0, 0], rotY = 0, scale = 1) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = rotY * D2R;
  g.scale.setScalar(scale);
  kit.parts.forEach((p, i) => { const m = new THREE.Mesh(p.geo, p.mat); m.name = name + '_m' + i; g.add(m); });
  for (const k of kit.kept) {
    const n = k.node.clone(true);
    k.matrix.decompose(n.position, n.quaternion, n.scale);
    g.add(n);
  }
  parent.add(g);
  return g;
}

// Samples a clip at a phase (0..1) and leaves the rig posed.
function pose(root, clips, clipName, phase) {
  const clip = clips.find(c => c.name === clipName);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(Math.min(phase, 0.999) * clip.duration);
  root.updateMatrixWorld(true);
}

function setJoint(rig, name, deg) {
  rig.getObjectByName('Joint_' + name).rotation.set(deg[0] * D2R, deg[1] * D2R, deg[2] * D2R, 'XYZ');
}

// Re-orients a held item so its own axes match the soldier's (grip vertical, face forward, +Z), then yaws it.
function holdUpright(rig, item, socketName, yawDeg = 0) {
  const socket = rig.getObjectByName(socketName);
  rig.updateMatrixWorld(true);
  socket.add(item);
  const qs = new THREE.Quaternion();
  socket.getWorldQuaternion(qs);
  const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawDeg * D2R, 0));
  item.quaternion.copy(qs.invert().multiply(target));
  item.updateMatrixWorld(true);
}

// A posed soldier. opts: clip, phase, joints {name: deg}, left: 'shield' | 'bow', leftYaw, noSword
async function soldier(kind, opts = {}) {
  const s = await ASSETS[kind].build();
  const clips = ASSETS[kind].animate();
  pose(s, clips, opts.clip || 'idle', opts.phase || 0);
  if (opts.joints) for (const k of Object.keys(opts.joints)) setJoint(s, k, opts.joints[k]);
  if (opts.noSword) { const sw = s.getObjectByName('sword'); if (sw) sw.removeFromParent(); }
  if (opts.left === 'shield') holdUpright(s, await ASSETS.shield.build(), 'socket_hand_left', opts.leftYaw || 0);
  if (opts.left === 'bow') {
    const set = await ASSETS.bow.build();
    const quiver = set.getObjectByName('Joint_Quiver');
    const bow = set.getObjectByName('Joint_Bow') || set.getObjectByName('Bow');
    bow.position.set(0, 0, 0);
    holdUpright(s, bow, 'socket_hand_left', opts.leftYaw || 0);
    if (quiver) {
      const spine = s.getObjectByName('Joint_spine') || s.getObjectByName('spine');
      quiver.position.set(0.1, 0.02, -0.17);
      quiver.rotation.set(20 * D2R, 0, -25 * D2R);
      spine.add(quiver);
    }
  }
  s.updateMatrixWorld(true);
  return s;
}

const meta = { name: 'Battle before the gate' };

const SHIELD_ARMS = [
  { shoulder_left: [-30, 10, 8], elbow_left: [-60, 0, 0] },
  { shoulder_left: [-40, 5, 5], elbow_left: [-70, 0, 0] },
  { shoulder_left: [-25, 15, 10], elbow_left: [-55, 0, 0] },
];
const ATTACK_PHASES = [0.38, 0.54, 0.7, 0.46, 0.62];

// One shielded swordsman. face is the yaw in degrees (0 = toward +Z, 180 = toward -Z).
async function fighter(kind, x, z, face, i, opts = {}) {
  const s = await soldier(kind, {
    clip: opts.clip || 'attack', phase: opts.phase !== undefined ? opts.phase : ATTACK_PHASES[i % ATTACK_PHASES.length],
    joints: SHIELD_ARMS[i % 3], left: 'shield', leftYaw: -12 + 8 * (i % 3),
  });
  s.position.set(x, 0, z);
  s.rotation.y = face * D2R;
  return s;
}

async function archer(x, i) {
  const s = await soldier('trojan', {
    clip: 'idle', phase: 0,
    joints: { shoulder_left: [-85, 0, 5], elbow_left: [0, 0, 0], shoulder_right: [-85, -40, 0], elbow_right: [-130, 0, 0] },
    left: 'bow', noSword: true,
  });
  s.position.set(x, 0, 0);
  s.rotation.y = (i % 2 ? 4 : -4) * D2R;
  return s;
}

function group(name, members) {
  const g = new THREE.Group();
  g.name = name;
  members.forEach(m => g.add(m));
  return g;
}

// Two ranks closing: Trojans (crimson) face +Z, Greeks (blue) face -Z.
async function clash(name, pairs) {
  const members = [];
  let i = 0;
  for (const p of pairs) {
    if (p.t !== false) members.push(await fighter('trojan', p.x, p.tz !== undefined ? p.tz : -0.7, p.tf || 0, i, p.to));
    if (p.g !== false) members.push(await fighter('greek', p.x + (p.gx || 0.15), p.gz !== undefined ? p.gz : 0.7, 180 + (p.gf || 0), i + 2, p.go));
    i++;
  }
  return group(name, members);
}

async function team(name, heroKind, phase) {
  const g = new THREE.Group();
  g.name = name;
  g.add(await ASSETS.chariot.build());
  const hero = await soldier(heroKind, { clip: 'attack', phase, joints: SHIELD_ARMS[1], left: 'shield', leftYaw: -8 });
  hero.position.set(0, 0.7, -0.35);
  g.add(hero);
  for (const [x, ph] of [[-0.5, 0.15], [0.5, 0.55]]) {
    const h = await ASSETS.horse.build();
    pose(h, ASSETS.horse.animate(h), 'Gallop', ph);
    h.position.set(x, 0, 2.5);
    g.add(h);
  }
  return g;
}

async function groundMaterial() {
  const id = 'kiln.library.a8fec5a60022707b7cb0a07cb7c98f51758a58871ac12ff83ec4738c5b8ae27e.';
  return compilePortableMaterialSpecV2({
    schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Packed earth', baseColor: 0xffffff,
    roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: id + 'base-color' },
      normal: { kind: 'resource', resourceId: id + 'normal' },
      metallicRoughness: { kind: 'resource', resourceId: id + 'metallic-roughness' },
    },
  });
}

async function build() {
  const root = createRoot('BattleBeforeTheGate');

  // Ground: Y = 0 is the surface; the wall line runs along X at Z = 0 and the plain lies toward +Z.
  const earth = await groundMaterial();
  createPart('Ground', remapUV(boxGeo(100, 0.4, 120), { scale: [25, 30] }), earth, { position: [0, -0.2, 15], parent: root });

  // City: walls on the 6 m grid, the gate between them, houses and the temple inside.
  const wall = bake(await ASSETS.wall.build());
  const breach = bake(await ASSETS.breach.build());
  const gateRig = await ASSETS.gate.build();
  pose(gateRig, ASSETS.gate.animate(gateRig), 'open', 1);
  const gate = bake(gateRig, ['door_left', 'door_right']);
  place(gate, root, 'CityGate', [0, 0, 0]);
  [-24, -12, -6, 6, 12, 18, 24].forEach(x => place(wall, root, 'Wall_' + x, [x, 0, 0]));
  place(breach, root, 'Wall_breached_-18', [-18, 0, 0]);

  const house = bake(await ASSETS.house.build());
  place(house, root, 'House_1', [-13, 0, -9], 90);
  place(house, root, 'House_2', [13, 0, -9], -90);
  place(house, root, 'House_3', [-13, 0, -18], 90);
  place(bake(await ASSETS.temple.build()), root, 'TempleHall', [0, 0, -30]);

  // Shore: two galleys drawn up bow-first toward the city, and the wooden horse on the plain.
  const galley = bake(await ASSETS.galley.build());
  place(galley, root, 'Galley_1', [-22, 0, 56], 180);
  place(galley, root, 'Galley_2', [16, 0, 62], 172);
  place(bake(await ASSETS.wooden.build(), ['hatch']), root, 'WoodenHorse', [24, 0, 30], 195);

  // Defenders on the wall walk (walk surface Y = 6.6).
  const bowmen = group('bowmen', [await archer(-2.4, 0), await archer(-1.2, 1), await archer(0, 2),
    await soldier('trojan', { clip: 'attack', phase: 0.38, noSword: false, left: 'shield', joints: SHIELD_ARMS[0], leftYaw: -10 }).then(s => { s.position.set(1.2, 0, 0); return s; }),
    await soldier('trojan', { clip: 'attack', phase: 0.54, left: 'shield', joints: SHIELD_ARMS[2], leftYaw: -5 }).then(s => { s.position.set(2.4, 0, 0); return s; })]);
  const walkers = bake(bowmen);
  place(walkers, root, 'WallDefenders_W', [-9, 6.6, -0.2]);
  place(walkers, root, 'WallDefenders_E', [9, 6.6, -0.2]);
  place(walkers, root, 'WallDefenders_far', [21, 6.6, -0.2]);

  // Troops: formations are baked once and instanced.
  const clashA = bake(await clash('clashA', [
    { x: -3.6, to: {}, gx: 0.2 }, { x: -1.8, tz: -0.9, gz: 0.5 }, { x: 0, gx: -0.1, gz: 0.9 }, { x: 1.8, tz: -0.5 }, { x: 3.6, gz: 0.6, gx: 0.25 },
  ]));
  place(clashA, root, 'ClashA_1', [-12, 0, 12], -6);
  place(clashA, root, 'ClashA_2', [13, 0, 13], 8);

  const clashB = bake(await clash('clashB', [
    { x: -3, tz: -0.6, gz: 0.9 }, { x: -1, tz: -0.8, gz: 0.6 }, { x: 1, t: false, gz: 0.8 }, { x: 3, tz: -0.7, gz: 0.4, tf: 8 },
  ]));
  place(clashB, root, 'ClashB', [1, 0, 27], 3);

  // Breach: Greeks pour through the gap while Trojans hold it.
  const breachFight = bake(await clash('breachFight', [
    { x: -1, tz: -1.2, gz: 0.2 }, { x: 0.3, tz: -1.0, gz: 0.3 }, { x: 1.4, g: true, t: false, gz: 1.6 }, { x: -1.4, t: false, gz: 1.5 },
  ]));
  place(breachFight, root, 'BreachFight', [-18, 0, 1.5]);

  // Gate sortie: a shield line coming out of the open gate.
  const sortie = bake(group('sortie', await Promise.all([-1.8, -0.6, 0.6, 1.8].map((x, i) => fighter('trojan', x, 0, 0, i + 1, { clip: 'idle', phase: 0 })))));
  place(sortie, root, 'GateSortie', [0, 0, 4.5]);

  // Champions in their chariots, charging each other across the plain.
  place(bake(await team('hectorTeam', 'hector', 0.38)), root, 'Hector_Chariot', [-5, 0, 8], 14);
  place(bake(await team('achillesTeam', 'achilles', 0.54)), root, 'Achilles_Chariot', [6, 0, 24], 180 - 12);

  return root;
}
