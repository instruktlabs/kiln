# Kiln Commons: Farm pack and website consultation handoff

Prepared 28 September 2026. The Farm pack and playable scene are ready for website
consultation as a technically verified review candidate. Full-pack owner acceptance
and two release decisions remain open. This document authorizes no deployment,
publication, new asset production or website implementation.

## Brief for the receiving agent

Consult on how to integrate Kiln Commons into the existing Kiln website, beginning
with Shapes & Seasons Farm. Inspect the actual site and the exact downloads below.
Propose the information architecture, pack and individual-asset browsing, source
and runtime downloads, interactive scene integration, mobile presentation, and the
role of the historical gallery. Compare a separately hosted scene with a native
React Three Fiber integration, including lifecycle, loading and maintenance costs.
Return a concrete recommendation and staged implementation/validation plan for
discussion before changing the site. Preserve the existing asset provenance,
licensing boundaries, optimization work and measured support limits.

The owner may later want a second distinct pack and scene. Plan an extensible pack
catalog, but do not generate that pack now. Packs need internal visual coherence;
different packs need not share one style. Standalone assets must remain useful
without a project, the demonstration scene, or Kiln installed.

## Three different surfaces

| Surface | Source and purpose | Integration boundary |
| --- | --- | --- |
| Local Workshop | `C:/Users/Mattm/X/kiln-oss`; normally localhost:4318. Authoring Library, optional Projects, materials and Live Review. | Packaged developer tooling. Do not turn its local host APIs into the public catalog backend. Collection `project` is storage, not named project membership. |
| Farm workspace | `C:/Users/Mattm/X/kiln-commons/farm-pilot`; normally localhost:60284. Asset source, project pins, authored scene, delivery and qualification records. | Keep asset authoring outside the engine/site source. Use the sealed downloads for consumer integration. Local ports are conveniences, not public URLs. |
| Public website | `C:/Users/Mattm/X/kiln-oss/site`. Existing React/R3F gallery and marketing surface. | This is the consultation target. No website source was changed during this handoff. |

The engine repository contains uncommitted initiative work. Inspect its current
state before editing; do not reset it, regenerate the historical gallery, rebuild
Farm assets or publish the engine as incidental site setup.

## Exact candidate and downloads

Authoritative pointer:
`C:/Users/Mattm/X/kiln-commons/farm-pilot/review/production/latest-delivery.json`.

Project revision:
`r_0000000033_e782d188f2d265d553cb6881db5298a1b63cd7d7337ae2cce9250b4ad1623a90`.

Current master:
`C:/Users/Mattm/X/kiln-commons/farm-pilot/delivery/review-r33-documented.zip`
(24,755,128 bytes), SHA-256
`5a035da37ba7bdedc0a681aa851f097318b76bfc9c4cbfcedc87b6b78a93cb5d`.

Use the three consumer downloads from
`C:/Users/Mattm/X/kiln-commons/farm-pilot/delivery/farm-r33-documented-downloads`:

| File | Bytes | Purpose |
| --- | ---: | --- |
| `shapes-and-seasons-farm-runtime.zip` | 7,672,584 | 23 standalone GLBs, metadata and applicable notices for use in another application. |
| `shapes-and-seasons-farm-editable.zip` | 22,422,357 | Asset source, materials/recipes, pinned rebuild kit and authoring metadata. |
| `shapes-and-seasons-farm-scene.zip` | 4,289,186 | Runnable scene, editable scene modules, runtime assets and bundled browser dependencies. |

`downloads.json` beside these archives is the machine-readable index, including
their SHA-256 hashes. `delivery.json` inside each archive seals its members.
The current index explicitly records `fullPackAccepted: false`. Do not describe
an earlier archive or working tree as this exact candidate.

To run the portable scene, extract its archive into a fresh directory and execute
`node scene/serve.mjs` from that directory. Open the printed loopback URL. Viewing
needs no npm install, provider account or Kiln render service. The supplied server
checks sealed bytes; customize a copy using a development server. Rebuilding
editable assets requires installation of locked npm dependencies first; the kit
does not contain every third-party npm archive for a completely offline install.

The package records a CC0-1.0 designation for authored asset content to the extent
of the owner's rights. Preserve `licenses/`, `metadata/materials.json` and scene
software notices. Kiln, scene code, Three.js, BVH and Field Grass retain separate
software licensing. Do not label every file in the downloads CC0. Model and
refinement histories are deliverable metadata; private agent traces are not.

## What is built and verified

There are 23 inventory assets, ten material records and 30 maps. The scene contains
589 pack placements, a surrounding woodland of 843 trees, living animal behavior,
textured meadow/terrain, flowing stream presentation, and the corrected mill
placement and wheel direction. Desktop third-person play includes doors, gates,
the bridge and kinematic tractor driving. Mobile is an orbitable viewing experience.
Trailer towing, general vehicle physics and mobile walking/driving are not included.

