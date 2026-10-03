# Cloudflare deployment

**Release direction, 3 October:** Owner confirmed the farmer fix, could not reproduce
the water jump locally, and authorized commit, main integration and deployment after
settling the focused performance findings. See the [release disposition](../docs/reviews/2026-10-03-release-disposition.md).
The upload inventory now contains 486 entries with zero problems. Deploy only after
required CI checks and a clean-main build pass. Historical performance failures remain
recorded; no 108-minute audit or npm publication is required.

The production site is a direct upload to the `kilnstudio` Cloudflare Pages project,
whose production branch is `production`. The code is maintained on GitHub `main`.
GitHub Actions validates the engine and website; it does not deploy the site.
Package publication is separate and remains deferred to v1.0.

## Current hub status (3 October 2026)

The migration is complete: `kilnstudio.tools` is served by this Pages project.
Public build-info and authenticated Pages records identify production commit
`b1ac6ee`, deployment `33c716c7-16e5-46c6-93bf-f2260f0082be`, with packs enabled.
The optimized Farm is live. Golden Gate g9 and Foundry ff3-review2 remain the sealed
production inputs. Local candidate delivery pins are prepared and staged through the normal verified
archive path. Read `src/data/scene-inputs.json` and `src/data/scene-packs.json` for
the exact current IDs and hashes; production remains unchanged.

Existing OAuth can read the Pages project and `kiln-assets` R2 bucket. The hub has
no permanent Wrangler binary or PowerShell on PATH; read-only access was verified
with this exact-version invocation:

```sh
npm exec --yes --package=wrangler@4.147.0 -- wrangler whoami
```

The portable Node wrapper implements artifact-manifest verification immediately
before upload. Its offline fixture tests and dirty-checkout refusal are qualified;
no production upload was used as a test. Authentication has been verified. Use
browser OAuth separately if access expires; never record token contents.

The [alignment plan](../docs/plans/2026-10-02-core-scenes-site-alignment.md) and
[backlog](../docs/backlog.md) track the current candidate and remaining work. Local
core/scene/site changes are uncommitted. Preserve the exact artifact hash on every
static, download, scene-control, viewer, keyboard and accessibility receipt.
Changed runtime bytes require matching new evidence; prior checks do not imply
owner acceptance, physical-device qualification or a clean production release.

Historical candidate receipts remain under `.cache/alignment-preliminary/`,
`.cache/alignment-before-migration/`, `.cache/alignment-release-docs/` and subsequent
alignment directories. The code1 artifact `f0e49fbc…` passed its recorded static,
download, lifecycle, viewer and accessibility checks; later UI integration found
focus, menu stacking and page-layout fixes. Its receipts retain that earlier
scope. See the maintained backlog for the final candidate disposition rather than
relabeling an old artifact as current.

Before release, inspect the actual `dist/build-info.json` and
`dist/artifact-files.json`, verify all three scene releases/chunks and all three
upload manifests, and require the final candidate's qualification receipts.
The upload-set command validates without uploading. The deploy dry run must
refuse an uncommitted checkout. The initial alignment checkpoints preceded release authorization; record the actual final commit/deployment in release receipts.

## Build and deploy contract

Use the versions in `toolchain.json`. From the repository root:

```sh
bun install --frozen-lockfile
cd scenes
bun install --frozen-lockfile
cd ../site
bun install --frozen-lockfile
bun run assets
bun scripts/build-skills-discovery.mjs
bun run build
bun scripts/validate-static.mjs
bun scripts/verify-assets.mjs
```

The default build includes Commons downloads and all three scenes. It fetches only
SHA-256-pinned public objects from `assets.kilnstudio.tools`. `KILN_ASSET_MIRROR`
can name a local mirror with exactly the same relative paths and bytes. The site
uses this repository's `docs/`, `skills/` and `scenes/` by default. Farm is bundled
from scene source; Golden Gate and Foundry use their sealed reviewed standalone
chunks. `scene-inputs.json` pins their complete inputs and `scene-packs.json`
independently verifies each model, data file and runtime chunk.

`KILN_SITE_PACKS=0` is the reduced CI build; never use it for the production rollout.
The authoritative R2 upload sets are `mirror-manifest.json`, `upload-manifest.json`
and `scene-inputs.json`. Preserve existing versioned objects; verify each upload
against its declared SHA-256 and check the public download URLs before deployment.
From `site/`, `node scripts/upload-set.mjs` validates and summarizes all three
manifests, including scene archives, without uploading. Duplicate paths or
inconsistent bases fail the check; extracted GLBs must still name a pinned mirror
archive.

