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

All five public packs have source records under `../packs/`; four runnable scenes
have source under `../scenes/packages/`. Large binaries are downloaded explicitly
from Cloudflare R2. Follow the [asset source guide](../packs/README.md) to hydrate
editable revisions and the [scene guide](../scenes/README.md) to rebuild runtimes.

Normal builds consume the selected sealed deliveries. Changed media, models or
runtime bundles need a new immutable release identity and matching checksums;
never overwrite an existing delivery. A build does not confer owner acceptance
on an asset. Keep its recorded revision, attribution and review status intact.

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md) to qualify an exact build and obtain the
owner's deployment approval. The production Pages project is `kilnstudio`, branch
`production`; downloads use `kiln-assets`. GitHub checks do not deploy the site.
Use `build-info.json` and `artifact-files.json` to identify the actual served build
instead of relying on a dated README checkpoint.

Earlier site rollout records and asset-staging procedures are preserved in the
[historical checkpoint archive](../docs/reviews/2026-10-07-site-readme-archive.md).
They retain their original candidate scope and are not current release acceptance.
