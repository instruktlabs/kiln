# Asset delivery, source organization and scene startup

Recorded 5 October 2026. Status: implementation candidate under qualification.
The live site remains the deployed `2d61fef` / Troy `troy-20261005-04` release.
This document does not declare an asset revision, repository migration or deployment complete.

## Intended result

Farm, Vehicles, Golden Gate Bridge, Foundry and Troy use the same delivery contract:
runtime models for applications, editable sources with metadata and included revisions,
and a runnable scene where one exists. Standalone assets remain independent of packs.
The gallery includes Bridge and excludes Battle before the gate. The Trojan Horse
receives a new source revision with attached ears. Scene startup improves without
undoing the existing animation, instancing, culling or rendering work.

Keep local development here and use the hub for isolated performance qualification.
Physical tablet results require the connected tablet; desktop results do not establish them.

## Goal statement for the implementation agent

Complete a consistent Kiln asset and scene release across Farm, Vehicles, Bridge, Foundry
and Troy: provide clear Runtime assets and Editable assets downloads, preserve continued
editing and included revisions, fix the Trojan Horse ears and gallery curation, and
improve measured scene startup without regressing visuals or gameplay. Keep lightweight
source and scene code together in the current repository, use Cloudflare for large
generated payloads, and keep development local with isolated performance tests on the
hub. Use sub-agents for independent work and independent adversarial review, resolve
material findings, and finish with a tested, verified Cloudflare release and a concise
report of results and any remaining limitations.

The owner activated this goal and authorized sub-agents, commit, push and deployment.
The goal remains active until the exact final release is verified.

## Current implementation evidence

The candidate has all five pack source groups and four maintained scene packages,
including `scenes/packages/troy`. Vehicles is a pack used by Bridge and Foundry;
there is no separate Vehicles scene. Generated payloads remain outside Git.

The delivery inventory selects 115 assets. Its 125 runtime/editable archives passed
inventory and hash checks. Independent review decoded the real nested revision
archives and rebuilt representative Farm, Vehicles, Bridge, Foundry and Troy assets
through the installed CLI. The corrected Wooden Horse child includes its parent;
the child imports and rebuilds byte-identically. The candidate catalog, GLB and
poster now select that child, rather than only fixing its download.

Troy candidate `troy-20261005-06` preserves the accepted scene images and adds bounded
fetches, verified lossless bank transport and a bundled module graph. Six frozen
views matched the previous unbundled implementation pixel-for-pixel. Local sealed
candidate probes reached ready and exercised those views without runtime errors.
These local timings are functional observations under agent load. The preceding sealed
05 candidate passed the quiet-hub 13-case matrix on both backends at 1440×900 balanced,
including combat and fleet transitions. Slowest sampled means were 63.80 FPS on WebGPU
and 60.76 FPS on WebGL2. These are sampled averages, not a locked 60 FPS claim.
Matched repeated fleet unloading retained approximately 25 ms p99 intervals on both
versions, with occasional longer frames. Repeat the affected serving and hub checks on
the exact 06 seal before production; final production serving checks remain required.

The reader accepts compressed delivery bytes and the original bytes exposed when HTTP
serving automatically decompresses a gzip response. Both paths retain exact identity,
bounded allocation and cancellation. Thirteen focused reader tests and independent real
HTTP tests cover plain, decoded and nested gzip responses, corruption and oversize data.
The 06 archive excludes historical browser qualification fixtures and regenerates compiled
chunks, preserving the previous archive. All 21 source inventory rows now point to canonical
saved revisions, immutable R2 models and current scene posters.

The recorded fresh-profile network comparisons used the same admitted hub, exact sealed 04/05 inputs,
1440×900 balanced WebGPU, full shader/representation warmup, and a chosen 50 Mbps download /
40 ms latency profile. Normal browser caching remained enabled within each page.

| Measurement | Previous 04 | Candidate 05 |
| --- | --- | --- |
| Fresh ready, pair 1 | 25.873 s | 19.511 s |
| Fresh ready, pair 2 | 24.793 s | 19.438 s |
| Cached ready, pair 1 | 15.183 s | 14.958 s |
| Cached ready, pair 2 | 15.288 s | 14.847 s |
| Fresh transfer | 32.672 MB | 14.303 MB |
| Script requests | 159 | 43 |

Fresh startup improved by 21.6–24.6% in these two matched network-emulation pairs;
transfer fell 56.2%. Full fresh warmup stayed approximately 6.3–6.5 seconds, and first
production frames followed ready by approximately one refresh interval. Localhost
cold startup was unchanged, while cached improvements were modest. These results do
not claim the provisional 5-second interactive budget, instant loading, faster rendering,
or live Cloudflare timing. Both backend matrices retained the existing complete warmup,
actor/resource counts and successful disposal, with no runtime errors or warnings.

