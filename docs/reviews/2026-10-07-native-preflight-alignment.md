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

## Additive VM qualification candidate

The follow-up keeps the existing Docker job unchanged and adds an installed-package
evaluator job on an ordinary Ubuntu 22.04 GitHub VM. It compiles Bubblewrap 0.12.0
from upstream commit `2a76602a8c71f36c1527cf9fc3417d9149822e0c`, verifies the source
archive SHA-256, and installs dedicated non-setuid, capability-free executables.
Evaluation runs as the unprivileged runner user. No sysctl, AppArmor, seccomp or
capability restriction is changed. This job is a candidate until CI provides an
actual passing receipt; merely choosing the VM does not establish compatibility.

`--isolation-only` selects the separate
`kiln.nested-evaluator-qualification.v1` receipt. It requires all ten readiness
invariants, repeatable evaluation, a nonblank CPU preview, deadline/cancellation/
output limits and successful execution after those limits. It makes no software
renderer claim. The unchanged Docker job continues testing that renderer and
continues to fail on unavailable nested namespaces. This addition does not
replace or waive either the old check or actual Cloudflare isolation qualification.

Focused tests first failed for the missing separate qualification result, then
passed after implementation. The same shared evaluator checks serve both modes;
the original combined probe still requires its software-renderer result.
Local validation passes 3,348 tests with two platform-specific skips, typecheck,
repository lint, YAML parsing and Bash syntax.

