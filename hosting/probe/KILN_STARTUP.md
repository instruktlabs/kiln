# Unchanged Kiln-image startup control

The managed and minimal custom-registry controls passed. Four of five approved
jobs have been attempted. This candidate consumes at most the final job of the
original $1 trial. Do not retry it by changing the name or recreating its namespace.

Use the existing `kiln-evaluation:rc1-local` image unchanged, including its original
OCI index, Node 22.23.3 runtime, installed public RC, entrypoint and `USER node`.
Its immutable digest is
`sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a`.
Do not rebuild, change the user, strip provenance or select another platform digest.
Re-push these existing bytes to the private registry and verify the returned digest.

The fixed control does not import or execute Kiln. It runs only the same Node
version/UID/GID command as the two prior controls, with `exec` identity explicitly
`1000:1000` as required by the native API. The controller requires the exact image
reference, Node version and numeric identity; the UID is not a security boundary.
No command, source, image, environment or job ID is accepted from RPC.

Deploy the ordinary pinned Wrangler configuration with Worker/application
`kiln-private-image-startup`, one job namespace, no public URLs and no provider or
storage credentials. Verify uploaded bytes, image map, deployment and privacy
settings before the fixed private RPC. The loopback-only operator rejects browser
origins/nonempty bodies and is never deployed.

The same standard-2 size, disabled egress, 60-second deadline, five-second cleanup
budget, recovery alarm and bounded outputs remain. The fixed job is retained even
after failure or interruption. At the researched rates, 65 fully busy seconds cost
about $0.00233 in Container CPU/memory/disk before allowances, with other services
and registry storage additional. This is not an invoice or provider dollar cap.

Retain the result and verify whole-instance stop; then stop the operator and remove
only this application, Worker, namespace and `kiln-evaluation:rc1-local` registry
image. Read back absence. A pass qualifies image startup only, not native evaluation,
hostile-source isolation, CPU/software rendering or hosted launch. After this
attempt, further cloud jobs require a concrete new scope and owner approval.

Source: [native process identity](https://developers.cloudflare.com/containers/api/durable-object-container/).
