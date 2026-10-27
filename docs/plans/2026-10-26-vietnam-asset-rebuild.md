# Vietnam asset rebuild on the Holodeck pack pattern

Dated plan, 26 October 2026. A record of its day: it does not override current code,
`AGENTS.md` or the changelog, and implies no release or art acceptance. Scope is every
Terror in the Jungle asset family **except characters**, at the owner's direction.

## Verified ground truth

| Thing | State |
| --- | --- |
| Kiln engine | `/home/matthewk/X/kiln`, branch `assets/vietnam-rebuild-20261026`, main @ `eac0052`, **1.5.0**, deps installed, toolchain Bun 1.4.2 / Node 22.23.3 |
| Game | `/home/matthewk/X/vietnam-war-sim`, branch `assets/kiln-rebuild-20261026`, main @ `c70b0051`, clean |
| Lineage | V1 `terror-in-the-jungle` (AGPL, 2025-09-10) → V2 `terror-in-the-jungle-vr-experimental` → **V3 `vietnam-war-sim`** (proprietary, Instrukt Labs) |
| Workspace | Sim repo adopted via `kiln-init --adopt --harness claude`; `AGENTS.md`/`CLAUDE.md` preserved; generated files gitignored (machine-specific absolute paths) |
| Three.js | Engine render deps and the game both pin **0.186.1** — exact match |
| Exporter | `legacy`, `skinning: false`. `KILN_GLTF_EXPORTER=three` enables skinning/morphs/UV2+ |
| Renderer | `auto`, installation `ready`, `http://127.0.0.1:8000`, on-demand. **GPU readiness untested** |
| `assets.exportTo` | `null` — `KILN_EXPORT_ROOT` not configured |

The rebuild is not a file swap. The game tracks **11 GLBs** (9 character LODs, 2 fixtures);
weapons, vehicles, vegetation and props are **~17,400 lines of procedural TypeScript** across
77 non-test files. We are replacing live code paths with delivered assets.

## Why the Holodeck pattern fits

Holodeck already runs packs of 8–53 assets with a verified delivery chain, which answers the
"all of them at once" question: the scale is routine. Reused mechanics:

- **Freeze record per asset** (`selection.json`): `store`, `collection`, `assetId`,
  `revisionId`, `parentRevision`, and `{bytes, sha256}` for `manifest`, `source`, `canonical`
  and `preview`, plus `placements[]` naming where it is used. Assets are shared across packs
  by design.
- **Canonical vs runtime.** The authored `asset.glb` is canonical. Runtime GLBs come from
  `kiln export <assetId> <revisionId> --profile runtime`, run in a throwaway workspace holding
  only that revision, then `verifyRuntimeProfile(canonical, runtime, metadata)` proves the
  runtime product keeps the canonical binary.
- **Sidecar names its revision.** Runtime metadata carries `source.assetId`,
  `source.revisionId`, `source.glbSha256`, `source.sourceSha256`; staging rejects a sidecar
  naming another revision.
- **Two bundles per asset**: editable (source + manifest + `materials.kiln.json` closure) and
  runtime (model + metadata + licence).
- **Approval by slug and exact revision** (`HOLODECK_APPROVAL`). A pack is available only when
  every asset it lists is approved; a new revision sends the pack back to review.

That last one is the real prize. The game's docs repeatedly record art as *unaccepted*; this
gives per-asset, per-revision owner sign-off instead of one global verdict.

## The integration seam

Already load-bearing, so we extend it rather than invent one:

- `src/characters/character-assets.ts` → `loadDeliveredGltf(url, label)`, records sha256
- `src/delivery/gzip-envelope.ts` → gzip member delivery (GLTFLoader cannot read it directly)
- per-family `manifest.json` → revision, provenance, axes, counts, clips
- `npm run build` → `menu-art/check.mjs && audio:check && characters:check && tsc --noEmit && vite build && postbuild-delivery.mjs`

Kiln's freeze record and the game's manifest+sha256 discipline are the same idea. The join is
a generator that emits the game's manifest from Kiln's `selection.json`.

## Scope: four families, characters excluded

| Family | Assets | Source today | Fit |
| --- | --- | --- | --- |
| Weapons | 10 — M16A1, M14, M14 NM, M60, M79, M3A1, M1911A1, Type 56, Type 54, Mosin M1891/30 PU | `rifle.ts` (M16A1, `M16A1_source_study`), `type56.ts`, `pistol.ts`, `precision-rifle.ts` | **Best.** Parametric hard surface; `extrudeProfile`/`revolveProfile`/`roundedBoxGeo` + bevels |
| Vehicles | 6 — PT-76, M48A3, M113, M35 Cargo, UH-1D/H, AC-47 Spooky | `pt76-model.ts`, `tank-model.ts`, `uh1-model.ts`, `vehicles.ts` | **Good.** Rigid articulation (turret, rotor) via articulation recipes + runtime posing |
| Vegetation | ~13 — 6 workshop generators, palm/banana/fan/coconut clumps, dầu rái, deadwood, far-tree impostors | `tropical-plants-view.ts`, `*-clump-source.ts`, `x4-far-trees.ts`, `vegetation-indirect.ts` | **Highest payoff, most coupling.** See decision D1 |
| Props & structures | ~10 — supply crates, firebase, bank dressing, squad markers, rocket, cannon, range boards | `supply-view.ts`, `firebase-view.ts`, `bank-dressing-view.ts`, `deadwood-view.ts` | **Good.** Static dressing, few contracts |

~39 assets — inside the Holodeck range (Meridian Sanctuary is 53).

**Characters stay out.** Not a capability gap but a cost one: they feed a derived
`combat-palette.bin` (1.9 MB) + `combat-palette.json` from `characters:bake`, affine-packed,
96-pose shared GPU palette, 53 bones, 10 clips, `right-positive-x-v1` contract, over CC0
Blender Studio anatomy. Replacing that means re-deriving the palette and passing
`characters:check`, at the family whose art is least settled.

## Reference, not parity

Owner direction, 26 October: the existing procedural assets are **reference, not
specification**. The goal is better, more optimized and more coherent — not a transliteration
of 17,400 lines of `THREE.BoxGeometry` into Kiln calls. Copying the current silhouettes would
inherit their compromises and spend the whole budget proving we changed nothing.

