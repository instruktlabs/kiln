# Experimental community glTF exporter

Kiln can qualify Three.js `GLTFExporter` as its scene converter while retaining glTF Transform,
Kiln validation, texture preparation and semantic metadata policy. The established exporter remains
the default. This is a migration option, not a claim that every renderer supports every glTF feature.

## Normal workflow and experimental testing

Ordinary users and coding agents can continue using the normal CLI/MCP export workflow.
For Blender or Unity handoff, read the [handoff guide](engine-handoff.md). It explains when
trying the experimental converter is useful, how to compare outputs, and how to restore the
default. Choosing Blender or Unity does not automatically require a different exporter.
The intended end state remains one qualified default exporter.

## Try the experimental converter from a clone

Use the supported toolchain and build matching runtime bundles first:

```sh
bun install --frozen-lockfile
bun run build:runtime
```

In PowerShell:

```powershell
$env:KILN_GLTF_EXPORTER = 'three'
node dist/cli.mjs render /path/to/asset.kiln.js --out /path/to/asset.glb
Remove-Item Env:KILN_GLTF_EXPORTER
```

The unset value and `legacy` select the established converter. Unknown values fail. CLI/MCP hosts
carry this choice as a bounded option to their normal subprocess evaluator; worker environment
sanitization remains intact. Disk cache identities distinguish backends. Library hosts can set
`gltfExporter: 'three'` explicitly in render options. Public tool schemas are unchanged.

The candidate uses the optional `@napi-rs/canvas` dependency for headless textured exports. If it is
unavailable, those exports fail; they do not silently switch converter or drop textures. Flat-material
exports do not load canvas. Native platform packaging must be qualified before changing the default.
The headless adapter installs missing exporter-required Blob/image APIs in that host process; it
does not emulate `document` or `window`. Browser scene conversion uses native image/canvas APIs
through the same host-injected preparation interface.

Texture transforms are normalized from their effective UV matrix. This preserves rotation
centers and manually assigned glTF-compatible matrices without modifying the source. A Three.js
texture combining nonuniform scale with rotation can contain shear, which glTF's texture TRS
cannot represent. The candidate explicitly rejects such a transform. Lossless UV baking for
these cases remains a blocker to making it the default; automatic texture/geometry changes
are not introduced as a fallback.

## What is preserved

The candidate covers triangle meshes, material groups, sprites represented as quads with Kiln facing
metadata, named transforms, animation channels, vertex colours, additional UVs, morph targets, skins,
and the standard material extensions understood by the community exporter. Invalid material
partitions are rejected by the shared preflight. Private `userData` is excluded; versioned Kiln
semantic extras and bounded review clips retain their existing policy. Export copies keep caller
texture sources and skeleton references intact.

This describes serialization capability. It does not automatically extend all authoring helpers,
QA rules, preview materials or optimization algorithms. In particular, skin/morph deformation,
complex texture transforms, material extensions in every review path, and runtime codec support
still need feature-specific qualification. Lines/points are explicitly rejected by the experimental
converter rather than bypassing the triangle pipeline's metadata and geometry policy.

## Qualify a consumer

Keep a canonical GLB and name the actual engine, importer, version and render pipeline in results.
For example, Unity 6 Built-in RP with glTFast is a different target from Unity URP or an FBX workflow.
Tests should check hierarchy, world-space positions, part names, material assignments, texture pixels,
animation motion, and GPU appearance. Valid glTF bytes alone do not establish feature preservation.

Unity's glTFast importer can replace a static single-root object's name with the asset filename.
Its **Scene Object Creation** setting affects the resulting wrapper. Qualify `Always` if preserving
the authored root below a wrapper matters; prefer explicit part references or paths relative to that
root. Do not alter canonical geometry to compensate for an importer naming policy.

For an FBX-only consumer, use an explicit conversion recipe and test the result. Blender's experimental
space-transform baking can corrupt nested offsets; keeping `bake_space_transform=False` preserved
the diagnostic fixture. That setting is separate from animation baking. Neither recipe nor exporter
choice guarantees identical materials after conversion.

Reusable tools:

- [Existing-source corpus comparison](https://github.com/instruktlabs/kiln/blob/main/docs/evaluation/community-exporter.md)
- [Blender/Unity importer assertions](https://github.com/instruktlabs/kiln/blob/main/scripts/integration/README.md)
- `node scripts/exporter-cli-check.mjs`: built CLI, worker and cross-backend disk-cache smoke.

KTX2/runtime optimization is a separate packaging concern. The exporter migration does not change
compression defaults. Preserve the interchange asset and qualify codec-dependent derivatives for
their target consumers.

References: [Three.js exporter](https://threejs.org/docs/pages/GLTFExporter.html),
[glTF Transform](https://gltf-transform.dev/),
[Unity glTFast features](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.20/manual/features.html).