The first actual VM run, [37679591488](https://github.com/instruktlabs/kiln/actions/runs/37679591488),
failed at `isolation/wrapper-launch` at source `494dee6`. Its exact installed
archive still matches SHA-256 `98407508d8ec599189851aa0bd8b86313ac3abbd25e6337ac97f8510cc72215b`.
The runner is non-root (1001), permits unprivileged user namespaces, and reports
AppArmor user-namespace restriction as zero. No GLB or preview was produced.
These facts rule out treating Docker alone as the explanation; they do not yet
identify the failing launch component. The retained evidence is
`.cache/nested-evaluator-494dee6/`.

A bounded diagnostic now prepares the actual installed evaluator's launch for
its fixed transport worker and records capped stdout/stderr/fd3 after failure.
The child retains the evaluator's stripped environment and all restrictions.
Its receipt is explicitly diagnostic, never qualification. The original failed
receipt remains authoritative until a later actual run proves the full boundary.

## Confirmed launcher defect

The diagnostic from [run 37680296814](https://github.com/instruktlabs/kiln/actions/runs/37680296814),
source `75e6682`, reports `bwrap: Unknown option --preserve-fds`. Every required
executable and the installed transport worker exists. The wrapper exits before
Node starts, with empty stdout/fd3 and no evaluated artifact. The independent
Docker namespace diagnostics do not explain this earlier argument-parser failure.

Bubblewrap 0.12.0 already passes inherited descriptors to its command; its monitor
and namespace-init process close their own extra descriptors separately. See the
[pinned upstream implementation](https://github.com/containers/bubblewrap/blob/2a76602a8c71f36c1527cf9fc3417d9149822e0c/bubblewrap.c#L3453).
Kiln explicitly supplies only stdio and its fd3 protocol pipe to the child.
The fix removes the nonexistent option, preserves every isolation/resource
restriction, and retains the readiness transport proof. The regression first
failed against the old launch, then passed with the fix; 23 focused tests,
typecheck, lint and rebuilt SDK/runtime bundles pass. Full candidate CI remains
required, including actual Linux transport and all ten readiness invariants.

The invalid option is also present in published source `fda71ac` (1.0.0).
It prevents the optional nested Linux evaluator from starting. The fix belongs
to the unpublished candidate; publication will require a separately qualified
archive and approval. Cloudflare's explicit fresh-VM adapter has a different
execution boundary and does not use this launcher.

After removing the invalid option, run `37681127385` starts the real Node
transport successfully and returns the exact fd3 envelope. Its subsequent
readiness failure is `invariant-namespace`, so wrapper startup is no longer the
blocking point. The fixed kernel inspection from run `37681948282` records UID
1001, all five capability sets empty, `NoNewPrivs: 1`, UID map `1001 0 1`, and
exactly `NODE_ENV`, `NO_COLOR`, `PWD` with `PWD=/app`.

The additional user namespace is how pinned Bubblewrap disables further user
namespaces; the map's outside UID refers to the intermediate namespace. The old
probe mistook that UID for the original host UID. The corrected probe requires
the child's namespace identifier to differ from the trusted parent's, real and
effective UIDs to equal the non-root caller, and a single-ID mapping matching
Bubblewrap's supported layout. Root/elevated callers, the parent namespace,
broad/multiple mappings, changed UIDs and missing parent evidence all fail.

The launch also uses `/usr/bin/env -i` under the existing resource limits to
remove wrapper-added `PWD` before Node starts. The exact two-variable environment
invariant remains unchanged. These changes have failing-then-passing focused
regressions; the actual VM must still pass every invariant and evaluation check.

At source `71aac00`, [run 37682807529](https://github.com/instruktlabs/kiln/actions/runs/37682807529)
passes all ten readiness invariants through the exact installed archive
`eedebd4ec4040bc5b0daad41d82f79202a6a2a7d06c5b01ba53c7a14b30cc63e`.
It then fails the first actual evaluation with `EXECUTION_REJECTED`, producing
no artifact. The receipt remains failed; readiness alone is not qualification.
The same fixed box successfully renders through the local packaged Node worker
(1,912 GLB bytes), which validates the fixture but proves no Linux isolation.
The CI-only diagnostic now evaluates that fixed box directly inside the unchanged
boundary and records capped exception details. It accepts no user source and
does not change the sanitized public evaluator protocol. The retained failed
evidence is `.cache/nested-evaluator-71aac00/`.

The fixed-fixture diagnostic in [run 37683757970](https://github.com/instruktlabs/kiln/actions/runs/37683757970)
confirms `ERR_PROTO_ACCESS` inside the installed Khronos validator's startup
feature detection. The same failure reproduces locally with Node 22.23.3 and the
isolated launcher's `--disable-proto=throw`. It is a runtime/dependency interaction,
not an invalid qualification scene or a namespace-permission failure.

The corrected launcher uses Node's documented `--disable-proto=delete`, removing
the legacy mutation accessor entirely. See the [Node CLI contract](https://nodejs.org/api/cli.html#--disable-protomode).
Readiness additionally requires that absence and checks generated constructor-chain
denial. The focused regression derives Node flags from the actual launcher,
initializes the actual Khronos dependency, validates a rendered GLB and verifies
that an assigned JSON `__proto__` key cannot mutate the target prototype. It fails
with the old flags and passes with the fix. No validator bypass, source-policy
exception or OS/resource restriction change is introduced. Actual VM qualification
of this corrected candidate is still required.

## Positive installed proof and restricted-host regression

[Run 37684601572](https://github.com/instruktlabs/kiln/actions/runs/37684601572)
at `5b1094c` passes the complete installed VM qualification: all ten readiness
invariants, two identical GLB evaluations, a nonblank 128px CPU preview, deadline,
cancellation, output limits and successful execution after the limits. The
downloaded archive SHA-256 is
`ce0d7e182705159d70daa19ab58e8fc063e81a8a43a8e4df203cfb1d88c2878f`.
Both artifact sizes and digests were independently checked; the 1,912-byte GLB
hash is `f94d231ed3eb4843a03704872adc3f20b00c2ea24567cb5916407b40a2cf1d40`.
The CPU image was inspected and shows the expected box. This is VM/SDK evidence,
not material or Cloudflare qualification. The original Docker job remains failed
in this preserved run. All 118 focused evaluator/qualification tests pass locally.

With positive evidence established, the Docker job now explicitly requests
`--expect-unsupported-isolation` and requires a distinct refusal-only receipt.
It must observe kernel namespace permission denial, readiness `wrapper-launch`,
and `WORKER_FAILED` for the valid fixed source, producing no artifact. Successful
readiness/source execution, missing kernel evidence, an authoring rejection or
a timeout cannot satisfy this test. It still separately requires the complete
software-renderer fixture under unchanged Docker restrictions. The positive VM
job remains mandatory for this workflow; no failing positive probe automatically
switches to the negative mode. Fifteen focused qualification tests pass, including
the new failing-then-passing refusal cases. Actual CI proof of this revised job
remains required before its status can be reported as passing.

The revised workflow [37685410198](https://github.com/instruktlabs/kiln/actions/runs/37685410198)
passes both jobs at `2087faac07e6c86245abd78a55ddfd481bae275d`. Both downloaded
archives match `ce0d7e182705159d70daa19ab58e8fc063e81a8a43a8e4df203cfb1d88c2878f`.
The positive VM repeats all nine checks and ten readiness invariants. Docker's
refusal receipt reports kernel permission denial, `wrapper-launch`, `WORKER_FAILED`
and no artifact, followed by a separate passed software-Vulkan receipt. The GLB,
CPU PNG and all six software-view digests were independently verified. Local
full tests for the runtime correction pass 3,353 tests with two platform skips;
the later refusal extension separately passes fifteen qualification tests.
Full package CI subsequently passed all twelve jobs at the same source, including
Linux and Windows regressions. All seven downloaded installation receipts verify
against that exact archive; six software-rendered view hashes also verify. This
resolves the native preflight failure for this candidate without qualifying public
hosted launch.
