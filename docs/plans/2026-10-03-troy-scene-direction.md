# Troy scene direction and preparation

Status: preparation in progress, 3 October 2026. The prior core/scenes/site release
completed at `a6d2aa3`; its bounded performance disposition still applies. This is
new Troy work, not a reopening of the previous release. The old battle composition
remains reference only. Counts below are proposed visual targets, not measured
runtime capacity or owner-approved final counts.

The [production plan](2026-10-03-troy-scene-production-plan.md) turns this direction
into the end-state objective, staged scene work, character/vegetation option
matrices, standalone script contracts and qualification/delivery gates. It is the
execution sequence; this document retains owner decisions and exact asset evidence.

## Owner direction

- Full-scale film-inspired setting: sea, beach, a broad sandy plain rising gently
  toward the monumental walls, dense city inside, distant mountains behind Troy.
- No exterior residential settlement or dock district from the first generated
  concept. Vegetation belongs inside the city. This is an art-directed scene,
  not a claim of archaeological reconstruction or an exact historical moment.
- Greek ships simultaneously approaching, unloading and already beached; Greeks
  staging on shore and in formations. Trojan formations outside the wall and
  archers on the wall. Achilles and Hector in the clear space between armies.
- Repair the existing horse's floating ears and blocky anatomy.
- Use GPT-6.1 Sol for vegetation; AGY Opus 5.5 for other authoring, falling back
  to AGY Sonnet if quota is exhausted. Do not invoke Claude Code.
- Subsequent owner decisions: both AGY models hit quota; the owner first authorized
  Sol for the horse, then explicitly selected **GPT-6 Astra, maximum reasoning**
  for the horse repair. Vegetation stays on Sol 6.1.
- Vegetation feedback: overall silhouettes are acceptable; remove the flaky,
  pointed leaf meshes that look like spikes stuck onto larger foliage clumps.
  Preserve the main forms and integrate softer foliage detail across all four.
- Horse feedback: the owner likes the repaired horse shape, but its head straps
  obscure the eyes. Preserve that anatomy; move the browband above the eyes and
  route cheek straps clear of them, checking attachment and animated head poses.
- Subsequent owner review approves the revised vegetation: retain these four
  forms and explore scene-owned impostors at distance. The owner wants repeatable
  impostor and animation-baking workflows, including the large armies.
- Additional props, statues or simple buildings may be authored with Gemini 3.8
  High through AGY when an actual scene need is identified. The authenticated
  listing resolves that option to `gemini-3.8-flash-high` (Gemini 3.8 Flash High);
  availability was checked, but no authoring success or quota is implied.

## Initial composition targets

| Group | Count | Starting distribution |
| --- | ---: | --- |
| Greeks | 288 | 192 in formation, 48 staging, 24 unloading, 24 aboard approaching ships |
| Trojans | 192 | 144 in formations before the wall, 48 archers on the wall walk |
| Named heroes | 2 | Achilles and Hector between the armies, counted separately |
| Galleys | 12 | Four approaching, four unloading, four already beached |

**Subsequent owner correction:** the table above records the implemented initial
blockout, not the final crew allocation. Two seated rowers per row, one per oar,
means 28 per current galley. Keep the ship size and rework its seats/oars/floor;
sheathe weapons at the hip and lower a plank for single-file shore transfer.
[The rowing checkpoint](../reviews/2026-10-03-troy-rowing-layout.md) records a revised
candidate of 464 Greeks + 192 Trojans (656 ordinary actors), preserving the same
identities across ships and shore. This larger candidate needs qualification.

The original blockout totals 480 ordinary soldiers plus two heroes. Shipboard
soldiers are part of the Greek total, not extra copies. Six Greek formations of
32 and six Trojan formations of 24 are an initial layout option. Spread archers
along usable wall-walk segments with clear gate and tower access.

Use the same individual soldier identity through aboard → disembarking → staging
→ formation. Ship passengers inherit deck transforms until their actual transfer
to the landing route. Verify hull clearance, supported feet, camera views and
water depth at landing. No invisible teleport, duplicate spawning, soldiers walking
through gunwales or ships sliding through sand. A replay/reset must be explicit;
a finite landing sequence can settle with all twelve ships on shore.

The owner selected a default face-off with an optional duel interaction on 3 October.
Generic independent attack clips are not a synchronized duel. Keep landing routes outside the hero arena and
both formation fronts. The wooden Trojan Horse is not automatically placed in this
landing/face-off scenario merely because it is in the pack.

## Asset and motion work

1. Repair and review the canonical horse, preserving immutable ancestry and
   checking ear/skull and harness contact in standing and galloping poses.
   The repaired anatomy is owner-approved and the bridle now clears both eyes in
   inspected closeups. Export checks preserve all 68 animation channels and 16
   pivot transforms/parents. Before scene locomotion, address ground contact:
   the inherited gallop puts a hind hoof about 5.9 cm below the reference plane;
   the repaired geometry reaches about 8.4 cm below it at sampled phases. This
   is an open motion-integration issue, not a qualified terrain-running clip.
2. Preserve the owner-approved revised olive, cypress, fig and low shrub.
   Finish immutable exports before linking exact revisions into the Troy project.
   Keep terrain, placement rules, density and optimization derivatives scene-owned.
3. Inspect galley usable deck, waterline, oars and egress; create the necessary
   disembark route/temporary gangplank or shallow-water step-off only after the
   geometry proves which works. The existing galley is a static asset.
