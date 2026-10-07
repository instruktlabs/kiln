# Kiln Engine local plugin

Plugin version 1.0.1, maintained by Instrukt Labs under the MIT license.
This plugin installs engine 1.0.0.

Set up a persistent Kiln workspace for Claude Code or Codex, then create and revise
editable 3D assets with your coding agent. Use a supported Node.js installation
with npm. No Bun, engine checkout, Kiln account or separate model API key is needed.
The plugin requires a local shell and filesystem; Claude chat and Cowork are not
supported by this local bundle.

## Install

For Claude Code:

```sh
claude plugin marketplace add instruktlabs/kiln
claude plugin install kiln-engine@instruktlabs
```

For Codex:

```sh
codex plugin marketplace add instruktlabs/kiln
codex plugin add kiln-engine@instruktlabs
```

Restart or reload your coding agent's plugins as its installation message directs.
Then ask it to set up a Kiln workspace. The maintained setup skill runs this
plugin's `bin/kiln-setup-workspace.mjs` with Node, installs
`@instruktlabs/kiln@1.0.0` and creates a separate asset workspace.

The plugin registers setup only. The workspace supplies authoring skills and one
local MCP server, `kiln_workspace`. Open Claude Code in that workspace; launch
Codex there with `node codex.mjs`. Follow `START.md`, accept the host's ordinary
trust prompts and verify live tool discovery before authoring.

## Three setup examples

1. **Create:** “Set up a new Kiln workspace in an empty directory outside this
   checkout, using my current coding agent. Verify its tools before I author an
   asset.” The installer downloads the pinned engine when needed, creates the
   selected workspace and keeps its engine in a separate runtime store. npm also
   uses its normal cache and log directories.
2. **Check:** “Check my existing Kiln workspace without changing it.” The helper's
   `--check` mode reports whether managed files and the installed engine are
   current. A missing runtime is reported without installing one.
3. **Upgrade:** “Upgrade my managed Kiln workspace while preserving my sources,
   saved assets and customizations.” Stop the workspace's harness session first.
   The helper's `--upgrade` mode uses the pinned engine and refuses conflicts
   rather than replacing customized managed files.

The engine installation and your assets stay outside the disposable plugin cache.
Removing or updating the plugin does not delete them. Existing workspaces stay on
their installed engine until an explicit managed upgrade. Read the
[setup and upgrade guide](skills/kiln-setup-workspace/references/plugin-install.md)
for paths, repair and failure recovery.

## Execution and network access

The setup skill asks your coding agent to execute a bundled Node installer. That
installer runs npm with lifecycle scripts disabled and invokes Kiln's workspace
generator. It does this before the workspace MCP server exists; it does not
silently install a global MCP server or grant itself shell permissions.

Marketplace installation and updates contact `https://github.com`. First engine
installation and dependency downloads use `https://registry.npmjs.org`. npm can
use your existing npm configuration and environment. No npm login or token is
required for this public package. Normal local asset work does not upload your
assets to Instrukt Labs. Tool results can enter your coding assistant's model
context; its provider handles those copies.

CPU rendering is local. Material appearance needs a compatible local renderer or
one you explicitly configure on another machine; a remote renderer receives the
GLB and requested capture settings. Follow the setup skill's renderer checks.
The separate hosted Kiln integration has its own authentication and privacy notice.

## Support and security

Send private security or privacy questions to
[support@instruktlabs.com](mailto:support@instruktlabs.com). Never include
passwords, tokens, recovery codes or private assets in public issues. For a normal
bug report, provide the plugin and engine versions, operating system and a small
sanitized reproduction at [GitHub issues](https://github.com/instruktlabs/kiln/issues).

If setup fails, retain the error, check Node/npm and network access, and follow the
setup guide. Do not delete an unfamiliar runtime or another installer's lock.

[Local privacy notice](PRIVACY.md) · [MIT license](LICENSE) ·
[Source](https://github.com/instruktlabs/kiln)