Active bank transfer falls from 18.53 MB raw to 3.65 MB gzip. This is a startup bank
measurement, not the complete page transfer. The runnable scene archive is 51.60 MB,
because it retains original fallback data alongside compressed companions. The
archive is an explicit download, not a startup request. Shader/representation warmup
is retained so initial combat and fleet transitions are not deferred stutters.

A fresh remote single-branch main clone with checkout took 5.09 seconds and transferred
40,970,073 bytes of Git pack files in this environment, before this candidate. Measure
the new release using the same method after pushing; these are observations, not a
universal network promise. Source records add about 18.68 MB decoded, while generated
archive/model uploads remain on R2.

The asset bucket originally lacked CORS. Public GET/HEAD CORS is now configured through
the checked-in policy. All 147 published objects passed canonical URL size, SHA-256,
CORS and immutable browser-cache checks. The 146 unchanged asset objects and replacement
06 scene archive total 432,778,435 bytes; verify the new scene archive before publishing.
A cache rule scoped
to the asset hostname makes ZIPs and GLBs edge-cache eligible while respecting origin
TTLs; both demonstrated MISS followed by HIT. Missing objects bypass caching. Actual
cross-origin gallery rendering remains part of the final production browser check.

## Public download language agreed with the owner

Present two asset choices consistently, without prominent provenance or revision
bookkeeping in the public download flow:

| Label | Short explanation |
| --- | --- |
| **Runtime assets** | Models, textures and animations prepared for use in a scene or application. |
| **Editable assets** | Models plus Kiln source, editing metadata, materials and included revisions, so you can reopen and continue editing. |

Runtime assets still retain the hierarchy, animation and application metadata required
to work. Editable assets contain source and resources in addition to metadata; do not
describe them as merely the same GLB with extra metadata. Keep technical inventories,
hashes, rebuild instructions and revision bookkeeping inside packages and developer
documentation. Use normal direct downloads without extra approval or provenance steps.
The runnable scene preview and optional scene source download are separate scene actions,
not additional asset profiles. Preserve existing required licence notices and CC0 asset
licensing without expanding the download UI into a review workflow.

## What the audit established

Current source is `2d61fefdeeef2cd76f2bcff6dd9a7469b47503c6`.
Catalogs, staged scene GLBs, cached sealed archives and live HTTP responses were inspected.
The archive samples were hash-checked before their contents were inspected.

| Content | Current public delivery | Gap |
| --- | --- | --- |
| Farm | Runtime ZIP 7.70 MB, editable ZIP 31.28 MB, scene ZIP 7.03 MB; individual runtime GLBs and source links | The nested editable project contains one selected revision per asset. Fourteen parent references point to records absent from that ZIP. Source links are not individual complete editable/history downloads. |
| Vehicles | Runtime pack ZIP 0.92 MB; individual runtime GLB and editable ZIP for each vehicle | No combined editable pack. The sampled Hatchback editable ZIP contains its latest record, not its five listed revision records. |
| Bridge | Full, web and far runtime GLBs and editable ZIPs; already listed in the live gallery | Sampled full editable ZIP contains one record despite twenty full-tier history entries on the site. The gallery viewer defaults to the 12.40 MB full GLB rather than the 3.51 MB web tier. |
| Foundry | 62 models, with exterior startup and deferred interior code/models | Different catalog/package presentation. Scene-kit rejects required compression extensions. Source rebuilding and recoverable history need the same explicit contract as other content. |
| Troy | 21 gallery models and model/scene ZIPs; authored source snapshot in `packs/troy` | No complete public editable/history package; fourteen base scene GLBs copied from canonical records without the runtime export helper. Battle before the gate is automatically included in the gallery. |

Selected-revision archives remain useful for continued editing. A parent identifier or
a displayed revision ledger does not supply the parent's source, model or dependencies.
The three inspected editable archives do not establish recoverable complete history.

### Materials: source storage, delivery and GPU cost

Material parameters and procedural recipes are source data. Texture maps are generated
or original image payloads. An exported GLB can embed those maps; the renderer then
decodes/uploads them into GPU textures. These are separate size/cost questions.

- Troy's ten tracked `.materials.kiln.json` bundles occupy 7,770,975 bytes in a checkout,
  but consist of only two distinct Git blobs totaling 1,554,195 bytes. Git already
  deduplicates identical blobs; replacing duplicate files reduces checkout/build copying
  more than the corresponding Git transfer. Validate sharing through exact references.
