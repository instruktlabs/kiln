# Proposed single-platform manifest control

**Prepared locally; requires a new owner-approved cloud allowance.** The original
five-job trial is exhausted. This candidate permits one additional fixed job,
with a $1 trial allowance covering its temporary Worker, Container and registry
usage. The allowance is not a provider-enforced billing cap.

Cloudflare's [current image builder](https://github.com/cloudflare/workers-sdk/blob/main/packages/containers-shared/src/build.ts)
uses `--platform linux/amd64 --provenance=false`. The original Kiln image is an OCI
index containing a Linux/AMD64 runtime manifest and an attestation. The successful
minimal custom control selected a platform manifest directly. This is a specific
image-format hypothesis, not a confirmed incompatibility or vendor defect.

Select the original image's existing runtime manifest directly:

```text
sha256:db79551579a9abd33f7589a4da4d57947364ddf3dd37b79f766e202f2703edc8
```

Read-only inspection of the retained OCI archive verified the descriptor hashes.
This manifest selects the same config `fe7ab6cb...`, ten filesystem layers, Node
22.23.3, installed RC, `USER node` and entrypoint as the failed index. Do not rebuild
the image, reinstall dependencies, change users or substitute another digest.
Keep the original local index and attestation available as evidence.

After approval, tag that local image as
`registry.cloudflare.com/56adffd40534f7fe110fc661a40bbf53/kiln-evaluation:rc1-platform-control`
and push only `--platform linux/amd64`. Docker documents that this pushes the
[platform manifest without the index or its attestations](https://docs.docker.com/reference/cli/docker/image/push/).
Read the remote manifest and require the exact digest/config/layers above before
deployment. An unexpected digest is a stop, not permission to change the controller.

Deploy `manifest-startup.wrangler.jsonc` with pinned Wrangler 4.147.0. Verify uploaded
Worker bytes, private bindings, disabled public URLs, exact image map and image
preparation before invoking `KilnManifestStartupControl.runFixed()` once through
a private service binding. The local operator must bind only loopback, reject
browser origins and nonempty bodies, and must never be deployed.

The unchanged lifecycle requires a fresh standard-2 VM, disabled Internet access,
60-second execution deadline, bounded output, numeric exec identity `1000:1000`,
whole-instance destruction and stopped inspection within the five-second cleanup
budget, with a durable recovery alarm if cleanup fails. The command prints only
Node version and UID/GID; it never imports Kiln or accepts source. Both HTTP
entrypoints return 404. A durable claim prevents a second invocation, including
after failure. At researched rates, 65 fully busy seconds cost approximately
$0.00233 for Container CPU/memory/disk before allowances; other services and
registry storage are additional.

Preserve phase results and confirm stopped. Then remove only this candidate's
application, Worker, namespace, registry tag and local operator, verifying absence.
Do not recreate its namespace or reset its durable claim to retry. Whether it
passes or fails, stop after this job and interpret it alongside the original
index result. Startup success would still not qualify native evaluation, hostile
input isolation, rendering or production hosting.

## Local evidence

The two new focused cases failed before implementation, then all 16 diagnostic
cases passed. They check the exact manifest, original-index substitution denial,
numeric identity, wrong runtime output, retained replay and private entrypoints.
The complete hosted suite passes 133 tests; hosted typechecks/builds and root
typecheck/lint pass. Wrangler's deployment dry run passes without uploading or
starting a Container. Redacted source and actual JavaScript/source-map scans pass
(12.64 KB and 30.65 KB respectively). The Worker bundle SHA-256 is
`f339a35a1bc271bda9e985f03d0d0f9911979617b375bd6bcadd08ccc6d80a43`.
Retain CI and compare deployed bytes before any approved cloud invocation.
This diagnostic changes no engine or package code.
