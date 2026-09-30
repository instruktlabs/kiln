# Farm pilot brief: Shapes & Seasons

Status: production brief proposed September 26, 2026. No production asset source, meshes, textures, rigs or animations have been created by this brief. Begin the pilot only after the [project foundation checkpoint](2026-09-26-project-foundation.md) records the foundation gates as complete. The first authoring work belongs in a separate asset workspace, not this engine repository.

The [proposed production goal and workflow](2026-09-26-farm-production-goal.md) cover model selection, bounded parallel authoring, art-direction review and trace mining. This brief continues to own the asset inventory and delivery requirements.

## Purpose and source of truth

Prove that one evolving project profile can produce a coherent, useful browser-first asset pack: deliberate inventory, shared material resources, repeatable dimensions, reviewable revisions, real movement where promised, and complete editable/runtime delivery. Farm is the first production pilot. It does not qualify the other nine proposed styles or authorize their production.

The existing [reference inventory](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/farm/inventory.json) and [individual reference index](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/farm/references.md) define exactly 23 distinct assets. The [assembled concept](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/farm/scene.png) provides composition direction. Individual concepts clarify each asset's intended character, but neither scene nor individual image is an exact reconstruction target. The written inventory determines asset identity and count. Repeated instances are not new inventory entries. Four cabbage stages are four deliberate assets. The farmer includes the pitchfork; the pumpkin plant includes its attached fruit.

These are raster concepts, not evidence of topology, dimensions, hidden geometry, UVs, rigs, functional parts, collision or performance. The dimensions and numerical targets below are proposed authoring decisions, not measurements extracted from those images.

Owner clarification after comparison review: use references for alignment and allow creative interpretation. The written brief must carry the purpose, art direction, actual requirements and deliberate room for invention independently of an image. Pack coherence, appealing game art, plausible construction/anatomy and functional quality determine acceptance; one-to-one image similarity does not. Images are optional authoring context, while the individual reference inventory remains useful for owner alignment. Record model-specific prompt/context choices without changing the core requirements or rewriting completed comparison inputs.

## Visual profile

Keep clear, intentionally faceted silhouettes and friendly proportions. Use broad shape changes, substantial contact surfaces and restrained matte surfaces. The reference farmhouse has readable large stone blocks and roof courses; the tractor has recognizable wheel sizes, seat, steering wheel, grille and exhaust. Preserve that hierarchy at scene distance before adding small detail. The farmer's face, limbs and clothing should have the same degree of stylization as the livestock and machinery.

Primary palette: cream masonry, charcoal roofing and tires, warm brick-red timber and machinery, honey-brown wood, olive vegetation and golden crops. Denim blue, pumpkin orange and skin tones are small functional accents. Warm ivory is a presentation backdrop, not lighting baked into every asset.

The following swatches are proposed project values to establish during the first look review. They are not sampled color truth from the references. Effective roughness/metalness values should be reviewed under neutral GPU lighting; map multipliers must not be confused with actual channel values.

| Material role | Proposed palette / response | Shared uses and first resource choice |
| --- | --- | --- |
| cream-masonry | `#D6C39A`, roughness 0.8–0.95, dielectric | Farmhouse, watermill, foundations. Palette material first; restrained authored stone variation if useful. |
| charcoal-roof | `#494B4D`, roughness 0.75–0.9, dielectric | All building roofs; geometry supplies readable roof courses. |
| painted-red | `#B94D36`, roughness 0.65–0.85, dielectric | Barn and tractor, with material variation explicitly approved if their finishes differ. |
| honey-wood | `#A87942`, roughness 0.75–0.9, dielectric | Porch, tower, wheel, fences, trailer, barrel, pitchfork. A subdued derivative of the shipped `wood-grain` recipe is a candidate, not a dependency already chosen. |
| dark-rubber | `#30312E`, roughness 0.85–0.95, dielectric | Tires and selected dark fittings; do not apply shiny metal response to rubber. |
| bare-metal | `#777A76`, metalness 1, roughness 0.45–0.7 | Windpump rotor, hinges, machinery details. A muted `brushed-metal` recipe can be evaluated; no anisotropy promise. |
| foliage | dark `#647238`, light `#94A046`, matte | Tree, crops, pumpkin vine. Color blocks and faceted geometry take priority over photographic detail. |
| straw | `#D5A84E`, matte | Hay, wheat and hat; restrained shared detail, without dense alpha cards by default. |
| earth-stone | soil `#785334`, rock `#A39D8C`, matte | Crop bases and rocks. Tune a coarse-soil derivative to the agreed palette before adopting it. |
| cloth-and-livestock | cream `#E2D3B3`, denim `#5B7785`, brown `#865936` | Farmer and animals, with small skin/muzzle/comb accents. Woven-fabric is a candidate only where it improves close viewing without changing the style. |

