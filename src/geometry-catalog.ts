import type { HelperSpec } from './discovery/helper-specs';

/** Source migration guidance only. These names are not callable globals or exports. */
export const REMOVED_AUTHORING_HELPERS: Readonly<Record<string, string>> = Object.freeze({
  boxUnwrap:
    'Preserve existing UVs with direct geometry sharing or copyGeometry. Generate new face mappings explicitly with projectUV(geo, { projection: "box", frame? }); planar projection is a separate mode.',
  cylinderUnwrap:
    'Preserve valid built-in UVs with direct sharing or copyGeometry. For cylindrical mapping use projectUV(geo, { projection: "cylindrical", frame?, seamDegrees?, angularRange?, caps? }); partial arcs need an explicit angularRange.',
  planeUnwrap:
    'Use projectUV(geo, { projection: "planar", frame? }) to generate frame-XY UVs. Preserve existing UVs with direct sharing or copyGeometry instead.',
  cloneGeometry:
    'Pass the original geometry directly for intentional sharing. Use copyGeometry only for independent editable buffers; the removed helper returned its input.',
  cloneMaterial:
    'Pass the original material directly for intentional sharing. Use copyMaterial for independent properties; referenced textures remain shared.',
  panelRemapV:
    'Use remapUV(geo, { scale: [uScale, vScale], offset: [uOffset, vOffset] }). Preserve omitted legacy defaults explicitly: scale [1, 0.3], offset [0, 0]. Missing UVs must be projected or unwrapped first.',
  validateAsset:
    'Use materialBudgetAdvisory(root, { maxMaterials }) for an explicit material-count budget, or countMaterials(root) for a count. It does not validate assets or measure draw calls; use kiln_validate and render/QA findings for the actual validation workflow.',
});

