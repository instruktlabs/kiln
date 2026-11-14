# Seed Town asset delivery

The town kits are listed in [the scene inventory](../../scenes/packages/seed-town/ASSET-MANIFEST.json). The scene and the gallery load the same runtime GLBs: each is its saved revision exported with `kiln export --profile runtime --carry-shapes`, so it carries the kit's options as switchable nodes, its colours as named materials and its sizes as morph targets. Each runtime GLB names a `.kiln-metadata.json` sidecar by file name and SHA-256. The sidecar maps every option, colour and size to what carries it, and the downloads ship it beside the GLB under that name. The editable downloads wrap standard Kiln revision ZIPs with the licence and the scene's notices.

[Rights](rights.json) pins each listed revision with its exact saved model and source hashes and binds the owner's CC0 designation to those model and editable source files. The kits draw their own textures, so no third-party resources are listed. [Names](names.json) holds each kit's public name and description.

## Prepare the delivery

From `site/`, stage the scene's sealed pack first, then generate the downloads from the authoring workspace and its carried exports:

```sh
bun scripts/stage-seed-town-gallery.mjs --workspace /path/to/kiln-seed-street --mirror .localdata/seed-town-release
bun scripts/rig-posters.mjs seed-town --mirror .localdata/seed-town-release --service http://127.0.0.1:8000 --engine /path/to/compatible-kiln
```

The stager reads the carried sidecars from `<workspace>/out/carried` unless `--carried DIR` is given. It refuses to stage while the owner statement in `rights.json` is still the placeholder; `--allow-pending-statement` stages a local review copy anyway. The mirror then holds each kit's runtime GLB and sidecar, its editable download and the two aggregate packs. The stager records download pins and an upload list without uploading files.

To add a kit: pin it in `ASSET-MANIFEST.json` and restage the scene pack, add its rights pin here, its name and description to `names.json` and its `/gallery/seed-town/<kit>/` entry to `site/src/data/gallery-taxonomy.json`, then rerun both commands.

Restore the editable revisions from the staged mirror:

```sh
node scripts/hydrate-asset-sources.mjs --group seed-town --mirror .localdata/seed-town-release --output /path/to/review-workspace
```
