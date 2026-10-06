# Native hosting qualification

This is a fixed, one-shot probe for an installed Kiln archive. It accepts no user
source, has no HTTP endpoint, deploys nothing and contains no cloud credentials.
Its output is provider-neutral evidence; the caller must separately record the
actual provider deployment and immutable image digest. A local run never proves
Cloudflare compatibility.

Build a minimal Docker context containing only these six files:

- `Dockerfile`, `native-qualification.mjs`, `run-native-qualification.mjs` from this directory.
- `smoke-renderer.mjs` from the parent scripts directory.
- The reviewed npm archive renamed `candidate.tgz` and a `candidate.sha256` file
  containing its reviewed SHA-256 followed by two spaces and `candidate.tgz`.

Use `docker build --platform linux/amd64 --tag kiln-native-probe CONTEXT`.
Do not send the engine checkout, credentials, authored workspaces or the entire
local cache as the build context. The image checks the archive digest, uses the
pinned Node base and npm toolchain, installs dependencies without lifecycle
scripts, retains the resolved npm lock and OS package inventory, and runs as the
non-root `node` user. The image's installed dependency graph and final digest still
need review; the archive alone does not pin its transitive dependencies.

Run without host mounts, provider keys or network access. For a local Docker
preflight, use an explicitly named fresh container, `--network none`, a memory
limit, a CPU limit, and a PID limit. Copy `/tmp/qualification` out after exit and
inspect its receipt before removing that specific probe container. Do not add
privileged mode, host namespaces, extra capabilities or a looser seccomp profile
to force a pass. The current Docker daemon is unavailable on the development PC.
The separate `Native hosting preflight` GitHub workflow builds this six-file
context on Linux, records the exact archive/image/dependency identities, and runs
with no network or host mounts, one CPU, 6 GiB memory, 256 PIDs, no capabilities
and no new privileges. It retains unsuccessful receipts and keeps the workflow
failed when qualification fails. Its independently executed trusted renderer
fixture can diagnose native dependencies after an isolation failure; it never
qualifies untrusted evaluation. CI evidence does not establish Cloudflare support.

The initial Bookworm image built but Mesa 22.3 failed Dawn's required Vulkan
features. The pinned Trixie replacement passes the six-image software fixture.
Its separate namespace probe still fails on the GitHub Docker host; an explicit
user namespace is required by the engine launch, and unsupported hosts stop before
evaluating source. See the [execution record](../../docs/reviews/2026-10-06-v1-execution.md#linux-image-preflight)
for exact run/image/archive identities and retained failures.

The probe stops at the first failure. Successful readiness must contain all ten
engine invariants. Only then does it evaluate a fixed box twice through the
isolated evaluator, verify matching GLB bytes and a nonblank CPU preview, enforce
deadline/cancellation/output limits, and render again after the limit tests. The
existing renderer probe separately requires a software adapter and verifies a
textured fixture with six retained PNGs. That fixture is trusted; it does not
establish the source isolation boundary.

Timing names mean first/repeated evaluator calls, not measured cold/warm provider
starts. Deadlines and cancellation include worker startup, so these checks do not
prove that native compute was running at interruption. Process resource usage is
for the parent only. Available cgroup counters cover the container, and may include
startup or earlier work; retain the before/after snapshots without relabeling them
as per-job RSS or billed CPU. Load, tenancy, persistence, retention and cost remain
separate service tests.

Cloudflare's current documentation recommends the Durable Object Container API
for new applications and describes a separate microVM per container. Neither fact
guarantees that this image can create Kiln's nested namespaces. Run this unchanged
probe on the provider before selecting its production execution boundary. If it
fails, record the specific failure and evaluate a reviewed per-job/per-user
provider sandbox design; do not silently substitute ordinary subprocess execution.

References checked 6 October 2026:
[container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/),
[sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/),
[local build prerequisites](https://developers.cloudflare.com/containers/get-started/).
