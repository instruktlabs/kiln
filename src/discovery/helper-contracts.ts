import type { DiscoveryEntry, OperationContract } from './catalog-schema';

/** Facts about the sandbox entrypoint, not promises about a user's complete asset. */
export interface HelperContractMetadata {
  kind: 'operation' | 'assembly';
  contract: Omit<OperationContract, 'signature' | 'returns' | 'example'>;
  references: string[];
  tags: string[];
  aliases: string[];
  intents: string[];
  limitations: string[];
  stability: DiscoveryEntry['stability'];
  summary?: string;
  related?: { name: string; relation: 'alternative' | 'prerequisite' | 'companion' }[];
}

type Facts = Partial<HelperContractMetadata['contract']>;
type Metadata = Partial<Omit<HelperContractMetadata, 'contract'>>;
const contracts: Record<string, HelperContractMetadata> = {};
const lengthUnits =
  'Lengths use authored scene units (normally metres); no automatic unit conversion.';
const noAssetSemantics =
  'No asset category or whole-asset acceptance is inferred from this operation.';
const noMesh = 'Not a mesh-producing operation; no manifold or watertightness claim.';
const define = (names: string | string[], facts: Facts, metadata: Metadata): void => {
  for (const name of typeof names === 'string' ? [names] : names) {
    if (contracts[name]) throw new Error(`Duplicate helper contract: ${name}`);
    contracts[name] = {
      kind: 'operation',
      tags: [],
      aliases: [],
      intents: [],
      limitations: [],
      stability: 'stable',
      references: [],
      ...metadata,
      contract: {
        units: lengthUnits,
        axes: 'XYZ coordinates; no additional orientation is inferred.',
        origin: 'Caller-defined; no automatic grounding or centering is inferred.',
        execution: 'sync',
        ownership: 'Ownership beyond the stated return type is not yet qualified.',
        coordinates: 'No automatic local/world coordinate conversion is promised.',
        parameters: ['Use the exact signature; additional parameter limits are not yet qualified.'],
        topology: ['No general topology guarantee is claimed.'],
        preservation: [
          'Unspecified custom attributes and metadata preservation are not qualified.',
        ],
        semantics: [noAssetSemantics],
        cost: 'Input-dependent work; no measured latency or global allocation bound is claimed.',
        ...facts,
      },
    };
  }
};

const cachedGeometry: Facts = {
  ownership:
    'Sandbox calls with identical serializable arguments reuse cached geometry. Treat it as shared; use copyGeometry before mutation. Direct module calls allocate separately.',
  coordinates: 'Geometry-local vertices; Object3D parent transforms are not applied.',
  origin: 'Centered at local [0,0,0] unless this helper states another datum.',
  parameters: [
    'Use finite dimensions and integer segment counts. Comprehensive rejection and allocation bounds are not yet qualified for every primitive.',
  ],
  topology: [
    'Built-in triangulation describes the nominal shape; degenerate inputs are not a solid-validity certificate.',
  ],
  preservation: [
    'Generates positions, normals and UVs unless specified otherwise; does not preserve an input mesh because none is supplied.',
    'Eager bounding volumes are not guaranteed; compute bounds when the consuming operation needs them.',
  ],
  semantics: [
    'Sandbox cache may stamp source ranges; this is geometry provenance, not an assembly or QA policy.',
  ],
};
const primitiveMetadata: Metadata = {
  references: ['src/primitives.ts'],
  tags: ['geometry', 'primitive', 'shared geometry'],
  related: [
    { name: 'copyGeometry', relation: 'companion' },
    { name: 'createPart', relation: 'companion' },
  ],
};
const boundedPrimitive: Facts = {
  ...cachedGeometry,
  parameters: [
    'Dimensions must be finite and Float32-representable, positive unless an explicit zero case is listed. Use planeGeo for zero-thickness sheets.',
    'Segments are safe integers up to 4096. Minimum is 3 for circular segments, 2 for sphere heightSegments, and 1 for plane segments. Sphere/torus/plane grids also require (firstSegments + 1) * (secondSegments + 1) <= 262144. No silent rounding or tessellation reduction.',
  ],
};
define(
  'boxGeo',
  {
    ...boundedPrimitive,
    axes: 'Width X, height Y, depth Z.',
    cost: '12 triangles; dimensions do not increase tessellation.',
  },
  {
    ...primitiveMetadata,
    aliases: ['cuboid', 'rectangular prism'],
    intents: ['make a rectangular block'],
  },
);
define(
  'sphereGeo',
  {
    ...boundedPrimitive,
    axes: 'Latitude axis Y; circular cross-sections in XZ.',
    preservation: [
      'Supplies analytic normals and UVs. Geometry scale/rotation transforms the existing normals; no extra computeVertexNormals is needed for those transforms.',
    ],
    cost: 'Grows with widthSegments × heightSegments; default 8 × 6.',
  },
  {
    ...primitiveMetadata,
    aliases: ['ball', 'orb'],
    intents: ['make a rounded ball'],
    limitations: [
      'Raw computeVertexNormals replaces analytic normals and can leave unused pole vertices with zero normals, which fail GLTF validation. Preserve the existing normals for affine transforms.',
    ],
  },
);
for (const [axis, names] of [
  ['Y', ['cylinderGeo', 'cylinderYGeo']],
  ['X', ['cylinderXGeo']],
  ['Z', ['cylinderZGeo']],
] as const)
  define(
    [...names],
    {
      ...boundedPrimitive,
      axes: `Cylinder axis ${axis}; radiusTop is toward +${axis}, radiusBottom toward -${axis}.`,
      parameters: [
        ...boundedPrimitive.parameters!,
        'Each radius is nonnegative; at least one must be positive. Height/length is positive.',
      ],
      cost: 'Linear in radial segments, default 8; 3 to 4096 radial segments.',
    },
    {
      ...primitiveMetadata,
      aliases: [`${axis.toLowerCase()} axis cylinder`, 'frustum'],
      intents: ['make an axle or tapered circular body'],
    },
  );
for (const [axis, names] of [
  ['Y', ['capsuleGeo', 'capsuleYGeo']],
  ['X', ['capsuleXGeo']],
  ['Z', ['capsuleZGeo']],
] as const)
  define(
    [...names],
    {
      ...boundedPrimitive,
      axes: `Longitudinal axis ${axis}.`,
      parameters: [
        ...boundedPrimitive.parameters!,
        'height/length is the nonnegative straight middle section; zero is supported. Radius is positive; total outer length is height/length + 2 × radius.',
        'Cap subdivision is fixed at 2; radial segments default to 6.',
      ],
      cost: 'Linear in radial segments with fixed cap subdivision.',
    },
    {
      ...primitiveMetadata,
      aliases: ['pill', 'rounded capsule'],
      intents: ['make a rounded limb or pod'],
    },
  );
for (const [axis, names] of [
  ['Y', ['coneGeo', 'coneYGeo']],
  ['X', ['coneXGeo']],
  ['Z', ['coneZGeo']],
] as const)
  define(
    [...names],
    {
      ...boundedPrimitive,
      axes: `Apex points toward +${axis}; height/length spans the ${axis} axis.`,
      cost: 'Linear in radial segments, default 8.',
    },
    { ...primitiveMetadata, aliases: ['pointed cone', 'spike'], intents: ['make a tapered point'] },
  );
define(
  'taperConeGeo',
  {
    ...boundedPrimitive,
    axes: 'axis must be x/y/z, default y; smaller radius is not inferred from the parameter name.',
    parameters: [
      ...boundedPrimitive.parameters!,
      'Radii are nonnegative, with at least one positive. Height is positive.',
    ],
    cost: 'Linear in radial segments, default 8.',
  },
  {
    ...primitiveMetadata,
    aliases: ['truncated cone', 'frustum'],
    intents: ['make a circular taper with two end radii'],
  },
);
define(
  'cylinderOnAxis',
  {
    ...boundedPrimitive,
    axes: 'Local +Y is rotated onto the supplied normal; top cap follows normal.',
    origin: 'Vertices are translated to the supplied center.',
    parameters: [
      ...boundedPrimitive.parameters!,
      'center and normal are finite triples. Normal length must be at least 1e-6; normalization handles large finite components. Cylinder radii are nonnegative with at least one positive; height is positive.',
    ],
    cost: 'Linear in radial segments plus a vertex transform.',
  },
  {
    ...primitiveMetadata,
    aliases: ['oriented cylinder'],
    intents: ['align a cylinder to a non-cardinal direction'],
  },
);
define(
  'torusGeo',
  {
    ...boundedPrimitive,
    axes: 'Ring lies in XY; hole axis Z.',
    cost: 'Grows with radialSegments × tubularSegments (defaults 8 × 12).',
  },
  {
    ...primitiveMetadata,
    aliases: ['donut', 'ring'],
    intents: ['make a circular ring with a round tube'],
  },
);
define(
  'planeGeo',
  {
    ...boundedPrimitive,
    axes: 'Width X, height Y; front normal +Z.',
    topology: ['Open rectangular sheet; no thickness or watertightness.'],
    cost: '2 × widthSegments × heightSegments triangles.',
  },
  {
    ...primitiveMetadata,
    summary:
      'Creates a subdividable XY rectangular sheet with UVs. Place and orient it explicitly; use a solid primitive when thickness matters.',
    aliases: ['quad', 'sheet'],
    intents: ['make a flat textured surface'],
  },
);
define(
  'decalBox',
  {
    ...boundedPrimitive,
    axes: 'Width X, height Y, depth Z.',
    parameters: [
      ...boundedPrimitive.parameters!,
      'Width/height positive; depth nonnegative, default 0.01 and clamped to a documented minimum of 0.002.',
    ],
    cost: '12 triangles; default depth 0.01 scene units.',
  },
  {
    ...primitiveMetadata,
    aliases: ['thin plaque', 'solid decal'],
    intents: ['attach a colored plate to a surface'],
    limitations: ['Does not place itself on another surface or prevent z-fighting.'],
  },
);
define(
  'foliageCardGeo',
  {
    ...cachedGeometry,
    axes: 'Card lies in XY, front normal +Z.',
    origin: 'yPivot is a fraction of height; 0 puts the bottom edge at Y=0, 0.5 centers it.',
    parameters: [
      'Positive finite width/height; yPivot may lie outside 0..1, but resulting coordinates must fit finite Float32.',
    ],
    topology: ['One open quad; alpha masking is material behavior, not geometric trimming.'],
    semantics: ['Stamps kilnGeometryRole=foliageCard.'],
    cost: 'Two triangles.',
  },
  {
    ...primitiveMetadata,
    aliases: ['leaf card', 'billboard'],
    intents: ['make a plant sprite card'],
  },
);
define(
  'crossedQuadsGeo',
  {
    ...cachedGeometry,
    axes: 'Intersecting vertical sheets rotate around Y.',
    origin: 'yPivot controls the Y datum as a fraction of height.',
    parameters: [
      'Positive finite width/height; finite Float32 coordinates after pivot; planes must be exactly 2 or 3.',
    ],
    topology: ['Intersecting open quads; not a closed solid.'],
    semantics: ['Stamps billboard geometry role metadata.'],
    cost: 'Two triangles per plane; intended plane count is 2 or 3.',
  },
  {
    ...primitiveMetadata,
    aliases: ['cross billboard', 'bush cards'],
    intents: ['make inexpensive vegetation with multiple silhouettes'],
  },
);
define(
  'octaGridPlane',
  {
    ...cachedGeometry,
    axes: 'Atlas card lies in XY, front normal +Z.',
    origin: 'yPivot controls the Y datum as a fraction of height.',
    parameters: [
      'tilesX/tilesY must be positive safe integers; width/height positive finite and pivoted coordinates finite Float32.',
    ],
    topology: ['Open quad; atlas tile selection requires consumer shader support.'],
    preservation: [
      'Generates UVs covering the top-left atlas tile; no tile-selection shader is generated.',
    ],
    cost: 'Two triangles independent of atlas tile count.',
  },
  {
    ...primitiveMetadata,
    aliases: ['atlas billboard', 'impostor card'],
    intents: ['make a card for an atlas-aware runtime'],
    limitations: ['The GLB material alone does not implement per-instance tile selection.'],
  },
);
define(
  'wingGeo',
  {
    ...cachedGeometry,
    axes: 'Root at Z=0, span toward +Z; positive sweep shifts the tip leading edge toward -X relative to the root leading edge, not the chord midpoint.',
    origin: 'Root chord midpoint at [0,0,0].',
    units: `${lengthUnits} dihedral is tip Y displacement, not an angle.`,
    preservation: ['Creates positions and normals; no UV attribute is generated.'],
    parameters: [
      'Positive finite span/rootChord/thickness; tipChord may be zero for a pointed wing. Signed sweep and dihedral are finite length displacements; generated coordinates must fit Float32.',
    ],
    cost: 'Fixed trapezoid or triangular prism tessellation.',
  },
  {
    ...primitiveMetadata,
    aliases: ['trapezoid wing', 'tapered panel'],
    intents: ['make a swept wing panel'],
  },
);
define(
  'gearGeo',
  {
    ...cachedGeometry,
    axes: 'Gear lies in XZ, thickness on Y.',
    parameters: [
      'Absolute bore/root/tip radii; do not assume an omitted root radius scales with tipRadius.',
      'teeth is an integer from 3 to 4096; finite radii obey 0 <= bore < root < tip, height is positive, and toothWidthFrac is strictly between 0 and 1.',
      'Stylized teeth, not an involute engineering profile.',
    ],
    preservation: [
      'Creates positions and normals; UV preservation is not applicable and UVs are not generated.',
    ],
    cost: 'Linear in tooth count; inspect tooth and radius validity.',
  },
  {
    ...primitiveMetadata,
    references: ['src/gears.ts'],
    aliases: ['cog', 'sprocket'],
    intents: ['make a stylized toothed wheel'],
  },
);
define(
  'bladeGeo',
  {
    ...cachedGeometry,
    axes: 'Length +Y, width X, thickness Z.',
    origin: 'Blade base at Y=0; centered across width and thickness.',
    preservation: ['Creates positions and normals; UVs are not generated.'],
    parameters: [
      'Positive finite length/baseWidth/thickness; 0 <= tipLength < length; edgeBevel is finite in 0..1. Zero tip length is a square end.',
      'edgeBevel controls a closed cross-section: flat rectangle at 0, partial bevels, diamond at 1. This is not a generic mesh bevel.',
    ],
    cost: 'Fixed tessellation with a bounded choice of cross-section; beveled tips taper to one point.',
  },
  {
    ...primitiveMetadata,
    references: ['src/gears.ts'],
    aliases: ['sword blade', 'tapered blade'],
    intents: ['make a pointed blade'],
  },
);

