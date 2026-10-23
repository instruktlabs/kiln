# Holodeck scene packs

Every Kiln asset placed in a walkable [Holodeck](https://holodeck.kilnstudio.tools/) scene,
one pack per scene. The gallery cards and pack pages link to the walkable scenes; the scene
addresses are configured in one place, [`site/src/data/holodeck-worlds.json`](../../site/src/data/holodeck-worlds.json).

| Pack | Scene source | Assets |
| --- | --- | --- |
| `holodeck-tidemark` | Tidemark Island world (revision recorded in `selection.json`); Holodeck's bundled `examples/tidemark` places the same GLB bytes | 23 |
| `holodeck-courtyard` | Courtyard world, revision 7 | 32 |
| `holodeck-cove` | Holodeck branch `claude/cove-aaa` (commit recorded in `selection.json`), the Cove quality pass | 8 |

Packs deliver final versions only: one gallery page and one download per asset. Tidemark
Island and the Courtyard still place earlier revisions of the eight Cove modules; their packs
list the Cove pack's quality-pass revisions instead, so each Cove module has one page shared
by all three packs. `selection.json` records each such placement under
`sceneStillPlacesEarlier`, and the selection checks that every final revision descends from the
revision its world places. Each download's `delivery.json` lists the parent of every revision
under `omittedParents`: earlier revisions are left out by choice, not missing.

## Planned: Crescent Cove

Crescent Cove (`holodeck-worlds/tropical-island`, 48 Kiln assets at the time of writing) is
still being built. Its pack is not staged. When the island is finished, add it to
`HOLODECK_PACKS` in `site/scripts/holodeck-spec.mjs` with its asset presentation, add its world
to `select-holodeck.mjs`, and stage a new release. Its scene address is already in the map.

## Licence

The owner dedicates these assets to the public domain under
[CC0 1.0 Universal](LICENSES/CC0-1.0.txt): models, runtime metadata, saved manifests, previews
and Kiln source programs. Each download carries `LICENSE.txt` and `LICENSES/CC0-1.0.txt`.
Holodeck's own repository applies CC0 to its bundled GLBs and previews (`examples/`,
`public/assets/`, the non-code files under `assets/cove/`) and keeps procedural JavaScript
programs under MIT; the copies of those programs in these packs are dedicated CC0 by the same owner.
Kiln and Holodeck software keep their own licences.

## Records

- `selection.json` freezes each pack's exact collection, asset and revision IDs and the
  SHA-256 of every saved manifest, source program and canonical GLB. Every placed scene GLB is
  byte-identical to the canonical `asset.glb` of the revision its world names.
- `sources/project/<asset>/<revision>/` keeps each source program and saved manifest.
- `site/src/data/holodeck.json` is the gallery catalog. Downloads and posters are pinned in
  `site/src/data/mirror-manifest.json`; posters are rendered under the `review-neutral-v1` rig
  and recorded in `site/src/data/rig-posters.json`.

## Regenerate

Every input is read-only. From `site/`:

```sh
node scripts/select-holodeck.mjs --tidemark WORLD --courtyard WORLD --holodeck HOLODECK_REPO \
  --cove-ref claude/cove-aaa --store island-trial=STORE --store holodeck-assets=STORE --store courtyard-plaza=STORE
node scripts/stage-holodeck.mjs --kiln KILN_PACKAGE_DIR --mirror .localdata/holodeck-delivery \
  --store island-trial=STORE --store holodeck-assets=STORE --store courtyard-plaza=STORE
bun scripts/rig-posters.mjs holodeck --service RENDER_SERVICE_URL --mirror .localdata/holodeck-delivery
node scripts/stage-holodeck.mjs --upload-list --mirror .localdata/holodeck-delivery
```

A store is a workspace's `assets/kiln` directory. `KILN_PACKAGE_DIR` is an installed
`@instruktlabs/kiln` package; its runtime export profile writes the runtime GLBs and metadata,
and staging verifies they keep the canonical binary. Staging writes are immutable: changed
bytes need a new release ID in `holodeck-spec.mjs`. Nothing here uploads anything.

## Publish

After release approval, upload the listed objects to the asset host, then build and deploy
the site as described in [site/DEPLOYMENT.md](../../site/DEPLOYMENT.md):

```sh
node scripts/publish-assets.mjs .localdata/holodeck-delivery .localdata/holodeck-delivery/holodeck-upload-list.json
node scripts/publish-assets.mjs .localdata/holodeck-delivery .localdata/holodeck-delivery/holodeck-upload-list.json --upload --oauth
```

The first command verifies the list offline; the second uploads and reads back every object.
