import type { DiscoveryEntry } from './catalog-schema';

type RecipeEntry = Extract<DiscoveryEntry, { kind: 'recipe' }>;

/** Optional constructions using existing helpers; these do not activate asset policy. */
export const constructionRecipes: readonly RecipeEntry[] = [
  {
    version: 'kiln.catalog-entry.v1',
    id: 'recipe:joined-frame-v1',
    kind: 'recipe',
    name: 'Braced frame from shared attachment points',
    summary:
      'Keep both ends of braces attached after resizing a frame by deriving them from the same post endpoints. Separate intended joints from surfaces that must remain apart; adapt to supports, furniture, chassis or scaffolding.',
    family: 'structure',
    tags: ['brace', 'frame', 'attachment', 'junction', 'clearance', 'resize'],
    aliases: [
      'floating support bars',
      'disconnected struts',
      'joined beams',
      'bench frame',
      'table legs and rails',
      'chair or stool frame',
    ],
    intents: ['connect both ends of a support', 'resize a frame without detached braces'],
    stability: 'experimental',
    related: [
      { id: 'operation:beamBetween', relation: 'prerequisite' },
      { id: 'recipe:editable-assembly-v1', relation: 'companion' },
    ],
    references: ['skills/kiln-refine-asset/references/revision-and-views.md'],
    limitations: [
      'Centerline joints intentionally overlap. This is neither a Boolean union nor a welded, load-bearing or manufacturing certificate.',
      'The interpolation below describes straight posts in one local frame. Curved or transformed neighbors need attachment points derived from their actual geometry and frames.',
      'A connected-component report can pass when only one end touches. Inspect each intended pair separately; zero unsigned surface distance can mean intersection.',
    ],
    recipe: {
      prerequisites: ['operation:createRoot', 'operation:createPart', 'operation:beamBetween'],
      steps: [
        'Choose the assembly frame and derive support endpoints from shared dimensions. Identify which interfaces must meet and which must have clearance.',
        'Derive brace endpoints along those same supports instead of entering unrelated coordinates. Rebuild dependent members when dimensions change.',
        'Inspect each brace against each intended post. Then check its clearance from the deck; contact at a required joint must not substitute for clearance elsewhere.',
      ],
      example: `const meta = { name: 'BracedFrame' };
const span = 1.2;
const height = 0.8;
const depth = 0.45;
const radius = 0.025;
function build() {
  const root = createRoot(meta.name);
  const steel = gameMaterial('#637987');
  const along = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (const [side, z] of [['Near', -depth / 2], ['Far', depth / 2]]) {
    const a0 = [-span / 2, 0, z], a1 = [-span / 2, height, z];
    const b0 = [span / 2, 0, z], b1 = [span / 2, height, z];
    beamBetween(side + 'PostA', a0, a1, radius, steel, { parent: root });
    beamBetween(side + 'PostB', b0, b1, radius, steel, { parent: root });
    beamBetween(side + 'Rail', a1, b1, radius, steel, { parent: root });
    beamBetween(side + 'Brace', along(a0, a1, 0.25), along(b0, b1, 0.75),
      radius, steel, { parent: root });
  }
  const thickness = 0.06;
  createPart('Deck', boxGeo(span + 0.1, thickness, depth + 0.1), gameMaterial('#947653'),
    { parent: root, position: [0, height + radius + thickness / 2, 0] });
  return root;
}`,
      adaptations: [
        'Change span or height and rebuild. Keep tube thickness independent; scaling the assembly would also scale thickness and clearances.',
        'For a removable connector, give it a local root at the attachment point. For a gap or bearing, derive the separation explicitly instead of overlapping parts.',
      ],
      checks: [
        'Measure each Near/FarBrace against both corresponding PostA and PostB surfaces with kiln_inspect measure.mode=surface. Inspect those joints in context.',
        'Check each rail against the deck underside and each brace against the deck separately. The latter should have positive separation; a whole-frame minimum can hide the wrong connection.',
        'After edits, compare exported bounds and protected components. A rendered image or connected graph alone does not establish all required joints.',
      ],
    },
  },
  {
    version: 'kiln.catalog-entry.v1',
    id: 'recipe:editable-assembly-v1',
    kind: 'recipe',
    name: 'Editable multipart assembly',
    summary:
      'Group a replaceable support under a real root, repeat its full hierarchy, then replace one bracket in its local frame while retaining the post and base. Adapt the same pattern to bays, wheels or mechanisms.',
    family: 'structure',
    tags: ['assembly', 'replacement', 'hierarchy', 'reuse', 'local frame'],
    aliases: [
      'replaceable multipart support',
      'coherent parts',
      'group components',
      'swap bracket',
    ],
    intents: ['move or replace an assembly together', 'edit one repeated component independently'],
    stability: 'experimental',
    related: [
      { id: 'operation:describeAssembly', relation: 'prerequisite' },
      { id: 'operation:replicateAssembly', relation: 'prerequisite' },
    ],
    references: ['src/assembly.ts', 'skills/kiln-author-asset/references/geometry-recipes.md'],
    limitations: [
      'A common name prefix does not create a shared transform or replacement root. The actual parent-child hierarchy must carry the assembly.',
      'Replication does not solve attachment, clearances or load-bearing contact. Check the new component against its neighbors.',
      'This static example has no animation or external references. Animated replacements must preserve or explicitly retarget tracks, joint roles and rest frames.',
    ],
    recipe: {
      prerequisites: [
        'operation:createRoot',
        'operation:createPart',
        'operation:describeAssembly',
        'operation:replicateAssembly',
      ],
      steps: [
        'Create a static root at the support placement datum. Parent every support component beneath it and author child dimensions in that local frame.',
        'Give the replaceable bracket its own root at the connection datum. Retain that root when changing bracket geometry.',
        'Replicate describeAssembly(support.root) with an explicit unique namespace; use nodeMap for the copied bracket instead of guessing a renamed path.',
        'Move or rotate the support root. Replace only the bracket children, then inspect exported parents, unchanged parts and contact views.',
      ],
      example: `const meta = { name: 'EditableSupports' };
const replaceSecond = false;
function build() {
  const root = createRoot(meta.name);
  const metal = gameMaterial('#637987');
  function bracketParts(bracket, style, prefix) {
    if (style === 'fork') {
      for (const side of [-1, 1]) createPart(prefix + 'Arm' + side,
        boxGeo(0.04, 0.18, 0.10), metal,
        { parent: bracket, position: [side * 0.055, 0.07, 0], rotation: [0, 0, -side * 35] });
    } else createPart(prefix + 'Saddle', boxGeo(0.30, 0.04, 0.18), metal, { parent: bracket });
  }
  function makeSupport(name, height) {
    const support = createRoot(name);
    root.add(support);
    createPart('Base', boxGeo(0.30, 0.04, 0.30), metal,
      { parent: support, position: [0, 0.02, 0] });
    createPart('Post', boxGeo(0.06, height, 0.06), metal,
      { parent: support, position: [0, height / 2, 0] });
    const bracket = createRoot('Bracket');
    bracket.position.y = height;
    support.add(bracket);
    bracketParts(bracket, 'saddle', '');
    return { root: support, bracket };
  }
  const support = makeSupport('Support', 0.8);
  support.root.position.x = -0.6;
  const second = replicateAssembly(describeAssembly(support.root),
    { namespace: 'second', parent: root });
  second.root.position.x = 0.6;
  second.root.rotation.y = Math.PI / 6; // Object3D rotations use radians.
  if (replaceSecond) {
    const bracket = second.nodeMap.get(support.bracket);
    bracket.clear(); // Retain the attachment root and its local transform.
    bracketParts(bracket, 'fork', 'second__');
  }
  return root;
}`,
      adaptations: [
        'Set replaceSecond=true for the local bracket replacement. A different bracket height may require moving the connection datum or its neighbor; do not silently stretch the post.',
        'Use ordinary factories for parametric variants and replicateAssembly for a repeated hierarchy. Geometry/materials default to shared; request copy or clone before independently mutating resources.',
        'Flat hierarchies remain valid for independent parts. Add assembly roots when shared placement, articulation or replacement is requested.',
      ],
      checks: [
        'Verify each exported assembly root contains its intended components and each replacement has the intended local transform.',
        'Compare retained geometry, world transforms, materials and animation targets across the edit; test rotated placements as well as the original.',
        'Inspect the connection in context. Names and axis-aligned bounds alone do not prove physical contact.',
      ],
    },
  },
  {
    version: 'kiln.catalog-entry.v1',
    id: 'recipe:surface-detail-v1',
    kind: 'recipe',
    name: 'Attached raised surface detail',
    summary:
      'Create a raised strip whose boundary reuses the actual sampled carrier vertices. Optional starting point for a vein, rib, seam or embossed panel, with shared coordinates and independent materials.',
    family: 'geometry',
    tags: ['surface', 'attachment', 'vein', 'rib', 'seam', 'custom geometry'],
    aliases: ['attached raised vein seam', 'detail follows curved surface', 'organic surface rib'],
    intents: ['keep detail attached after a shape edit', 'avoid floating surface decoration'],
    stability: 'experimental',
    related: [
      { id: 'operation:parametricSurface', relation: 'prerequisite' },
      { id: 'operation:meshGeo', relation: 'prerequisite' },
    ],
    references: ['src/geometry.ts', 'skills/kiln-author-asset/references/geometry-recipes.md'],
    limitations: [
      'This is an open carrier sheet and an attached raised strip, not a watertight solid, Boolean union or general attachment solver.',
      'The strip follows a grid-aligned UV band. Arbitrary branches require splitting carrier faces at their boundaries or another explicitly checked attachment construction.',
      'Offsets follow sampled vertex normals; extreme curvature, coarse tessellation or excessive height can produce intersections. Coincident boundaries are intentional; inspect shading and the actual destination.',
    ],
    recipe: {
      prerequisites: ['operation:parametricSurface', 'operation:meshGeo', 'operation:createPart'],
      steps: [
        'Build the carrier once. Derive the detail from its position, normal, UV and index buffers in the same local frame.',
        'Select complete carrier triangles in a narrow UV band; reuse their topology and boundary positions.',
        'Raise interior vertices along carrier normals, tapering to zero at the entire boundary. Rebuild both meshes from shared dimensions after a shape edit.',
        'Inspect exported boundary contact and overall dimensions, then review the detail in context from the side and underside.',
      ],
      example: `const meta = { name: 'AttachedSurfaceDetail' };
const width = 0.8;
function build() {
  const root = createRoot(meta.name);
  const carrier = parametricSurface((u, v) => [
    width * (u - 0.5) * (0.5 + 0.5 * Math.sin(Math.PI * v)),
    1.2 * v,
    0.12 * Math.sin(Math.PI * v) + 0.04 * Math.sin(Math.PI * u)
  ], { uSegments: 32, vSegments: 32 });
  createPart('Carrier', carrier, gameMaterial('#47785a'), { parent: root });
  const p = carrier.getAttribute('position'), n = carrier.getAttribute('normal');
  const uv = carrier.getAttribute('uv'), index = carrier.getIndex();
  const lo = 15 / 32, hi = 17 / 32;
  const positions = [], uvs = [], indices = [], remap = new Map();
  function vertex(original) {
    if (remap.has(original)) return remap.get(original);
    const u = uv.getX(original), v = uv.getY(original);
    const boundary = u === lo || u === hi || v === 0 || v === 1;
    const lift = boundary ? 0 : 0.015 * Math.sin(Math.PI * (u - lo) / (hi - lo)) * Math.sin(Math.PI * v);
    const result = positions.length / 3;
    positions.push(p.getX(original) + n.getX(original) * lift,
      p.getY(original) + n.getY(original) * lift,
      p.getZ(original) + n.getZ(original) * lift);
    uvs.push(u, v);
    remap.set(original, result);
    return result;
  }
  for (let t = 0; t < index.count; t += 3) {
    const face = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (face.every(i => uv.getX(i) >= lo && uv.getX(i) <= hi)) indices.push(...face.map(vertex));
  }
  createPart('RaisedDetail', meshGeo({ positions, indices, uvs }), gameMaterial('#a5bd79'), { parent: root });
  return root;
}`,
      adaptations: [
        'Change width or the carrier equation to reshape both surfaces together. Keep band limits on sampled UV columns, or split triangles where the new boundary crosses them.',
        'For fine detail without geometric relief, use an authored texture or normal map with matching UVs. For rounded tubes, check their swept cross-sections against the actual surface instead of assuming shared control points prove contact.',
        'Choose tessellation and detail height for the intended scale. Local normal offsets can change any dimension; measure the final asset when a brief requires a fixed envelope.',
      ],
      checks: [
        'Verify the exported strip boundary coincides with the carrier and the strip rises on the intended side; matching equations alone are insufficient.',
        'After edits, compare unchanged regions, dimensions and boundary contact separately from silhouette and shading.',
        'A close view with neighboring surfaces retained should expose gaps, clipping or z-fighting. Structural QA alone does not establish continuous attachment.',
      ],
    },
  },
];
