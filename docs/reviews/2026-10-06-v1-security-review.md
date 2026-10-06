# Kiln v1 adversarial security review

This is an in-progress release record, not security certification or hosted-launch
acceptance. The owner explicitly requested adversarial review before publication
of the hosted service. Review the final source, artifacts and live configuration
again when the production candidate exists.

## Boundaries and adversaries

- Treat anonymous OAuth clients, authenticated tenants, model-authored JavaScript,
  uploaded records and native evaluator output as untrusted.
- OAuth credentials belong only to the gateway's managed secret bindings. Tenant
  storage and native jobs must receive neither provider tokens nor cloud API keys.
- Select tenants from verified Kiln identity, never a request body, email address,
  model instruction or a container-supplied owner header.
- A new disposable provider VM is the native execution boundary. Node `vm`, a
  Linux user ID, a process timeout and local Docker fixture success are not that
  boundary. The external controller must enforce deadlines and destroy the VM,
  including children, before accepting its output or releasing admission.
- Registry source, archives, plugin bundles, images, CI artifacts and logs are
  public or may become public. Keep source, user assets and credentials out of
  operational error messages and qualification receipts.

## Findings and completed checks

| Check | Evidence on 6 October | Result and limits |
| --- | --- | --- |
| GitHub secret protections | Repository settings initially disabled secret scanning and push protection; both were enabled for `instruktlabs/kiln` only. A subsequent open-alert query returned `[]`. | Corrected configuration gap. No organization-wide policy, paid plan or validity-check setting was changed. An empty alert list is not proof that no unknown secret exists. |
| Local Cloudflare bindings | `.dev.vars`, `.dev.vars.*` and generated `.cloudflare/` were absent from `.gitignore`. Added ignores and kept only `.dev.vars.example` eligible for tracking. Root and nested paths were checked. | Prevents accidental staging; examples must contain placeholders. This does not remove anything already committed. |
| Git history | Gitleaks 8.30.1, `git --log-opts=--all --redact=100 --ignore-gitleaks-allow`: 484 locally available commits, 161.67 MB, no matching secrets. | Local reachable-history scan; not a claim about deleted remote history or every possible credential format. Raw values were never printed. |
| Published RC contents | Validated archive paths, extracted the exact approved `f2de7eb6…ea8c2` archive, scanned 24.07 MB with Gitleaks. | No matching secrets. A preliminary scan of the compressed file processed zero bytes and is explicitly excluded from evidence. |
| Hosted bundles | Five actual rebuilt production bundles and their build manifests, 402,232 bytes scanned with Gitleaks after the stream fixes. | No matching secrets. Build assertions exclude test/probe helpers and OAuth code from non-gateway bundles. These development bundles are not a production deployment. |
| Image build context | Four-file prepared context, 2,156 non-archive bytes scanned; its package archive is covered by the extracted RC scan. | No matching secrets. Full image-layer forensic inspection and final image qualification remain separate. |
| Production dependencies | `npm audit --omit=dev --ignore-scripts --json` for the hosting lockfile and actual registry-installed RC runtime. | Both report zero known vulnerabilities. Optional renderer and development dependencies are not covered by those two results. No automatic dependency mutation was performed. |
| Storage deadline | Two focused tests demonstrated successful completion after the configured deadline when readable-stream microtasks delayed timers. | Fixed by checking elapsed time when headers arrive and before/after each read; timeout aborts the request and cancels the body. Both tests failed before the fix. |
| Development image decoder | After #146 merged, GitHub identified `sharp@0.35.4` under development-only Miniflare. A full hosting audit reproduced the high-severity finding in sharp and its dependent Miniflare. | Applied a scoped Miniflare override to patched `sharp@0.35.5`, refreshed the npm lockfile and installed it with scripts disabled. The full hosting audit now reports zero vulnerabilities. All 112 hosting tests, typechecks, builds and root lint pass again. |
| Incoming body cancellation and streaming | Four additional failing tests covered an already cancelled request, continuously available chunks delaying timers, and reused read buffers in both transports. | Forward the incoming abort signal, check elapsed time during admission, cancel failed reads and copy bytes into a bounded growing buffer before the next read. Tiny or empty chunks no longer accumulate an array of retained views. All 116 hosting tests, typechecks, builds and root lint pass. |
| Engine maintainer dependency graph | The broader root Bun audit found eight affected transitive packages, including optional provider dependencies absent from the registry-installed runtime audit. | Updated named transitives within their declared dependency ranges, with install scripts disabled and no direct dependency changes. The root audit now reports zero known vulnerabilities. Rebuilt the Node bundles and build identity; typecheck, lint and 3,290 engine tests pass (two platform skips). |
| Renderer dependency graph | Full `npm audit --ignore-scripts --json` in `render-service/`. | Zero known vulnerabilities; distinct from renderer execution and provider isolation evidence. |
| Website dependency graph | Full Bun audit identified two high-severity packages and one moderate build-tool advisory. | Patched `http-cache-semantics` and `source-map-js` within their existing ranges. The remaining selector-parser advisory is recorded below, not dismissed or described as a clean audit. |

