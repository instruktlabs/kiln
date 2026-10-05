# Troy scene production and reusable rendering workflows

Continuation plan, 4 October: [Kiln and Troy completion plan](2026-10-04-kiln-troy-completion-plan.md)
consolidates the remaining work after migration, including the owner's subsequent
terrain/ocean and aerial-stability request. Use it for execution order and current
disposition; the original proposal and evidence boundaries below remain retained.

Rolling completion and remaining-work summary: [Troy status](../../packs/troy/STATUS.md).

Latest follow-on: [continuous environment](../reviews/2026-10-04-troy-continuous-environment.md)
is implemented with 67 passing scene tests, preserved near contacts and bounded
hub costs. WebGL2 exact pixel return, owner/device review and full integrated
performance remain open. The active completion plan governs the next slice.

Current implementation: active under the owner's completion goal. Reversed depth
and procedural material LOD are preview defaults; the
[environment review](../reviews/2026-10-04-troy-terrain-materials.md) records 61
passing scene tests, both-backend captures and bounded hub costs. Use the current
completion plan for remaining work.

Historical stop update (4 October): paused at the owner's request for
stabilization and handoff. The combined prototype contains 528 Greeks, 192 Trojans,
two hero placeholders and twelve ships. Eight shore crews can regroup through
packed routes; shared distant walking is now the packed-mode default with exact
nearby motion. Four later landings are implemented in an opt-in trial and end in
shore staging. Archer asset/rig inspection is saved, but equipped archers and the
optional duel are not implemented. All 53 retained tests and the latest two-backend
landing checks pass within their scope. Nothing is in flight. See the rolling
status and handoff for current evidence, unfinished work and restart instructions.
The planning body below retains its initial proposals and does not establish final
scene, device or release acceptance. Its pause instruction is superseded by the
later active completion goal.

Planning date: 3 October 2026. Owner-requested implementation plan; not a claim
that the scene, GPU prototypes or derivative tools already exist. This document
organizes the [approved direction and asset evidence](2026-10-03-troy-scene-direction.md)
and [offline character experiments](2026-10-03-troy-character-rendering-spike.md).
It supersedes earlier Troy deferral as the working plan. The previous foundation
release stays closed within its recorded limits.

Implementation follow-ups: [crowd runtime](../reviews/2026-10-03-troy-crowd-runtime.md)
and [vegetation comparison](../reviews/2026-10-03-troy-vegetation-runtime.md). These
checkpoints report current prototypes without changing the exit conditions below.

## End-state objective

Deliver a cohesive, film-inspired Troy environment that reads convincingly from
the sea, battlefield, wall and city: ships approach and unload onto a broad sandy
shore rising toward monumental fortifications; Greek and Trojan armies hold
distinct formations; Achilles and Hector face off between them with an optional
duel; a dense city with the approved courtyard vegetation stands behind the walls,
with mountains beyond. Preserve the approved asset style and make scale, motion,
contacts, controls and transitions convincing at both human and aerial viewpoints.

Support that scene with measured, range-appropriate character and vegetation
rendering, reproducible standalone derivative scripts, and reusable authoring/QA
recipes. Choose representations by visual error and actual device costs. Keep
editable masters intact, preserve actor identity across representations, and keep
these experimental workflows outside Kiln's core build, exports, CLI/MCP and
default authoring requirements. Finish with a qualified, reproducible scene/site
delivery and clear evidence of supported devices and remaining limits.

## Experience and scope

The first landing view should show the whole story: sea and ships in the foreground,
Greek landing/staging activity, a clear sandy battlefield, the two heroes, Trojan
formations and a dominant wall silhouette. City roofs and the citadel rise behind
the wall; mountains establish distant depth. No exterior residential or dock
district. Existing assets set the stylized material language; the reference film
sets composition and scale rather than requiring photorealism or copying frames.

Choose world dimensions during blockout using actual wall/gate, ship and actor
bounds. The sea-to-wall slope must read in the hero view while supporting feet,
formations and traversal. Keep the city visibly dense without making every building
a fully simulated interior. The old battle composition is a reference only. The
wooden horse is not automatically part of this landing/face-off scenario.

