---
name: kiln-qa-asset
description: Check a Kiln asset's geometry, views, export fidelity, and behavior in its destination project. Use for delivery review, loading, materials, animation, collision, or runtime defects.
license: MIT
metadata:
  kiln-workflow: workspace
---

# Verify an asset for its intended use

Match the checks to the requested delivery. A source build, an image review, a GLB export, and a working asset in a game are different pieces of evidence.

Standalone assets need no project to be reviewed, saved or exported. Do not create a project or impose pack-wide budgets for QA alone. Preserve the intended project selection and exact material dependencies; use `projectId: null` / CLI `--no-project` when a configured default would attach unrelated work. Verify editable standalone deliveries in an independent workspace too, with all declared material resources available.

For project deliveries, verify both editable and runtime packages. Import the editable ZIP into an independent workspace, rebuild saved revisions using their recorded settings and exact material dependencies, and compare artifact hashes. The runtime ZIP is delivery-only and cannot substitute for source/resources. Referenced concept images and original acquisition archives are not embedded in the project ZIP. Test the intended consumer independently. Browser Measure samples under concurrent CPU/GPU workload are exploratory; record the workload and reserve an isolated session before accepting a performance budget. GPU-required image review must show actual GPU fidelity, not a CPU fallback or the interactive viewport alone.

## Before integration

Read the export profile guide (`references/export-profiles.md` in the `kiln-author-asset` skill) when reviewing delivery files. Verify the selected converter separately from the editable/runtime profile. Runtime GLBs must preserve native playback without the sidecar; provenance checks use the sidecar filename and exact byte hash. Keep the canonical editable asset for source and full Kiln review data, and measure actual loading and rendering performance separately.

Read validation/build findings and export warnings. MCP render and inspection results are compact by default: the verdict, the blocking findings and the finding counts come first, repeated findings are grouped by code with the repair text once, and rules that were not requested are left out; decide from that compact result, and ask `detail: "full"` of `kiln_render`, `kiln_edit` or `kiln_screenshot_animation` only when every instance of a grouped finding or every rule record matters, with `retainedReport.path` (`.kiln/review/<operation>/evaluation.json`, pretty-printed) holding the rest; `detail: "lean"` keeps only the verdict, blockers and metrics. `kiln_validate` only checks source; render and inspect the actual geometry when that is the task. Choose broad or part-specific views that reveal the suspected defect. Copy the returned `programRef` exactly for every view, whether it is a short `p_` handle or a full SHA-256 reference; request source text only when a repair needs it. A handle identifies a revision in its store; use full source and artifact hashes for integrity evidence.

Distinguish expected open sheets from invalid solid topology. `geometryDiagnostics` reports boundary edges, non-manifold edges, orientation conflicts and degenerates; it does not prove absence of self-intersection. A capped loft, shell-like surface, or sampled field is not automatically a manufacturing-grade solid.

An intentional boundary can use `markOpenShell(part, 'specific reason')`. Read the
overlap report's acknowledgment and reason; this is an explicit measurement limit,
not a clean result. Closed components are unioned before measuring overlap;
unsupported inward shells or component budgets remain unmeasured. Hidden subtrees
are excluded from category QA, while `hiddenNodes` accounts for their triangles.

`SWEEP_SELF_INTERSECTION` observes tight station curvature or intersecting
consecutive rings in a sweep/loft. Inspect the station and radius evidence. A
`_PARTIAL` finding or `_UNCHECKED` warning means the bounded local analysis did not
finish; even a completed check does not cover distant segments. Review the rest
when those contacts matter. Eased animation is exported as standard cubic sampler
data; inspect intermediate poses, and treat quaternion `q` and `-q` endpoints as
the same rotation when reading loop closure.

The part-overlap observer (`GEO_PART_SELF_INTERSECTION`) tests the most-overlapping pairs first. `_TRUNCATED` means pairs went untested for budget (`pairsNotReached`); `_UNMEASURED` groups parts it could not measure, such as open shells, by reason. Neither is a finding of overlap; check those pairs with `measure` or focused views when they matter. Overlap skips different levels only within the same sibling LOD chain; independent chains can appear together at different levels. Connectivity retains its LOD0 baseline and leaves out visible parts labeled LOD1 and above. An asset has tiers only when its brief asked for them; each set of sibling tiers carries one `defineLod` declaration with its screen-coverage thresholds, or the build fails with `LOD_SET`. Check the thresholds against the brief's switch distances. The written GLB carries each set as one `MSFT_lod` chain; headline triangles and bounds are LOD0's, and `levelsOfDetail` lists every level's triangles and path. Default sheets draw LOD0; review each lower level with a shot whose subject is its `path` and `visibility: "isolate"`, and read each chain's `drawn` for the level every view drew. Findings with `disposition: "observe"` on joins you intended, such as a leg passing into its rail or an open `curveToMesh` end buried in another part, are informational while the report's disposition passes; review the pairs you did not intend.

