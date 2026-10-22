# Editable and runtime exports

Kiln keeps the saved revision as the canonical asset. Choose a delivery profile when
exporting it; changing the profile never rebuilds the asset or changes its collection.

| Profile | Output | Use |
| --- | --- | --- |
| `editable` (default) | Existing exact GLB, source, preview, manifest, or editable ZIP | Continue authoring, inspect build/review records, archive or share source |
| `runtime` (opt in) | Derived standalone GLB and a versioned metadata JSON sidecar | Deliver a smaller GLB to an application while retaining traceability |

`editable` describes the export policy, not a promise that an imported GLB has source.
A binary-only saved revision remains binary-only. Keep the editable ZIP when source
is available: a runtime sidecar is **not** a replacement for it.

## Which option should I use?

- **Continue editing or share a rebuildable asset:** keep the default `editable`
  profile and export its ZIP. Export an editable GLB when you need the exact saved GLB.
- **Load an animated asset in a game or web scene:** try `runtime`. Kiln moves its
  duplicate review tracks out of the GLB, reducing the data the application loads.
  Compare the actual sizes; a static asset may gain nothing. Keep the sidecar for
  traceability and keep the editable ZIP for future authoring.
- **Need additional glTF feature preservation:** separately compare the experimental
  Three.js converter described in the [engine handoff guide](engine-handoff.md).
  Preserve the baseline and check the result in the destination importer.

### Converter and delivery profile are separate settings

| Setting | When it applies | Default | Optional choice | Why it exists |
| --- | --- | --- | --- | --- |
| GLB converter | Source render/build | Established converter (`legacy`) | Experimental Three.js converter (`three`) | Compare preservation of features such as skin/morph data, extra UV sets and material extensions |
| Export profile | Delivery of an already-saved revision | `editable` | `runtime` | Keep exact authoring artifacts or externalize duplicate review data for application loading |

The converter is selected through the host's `KILN_GLTF_EXPORTER` environment or the
render library option. The delivery profile is selected through `kiln_export`, CLI
`export --profile`, or the asset-export library. Either converter can produce a saved
asset for either delivery profile. Changing the environment during an export does
not rebuild the saved GLB; create and save a new render when comparing converters.