- Its tracked material map files and manifests add 686,428 bytes. Recipes, seeds, map
  hashes, dimensions, channel packing and color-space metadata are available in the
  material manifests. Preserve those for exact reconstruction.
- All 21 deployed Troy gallery GLBs have embedded images: 116 image entries totaling
  3,343,826 encoded bytes across those files, with no external image URIs. This is the
  whole gallery inventory, not the startup subset, and repeated images are counted
  per GLB. Hosting the same maps separately will not shrink these GLBs automatically.
- The current engine's built-in curated texture source embeds 747,977 bytes of payload
  (the generated TypeScript file is about 1.14 MB). It supports self-contained offline
  authoring. Keep that baseline working; do not make core material resolution depend
  on Cloudflare solely to move this relatively small payload out of Git.
- The local Troy startup probe reported about 72.35 MB texture memory. Smaller encoded
  files or a CDN change alone do not establish lower decoded/GPU residency.

Recommended storage: keep recipes, parameters, licences and immutable revision/hash
references in Git. Store larger generated map variants on R2 and hydrate only required
versions for source rebuilding. Editable archives include their referenced material
bytes for self-contained recovery. Retain the portable self-contained GLB download;
the site runtime may use shared texture payloads only through an explicit supported
consumer contract. The present scene-kit intentionally requires self-contained GLBs.

Remaining texture research is to inventory unique maps by hash across the startup set,
their encoded bytes, dimensions, color spaces, mipmaps, decode/upload times and actual
GPU formats. Compare shared-map loading, reduced resolutions and KTX2 derivatives where
measurements justify them. Preserve base-color versus normal/packed-map semantics and
visual quality. Check cache eligibility and CORS if a future runtime actually fetches
external maps. Moving maps to R2 does not eliminate repeated shader compilation or
Troy's pose-bank and warmup costs.

Bridge's gallery page and all six full/web/far download links are live. The sampled
Farm, Vehicles and Bridge download endpoints returned 200 with the catalogued sizes.
R2 ZIPs use one-year immutable browser caching. The sampled Bridge GLB had that browser
header but `CF-Cache-Status: DYNAMIC`: browser caching and CDN edge caching are separate.

`git ls-tree HEAD:packs` contains only Troy. Its 86 tracked files are authoring source,
manifests, materials, project records and historical composition code, rather than
the engine's packaged runtime implementation. Other authored content comes from separate
workspaces and sealed R2 deliveries. The separate Commons authoring directory contains
those workspaces; it is not currently a Git repository.

### How the scenes currently load

| Scene | Actual listed runtime models | GLB bytes loaded at startup, before HTTP compression | Loading approach |
| --- | --- | --- | --- |
| Farm | 23 | 6.91 MB | Shared scene-kit loader; all models initially loaded; all 23 have runtime provenance and match the public runtime pins. Compiled JavaScript bundle. |
| Golden Gate | 8 | 4.89 MB | Web/far Bridge tiers plus the six exact Vehicles files; all eight match their catalog pins. Full Bridge is excluded from the scene's model list. Compiled JavaScript bundle. |
| Foundry | 62 | 5.35 MB / 31 models | Startup selects structures, vehicles, vegetation and freight. Another 31 interior models are loaded on entry with four concurrent workers; interior JavaScript is deferred too. |
| Troy | 18 requested GLBs | 6.16 MB | Fourteen base assets are fetched, verified and parsed sequentially, followed by separate role GLBs/banks; raw module graph and eager variant warmup. |

These are listed model payloads, not whole pack ZIP sizes, GPU residency or network
transfer totals. Golden Gate's manifest lists additional GLBs beyond its eight model
entries; adding every `.glb` in an archive overstates the current startup model set.
Foundry's startup calculation follows its actual `campusStartupModel` predicate.

The shared loader already verifies bytes/hashes, supports a startup subset and aborts,
pools compatible textures and disposes owned resources. Its startup concurrency defaults
to the task count; it is not a universal four-request scheduler. Its current validation
explicitly rejects required Draco, BasisU and Meshopt decoder extensions. Three itself
supports these through registered decoders, including Meshopt in the delivered pinned
version, but installing support at the consumer boundary is required first.

