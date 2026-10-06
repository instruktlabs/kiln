# Blind setup and eight-asset dogfooding, October 5, 2026

Eight different asset types produced editable source, GLBs and preview sheets.
The two AGY public-clone trials completed setup and independent authoring without
operator intervention. Both OpenCode public-clone trials completed workspace setup
but stopped at the author handoff. Separate, explicitly assisted authoring sessions
then completed those two assets. All four prepared-workspace authorings and their
four edit turns completed. This is evidence of useful engine breadth and several
workflow and review weaknesses, not blanket asset or release acceptance.

The most consequential findings are incomplete child-process handoffs, confident
visual claims contradicted by geometry, and loss of repeated parts during a
localized edit. No core geometry regression was isolated by this campaign.
One evaluation-tool defect was reproduced and fixed: native MCP calls were being
missed in the current harness trace formats. Targeted skill guidance was updated
after the trials; those changes have delivery checks but no new blind-model
qualification yet.

## Candidate, models and evidence

- Public GitHub clone and prepared runtime head:
  `42fab36d700ef86eed6581ca993d838dfb23af3c`, version `0.10.0`.
- All eight workspace runtimes were checked after authoring and report that head
  and build identity
  `sha256:58b1b1784701b3b04bac6e7a429ea5dd9d1aeac646e5189bbb21f251e9f1a295`.
- AGY `1.2.17`: `gemini-3.8-flash-high`, explicitly `--effort high`.
- OpenCode `2.0.14`: `opencode/muse-spark-1.3-contributor-free`, the available
  Muse Spark Contributor 1.3 route. A real READY probe and exported native session
  metadata verified it; the model-list command alone was insufficient. No model
  substitution or paid API fallback was used.
- Maintainer toolchain: Bun `1.4.2`, Node `22.23.3`, npm `12.2.0`.
- Evidence root: `C:\Users\Mattm\X\kiln-dogfood\blind-assets-2026-10-05`.
  `review/index.html` contains all eight preview sheets and source/GLB downloads,
  with separate baseline and edited files. It is a local artifact, not a publication.

The protocol came from the maintained setup and batch-dispatch clean-room guidance,
`docs/harnesses.md`, `docs/dogfooding.md`, and the existing evaluation records. The
earlier October readiness campaign was background for the operator only. Agents
received no prior results, engine implementation, examples or asset repair hints.
The prepared runtime was a fresh local clone, fresh frozen dependency installation,
and fresh viewer/runtime build. It remained frozen while the repository fixes were
made. The four public-clone agents performed their own installation and setup.

There were four public-clone trial cells, four prepared authoring cells, four
predeclared edit turns, and two assisted recovery sessions. Child setup/author
processes and READY probes are additional episodes, not extra successful trials.
The recovery driver records `stage: null` because its special argument was parsed
numerically; the `*-assisted/stage-0-*` paths and prompts identify those sessions
unambiguously. Original receipts were preserved; `derived-receipts.json` is the
separate recount using the fixed trace parser.

## Outcomes

Times are observed process wall times rounded to minutes. Runs overlapped and
tasks differ, so these are neither benchmarks nor a model ranking.

