# Install Kiln for your coding agent

This guide installs Kiln **0.9.0**: standalone authoring with optional projects, a
material library and Live Review in the local dashboard. [CHANGELOG.md](../CHANGELOG.md)
lists what changed. Existing users should read the [migration notes](migration.md)
before upgrading a workspace. **0.9.0 is a source and site preview for dogfooding.** Build this checkout
to evaluate the current engine. Package publication is deferred to v1.0.

## Install the package

Kiln can be packaged as a tarball, `kiln-engine-VERSION.tgz`, and installed with
Node.js and npm. For the current candidate, use
[Install a local package](#install-a-local-package). For a published package, use
the tarball and checksum actually attached to its
[release](https://github.com/matthew-kissinger/kiln/releases); a source-only release
does not imply that a built tarball is available.
The package includes the built CLI/MCP runtimes, renderer code, plugins and skills.
You do not need Bun, a source checkout, a build step or a separate model API key to
use the CLI/MCP tools. Use the real tarball path and filename:

```sh
mkdir kiln-install
cd kiln-install
npm init -y
npm install /absolute/path/to/kiln-engine-VERSION.tgz --omit=dev --include=optional
npm exec --offline -- kiln-init ../my-assets --harness opencode  # or claude, codex, hermes, agy, copilot, cursor-agent
cd ../my-assets
# Follow START.md for your harness
```

Kiln is not published to the npm registry; do not run a registry install command.
npm 11 may warn that the optional `webgpu` package's install script is not covered by
`allowScripts` (`npm warn install-scripts`). That script only clears the macOS download
quarantine from the prebuilt Dawn binary the package ships; Windows and Linux need
nothing, and the warning is not an install failure.
To modify Kiln itself, [install from the repository](#install-from-the-repository)
and build with Bun 1.4.2 instead.

Choose your harness from the setup guide. Existing users should read
[migration notes](migration.md), then run the newer installation's `kiln-init --check`
and `--upgrade` as described below to refresh managed workspace skills and launchers.
Do not point an old package at new documentation and assume its tools have changed.

Released-package checks cover Windows, Linux, and hosted Apple Silicon/Intel Mac;
see the [dated platform receipts](evaluation/platform-matrix.md). A receipt qualifies
the tarball it names, not a later build. Community reports on local Mac installations
are welcome. CPU package setup and optional GPU support are separate checks.

## Choose the simplest connection

| Where you want to work | Setup path |
| --- | --- |
| Codex, Claude Code or OpenCode | Install Kiln, generate a project workspace, open your agent there. Local MCP needs no tunnel. |
| Google Antigravity CLI or desktop | Generate an `agy` workspace. See the [Google setup guide](google.md) for verified CLI steps and desktop checks. |
| ChatGPT in a browser | Follow the [private MCP tunnel guide](chatgpt.md). This is a separate developer setup. |
| Gemini Spark in a browser | Remote MCP is required; Kiln's end-to-end Spark integration remains unverified. See [current status](google.md#gemini-spark-in-the-browser). |

For agent-assisted installation, give your agent the repository URL and ask:

> Set up Kiln in a new asset workspace for my current coding agent. Follow
> docs/install.md and the generated START.md. Keep configuration and skills
> project-local. Verify tool discovery and a small render before creating my asset.
> Report missing login or setup failures without substituting another installation.

## Release compatibility

The current candidate's connected MCP server lists the fourteen tools in the
[generated tool reference](tools.md), plus `kiln_project`, `kiln_material` and
`kiln_review` from the packaged local host: seventeen in all. When installing an
older release, use the documentation and receipt attached to that release; newer
tools and migration changes are not retroactively available there.

Package publication requires per-platform receipts (Linux, Windows, macOS arm64,
macOS x64) and `SHA256SUMS.txt` for the exact tarball. Check the artifacts actually
attached to the selected release; do not treat an older receipt or a source archive
as qualification of the current candidate.

A successful local build or an unreleased fix does not update the GitHub release: a
checkout can be ahead of it. Do not substitute an unverified npm registry package -- this
package is distributed through GitHub and is deliberately not published to npm.

## Start on a Mac with a local package

The compiled CLI and MCP runtime contract is Node **20.15.0+ on the 20.x line**, or
**22.2.0 and later**. Bun and a particular npm version are not end-user requirements.
For a new installation, use a maintained Node 22 or 24 LTS release from the
[official download page](https://nodejs.org/en/download). Node 20 compatibility
allows distribution-managed installations; Node 20 itself is
[upstream EOL](https://nodejs.org/en/about/previous-releases).
Use native ARM64 Node on Apple Silicon, or x64 Node on an Intel Mac. Check what this terminal is running:

```sh
node --version
npm --version
node -p "process.platform + ' ' + process.arch"
```

The last line should say `darwin arm64` or `darwin x64`. The npm supplied with Node
can install the package; contributor CI pins npm 12.0.2 for reproducible receipts.
You do not need to change global npm or install Homebrew for this workflow.

The optional built-in Strands agent requires Node **22.2.0+** and its optional SDK
and provider dependencies. Using Kiln from Cline or another MCP/CLI agent does not
require Strands or its model-provider packages. TypeScript library exports require
a TypeScript-capable loader or build system; the installed commands are compiled.
Maintainer release checks still use the exact versions in the source repository's
`toolchain.json`. Current Node 20/22-minimum/24 evidence is from
fresh Windows package installations (Node 20.15.0 and 22.23.2); Linux floor and
macOS package jobs qualify the current release through CI. Physical GPU coverage
and distribution-specific Debian/Cline setup remain separate checks.

Cline CLI 3.0.64 and VS Code 4.1.20 Next/SDK have a known MCP-to-model limitation:
image responses become text, with larger results also truncated. The tested
Legacy extension preserves images. Until the affected path is fixed and verified,
use Kiln CLI exports and Cline's native image-file reader for visual review; see
the [setup instructions](harnesses.md#cline-cli-and-next-image-review) and
[upstream issue #14421](https://github.com/cline/cline/issues/14421).
Kiln's standard MCP output is unchanged.

This separation follows feedback from a Cline user recommending Kiln for programming
and game-development classes, who reported needing to install Node 22 on Debian.
The reporter's name and exact Debian/Node versions were not supplied.

Choose a permanent installation directory and use the real tarball filename:

```sh
mkdir -p "$HOME/Developer/kiln-install"
cd "$HOME/Developer/kiln-install"
npm init -y
npm install "/absolute/path/to/kiln-engine-VERSION.tgz" --omit=dev --include=optional
npm exec --offline -- kiln-init ../my-assets --harness codex
cd ../my-assets
node kiln.mjs --help
```

Choose your harness from the table below, then follow `START.md` in the new
workspace. The setup creates project-local configuration and copies the skills.
These authoring skills support external CLI/MCP harnesses. Strands-specific
workflow guidance stays inside the optional built-in agent and is not installed
into CLI/MCP workspaces. Do not copy its native finish protocol into your harness;
see [the workflow boundary](runtime.md#optional-native-strands-workflow).
Your source and revisions live in `my-assets`; the installed engine stays in
`kiln-install`. No global skills or agent configuration are changed. Keep the
installation in place while using its workspaces.

CPU images work without a GPU service. Start there to verify the connection.
They show geometry and flat color; use [GPU rendering](rendering.md) for material
review. Apple GPU/Metal operation is also unverified; a CPU package result would
not establish GPU support.

Kiln uses `sharp` for image work. Its upstream distribution includes native macOS
ARM64 and x64 binaries, installed through optional dependencies; keep those enabled.
Install dependencies on the Mac rather than copying `node_modules` from another
OS or architecture. The standard prebuilt path should not require a compiler or a
separate libvips installation. If installation instead tries to compile native code,
check the Node architecture and npm optional-dependency settings before adding a
build toolchain. See [sharp's installation guidance](https://sharp.pixelplumbing.com/install/).
Manifold CSG and xatlas UV unwrapping are shipped WASM dependencies and are exercised
by the package smoke alongside the native image dependency.

## Install from the repository

```sh
git clone --filter=blob:none https://github.com/matthew-kissinger/kiln
cd kiln
bun install --frozen-lockfile
bun run build:runtime
node scripts/create-workspace.mjs ../my-assets --harness opencode
```

`--filter=blob:none` checks out the current tree in full and leaves historical
file contents on the server, so the clone transfers less and finishes sooner.
Git fetches an old file version on demand the first time something asks for one,
which needs network access. Use a plain `git clone` if you want the entire
history available offline.

Setup checks that the Node runtime, bundles, dependencies and selected skills are
available before writing the workspace. It does not install an agent or sign in on
your behalf. Open the generated `START.md` for the selected harness's launch steps.

The destination must be empty and outside the installation. Authoring, refinement
and QA skills are included. Add scene composition and batch dispatch when needed:

```sh
node scripts/create-workspace.mjs ../my-scene --harness codex --skills compose,batch
```

Skills are ordinary Markdown files with supporting resources. Ask the agent to read
`AGENTS.md` and the relevant skill; a special skill loader is not required. Setup does
not change global skills, configuration, or authentication.

## Install a local package

Contributors can build an installable tarball without publishing anything:

```sh
bun run build:runtime
npm pack --ignore-scripts
```

Install the resulting `.tgz` in a separate installation directory using npm. The
package includes the Node entry points and workspace setup; npm installs their
runtime dependencies. The build includes a separate worker and deterministic bundle
metadata. It does not need the original checkout or its devDependencies.
Use the actual tarball path and filename returned by `npm pack`:

```sh
mkdir kiln-install
cd kiln-install
npm init -y
npm install /absolute/path/to/kiln-engine-VERSION.tgz --omit=dev --include=optional
npm exec --offline -- kiln-init ../my-assets --harness opencode  # or claude, codex, hermes, agy, copilot, cursor-agent
```

`kiln` renders programs and imports/exports source revisions. `kiln-init` creates a
workspace. These are installed package commands, not currently published npm
package names. Library exports remain TypeScript source for Bun or a compatible
bundler; ordinary Node callers should use the CLI/MCP bundles. The optional
`kiln generate` adapter is separate and needs its agent/provider dependencies;
connecting an existing harness does not load that stack.

## Choose a harness

| Harness | Project configuration | Launch from the workspace |
| --- | --- | --- |
| Claude Code | `.mcp.json` | `claude` |
| Codex | `.codex/config.toml` | `codex` |
| OpenCode | `opencode.json` | `opencode` |
| Antigravity | `.agents/mcp_config.json` | `node agy.mjs` |
| Hermes | Separate `.hermes/config.yaml` profile | `node hermes.mjs --ignore-rules` |

Sign in to your harness and accept its normal project/MCP trust prompts. Hermes's
separate profile needs its own authentication or provider credentials supplied
through the environment; setup does not copy credentials. The Antigravity launcher
sets the absolute project directory and disables automatic skill expansion in print
mode. Name `kiln_workspace` in the brief, use the project skill copies, and pass
absolute task-file paths. See [clean-room setup](clean-room.md) for evaluation controls and limitations.

## Verify the connection

OpenCode workspaces register their local `skills/` directory using the supported
`skills.paths` configuration. With OpenCode 2, `opencode debug config` from the
workspace is the configuration check: it shows the resolved `kiln_workspace` entry.
`opencode mcp list` reports what OpenCode's shared background service loaded, not this
workspace's configuration, so it can print "No MCP servers configured" here. These are
optional OpenCode diagnostics, not Kiln requirements; `node kiln.mjs discover
--capabilities --json` from the workspace is the harness-independent proof. Start
a fresh session in that directory and verify that it reads the workspace's author,
refine and QA skills and calls `kiln_workspace`; configuration alone does not prove
that the running session loaded them. The older `opencode debug skill` command is
not available in OpenCode 2. See the [OpenCode configuration schema](https://opencode.ai/config.json).

### Fetching the skills by URL instead

The same skills are published at a well-known URI, so a client that reads
[Cloudflare's Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc)
can load them with no clone and no workspace. OpenCode's `skills.urls` consumes it:

```
https://kilnstudio.tools/.well-known/agent-skills/index.json
```

Each entry names an artifact and the sha256 of its raw bytes, so a client can
verify what it fetched. The index is generated from `skills/` in the same run that
serves it -- a committed copy would publish digests that go stale the moment a
skill changes.

This path carries the skills and nothing else. It does not configure an MCP server,
so `kiln_workspace` is still absent and no tool call will resolve; the skills will
describe a tool surface that is not there. Use it to read the workflows, or
alongside a server you configured yourself, not as a substitute for
`kiln-setup-workspace`.

Ask the agent to read `AGENTS.md`, discover geometry helpers, render a small draft,
read its source, edit it by `programRef`, and export the accepted revision. Check the
actual tools and files, not only the agent's final message. CPU rendering needs no
model key or GPU; [material-faithful rendering](rendering.md) requires the optional
GPU service and a successful fidelity result.

The CLI and MCP configuration point to the same `.kiln/programs` directory. Follow-up
calls use immutable source references, so the model need not retransmit its program.
[Source and revision semantics](programs.md).

## Move or repair an installation

Generated configuration records absolute runtime paths. Setup resolves the Node
executable to its real path, so temporary version-manager
shell links are not saved in MCP configuration. If you remove that Node version,
run repair using the replacement Node installation. Repair also updates workspaces
created by older setup versions that saved a temporary shell path.

After moving the runtime or workspace, close its agent session and run setup from
the current installation:

```sh
node /current/kiln/scripts/create-workspace.mjs /absolute/my-assets --repair
```

For an installed package, `npm exec --offline -- kiln-init /absolute/my-assets --repair`
works from its installation directory. Repair checks `.kiln/workspace.json` and
updates generated launchers/configuration. It preserves source revisions, asset
files, instructions and skill copies. It refuses to replace configuration you edited;
update those paths manually while preserving your changes. Restart the harness.

Repair does not upgrade copied skills. To update an existing workspace, stop its
harness/MCP session and run from the desired installation:

```sh
node /current/kiln/scripts/create-workspace.mjs /absolute/my-assets --check
node /current/kiln/scripts/create-workspace.mjs /absolute/my-assets --upgrade
```

`--check` is read-only JSON; it exits 1 when an update is required. It compares
runtime identity and bundle bytes, generated configuration, instructions and all
three skill locations. `--upgrade` refreshes unchanged managed files and removes
unchanged retired skill resources. Assets, source stores and other user files are
left in place. Existing customizations remain when the corresponding upstream
file has not changed. If both changed, or an older manifest cannot establish who
owns an instruction file, the whole upgrade stops and lists the conflicts before
writing anything. Preserve those files separately, compare with a fresh temporary
workspace from the desired installation, and resolve them before retrying. Reapply
compatible customizations afterward; no automatic content merge is attempted.

Generated CLI launchers refuse a stale managed workspace before running. The MCP
server still answers the handshake and the tool list; its first call that needs the
engine returns the stale-workspace diagnostic with the `kiln-init` steps, and the next
call succeeds once the workspace is upgraded, without restarting the session. Older
launchers need an explicit `--check`/`--upgrade` first. Hand-wired MCP setups are
outside this managed-workspace check. Customizations are reported by `--check`;
their compatibility remains the owner's responsibility. Keep exported `.kiln.js`
files as portable checkpoints even when retaining the source store. Use fresh
workspaces for independent model evaluations.

## Manual MCP configuration

Launch the installed `dist/mcp-server.mjs` over stdio using an absolute path. It loads
`dist/mcp-engine.mjs` from the same directory on the first call that needs the engine,
so launch the installed copy in place rather than copying one file elsewhere. Choose
an explicit store shared with your CLI:

```json
{
  "mcpServers": {
    "kiln": {
      "command": "node",
      "args": ["/absolute/path/to/kiln/dist/mcp-server.mjs"],
      "env": {
        "KILN_PROGRAM_STORE": "/absolute/path/to/assets/.kiln/programs",
        "KILN_RENDER": "auto"
      }
    }
  }
}
```

The table above names each client's native configuration location; their JSON/TOML
shapes differ. Prefer generated configuration. Without an explicit store, the server
uses `.kiln/programs` beneath its process working directory.

For an explicitly bound asset brief, append `"--requirements"` and the absolute
path to a host-binding JSON file to `args`. This optional policy is fixed for the
server session; changing the file requires a new session. The default remains
neutral authoring. See [host requirements](migration.md#migrate-evaluator-integrations-together)
for the binding format and task/asset lineage boundary.

The Claude plugin manifest also launches the Node bundle. A plugin clone alone does
not establish that its runtime dependencies were installed: verify tool discovery
and a render before considering that path ready. Use project setup when the host
cannot install the plugin's dependencies.

## Verify a distribution as a contributor

```sh
bun run build:runtime
npm run test:package
```

This explicit smoke test may download dependencies from npm. It makes no model calls
and publishes nothing. It packs the current files, installs without devDependencies
in a temporary directory, tests CSG and UV WASM, CPU images, MCP discovery, reference
editing, persistence across restart, and exact source export. It retains a JSON
receipt and artifacts at the printed path. Normal unit tests do not run npm installs.

To test an existing package instead of packing the checkout, run
`node scripts/smoke-package.mjs --tarball /absolute/candidate.tgz`. For Linux, run
`node scripts/smoke-package-linux.mjs /absolute/candidate.tgz /absolute/receipt.json`
with Docker running. See the [recorded Linux package check](evaluation/platform-matrix.md)
for the pinned image, exact candidate hash, coverage, and limitations.

CI builds one tarball on Linux, then runs the same npm package smoke natively on
`macos-15` (ARM64) and `macos-15-intel` (x64), with Node 22.23.2 and npm 12.0.2.
The Mac jobs install no contributor dependencies and do not set up Bun. Their
retained receipts include the tarball hash, native architecture and completed
checks. These versioned runner labels follow [GitHub's runner catalog](https://docs.github.com/en/actions/reference/runners/github-hosted-runners);
GitHub maintains the underlying images, so the labels are not immutable OS images.
Both architectures passed all 16 package checks in [CI run 33996715717](https://github.com/matthew-kissinger/kiln/actions/runs/33996715717). The retained receipts are linked in the platform matrix.

CI also runs Linux package jobs at Node 20.15.0, 22.2.0 and 24.20.0 using each
distribution's npm. The release build retains its pinned maintainer toolchain.
A separate Ubuntu 24.04 job selects Mesa software Vulkan and exercises textured
renderer readback from the installed tarball, recording the adapter class and PNGs.
This probe explicitly permits a software adapter; normal Kiln GPU rendering
continues to require hardware. A job qualifies only the tarball it ran against,
and none of these jobs qualifies physical AMD, Intel or Apple GPU behavior.

## Embed the tools

```ts
import { createKilnProgramToolRegistry } from '@kiln/engine/tools';
const tools = createKilnProgramToolRegistry();
```

Definitions include the schema, implementation and image extraction. Forward image
content as well as text. An embedded registry uses an in-memory store unless the host
injects a persistent `ProgramStore`. See [the library reference](architecture.md).

## Evaluation limits

Local CLI/MCP builds run in a separate process by default, with a 60-second deadline,
16 MiB GLB cap and 32 MiB response cap. The Node worker has a 512 MiB V8 old-space
heap cap; native/WASM buffers and total process memory are not bounded by that flag.
`KILN_EVALUATOR_TIMEOUT_MS` accepts 1 to 120000 and `KILN_EVALUATOR_HEAP_MB` accepts
64 to 4096 in the packaged Node runtime. Host callers can cancel through an AbortSignal.

`KILN_EVALUATOR_MODE=in-process` retains the trusted legacy path, with no hard
synchronous interruption. A separate process is not an operating-system security
sandbox. The isolated mode remains host-specific and requires its verified Linux
isolation setup.

Optimize and instancing options are sent explicitly to the worker. The legacy
`KILN_QA_MODE=observe|off` override is rejected in subprocess mode rather than silently
ignored; remove it or choose the trusted in-process mode deliberately.
