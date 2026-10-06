# Make your own parts and integrations

Start with an ordinary function in the asset program. Give each assembly a named pivot, expose the dimensions that should change, and return attachment pivots for neighboring parts. The function stays in the saved source, so a later edit can revise one instance without sending the whole program again.

The [portal-frame recipe](../skills/kiln-author-asset/references/reusable-frame.kiln.js) shows this approach: three instances share a function, each has independent dimensions, and a marker follows a named attachment. You can copy the function into an asset without installing another package. Kiln does not require a custom component language.

## Choose the modeling level

Use a primitive for a regular shape, a sweep or loft for a profile that follows a path, and a parametric surface for an equation. Use `meshGeo` or `THREE.BufferGeometry` when you need to choose the vertices and triangles yourself. The [geometry guide](geometry.md) explains winding, seams, ownership, deformation and export limits.

Work in metres, with +X forward, +Y up and +Z right. Keep an assembly's geometry in its own local frame; move the pivot to place it in the asset. Name important subassemblies and attachment pivots. Inspection accepts an exact node path when several instances share a name, and can measure between attachment points. [Camera and inspection examples](cameras.md).

Copy shared primitive geometry with `copyGeometry` before modifying its buffers. Copy materials with `copyMaterial` before changing their properties; texture references remain shared. Reuse the same geometry and material directly when sharing is intentional. The old identity aliases `cloneGeometry` and `cloneMaterial` have been removed. See [the explicit source migrations](migration.md#replace-removed-authoring-helpers) for these and the retired UV/advisory helpers.

## Check what survives export

Kiln exports triangle positions, normals, UV0, tangents, indices and material groups. Vertex colors, additional UV sets, skinning and morph targets are not supported by this bridge. The default policy reports unsupported data; `geometryPolicy: 'strict'` rejects it. Local CLI/MCP hosts can enforce the same policy with `KILN_GEOMETRY_POLICY=strict`.

Inspect the exported GLB as well as the authored scene. Topology diagnostics do not prove that a model has no self-intersections, and CPU views do not establish material fidelity. A reusable part should include a small example that exercises its parameter limits and shows its attachments clearly.

## Embed the tools

The package exposes TypeScript source through explicit subpaths. Use a TypeScript runtime or bundler for library imports; the packaged CLI and MCP entry points run on Node.

```ts
import { createKilnProgramToolRegistry } from '@instruktlabs/kiln/tools';
import { MemoryProgramStore } from '@instruktlabs/kiln/programs';

const tools = createKilnProgramToolRegistry({
  programStore: new MemoryProgramStore(),
});
const source = tools.find(tool => tool.name === 'kiln_source');
```

The default embedded evaluator is for trusted local source. Inject an `evaluatorPort` when your host needs a terminable worker or a separate execution boundary. Inject `viewRenderPort` for GPU images, `captureLimits` to tighten image budgets, and a `ProgramStore` to own source persistence. A store must preserve immutable references; build and image caches remain disposable.

Register each tool's name, description and schema from this registry in your transport. Do not copy the definitions into a second catalog. The [generated reference](tools.md) describes the public inputs, and [runtime controls](runtime.md) explain execution, cancellation and cache identity.

## Contribute a helper

Keep the geometry implementation independent of the MCP and model SDKs. Add its signature and a small useful example to discovery, expose it in the program sandbox, and export it through the appropriate library subpath. Document units, ownership, invalid inputs and any topology or attribute loss.

For behavior changes, first reproduce the missing behavior in a focused test. Check exported geometry and relevant invariants, then run the repository's typecheck, lint, tests and coverage gate. Add visual review when the change affects shape, framing or materials. Update the shipping skill references when an agent needs different instructions to use the helper correctly.
