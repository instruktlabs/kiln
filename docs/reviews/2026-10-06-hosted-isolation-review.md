# Hosted evaluation: isolation review

Research date: 6 October 2026. This records findings and the next implementation
contract, not Cloudflare qualification or deployment acceptance. Companion to the
[hosting plan](../plans/2026-10-06-hosting-economics.md) and
[execution record](2026-10-06-v1-execution.md).

## What failed

PR #145's [native preflight run 37466581995](https://github.com/instruktlabs/kiln/actions/runs/37466581995)
built its Linux image but failed before evaluating source. Both a minimal
`unshare --user --map-root-user` command and Bubblewrap were denied namespace
creation. The receipt is `isolation / wrapper-launch`; the independent trusted
software-renderer fixture passed all six views. The retained diagnostics are under
`.cache/native-hosting-run-37466581995/receipts/`.

The outer Docker process was non-root, with all capabilities dropped, no new
privileges and the default seccomp profile. Ubuntu also reported its AppArmor
unprivileged-user-namespace restriction enabled. These observations establish
denial, but do not identify one exclusive denying layer. Docker documents namespace
syscall restrictions in its [default seccomp profile](https://docs.docker.com/engine/security/seccomp/).
This is a CI environment compatibility failure, not evidence of a broken renderer
or a requirement for the owner to approve a Windows Docker setting.

The original preflight combined two distinct questions: whether this restricted
Docker configuration permits Kiln's inner Linux sandbox, and whether the intended
managed hosting boundary can safely execute Kiln. A Docker result cannot answer
the second question.

## Recommended Cloudflare boundary

Cloudflare describes Containers as Linux images inside Firecracker microVMs with
their own kernels. Native libraries and subprocesses make Containers the relevant
environment for the existing Kiln engine. Workers remain the control plane.
Source: [choose a sandbox environment](https://developers.cloudflare.com/sandbox/concepts/).

The provider's [security guidance](https://developers.cloudflare.com/sandbox/concepts/security/)
treats the entire sandbox as one trust unit. Processes share files and localhost;
Linux usernames do not isolate them. Secrets and other users' data should stay
outside. Output needs validation before storage or use.

Our resulting design is **one fresh microVM per admitted evaluation job**:

1. The authenticated Worker verifies ownership, reserves quotas and generates an
   unguessable execution ID. Client-supplied names cannot select an existing job.
2. A dedicated execution Durable Object starts a pinned image with Internet access
   disabled. It receives only the bounded source and resources authorized for that
   job. No OAuth credentials, account database, bucket mount, broad storage token,
   previous job files or user-created snapshot enters the VM.
3. Run the installed engine through its versioned evaluator protocol. Keep the
   source restrictions, input limits and registry definitions. Arbitrary code
   execution inside this VM must not become control-plane authority.
4. The external supervisor enforces startup and total job deadlines, cancellation,
   instance limits and bounded output. It destroys the VM on every terminal path.
   A cleanup failure is a failed execution requiring reconciliation, not success.
5. Validate the response version, request ID, byte limits and artifact structure
   outside the VM before tenant storage. Never use a returned path, tenant ID,
   quota count or claimed QA result as authorization. A compromised evaluator can
   forge its own report; quality claims require their separately defined evidence.
6. Persist accepted artifacts through the trusted tenant service. Another job
   starts from the pinned image, including jobs belonging to the same user.

The current [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
is the recommended interface for new applications. `ctx.container` exposes image
identity, startup, direct-argument execution and destruction. An execution signal
kills its direct process, not all descendants; request cancellation alone does not
stop execution. Use whole-instance destruction and await it. Do not substitute
an inactivity timeout for a hard job deadline. Durable alarms must recover cleanup
after a supervisor interruption. The new scheduling policy remains public beta;
actual account availability and behavior need the provider probe.

Use the existing `EvaluatorTransportV2` / `createEvaluatorPortV2` seam in
`src/evaluator/protocol.ts`. Add the Cloudflare adapter in private `hosting/`, with
its own explicit readiness contract. Do not relabel the Bubblewrap readiness check
as passed or bypass `loadNativeMcpRuntime`'s current fail-closed path. The existing
local Linux adapter remains available on a compatible host. Node's
[`vm` module](https://nodejs.org/api/vm.html) is not an execution security boundary.

## How HOL Guard helps

Reviewed the owner's fork at
[`dfc2b844`](https://github.com/matthew-kissinger/hol-guard/tree/dfc2b844de26a5fd79124bb2ce5f8e262d59eab6)
without installing or executing it. It contains both policy/scanning facilities and
execution adapters. Its older 3.0 baseline documents are not a complete inventory:
the source also contains an
[isolation-provider contract](https://github.com/matthew-kissinger/hol-guard/blob/dfc2b844de26a5fd79124bb2ce5f8e262d59eab6/src/codex_plugin_scanner/guard/runtime/isolation_provider.py),
OCI plan validation and a
[gVisor reference runner](https://github.com/matthew-kissinger/hol-guard/blob/dfc2b844de26a5fd79124bb2ce5f8e262d59eab6/src/codex_plugin_scanner/guard/runtime/gvisor_reference_runtime.py).
Useful patterns include pinned provider identity, bounded execution, explicit
capabilities, forbidden mounts and cleanup evidence. Reading them does not qualify
their guarantees or establish compatibility with Kiln's native renderer.

Current upstream's
[containment CI at `2755b3cd`](https://github.com/hashgraph-online/hol-guard/blob/2755b3cd3cd372ec8a08a962de2cc4213d73d49a/.github/workflows/containment-ci.yml)
deliberately provisions its test hosts. One job grants Bubblewrap user-namespace
access through an executable-specific AppArmor profile. A separate nested-container
job adds an outer capability and relaxes outer filters so it can test its inner
sandbox. Those are distinct test environments, not proof that a default restricted
Docker container supports nesting. They are useful reference configurations, not
settings to copy into a public Kiln runtime or onto the owner's PC automatically.

Recommendation: use these contracts and tests as reference material now; evaluate
optional Kiln plugin compatibility/scanning separately. Do not add the full Python
runtime, a nested gVisor runtime or a new mandatory end-user dependency to v1 without
a demonstrated benefit and qualification. No HOL Guard changes or contribution PR
were made. The owner subsequently explicitly deferred HOL Guard contribution and
integration work until after a polished Kiln v1. Proceed with the appropriate
current platform techniques without making HOL Guard a release dependency.

## Qualification sequence

| Gate | Required evidence |
| --- | --- |
| Local Linux adapter | Dedicated compatible runner; existing source-denial and isolation corpus; clearly labeled as Linux/Bubblewrap evidence |
| Private Cloudflare adapter | Tests for fixed image selection, ownership, no Internet, single job, bounded protocol, timeout, abort, output flood, cleanup failure and supervisor recovery |
| Real provider probe | Exact Worker/image/package identities; network denial, cross-job filesystem/process denial, memory exhaustion, child-process cleanup, deadline and restart recovery |
| Native execution/rendering | Installed package produces bounded GLB and CPU views; software Vulkan fidelity separately identified; startup, elapsed time and memory measured |
| Hosted integration | Authenticated MCP invokes the qualified adapter; private save/download/retention and two-user denial tests; admission and accounting cannot trust sandbox claims |

Keep the existing failed receipt as evidence. Changing a test to check a different
boundary requires a new named receipt, not reinterpreting the old failure as a pass.
Cloudflare qualification is still a hosted-launch blocker. Package publication has
its own exact-main archive gates and can progress independently.

No workstation reconfiguration or Docker permission approval is needed now.
Prepare the private provider probe's reviewed source, resources, access controls,
cost estimate and teardown before requesting its remaining deployment approval.
Cloudflare's [Workers Builds path](https://developers.cloudflare.com/containers/guides/deploy/)
can build images remotely; verify CLI/build support and image identity before
choosing this over a local Docker dependency.