The storage and body fixes pass the focused source/asset integration tests, all **116 hosted
tests**, three TypeScript configurations, five production bundle builds and root
lint. It changes private hosting code, not the published RC or the deployed private
probe. No production service was deployed by these checks.

Local redacted reports and audit JSON are retained under
`.cache/security-review-2026-10-06/`. That ignored directory is not shipped or
committed. Record updated scans against the final candidate rather than treating
these development receipts as final release acceptance.

The development decoder finding is
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), indexed
by GitHub on 6 October. Remove the scoped override when the qualified Miniflare
version itself pins a patched decoder. This change affects the local/CI test
harness, not the already-published RC or native image. The GitHub default-branch
alert remains open until the reviewed fix lands; it was not dismissed. Full audit
receipts are `hosted-full-audit-before.json` and `hosted-full-audit-after.json`.

The root lockfile refresh updates `@hono/node-server` to 2.1.3, `fast-uri` to
3.1.8, `fast-xml-parser` to 5.11.2, `hono` to 4.13.13, `ip-address` to 10.7.3,
`protobufjs` to 7.6.6, `proxy-addr` to 2.0.8 and `qs` to 6.16.0, plus the required
XML parser children. The MCP SDK explicitly permits the new Hono server major
(`^1.19.9 || ^2.0.5`); its Node >=20 requirement fits Kiln's supported Node range.
These are maintainer-lock changes, not a claim that the immutable public RC has
changed. Receipts: `root-audit.json`, `root-audit-after.json`,
`render-service-full-audit.json`, `runtime-build.log` and `root-tests.log`.
The full coverage run also passes all 3,290 tests, with functions at **95.16%**
(minimum 94.00%) and lines at **92.50%** (minimum 92.10%). No threshold was lowered.
The rebuilt engine also passes all 116 hosting integration tests. Receipts:
`root-coverage.log` and `hosted-tests-rebuilt-engine.log`.

The site now resolves `http-cache-semantics@4.3.0` and `source-map-js@1.2.2`.
It still resolves `postcss-selector-parser@6.0.10` through the exact dependency
of the current `@tailwindcss/typography@0.5.20`. The
[moderate advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) concerns
synchronous parsing of attacker-supplied selectors in a request path; it explicitly
excludes ordinary build-time parsing of trusted sources. Kiln's website uses this
dependency during its static build and exposes no selector-parsing request
handler. This is a reachability assessment, not a patched dependency. Keep the
finding tracked until the upstream dependency can be updated and re-evaluate
before accepting user CSS or running an online CSS parser. Do not introduce a
forced major override merely to make the audit count zero.

Local site checks report 78 files with no errors, warnings or hints. Site tests
report 620 passes, two skips and two failures: Windows denied creation of file
symlinks (`EPERM`) in the deployment-preflight fixtures, before the assertions.
No security assertion was weakened and no workstation permission was changed.
The Linux website workflow `37498513008` passes at `abe5a445`, qualifying the
updated lockfile and those symlink assertions on the supported runner.
Receipts: `site-audit{,-after}.json`, `site-check.log` and `site-tests.log`.
The full local website build succeeds, including public-text checks and its
private-data scan (zero findings). This is a dependency compatibility check on a
dirty development tree, not a reviewed deployment candidate or a public content
update. The build was not uploaded. Its receipt is `site-build.log`.

### Private image layer scan

The exact private trial image (`sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a`)
was exported locally. An initial direct OCI-archive scan read only 15,437 bytes
of metadata; that is not layer coverage. All ten layer blobs and the image config
were then copied to an ignored scan directory with their correct archive types,
after verifying each blob against its SHA-256 name. No layer paths were extracted
into the host filesystem and no image links were followed.

The layer scan processed 80,577,025 bytes and reported six generic-key matches:
one in Node's public `v8-internal.h`, five in cached public `jose` registry
metadata. The complete header is identical to Node's official v22.23.3 source;
the complete parsed cache metadata is identical to a fresh public npm response.
All six therefore refer to public upstream content rather than Kiln credentials.
The report remains intact with full redaction; no broad suppression was added.