Troy's retained live resource set totals 32.98 MB decoded: GLBs 6.16 MB, pose binaries
18.64 MB, JavaScript 4.41 MB, JSON 3.40 MB and other content 0.36 MB. A fresh-browser
production WebGPU probe at 1440x900 transferred about 26.48 MB and took 18.41 seconds
from Explore to ready. Repeat took 16.55 seconds while transferring only 0.23 MB.
Rendering warmup accounted for 8.27 / 7.51 seconds respectively. No network throttling
was used. These two local startup samples are not a hub or mobile performance acceptance.

The largest pose banks compressed offline from 18.53 MB to 3.66 MB with gzip or 2.08 MB
with Brotli. Decoder overhead and end-to-end startup gains have not been measured.
Crew and archer-hand GLBs are byte-identical 533,804-byte files at different URLs.
The base Troy GLBs have no review-clip extras for runtime export to remove.

The public Trojan Horse poster shows gaps beneath both ears. Its source places the ears
at fixed root coordinates while the head is a rotated loft. Revise the attachment from
the head frame with deliberate base overlap and inspect actual exported geometry. Preserve
the hollow torso, hinged hatch, wheel pivots, clips and pinned materials. The living Horse
asset is a different asset. Wooden Horse is not in Troy's current fourteen base inputs.

## Consistent contract

Use the existing `editable` and `runtime` export meanings. Do not turn `runtime` into
an undocumented promise of geometry simplification, texture compression or FPS.
Represent delivery profile, detail tier and encoding separately, producing only useful
combinations rather than every possible combination.

1. **Editable:** canonical source and exact manifests, original GLBs, required materials,
   pinned rebuild dependencies and all explicitly included published revision records.
   Preserve parent links. Declare the history scope and any unavailable ancestor; never
   label metadata-only history as restorable. Include a simple restore/rebuild command.
2. **Runtime:** GLBs and any informational sidecars derived from exact revisions, with
   preserved animation/pivot/material contracts. Offer a portable baseline without required
   decoder extensions, and measured web derivatives where worthwhile. Web/far detail choices
   are independent from editable/runtime. Keep application extras that controllers use.
3. **Scene:** compiled consumer code, current runtime assets, data, decoders and licence
   notices. Exclude asset revision history, old experiments and unused dependency trees.
   Keep editable scene source in the current repository, and expose it through the scene
   source download. Source assets do not enter the live scene's startup request closure.

Generate asset pages, pack downloads, scene pins and curated gallery entries from a single
release inventory. Carry collection-qualified asset/revision identities, byte sizes,
hashes, source commit/path, required capabilities and the optimization recipe/tool versions.
Pack membership is explicit; standalone Bridge is not forced into a pack.

The same manifest contract should work with R2, local HTTP or another host. Keep URLs
relative to a configurable base. Site and scene adapters implement rendering-specific
loads; deterministic engine exports have no Cloudflare or Three-consumer policy.

## Repository size and recommended organization

Keep the current repository for now. The owner's preference is to retain packs and scene
code together if measured size remains reasonable. The measurements support that choice;
they do not establish an urgent need to split the repository.

| Measurement at `2d61fef` | Size | What it means |
| --- | --- | --- |
| GitHub API repository size | 39,038 KiB / about 38.1 MiB | Reported remote storage size, not a measured clone download or clone time. |
| Current tracked tree | 71.34 MB / 2,807 files | Decoded current file bytes, excluding ignored asset delivery output and dependencies. |
| `packs/troy` | 10.32 MB / 86 files | Authored source and records; the large published scene ZIP is not this folder's Git size. |
| `scenes` | 8.21 MB / 670 files | Scene code, shared scene-kit and tests. |
| Reachable main-history blobs | 305.82 MB / 5,439 blobs | Decoded unique historical blob bytes; Git packing/deltas make this different from network transfer. |

Other current costs include 13.06 MB of repository images and 12.88 MB of generated
runtime bundles. Historical bundle versions are prominent among large history objects.
These need consideration if future measurements justify reducing Git growth; moving packs
alone would not address them. The local object store includes other refs/worktrees and
must not be quoted as a fresh user's clone size.

Cloudflare Pages hosts the site, while the R2 custom domain `assets.kilnstudio.tools`
serves pack/model downloads. Some scene runtime files are served through Pages. That
hosting distinction does not determine Git size: a binary committed to Git still grows
Git even when a copy is hosted on R2. Generated GLBs, textures, previews, archives and
pose-bank binaries should remain external, fetched only for the selected build or scene.
The engine's current package `files` list excludes `packs`, `scenes` and `site`; keep that
boundary when updating authoring-source organization.

