# Hosted recovery preparation, October 7, 2026

The maintenance gateway and [recovery runbook](../../hosting/RECOVERY.md) are
prepared separately from the frozen private operations candidate `37c962e`.
This work does not deploy a service, restore data, create resources or expand
that trial's scope. PR #153 and the separate operations trial remain subject to
their outstanding owner approvals.

The new gateway rejects every HTTP route with 503 while retaining the exact
production scheduled deletion/health handler. It does not accept cookies, bearer
tokens or provider callbacks during maintenance. Offline preparation emits only
this gateway, preserving binding identities and secret names while omitting
images, other Workers and migration files. It deliberately does not automate a
live version change. The generated no-route configuration must not be applied
over a live public gateway; an approved code-only operation must preserve live
routes, current secret references and external resources.

## Validation

- Observed focused failures before implementation: two missing-entry tests and
  six preparation/dependency-boundary failures.
- All 445 hosting tests passed, including actual workerd rejection of HTTP paths
  and methods with absent bindings and forbidden outbound access. The final
  focused rerun also checks the exact production token/download path names.
- All three hosting TypeScript configurations passed; all fourteen bundles built.
- Root frozen dependencies and runtime bundles rebuilt; hosting clean install
  reported zero known vulnerabilities. Root lint passed across 1,082 files.
- Gitleaks scanned the hosting source with full redaction and no allowlist bypass;
  no matches were found. No secret values were added to configuration or receipts.

Local logs are `.cache/maintenance-red.log`,
`.cache/maintenance-config-red.log`, `.cache/maintenance-green-final.log`,
`.cache/recovery-tests.log`, `.cache/recovery-typecheck.log`,
`.cache/recovery-build.log`, `.cache/recovery-lint.log` and
`.cache/recovery-secrets.json`. These are local evidence, not deployed proof.

A subsequent local transition test switches the actual gateway from normal code
to maintenance and back inside the same workerd deployment, keeping storage
identities and contents. The scheduled handler finishes the first account's
already-requested deletion during maintenance; after restoring normal code the
old token stays denied and the other account's primary record, valid access and
exact saved source remain intact. The five-test operations suite passes in
`.cache/maintenance-transition-test.log`. The expanded full hosting suite passes
all 446 tests in `.cache/recovery-transition-full-tests.log`; all three typechecks,
fourteen builds and root lint also pass in the `recovery-transition-*` logs. The
scheduled invocation is explicit and local; this is not provider rollback, Cron
or data-restore evidence.

## Security findings and remaining qualification

Cloudflare documents code rollback separately from connected storage. D1 Time
Travel and SQLite DO recovery operate independently; R2 durability does not
establish recovery of application-deleted bytes. An account database rewind can
undo an unlink, deletion or authorization epoch. A DO rewind can restore retired
tenant state, tickets or usage counters. The runbook therefore requires preserving
current security state and proving reconciliation before reopening access.

Maintenance keeps deletion Cron alive for code repair. A data restore instead
requires verified background-write quiescence, current-state preservation and an
undo path. The repository does not yet provide or qualify a consistent automated
cross-store restore or artifact backup. No recovery time/data-loss guarantee is
asserted, and the backup/restore launch gate remains open.

Real maintenance activation, compatible rollback, provider recovery, revocation
preservation, saved-byte integrity and cleanup need an independently prepared
bounded trial. The pending operations trial tests retention and Cron recovery,
not these additional operations. See the runbook's official sources and the
[deployment gates](../../hosting/DEPLOYMENT.md#ordered-deployment-and-launch-gates).