Start with a small shared material set. Photographic library resources are available references, not a requirement to make this faceted pack photorealistic. After a candidate wins the look review, create an immutable resource with explicit seed/recipe, map conventions, physical repeat scale and provenance; pin its actual returned ID and revision hash in the Farm project. Never copy hashes from technical qualification fixtures and present them as Farm decisions.

Agents may evolve the profile and add resources. Every change creates a project revision, names the reason and affected roles/assets, and retains prior review evidence. Before broad propagation, compare affected assets together under the same camera and lighting. Record intentional exceptions rather than accumulating unexplained material variants. A design-review annotation is not trusted QA or release acceptance.

## Inventory and physical contract

Use metres, +Y up, +X forward and +Z right. Ground contact is Y=0; root pivots are centered on the intended placement footprint. Wheels, rotors, doors and hinges have explicit local pivots independent of the placement root. Adopt 0.5 m placement increments for the first scene, with finer detail unconstrained. Do not normalize all assets to a common bounding-box size.

Approximate dimensions below are starting targets. Resolve their proportions in a shared scale lineup before detailed authoring; the 1.75 m farmer is the human scale reference. All 23 inventory IDs are retained unchanged from the reference manifest.

| # | ID | Deliberate asset and distinguishing features | Proposed size / functional contract |
| --- | --- | --- | --- |
| 1 | `farmhouse` | Cream stone house, charcoal pitched roof, dormer, chimney, olive shutters, porch and steps | About 8×6 m footprint, 6.5 m roof height; usable front doorway and porch clearance. Exterior and credible visible openings; full furnished interior is not implied. |
| 2 | `barn` | Red gambrel barn, cream framing, double braced doors, cupola, side awning | About 10×8 m, 7 m high; two separately pivoted doors and sufficient open doorway for tractor/trailer. |
| 3 | `windmill` | Open timber windpump tower, multi-blade metal rotor and tail | About 7 m high, 2.5 m rotor diameter; independent rotor hub and optional yaw parent. |
| 4 | `watermill` | Cream masonry building with dark roof and attached wooden waterwheel | About 6×5 m, 5 m high; wheel about 3 m diameter on a correct axle, with paddles clear of structure. |
| 5 | `fence-straight` | Two posts and two horizontal rails | 2 m post-centre span, 1.1 m high; named endpoint posts and consistent snap axes. |
| 6 | `fence-corner` | Three posts, two rails on each perpendicular leg | Two 2 m legs, exactly 90 degrees; shares the straight fence's cross-sections and heights. |
| 7 | `fence-gate` | Two support posts, two-rail gate, diagonal brace, dark hinges | 3 m clear opening, 1.1 m high; gate rotates at hinge post, not its geometric centre. |
| 8 | `tractor` | Red-orange vintage tractor; large rear/small front tires, exposed seat, grille and exhaust | About 3×1.8 m, 1.8 m to main body; four wheel pivots, front steering pivots, rear hitch and seat attachment reference. No driving physics implied. |
| 9 | `trailer` | Detached empty honey-wood plank trailer with four wheels and tow bar | About 3×1.7 m body; hitch height compatible with tractor, independent wheel pivots, measured tow-bar clearance. |
| 10 | `barrel` | Faceted upright wood staves, two dark bands, closed top | About 0.65 m diameter, 0.9 m high; stable ground contact and repeatable shared wood/metal roles. |
| 11 | `hay-bale` | Rectangular golden straw bale, two twine bands | About 1×0.5×0.5 m; stacks without hidden rounded protrusions or floating contact. |
| 12 | `farmer` | Adult farmer, straw hat, beard, cream shirt, blue overalls, brown boots, three-prong pitchfork | 1.75 m body height; consistent humanoid joints and feet, separate named pitchfork attachment part. Tool remains part of this inventory asset. |
| 13 | `cow` | Brown/cream patches, short legs, hooves, horns, pink muzzle and udder | About 2.2 m long, 1.3 m shoulder height; four grounded legs, tail and head articulation. |
| 14 | `sheep` | Cream faceted fleece, charcoal face and legs | About 1.1 m long, 0.8 m high; readable limbs distinct from fleece, head articulation. |
| 15 | `chicken` | Cream hen, red comb/wattle, yellow beak and feet | About 0.45 m high; feet and head remain readable at the scene's viewing distance. |
| 16 | `cabbage-stage-1` | Two-leaf seedling on one small soil mound | About 0.1 m high; shared growth-slot origin and soil-base convention. |
| 17 | `cabbage-stage-2` | Four/five separated upright young leaves; no closed head | About 0.2 m high; same growth-slot origin as stage 1. |
| 18 | `cabbage-stage-3` | Fuller eight-leaf loose rosette; no mature closed head | About 0.35 m high; same origin, visibly distinct silhouette. |
| 19 | `cabbage-stage-4` | Compact pale-olive head nested in dark outer leaves | About 0.45 m high and 0.6 m across; same origin, distinct harvest-ready form. |
| 20 | `wheat` | One golden clump with angular seed heads and a small soil mound | About 0.9 m high and 0.4 m across; repeated clumps form a field without opaque walls. |
| 21 | `pumpkin-plant` | One connected vine with broad leaves and two orange pumpkins | About 1.4 m footprint; one large/one small fruit, usable ground placement; not loose pumpkin props. |
| 22 | `faceted-tree` | Short branching brown trunk and clustered broad olive canopy | About 4.5 m high, 3.5 m canopy width; low branches leave the intended route clear. |
| 23 | `rock-cluster` | Five adjoining irregular pale warm-gray stones | About 1.5 m across, 0.6 m high; one reusable grouping, no attached grass or other props. |

