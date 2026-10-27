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

1. **Floating-part QA — gap real, my analogy wrong, fix 3-5x bigger than implied.** I claimed
   `CHAR_CONTACT_FLOATING` was the precedent to copy. It is not: it checks a *declared* contact
   role against asset-local ground ("Ground contact {role} is {offset} m above asset-local
   ground"), not part-to-part contact. No domain has part-to-part contact checking. Worse, the
   obvious rule is unstateable: "every part must touch another" would flag P0's corrected sling
   swivels, which hang free on purpose, as defects — a false positive worse than the miss it
   prevents. A real fix needs an author-declared contact mechanism, as characters already have.
   **Design work, not a patch. Do not hand this to an agent as a fix.**
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
