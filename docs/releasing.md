# Publishing Kiln 1.0

This is the maintainer runbook for `@instruktlabs/kiln`. The release workflow is
prepared; it has not published a package. Development, registry publication,
hosted deployment and directory acceptance have separate evidence requirements.
See the [v1 execution record](reviews/2026-10-06-v1-execution.md) for current status.

## Qualify the candidate

1. Complete the release contract, consumer documentation, notices and changelog.
   Align `package.json`, engine metadata and plugin manifests to `1.0.0-rc.N` or
   `1.0.0`, then rebuild the runtime. A version change creates a new candidate.
2. Review the changes and obtain authorization to merge. After merging, wait for
   **every** job in `.github/workflows/ci.yml` to pass on that exact main commit.
   PR receipts are useful during development but cannot authorize a release.
3. Download `node-package-candidate` from that run and record the archive SHA-256.
   Do not repack it. CI installs this same archive on Windows, macOS arm64/x64 and
   the Linux Node matrix, checks consumer declarations and executes software Vulkan.
4. Dispatch **Prepare npm release** from main, with the CI run ID, reviewed digest
   and mode **verify**. The workflow checks repository identity, commit, job results,
   archive contents and every required receipt. Development versions, missing or
   expired artifacts, digest drift and skipped checks fail. This mode has no npm
   publishing access. Download its `npm-release-review` artifact for review.

The dispatch commit must equal the CI commit. If main moves before dispatch,
qualify its new candidate instead. Qualification artifacts expire; if necessary,
rerun CI and review its newly produced archive and digest. Never substitute a local
rebuild. The [preparation script](../scripts/prepare-npm-release.mjs) and its tests
define the required matrix; update them together with any intentional CI change.

## Establish publishing access

Reuse the existing `instruktlabs` npm organization and the owner's verified
`matthew-kissinger` account. Passwords and security-key challenges belong in npm's
browser flow. Keep recovery material outside the repository and logs. A local npm
login is needed for owner review/promotion; CI will use short-lived OIDC credentials.

Configure GitHub environment **npm-release** with the sole required reviewer
`matthew-kissinger`, administrator bypass disabled, and deployments restricted to
protected branches. Keep owner self-review available: this repository's owner may
both dispatch and approve a release. The workflow itself restricts execution to
main. Verify these settings before dispatching mode **stage**; the script refuses
an unprotected environment rather than accepting an implicit environment creation.

First-time npm staging creates a public `0.0.0-stage` placeholder. It therefore
requires explicit authorization against the reviewed candidate. The staged code
stays private until promotion. Do not stage a dummy package to reserve the name.
Source: [npm staged publishing](https://docs.npmjs.com/staged-publishing/).

If npm still requires an existing package before adding its trusted publisher,
bootstrap using the **qualified RC archive** and the owner's local login:

```sh
npm stage publish /absolute/path/to/instruktlabs-kiln-1.0.0-rc.N.tgz --ignore-scripts --access public --provenance=false --tag next --registry=https://registry.npmjs.org --json
```

This is an external write, not a dry run. Retain its `stageId`; do not approve this
bootstrap stage. The explicit provenance override is only for local bootstrap,
which cannot issue a GitHub build attestation. npm 12.2.0 gives explicit CLI flags
precedence over `publishConfig`. After configuring trust, reject the bootstrap by
stage ID with owner 2FA before CI stages the same version. Do not overwrite a stage
or reuse a published version. If npm provides a supported package-free trust setup
at execution time, prefer that and record the actual path used.

In npm's package settings, bind a GitHub trusted publisher to:

| Field | Value |
| --- | --- |
| Owner | `instruktlabs` |
| Repository | `kiln` |
| Workflow filename | `release.yml` |
| Environment | `npm-release` |
| Permission | `npm stage publish` only |

Leave direct publishing and dist-tag management disabled. Require package 2FA and
disallow token publishing; do not add an `NPM_TOKEN` secret. Configure trust shortly
before use because unvalidated configurations expire after 48 hours. Verify the
first successful OIDC stage rather than treating saved settings as proof.
Sources: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[trust configuration expiry](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/).

## Stage and promote

Dispatch the same reviewed candidate with mode **stage**. Review the verification
artifact, then approve the GitHub environment. The second job downloads and checks
the original CI artifacts again before staging the exact tarball. It does not
install package dependencies, rebuild the package, or execute its lifecycle scripts.
RC versions use `next`; `1.0.0` uses `latest`. The job retains `npm-stage.json` and the
full candidate evidence in `npm-staged-candidate`.

On a logged-in maintainer machine, use the returned **stage ID**:

```sh
npm stage view STAGE_ID --json
npm stage download STAGE_ID --json
```

Compare the downloaded archive's SHA-256 with `review.json` and inspect package,
version, tag, contents and provenance. If a staging command times out, inspect the
stage list before retrying; a missing response does not prove nothing was staged.
Reject an incorrect stage. Only after owner approval and its browser 2FA:

```sh
npm stage approve STAGE_ID
```

The workflow never approves stages. npm makes this an owner action, and staged
tags cannot be changed in place. Source: [npm stage CLI](https://docs.npmjs.com/cli/v12/commands/npm-stage/).

## Verify publication and recover

Read the public registry metadata and independently fetch the published archive;
compare its digest with the approved candidate. Run clean registry installs on the
supported platform matrix and exercise SDK, CLI, MCP, workspace setup/upgrade and
local plugin flows. Verify the public provenance statement's repository, workflow
and commit. Retain registry URL, version/tag, digest, run IDs, installed receipts
and the owner's approval. Create the approved GitHub release/tag with matching
notes and archive identity only after these checks.

Publication failure does not authorize a rebuild under an existing version. Before
promotion, reject and replace an incorrect stage. After publication, stop rollout
and prepare a newly versioned correction; consider deprecation or tag changes only
with explicit approval. Do not assume npm unpublish is available or an appropriate
rollback. Hosted rollback and vendor review remain independently tracked.
