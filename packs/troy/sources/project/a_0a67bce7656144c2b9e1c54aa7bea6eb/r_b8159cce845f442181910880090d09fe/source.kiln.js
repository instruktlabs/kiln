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
