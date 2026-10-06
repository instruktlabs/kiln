# Optional material library

The workspace library holds immutable, explicit material revisions. It is separate from the
small embedded texture catalog. Source images are optional resource packs, not npm package data.
An evaluator receives only the complete pinned records selected by its host. Authored source can
resolve their approved resource IDs, but cannot read paths, fetch URLs, or supply resolver code.

`kiln_material` is advertised when a host supplies a material library. Its `presets` action lists
five offline starting points: `warm-brick`, `wood-grain`, `brushed-metal`, `woven-fabric`, and
`coarse-soil`. Each recipe produces base color, OpenGL normal, and packed metallic/roughness maps.
They are synthetic starting points with stated physical repeat scales, not measured scans.

Create one with an explicit seed, creator, and a license the caller is authorized to apply:

```json
{
  "action": "create-preset",
  "presetId": "wood-grain",
  "seed": 17,
  "size": 256,
  "creator": "Your project",
  "license": {
    "spdx": "CC0-1.0",
    "url": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": ""
  }
}
```

For CLI authoring, save the same JSON above as `wood-options.json`, then use:

```sh
node kiln.mjs material create-preset --file wood-options.json
node kiln.mjs material get RETURNED_MATERIAL_ID RETURNED_REVISION
node kiln.mjs material export RETURNED_MATERIAL_ID RETURNED_REVISION --out wood-payload.json
```

Copy the returned `portableSpec` into authored source and use
`compilePortableMaterialSpecV2(portableSpec)` with the exact dependency pin.
Custom draft creation uses CLI `material procedural --file draft.json`, corresponding
to MCP `create-procedural`. These paths need no imports from internal `dist/` files
or extra TypeScript loader. The public host APIs below are for a configured TypeScript
toolchain; ordinary Node cannot directly execute TypeScript inside `node_modules`.

`list` returns compact summaries and accepts a `tag`. `get` requires `materialId` and `revisionId`
and returns provenance plus a code-ready `portableSpec`. `create-procedural` accepts an editable
draft using the same bounded layer recipes as the existing procedural compiler. An optional
`derive: {"kind":"normal-from-height","strength":2}` on a normal map converts the recipe's
height pixels through the existing wrapped normal derivation. `import` accepts a complete
normalized payload. None of these operations acquires source images from a provider.

Curated resource packs are complete normalized payloads: maps, recipes and source/license
provenance, ready for explicit import. They are not npm package contents or public downloads;
use a pack whose source and license you can verify, such as one exported from another
workspace with `material export`:

```sh
node kiln.mjs material import --file /path/to/wood-pack.json
```

Use the selected payload's actual local path. Importing it does not create a project or fetch
its original source URLs. The five shipped procedural presets remain available without any
resource pack.

Pin the returned material ID and revision hash before using its resource IDs. A project is
optional: pass a pin array as MCP `materialDependencies` or CLI `--materials pins.json` for
an individual operation, or put the array in a project's `materialDependencies` for shared use.
The pin's `resourceId` is the material ID; its `revisionId` and `sha256` both equal the
manifest's immutable `revisionId`. `compilePortableMaterialSpecV2(portableSpec)` then creates the
material inside authored source. The host supplies complete map bytes through `materialResources`
before build-cache lookup, including when evaluation uses the default subprocess.

Editable standalone asset ZIPs carry the saved dependency closure in `materials.kiln.json`;
project ZIPs carry resources for their selected saved inventory as well as the current lock.
Both preserve normalized maps, recipes and provenance without fetching original source URLs.
Runtime GLBs already embed their rendering resources. An editable export fails clearly if a
declared library dependency is unavailable; creating a project is not a workaround or requirement.

Physical repeat scale is recorded metadata. The author still chooses UV scale appropriate to the
mesh. Repeating a one-meter material across a ten-meter wall requires corresponding UV repeats;
recording meters does not silently change geometry or UVs.

## Host API and portable export

```ts
import { FileMaterialLibrary, createMaterialLibraryPayload,
  decodeMaterialLibraryPayload } from '@instruktlabs/kiln/material-library/node';
import { createMaterialPresetDraft } from '@instruktlabs/kiln/material-presets';
import { createMaterialRecordV1 } from '@instruktlabs/kiln/material-library/node';

const library = new FileMaterialLibrary('/workspace/.kiln/materials');
const record = await createMaterialRecordV1(createMaterialPresetDraft('wood-grain', {
  seed: 17,
  creator: 'Your project',
  license: { spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: '' },
}));
await library.import([record]);

// The JSON payload includes every normalized PNG, recipe, source hash and license record.
const payload = await createMaterialLibraryPayload([record]);
const json = JSON.stringify(payload);
// Transfer json as a local optional resource pack. The receiver needs no source URL access.
await anotherLibrary.import(await decodeMaterialLibraryPayload(JSON.parse(json)));
```

`FileMaterialLibrary` takes the storage directory itself. `read(materialId, revisionId)` verifies
stored bytes before returning a complete record. Import validates every supplied record before
writing and stores each revision atomically. Reimporting an identical revision is idempotent.
Existing revisions cannot be replaced with different data.

External normalized maps must be PNG. Base color and emissive use sRGB; normal, occlusion and
packed channels use linear data. Normal maps use OpenGL positive Y. Packed maps preserve
R=occlusion, G=roughness, B=metallic. Binding a packed image only to metallicRoughness consumes
green and blue; occlusion must be separately bound if wanted. Metalness/roughness factors multiply
their texture channels, so use factors of one when the maps should control the full range.

Every external map names an original source file with its hash and size. The source includes
provider, creator, URL and license. Derivations record the actual normalization steps and tool
versions. Procedural maps retain canonical recipes, seeds, recipe hashes, decoded pixel hashes
and encoder version. The revision hash covers this metadata and the normalized map hashes.
Changing bytes, seed, derivation, scale, or provenance creates a different revision.

Payloads are bounded to 16 records, 16 MiB encoded PNG data and 16 million decoded pixels. Split
larger libraries into task or theme packs; load only the operation's pinned resources. Imported
records have additional per-map and per-record bounds. Arbitrary scripts, accessors, functions,
network references used as loaders, and executable recipes are rejected.

Acquisition and aesthetic curation stay host-side. Verify the asset's license separately from API
terms, retain originals and source/license snapshots outside the engine package, normalize maps,
then qualify both embedded GLB output and material-faithful previews. A valid hash or passing
glTF validator establishes integrity and structure, not suitability for a project or a target
game engine.
