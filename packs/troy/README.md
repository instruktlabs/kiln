# Troy pack

Troy contains 21 CC0 assets and a playable Bronze Age coast, city and battlefield. The public scene lets visitors explore the city or fight as Achilles or Hector. Source code and Three.js retain MIT licensing.

`assets/<slug>.kiln.js` and the accompanying manifests identify the authored revisions. Four heroes/infantry masters use the final simple hands and equipment. Vegetation and horse sources are included. Per-asset material records preserve the pinned resources needed to rebuild; the original shared `materials/` and `project/` records remain available.

`inventory.json` names every current revision, model hash and public model/poster URL. The website pins a sealed scene archive in `site/src/data/troy-delivery.json`; its normal build verifies the archive and every enclosed file before staging. The archive contains editable browser modules, models, pictures and Three.js, and runs with `node serve.mjs`. Authoring sources in this folder require a separate Kiln workspace.

The earlier `scene/recompose.mjs`, `r2-manifest.json` and project records describe the original reference composition and October 2 deliveries. They remain historical inputs, not the current interactive scene.

See `HANDOFF.md` for local development and `STATUS.md` for validation and performance limits.