const ownedGeometry: Facts = {
  ownership: 'Returns independent geometry buffers; the input remains unchanged.',
  coordinates: 'Geometry-local coordinates; parent transforms are not applied.',
  origin: 'Preserves the authored origin unless stated otherwise.',
};
define(
  'copyGeometry',
  {
    ...ownedGeometry,
    axes: 'Preserves source axes.',
    parameters: ['A BufferGeometry.'],
    topology: ['Preserves source topology, including any defects.'],
    preservation: [
      'Copies vertex attributes and index buffers; no whole Object3D hierarchy is copied.',
      'Three.js clone semantics apply to groups, morph attributes and userData; arbitrary application object identity is not promised.',
    ],
    cost: 'Linear in copied geometry buffers.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['ownership', 'copy'],
    aliases: ['independent geometry copy'],
    intents: ['edit vertices without changing other parts'],
  },
);
define(
  'copyMaterial',
  {
    units: 'Material property units are preserved; no geometry units apply.',
    axes: 'Not applicable to a material.',
    origin: 'Not applicable to a material.',
    ownership:
      'Returns an independent material object of the same subtype; referenced textures remain shared.',
    coordinates: 'No geometry transform.',
    parameters: ['A Three.js material.'],
    topology: [noMesh],
    preservation: [
      'Copies material properties under Three.js clone semantics; does not copy texture bytes or a containing mesh.',
    ],
    cost: 'Depends on material properties, not scene triangle count.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['material', 'ownership', 'copy'],
    aliases: ['independent material copy'],
    intents: ['change one part material without recoloring shared parts'],
  },
);
define(
  'meshGeo',
  {
    ...ownedGeometry,
    ownership: 'Copies authored numeric arrays into new geometry buffers.',
    axes: 'Caller supplies XYZ; triangle winding is counterclockwise when viewed from the front.',
    origin: 'Exactly the supplied vertex positions.',
    parameters: [
      'Finite Float32-compatible positions in XYZ triples; indices in range and complete triangles.',
      'Optional normals, UVs and tangents must match vertex counts.',
    ],
    topology: [
      'Accepts triangle meshes with counterclockwise winding; finite/index checks do not certify a manifold, nondegenerate or self-intersection-free solid.',
    ],
    preservation: [
      'Creates supplied UVs/tangents; supplied normals are normalized, otherwise normals are computed.',
      'Computes bounding box and sphere.',
    ],
    cost: 'Linear in supplied vertex/triangle arrays; no general allocation cap is claimed.',
  },
  {
    references: ['src/geometry.ts'],
    tags: ['custom geometry', 'triangles', 'owned geometry'],
    aliases: ['raw mesh', 'indexed triangles'],
    intents: ['build custom vertices and faces'],
    related: [{ name: 'geometryDiagnostics', relation: 'companion' }],
  },
);
define(
  'parametricSurface',
  {
    ...ownedGeometry,
    axes: 'Sampler returns XYZ; orientation selects uv or vu winding.',
    origin: 'Defined by sampler outputs, not centered automatically.',
    parameters: [
      'Positive safe-integer u/v segment counts; finite nonzero domains and domain extents; at most 262,144 samples including endpoints.',
      'Periodic endpoints must agree within 1e-6 of the sampled bounding-box diagonal, independent of translation or world units; orientation must be uv or vu.',
    ],
    topology: [
      'A sampled surface, not automatically a closed solid; periodic seams retain separate UV vertices.',
      'Each grid cell becomes two triangles. Collapsed parameter rows or columns are not converted into pole fans; they can create degenerate triangles and zero normals.',
    ],
    preservation: [
      'Generates UVs and normals, aligns normals across validated periodic seams, computes bounds.',
    ],
    cost: '(uSegments + 1) × (vSegments + 1) samples, capped at 262,144 before callbacks/allocation; 2 × uSegments × vSegments triangles. The evaluator still owns callback timeouts.',
  },
  {
    references: ['src/geometry.ts'],
    tags: ['custom geometry', 'surface', 'equation'],
    aliases: ['equation surface', 'parametric mesh'],
    intents: ['sample a mathematical surface'],
    limitations: [
      'Callback termination and self-intersection are not certified.',
      'Use a non-collapsed parameterization or explicit meshGeo fan topology at singular tips. geometryDiagnostics reports degenerate triangles; supplying arbitrary normals does not repair collapsed topology.',
    ],
  },
);
define(
  'geometryDiagnostics',
  {
    units: `${lengthUnits} tolerance uses position units.`,
    axes: 'Reads source XYZ without changing it.',
    origin: 'Does not reposition geometry.',
    ownership: 'Read-only inspection; returns counts, not repaired geometry.',
    coordinates: 'Geometry-local positions; position-based seam matching uses tolerance.',
    parameters: [
      'A BufferGeometry; omitted tolerance is 1e-6 times its finite-position bounding-box diagonal. A supplied positive finite tolerance is an absolute distance and must resolve the extent within safe integer quantization.',
      'Returns effective tolerance, toleranceMode (relative or absolute) and positionScale with the counts; a collapsed extent uses zero default tolerance.',
    ],
    topology: [
      'Counts boundary/nonmanifold/orientation/degenerate/index/finite issues; does not detect arbitrary triangle self-intersections.',
      'An open sheet can be valid for its intended use.',
      'Position matching quantizes a grid relative to the bounds minimum, not an exact distance weld. Invalid-position triangles are excluded from edge/area counts and nonfinite vertices remain reported.',
      'collapsedByToleranceTriangles counts faces whose corners merge in that grid; they are excluded from edge counts, not removed from geometry. Nonzero means topology detail was lost at this tolerance; inspect at a finer tolerance before interpreting edge counts. This is separate from area-based degenerateTriangles.',
    ],
    preservation: ['Input buffers and topology are unchanged.'],
    cost: 'Visits vertices and triangle edges; memory grows with unique welded positions/edges.',
  },
  {
    references: ['src/geometry.ts'],
    tags: ['diagnostics', 'topology'],
    aliases: ['mesh diagnostics', 'watertightness inspection'],
    intents: ['inspect open edges and malformed mesh data'],
  },
);
define(
  'creaseNormals',
  {
    ...ownedGeometry,
    units: `${lengthUnits} angle is degrees; tolerance is a distance.`,
    axes: 'Preserves source coordinate axes.',
    parameters: [
      'Finite crease angle; default 60 degrees. Omitted tolerance is 1e-8 times the finite-position bounding-box diagonal, without a world-unit floor; an explicit positive finite distance overrides it.',
    ],
    topology: ['Can split corners for shading; no topology repair or solid-validity guarantee.'],
    preservation: [
      'Preserves UV corner seams; recomputes angle-limited normals and bounds; invalidates tangents.',
    ],
    cost: 'Depends on faces and vertex adjacency; highly connected neighborhoods can increase work.',
  },
  {
    references: ['src/geometry.ts'],
    tags: ['shading', 'normals'],
    aliases: ['hard edges', 'smooth normals'],
    intents: ['keep sharp rims while smoothing curved faces'],
  },
);
const deformFacts: Facts = {
  ...ownedGeometry,
  units: `${lengthUnits} frame rotations and angle parameters use Euler XYZ degrees; scale and falloff are dimensionless.`,
  axes: 'Operation acts in the supplied rigid frame; local Y parameterizes the interval.',
  parameters: [
    'Frame origin/rotation finite; interval finite and increasing; falloff returns a finite weight in [0,1].',
    'Outside positions stay unchanged with endpoint roundoff bounded to one millionth of interval length; nonzero intervals retain normalized progress at tiny scales.',
    'At most 2000000 vertices / 3000000 triangle corners; morph targets require deformation before morph creation.',
  ],
  topology: [
    'Keeps connectivity but can create degenerate or self-intersecting shapes; no automatic subdivision.',
  ],
  preservation: [
    'Preserves UVs, groups and cloned attributes. Unchanged positions keep authored normals; changed geometry rebuilds area-weighted normals across authored smooth seam classes while retaining hard creases.',
    'Seam matching uses 1e-7 of geometry diagonal for position and 1e-6 normal components; tangents are removed with DEFORM_TANGENTS_DROPPED. No topology-validity guarantee.',
  ],
  cost: 'Linear in vertex count plus normal recomputation and callback cost; callback termination is a host responsibility.',
};
const deformMetadata: Metadata = {
  references: ['src/deform.ts'],
  tags: ['deformation', 'owned geometry'],
  related: [
    { name: 'subdivide', relation: 'companion' },
    { name: 'geometryDiagnostics', relation: 'companion' },
  ],
  limitations: [
    'Enough longitudinal segments must exist before deforming; discontinuous interval boundaries remain possible.',
  ],
};
define(
  'bend',
  { ...deformFacts, axes: 'Bends frame-local +Y toward +X; local Z is the bend axis.' },
  { ...deformMetadata, aliases: ['curve a mesh'], intents: ['bend an existing segmented shape'] },
);
define(
  'twist',
  { ...deformFacts, axes: 'Rotates cross-sections around frame-local +Y along the interval.' },
  { ...deformMetadata, aliases: ['torsion'], intents: ['twist a column or handle'] },
);
define(
  'taper',
  {
    ...deformFacts,
    axes: 'Scales frame-local X/Z along local Y.',
    parameters: [
      ...deformFacts.parameters!,
      'startScale/endScale contain two finite positive scale factors.',
    ],
  },
  {
    ...deformMetadata,
    aliases: ['narrow a mesh'],
    intents: ['vary the width of a segmented shape'],
  },
);
define(
  'displace',
  {
    ...deformFacts,
    axes: 'Callback receives frame-local XYZ and normalized interval distance.',
    parameters: [
      ...deformFacts.parameters!,
      'Callback returns a finite XYZ displacement vector, not an absolute position.',
    ],
  },
  {
    ...deformMetadata,
    aliases: ['vertex displacement'],
    intents: ['shape a mesh using an authored offset field'],
  },
);
const sweepFacts: Facts = {
  ...ownedGeometry,
  units: `${lengthUnits} twist/frame rotations are degrees; scale is dimensionless.`,
  axes: 'Profile coordinates are local XZ; local +Y is the longitudinal direction.',
  origin: 'Defined by supplied path stations or section frames.',
  topology: [
    'Simple profiles without holes; supplied holes fields fail explicitly. Optional caps do not prove freedom from self-intersection or create wall thickness.',
    'Warped side panels use four triangles around a bilinear midpoint to avoid diagonal bias; planar panels use two. This is piecewise-linear sampling, not a smooth surface.',
    'A corresponding edge that collapses between stations is rejected. Check matching starts/order or add intermediate stations for an intended twist. Bounded local analysis observes tight station curvature and intersecting consecutive rings; distant segments remain unchecked.',
  ],
  preservation: [
    'Generates UVs, normals and bounds; SWEEP_SELF_INTERSECTION observes station radius or intersecting consecutive rings. Incomplete analysis keeps an unchecked warning and partial finding.',
  ],
  cost: 'Geometry grows with profile points × stations; each warped side panel adds one midpoint and two triangles. Local analysis is capped at 4096 stations, 512 points per ring and 65536 segment/triangle tests; no global surface-intersection certification or geometry allocation cap.',
};
define(
  'sweepProfile',
  {
    ...sweepFacts,
    parameters: [
      'Finite simple profile and distinct path stations: at least 2 open or 3 closed.',
      'Profile and path checks use their respective extents, not fixed world-unit cutoffs; up specifies a direction regardless of its nonzero magnitude. Output positions remain Float32.',
      'Closed paths omit the repeated endpoint and require twist to be a multiple of 360 degrees.',
      'Transported frames and per-station positive scales define the cross-section.',
      "cap is true (both ends, default), false, 'start' or 'end'; a one-ended cap needs an open path.",
      'creaseAngle is degrees in [0, 180], default 60. Side panels meeting at more than it, across a profile corner or a path station, get separate vertices and a hard shading edge; hexagons and finer profiles stay smooth at the default.',
    ],
  },
  {
    references: ['src/sweep.ts'],
    tags: ['sweep', 'profile', 'path'],
    aliases: ['extrude along path', 'noncircular tube'],
    intents: ['carry a cross-section along a rail'],
    limitations: [
      'Tight-turn warnings use the scaled profile radius at the turning station and adjacent segment lengths. This local heuristic does not test swept-volume intersections, rapid scale changes, or certify a solid.',
    ],
    related: [
      { name: 'loftProfiles', relation: 'alternative' },
      { name: 'pipeAlongPath', relation: 'alternative' },
      { name: 'extrudeProfile', relation: 'alternative' },
    ],
  },
);
define(
  'loftProfiles',
  {
    ...sweepFacts,
    axes: 'Profiles lie in rigid local XZ planes. Initial section travel relative to the first plane determines face winding; sections may progress in either direction.',
    parameters: [
      'At least two simple profiles with equal point counts and corresponding vertex order.',
      'Profile validation is relative to its extent. Nonzero section travel has no fixed world-unit minimum; output positions remain Float32.',
      'Explicit rigid frames position local XZ profiles; no automatic profile correspondence or holes. Coplanar or crossed section arrangements are not certified solids.',
    ],
  },
  {
    references: ['src/sweep.ts'],
    tags: ['loft', 'profile', 'frames'],
    aliases: ['join cross-sections'],
    intents: ['transition between different cross-section shapes'],
    limitations: ['Closed boundaries do not certify a self-intersection-free solid.'],
    related: [
      { name: 'sweepProfile', relation: 'alternative' },
      { name: 'extrudeProfile', relation: 'alternative' },
    ],
  },
);
define(
  'implicitSurface',
  {
    ...ownedGeometry,
    execution: 'async',
    axes: 'Field receives XYZ; positive values describe the inside.',
    origin: 'Explicit sampling bounds min/max define the evaluated region.',
    parameters: [
      'Finite increasing bounds on all axes; finite positive edgeLength.',
      'Positive safe-integer maxCells/maxEvaluations; level finite, tolerance -1 or positive.',
      'Defaults: 1,000,000 estimated cells and 8,000,000 actual callback evaluations.',
    ],
    topology: [
      'Manifold level-set extraction is resolution-dependent; thin features and boundary clipping require review.',
    ],
    preservation: [
      'Generates normals and bounds; no UVs; stamps experimental sampling settings and warnings.',
    ],
    cost: 'Checks estimated grid and actual callback counts before/between samples; cannot interrupt a callback that never returns.',
  },
  {
    references: ['src/implicit.ts'],
    tags: ['implicit surface', 'field', 'solid'],
    aliases: ['signed field', 'isosurface'],
    intents: ['sample a blended volumetric shape'],
    stability: 'experimental',
    limitations: [
      'No CAD accuracy or thin-feature preservation guarantee; requires host execution limits.',
    ],
  },
);

