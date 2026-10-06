# Stable package candidate

This branch prepares `@instruktlabs/kiln@1.0.0` from main
`8d14d0e0ca89fe3ef860ff6d3568e5647a382c53`. It does not publish the package,
deploy hosting or claim vendor directory acceptance. Merge and promotion remain
owner decisions against the qualified candidate in [the runbook](../releasing.md).

## Scope

- Align the package, engine and legacy/plugin manifests to 1.0.0; regenerate the
  maintained local plugin and rebuild the Node runtime, SDK and local viewer.
- Correct packaged installation, SDK and migration facts for the stable contract.
  The broad README/Troy/gallery/site content refresh remains deferred until stable
  publication and hosted acceptance, as requested by the owner.
- Carry the already-reviewed root and site dependency patches, the scoped
  Miniflare `sharp@0.35.5` override, and ignored Cloudflare secret-binding paths
  independently of unfinished native hosting work.
- Preserve the public RC receipt and registry-install workflow. That workflow
  still verifies `1.0.0-rc.1`; it does not attest that 1.0.0 is published.

The account-controls and native-container branches are excluded. No hosted
authentication or evaluation behavior is changed by this candidate.

## Registry state

On 6 October, a fresh public registry read returned `next: 1.0.0-rc.1` and
`latest: 0.0.0-stage`. Stable promotion must replace that temporary holding tag.
The explicit RC remains the installable version until the stable promotion receipt
and public archive are verified. Never substitute a locally packed archive for the
exact main-CI archive selected by the release workflow.

## Security review

The earlier targeted patches update Hono, its Node server adapter, URI/XML/IP
parsers, protobufjs, proxy-addr and qs within existing declared dependency ranges.
The site patches update `http-cache-semantics` and `source-map-js`. The remaining
moderate selector-parser advisory is confined to the site's trusted static CSS
build; it remains tracked rather than suppressed. No online user-CSS parser is
provided by this release.

A fresh audit also identified the optional agent graph's
`@modelcontextprotocol/sdk@1.30.0`. The upstream
[OAuth client advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h), added to
GitHub's database on 6 October, fixes 1.x in 1.31.0 and later. Kiln's local stdio
server is outside the advisory's affected HTTP OAuth-client path. The optional
Strands/Google dependencies allow a patched 1.x version; the lockfile now resolves
1.32.1 without changing direct dependencies. Root, full hosted and the clean
installed-package production audits report zero known vulnerabilities. This
observation does not imply credentials were
exposed, and no credentials were inspected.

## Qualification

Local gates pass; exact-commit CI and main qualification remain. Local receipts
are retained under `.cache/stable-qualification/`.
The locally packed archive has SHA-256
`6ed3d6b9964429f14c3c6a0a6a13d56be509dd0f40b07061a37d491f901c1508`.
A clean Windows installation with Node 22.23.3/npm 12.2.0 passes SDK imports and
consumer types without optional agent peers, CLI/subprocess rendering, WASM CSG
and UVs, CPU images, MCP discovery, restart persistence, immutable edits, exact
source export, the community exporter and local plugin bundle checks. The release
receipt verifier accepts it. This local archive is development evidence, not the
main-CI archive that will be promoted.

The rebuilt engine passes all 91 hosted foundation tests. Hosted types/builds,
root typecheck/lint, toolchain/skills checks and all 78 render-service tests pass.
Gitleaks scans the 947 validated extracted archive entries (24.07 MB), reporting
no matching secrets. That bounded scan does not establish absence of every secret.

The first full engine run passed 3,289 tests and skipped two, but failed one
standalone CLI fixture at a Windows directory rename (`EPERM`). Its focused retry
passed without a source change. The full rerun with the patched dependency graph
and pinned Node environment passes all 3,290 tests with two platform skips and no
failures. The coverage gate passes at 95.16% functions (minimum 94.00%) and 92.50%
lines (minimum 92.10%); no threshold changed. The initial run remains a failed
receipt, and the Windows CI run must independently qualify the commit.
Initial site builds also exposed missing fresh-worktree setup: scene dependencies
and the generated gallery index. Follow the existing CI preparation steps before
assessing the site build; do not change bundler behavior to hide missing inputs.
After those preparation steps, the full site build passes with no public-text
errors or private-data findings. Nothing was uploaded or deployed.

Every final candidate must pass the release matrix on its exact commit; earlier
RC, native or account receipts cannot qualify these changed package bytes.

Hosted startup, hostile-job isolation, real identity-provider sign-in, account
controls, tenant storage, production deployment and directory submissions retain
their separate outstanding gates. Stable package progress does not accept them.
