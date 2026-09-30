# Project-authoring foundation checkpoint

September 28 Farm handoff: the separate Farm workspace now contains all 23 assets,
an optimized interactive scene and three verified consumer download profiles.
See the [Commons/site consultant handoff](2026-09-28-kiln-commons-site-handoff.md)
for exact candidate paths, current qualification and open owner decisions. This
supersedes earlier Farm-not-yet-authored statements as production status; the
foundation measurements below retain their original scope. Site consultation is
requested; website implementation and public launch have not been authorized.

September 27 production follow-up: the first Farm material pair exposed CLI
attribution and scene-animation naming gaps. The [material-stage report](../reviews/2026-09-27-farm-material-stage.md)
records the shared fixes, exact package boundary and review candidates. The full
23-asset Farm objective remains active; this does not imply pack or release acceptance.

September 27 follow-up: the Farm comparison and selected cow refinement exposed and resolved the first shared Workshop organization increment. See the [current closeout](../reviews/2026-09-27-farm-comparison-closeout.md) for the installed build, exact scope, selected revisions and latest checks. The measurements and original foundation evidence below retain their historical identities.

## Active objective

Complete and validate Kiln's packaged project-authoring foundation: shared CLI/MCP project configuration and material dependencies, a polished local dashboard with reliable live observation and review, and an expanded material library with reproducible procedural material and texture workflows. Verify the complete workflow from a clean installation, including editable resources, runtime exports and browser performance, so the Farm pilot is fully specified and ready to begin.

Implementation started September 26, 2026. This initiative follows the 0.8 source release; earlier campaign receipts do not qualify these changes. No commit, push, deployment or official package publication is included. Existing untracked qa/ work is unrelated and must remain untouched.

**Status: local foundation complete and qualified.** F0–F9 are satisfied within the scope below. The reserved performance window is finished; all measurement helpers and task viewers are stopped. Shared renderer lifetime remains managed normally. The next production scope is the Farm pilot in a separate asset workspace, starting from its brief and references; no production Farm assets have been authored.

## Required outcomes and current evidence

