# Game delivery contract

This page is the single reference for what a Kiln asset carries into a game engine:
semantic roles, baked vertex attributes, and the integration manifest fields that
describe them. Everything here is plain glTF: roles in node `extras`, underscore
custom attributes, and extensions Kiln already writes (`KHR_node_visibility`,
`MSFT_lod`). No engine-specific schema is required to read it.

Every diagnostic on this page is **advisory**. It appears as a build warning and in
the manifest, never as a QA disposition, unless a helper below says otherwise
(`requireSolid` fails the build; CLI `render --strict-budget` turns a failing budget
into an exit code).

## Roles

Roles live in `extras.kilnSemantic.roles` on the node (revision 2 of the role
vocabulary, `KILN_SEMANTIC_ROLES_REVISION`). Ids and kinds are single segments:
a letter or digit, then up to 63 letters, digits, `_` or `-`.

| Role | Helper | Node | Meaning |
| --- | --- | --- | --- |
| `collider.box.<id>` | `colliderBox(size, { id, parent?, position?, rotation? })` | `Collider_box_<id>`, hidden | Unit-box proxy; the node scale is the box size |
| `collider.capsule.<id>` | `colliderCapsule(radius, height, opts)` | `Collider_capsule_<id>`, hidden | Y-axis capsule; node scale `[2r, h, 2r]`, `h` is the total height including caps |
| `collider.hull.<id>` | `colliderHull(mesh, { id, parent? })` | `Collider_hull_<id>`, hidden | Convex hull of the mesh, in the mesh's own transform |
| `anchor.<kind>.<id>` | `anchor(kind, id, opts?)` | `Anchor_<kind>_<id>` | A leaf transform the consumer attaches behaviour to (door, light, spawn) |
| `kit.module` | `defineModule(root, spec)` | the root | One modular kit piece; `extras.kilnKit` holds `{ schemaVersion: 1, footprint: [w, d], height, snapAxis, origin }` |
| `kit.port.<id>` | `port(id, opts?)` | `Port_<id>` | A snap frame under a module |
| `lod.impostor` | `defineLod(tiers, { screenCoverage, impostor: true })` | last tier | The last LOD level is a card impostor |

Collider proxies are real meshes hidden with `KHR_node_visibility`, so a loader that
ignores the extension still sees them; their material is named `KilnColliderProxy`.
Hidden nodes are excluded from triangle counts, bounds and QA.

`repeatInstances(parent)` marks a parent (`extras.kilnRepeatInstances`) whose
identical leaf children the three.js runtime target turns into one
`EXT_mesh_gpu_instancing` node. The editable GLB keeps every child.

## Baked vertex attributes

`bakeSurfaceAttributes(target, { edge?, cavity? })` writes float attributes on every
visible mesh under `target`, exported by both converters:

| glTF name | three.js name | Range | Meaning |
| --- | --- | --- | --- |
| `_EDGE` | `_edge` | 0..1 | 1 on a chamfer, bevel or rim (convex dihedral or open boundary); 0 on a flat face. Drives paint wear. |
| `_CAVITY` | `_cavity` | 0..1 | 1 fully exposed; toward 0 deep in a recess. Ambient-occlusion input only. |

Edge weight is `smoothstep(t/2, t, dihedral)` on convex edges (default threshold
`t` 35 degrees), 1 on boundary or non-manifold edges, the maximum per welded vertex,
then one averaging ring by default. Cavity casts a fixed cosine-weighted Fibonacci
hemisphere of rays (default 32) against the occluders (default: the whole asset,
excluding other LOD tiers and hidden nodes). Both are deterministic. Parameters are
recorded in mesh `extras.kilnSurfaceBakeV1`. three's `GLTFLoader` lowercases custom
attribute names, so shaders read `_edge` and `_cavity`.

## Budgets, palette and solids

- `defineBudget({ triangles: n | { LOD0, LOD1, ... }, draws? })` stores scene extras
  `kilnBudgetV1`. Tier n is measured as level `min(n, last)` of every `MSFT_lod`
  chain plus everything outside the chains; `draws` caps LOD0 draw calls.
- `definePalette(colors, { threshold? })` stores scene extras `kilnPaletteV1`. Each
  material drawn by a visible node is compared by its base colour factor in CIELAB
  (CIE 1976 delta E, default threshold 10). Off-palette materials become
  `PALETTE_OFF` warnings. Texture pixels are not judged.
- `requireSolid(part)` fails the build with `REQUIRE_SOLID` unless every visible mesh
  under `part` is closed, manifold and outward. `geometryDiagnostics(geometry).solid`
  reports the same facts and the signed volume.

Across the evaluator boundary, `REQUIRE_SOLID` retains measurements for at most four
failing meshes, the total failure count and a truncation flag. A numeric locator
such as `root.children[0].children[2]` identifies the mesh in the authored build
root before export. The tool error includes closure, manifoldness, orientation and
edge counts. Follow the child order in the retained source to inspect that mesh;
the failed build has no exported inspection artifact. Names and exception text
are not forwarded. A locator deeper than 64 levels is omitted, while its measured
facts remain. This is diagnostic evidence for explicitly marked parts, not a new
universal requirement that every mesh be closed.

## Integration manifest fields

