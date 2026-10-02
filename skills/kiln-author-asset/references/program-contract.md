# Kiln source contract

A `.kiln.js` file is ordinary JavaScript evaluated with Kiln globals. Do not add imports, exports, or TypeScript syntax. JSDoc and local helper functions are supported.

```js
const meta = { name: 'Reading lamp' };
function build() {
  const root = createRoot('ReadingLamp');
  const metal = gameMaterial(0x556677);
  createPart('Base', cylinderGeo(0.25, 0.25, 0.06, 32), metal,
    { position: [0, 0.03, 0], parent: root });
  return root;
}
```

`meta.name` identifies the asset. No `meta.category` is needed to discover or use helpers. If retained in existing source, it is descriptive metadata and does **not** select validation or QA policy: the host-owned requirements are authoritative so generated source cannot weaken its own checks. Discovery families and tags describe catalog entries, not the category of the asset being built. `meta.role` describes its scene role when composition needs one: `ground`, `building`, `wonder`, `poi`, `prop`, `fill`, or `vehicle`.

`build()` returns a `THREE.Object3D` and may be async. Use `async`/`await` for Boolean operations, `roundedBoxGeo`, `extrudeProfile`, `revolveProfile`, `implicitSurface`, approved texture loading, and other catalog signatures marked async. `sweepProfile`, `loftProfiles`, and ordinary deformations are synchronous.

Optional `animate(root)` returns an array of `THREE.AnimationClip`. Follow catalog keyframe signatures: rotation tracks use a `rotation` field, position tracks use `position`. Grounded and moving parts need meaningful named pivots.

To review that motion, `kiln_screenshot_animation` needs the clip **by name** -- `clip` is required, and a name that matches nothing comes back as an error listing the clips that do exist. `frameTimes` is optional and is expressed as **phases in 0..1**, not seconds: 1 to 9 strictly increasing values, scaled by the clip's own duration. Omit it and six frames are sampled evenly from start to end. A track whose target name binds to no node surfaces in `unresolvedTracks`, which is what a clip that renders frozen actually means -- a joint-name mismatch, not a broken clip.

## Frames and ownership

- Asset coordinates: metres; +X forward, +Y up, +Z right.
- Kiln helper rotations and deformation frame rotations: Euler XYZ degrees.
- Direct Three.js `object.rotation`: radians.
- `createPart` prefixes mesh names with `Mesh_`. `createPart(..., { parent })` attaches the part; do not separately add its return value to another parent.
- `createPivot(name, position?, parent?)` is positional and prefixes the node name with `Joint_`. Rotate the returned object directly if needed.
- The prefixes are a naming convention, not a requirement. When a delivery contract needs an exact node name, assign `.name` after creation; exported node names, selectors and QA all use the final name.
- `gameMaterial` and `lambertMaterial` default `flatShading` to true, but glTF has no flat-shading flag: the GLB, the local viewer and GPU views shade from the geometry's normals, and CPU views are flat-lit per face whatever the flag. For hard edges in the delivered asset, split vertices at the edge (for example `sweepProfile` `creaseAngle`, or separate faces).
- Cached primitives may share geometry. Use `copyGeometry` or `.clone()` before direct vertex/geometry mutation. `copyMaterial` copies material properties while sharing referenced textures.
- The former `cloneGeometry` and `cloneMaterial` aliases are removed. When migrating saved source, use the original value directly to preserve sharing, or `copyGeometry`/`copyMaterial` when an independent copy is intended.

## Geometry and execution boundaries

Custom `THREE.BufferGeometry` is available. `meshGeo` helps validate flat positions, indices, normals, UV0, and tangents. Read export warnings for unsupported attributes; arbitrary Three.js features do not automatically survive GLB export. The host may select `geometryPolicy: 'strict'` to reject unsupported attributes instead of dropping them with warnings. In a local runtime, `KILN_GEOMETRY_POLICY=strict` configures this host policy; generated source and tool arguments cannot weaken it.

Use deterministic equations or explicit seeded recipes when repeatable builds matter. Avoid ambient state in reusable geometry functions.

The source policy rejects host-global access, network access, dynamic imports/evaluation, constructor chains, and raw `THREE.DataTexture`, `ShaderMaterial`, or `RawShaderMaterial`. Use approved texture/material helpers. Generated code runs in strict mode: `this` is allowed inside object-literal and class methods (an object whose `add` method reads `this.parts`), not at the top level or in a plain function; an assignment to an undeclared name, `with` or a legacy octal literal is an error. Source checks are not an operating-system sandbox; evaluator process boundaries belong to the host.

`kiln_validate` checks source without building geometry. `kiln_render` evaluates and returns images and structural findings. A valid program can still make an unsuitable shape or fail a later export check.
