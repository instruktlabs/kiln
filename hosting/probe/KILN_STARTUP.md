# Unchanged Kiln-image startup control

The managed and minimal custom-registry controls passed. This completed candidate
consumed the fifth and final job of the original $1 trial. No jobs remain.
Do not retry it by changing the name or recreating its namespace.

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

## Completed attempt: image startup failed

Source `569fc5313f909c04ac960348b638e376cdb36239` was deployed with the exact
original image on 6 October 2026. The uploaded JavaScript was read back and matched
SHA-256 `57c509e5b71d086f18e8b3d900d3dfc2bbbc48a369ef816c057b946abe3a018a`.
The deployed image map matched the original digest, public URL flags were false,
and the version had no URLs or bindings beyond its job namespace. Wrangler reported
the image prepared and ready before deployment.

At 19:08:40 UTC the fixed invocation failed with `MONITOR_FAILED` after 1,242 ms.
The trace reached `start` and `setInactivityTimeout`, but never entered `exec`.
The Node command and Kiln engine were therefore not executed by this controller.
Destruction and stopped inspection completed after 1,243 ms. The instance list was
empty, and replay returned the exact retained failure without another attempt.

The local operator was stopped; the application, Worker, namespace and registry
image were removed. Readbacks verified absence and Worker 404. Receipts remain
in the diagnostic worktree's ignored `.cache/startup-kiln-trial/`. The original
five-job allowance is exhausted; no further cloud execution is authorized by it.

Local checks passed all 131 hosted tests, all hosted typechecks/builds, root
typecheck/lint, deployment dry run and redacted source/bundle scans. No engine
source or package content changed; its full 3,290-test suite had passed on the
preceding custom-image candidate. The current hosted CI run is
[37516547552](https://github.com/instruktlabs/kiln/actions/runs/37516547552).

This narrows the failure to this image or its startup configuration under the
native API; the same controller starts managed and minimal custom images. It does
not establish that OCI indexes, image `USER node`, a particular layer or Cloudflare
itself is defective. Continue local image analysis before preparing a separately
bounded next trial. Native evaluation and hosted launch remain unqualified.
