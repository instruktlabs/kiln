# Kiln Engine hosted integration

This is the public-directory submission candidate, not a launched or approved
listing. Live service qualification, terms publication, review access and directory review
remain pending. The published local package is a separate distribution.

Kiln turns agent-authored JavaScript into editable 3D assets. This integration
connects ChatGPT or Codex to the hosted service at `kiln.instruktlabs.com` using
OAuth. Sign in with Google or GitHub to keep assets private and apply personal
quotas. No local engine installation or model-provider API key is required for
hosted operation.

The agent can discover geometry helpers, validate source, render views, inspect
geometry, edit source, create materials, and save or reopen immutable revisions.
Results include rendered images and authenticated downloads for GLB assets,
editable source and bundles. Source, material data and artifacts are processed and
stored on Cloudflare. The integration does not fetch arbitrary URLs, send email,
install software or access a local filesystem. Sign-in and account controls run
on the Kiln website; passwords and authentication codes never belong in tool calls.

The plugin's workflow skill uses the hosted operation names. Its program, geometry
and camera references are copied unchanged from the maintained engine guidance
during packaging. Catalog entries identify experimental features and limitations.
Structural checks and rendered previews do not establish fitness for a particular
game, renderer or application.

Unsaved work expires after seven days. Saved assets remain until deleted within
the storage quota. Browser downloads require the owning account. Security changes
appear in account activity; v1 does not send notification emails.

The offline packager includes one remote MCP connection, the hosted skill, selected
maintained references, the existing Kiln icon and the MIT license. It includes no
provider keys, reviewer credentials, private connector IDs, hooks or installers.
The packager's receipt lists files and hashes; it is not a deployment or submission
receipt.

[Source](https://github.com/instruktlabs/kiln) ·
[Support](https://kiln.instruktlabs.com/support) ·
[Privacy](https://kiln.instruktlabs.com/privacy) ·
[Terms](https://kiln.instruktlabs.com/terms)
