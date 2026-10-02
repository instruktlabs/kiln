# Troy pack: handoff for the next agent

Written 2 October 2026 by the agent that ran the v1 readiness cycle, for an agent working on the
owner's laptop. State: **in progress, unreviewed by the owner**; the engine work of the cycle is
merged, the pack is local to this folder, R2 and the private evidence repository, and nothing is
on the site.

## Where everything is

| What | Where |
| --- | --- |
| The pick records (source, manifest), materials, project, inventory | this folder (`README.md` has the table) |
| Every saved revision's GLB and preview, the material maps | public R2 bucket `kiln-assets`: `https://assets.kilnstudio.tools/troy/assets/<assetId>/<revisionId>/asset.glb` and `preview.png`; `troy/materials/<id>/<revision>/`; `r2-manifest.json` here lists each object's sha256 |
| The live Kiln workspace of the pack (project `troy`, pinned materials, every revision, retained programs) | the private repository `matthew-kissinger/kiln-dogfood-v1-readiness-2026-10`, cloned to `C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10`: `review/troy-refine/ws`; the same workspace without its build cache as `troy/workspace/troy-refine-ws-2026-10-02.zip` on R2 (sha256 `69b4fb6b35a3a08db2ac0b67b501271cdbceefb64749fe0aef9a2165ac4f75d0`) |
| The material-pass sources, render sheets and the scene recomposer | `review/troy-refine/{sources,out,scene}` in the private repository |
| Picks, alternates and what changed per asset | `picks.md` in the private repository; `findings.md` has one row per session |
| The report | `docs/reviews/2026-10-01-v1-readiness-live-sessions.md` (section 7 candidates, section 9 the owner's decisions, section 11 the follow-ups and the material pass) |
| The viewer of every session collection plus `troy-refine` | `tools/view-troy.ps1` in the private repository (port 4318; needs a runtime folder beside it) |
| The other composition, by Codex (279,332 triangles, 452 draws) | `sessions/s42-codex-scene/ws` in the private repository |

## Resume authoring

1. Clone the private repository to the path above. Its `README.md` says what is excluded and how
   to make it again (runtime clones, harness homes, caches).
2. Make a runtime beside it: clone this repository, `bun install --frozen-lockfile`,
   `node scripts/build-runtime.mjs all`; the evidence tools expect `runtime-<label>/` under the
   evidence root (`runtime-0.10.0-fix3` was a clone of `3fc369c`; any later commit of `main` serves).
3. Open `review/troy-refine/ws` as a Kiln workspace: its `kiln.mjs` and `.mcp.json` name the
   runtime; run `node kiln.mjs init --check` and, after moving the runtime, `--upgrade`
   (`skills/kiln-setup-workspace`). Or generate a fresh workspace with `kiln-init` and import the
   revisions from the workspace zip with `kiln_import`.
4. Refine through `skills/kiln-refine-asset`: `inventory.json` has each pick's `assetId` and
   `revisionId`; a call that names `projectId: "troy"` (revision 2) implies the material pins, and a
   pin the call names replaces the project's for the same `resourceId`.
5. Keep the pack standalone-first (AGENTS.md): scene terrain, controllers and optimization
   derivatives belong to the scene package, never to these assets.

## What the owner wants next (2 October, his direction)

- Revise several assets first; he has a list and will say which. Feed demonstrated authoring
  defects back into the maintained skills at the relevant boundary.
- Then a real scene, not the composed reference: in the manner of Farm and Golden Gate under
  `scenes/packages/`, the wall as part of a landscape with the city inside it (houses, the temple,
  the gate, the breach), soldiers across the battlefield, archers on the wall walk, Achilles and
  Hector about to fight on the plain, the galleys and the wooden horse on the shore. The reference
  composition shows every pick placed once; its layout is not the design.
- Eventually an official pack and scene on the site. The site's gallery renders standalone
  `examples/*.kiln.js`; project-pinned materials need site work before these assets can appear
  there, and `scenes/packages/` is a bun workspace with a frozen lockfile, so moving the pack
  there is a deliberate change with `bun install` in `scenes/`.

## Known state

- QA: every masonry revision is accepted/warn on `MATERIAL_IMAGE_COUNT_BUDGET` (the
  `web.portable.v1/standard` four-image budget; the two textured materials add two maps each);
  the horse, galley and bow set are accepted/pass; `GEO_PART_SELF_INTERSECTION` is observe-only.
- The material pass maps box UVs from world position (limestone tiles every 1.2 m, plastered
  mudbrick every 1 m) so courses run across pieces and match from the wall sections to the gate;
  geometry, part names, pivots and clips are the parents'. The horse's body is 0.8 to 0.84 as wide
  as deep (0.49 m over the thighs, from 0.53).
- The reference composition is inside the project's `scene-web` budget (150 draws, 400,000
  triangles) at 208,178 triangles and 130 draws; the shared limestone and mudbrick merge in its
  bake (28 materials from 32).
- Every revision was saved through the 0.10.0 CLI with project `troy`; the engine follow-ups of
  2 October (strict-mode generated code, implied project pins, the `resourceId` alias) landed
  after the pass, so the saved sources predate them and still run under them.
