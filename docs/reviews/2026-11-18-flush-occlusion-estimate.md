# Flush-face occlusion estimate (issue 367)

Measured 2026-11-18 on the branch `feat/flush-occlusion`, which is stacked on the
flush-face broad-phase branch (issue 368). One Windows 11 PC, Bun 1.4.2. Other work was
running on the PC throughout, so every timing below interleaves the versions it compares.
Timings were taken from 15:51 local time, after a deliberate high-load window on the PC had
ended. Earlier timings fell inside that window and were discarded.

## What was built

`FLUSH_FACES` reports flush pairs whether or not anyone can see them. After the pairs are
found, `findFlushFaces` now estimates for each counted pair (all `candidates`, not only the
listed `pairs`) whether other parts hide it:

- **Points.** Sixteen points spread over the pair's shared area by area, taken over the shared
  regions in the order the box tree measured them. Neighbouring regions sit together in that
  order, so the points cover the area in strata, and any run of regions holding a sixteenth of
  the area gets a point. The first point in a region is its centre; further points move out
  towards its corners. At most 1,024 regions are kept per pair; past that, every second one
  is dropped.
- **Directions.** Fifteen fixed directions over the side the faces are seen from: the normal,
  six at 40 degrees and eight at 75 degrees. For a pair that faces opposite ways, the side is
  the one the face drawn on one side shows. When both parts are drawn on both sides, both sides
  are tested. Rays start twice the flush gap off the plane, so the pair's own faces cannot block
  them.
- **Blocking.** Rays walk the box tree the check already builds. A face blocks a ray only if a
  camera at the ray's far end would see it drawn: it faces that camera, or it is drawn on both
  sides. See-through parts (blended, alpha-tested, alpha-mapped, transmissive or not drawn) do
  not block. Nor do levels of detail that are never drawn with the pair.
- **Result.** One unblocked ray makes the pair `visible`. If every ray is blocked, it is
  `occluded`. That is up to 240 rays for a pair (480 when both sides are tested).
- **Budget.** At most 10,000 rays per build (`maxOcclusionRays`; 0 turns the estimate off).
  Pairs are taken largest first. The first pair the remaining rays cannot cover is not
  estimated, and neither is any pair after it. The estimate reads no clock and uses no random
  numbers.

It is advisory only. Which pairs are reported, their order, every existing field and count,
the QA rules and the verdicts are unchanged. The corpus run below checked this on every asset
against the parent branch's module. The report gains an optional `occlusion` summary
(`visible`, `occluded`, `notEstimated`, `rays`, `maxRays`) and an optional per-pair
`occlusion` field. Both are absent when the estimate is off or there are no pairs. The build
warning keeps today's text unless the estimate finds a pair hidden. When it does, the warning
says the split is a ray estimate, not a render, gives the counts, and names pairs in view
first:

> FLUSH_FACES: 2 pairs of parts have faces on one plane that will flicker (z-fighting) in any
> renderer. By a ray estimate, not a render: 1 in view, 1 hidden behind other parts. Worst in
> view: … Also: Mesh_Floor and Mesh_TileB (0.5 m², hidden). For each pair, …

The longest realistic line is now 767 characters, so `kiln_save` returns warnings whole up to
800 characters (the limit was 700).

## Corpus and method

The corpus has 225 unique GLBs (by sha256), the same set as the issue 368 timing:

- saved pack revisions from before their flush fixes, with their fixed versions;
- the located pack assets (Cathedral Square, Seed Town, H-7);
- the site scene inputs (farm, Foundry Floor, Golden Gate, Cathedral Square).

Each GLB is rebuilt as a THREE scene, as a build sees it. The scene is checked three ways in
rotating order: this branch with the estimate off, this branch as shipped, and the parent
branch's module. Each way runs three rounds and the median is kept. Every round also checks
two things: the shipped report repeats exactly, and with the estimate fields removed it equals
the parent's report. All 225 passed both checks. A rerun with the final 10,000-ray cap gave
the same split on all 76 assets that report pairs, and the same report on two consecutive runs
of each.

CPU load (`\Processor(_Total)\% Processor Time`, three 2 s samples): 9.5, 11.3 and 10.2% at
the start of the corpus run (15:51); 11.8, 10.7 and 10.2% at its end (15:52); 14.5, 11.7 and
13.1% after the focused timings (15:53).

