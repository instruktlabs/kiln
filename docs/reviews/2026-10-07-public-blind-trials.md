# Public Kiln installation and authoring trials

7 October 2026. Three fresh setup agents received a repository/ref or package
name, a request to set up Kiln and run headless authoring agents, and workspace
boundaries. They received no known-defect checklist or earlier trial records.
The candidate was `86262ebccc73b28e9365ad35327ca37ca58ddb8d`; its CI archive SHA-256
was `0adb509f6151395ef63b257f1c05ed70b028da24f3625586470ab6c0a2a5a619`.

| Route | Result | Qualification limit |
| --- | --- | --- |
| Clone, existing project, AGY Gemini 3.8 Flash High | Setup and two authors completed; lantern and signpost rendered, refined and saved. Original README, instructions and HTML retained identical hashes. | Local source build; headless AGY required its permission mode and launcher. |
| Public npm, new workspaces, OpenCode Muse Spark contributor-free | Installed stable 1.0.0; two authors produced a crate and cone using MCP Discovery and CLI authoring/save. | Registry baseline for 1.0.0, not unpublished 1.1.0. Repeat registry verification after promotion. |
| Codex plugin, candidate archive | Normal marketplace/plugin registration and shared setup succeeded. A fresh author rendered, edited, inspected and saved a bench through MCP. | First author session could discover tools but policy blocked local instruction reads. The setup agent retried with workspace instructions in its prompt; this was not an intervention-free first pass. |

All three outer processes exited normally, without timeout. Nested author traces
were inspected and retained separately. The sampled file-read traces show no
cross-run reads; ordinary harness authentication and plugin registration remain
host facilities, not an operating-system isolation claim. Codex's retry retained
managed policy. No live Claude Code run was attempted; strict offline plugin
validation passed separately.

Independent review checked all five saved previews and each manifest's source,
GLB and image hashes. The installed 1.1 candidate reopened every saved revision
and exported five editable ZIPs. This includes assets written by public 1.0.0.
CPU previews qualify geometry only. The Codex author also exercised a GPU
inspection view, which does not qualify the exact saved GLB's material appearance.
These assets are test outputs, not new repository examples or golden references.

No additional engine failure was demonstrated. A separate CLI check found
PowerShell argument forwarding friction: npm could receive Kiln flags after its
wrapper consumed `--`. Quick starts now use verified `npx --offline --no --`
commands and document `npm.cmd exec`; global `kiln` discovery also passed using an
isolated npm prefix. Existing workspace launchers retain their runtime, Node and
source-store alignment. The README keeps all ten earlier pictures plus both Troy
captures. These later documentation changes do not alter the tested runtime.

Raw traces, prompts, process exits, artifact hashes and reopen/export receipts are
retained outside the public repository under campaign `v1.1-final-2026-10-07`.
This record does not replace exact main-branch CI qualification, owner release
approval, post-publication registry checks or site deployment verification.

## Public 1.1.0 follow-up

After promotion, another fresh OpenCode setup agent received only the public npm
package name, a request to run headless authors and the same workspace boundary.
It installed 1.1.0 and launched two authors using Muse Spark contributor-free.
They used MCP Discovery, render, source, edit and save to produce a camping lantern
and water tower. Both saved previews report material-faithful GPU rendering of
the exact saved GLB; their input GLB hashes match the saved file manifests.
Independent review inspected both previews, verified source/GLB/image hashes,
reopened both revisions through the published package and exported editable ZIPs.

The setup agent corrected its own nested executable-path typo. It then exited
before its background authors finished; their later terminal reports and outputs
were retained separately. No operator guidance was supplied to the authors.
Sampled reads stayed inside the trial workspace. The lantern retains a blend-area
warning and intentional embedded parts; the tower's intersection analysis covers
only a bounded subset of pairs. These are workflow tests, not certified production
assets or owner aesthetic approval. No additional engine defect was demonstrated.

All seven [public-registry installation jobs](https://github.com/instruktlabs/kiln/actions/runs/37717357297)
passed for 1.1.0, covering Windows, macOS arm64/x64 and the supported Linux Node
matrix, including SDK, CLI, MCP and local plugin checks. The follow-up records
are retained under the same campaign, `registry-1-1-opencode-new`.
