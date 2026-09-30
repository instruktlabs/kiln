# Headless harnesses

Seven coding-agent CLIs can drive Kiln unattended. This is the operational reference for
keeping exactly one install of each, invoking them headlessly, and running the repeatable
checks. For what a dispatch run *is*, see [headless asset generation](dispatch.md); for how
to compare runs fairly, see the `kiln-batch-dispatch` skill; for dated results, see
[harness checks](dogfooding.md).

The registry of record is [scripts/harness.mjs](../scripts/harness.mjs). Every flag below is
there with the diagnosis that put it there. When the two disagree, that file is right.

**September 23 qualification note:** OpenCode dispatch now targets V2 using the
process working directory and a private server. Actual V2 CLI/MCP authorings and
requested edits have completed with frozen checkout runtimes: 36 main authorings
and 12 held-outs, each with two edits. Native13 also completed generation and two
refinements through the official Google adapter. These are bounded checkout
results; asset-quality defects, broader provider/platform support and installed
qualification remain explicit. See the [native trace audit](reviews/2026-09-23-native-trace-audit.md),
[campaign and trace review](reviews/2026-09-22-opencode-main-campaign.md) and
[migration receipt](reviews/2026-09-22-linux-and-opencode-v2.md).
Cline CLI 3.0.64 is an additional experimental route: Kiln CLI plus native image-file
loading completed a correction, but Cline's MCP adapter serializes image results
as text before inference. Do not treat those MCP results as visual review or
increase text limits to carry base64. See the
[reproduction and supported route](reviews/2026-09-22-cline-image-qualification.md).
OpenCode 2.0.14 preserves standard MCP images in captured provider requests.
Hermes 0.21.4 preserves MCP images as cached files; its vision tool can load them
for the main model when that route supports images. Activated Cline VS Code 4.1.20
tests preserve MCP images in Legacy and reproduce the CLI defect in Next/SDK.
The shared SDK conversion is implicated, not every Cline implementation. See the
[cross-harness evidence and limits](reviews/2026-09-22-mcp-image-cross-harness.md).

## Cline CLI and Next: image review

Cline CLI 3.0.64 and VS Code 4.1.20 Next/SDK lose MCP image typing before the
model request. Track [Cline #14421](https://github.com/cline/cline/issues/14421).
The tested Legacy extension preserves MCP images. Retest a future upstream fix
with the retained reproduction before treating the affected path as qualified.

For the affected clients, explicitly use Kiln's CLI for image-producing operations,
then load the resulting PNG with Cline's native image reader (`read_files` in the
tested CLI/Next implementation). In an existing Kiln asset workspace:

```sh
node kiln.mjs render asset.kiln.js --out asset.glb --views asset.png --render gpu --json
```

Ask Cline to read `asset.png` as an image before evaluating it. Read the command's
`viewFidelity` receipt as well: GPU material fidelity and successful image delivery
are separate checks. A shell command that prints PNG/base64 data is not image
loading. CPU views remain useful for geometry but cannot confirm textured materials.

MCP can still provide Discovery, source access, edits and saves. When combining it
with CLI rendering, use the same workspace, installation, source/program revision
and requirements binding. The CLI writes the PNG on the client machine even when
the GPU renderer is remote. This workflow uses existing interfaces; Kiln has no
Cline-specific response envelope, automatic client detection or silent fallback.
No `--harness cline` bootstrap option is currently provided.

## Shared tools versus the built-in agent

