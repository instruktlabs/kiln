# Asset sources and downloads

Farm, Vehicles, Golden Gate Bridge, Foundry Floor and Troy use two download choices:

- **Runtime assets:** models ready for scenes and applications, with embedded resources
  and the existing animation, part-name and detail-tier contracts.
- **Editable assets:** saved models, Kiln programs, editing metadata, required materials
  and included earlier revisions. Import a selected revision ZIP into Kiln's Library
  to continue editing. The outer ZIP lists its contents in `delivery.json`.

Golden Gate Bridge remains a standalone asset. Its directory here is a source organization
choice, not membership in a pack or project. Gallery choices are independent of archives.

`sources/project/<asset>/<revision>/` contains source programs and saved manifests.
`materials/<material>/<revision>/manifest.json` retains the exact parameters, procedural
recipes and map hashes. Canonical generated model bytes, material maps, previews and
download archives are hydrated only when requested; they are not needed for ordinary
engine installation or testing. Earlier revision records are included where their saved
bytes exist. An unavailable ancestor is declared inside the download, never reconstructed
from its parent identifier alone.

The public release inventory is `site/src/data/asset-delivery.json`. Large generated
downloads are hosted on Cloudflare R2. Lightweight authored sources and scene code stay
in this repository. Editable archives retain canonical metadata even when the website
does not show that bookkeeping.

## Restore one source group

Create a separate Kiln asset workspace using the maintained setup skill before authoring.
From `site/`, hydrate only the requested group into that workspace:

```sh
node scripts/hydrate-asset-sources.mjs --group vehicles --output /path/to/my-assets
```

The group can be `farm`, `vehicles`, `golden-gate-bridge`, `foundry-floor` or `troy`.
The script verifies the sealed downloads and complete included revision inventory before
writing records. Logical collection `project` is workspace storage at `assets/kiln/`,
not project membership. Each record carries its required material resources. To inspect
or rebuild a selected revision in the workspace:

```sh
node kiln.mjs assets --collection project
node kiln.mjs asset ASSET_ID REVISION_ID --collection project --rebuild --out rebuilt.glb
```

Use the exact IDs listed by the inventory. A source rebuild still needs the matching
Kiln engine/exporter version; the saved manifest retains those options. Downloaded
canonical GLBs remain available independently of rebuilding.

## Regenerate downloads locally

`site/scripts/stage-asset-delivery.mjs` builds deterministic archives from saved revision
records. It follows actual parents, verifies their file seals, includes required material
resources, and preserves each selected runtime pin. It writes generated payloads to an
ignored mirror and the lightweight inventory to the site. A release coordinator uploads
those immutable objects before publishing links. The script does not upload anything.

```sh
node scripts/stage-asset-delivery.mjs --mirror .localdata/asset-delivery \
  --commons /path/to/commons-sources --troy /path/to/troy-sources
```

The supplied roots may be clean workspaces hydrated with the first command, so delivery
does not depend on the original authors' private filesystem paths. Existing runtime bytes
can come from `--runtime-mirror DIR`; `--fetch-runtime` explicitly permits fetching the
current pinned public bytes. Normal engine setup never performs those downloads.