| Option | Recommendation and consequence |
| --- | --- |
| One repository, separate engine/content/scene folders | Recommended now. Simple local edits and coordinated releases; keep generated payloads external and content builds optional. |
| One separate content repository | Reserve for measured clone growth or independent content ownership/release needs. Move authored packs and scene controllers together; keep the reusable scene-kit with the engine. |
| One repository per pack or scene | Avoid now. More pins, duplicated shared-material work and cross-repository coordination without a demonstrated benefit. |
| Submodules | Avoid as the default consumer setup. They introduce additional initialization/version coordination. Pinned manifests and explicit optional downloads are simpler here. |
| Git LFS | Use only if original binary source must be versioned. It is not the scene CDN, and automatic checkout can still download large payloads. |

Moving files to a different folder in the same repository does not shrink a normal clone.
Moving them to another repository prevents future engine-repo growth and reduces its
current checkout, but old committed content remains in reachable history. Do not rewrite
published history as a routine part of this work. Document shallow cloning for users
who do not need history. A partial clone can defer blob downloads; sparse checkout alone
only narrows the working tree. Qualify a combined partial/sparse engine-only workflow
before recommending exact path selections.

Measure fresh remote clone transfer, elapsed time and checkout size before and after
content alignment, using no local alternates/cache. Report dependency installation
separately. Track growth in CI and review newly committed generated binary output.
Choose a clone budget from that baseline rather than inventing a size crisis from
decoded history totals. No fresh network clone timing has been recorded in this audit.

### Source layout and a possible future split

Use a consistent logical layout within the current repo, preserving existing routes and
imports while migrating. Only Troy currently has tracked pack source; locate and qualify
the Farm, Vehicles, Bridge and Foundry canonical sources before aligning their folders.
Do not copy whole private workspaces or local evidence directories into public Git.

Suggested logical layout:

```text
packs/<pack-id>/                   # authoring source and release records
content/standalone/<asset-id>/     # standalone source, including Bridge
content/materials/                # source specifications and immutable references
scenes/<scene-id>/                # scene composition and controllers
scenes/packages/scene-kit/        # shared consumer runtime
site/                            # catalog, gallery and download presentation
```

Keep source programs, manifests, material specifications, tests and release recipes in Git.
Preserve Kiln revision identities independently of Git commits. Store generated model,
texture, preview and ZIP payloads in immutable R2 objects with hashes and restore tooling;
Git LFS is an option for original non-generated binary source that needs Git versioning.
Publish self-contained source/history archives so users are not dependent on undocumented
private paths. A release build hydrates exact referenced canonical bytes before invoking
the existing Kiln import/export contracts; do not silently change canonical record formats.
Scene builds fetch only their pinned inputs. Normal engine installation/testing must not
hydrate every scene and pack automatically.

If a future split is warranted, one public content repo (possible name `kiln-commons`)
would own authored sources, published revision records, material references and scene
composition/controllers. The engine repo would retain engine code, maintained skills,
shared scene-kit and site. The site would consume exact content-release manifests and
compiled scene artifacts, with an explicit local development override. Establish clean
rebuild/restore and cross-repo CI before removing any source from the current repo.
Do not initialize the entire existing `kiln-commons` working directory as a public repo:
it contains experiment/evidence/workspace directories unrelated to distributable source.

## Effect on each part of Kiln

| Area | Planned change | Boundary to preserve |
| --- | --- | --- |
| Engine | Validate/export portable runtime and editable records; add only demonstrated gaps in history packaging/capability metadata. | No CDN policy, scene-specific controllers or silent destructive optimization in deterministic exports. |
| Assets and packs | Exact revision inventory, explicit memberships, declared recoverable history, measured runtime derivatives. | Canonical source remains editable; revision IDs, parent relationships, materials and animation pivots survive. |
| Scenes | Consume exact runtime pins, bundle/split code and defer optional content; explicit decoder support where used. | Keep existing gameplay, instancing, culling, LOD and transition stability. Farm/Bridge/Foundry/Troy retain their own scene behavior. |
| Site and gallery | Generate consistent runtime/editable downloads from the inventory, curate entries and use sensible preview tiers. | Bridge remains standalone; gallery membership does not imply pack/project membership. Source history is downloaded on demand. |
| Cloudflare | Immutable versioned URLs, explicit cache eligibility and correct encodings; measure Pages and R2 independently. | Hash verification remains meaningful; never overwrite immutable release objects. |
| Skills and documents | Document profile/tier/encoding distinctions, rebuild/history restoration and tested loader contracts; feed the ear attachment defect into shared fit guidance. | Asset authoring guidance stays general; scene dimensions/controllers stay in their workspace. Verify maintained and generated skill copies. |
| Contributor setup | Keep small source in Git and large generated payloads optional; document engine-only setup and selected-scene hydration. | Engine users can clone/install/test without downloading all public packs. Local development stays here; the hub supplies isolated performance evidence. |