Fence joins need one post at each shared endpoint. Preserve the complete two/three-post standalone references, but make named endpoint-post parts optional in the assembled source so duplicate coincident posts are omitted. A connector description alone does not perform that omission. Prove straight-to-straight, straight-to-corner and straight-to-gate joins explicitly; do not hide overlap with lighting.

The tractor/trailer hitch must align at the chosen scale and permit the intended visible steering range without intersections. Building door heights, fence openings and the farmer must be reviewed together. Back and underside geometry require deliberate completion; the references do not license leaving camera-hidden defects.

## Motion and interaction requirements

The initial look pass may be static and must be labeled that way. Full pilot acceptance includes motion promised below; a static export cannot silently satisfy it.

| Group | Proposed minimum clips / behavior | Review evidence |
| --- | --- | --- |
| Windpump and watermill | `Spin` loops on rotor/wheel only, at separate plausible rates | Full cycle, stationary tower/building, axle stays fixed, no nearby-part intersections. |
| Gate and barn | `Open` / `Close`, separate named hinge pivots | Closed alignment, open clearance, motion bounds, no door translation through jambs. |
| Tractor and trailer | Wheel-turn demonstration and front-wheel `Steer`; named hitch/seat references | Correct axes/direction and contact radius; clip does not claim vehicle physics or suspension. |
| Farmer | Rest pose, `Idle` and `Walk`, named tool attachment | Readable contact and foot phase, no flipped limbs, pitchfork remains attached or intentionally removed for the clip. Locomotion convention is recorded; no implicit root-motion assumption. |
| Cow / sheep / chicken | Rest pose, `Idle`, `Walk`; cow/sheep `Graze`, chicken `Peck` | Grounded feet, stable anatomy, recognizable head motion, loop continuity. |
| Cabbage | Swap among four separate stages at the same slot | No pivot jumps or duplicate soil piles; growth is state substitution, not a promised morph rig. |
| Other plants and props | Static baseline | No automatic wind, harvesting, breakage, fluid or cloth simulation claim. Add such behavior only through an explicit project revision. |

Collision shapes, navigation meshes and gameplay scripts remain separate consumer concerns. If the pilot delivers collision data, declare its representation and test it; otherwise mark collision as not provided. The viewer's Explore mode is a camera, not a collision or walkability test.

## Proving scene

Compose one approximately 40×40 m farm environment from the 23 inventory assets. Include the farmhouse, barn, windpump and watermill; a connected pasture fence with a working gate; tractor plus attached trailer on a clear route; a bale stack and barrel; all four characters/animals; four adjacent cabbage growth rows, wheat, pumpkins, repeated trees and rock clusters. Keep the listed object count distinct from their repeated instances.

Use a simple ground/path/stream presentation surface as scene scaffolding. It is not an additional standalone catalog asset. No incidental shrubs, flowers, farm tools, separate produce, signs or furniture should enter the pack without an inventory revision and its own reference. The composite proving scene is a demonstration assembled from the pack, not a 24th unique object reference.

