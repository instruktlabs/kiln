# Cloudflare startup review and release status

Reviewed 6 October 2026 against current Cloudflare documentation, public issue
reports, the installed tool versions, the deployed probe receipts, current source,
GitHub checks and the npm registry. This is an analysis and next-test plan, not
evidence that native hosting works. The initial research sent no additional
deployment or support message. The subsequent bounded managed-image control is
recorded below; it passed, while custom-image and full Kiln hosting remain unqualified.

## Conclusion

Keep the all-Cloudflare architecture, but reduce the startup problem to a minimal
documented example before another Kiln execution attempt. A support ticket is a
parallel diagnostic channel, not proof of a Cloudflare defect or a reason to wait
without further investigation. The earlier documentation review established a
reasonable isolation design; it did not establish the cause of the startup error.

Native execution is a hosted-launch blocker. It does not block the independently
qualified npm package or local plugins. The hosted service also has unfinished
authentication, account controls, dispatch and operational qualification, so fixing
startup alone would not make it ready to launch.

## What the receipts establish

- The second actual provider execution reached the private deployed coordinator.
  The first fixed case failed after 2,038 ms; `monitor` was the first native method
  recorded as rejecting. There is no successful evaluator output or GLB receipt.
- The observer records the first failed method, not a complete timeline of
  startup, command admission, process completion and cleanup. Consequently this
  does not identify an exclusive underlying cause or conclusively locate failure
  before every possible engine instruction.
- The image is Linux amd64, uses Node 22.23.3 on Debian Trixie, has `USER node`,
  and starts `sleep infinity`. Native `exec` explicitly uses numeric `1000:1000`.
  The named image reference is pinned in Cloudflare's own registry. Ordinary
  Docker and the installed-image CI fixture can run the fixed engine program.
- The numeric `exec` correction addressed a documented API constraint, but did
  not resolve the deployed failure. There is no evidence yet that Dockerfile
  `USER node` is itself unsupported; changing it would be a controlled hypothesis,
  not a known fix.
- Cleanup receipts show the trial application, Worker, namespaces and registry
  image were removed. Two executions consumed two of the five authorized jobs;
  three remain. The former four-case continuation must not be redeployed.
- One P4 case, `02363339`, was submitted with explicit owner approval. It included
  the error reference and deployment configuration, without secrets, user assets
  or attachments. Its saved receipt records no response at submission; this review
  did not refresh the support inbox or assert its current response status.

Local receipts: `.cache/provider-probe-trial-3/`. The restricted-Docker Bubblewrap
failure is separate: it demonstrates unavailable nested namespaces in that test
environment, not the cause of this remote Container failure.

## Current documented approach