| Requirement | Required proof | Current state |
| --- | --- | --- |
| F0 Standalone authoring | No project required for CLI/MCP build/edit/inspect/save/export, library materials or Live Review, even alongside existing projects; explicit configured defaults remain overridable | Qualified through focused CLI/MCP tests and clean-installed workflow: zero/one/two projects, independent immutable pins, explicit default/opt-out, complete standalone ZIP import with zero projects and exact rebuild. Fresh dashboard opens Library. |
| F1 Shared projects | CLI/MCP/dashboard create/read/update the same immutable versioned project/configuration and dependency lock; conflicts and explicit selection work | Implemented; actual CLI, stdio MCP, HTTP and browser proof. Workspace-only configuration, explicit source-store overrides and concurrent selection covered. |
| F2 Material library | Useful architecture/wood/metal/fabric/ground coverage; original/license/derived provenance, actual rendering and portable offline bytes | 16 curated records, 48 normalized maps, exact source/derived provenance, subprocess GLBs and GPU captures inspected. The optional [local curated corpus](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/material-foundation/README.md) includes complete theme payloads and import instructions; five procedural presets ship in the package. Pack-specific UV/scale/taste acceptance remains. |
| F3 Procedural materials/textures | Editable deterministic recipes, parameters and seeds; coherent maps, tiling/scale/limits and exported appearance | Five three-map families, deterministic seed/parameter records, editable portable payloads and evaluator resource closure implemented and tested. No claim of scan realism or automatic aesthetic approval. |
| F4 Live Review | Real CLI and MCP runs show exact artifacts/captures/fidelity, iterations, errors, pin/compare/reconnect/concurrency with measured observer cost | GPU artifacts, exact save, failed-run continuity, run isolation and reconnect qualified. The optimized installed candidate passes all 48 measured operations and four warmups, with exact retained captures, no duplicate evaluation/GPU call, and two actual pins surviving retention. Bounded journal scan/read optimization reduces the measured persistence and polling cost. See the [performance review](../reviews/2026-09-26-foundation-performance.md). |
| F5 Packaged application | Polished project/library/material/review UI plus backend work from a clean installed package without source checkout | Final candidate passes 28 clean-installed workflow checks and 17 package/plugin checks against one exact tarball, both first attempt. Browser fault injection confirms viewport/action identity. Full aggregate regression/coverage passes: 2,782 tests, two skips, zero failures. |
| F6 Delivery | Exact reviewed artifact survives save/export; editable source and complete resources rebuild offline; runtime derivatives and limits are explicit | CLI/MCP/HTTP project ZIP exports tested. Clean-installed project and standalone editable imports rebuild byte-identically from saved resources/settings. Runtime delivery explicit; original acquisition archives and concept-image bytes are references, not included resources. |
| F7 Environments/performance | Useful bounded environment inspection and representative Three.js load/memory/frame measurements on named hardware | Twelve controlled browser samples completed on installed f649: representative median parse-to-first-submission 216.8 ms, all p95 intervals 7.0 ms at 625×424 drawing-buffer pixels on RTX 3070. Exact artifacts, ambient load and limits retained. Counts are not GPU memory bytes; Farm and full-screen game budgets remain unqualified. |
| F8 Farm readiness | Inventory, visual profile, scale, material choices, motion needs, proving scene and acceptance criteria specified before first production attempt | [23-asset production brief](2026-09-26-farm-pilot-brief.md) complete as a proposal, with all existing reference IDs preserved. No production assets authored. |
| F9 Documentation/tool parity | Shared registry definitions, CLI help/Discovery/skills, package contents and regression gates cover actual installed workflows | Workflow/material docs, CLI help, Discovery, optional-project skills and generated AGENTS/CLAUDE instructions updated. Typecheck, lint, six skills/two registered setup copies, toolchain metadata, full regression, coverage ratchet and diff checks pass. |

## Decisions

- Live observation and local review only. Feedback goes directly to the existing agent conversation. Launch/cancel/retry/pause and cross-harness proxy integration are later work.
- Pinning a review view does not pause the agent. Observe only facts available from Kiln; unknown external activity stays unknown.
- Design profiles are agent-editable preferences; trusted requirements and release acceptance authority remain separate.
- Projects are optional organization, not an authoring prerequisite. Workspace setup, collections, materials and Live Review support standalone assets and environments. No automatic sole-project membership or mandatory choice among existing projects. `KILN_PROJECT` remains an explicit opt-in default with CLI `--no-project` / MCP `projectId: null` escape; independent call-level material pins avoid dummy projects.
- Setup/author/refine/QA/compose skills and generated `AGENTS.md` / `CLAUDE.md` must teach both standalone and project workflows. Preserve managed upgrade conflict protection and keep native Strands protocol separate. The legacy collection ID `project` is only a save destination.
- Project/material state has one host-owned implementation shared across CLI, MCP and local HTTP APIs.
- Reuse evaluated artifacts and capture bytes. Observation must not add rendering or block on an open browser.
- Expanded qualified materials and procedural workflows precede Farm production. Small technical fixtures are qualification, not pack authoring.
- Browser Three.js is primary. Rome is coherent game art with a mid- to high-range target; no universal cross-pack budget or historical-reconstruction requirement.
- Farm is the first production pilot after all foundation gates. Ten-pack production and public launch are later.
- Local rendering is the primary developer path. Remote selection is explicit. The reproduced authentication error came from a qualification script bypassing the existing host resolver, not demonstrated interference by another agent. No retry-token fallback or forced replacement of a shared service was added. [GPU integration analysis](2026-09-26-gpu-service-integration.md) records remaining credential-policy and startup-state architecture proposals.
- Required GPU qualification cannot accept CPU imagery. A clean-installed first capture hit the existing 20-second deadline while other projects were active; a separate retry produced full-material GPU output. Preserve both attempts. Concurrent load is relevant context, not proven sole cause.
- The owner authorized the reserved performance window after stopping competing work. The [qualification plan](2026-09-26-performance-qualification.md) is complete, including a measured bottleneck, bounded correction and installed-candidate comparison. These results qualify the tested foundation workloads; Farm, Rome and other consumer budgets require their own scene evidence.

