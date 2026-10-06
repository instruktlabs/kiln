# Private Cloudflare availability probe

This is a disposable operator probe, separate from every production bundle and
the npm package. It is prepared locally; it has not been deployed or approved.
The first stage answers whether the account can run the selected native image and
whether basic network/filesystem/whole-VM cleanup checks work. It does not qualify
the hosted service for launch.

## Exact scope

- Worker `kiln-private-evaluation-probe`, with no custom domain, route, workers.dev
  URL or version preview URL. Its HTTP handler always returns 404.
- One SQLite coordinator namespace and one container-backed job namespace in the
  same Worker; no external service, credential, storage or identity bindings.
- Container application `kiln-private-evaluation-probe-jobs`, using Cloudflare's
  `durable_object` scheduling policy, SSH disabled, no snapshots, and no container
  log collection. The controller starts each image with internet disabled.
- Five fixed jobs, sequentially: two installed-engine box fixtures, direct native
  TCP/DNS reachability checks, a file plus live detached child, and a fresh VM
  checking that neither marker nor child is visible. The native checks bypass the
  JavaScript sandbox deliberately so they test the provider boundary.
- Each job uses the production controller's 60-second deadline, durable alarm,
  output bounds, immutable image check and awaited whole-VM destruction. The
  probe stops at the first failure. No user may supply source or a command.
- A temporary five-minute cron invokes the coordinator. A durable transaction
  claims the entire run once; concurrent, later and interrupted runs cannot
  silently start another batch. Later triggers only report retained state.
- Read fixed result metadata through authenticated Workers logs. Never log source,
  arbitrary native output, identity records or credentials. Remove the cron,
  Worker, probe namespaces and container application after retaining receipts;
  remove the trial registry image once it is no longer needed. Do not remove any
  existing application or resource.

The five-job budget is enforced in application state: the new scheduling policy
does not support `max_instances`. There is no public invocation path. A controller
failure requires investigation, not an automatic new run ID or a budget reset.

## Local image and preparation

The local image is `kiln-evaluation:rc1-local`, Linux amd64, immutable ID
`sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a`.
Its four-file context uses the approved public RC archive with SHA-256
`f2de7eb69f6e16dd618c77249b1f46eda1b5d032789f5b0d9048b2b2a08ea8c2`.
Two local fresh-container evaluations passed with identical 1,912-byte GLBs,
matching the independently built Linux CI fixture. Receipts and resolved dependency
inventory are retained under `.cache/evaluation-image-local-evidence/`.

`scripts/build-provider-probe.mjs` bundles the reviewed source, validates its
private configuration with pinned `@cloudflare/config@0.23.0`, and prepares Build
Output for `cf@1.0.0-beta.12`. It never uploads or deploys. Pass `--cf-package`,
`--account`, `--image` (managed-registry digest reference) and `--output` explicitly.
From that output directory, `cf deploy --prebuilt --dry-run` must succeed before
approval. Do not rebuild or substitute an image after approval: verify the local
image ID, use `cf containers push --tag kiln-evaluation:rc1-local`, and bind only
the returned digest for those verified bytes. Retain the Worker bundle hash and
final registry digest alongside the deployment/version/application IDs.

The probe uses documented `ctx.exports` loopback namespaces. This also avoids a
cf beta.12 dry-run validation problem: explicit same-Worker bindings are converted
to `script_name`, which the container validator rejects as a foreign Worker.
No CLI internals or production isolation controls were patched. Local workerd
verified loopback calls, absent-container refusal, retained failure and HTTP denial.

## Cost and remaining gates

At the documented rates on 6 October, five jobs occupying `standard-2` (1 vCPU,
6 GiB memory, 12 GB disk) for 65 seconds each cost roughly **$0.012** in metered
container CPU, memory and disk before included allowances. This deliberately
assumes a fully busy CPU throughout. Worker/DO/log charges are additional and tiny
at this volume; existing applications share included usage. Reserve **up to $1**
for this bounded trial, including image/storage overhead. This is an estimate, not
a provider-enforced dollar cap. Keep the operator present, inspect unexpectedly
running instances, and stop the trial on failure. Existing Workers Paid is reused.

Subsequent qualification still requires CPU preview rendering, software Vulkan,
memory exhaustion, output floods, infinite-loop and cancellation races, alarm
recovery after controller interruption, cold-start/cost measurements and actual
authenticated MCP plus storage integration. Passing this availability stage does
not remove those launch gates.

Sources: [native container API](https://developers.cloudflare.com/containers/api/durable-object-container/),
[scheduling policy](https://developers.cloudflare.com/containers/configuration/scheduling-policy/),
[pricing](https://developers.cloudflare.com/containers/platform/pricing/),
[loopback bindings](https://developers.cloudflare.com/workers/runtime-apis/context/#exports),
[cf prebuilt deployment](https://developers.cloudflare.com/cf/projects/#deploy-a-prebuilt-build).
