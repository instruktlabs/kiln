# Continue Troy locally

Scene source: `C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion/scene`. Character authoring workspace: its sibling `troy-character-repair-2026-10-04/ws`; original authoring revisions remain in `troy-refine/ws`. Engine and public site: this repository.

Start with `review/troy-expansion/LOCAL-START.md` in the private repository. Its platform helper selects the local engine, pinned Node and browser. Author assets in a separate workspace; keep controllers, terrain and optimization derivatives in the scene. Current banks are infantry-v5 and archer-v9, with exact master pins in `scene/web/inputs.json`.

Public routes are `/scenes/troy/`, `/packs/troy/` and `/gallery/troy/<slug>/`. The site build stages the exact sealed download from `site/src/data/troy-delivery.json`, without an author's absolute workspace path. Downloads are CC0 assets and MIT browser scene code. Captures are actual scene frames and master GLB renders.

Read `STATUS.md` and the engine's `docs/reviews/2026-10-05-troy-completion-status.md` for current evidence and limits. Keep the hub quiet before timing an identified candidate. Existing recovery parents, rejected candidates and outputs remain preserved; cleanup belongs to the separate cleanup task.
