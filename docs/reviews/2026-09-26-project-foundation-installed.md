# Installed project foundation qualification

The latest local candidate (`698ab989…`) passed the plugin packaging gate, 17 package checks, and 28 foundation checks on the first attempt, using the same tarball for both fresh installations outside the source checkout. This includes standalone material authoring and editable delivery without any project. This is installed-package and GPU evidence, not release acceptance or a performance baseline. No package was published and no model provider was called.

## Exact candidate and environment

- Tarball: `kiln-engine-0.8.0.tgz`, 8,572,326 bytes, SHA-256 `a6d36e24ae3c8dadac27d90d7fb13f6ccf5310093f977934f1249d92792981f1`.
- Common runtime identity: `sha256:698ab98937d32b15fc36b686fd36ee2488e6074ffaed23178d4d69f8e0865ac7`.
- Runtime source hash: `d6586b7a629a6f08be29efd215af0bb4b99b903c7a487bc3f5b70b8f49d09c04`.
- CLI bundle SHA-256: `ce9127ac9b74218a814b4560285e243c1db7a1ecb68032f7694cb64991af6cbf`.
- MCP bundle SHA-256: `338c962fb6a67ef3500c7f8cd86d02562dce49dd6bc25de576f2280b794f8a93`.
- Worker bundle SHA-256: `6cf29fbcea2a32f79b24fb03189cd11a29de3d195ed27da33514e6289690790b`.
- Windows consumer runtime: Node `24.20.0`, npm `11.19.0`. This was not the pinned Node/npm maintainer toolchain. Shipped TypeScript exports were also consumed with Bun `1.4.2`.
- Installation used `--omit=dev --omit=peer`; provider environment variables were removed. Only existing renderer route/credential configuration was retained, without recording credential values.
- Actual renderer: `dawn-d3d12:nvidia-geforce-rtx-3070:D3D12 driver version 32.0.16.1074`.

The [qualification script](../../scripts/qualify-project-foundation.mjs) verifies installed source exports against the checkout, all three bundle hashes against the installed build manifest, and their common identity against the source tree. Runtime identity and source hash are distinct fields.

The latest receipt is `7nRi57`; the package-gate receipt is `package-hkariC`. This candidate includes the bounded Live Review journal read/scan optimization and corrected standalone material Discovery guidance. It does not replace the earlier candidate's performance receipts. The script does not control or qualify ambient machine load and establishes no timing baseline or performance acceptance.

The preceding standalone candidate remains historical evidence: runtime identity `sha256:f649e5b906b7922065048a75e723d17c5b97c49338b85c65fe40aa0ce700804d`, source hash `8fa45e96ad33db727fb6f05e1e15fb9c82d1bcd656bb771eafc711574e539f7e`, tarball SHA-256 `310fb4d509441a3e0f5b083c80c0e2d083b1416db61175abd1f4087e51dda4f6` (8,564,909 bytes), CLI `5a1df28ef48c57598c198be6f8288a6862a976597f75b6e20f207e7eb72331ab`, MCP `f5e8efe46aa8ce540ce253c22472d799e8bb8ff054264c78907f54bdf84666ad`, and the same worker hash listed above. Its successful receipt is `5WdAA9`.

## Passed checks

1. Fresh tarball installation without optional model peers.
2. Exact exported source files, including editable project bundles and material library APIs.
3. Shipped TypeScript exports consumed through Bun.
4. CLI, MCP and worker bundle hashes plus common source identity.
5. CLI project creation and retrieval.
6. Preset discovery, deterministic creation and repeated identical result.
7. Pinned project material evaluation through the default subprocess.
8. CLI GPU capture with full material fidelity and no degradation.
9. GLB closure with three embedded map images and no image URI dependencies.
10. Exact authored source export.
11. Rejection when the same source is evaluated in a project with no material dependencies.
12. Portable material payload export and reimport without material network acquisition.
13. Installed MCP project, material, review and render tool discovery.
14. MCP retrieval of the same project state.
15. MCP GPU capture with full material fidelity and no degradation.
16. Installed gallery static serving and shared project, material and captured-operation endpoints.
17. Editable project ZIP export and import into a fresh workspace.
18. Bundle retention of both an older saved asset material and the project's newer material revision.
19. Exact source export from the imported asset.
20. CLI rebuild of the imported saved asset using its saved dependencies and build options, despite newer project defaults and conflicting bake environment settings.
21. Standalone CLI material rendering with projects already present, omitting project selection and supplying exact material pins.
22. An explicit `KILN_PROJECT` default still enforces its current material lock and rejects conflicting per-call pins.
23. CLI standalone save with `--no-project --materials` explicitly opts out of that configured default.
24. MCP standalone GPU rendering with `projectId: null` and exact material pins.
25. MCP resource download of the standalone asset's complete editable ZIP.
26. Standalone editable asset ZIP export and import into a fresh workspace.
27. The standalone import installs exact material maps and leaves the project count at zero.
28. Exact source export and byte-identical CLI rebuild from the imported standalone asset.