The scene uses Three.js 0.186.1 `WebGPURenderer`, with WebGPU primary and WebGL2
fallback. Applied optimizations include shared textures, spatial instancing,
packed woodland, selective shadows, static-transform/frame-graph work and quality
tiers. Grass and small plants do not all cast shadows. There are no authored LOD
chains or tree impostors. Preserve the qualified batching, animation and collision
behavior instead of replacing it merely to fit a UI framework.

Existing evidence includes 88 consumer tests, independent runtime/scene browser
checks on both backends, native desktop input/fullscreen checks, physical tablet
touch/orientation/resume checks, and 23/23 byte-identical asset rebuilds on the
reported environment. That is not proof of untested engine imports or universal
cross-platform byte identity.

The latest repack changed documentation only. Hash comparisons prove unchanged
scene modules, runtime GLBs, editable source and rebuild dependencies relative to
the measured candidate; earlier functional and performance evidence carries
forward through that identity, rather than a claim of newly repeated testing.

For this handoff, all three archives were copied to the hub and independently
checked for archive/member hashes, inventory, provenance, embedded runtime GLB
resources, promised clips and fresh extraction. The portable server successfully
served 28 checked routes, including all 23 models, on Linux/Node 22.23.2 without
npm installation. The temporary server was stopped. Receipt:
`C:/Users/Mattm/X/kiln-commons/farm-pilot/review/production/hub-handoff-package-check-r33.json`.
This was a distribution/HTTP check, not a new rendering or performance result.

## Performance and remaining release decisions

| Evidence | Measured result | Limits |
| --- | --- | --- |
| RTX 3070 / Ryzen 7 3700X, Chrome 153, native 1920×1080/DPR 1 | 24 repeated first-use/orbit/route/driving cases across both backends: 143.5–144 median FPS; p95 frame interval 7 ms; worst 27.9 ms; none over 50 ms. | This named machine and workload; host flags retained. No general 144/60 FPS promise. |
| Persistent desktop pages | About 7.7 minutes per backend, alternating workloads; stable renderer accounting and settling heap/process memory. | Bounded stability evidence, not a leak-free guarantee. Observer controls found no consistent FPS penalty, not zero measurement cost. |
| Samsung Tab S9 FE 5G, Android 16, Chrome 153, fullscreen Economy, 617×987 | About 12 minutes; orbit/route median 34.20/44.68 FPS, p95 interval 33.3 ms. | Worst orbit gap 83 ms remains unexplained. USB charging; other mobile devices unqualified. |
| Startup | First measured WebGL2 load 18.82 seconds; subsequent WebGL2 and measured WebGPU loads about 2.75–2.99 seconds. | Fresh browser profile did not clear driver/disk caches. Local serving does not qualify hosted download latency. |

Three items remain for release acceptance:

1. Decide the mobile default. Economy is the qualified tablet configuration;
   High is still the actual default. Recommendation: Economy for the mobile
   experience with an explicit quality override, then qualify the implemented
   selection policy. No automatic switch was made without that decision.
2. Decide the WebGL2 startup trade-off. Recommendation: retain fallback and allow
   a bounded, attributed startup pass during integration. Keep full-scene loading
   behind an explicit Explore action so it does not block the pack page/downloads.
   Accepting the limitation is also a valid owner decision; R3F itself is not a fix.
3. Complete consolidated review of the exact pack and scene. Eight exact asset
   revisions have recorded approval; the full 23-asset candidate remains pending.
   Earlier general approval does not silently approve later refinements.

Do not repeat rejected experiments unchanged: broad shader prewarming moved cost
into startup; matrix-capacity padding increased storage without reducing the 198
programs in that diagnostic. The latter was not adopted. Startup attribution
points at shader initialization/link waiting. Preserve the first-visit result
separately from steady-state frame performance.

Current hardware constraints: this PC has other Codex and Claude agents running.
Use SSH host `hub` for new runtime checks, first inspecting its current CPU/GPU
workload. The hub GPU was idle during this handoff's snapshot; that is not ongoing
reservation or quiet-window proof. The Samsung tablet is disconnected. Do not
disrupt other agents or report new mobile qualification without reconnecting it.

## Existing website and integration choices

The public site already uses React and React Three Fiber. Its declared dependencies
include Fiber `^9.7.0`, Drei `^10.7.8`, React `^19.3.0` and Three.js **0.186.0**;
the Farm uses **0.186.1**. Check the actual lockfile before planning a version change.
The existing R3F `Canvas` config uses its default WebGL renderer, not the Farm's
WebGPURenderer. In particular, retaining that default will not preserve the Farm's
TSL/NodeMaterial path merely because both applications use Three.js.

