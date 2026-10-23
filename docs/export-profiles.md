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

Runtime requires GLB format and an output ending in `.glb`, except `--textures external`,
which writes `.gltf` (see runtime textures). Bundle/source formats
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
the wrong GLB. Client support for saving MCP resources varies. No binary data is put
into tool text. To write files, configure an export root (below) or use the local CLI.

### Writing files: `kiln_export_to`

When the host sets `KILN_EXPORT_ROOT` on the MCP server, it also advertises
`kiln_export_to`. Without the variable the tool list and `kiln_export` are unchanged.
Discovery capabilities report it as `assets.exportTo`, which is `null` when the tool is
absent and never shows the absolute root. Generated Codex workspaces forward the
variable from the shell that starts Codex, as the other harnesses' servers inherit it.

```js
kiln_export_to({ collection: "project", assetId, revisionId, path: "game/door.glb" })
// game/door.glb
// game/door.kiln-metadata.json
kiln_export_to({ assetId, revisionId, path: "web/door.glb", target: "three" })
kiln_export_to({ assetId, revisionId, path: "archive/door.glb", profile: "editable" })
```

- `profile` is `runtime` (default) or `editable`, which writes the exact saved GLB only;
  ZIP and source stay resources. `target: "three"` requires `runtime`, as in the CLI,
  and produces the same bytes as `export --profile runtime --target three` with the
  same file name.
- `path` is relative to the root: forward slashes, at most 240 characters and 8
  segments, each segment portable (the filename-stem rule above), ending in `.glb`.
  `..`, absolute, drive-letter and UNC paths, backslashes and Windows device names
  are refused. The sidecar name is derived, `<stem>.kiln-metadata.json`, beside it.
- Existing files are never replaced, through the same writer as the CLI. Directories
  that are symlinks or junctions are refused; missing directories are created.
- The receipt is the CLI `--json` receipt with paths relative to the root:
  `ok`, `collection`, `assetId`, `revisionId`, `profile`, `target?`, `format: "glb"`,
  `drawDiagnostics` and `files[{ kind, path, bytes, sha256 }]`. No absolute path or
  file bytes appear in tool text.

The root is host configuration, never a tool input: an existing absolute directory
(on Windows a drive or UNC path) that neither contains nor sits inside a collection
directory or the workspace `.kiln/`. It is a destination, not project membership.
Render output has no file destination: delivery starts from a saved revision.

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
   FLOAT. Buffers are written with `EXT_meshopt_compression` (required) unless the
   caller passes `compression: 'none'` (CLI `--compression none`): then buffers stay plain,
   no Meshopt decoder is needed, and quantization, instancing and everything below stay.
4. Textures become KTX2 (`KHR_texture_basisu`, required, no PNG fallback) only with
   `--ktx2` or a library `ktx2Encoder`; otherwise the sidecar reports
   `ktx2: { status: 'skipped' }` and textures stay PNG or JPEG. See
   [KTX2 textures](#ktx2-textures).

Roles and kit extras, hidden collider nodes (`KHR_node_visibility`), anchors, ports and
`MSFT_lod` chains are kept.

A loader that never selects a level still downloads every lower one. `maxLod: n` (CLI
`--max-lod n`) keeps LOD0 to LODn of each chain in the default scene and removes the
rest, with the meshes, materials and textures only they used; `0` keeps LOD0 alone and
removes `MSFT_lod`. Thresholds in `MSFT_screencoverage` are cut to the kept levels. When a
chain loses levels, budget tiers above `n` leave the shipped `kilnBudgetV1` declaration,
since they would otherwise be measured against fewer levels; the sidecar lists them as
`budgetTiersOmitted`. A dropped level that an animation targets is refused. Kiln still
does not select a level at runtime.

The sidecar `delivery` block states what a consumer needs:

| Field | Meaning |
| --- | --- |
| `extensionsUsed`, `extensionsRequired` | The derived GLB's extension sets |
| `compression` | `{ extension: 'EXT_meshopt_compression', method: 'quantize' }`, or `{ extension: 'none' }` |
| `quantization` | Bits per attribute class; `customAttributes: 'float32'` |
| `nodeScale` | Every node whose matrix now carries a dequantization `{ scale, offset }`, its `localScale`, and whether the mesh moved to a child (`meshMovedToChild`, `authoredNode`) |
| `colliderProxies` | Collider node and proxy child paths |
| `customAttributes` | Each underscore attribute, its mesh count, `FLOAT`, not normalized |
| `instancing` | Each batch node, its mesh, count and instance names in order |
| `ktx2` | `encoded` or `skipped` with the texture count and reason; `encoder` (name, version, Basis WebAssembly hash and every setting) when the encoder declared it |
| `lod` | With `maxLod` only: `{ maxLod, chains: [{ path, levels, dropped }], budgetTiersOmitted }`, where `levels` counts the kept levels and `dropped` names the removed ones |
| `preserved` | Counts of LOD chains, hidden nodes, colliders, anchors, ports and kit modules |

Quantization stores positions as normalized integers and moves the metre scale onto
the node: read geometry through the node's world matrix. With Meshopt compression (the
default) a loader needs the meshopt decoder; with three.js:

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