After authorization, merge through the required main-branch checks and build again
from clean `main`. Review the result, then use:

```sh
node site/scripts/deploy.mjs --dry-run
node site/scripts/deploy.mjs
```

Run these commands from the repository root. `--site DIR` selects another site
directory; `--project-name NAME` defaults to `kilnstudio`. The PowerShell entrypoint
remains a thin compatibility wrapper for `-Site`, `-ProjectName`, `-Wrangler` and
`-DryRun`. The former `-AllowPacksOff` bypass now fails explicitly: production
requires `KILN_SITE_PACKS=1`.

The script rejects a dirty checkout (including untracked files anywhere in the
repository), a build from another commit, a build recorded as dirty, and disabled
packs. It verifies the artifact-manifest digest in `build-info.json`, its file count
and byte total, every file's size and SHA-256, and exact directory membership.
Only `build-info.json` and `artifact-files.json` are excluded from the manifest,
matching the build's receipt format; both still count toward the 20,000-file and
25 MiB per-file limits. Missing, additional or altered files, symlinks, unsafe
manifest paths and duplicate entries fail the preflight.

This is a static-site deployment boundary: `site/functions`, `dist/functions`,
`dist/_worker.js` (file or directory) and `dist/_routes.json` are refused, even if
ignored by Git or listed in a receipt. Wrangler would otherwise compile Functions
outside the verified output or rebundle worker imports. A future server-side
deployment needs its own reviewed artifact contract.

Dry run performs these checks offline and does not invoke npm or Wrangler, log in,
or upload. A deployment uses the exact `wrangler@4.147.0` npm package, invoking
npm's JavaScript through Node without a command shell. npm may prepare that version
in its cache. An optional `--wrangler EXECUTABLE` must report exactly `4.147.0`;
Windows `.cmd` and `.bat` wrappers are unsupported, so use the default Node/npm
invocation there. Existing Cloudflare authentication is required. After Wrangler
preparation, the script repeats all file and Git checks and rejects changed
receipts before uploading to branch `production` with the full HEAD commit.
Upload output is streamed with stdin closed, so Wrangler cannot prompt to create a
missing project or start interactive authentication. The selected project and branch
remain explicit. The script never invokes login, creates a project, uploads R2
objects or changes DNS.

## Rollback after an authorized release

Retain deployment `33c716c7-16e5-46c6-93bf-f2260f0082be` in `kilnstudio` as the
recorded rollback target for this candidate: production commit `b1ac6ee`, Farm
`r36-local-review`, Golden Gate `g9` and Foundry `ff3-review2`. The 3 October
08:08:58 UTC public readback still matches artifact manifest
`5ecbbe7673348989a85ef2beb2613e5f27f92c9449cec67690f0791288ab7d15`
(2,727 inventoried files / 200,950,082 bytes). Preserve that build-info, manifest
and readback receipt with the new deployment's records; this readback does not
independently qualify every public file.

Perform a rollback only when authorized. Immediately beforehand, verify that the
target still exists in the correct project and is a successful production
deployment. Cloudflare excludes preview deployments from rollback targets. In the
Pages project's **Deployments** list, open the target's actions menu, select
**Rollback to this deployment**, and confirm the exact target. This is the
[documented Cloudflare Pages rollback procedure](https://developers.cloudflare.com/pages/configuration/rollbacks/);
the local deploy wrapper does not implement rollback.

Afterward, verify the production deployment ID and public `build-info.json`, the
artifact-manifest digest, restored scene runtime/pack hashes, mapped downloads
and gallery/scene entry, controls and exit flows over HTTPS. Record the result and
both deployment IDs. Keep all old and new versioned R2 objects unchanged: restoring
Pages does not require deleting the new `g9-code3` or `ff3-review2-code3` objects.
No rollback, upload or deployment has been performed during this preparation.

## Historical initial migration

The following migration procedure is historical; do not repeat it for a routine
release. For the initial migration, first create the Pages project, deploy and verify its
`pages.dev` address, then associate `kilnstudio.tools` as a custom domain and replace
its GitHub Pages DNS records with the Pages target. Preserve `assets`, `app`, `mcp`
and other unrelated services. Retire GitHub Pages only after the new apex is verified.

Verify `build-info.json` against the exact main commit, the artifact manifest and
scene hashes, download URLs and the real gallery/scene flows over HTTPS. A successful
upload alone is not deployment verification. Keep the deployment ID and receipts.
