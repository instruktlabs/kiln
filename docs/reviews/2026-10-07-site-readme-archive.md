# Historical website checkpoints

Archived from site/README.md on 7 October 2026. These records describe earlier
candidates and authorizations; use site/README.md and site/DEPLOYMENT.md for current work.

# Kiln website

## Current delivery and alignment, 2026-10-03

The site runs on Cloudflare Pages direct upload: project `kilnstudio`, production
branch `production`, domain `kilnstudio.tools`. Public assets use the `kiln-assets`
R2 bucket. GitHub checks validate source; they do not deploy it. Public build-info
and the authenticated deployment list agree on production commit `b1ac6ee`, clean
with packs enabled, deployment `33c716c7-16e5-46c6-93bf-f2260f0082be`. Source main
is `ac8456c`; those are different checkpoints.

The [alignment plan](../docs/plans/2026-10-02-core-scenes-site-alignment.md) and
[backlog](../docs/backlog.md) govern upcoming core, assets, scenes and site work.
Troy is deferred. The portable Node deployment wrapper is implemented and tested,
including final artifact-hash verification; existing OAuth has been verified on the
Linux hub. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the contract. No deployment was
made by this alignment work.

The local launch candidate and exact runtime archives are rebuilt as fixes are
qualified. Use the backlog for current controls, accessibility and performance
results and remaining release boundaries; earlier artifacts retain their
own evidence. The site records its exact served bytes in `build-info.json` and
`artifact-files.json`. A successful local build is not production approval.

Current asset catalogs distinguish revision acceptance: Farm's 23 exact asset picks
are owner-accepted; the six Vehicles r4 children remain candidates even though
their earlier r2 parents were accepted. Foundry has 62 models (55 candidates and
seven accepted) with internally consistent source/download pins. The large #131
optimization changed scene runtime code, not those model files. Review status does
not imply a newly discovered defect. See the alignment plan's complete asset inventory.

All checkpoint sections below are historical. Their authorization, preview labels,
local candidates and test counts describe those dates; they do not override the
current plan, manifests or a new release's acceptance requirements.

## Historical v0.9 Cloudflare rollout, 2026-10-01

The owner authorized integration to main and site deployment. Current inputs are Farm
r36-local-review, Golden Gate g9 and Foundry ff3-review2. The engine, site and maintained
scene sources now share this repository. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for a
clean build, pinned assets, exact-commit deployment and live verification. Package
publication remained deferred to v1.0. The Foundry preview label in this checkpoint
was subsequently removed; consult current site data for presentation status.

The records below are historical checkpoints. Their old no-deploy boundaries and
revision numbers do not override the current release authorization or manifests.
# Kiln Workbench website

## Local site candidate ready for owner review, 2026-09-30

Site round 4 is locally complete and uncommitted. This status supersedes the historical checkpoints below.
It does not establish owner acceptance or authorize a commit, merge, main move, push, upload, deployment,
DNS change, package publication or live provider call. The coordinator owns the combined engine/site/scene seal.

The candidate contains Farm r34, Golden Gate g7 and the complete FF3 delivery: 62 models, including the
24 standard-LOD replacements, eight plants, five freight vehicles, real lot-bearing AMRs and arm handoffs.
All exact model posters are integrated. The full models ZIP is 11,336,735 bytes, SHA-256
`fcf107a8f782fbedc75f2e532b139532820888ddb7e78e56a1f1cad637415364`. It includes licence texts, sealed metadata
and original replacement lineage. The owner approved the LOD migration approach and humanoid repair/maintenance
role; AMRs and arms carry lots. Individual candidate appearance and simulation calibration remain owner-review items.
Golden Gate stays a Scene, with separate bridge-asset and reusable Vehicles downloads. Its runtime hash remains
`22370bcfafe48c07e692fcf89f0338087a41e90ca586f320485bcd4a99e9d66b`; Farm's accepted runtime and canvas-only poster remain unchanged.

The explicit uncommitted engine docs/skills snapshot is dirty `ac6d9eb`, 370 files, digest
`668fc84bddd46b153c3f2a53db3037b269c3d8276a5f8f9e7ac24d76f93d4106`. It includes the frozen Blender/Unity guide,
SHA-256 `55e5abd49555a020048eace258754eb4f6fee955e0b232178234fffd48891b41`, with actual consumer/player results
and importer/animation/visibility limits. The current archive links directly to that guide. Provenance groups
keep each recorded effort and caveat attached to its exact models; unknown values remain explicit.

