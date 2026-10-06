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
| Hosted bundles | Five actual rebuilt production bundles and their build manifests, 399,777 bytes scanned with Gitleaks after the deadline fix. | No matching secrets. Build assertions exclude test/probe helpers and OAuth code from non-gateway bundles. These development bundles are not a production deployment. |
| Image build context | Four-file prepared context, 2,156 non-archive bytes scanned; its package archive is covered by the extracted RC scan. | No matching secrets. Full image-layer forensic inspection and final image qualification remain separate. |
| Production dependencies | `npm audit --omit=dev --ignore-scripts --json` for the hosting lockfile and actual registry-installed RC runtime. | Both report zero known vulnerabilities. Optional renderer and development dependencies are not covered by those two results. No automatic dependency mutation was performed. |
| Storage deadline | Two focused tests demonstrated successful completion after the configured deadline when readable-stream microtasks delayed timers. | Fixed by checking elapsed time when headers arrive and before/after each read; timeout aborts the request and cancels the body. Both tests failed before the fix. |

The storage fix passes the focused source/asset integration tests, all **112 hosted
tests**, three TypeScript configurations, five production bundle builds and root
lint. It changes private hosting code, not the published RC or the deployed private
probe. No production service was deployed by these checks.

Local redacted reports and audit JSON are retained under
`.cache/security-review-2026-10-06/`. That ignored directory is not shipped or
committed. Record updated scans against the final candidate rather than treating
these development receipts as final release acceptance.

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

## Acceptance

Open. Secret hygiene and a passing local test suite do not establish secure public
hosting. Stable publication and production deployment still require their concrete
reviewed candidates and the owner's existing release approvals.