const nodeFacts: Facts = {
  units: `${lengthUnits} explicit rotation triples use degrees unless stated otherwise.`,
  axes: 'Three.js local XYZ; +Y is the normal up convention.',
  origin: 'Position is relative to the selected parent.',
  ownership: 'Creates new Object3D nodes; attaches them to the supplied parent when present.',
  coordinates: 'Parent-local transform inputs, not automatic world-space placement.',
  parameters: ['Names identify nodes; parent attachment changes the supplied parent hierarchy.'],
  topology: [noMesh],
  preservation: ['Does not clone a containing parent hierarchy.'],
  cost: 'Depends on nodes created; not a promise of GPU instanced draw calls.',
};
define(
  'createRoot',
  {
    ...nodeFacts,
    origin: 'Identity transform at [0,0,0].',
    ownership: 'Creates a new root Object3D.',
    cost: 'One node.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['hierarchy', 'root'],
    aliases: ['asset root'],
    intents: ['start an asset hierarchy'],
  },
);
define(
  'createPivot',
  {
    ...nodeFacts,
    semantics: [
      'Prefixes the node name with Joint_; that name does not itself prove a skeletal role.',
    ],
    cost: 'One pivot node.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['hierarchy', 'pivot', 'animation'],
    aliases: ['hinge', 'joint pivot'],
    intents: ['rotate a part around an articulated origin'],
  },
);
define(
  'createPart',
  {
    ...nodeFacts,
    ownership:
      'Creates a new mesh and optional pivot wrapper; input geometry and material are shared, not copied.',
    topology: ['Uses input geometry unchanged; no repair or solid guarantee.'],
    preservation: ['Keeps geometry/material references; does not import another subtree.'],
    semantics: [
      'Names the mesh Mesh_<name>; optional pivot is a distinct parent node.',
      'With pivot:true, position moves the pivot while rotation/scale remain on the child mesh.',
      'Optional semantic input is stamped on the returned mesh or pivot.',
    ],
    cost: 'One mesh plus optional pivot; geometry/material buffers are shared.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['mesh', 'hierarchy', 'placement'],
    summary:
      'Creates a mesh using supplied geometry and material, with optional pivot and parent attachment. Rotation triples are degrees.',
    aliases: ['place a mesh', 'make a part'],
    intents: ['turn geometry into a placed part'],
    limitations: [
      'Attach once using parent; do not separately add the returned node to another parent.',
    ],
  },
);
define(
  'defineLod',
  {
    ...nodeFacts,
    units: 'screenCoverage values are fractions of the screen area, 0..1; no lengths.',
    origin: 'Each lower level keeps its own transform and replaces LOD0 under the same parent.',
    ownership:
      'Records the thresholds on the LOD0 node; creates no nodes and moves nothing until export.',
    coordinates: 'Not a placement operation.',
    parameters: [
      'levels: two or more sibling tier nodes named with one stem and tokens LOD0, LOD1, ... in order.',
      'screenCoverage: one value per level, each from 0 to 1, strictly decreasing, LOD0 first; the last may be 0, which never culls.',
    ],
    semantics: [
      'Level i draws while the asset covers at least screenCoverage[i] of the screen; below the last value it is culled.',
      'Export writes the set as one MSFT_lod chain: LOD0 stays in the scene and lists the lower levels, which leave it; LOD0 extras.MSFT_screencoverage holds the thresholds.',
      'Reported triangles and bounds count LOD0; levelsOfDetail in render results lists each level with its triangles and path.',
      'A set of two or more tiers without this declaration, with a gap, or without LOD0 is an LOD_SET build error.',
    ],
    cost: 'Metadata on one node; lower levels still cost file size.',
  },
  {
    references: ['src/lod.ts', 'src/lod-export.ts'],
    tags: ['hierarchy', 'lod', 'export'],
    aliases: ['level of detail', 'LOD tiers', 'MSFT_lod', 'screen coverage'],
    intents: ['export level-of-detail tiers as one chain'],
    summary:
      'Declares LOD tiers (sibling nodes named Body_LOD0, Body_LOD1, ...) and their screen-coverage thresholds. Use only when the brief asks for LOD tiers.',
    limitations: [
      'Tiers are authored, not generated: Kiln simplifies no geometry.',
      'Sets cannot nest inside another tier; material LOD chains are not created.',
    ],
    related: [{ name: 'createPart', relation: 'companion' }],
  },
);
define(
  'markOpenShell',
  {
    ...nodeFacts,
    units: 'No lengths; reason is text of 1 to 200 characters after trimming.',
    origin: 'Not a placement operation.',
    ownership:
      'Writes one validated mark to part.userData.kilnOpenShell; creates no nodes and changes no geometry.',
    coordinates: 'Not a placement operation.',
    parameters: [
      'part: a scene node, such as the mesh createPart returned or a group; a mark on a group covers the meshes under it.',
      'reason: why the shell is open, 1 to 200 characters after trimming.',
    ],
    semantics: [
      'QA reports a marked part that cannot be built as a closed solid as GEO_PART_SELF_INTERSECTION_ACKNOWLEDGED with the reason, instead of GEO_PART_SELF_INTERSECTION_UNMEASURED.',
      'Overlapping pairs with the marked part stay unmeasured and are counted; overlap there is not ruled out. Overlap between other parts is still measured and reported.',
      'A marked part that builds as a closed solid is measured like any other part. A part skipped for its size, draw range, instancing or invalid indices is still reported as unmeasured.',
      'Both exporters write the mark as the node extras kilnOpenShell: { schemaVersion: 1, reason }; import restores it to userData.',
      'Invalid arguments, or a kilnOpenShell value this helper did not write, are an OPEN_SHELL build error.',
    ],
    cost: 'Metadata on one node: about 50 bytes of extras plus the reason.',
  },
  {
    references: ['src/open-shell.ts', 'src/qa/self-intersection.ts'],
    tags: ['qa', 'hierarchy', 'export'],
    aliases: [
      'open shell',
      'intentionally open',
      'not manifold',
      'single-sided sheet',
      'acknowledge unmeasured part',
    ],
    intents: ['mark a part that is open on purpose'],
    summary:
      'Marks a part that is open on purpose (a C-channel closed by end plates, a single-sided sheet) with the reason, so QA reports it as acknowledged rather than unmeasured.',
    limitations: [
      'A mark states intent and measures nothing: overlap with the part stays unmeasured and part-volume coverage stays partial.',
      'Close a part that is meant to be solid instead of marking it.',
    ],
    related: [
      { name: 'createPart', relation: 'companion' },
      { name: 'geometryDiagnostics', relation: 'companion' },
    ],
  },
);
define(
  'beamBetween',
  {
    ...nodeFacts,
    axes: 'Cylinder +Y is oriented from start to end.',
    origin: 'Midpoint of supplied endpoints.',
    coordinates: 'Endpoints are in the selected parent local coordinates.',
    ownership: 'Creates a new cylinder geometry and mesh; material remains shared.',
    parameters: [
      'Finite distinct endpoints and a usable radius/segment count are required by the intended shape; full validation remains unqualified.',
    ],
    topology: [
      'Capped circular beam for nondegenerate endpoints; not automatic connection to adjacent geometry.',
    ],
    preservation: [
      'Generated cylinder geometry has normals/UVs; no input geometry is transformed.',
    ],
    cost: 'One mesh; triangle count grows with radial segments.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['beam', 'path', 'placement'],
    aliases: ['strut', 'brace', 'rail'],
    intents: ['connect two points with a straight circular beam'],
  },
);
define(
  'snapTo',
  {
    ...nodeFacts,
    ownership: 'Mutates and returns the supplied part; leaves geometry/material buffers unchanged.',
    origin: 'Changes the part translation; does not create a new pivot.',
    coordinates:
      'Measures world AABBs after ancestor refresh, then converts displacement into part-parent coordinates.',
    parameters: [
      'Closes AABB gaps on all axes. Optional axis selects only the overlap-bias direction; it does not constrain movement. overlap defaults to 0.02 scene units.',
    ],
    topology: ['Bounding-box overlap/contact is not exact surface contact or a boolean union.'],
    preservation: ['Preserves rotation, scale, hierarchy and geometry; translation changes.'],
    cost: 'Traverses part/host bounds; cost depends on subtree geometry.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['alignment', 'bounds', 'placement'],
    summary:
      'Moves a part so its world bounding box contacts or overlaps the host bounding box. Useful for coarse alignment; it does not mate exact surfaces.',
    aliases: ['bounding box contact', 'align surfaces'],
    intents: ['close a visible bounding-box gap'],
    limitations: ['AABBs can overlap even when the actual surfaces do not.'],
  },
);
const assemblyFacts: Facts = {
  ...nodeFacts,
  ownership: 'Creates new nodes and generated geometry; supplied materials remain shared.',
  topology: [
    'Composed parts remain separate meshes; no union or watertight whole-assembly guarantee.',
  ],
  semantics: [
    'Part naming and metadata are helper-specific; no category or whole-asset acceptance is selected.',
  ],
};
const assemblyMetadata: Metadata = {
  kind: 'assembly',
  references: ['src/primitives.ts'],
  tags: ['assembly', 'structure'],
};
define(
  'createLadder',
  {
    ...assemblyFacts,
    axes: 'Rails follow bottom-to-top. widthAxis is a preferred basis projected perpendicular to that line; a parallel basis uses the least-aligned canonical axis.',
    origin:
      'Endpoints are supplied in parent coordinates; returned root is at bottom, children are root-local.',
    parameters: [
      'Finite endpoints; positive width and rail/rung radii; integer rungCount 0..10000 and segments 3..4096. Width axis is x or z; explicit finite nonzero widthDirection is projected and rejects parallel directions. Endpoint distance exceeds 1e-4.',
    ],
    cost: 'Two rails plus rungCount meshes.',
  },
  {
    ...assemblyMetadata,
    aliases: ['ladder rungs'],
    intents: ['build rails and evenly spaced rungs'],
    limitations: [
      'No structural-load or climbability guarantee. Rail/rung access remains available; they now belong to result.root.',
    ],
  },
);
define(
  'createWingPair',
  {
    ...assemblyFacts,
    axes: 'Two wings extend toward ±Z; positive sweep moves tips toward -X.',
    units: `${lengthUnits} dihedral is a tip height offset, not degrees.`,
    origin: 'Roots at ±rootZ with optional rootX/rootY offsets.',
    parameters: ['Uses wingGeo dimensions and explicit mirrored placement.'],
    preservation: [
      'Creates separately owned mirrored geometry with corrected reflected triangle winding; material remains shared.',
    ],
    cost: 'Two fixed-complexity wing meshes.',
  },
  {
    ...assemblyMetadata,
    aliases: ['paired wings', 'aircraft wings'],
    intents: ['build a symmetric pair of swept panels'],
    limitations: ['Returns left/right nodes without a shared assembly root.'],
  },
);
define(
  'room',
  {
    ...assemblyFacts,
    axes: 'Width spans Z, depth spans X, height Y; front faces +X.',
    origin: 'Wall base and floor top are local Y=0; floor extends downward.',
    parameters: [
      'Default width/depth/height describe a small room; dimensions are not an overall building/storey limit.',
      'Per-wall rectangular openings are explicit; floor may be disabled.',
    ],
    topology: [
      'Four box-segment walls with real apertures; optional floor. No roof or automatic whole-building watertightness.',
    ],
    cost: 'Mesh count grows with aperture segmentation, plus optional floor.',
  },
  {
    ...assemblyMetadata,
    summary:
      'Creates four walls with rectangular openings and an optional floor. Front faces +X; compose, stack or adapt rooms without selecting an asset category.',
    aliases: ['hollow room', 'interior'],
    intents: ['build an enterable room'],
    related: [
      { name: 'wallWithOpening', relation: 'companion' },
      { name: 'createGableShell', relation: 'alternative' },
    ],
  },
);
define(
  'wallWithOpening',
  {
    ...assemblyFacts,
    axes: 'Wall run axis X or Z; vertical axis Y.',
    origin: 'Centered on run axis; base Y=0.',
    parameters: [
      'Positive finite length/height/thickness; opening or openings, never both.',
      'Rectangular apertures must not overlap or extend outside the wall; touching edges are allowed.',
    ],
    topology: [
      'Actual aperture gaps are composed from box segments; no solid boolean or wall-assembly union.',
    ],
    cost: 'Segmentation grows with aperture boundary coordinates; no generic architectural complexity cap.',
  },
  {
    ...assemblyMetadata,
    aliases: ['door opening', 'window wall', 'partition'],
    intents: ['build a wall with real doorway or window gaps'],
  },
);
define(
  'createRoofPlanes',
  {
    ...assemblyFacts,
    axes: 'Pitched gable roof; ridgeAxis selects X or Z.',
    origin: 'Outer top eave at local Y=0; ridge reaches height. Roof thickness extends inward.',
    parameters: [
      'width spans Z and depth spans X; createGableRoof exposes explicit spanX/spanZ instead.',
    ],
    preservation: [
      'One shared constructor across imports; returns root/slopes/face frames. Use describeAssembly(result.root) for common access and replication.',
    ],
    cost: 'Two slope meshes plus root.',
  },
  {
    ...assemblyMetadata,
    aliases: ['pitched roof planes'],
    intents: ['place two roof slopes over walls'],
    related: [{ name: 'createGableRoof', relation: 'alternative' }],
  },
);
const architectureMetadata: Metadata = {
  kind: 'assembly',
  references: ['src/architecture.ts'],
  tags: ['assembly', 'architecture', 'gable'],
};
define(
  'createGableRoof',
  {
    ...assemblyFacts,
    units: `${lengthUnits} pitchDegrees uses degrees.`,
    axes: 'spanX/spanZ are explicit footprint axes; ridgeAxis X or Z.',
    origin:
      'Wall-bearing line at Y=0; rise determines ridge elevation. Overhang descends below the bearing line.',
    parameters: [
      'Finite positive footprint spans; validated rise/pitch, overhang and thickness options.',
    ],
    preservation: [
      'Returns live rigid roof-face frames with tangents, normals, dimensions and world conversion.',
    ],
    cost: 'Two roof slopes with frame metadata.',
  },
  {
    ...architectureMetadata,
    aliases: ['gable roof', 'roof face frames'],
    intents: ['build a pitched roof with usable attachment frames'],
    related: [{ name: 'createRoofSurfaceLayout', relation: 'companion' }],
  },
);
define(
  'createGableEndPanel',
  {
    ...assemblyFacts,
    axes: 'Vertical triangular panel perpendicular to ridgeAxis; side chooses the outward end.',
    origin: 'Panel base Y=0, centered across span.',
    parameters: [
      'Finite positive span/rise/thickness; explicit rectangular opening dimensions/offsets.',
    ],
    topology: [
      'Triangulated thick gable closure with clipped apertures; this is one panel, not a complete building.',
    ],
    preservation: [
      'Generated panel geometry and semantic boundary metadata; input material shared.',
    ],
    cost: 'Depends on aperture clipping and triangulation.',
  },
  {
    ...architectureMetadata,
    aliases: ['triangular end wall', 'gable closure'],
    intents: ['close a pitched roof end'],
  },
);
define(
  'createGableShell',
  {
    ...assemblyFacts,
    axes: 'spanX/spanZ, +Y wall height and X/Z ridge axis; front is +X.',
    origin: 'Floor top and wall base Y=0.',
    parameters: [
      'Optional floor/gable materials use documented defaults; openings/enterability are explicit.',
      'One gable shell per call; arbitrary environments can compose multiple shells or other geometry.',
    ],
    topology: [
      'Separate walls/floor/slopes/end panels; closed-by-default enclosure does not imply one manifold mesh.',
    ],
    preservation: ['Creates semantic wall, opening, roof and boundary descriptions.'],
    cost: 'Depends on wall/opening segmentation and gable geometry.',
  },
  {
    ...architectureMetadata,
    summary:
      'Composes a gable-roof building shell from walls, floor, slopes and end panels, with optional enterability and openings.',
    aliases: ['gable building shell'],
    intents: ['construct a small pitched-roof enclosure'],
    limitations: ['Gable-specific construction; not a universal building generator.'],
  },
);
define(
  'createRoofSurfaceLayout',
  {
    ...assemblyFacts,
    axes: 'Uses the supplied roof-face tangent/downhill/normal frame.',
    origin: 'Relative to the supplied roof face.',
    parameters: [
      'kind selects panels/shingles/seams/corrugations; finite positive dimensions and at most 10000 generated boxes.',
      'Panels keep 2% width gaps; staggered shingles keep 4% gaps within clipped boundary cells, overlap rows by up to 8%, and clip at the eave.',
      'Seams/corrugations clip edge strips to the face; a face narrower than one strip receives one clipped strip.',
    ],
    preservation: ['Uses live face frames; creates individual mesh elements with shared material.'],
    cost: 'Returns cost.meshes and cost.triangles (12 per box); one mesh per element, no hardware-instanced batching or draw-call promise.',
  },
  {
    ...architectureMetadata,
    aliases: ['roof shingles', 'standing seams', 'corrugated roof'],
    intents: ['repeat details consistently over a roof face'],
    limitations: [
      'Box approximations, not interlocking or physically folded roofing. Material and visual quality still need review.',
      'Separate-parent placement is a construction-time snapshot. Reparenting that requires local shear is rejected; use face.roofRoot to preserve inherited affine transforms.',
    ],
    related: [{ name: 'createGableRoof', relation: 'prerequisite' }],
  },
);
define(
  'createStairs',
  {
    ...assemblyFacts,
    axes: 'Signed totalRise changes Y; signed totalRun advances along selected X or Z.',
    origin: 'Starts from the local origin; totalRise/totalRun define the flight.',
    parameters: [
      'steps must be an integer from 1 to 10000; finite rise/run magnitudes below 1e-4 are rejected.',
      'Width and treadThickness are positive finite. Negative rise/run preserve descending/reversed placement with positive solid dimensions.',
    ],
    cost: 'steps treads plus optional steps risers.',
  },
  {
    ...assemblyMetadata,
    aliases: ['stair flight', 'steps'],
    intents: ['connect elevations with straight stairs'],
    limitations: ['No curved staircase, landing sockets or navigability certificate.'],
  },
);
define(
  'createJointChain',
  {
    ...nodeFacts,
    axes: 'Per-joint forward/bend axes are explicit descriptors; +Y up is conventional, not a mandatory body plan.',
    origin: 'Each offset is local to the preceding joint, starting under the supplied parent.',
    parameters: [
      'Ordered role descriptors with finite offsets and explicit semantic parent relationships.',
    ],
    preservation: [
      'Creates rest frames, local axes, role lookup and parent edges; does not create skinning or a character mesh.',
    ],
    semantics: ['Stamps versioned joint/role metadata, contacts and end-effectors when declared.'],
    cost: 'Linear in number of joint descriptors.',
  },
  {
    kind: 'assembly',
    references: ['src/character.ts'],
    tags: ['assembly', 'rig', 'skeleton'],
    aliases: ['joint chain', 'articulated chain'],
    intents: ['create a body-plan-neutral articulated chain'],
  },
);
define(
  'createVehicleFrame',
  {
    ...nodeFacts,
    axes: '+X forward, +Y up, +Z right.',
    origin: 'Socket positions are local to the new frame root.',
    parameters: [
      'Typed chassis/axle/seat/contact/steering/propulsion descriptors; identifiers and coordinates are validated.',
    ],
    preservation: [
      'Creates socket nodes and typed semantic relationships; geometry and wheels are separate.',
    ],
    semantics: [
      'Marks vehicle frame/socket roles; these labels do not activate category-specific policy.',
    ],
    cost: 'Linear in declared sockets.',
  },
  {
    kind: 'assembly',
    references: ['src/vehicle.ts'],
    tags: ['assembly', 'frame', 'sockets', 'vehicle'],
    aliases: ['chassis sockets', 'vehicle scaffold'],
    intents: ['coordinate support and propulsion attachment locations'],
    limitations: ['Socket declarations alone do not prove ground support or working propulsion.'],
  },
);
define(
  'createWheelGeometrySet',
  {
    ...ownedGeometry,
    ownership:
      'Allocates a tire/rim/hub geometry set intended to be shared by multiple assemblies.',
    axes: '+Z axle; tire lies around XY.',
    origin: 'Axle center [0,0,0].',
    parameters: ['Positive radius and width; width must be less than the diameter.'],
    topology: ['Torus tire plus capped rim/hub cylinders; not a boolean union.'],
    preservation: ['Generates standard geometry normals and UVs.'],
    cost: 'Fixed segment choices: torus 8 × 20 plus rim/hub cylinders.',
  },
  {
    references: ['src/vehicle.ts'],
    tags: ['geometry', 'wheel', 'reuse'],
    aliases: ['shared wheel geometry'],
    intents: ['reuse matching tire and rim buffers'],
    related: [{ name: 'createWheelAssembly', relation: 'companion' }],
  },
);
define(
  'createWheelAssembly',
  {
    ...assemblyFacts,
    axes: '+Z spin axis, optional +Y steering axis.',
    origin:
      'Concentric components at the axle pivot; position moves that pivot under the assembly root.',
    ownership:
      'Creates new wheel hierarchy; supplied geometry set and material references are shared.',
    parameters: [
      'Positive dimensions; hubRadius < rimRadius < radius; rim/hub widths cannot exceed tire width.',
      "side is 'left', 'right' or 'center'; index identifies the axle. These label identity without inferring position, paired wheels or the number of fork arms.",
      'Supplied geometry is checked without mutation: geometryChecks reports radius/width/center differences at relative tolerance 1e-5. At most 2000000 position samples per component; empty/nonfinite geometry fails. A mismatch is advisory, never an automatic resize.',
    ],
    preservation: [
      'Preserves component hierarchy and semantic contacts/relationships. Supplied geometry stays shared; contacts retain declared radius. Review geometryChecks when customizing.',
    ],
    semantics: [
      'Typed wheel/tire/rim/hub/pivot/contact roles with load-bearing and steering metadata.',
    ],
    cost: 'Three wheel meshes plus pivots/contact markers; sharing geometry is not one draw call.',
  },
  {
    kind: 'assembly',
    references: ['src/vehicle.ts'],
    tags: ['assembly', 'wheel', 'pivot'],
    aliases: ['articulated wheel'],
    intents: ['build a wheel with steering and spin pivots'],
    related: [
      { name: 'createWheelGeometrySet', relation: 'companion' },
      { name: 'createVehicleFrame', relation: 'companion' },
    ],
  },
);