The final site is dirty `5b9c7db`. Its artifact manifest digest is `f967804043df54c99629ad1ea0e0a34d9a829422f3a40a6a7f1e67d8ae0af976`;
the complete site-input digest is `092711fd2b87a2d8722d3e0f9eadb5eb8498b74cf89f7a7315ca4f3f5bb85cb5`. These identify emitted bytes and build inputs,
including untracked files. Build-info records actual staged pack/runtime hashes and refuses unreadable Git diffs.
FF3 initial startup plus exterior is 1,520,413 bytes / 444,177 gzip; all four delivered chunks total 1,692,527 /
513,163 gzip. The interior remains deferred until Enter the fab; the original D-15 initial ceiling is unchanged.
The final road-marking aliasing repair followed visual inspection within the existing local-completion scope.

Validation: 433 site tests pass with no skips/failures, 6,595 assertions; Astro checks 66 files with no diagnostics,
and source lint is clean. Static checks cover 144 routes and 303 Draco-free GLBs. The broad accessibility sweep
covers 284 page/width checks and 44 full keyboard tours; final Foundry page rechecks replace the earlier two routes,
for 1852 keyboard stops total and zero problems. The 19-template, five-width browser sweep and final changed-page
checks pass. Viewer retry/no-graphics, all three tiny-viewport scenes, FF3 both-backend entry/deferred-load/exit,
strict failure recovery, responsive scene controls and Farm touch emulation pass. Exact evidence scopes and hashes
are in `site/.cache/round-4/site-final-seal.json` and `review/REPORT-round-4.md`; earlier unchanged-page receipts
are identified as such rather than relabelled as new runs.

The local review adapter verifies 116 mapped downloads, 520 linked built files, 33 mapped HTML pages and all
three SHA256SUMS endpoints. A real Chrome click downloaded the exact full Foundry ZIP and opened the consumer
guide. Production dist stays unchanged: only CDN download anchors are mapped in local HTTP responses, whose
hashes are recorded separately. Run `site-build/ops/preview.ps1` for the exact-byte LAN preview on port 4321;
`/_review/receipt.json` records its mapping and `/_review/` lists the files. This is no hosted-URL claim.

The isolated packs=0 Astro/static build passed 108 routes under Node22.23.2 without a mirror, scenes workspace,
docs override or root dependencies. The entire site test suite still requires the engine installation, as the
Website workflow specifies; the isolated no-engine trial is retained as a documented prerequisite result.
Physical phone/tablet, assistive technology, Safari/Firefox and real 400% zoom remain unmeasured here.
S-2 stays In production/noindex until the owner explicitly changes it. S-4 remains later Cloudflare direct upload
after owner review and separate authorization. Deployed v0.9 dogfooding and feedback precede v1.0 publication.


## Historical active checkpoint, 2026-09-30 at 21:01 UTC

The owner reactivated the complete local-candidate goal after the documentation-only checkpoint below.
Site round 4 is active and remains uncommitted. This block supersedes the earlier stopped-work state;
all earlier receipts remain historical. No commit, merge, main move, push, upload, deployment, DNS change,
package publication or live provider call is authorized.

The current engine docs/skills are now copied as an explicit dirty `ac6d9eb` snapshot: 370 files,
combined input digest `30aa753fbdf84a4d3e42c6a8f512c5b9094a3eae1f24adec1d68788b148b4b4b`.
This includes the local-candidate installation wording and the public Blender/Unity handoff guide.
The snapshot is provisional until the coordinator freezes the engine and importer receipts; refresh it then.
The build receipt now identifies actual staged scenes, emitted artifacts and all site source/public/config
inputs, including untracked files, by hash. A source Git label alone is not the candidate identity.

At the 21:01 UTC checkpoint, the full site script suite passed 425 tests with no skips or failures; Astro
reported no errors, warnings or hints, and the source lint check passed. The completed broad accessibility
receipt has 284 page/width checks, 44 keyboard tours and 1,787 stops, with zero violations, overflow or clipped
focus rings. These are interim receipts; final FF3 changes still need the complete candidate gates.