For your own harness and model, use the generated workspace's CLI/MCP setup and
shared skills. Strands is optional and adds no context to that workflow. Its
`kiln-native-workflow` skill is registered only inside Kiln's built-in agent;
workspace setup never installs it. Do not copy that skill or its `kiln_finish`
protocol into an external harness. See [native workflow boundaries](runtime.md#optional-native-strands-workflow)
when explicitly choosing built-in generation instead.

## One owner per tool

The thing that makes updates flaky is not a missing package manager. It is two owners of one
binary.

Measured on the development machine: `codex` existed three times -- a root-owned
`sudo npm -g` install at `/usr/bin/codex` (0.153.4), an orphaned copy in an inactive nvm tree
(0.139.0), and a current one in the user prefix. `codex doctor` reported `PATH entries (5)`.
A shell wrapper pinned the oldest of them, so `npm i -g` upgraded a binary that never ran.

Every CLI here ships its own updater. Use it, and keep one install per tool.

| harness | canonical install | upgrade | install family |
| --- | --- | --- | --- |
| agy | Antigravity installer | `agy update` | vendor self-updater |
| claude | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude update` | vendor self-updater |
| opencode | `curl -fsSL https://opencode.ai/install \| bash` | `opencode upgrade` | vendor self-updater |
| cursor-agent | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent update` | vendor self-updater |
| codex | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh`, or `npm i -g @openai/codex` | `codex update` | either; it detects which |
| copilot | `npm i -g @github/copilot`, or brew/winget/install script | `copilot update` | either |
| hermes | `git clone` + venv | `hermes update` | git checkout |

Two notes worth keeping:

- **npm and a self-updater can coexist, but only one of them.** `codex doctor` prints
  `install method` and `managed by npm: yes|no`, then adapts `codex update` to match. An
  npm install in a single prefix is therefore fine. Two npm installs in two prefixes is not.
- **`codex doctor` is the only self-diagnosing harness here.** Run it first when codex
  misbehaves; it reports install consistency, PATH duplicates, auth, and disk.

## Headless invocation

Verified against the versions in the footer. The traps are not stylistic -- each one fails
*before* the model reads the brief, and most fail silently.

| harness | non-interactive | prompt position | unattended tool grant | working directory |
| --- | --- | --- | --- | --- |
| agy | `--print=TEXT` | **attached to the flag** | print mode | `--add-dir` |
| claude | `-p` then `TEXT` | positional; `-p` selects print mode | `--permission-mode acceptEdits` + `--allowedTools` | `--add-dir` |
| codex | `exec TEXT` | positional after `exec` | `--approve-for-me` | `--cd` |
| opencode | `run --standalone TEXT` | positional | `--auto` | process CWD only |
| copilot | `-p TEXT` | flag value | `--allow-all-tools` | `-C` and `--add-dir` |
| cursor-agent | `-p` then `TEXT` | **positional; `-p` is a boolean** | `--force --approve-mcps --trust` | `--workspace` |
| hermes | `-z TEXT` | flag value | none; `-z` resolves prompts | process CWD only |

The ones that cost real time:

- **agy `--print` takes the next argument as its prompt.** Write `--print=TEXT`, or end the
  command with `--print TEXT`; with a space and another flag after `--print`, Go's flag
  package reads that flag as the prompt and ignores what you typed.
- **cursor-agent needs three separate grants.** `--force` allows tool calls, `--approve-mcps`
  approves the server, `--trust` accepts the workspace. An unapproved MCP server is gated
  independently of tool permission, so `--force` alone leaves the Kiln tools unreachable.
- **copilot's `--allow-all-tools` is required, not hardening.** Its own help says so. Without
  it a `-p` run has no terminal to prompt on and stops at the first tool.
- **`codex exec` pins the approval policy to `never`,** under which an MCP call is not asked
  about, it is refused. `--approve-for-me` is the flag that both selects a workspace-write
  sandbox and moves approval to `on-request`.
- **A bare temp directory is not a trusted directory.** codex needs `--skip-git-repo-check`;
  cursor-agent needs `--trust`.
- **An older Claude Code does not know newer model ids.** On 29 September 2026 a driver's
  pinned Claude Code 2.1.280 rejected the 5.5 models that 2.1.284 accepted. A driver that
  installs its own copy must pin a release that knows the requested model; one short
  `smoke:harness` turn shows the refusal before a batch spends time.

## Long-running sessions and compaction

Keep automatic compaction enabled. It is a normal continuation boundary, not a reason for a
headless run to stop. Before that boundary -- or simply after every meaningful asset revision --
have the agent update `KILN_PROGRESS.md` with the active goal, current `programRef`, files changed,
validation and render results, unresolved errors, and the exact next action. The generated
workspace `AGENTS.md` carries this instruction so it survives every harness's summary mechanism.

`333000` tokens is a useful **large-context evaluation ceiling**, not a portable default. Apply it
only after confirming that the selected model exposes more than 333k usable context. A 128k or 200k
route needs its native lower trigger. When the window is unknown, leave the harness default alone.
Do not set a fake `model_context_window` merely to make a threshold fit.

| harness | default and manual behavior | public control | safe headless policy |
| --- | --- | --- | --- |
| claude | automatic; interactive `/compact` | Claude Code 2.1.269 exposes `--autocompact auto` or `--autocompact 100k` through `1M` | use `--autocompact 333k` only for a confirmed larger window; otherwise `auto` |
| codex | automatic model default; interactive `/compact` | `model_auto_compact_token_limit`; scope is `total` (default) or `body_after_prefix` | use the per-run overrides below for a confirmed larger window; otherwise omit both |
| hermes | automatic at the lower of its ratio and absolute thresholds; `/compress` is manual | `compression.threshold`, `compression.threshold_tokens`, and `compression.target_ratio` in `config.yaml` | `compression.threshold_tokens: 333000` is a no-later-than ceiling, but Kiln never edits the user-global Hermes config |
| opencode | automatic by default; interactive `/compact` (`/summarize` alias) | v1 exposes `compaction.auto`, `compaction.prune`, and `compaction.reserved`, not a portable absolute trigger | retain native automatic compaction; do not set `OPENCODE_DISABLE_AUTOCOMPACT` |
| copilot | automatic background compaction starts around 80%; the CLI waits for it near 95%; `/compact` is manual | no public Copilot CLI threshold setting; `--context` selects a window tier, not its trigger | retain native automatic compaction |
| cursor-agent | automatically summarizes near a full context; `/summarize` is canonical and `/compress` is its alias | no public threshold override; `preCompact` hooks observe rather than replace it | retain native automatic compaction |
| agy | public CLI documentation exposes context inspection, but not the trigger or summary policy | no supported compaction setting or command found | treat it as opaque, retain native behavior, and rely on the progress note |

Codex's supported one-run spelling is:

```sh
codex exec \
  -c model_auto_compact_token_limit=333000 \
  -c 'model_auto_compact_token_limit_scope="total"' \
  YOUR_PROMPT
```

Hermes's equivalent persistent configuration is:

```yaml
compression:
  enabled: true
  threshold_tokens: 333000
```

The Hermes ratio threshold still wins when it is lower. Because `config.yaml` also belongs to the
operator's provider and credential profile, generated Kiln launchers explain this setting but do
not mutate it.

The controls above were checked against the versions in the footer and their vendor documentation:
[Claude Code CLI](https://code.claude.com/docs/en/cli-usage),
[Codex configuration](https://developers.openai.com/codex/config-reference),
[Hermes configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuration.md),
[OpenCode configuration](https://dev.opencode.ai/docs/config/),
[Copilot context management](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/context-management),
[Cursor summarization](https://docs.cursor.com/en/agent/chat/summarization), and
[Antigravity CLI](https://antigravity.google/docs/cli-reference?app=cli). An absent control is
recorded as absent or opaque rather than inferred from another harness.

## Where each harness reads MCP config

`create-workspace.mjs` writes the spelling the chosen harness actually reads. The filenames
overlap; the contents do not.

| harness | workspace config | shape |
| --- | --- | --- |
| claude | `.mcp.json` | `mcpServers.<name>` |
| copilot | `.mcp.json` | `mcpServers.<name>` with `type: "local"` and `tools: ["*"]` |
| cursor-agent | `.cursor/mcp.json` | `mcpServers.<name>` |
| agy | `.agents/mcp_config.json` | `mcpServers.<name>` |
| codex | **none** -- config is `$CODEX_HOME`-rooted | per-invocation `-c mcp_servers.<name>.…` from `codex.mjs` |
| opencode | `opencode.json` | `mcp.<name>` with `type: "local"` and `command` as an array |
| hermes | **none** -- config is `$HERMES_HOME`-rooted | one user-level `hermes mcp add`; the workspace supplies `--in` and the program store |

**Two of these have no project-local configuration at all, and both used to be written as
though they did.** Codex reads only `$CODEX_HOME`: `-c` overrides `~/.codex/config.toml`,
`-p <name>` layers `$CODEX_HOME/<name>.config.toml`, and `-C`/`--cd` changes the working
directory and nothing else. Hermes reads only `$HERMES_HOME`, and `hermes mcp add` has no
scope flag -- confirmed against upstream HEAD, not just the installed build.

So a workspace configures them **per invocation**, through a generated launcher. Codex takes
nested TOML overrides, which is a complete fix: the server is registered for that run and
nothing is written, so `$CODEX_HOME` keeps its configuration and its authentication. Hermes
has no equivalent for MCP servers, so registering the server is one user-level command that
`START.md` prints; the launcher still supplies the project directory and retargets the program
store through the environment, so one registration serves every workspace.

The rule both follow, and the one to apply to the next harness like them: **a workspace may add
configuration to an invocation, but it must not replace the home that holds credentials.**
Redirecting `HERMES_HOME` at a workspace is what broke hermes -- that single variable resolves
the config path *and* the `.env` path, and `hermes config path` / `hermes config env-path`
report them separately, which is how to check any harness for the same trap.

Two flag notes that cost a run each. Hermes' `--skills` takes skill *names* resolved against
configured sources, not a directory; a path fails the whole run with `Unknown skill(s)`.
And `--ignore-rules` suppresses the workspace's own `AGENTS.md` along with user-level rules,
so it is opt-in rather than part of the documented command.

Copilot and Claude Code read the same *filename* and not the same *contents*: `copilot mcp
add` writes `type: "local"` plus an explicit tool filter where Claude writes `type: "stdio"`
and no filter. The generated Copilot config is the one Copilot's own CLI produced, because a
config a harness cannot read does not announce itself -- the agent simply answers as though
the tools were never mentioned.

**A server named `kiln` may be a different installation, and there is now a way to check.**
Two on one development machine: `~/.cursor/mcp.json` named `kiln` and pointed at an extracted
0.6.0 package -- present, not a git checkout -- while the checkout beside it was 0.7.0; and
`~/.codex/cache/codex_apps_tools/` held a cached `kiln_local` tool namespace. Both were local
leftovers rather than anything this repository ships, but both answer tool calls without
announcing what they are.

Call `kiln_discover` with `{ capabilities: true }` and compare `capabilities.engine` --
`version` and `installUrl` -- against `runtime` in `.kiln/workspace.json`, and
`execution.buildIdentity` against its `buildIdentity` ([identities](runtime.md#what-a-build-identity-covers)). Workspaces also
register under their own `kiln_workspace` name. Report a mismatch rather than silently
substituting it.

Skills need no per-harness directory beyond the two the generator already writes. Claude Code
reads `.claude/skills/`. Every other harness here reads `.agents/skills/`: `copilot skill
--help` lists `.github/skills/`, `.agents/skills/` and `.claude/skills/`, and Cursor's project
skill paths are `.agents/skills/` and `.cursor/skills/` with `.claude/skills/` supported as
legacy. cursor-agent additionally applies a project-root `AGENTS.md` as a rule, alongside
`.cursor/rules/`.

## Running the checks

Three tools, cheapest first. None is part of `bun run test`: they spend provider quota and
need CLIs that CI does not have.

```bash
# 1. Can this harness reach the tools at all? One short turn each.
bun run smoke:harness                          # every CLI on PATH
bun run smoke:harness -- --harness copilot     # one

# 2. Can it author an asset? Keeps brief, transcript, source, GLB, views.
node scripts/dispatch-asset.mjs --harness opencode --model PROVIDER/MODEL \
  --name water-tower "A steel water tower on a riveted lattice frame"

# 3. What went over the wire? Transparent stdio proxy, for payload questions.
node scripts/observe-mcp.mjs
```

`smoke:harness` skips a harness whose binary is absent rather than failing it, and the parent
process runs the engine over whatever program came back -- the child's own claim of success is
the one piece of evidence that proves nothing.

Before trusting a new model id, confirm image support with
`node scripts/check-vision.mjs PROVIDER/MODEL`, then confirm the harness actually forwards
the images. Provider metadata alone verifies neither.

### Reading a result honestly

- A quota or authentication failure is not a measure of asset quality.
- An interrupted run is not a completed asset.
- `viewFidelity.materialFaithful: false` means a CPU view: evidence about shape, not
  material. Judge colour and roughness only from a GPU render.
- The prompt should *be* the brief. Writing the brief to a file and telling the agent to read
  it adds two failure modes that have nothing to do with Kiln -- the agent needs working file
  tools, and its working directory has to be right.

## Excluded

- **Gemini CLI.** Google switched it off for individual tiers on 18 June 2026 and replaced it
  with Antigravity CLI (`agy`). It now fails at startup with
  `IneligibleTierError: This client is no longer supported for Gemini Code Assist for
  individuals`. Only enterprise Code Assist licences and paid API keys still reach it, so it
  has no adapter. Use `agy` for Gemini models.
- **The VS Code Copilot Chat extension.** A GUI, not a headless harness. It matters anyway
  because it shares the `copilot` CLI's schema validator: a JSON Schema 2020-12 tuple renders
  as `prefixItems` plus `items: false`, which that validator rejects with `tool parameters
  array type must have items`, disabling the tool before the model sees it. The `copilot`
  adapter is the standing reproduction for that class of breakage without an editor open.

## Adding a harness

1. Add an entry to `HARNESSES` in [scripts/harness.mjs](../scripts/harness.mjs): `bin`,
   `defaultModel` (`null` when account entitlement is unknowable), `probe`, `argv`, and
   `fallbackModels`. Record *why* each flag is there.
2. Add its MCP config spelling to `managedFiles` in
   [scripts/create-workspace.mjs](../scripts/create-workspace.mjs) and its name to the
   `harnesses` list beside it.
3. Add a case to the workspace test in
   [src/\_\_tests\_\_/workspace-bootstrap.test.ts](../src/__tests__/workspace-bootstrap.test.ts)
   asserting the generated config names the runtime's `dist/mcp-server.mjs`.
4. Run `bun run smoke:harness -- --harness <name>` before trusting it with a brief.

Prefer a `defaultModel` of `null` over a guess. A model id hardcoded here overrides a working
operator configuration, and a harness that rejects an unentitled id fails before the brief.

## Verified on

13 September 2026, Linux, `KILN_RENDER=cpu` for the engine gates.

agy 1.2.2 · claude 2.1.269 · codex 0.154.0 · copilot 1.0.83 · cursor-agent 2026.09.10-fd3934a
· hermes 0.21.2 · opencode 1.18.30 · node 22.23.2 · bun 1.4.2 · npm 12.0.2