4. Existing Greeks, Trojans and heroes export idle and attack clips only; walking,
   carrying/unloading, boarding transitions, archery and paired duel choreography
   are new work. A bow asset exists, but no reviewed bow-equipped archer does.
   Verify hand grips, wrists, attachment sockets and intermediate transitions.
5. Build joined walls, usable gate and wall walks, city streets and courtyards,
   terrain/shoreline and distant mountain backdrop. Reconcile saved +X manifest
   conventions with sources that actually face +Z before placing assets.
6. Optional later dressing: amphorae, baskets/crates near staging, limited cloth
   awnings inside the city, and rope/landing equipment. These are proposed additions,
   not current inventory or mandatory blockers for the first terrain composition.

## Runtime qualification

Do not instantiate 480 independent copies with full per-part draw submission.
Current soldiers have roughly 24 draws each; naive copies would exceed 11,000
main-pass character draws before buildings, ships and shadows. The scene needs
compatible instanced rigid parts, shared geometry/materials, spatial culling and
distance-based animation updates. Preserve canonical source assets and animation
anchors; bake scene-specific derivatives separately with exact input identities.

Start with a representative crowd/ship spike before promising these counts on
every device. Allocate detailed individual updates to nearby actors and heroes;
use bounded shared animation phases for distant ranks without synchronized motion.
The owner requested VAT and octahedral impostor exploration specifically for
characters. Compare rigid instancing, part-transform textures, full VAT and animated
far impostors per [the character rendering spike](2026-10-03-troy-character-rendering-spike.md).
Measure main/shadow/water passes, startup, memory and traversal. Lower-tier visual
density is a measured quality choice, not an unannounced change to the scene brief.
All twelve ships need not cast full-detail dynamic shadows at every distance.

Reuse the qualified scene shell, touch orbit/pinch behavior, transition checks and
camera-stable water principles. Check orbit with frozen wave time across origin
boundaries; do not assume another scene's water qualification transfers automatically.
Test actual ship-to-shore paths, gate passage, wall walk, city navigation and the
hero viewpoint. Keep physical mobile validation distinct from touch emulation.

## Workspaces and evidence

### Approved vegetation revisions

The owner approved the revised vegetation appearance. All four are saved as
immutable children, with source/GLB/bundle exports under
`review/troy-expansion/vegetation/output/v2`. Independent rebuilds from each saved
revision reproduced the manifest GLB SHA-256 exactly; receipts are under
`output/independent-verification`. This confirms reproducibility, not destination
runtime performance or impostor qualification.

| Asset | Saved revision | Triangles | Draws |
| --- | --- | ---: | ---: |
| Olive | `r_37373fde43154f928653af8c34100186` | 4,634 | 4 |
| Cypress | `r_9e34ca5dc6bf41caafe35ffb8576a6ff` | 2,712 | 2 |
| Fig | `r_efdd6cc6417c46a18d263a4865bfdc02` | 4,676 | 4 |
| Shrub | `r_07a93557a106492ab919f72955ad0924` | 1,252 | 3 |

The Troy project and published pack are not yet repinned to these assets.

### Authoring sessions

The repaired horse is saved as `project/horse` revision
`r_ae20cb280150492dbf58b89860f029d2`, an immutable child of
`r_f088964ec411466ab2c0d4afe8d20a31`, with GPT-6 Astra / Codex refiner attribution.
Final files are in `review/troy-expansion/horse-sol/output/final`; its independent
saved-revision rebuild matches GLB SHA-256
`03e257c29b54ad05f5f37381474fe6eba995f22d72fefba9e90e5d46bbe84b5c`.
It has 4,804 triangles, 54 draws and three materials. The owner approved the body
shape; the subsequent bridle clearance was agent-reviewed in multiple static and
animated views. Do not imply the owner has separately approved that final bridle
or that the inherited locomotion is qualified for terrain.

Fresh isolated workspaces under the private evidence repository:
`review/troy-expansion/vegetation` (Codex, `gpt-6.1-sol`) and
`review/troy-expansion/horse` (AGY, `claude-opus-5-5-high`). Both use current runtime
and copied maintained skills; the original Claude-configured workspace is intact.
The horse workspace carries the exact original horse revisions and material pins.
The vegetation workspace uses the palette as reference and saves standalone
candidates until reviewed. No published pack revision has changed yet.

Both AGY Opus and Sonnet authoring calls returned `RESOURCE_EXHAUSTED` (429), with
about 4h45m to reset. No horse repair was produced by those calls. Opus recovered
the historical workspace's missing pinned material PNGs from the editable asset
payload and completed baseline views. That evidence, exact materials, source store
and original horse revisions were copied into a fresh Codex workspace
`review/troy-expansion/horse-sol`. The directory name predates the owner's later
model change; its active repair model is now **gpt-6-astra with max reasoning**.
Do not attribute the geometry repair to Opus or the interrupted Sol starter turn.

AGY reports 1.2.16 after its official update check on 3 October; the updater says
current. The authenticated model listing advertises Opus 5.5 and Sonnet 5.5 at
low/medium/high. A listing is availability evidence, not a completed authoring run.
See [AGY model documentation](https://www.agy.dev/docs/models/) and
[Sol model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

Generated reference mockups and prompts are retained at
`review/troy-concepts-2026-10-03/revised/` in the evidence repository. They establish
visual direction, not dimensions, exact topology, current runtime screenshots or
an approved final asset list.
