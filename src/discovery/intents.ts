/** Curated intent wording, not semantic equivalence between distinct helpers. */
export const discoveryIntents: Readonly<Record<string, readonly string[]>> = {
  arrayRadial: [
    'radial repetition',
    'repeat around a circle',
    'circular pattern',
    'ring of supports',
    'arena seating',
  ],
  arrayLinear: [
    'linear repetition',
    'repeat along a line',
    'straight row',
    'regular spacing',
    'bench or fence slats',
  ],
  wallWithOpening: ['wall aperture', 'cut a window', 'doorway opening', 'door or window in a wall'],
  room: ['hollow enclosure', 'walls and floor', 'room with doors and windows'],
  createGableShell: ['enclosed building shell', 'gable house with openings'],
  createStairs: ['stair flight', 'steps', 'tiered seating', 'rise and run'],
  pipeAlongPath: ['tube along a path', 'curved pipe', 'hose conduit cable'],
  curveToMesh: ['curved tube', 'tube following a curve', 'hose conduit cable'],
  sweepProfile: ['profile along a path', 'extruded rail', 'curved trim'],
  loftProfiles: [
    'loft cross sections',
    'varying cross section',
    'join cross sections',
    'matching polygon outlines',
    'blend section shapes',
  ],
  bezierCurve: ['quadratic cubic bezier control points', 'sample curved path'],
  geometryDiagnostics: [
    'boundary nonmanifold edges',
    'welded seam topology',
    'degenerate triangle orientation',
  ],
  remapUV: [
    'rescale texture repetition',
    'existing UV tiling scale offset',
    'texture coordinates without reshaping geometry',
  ],
  replicateAssembly: [
    'duplicate animated mechanism',
    'copy articulated hierarchy',
    'independent mutable geometry option',
  ],
  copyGeometry: [
    'independent geometry copy',
    'duplicate mesh vertices',
    'edit without changing original',
  ],
  copyMaterial: ['independent material copy', 'edit material without changing original'],
  mirror: ['reflection across a plane', 'opposite side', 'symmetric counterpart'],
  creaseNormals: ['smooth normals', 'preserve sharp edges', 'hard surface shading'],
  boolDiff: ['subtract solids', 'cut out a shape', 'boolean difference'],
  boolUnion: ['join overlapping solids', 'boolean union'],
  boolIntersect: ['intersection of solids', 'overlapping volume'],
  beamBetween: ['beam between points', 'bar connecting endpoints'],
  autoUnwrap: ['unwrap texture coordinates', 'UV atlas', 'unfold mesh'],
  foliageCardGeo: ['thin leaf cutout', 'foliage card'],
  foliageMaterial: ['leaf transparency', 'foliage cutout', 'alpha mask'],
};

/** Deliberately small stopword set: preserve technical axes, units and negation. */
const stopwords = new Set([
  'a',
  'an',
  'the',
  'i',
  'it',
  'to',
  'of',
  'for',
  'and',
  'or',
  'in',
  'on',
  'with',
  'these',
  'that',
  'this',
  'please',
  'want',
  'need',
]);

const inflections: Readonly<Record<string, string>> = {
  supports: 'support',
  pipes: 'pipe',
  windows: 'window',
  walls: 'wall',
  doors: 'door',
  wheels: 'wheel',
  beams: 'beam',
  steps: 'step',
  solids: 'solid',
  shapes: 'shape',
  sections: 'section',
  profiles: 'profile',
  vertices: 'vertex',
  copies: 'copy',
  materials: 'material',
  curves: 'curve',
  normals: 'normal',
  edges: 'edge',
  points: 'point',
  endpoints: 'endpoint',
  pillars: 'pillar',
};

export function discoveryTokens(value: string): string[] {
  return value
    .normalize('NFKC')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0 && !stopwords.has(token))
    .map((token) => inflections[token] ?? token);
}
