const meta = { name: 'Wall section' };

// World-unit box UVs: every face repeats the material tile every `tile` metres, so courses are
// the same size on the ends and the top as on the front, and the tapered footing does not
// stretch. BoxGeometry corners come in six face runs: +X, -X, +Y, -Y, +Z, -Z.
function worldBox(w, h, d, tile) {
  const geo = boxGeo(w, h, d);
  const uv = geo.getAttribute('uv');
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const perFace = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const [fw, fh] = faces[Math.floor(i / perFace)];
    uv.setXY(i, (uv.getX(i) * fw) / tile, (uv.getY(i) * fh) / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

async function build() {
  const root = createRoot('WallSection');

  // Coursed limestone for the battered footing: 1.2 m tile, blocks 1.2 x 0.6 m.
  const limestone = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy coursed limestone',
    roughness: 1,
    metalness: 0,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.118cd21f2b4775fea0005aad90da65ade37215ca06d04d6997862c773bb236ed.base-color' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.118cd21f2b4775fea0005aad90da65ade37215ca06d04d6997862c773bb236ed.metallic-roughness' }
    }
  });

  // Plastered mudbrick for the body, parapet, merlons and curb: 1 m tile, 0.1 m courses.
  const mudbrick = await compilePortableMaterialSpecV2({
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: 'Troy plastered mudbrick',
    roughness: 1,
    metalness: 0,
    emissiveIntensity: 1,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    textures: {
      baseColor: { kind: 'resource', resourceId: 'kiln.library.421914182486ebb17266b4b953976ac273c19da2d449919cd10baa7d25844363.base-color' },
      metallicRoughness: { kind: 'resource', resourceId: 'kiln.library.421914182486ebb17266b4b953976ac273c19da2d449919cd10baa7d25844363.metallic-roughness' }
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
  const STONE = 1.2;
  const BRICK = 1.0;

  // Sloped stone footing: 2 m tall, 3.4 m wide at base, 2.8 m at top, 6 m long.
  const footingGeo = taper(worldBox(LEN, 2, 2.8, STONE), {
    startScale: [1, 3.4 / 2.8],
    endScale: [1, 1]
  });
  createPart('Footing', footingGeo, limestone, { position: [0, 1, 0], parent: root });

  // Mudbrick wall body: Y 2.0..6.6, 2.6 m thick, centred on Z=0.
  const bodyGeo = worldBox(LEN, 4.6, 2.6, BRICK);
  createPart('WallBody', bodyGeo, mudbrick, { position: [0, 4.3, 0], parent: root });

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
  const parapetGeo = worldBox(LEN, 0.7, 0.6, BRICK);
  createPart('ParapetBase', parapetGeo, mudbrick, { position: [0, 6.95, 1.0], parent: root });
  const merlonGeo = worldBox(0.6, 0.7, 0.6, BRICK);
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i * 1.0;
    createPart('Merlon_' + i, merlonGeo, mudbrick, { position: [x, 7.65, 1.0], parent: root });
  }

  // Low inner curb marking the 2 m wall walk's inner edge.
  const curbGeo = worldBox(LEN, 0.3, 0.2, BRICK);
  createPart('InnerCurb', curbGeo, mudbrick, { position: [0, 6.75, -1.2], parent: root });

  return root;
}
