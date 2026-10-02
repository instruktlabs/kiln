---
name: kiln-setup-workspace
description: Create and verify a Kiln asset workspace for a chosen coding-agent harness. Use before authoring when the current directory is the engine repository, an empty folder, or any project without a working kiln_workspace server.
license: MIT
metadata:
  kiln-workflow: workspace
---

# Set up a workspace for asset authoring

This repository is the engine. Asset authoring happens in a separate workspace, and the two are different tasks with different tools. Establish which one is being asked before running anything.

Authoring an asset needs a workspace. Changing the engine's own behaviour does not; read `AGENTS.md` at the repository root instead and stay in the checkout.

A workspace does not require a Kiln project. It supplies the tools and local stores for standalone assets, experiments, scenes or projects. Do not turn setup into project planning unless the user's task calls for related assets with a shared brief, inventory, art direction or material lock.

Do not author assets inside the engine checkout. The authoring skills assume a workspace, and giving a model the engine implementation and the example collection alongside its task changes what it produces.

## Create the workspace

Choose an absolute path to an empty directory outside the checkout.

```bash
node scripts/create-workspace.mjs /absolute/empty-workspace --harness claude
```

From an installed package, the equivalent is `kiln-init /absolute/empty-workspace --harness claude`. Author, refine and QA skills are installed by default; `--skills compose,batch` adds the optional scene-composition and trial-dispatch workflows. Ask the user which harness they use rather than assuming; the choice writes different configuration and cannot be changed afterwards without a fresh workspace.

CLI/MCP workspaces use the shared skills under `skills/`. Kiln's optional built-in Strands agent adds its workflow internally, outside that directory. Do not copy its system prompt, native workflow skill or completion protocol into another harness's skills or instructions. This applies to manual setup and plugin installs too; the engine's `src/agent/` directory is not a skill source.

| `--harness` | Launch from the workspace |
| --- | --- |
| `claude` | `claude` |
| `copilot` | `copilot` |
| `cursor-agent` | `cursor-agent` |
| `opencode` | `opencode` |
| `agy` | `node agy.mjs` |
| `codex` | `node codex.mjs` |
| `hermes` | `node hermes.mjs` |

**Use the launcher where the table names one, and read the workspace's own START.md over this table.** Antigravity, Codex and Hermes keep all configuration in a user-level home and read nothing from a project directory, so their workspace configuration is applied per invocation by the generated launcher. Running their bare command inside the workspace reaches no Kiln tools at all. None of the three writes outside the workspace, and none touches the user's existing configuration or authentication.

Hermes needs one user-level registration for the MCP server, because it has no project-scoped equivalent and no per-invocation flag for one. Its START.md prints the exact `hermes mcp add` command; offer to run it, and verify with `hermes mcp list`. Never redirect `HERMES_HOME` at the workspace: that one variable resolves the configuration path and the credential path together, so pointing it at a workspace leaves the run with no provider.

## Start the GPU render service

Setup asks for render mode `auto`: textured or metallic scenes use a compatible GPU service, starting one lazily when available. Ordinary untextured scenes with zero metalness and no advanced material extensions use CPU views, even with a GPU available. CPU views support silhouette, proportion and contact review, but cannot confirm PBR appearance. Use CLI `--render gpu` when material review is required, including roughness on nonmetallic surfaces.

The renderer code is included with Kiln; its native GPU dependency is optional at the Kiln package root. For material-dependent tasks, check `node kiln.mjs service status` before starting the authoring session. If dependencies are missing or incompatible, reinstall the official Kiln package with optional dependencies enabled. npm 11 may print an `install-scripts` warning for the optional `webgpu` package; its postinstall only clears the macOS download quarantine from the prebuilt Dawn binary the package ships, so Windows and Linux need nothing and the warning is not an install failure. Read `runtime` from `.kiln/workspace.json` to identify the installation. A source checkout uses `bun install --frozen-lockfile` at that root. Setup checks dependency resolution without loading native code; ready dependencies alone do not prove the device can render.

