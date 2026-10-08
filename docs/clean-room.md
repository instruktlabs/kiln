# A separate workspace for assets

Install Kiln once, then create asset projects outside its installation:

```sh
npm exec --offline -- kiln-init ../my-assets --harness opencode
```

Run this from the package installation directory; see [installation](install.md).
In a built source checkout, use `node scripts/create-workspace.mjs` instead.
Choose `claude`, `codex`, `opencode`, `hermes`, `agy`, `copilot`, or `cursor-agent`.
Plain creation requires an empty destination. Kiln 1.1+ also supports `--adopt`
for an existing project, with a read-only `--adopt --check` preview. Both routes
preflight the runtime and preserve unrelated files, global configuration and
credentials. Independent evaluations use fresh workspaces.

## What the workspace contains

The project has instructions, author/refine/QA skills, a local `kiln.mjs` launcher,
the selected harness's MCP configuration, and `.kiln/workspace.json` identifying the
installation and generated configuration. Add composition and batch skills with
`--skills compose,batch` at creation. Supporting files travel with each selected skill.

OpenCode setup registers the project's existing `skills/` folder through
`skills.paths` in `opencode.json`, so its native skill tool can discover the copies.
The same files remain available for explicit reads; repair updates the registered
path after relocation and preserves edited skills and supporting references.

CLI and MCP share `.kiln/programs`. Engine implementation and examples stay outside
the workspace. For a refinement task, supply only the intended `.kiln.js` source.
For creation, supply a brief with no starting asset. Follow the generated `START.md`
and ask the agent to read `AGENTS.md` and the relevant skill. In an adopted project,
Kiln's instructions are `.kiln/START.md` and `.kiln/AGENTS.md`; existing project
instructions still apply.

