# Private integrated MCP trial

Prepared on 6 October 2026. **Not deployed or authorized to run.** All 22 earlier
approved jobs are consumed. This candidate needs a separate owner approval after
its exact-source Linux and Windows hosted checks pass.

## What this qualifies

One fixed sequence through production admission, the installed MCP coordinator,
host-owned HTTP interceptors, fresh evaluator/renderer VMs and private tenant
storage. The scene is a public red/green textured cube and blue metallic sphere.
It contains no user content, provider credentials or OAuth clients.

| Step | Required result |
| --- | --- |
| Render | Actual MCP `kiln_render`, 1x1 preset at its default size, full-material fidelity and image content |
| Save | Exact retained source saved with the default material preview |
| Restore | A fresh coordinator restores the exact saved revision/program reference |
| Source | Exact authored source recovered through a fresh request |
| Export | The saved revision exports successfully |
| GLB | Saved GLB resource has the binary glTF header |
| Manifest | Saved identity and full-material preview metadata agree |
| Other account source | The second synthetic account cannot read the first account's source |
| Other account GLB | The second synthetic account cannot read the first account's GLB |
| Quota | The tenth request receives HTTP 429 without starting a coordinator |

Nine requests can be admitted. The normal fixture is expected to start nine
coordinators, two evaluators and two renderers. The separate durable allowance
permits **at most nine coordinator, four evaluator and four renderer starts**
(17 total). A failed start consumes its claim; no refund, reset or replay can
start additional work. Requests run sequentially with one active child per parent.
Any failed assertion stops the sequence. Terminal cleanup closes the allowance
and pauses production admission. A private operator can also stop it early.

The saved manifest's engine identity is recorded, not accepted as verified
provenance. The native host currently lacks an injected evaluator identity and
may report `source-development:unverified`. That is a separate launch blocker.
This trial does not qualify OAuth, account controls, public downloads, production
load, settled billing or vendor submissions.

## Immutable candidate and privacy

- Coordinator image: `sha256:029c4fba6f0521a5a18c9dde364d07b5ffc076fe4d988358868950de40134b66`.
- Evaluation/render image: `sha256:64022900f0c298668076db054c44e019dad6a3813751a92dec7a06ceb734fe24`.
- Both install the exact published `@instruktlabs/kiln@1.0.0` archive.
- Worker: `kiln-private-integrated-v1`; three Container applications append
  `-coordinator`, `-evaluation` and `-render`.
- Seven SQLite Durable Object classes; one disposable private R2 bucket,
  `kiln-private-integrated-v1-evidence`.
- Worker SHA-256: `3ff536d4e99b8ee348d2a55e5a0de58ca04895643f53ccba4a68cf5ee570312a`.
- No public route, workers.dev address, preview URL, trigger, SSH or Container logs.
  The default HTTP handler returns 404. Operator methods require a private service
  binding. Native internet access is disabled; only the three host-owned loopback
  routes are intercepted.
- Coordinator uses `standard-1`, with a 120-second parent deadline. Evaluation
  and rendering use `standard-2`, with 60- and 30-second deadlines respectively.
  Whole-instance destruction must be acknowledged before releasing results/capacity.
- Two fixed synthetic tenant IDs, 64 MiB storage each. Evidence has an independent
  64 MiB aggregate cap and 8 MiB per-response cap. Raw responses are written only
  to the disposable private bucket; control receipts retain hashes and outcomes.

## Cost proposal

Propose a **separate $1 trial allowance**, not another subscription or a
provider-enforced spending cap. The existing Workers Paid account is reused.

At full allocated CPU for every deadline, the maximum listed starts imply
1,080 coordinator-seconds, 240 evaluator-seconds and 120 renderer-seconds.
Using current published rates, these total approximately **$0.036 in Container
compute, memory and disk before included allowances**, excluding startup/cleanup
overrun and other meters. Thirty extra seconds per instance adds about $0.0142.
The $1 proposal leaves room for Workers, Durable Objects, R2, image storage and
operating overhead. It is an estimate, not a measured invoice or an assurance
against a provider cleanup failure; such a failure stops the trial and requires
operator cleanup and a provider-state readback.

Sources checked 6 October: [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/)
and [instance types](https://developers.cloudflare.com/containers/platform/limits/).
CPU is billed for active usage; memory/disk use allocated capacity. This estimate
deliberately assumes full CPU utilization and does not consume a claimed remaining
free allowance.

## Local preparation and evidence

`hosting/scripts/build-integrated-probe.mjs` compiles locally with the installed
Cloudflare configuration schemas and verifies `cf@1.0.0-beta.12`. It requires an
explicit account ID, output path under the repository's `.cache`, and cf package
metadata path. It neither provisions resources nor uploads/deploys anything.
The prepared output and receipt are under `.cache/integrated-provider/`.

The native MCP tests exercise the complete fixed sequence with a fresh host per
request and real local tenant storage. Their injected image port verifies the
contract, not rendering fidelity. Separately, the immutable installed renderer
and coordinator images have real offline Docker receipts in the image guide.
Neither substitutes for the proposed provider trial.

The actual local Worker/RPC/SQLite/R2 fixture checks 404 public behavior, a missing
Container result, exact evidence retention, closed allowance, paused admission,
zero live reservations and replay after durable-object eviction. An initial test
exposed an unread RPC body on early native rejection that prevented eviction;
closing that body fixes it. A second regression verifies cancellation when the
diagnostic allowance itself rejects a request before dispatch. Both defects were
observed failing before the fixes. The full 270-test hosted suite, three hosted
typechecks and twelve production bundles pass locally; an additional configuration
test passes against the generated private deployment. Exact-source CI remains required.

## Approved-run procedure

1. Obtain the owner's approval for this exact candidate and bounded allowance.
2. Upload the two immutable image manifests and verify their remote config/layers.
   Create only the named temporary bucket, then deploy the prepared configuration
   with the verified cf CLI. Read back deployed JavaScript, image identity,
   Container settings, namespace bindings and absence of public routes/triggers.
3. Bind a localhost-only operator to `KilnIntegratedControl`. Trigger `runFixed`
   once. A timeout is an observation timeout, not permission to start another run.
   Poll the retained record; do not recreate/reset its namespaces on failure.
4. Retrieve the case responses and independently decode images and GLB, compare
   exact source and metadata, and inspect the rendered fixture. Record timing,
   actual VM count, provider state, budget claims and cleanup outcomes.
5. Replay the private RPC only to verify the retained result and unchanged claim
   count. If interrupted, call `stop` and verify all instances stopped; do not
   interpret an unfinished run as acceptance.
6. Retain receipts locally, remove only this trial's instances/applications,
   Worker and seven namespaces, delete its bucket contents and bucket, and remove
   its temporary registry references. Verify absence in the provider APIs and
   stop the localhost operator/remove its temporary registry login. Do not delete
   unrelated account resources or assume a delete response proves cleanup.

Record the exact deployed source, results and cleanup readbacks here after the
approved run. Production launch remains a separate candidate and approval.