## Current candidate and prior evidence

The optimized source is frozen and rebuilt successfully with `bun run build:runtime`: common identity `sha256:698ab98937d32b15fc36b686fd36ee2488e6074ffaed23178d4d69f8e0865ac7`, source hash `d6586b7a629a6f08be29efd215af0bb4b99b903c7a487bc3f5b70b8f49d09c04`. The viewer's app, styles and both HTML files are byte-identical to the measured f649 installation. Full coverage passes as one aggregate command: **2,782 tests passed, two skipped, zero failed**, 399,104 assertions, 364 files; functions **95.16%**, lines **92.29%**, both above the unchanged ratchet. Typecheck, lint, skills, toolchain metadata and diff checks pass. Log: `tmp/project-foundation-optimized-coverage.log`.

The final tarball is 8,572,326 bytes, SHA-256 `a6d36e24ae3c8dadac27d90d7fb13f6ccf5310093f977934f1249d92792981f1`. Its package gate passes 17 checks and its independent installed foundation run passes all 28 checks, first attempt, with real full-material RTX 3070 CLI/MCP captures and byte-identical project/standalone rebuilds. See the [installed report](../reviews/2026-09-26-project-foundation-installed.md) and archived receipt `7nRi57`. The final observer comparison uses that same installation: all 48 operations, four warmups and 48 polling reads passed. API counters total 24 evaluator requests, zero actual evaluations after warmup and 24 GPU-port calls; all 24 observed operations retained exact artifact/capture bytes. The same two effective pinned IDs survived all near-limit operations.

The native renderer suite's 73 passing checks remain applicable: renderer source hash `96007ac750645e53e9822a1a74c6aa027ebbd553b61b97fb75e87b8914892666` and dependency hash `e17ce943b5391fbbc139202fc566d7ec36da9cf54cfcb9bbbbb98a737851ce97` are unchanged. The actual consumer is Node 24.20.0 / npm 11.19.0, with Bun 1.4.2 for source gates; metadata checks do not claim the pinned Node 22.23.2 / npm 12.0.2 maintainer environment was used. The peer-omitting test installation conservatively declines disk cache reuse because a required transitive peer is absent; CLI timings explicitly include cold evaluation and that fingerprint attempt. No cache identity or GPU deadline was weakened.

## Earlier attempts and findings (historical)

The following paragraphs preserve the chronological findings and their then-current status. They do not override the completed candidate and F0–F9 table above.

The reserved window is underway. [The performance review](../reviews/2026-09-26-foundation-performance.md) records controlled browser results and the observer baseline. The baseline revealed repeated full journal scans; a bounded optimization now reuses a validated scan within each writer lock, reads at most eight records concurrently, refreshes orphan-byte accounting and cleans only the published operation afterward. Nineteen tests / 81 assertions, typecheck and an independent review pass. Discovery guidance was also corrected to describe standalone material pins. These source changes supersede f649 for final functional qualification; rebuild, full gates, clean installation and the identical observer comparison remain required. A baseline harness pin-marker omission was discovered and is explicitly corrected in a separate near-limit run; do not claim its original metadata flags established real pinned retention.

The new candidate has common runtime identity `sha256:f649e5b906b7922065048a75e723d17c5b97c49338b85c65fe40aa0ce700804d` and source hash `8fa45e96ad33db727fb6f05e1e15fb9c82d1bcd656bb771eafc711574e539f7e`. All five bundle hashes and identities were checked against the current source and `dist/build.json`. Viewer and chat browser builds pass. CLI hash: `5a1df28ef48c57598c198be6f8288a6862a976597f75b6e20f207e7eb72331ab`; MCP: `f5e8efe46aa8ce540ce253c22472d799e8bb8ff054264c78907f54bdf84666ad`; evaluator worker: `6cf29fbcea2a32f79b24fb03189cd11a29de3d195ed27da33514e6289690790b`. Installed workflow and browser failure-path qualification pass. Controlled performance runs are the remaining qualification work.