## Per pack

These are the assets that report pairs. "Extra" is the median time with the estimate minus the
median without it, for the same asset in the same rounds. It is noisy, so small negative sums
appear.

| Pack | Assets with pairs | Pairs reported | Estimated hidden | Estimated visible | Not estimated | Rays cast | Check without estimate, sum (ms) | Extra, sum (ms) | Extra per asset, median (ms) | Extra per asset, max (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Saved revisions before their flush fix | 40 | 53 | 7 | 46 | 0 | 2,143 | 1,055.9 | -20.0 | 0.04 | 3.2 |
| Cathedral Square | 15 | 93 | 15 | 78 | 0 | 4,548 | 1,056.7 | 1.6 | 0.11 | 0.7 |
| H-7 | 2 | 39 | 1 | 38 | 0 | 1,101 | 163.5 | 10.5 | 5.24 | 10.4 |
| Farm scene | 6 | 20 | 4 | 16 | 0 | 1,572 | 65.6 | 4.2 | 0.25 | 3.4 |
| Foundry Floor scene | 11 | 22 | 2 | 20 | 0 | 673 | 78.0 | -0.7 | -0.01 | 0.9 |
| Golden Gate scene | 2 | 4 | 0 | 4 | 0 | 24 | 191.8 | 1.0 | 0.48 | 0.8 |
| **All** | **76** | **231** | **29** | **202** | **0** | **10,061** | **2,611.5** | **-3.4** | **0.05** | **10.4** |

Seed Town assets report no pairs, so they have no row. No asset came near the ray cap: the
most rays cast for one asset was 3,633, by the cathedral. With three rounds, the extra time is
below the noise of the check itself; even the sums go negative. The focused timings below use
more rounds.

Focused interleaved timings, 11 rotating rounds of this branch with the estimate off and on:

| Asset | Triangles | Rays | Off, min / median (ms) | On, min / median (ms) |
| --- | ---: | ---: | --- | --- |
| Cathedral | 400,000 | 3,633 | 823 / 1,023 | 884 / 1,032 |
| Windmill | 4,328 | 901 | 10.1 / 10.5 | 11.7 / 12.0 |
| H-7 mech | 90,587 | 1,085 | 157 / 166 | 161 / 171 |

The estimate costs about 10 to 60 ms on the cathedral, or 3 to 17 µs a ray, and about 1.5 ms
on the windmill. That is a few percent of the check on assets with pairs, and nothing on
assets without them. At the cap of 10,000 rays it would add up to about 0.2 s on an asset the
size of the cathedral.

An isolated A/B confirmed that the find pass itself did not slow down. On the cathedral, over
9 rotating rounds with the estimate off, the branch took 819 ms (minimum) and 900 ms (median);
the parent module took 817 ms and 898 ms.

## Hand check

Every pair labelled hidden was checked: 29 pairs, more than the 20 the issue asks for. Each
pair's asset was rendered in the six standard review views (Front, Right, Back, Left, Top and
3/4, from `SIX_VIEWS`) by the CPU review rasterizer at 384 px a cell. Each was rendered twice:
as is, and with a magenta overlay 1 mm off every shared region of the pair. The overlay is the
clipped overlap of the two parts' flush triangles on every plane they share. Any pixel the
overlay changes is part of the pair that a review camera can see. I looked at every grid, with
changed pixels painted magenta and widened by 2 px, and also counted them. See-through parts
and far levels were hidden, as in the estimate. Where several meshes share a name, only those
whose box holds the pair's reported point were overlaid.