## Technique choices informed by current documentation

- Prefer an explicit glTF Transform recipe for selected derivatives. Its own documentation
  warns that the all-in-one optimize defaults are not ideal for every scene. Inspect first,
  then deduplicate, prune, resample redundant animation keys and evaluate quantization and
  Meshopt compression. Record error tolerances and validate named-node contracts.
- Do not pass Vehicles through an unrestricted gltfpack job: its documentation says unknown
  vendor/custom extensions are discarded. Vehicles rely on `MSFT_lod`, named wheels and
  named paint materials. Preserve the extension through a supported adapter, or publish
  explicit separate tier GLBs with equivalent validated semantics. Names/pivots matter
  equally for shields, weapons, doors, hatches and animated rig bindings.
- Evaluate KTX2/Basis where decoded texture memory and upload cost matter. It needs a
  transcoder and renderer capability detection; it is not equivalent to smaller PNG/WebP
  files. Supply pinned decoder files locally and count their network/CPU costs. Retain
  portable downloads for consumers without these extensions.
- For Troy's pose banks, lossless gzip is a good first transport experiment because browsers
  provide `DecompressionStream('gzip')`, including in workers. Test native capability and
  a bounded fallback, verify decoded byte length/hash and preserve the exact bank bytes.
  Use correct HTTP Content-Encoding if served as HTTP compression, or explicitly decode
  a compressed object; do not mix the two and decompress twice. Brotli's better offline
  result does not justify assuming native browser stream support.
- Use one-year immutable caching for sealed/versioned assets, with fresh URLs on change;
  keep mutable HTML/catalog pointers revalidated. Configure edge eligibility for `.glb`,
  KTX2 and other non-default types on the existing R2 custom domain. Verify GET responses
  and cache behavior, not just browser headers or hosting location. Pages and R2 have
  different cache behavior; measure both, including the actual scene request paths.
- Bundle and split JavaScript by consumer need; stage models/data by the starting view and
  interaction. Reduce duplicate loads and shader variants. Warm the visible first view,
  then schedule necessary later variants before their first use. Do not simply delete
  warmup and move compilation hitches into combat, shadows or fleet transitions.

## Implementation order and concrete checks

1. **Curation and asset fix:** retain Bridge's working gallery entry; remove Battle before
   the gate from the gallery builder, direct gallery page generation and pack-page model
   cards. Keep its archived source/model history. Treat gallery curation separately from
   downloadable pack membership. Create and inspect a new Wooden Horse child revision;
   capture new posters and verify hatch/wheel clips on the exported GLB.
2. **Content inventory and history:** collect exact current assets and available published
   ancestry from the existing authoring workspaces. Find missing parent records before
   claiming history completeness. Align lightweight source in the current repo and create
   a reproducible manifest publisher. Establish fresh clone/setup measurements; defer any
   repo split until its benefit is demonstrated.
3. **Downloads and gallery:** add a combined Vehicles editable pack; individual Farm editable
   bundles; complete declared history packages; Troy editable assets; and consistent runtime/
   editable download UI for assets and packs. Bridge remains standalone with detail choices.
   Make its normal preview use the declared web derivative, with Full explicitly available.
4. **Loading first:** apply versioned-file caching and lossless bank compression; share
   duplicate payloads; bundle Troy; add a measured scheduler and startup phase timings.
   Adopt Foundry's verified initial/deferred boundary where useful in other scenes.
5. **Measured derivative trials:** add explicit supported decoders and capability contracts
   before introducing compressed GLBs. Compare Meshopt, texture choices and LOD separately.
   Preserve or explicitly remap rig part paths before rebuilding dependent pose banks.
   Generic guidance belongs in maintained skills; scene dimensions/controllers stay local.
6. **Release:** validate exact artifact inventories, archive round-trip/history restore and
   representative clean source rebuilds. Check gallery/download flows and corrupted/cancelled
   loads. Measure first-frame and playable times with fresh browser caches, transfer bytes,
   parse/build/compile costs, GPU memory and frame tails across all four scenes. Compare the
   exact before/after candidates on the quiet hub, both backends and actual transitions;
   retain Troy's 60 FPS target at 1440x900 balanced. Test the tablet separately when available.
   Publish only qualified improvements and verify the exact live release and downloaded hashes.

## Proposed worker assignments after alignment

