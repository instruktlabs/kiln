# Kiln local plugin privacy

Draft for owner review before directory submission. Updated 7 October 2026.

This notice covers the `kiln-engine` local plugin maintained by Instrukt Labs and
the local workspace it sets up. It does not cover the separate hosted Kiln service
or your coding assistant's account and conversation history. The local plugin does
not require a Kiln account, an email address, payment details or a model API key.

## What stays on your computer

Setup reads its public package/version pin, locates Node and npm, and checks the
workspace and runtime directories you select. It installs the engine in a persistent
data directory outside the plugin cache. Paths can contain your device account
name; paths, package identity and file hashes appear in local configuration,
installation records and command results returned to your assistant.

Your workspace and configured asset libraries hold authored JavaScript, material
files, asset names, metadata, previews and GLBs. Local tools read and write the
work you ask them to handle and return requested source, images and results to
your coding assistant. Avoid putting personal or confidential information in a
source file, asset name or tool argument unless you intend your assistant to see it.

The local plugin does not send these assets to an Instrukt Labs service or add
analytics reporting. Your assistant can send prompts and tool results to its own
provider. That processing, and any assistant history or backups, follows the
assistant's settings and privacy policy. Kiln does not control those copies.

## Network access and other services

- Installing or updating the marketplace/plugin contacts GitHub through your
  coding assistant or Git. Setup downloads the exact engine version and its
  dependencies through npm using `https://registry.npmjs.org`. Those services
  receive download requests and ordinary connection information, including your
  IP address. No asset upload is part of setup.
- npm runs with lifecycle scripts, audit and funding requests disabled. It can
  still use your existing npm configuration and inherited environment, including
  registry authentication you already configured. Kiln does not request an npm
  login or registry token for this public package, copy credentials into the
  plugin, or promise to strip npm's normal credential configuration. npm also
  writes to its normal cache and log directories.
- CPU rendering is local. An optional local render service stays on your machine.
  If you explicitly configure a renderer on another machine, Kiln sends the GLB
  and capture settings to that chosen endpoint and uses its configured
  authentication. Review that operator's privacy and retention practices first.
- Opening documentation, filing a GitHub issue or contacting support uses the
  service you choose. Information in a public issue is public; it is not private
  telemetry from your local workspace.

Relevant service policies: [npm](https://docs.npmjs.com/policies/privacy/),
[GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement),
[Claude](https://www.anthropic.com/legal/privacy) and
[OpenAI](https://openai.com/policies/privacy-policy/). Other assistants and optional
renderer operators provide their own policies.

## Retention and deletion

Local source, saved assets, runtime installations and workspace configuration
remain until you delete them. Uninstalling the plugin removes neither your assets
nor its separately installed engine. Plugin updates also leave existing
workspaces on their installed engine until you request a managed upgrade.

There is no automatic seven-day expiry for local work; that is a separate hosted
service policy. Remove selected local work using Kiln's library controls or your
filesystem, and manage independent exports, backups, npm caches and assistant
histories through their respective applications. Preserve copies you want before
deleting a workspace or runtime.

## Support and security

Contact [support@instruktlabs.com](mailto:support@instruktlabs.com) for privacy
questions, deletion requests concerning information you sent to support, or
private security reports. Support receives only what you send, including your
email address and message. Support mail is forwarded through Cloudflare to the
maintainer's Google inbox; see [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/)
and [Google's privacy policy](https://policies.google.com/privacy). We use support
correspondence to handle the request; this is not an automatic local-plugin alert
or a mailing-list signup.

Do not send passwords, tokens, recovery codes or private assets with a bug report.
Sanitize logs and paths before posting publicly. Instrukt Labs cannot remotely
access or erase your local workspace, your assistant's copies or a renderer
operator's records through this plugin.