await MeshoptDecoder.ready;
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
```

With `compression: 'none'`, `new GLTFLoader().parseAsync(buffer, '')` loads it without a
decoder. three's `GLTFLoader` keeps unknown node extensions in `userData.gltfExtensions`
(`KHR_node_visibility`, `MSFT_lod`) and lowercases custom attributes (`_edge`).
Kiln's tests load the derived GLB from both converters this way. On a very small asset
the extension JSON can outweigh the saved geometry; compare real assets.

## KTX2 textures

`--ktx2` (with `--target three`) encodes every PNG, JPEG or WebP image to KTX2 through
the optional peer `ktx2-encoder@0.6.0`. Kiln does not install or bundle it; add it to the
installation that runs `kiln`:

```sh
npm install ktx2-encoder@0.6.0
node kiln.mjs export ASSET_ID REVISION_ID --profile runtime --target three --ktx2   --textures manifest --out door.glb --json
```

Without the peer, `--ktx2` fails and names that install command. Another installed
version is refused, because the settings below are qualified on 0.6.0. The mode follows
the slot: ETC1S with the sRGB transfer function for base colour and emissive, UASTC with
Zstandard supercompression for normal, metallic-roughness, occlusion and other linear
maps (normal maps also use the encoder's normal-map preset). Every level gets mipmaps. An
image used by both an sRGB and a linear slot stops the export, because one encoding
cannot serve both; give each slot its own image.

`delivery.ktx2.encoder` records `name`, `version`, `basisWasmSha256` and the exact
`settings` per profile, and the `--json` receipt repeats `delivery.ktx2`. Because the
sidecar hash is stamped into the GLB, these facts are bound to the delivered bytes. With
`--textures manifest`, each entry's `sha256` is the KTX2 bytes and `sourceSha256` the
image before encoding; a library pin is matched on the pre-encode bytes. Encoding the same
image twice gives identical bytes in Kiln's tests; if a platform ever differs, the
recorded version and settings are the contract, and the only cost is a new hash.

Encoding runs inside the same document as the rest of the target, so `MSFT_lod` chains,
roles and atlas provenance survive: every atlas reference is rebound to its KTX2 bytes and
MIME type and validated as import will validate it. The library form is:

```ts
import { createKtx2Encoder, exportAssetGlb } from '@instruktlabs/kiln/asset-export';