| Trial | Route and setup | First attempt | Artifact and review |
| --- | --- | --- | --- |
| Brass astronomical telescope | AGY, public clone, ordinary path | Complete, 18.7 min | Recognizable brass telescope, nested tubes, hood, yoke and tripod. Saved revision, source, GLB and sheet. Elevation clip has one exported track with matching endpoint poses. |
| Victorian greenhouse | OpenCode, public clone, ordinary path | Incomplete handoff, 3.7 min | Separate author completed in 6.0 min. Saved/exported, but roof panes are perpendicular to the sloping frame despite a claim of correct seating. Door track closes at its endpoints. |
| Canvas mountaineering backpack | AGY, public clone, path with spaces | Complete, 23.9 min | Saved/exported; routed straps, buckles and blanket are recognizable. At sheet scale the canvas looks comparatively rigid and the requested wear/folds are weak. |
| Reef manta ray | OpenCode, public clone, path with spaces | Incomplete handoff, 4.3 min | Separate author completed in 7.3 min. Seven tracks have matching start/end poses over four seconds. Visibly segmented, overlapping wing pieces fall short of the smooth continuous-body brief. |
| Hollow ventilation transition duct | AGY, prepared workspace | Complete, 12.3 min | Convincing rounded-rectangular to circular hollow transition, flanges and panel. Saved/exported. The panel edit completed in 2.7 min. |
| Sword fern clump | OpenCode, prepared workspace | Complete, 3.3 min | Saved/exported. Reads better from above than edge-on. The 1.4 min edit shortened the target frond but deleted 12 leaflets; duplicate names prevented built-in revision comparison. |
| Celadon teapot | AGY, prepared workspace | Complete, 13.5 min | Saved/exported, coherent glaze/handle/lid, visible body faceting. The hollow spout overlaps an uncut body wall at its junction. A 3.7 min tip edit preserved unrelated geometry and motion. |
| Lunar salvage crawler | OpenCode, prepared workspace | Complete, 2.7 min | Saved/exported baseline; functional but blocky mechanical treatment. The 1.5 min rack edit preserved other components but was exported without saving a child revision. |

All eight final baseline GLBs and all four edited GLBs pass the independent
Khronos glTF validator with **zero errors and zero warnings**. The wider scan also
checked saved duplicates and retained draft exports: 31 files, all passing. This
establishes file validity, not visual quality, functional clearances, consumer
performance or owner acceptance.

The source set exercises custom mesh topology, lofted/hollow forms, Boolean work,
repeated foliage, hierarchy, animation, procedural textures and packaged recipes.
Concrete recipe use includes rubber, glass, cloth, painted metal, emissive material
and packaged brown-leather texture maps. It does not qualify every pack or the
Projects, shared material-library, LOD and destination-scene workflows.

## Findings from the traces and exported geometry

### 1. OpenCode stopped at the independent-author handoff

Both setup parents returned exit code zero while their final messages described
waiting for an author. That is incomplete task execution. For greenhouse, the
launched author session contained only its user prompt and no model tokens. The
first manta author reached ten messages and Discovery, then stopped; its later
replacement also contained only the initial prompt. Neither initial trial had a
finished asset before intervention.

Separate operator-launched authors, in the workspaces the original trials created,
completed the original asset briefs with the same model and no geometry hints.
Their outputs are useful asset evidence, but do not convert the original onboarding
attempts into passes. The evidence implicates process/session handoff, rather than
a missing engine capability. It does not isolate a single OpenCode termination
cause. The maintained setup skill now requires waiting for the child terminal
result, retaining logs, checking artifacts and the saved revision, and verifying
that an earlier child stopped before launching a replacement.

### 2. The greenhouse review missed a ninety-degree frame error

The final source defines `TILT = 90 - PITCH`. The rafter long axis uses
`[-s*TILT, 0, 0]`, while an XY pane uses `[s*PITCH, 0, 0]`. Their relevant axes
therefore differ by 90 degrees. The exported six-view sheet visibly shows panes
standing out of the roof. Matching centers and the right nominal pitch were not
enough, and the agent's claim that the panes were seated in their frames is false.

The shared geometry reference now directs authors to check all transformed panel
corners against the frame plane and opening, as well as an oblique view. This is
general shape/fit guidance; greenhouse dimensions remain in its asset workspace.

### 3. A localized fern edit preserved the wrong inventory

The edit changed the tallest frond length from 1.06 to 0.80. Its length-dependent
construction also reduced the exported node count from 389 to 377. Independent
comparison found 336 unchanged nodes and all changes confined to the intended
frond, but twelve leaflets disappeared. The final response claimed that all 38
leaflets had been redistributed. That claim is contradicted by the exported files.

Repeated sibling names also caused Kiln's comparison to reject the structure. The
agent disclosed this rejection, then relied on a small source diff and bounds.
Those are insufficient preservation evidence. The geometry reference now makes
assembly/element indices and retained child counts explicit; the refinement skill
calls for an inventory check when resizing repeated structures.

### 4. Exact preservation can coexist with an incomplete asset

