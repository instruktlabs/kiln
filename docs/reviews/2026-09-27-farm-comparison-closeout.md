# Farm comparison and Workshop closeout

Current scope is the six tractor/cow comparisons and the owner's selected anchors.
The older full 23-asset goal is superseded for execution by the owner's narrower
request. Remaining inventory is a plan, not permission to start production.

## Selected assets

- **Tractor: Opus Candidate C**, review 1, `r_d7cde4de08714737bf76449e58ddcb56`.
  7,184 triangles, 61 mesh instances, five materials, 315,044-byte GLB. Its original
  four-second ArticulationProbe remains. No Astra tractor repair was completed;
  that attempted continuation was stopped when the owner clarified the selection.
- **Cow: Astra Candidate A**, review 3, `r_48950344f03a48129dd1a31eaab6cdf1`.
  3,124 triangles, 40 mesh instances, nine materials, 648,040-byte GLB. Rear roots
  moved inward from ±0.285 to ±0.235 m and higher into the haunch. A forward high
  stifle and smaller rearward hock preserve bovine anatomy. Both Walk and the
  original ArticulationProbe remain. The face, torso and coat direction are retained.

The backward-pointing lower joint is the hock; the true knee/stifle is higher and
forward. Reversing the hock to resemble a front leg would be the wrong repair.
See the [University of Calgary anatomy reference](https://vet.ucalgary.ca/summercamps/anatomy/thursday/production-animals).

An independent Three.js GLTFLoader/AnimationMixer audit tested 1,601 poses in the
saved GLB. Worst stance floor error was below 0.001 mm; maximum stance-speed error
was below 0.000048 m/s for nominal +X travel at 0.18 m/s; swing clearance was 6 cm.
Browser Walk playback and rear orbit were inspected in the actual shared Workshop.
This is a stylized rigid-joint animal, not a skinned production character or a
continuous collision certificate. The 401-key tracks still need runtime reduction
before a herd-scale budget is claimed. Author-submitted counts differ from loaded
scene counts; the values above use the independently loaded GLB scene instances.

Source and GLB outputs match their saved manifest hashes. Exact anchor references,
checks and 12 delivered iterations are retained in the pilot's `review/` directory.
The original authors performed all geometry refinements. Astra High is confirmed
by native turn metadata for both new cow passes; Opus High was requested without
a separate effective-effort receipt. No new owner approval of cow review 3 is inferred.

## Actual Workshop delivery

The installed Workshop at `http://127.0.0.1:4318/` uses the separate Farm pilot's
`workshop` workspace, not an individual candidate workspace.

- Library spans explicitly configured collections. Eight assets / 14 saved
  revisions include all six comparison candidates and two existing standalone
  user-library assets. Source storage and named project membership are distinct.
- `Shapes & Seasons - Farm` (`farm-pack`) has the two exact selected anchors;
  its other 21 inventory entries remain unbuilt. `Farm — model comparisons`
  (`farm-comparisons`) links all six candidates. The cow links were advanced via
  the actual browser membership controls and verified by the public CLI.
- Library filters by named project or standalone status. Details show exact
  membership revisions and support link/replace/remove through conflict-checked
  project updates. Membership changes preserve saved source and build provenance.
- Live Review selects among explicitly supplied observation workspaces. Artifact,
  capture, pin and save requests retain their source identity. The current cow
  journal and GLB were reviewed on the shared surface; the status layout did not overlap.
- Optional host `KILN_WORK_ITEM` groups an author's CLI/MCP sessions. Different
  items cannot inherit each other's displayed artifacts. Legacy histories retain
  their source/run identity and are honestly marked ungrouped.
- Exact live save is followed by a separate project-membership step. A membership
  conflict cannot repeat the asset save. Current UI save destination remains
  workspace storage; CLI/MCP already support explicit collection selection.

The private comparison at `http://127.0.0.1:55393/?asset=cow` also exposes review 3,
first passes, all models, thinking labels and interactive animation controls.

This increment does not implement automatic discovery, a global project catalog
across arbitrary workspaces, a durable source-edit graph, structured per-refiner
effort fields in every asset manifest, agent control, or large-catalog scaling.
The original broader Workshop proposal retains those as future work. No old
history was rewritten to invent grouping or model metadata.

## Validation and package identity

Installed candidate: `sha256:158999a17ff1ac128827e9d7d83326a121e4b8e051d1fecbbcfff8e8c169068c`.
Tarball SHA-256: `d4615ba4d1ea6270c8df42b809056fc6861ab76abda6aec52072720b27d6324c`.
Fresh runtime: `C:/Users/Mattm/X/kiln-commons/farm-pilot/runtime-workshop-final`.
Generated workspace paths were repaired and managed instructions upgraded. The
candidate author runtimes and common GPU service were left intact.

Focused regressions cover catalog failures/qualified identities, exact membership,
observation-source isolation, authoring-item continuity, and explicit host environment
selection. Typecheck, lint, skill consistency and package checks pass. Full coverage
passes with 2,795 tests, two skips and zero failures: 95.11% functions and 92.22%
lines, above the unchanged ratchet (`qa/workshop-coverage.log`). Installed CLI
and MCP both persisted the same explicit item ID and MCP catalog succeeded. Their
fixture used CPU intentionally; actual cow capture receipts report full-material GPU.
The viewer uses the browser GPU. No new performance qualification is claimed.

## Next production cycle

1. Review the final cow, then freeze the two references as art-direction anchors.
   Version the written brief, scale conventions, palette and material roles. Images
   align intent and allow creativity; use model-appropriate wording and image context.
2. Use Opus 5.5 High for the next machinery/building family and Astra High for animal
   and articulation work, subject to results. Preserve original/refining author,
   requested/confirmed effort, prompts, exact revisions, tool traces and costs.
3. Qualify a farmer and a modular material-bearing building before claiming that
   this two-object sample proves characters, architecture or textured production.
4. Progress through small batches of independent assets, typically two or three
   authors, with a shared GPU service and one integration/art-direction review per
   batch. Shared profiles evolve by explicit revisions; do not drift them per asset.
5. Mine tool failures, corrections and owner critique. Optimize actual loaded-scene
   cost, animation tracks, repeated geometry and material use. Then build the full
   Three.js proving scene and qualify editable/runtime bundles and licenses.

The remaining 21 Farm assets, other packs, public publication and new performance
claims are not part of this closeout.