That splits every asset into two layers, and the distinction governs every review:

**Non-negotiable — mechanical contracts.** Break one and the game breaks.

- Socket and grip transforms, as the source exports them. The M16A1 names rearSight, frontSight,
  muzzle, magazine, rightWrist and leftWrist in metres facing -Z; the weapon must sit in the hand
  and the sight must align in ADS
- Units, orientation, pivot: metres, glTF +Y up / -Z front, pivot where the game expects it
- Collision category, cover and concealment properties
- LOD tier count and switch distances the runtime already selects on
- Bounds, including animation and wind extents

**Free to improve — everything else.** Silhouette, proportion, surface detail, material
assignment, topology, triangle distribution, LOD strategy.

**Coherence is a deliverable, not a side effect.** ~39 assets authored one at a time will not
read as one set by accident. Two mechanisms carry it:

- A **Kiln project record** with the brief, design, inventory and pinned material dependencies.
  Create it before P1: `kiln project create --id vietnam-rebuild`. Standalone authoring is the
  default, so authoring calls must pass `--project vietnam-rebuild` explicitly.
- A **shared material family** pinned in that project and frozen by SHA-256 in the pack's
  `materials.kiln.json` closure. The art direction already names its anchors: deep green
  `#263C32`, mid foliage `#52664A`, new growth `#85916A`, dry vegetation `#9B9673`, warm earth
  `#71604B`, mist `#ADB7AF`, restrained sky `#BACBD0`, with weapon metal mostly dark and
  controlled edge highlights. Those are art-direction swatches to test under the review rig,
  not values to paste into a linear shader.

Shared materials also serve the optimization goal directly: fewer distinct material slots means
fewer draw calls after batching, which `measured.instancedDraws` reports.

Because parity is no longer the test, **`geometryIdentical` is not the goal either** — expect it
false. It stays useful in the other direction: proving a *later* optimization of an accepted
revision did not move the silhouette.

## Modular kits, not one-off assets

Owner direction, 26 October: the win is not the per-asset draw-call reduction on its own. These
are **modular kits optimized as a pack**, replacing scattered procedural code, so the gains
compound as families land. Three consequences:

- **Share parts across assets, not just materials.** Weapons share receivers, rails, sights,
  magazines, stocks and furniture; vegetation shares trunk, branch, frond and leaf modules;
  vehicles share road wheels, hatches, optics and stowage. Author the module once, reuse it by
  reference. Holodeck already does this — one `structure` revision is placed in five packs, and
  `selection.json` records every `placements[]` entry.
- **The pack is the optimization unit.** A shared material family cuts distinct slots across the
  whole set, which is what `measured.instancedDraws` reports after batching. Per-asset budgets
  stay advisory; the number that matters is the aggregate on a loaded scene.
- **Later assets should get cheaper.** If weapon 8 takes as long as weapon 2, the kit is not
  being reused and the approach needs revisiting. P0 measured ~50 min for the first asset and
  estimated 20-30 min per weapon once helpers move to a shared module — track that.

**Visual review is part of delivery.** The owner wants to see each asset as it comes out. Render
a six-view contact sheet per asset from its program on the GPU rig
(`kiln render <program> --views <png>`), confirm `viewFidelity.materialFaithful` is true, and
keep the sheet with the revision — Holodeck's `rig-posters.mjs` under `review-neutral-v1` is the
precedent. A CPU sheet shows shape only and is not material evidence.

## Where shading lives: Kiln makes geometry, the runtime shades it

Owner direction, 26 October, and Holodeck already works this way.
`scenes/packages/golden-gate/src/world/water-material.ts` is one TSL graph for WebGPU and WebGL2
— Gerstner waves with per-wave footprint fading, analytic slopes, Schlick Fresnel, planar
reflection, per-channel Beer-Lambert body, GGX sun, Jacobian whitecaps, depth-fade edges — all
applied to Kiln-authored geometry. Kiln made the mesh; none of that shading is in the asset.

**The division of labour:**

| Kiln owns | The game's runtime owns |
| --- | --- |
| Geometry, LOD tiers, UVs, topology | TSL shader graphs |
| Material *slots* and base factors | Wind sway, lighting response, atmospherics |
| Named parts, sockets, colliders | Instancing, indirect draw, impostor bakes |
| Baked per-vertex attributes | How those attributes are interpreted |

**The game already has this architecture.** Its vegetation path sets named per-vertex attributes
— `wind` (8 call sites), `role`, `frond`, `plantPose`, plus `waterFlow` and `waterDepth` — and
reads them as `aWind` / `windWeight` in TSL. The shaders exist and are not being rebuilt. What
changes is only where the geometry carrying those attributes comes from.

**How foliage actually carries wind — the real contract, from the live Holodeck repo**
(`/home/matthewk/X/holodeck/src/world/foliage-contract.mjs` and `asset-foliage.mjs`, not the
frozen pack copies). A scene binds foliage as
`{ nodes: [1..16 exact mesh node names], translucency: 0..0.5, wind: { amplitude: 0..0.25,
frequency: 0.1..3, direction: unit XZ, weight: 'uv-y' } }`. `weight` must be literally `'uv-y'`:
**the sway weight is the V coordinate of TEXCOORD_0**, so no custom attribute and no channel
packing is needed. Kiln exports `uv` natively.

What that requires of a Kiln foliage asset, enforced by `validateFoliageBinding`:

- UVs authored so **V runs 0 at the anchored base to 1 at the free tip** — that gradient *is* the
  wind weight, and the runtime squares it (`uv().y.clamp(0,1).pow(2)`)
- one mesh node per named foliage part, each a **single-primitive** mesh, 1-16 parts
- a **lit** authored material; `KHR_materials_unlit` is rejected
- `TEXCOORD_0` present as VEC2, same count as POSITION, float or normalized

Everything else is runtime and belongs to the scene, not the asset: two-octave sway
(`sin(phase)*0.8 + sin(phase*2.3)*0.2`) with a vertical lift term, per-instance phase from world
XZ (`origin.x*0.37 + origin.z*0.23`) so instances never sway in lockstep, a translucency backlight
(`(-normalWorld . light)^1.4` scaled by sun intensity, added as emissive), double-sided shadows,
and per-config material caching with reference counts. `sampleFoliageWind` mirrors the same maths
on the CPU for tests.