Fourteen archive-read diagnostics were examined individually. Thirteen were
symbolic links, which were not followed. One was an 83-byte plain-text dpkg
alternatives record with a misleading `.gz` suffix; a separate text scan passed.
This is a bounded text/recognized-archive secret scan, not analysis of arbitrary
binary contents or proof against unknown credential formats. The final production
image still needs its own scan and qualification. Receipts:
`native-image-layer-inventory.json`, `native-image-layers-redacted.json`,
`native-image-findings-triage.json`, `native-image-scan-errors.json` and
`native-image-fallback-redacted.json`.

## Reviewed controls and required live evidence

The current code uses verified provider subject IDs, primary-consistent account
status/authorization epochs, PKCE, resource binding, one-use login intents,
provider-bound callbacks, browser-origin checks and an explicit consent page.
Accounts are not linked automatically by matching email. GitHub asks for no
repository scope. Google ID tokens are verified by `oauth4webapi`; provider tokens
are used for sign-in and discarded. Gateway-to-tenant forwarding excludes bearer
tokens, cookies and identity-provider credentials. These are implementation
observations, not a claim that live sign-in is already qualified.

Before hosted launch, retain evidence for:

1. Google and GitHub real sign-in, client consent, PKCE/resource mismatch, state
   replay, provider mix-up, denied authorization and malicious redirect attempts.
2. Browser account/session controls, explicit provider linking with fresh proof
   of both identities, connection revocation, account deletion and cross-region
   denial after account status or authorization epoch changes.
3. Cross-account source, saved revisions, material closure and download access;
   expiry/deletion, interrupted writes and storage/account quotas under concurrency.
4. Native provider network denial, fresh filesystem/process state, cancellation,
   deadline/output/memory exhaustion, cleanup failure recovery and fixed immutable
   image identity. Keep tests bounded and inside the approved disposable trial.
5. Global registration and compute admission limits, request body/stream limits,
   safe errors and logs, and operational cost/abuse controls under load.
6. Final archive/plugin/image/build-log scans, scoped managed secrets, repository
   protections, release environment review and actual publishing provenance.

## Current primary guidance

Checked on 6 October 2026:

- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/):
  use secret bindings and ignored local binding files; never put secret values in
  committed configuration or ordinary `vars`.
- [Cloudflare native Container API](https://developers.cloudflare.com/containers/api/durable-object-container/):
  `user` is numeric `uid:gid`; with the `durable_object` policy it does not restrict
  Linux capabilities. Output buffering counts against Worker memory. Preserve the
  VM boundary and bounded stream handling outside untrusted execution.
- [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
  and [Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets):
  scanning, push protection and secret-safe workflow design are complementary.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): preserve the
  existing scoped OIDC publishing configuration instead of adding a long-lived
  npm token. Registry staging, maintainer approval and public promotion remain
  separate steps in this repository's release runbook.

## Browser account continuation

The separate account-controls branch now has locally tested direct sign-in,
browser sessions and logout. Review checked fresh random credentials, hashed
storage, host-only Secure/HttpOnly cookies, idle and absolute expiry, session
rotation, current primary account/epoch checks, origin and CSRF validation,
single-use login state and provider/browser binding. A concurrent callback test
admits exactly one exchange; expired, swapped or stolen callbacks make no provider
request. Database-failure fixtures verify rollback. Sign-in state is capped at
4,096 pending rows, which is a storage safeguard rather than a public rate limit.

The session-cap review found that replacing one browser's session could prune
another device unnecessarily. A focused test failed first; deletion of the old
browser token now precedes cap pruning in the same transaction. All nine session
tests and 34 authentication tests pass. The complete hosted suite passes 138 tests.
Signing out of the browser leaves MCP grants intact; MCP cookies and bearer tokens
are never interchangeable. No test-only issuance endpoint enters production.

Extracting the GitHub adapter exposed a gap in the build guard: a future accidental
import could evade its old `auth.ts` filename check. Two tests build the actual
GitHub/account-page dependency graphs and first demonstrated that gap. The guard
now rejects those provider and browser modules from every non-gateway bundle,
including paths reported with Windows separators. All five actual production
bundles pass the guard.

These controls follow the current [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
This does not yet qualify sensitive account actions: fresh provider responses do
not necessarily prove a fresh password or MFA challenge. Explicit linking,
connection revocation, account/asset deletion, public admission limits and deployed
cross-region/user tests remain launch gates. Local screenshots establish only the
account page's desktop and mobile layout.

## Acceptance

Open. Secret hygiene and a passing local test suite do not establish secure public
hosting. Stable publication and production deployment still require their concrete
reviewed candidates and the owner's existing release approvals.