const materialFacts: Facts = {
  units:
    'Color/material parameters, not geometry lengths; scalar factors follow the helper signature.',
  axes: 'Not applicable to material construction.',
  origin: 'Not applicable to material construction.',
  ownership: 'Returns a new material; supplied textures remain referenced, not deep-copied.',
  coordinates: 'Does not place geometry or generate UV coordinates.',
  parameters: ['Inspect alpha, roughness, metalness and color inputs against the exact signature.'],
  topology: [noMesh],
  preservation: [
    'Material portability depends on supported glTF properties and the selected exporter; renderer appearance is not a portability guarantee.',
  ],
  cost: 'Material creation itself is small; texture resolution and mesh usage determine memory/draw costs.',
};
const materialMetadata: Metadata = {
  references: ['src/primitives.ts'],
  tags: ['material'],
  related: [{ name: 'copyMaterial', relation: 'companion' }],
};
define(
  'gameMaterial',
  {
    ...materialFacts,
    parameters: [
      'MeshStandardMaterial; defaults to flat shading with configurable roughness/metalness/emissive.',
    ],
  },
  {
    ...materialMetadata,
    summary: 'Creates a configurable MeshStandardMaterial with flat shading enabled by default.',
    aliases: ['flat shaded PBR'],
    intents: ['make a simple solid-color PBR material'],
  },
);
define(
  'basicMaterial',
  {
    ...materialFacts,
    preservation: [
      'Creates MeshBasicMaterial; unlit behavior depends on exporter and destination support.',
    ],
  },
  {
    ...materialMetadata,
    aliases: ['unlit material'],
    intents: ['make an unlit surface'],
    limitations: ['Does not provide physical lighting response.'],
  },
);
define(
  'glassMaterial',
  {
    ...materialFacts,
    parameters: [
      'Creates alpha-blended, double-sided MeshStandardMaterial; opacity is configurable.',
    ],
  },
  {
    ...materialMetadata,
    summary: 'Creates a transparent double-sided standard material using alpha blending.',
    aliases: ['transparent panel'],
    intents: ['make a transparent-looking panel'],
    limitations: [
      'Approximate transparency, not physical transmission or refraction; sorting and overlapping surfaces require review.',
    ],
  },
);
define(
  'lambertMaterial',
  {
    ...materialFacts,
    parameters: ['Creates MeshLambertMaterial; no PBR metalness/roughness inputs.'],
  },
  {
    ...materialMetadata,
    summary: 'Creates a diffuse MeshLambertMaterial with optional flat shading and emission.',
    aliases: ['diffuse material'],
    intents: ['make a simple diffuse surface'],
    limitations: ['Portable export may approximate the original shading model.'],
  },
);
define(
  'pbrMaterial',
  {
    ...materialFacts,
    parameters: [
      'alphaMode input is lowercase: opaque (default), mask or blend. Exported glTF uses uppercase OPAQUE/MASK/BLEND; do not pass those as authoring values.',
      'Use packed metallicRoughness data (G roughness, B metalness); unsupported separate data maps are rejected.',
    ],
    preservation: [
      'Binds texture slots with usage-appropriate color spaces; geometry must provide suitable UVs.',
    ],
  },
  {
    ...materialMetadata,
    references: ['src/textures.ts'],
    aliases: ['textured PBR', 'metallic roughness material'],
    intents: ['bind portable material textures and scalar factors'],
    limitations: ['CPU views do not prove texture/metalness appearance.'],
  },
);
define(
  'foliageMaterial',
  {
    ...materialFacts,
    parameters: [
      'Defaults to MASK, alphaCutoff 0.5, rough nonmetal and double-sided; requires useful alpha-bearing albedo.',
    ],
  },
  {
    ...materialMetadata,
    references: ['src/textures.ts'],
    aliases: ['alpha cutout', 'leaf material'],
    intents: ['render cutout cards with portable alpha masking'],
  },
);
define(
  'materialRecipe',
  {
    ...materialFacts,
    execution: 'async',
    ownership:
      'Resolves a new portable material through the host-injected recipe/texture boundary; resource caching is host-specific.',
    parameters: [
      'A versioned approved recipe ID and its permitted overrides; availability depends on host resources.',
      'textureResources maps baseColor, normal, metallicRoughness, emissive or occlusion to approved resource ID strings. Use baseColor here, not the pbrMaterial field albedo. Check each resource allowedSlots and recipeIds.',
    ],
    preservation: [
      'Compiles portable material settings; texture delivery/quality is explicit resource metadata.',
    ],
  },
  {
    ...materialMetadata,
    references: ['src/primitives.ts', 'src/material-recipes.ts'],
    aliases: ['material preset'],
    intents: ['start from a named reusable material recipe'],
    limitations: [
      'A recipe name does not imply surface relief, geometry, or visual qualification.',
    ],
  },
);
define(
  'compilePortableMaterialSpecV2',
  {
    ...materialFacts,
    execution: 'async',
    parameters: [
      'Strict schemaVersion 2 pbrMetallicRoughness specification.',
      'For workspace library materials, use the exact portableSpec returned by kiln_material and pin its material revision through per-call materialDependencies (CLI --materials) or an optional project lock. The host supplies verified map bytes; generated source cannot read library paths or fetch missing resources.',
      'baseColor and emissive are numeric color integers from 0x000000 to 0xffffff, for example baseColor: 0x8a867c. CSS strings and materialRecipe hex-string overrides are not accepted here.',
      'Texture references use typed procedural specs or approved resource IDs; arbitrary URLs, paths, callbacks and shaders are rejected.',
      'Each texture value is { kind: "resource", resourceId: "kiln.texture..." } or { kind: "procedural", spec: { schemaVersion: 2, ... } }. Bare ID strings are invalid; unlike materialRecipe.textureResources, this API requires the tagged object.',
    ],
    preservation: [
      'Enforces supported portable material representation; does not certify visual similarity in every consumer.',
    ],
  },
  {
    ...materialMetadata,
    references: [
      'src/portable-material-runtime.ts',
      'docs/material-library.md',
      'docs/projects-and-live-review.md',
    ],
    aliases: ['portable material specification', 'project material library'],
    intents: ['compile a strict portable material definition'],
  },
);