`inspectGlbIntegration(bytes)`, render results and CLI `render --json` receipts add
these optional fields. Older readers ignore them; a field is absent when the asset
has nothing to report.

| Field | Shape |
| --- | --- |
| `colliders` | `[{ role, id, path, name, transform: { translation, rotation, scale }, shape }]`; `shape` is `{ kind: 'box', size }`, `{ kind: 'capsule', radius, height }` or `{ kind: 'hull', vertices }` |
| `anchors` | `[{ role, kind, id, path, name, transform }]` |
| `kit` | `{ role, path, name, transform, footprint, height, snapAxis, origin }` for the first module |
| `ports` | `[{ role, id, path, name, transform, module? }]` |
| `levelsOfDetail[].levels[].impostor` | `true` on an impostor level |
| `vertexAttributes` | `[{ name: '_EDGE' \| '_CAVITY' \| ..., meshes: [path], params? }]` |
| `budget` | `{ status: 'pass' \| 'fail', tiers: [{ tier, declared, measured, status }] }` |
| `palette` | `{ status: 'pass' \| 'warn', colors, threshold, checkedMaterials, offPalette: [{ material, color, nearest, deltaE, textured? }] }` |
| `deliveryDiagnostics` | `[{ code, path, message }]` |

Transforms are relative to the asset root (the default scene), rotation as an
`[x, y, z, w]` quaternion. Paths are `/<scene>[0]/<name>[occurrence]/...` with each
name URI-encoded.

Delivery diagnostic codes: `DELIVERY_COLLIDER_NOT_HIDDEN`,
`DELIVERY_COLLIDER_OUTSIDE_BOUNDS`, `DELIVERY_COLLIDER_NO_OVERLAP`,
`DELIVERY_COLLIDER_OVERLAP_UNMEASURED`, `DELIVERY_KIT_INVALID`,
`DELIVERY_KIT_MULTIPLE`, `DELIVERY_PORT_OUTSIDE_FOOTPRINT`,
`DELIVERY_PORT_WITHOUT_MODULE`, `DELIVERY_ANCHOR_NOT_LEAF`. A box or capsule wholly
inside a closed solid touches no triangle, so it reports `NO_OVERLAP`.

## Texture atlases

`textureAtlas` packs regions without a `content` rectangle when the atlas sets
`pack: { edge: 1024 | 2048, gutter?, algorithm?: 'maxrects' }`. See
[procedural surfaces](procedural-surfaces-v3.md#pack-regions-automatically).

## three.js runtime delivery

`kiln export ASSET REVISION --profile runtime --target three --out a.glb` (or
`exportAssetGlb(record, { profile: 'runtime', target: 'three' })`, or
`deliverThreeRuntimeGlb(glb)` for any Kiln GLB) writes a meshopt-compressed,
quantized GLB and a sidecar whose `delivery` block states the extensions used,
which nodes carry a dequantization scale, the custom attributes and the instancing
batches. See [export profiles](export-profiles.md#threejs-runtime-target).

Consumer rules that follow from it:

- **Keep the loaded mesh and its transforms.** Quantized positions are normalized
  integers. Static mesh node transforms restore metres; `delivery.nodeScale` lists
  those node changes. For skinned meshes, the quantizer folds dequantization into
  the skin's inverse bind matrices instead. Keep the loaded skeleton, bind matrices
  and hierarchy together. Copying bare geometry into a new mesh, or replacing the
  inverse bind matrices with the editable asset's matrices, loses that correction.
- **Collider transforms are exact.** A collider's proxy mesh moves to a child named
  `<collider>_Proxy`, so the collider node's scale is still its size.
- **Custom attributes stay float.** `_EDGE` and `_CAVITY` are never quantized.
- **Find nodes by role, not by name alone.** three's `GLTFLoader` makes object names
  unique, so an asset root that shares the scene's name loads with a numeric suffix.
- **Choose LOD levels in the consumer.** `GLTFLoader` preserves `MSFT_lod` extension
  data but does not create a `THREE.LOD` controller or automatically switch levels.
  LOD0 is attached to the scene. Read its `userData.gltfExtensions.MSFT_lod.ids`,
  resolve lower tiers with `gltf.parser.getDependency('node', id)`, and install them
  under the appropriate authored parent. Your application chooses one active tier
  using the retained `MSFT_screencoverage` policy or its own documented policy.
  Do not show all levels together. A final impostor marker does not implement
  billboarding or distance-based switching.

`src/__tests__/runtime-three-export.test.ts` qualifies static geometry, role data,
instancing, explicit lower-tier selection and a quantized skin through Three's
`GLTFLoader` with `MeshoptDecoder`. The skin test compares rest and two posed
world-space vertex sets within 1 mm on its four-metre fixture. It is a focused
consumer regression, not acceptance of every rig, animation or game integration.

## Worked example

`src/__tests__/fixtures/bunker-door-frame.kiln.js` uses every element above: a kit
module with two ports, a box collider, three anchors, a two-tier `defineLod` plus an
impostor, baked attributes, a packed two-region atlas, a budget, a required solid and
instanced bolts. `src/__tests__/delivery-fixture.test.ts` renders it through both
converters and loads its three.js runtime export through `GLTFLoader`.

## Out of scope

Not built in this cycle: a crash-damage or tearing helper, a kit snap solver or
cross-module validation, general self-intersection detection, and a palette lock
that fails builds.