The latest served interim build is 2026-09-30T20:36:57.128Z, still with FF2, artifact digest
`49d4d633289a274569c1a012291bb970fa8cabf271c42d13ce85404248cafdd3`. The local review adapter leaves those production
files unchanged and maps only CDN download anchors in its HTTP responses. It verified 85 mapped downloads,
520 linked site files, 33 mapped HTML pages and all three SHA256SUMS endpoints. A real Chrome download click
saved the exact 549,584-byte Farmhouse GLB. The adapter records original and mapped HTML hashes separately;
this is no hosted-URL or upload claim. `ops/preview.ps1` uses it for LAN review on port 4321 and its dry run passed.

The isolated pre-upload build passed 108 routes with zero static/link/metadata/HTML/header errors under pinned
Node 22.23.2, without a mirror, docs override, scenes workspace or root node_modules. It used a Git archive plus
an explicit working-source overlay and the existing locked site dependencies. CSP remains report-only; its
inline-script hashes now derive from the pages actually emitted in each mode.

FF3 multi-chunk staging, modern licence/null-effort identities, complete campus inventory and standard MSFT_lod
measurements are implemented. The canonical 62-model pack passes site intake, including all 24 new standard-LOD
revisions. Thirty-one exact campus model posters are ready; migrated interior posters, frozen final runtime,
current importer guide and final source snapshots still need integration. The full model archive retains sealed
asset metadata and replacement lineage alongside the licence texts. Review-candidate status is never promoted
to owner acceptance. Golden Gate retains runtime SHA-256
`22370bcfafe48c07e692fcf89f0338087a41e90ca586f320485bcd4a99e9d66b`, accepted g7 asset pins, separate bridge and Vehicles
downloads. Farm retains its accepted runtime and clean canvas-only poster.

The first complete local review requires FF3 vegetation/freight and real robot transport with production
revalidation, actual Blender/Unity consumer results with limits, frozen current docs/skills, and final static,
privacy, all-page, 44-tour keyboard, enlarged-text, scene, viewer and download proof on one build. Physical
phone/tablet, assistive-technology, Safari/Firefox and real zoom checks are not inferred from Chromium emulation.
S-2 remains In production/noindex until the owner changes it. S-4 remains later Cloudflare direct upload,
after owner review and separate authorization. The deployed v0.9 feedback period precedes v1.0 publication.