const animationFacts = {
  units:
    'Keyframe times and durations are seconds; transform values are absolute, not additive offsets.',
  axes: 'Target-local XYZ axes.',
  origin: 'Does not infer the target rest pose.',
  ownership: 'Creates track/clip data; does not mutate target scene nodes while constructing it.',
  coordinates: 'Absolute parent-local TRS values replace target components during playback.',
  parameters: [
    'Exact nonempty node names; no property/path syntax or control characters. Existence and uniqueness require scene-aware inspection.',
    'Nonempty finite keyframes; nonnegative times must remain strictly increasing after float32 storage. Values must fit finite float32.',
    'LINEAR, STEP, CUBICSPLINE and the EASE_IN, EASE_OUT and EASE_IN_OUT shorthands survive native export and source/GLB review; the last four are glTF CUBICSPLINE samplers with computed tangents and need at least two keys. three.js smooth and Bezier interpolants have no glTF form and are rejected.',
  ],
  topology: [noMesh],
  preservation: [
    'Does not automatically preserve target rest transforms; author their values explicitly.',
  ],
  semantics: [
    'Animation target strings bind to node names; names alone do not certify rig semantics.',
  ],
  cost: 'Linear in keyframe/track count.',
} satisfies Facts;
const animationMetadata: Metadata = {
  references: ['src/primitives.ts', 'src/animation-spline.ts'],
  tags: ['animation', 'keyframes'],
};
/** How the cubic modes shape a track, shared by the three track constructors. */
const easingSemantics = [
  'CUBICSPLINE passes one smooth curve through every key with PCHIP slopes: monotone between keys, never overshooting a key, at rest where the value holds or turns; two keys give a straight line.',
  'EASE_IN (s^2), EASE_OUT (2s - s^2) and EASE_IN_OUT (3s^2 - 2s^3) shape each segment between consecutive keys, s being the fraction of that segment; one key pair makes a smooth swing without sub-keys.',
];
define(
  'rotationTrack',
  {
    ...animationFacts,
    units:
      'Times in seconds; Euler XYZ input rotations in degrees, converted to quaternion keyframes.',
    parameters: [
      ...animationFacts.parameters,
      'rotation contains XYZ degree triples. LINEAR, the cubic modes and the eases follow shortest quaternion arcs between keys, not Euler turns; use quarter-turn samples for a full revolution.',
    ],
    semantics: [...animationFacts.semantics, ...easingSemantics],
  },
  {
    ...animationMetadata,
    aliases: ['rotate joint', 'quaternion keyframes'],
    intents: ['animate a pivot rotation'],
  },
);
define(
  'positionTrack',
  {
    ...animationFacts,
    units: 'Times in seconds; translation uses authored length units.',
    parameters: [
      ...animationFacts.parameters,
      'position contains absolute parent-local XYZ values, not value:.',
    ],
    semantics: [...animationFacts.semantics, ...easingSemantics],
  },
  {
    ...animationMetadata,
    summary:
      'Creates a translation track from absolute parent-local position keyframes and times in seconds.',
    aliases: ['translation keyframes'],
    intents: ['animate a part position'],
  },
);
define(
  'scaleTrack',
  {
    ...animationFacts,
    units: 'Times in seconds; XYZ scale factors are dimensionless.',
    semantics: [...animationFacts.semantics, ...easingSemantics],
  },
  {
    ...animationMetadata,
    aliases: ['scaling keyframes'],
    intents: ['animate uniform or per-axis scale'],
  },
);
define(
  'createClip',
  {
    ...animationFacts,
    ownership:
      'Creates an AnimationClip sharing supplied track objects. Later caller mutation still needs validation. Export adds trailing holds on copied tracks only.',
    axes: 'Defined by the supplied tracks.',
    parameters: [
      ...animationFacts.parameters,
      'Only position/scale vector and quaternion tracks, unique target/channel pairs, valid strides and unit quaternion samples (squared-length tolerance 1e-4). No silent repairs.',
      'A cubic-spline track holds [in-tangent, value, out-tangent] per key, as a glTF CUBICSPLINE sampler does, and needs at least two keys; only its key values must be unit quaternions.',
      'Duration -1 derives from keys; explicit nonnegative seconds must include every key. Zero-duration time-zero static clips are valid. Longer duration is preserved by a held final native sample.',
      'options.loop: true declares a cycle and false a one-shot; omitted is unspecified. Exported as animations[].extras.kilnLoopIntent (loop | once); three.js GLTFLoader exposes it as clip.userData.kilnLoopIntent. Animation review reports it in loopClosure.loopIntent and warns when a declared loop does not close.',
    ],
  },
  {
    ...animationMetadata,
    aliases: ['animation clip'],
    intents: ['collect tracks into a named motion'],
  },
);
define(
  ['idleBreathing', 'bobbingAnimation'],
  {
    ...animationFacts,
    axes: 'Translation along parent-local Y.',
    parameters: [
      ...animationFacts.parameters,
      'Positive duration in seconds; finite amount/height in authored length units. options.basePosition is a finite XYZ triple, default [0,0,0].',
    ],
    preservation: [
      'Writes absolute positions around the supplied basePosition while leaving rotation/scale untouched. Snapshot numeric base components without mutating the caller array.',
    ],
    cost: 'One three-keyframe position track.',
  },
  {
    ...animationMetadata,
    aliases: ['bob', 'idle motion'],
    intents: ['make a simple vertical motion loop'],
    limitations: [
      'Target name cannot infer its rest pose. Supply basePosition explicitly or use a separate zero-origin animation pivot.',
    ],
  },
);
define(
  'spinAnimation',
  {
    ...animationFacts,
    axes: 'Selected local X/Y/Z rotation axis, default Y.',
    preservation: [
      'Writes absolute rotations from identity; does not compose an authored rest rotation.',
    ],
    cost: 'One five-keyframe quaternion track using quarter turns.',
  },
  {
    ...animationMetadata,
    aliases: ['continuous rotation', 'spin loop'],
    intents: ['rotate a named pivot through a complete turn'],
    limitations: [
      'Place authored orientation on a parent pivot when using this identity-based preset.',
    ],
  },
);

