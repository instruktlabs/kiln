# Private storage and scheduled recovery qualification

This candidate is prepared locally. It has not been deployed and does not qualify
live sign-in, public traffic, backup restoration or production readiness.

`prepare-deployment.mjs --private-operations` derives four private Workers from
the production configuration at fixed prefix `kiln-private-operations-v1` and
origin `https://kiln-private-qualification.invalid`. It rejects public targets,
altered quotas and combined diagnostic modes. Only the gateway retains the real
every-minute scheduled trigger. There are no routes, preview URLs, provider
credentials, Container applications or Container-bound Durable Objects.

The actual admission implementation is retained, with its request capability
replaced by a private `KilnNoExecution` object that always refuses execution.
Admission is paused before seeding. This structurally excludes VM starts; it is
not another native runtime test and cannot substitute for deletion during active
native work. The gateway bundle is the production entrypoint. Only the private
tenant subclass and operator include fixture helpers, and production build
boundaries continue to reject them.

## Fixed run

1. Claim the run once and set its ten-minute terminal alarm. Require an empty
   D1 account table, OAuth KV and R2 bucket, and paused idle admission.
2. Seed two fixed source records in a fresh retention tenant and pin one in a
   saved group. Verify the production-created timestamps differ by exactly seven
   days. Advance only those fixture expiry timestamps to the past, prove immediate
   unsaved read denial and saved read access, then schedule a real DO alarm.
3. Create two synthetic accounts and their actual OAuth grants, browser sessions
   and saved source files through the existing private qualification adapter.
   This bypasses upstream identity proof and does not qualify Google or GitHub.
4. Use the production deletion request to revoke the first account. Deliberately
   omit the immediate recovery call, simulating a handler interruption after
   primary revocation. The operator never invokes the gateway scheduled handler
   or the deletion recovery method. Its old access token must already fail, while
   the second account can list MCP tools without native dispatch.
5. Observe the retention alarm's completion, the unsaved R2 object's absence and
   the exact saved source. Remove the saved group through the production API and
   verify that its overdue object and source are gone too.
6. Wait for provider Cron to finish the deletion. Check the completed receipt,
   absent primary account, retired tenant, absent R2 prefix, continued old-token
   denial and the second account's unchanged saved source. A forged complete
   receipt alone cannot pass these checks.

Only aggregate booleans, fixed step names and timestamps leave the operator.
Synthetic credentials and deletion capabilities stay in its private state and
are removed on successful completion or stop. No source, account ID, token or
provider exception is returned. A stopped, failed or completed run cannot restart.
Observation is a separate private RPC: no public HTTP handler can start it.

`operations-observer.wrangler.jsonc` is a local-only facade on
`http://127.0.0.1:8799`. It binds only the private `KilnOperationsControl` entrypoint
and accepts POST `/begin`, `/status`, `/progress` and `/stop` with header
`X-Kiln-Operator: private-operations-v1`. Browser-origin requests, query parameters,
other hosts and arbitrary methods are refused; request bodies never become RPC
arguments. Do not deploy this observer. Its per-observation timeout does not
authorize restarting the durable run.

## Deployment and evidence

After exact-source CI, prepare a new directory under `.cache` with the approved
manifest. Review module/config hashes, all nine migrations, fixed identity and
empty external inventory. Provision a dedicated D1 database, OAuth KV, private R2
bucket and four Workers, in the emitted dependency order. Their four DO namespaces
must be new. There is no image upload or native start in this candidate.

Use separate explicit owner approval for the concrete temporary resources,
bounded storage/Worker spend, test execution and cleanup. An earlier consumed
native trial allowance cannot be reused. Read back exact active module hashes,
bindings, disabled HTTP/log surfaces, private bucket and scheduled trigger before
invocation. Store only sanitized provider records in the operator receipt.

New Cron configurations can take time to propagate. Before starting the one-use
run, require real successful scheduled health points in the candidate's Analytics
dataset and verify that their compute state is idle. Local simulated scheduled
calls are not acceptable deployment evidence. Start the run once; poll its same
durable status/progress until terminal. Its ten-minute deadline is shorter than
the synthetic access-token lifetime. Do not restart after an observation timeout.

Retain resource IDs, exact source/module hashes, initial empty inventory, actual
Cron and alarm evidence, receipt and final storage inventory. Stop the operator,
disable the gateway Cron, and remove only recorded disposable resources. Verify
all four Workers, four namespaces, D1, KV and R2 absent. Provider-managed aggregate
metric retention is separate. No alerts or external notifications are enabled by
this configuration.

## What remains separate

The local tests invoke the scheduled handler explicitly to check the integration;
only the future deployed run can establish actual Cron delivery. Accelerating
fixture expiry checks deadline behavior, not a literal seven-day soak.

D1/DO point-in-time restore, R2 backup consistency and retirement-safe rollback
remain separate work. Cloudflare documents DO PITR as unavailable in local
development, so a local stub cannot count as restore evidence. No restore method,
arbitrary SQL endpoint or caller-selected expiry was added to production.

References: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/),
[SQLite recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api).
