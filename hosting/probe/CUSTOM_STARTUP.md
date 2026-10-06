# Minimal custom-registry startup control

The managed-image control in [STARTUP.md](STARTUP.md) passed and consumed the
third of five approved jobs. This completed candidate consumed one more job,
leaving one. Do not rerun it. It did not repeat the managed control or expand
the $1 allowance.

Use the documented source of the managed image, official Node 24.20.0 on Debian
Trixie slim, copied to the account's private Cloudflare registry. Its Linux AMD64
manifest is pinned to
`sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600`.
No Dockerfile, package install, Kiln code, user files or credentials are added.
This tests custom-registry image resolution separately from engine image content.
The prior Kiln image is an OCI index; that difference is a hypothesis to investigate,
not an established incompatibility or a reason to strip release provenance.

The image is configured through Wrangler's named `images.control` map and selected
through `ctx.container.images.control`, as documented. The same controller retains
one job, uses standard-2 with Internet disabled, runs the fixed version/UID/GID
command, validates output/image identity, and destroys the whole instance. The
configured-image path rejects absent, mutable or external-registry references.
It accepts no image, command, source or job ID through RPC.

The resources are Worker/application `kiln-private-custom-startup`, one job
namespace, and registry repository `kiln-startup-control` with tag
`node24-20261006`. Both HTTP entrypoints return 404; routes, workers.dev and preview
URLs are disabled. The local operator is loopback-only and rejects browser origins
and nonempty bodies. Do not deploy the operator.

Use pinned Wrangler 4.147.0 for configuration and deployment, and cf
1.0.0-beta.12 for registry/resource operations. Verify the pushed manifest digest
matches the pinned image before deploying. Before invoking once, read back the
uploaded Worker bytes, image map, private URL flags and deployment identity.
Keep separate startup, output and teardown phase evidence. Stop after a failure;
do not change the job ID or recreate the namespace to retry.

The 60-second deadline, five-second cleanup budget and recovery alarm are unchanged.
At the researched rates, 65 fully busy standard-2 seconds cost approximately
$0.00233 in Container CPU/memory/disk before allowances, plus other service charges.
The image transfer/storage is additional. This is not an invoice or dollar cap.

After retaining evidence, stop the operator and remove only this application,
Worker, namespace and registry image. Read back absence. A pass establishes the
minimal custom-image path only; it does not qualify Kiln or hostile-source isolation.

Source: [Cloudflare image management](https://developers.cloudflare.com/containers/guides/image-management/).

## Completed private control

Source `2c605257b8990a3bb9c9f0fffb5a9abc45092bc3` passed on 6 October 2026 at
18:59:29 UTC. Its uploaded JavaScript matched SHA-256
`84b82608d9baa9ea59cc49c56a5c34c66dc9482e22af14f5219c54945316ba7e`.
The read-back image map matched the pinned custom registry reference above,
both public URL flags were false, and the version advertised no URLs. Local Docker
and the deployed fixed command both returned Node `v24.20.0` with UID/GID `0:0`.

Output completed after 7,000 ms and awaited whole-instance destruction/inspection
after 7,102 ms. The instance API separately reported stopped with exit code zero.
These are one cold control's elapsed timings, not billed CPU or Kiln performance.
A repeated RPC returned exactly the retained record without a new job.

The operator was stopped; application, Worker, namespace and registry image were
removed. Application/namespace lists, Worker 404, registry listing and absence of
the local listener verified cleanup. Receipts remain in the diagnostic worktree's
ignored `.cache/startup-custom-trial/`. Four of five approved jobs have now been
attempted; one remains. No production deployment or support follow-up occurred.

The candidate passed 129 hosted tests, all hosted typechecks/builds, root
typecheck/lint, 3,290 root tests (two platform skips), Wrangler dry run and redacted
source/bundle scans. Its hosted CI run is
[37515318317](https://github.com/instruktlabs/kiln/actions/runs/37515318317).

Wrangler explicitly prepared the image and waited for readiness before deployment.
The earlier cf prebuilt deployment receipt also records the same preparation and
ready transition; an omitted preparation step is therefore not supported as an
explanation. The remaining image-index/content/controller differences require the
unchanged Kiln-image control, still without importing the engine.