Required review routes: sea approach → beach landing; Greek rear → hero arena →
Trojan front; gate passage → wall walk; street → courtyard → citadel; elevated
orbit and overhead descent covering all zones. Start with overview/orbit and
guided viewpoints. Reuse the established inspection/walk and touch-control patterns
where appropriate; this brief does not require an RTS or freely playable army.
Desktop drag/orbit and zoom, mobile drag/orbit and pinch, obstruction recovery,
keyboard focus, loading and reset must work through the final site's scene shell.

The implemented idle blockout remains 288 Greeks and 192 Trojans. The owner's
subsequent one-rower-per-oar requirement supersedes its small shipboard allocation.
For the current 14 pairs of oars, use 28 crew per ship. A revised candidate is 464
Greeks, 192 Trojans, two heroes and twelve galleys: initially 112 Greeks aboard,
112 unloading, 192 in formation and 48 staging. The ashore total includes the crews
of the four already beached ships; do not create extra copies. This is a candidate
for qualification, not measured capacity. See the [rowing checkpoint](../reviews/2026-10-03-troy-rowing-layout.md).

Landing is a finite state sequence: aboard → transfer to shore → staging → formation.
Keep one actor ID and one world/animation clock; deck parenting ends at the actual
supported transfer. No duplicated soldiers, hidden reset teleports or walking
through hulls. An explicit replay can reset the sequence. The heroes face off by
default; the optional duel needs paired choreography, safe spacing and a defined
return/reset. Archers need a reviewed equipped pose and draw/release motion;
projectile combat and casualty simulation are not implicit requirements.

## Starting inventory and gaps

Retain the approved olive, cypress, fig and shrub revisions and repaired horse
identified in the direction document. The horse's eye clearance and attachment
checks pass within sampled views; its inherited gallop still penetrates the ground
and needs a locomotion pass before terrain running. Resolve the saved +X versus
actual +Z forward convention at intake rather than silently rotating masters.

Existing soldiers/heroes have idle and attack clips only. Needed work includes
walking/start/stop, equipped archers, boarding/step-off and unloading poses,
attachment/grip checks and the paired duel. The owner selected seated rowing with
one soldier per oar, two per row, hip-secured swords and a lowered plank for
single-file disembarkation. Keep the boat size; rework the floor, seats and oars.
Qualify hand/foot/seat contact, oar stow, stand/queue, the route around the mast,
the actual hull exit and plank support before promoting the landing.
Validate joined wall modules, gate animation, wall-walk access and city passages.
Author additional props only from demonstrated composition/interaction needs:
landing gear, amphorae/crates, limited awnings, statues or building variants.
Gemini 3.8 Flash High in AGY is authorized for suitable additions; vegetation stays
on Sol 6.1 and the current horse repair was Astra Max. Do not use Claude Code.

## Rendering options and selection order

“Optimal” means the least costly maintainable representation that meets the same
appearance, interaction and device requirements. There is no universal winner by
distance alone. Use projected size, camera elevation, occlusion, motion and role;
an interacting soldier stays detailed even if small. Choose per species/character
class and quality tier, with hysteresis and stable transition state.

### Soldiers and other characters