Independent comparison decoded the baseline and revised GLBs, compared accessor
bytes, material records, world matrices rounded to eight decimal places, and
exported animation targets/times/values. Duplicate sibling names in the fern were
disambiguated by stable occurrence index for reviewer analysis only; this does
not imply that Kiln can address those ambiguous parts.

| Edit | Independently observed change | Preserved |
| --- | --- | --- |
| Duct panel out by 0.15 m | Five world transforms: assembly and four child meshes | Seven nodes; all geometry/material records |
| Tallest fern frond shorter | 53 changed/removed nodes within that frond, including twelve removed leaflets | 336 nodes outside the changes; no animation present |
| Teapot tip bore +20% | One mesh's geometry changed | Twelve nodes and both lid animation tracks |
| Crawler rack up by 0.2 m | Fifteen rack/support nodes; support geometry extended | 97 nodes and all three crane tracks |

The teapot's body is a continuous shell without a spout cutout. A raycast against
its exported body triangles, along the start of the authored spout centerline,
hits the wall at approximately `[0.08114, 0.04919, 0]`. A hollow tube and visible
join do not establish a usable pouring passage. The tip edit is localized and
correct in isolation; it does not repair that baseline limitation.

The crawler's revised source/GLB/PNG exist, but there is no saved child revision.
The agent interpreted the requested filenames as sufficient delivery despite the
collection refinement contract. The refinement skill's closing export example now
states explicitly that file writes follow the child save and do not create one.

### 5. Errors were often recoverable, but consumed avoidable work

- OpenCode repeatedly tried POSIX `head`, `which` and `python3` in PowerShell.
  The tools failed and the agents recovered. This is harness/platform friction,
  not an engine defect.
- AGY's isolated home triggered a missing PowerShell-profile path repeatedly.
  These messages did not establish failure of the following command. They should
  be separated from engine errors when mining transcripts.
- The telescope tried the nonexistent `differenceGeo` name and recovered through
  Discovery. The duct hit a precise rounded-box radius rejection, an unsupported
  capture `preset`, and a guessed part name, then corrected them.
- The duct called `kiln_inspect` with `image: false` but no numeric selector. The
  error text correctly named the missing selector, while the generic `next` field
  incorrectly recommended editing source. Improving that diagnostic is a bounded
  engine follow-up; it was not changed here without a dedicated reproduction.
- The teapot encountered zero normals rejected by glTF validation, investigated
  its authored geometry, and repaired the source. The final exports validate.
  This is evidence that the guard caught a real invalid draft, not an isolated
  regression in an engine primitive.
- AGY's streamed parent trace could stop updating while a child continued working.
  Native conversation records showed progress. A quiet stdout stream alone is
  insufficient evidence of a hung run.

The regex error candidates in `trace-audit.json` include documentation excerpts
and profile warnings. Their raw count must not be presented as an engine error rate.

### 6. The evaluator missed actual MCP use

OpenCode 2 records calls inside its `execute` wrapper at
`part.state.metadata.metadata.toolCalls`. AGY can use `call_mcp_tool`, naming the
server and tool in its parameters only on a later step update. The existing
counter missed both forms and could report no workspace MCP usage despite real
calls in native traces.

`scripts/tier2-dogfood.mjs` now counts observed OpenCode nested calls alongside the
wrapper and merges AGY step updates before resolving the dispatcher. It does not
infer execution from generated code or tool-output prose. Focused tests first
failed on both formats and then passed after the change. Original campaign
receipts remain untouched; the derived recount is separate.

Parent-process counts exclude independent child sessions. The telescope author
made 25 observed workspace MCP calls; the backpack author made 35, separately from
its one-call setup probe. `child-mcp-receipts.json` records those native child
counts. Zero parent MCP calls must not be interpreted as zero author MCP use.

## Isolation and evidence limits

AGY used a fresh home/config/data directory and retained OS-keyring sign-in without
copying credentials. OpenCode used fresh XDG configuration and private standalone
servers while retaining its account data. An inherited global `kiln` tool remained
visible in nested OpenCode context. Authors were instructed to use
`kiln_workspace`; this is a documented inherited-context limitation, not a claim
of an empty OS account or filesystem sandbox.