The defaults preserve established workflows and complete review records. Runtime is
opt in because moving review data changes its location and adds a companion file.
The Three.js converter is experimental because native installation requirements,
unsupported UV transforms and destination feature support still need qualification.
Neither setting automatically enables mesh merging, geometry simplification, Draco,
Meshopt or KTX2 compression. Those require separate choices and validation; the
opt-in [three.js runtime target](#threejs-runtime-target) is one such choice.

## Material sidedness at export

glTF represents front-only or double-sided surfaces. Both Kiln converters preserve
`FrontSide` and `DoubleSide`. A used `BackSide` material now stops a source build
with `EXPORT_MATERIAL_SIDE_UNSUPPORTED`. The direct scene API names the part and
material; CLI/MCP carry closed repair advice without authored identifiers across
the evaluator boundary. Use `kiln_source` with query `BackSide` to locate the
authored material. This applies
in both `warn` and `strict` geometry modes and before texture baking or conversion;
unused material-array slots do not block export. Existing saved GLBs remain readable
and exporting their exact bytes does not rebuild them.

For a one-sided interior surface, author triangles facing inward and use
`FrontSide`. For a leaf or other deliberate sheet visible from either side, use
`DoubleSide`. Neither choice supplies thickness or missing caps. Do not flip only
normals to repair winding. Automatic back-only conversion is not provided: winding,
normal/tangent basis, groups, shared geometry and deformation data must remain
consistent. A destination shader override is an explicit runtime choice, separate
from the portable asset.

## CLI

From an asset workspace, using the IDs returned by `save` or `assets`:

```sh
# Existing behavior: full editable ZIP, with byte-identical saved files.
node kiln.mjs export ASSET_ID REVISION_ID --out mech-editable.zip

# Explicit editable GLB: exact saved GLB bytes.
node kiln.mjs export ASSET_ID REVISION_ID --profile editable --format glb --out mech-editable.glb

# Runtime defaults to GLB; writes BOTH files below.
node kiln.mjs export ASSET_ID REVISION_ID --profile runtime --out mech.glb
# mech.glb
# mech.kiln-metadata.json
```

Runtime requires GLB format and an output ending in `.glb`. Bundle/source formats
use `editable`. Use a portable filename stem containing ASCII letters, digits,
periods, underscores or hyphens, beginning with a letter or digit. The generated
sidecar filename must be at most 200 characters; Windows device names are rejected.
Directory paths may be absolute, but **only the sibling filename** enters provenance.

Exports never replace either destination; the error names the existing file. `--json`
prints a receipt naming both files with their `bytes` and `sha256`. Runtime stages both complete files,
then publishes the sidecar before the GLB using exclusive hard links on the destination
filesystem. A caught failure rolls back files owned by that call and preserves existing
files. Filesystems must support hard links. This is not a crash/power-loss transaction:
an interrupted process can leave a complete orphan sidecar. Remove that orphan or choose
fresh output names before retrying. A partial GLB is never published by this path.

## MCP

```js
kiln_export({ collection: "project", assetId, revisionId, profile: "runtime" })
```

The shared tool registry accepts `editable` (default) or `runtime`. Runtime returns
descriptors for `runtime.glb` and `runtime.kiln-metadata.json`, including byte sizes
and `kiln://assets/...` resource URIs. Read them through MCP `resources/read`.
These resources are derived from the pinned revision on demand, without persisting
a new revision. The local viewer host also serves those resource filenames through
its existing `/files/` endpoint. The local viewer offers **Original GLB** and
**Runtime GLB**, plus a separate **Runtime metadata** download when that export is
ready. Keep the metadata's filename unchanged next to `runtime.glb`. Opened editable
ZIPs support the same export in the browser; a loose GLB retains its original download.

The public gallery also offers both GLBs and the matching metadata. Its sidecar
identifies the gallery asset and exact source/GLB hashes; the program download is
separate. Neither GLB contains the complete editable bundle. Gallery examples are
historical showcases and may still contain modeling defects.

Runtime results do not reuse configured canonical download URLs: those would deliver
the wrong GLB. Client support for saving MCP resources varies. Use the local CLI pair
when the client cannot save them. No binary data is put into tool text.

## TypeScript library

```ts
import { exportAssetGlb } from '@instruktlabs/kiln/asset-export';

const record = await library.read('project', assetId, revisionId);
const output = await exportAssetGlb(record, {
  profile: 'runtime',
  metadataFileName: 'mech.kiln-metadata.json',
});
if (output.profile === 'runtime') {
  // Save output.glb as mech.glb and output.metadata.bytes under output.metadata.name.
  // The helper performs no filesystem writes or network requests.
}
```

Omitting `profile` returns the exact canonical GLB bytes. Runtime verifies the saved
file inventory and hashes, validates the GLB chunk table, and returns deterministic
bytes for the same record and sibling filename. It does not serialize through a new
glTF exporter or decode/re-encode textures.

## What runtime changes

Only `scenes[].extras.kilnReviewClipsV1` is moved into the JSON sidecar. It contains
Kiln's authored animation review vocabulary, including advisory tracks that might not
have valid native glTF targets. Native `animations` remain authoritative for playback.
The sidecar retains each source scene index and its original review object.

The profile preserves glTF hierarchy, node names, sockets, transforms, mesh topology,
materials, textures, skins, morph targets, native animation channels, and application
extras. Every chunk after JSON, including the BIN chunk, is copied byte for byte.
JSON values are preserved outside the named review field and the added provenance
record. Existing metadata is **not** generally scrubbed, so user-authored extras can
still contain information the author put there. The new provenance fields introduce
no local paths, source text, build paths or provider information.

Assets with no review clips still receive the provenance link and an empty sidecar
scene list; their GLB can grow slightly. This is not geometry optimization, compression,
mesh merging, texture compression, or an FPS improvement. Measure actual delivery size
and target-scene performance separately.

## three.js runtime target

`--target three` (runtime profile only) derives a GLB for a three.js application:

```sh
node kiln.mjs export ASSET_ID REVISION_ID --profile runtime --target three --out door.glb
# door.glb
# door.kiln-metadata.json   (version kiln.runtime-metadata.v1, target "three", delivery {...})
```

```ts
import { deliverThreeRuntimeGlb, exportAssetGlb } from '@instruktlabs/kiln/asset-export';

const output = await exportAssetGlb(record, { profile: 'runtime', target: 'three' });
// Or derive from any Kiln GLB without a saved record:
const { glb, delivery } = await deliverThreeRuntimeGlb(bytes, { ktx2Encoder });
```

What it does, in order:

1. Identical accessors are merged. Under each node marked by `repeatInstances(parent)`,
   direct children with the same mesh content (accessors, material, mode) and no
   children, roles, extras, skin, morph weights or hidden flag become one node
   `<parent>_Instances` with `EXT_mesh_gpu_instancing`.
2. Each collider's proxy mesh moves to a child `<collider>_Proxy`, so the collider node
   keeps its authored transform (its scale is the collider size).
3. Vertices are reordered for compression, then quantized with `KHR_mesh_quantization`
   per mesh: position 14 bits, normal 10, texcoord 12, colour 8, weights 8.
   Underscore attributes such as `_EDGE` and `_CAVITY` are **not** quantized and stay
   FLOAT. Buffers are written with `EXT_meshopt_compression` (required).
4. Textures become KTX2 (`KHR_texture_basisu`) only when the library caller passes a
   `ktx2Encoder`; Kiln ships none, so the CLI reports `ktx2: { status: 'skipped' }` and
   textures stay PNG or JPEG.

Roles and kit extras, hidden collider nodes (`KHR_node_visibility`), anchors, ports and
`MSFT_lod` chains are kept. The sidecar `delivery` block states what a consumer needs:

| Field | Meaning |
| --- | --- |
| `extensionsUsed`, `extensionsRequired` | The derived GLB's extension sets |
| `quantization` | Bits per attribute class; `customAttributes: 'float32'` |
| `nodeScale` | Every node whose matrix now carries a dequantization `{ scale, offset }`, its `localScale`, and whether the mesh moved to a child (`meshMovedToChild`, `authoredNode`) |
| `colliderProxies` | Collider node and proxy child paths |
| `customAttributes` | Each underscore attribute, its mesh count, `FLOAT`, not normalized |
| `instancing` | Each batch node, its mesh, count and instance names in order |
| `ktx2` | `encoded` or `skipped` with the texture count and reason |
| `preserved` | Counts of LOD chains, hidden nodes, colliders, anchors, ports and kit modules |

Quantization stores positions as normalized integers and moves the metre scale onto
the node: read geometry through the node's world matrix. A loader needs the meshopt
decoder; with three.js:

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

await MeshoptDecoder.ready;
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
```

three's `GLTFLoader` keeps unknown node extensions in `userData.gltfExtensions`
(`KHR_node_visibility`, `MSFT_lod`) and lowercases custom attributes (`_edge`).
Kiln's tests load the derived GLB from both converters this way. On a very small asset
the extension JSON can outweigh the saved geometry; compare real assets.

## Pointer and hash contract

The runtime GLB contains this record in `asset.extras.kilnProvenanceV1`:

```json
{
  "version": "kiln.provenance.v1",
  "profile": "runtime",
  "metadata": {
    "uri": "mech.kiln-metadata.json",
    "sha256": "sha256:<64 lowercase hexadecimal characters>"
  }
}
```

The sidecar uses version `kiln.runtime-metadata.v1`:

```json
{
  "version": "kiln.runtime-metadata.v1",
  "source": {
    "assetId": "a_example",
    "revisionId": "r_example",
    "glbSha256": "sha256:<canonical GLB hash>",
    "sourceSha256": "sha256:<source file hash, when available>"
  },
  "scenes": [
    { "index": 0, "kilnReviewClipsV1": { "version": 1, "clips": [] } }
  ]
}
```

The pointer hash covers the **exact UTF-8 sidecar bytes**, not reserialized JSON. The
sidecar points back to the canonical input GLB hash, not the derived runtime GLB hash,
so there is no circular hash dependency. IDs and hashes let a tool locate and verify
the corresponding editable revision; they are integrity/provenance data, not signatures
or authenticated authorship. The sidecar deliberately does not embed the full manifest,
source or build record.

The URI is informational, not a glTF buffer/image URI. Kiln does not automatically
fetch it or execute its contents. Standard glTF playback works without the sidecar,
including offline or after downloading only the GLB. A tool that explicitly reads it
should verify the byte hash and version before using the data. Deploy both files together
to retain the review provenance; keep the filename or regenerate the export.

An existing `asset.extras.kilnProvenanceV1`, or non-object `asset.extras`, causes runtime
export to fail instead of overwriting data. This also rejects applying runtime twice.
Export again from the canonical saved revision. An already-runtime GLB can still be
copied with the editable/default byte-preserving profile, but that does not restore
source or missing review metadata. Unknown versions of the owned review field fail
explicitly rather than being stripped.

## Boundaries

Draft renders, `renderGLB`, `kiln_render`, `save`, collection files, editable bundles,
review tooling, and current exporter backend defaults are unchanged. Use canonical
assets for Kiln's complete review vocabulary; runtime GLBs retain only native playback
unless a separate consumer explicitly uses the sidecar. This feature is independent
of exporter backend qualification and optional geometry/texture compression.

## Agent delivery checklist

1. Read the request and select the profile for the actual delivery. Use the normal
   converter unless the task calls for an explicit experimental comparison. Report
   the converter actually used; changing a setting alone is not evidence of a rebuild.
2. Save the accepted `programRef` with `kiln_save`, and retain its exact collection,
   asset ID and revision ID. Export that pinned revision. An existing imported GLB
   does not acquire editable source through either profile.
3. Keep the editable ZIP when source is available. For runtime delivery, save the
   GLB and the named sidecar without renaming or reserializing the sidecar. The CLI
   writes the pair; MCP resource delivery depends on the host's download support.
4. Verify that the runtime GLB loads and its native animations play independently.
   Verify the sidecar filename and byte hash when checking provenance. Use the
   canonical asset for Kiln's full review workflow; standard loaders do not fetch
   the sidecar or restore missing source.
5. Report the files, measured sizes, checks performed and remaining limits. A smaller
   GLB does not establish lower draw calls, texture memory or higher frame rate.

[Qualification results and repeatable local dogfood](https://github.com/instruktlabs/kiln/blob/main/docs/evaluation/export-profiles.md)
cover generated source, CLI/MCP/HTTP delivery, native playback and a full Jaeger asset.