The final aggregate coverage run (`tmp/project-foundation-final-coverage.log`) completed 2,778 passing tests, two skips and one failure across 364 files. The only failure was the repository guide's 12 KiB size limit, not runtime behavior. The guide was condensed without changing runtime source; all nine reliability tests / 81 assertions now pass. The separately executed coverage ratchet passes at 95.15% functions (minimum 94%) and 92.29% lines (minimum 92.1%). Preserve the aggregate command's exit-one result; the corrected focused rerun and ratchet are separate evidence. No timeout, coverage threshold or guide-size budget was raised.

Clean-installed workflow: 28 checks pass on tarball SHA-256 `310fb4d509441a3e0f5b083c80c0e2d083b1416db61175abd1f4087e51dda4f6`. Receipt: `C:/Users/Mattm/AppData/Local/Temp/kiln-project-foundation-5WdAA9/receipt.json`, archived in the linked installed review. CLI and MCP produced actual full-material GPU captures. Standalone editable import created no project and rebuilt exact GLB bytes. An earlier attempt on the same tarball reached the standalone save but its harness incorrectly expected full dependencies in the compact CLI save summary; that assertion was corrected, with no engine change, and both attempts retained.

Existing package/plugin gate: passed 17 consumer checks, log `tmp/project-foundation-final-package.log`. Browser functional fault injection held, failed and restored a real GLB read: the visible earlier asset kept its actual identity and Save/Pin stayed disabled until the newly selected GLB loaded. The save dialog then named the loaded operation, revision and hash. The proxy recorded no writes and was stopped after verification. No timing or measurement sampling was performed.

Two all-in-one build attempts failed with `UNKNOWN` opening `dist/build.json` after some targets had completed. The missing targets then completed through the supported individual build commands, followed by verification of every bundle hash and common source identity. Do not describe the failed aggregate commands as passes or attribute the file-open error to another agent without evidence. No build retry/fallback policy was added.

The first browser build exposed a Node-only texture-loading import in a contract intended to be browser-safe. A focused browser bundling regression failed before correction. Shared texture usage constants/types now live in `texture-contract.ts`; the existing texture module re-exports them. Real viewer/chat builds and 52 browser/texture/procedural tests pass without stubs or externalizing Node modules.

Standalone CLI/MCP and immutable binding qualification passed 15 tests / 184 assertions, including no-project material use with zero, one and two existing projects. The final audit also corrected authoring flags silently ignored by non-authoring commands and missing rebuild-preflight observations; five tests / 100 assertions pass. Exact rebuild succeeds with an unavailable configured project default because it uses the saved dependencies and settings. Whole-repository typecheck and lint pass; skills conform with two byte-identical registered setup copies. All these are functional evidence, not performance qualification.

The remaining text records the prior candidate and discoveries that led to this one.

All Node runtimes and viewer assets were rebuilt with common runtime identity `sha256:f6a3080ec300cec3c02382846511652e060eda22f60fdc49092d38437754dfc7`, source hash `86bc61aac7220841e99c6b559362ff9057cc14ca9799c95baa95fbb6ed394e25`. Runtime hashes are recorded in `dist/build.json`. The working tree is uncommitted and is not a published release. Bun is 1.4.2; the actual clean-install consumer uses Node 24.20.0 / npm 11.19.0. Passing toolchain metadata checks does not claim this consumer is the pinned Node 22.23.2 / npm 12.0.2 maintainer environment.

Render-service suite: 73 passed. Initial integration failures were retained and corrected, including optional host tool counts, workspace location consistency, oversized journal summaries, discarded exporter settings and a test-only late renderer launch at teardown. The latter is separately diagnosed from authentication. Full regression and coverage receipts must be appended before this candidate is described as qualified.

