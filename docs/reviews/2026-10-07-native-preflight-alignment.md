# Native preflight and hosted execution boundaries

7 October 2026. This records the exact failing check and the next validation
change to prepare. No workflow, isolation restriction or launch requirement was
changed by this review.

## Current failure

[Run 37668543023](https://github.com/instruktlabs/kiln/actions/runs/37668543023)
tested source `76c869aa7c8637b222b5bdf956fd1e70c3f9d83a`. Its retained archive
matches the package CI archive exactly:
`98407508d8ec599189851aa0bd8b86313ac3abbd25e6337ac97f8510cc72215b`.

The downloaded `native-hosting-preflight` artifact confirms:

- The non-root image built and ran as UID 1000 with Node 22.23.3.
- Bubblewrap 0.12.0 is installed. Both the fixed `unshare` diagnostic and the
  Bubblewrap readiness launch return permission errors while creating namespaces.
- The engine receipt fails at `isolation`, with code `wrapper-launch`. Only the
  preceding host check completes. No evaluated asset or fallback output exists.
- The same run's separate trusted renderer fixture passes six views across the
  three backdrops, identifying Mesa/llvmpipe software Vulkan. This does not prove
  untrusted-source isolation.
- The host exposes enabled unprivileged-user-namespace settings and enabled
  AppArmor user-namespace restriction. These values alone do not identify which
  policy layer denied this launch. No policy relaxation was attempted.

The retained local evidence is `.cache/hosting-preflight-76c869a/receipts/`,
including provenance, namespace diagnostics, the failed isolation receipt and
the passing renderer receipt. This is a supported conclusion about that specific
GitHub Docker run, not an unexplained native-rendering failure.

## Two explicit execution paths

| Path | Boundary | Current evidence |
| --- | --- | --- |
| SDK nested isolated evaluator | Host supports the required Bubblewrap namespaces and all ten readiness invariants | This Docker host does not meet the prerequisites; the evaluator refuses to run |
| Cloudflare hosted evaluator | Separate fresh VM per admitted evaluation/render, controlled network and lifetime outside that VM | Earlier approved private trials qualify their exact image/controller pairs; final launch and recovery gates remain open |

`scripts/hosting/run-native-qualification.mjs` tests the first path through the
installed package. Its readiness requirement remains meaningful for an embedding
that selects this adapter.

Production `hosting/container/serve.mjs` explicitly calls
`loadContainerMcpRuntime()`. `hosting/src/native-mcp.ts` separately defines the
nested `loadNativeMcpRuntime()` and does not select a fallback when its readiness
fails. The hosted tests check refusal of an unavailable nested boundary and
failure when the explicit remote evaluator is unavailable.

The current native-image CI uses the separately recorded published engine 1.0.0.
It does not qualify a new hosted 1.1 engine merely because the branch package
version changed. Keep published image pins and local development qualification
distinct.

## Appropriate next validation work

1. Retain the positive nested-isolation probe unchanged for a compatible host.
   Do not make privileged mode, added capabilities, disabled AppArmor or disabled
   seccomp the default route to a green check.
2. Prepare an explicit unsupported-host rejection test: readiness must refuse
   evaluation, return a bounded diagnostic, produce no asset and never select
   an ordinary subprocess fallback. An unavailable prerequisite is not a passed
   isolation qualification. Keep the original failed evidence.
3. Keep production image functionality and actual provider isolation as separate
   checks. The latter needs the exact deployed controller/image identities,
   network denial, fresh-state/descendant isolation, resource limits, cancellation
   and verified whole-instance cleanup. Local Docker cannot certify Cloudflare's
   VM boundary.
4. Make any workflow revision name and enforce those distinct obligations. Do not
   remove the failing check or call the hosted service ready simply because this
   mapping explains it. Complete and review the replacement evidence first.

This narrows the next implementation step: improve the test architecture instead
of repeatedly rerunning the same incompatible host. It does not waive a gate or
authorize a new cloud trial.

Official documentation checked today: Docker describes namespace-related syscall
restrictions and recommends retaining its default
[seccomp profile](https://docs.docker.com/engine/security/seccomp/). Cloudflare
documents a Firecracker microVM with a separate kernel/network per instance and
the [Durable Object Container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/).
Those platform statements inform the architecture; actual deployment receipts
are still required to qualify Kiln's use of it.
