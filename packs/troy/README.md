# Troy pack

Troy contains 21 CC0 assets and a playable Bronze Age coast, city and battlefield. The public scene lets visitors explore the city or fight as Achilles or Hector. Source code and Three.js retain MIT licensing.

`sources/<collection>/<assetId>/<revisionId>/` contains the selected authored revisions and their included history. Each record retains its source program and metadata; material recipes live in `materials/`. Restore the generated model and texture files from the matching Editable assets download with `site/scripts/hydrate-asset-sources.mjs` before opening these records in a Kiln workspace. Four heroes/infantry masters use the final simple hands and equipment. Vegetation and horse sources are included.

The flat `assets/<slug>.kiln.js` files and accompanying manifests are compatibility snapshots of the selected revisions. The original shared `materials/` and `project/` records remain available; the historical project pins do not select the latest standalone asset revisions.

`inventory.json` names every current collection-qualified revision, canonical source path, included history, model hash and public download/poster URL. Run `node site/scripts/troy-inventory.mjs` from the repository root after updating the selected delivery and scene catalog to align these references. Model and Editable assets downloads use immutable R2 URLs. The website pins a sealed scene archive in `site/src/data/troy-delivery.json`; its normal build verifies the archive and every enclosed file before staging. The archive contains editable browser modules, models, pictures and Three.js, and runs with `node serve.mjs`. Authoring sources in this folder require a separate Kiln workspace.

The earlier `scene/recompose.mjs`, `r2-manifest.json` and project records describe the original reference composition and October 2 deliveries. They remain historical inputs, not the current interactive scene.

See `HANDOFF.md` for local development and `STATUS.md` for validation and performance limits.