const reuseFacts: Facts = {
  ...nodeFacts,
  ownership: 'Creates new mesh nodes sharing source geometry/material; not deep copies.',
  topology: ['Source mesh geometry is shared unchanged.'],
  preservation: [
    'Only the source mesh or first direct Mesh child is used; nested assemblies, child transforms and semantic hierarchy are not reproduced.',
  ],
  semantics: ['New mesh names do not preserve full source semantic identity.'],
  coordinates:
    'Source local transform values and array offsets are interpreted without converting between different parent frames.',
};
const reuseMetadata: Metadata = {
  references: ['src/ops.ts', 'src/primitives.ts'],
  tags: ['reuse', 'mesh instances'],
  limitations: [
    'Mesh reuse is not hierarchy-preserving assembly replication or hardware instancing.',
  ],
};
define(
  'createInstance',
  {
    ...reuseFacts,
    parameters: [
      'source is a Mesh or has a direct Mesh child; absence throws.',
      'Position/rotation/scale are explicit new transforms; rotation is degrees.',
    ],
    cost: 'One new mesh; shared geometry/material buffers.',
  },
  {
    ...reuseMetadata,
    aliases: ['reuse mesh', 'duplicate mesh node'],
    intents: ['place another copy of a single mesh'],
  },
);
define(
  'arrayLinear',
  {
    ...reuseFacts,
    parameters: [
      'count is a safe integer from 1 to 10,000 including the original source; returns count-1 new meshes.',
      'offset and source transforms must be finite; resulting positions are checked before any attachment. Coordinates are source-parent local.',
    ],
    preservation: [...reuseFacts.preservation!, 'Copies preserve source rotation and scale.'],
    cost: 'count-1 new mesh nodes; draw calls are not automatically batched.',
  },
  {
    ...reuseMetadata,
    aliases: ['linear repeat', 'row of parts'],
    intents: ['repeat a mesh at regular offsets'],
  },
);
define(
  'arrayRadial',
  {
    ...reuseFacts,
    axes: 'Orbit around selected local X/Y/Z axis, default Y.',
    parameters: [
      'count is a safe integer from 1 to 10,000 including source; finite center defaults to parent origin.',
      'axis must be x/y/z; orientation outward follows orbit and relative composes with source rotation. Source transforms and all resulting positions must be finite.',
    ],
    preservation: [
      ...reuseFacts.preservation!,
      'Preserves source scale; rotation follows the explicit orientation mode.',
    ],
    cost: 'count-1 mesh nodes; no automatic draw-call batching.',
  },
  {
    ...reuseMetadata,
    aliases: ['circular repeat', 'radial pattern'],
    intents: ['repeat a mesh around a center'],
  },
);
define(
  'mirror',
  {
    ...reuseFacts,
    axes: 'Reflects across the origin plane normal to X/Y/Z.',
    parameters: [
      'A source mesh/direct mesh child and explicit reflection axis.',
      'Requires a finite nonsingular local transform representable as TRS; local shear is rejected.',
    ],
    preservation: [
      ...reuseFacts.preservation!,
      'Reflection is represented by transforms; viewers/exporters must respect negative determinant winding.',
    ],
    cost: 'One new mesh sharing geometry/material.',
  },
  { ...reuseMetadata, aliases: ['reflect part'], intents: ['place a reflected counterpart'] },
);

const csgFacts: Facts = {
  ...ownedGeometry,
  execution: 'async',
  ownership:
    'Creates output mesh/geometry; does not mutate operand geometry. Material sharing and generated groups depend on preservation options.',
  axes: 'Uses one translated and uniformly normalized computation frame for all operands; output axes remain world-aligned.',
  origin:
    'The unparented result mesh.position is the first contributing mesh world origin; geometry positions are local to that origin. Preserve the returned mesh transform.',
  coordinates:
    'World operand relationships are preserved, not their hierarchy. Read world bounds or apply the returned matrix when inspecting positions; geometry alone no longer contains the world translation.',
  parameters: [
    'Use closed, valid solid operands; Manifold WASM is loaded lazily.',
    'Use static triangle meshes. Bake instances, skin poses and active morphs before CSG; these operands are rejected rather than read as base geometry.',
    'smooth affects normals; preserveAttributes requests UV/material provenance where supported.',
    'Keep shape detail in local coordinates; a common frame cannot recover precision already lost in input buffers/transforms or resolve arbitrarily tiny features across a vast combined extent.',
  ],
  topology: [
    'Uses Manifold solid operations; malformed/degenerate operands can fail. Empty boolean results are rejected with diagnostics.',
  ],
  preservation: [
    'Default path does not promise UV retention; preservation mode carries supported UV/material groups and reports losses.',
    'Cut-face UV0/materials come from the cutter. Colors, secondary UVs, tangents, skin/custom attributes and inactive morph targets are dropped with diagnostics; normals are regenerated.',
    'Source attribute/geometry diagnostics are retained without sharing mutable records. Arbitrary user metadata and animation are not carried onto the new topology.',
  ],
  semantics: [
    'Output is a new mesh, not the source articulated assembly; provenance is operation-specific.',
  ],
  cost: 'WASM work depends on operand topology/intersections; no universal input-size or time bound is claimed.',
};
const csgMetadata: Metadata = {
  references: ['src/solids.ts'],
  tags: ['boolean', 'solid', 'async'],
  related: [
    { name: 'geometryDiagnostics', relation: 'companion' },
    { name: 'autoUnwrap', relation: 'companion' },
  ],
};
define(
  'boolUnion',
  { ...csgFacts, parameters: [...csgFacts.parameters!, 'Requires at least two operands.'] },
  { ...csgMetadata, aliases: ['union', 'fuse solids'], intents: ['combine overlapping volumes'] },
);
define(
  'boolDiff',
  { ...csgFacts, parameters: [...csgFacts.parameters!, 'Requires body and at least one cutter.'] },
  {
    ...csgMetadata,
    aliases: ['subtract', 'carve', 'cut holes'],
    intents: ['remove cutter volume from a solid'],
  },
);
define(
  'boolIntersect',
  { ...csgFacts, parameters: [...csgFacts.parameters!, 'Two operands.'] },
  {
    ...csgMetadata,
    aliases: ['intersection', 'overlap volume'],
    intents: ['retain only the shared volume'],
  },
);
define(
  'hull',
  {
    ...csgFacts,
    parameters: ['At least one part; convex enclosure uses its input points.'],
    topology: [
      'Convex solid envelope; removes concavities and does not preserve internal cavities.',
    ],
    preservation: [
      'Generated hull faces have unknown source UV/material provenance; do not infer original texture mapping.',
    ],
  },
  {
    ...csgMetadata,
    aliases: ['convex hull', 'convex envelope'],
    intents: ['enclose geometry with a convex shape'],
  },
);
const profileFacts: Facts = {
  ...ownedGeometry,
  execution: 'async',
  units: `${lengthUnits} angle/twist and pitch parameters use degrees.`,
  topology: [
    'Manifold-backed solid generation from valid profiles; not a guarantee that any arbitrary input describes the intended solid.',
  ],
  preservation: ['New geometry/normals/bounds; does not carry authored UVs from an input mesh.'],
  cost: 'WASM complexity depends on profile vertices, segments and divisions; no general allocation bound is claimed.',
};
const profileMetadata: Metadata = {
  references: ['src/profile.ts'],
  tags: ['profile', 'solid', 'async'],
};
define(
  'roundedBoxGeo',
  {
    ...profileFacts,
    axes: 'Width X, height Y, depth Z.',
    origin: 'Centered at local origin; requested outer extents are maintained.',
    parameters: [
      'Finite positive dimensions and radius; radius must be less than half the smallest dimension.',
      'style round or chamfer; segments affect rounded construction.',
    ],
  },
  {
    ...profileMetadata,
    aliases: ['rounded box', 'chamfered block'],
    intents: ['make a block with softened edges'],
    limitations: ['This is a specific primitive, not a generic selected-edge bevel operation.'],
  },
);
define(
  'extrudeProfile',
  {
    ...profileFacts,
    axes: 'For profile (u,v) and extrusion depth coordinate d, output XYZ is axis x: (d, v, -u); axis y: (u, d, -v); axis z: (u, v, d). Default axis is y. For a desired XZ footprint on axis y, pass profile [X,-Z].',
    origin: 'center defaults true; center false starts depth at the selected-axis origin.',
    parameters: [
      'Finite closed outline, optional finite hole outlines, positive depth.',
      'Twist is degrees; taper is dimensionless; divisions is a whole number >= 0 of intermediate rings, default 0 (16 when twisting).',
      'Bevel uses profile units. If its inward offset empties the section, execution rejects with repair advice: reduce bevel below half the narrowest width, disable it, or widen the section.',
    ],
  },
  {
    ...profileMetadata,
    aliases: ['extrude outline', 'profile extrusion'],
    intents: ['make a solid from a planar cross-section with optional holes'],
    related: [
      { name: 'circleProfile', relation: 'companion' },
      { name: 'sweepProfile', relation: 'alternative' },
    ],
  },
);
define(
  'revolveProfile',
  {
    ...profileFacts,
    axes: 'Profile x is radial distance, y is distance along selected X/Y/Z axis (default Y). Around Y, the sweep starts at +X and proceeds toward -Z.',
    origin: 'Rotation axis passes through local origin.',
    parameters: [
      'Closed finite profile; only nonnegative radial side is used.',
      'angle in (0,360] degrees; segments and bevel options control tessellation.',
      'Bevel uses profile units. If its inward offset empties the section, execution rejects with repair advice: reduce bevel below half the narrowest width, disable it, or widen the section.',
    ],
  },
  {
    ...profileMetadata,
    aliases: ['solid revolution', 'turned solid'],
    intents: ['turn a closed section into a solid vessel or knob'],
    related: [{ name: 'revolveGeo', relation: 'alternative' }],
  },
);
define(
  'circleProfile',
  {
    units: lengthUnits,
    axes: '2D points in caller-selected profile plane.',
    origin: 'Optional 2D center; default origin.',
    ownership: 'Returns a new point array.',
    coordinates: 'Profile-local 2D coordinates.',
    parameters: ['Finite positive radius; segment count must be an integer at least 3.'],
    topology: ['Closed outline represented without repeating the endpoint; no 3D mesh.'],
    preservation: ['Generates profile points only.'],
    cost: 'Linear in segments, default 24.',
  },
  {
    references: ['src/profile.ts'],
    tags: ['profile', 'circle'],
    aliases: ['circular outline'],
    intents: ['create a reusable circular profile'],
  },
);