/** Authoring helpers discovered through the same catalog as the original primitives. */
export const geometryPrimitives: readonly HelperSpec[] = [
  {
    name: 'projectUV',
    signature:
      "projectUV(geometry: BufferGeometry, opts: { projection: 'planar'|'box'|'cylindrical', frame?: { origin?: [x,y,z], rotation?: [xDeg,yDeg,zDeg] }, seamDegrees?: number, angularRange?: [startDeg,sweepDeg], caps?: 'planar'|'side' })",
    returns: 'THREE.BufferGeometry (owned, non-indexed triangle corners)',
    category: 'uv',
    description:
      'Generates UV0 explicitly in a rigid geometry-local frame. Planar maps XY; box maps each face; cylindrical wraps frame Y with separate caps and split angular seams. Replaces existing UVs and removes stale tangents. To preserve good UVs use direct sharing or copyGeometry instead.',
    example:
      "const mapped = projectUV(rawGeometry, { projection: 'cylindrical', frame: { rotation: [0,0,-90] }, seamDegrees: 180 });",
  },
  {
    name: 'describeAssembly',
    signature: 'describeAssembly(root: Object3D, opts?: { clips?: readonly AnimationClip[] })',
    returns:
      'AssemblyView { version, root, nodes, roles: Map, frames, sockets, materials, bounds, clips, ownership }',
    category: 'structure',
    description:
      'Describes an existing subtree through common roles, frames, sockets, material slots and root-local bounds. Lookup lists are snapshots with live scene/resource references; bounds are null for geometry-free scaffolds. No asset category is needed.',
    example: 'const assembly = describeAssembly(bay); const dimensions = assembly.bounds?.size;',
  },
  {
    name: 'replicateAssembly',
    signature:
      "replicateAssembly(source: AssemblyView, opts: { namespace: string, parent?: Object3D, space?: 'local' | 'world', geometry?: 'share' | 'copy', materials?: 'share' | 'copy', externalReferences?: 'reject' | 'preserve', unknownMetadata?: 'reject' | 'copy-json' })",
    returns:
      'AssemblyReplica extends AssemblyView { nodeMap, nameMap, jointRoleMap, clipMap, externalReferences }',
    category: 'instancing',
    description:
      'Replicates a complete supported hierarchy with namespaced semantic and animation references. Owns new nodes/clips; shares geometry/materials unless copy is requested. Revalidates the live source before attaching. Default local placement preserves authored transforms; returns the new subtree as result.root.',
    example:
      "const repeated = replicateAssembly(describeAssembly(bay), { namespace: 'bay2', parent: root }); repeated.root.position.x = 3;",
  },
  {
    name: 'remapUV',
    signature: 'remapUV(geometry: BufferGeometry, opts?: { scale?: [u, v], offset?: [u, v] })',
    returns: 'THREE.BufferGeometry (owned clone, UV0 stored as Float32)',
    category: 'uv',
    description:
      'Scales and offsets existing UV0 on an independent geometry. Defaults are scale [1,1], offset [0,0]. Requires finite two-component UVs; does not unwrap or project. Reads interleaved and normalized attributes. Preserves topology and other attributes; nonidentity scaling removes stale tangents with a warning.',
    example:
      'const strip = remapUV(cylinderGeo(0.4, 0.4, 1), { scale: [1, 0.3], offset: [0, 0] });',
  },
  {
    name: 'materialBudgetAdvisory',
    signature: 'materialBudgetAdvisory(root: Object3D, opts?: { maxMaterials?: number })',
    returns:
      '{ materialCount, maxMaterials: number | null, exceeded: boolean | null, warnings: string[] }',
    category: 'utility',
    description:
      'Counts distinct material object identities and optionally compares an explicit nonnegative integer budget. Without maxMaterials it reports a count with null budget/exceeded and no warnings. Does not measure draw calls, validate geometry, choose an asset category, or establish asset validity.',
    example: 'const advisory = materialBudgetAdvisory(root, { maxMaterials: 8 });',
  },
  {
    name: 'copyGeometry',
    signature: 'copyGeometry(geometry: BufferGeometry)',
    returns: 'THREE.BufferGeometry',
    category: 'instancing',
    description:
      'Returns an independent geometry with copied vertex buffers. Use before direct mutation of a cached primitive.',
    example: 'const editable = copyGeometry(boxGeo(1, 1, 1)); editable.translate(0, 0.5, 0);',
  },
  {
    name: 'copyMaterial',
    signature: 'copyMaterial(material: Material)',
    returns: 'THREE.Material (same subtype)',
    category: 'instancing',
    description:
      'Copies material properties so edits do not change other parts. Referenced textures remain shared.',
    example: 'const red = copyMaterial(steel); red.color.set(0xaa2222);',
  },
  {
    name: 'meshGeo',
    signature:
      'meshGeo({ positions: number[], indices?: number[], normals?: number[], uvs?: number[], tangents?: number[] })',
    returns: 'THREE.BufferGeometry',
    category: 'geometry',
    description:
      'Builds an owned triangle mesh from flat numeric arrays. Validates finite values, attribute lengths and indices; computes normals if absent. Counterclockwise winding.',
    example: 'const triangle = meshGeo({ positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2] });',
  },
  {
    name: 'parametricSurface',
    signature:
      "parametricSurface(sample: (u,v) => [x,y,z], opts?: { u?: [0,1], v?: [0,1], uSegments?: 24, vSegments?: 24, periodicU?: false, periodicV?: false, orientation?: 'uv'|'vu' })",
    returns: 'THREE.BufferGeometry',
    category: 'geometry',
    description:
      'At most 262,144 endpoint-inclusive samples per call, checked before invoking the sampler. Samples an equation into an owned surface with UVs. Periodic endpoints must agree within 1e-6 of the sampled diagonal, independent of origin and units; UV seams retain matching normals. A surface is not automatically a watertight solid.',
    example:
      'const canopy = parametricSurface((u,v) => [u, 0.3*Math.sin(u*3)*Math.cos(v*2), v], { u: [-2,2], v: [-1,1] });',
  },
  {
    name: 'geometryDiagnostics',
    signature: 'geometryDiagnostics(geometry: BufferGeometry, tolerance?: number)',
    returns:
      '{ tolerance, toleranceMode, positionScale, vertices, triangles, boundaryEdges, nonManifoldEdges, orientationConflicts, degenerateTriangles, invalidIndices, nonFiniteVertices }',
    category: 'utility',
    description:
      'Counts topology issues after position-grid matching. Default tolerance is 1e-6 times the finite-position diagonal; an explicit positive value is absolute. Reports effective tolerance and scale. Open boundaries are valid for sheets; closed edges do not certify a self-intersection-free solid.',
    example: 'const topology = geometryDiagnostics(shell);',
  },
  {
    name: 'creaseNormals',
    signature: 'creaseNormals(geometry: BufferGeometry, opts?: { angle?: 60, tolerance?: number })',
    returns: 'THREE.BufferGeometry',
    category: 'mesh-ops',
    description:
      'Returns owned geometry with angle-limited smooth normals, preserving UV corners. Angle is degrees. Default position tolerance is 1e-8 times the diagonal, with no world-unit floor; explicit tolerance is absolute. Invalidates tangents; use after shaping for sharp rims and smooth walls.',
    example: 'const shell = creaseNormals(cylinderGeo(1,1,2,32), { angle: 45 });',
  },
  {
    name: 'bend',
    signature:
      'bend(geometry, { angle, frame?: { origin, rotation }, interval?: [minY,maxY], falloff?: t => weight })',
    returns: 'THREE.BufferGeometry',
    category: 'mesh-ops',
    description:
      'Bends local +Y toward +X through angle degrees. Returns owned geometry and updated normals/bounds; preserves UVs, invalidates tangents. Frame rotation is Euler XYZ degrees.',
    promptNotes:
      'Deformation interval uses local Y distances; outside vertices stay unchanged. Add enough segments before bending. Falloff returns 0..1; use it to avoid a discontinuity at a selected interval boundary.',
    example: 'const arch = bend(planeGeo(1,4,4,32), { angle: 90 });',
  },
  {
    name: 'twist',
    signature:
      'twist(geometry, { angle, frame?: { origin, rotation }, interval?: [minY,maxY], falloff?: t => weight })',
    returns: 'THREE.BufferGeometry',
    category: 'mesh-ops',
    description:
      'Rotates the cross-section progressively around local +Y, reaching angle degrees at the end. Returns owned geometry; frame rotation uses Euler XYZ degrees.',
    example: 'const spiral = twist(column, { angle: 120 });',
  },
  {
    name: 'taper',
    signature:
      'taper(geometry, { startScale?: [1,1], endScale: [x,z], frame?: { origin, rotation }, interval?: [minY,maxY], falloff?: t => weight })',
    returns: 'THREE.BufferGeometry',
    category: 'mesh-ops',
    description:
      'Scales local X/Z across the local Y interval using positive start/end scale pairs. Returns owned geometry; preserves UVs and invalidates tangents.',
    example: 'const narrowed = taper(column, { endScale: [0.4,0.7] });',
  },
  {
    name: 'displace',
    signature:
      'displace(geometry, offset: ([x,y,z], t) => [dx,dy,dz], opts?: { frame?: { origin, rotation }, interval?: [minY,maxY], falloff?: t => weight })',
    returns: 'THREE.BufferGeometry',
    category: 'mesh-ops',
    description:
      'Adds an authored displacement vector in the chosen local frame. Returns owned geometry; callback coordinates are local and t is normalized along the interval.',
    example: 'const rippled = displace(surface, ([x,y,z]) => [0, 0.1*Math.sin(x*8), 0]);',
  },
  {
    name: 'sweepProfile',
    signature:
      "sweepProfile(profile: [x,z][], path: [x,y,z][], opts?: { cap?: true | false | 'start' | 'end', creaseAngle?: 60, closed?: false, up?: [x,y,z], twist?: 0, scale?: number | [x,z][] })",
    returns: 'THREE.BufferGeometry',
    category: 'curves',
    description:
      'Sweeps a simple noncircular profile along polyline stations using transported frames. Supports total twist in degrees and per-station scales. Generates UVs and optional caps.',
    promptNotes:
      "First version supports one simple profile without holes. Closed paths omit the repeated endpoint and require twist to be a multiple of 360. up sets the initial profile +Z direction and cannot parallel the path. cap caps both ends by default; 'start' or 'end' caps only that end of an open path. creaseAngle (degrees) keeps side faces meeting at more than it hard-edged, at profile corners and sharp path corners: at the default 60, squares, triangles and pentagons stay faceted while hexagons and finer profiles shade smooth; 180 smooths every edge. Tight-turn warnings do not replace visual inspection for self-intersections.",
    example:
      'const rail = sweepProfile([[-.1,-.2],[.1,-.2],[.1,.2],[-.1,.2]], [[0,0,0],[0,1,0],[1,2,0]]);',
  },
  {
    name: 'loftProfiles',
    signature:
      'loftProfiles(sections: { profile: [x,z][], frame?: { origin, rotation } }[], opts?: { cap?: true })',
    returns: 'THREE.BufferGeometry',
    category: 'curves',
    description:
      'Joins corresponding simple profiles in explicit local XZ planes. Frames use Euler XYZ degrees; initial section travel determines outward winding. Profiles need equal point counts and corresponding vertices.',
    promptNotes:
      'No holes or automatic profile correspondence. Opposite winding is normalized while preserving the first point. Caps close boundaries but do not prove the loft has no self-intersections.',
    example:
      'const hull = loftProfiles([{ profile: wide }, { profile: narrow, frame: { origin: [0,2,0] } }]);',
  },
  {
    name: 'implicitSurface',
    signature:
      'await implicitSurface(sample: ([x,y,z]) => signedValue, { bounds: { min, max }, edgeLength, maxCells?: 1000000, maxEvaluations?: 8000000, level?: 0, tolerance?: -1, smooth?: true })',
    returns: 'Promise<THREE.BufferGeometry>',
    category: 'geometry',
    description:
      'Experimental positive-inside implicit field sampled into a solid mesh. Requires explicit bounds and resolution; checks grid size and actual evaluation count. Output has no UVs.',
    promptNotes:
      'Use async build and await. Smaller edgeLength increases cost sharply. This helper cannot stop a callback that never returns; the host evaluator process provides that boundary. Thin features and geometric accuracy require inspection.',
    example:
      'const blob = await implicitSurface(([x,y,z]) => 1-Math.hypot(x,y,z), { bounds: { min: [-1.2,-1.2,-1.2], max: [1.2,1.2,1.2] }, edgeLength: 0.15 });',
  },
];
