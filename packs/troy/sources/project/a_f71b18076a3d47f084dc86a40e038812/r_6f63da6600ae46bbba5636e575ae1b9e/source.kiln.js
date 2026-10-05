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