| Candidate | Suitable range / role | Tradeoff and disposition |
| --- | --- | --- |
| Original articulated meshes and individual animation | Heroes, nearby interactions, landing | Reference fidelity and attachment control; bound the number of active mixers |
| Instanced rigid parts with shared phase groups | Near/middle formations; first baseline | Uses existing assets and batching; measure matrix uploads, phase buckets and per-part draws |
| Merged per-material meshes with baked part transforms | Middle and potentially far formations; first new prototype | Matches the current rigid articulation; per-instance clip/time, compact shared transforms; custom normals, bounds, shadows and attachments need proof |
| Instanced skeletal animation / bone-animation textures | General workflow for future skinned inputs | Useful for actual skins; optional one-weight rigid conversion only if it buys compatibility. Do not require rerigging Troy or lose pivots/sockets |
| Full position/normal VAT | Arbitrary fixed-topology deformation; comparison candidate | More general and potentially simpler vertex lookup; higher texture bandwidth/storage and constrained interaction |
| Pose/frame geometry cache | A few tiny distant pose buckets | Simple lookup/instancing baseline, but geometry residency and temporal steps can be worse than transform textures |
| Simplified animated 3D LODs | Middle/far, especially elevated cameras | Preserves parallax and dynamic lighting; simplify with part/material/attachment boundaries and measure error over motion, not just rest pose |
| Animated directional billboard | Very small distant soldiers | Fewer view samples than a full atlas; poor elevated/oblique views unless covered explicitly |
| Animated hemispherical/octahedral impostor | Very far soldiers with broad camera coverage | Better view coverage; frame × direction × appearance atlas growth, depth/alpha overlap and shadow mismatch can dominate |
| Formation-level proxy/impostor | Extreme distance only, after individual methods | Possible density read with few submissions; no nearby interaction and difficult parallax/disocclusion. Split back into stable IDs before approach |
| GPU compute deformation/culling or indirect draws | Optional later WebGPU specialization | Can amortize work across passes; introduces backend divergence and buffers. Not the initial shared solution |

Current evidence favors testing part transforms first: soldier idle textures are
about 51 KiB versus 7–8 MiB for full position/normal VAT at the measured 30 Hz layout.
The fast sword-tip reconstruction error falls from 54.1 mm at 30 Hz to 3.86 mm at
120 Hz in finite CPU samples. Bake rate must follow clip error; neither figure
establishes GPU speed or final quality. Details and exact source hashes remain in
the character experiment document.

Implement a full-motion reference, then compare ordinary rigid instancing with
merged part-transform playback. Add simplified geometry to the winner. Test full
VAT only against a concrete shader/compatibility concern, and animated impostors
only if far animated geometry remains costly. Reject unsuitable families on
evidence before coding them all. A skeletal fixture in the generic workflow
prevents confusing rigid-only support with universal character support.

Batching, animation and simulation are separate decisions. Chunk formations for
culling and coarse routes; give nearby/landing actors individual contact and
avoidance updates. Use deterministic per-actor phase/appearance variation and
scheduled far updates rather than hundreds of complete scene hierarchies.
Preserve clip time, facing, equipment and actor ID when LOD or render tier changes.
For shadows use the light's view and a separate caster policy, never blindly reuse
camera-facing geometry. Shader deformation must reach depth/shadow passes and
invalidate any cached shadow that otherwise sees only matrix motion.

### Vegetation and static objects

A quad is a four-corner card, usually rendered as two triangles. It is the support
geometry for a billboard, not a distinct optimal technique. Compare these options:

| Candidate | Where to test | Principal concern |
| --- | --- | --- |
| Instanced original opaque meshes | Near and baseline everywhere | Already only 1,252–4,676 triangles and 2–4 draws per approved plant; batching may be sufficient |
| Reduced opaque meshes / canopy hulls | Middle/far; first derivative candidate | Retain approved crown shapes and trunks; often preferable to alpha overdraw for these solid clumps |
| Upright camera-facing quad | Far, low camera elevation | Cheap geometry but flattened depth and weak overhead coverage; not a global default |
| Fully camera-facing quad | Very small far objects | Faces overhead camera but may appear to tilt or rotate the tree; test ground anchoring and shading |
| Crossed cards, optionally with a top card | Far, broad but limited viewpoints | More stable world orientation; intersection seams, duplicate silhouettes and overdraw |
| Directional atlas with a top view | Far, limited elevation bands | Smaller capture set; blending and view-switch errors must remain invisible |
| Hemispherical/octahedral multiview impostor | Far trees in orbit/aerial views | More view coverage and optional depth parallax; more atlas/sampling cost. Full-sphere coverage only if the camera envelope needs below-object views |
| Distant vegetation cluster proxy | Background city canopy only | Coarse culling and parallax; never substitute for trees along accessible streets |
| Screen-size fade/cull | Subpixel shrubs or hidden objects | Only where disappearance is visually immaterial; preserve intended density and shadow policy |