define(
  'mergeVertices',
  {
    ...ownedGeometry,
    ownership:
      'Normally returns new indexed geometry; positionOnly mode with no position attribute currently returns the input unchanged.',
    axes: 'Preserves source axes.',
    parameters: [
      'tolerance defaults 1e-4; default attribute-aware weld preserves seams.',
      'positionOnly explicitly discards non-position attributes.',
    ],
    topology: [
      'Merges matching vertices; does not prove manifoldness or repair self-intersections.',
    ],
    preservation: [
      'Default weld retains differing attribute seams; positionOnly loses UVs/normals/other attributes and requires regeneration.',
    ],
    cost: 'Depends on vertex count and hashed attribute width.',
  },
  {
    references: ['src/ops.ts'],
    tags: ['mesh processing', 'weld'],
    aliases: ['weld vertices'],
    intents: ['merge duplicate vertices deliberately'],
    limitations: ['Do not use position-only welding as an invisible textured-mesh optimization.'],
  },
);
define(
  'subdivide',
  {
    ...ownedGeometry,
    axes: 'Preserves source axes; smoothing moves vertices.',
    parameters: [
      'iterations is an integer 0..10, default 1; options determine welding, UV preservation and edge behavior.',
      'preserveUV must be explicit for the textured preservation path; subdivide before skin binding because joint indices cannot be interpolated safely.',
      'Continuous vertex attributes have 1..4 components; normalized storage is decoded to owned Float32 and all four RGBA channels are interpolated. Morph attributes currently require three components.',
    ],
    topology: [
      'Loop subdivision changes topology and shape; not selected-edge beveling or general remeshing.',
    ],
    preservation: [
      'preserveUV path retains corner UVs, material groups and supported morph attributes. Position-only welding reports removed UVs, other attributes, groups and morphs; tangents are invalidated.',
      'All paths normalize working coordinates before position welding and upstream adjacency hashing, then restore original units; features near the relative weld/grid resolution need review.',
      'Normals/bounds are updated and unsupported provenance is invalidated.',
    ],
    cost: 'Preflight upper bound is input triangles × 4^iterations × 4 when split is enabled (default). Rejects above 1,000,000 triangles or 128 MiB of output attributes, including morph channels, before cloning/welding. No silent truncation.',
  },
  {
    references: ['src/ops.ts'],
    tags: ['mesh processing', 'subdivision'],
    aliases: ['smooth subdivision'],
    intents: ['add segments and smooth a coarse mesh'],
    limitations: [
      'Conservative per-operation budgets include presplit growth. They are not a peak-memory guarantee; host evaluation limits still apply.',
    ],
  },
);
const curveFacts: Facts = {
  ...ownedGeometry,
  axes: 'Path points use XYZ; frames are chosen by the curve implementation.',
  origin: 'Defined by path/profile coordinates.',
  topology: ['Generates a surface; endpoint caps and a watertight solid are not implicit.'],
  preservation: ['Generates normals and UVs; eager bounding volumes are not guaranteed.'],
  cost: 'Tessellation grows with longitudinal × radial segments; no broad resource cap is claimed.',
};
const curveMetadata: Metadata = { references: ['src/ops.ts'], tags: ['curve', 'surface', 'path'] };
define(
  'curveToMesh',
  {
    ...curveFacts,
    parameters: [
      'Circular tube follows Catmull-Rom interpolation of points; closed controls the path.',
      'radius is required: positive, finite and representable in Float32, in asset units. Undefined dimensions fail instead of selecting a default radius.',
      'Default tubularSegments 32, radialSegments 8.',
    ],
  },
  {
    ...curveMetadata,
    aliases: ['tube along spline', 'cable'],
    intents: ['make a round tube along a curved path'],
    limitations: [
      'Open path ends are uncapped; input stations can overshoot under spline interpolation.',
    ],
  },
);
define(
  'pipeAlongPath',
  {
    ...curveFacts,
    parameters: [
      'bendRadius inserts interpolated corner waypoints; it is not an exact circular fillet radius.',
      'radius is required: positive, finite and representable in Float32, in asset units. Undefined dimensions fail instead of selecting a default radius.',
      'Other tube options follow the signature.',
    ],
  },
  {
    ...curveMetadata,
    aliases: ['pipe', 'rounded path'],
    intents: ['make a tube with softened path corners'],
    limitations: ['Tube ends remain open; this does not construct a hollow pipe wall.'],
    related: [
      { name: 'sweepProfile', relation: 'alternative' },
      { name: 'curveToMesh', relation: 'alternative' },
    ],
  },
);
define(
  'lathe',
  {
    ...curveFacts,
    axes: 'Profile x is radius, y is height; spins around Y.',
    parameters: ['Open or closed profile point list; segments default 12.'],
    cost: 'Linear in profile points × revolution segments.',
  },
  {
    ...curveMetadata,
    aliases: ['lathe surface'],
    intents: ['turn a radial profile into a surface'],
    related: [{ name: 'revolveProfile', relation: 'alternative' }],
  },
);
define(
  'revolveGeo',
  {
    ...curveFacts,
    units: `${lengthUnits} sweep angle is radians (default 2π), unlike revolveProfile degrees.`,
    axes: 'Profile x is radius, y is axial distance; arbitrary nonzero axis vector. Before axis reorientation, the Y sweep starts at +Z and proceeds toward +X.',
    parameters: ['Profile points and revolution segments; explicit angular sweep in radians.'],
    cost: 'Linear in profile points × revolution segments.',
  },
  {
    ...curveMetadata,
    aliases: ['surface revolution', 'partial lathe'],
    intents: ['revolve a surface about an arbitrary axis'],
    related: [{ name: 'revolveProfile', relation: 'alternative' }],
  },
);
define(
  'bezierCurve',
  {
    units: lengthUnits,
    axes: 'XYZ control points.',
    origin: 'Defined by supplied control points.',
    ownership: 'Returns a new array of sampled points.',
    coordinates: 'Control-point coordinate space; no parent transforms.',
    parameters: [
      'Exactly 3 quadratic or 4 cubic control points; sample count controls point density.',
    ],
    topology: ['Point sequence only; no geometry or caps.'],
    preservation: ['Retains sampled curve positions, not a reusable parametric curve object.'],
    cost: 'Linear in sample count.',
  },
  {
    ...curveMetadata,
    aliases: ['bezier samples', 'quadratic curve', 'cubic curve'],
    intents: ['sample a controlled curved path'],
    limitations: ['Passing samples to curveToMesh applies Catmull-Rom interpolation again.'],
  },
);

const uvFacts: Facts = {
  ...ownedGeometry,
  units: 'UVs are dimensionless; source positions retain authored units.',
  axes: 'Uses geometry-local axes, not an Object3D/world projection frame.',
  topology: ['UV generation does not certify or repair solid topology.'],
  preservation: ['Input geometry is not modified; output UV behavior is stated per helper.'],
  cost: 'Linear projection/attribute copy cost except atlas generation.',
};
const uvMetadata: Metadata = {
  references: ['src/uv-shapes.ts'],
  tags: ['uv', 'texture coordinates'],
  limitations: [
    'Existing mapping and explicit projection are different operations; inspect whether this call replaces UVs.',
  ],
};
define(
  'projectUV',
  {
    ...uvFacts,
    axes: 'Rigid frame in geometry-local coordinates: planar XY, box face planes, cylindrical around Y. Euler XYZ rotations are degrees.',
    origin: 'Frame origin is explicit, default [0,0,0]; geometry positions are preserved.',
    parameters: [
      'Planar/box axes and cylindrical height normalize each geometry extent to 0..1. This is not metre-scaled UV mapping; a shared frame does not preserve texel density or texture continuity across separate pieces. Preserve authored physical UVs or map each face with explicit dimensions when that is required.',
      'projection is required. frame uses origin/rotation. Cylinder seamDegrees defaults to 180, measured from +X toward +Z; angularRange is [start degrees, positive sweep <=360] instead of seamDegrees.',
      'Cylindrical caps default to planar for triangle normals within 1e-6 of frame Y; caps:side uses side mapping. Partial ranges must cover side vertices, allowing 1e-6 radians of Float32 boundary roundoff.',
      'Nonempty finite positions, valid triangle indices and matching per-vertex attributes; morph targets are unsupported. At most 2000000 source samples/corners and 128 MiB expanded attribute storage.',
    ],
    ownership: 'Owned non-indexed geometry and copied attributes/metadata; input unchanged.',
    preservation: [
      'Triangle order, positions, normals, matching attributes, material groups and draw range retained. UV0 replaced; tangents removed with a diagnostic. No geometric repair.',
    ],
    cost: 'Linear in source vertices and triangle corners; indexed meshes expand to one vertex per triangle corner.',
  },
  {
    ...uvMetadata,
    references: ['src/uv-project.ts'],
    aliases: ['planar projection', 'box mapping', 'cylindrical UVs', 'rotated UV frame'],
    intents: ['generate directional texture coordinates in an explicit frame'],
    limitations: [
      'Full-wrap seam corners may use U above 1 and require repeat sampling. Side triangles spanning more than half a revolution fail; subdivide the profile. Zero extent maps to 0.5. This is projection, not an atlas or a stretch-free guarantee.',
    ],
    related: [
      { name: 'copyGeometry', relation: 'alternative' },
      { name: 'remapUV', relation: 'companion' },
      { name: 'autoUnwrap', relation: 'alternative' },
    ],
  },
);
define(
  'autoUnwrap',
  {
    ...uvFacts,
    execution: 'async',
    axes: 'Chart orientation is selected by xatlas, not a directional material frame.',
    parameters: [
      'Nonempty complete triangle geometry; resolution is a packing limit, not guaranteed final dimensions.',
      'padding defaults 2; useNormals defaults false.',
    ],
    topology: ['Reindexes/splits vertices for charts; does not repair malformed source topology.'],
    preservation: [
      'Returns new positions/index/UVs and atlas metadata; normals depend on input/options.',
      'Arbitrary custom attributes, groups, materials and original UV orientation are not preserved by this reconstruction.',
    ],
    cost: 'WASM charting/packing depends on mesh complexity and resolution; no general time bound.',
  },
  {
    references: ['src/uv.ts'],
    tags: ['uv', 'atlas', 'async'],
    aliases: ['UV atlas', 'unwrap charts'],
    intents: ['create packed UVs for baked textures'],
    limitations: [
      'Arbitrary chart rotation is unsuitable when directional tileable textures should retain analytic mapping.',
    ],
  },
);

