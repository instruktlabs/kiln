# Local plugin setup

The local `kiln-engine` plugin installs Kiln's exact pinned npm version and creates
an asset workspace. It carries setup guidance and a small installer; the engine,
source stores and authored assets live outside the plugin cache. It needs a
supported Node.js installation with npm, network access for first installation,
and no separate model API key. Use it in Claude Code or Codex; it requires a local
shell and persistent filesystem and is not a Claude chat or Cowork plugin.

Resolve the plugin root from this installed skill's absolute path: it is two
directories above `skills/kiln-setup-workspace`. Confirm `runtime.json` and
`bin/kiln-setup-workspace.mjs` exist there. Do not assume plugin path variables are
available in an ordinary shell, and do not substitute an engine checkout.

Plugin version 1.0.0 used `scripts/setup-workspace.mjs`; if using that older
installation, confirm and use that file instead. Plugin and engine versions are
independent. `runtime.json` always names the exact engine to install.

For a fresh workspace, use an absolute empty destination outside both the plugin
and its runtime data directory. Select `claude` or `codex` from the current host
or the user's stated choice:

```sh
node "/absolute/plugin/bin/kiln-setup-workspace.mjs" "/absolute/my-assets" --harness codex
```

The installer verifies the package name and exact version from `runtime.json`.
It uses npm with lifecycle scripts disabled and optional dependencies included.
The versioned engine stays under `%LOCALAPPDATA%/InstruktLabs/Kiln` on Windows,
or `$XDG_DATA_HOME/instruktlabs/kiln` on other systems, falling back to
`~/.local/share/instruktlabs/kiln`. `--data-dir` selects another persistent directory.
Do not place it or the asset workspace inside a removable plugin version directory.

Read the returned workspace's `START.md`. Open Claude Code in that workspace, or
launch Codex there with `node codex.mjs`. Accept the host's ordinary project/MCP
trust prompts, then call `kiln_discover({capabilities:true})` on `kiln_workspace`.
Compare its installation identity to `.kiln/workspace.json`; a config file alone
does not prove the server loaded. The plugin itself starts no global MCP server.

If the current workspace already has a working `kiln_workspace`, keep it. Do not
create a second server. Use its installed authoring skills, which come from its
engine version. The plugin supplies only setup, so authoring instructions are not
registered twice. An old global plugin/server named `kiln` is a separate
installation: explain the conflict and surface its removal or disabling before
continuing; do not silently redirect stores or edit global configuration.

For an existing managed workspace, stop its harness session and run the new
plugin's helper with `--check`, then `--upgrade` when an update is intended:

```sh
node "/absolute/plugin/bin/kiln-setup-workspace.mjs" "/absolute/my-assets" --check
node "/absolute/plugin/bin/kiln-setup-workspace.mjs" "/absolute/my-assets" --upgrade
```

Check is read-only and reports a missing pinned engine without installing it.
Upgrade installs that version when needed, then delegates to Kiln's managed
upgrade. It preserves sources and saved assets and refuses conflicting edits to
managed files. Resolve those conflicts explicitly rather than overwriting them.
Use the same `--data-dir` if setup used a custom location. `--repair` corrects
relocated paths without updating copied skills. Restart the harness afterward.

For release qualification only, `--archive /absolute/candidate.tgz` installs a
reviewed local archive with the same required identity. Different archive bytes
at the same version need a separate data directory. An unpublished development
plugin is not a working registry release; use its reviewed development archive.

If installation fails, report the error. An unknown existing runtime is never
replaced automatically. A setup lock may belong to another running installer;
verify that process has stopped before removing a stale lock. If npm cannot be
located, fix the Node/npm installation or pass `--npm-cli` with its actual
`npm-cli.js` path. Never request registry credentials for this public package.