Functional regression: 2,754 passed, two Windows skips, zero failures across 357 files. Existing package smoke and plugin packaging passed 17 consumer checks. The new [installed foundation proof](../reviews/2026-09-26-project-foundation-installed.md) passed all 20 checks on its exact tarball. Browser reconnect and both actual downloaded project profiles also passed. These remain evidence for this candidate, not for later source changes.

A final adversarial frontend audit found a blocker after those passes: selection can advance before a GLB loads, allowing Save/Pin or measurement identity to describe a different artifact than the retained viewport. An older asynchronous parse can also commit after selection has changed. A focused correction and new candidate qualification are required. Three external regression cases reproduced incorrect Save targets against unchanged source before editing.

The frontend correction now binds actions and labels to successfully loaded identity, rejects obsolete parses before committing, and rechecks dialogs. Focused regressions pass. Fresh dashboard navigation opens Library; standalone operations in separate runs no longer borrow each other's last-good artifacts. Final rebuilt-candidate browser proof remains pending.

The owner clarified that assets must never require project membership and requested matching skills and agent instructions. Domain/CLI/MCP selection, independent material pins and standalone resource-complete asset bundles are being corrected and qualified before rebuilding. These changes supersede the prior candidate; its successful checks do not qualify the new source.

Generated CLI setup also had an inherited-environment mismatch: its source store followed its launcher, while project/material state could follow a foreign `KILN_WORKSPACE`. A real generated-launcher test reproduced writes to the wrong temporary workspace. The launcher now sets its own workspace root and source store together; the test passes with the foreign directory untouched.

The first coverage run hit two existing CLI test wall-clock limits under concurrent load: capture-file (30 seconds) and render-JSON failure reporting (20 seconds). The latter also emitted a consequence of its killed subprocess (`exitCode: null`). This failed run was stopped before completion when the new frontend blocker was confirmed, so it supplies neither a passing suite nor an accepted coverage total. Keep `tmp/project-foundation-coverage.log` as diagnostic evidence. Do not lower coverage thresholds or change renderer deadlines to obtain a pass.

An isolation audit found eleven older CLI fixtures with flat program-store paths that resolved their review journal to shared `tmp/.kiln/review`. They now set explicit fixture workspace roots. All 21 tests / 341 assertions pass, and the preexisting shared journal remains unchanged at 95 records / 564,617 JSON bytes. This corrects isolation; it does not establish the cause of every timeout. No shared journal cleanup or timeout increase was performed.

The owner initially deferred performance checks, then explicitly confirmed competing Cog work was stopped and authorized quieting the machine and performance driving. Preparation is now authorized. Finish active regression jobs before sampling, close unused task viewers, and record ambient load. Controlled browser and observer-overhead acceptance remain pending the reserved runs.

## Next scope

Begin the [Farm pilot](2026-09-26-farm-pilot-brief.md) only as a new production step in a separate asset workspace. Use its 23-asset inventory and individual references, establish the project profile and scale lineup, then qualify the shared material/shape slice before expanding production. A project is useful for this pack, but remains optional for other standalone authoring. The actual assembled Farm scene needs its own artistic and performance acceptance. Ten-pack production, engine-specific importer qualification and public Commons/package launch remain later work.

## Work ownership

- Root: shared integration, CLI/MCP, observation persistence, local backend, exact delivery and qualification.
- project_contracts: project domain/persistence and focused tests.
- pack_benchmarks: material library, procedural resources and evaluator transport with focused tests.
- live_gallery: packaged dashboard frontend and review state behavior.

## Resume discipline

The F0–F9 foundation audit is complete. Preserve the exact candidate, receipts and limits above; historical pending-status paragraphs do not reopen completed work. Further engine changes require a new concrete finding and qualification of the affected paths. No inference, benchmark or private viewer needs resuming. Keep unrelated untracked qa/ work untouched, and do not infer commit, publication or Farm-production authority from this closeout.