The public site is an Astro static build. Pages, documentation, code highlighting and drawing annotations are rendered to HTML. React and Three.js load only after an explicit asset-viewer or scene action. The Farm island mounts the separately delivered R3F scene (`@kiln-scenes/farm`) when the scenes workspace and its staged pack are present, and keeps a "being rebuilt" stand-in otherwise. The Farm page is `noindex, nofollow` and outside the sitemap either way: the interactive Farm is a preview that is still being qualified, not newly qualified content. See [The Farm scene island](#the-farm-scene-island).

Building locally does not publish the site or upload the Commons files. The source-release tag is pending, and the npm package is unpublished. See the external review report for measured browser/performance results and remaining release decisions.

## Historical documentation-only handoff, 2026-09-30

**Round 4 remains incomplete. Work is now stopped for documentation alignment and a proposed local-completion
goal, at the owner's latest request.** The preceding local implementation pass was authorized; the current action
starts no further implementation or gate waves. The gates already running have finished; results are in the
progress log. No commit, merge, push,
upload, deployment, DNS change, package publication or live provider run has occurred or is authorized here.
This block supersedes current-tense staging and authorization statements in the earlier takeover notes below;
those notes and all original receipts are preserved as dated history.

Golden Gate g7 is now staged, including the fresh scene controls/runtime delivery. Its separate bridge asset
and reusable Vehicles r2 downloads remain distinct. The g7 assets keep their accepted seals; runtime
`index-Btvmch7-.js` is 1,719,318 bytes, 517,261 bytes gzip, SHA-256
`22370bcfafe48c07e692fcf89f0338087a41e90ca586f320485bcd4a99e9d66b`, within the existing D-15 ceiling.
The earlier statements that the catalog still names g5 or Golden Gate is missing describe the takeover baseline.

Implemented site work includes actual-staging build receipts/output hashes; multi-chunk frame staging and served
hash checks; startup/progress/error reporting and the 20-second frame watchdog; viewer cache eviction and specific
graphics-unavailable copy; the public `engine-handoff` docs allowlist entry; the root reliability assertion repair;
shared scene/page headers, code/typography/focus/filter/table improvements; and a clean Farm poster captured from
the staged m4 runtime. These changes are uncommitted and are not a completion or visual-acceptance claim.

The current interim build is **2026-09-30T19:36:44.248Z**, dirty site head `5b9c7db`, with Farm r34,
Golden Gate g7 and **Foundry Floor ff2**, and docs/skills still at **bf98851**. Its artifact manifest records
2,772 files / 191,769,315 bytes, digest `0a09358e42b9d37c155414aa1bc59ffec40d499ecac36ff918bb09ea487184d4`.
`sourceDiffSha256` covers the tracked Git diff; the final integration receipt must also identify untracked source
files through the coordinator's complete source snapshot. The artifact manifest identifies emitted bytes.

The complete first local review still requires FF3 with campus vegetation/freight and real floor transport,
revalidated production flow, fresh docs and skills from the selected engine candidate, actual Blender/Unity
imports and their tested limits, and final site/root/browser/download/keyboard/LAN gates on that same frozen
candidate. S-2 remains: Foundry Floor is **In production**, its scene is `noindex, nofollow`, and its pack is
`noindex, follow`, until the owner explicitly changes it. S-4 remains: Cloudflare Pages direct upload only after
owner review and separate authorization. The deployed v0.9 dogfood/feedback period precedes later v1.0 npm publication.

See the sibling Commons workspace's `site-build/review/PROGRESS.md` for exact check results and remaining acceptance items. None of the interim measurements
establish the FF3 candidate's quality or the owner's acceptance.

## Structure

- `src/layouts/BaseLayout.astro` owns navigation, breadcrumbs, metadata, structured data and the license footer. Workbench tokens and Tailwind typography are in `src/styles/global.css`.
- `src/data/release.json` is the single release-version value. `src/lib/config.ts` derives the short version, Git tag and install commands from it.
- The home hero is one data file, `src/data/hero.json`, written from sealed records by `scripts/build-hero.mjs` (the rig poster of the drawn revision, its GLB, the capture camera, the bounds and the two callout parts, each checked visible from the camera). `src/lib/hero-drawing.mjs` projects the bounding box and the callout part centres through that camera to draw the dimension lines, callouts and axis triad; `src/lib/hero.ts` reads the title block's facts from the catalog entry the file names. Replacing the file replaces the whole figure: `scripts/fixtures/hero-farmhouse.json` is the second fixture of `scripts/hero-drawing.test.ts`.
- `src/content.config.ts` and `src/lib/docs-loader.ts` load the repository Markdown. `src/lib/docs-navigation.ts` is the complete ordered publication allowlist. Relative links are rewritten to emitted docs pages or repository files; local filesystem links become visible text. Source bodies are not copied into page templates.
- `src/data/packs/`, `src/data/standalone/` and their build manifests bind catalog copy, posters, exact model/source revisions, attribution and sealed downloads. Generated binaries remain outside Git.
- `src/components/AssetViewerRuntime.tsx` adapts the existing R3F inspection controls into the on-demand asset viewer. `src/components/SceneShell.astro` owns the scene shell (poster, explicit Explore, lazy lifecycle, progress text, error surface) for every scene page; `src/scenes/runtime/farm.ts` is the Farm runtime entry the site builds separately, and `src/scenes/runtime/scene-package.d.ts` holds the ambient types of `@kiln-scenes/farm` and the `virtual:kiln-scenes` module.
- `src/data/scene-packs.json` records, per scene, the sealed pack the site serves (release, base path, file and byte totals, digests) and, for a standalone-built scene, its public chunk. `src/data/scenes.ts` holds each scene page's copy and links. The scene profile remains downloadable while the website scene is under review.
- Archive routes retain the example builder, R2 posters, provenance receipts and runtime-download derivation. Historical posters are not regenerated by the website build.
- `scripts/finalize-site.mjs` derives `sitemap.xml`, `sitemap-index.xml`, `robots.txt` and `llms.txt` from the emitted HTML. `noindex` pages and the 404 are excluded from the sitemap. There is no separately maintained static sitemap. `sitemap-index.xml` is a one-entry index of `sitemap.xml`: the owner's Search Console property has `/sitemap-index.xml` submitted from the previous site (`docs/site-indexing.md`), and a submission that starts returning 404 would go unnoticed until Google reported it.
- The archive is browsable but not indexed. Every `/gallery/archive/<slug>/` page passes `noindex` (`noindex, follow`, canonical unchanged) and is left out of `sitemap.xml` and `llms.txt` by route as well as by that marker. The archive index, the reviewed gallery and the reviewed asset pages stay indexed, and `llms.txt` lists the archive index under its own "Archive" heading with a line saying its item pages are not listed. `scripts/validate-static.mjs` fails the build when an archive item is indexable, is missing, has lost its own canonical URL or appears in either file, or when the archive index or a reviewed gallery page is noindex or absent from the sitemap (`archiveIndexingErrors` in `scripts/static-validation-core.mjs`, covered by `scripts/static-validation.test.ts` and `scripts/finalize-site.test.ts`). The old `#/<slug>` links still redirect to the archive page (`legacyDestination`).

## Toolchain

Use the repository's pinned maintainer tools: Bun 1.4.2, Node 22.23.3 and npm 12.2.0, as recorded in `../toolchain.json` and `../scenes/toolchain.json`. Put that Node installation first on `PATH` before running build/check commands; the site media pipeline uses Node, native Sharp and an installed Chrome or Chromium.

Runtime dependencies are exact pins. The owner-required `@types/react` and `@types/react-dom` literals remain `^19.3.0`, with exact resolutions in `bun.lock`. Astro 7.3.5 and React 19.3.0 are used with `@astrojs/react` 7.0.0. Site TypeScript is 6.0.3 because `@astrojs/check` 0.9.10 declares TypeScript 5/6 support, excluding 7. The site, engine, render service and maintained scene packages pin Three.js 0.186.1; the site and scene packages pin `@types/three` 0.186.0 and `@react-three/fiber` 9.8.1. The site builds Farm from maintained scene source and serves the separately sealed Golden Gate and Foundry public bundles. Each sealed runtime retains its own producer identity; historical builds are not relabeled by current manifest pins. The site build refuses to bundle a second copy of Three.js, React, React DOM or `@react-three/fiber`.

## Data preparation

Run commands in this section from `site/`. Input paths are arguments, not embedded machine paths:

```sh
node scripts/generate-commons.mjs --inputs /path/to/inputs --mirror /path/to/mirror --manifest /path/to/mirror-manifest.json
```

The command above creates the original r33 baseline. Do not rerun the full importer after selecting a newer Farm delivery. To replace only an independently verified Bridge revision while preserving the selected Farm, run:

```sh
node scripts/generate-commons.mjs --only-bridge --bridge-revision r_EXACT_REVISION --inputs /path/to/updated-inputs --mirror /path/to/mirror --manifest /path/to/updated-mirror-manifest.json
```

Supply the matching Bridge reference/report inputs and SHA-256-pinned delivery/captures. `--only-bridge` preserves the Farm catalog and upload list byte for byte, keeps its media/model/source/archive plan and manifest pins, and replaces only Bridge records. When multiple Bridge revisions coexist, `--bridge-revision` is required. These commands update checked-in catalog/build data; they do not upload anything, modify public build output or rebuild authored assets.

### Bridge deliveries with tiers (review 3 onward)

A Bridge delivery has three tiers (full, web, far), each a saved revision with its own runtime GLB and editable ZIP. The accepted revision ids, parents, export sizes, SHA-256 values and triangle counts are pinned in `src/data/standalone/golden-gate-tiers.json`; every saved revision back to the first is listed in `golden-gate-lineage.json`; each run's requested model, effort and harness come from its own receipt through `scripts/bridge-requests.mjs` (a run's requested effort is never recorded as confirmed). To bring in the next delivery, replace those two pins, then, with an author output folder and library:

