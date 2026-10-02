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
  Three.js converter described in the engine handoff guide (`references/engine-handoff.md`
  in the `kiln-qa-asset` skill).
  Preserve the baseline and check the result in the destination importer.

### Converter and delivery profile are separate settings

| Setting | When it applies | Default | Optional choice | Why it exists |
| --- | --- | --- | --- | --- |
| GLB converter | Source render/build | Established converter (`legacy`) | Experimental Three.js converter (`three`) | Compare preservation of features such as skin/morph data, vertex colors, extra UV sets and material extensions |
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
Meshopt or KTX2 compression. Those require separate choices and validation.

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
its existing `/files/` endpoint. Existing viewer download buttons retain editable behavior.

Runtime results do not reuse configured canonical download URLs: those would deliver
the wrong GLB. Client support for saving MCP resources varies. Use the local CLI pair
when the client cannot save them. No binary data is put into tool text.

## TypeScript library

```ts
import { exportAssetGlb } from '@kiln/engine/asset-export';

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

[Qualification results and repeatable local dogfood](https://github.com/matthew-kissinger/kiln/blob/main/docs/evaluation/export-profiles.md)
cover generated source, CLI/MCP/HTTP delivery, native playback and a full Jaeger asset.