The research, archive/loader audit and repository measurements above are complete.
Implementation, derivative trials and matched hub qualification remain outstanding.
No workers have been launched for this plan.

| Work package | Remaining work and proof | Dependencies |
| --- | --- | --- |
| Delivery and source | Canonical source inventory for every pack/standalone asset; locate missing ancestors; common release manifest; complete declared editable/history archives and runtime pins; clean restore/rebuild. | Agree profile/history contract first. Provide pins/schema before site and loader integration. |
| Trojan Horse | Author a child revision in a separate live Kiln workspace; attach ears in head coordinates; inspect multiple exported views; verify hatch/wheels and refresh poster. | Existing exact source/revision/material inputs. Delivery worker publishes the accepted revision. |
| Site consistency | Retain Bridge; remove Battle before the gate from gallery/routes/cards; common download labels and choices; Vehicles combined editable, Farm individual editable, Troy editable; Bridge web preview. | Can prepare curation/UI independently; final catalogs depend on delivery pins. |
| Troy startup | Instrument phases; bundle modules; lossless compressed banks; deduplicate identical payloads; bounded asset loading; first-view/transition-aware warmup. | Preserve current bank/rig contracts. Measure each change separately before combining. |
| Shared loader and derivatives | Explicit decoder capability support; preservation checks for names, LOD and extras; selective Meshopt/KTX2 trials; apply useful loading improvements across Farm/Bridge/Foundry. | Baseline inventories and metrics. Do not introduce required compressed files before consumers support them. |
| Materials and texture analysis | Inventory unique startup maps, embedded/external storage, resolution/mips, decode/upload and GPU format; compare R2 hydration, shared maps and texture derivatives; keep offline engine materials functional. | Coordinate with delivery and shared loader; external maps require a deliberate consumer contract. |
| Integration and release | Source and archive checks; scene/gallery/download browser flows; fresh clone/setup; matched hub cold/cached startup and combat/fleet frame tails; tablet tier data when available; exact live identity/hashes. | Integrate worker candidates centrally; then commit/push/deploy the qualified result under the release authorization for that step. |

Start with three workers: delivery/source, Horse, and Troy startup. The coordinator
owns the manifest contract and integration. Once delivery pins stabilize, start the
site worker; run shared decoder/derivative trials after startup baselines exist. Avoid
two workers editing the same loader or catalog files. Keep mutation, merge and deployment
centralized. This is a proposed dispatch sequence, not a claim of workers in progress.
The owner authorizes using sub-agents across implementation and adversarial review;
dispatch follows alignment on this documented plan. Give each worker its owned paths,
exact input revisions, dependencies, required evidence and completion conditions. Use
at most the available concurrent slots and reserve a slot for independent review when
a candidate is ready. Asset authors must use a separate live Kiln workspace under the
maintained setup skill, rather than author inside the engine repository.

## Independent adversarial review

Use a reviewer who did not implement the candidate being reviewed. The reviewer should
try to disprove the claimed result using the actual changed interfaces and artifacts,
not just read the author's summary. Keep review bounded to this release's real risks:

1. **Delivery and source:** unpack a representative editable download into a clean
   workspace, reopen/rebuild it with its included materials and restore an included older
   revision. Verify a runtime download works without the author's paths. Check missing
   dependencies and whether supposedly complete history is actually present. Review the
   common inventory and the engine-only setup for accidental large automatic downloads.
2. **Loading and visuals:** challenge decoded-byte/hash handling, decoder support,
   cancellation/disposal, caching assumptions, and any lost names, pivots, LOD or extras.
   Compare cold and cached startup with matched inputs. Exercise the first deferred
   combat/fleet/interior transition to detect costs merely moved out of startup. Inspect
   the Horse ears from several views and preserve the already accepted scene behavior.
3. **Integrated public candidate:** follow real Runtime assets and Editable assets links,
   open Bridge and Troy previews, verify Battle before the gate is absent from generated
   gallery entries, and check simple public copy. Review exact-commit CI and live identity
   after deployment; distinguish measured hub/tablet limits from claimed acceptance.

Reviewers report concrete findings with reproduction, impact and evidence. The coordinator
resolves release-blocking defects and verifies the fixes before declaring completion.
Use one focused review at each affected integration boundary and one final candidate
review; repeat only where changes or findings require it. Taste-sensitive questions can
be brought to the owner with actual pictures or a playable candidate. No new provenance
ceremony or unrelated cleanup is part of this review.

## Completion conditions

- Farm, Vehicles, Bridge, Foundry and Troy offer the agreed runtime/editable choices at
  their relevant asset/pack pages. Editable downloads reopen and rebuild with included
  materials and revisions; technical history scope is accurate inside the package.