```sh
node scripts/bridge-requests.mjs --commons /path/to/kiln-commons
bun scripts/rig-posters.mjs bridge --service http://127.0.0.1:8123 --mirror /path/to/mirror --outputs /path/to/outputs --cameras /path/to/cameras
node scripts/stage-bridge-revision.mjs --outputs /path/to/outputs --library /path/to/library --mirror /path/to/mirror --manifest-out /path/to/manifest.json
node scripts/generate-commons.mjs --only-bridge --bridge-revision r_EXACT_REVISION --inputs /path/to/inputs --mirror /path/to/mirror --manifest /path/to/manifest.json
```

`stage-bridge-revision.mjs` refuses anything that is not the accepted delivery: an export whose bytes are not the pin, metadata naming another revision, a saved file the revision manifest does not seal, a parent link the library does not have, or a revision saved outside the window of the run credited with it. The editable ZIPs are built from the library's revision folders with fixed timestamps, so the same inputs give the same bytes. The full tier is the only Bridge model the site serves (same-origin, lazy, viewer only); web and far tiers, editable ZIPs and the licence are pinned in the mirror manifest for the owner's later upload and are download-only.

### Generic Road Vehicles pack

Six vehicles (hatchback, sedan, SUV, pickup, box truck, transit bus) come from the Golden Gate scene's two vehicle authors, one `MSFT_lod` GLB each with three detail tiers and separate wheels. The pack is staged from the commons workspace and from the Golden Gate scene pack the site already serves (run `node scripts/scene-pack.mjs` first: the delivered GLBs and licence texts are that pack's, sealed by its `SHA256SUMS`, which the site's record must match):