Cloudflare recommends the native Durable Object Container API for new applications.
`start()` validates options and initiates boot; `monitor()` reports lifecycle
failure, and `exec()` waits if startup is still in progress. It is not necessary to
invent a network health server for our command-only job. The current controller
already observes the monitor without awaiting container exit before executing.
Source: [native API](https://developers.cloudflare.com/containers/api/durable-object-container/).

Containers provide a Linux microVM and support native dependencies and subprocesses.
Dynamic Workers cannot load native add-ons or start subprocesses, so they are not
a drop-in replacement for the existing evaluator and software renderer. Source:
[environment selection](https://developers.cloudflare.com/sandbox/concepts/).

The complete sandbox is the trust boundary. Its processes can access its files
and localhost, and native sandbox user IDs do not provide isolation. Keep each
job in a fresh VM, keep identity/storage credentials outside, pass only authorized
job inputs, and validate outputs in the trusted host. A local-loopback connection
inside the same VM is not itself a boundary failure; tests must distinguish it
from access to trusted services, other jobs or external destinations. Source:
[sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/).

Native process cancellation does not stop descendants, and inactivity timeouts
are not hard execution deadlines. Retain the external watchdog, durable cleanup
alarm and awaited whole-instance destruction. Record phase outcomes separately
from teardown failures. Source:
[command execution](https://developers.cloudflare.com/containers/guides/execute-commands/).

The `durable_object` scheduling policy entered public beta on 30 September. It
supports per-instance image selection but not application `max_instances`. Our
production host still needs authoritative global and per-account admission before
creating job IDs. Source:
[scheduling policies](https://developers.cloudflare.com/containers/configuration/scheduling-policy/).

## Options and recommendation

| Option | Fit for Kiln | Recommendation |
| --- | --- | --- |
| Native Container API with `durable_object` policy | Direct argument execution and piped bytes fit one-shot evaluation; fresh VM per job; startup and admission remain our responsibility | Keep as first candidate, subject to a minimal provider baseline and hostile-job qualification |
| Native API with `default` scheduling policy | Fixed image and size suit v1, with application-level instance caps and managed rollouts | First Cloudflare fallback if evidence isolates a problem to the newer policy; needs its own adapter and image-identity evidence, not a flag flip |
| `@cloudflare/sandbox` 1.0 | Adds file/mount/backup helpers to an already running Container | Do not add it merely to fix startup; it does not start, stop or monitor the VM |
| Dynamic Workers | Useful for capability-limited JavaScript without native dependencies | A future engine portability project, not the shortest v1 fix |
| Another compute provider | Could be appropriate if both Cloudflare routes fail qualification or measured economics are poor | No provider change justified yet |

The default policy and its rollout/cap differences are documented in the
[policy comparison](https://developers.cloudflare.com/containers/configuration/scheduling-policy/).
The SDK's current responsibilities are explicit in its
[1.0 reference](https://developers.cloudflare.com/sandbox/reference/).

Reduce tooling variables too. The probe currently builds low-level prebuilt
output and uses loopback bindings after a cf validation problem. For the minimal
reproduction, use the documented Wrangler configuration and explicit bindings;
keep `cf` for account/resource operations. This is a diagnostic simplification,
not a conclusion that `cf` caused the failure. Its CLI and Build Output remain
[beta](https://developers.cloudflare.com/cf/).

Registry reads today returned Wrangler 4.147.0, cf 1.0.0-beta.12 and Sandbox SDK
1.0.0. Wrangler 4.147.0 meets the documented native-policy and managed-image local
development minimums. Pin the version; do not update unrelated dependencies.
Source: [local development requirements](https://developers.cloudflare.com/containers/guides/local-dev/).

## Public discussions reviewed

These are reports, not independently confirmed explanations for Kiln:

| Report | What it describes | Why it does not establish our cause |
| --- | --- | --- |
| [containers #161](https://github.com/cloudflare/containers/issues/161) | Response-body failure through a service binding | Our operator gets structured RPC metadata; failure is recorded inside the Container lifecycle before successful output |
| [workerd #6790](https://github.com/cloudflare/workerd/issues/6790) | Local Sandbox terminal readiness timeout | Different local runtime and older SDK; our failed attempt reached the deployed service |
| [containers #231](https://github.com/cloudflare/containers/issues/231) | WSL2 local application container never starts | Reporter explicitly says deployed containers are unaffected |
| [workers-sdk #16008](https://github.com/cloudflare/workers-sdk/issues/16008) | Deleting a Worker leaves its Container application | Relevant to cleanup, not startup; our separate application/image/namespace readbacks remain necessary |

Searches also covered Cloudflare's public community results, `containers`,
`sandbox-sdk`, `workers-sdk` and `workerd` issue trackers. No reviewed report
established the same root cause as our native-policy custom-image failure.

## Next diagnostic, before more product changes

Prepare a new, fixed, private diagnostic with phase markers and at most the three
remaining job starts. Stop on failure and investigate the result before advancing:

1. **Managed-image control:** use `cloudflare/debian-trixie`, no Kiln package, no
   custom registry image and no user source. Run a fixed Node version/identity
   command, verify completion, then destroy and confirm stopped.
2. **Custom-image control:** if step 1 succeeds, build the equivalent minimal
   Linux/Node image through the documented image pipeline. Use the same controller
   and command. This tests custom-image preparation separately from Kiln.
3. **Kiln-image startup:** if both controls succeed, use the retained exact Kiln
   image with a fixed command that does not import Kiln. A pass directs subsequent
   investigation toward evaluator/controller integration; a failure narrows image
   configuration. Do not simultaneously change the scheduler, image user and code.

The managed control uses Node 24.20.0 and is only a platform diagnostic, not a
replacement for the release's pinned Node 22.23.3 runtime. Image sources and
digest handling follow the
[image management guide](https://developers.cloudflare.com/containers/guides/image-management/).

Record only fixed metadata: operation entered/completed/failed, relative time,
instance/image identity, command exit and cleanup result. Do not log arbitrary
source or credentials. Preserve the private invocation, single-run claim, 60-second
job ceiling, no egress, no secrets and readback-verified teardown. Local preparation
and validation come before deployment. This review itself consumes no cloud jobs.

A successful diagnostic still requires a separately bounded hostile-job/rendering
qualification campaign: network denial, fresh filesystem/process state, descendants,
memory/output exhaustion, deadline/cancellation races, supervisor recovery and
actual authenticated MCP/storage workflows. That campaign must not silently reset
the original five-job allowance.

Optimize only after measuring startup, peak memory, CPU and cleanup. The current
6-GiB instance is conservative, not a proven optimum. Cloudflare bills provisioned
memory/disk for running time and CPU for active usage, so short lifetimes and
measured sizing matter more than adding an SDK. Source:
[current pricing](https://developers.cloudflare.com/containers/platform/pricing/).

## Verified release status

| Work | Current evidence | Remaining work |
| --- | --- | --- |
| Publisher setup | Repository transfer and npm security setup recorded complete | Preserve these settings; no repeat setup |
| Public npm package | Registry returns `next=1.0.0-rc.1`, `latest=0.0.0-stage` | Final version, exact-main archive checks, approved stable promotion and fresh installs |
| Local plugins | Public RC installed and exercised in Claude Code and Codex | Stable-version updates and upgrade checks; directory submissions are separate |
| Native candidate PR #147 | Exact `7f4e98e`: engine/package, gateway, image, registry matrix and website checks pass | Separate restricted-Docker preflight fails; live native qualification absent; PR remains draft |
| Managed-image diagnostic PR #150 | Exact `c6b119b`: local gates, Linux/Windows hosted CI and deployed fixed Node command pass; resources removed | Full Kiln/hostile-source qualification remains |
| Custom-registry diagnostic PR #150 | Exact `2c60525`: local gates, both hosted CI platforms and deployed fixed Node command pass; resources removed | Full Kiln/hostile-source qualification remains |
| Unchanged Kiln-image diagnostic PR #150 | Exact `569fc53`: image prepared, then startup monitor failed before `exec`; cleanup verified | Investigate image/startup configuration locally; original five-job trial exhausted |
| Browser account PR #149 | Exact `11a4f64`: hosted checks pass on Linux and Windows in run `37507203413`; website passes | Review/integration plus live identity-provider qualification; PR remains draft |
| Connection controls | Working-tree changes pass all 144 hosted tests and all three TypeScript configurations | Uncommitted; further adversarial review, build/UI checks and CI required |
| Persistence | Local tenant storage, revisions, quotas, download/deletion and unsaved retention tests pass | Remaining material/account lifecycle work and deployed two-user evidence |
| Security/operations | Recorded secret scans, dependency fixes and focused adversarial checks | Final candidate scans, global admission, account linking/deletion, measured load/cost, alerts and recovery |
| Public hosted service | Not deployed; tenant `/mcp` deliberately returns 503 while native engine is unqualified | Complete integration, live auth, reviewed deployment and end-to-end acceptance |
| Public content and vendor directories | Broad README/Troy/site refresh intentionally deferred | Refresh after verified stable/hosted launch; prepare and submit candidates, track vendor acceptance separately |

The latest local test receipt is
`.cache/security-review-2026-10-06/account-current-status.log` (144/144);
typechecking is recorded in `account-current-typecheck.log`. These do not qualify
deployed authentication or supersede the exact-commit CI record.

## Owner handoffs

No new owner decision is required for this analysis or local diagnostic preparation.
Keep the existing release order: npm/local distribution need not wait for hosted
launch. Surface the concrete stable merge/publication and production deployment
candidates separately when ready, and surface provider login/verification steps
when they require the owner's browser. Prepare the full scope and cost estimate
before asking for any trial expansion. No new provider, paid plan or expanded
spend is proposed by this review.

## Managed-image result after research

The simpler documented configuration passed on the same Cloudflare account at
18:46:20 UTC. Source `c6b119b4a6358d51c27406f6fb3e74cafd289782` in
[PR #150](https://github.com/instruktlabs/kiln/pull/150) uses ordinary Wrangler
4.147.0 configuration, explicit bindings and `cloudflare/debian-trixie`, with no
Kiln import, custom image, user source, credentials or network access. The deployed
bundle was read back and matched SHA-256
`ddcc444cf904223eb63f5f8d2a673422c35e1e34076ae4ea2a6d13c6b59b741e`.
Both public URL flags were false and the version had no URLs.

The fixed command returned Node `v24.20.0` with UID/GID `0:0`; output completed
after 470 ms, and destruction plus stopped inspection completed after 573 ms.
The provider instance read separately showed stopped with exit code zero. These
are one diagnostic's elapsed measurements, not a Kiln benchmark or invoice. A
second RPC returned exactly the retained record and did not start another job.

The local operator was stopped; the exact Container application, Worker and
namespace were removed and absence was verified, including Worker 404. No custom
registry image was created. Receipts live in the isolated diagnostic worktree's
`.cache/startup-managed-trial/`. Three of five approved jobs have now been
attempted, leaving two. This completed control must not be redeployed to reset its
durable claim. No support follow-up was sent.

The source passed 3,290 engine tests (two platform skips), root typecheck/lint,
126 hosted tests, all hosted typechecks/builds and redacted secret scans. Both
Linux and Windows hosted CI passed in
[run 37513405377](https://github.com/instruktlabs/kiln/actions/runs/37513405377).
The primary account-control work remains separate and uncommitted at 144 local
hosted tests; the different totals represent different branches, not lost tests.

This rules out a blanket inability to run native Containers on the account. It
does not isolate the earlier failure to any single configuration difference. Next
test the minimal custom image through the same documented controller, then the
Kiln image without importing the engine, stopping on a failure. Keep Cloudflare;
no provider switch, new paid plan or expanded trial allowance is justified by this
result. Full hosted launch is still blocked by unqualified Kiln execution and
unfinished production authentication/account/integration/operations work.

The registry still returns `next=1.0.0-rc.1` and `latest=0.0.0-stage`. GitHub's open
high-severity development-dependency alert is for `sharp <0.35.5`; the pending
native branch already pins `0.35.5`, but main has not received that fix. Do not
describe that main-branch alert as closed before its merge and readback.

## Custom-registry control also passed

At 18:59:29 UTC, the same fixed controller passed with the documented managed
image's upstream Node 24.20.0 Debian Trixie AMD64 image, copied into the account's
private Cloudflare registry. Its single-platform manifest digest was
`sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600`.
No package installation, Kiln import, user data or credentials were added.

The candidate used the documented `images.control` map and
`ctx.container.images.control`, with the same fixed command, no egress and
bounded whole-instance cleanup. Source `2c605257b8990a3bb9c9f0fffb5a9abc45092bc3`
matched the uploaded JavaScript SHA-256
`84b82608d9baa9ea59cc49c56a5c34c66dc9482e22af14f5219c54945316ba7e`.
Deployed metadata verified the image reference and disabled public URLs before
invocation. Output completed after 7,000 ms and destruction/inspection after
7,102 ms; the provider separately reported stopped with exit code zero. A repeat
RPC returned the same retained result without another job. These are one control's
elapsed times, not billed CPU measurements or a Kiln performance forecast.

The operator, application, Worker, namespace and registry image were removed;
readbacks verified absence. Receipts remain under the diagnostic worktree's
`.cache/startup-custom-trial/`. Four of five approved jobs have now been attempted,
leaving one for the unchanged Kiln image without importing the engine. No expanded
trial, production deployment or support message occurred.

The source passes 129 hosted tests, all hosted typechecks/builds, 3,290 engine
tests (two platform skips), root typecheck/lint, deployment dry run and redacted
secret scans. Both hosted CI platforms passed in
[run 37515318317](https://github.com/instruktlabs/kiln/actions/runs/37515318317).

Source inspection showed Wrangler explicitly prepares custom images and waits for
readiness before deployment. The earlier cf prebuilt deployment receipt also
records that preparation and ready transition, so an omitted preparation step
does not explain the earlier failure. The original Kiln image uses an OCI index;
this control uses one AMD64 manifest. That difference is unproven as a cause, and
we should not strip provenance or rebuild the Kiln image before testing its
unchanged bytes through this simpler controller.

## Unchanged Kiln-image control failed before command execution

Source `569fc5313f909c04ac960348b638e376cdb36239` deployed the unchanged Kiln
image/index `sha256:69aff70b4f0f80d2ff13549f4b55b1053fc1d8a6e25a00168ac4078a2ebd7b8a`
through the same ordinary Wrangler configuration and fixed controller. The command
was only Node version/UID/GID, with numeric exec identity `1000:1000`; it did not
import Kiln. Its local Docker run returned Node `v22.23.3`, UID/GID `1000:1000`.

Before invocation, uploaded bytes matched JavaScript SHA-256
`57c509e5b71d086f18e8b3d900d3dfc2bbbc48a369ef816c057b946abe3a018a`, the image map
matched the original digest, and privacy/only-own-namespace binding checks passed.
Wrangler completed image preparation. At 19:08:40 UTC, the startup monitor failed
after 1,242 ms while setting the inactivity timeout. The phase trace never entered
`exec`; this narrows the failure more precisely than the original probe. The fixed
Node command and engine were not invoked by this controller. Destruction and
stopped inspection completed after 1,243 ms, and no instance remained in the list.
Repeat RPC returned the retained failure without a second execution.

The operator, application, Worker, namespace and registry image were removed;
readbacks verified absence and Worker 404. Receipts remain under the diagnostic
worktree's `.cache/startup-kiln-trial/`. All five original trial jobs have now been
attempted. Further cloud execution needs a concrete bounded scope and owner
approval; local investigation and independent release/account work can continue.

The current candidate passes 131 hosted tests, all hosted typechecks/builds,
root typecheck/lint, deployment dry run and redacted scans. The engine source is
unchanged from the preceding candidate's 3,290 passing tests (two platform skips).
The current hosted CI run is
[37516547552](https://github.com/instruktlabs/kiln/actions/runs/37516547552).

The result implicates this image or startup configuration under the native API,
not package evaluation code. It does not identify an exclusive cause. OCI index
selection, image user/entrypoint handling and content differences remain hypotheses.
Do not replace them with an assumed vendor fault, silently rebuild the retained
image, weaken isolation, or spend another job under the exhausted allowance.

## Local image-format comparison

Further source review found that Cloudflare's current image builder invokes
Docker with `--platform linux/amd64` and `--provenance=false` by default:
[build implementation](https://github.com/cloudflare/workers-sdk/blob/main/packages/containers-shared/src/build.ts).
This gives a specific next hypothesis without changing the execution architecture.

Read-only inspection of the retained OCI archive verified the descriptor hashes.
The failing `69aff70b...` index contains one Linux/AMD64 runtime manifest,
`sha256:db79551579a9abd33f7589a4da4d57947364ddf3dd37b79f766e202f2703edc8`,
and a separate attestation manifest with unknown OS/architecture. The successful
minimal custom control used a platform manifest directly. The runtime manifest
selects the same config `fe7ab6cb...` and ten layers already inspected and scanned;
selecting it directly would preserve Node, installed package bytes, user,
entrypoint and filesystem contents.

This difference does not prove that Cloudflare rejects OCI indexes or attestations.
The next bounded candidate should test the existing platform manifest directly,
with the same fixed command and controller, before rebuilding dependencies or
changing the image user. Prepare its exact configuration and local checks first;
one new cloud invocation would require owner approval beyond the exhausted trial.
No image was pushed, no cloud job started, and no support follow-up sent during
this inspection. The diagnostic worktree retains `kiln-image-descriptors.json`
and the metadata-only inspection script in its ignored cache.

## Original runtime manifest passed

The owner approved one additional fixed job at source
`29fc0ac248f59aa1d8c6f6ca89160c85d266e8ca`, with a separate $1 trial allowance.
At 19:49:18 UTC the test passed using the original image's Linux/AMD64 manifest
directly. Before deployment, remote inspection verified its digest, original
configuration and all ten filesystem layers. No image rebuild, package change,
user change or entrypoint change occurred. Uploaded Worker bytes matched
`f339a35a1bc271bda9e985f03d0d0f9911979617b375bd6bcadd08ccc6d80a43`.

Node returned `v22.23.3`, UID/GID `1000:1000`; output completed at 10,865 ms.
Whole-instance destruction and stopped inspection completed at 10,959 ms.
Cloudflare independently reported stopped with exit code zero. Replay returned
the same saved result without starting another job. This elapsed time is not a
billed CPU measurement or an engine/render performance result.

Application, Worker, namespace and registry tag were deleted; readbacks verified
absence. The local operator stopped and temporary Docker registry authentication
was removed. Receipts remain in the diagnostic worktree under
`.cache/startup-manifest-trial/`, including the deployed identity, exact image
metadata, phase result, replay, stopped-instance record and cleanup receipt.
All six approved jobs are now consumed. Settled billing is not yet verified.

The paired result strongly implicates index versus runtime-manifest selection in
this startup failure. It does not prove a general OCI-index incompatibility or an
exclusive vendor root cause. Follow the working documented packaging path and
retain build provenance separately. No support follow-up was sent and no provider
change is indicated. Native evaluation, rendering and hostile-input isolation
still need independent qualification. A new bounded four-case candidate is being
prepared around the existing engine/network/fresh-VM fixtures and the proven
manifest; it is not authorized by the exhausted startup allowance.

## Native engine and basic provider-boundary checks passed

The owner separately approved the four-case candidate at
`8590c0abfcaedbfa8a34dfd76ac3322f01c0fb55`, after both Linux and Windows passed
[CI run 37522530858](https://github.com/instruktlabs/kiln/actions/runs/37522530858).
The private deployment used the same original runtime manifest and the existing
production job controller. Remote config/layers and uploaded Worker SHA-256
`0e97f19c8617d20f1bc96880aaa95b9e9303e45b560c7f242f7e19146527fede`
were verified before its one-use coordinator was invoked at 20:04:01 UTC.

All four sequential jobs passed: actual installed-RC evaluation produced the
expected 1,912-byte GLB with digest
`f94d231ed3eb4843a03704872adc3f20b00c2ea24567cb5916407b40a2cf1d40`;
direct native TCP/DNS checks found the tested endpoints inaccessible; one VM wrote
a marker and confirmed a detached child was live; the next fresh VM found neither
marker nor matching child. Elapsed times including cleanup were 3,398, 15,320,
1,260 and 1,283 ms. They are not billed CPU or representative load measurements.

Each result confirmed stopped state and Cloudflare independently reported all four
instances stopped with exit code zero. Replay returned the retained batch without
new executions. The application, Worker, both namespaces and registry tag were
deleted, with absence verified. The local operator and temporary registry login
were closed. Evidence is retained under the diagnostic worktree's
`.cache/manifest-qualification-trial/`.

This qualifies this installed-engine fixture and the tested provider boundaries.
It does not qualify CPU previews/software rendering, hostile resource exhaustion,
cancellation and alarm recovery, public admission, live identity/tenant/storage
integration or production deployment. Those remain required. The original Linux
nested-namespace preflight still fails and must not be relabelled successful.
All ten jobs across the three approved trial scopes are consumed; a later trial
needs its own concrete scope and authorization. No support follow-up was sent.