Record a fixed neutral-light hero view, opposite view, top layout and close material/detail views, then an interactive route from the front gate past crops and tractor to the watermill. Include a ground-level eye-height check around the farmer and doorways. Play moving parts together and separately. The fixed views expose design coherence; the route exposes scale, backsides, bounds, access and repeated-pattern issues. Use identical cameras and lighting for revision comparisons and keep GPU fidelity receipts with the exact evaluated GLB.

## Proposed numerical targets, not qualified budgets

These are hypotheses for the first authoring cycle. They remain **unqualified until the actual Farm proving scene is profiled** on named target hardware, browser version, drawing-buffer size and a stated thermal/power state. The foundation now has a [controlled technical-workload review](../reviews/2026-09-26-foundation-performance.md), separate from its earlier busy-machine samples. Neither a technical fixture nor a dashboard-sized viewport establishes Farm's game budget or scene acceptance.

| Surface | Initial planning target |
| --- | --- |
| Small repeated prop or crop | Roughly 100–1,500 triangles per unique asset; readable silhouette takes precedence over a hard minimum. |
| Tree or rock grouping | Roughly 500–4,000 triangles; verify repeated scene cost and overdraw. |
| Character / animal / machinery | Roughly 2,000–12,000 triangles each, including required articulation; justify exceptions through scene evidence. |
| Complete building / mill | Roughly 4,000–20,000 triangles, with silhouette and functional parts prioritized. |
| Proving scene | Start below 300,000 visible triangles and 300 visible draws; log materials, meshes, geometry reuse and animation cost separately. |
| Textures | Prefer 256–512 px shared resources and compact palette materials; larger maps need a visible benefit. Initial decoded RGBA8 plus mip estimate below 128 MiB. This estimate is not actual GPU allocation. |
| Transfer and load | Aim for a proving-scene GLB below 15 MiB and parse-to-first-presented-frame below 2 seconds on the reserved desktop. Report download, parse/submission and presentation separately where measurable. |
| Interactive pacing | Provisional 60 Hz target, p95 frame interval at or below 16.7 ms over a stated steady interval after warm-up; report long frames and cold interaction separately. |

Do not turn these planning numbers into host-enforced requirements without recording the qualification and adoption decision. The current viewer measures frame scheduling and first render submission, not GPU execution or presentation completion. Use appropriate instrumentation for claims beyond it. Mobile, lower-power GPUs, other browsers and other engines need their own evidence.

## Staged acceptance and delivery

1. **Foundation gate:** complete the active F0–F9 foundation audit, including standalone authoring, clean installed-package workflow, controlled technical-workload measurement and resource round-trip checks. A visual review of references is not this gate. The later Farm scene needs its own reserved performance measurement.
2. **Project setup and scale lineup:** create the Farm project in a separate workspace, record this inventory/profile and reference provenance, place simple scale proxies, settle dimensions and naming, then review all silhouette families together. No asset family is removed to make the pilot easier.
3. **Material and shape slice:** finish a fence/gate joint, barrel or bale, one cabbage stage, a tree, and a meaningful farmhouse/tractor section. Review the shared material language at near and scene distances. Create real dependency pins only for the selected resources. Changes to the palette/recipes become explicit project revisions.
4. **Complete inventory and motion:** finish all 23 assets, hidden sides, pivots, attachments and promised clips. Shared engine defects discovered during authoring become bounded engine fixes; do not quietly bake one-off workarounds into every asset. Record accepted design exceptions and attributable visual review against exact saved revisions.
5. **Proving scene and reserved profiling:** assemble the planned environment; inspect seams, repetition, scale and simultaneous motion. Run actual browser loading, interaction and resource measurements with concurrent intensive jobs stopped. State device/browser/viewport, warm-up, sample duration, cold/warm results and limitations. Revise budgets only from evidence.
6. **Delivery round trip:** export the exact project revision as an editable bundle with all authored source, pinned resources, maps, recipes and provenance. Import into a clean separate workspace and rebuild offline without provider access. Export a separately labeled runtime delivery; reopen it in Three.js, play all promised clips and compare its visible output with the reviewed source artifact. Runtime delivery does not claim editable restoration.
7. **Pilot acceptance:** the user reviews the assembled pack and representative individual assets. Automated QA, a complete inventory and material-faithful captures are necessary evidence, not taste or release approval. Record unresolved limitations before describing it as game-ready. Publication to Kiln Commons remains a separate authorized step.

The primary consumer is Three.js in a browser. Additional target labels in the project describe intent until an actual importer/runtime has been exercised. The pack's intended open contribution/license policy must be backed by each source and material record; do not infer rights from a filename or strip attribution during bundling. Packaging, naming, previews and documentation should allow someone receiving only the editable bundle to understand what each asset provides and how to rebuild it.