```sh
node scripts/vehicle-runs.mjs --commons /path/to/kiln-commons
node scripts/stage-vehicles.mjs --commons /path/to/kiln-commons --mirror /path/to/mirror [--scene-pack public/scene-packs/golden-gate/<release>]
bun scripts/rig-posters.mjs vehicles --service http://127.0.0.1:8123 --mirror /path/to/mirror
```

`stage-vehicles.mjs` refuses a vehicle unless everything that vouches for it agrees: the delivered export, the scene pack's copy and the hash its licence text states; the saved revision's sealed files, its parent chain and a creation time inside the run credited with it; the binary chunk of the delivered file and of the saved export; every tier's triangles, bounds, materials and parts in both forms; wheels that stop being drawn where the last tier starts; each tier inside its brief's body-triangle budget; and three.js's own loader drawing exactly the top tier and the wheels the catalog reports. Sizes and triangle counts are read from the GLBs, and the descriptions are the authors' own briefs. The editable ZIP is the saved revision built with fixed timestamps (the revision's UTC creation time), so the same inputs give the same bytes; the pack ZIP is the six GLBs and licence texts under a `delivery.json` inventory. A repeated run leaves `mirror-manifest.json`, `commons-build.json` and `packs/vehicles.json` unchanged. Nothing is uploaded. The vehicles share the Farm pack's licence (CC0-1.0, authored content only; owner decision D-35). The owner approved all six at every tier, including the corrected transit bus on 30 September 2026; the catalog records that approval against its exact revision. The Vehicles r2 catalogue now includes the g7 licence restage while preserving those accepted model identities. `vehicle-runs.mjs` records each run's requested model and effort from its receipt and invocation; no effort is independently confirmed.

### Foundry Floor pack (historical delivery record)

The Foundry Floor pack (62 interior and campus models, release FF3) is staged from the sealed Foundry Floor scene pack. It includes 31 interior models, 12 campus structures, six road vehicles, eight plants and five freight vehicles. Run `node scripts/scene-pack.mjs` first, then

```sh
node scripts/stage-foundry-floor.mjs --mirror /path/to/mirror [--scene-pack public/scene-packs/foundry-floor/<release>]
bun scripts/rig-posters.mjs foundry-floor --service http://127.0.0.1:8123 --mirror /path/to/mirror
```

`stage-foundry-floor.mjs` requires the GLB, pack seals, exact asset/revision pins and licence credit to agree. Interior measurements must also match `data/assets.json`; campus measurements come from the sealed GLBs. It counts the default detailed geometry separately from optional `MSFT_lod` tiers and scene-hidden parts, and verifies what an ordinary three.js loader actually draws. The 24 legacy interior LOD migrations retain their parent lineage in sealed evidence. The owner approved that migration approach; individual candidate assets still require review.

The page presents recorded model/harness and requested effort, including explicit unknown values and any provenance qualification. Effort is never independently inferred. The deterministic models ZIP contains all 62 GLBs, licence files, sealed asset metadata, replacement lineage and a `delivery.json` inventory. The catalog is `src/data/packs/foundry-floor.json`; it remains separate from the gallery. Foundry Floor stays **In production** with the recorded noindex policy until the owner changes S-2. The Blender/Unity handoff guide describes actual importer/player checks, required derivatives and unsupported behavior. Staging uploads nothing.
