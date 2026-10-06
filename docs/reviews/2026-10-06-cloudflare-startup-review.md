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
| Managed-image diagnostic PR #150 | Exact `c6b119b`: local gates, Linux/Windows hosted CI and deployed fixed Node command pass; resources removed | Custom-image/Kiln controls and hostile-source qualification remain; two trial jobs left |
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