const textureFacts: Facts = {
  units: 'Texture sizes in pixels; color/data usage is explicit.',
  axes: 'Image U/V coordinates, not scene axes.',
  origin: 'Image-local coordinates.',
  ownership:
    'Texture resource ownership/caching follows the specific helper; do not assume deep copies.',
  coordinates: 'Texture space; does not generate mesh UVs.',
  topology: [noMesh],
  preservation: [
    'Portable texture bytes and usage metadata matter independently of material appearance.',
  ],
  cost: 'Depends on texture resolution and decoding/generation work.',
};
define(
  'loadApprovedTexture',
  {
    ...textureFacts,
    execution: 'async',
    parameters: [
      'One approved kiln.texture.* resource ID; paths, URLs, arbitrary bytes and loader options are rejected.',
      'Host resolver fixes dimensions, bytes/hash, MIME, usage and deadlines.',
    ],
    ownership:
      'Returns the host-resolved texture; cache sharing is host-specific and not an independent-copy guarantee.',
    cost: 'Host-bounded approved resource loading; network availability is host-specific.',
  },
  {
    references: ['src/primitives.ts', 'src/material-resources.ts'],
    tags: ['texture', 'approved resources', 'async'],
    aliases: ['approved texture'],
    intents: ['load a permitted material resource'],
    limitations: [
      'Missing resource capability fails; arbitrary file/network loading is not exposed.',
    ],
  },
);
define(
  'proceduralTexture',
  {
    ...textureFacts,
    ownership: 'Creates a new DataTexture with generated bytes and portable metadata.',
    parameters: [
      'Strict schemaVersion 2; size power-of-two 4..1024; at most 8 layers.',
      'Pattern counts 1..256 and noise octaves 1..6; seeded patterns are deterministic.',
      'For stripes and gradient, angleDeg rotates the direction of color variation in UV space about the image center. At 0 degrees colors vary across U: stripe bands run along V. At 90 degrees colors vary across V: bands run along U. This does not rotate the mesh UVs.',
      'Stripes count is the number of alternating bands across one unit of the projected coordinate, not the number of colorA/colorB pairs. Gradient runs from its from color to its to color along that coordinate and clamps outside 0..1.',
      'Unknown keys, callbacks, paths, URLs and shader source are rejected.',
    ],
    preservation: ['Produces repeat-wrapped encoded texture content; color space follows usage.'],
    cost: 'Bounded pixel/layer budgets; generation scales with pixels × layers × pattern work.',
  },
  {
    references: ['src/procedural-texture.ts'],
    tags: ['texture', 'procedural', 'deterministic'],
    aliases: ['generated texture', 'noise texture', 'layered pattern'],
    intents: ['generate a repeatable texture without external image files'],
    limitations: [
      'Repeat wrapping does not guarantee matching edge colors. Odd stripe counts, angled patterns and nonconstant gradients can show seams; inspect the chosen pattern at its repeat boundaries.',
    ],
  },
);
define(
  'normalMapFromHeight',
  {
    ...textureFacts,
    ownership: 'Creates a new linear-data normal texture; source pixels are read, not changed.',
    parameters: [
      'Source must expose supported pixel data; strength controls height-gradient magnitude.',
    ],
    preservation: [
      'Uses brightness as height and wraps image edges; output is tangent-space normal data, not albedo.',
    ],
    cost: 'Linear in source pixel count with neighboring pixel samples.',
  },
  {
    references: ['src/procedural-texture.ts'],
    tags: ['texture', 'normal map'],
    aliases: ['height to normal', 'bump relief'],
    intents: ['derive surface normals from a height image'],
    limitations: [
      'Does not displace actual geometry or certify the supplied albedo is a meaningful height field.',
    ],
  },
);

const metricFacts: Facts = {
  units: 'Counts, not physical units.',
  axes: 'No axis convention required.',
  origin: 'Does not reposition the input.',
  ownership: 'Read-only traversal; returns counts or names.',
  coordinates: 'Inspects the supplied subtree.',
  parameters: ['An Object3D root; results describe that subtree, not a renderer frame.'],
  topology: [noMesh],
  preservation: ['Does not mutate geometry, materials or hierarchy.'],
  cost: 'Linear traversal over the scene subtree and relevant mesh/material records.',
};
define(
  'countTriangles',
  {
    ...metricFacts,
    semantics: [
      'Counts placed mesh triangles, multiplying active InstancedMesh count, and each sprite as two triangles. Ignores visibility/culling, drawRange and material groups; finalized GLB metrics describe exported primitives separately.',
      'Not an acceptance threshold, visible-frame count, draw-call count or GPU timing.',
    ],
  },
  {
    references: ['src/primitives.ts'],
    tags: ['metrics', 'triangles'],
    aliases: ['triangle count'],
    intents: ['measure geometry complexity'],
  },
);
define(
  'countMaterials',
  {
    ...metricFacts,
    semantics: [
      'Counts unique material object references; not draw calls, texture memory or material equivalence.',
    ],
  },
  {
    references: ['src/primitives.ts'],
    tags: ['metrics', 'materials'],
    aliases: ['material count'],
    intents: ['measure material reference diversity'],
    limitations: ['Several meshes sharing one material can still require several draw calls.'],
  },
);
define(
  'getJointNames',
  {
    ...metricFacts,
    semantics: [
      'Returns names beginning Joint_; does not discover every semantic pivot or validate a rig graph.',
    ],
  },
  {
    references: ['src/primitives.ts'],
    tags: ['inspection', 'rig', 'names'],
    aliases: ['joint names'],
    intents: ['list named animation pivots'],
    limitations: [
      'Prefix lookup is not body-plan or skeleton validation. Use describeAssembly(root).joints for semantic joint-chain, wheel-spin and steering nodes, independent of names.',
    ],
    related: [{ name: 'describeAssembly', relation: 'companion' }],
  },
);

define(
  'remapUV',
  {
    ...ownedGeometry,
    units: 'Dimensionless UV multipliers and offsets; authored geometry units are unchanged.',
    axes: 'The two components are U then V.',
    parameters: [
      'scale defaults to [1,1]; offset defaults to [0,0]. Both must be finite pairs. Negative and zero scales are permitted.',
      'Requires existing finite UV0 with two components per position vertex. Mapped values must remain finite Float32 values. Unknown options are rejected.',
    ],
    topology: ['Preserves source topology; does not generate UVs, unwrap, or repair geometry.'],
    preservation: [
      'Copies geometry attributes, indices and groups, replacing UV0 with an independent Float32 buffer.',
      'Nonidentity scaling drops stale tangents and records a warning; pure offsets preserve tangents. Regenerate tangents for normal mapping when needed.',
    ],
    semantics: [noAssetSemantics, 'No material or texture object is copied.'],
    cost: 'Linear in vertex UV count plus the cloned geometry buffers.',
  },
  {
    references: ['src/uv-shapes.ts'],
    tags: ['uv', 'texture', 'ownership'],
    aliases: ['UV scale and offset', 'texture atlas region'],
    intents: ['sample a region of a shared texture', 'mirror or resize texture coordinates'],
    limitations: [
      'Requires existing UVs; does not project new coordinates or change texture wrap mode.',
    ],
    related: [
      { name: 'projectUV', relation: 'prerequisite' },
      { name: 'copyGeometry', relation: 'companion' },
    ],
  },
);
define(
  'materialBudgetAdvisory',
  {
    units: 'Counts distinct material object references.',
    axes: 'Not applicable.',
    origin: 'Not applicable.',
    ownership: 'Read-only traversal; returns a new advisory object and warning array.',
    coordinates: 'Traverses the subtree without modifying transforms.',
    parameters: [
      'maxMaterials is an optional nonnegative safe integer; there is no default material budget or category policy.',
    ],
    topology: [noMesh],
    preservation: ['Does not change geometry, materials, hierarchy or metadata.'],
    semantics: [
      'Returns materialCount, maxMaterials, exceeded and warnings. Omitted budget yields null maxMaterials/exceeded.',
      'An advisory is not an asset acceptance result and contains no valid or errors fields.',
    ],
    cost: 'Linear in subtree meshes and material references.',
  },
  {
    references: ['src/primitives.ts'],
    tags: ['metrics', 'materials', 'advisory'],
    aliases: ['material count budget'],
    intents: ['compare material diversity against an explicit budget'],
    limitations: [
      'Does not measure draw calls or validate an asset. Use kiln_validate and applicable QA for acceptance.',
    ],
    related: [{ name: 'countMaterials', relation: 'companion' }],
  },
);

/** Every retained helper must be explicitly listed; missing facts fail catalog construction. */
const assemblyAccess: Facts = {
  units: lengthUnits,
  axes: 'Preserves the authored XYZ axes; frames are affine matrices and can include inherited scale/shear.',
  origin: 'The supplied subtree root defines the assembly origin.',
  coordinates:
    'Bounds and frame matrices use root-local coordinates, excluding the root transform and ancestors.',
  topology: [
    'Supports ordinary Object3D, Group and Mesh subtrees; does not certify manifoldness or whole-asset validity.',
  ],
  parameters: [
    'At most 10,000 nodes and 2,000,000 placed position samples. Bounds scan all position samples, including unused vertices.',
    'Finite invertible local TRS is required. Local shear, zero scale and matrixWorldAutoUpdate=false are unsupported.',
  ],
  preservation: [
    'Scaffold bounds are null. Bounds do not include morph, skin, shader or displacement deformation.',
  ],
  semantics: [
    'Classification roles, semantic frames/sockets, material slots and rigid articulation are inspected without assigning an asset category.',
  ],
  cost: 'Linear in nodes, placed position samples, metadata and animation samples; geometry sharing still incurs bounds work at each placement.',
};
define(
  'describeAssembly',
  {
    ...assemblyAccess,
    ownership:
      'Returns snapshot lookup lists, metadata and bounds with borrowed live references to scene nodes/resources and clips. It is not a frozen scene.',
    parameters: [
      ...assemblyAccess.parameters!,
      'Optional clips are combined with clips attached inside the subtree; duplicate names and unsupported tracks fail.',
    ],
    semantics: [
      ...assemblyAccess.semantics!,
      'Snapshot node IDs n0,n1,... are not persistent across hierarchy edits. Re-describe after edits.',
      'joints lists semantic articulated, wheel-spin and steering nodes with node IDs, kinds, roles and detached articulated descriptors where present. Names need not start Joint_; duplicate names remain distinct. Match nodeId to frames for wheel axes. This does not infer arbitrary custom joint roles or prove animation target uniqueness.',
    ],
  },
  {
    references: ['src/assembly.ts'],
    tags: ['assembly', 'inspection', 'semantics', 'bounds', 'joints'],
    aliases: [
      'subtree inventory',
      'assembly dimensions',
      'part sockets',
      'semantic joints',
      'wheel pivots',
    ],
    intents: [
      'inspect an existing multipart object',
      'find roles frames and materials in a part',
      'find joint chain wheel and steering pivots without relying on names',
    ],
    limitations: [
      'Not a complete rig or solid-validity certificate. Skinning, morphs, instancing and custom node classes are unsupported.',
    ],
    related: [{ name: 'replicateAssembly', relation: 'companion' }],
  },
);
define(
  'replicateAssembly',
  {
    ...assemblyAccess,
    ownership:
      'Owns a new hierarchy and copied clips. Geometry/materials default to share; copy clones each unique resource once, retaining sharing inside the replica. Material copying keeps textures shared.',
    coordinates:
      'Default space=local preserves root/child local TRS under the chosen parent. space=world reparents the source world matrix only when the new root-local matrix is lossless TRS.',
    parameters: [
      ...assemblyAccess.parameters!,
      'namespace is required: 1–64 characters, lowercase letter first, lowercase letters/digits with single internal underscores or hyphens. Use unique namespaces for detached replicas later composed together.',
      'Defaults: space=local, geometry=share, materials=share, externalReferences=reject, unknownMetadata=reject. Unknown options fail.',
      'externalReferences=preserve keeps and lists external target strings; caller owns their bindings. unknownMetadata=copy-json copies inert finite JSON without guessing reference identity.',
    ],
    preservation: [
      'Revalidates current source after edits; attaches the result.root only after successful preflight and construction.',
      'Remaps internal names/UUID references, sockets, joint roles/aliases/parents and rigid rig graphs. Repeated classification roles are preserved; ambiguous targets fail.',
      'Preserves stored clip times/values/duration and LINEAR/STEP interpolation. Returns nodeMap, nameMap, jointRoleMap and clipMap.',
      'Copying custom resource classes/clone hooks/material callbacks fails rather than silently losing behavior. Opaque JSON metadata is not reference-remapped or guaranteed portable to GLB.',
    ],
    semantics: [
      ...assemblyAccess.semantics!,
      'New names are namespace-qualified. This is hierarchy replication, not GPU instancing or attachment solving.',
    ],
    cost: `${assemblyAccess.cost} Resource copying adds allocation proportional to unique copied buffers/materials.`,
  },
  {
    references: ['src/assembly.ts'],
    tags: ['assembly', 'copy', 'ownership', 'animation', 'semantics'],
    aliases: ['clone full hierarchy', 'repeat multipart object'],
    intents: [
      'repeat a bay with all child parts',
      'copy a wheel or articulated structure without identity collisions',
    ],
    limitations: [
      'World placement of animated/joint roots needs unsupported track/rest rebasing; use a static wrapper or local placement.',
      'Skinning, morphs, GPU instancing, custom node types and additive clips are unsupported. External preservation is not self-contained acceptance.',
    ],
    related: [
      { name: 'describeAssembly', relation: 'prerequisite' },
      { name: 'createInstance', relation: 'alternative' },
    ],
  },
);

/** Every retained helper must be explicitly listed; missing facts fail catalog construction. */
export const helperContracts: Readonly<Record<string, HelperContractMetadata>> = contracts;