Use the four approved plants to choose among reduced opaque geometry, crossed
cards and multiview impostors. Start the capture/runtime path on one olive, then
check the tall cypress, broad fig and low shrub; they need not choose the same
representation. A cheap shrub mesh or size-based cull may beat any atlas. Tree
wind is a separate visual decision; static impostors cannot silently replace a
strongly moving crown. Do not reintroduce the rejected spiky leaf decoration.

Capture alpha directly from the 3D renderer, not by removing a gray background
from review PNGs. Specify view bases, pivot, bounds, padding and mip-safe dilation.
Compare alpha test/coverage with blending on actual devices; do not assume all
MSAA modes or fallback paths support the same coverage behavior. Treat albedo as
color and depth/normals as data; distinguish relightable captures from fixed-light
beauty atlases to avoid double lighting. Evaluate normal/depth channels only when
their quality benefit justifies memory and sampling. Compression is optional and
must preserve alpha coverage. Shrink-wrap card geometry is another measured way
to reduce empty pixels; more vertices can be cheaper than more overdraw.

## What the existing stack and external references establish

Local Three.js is pinned to 0.186.1. Existing scene-kit batching, Foundry's
`plant-material.ts` and `plant-lod.ts`, and runtime-scene guidance are useful
baselines. Foundry already uses projected-size LOD and a shared opaque plant
material. Its custom instance transforms deliberately do not cast shadows; copying
that material is not proof of a shadow-capable Troy implementation.

- Three's [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html) supports
  same-material mixed geometry with per-object culling. Compare it for static
  variants; it does not by itself solve independent character animation.
- The [r186 skinning-instancing example](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_skinning_instancing.html)
  shares an animation source. The newer [individual-pose example](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_skinning_instancing_individual.html)
  uses compute buffers and explicitly requires WebGPU; it still evaluates poses
  on the CPU. Neither is a drop-in independently animated dual-backend crowd.
