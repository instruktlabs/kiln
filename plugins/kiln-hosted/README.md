# Kiln hosted integration (draft)

This is the public-directory submission candidate, not a launched or approved
listing. The hosted service is open for an introductory invite-only launch;
directory submission, its dedicated review account and review materials remain
deferred. The published local package is a separate distribution.

Kiln turns agent-authored JavaScript into editable 3D assets. This integration
connects supported clients to [kiln.instruktlabs.com](https://kiln.instruktlabs.com)
using OAuth with Google or GitHub sign-in. Enrollment requires a private invitation;
the introduction allows ten accounts sharing 200 native requests per month, with
additional account quotas. Request access through
[Discord](https://discord.gg/fSWVbMdQXK); joining the server does not enroll an account.
No local engine installation or model-provider API key is required for
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

## Source and packaging boundary

These public integration files remain with the Kiln engine. The official hosted
application builds independently in the private `instruktlabs/kiln-hosted`
repository. No private application source or credentials are needed to build this
draft with `node scripts/package-hosted-plugin.mjs FRESH_OUTPUT_DIRECTORY`.

`tool-surface.json` records the 21-tool `kiln.hosted-tools.v2` presentation verified
in production with engine 1.2.1. Its skill and review cases use those operation
names. A parity test checks the snapshot against the shared engine registry to
catch drift. The local package retains its seventeen-tool interface.
The draft plugin version and deployed hosted engine version are recorded
separately; a new public package does not silently upgrade the hosted service.

The public product name is Kiln, published by Instrukt Labs. Directory submissions
remain deferred. The packager's outstanding review steps apply to this directory
candidate, not to the production launch acceptance recorded in the private repository.
