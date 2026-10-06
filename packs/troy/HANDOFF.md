# Continue Troy locally

The maintained scene source is [scenes/packages/troy](../../scenes/packages/troy/README.md)
in this repository. Follow its clean-checkout installation, `hydrate` and `dev`
instructions. Edit `web/` locally; the preview serves maintained source first and
verified GLBs/banks from the ignored runtime-data cache. No private author workspace
or Kiln server is needed for scene development. The current runtime pin is
`troy-20261005-07`; a changed pin requires rehydration.

Asset authoring and rebaking are separate tasks. Use a live Kiln asset workspace
and the exact saved source/material inputs supplied by the Editable downloads and
pack resources. The original private `troy-expansion/scene`,
`troy-character-repair-2026-10-04/ws` and `troy-refine/ws` locations preserve authoring
history; they are not dependencies for running the portable public scene.
Do not modify historical bank inputs without rebaking and verifying their hashes.

Public routes are `/scenes/troy/`, `/packs/troy/` and `/gallery/troy/<slug>/`.
The site stages the sealed artifact in `site/src/data/troy-delivery.json`.
Assets are CC0 and browser scene code is MIT. Captures are actual scene frames and
GLB renders. Use the normal scene preview and downloads; the private
`/reviews/troy/` prototype is retired.

[STATUS.md](STATUS.md) and the [current backlog](../../docs/backlog.md) describe the
delivered scope and known limits. Dated reviews retain their original candidate
identity. Keep the hub quiet before measuring an exact candidate at 1440x900 balanced.
This computer owns source and development. Recovery parents, rejected candidates
and saved revisions remain preserved; broad cleanup is a separate task.
