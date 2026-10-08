# Public branch inventory

Verified through GitHub on 7 October 2026. Eight branches exist in
`instruktlabs/kiln`; contributor PR branches live in the contributor's fork and are
not part of this list. No branch or worktree was deleted during this audit.

| Branch | Tip | Purpose and current disposition |
| --- | --- | --- |
| `main` | `7581ac4` | Protected public default branch. Keep. Hosting removal PR #157 is merged here. |
| `codex/sdk-host-release` | `617c982` | Active PR #158, unreleased 1.1.0. Keep and fix its two CI failures. |
| `codex/v1-container-execution` | `7f4e98e` | Closed PR #147, superseded by merged #153 and the private hosting application. Cleanup candidate after tip preservation verification. |
| `codex/v1-account-controls` | `f6a3315` | Closed PR #149, superseded by #153/private hosting. Same preservation gate. |
| `codex/v1-native-startup-diagnostic` | `b0875b5` | Closed PR #150, superseded by #153/private hosting. A local worktree still uses this branch; do not delete that checkout as a side effect. |
| `codex/v1-operations-qualification` | `7fc5bb3` | Closed PR #154. Its application work was preserved in the private import before public cleanup. Verify final tip before removing its public ref. |
| `codex/v1-recovery-runbook` | `c9bf266` | Closed PR #155, preserved privately. Same preservation gate. |
| `codex/v1-agnostic-setup` | `f99f1b8` | Closed PR #156. Shared setup is retained by #157; hosting was imported privately. The original local checkout still has working documentation edits, so retain it until those are saved. |

These six old branch names are remnants of the earlier stacked release work, not
six remaining feature efforts. Squash merges and the public/private split mean
Git's raw ahead/behind count alone does not establish whether their changes were
preserved. Compare their PR changes and final files against #153/#157 and the
private provenance before proposing deletion. Preserve any unique work first.

Remote branch deletion, if later approved, removes a reference; it does not remove
the public repository, stars, forks, issues, releases or contributor PRs. It must
not be combined with history rewriting, force pushes or recursive workspace
cleanup. No deletion is needed to fix #158 or publish the next package.

## PR #158 failed run

[Run 37699710117](https://github.com/instruktlabs/kiln/actions/runs/37699710117)
finished with two failures at `617c982`:

- Windows: `gpu rejoins a local renderer after the service joined at startup exits`.
  One concurrent capture reported that the old local service was absent.
- Linux, community-exporter pass: `concurrent cold starts join one verified managed
  service with 0ms health warmup`. One launcher reported that its child exited
  during startup. The retained error tail does not identify the underlying Node
  exception, so the precise cause still needs investigation.

All package-install matrix jobs, software Vulkan and render-service checks passed;
the independent native checks and website also passed.

A deterministic regression test now reproduces the Windows reconnection race: one
capture replaces a dead service while another receives a delayed failure from the
old connection. The latter previously treated the replacement's healthy socket as
a reason to rethrow the old error. The fix joins the already-selected replacement.
Both the failing-before and passing-after results were observed; 26 focused
lifecycle/selection tests passed locally.

The original Linux concurrent-start failure has not reproduced in ten repeated
lifecycle runs (120 passing tests) under Node 22.23.3 and Bun 1.4.2 in Docker. That
is limited evidence, not a root-cause explanation. A separate regression test
reproduced why the failed CI diagnostic hid its cause: only the final three stderr
lines were retained in the reported error. The fix exposes the already-bounded
2,000-character error tail. All 13 Linux lifecycle tests then passed, including
the diagnostic regression. Keep the candidate unqualified until the unresolved
Linux failure has been investigated and required checks pass; do not mask it with
unconditional retries or relaxed assertions.

### Follow-up at `9312eb4`

All 15 required checks passed, including both full engine jobs, all seven native
package platform/version jobs, software Vulkan, render-service tests, website
build and both isolation checks. The engine run is
[37703664546](https://github.com/instruktlabs/kiln/actions/runs/37703664546).
This closes the failing-check handoff for that candidate. The original Linux
startup exception remains unreproduced and its exact cause is unknown; the new
bounded diagnostic is retained for a recurrence. No retry or assertion weakening
was introduced.