Once dependencies are available, local CLI/MCP auto mode starts a managed service lazily for a view that needs PBR shading. Compatible clients share it; it survives the initiating session and exits after five minutes without admitted uploads, queued jobs or active renders. From the installation root, `node --import ./render-service/src/register-hooks.mjs render-service/src/server.mjs` starts a manual service that remains running while idle. It binds loopback; widening `HOST` requires `RENDER_SERVICE_TOKEN`.

`node kiln.mjs service status` reports installation, verified health and lifetime. `node kiln.mjs service start` joins a compatible service or starts a managed one the way an on-demand view does, and prints its port, renderer, pid, lifetime and build; it starts nothing when a stale, foreign or unknown listener holds the socket. After dependency repair or a cached startup failure, call `kiln_renderer({action:"reprobe"})` inside the MCP session to refresh its existing route. It neither installs dependencies nor starts a renderer; the next view starts one if needed. CLI `service reprobe` checks only its own process. Restart the session after changing Kiln, environment variables or credentials. Unknown or incompatible listeners are reported and left alone. `service stop` explicitly stops a verified local service. If no usable GPU is available, report the material-review limitation and continue on CPU views when that fits the task.

A `KILN_RENDER_PORT_URL` whose origin is exactly the shared local socket (`http://127.0.0.1:8000` by default) takes the local route: it starts on demand and restarts after an idle exit. For rendering on another device, configure the MCP server process's `KILN_RENDER_PORT_URL` and, when needed, `KILN_RENDER_TOKEN` through the chosen harness. CLI accepts `--render-port URL` and reads `KILN_RENDER_TOKEN`. Start a compatible Kiln renderer on that device; its wider bind requires `RENDER_SERVICE_TOKEN` unless an authenticated proxy is explicitly configured. Manage the remote service on its own device. Verify the selected route with capabilities and require an actual `viewFidelity` receipt for material evidence.

## Verify the loadout before authoring

Accept the project and MCP trust prompts, then confirm the server is actually live rather than assuming it from configuration. Call `kiln_discover` on `kiln_workspace` with `{ capabilities: true }`; it returns the runtime, source, export and camera contract and proves the tools resolved. For OpenCode, `opencode debug config` from the workspace is the configuration check: it shows the resolved `kiln_workspace` entry. `opencode mcp list` reports what OpenCode's shared background service loaded, so it can print "No MCP servers configured" in a correctly configured workspace. `node kiln.mjs discover --capabilities --json` from the workspace is the harness-independent proof; it reports the same runtime, collections and source storage as the MCP server. Compare `capabilities.engine.installUrl` with `runtime` in `.kiln/workspace.json`. A server named `kiln` from a global installation is a different thing. Do not substitute it silently; report the setup problem instead. When another agent is to do the authoring, start it as a separate harness process in the workspace directory (for OpenCode, `opencode run --standalone "<brief>"` after changing into the workspace); a subagent of the current session inherits this session's tools and never sees the workspace's MCP server, so it would be left with the CLI alone.

For modeling, `kiln_discover({})` supplies a compact orientation and starting signatures. Use natural-language `query` for related operations, assemblies, and optional recipes; use exact `ids` for complete contracts. Discovery needs no separate search model or asset-category selection. The local equivalent is `node kiln.mjs discover --query "curved hollow tube"`, followed by `node kiln.mjs discover --id RETURNED_ID`.

Confirm the installed skills are readable at `skills/` in the workspace, and read the relevant one from there rather than a global copy. Whether the harness also registers them natively depends on the harness.

## Choose standalone or project work

Standalone authoring is the default even when the workspace contains projects. An explicitly configured `KILN_PROJECT` opts into a default project; CLI `--no-project` or MCP `projectId: null` selects standalone work despite that setting. Materials, Live Review, saving and export do not require a project. The save collection named `project` is just a destination, not project membership.

