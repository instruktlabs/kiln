# Kiln Engine local plugin

Version 1.0.0, published by Instrukt Labs under the MIT license.

Ask your coding agent to set up a Kiln workspace. The setup skill installs
`@instruktlabs/kiln@1.0.0` with npm and creates a separate asset workspace.
Use a supported Node.js installation with npm; no Bun, engine clone or separate
model API key is required. The workspace's START.md explains how to reopen it.

The plugin registers setup only. The workspace supplies the authoring skills
and one local MCP server, `kiln_workspace`. Open Claude Code in that workspace;
launch Codex there with `node codex.mjs`. Accept the host's ordinary trust prompts
and verify live tool discovery before authoring.

The engine installation and your assets stay outside the disposable plugin cache.
Plugin removal or updating its cached files does not delete them. An existing
workspace remains on its installed engine until an explicit managed upgrade.
Read [setup and upgrade guidance](skills/kiln-setup-workspace/references/plugin-install.md).

CPU rendering is available locally. Material appearance requires a qualified
renderer; follow the setup skill's renderer checks rather than assuming GPU support.
Hosted ChatGPT access is a separate integration, and this local bundle is not a
public OpenAI directory submission.

[Source and issues](https://github.com/instruktlabs/kiln)