- [InstancedMesh2](https://github.com/agargaro/instanced-mesh) advertises culling,
  LOD and skinning. Inspect pinned source, licensing, renderer integration and
  maintenance before adoption; no dependency or backend compatibility is assumed.
- [NVIDIA's animated-crowd chapter](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-2-animated-crowd-rendering)
  demonstrates animation textures, instancing and mesh LOD together. Its old
  DirectX hardware timings are not Troy capacity estimates.
- [SideFX VAT documentation](https://www.sidefx.com/docs/houdini/nodes/out/labs--vertex_animation_textures-3.1.html)
  distinguishes vertex and joint baking and notes memory/interaction limits.
  Its supplied engine shaders are not our Three.js integration; no Houdini
  dependency is required by this plan.
- [Octahedral impostor reference](https://github.com/agargaro/octahedral-impostor)
  is marked work in progress. Study capture/view selection; do not claim an
  animated-character pipeline or supported backend from a static demo.
- [SpeedTree's culling design](https://docs9.speedtree.com/sdk/doku.php?id=culling-and-population-structures)
  uses spatial cells, a useful reference for large vegetation populations.
- [meshoptimizer](https://github.com/zeux/meshoptimizer) offers attribute-aware
  simplification and boundary controls. Animated LODs still require sampled-pose
  checks; a rest-pose simplification error is insufficient.

These references inform the candidate set. The proposed selection for Troy is an
inference from our assets, not a published benchmark result.

## Standalone experimental tools and contracts

Develop in the private evidence workspace under
`review/troy-expansion/runtime-lab/`, beside the existing character study. Use an
explicitly pinned local Three.js adapter and opt-in commands. After proof, a
separate `scenes/experiments/runtime-derivatives/` area is a possible reviewable
home; no root build hooks, package exports, tool registry entries or installed
default skill requirements are added by this plan.

The following define the intended script responsibilities. The first rigid-only
`bake-animation.mjs` now exists in the external lab; the
[implementation checkpoint](../reviews/2026-10-03-troy-implementation-progress.md)
records its tested scope. Other commands and the broader bake modes below remain
proposed, not available capabilities:

| Script / component | Input → output |
| --- | --- |
| `inspect-input.mjs` | GLB plus optional source manifest → hashes, dependencies, units/axes, materials, parts/skins/morphs, clips, bounds, unsupported features |
| `derive-mesh-lods.mjs` | Source + explicit error/boundary policy → immutable reduced meshes and remaps, preservation/error report |
| `bake-animation.mjs` | Source + clips + explicit mode/precision/error policy → part-transform, bone-transform or vertex data, deformed bounds and reconstruction receipt |
| `bake-impostor.mjs` | Source + capture profile + optional clip → atlas channels, card/proxy geometry, direction/frame layout and capture receipt |
| `preview-derivatives/` | Source and derivatives → matched interactive views, LOD lock, frozen-time orbit, clip/phase controls and backend selection |
| `qualify-derivatives.mjs` | Fixed inputs, views and workloads → source/derivative comparisons, timings, resource costs and unsupported checks |
| `select-policy.mjs` | Measured candidate reports + tier constraints → explainable per-class range/shadow choices, with explicit unresolved cases |
| `verify-delivery.mjs` | Manifest and output tree → hash/resource closure, rebuild checks and license/attribution report |

Separate a renderer-neutral manifest from the Three adapter. Accept ordinary GLBs;
Kiln revision/project metadata is optional provenance, not an intake requirement.
No Troy IDs, scene dimensions or camera distances belong in reusable script logic.
Reject unsupported skin/morph/material/animation features explicitly or retain
the original representation. Never silently flatten a rig or drop attachments.

The versioned derivative manifest records input bytes and external resources,
generator revision/dependency lock, normalized settings and seed, unit/axis/pivot
conventions, output hashes, bounds over motion, LOD errors, clip intervals and
loop policy, texture dimensions/formats/color spaces/sampling, atlas view bases,
material channels, backend requirements, licenses and validation receipts.
Separate immutable bake identity from scene population, range and lighting policy.
Changed source/settings invalidate the derivative; no overwriting canonical assets.
Support dry-run resource estimates, bounded jobs, cancellation and resumable outputs.

Transform/VAT data need exact addressing and explicit interpolation, not ordinary
color filtering or lossy image compression. Preserve vertex/part indices through
simplification and packing. Test nonuniform scales, quaternion hemisphere changes,
mirroring, material splits, seams and attachment motion; reject unsupported shear.
Pin alpha/depth conventions and the meaning of captured normals. Include tiny
rigid, skinned and static fixtures plus at least two unrelated asset families
before describing the workflow as asset-agnostic. New behavior follows focused
failing tests first, then public-CLI/consumer integration checks.

## Bounded experiment and acceptance policy

First reject candidates with broken silhouettes, motion, contacts, materials,
transitions or backend support. Among survivors, choose the measured tradeoff
across CPU work, GPU work, frame pacing, residency, downloads and startup. Prefer
the simpler implementation when differences are within repeat noise. Record why
each rejected family lost; do not run an exhaustive Cartesian product.

1. Inspect one soldier/clip and one olive; compare reference and baseline with
   the first new candidate. Run visual/motion tests before performance.
2. At 480 soldiers, screen plausible candidates using one warmed 30-second
   ground-level path and one aerial path per backend. Repeat noisy/close outcomes.
3. Confirm the selected implementation at 128, 480 and 1,000 soldiers. Treat
   1,000 as stress evidence, not promised scene density. Add new clips and actual
   equipment before final selection. Larger scales are evidence-driven extensions.
4. For vegetation, use the blocked-out city's actual counts/density and a 2×
   stress case. Include overlapping crowns, streets, silhouettes against sky and
   overhead descent. Confirm each of the four species.
5. Test combined armies, vegetation, ships, water and shadows in the scene. Short
   isolated wins must survive the complete frame; expand duration only for a
   demonstrated timing/thermal concern. No automatic 108-minute audit.

Owner-requested performance setup: before the next timing run, quiet avoidable
background work and minimize the Codex app. Pause test-owned animated previews and
finish builds/tests/captures first; do not overlap CPU validation or another GPU
capture with sampling. Preserve unrelated user sessions and the shared renderer.
Keep the benchmark browser foregrounded and verify page visibility. Record actual
quieting/minimization actions and observed idle load; if minimization or isolation
cannot be verified, report that limit rather than calling the run quiet. Earlier
measurements with uncontrolled load retain their documented limits.

Record actual renderer/backend, device/driver, dimensions/pixel ratio, cache state,
scene/source/settings identities, CPU and GPU timing scope, p50/p95/p99 intervals,
outliers, draws/pipelines by pass, submitted geometry, decoded texture/buffer bytes,
transfer bytes and shader/load time. Texture estimates include padding, channels,
animation/view samples and mipmaps. Require visible, uncontaminated samples;
retain rejected observations with reasons. Never turn unsupported GPU timing into
zero. Compare against both a full-quality reference and the previous candidate.

Proposed product targets are steady 60 fps on the selected desktop tier and
30 fps on a qualified lower mobile tier, subject to named device/resolution
agreement during the prototype. They are goals, not results. Preserve existing
site hitch-investigation limits and do not loosen them to make a candidate pass.
Physical mobile qualification remains distinct from emulation; if unavailable,
report mobile as unqualified rather than claiming completion for that device.

Visual checks include frozen-time 360° orbit, top views, LOD boundary approach and
retreat, silhouettes and alpha edges, depth between soldiers, clip transitions,
hand/equipment grips, feet on slopes, animation loops and shadow changes. Define
and freeze screen-space error tolerances from reviewed pairs before selecting
distances. Use hysteresis and bounded blends without prolonged double drawing,
ghost armies or density changes. Raycasts/collisions target logical actors/proxies,
not a transient billboard; keep selection identity stable.

## Production sequence and exit conditions

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| T0 — Intake and blockout | Exact asset inventory; camera routes; sea/beach/slope/wall/city/mountains with formation and ship placeholders | Owner can judge scale, wall dominance, interior density and hero sightline; route widths and heights measured |
| T1 — Rendering prototypes | Soldier baseline + part-transform comparison; opaque plant LOD versus card/multiview candidates; generic manifests | Evidence selects provisional per-range implementations on both backends; unsupported cases and costs explicit |
| T2 — One complete slice | One landing ship/group, one Greek and Trojan formation, wall archers, hero arena, one courtyard | Supported disembark, grips, foot contact, gate/wall access, camera transitions and source/derivative continuity work together |
| T3 — Full composition | Scale to working populations/ships; finish terrain/water, city/mountains, vegetation and necessary props | Whole scene tells the intended story from every required route; landing settles without duplication; asset additions reviewed |
| T4 — Interaction and optimization | Face-off/optional duel, replay, final LOD/shadows/culling, tier policy and startup preparation | Correct motion and controls; selected targets measured in combined scene; no hidden appearance regression |
| T5 — Reuse and documentation | Standalone tools, fixtures, manifests, recipes and evidence | Rebuild from pinned inputs; demonstrate non-Troy inputs; document limitations and fallback choices |
| T6 — Delivery | Scene package, exact project links, resources/licenses, site cards/stills and Cloudflare artifact | Offline/consumer/site gates, owner visual review and deployment/production identity verification; rollback recorded |

T0 determines routes/counts needed by T1. T1 proves representation before T3 scales
it. Asset motion work can proceed alongside T1, but its new clips must requalify
the bake. T2 is the integration gate before multiplying content. Add optional
statues/building variants during T3 when they serve the approved composition.

## Skills and toolchain boundary

Current maintained scene guidance already covers instancing, derivatives,
impostor limits, shader-shadow updates and measured quality. First keep new
recipes beside the experiment. After T5, integrate only demonstrated selection,
intake, bake, preview and QA instructions into the optional compose-scene runtime
reference, with links to explicitly available scripts. Qualify fresh workspace
copies and managed upgrades; preserve existing author customizations. Do not
advertise a CLI/MCP capability merely because a script exists in a scene workspace.

No automatic engine/toolchain integration is part of this goal: no new core
exports, asset schema mandates, runtime dependencies, default build steps or
mandatory LODs. Any later promotion is a separate decision based on reuse and
maintenance evidence. Owner acceptance, structural QA, runtime qualification and
publication stay separate, explicitly recorded states.
