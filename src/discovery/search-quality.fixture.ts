/**
 * Search quality set: a query an author might type and the helper it should find.
 * `search-quality.test.ts` requires each expected id in the top three hits.
 * Add a row when a real search misses; never remove one to make the test pass.
 */
export const SEARCH_QUALITY: ReadonlyArray<readonly [query: string, expected: string]> = [
  // Primitives
  ['box', 'operation:boxGeo'],
  ['sphere', 'operation:sphereGeo'],
  ['cylinder', 'operation:cylinderGeo'],
  ['cone', 'operation:coneGeo'],
  ['torus', 'operation:torusGeo'],
  ['capsule', 'operation:capsuleGeo'],
  ['plane', 'operation:planeGeo'],
  ['rounded box', 'operation:roundedBoxGeo'],
  ['gear', 'operation:gearGeo'],
  ['foliage card', 'operation:foliageCardGeo'],
  ['decal', 'operation:decalBox'],
  ['metaballs', 'operation:metaballSurface'],
  ['smooth union', 'operation:smoothUnion'],
  // Curves and profiles
  ['sweep', 'operation:sweepProfile'],
  ['loft between profiles', 'operation:loftProfiles'],
  ['lathe', 'operation:lathe'],
  ['extrude a profile', 'operation:extrudeProfile'],
  ['pipe along a path', 'operation:pipeAlongPath'],
  ['spiral path', 'operation:spiralPath'],
  ['bezier curve', 'operation:bezierCurve'],
  // Booleans and arrays
  ['subtract one shape from another', 'operation:boolDiff'],
  ['boolean union', 'operation:boolUnion'],
  ['intersect', 'operation:boolIntersect'],
  ['convex hull', 'operation:hull'],
  ['mirror', 'operation:mirror'],
  ['linear array', 'operation:arrayLinear'],
  ['radial array', 'operation:arrayRadial'],
  ['repeat along a curve', 'operation:repeatAlongCurve'],
  // Mesh operations
  ['bend', 'operation:bend'],
  ['twist', 'operation:twist'],
  ['subdivide', 'operation:subdivide'],
  ['reduce triangles', 'operation:simplifyGeometry'],
  ['merge vertices', 'operation:mergeVertices'],
  ['displace', 'operation:displace'],
  // UVs, materials, textures
  ['project uv', 'operation:projectUV'],
  ['unwrap uv', 'operation:autoUnwrap'],
  ['pbr material', 'operation:pbrMaterial'],
  ['glass material', 'operation:glassMaterial'],
  ['normal map from height', 'operation:normalMapFromHeight'],
  ['procedural texture', 'operation:proceduralTexture'],
  // Structure and utility
  ['level of detail', 'operation:defineLod'],
  ['box collider', 'operation:colliderBox'],
  ['snap to', 'operation:snapTo'],
  ['beam between two points', 'operation:beamBetween'],
  ['kit module', 'operation:defineModule'],
  ['declare parameters', 'operation:defineParams'],
  ['palette', 'operation:definePalette'],
  ['require a closed solid', 'operation:requireSolid'],
  ['count triangles', 'operation:countTriangles'],
  ['seeded random', 'operation:seededRandom'],
  ['instancing', 'operation:repeatInstances'],
  ['reuse a mesh at a new transform', 'operation:createInstance'],
  // Animation
  ['spin animation', 'operation:spinAnimation'],
  ['rotation track', 'operation:rotationTrack'],
  // Assemblies
  ['stairs', 'assembly:createStairs'],
  ['gable roof', 'assembly:createGableRoof'],
  ['wall with an opening', 'assembly:wallWithOpening'],
  ['ladder', 'assembly:createLadder'],
  ['wheel assembly', 'assembly:createWheelAssembly'],
  ['bone chain', 'assembly:createBoneChain'],
  ['room', 'assembly:room'],
];
