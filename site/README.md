# Kiln website

The public documentation, gallery, asset packs and interactive scenes live at
[kilnstudio.tools](https://kilnstudio.tools). This is a static Astro site on
Cloudflare Pages. The separate hosted MCP application is open at
[kiln.instruktlabs.com](https://kiln.instruktlabs.com) for an introductory ten-account,
invite-only launch. Request access through [Discord](https://discord.gg/fSWVbMdQXK).

## Develop and check

Use the maintainer versions in `../toolchain.json`, with the pinned Node on PATH.
The media pipeline also needs an installed Chrome or Chromium.

```sh
node scripts/example-archive.mjs --fetch
cd scenes
bun install --frozen-lockfile
cd ../site
bun install --frozen-lockfile
bun run test
bun run assets
bun scripts/build-skills-discovery.mjs
bun run build
bun run preview
```

`bun run build` fetches SHA-256-pinned public assets and scene archives, creates
media, builds the site and checks its output. It makes no model calls and deploys
nothing. Generated downloads and build output remain ignored. `bun run dev` starts
the Astro development server; stage the required scene/media inputs with a build
first. The engine's root `bun run lint` also covers site source.

For a smaller documentation build, set `KILN_SITE_PACKS=0`; do not describe that
build as qualifying the gallery or scenes. Release checks use packs enabled.

## Where changes belong

| Content | Source |
| --- | --- |
| Installation and API guides | `../docs/`; `src/lib/docs-navigation.ts` selects published pages |
| npm release identity and install command | `../.github/published-candidate.json` and `src/lib/config.ts` |
| Homepage | `src/pages/index.astro` |
| Featured worlds and individual assets | `src/data/site-curation.json`; shared by homepage, scenes, packs and gallery |
| Gallery categories, tags and introduction dates | `src/data/gallery-taxonomy.json`, keyed by canonical asset page |
| Asset, modular kit and scene sequence | `src/components/AssetToScene.astro`, `src/data/asset-to-scene.json` and pinned files under `public/workflow/` |
| Gallery, packs and download records | `src/data/packs/`, `src/data/standalone/` and sealed delivery manifests |
| Historical gallery programs and credits | Pinned Git history restored to `../.cache/example-archive/` by `../scripts/example-archive.mjs` |
| Maintained scene source | `../scenes/packages/` |
| Scene archives and media | `src/data/scene-packs.json`, `scene-inputs.json` and `troy-delivery.json` |
| Shared layout, navigation and style | `src/layouts/BaseLayout.astro`, `src/styles/global.css` |

The docs loader renders repository Markdown directly. Relative links resolve to
published guides or repository files; do not maintain a second installation guide
inside an Astro template. Include new public guides in the navigation allowlist.
The build generates the agent-readable `llms.txt` and skills discovery index from
the same maintained sources.

Version labels, release/download links and share cards read the same verified
publication record used by package CI. Update that record after verifying a
registry publication; no separate site version edit is needed. An unreleased checkout
must label its new features accordingly. Package promotion and static website
deployment are separate release steps.

## Assets and scenes

The homepage, scene listing and pack listing lead with the curated Holodeck
worlds. Earlier scenes and packs remain available below them. Change the explicit
selections in `site-curation.json` to promote work; catalog import order is not
presentation order. `src/lib/site-curation.ts` selects the cover from each world's
recorded captures, and share cards use the same lead world.

Gallery categories describe the asset across packs. Keep scene-specific groups
in their source catalogs, and maintain shared categories and search tags in
`gallery-taxonomy.json`. Every current gallery page needs a record; missing records
fail the build. `addedOn` is the date the asset first entered the committed catalog,
not when it was authored or publicly released. Revisions and refreshed posters do
not change that date. Featured sorting promotes the selected assets, then uses
newest first with alphabetical ties. Filters and sorting are shareable URL parameters.

The repository README keeps only a small scene selection and live-game examples.
Run `node scripts/readme-showcase.mjs` from `site/` to regenerate its stills from
the hash-verified captures of the featured worlds. The generated
`../assets/readme/holodeck-showcase.json` records their source and output hashes.

The homepage uses one sequence: a Winter Cabin wall asset, its modular architecture
kit assembling, its living floor and loft being furnished in cutaway views,
then a capture of the finished Holodeck scene. The assembly uses 40 saved asset
types and 173 placements from the catalog's exact world snapshot.
Keep capture work in a separate workspace. Retain `web/manifest.json` (module
revisions, model hashes, placements, world hash and scene capture record), the
models under `web/models/`, `web/scene.webp`, `wall.kiln.js`, the capture page and
`web/captures/property/{frame-0000.png,...,proof.json}`. The property film capture
renders 1,020 fixed-time frames for a 34-second sequence at 30 fps. Its shot plan
records the asset introduction, camera pullback, architecture assembly,
living floor, a lower room tour, the staircase building upward, sleeping loft and final scene. The 17 interior treads and railings remain hidden during the living-room shots; they build with the loft landing afterward. Assets reveal
in place through clipping groups, with clipped shadows and unchanged scale.
Slow camera moves allow time to inspect the completed rooms. Run
`node scripts/stage-asset-to-scene.mjs WORKSPACE/kit` from `site/` with FFmpeg and
FFprobe available. Intake checks the placed revisions against the catalog,
model and source hashes, world identity, the complete frame sequence, encoded
frame rate and WebGPU capture evidence. It stages
one MP4, a GIF, a poster and the wall source at a content-addressed path. The
workflow tests verify the staged files and the single-player presentation.

Public packs have source records under `../packs/`; five runnable scenes
have source under `../scenes/packages/`. Large binaries are downloaded explicitly
from Cloudflare R2. Follow the [asset source guide](../packs/README.md) to hydrate
editable revisions and the [scene guide](../scenes/README.md) to rebuild runtimes.

Normal builds consume the selected sealed deliveries. Changed media, models or
runtime bundles need a new immutable release identity and matching checksums;
never overwrite an existing delivery. A build does not confer owner acceptance
on an asset. Keep its recorded revision, attribution and review status intact.

Gallery posters are single views, separate from saved multi-view review sheets.
The shared `scripts/rig-posters.mjs` renderer records their exact model hashes,
revisions, cameras and review rig in `src/data/rig-posters.json`. Staging must
reuse these records rather than assigning a saved `preview.png` to `poster`.
For Cabin, stage a preview delivery first, then run:

```sh
bun scripts/rig-posters.mjs cabin-woods-psx-horror --mirror /path/to/mirror
node scripts/fetch-mirror.mjs
```

This renders the staged runtime models, pins the new images and plans responsive
variants. Public Cabin staging requires a matching poster for every asset and
preserves the original review sheets and editable downloads. Uploading new mirror
files and deploying the site remain separate release steps.

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md) to qualify an exact build and obtain the
owner's deployment approval. The production Pages project is `kilnstudio`, branch
`production`; downloads use `kiln-assets`. GitHub checks do not deploy the site.
Use `build-info.json` and `artifact-files.json` to identify the actual served build
instead of relying on a dated README checkpoint.

Earlier site rollout records and asset-staging procedures are preserved in the
[historical checkpoint archive](../docs/reviews/2026-10-07-site-readme-archive.md).
They retain their original candidate scope and are not current release acceptance.
