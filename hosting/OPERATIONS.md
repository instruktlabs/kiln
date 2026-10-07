# Hosted operations and alert qualification

This is implemented locally, not deployed or monitored yet. The complete
deployment builder emits a gateway `OPERATIONS` Analytics Engine binding and a
hashed `monitoring-candidate.json`. Its six alert queries are candidates for
provider validation; none has an enabled destination or delivery receipt.

## Data collected

Only the gateway writes the dataset named `<deployment_prefix>_ops`, replacing
hyphens with underscores. It records one explicit point per completed HTTP
handler and two points after each scheduled recovery run. No request/response
object, body, arbitrary URL, IP, identity, credential, exception or download ticket
is passed to Analytics Engine. Invocation logs, traces and Container logs remain
disabled. This does not describe all provider-managed operational records.

Every point has `blob1 = kiln.ops.v1` and `double1 = 1`. Remaining columns are:

| Kind / index | blob2 | blob3 | blob4 | double2 | double3 | double4 | double5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `http` | http | fixed route class | HTTP status | elapsed ms | unused | unused | unused |
| `health:deletion` | health | deletion | ok/unavailable | pending jobs | oldest age ms | jobs at least 15 minutes old | recovery handler succeeded: 1/0 |
| `health:compute` | health | compute | ok/unavailable | paused: 1/0 | active requests | pending cleanup | concurrency limit |

Route classes reuse the bounded ingress categories. HTTP elapsed time ends when
the handler returns its Response; it does not measure complete browser download
or model response latency. HTTP 200 does not prove a successful MCP tool result,
artifact quality or rendering fidelity. Provider CPU/VM/storage usage remains
separate cost evidence.

Deletion health reads primary D1 using indexed phase selection. Compute health is
a read-only RPC returning aggregate admission state, with no tenant IDs or pause
control. Both reads run independently with two-second deadlines. Failed or invalid
reads emit `unavailable` and numeric `-1`, never healthy zero. Failed recovery or
unavailable component health also fails the scheduled invocation with a fixed
message. A telemetry write failure cannot change authorization, returned bytes or
cleanup. Missing telemetry must be caught by external heartbeat alerts.

The write API is asynchronous; a successful local call is not proof of ingestion.
Cloudflare documents three-month retention and adaptive sampling. Keep these
aggregate records distinct from the saved-asset and seven-day unsaved policies.
[Writing points](https://developers.cloudflare.com/analytics/analytics-engine/get-started/),
[retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/).

## Alert candidates

The builder emits six queries scoped to the exact account and
`events.analyticsEngine.<dataset>`, each returning one numeric `value`. They use
a five-minute lookback, proposed one-minute evaluation and hourly repeat interval.

| Candidate | Trigger | Initial operator action |
| --- | --- | --- |
| Deletion heartbeat | No healthy successful recovery observation | Check Cron Trigger, deployed version, D1 and ingestion availability |
| Compute heartbeat | No available compute observation | Check binding and admission state; preserve active cleanup evidence |
| Deletion overdue | An observation reports a deletion at least 15 minutes old | Inspect the private recovery job and phase; do not claim completed deletion |
| Compute cleanup | At least three observations report pending cleanup | Pause expensive work through the private operator; investigate VM shutdown |
| Gateway errors | At least five HTTP 5xx responses | Separate upstream identity/storage/native failures before changing limits |
| Gateway rejections | At least 100 HTTP 429 responses | Inspect legitimate demand versus abuse; preserve compute quotas |

These are initial tuning proposals, not an SLA. Counts in sampled data are
estimates, and the cleanup observations need not be consecutive. Heartbeat
queries intentionally aggregate without grouping: an empty interval must yield
zero rather than no result. Confirm that behavior in the actual query preview.

The current Cloudflare Custom Alerts beta supports account-scoped Analytics SQL
queries. This dialect automatically applies supported sample weights; do not
paste legacy Analytics Engine queries with `_sample_interval` into it. Catalog,
plan access and query validation still need live verification for this account.
[Custom Alerts](https://developers.cloudflare.com/notifications/notification-available/#custom-alerts-beta),
[Analytics SQL dataset rules](https://developers.cloudflare.com/analytics/sql-api/datasets/#workers-analytics-engine-datasets).

Before public launch:

1. Read back the gateway dataset binding and recurring trigger. Deploy the
   admission health RPC before the gateway that calls it. Missing old RPC support
   is an unavailable observation, not a passing health check.
2. Query the account catalog with `cf analytics sql introspection get --account-tag <account-id>`
   using authorized Account Analytics Read access. Discover the exact dataset
   after a bounded synthetic request and scheduled invocation produce points.
   For SQL queries that already contain `accountTag`, do not also pass a request
   scope: the current API rejects duplicated tenancy predicates. Use timezone-aware
   ISO 8601 literals for fixed timestamp windows.
3. Preview each prepared query and verify normal, unavailable, empty-window and
   delayed-deletion cases. Tests currently validate the local schema and query
   construction, not remote query execution or sampling behavior.
4. Configure an owner-approved operational destination and these thresholds in
   Custom Alerts. Read back the enabled settings and prove both alert and recovery
   delivery. Never assume a configured query will notify anyone. No operational
   email or webhook has been sent by this implementation.
5. Also configure provider billing/usage alerts and an independent public endpoint
   check. A Cloudflare-wide outage can affect both service and Cloudflare alerts.
   Provider alerts do not impose a spending cap. Keep private pause/restore and
   retirement-safe rollback procedures available during an outage.

## Expected telemetry volume

At one successful scheduled run per minute, the two health points total 86,400
per 30-day month, plus one point per HTTP invocation that reaches a response.
For example, one million HTTP requests yields about 1.0864 million points.
Six alert queries every minute would be 259,200 evaluations per 30-day month;
confirm Custom Alerts entitlement and charging separately from the data API.

Cloudflare currently publishes 10 million included monthly writes and one million
read queries for Workers Paid, then $0.25/million writes and $1/million reads;
the page also says charging has not started yet. Treat those as planning rates,
not proof of the account's bill. Verify current billing at deployment and include
other datasets' usage. [Pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/).

## Private ingestion evidence, October 7

The account catalog exposed `events.analyticsEngine.kiln_private_lifecycle_v1_ops`
after the approved lifecycle trial. A scoped query returned the expected fixed HTTP
route/status categories, including 401, 404, 413 and 429. All six prepared alert
queries executed successfully. Their empty five-minute windows returned a numeric
zero row, so heartbeat absence can produce a threshold signal rather than no row.
The private candidate deliberately had no Cron; this does not prove successful
scheduled health ingestion, Custom Alerts eligibility, notifications or recovery
delivery. No alert was created or message sent by these read-only checks.

Receipts are `analytics-*.json` under `.cache/lifecycle-cleanup-4b3dc62/`.
See the [trial result](../docs/reviews/2026-10-07-private-lifecycle-result.md).
