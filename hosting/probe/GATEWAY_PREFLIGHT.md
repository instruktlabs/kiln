# Private gateway qualification stage

This is a locally qualified component of the next combined provider trial, not
a deployed trial or a renewed spending allowance. The earlier `c755434` trial
is complete and its allowance remains consumed.

`gateway-preflight.ts` runs thirteen fixed checks through the actual gateway,
OAuth helper, primary D1 account/connection authority, tenant SQLite/R2 storage,
and admission service. It first pauses native admission and leaves it paused.
Discovery runs on the gateway; no step submits a native tool call. The current
entrypoint is a local test fixture only. A private operator deployment, bounded
execution/observation procedure and updated native phase still need preparation.

The local fixture derives service and resource bindings from `deploymentConfig`,
then bundles all six production Worker entrypoints separately. It adapts declared
DO exports to local namespace registration. It does not attach Container images,
deliver Analytics Engine points or run Cron Triggers. The default HTTP handler
on the separate test driver returns 404.

| Check | Evidence required |
| --- | --- |
| Fresh resources | Empty accounts, OAuth KV and artifact bucket; refuse existing data |
| Pause native | Actual control RPC reports paused admission with no active work or pending cleanup |
| Metadata | Protected-resource metadata names the configured MCP audience |
| Synthetic accounts | Distinct permanent accounts, real registered clients, PKCE code exchange and primary connection activation |
| Anonymous denial | Unauthenticated MCP receives 401 |
| Edge discovery | A valid token can list the actual advertised MCP tools while compute is paused |
| Oversized denial | An authenticated oversized body receives 413, followed by a successful ordinary request |
| Storage fixture | Fixed routing-test files retained through the private tenant API and a download ticket issued |
| Bearer isolation | Owner receives exact source bytes; another account with a forged tenant header cannot read them |
| Browser isolation | Owner session receives exact bytes; another browser session is denied and an anonymous HEAD receives 401 |
| Connection revocation | Primary D1 revokes the owner's app connection while its OAuth token remains in KV |
| Revoked token denial | Old bearer and refresh credentials are rejected; the separate owner browser session still works |
| Other account | Its MCP discovery still works and it still cannot read the owner's file |

The synthetic identity module refuses any origin other than
`https://kiln-private-qualification.invalid` and requires the explicit
`isolated-synthetic-v1` mode. This origin is used only inside service-bound
requests, with no DNS or public route. No Google/GitHub application, provider
credential or upstream exchange is involved. Synthetic account subjects are
fixture labels, not claims about actual GitHub users. The helper bypasses
upstream identity verification to set up the private fixture; the unchanged
gateway still verifies the resulting OAuth credentials and primary state.

Credentials remain inside the invocation. The durable receipt contains only
stage names, outcomes and compute-pause state; no account IDs, cookies, tokens,
download capabilities, source, response bodies or exceptions. A transaction
claims the sequence once before any setup. Repeated or concurrent calls read
that record; they cannot recreate accounts or retry a partial run. A process
interruption may leave a `running` receipt and temporary fixture data. That is
an incomplete run, not permission to reset its namespaces and start again.

Failure tests exercise a misbound gateway database, refusal of nonempty D1/KV/R2,
and refusal of the production origin. Failures stop at their first case and
retain a redacted receipt. Native admission remains paused once this stage has
touched it. These checks do not prove that a remotely supplied binding belongs
to the intended environment; independent inventory/readback is still required.

The stored files are manually seeded routing fixtures, not engine output. This
stage does **not** qualify rendering, engine save/provenance, materials, Google
or GitHub consent, browser account-action confirmation, deletion, retention,
scheduled recovery, approximate limiter behavior under load, alert delivery or
public-client transport. Those remain explicit parts of the combined trial and
launch verification. In particular, VM ceilings, response/evidence budgets,
deadlines, cleanup and exact-image receipts must be reviewed before requesting
another cloud execution allowance.