For a pack or other related work, create a project with `node kiln.mjs project create --id my-pack --name "My pack"`, or `kiln_project({action:"create", draft:{projectId:"my-pack", name:"My pack"}})`. Read the returned revision, then update its brief, design, inventory and material dependencies using `project update --expected` or the MCP `expectedRevision` field. Each supplied top-level field replaces its value, including the whole design object; read and merge preferences before updating. Authoring uses explicit `--project my-pack` / `projectId: "my-pack"`; add `--project-revision` / `projectRevision` when reproducing an exact configuration. Creating or viewing a project does not activate it for other calls.

Read `skills/kiln-author-asset/references/projects-and-materials.md` in the generated workspace when configuring project records or pinned materials. Run `node kiln.mjs view` for the local library, materials, projects and Live Review. The dashboard observes authoring; feedback still goes to the agent's conversation. Verify the connected tool schemas before assuming optional host capabilities.

Report the rest of the session's loadout at the same time. Skills and MCP servers from user-level configuration load here too, and an authoring session carrying a dozen unrelated skills spends context and invites the wrong tool. List whatever is registered that has nothing to do with this task and let the user decide whether to narrow it. Do not change their global configuration.

## Wiring a workspace by hand

`--harness` covers claude, codex, opencode, hermes, agy, copilot and cursor-agent. For any other harness, or an engine installed as a package elsewhere, assemble the same loadout in an empty directory: register the installation's `dist/mcp-server.mjs` as a stdio MCP server named `kiln_workspace`, give it `KILN_WORKSPACE` pointing at that directory, `KILN_PROGRAM_STORE` pointing at its `.kiln/programs`, plus `KILN_RENDER=auto` (the generated Antigravity entry also sets `KILN_RESULT_DETAIL=lean`, since that harness writes large results to files), and copy the skills you need from `skills/` into the one directory that harness reads (`.claude/skills/` for Claude Code, `.agents/skills/` for the others; OpenCode instead takes a `skills.paths` entry naming the copy).

A hand-wired directory carries no manifest, so it gets no runtime preflight and `--repair` cannot correct its paths later. Prefer the generated workspace wherever the harness is supported, and tell the user which of the two they have.

## Relocation and repair

Moving the workspace or the engine installation breaks the generated absolute paths, and so does replacing the Node that setup validated.

```bash
node /current/kiln/scripts/create-workspace.mjs /absolute/empty-workspace --repair
```

Repair rewrites generated runtime paths only. It preserves copied skills, saved revisions and assets, refuses configuration that was edited by hand, and does not upgrade the skills.

For an existing workspace, stop its harness/MCP session and run setup from the desired installation with `--check`, then `--upgrade`. Check returns JSON and exits 1 when an update is required. Upgrade refreshes unchanged configuration, instructions and all registered skill copies while preserving assets and source stores. Conflicting local edits stop the whole upgrade before writing. Older instruction files without ownership hashes also require explicit resolution: preserve them separately, compare against a fresh temporary workspace, then move them aside or supply the current version before retrying. Reapply compatible customizations after upgrading. Do not overwrite an edited file merely to clear a conflict.

New managed launchers reject runtime/skill mismatches before serving tools; older workspaces need this explicit check first. Restart the harness/MCP session after upgrading so cached tool schemas and instructions match. `--repair` alone does not refresh copied skills or a running session. For independent model evaluations, create a fresh workspace from the candidate.

Discovery replaces the removed `kiln_list_primitives` tool; its old `name`, `names`, and `category` selectors have no alias. Update copied guidance through the explicit workspace upgrade, then verify Discovery against the installation as above.

## What isolation means

A separate workspace limits task context. It is not an operating-system sandbox, and it is not a git repository. User-level instructions, memory, authentication and filesystem permissions still apply. For comparing harnesses or models, read `skills/kiln-batch-dispatch/references/clean-room-evaluation.md` in the engine checkout, which covers recording inherited context and reporting trials.