| Asset | Pair | Shared area (m²) | Changed pixels, six views |
| --- | --- | ---: | ---: |
| a_1686d36f…-before | Mesh_warm over itself | 0.0017 | 0 |
| a_26dd80ee…-before | Mesh_warm over itself | 0.0038 | 0 |
| a_43fa2e2a…-before | Mesh_warm over itself | 0.00078 | 0 |
| a_81cee922…-before | Mesh_linen and Mesh_throw | 0.38 | 0 |
| a_87388532…-before | Mesh_stone over itself | 0.11 | 0 |
| a_87544887…-before | Mesh_dark over itself | 0.013 | 0 |
| a_d6fe54a2…-before | Mesh_leather over itself | 0.00053 | 0 |
| Cathedral | Mesh_TowerBay0_N_Aisle_Ashlar over itself, 12 pairs (aisle wall tops at y = 23, x from 20.5 to 53.5, both sides) | 4.45 each | 0 each |
| Stall (red) | Mesh_Frame and Mesh_Cloth | 0.0024 | 0 |
| Stall (green) | Mesh_Frame and Mesh_Cloth | 0.0024 | 0 |
| Nave pew | Pew_Seat and Pew_Back | 0.0016 | 0 |
| H-7 mech | Mesh_UpperArm_R_armour and Mesh_UpperArm_R_decal | 0.010 | 0 |
| Tractor | Mesh_Body_Iron and Mesh_Body_Paint | 0.12 | 0 |
| Watermill | Mesh_Gantry_Wood and Mesh_Gantry_Metal | 0.012 | 0 |
| Windmill | Mesh_TowerWood and Mesh_TowerMetal | 0.13 | 0 |
| Windmill | Mesh_TowerMetal over itself | 0.028 | 0 |
| Humanoid work robot | Mesh_facePlate and Mesh_visor | 0.0066 | 0 |
| PVD cluster tool | transferHub_dark and processChambers_body | 0.084 | 0 |

**Error rate: none of the 29 pairs labelled hidden showed in any review view (0 of 29; at 95%
confidence, below about 10%).** The smallest pairs would cover about 20 pixels if they were in
view, so they would have been seen.

Spot check of pairs labelled visible, 13 pairs. Eight showed in the review views, with 64 to
14,787 changed pixels: the Mesh_throw pair, the Mesh_iron pair and Mesh_warm in the saved
revisions, Mesh_Torso_decal on the mech, Mesh_Cloth on both stalls, Mesh_Wheel_Wood on the
watermill and Mesh_RotorBlades on the windmill. Five did not show in any of the six views:

- The PVD tool's transferHub_dark and serviceChamber_body pair faces straight down. It can be
  seen from below, and no review camera looks from below.
- Four Mesh_TowerVault0_Stone pairs in the cathedral, each 39 m², face +Z, tilted 12 degrees
  up. A ray from each leaves the asset, so some direction sees them, but none of the six
  cameras does. I did not find which opening they show through.

"Visible" means visible from some outside direction, which is broader than the six review
cameras.

## Design decisions and what changed while measuring

- **Sampling.** The first version took points from only the four largest shared regions. It
  labelled 49 pairs hidden. Several pairs spread one overlap across many triangles or planes,
  such as the chair frames, whose overlap sits at all four corners, top and bottom. When the
  four largest regions were all buried, the pair was called hidden even though other regions
  were in plain view. Spreading sixteen points by area over all regions, in tree order, brought
  this to 29. A focused test pins it: a small patch in view next to many larger hidden ones.
- **Ray cap.** The cap was first 20,000 rays. Measured ray cost on the largest asset brought it
  down to 10,000, so the worst case stays near a quarter of a second.
- **When the warning changes.** The warning text changes only when a pair is estimated hidden.
  A split that finds every pair in view changes nothing an author would do, so the line stays
  today's word for word. The warning reorders only the pairs it names. The report keeps its
  largest-first order.
- **What blocks a ray.** A face drawn on one side blocks only when it faces back along the ray.
  A camera outside sees through the back of such a face, as it does through an open shell. See-through
  materials and far levels of detail never block, so mistakes lean towards "visible".

## Limits

- Rays are not a render. A pair seen only through a gap narrower than the ray spacing can be
  labelled hidden. So can one seen only on a patch holding less than a sixteenth of its shared
  area. Neither happened in this corpus.
- An occluder closer to the plane than twice the flush gap (at most 1 mm) is ignored. That
  leans towards "visible".
- Meshes the check cannot measure (instanced, skinned, morphed, part of a buffer) do not block
  rays.
- The hand check used the CPU review rasterizer and the six standard cameras. It confirms
  "hidden from the review views", which is the claim the issue asked to check. It does not test
  every direction.
- Some timings are close to the noise floor. The per-asset medians of three include negative
  values, so the sums matter more than any single row.