Inspect these site files first: `src/App.tsx` (hash routing and lazy viewer),
`src/types.ts` (single-specimen data model), `src/Downloads.tsx` (individual-asset
links), `src/Viewer.tsx` (Canvas, inspection and Drei helpers), `src/repo.ts`
(base-relative URLs), `vite.config.ts` and `README.md`.

The site already loads posters/text before the interactive renderer. Preserve
that approach. It has no pack catalog/route or three-profile download model yet;
its one legacy asset-index fetch currently gates every route. Define packs and
assets separately so a pack can be browsed/downloaded without loading the full
Farm or depending on the historical gallery index.

Two reasonable integration options need an explicit comparison:

- **Separate runnable scene, launched on demand:** lowest initial disturbance to
  the qualified runtime; can use a dedicated page or lazy iframe. Assess navigation,
  fullscreen permission, focus, resize, pause/unload, accessibility and URL policy.
  An iframe keeps renderer ownership separate but still consumes GPU/memory while
  alive. Do not leave two active scenes behind route transitions.
- **Native R3F scene:** tighter UI/state integration and shared site conventions,
  but requires an adapter for loading, renderer initialization, frame scheduling,
  input and cleanup. Reuse GLBs, layout, controller/animation/batching modules and
  quality policies. Give either R3F or the existing runtime ownership of the frame
  loop; do not run both. Avoid per-frame React state for herd/vehicle animation.

The Farm's `scene/showcase/viewer.mjs` owns a canvas, DOM listeners and animation
loop, and its HTML/import map and fetches use root-relative URLs. A subpath mount
is not a direct file copy. The existing site's relative-base behavior must be
preserved. Audit the node-material stream/grass, animation ownership, shared
resource disposal and existing Drei helpers against the chosen renderer. React
Strict Mode remounts and navigating away/back need explicit tests.

Useful official references for the consultant:
[R3F Canvas](https://r3f.docs.pmnd.rs/api/canvas),
[R3F performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls),
[Three.js WebGPURenderer](https://threejs.org/manual/en/webgpurenderer.html).
Use documentation matching the selected stable versions, rather than applying
R3F next-version configuration examples to the current Fiber 9 site.

## Requested consultation outputs

1. A proposed Commons navigation and pack-page layout: preview, asset inventory,
   individual orbit/animation review, Explore scene, clear runtime/editable/scene
   downloads, compatibility, size, licensing and author/refiner/thinking metadata.
   Do not conflate requested and independently confirmed model effort.
2. A domain/routing recommendation: main-domain Commons section versus subdomain,
   based on the real hosting/deep-link/cache constraints. No DNS changes yet.
3. A recommendation for the historical gallery: keep it accessible as earlier
   examples while emphasizing new packs, or propose an alternative for discussion.
   Do not present those historical assets as newly qualified pack content.
4. A concrete scene integration choice and module boundary, plus a manifest-driven
   content pipeline that binds posters, models, source and downloads to one revision.
   Inspect build inputs before choosing whether to reuse or extend the gallery builder.
5. A staged implementation plan with owner review points and a hosted-validation
   matrix: first visit, forced WebGL2, backend unavailable, load failure, route
   transitions, fullscreen/input, real mobile, download hashes and scene teardown.
   Measure the hosted result independently; local FPS does not qualify CDN loading.

Consultation is complete when the owner has a reviewable recommendation and clear
implementation scope. Public launch additionally requires the three decisions
above, any resulting source changes to be requalified/repacked, owner approval
of the site presentation, and explicit publication authorization.

## Evidence entry points

All following paths are under
`C:/Users/Mattm/X/kiln-commons/farm-pilot/review/production/`:

- `launch-readiness-checklist.md` and `documented-download-closeout-r33.md`:
  current acceptance state, packaging scope and carried-forward identity.
- `owner-review-r33.md`: all 23 review links and asset authors/refiners/effort.
- `desktop-qualified-r33.md`, `desktop-observer-r33-s3.json`,
  `desktop-soak-r33-t3.md`: final named desktop evidence.
- `mobile-fullscreen-r33.json`, `mobile-observer-r33.md`,
  `input-lifecycle-r33.md`: mobile and trusted interaction evidence.
- `desktop-startup-attribution-r33.md`, `performance-next-experiments-r33.md`,
  `instance-capacity-diagnostic-r33.md`: attribution and rejected experiments.
- `game-integration.md`, `crop-placement.md`, `skill-feedback-r33.md`:
  consumer responsibilities and lessons incorporated into Kiln guidance.

The downloadable consumer performance guide is
`delivery/review-r33-documented/metadata/performance-and-devices.md` in the Farm
workspace. The engine's foundation checkpoint and shared scene skill describe
developer tooling; they do not supersede this Farm candidate's acceptance state.
