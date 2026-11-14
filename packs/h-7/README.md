# H-7 asset delivery

The H-7 collection is the set of models made in Kiln for the H-7 game demo: the Skitterer bug with its low-detail model and corpse, the hive fissure, the salt pan terrain kit, the outpost kit and the Heavy Walker Mech with its cockpit. [The selection](selection.json) lists each saved revision with its model and source hashes. The collection has no scene on this site; the game is a separate build and none of its code is here.

The gallery loads each revision's saved `asset.glb` as it is. The editable downloads wrap standard Kiln revision ZIPs with the licence and the notices. An entry with `partOf` has no gallery page of its own: its downloads appear on the page of the card it names.

[Rights](rights.json) pins each listed revision with its exact saved model and source hashes and binds the owner's CC0 designation to those files. The models draw their own textures, so no third-party resources are listed. [Names](names.json) holds each asset's public name and description.

## Prepare the delivery

From `site/`, stage the downloads from the directory that holds the authoring workspaces, then render the posters:

```sh
bun scripts/stage-h7-gallery.mjs --workspace-root /path/to/h-7-assets --mirror .localdata/h-7-release
bun scripts/rig-posters.mjs h-7 --mirror .localdata/h-7-release --service http://127.0.0.1:8000 --engine /path/to/compatible-kiln
```

The stager refuses to stage while the owner statement in `rights.json` is still the placeholder; `--allow-pending-statement` stages a local review copy anyway. It records download pins and an upload list without uploading files.

To add an asset: add it to `selection.json`, its rights pin here, its name and description to `names.json` and, unless it is `partOf` another card, its `/gallery/h-7/<id>/` entry to `site/src/data/gallery-taxonomy.json`, then rerun both commands.

Restore the editable revisions from the staged mirror:

```sh
node scripts/hydrate-asset-sources.mjs --group h-7 --mirror .localdata/h-7-release --output /path/to/review-workspace
```