If the brief depends on texture, roughness, metalness, glass or other material evidence,
check the optional [GPU renderer setup](rendering.md#running-the-gpu-renderer) before the
first authoring session. Auto mode starts a compatible local service lazily when dependencies
are available. CPU views are sufficient for shape and contact, but not materials. Restart a
session only if its client cannot refresh tools. After repairing the installation,
`kiln_renderer` with `action: 'reprobe'` refreshes the current MCP session's renderer
state. The CLI's `service reprobe` checks its own process; it does not update a
different running MCP session.

The MCP server is loaded by the harness process that runs in the workspace directory, and only
by that process. An agent that hands the authoring to a subagent of its own session gives it the
outer session's tools, not the workspace's; start a nested author as a separate harness process in
the workspace (for OpenCode 2, change into the workspace directory and run
`opencode run --standalone "<brief>"`) or it will have the CLI
alone.

If paths move, use the [repair command](install.md#move-or-repair-an-installation).
Repair preserves instruction/skill copies; new evaluations require fresh workspaces,
not repaired old instructions.

## Discovery migration

The current tool is `kiln_discover`, or `node kiln.mjs discover` in a generated
workspace. Start with an overview, search with ordinary modeling language using
`query`, then request exact `ids` for full helper or recipe contracts. Overview and
search return six summaries by default; recipes are optional and do not constrain
the type of asset being built. No search model or asset-category selection is required.

The old `kiln_list_primitives` tool and `name`, `names`, and `category` selectors
have no compatibility alias. A workspace copied from an older installation needs
updated instructions and a fresh harness/MCP session. Create a fresh workspace from
the updated installation and import the required source or saved ZIPs; retain any
custom skill edits separately. `--repair` does not update copied skills or reload
a running session's tool schemas.

## Normal use and evaluation isolation

A separate directory avoids putting the engine implementation into the agent's task
context. It is not a filesystem security sandbox. Authentication, managed policy and
user-level instructions can still apply; broad shell access can reach other folders.
Normal use need not remove a user's useful preferences.

For a clean-room evaluation, start a new conversation and forbid reading engine source,
example collections, prior runs or unrelated directories. Retain and audit tool traces.
An unobserved boundary is recorded as unknown, not promoted to a clean-room guarantee.
Operating-system isolation, if used, is a separate host configuration and claim.

## Harness launch details

Antigravity: launch `node agy.mjs`. It supplies the absolute project directory and
adds `--disable-slash-commands` for print mode to avoid automatic expansion of an
older global skill. For example:

```sh
node agy.mjs --model MODEL --print "Read AGENTS.md and skills/kiln-author-asset/SKILL.md. Use only kiln_workspace MCP tools. Read the task at ABSOLUTE_BRIEF_PATH."
```

Pass absolute brief and output paths in headless runs. Project MCP configuration is
[`.agents/mcp_config.json`](https://antigravity.google/docs/cli/mcp/). User-level
plugins can remain available, so verify the actual server name and local skill paths
in the trace. A server named `kiln` may point to a different installation. Ask first
for the `kiln_workspace` server's `kiln_discover` with `{ capabilities: true }` and verify its
runtime and source store. The standalone `agy mcp list` view is not proof of which
project tools the conversation used.

For an interactive Antigravity recording, complete first-run onboarding first.
Open `/mcp` and wait for the project server's connected status before the asset
prompt. The September 8 Hub print probe worked immediately, while the first TUI
attempt lacked model-visible MCP tools. Restarting after onboarding and checking
the native manager restored access without changing the generated configuration.
The fresh corrected battleship creation and same-conversation roof-color revision
then completed through native MCP, with saved lineage and validated exports.
This is an assisted readiness retest; retain the failed first take separately.

Hermes: register `kiln_workspace` once with the exact command printed in `START.md`, then
use `node hermes.mjs`. The launcher deliberately does **not** replace `HERMES_HOME`, because
that single home contains the operator's provider selection, MCP registration and credentials.
It supplies the workspace directory and program store per invocation. For a headless run:

```sh
node hermes.mjs -z \
  'Read AGENTS.md and the project skills, then create an ornate astronomical clock.'
```

Do not add `--ignore-rules` unless you intend to suppress this workspace's own `AGENTS.md`.
Use absolute paths when a headless prompt must refer to a file.

Codex supports `exec --ignore-user-config --ephemeral`, per-run MCP overrides and
`--cd`, while retaining authentication.

For OpenCode, finish setup, change into the generated asset directory, then launch
a fresh session as described in its `START.md`. Do not assume a session that created
the workspace has loaded that workspace's MCP configuration. In our OpenCode 1.18.27
test, the original setup session used CLI commands; a fresh session in `my-assets`
loaded the native Kiln tools and completed a requested revision. Check actual tool
calls before describing a run as native MCP. `opencode run --standalone` starts a private
server instead of joining the shared background service (OpenCode 2.0.14 has no `--pure`);
it isolates the process, not the configuration, so audit inherited instructions and plugins
separately.

For headless Codex evaluation, use the generated launcher. Codex reads `.codex/config.toml`
only for a project its `$CODEX_HOME/config.toml` marks trusted, so `codex.mjs` supplies the
same server and program store through per-run overrides:

```sh
node codex.mjs --ignore-user-config --ephemeral --approve-for-me \
  'Read AGENTS.md and the project skills, then create an articulated survey drone.'
```

This retains authentication while ignoring unrelated user configuration, writes no session
rollout with `--ephemeral`, and leaves the workspace-scoped MCP override intact. The launcher
also supplies `--cd` and `--skip-git-repo-check`; running bare `codex` in the workspace does
not load Kiln. Verify actual native calls in the conversation trace before starting asset work.

Claude supports `--strict-mcp-config`, `--mcp-config`, and `--setting-sources project`.
Its `--bare` mode skips OAuth login and requires API-key authentication; do not use it
for subscription runs. A complete project-only headless invocation is:

```sh
claude -p --strict-mcp-config --mcp-config .mcp.json \
  --setting-sources project --autocompact auto \
  --permission-mode acceptEdits \
  --allowedTools 'mcp__kiln_workspace__*,Read,Write,Edit,Glob,Grep,Bash(node kiln.mjs *)' \
  'Read AGENTS.md and the project skills, then create a derelict signal tower.'
```

For a confirmed context window larger than 333k, `--autocompact 333k` is a useful
evaluation ceiling. Otherwise keep `auto`. Claude remains a supported configuration route,
but unavailable credits are not a reason to retry paid calls or substitute an unrequested model.

Use scoped permissions. Setup does not disable approvals globally. Headless runs need
explicit grants for Kiln and local file operations through the harness's controls.

For every harness, keep automatic compaction enabled and have long-running agents maintain
the `KILN_PROGRESS.md` handoff described in the generated `AGENTS.md`. The default behavior,
manual commands, public controls and the conditional 333k evaluation profile are in
[headless harnesses](harnesses.md#long-running-sessions-and-compaction). Opaque harnesses
keep their native policy; Kiln does not guess at a hidden threshold.

## Record a reproducible run

Use the same brief and a fresh directory/conversation for each attempt. Record:

- Engine candidate and CLI/MCP hashes; copied skill/resource and brief hashes.
- Harness version, requested model ID, and actual resolved model identity.
- Starting source, inherited context, permitted directories, and trace audit result.
- Actual tool calls, image delivery, camera/material fidelity and errors.
- Source/artifact hashes, requested edit preservation, elapsed time and measured cost.
- Human intervention and any departure from the procedure.

Check saved files and tool results independently of the model's final response. A
successful render is not a visual-quality score. CPU images support geometry review;
they do not establish PBR material fidelity.

Required current evaluation routes are Astra, Gemini through Antigravity, and Meta
Muse Spark through OpenCode. Resolve exact IDs at run time. Do not substitute older
models or count a quota error as a completed route. Omen can provide an additional
comparison when requested and available.

After implementation, install the final package into fresh workspaces with current
skills, dogfood each required route, fix findings, rebuild and retest affected routes.
A shared tool/skill change requires the common workflow to be rerun across the routes
it affects. Initial runs against pre-fix instructions do not establish completion.
Record unavailable or failing required routes as outstanding.

Sources: [Claude CLI](https://code.claude.com/docs/en/cli-usage),
[Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[OpenCode configuration](https://dev.opencode.ai/docs/config).
