# Hosted recovery and rollback

Status, October 7, 2026: maintenance code and offline preparation are implemented;
provider rollback and data-restore qualification remain launch gates. Nothing in
this runbook authorizes a deployment, restore, new cloud trial or data deletion.
The pending storage/Cron trial at `37c962e` is a separate frozen candidate and does
not test maintenance deployment or point-in-time recovery.

## Choose the recovery operation

| Failure | First action | What must remain current |
| --- | --- | --- |
| Gateway regression | Close HTTP access; select compatible gateway code | All data, bindings, secret versions and deletion recovery |
| Native execution or cleanup failure | Pause admission; close HTTP if necessary | Active job/child inventory, quotas and retirement records |
| Data corruption | Quarantine access and writes before any restore | Latest identity changes, revocations, deletion requests and permanent deny records |
| Provider outage | Keep access closed; retain evidence and retry only known-safe operations | Resource identities; an unavailable read is not an empty store |

Worker rollback changes code, not the contents of connected stores. Cloudflare
also restricts rollback across certain resource and Durable Object lifecycle
changes. A previously healthy version is not necessarily compatible with today's
schema or retirement rules. Use a reviewed forward repair when compatibility is
unproven. [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## Maintenance artifact

`src/maintenance-worker.ts` returns a constant 503 for every HTTP path and method,
including OAuth callbacks, registration, token exchange, account actions, MCP and
downloads. It sets `Cache-Control: no-store` and `Retry-After: 60`, accepts no
credentials and performs no HTTP-path storage, identity or compute operations.
The exact production scheduled handler remains installed, including deletion
recovery and aggregate health reporting. Deliberate maintenance responses do not
pass through normal HTTP telemetry; verify HTTP denial independently of health
heartbeats. A healthy recovery heartbeat does not mean the site is open.

Prepare from the verified production manifest with the pinned toolchain:

```sh
node hosting/scripts/prepare-deployment.mjs --maintenance \
  --manifest .cache/hosted-deployment-input.json \
  --output .cache/hosted-maintenance-candidate
```

This emits one gateway bundle/configuration, hashes and a receipt. It retains the
same binding identities, secret names and Cron configuration, and emits no images,
other Workers or D1 migration files. Modes cannot be combined. This preparation
does not create resources, mutate data or deploy code. The receipt's
`nativeExecutionPossible: false` describes this gateway's lack of request dispatch;
it does not certify shutdown of existing jobs or remove the compute binding used
by scheduled deletion recovery.

Like ordinary preparation, the configuration has empty routes and disabled
workers.dev/preview URLs. **Do not deploy that configuration over a live gateway
as an incident command.** Prepare a code-only version operation from the actual
live bindings, secret references and routes, preserving those settings. Obtain
approval for that concrete operation. The repository does not yet automate or
qualify this provider operation. Do not read secret values into receipts.

## Code rollback procedure

1. Record current Worker deployment/version IDs, module hashes, routes, Cron,
   binding targets, DO namespace/class identities, container image digests and D1
   migration version. Record secret names/version references only. Confirm the
   selected fallback's compatibility with these exact resources and current data.
2. Through the separately authorized private operator, pause admission. Verify
   paused state and account for every active request, child VM and pending cleanup.
   Unknown cleanup retains capacity; do not clear records or create fresh
   namespaces to obtain an idle result. The public gateway has no pause control.
3. Activate the reviewed maintenance gateway for all traffic. Verify 503 on public
   and authenticated MCP, callback, account and download paths, with no redirects
   or cookies. Existing work may outlive the gateway change: observe verified
   whole-instance shutdown before changing its controllers or data.
4. Keep deletion Cron and tenant/admission alarms running for a **code-only**
   repair. Select one compatible fallback version per affected Worker, respecting
   service contracts and dependency order. Never select code predating permanent
   retirement checks, primary account/epoch checks or current identity semantics.
   Keep the exact original origin: tenant IDs include the origin and account ID.
5. Read back the actual active versions, module hashes and bindings. Verify no
   D1/DO/KV/R2 identity or contents were rewound by the code operation. Test an old
   revoked token, a retired tenant, another account's saved source/GLB hashes and
   scheduled cleanup before admitting new work.
6. Restore the qualified gateway version and admission only after the evidence is
   accepted. Verify the actual public route and real client lifecycle. Retain the
   maintenance and fallback version IDs with the resulting incident receipt.

Do not use a traffic split as proof of an atomic multi-service rollback. Different
Durable Objects may run different versions during gradual deployment, so both
sides of every service boundary must be compatible throughout the transition.
[Durable Object deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/).

## Data protection and restore limits

| Store | Protection available | Restore constraint |
| --- | --- | --- |
| Account D1 | Provider Time Travel: 30 days on Paid, 7 on Free | Database only; rewinding can undo revocations, identity changes and deletions |
| Tenant/admission SQLite DOs | Provider PITR of the entire object's SQL and KV state for 30 days | Per object; rewinding may resurrect download tickets, usage or retired tenants |
| OAuth KV | Expiring protocol records; primary account/epoch checks remain authoritative | No credential backup/replay is assumed; keep old grants denied |
| Artifact R2 | Provider durability plus application checksums | Durability is not an application backup or proof of deleted-object recovery |
| Images/source/Worker bundles | Pinned digests and release/candidate receipts | Code recovery cannot reconstruct lost user-authored sources |

D1 Time Travel is currently an in-place restore, not a clone/fork facility. It
cancels in-flight queries and returns an undo bookmark. Capture the current
bookmark before mutation and retain the returned one privately.
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

SQLite DO PITR requires a restore bookmark and an object restart, applies to the
whole object, and is unavailable in local development. A Miniflare test therefore
cannot establish provider restore success.
[DO storage recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api).
R2's published durability target does not establish a Kiln recovery point or
undelete mechanism. [R2 durability](https://developers.cloudflare.com/r2/reference/durability/).

There is currently no qualified consistent backup/restore across D1, DOs, KV and
R2, no automated artifact backup, and no measured recovery-point or recovery-time
commitment. Saved-until-deleted is the active storage policy, not a promise of
recoverability after corruption. Do not mark the backup/restore launch gate passed
from provider retention alone. Any added backup retention and deletion handling
must be reviewed against the public privacy policy before implementation.

## Quarantined restore procedure and remaining gate

This is a procedure to qualify, not an implemented one-command restore:

1. Close HTTP and pause compute as above. A data restore additionally requires
   quiescing scheduled recovery and all affected background writes. The ordinary
   maintenance gateway deliberately keeps Cron alive and is **insufficient** for
   this step. Prepare and verify the exact temporary trigger/alarm controls and
   shutdown evidence before restoring anything.
2. Preserve a current protected snapshot of security state: account identity
   links, epochs, connection revocations, pending deletions and tenant/compute
   deny records. Preserve current resource IDs, bookmarks, schema and object
   inventories. Keep account data and snapshots out of Git, logs and public
   receipts. If this state cannot be recovered reliably, keep access closed.
3. Rehearse on disposable synthetic resources first. For an actual in-place
   restore, explicitly authorize the exact resource/bookmark and retain an undo
   path. Do not interpret a D1 restore as restoring DOs or R2 to a common instant.
4. Before any client access, reconcile current security state against restored
   data. Never re-enable a removed identity, old token, deleted account or retired
   tenant. Reset affected sessions/grants with current primary authorization
   state. A re-login alone cannot repair an incorrectly resurrected identity link.
5. Check each retained source/GLB against its revision metadata and stored digest;
   quarantine missing, mismatched or orphaned records. Do not silently report an
   empty account or substitute a different revision. Preserve user-visible loss
   evidence when bytes cannot be recovered.
6. Resume deletion/retention recovery privately and verify its actual triggers,
   stale-token denial and two-account separation. Reopen only after the restored
   service passes those checks and the owner accepts the recovery evidence.

Before launch, qualify both a real code rollback and a bounded provider restore
with synthetic identity changes, deletion and artifact revisions. Record data
loss, restore duration, revocation preservation, cleanup and actual provider
costs separately. The existing private retention/Cron trial does not supply this
evidence, and its allowance must not be reused for another trial.