const output = await exportAssetGlb(record, {
  profile: 'runtime',
  target: 'three',
  ktx2Encoder: await createKtx2Encoder(),
});
```

A host may pass its own `ktx2Encoder` instead. It receives `{ image, mimeType, name,
colorSpace, slot }`, must return bytes that start with the KTX2 identifier, and may carry
an `identity` property that Kiln records as `delivery.ktx2.encoder`.

A consumer needs `KTX2Loader` (with its Basis transcoder files served by the application)
in addition to the meshopt decoder:

```ts
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
```

Licences: `ktx2-encoder` is MIT. Its package bundles a precompiled Basis Universal
encoder (Apache-2.0, Binomial LLC) as WebAssembly, which links Zstandard (BSD-3-Clause)
and MIT-licensed image loaders, and the package ships `THIRD_PARTY_NOTICES.md` reproducing
the Basis Universal NOTICE. Kiln (MIT) only imports the peer that the user installed; it
redistributes none of that code, so the notice travels with the installed package. Anyone
who redistributes `ktx2-encoder` itself, for example inside a self-contained archive, must
keep that notice file. KTX2 output is data produced by the encoder, not a copy of it.

## Runtime textures: manifest and shared files

Runtime GLBs embed every texture, so forty assets that use one library material carry
forty copies of its maps. Two opt-in choices let a host share them. Neither is the
default: without `--textures`, the GLB, sidecar and `--json` receipt bytes are unchanged.

**Manifest.** `--textures manifest` (runtime profile, with or without `--target three`)
adds `textures[]` to the sidecar. The GLB is unchanged apart from the provenance hash of
that larger sidecar.

```sh
node kiln.mjs export ASSET_ID REVISION_ID --profile runtime --textures manifest --out wall.glb
```

```ts
const output = await exportAssetGlb(record, { profile: 'runtime', textures: 'manifest' });
```

One entry per glTF image, sorted by image index:

| Field | Meaning |
| --- | --- |
| `image` | glTF image index |
| `sha256`, `bytes`, `mimeType` | Identity of the exact delivered bytes |
| `width`, `height` | Pixel size read from the image header |
| `colorSpace` | `srgb` when a base colour or emissive slot uses the image, otherwise `linear` |
| `sourceSha256` | The bytes before KTX2 encoding, only when encoding changed them |
| `material` | `{ pin: { resourceId, revisionId, sha256 }, slot }`, only when the pre-encode bytes exactly equal a map in the record's saved material closure (`materials.kiln.json`). Never inferred from names |
| `uri` | External layout only: the image file relative to the `.gltf` |

Equal `sha256` means equal bytes, so a host can deduplicate images across assets on that
key without decoding a GLB. Library textures keep their encoded bytes in the GLB, so two
assets that use one library map report the same `sha256` and the same `material.pin`.

**External textures.** `--textures external` (requires `--target three` and `--out`
ending in `.gltf`) writes standard JSON glTF with content-addressed images instead of a
GLB, and implies the manifest with a `uri` on each entry:

```sh
node kiln.mjs export ASSET_ID REVISION_ID --profile runtime --target three \
  --textures external --out assets/wall.gltf --json
# assets/wall.gltf               (asset.extras.kilnProvenanceV1 points at the sidecar)
# assets/wall.bin
# assets/wall.kiln-metadata.json
# assets/textures/<sha256>.png   (or .jpg, .webp, .ktx2)
```

The file name of each texture is the hex SHA-256 of its exact bytes. Exports into one
folder share those files:

- Textures are published first, then the sidecar, the `.bin` and the `.gltf` last.
- An existing texture with the same bytes is reused and never rewritten; the receipt
  marks it `"reused": true`. A file with that name but different bytes stops the export
  before any model file is published.
- The model files keep the never-replace rule: an existing `.gltf`, `.bin` or sidecar
  stops the export before any texture is written.
- A failed export rolls back its model files but never removes a texture, even one it
  created, because a concurrent export may already reference it. A leftover texture is
  harmless.

The library form returns `layout: 'gltf'` with `gltf`, `buffers`, `textures` and
`metadata` to write, plus the equivalent embedded `glb` for inspection:

```ts
const output = await exportAssetGlb(record, {
  profile: 'runtime',
  target: 'three',
  textures: 'external',
  gltfFileName: 'wall.gltf',
  metadataFileName: 'wall.kiln-metadata.json',
});
```

three.js loads the `.gltf` and resolves `wall.bin` and `textures/...` relative to it:
`new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/wall.gltf')`.
Plain `--profile runtime` keeps `.glb` only, because that profile copies the binary chunk
byte for byte. Kiln's tests validate the `.gltf` with `gltf-validator` and load it through
`GLTFLoader`. MCP `kiln_export` does not offer these options.

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
source or build record. Optional fields appear only when requested: `target` and
`delivery` with `--target three`, `textures` with `--textures`. In the external layout the
same record sits in the `.gltf` file's `asset.extras`.

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
   and, when the host sets an export root, `kiln_export_to` write the pair; other MCP
   resource delivery depends on the host's download support.
4. Verify that the runtime GLB loads and its native animations play independently.
   Verify the sidecar filename and byte hash when checking provenance. Use the
   canonical asset for Kiln's full review workflow; standard loaders do not fetch
   the sidecar or restore missing source.
5. Report the files, measured sizes, checks performed and remaining limits. A smaller
   GLB does not establish lower draw calls, texture memory or higher frame rate.

[Qualification results and repeatable local dogfood](https://github.com/instruktlabs/kiln/blob/main/docs/evaluation/export-profiles.md)
cover generated source, CLI/MCP/HTTP delivery, native playback and a full Jaeger asset.