For an assembly, identify the required contact pairs and the required separation
pairs. Review both ends of supports against their intended neighbors with focused
views and `kiln_inspect` surface measurements, following intermediate fittings
back to the body. A supported cable can end at an unmounted fitting; a bar can
touch one neighbor while its other end floats. Review named separation findings
against those intended connections even when other contact checks pass. Zero surface distance
can mean intersection; it is appropriate evidence for neither a required gap
nor a sound mechanical fitting by itself. Select the actual interface parts,
not the entire assembly. Report unmeasured joints explicitly. `surfacePairs` subjects
are exact `listParts` paths, such as `/Park%20Bench[0]/Bench[0]/Mesh_Seat[0]` for
`createPart("Seat", ...)` under `createRoot("Bench")` in an asset named `Park Bench`,
or unambiguous node names as `measure` takes (`Mesh_Seat` there, since `createPart`
names its mesh `Mesh_<name>`); a missing or shared name fails its own
pair and lists candidate paths.

Read `capture.backdrop` in image results: views are on a neutral grey unless a capture asked for `dark` or `light`, and a silhouette judged on the wrong assumption about the backdrop is not evidence. Check material and camera fidelity independently. A fallback image may still answer a geometry question, but it cannot establish faithful PBR appearance. Keep unresolved export or material findings visible in the delivery report.

Do not darken albedo to compensate for review lighting; preserve the intended material colour and check material-faithful GPU views and the destination renderer.

## In the destination

For Blender, Unity or FBX, read the [engine handoff guide](references/engine-handoff.md) before choosing import settings or trying the experimental exporter. Check the actual target importer and render pipeline; a successful Kiln preview alone does not establish destination compatibility.

Use the project's existing loader and renderer. Read the [integration checks](references/integration-checks.md) for manifests, frames, composition options, and limits.

Confirm scale alongside existing objects, forward direction, ground contact, placement, and useful viewing distance. Check textures and lighting in the destination renderer. Exercise relevant animation, interaction, and collision; sample intermediate poses when checking motion. For web projects use the actual browser view, and for native projects use the destination runtime.

Animation review returns `poseBounds` in world metres for each requested phase,
including the selected subject when a shot names one. Compare those bounds with
the requested ground plane or movement envelope. These measure drawable geometry
before camera isolation, not physical contacts or a continuous swept volume.
Repeated geometry needs phases inside a repeat as well as between keys: quarter
turns of a 16-lug wheel all show the same alignment. Include irregular phases
and inspect the moving subject; identical sampled bounds do not prove constant
ground clearance. Report the range actually measured.

For a requested repeating animation, also read `loopClosure`. It measures local
translation, quaternion orientation and scale at zero and the clip duration,
independently of selected image phases. `open` identifies endpoint gaps; `incomplete`
cannot certify closure. Quaternion sign changes alone are not gaps. A one-shot
opening or attack need not return to its initial pose. `closed` establishes only
endpoint continuity, not smooth velocity, convincing motion or working contacts.
`loopIntent` reports `createClip(name, duration, tracks, { loop })`: `loop` must
close (an open declared loop also warns `LOOP_NOT_CLOSED`), `once` may stay open,
and `unspecified` cannot tell the two apart, so declare intent when a brief says
whether a clip repeats. The GLB carries it as `animations[].extras.kilnLoopIntent`.

For several moving contacts or attachments, pass `measureParts` with up to 16
exact `{name}` or `{path}` selectors. Each phase returns `poseBounds.parts` in
that order, independently of the camera, each with its world `origin`; empty
subtrees such as locators have `bounds:null`, so check a locator by its `origin`.
Check the intended contact parts together. A low scene minimum can come from a
floor or one foot and says nothing about the others; lack of penetration does
not establish support. Bounds still do not prove balance, friction or contact.
CLI uses `--measure-parts parts.json` with the same selector array.

Reproduce defects before fixing them. Correct placement/loader/lighting problems in integration code; change asset source for a geometry or rig defect. Recheck the affected behavior after a repair.

Report the exact artifacts tested, what you ran and saw, repaired defects, and checks left unperformed. Validation, `visualQa: not_assessed`, an AABB overlap test, or a low triangle count is not a substitute for visual or runtime verification.