- Bridge remains in the gallery with a sensible preview tier, Battle before the gate is
  removed from the requested gallery presentation, and a visually inspected child
  revision fixes the Trojan Horse ears while preserving its functional parts.
- Lightweight authored source, materials metadata and scene code are organized in the
  current repository. Large generated deliveries stay external and optional. A clean
  contributor setup works; fresh clone/setup costs are measured before deciding any split.
- Adopted startup/asset optimizations have matched before/after evidence, work on the
  supported backends, and preserve source editability, visuals, gameplay and transitions.
  Compare the exact Troy candidate to the agreed 60 FPS hub target at 1440x900 balanced;
  report frame-tail/backend limitations honestly and provide measured tablet tier behavior
  when the connected device is available. Proposed loading budgets below remain provisional.
- Relevant engine, skills, site and scene checks pass; independent adversarial findings
  are resolved or explicitly recorded for owner disposition. The authorized final release
  is committed, pushed and deployed with live scene/download flows and identity verified.
- Report completed work, measured improvements and any remaining limitations. Keep local
  development ready to continue and the hub reserved for performance testing. Cleanup
  remains assigned to the separate cleanup task.

### Previously completed scene work to protect during this cycle

The current handoff records the hub-to-local migration and stage-38 gameplay/visual work:
connected terrain/ocean and procedural sand/rock detail; fleet landing/formations;
corrected archers; simple hands/grips; differentiated playable heroes with attack,
block, stamina and bots; shields at the side until blocking with forearms across the
inner plate; corrected A/D and mouse attack bindings; consistent folded secondary HUD;
public scene captures, CC0 assets and normal scene/gallery presentation. This is not
new implementation work and these behaviors were not all replayed in this loading audit.
Add them to the final regression pass, including aerial shore stability, silhouettes,
shield intersections and first combat/fleet transitions. Keep image choices at the
owner-reviewed framing unless the Horse poster or changed geometry requires a recapture.

The final stage-38 matrix recorded slowest case means of 64.70 FPS on WebGPU and
59.36 FPS on WebGL2, with retained maximum intervals of 33.3 and 41.7 ms respectively.
These qualify those sampled workloads, not the new loading candidate or a locked
60 FPS claim. The historical tablet result is reduced-tier evidence, not a 60 FPS promise.
Exact-commit CI, runner availability, download serving and Cloudflare deployment identity
are final release checks; this audit has not re-qualified all of those.
Full army casualties, projectile damage, boarding, wall climbing, an RTS campaign and
the optional living Horse contact work remain outside the agreed scene endpoint.

Proposed loading targets, to calibrate against the new matched baselines: Troy at most
10 MB cold transfer, first visible frame within 3 seconds and interactive within 5 seconds
on the admitted hub under a documented 50 Mbps / 40 ms test profile; cached startup within
3 seconds. These are proposed budgets, not measurements or existing acceptance. Other
scenes get measured budgets under the same protocol; portable model compatibility,
visual quality and transition frame tails must not regress to satisfy a download ceiling.

## References and retained audit data

- [Existing Kiln export contracts](../export-profiles.md).
- [glTF Transform CLI](https://gltf-transform.dev/cli),
  [Meshopt transform](https://gltf-transform.dev/modules/functions/functions/meshopt),
  [dedup](https://gltf-transform.dev/modules/functions/functions/dedup).
- [gltfpack preservation and extension rules](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md).
- [Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),
  [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html),
  [Renderer compilation](https://threejs.org/docs/pages/Renderer.html).
- [Browser decompression](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream).
- [Cloudflare default cache eligibility](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/),
  [R2 caching](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/),
  [Pages serving](https://developers.cloudflare.com/pages/configuration/serving-pages/),
  [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).
- [GitHub repository guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
  recommends storing programmatically generated files outside Git, such as object storage.
- [Git clone filters and shallow history](https://git-scm.com/docs/git-clone),
  [sparse checkout](https://git-scm.com/docs/git-sparse-checkout),
  [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage).
- [Vite build preload and async chunk optimization](https://vite.dev/guide/features.html#build-optimizations).

Local inspection receipts and reproducible helper scripts are in
`site/.localdata/troy-review/`: `delivery-audit.json`, `delivery-content-audit.json`,
`scene-model-audit.json`, `load-static-audit.json`, `load-live-audit.json`,
`git-size-audit.json`, `material-audit.json`.
These local receipts are evidence of this audit, not newly published release artifacts.