The rebuilt GLB matched the saved artifact byte-for-byte: `sha256:ab90dde10f0fc5766062c51124d85e381a5afb5197ddc4f81e116e3955309167`. The saved settings were `legacy` exporter, `warn` geometry policy, optimization `off` and instancing `auto`; the qualifier deliberately supplied optimization `full` and instancing `on`. The bundle retained seed-7 material revision `sha256:9fbe281bf4cd917cec3ce987c6dd3dbc522dde8e486a5927ef22a992ef812ac3` for that asset while the current project selected seed-8 revision `sha256:62bf4d99708c65797fe1fef7c65ca32663edbba17ec52560c07577241b84fbb0`.

## Attempts and limits

The latest `698ab989…` candidate produced successful material-aware GPU captures through CLI and MCP and passed all 28 checks without a retry. The preceding `f649e5b9…` candidate's first qualification attempt completed the project checks and standalone CLI operations, then stopped on a harness assertion that expected full dependencies in the CLI's deliberately compact save summary. The assertion was corrected to check that summary's rebuild classification; the subsequent ZIP import and exact rebuild establish actual material closure. That same unchanged earlier tarball then passed all 28 checks.

An earlier project-only candidate (`sha256:f6a3080ec300cec3c02382846511652e060eda22f60fdc49092d38437754dfc7`, tarball SHA-256 `0cc676562eb852304dc861981da3c9cf37ec51eed58c1f16d7baeed2e94db958`) had a first installed capture failure at the existing 20-second deadline: `Required GPU render failed: view render port timed out after 20000ms`. Its operation ran from `2026-09-27T00:19:32.062Z` to `00:19:52.938Z`, retaining the successfully evaluated GLB and no capture. A separate immediate rerun of that installed command succeeded, and that candidate later passed 20 checks. No deadline, automatic retry policy, renderer credentials or renderer lifecycle was changed to obtain either candidate's result.

The earlier project-only run occurred while the machine had concurrent CPU/GPU-intensive work. That prevents a latency baseline or performance acceptance claim for that run; no queue/service evidence establishes the cause of the first timeout. The failure is retained separately and is not erased by the successful run. It was a timeout, not the earlier raw-client authentication issue described in the [GPU integration analysis](../plans/2026-09-26-gpu-service-integration.md).

The earlier candidate also exposed an incorrect negative assertion in its harness: omission selected the current project at that time. The harness was corrected to select an explicit empty project. The final candidate deliberately changes that product behavior: omission is standalone unless a host default is explicitly configured. Checks 21–24 verify this distinction and its opt-out.

The gallery checks here cover installed HTTP/static functionality, not browser interaction quality. GPU fidelity receipts establish a real material-aware GPU view. Visual inspection found mapped material on all six views; at this deliberately small 64-pixel recipe resolution, thin mortar is visibly undersampled and some brick rows appear irregular. This transport fixture does not establish polished preset appearance, target-engine import quality, seam handling, physical texel density, artistic acceptance or large-scene performance. npm installation used network access; subsequent material reconstruction used embedded local bytes, but this run did not impose an operating-system network block. Broader source tests and browser acceptance are separate evidence.

## Retained evidence

All evidence below is outside the repository. Receipts retain their original temporary workspace paths; the copies preserve the files used to assess the result.

- [Latest 28-check receipt](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/receipt.json), with command timestamps, separate stdout/stderr files, CLI/MCP GPU fidelity, zero-project import and both exact rebuilds; [installed build manifest](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/build.json).
- [Latest 17-check package receipt](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/package-hkariC/receipt.json) and [the exact tarball shared by both runs](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/package-hkariC/kiln-engine-0.8.0.tgz).
- Latest [standalone editable ZIP](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/standalone-editable.zip), [MCP ZIP download](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/standalone-mcp-download.zip), [editable project ZIP](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/editable-project.zip), [rebuilt standalone GLB](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/rebuilt.glb) and [standalone GPU capture](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/7nRi57/standalone.png).
- [Previous f649 28-check receipt](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/5WdAA9/receipt.json), with command timestamps, separate stdout/stderr files, CLI/MCP GPU fidelity, zero-project import and both exact rebuilds.
- [Previous f649 exact tarball](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/W0YKVZ/kiln-engine-0.8.0.tgz) and [compact-summary harness failure](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/W0YKVZ/receipt.json).
- Previous f649 [standalone editable ZIP](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/5WdAA9/standalone-editable.zip), [MCP ZIP download](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/5WdAA9/standalone-mcp-download.zip), [rebuilt standalone GLB](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/5WdAA9/rebuilt.glb) and [standalone GPU capture](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/5WdAA9/standalone.png).
- [Earlier project-only completed receipt](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/yOBu0H/receipt.json), with 20 checks.
- [First failed attempt](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/EWVhQ9/receipt.json) and [exact timeout operation](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/EWVhQ9/initial-timeout-operation.json).
- [Separate successful capture retry](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/EWVhQ9/installed-render-diagnostic.json).
- [Harness assertion correction evidence](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/LGsgXz/receipt.json).
- [Earlier qualified tarball](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/kiln-engine-0.8.0.tgz), [editable project bundle](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/yOBu0H/editable-project.zip), [rebuilt GLB](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/yOBu0H/rebuilt.glb) and [GPU capture](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/installed-qualification/yOBu0H/cube.png).