No engine implementation/example reads were found in the audited AGY tool inputs;
the backpack setup did execute the documented render-service entrypoint. The
teapot wrote diagnostic math scripts to AGY's own scratch directory outside the
requested workspace. Those files and commands are retained as a boundary deviation.
The initial OpenCode parents inspected ambient configuration and exposed unrelated
tool context. Consequently the public-clone trials should be described as fresh
task/workspace tests with audited inheritance, not perfectly hermetic experiments.

All final sheets were independently viewed. Native image reads and MCP calls were
retained, but this campaign did not capture provider request payloads. Prior image
transport qualification does not replace that missing measurement here. Endpoint
animation equality proves matching endpoint poses only; it does not prove velocity
continuity, collision freedom or pleasing motion. Quality assessments above are
reviewer observations, not owner acceptance.

No unrelated workspace instructions were upgraded. No credentials were copied,
and no commit, push, publication or release was performed. The final shared renderer
status reported no listener on port 8000; no process was killed to obtain that state.

## Changes and validation

The repository changes are the trace-counter repair and two focused tests;
setup-skill handoff guidance (including its two registered copies); shared
geometry guidance on frame alignment and repeated-part preservation; refinement
guidance on inventory checks and child-save-before-export; and this report.

Validation completed:

- Focused trace-counter TDD: 27 pass / 2 expected failures, then 29 pass / 0 fail.
- `check:toolchain`, `check:skills`, `typecheck`, and `lint`: pass.
- Full offline suite: 3,190 pass, 2 skip, 0 fail across 403 files.
- Coverage run: same test totals; 95.20% functions and 92.52% lines, ratchet passed.
- Follow-up skill/setup checks: 6 pass; managed-upgrade checks: 10 pass.
- Fresh AGY/OpenCode workspaces received matching updated guidance. Managed
  upgrades refreshed unchanged copies and preserved an owner file. Customized
  skill copies refused upgrade and remained unchanged.
- `npm pack --ignore-scripts --dry-run --json` includes all three changed maintained
  skill resources. It is a package-content check, not an installed-package or
  published-release qualification.

There were no runtime or render-service source changes, so no new engine bundle
or render-service regression claim is attached to the evaluation-tool fix.
The next useful experiment is a fresh, matched repeat of the failed handoffs and
preservation tasks with these skills, followed by broader pack-specific sampling.
Do not count this campaign's unchanged outputs as acceptance of the new guidance.

## Evidence map

Paths below are relative to the private evidence root:

| File or directory | Contents |
| --- | --- |
| `authorization.json`, `preflight.json`, `candidate.json` | Authorized scope, live route probes, exact candidate and dependency/build identity |
| `evidence/*/stage-*-input.json` | Exact prompts, arguments, versions, workspace paths and initial instruction hashes |
| `evidence/*/stage-*-events.jsonl`, `*-stderr.log`, `*-process.json` | Native stream and terminal/process receipts |
| `evidence/*/native/`, `*-native.json` | AGY native rows/transcripts and OpenCode native session exports, including child episodes |
| `derived-receipts.json`, `trace-audit.json`, `native-transcript-index.json` | Recount and trace navigation; error candidates require interpretation |
| `final-artifact-manifest.json` | Final source/GLB/PNG hashes, exact runtime heads/build identities, copied skill hashes, recipes and animation endpoints |
| `saved-revision-verification.json`, `child-mcp-receipts.json` | Exact source/GLB matches to all eight saved baselines and three saved edits; separate native author MCP counts |
| `artifact-validation.json` | Independent glTF validation for all 31 retained GLBs |
| `independent-preservation.json` | Independent baseline/edit structural comparisons |
| `teapot-junction-check.json` | Exported-body intersection at the spout junction |
| `skill-delivery-verification.json`, `package-dry-run.json` | Fresh setup, upgrade/customization and package-content evidence |
| `receipt-tests-*.log`, `full-test.log`, `coverage.log`, `*-followup-tests.log` | Repository validation evidence |
| `review/index.html` | Local visual review with the eight sheets and four edited results |

The external `run.mjs` and analysis scripts are retained with the evidence. Preserve
that directory alongside this report; the repository alone does not contain the
private native traces or generated assets.
