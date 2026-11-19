---
name: kiln-setup-workspace
description: Configure and verify Kiln in an existing project or a new asset workspace for the selected coding agent. Use before authoring when the project has no working kiln_workspace server or needs another agent integration; engine development stays in the engine checkout.
license: MIT
metadata:
  kiln-workflow: workspace
---

# Set up a workspace for asset authoring

Kiln's engine installation and its asset workspaces serve different tasks. Establish whether the user wants asset authoring or engine development before running anything.

Authoring an asset needs a workspace. Changing the engine's own behaviour does not; read `AGENTS.md` at the repository root instead and stay in the checkout.

A workspace does not require a Kiln project. It supplies the tools and local stores for standalone assets, experiments, scenes or projects. Do not turn setup into project planning unless the user's task calls for related assets with a shared brief, inventory, art direction or material lock.

Do not author assets inside the engine checkout. The authoring skills assume a workspace, and giving a model the engine implementation and the example collection alongside its task changes what it produces.

## Create the workspace

When this skill comes from the **Kiln local plugin**, its plugin root contains `runtime.json` and `bin/kiln-setup-workspace.mjs` (plugin 1.0.0 used `scripts/setup-workspace.mjs`). Follow [plugin installation and upgrades](references/plugin-install.md) to install the pinned engine and configure a separate workspace. Do not run the checkout command below from a plugin cache. The plugin registers setup only; the workspace supplies its authoring skills and `kiln_workspace` server.

Choose the user's existing project or an absolute path for a new workspace outside the engine installation. Check the installed initializer's `--help`: this setup version supports `--adopt`; older engines support only empty destinations. Upgrade an older installation explicitly before adopting a populated project.

```bash
node scripts/create-workspace.mjs /absolute/project --adopt --harness claude --check
node scripts/create-workspace.mjs /absolute/project --adopt --harness claude
```

From an installed package, use `kiln-init` with the same arguments. Check reports planned changes and exits 1 when changes are needed; it writes nothing. Adoption preserves existing instruction files, unrelated settings, assets and skills. Read the returned `instructions` file (`.kiln/AGENTS.md`) and `.kiln/START.md`, alongside the project's existing instructions. Conflicts stop setup before writes; do not delete or replace owner configuration to make the command pass.

Author, refine and QA skills are installed by default; `--skills compose,batch` adds the optional workflows. Use the agent selected by the user or current host; ask only when it is unknown. Repeat `--adopt --harness codex` (or another supported adapter) to add that integration around the same program store. It explicitly migrates a legacy managed workspace while preserving assets. A combination whose config formats conflict is reported before changes; do not force one client's configuration into another. The plain empty-directory setup command remains compatible with older workflows.

CLI/MCP workspaces use the shared skills under `skills/`. Kiln's optional built-in Strands agent adds its workflow internally, outside that directory. Do not copy its system prompt, native workflow skill or completion protocol into another harness's skills or instructions. This applies to manual setup and plugin installs too; the engine's `src/agent/` directory is not a skill source.

| `--harness` | Launch from the workspace |
| --- | --- |
| `claude` | `claude` |
| `copilot` | `copilot` |
| `cursor-agent` | `cursor-agent` |
| `opencode` | `opencode` |
| `agy` | `node agy.mjs` |
| `codex` | `codex` after project trust; `node codex.mjs "TASK"` for a headless run |
| `hermes` | `node hermes.mjs` |

Read `.kiln/START.md` for an adopted project, or `START.md` in a legacy workspace. Codex reads trusted project configuration from `.codex/config.toml`; its optional headless launcher supplies the same settings per invocation without relocating authentication. Antigravity and Hermes use their generated launchers for the measured workspace flow. Setup does not grant project trust or edit global credentials. Skill registration is client-specific: Claude uses `.claude/skills`, Codex uses `.agents/skills`, and OpenCode uses its configured skills path, all copied from the same maintained Kiln skills.