The payoff is that **the same Kiln asset is a calm fern or a storm-blown palm by scene config
alone** — amplitude, frequency and direction are placement parameters, never re-authored geometry.

The game's own vegetation currently reads a named `wind` attribute (`setAttribute('wind')`,
`aWind`, `windWeight`) rather than UV.y. Since Kiln's exporter writes a fixed attribute set
(`position`, `normal`, `uv`, `uv1`, `tangent`, `color`, `_edge`, `_cavity`; no arbitrary names),
the vegetation spike's real question is narrow: **adopt Holodeck's `uv-y` convention, or have the
game's shader read UV.y where it reads `aWind` today.** Both are small. Inventing a packing scheme
is not needed and should not be attempted.

Worth mining from the same repo before P4: `world-materials.js`, `water-optics.mjs`,
`sun-shadow.mjs` and `static-batches.mjs` are a shared runtime material and batching system, which
is the same compounding argument as modular kits applied to shading.

**`bakeSurfaceAttributes` is the coherence lever for the whole pack.** It bakes `_edge` (convex
edge weight from the dihedral angle, smoothstepped over a threshold, plus one-ring smoothing) and
`_cavity` (cosine-weighted hemisphere ray occlusion), both unitless 0..1, written as glTF
`_EDGE`/`_CAVITY` and read back by three's `GLTFLoader`. One shared shader consuming them gives
the art direction's "controlled edge highlights" across all 39 assets at once, rather than
per-asset texture work — and it is the structural fix for the owner's "too dark, highlights not
landing" note on the M16A1. **Caveat: no Kiln program in `packs/` or `scenes/` calls it yet.**
The capability is documented and unused, so we would be first; budget a spike rather than
assuming it drops in.

## Per-asset pipeline

1. Author in the adopted workspace. Read the existing builder as **reference**, then design the
   asset properly. Honour the functional contracts exactly: the exported socket constants
   (e.g. `RIFLE_SOCKETS` in `src/game/rifle.ts`), `gun-contact.ts`,
   `weapon-pose-adjustment.ts` and `character-weapon.ts`.
2. `defineBudget` with `triangles`, `images`, `decodedBytes`, `materialTier`; `--strict-budget`.
3. `simplifyGeometry({ ratio | targetTriangles })` for LOD1/LOD2 — material groups simplified
   separately with boundaries locked. Never implicit, never to meet a budget.
4. Review under `review-neutral-v1` on the GPU service. A CPU view is shape only, never
   material evidence — check `viewFidelity` before any material claim.
5. `kiln_save` with `parentRevision` → `comparison` gives triangle/vertex/draw/material deltas
   and `geometryIdentical`. This is how "optimized" gets measured, not asserted.
6. Freeze into `packs/vietnam/selection.json` on the Holodeck schema.
7. `kiln export --profile runtime` with `--max-lod N` and `--position-bits`; verify the runtime
   product against canonical.
8. Emit the game's `manifest.json` + gzip envelope; land under `public/`; wire the call site
   from procedural builder to `loadDeliveredGltf`.
9. Owner approval by slug and exact revision before the family counts as delivered.

## Adversarial review

Owner direction, 26 October: these should be AAA-quality assets. Author-and-accept does not get
there, because the author grades its own homework. Every asset gets a pass before `kiln_save`
whose job is to find what is **wrong**, not to confirm it is right:

- the art direction in the game's `docs/ART_AND_ASSETS.md` §1 — silhouette first, large forms
  carrying the image, value separation, weathering that describes use
- real-world reference proportions, named specifically, not "looks right"
- silhouette readability at LOD2 distance, not only LOD0 up close
- **the destination's own audits**, not just Kiln's QA. P0 shipped geometry with two floating
  parts (front sight post 2 mm off the A-frame, magazine catch 0.85 mm off the receiver) that
  Kiln's QA passed and the game's `gunContact` caught, because welding per material hides a
  floating primitive inside a mesh Kiln treats as one part

Fix what it finds, re-render, then save. A second pass that finds nothing substantive says so
rather than inventing work. D0's ceiling bounds *appearance* iteration; measurement-driven
defect repair is not iteration.

## Operational note: rebuilding the engine invalidates adopted workspaces

`node scripts/build-runtime.mjs all` changes the cli, engine and worker hashes that every
adopted workspace pins in `.kiln/workspace.json`, and the managed launcher then refuses to serve
tools ("Kiln workspace is out of date"). Observed on 26 October after the `defineBudget` fix.
The remedy is `kiln-init <workspace> --check` then `--upgrade` from the engine checkout,
followed by an MCP session restart; only `.kiln/workspace.json` changes and instruction files
are preserved. This matters once P1 runs several authoring sessions: an engine change mid-batch
stops every one of them until each workspace is upgraded, so land engine fixes between batches,
not during.

## P1 structure: per-family lanes

Owner approved on 26 October, to take effect **once P0 reports** — never while an authoring
session is live, for the reason in the operational note below.

Our P0 shape was one adopted workspace, three skills, one sequential lane. That was right for
proving the seam and wrong for 39 assets: Holodeck ran **188 assets across 7 stores**
(`island-trial`, `holodeck-assets`, `courtyard-plaza`, `tropical-island`, `marble-sanctuary`,
`winter-mountainside-cabin`, `winter-tree-repair`), authored in parallel and merged at
`selection.json`. A store is one workspace's `assets/kiln` directory.

**Order matters more than the parallelism.** Fan out before the kit exists and each lane invents
its own helpers, proportions and material calls — 39 one-offs produced faster, which is the
opposite of the compounding in "Modular kits" above. Holodeck's stores are per *scene*: coherent
units with a shared brief, not arbitrary shards. So:

1. **Finish the kit in one lane first** (P0's current work plus the two steps below). The shared
   helper module P0 identified is what takes a weapon from ~50 min to 20-30.
2. **Create the project record**: `kiln project create --id vietnam-rebuild --name "Vietnam
   rebuild"`, then set its brief, design, inventory and pinned material family. Authoring calls
   then pass `--project vietnam-rebuild` explicitly, since standalone is the default.
3. **Install the batch skill**: `kiln-init /home/matthewk/X/vietnam-war-sim --adopt --harness
   claude --skills batch`. Verified by dry run that `--skills` applies to an adopted workspace
   (4 files; it is documented on the empty-directory form). `kiln-batch-dispatch` carries the
   clean-room discipline: identical briefs, isolated workspaces, retained provenance, and
   separating provider, harness, tool and asset-quality failures.
4. **Then four lanes, one store each**: `vietnam-weapons` (10), `vietnam-vehicles` (6),
   `vietnam-vegetation` (~13), `vietnam-props` (~10).

**Lane mechanism — git worktrees of the game repo, each adopted as a workspace.** Preferred over
detached clean-room workspaces because contract access is the single biggest proven win: P0 read
`RIFLE_SOCKETS`, `gun-contact.ts` and `weapon-pose-adjustment.ts` directly and landed 0 µm socket
error, which a detached workspace could not have done without hand-briefing every dimension. Each
worktree also gets its own branch, so lanes never contend on the same files. Authoring worktrees
do not need `npm ci`; only the integration lane builds and tests.

**Integration stays one lane, once.** Lanes author and save; a single integration pass writes
`public/`, the manifests and the gzip envelopes, and wires call sites. Four sessions writing the
game's delivery paths concurrently is how the seam gets broken.

**Adversarial review gets its own workspace.** An author grading its own work finds less. The
reviewer takes the same brief in a separate workspace and reports against the checklist above.

## Phases

- **P0 — seam (1 asset).** One weapon end to end through all nine steps, including the build
  gates and a GPU review. Non-negotiable first step: it is the only thing that converts this
  plan from estimate to fact. Everything after it is repetition.
- **P1 — weapons (10).** Sight and grip geometry is a known acceptance criterion; native
  inspection has previously caught grip and sight errors, and the M16 rear notch was revised.
- **P2 — props & structures (~10).** Cheapest parallel batch, no precision contracts.
- **P3 — vehicles (6).** Articulation per asset; damage states and the aftermath surface stay
  game-side.
- **P4 — vegetation (~13).** Only after D1. Highest draw-cost win: `measured.instancedDraws`
  reports what the runtime target leaves after batching `repeatInstances` groups.

## Kiln improvements this project has earned

Evidence from the P0 seam proof, ranked by whether fixing it would change outcomes here. Fixed
already on `assets/vietnam-rebuild-20261026`: the `defineBudget` repair advice understated the
contract, and `images: 0` was rejected although zero is the honest cap for an untextured asset.

**Tier 1 — would change outcomes.**

1. **No floating-part check for hard-surface assemblies (Core).** `CHAR_CONTACT_FLOATING`,
   `CHAR_CONTACT_BURIED` and `CHAR_CONTACT_MISSING` cover characters; `ARCH_ENVELOPE_GAP` and
   `MOD_JOIN_OVERLAP` cover architecture and modules; `GEO_PART_SELF_INTERSECTION` covers a part
   against itself. **Nothing covers one part of a prop floating off another.** P0 shipped a front
   sight post 2 mm off its A-frame and a magazine catch 0.85 mm off the receiver; both passed
   Kiln QA and were caught by the game's own `gunContact`. Per-material welding compounds it: the
   floating primitive sits inside a mesh Kiln treats as one part, so a part-level probe would also
   miss it — detection needs connected-component analysis within a part. This failure mode applies
   to 26 of our 39 assets (weapons, vehicles, props). Highest value.
2. **Draw diagnostics exclude shadow, reflection and depth passes (Core).** A standalone asset
   cannot count a scene's shadow passes, so the exclusion is correct — but the receipt reports
   `draws` without stating it, and that number reads as the cost. Holodeck's own farm view drew
   583 with **270 in shadow**. For dense vegetation the shadow term dominates, and the sim drives
   foliage shadows through `castShadowPositionNode`, re-drawing each casting mesh per shadow map.
   Stating the exclusion in the receipt would stop every per-asset number reading as optimistic.
3. **Textured GLBs cannot be read headless (Core).** P0's measurement, not reproduced here:
   `GLTFLoader.parseAsync` throws `ReferenceError: self is not defined` from `loadImageSource`,
   because three's image path wants a DOM. The rifle's Node test works only because the rifle is
   untextured; vegetation and props both need a different pattern, and P0 hand-rolled a direct
   JSON/BIN chunk read. Kiln already reads those chunks internally; exposing that would stop every
   consumer reinventing it. Relevant before P2/P4 test scaffolding is written against the rifle.

**Tier 2 — friction.**

4. **No foliage integration guidance (skills).** `foliageCardGeo` and `recipe:foliage-cutout-v1`
   cover foliage geometry; nothing covers how foliage meets a runtime wind system. Holodeck's
   `uv-y` contract is undocumented in Kiln. `kiln-compose-scene/references/runtime-scenes.md` is
   the natural home, with the caveat that a scene convention must not read as a requirement for
   standalone assets.
5. **`bakeSurfaceAttributes` is documented and entirely unused.** No program in `packs/` or
   `scenes/` calls it, yet `_edge`/`_cavity` driving one shared shader is exactly how a 39-asset
   pack gets coherent edge highlights. Discoverability rather than code.
6. **A `dist` rebuild invalidates every adopted workspace at once (tooling).** Observed here. With
   four P1 lanes that is four simultaneous stoppages; an "upgrade every known workspace" command,
   or hash tolerance for doc-only changes, would remove it.
7. **The exporter writes no material names (Core, verified 26 October).** All three of the
   M16A1's materials are unnamed in the delivered GLB. A consuming runtime that wants to
   de-duplicate materials to one canonical instance — which both `rigid-merge` and
   `vegetation-indirect` require, since they key on `uuid` — has no stable authored key to use and
   must hash the factors instead. Small, concrete, and it blocks a registry the weapons pass needs
   at its opening. **This one is ready as stated**, unlike items 1-6.
8. **`AGENTS.md` omits `bun run build:sdk`** before `typecheck`, so a clean checkout gives four
   confusing self-reference errors. One line.

## Adversarial review of the list above (26 October)

The owner asked for an adversarial pass on my own findings. It substantially revised them: **one
of seven is ready to implement.** Arguing against each:

1. **Floating-part QA — WITHDRAWN, 26 October. The feature already exists.** I claimed nothing in
   Kiln covers one part of a prop floating off another. That is false. **#220 shipped as
   COMPLETED on 23 October**, and the changelog records it: parts that rest on an external support
   can be declared, which turns "the floating-parts warning to an informational line, and its
   connectivity observation becomes" advisory. `src/qa/geometry-relations.ts` exposes `contact`,
   `clearance`, `penetration`, `containment`, `coverage`, `alignment`, `concentricity` and
   `tolerance`. Open **#277** extends the same mechanism to neighbouring modules and states the
   relationship explicitly.

   **What survives is narrower**, now tracked as **#289**: why the existing warning did not report
   the M16A1's front sight post 2 mm off its A-frame, with per-material welding hiding the
   primitive inside a single part as the suspected cause. That needs a reproduction first.

   I ranked this first on two readings without once checking the issue tracker or the changelog.

2. **Shadow exclusion in draw diagnostics — weakest Tier 1 item, downgrade.** The docs already
   state it and P0 knew it, so the people who read docs are not misled. A receipt qualifier is
   cheap but low value.
3. **Headless textured GLB — unverified by me.** P0 measured it; the fern GLB is not in my tree,
   and I could not reproduce it. Also arguably three.js's constraint, not Kiln's, so exposing a
   chunk reader is an enhancement rather than a bug fix. **Verify before acting.**
4. **Foliage guidance — needs a framing call, not a mechanical add.** Putting Holodeck's `uv-y`
   convention in Kiln's shared skills risks it reading as a requirement for standalone assets,
   which `AGENTS.md` explicitly warns against. Owner's call on framing.
5. **`bakeSurfaceAttributes` unused — my reasoning was backwards.** I treated zero adoption as a
   discoverability failure. Zero adoption across 188 Holodeck assets is at least as good evidence
   that it is not needed. Investigate why before "fixing" it.
6. **Workspace invalidation — correct behaviour, not a defect.** The launcher refusing a mismatched
   runtime is right. Only the ergonomics (an upgrade-all command) are improvable. Low priority.
7. **`AGENTS.md` omits `build:sdk` — ready.** Verified by me, one line, no design content, no
   behaviour change. **The only item ready to implement as stated.**

## The one rule: go to the artefact

Seven distinct false signals occurred in this cycle, and they look like seven unrelated lessons
until you line them up:

| what lied | what it described |
| --- | --- |
| a wrapper's exit code | the test run |
| a `^not ok` grep | the test run, under the other runtime's reporter |
| a failure-line grep returning zero | a summary that said `1 fail` |
| a background task's "exit code 0" | a log ending `4 fail` |
| a silently auto-merged `.mjs` | the bundle its source would produce |
| GitHub's `mergeable: CONFLICTING` | a head that is a strict descendant of `main` |
| `wc -m` agreeing with `wc -c` | a byte budget, by ASCII coincidence |

**Every one is a derived or cached summary disagreeing with the artefact it describes.** And the
remedy was the same every time: **go to the artefact.**

- Read the log, not the exit code.
- Regenerate the bundle, do not inspect it.
- Ask git about ancestry (`git merge-base --is-ancestor origin/main HEAD`), not the API about
  mergeability — a cached value computed mid-push reports garbage for a window afterwards.
- Run the snapshot test, do not regenerate the snapshot.
- Read `Ran N tests` from the runner, do not count `test(` in source.

**The seventh variant is the sharpest, because it is currently telling the truth.**
`AGENTS.md` is gated at `Buffer.byteLength(agents) < 12 * 1024`. On `main` the file is 100% ASCII
— verified, zero non-ASCII bytes — so `wc -m` and `wc -c` both report **12284**. They agree
*exactly*, and only because of what the file happens to contain.

A character count is a summary of a byte count. This one is a summary that is correct today,
**which is worse than one that is wrong**: a wrong summary gets caught, while a correct one
trains you to trust the method. One em dash and they diverge by 2 while the editor keeps
reporting the comfortable number, against a budget whose entire headroom is **3 bytes**.

So the rule is not "derived summaries are unreliable". It is that a derived summary is a
different thing from the artefact *even when the two agree*, and agreement today is not a
property you can carry.

State it as one rule rather than seven lessons, because the seventh variant has not been seen yet
and a list of six will not cover it. The question to ask of any green light is: **is this the
thing, or a summary of the thing?**

## Verifying a test run: eight bad signals in one cycle

Across one day of dogfooding, **eight separate derived signals were wrong**, each by a
different mechanism. None was caught by the thing that produced it. Recorded because the cost
was real — one of them alone cost a 13-minute rerun, and one nearly shipped.

| # | Signal | Reality | Mechanism |
| --- | --- | --- | --- |
| 1 | wrapper reported `exit 0` | suite had failures | `echo "EXIT=$?"` after a pipe captured `tail`'s status, not the runner's |
| 2 | `^not ok` grep matched nothing | suite had failures | Node 22 emits TAP, Node 24 emits spec — the grep pattern was for the other format |
| 3 | failure-line grep returned 0 | summary said `1 fail` | the runner did not print the expected marker for that failure class |
| 4 | background task "completed (exit code 0)" | log ended `1 fail` / `4 fail` | harness exit code simply wrong; hit independently by two sessions |
| 5 | command reported `exit 1` | tests were **fine**, 11 pass / 0 fail | a `grep -c` appended to the pipeline exited non-zero on zero matches |

**The rules that survived all five:**

- **Read the summary totals out of the log.** It is the only reading that was right every time.
- **A test-run exit code carries no information in either direction once anything is piped after
  it.** A pipeline's status is its *last* command. Four of the five were false greens, which is
  the expensive direction, but #5 shows a false red costs a cycle chasing nothing.
- **Never infer success from absent failure lines.** Formats differ by runtime and by failure
  class.
- **Do not match incidental lines against a remembered count.** One session reported 18
  `✗ Tool failed` lines as benign; the next had 9, of two kinds rather than one. Both runs were
  0 fail. The count is scope- and concurrency-dependent, so an expected number for it turns a
  harmless artefact into a false signal — which is the very thing these rules exist to prevent.
  Read the totals and the `(fail)` count; nothing else.
- **Do not truncate the log you are going to read.** A `tail -22` preserved the totals and
  destroyed every `(fail)` line, leaving a correct total naming nothing. Capture whole, read the
  totals, grep the detail from the file.
- **Pre-register the expected total, then check it.** State the number *before* the run, derived
  from the merged tree, and treat a mismatch as a finding rather than a prompt to recount. A
  post-hoc derivation can be unconsciously fitted to whatever the run produced, which is the
  failure mode of every check above. Done properly on the third merge: 4,020 predicted, 4,020
  observed.
- **Cross-check the arithmetic.** The strongest verification found in this cycle is independent
  of exit codes, formats and failure lines: *the pass count should equal the known baseline plus
  the tests you added.* 3,987 + 6 = 3,993 passing proves no silent failure, because a masked
  failure would read 3,992 pass / 1 fail.
- **Read `Ran N tests` from the runner; never count source.** `test.each`, a `describe` loop and
  a conditional `test` each break a source grep the same way. The runner's own count is the only
  one that reflects what executed.
- **But count instances, not declarations — a sixth way to be wrong.** Verifying another
  branch's expected count by grepping added `test(` lines returned 4 where the truth was 6: two
  of the tests sat inside `for (const exporter of ['legacy','three'])` and therefore ran twice.
  The grep looked authoritative and was off by two. A parameterised loop makes a wrong
  expectation look reasonable, which is the worst property an expectation can have. **Also
  re-derive the baseline when `main` moves** — each merge in this cycle shifted it (3,987 to
  3,996 to 4,002), and the check is only as good as the number it is checked against.

- **An eighth, and the cheapest to fall for: a state read while it was still being derived.**
  `gh issue view 290 --json state` returned `OPEN` moments after #295 merged, so I posted a
  comment blaming the title-reference auto-close gap that genuinely had caught #293 earlier.
  The timestamps say otherwise: #295 merged at 12:03:14Z and the issue closed at 12:03:18Z.
  The read landed four seconds inside a window where GitHub had not finished acting on
  `Closes #290` in the PR body. Nothing about the value looked provisional — `OPEN` is exactly
  what a real auto-close failure returns, which is why the wrong conclusion was publishable.
  The tell is not in the value but in the clock: a derived state read within seconds of the
  event that derives it is not evidence yet. Read what settles it instead — the keyword in the
  PR body, or `closed_at` — rather than the state it will eventually produce.

## The worst merge hazard: generated output that does not conflict

Found landing the second of four PRs, and it is more dangerous than the `CHANGELOG.md` one
because **nothing announces it**.

Merging `main` into a branch, of the five committed `dist/` bundles, only `dist/build.json`
conflicted. **The four `.mjs` files auto-merged cleanly.** Git interleaved two different
minified bundles into a file that is textually plausible and semantically meaningless, reported
no conflict, and said nothing.

> A conflict at least announces itself. A silent auto-merge of generated output does not.

A conflict list is therefore not a hazard list: the files git flags are the ones it could not
reconcile, which is the opposite of the ones most likely to be wrong. Minified, generated or
machine-ordered text is exactly what git is most willing to merge and least able to merge
correctly.

**The handling is to refuse the merge for derived files — and to do it _before_ merging, not
after.** Restore `dist/` to the merge-base state and **commit that first**. The branch then
carries zero delta on those files, so git has nothing to interleave and simply takes `main`'s
bundles; the `build.json` conflict disappears for the same reason. Then merge, and rebuild from
merged source last.

The post-merge form — merge, then discard the result and regenerate — reaches the same end state
but passes through a tree that *contains* the interleaved garbage and relies on remembering to
throw it away. **One makes the failure unreachable; the other makes it recoverable.** Never
inspect or fix a merged bundle either way: "did git interleave these correctly" has no useful
answer.

**The idempotence check is what catches it**, which is why it earns its place beyond staleness:

```
git status --short    # clean after the regenerate
node scripts/build-runtime.mjs all
git status --short    # still clean  ->  committed bundle matches merged source
```

A silently interleaved bundle fails that immediately, because regenerating from source produces
something different from what the merge produced.

## Rehearse the merge first — it is free

`git merge-tree --write-tree` computes a complete merge and writes **no refs, no commit, and
nothing to the working tree**. `git status` is empty afterwards. So "what will actually conflict"
is answerable before committing to anything, with no half-merged tree to extract yourself from.

Measured on the third branch of this cycle, against a `main` that already carried the first:

| | conflicts | silently auto-merged |
| --- | --- | --- |
| branch as it stood | `CHANGELOG.md`, `dist/build.json` | **`agent-run.mjs`, `cli.mjs`, `mcp-engine.mjs`** |
| `dist/` restored to merge-base first | `CHANGELOG.md` only | **nothing — not one line** |

That is the interleaving hazard reproduced independently on a second branch, and it turns the
claim that the pre-merge revert "makes the failure unreachable" from an argument into a
measurement: **three silent wrong interleavings and one conflict, removed.** With zero delta on
the branch there is nothing for git to combine, so it takes `main`'s bundles outright.

**Make it step 0 of any rebase in a multi-branch cycle**, with an explicit acceptance criterion
so the rehearsal has a pass/fail rather than being a look around: *only `CHANGELOG.md` conflicts,
and no `dist/` path appears at all.* Anything else means stop and understand it first.

One limit worth stating: a dry run only exercises the overlaps that exist at the time. Files the
other branch has not yet touched come back one-sided and trivial, and become two-sided only once
it lands — so re-run the rehearsal after each merge rather than trusting an earlier result.

## Generated is not the same as unverifiable

The opposite mistake to the bundles, and it cost nothing only because it was caught before the
third merge: **do not regenerate a snapshot to resolve a merge.**

Running the snapshot test *without* `--update-snapshots` compares the committed snapshot against
what the merged source actually generates. **Passing is proof the merge was correct.**
Regenerating unconditionally overwrites the file so that it trivially matches — converting a
verifiable state into an unverifiable one, and destroying the only evidence that the merge of the
*source* was sound.

So: merge, run the snapshot test **without** update, and regenerate only if it fails — treating
that failure as something to understand rather than paper over.

**The line between this and the bundles is not "generated output".** Both are generated. The
difference is structure and an oracle:

| | minified bundle | `.snap` |
| --- | --- | --- |
| shape | effectively one enormous line, no structure | line-oriented, stable ordering |
| a bad merge is | textually plausible, semantically dead | a test failure |
| detectable by reading | no | yes |
| has a comparator | no — only regenerate-and-compare | yes, the test itself |

Discard-and-rebuild is the only honest route for the first. For the second it is actively
harmful.

## The conflict nobody guards

When several branches land in one cycle, their conflicts are not equally dangerous, and the
ranking is the opposite of the intuitive one:

| conflicted file | caught by |
| --- | --- |
| `dist/` bundles | `workspace-setup.test.ts`, plus the idempotent-rebuild check below |
| generated snapshots | regeneration is authoritative; the test fails if stale |
| **`CHANGELOG.md`** | **nothing** |

Every branch in this cycle inserted at the same `## Unreleased` anchor, so the file conflicts
every time. It is **neither regenerable nor covered by any test**, so a careless resolution
silently drops one side's entry and no gate, total, snapshot or CI run will say so. The loss
surfaces only when someone later asks why a shipped change is undocumented.

So resolve it by keeping both entries, and **state in the report which entries survived**. That
statement is the only check that exists. Raised by the session landing third, after two merges
had already passed through the file unremarked — including by the session coordinating them.

## Staleness in a derived artifact

`dist/` is a build output committed in the same tree as its input, so it can silently disagree
with the source beside it. Only `workspace-setup.test.ts` catches that.

**The rule is stronger than "rebuild last after a rebase."** One session rebuilt the bundle, then
made a cosmetic edit to a CLI help string, and that alone failed the test. So: **any source edit
after a build leaves a lie in the tree**, including a typo fix, and rebase hygiene is only one
instance of it.

**The cheap check is idempotence**, and it needs no test suite:

```
git status --short    # empty
node scripts/build-runtime.mjs all
git status --short    # still empty  ->  the committed bundle matches its source
```

A two-second answer to "is this bundle stale", usable before every push.

## Shepherding order is a cost decision, not a queue

The repository requires a branch to be up to date with its base before it merges.
`gh pr merge 301` refused outright — *"the head branch is not up to date with the base
branch"* — on a PR whose fourteen checks were green and whose merge rehearsed clean. So a
merge-up is **mandatory for every PR regardless of conflicts**, and each merge moves `main`
forward and invalidates the next one. Shepherding several PRs is therefore strictly serial,
and the only free variable is the order.

Order by what a re-land costs, not by PR number or readiness:

| PR | files | touches `dist/` | cost to bring current |
| --- | --- | --- | --- |
| #301 | 3 | no | a plain `git merge origin/main` |
| #300 | 8 | no | a plain `git merge origin/main` |
| #295 | 9 | 4 bundles | restore, merge, rebuild |
| #302 | 16 | 5 bundles | restore, merge, rebuild |

#301 and #300 live entirely under `packs/` and `site/` — they touch neither `dist/` nor
`src/`, so `main`'s bundles stay accurate across them and updating costs nothing. #295 and
#302 each rebuild bundles, and **a rebuild is only valid against the `main` it will actually
merge onto**, so every bundle-touching merge destroys the other's. Put the two cheap ones
first and the two rebuilds last, one apiece, and each rebuilds exactly once. The same four in
the reverse order rebuild five times between them.

This inverts the intuition that the most exposed PR should go first. #295 is furthest behind
— its base was two commits back before #298 even landed — and that is an argument for
sending it *last*, because being behind is cheap to fix and rebuilding is not.

Two things not to take on trust while draining a queue like this:

- **Green CI describes a tree that no longer exists.** #300 and #301 were 14/14 against base
  `f5e9eb5`, which stopped being `main` the moment #298 landed. That run is still evidence —
  but only about the merge-base, so it has to be paired with a check that the PR shares no
  file with what landed since. Here neither shared one, so the green survived; it does not
  always.
- **Don't hand a session a conflict you haven't rehearsed.** Both pack PRs edit
  `packs/holodeck/README.md`, so a collision looked certain. Rehearsing it said otherwise:
  `git merge-tree --write-tree` for `main + #301`, then `git commit-tree` on that tree
  parented on `main` to get a synthetic commit, then `merge-tree` again for #300 on top of it
  — clean, tree `ebacb0c`. The hunks never overlapped. A warning about a conflict that does
  not exist is the same defect as a number handed over to be matched: it manufactures a false
  signal in someone else's session.

The README is worth a human read anyway, and for a reason the rehearsal cannot cover: prose
has no test or snapshot behind it, so two non-overlapping hunks can merge clean and still
leave the file incoherent — a renamed flag still documented, two additions reading as
duplicates. Same shape as `CHANGELOG.md` under *the conflict nobody guards*.

**That read found a real defect, 27 October.** The prediction was not hypothetical. #300's
session read the merged `packs/holodeck/README.md` instead of trusting the clean merge, and
found that #274's own first commit had inserted new subsections after the Regenerate preamble,
pushing two paragraphs — on content-addressed object keys and `published.json` — down to the
end of *Recover a lost store*. There they read as describing the recovered store rather than
every staged download. The fix (`6fba946`) moved 25 lines and added none: prose order only.

Note what that instance actually establishes. The defect did not come from the merge, so no
merge discipline would have surfaced it; it came from an earlier commit in the same PR and
only became *visible* in the merged file. A rehearsal proves a merge is clean. Nothing proves
prose still means what it meant, and the only instrument is a reader. Two PRs' hunks landing
in one document is simply the moment someone is most likely to look.

## Three contract decisions, and what checking the options cost

Settled by the owner, 27 October: #277 declares neighbours through **project inventory
placement**; #289 **closes** on its reproduction with the welded-mesh hole split out as #304;
#287 **exposes `textures`** on the MCP export tools and names both options in Discovery.

The outcomes matter less than the pattern. Each of the three was parked as a judgement call,
and in each case running one cheap command before presenting the options changed what was
being decided.

**#277 — the cost was understated, not overstated.**
`grep -cE 'transform|placement|position' src/projects.ts` returns **0**. The option had been
described as projects gaining a layout concept; in fact projects have no spatial vocabulary at
all, so it introduces the first one. That is a larger commitment than "add a field", and it is
the kind of thing that only shows up as a number. The contract boundary that rules out the
model-authored alternative was equally checkable: `src/contracts/requirements.ts:1` states
"Host authority is deliberately external", and line 254 already carries the precedent —
`requirements.validation`, commented "never model-authored".

**#289 — the decision was that it was two decisions.**
One issue held a by-design precision floor and a genuine coverage hole, and presenting them
together would have forced a single wrong answer to both. The floor is three deliberately
matched constants (`src/render.ts:2927`, `src/render.ts:267`,
`src/qa/part-connectivity.ts:46`), all 2 cm, and it is correct: a trigger clearing its guard by
a millimetre is normal geometry. The hole is that two primitives welded into one
`BufferGeometry` are silent at 200 mm, where unwelded they report from 25 mm — and Kiln welds
per material by default. Splitting it let the floor close as not-a-defect while the hole became
#304 with its own acceptance criteria.

The fix's cost was also worth checking rather than assuming. No component machinery exists
anywhere in `src/` — zero hits for `connectedComponent`, `unionFind`, `disjointSet` or
`floodFill` — which reads as expensive until you notice `geometryDiagnostics`
(`src/geometry.ts:146`) already enumerates edges to count `nonManifoldEdges` at line 237. A
union-find over a walk the code already performs is a different proposition from new topology.

**#287 — the issue's own analysis was wrong in the direction that made the work cheaper.**
The comment asserted that `kiln_export` hardcodes `profile: 'runtime'`. It does not:
`src/tools/registry.ts:3029` is `.enum(['runtime', 'editable']).default('runtime')`. So an
export-shaping enum on the MCP surface is established precedent, and adding `textures` beside
it is the same move rather than a new one. Only `textures` was actually missing — the sole hit
in the registry is a `TextureUsage` type import at line 93.

### A check's tolerance is its contract

The durable result is #289's division of labour. Kiln measures gross structure; the destination
audits millimetre fit. When a check's tolerance is right and an author still gets surprised, the
defect is in what the check *says about itself*, not in the threshold — so the fix is stated
coverage plus a regression test that pins the statement, which is what #298 shipped. A
limitation documented only in a warning that never fires would not have helped anyone, which is
why the rule landed in the QA integration reference as *run the destination's audits before
`kiln_save`*, not after.

### Single-digit headroom is a tripwire

Measuring #287's affordability turned up something unrelated and worse than the thing being
measured:

| gate | current | limit | headroom |
| --- | --- | --- | --- |
| `kiln_render` input schema | 4,988 B | 5,000 B | **12 B** |
| `kiln_inspect` input schema | 4,917 B | 5,000 B | 83 B |
| all 19 tool definitions | 42,783 chars | 45,000 | 2,217 |
| `AGENTS.md` | 12,284 B | 12,287 B | **3 B** |
| `kiln_export` input schema | 663 B | 5,000 B | 4,337 |

Two gates in this repo now sit within a dozen bytes of failing. Neither will be tripped by work
that intends to change them; both will be tripped by the next unrelated edit that happens to
touch the file, where the failure arrives as a budget error with no obvious relation to what the
author was doing. A gate with single-digit headroom has stopped measuring a budget and started
measuring luck.

### 1.6.0 carries #287, and the order is not free

The owner folded #287's `textures` exposure into 1.6.0 rather than shipping it afterwards: an
input schema change invalidates the prompt cache for every client, and one invalidation beats
two.

That makes the release sequence load-bearing, for a reason the build script states itself.
`scripts/build-runtime.mjs:86` comments that the MCP entry bundles
`src/generated/mcp-manifest.json` and must "regenerate it from the registry first, before the
source identity below is taken." The contract test measures that *packaged* manifest rather
than the live registry — `src/tools/__tests__/registry-contract.test.ts` imports
`packagedMcpManifest`, and its header says the generated manifest "is what every harness
receives." So the order is:

1. `textures` on `kiln_export` and `kiln_export_to`, plus the Discovery entries.
2. `node scripts/build-runtime.mjs all`, which regenerates the manifest from the registry.
3. Only then the version bumps across the eleven files and
   `plugins/kiln-engine/package-provenance.json`.

Done in the other order, provenance pins a package whose advertised manifest does not carry
the option the release notes claim. Nothing fails loudly — the artefact is simply wrong, which
is the signature of every other hazard in this document.

## Open decisions

- **D0 — how far to redesign.** "Better" needs a ceiling or P0 never ends. Proposal: one
  authored revision, one refine pass against the review rig, then owner approval or rejection —
  no open-ended iteration. Escalate to the owner rather than iterating a third time.
- **D1 — vegetation boundary. RESOLVED 26 October** by the owner's shading direction above: the
  split is by *kind*, not by pipeline stage. Kiln feeds the **compiler** with geometry whose UV.y
  runs 0 at the base to 1 at the tip, which is Holodeck's `uv-y` wind weight; the game keeps TSL
  wind, lighting, instancing, indirect draw and the impostor bake, which derives from the geometry
  anyway. The open sub-question is only whether the game's shader adopts UV.y or keeps its `aWind`
  attribute, to be settled by the vegetation spike.
- **D2 — `KILN_EXPORT_ROOT`.** Currently unset, so `kiln_export_to` is unavailable. Pointing it
  at a staging dir under the sim lets the authoring agent write exports directly. Requires an
  MCP env change and a session restart.
- **D3 — pack home.** `packs/vietnam/` in this repo mirrors Holodeck, but the game is
  proprietary and Holodeck packs are CC0. The pack must carry no CC0 dedication and should
  likely live in the game repo, with only the machinery shared.
- **D4 — GPU gate.** Renderer installation is `ready` but GPU readiness is untested, and the
  game rejects automatic WebGL fallback as success. Needs one founder GPU smoke before any
  material claim.

## Standing constraints

- Author in the adopted workspace, never the engine checkout.
- Authoring needs a Claude session launched **from the sim directory** — a subagent of an
  engine session inherits the engine's tools and never sees the workspace MCP server.
- Keep AGPL V1 code out of the proprietary V3.
- The generated workspace files are gitignored: machine-specific absolute paths, regenerable
  by `kiln-init --adopt`, ownership-hashed in `.kiln/workspace.json`. Do not hand-edit them.
- The game's `tools/docs/check.mjs` reports 65 pre-existing `../artifacts/` misses because that
  directory is gitignored and absent from a fresh clone. That is the baseline, not a regression.
