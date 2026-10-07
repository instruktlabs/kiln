# Hosted deployment preparation

This prepares the complete service locally. It does not provision resources,
upload images, store credentials, configure DNS or deploy a Worker. The generated
configuration exposes no HTTP route, workers.dev address or preview URL. It is
not a launch approval or proof that production is ready.

## Build a reviewable candidate

Use the pinned maintainer Node toolchain and installed `hosting/` dependencies.
Copy `deployment.example.json` to an ignored local manifest. Its placeholders are
intentionally invalid. Fill it only with verified non-secret resource IDs,
account-owned registry digests and reviewed numeric quotas. Never add a client
secret or token; unknown fields are rejected without echoing their values.
The example's nine-request limits are for qualification planning, not public
launch quotas or a VM-start allowance. A paid run needs its own bounded candidate
and approval, including child starts and cleanup.

From the repository root:

```sh
node hosting/scripts/prepare-deployment.mjs \
  --manifest .cache/hosted-deployment-input.json \
  --output .cache/hosted-deployment-candidate
```

The parent directory must already exist inside `.cache`; the output must be new.
Existing or partial outputs are never overwritten. The command bundles actual
production entrypoints, checks their dependency boundaries and exported classes,
copies all numbered D1 migrations, and records SHA-256 hashes. The receipt records
the source commit and whether the checkout was dirty. A dirty receipt cannot be
treated as exact-release source qualification. It also does not attest that the
specified cloud resources exist, belong to this deployment, or contain the
expected image bytes; verify those separately before deployment.

Outputs include Cloudflare Build Output plus six equivalent `*.wrangler.json`
files and `deployment-receipt.json`. Both use pinned `@cloudflare/config@0.23.0`.
Its API is currently unstable, so changes require renewed validation. The Wrangler
conversion corrects only local DO self-bindings; cross-Worker bindings retain their
explicit target. Use a tested CLI and `--no-bundle` to deploy the reviewed bytes.
Wrangler `deploy --dry-run --no-bundle --config <file>` checks configuration locally;
it does not verify remote bindings, image availability, secrets or permissions.

## Service boundaries

| Role | Private capabilities | Public entrypoint |
| --- | --- | --- |
| Gateway | Account D1, OAuth KV, four provider secret names, owning tenant DOs, `KilnCompute` | None in prepared output |
| Tenant | Private R2 and tenant SQLite quotas, saved assets/materials, downloads and retirement | None |
| Admission | Global admission SQLite and native request DOs | None |
| Request | Tenant storage, fresh evaluation/render DOs and three host-bound interceptors | None |
| Evaluation | Pinned software image, evaluator DO and whole-VM cleanup | None |
| Render | Pinned software image, renderer DO and whole-VM cleanup | None |

Only the gateway declares `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; their values must be provisioned
through the provider's secret mechanism, never committed or copied into this
manifest. No gateway binding exposes `KilnComputeControl`; a separately authorized
private operator is needed to pause/resume and inspect admission.

Coordinator/evaluation/render use immutable account-owned registry references.
The runtime selects the established `standard-1` coordinator and `standard-2`
child profiles, deadlines and disabled native internet access. The manifest cannot
choose arbitrary entrypoints, internet settings or instance classes. SSH and
Container logs remain disabled. Application resource identity and runtime network
denial still require provider readback and a real trial.

Gateway URLs may contain OAuth codes or private download capabilities. The
prepared Workers disable persistent invocation logs and traces and request query
redaction. These settings do not establish a complete observability plan or
absence of provider-managed operational data. Public launch still needs sanitized
aggregate metrics and alerts, without source, identity or credential payloads.

## Ordered deployment and launch gates

1. Qualify the exact source in CI and record the engine archive, coordinator image,
   software image, every Worker/config hash, migrations and resource inventory.
   Provision approved isolated resources separately and read their ownership back.
2. Apply the D1 migrations to the intended database, after checking identity
   uniqueness and backup/restore handling. Configure provider clients with exact
   approved callback URLs and secret bindings only on the gateway.
3. Deploy tenant, evaluation and render, then request, admission and gateway, in
   that dependency order. Read back all external namespace/service links. Deploy
   retirement-aware services before accepting deletion; drain older work first.
4. The gateway configuration includes an every-minute Cron Trigger. Read back the
   deployed trigger and verify recovery after an interrupted deletion. Track the
   oldest pending job, failures and unresolved writes; the source handler alone
   does not prove that scheduled recovery operates.
5. Complete bounded private qualification of the newer evaluator identity,
   materials, browser downloads, link/unlink/delete, quotas, retention and cleanup.
   Verify live Google/GitHub consent and real MCP clients separately. The earlier
   `c755434` receipt covers only its recorded code and scope.
6. Before public exposure, qualify ingress abuse protection, representative
   load/costs, operational alerts, backup retention/restore, privacy/support pages
   and rollback. Cloudflare's edge rate-limit binding is local and approximate;
   it must not replace global compute admission or be represented as a billing
   cap. Review public quotas and the final cost model with the owner.
7. Prepare the exact gateway route change at `kiln.instruktlabs.com` for approval.
   Do not infer permission from preparation or an earlier private-trial allowance.
   Following approved deployment, verify deployed identity, live lifecycle and
   two-user separation before directory submission.

Rollback must preserve primary account revocation and permanent tenant retirement.
Do not restore pre-deletion code or a backup that reactivates retired accounts;
pause access and reconcile first. Existing private data must never be silently
replaced with fresh namespaces to obtain a passing check.

Current references:
[Cloudflare configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[Rate-limit scope and accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