Hermes needs one user-level registration for the MCP server, because it has no project-scoped equivalent and no per-invocation flag for one. Its START.md prints the exact `hermes mcp add` command; offer to run it, and verify with `hermes mcp list`. Never redirect `HERMES_HOME` at the workspace: that one variable resolves the configuration path and the credential path together, so pointing it at a workspace leaves the run with no provider.

## Check rendering readiness

Setup selects render mode `auto`. Textured or metallic scenes use a compatible render service; plain scenes use CPU geometry views. CPU views cannot confirm PBR appearance. Check `node kiln.mjs service status` before material-dependent work and require a real `viewFidelity` result before claiming material evidence.

Read [local renderer setup](references/renderer-setup.md) when dependencies are missing, a service is unavailable, or the task uses a renderer on another device. It covers dependency repair, shared-service lifetime, reprobe and authenticated remote rendering. Do not replace an unknown listener or install dependencies merely to clear a diagnostic.

## Verify the loadout before authoring

Accept the project and MCP trust prompts, then confirm the server is actually live rather than assuming it from configuration. Call `kiln_discover` on `kiln_workspace` with `{ capabilities: true }`; it returns the runtime, source, export and camera contract and proves the tools resolved. For OpenCode, `opencode debug config` from the workspace is the configuration check: it shows the resolved `kiln_workspace` entry. `opencode mcp list` reports what OpenCode's shared background service loaded, so it can print "No MCP servers configured" in a correctly configured workspace. `node kiln.mjs discover --capabilities --json` from the workspace is the harness-independent proof; it reports the same runtime, collections and source storage as the MCP server. Compare `capabilities.engine.installUrl` with `runtime` in `.kiln/workspace.json`. A server named `kiln` from a global installation is a different thing. Do not substitute it silently; report the setup problem instead. When another agent is to do the authoring, start it as a separate harness process in the workspace directory (for OpenCode, `opencode run --standalone "<brief>"` after changing into the workspace); a subagent of the current session inherits this session's tools and never sees the workspace's MCP server, so it would be left with the CLI alone.

When the task includes that separate author's result, retain its process/session
identifier and wait for its terminal result. A launch message, session ID or empty
log proves no authoring work. Use the harness's noninteractive mode with closed
stdin for an unattended child, preserve stdout/stderr, and check the requested
files and saved revision before reporting completion. If it stops early, report
the incomplete handoff; confirm it has stopped before launching a replacement.

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

For an existing workspace, stop its harness/MCP session and run setup from the desired installation with `--check`, then `--upgrade`. Check returns JSON and exits 1 when an update is required. Upgrade refreshes unchanged owned configuration, instructions and registered skill copies while preserving assets and source stores. Conflicting local edits stop the whole upgrade before writing. Adopted projects preserve unrelated configuration changes and leave pre-existing instruction files alone. Legacy instruction files without ownership hashes can require explicit resolution; preserve them before resolving the named conflict. Do not overwrite an edited file merely to clear a diagnostic.

If adopted-project setup stops partway through writing, it attempts rollback. When it reports recovery required, preserve the project and run `kiln-init /absolute/project --recover` after confirming setup has stopped. Recovery refuses conflicting edits and retains its private snapshots outside the project. Resolve named conflicts explicitly; do not delete a lock or journal to force another setup. Recovery is for interrupted setup, not a general asset backup.

New managed launchers reject runtime/skill mismatches before serving tools; older workspaces need this explicit check first. Restart the harness/MCP session after upgrading so cached tool schemas and instructions match. `--repair` alone does not refresh copied skills or a running session. For independent model evaluations, create a fresh workspace from the candidate.

Discovery replaces the removed `kiln_list_primitives` tool; its old `name`, `names`, and `category` selectors have no alias. Update copied guidance through the explicit workspace upgrade, then verify Discovery against the installation as above.

## What isolation means

A separate workspace limits task context; an adopted project retains its existing application context and Git repository. Neither is an operating-system sandbox. User-level instructions, memory, authentication and filesystem permissions still apply. For comparing harnesses or models, use a fresh workspace and read `skills/kiln-batch-dispatch/references/clean-room-evaluation.md`, which covers inherited context and reporting trials.
