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