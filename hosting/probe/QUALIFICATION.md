# Proposed manifest-based native qualification

Completed with owner approval on 6 October. All four jobs passed; this allowance
is now consumed and all temporary resources were removed. The original five-job allowance and
the separately approved one-job manifest comparison are consumed. Do not recreate
their namespaces or reset their claims. This candidate requests up to four new,
sequential jobs with a separate $1 trial allowance; stop on the first failure.
The allowance is a planning bound, not a provider-enforced billing cap.

`qualification.wrangler.jsonc` uses the proven original runtime manifest
`sha256:db79551579a9abd33f7589a4da4d57947364ddf3dd37b79f766e202f2703edc8`
and the existing fixed `worker.ts` controller. No image rebuild, dependency
installation, user change or runtime-code change is part of this candidate.
Keep the private operator local and bind it to `KilnProbeControl`; do not publish
any HTTP route, domain, preview URL or automatic trigger.

The four cases, enforced by `runProbeOnce`, are:

1. Evaluate the installed public RC's fixed box program and require the same
   1,912-byte GLB SHA-256 as the independent local and Linux CI fixtures.
2. Probe direct TCP/DNS from native Node outside the JavaScript sandbox. Public
   Internet, metadata and renderer endpoints must remain inaccessible.
3. Write a temporary marker and start a live detached child in one fresh VM,
   then destroy the whole VM.
4. In a different fresh VM, verify neither the marker nor the child exists.

Every job uses the production `ContainerEvaluationJob` controller: immutable image
selection, numeric UID/GID `1000:1000`, disabled Internet, standard-2, 60-second
deadline, durable alarm and five-second whole-instance destruction budget. The
probe additionally inspects the stopped state before accepting each result.
Bound output; retain fixed metadata and digest only, never raw native diagnostics.
The coordinator persists its one-use claim before any execution and stops after
a failed result. An interrupted or repeated trigger cannot restart the batch.

Before invocation, verify exact CI source, bundle SHA-256, deployed image map,
private bindings and absence of public URLs. Publish only the existing platform
manifest, then inspect its digest/config/layers. Wrangler must report image
preparation ready. After execution, retain results, verify stopped instances and
remove the exact application, Worker, namespaces and registry tag with readbacks.
Do not rerun a failed or interrupted batch under this allowance.

Four fully busy 65-second standard-2 jobs would cost approximately $0.0093 for
Container CPU/memory/disk before allowances at the researched rates; registry and
Worker/DO charges are additional. This is not a settled invoice or a load estimate.

Passing these checks would qualify basic engine execution and the tested provider
boundaries only. CPU preview/software rendering, adversarial resource exhaustion,
cancellation/alarm recovery, authenticated MCP, account controls, persistence,
capacity and production launch remain separate gates.

Local qualification passes 134 hosted tests, all three typechecks, five production
bundle-boundary builds and root lint. The private configuration check first failed
with the missing candidate, then passed after its addition. Pinned Wrangler
4.147.0 dry-run deployment passes. Actual JavaScript and source-map secret scanning
reports no matches across 43.09 KB. The Worker JavaScript SHA-256 is
`0e97f19c8617d20f1bc96880aaa95b9e9303e45b560c7f242f7e19146527fede`.
Exact-commit Linux/Windows CI is still required. Runtime source is unchanged from
the existing probe; this preparation changes configuration, tests and records only.

## Approved provider execution

Both CI platforms passed source `8590c0abfcaedbfa8a34dfd76ac3322f01c0fb55`
in [run 37522530858](https://github.com/instruktlabs/kiln/actions/runs/37522530858).
The owner then approved this four-job batch and its $1 allowance. Invocation began
at 20:04:01 UTC after exact remote manifest/config/layer and uploaded Worker checks.
Worker/version metadata showed no public routes, URLs, external bindings or cron.

| Case | Result | Elapsed including cleanup |
| --- | --- | --- |
| Installed engine box | Passed; 1,912-byte GLB SHA-256 `f94d231ed3eb4843a03704872adc3f20b00c2ea24567cb5916407b40a2cf1d40` | 3,398 ms |
| Native TCP/DNS checks | Passed; tested endpoints were inaccessible | 15,320 ms |
| Marker and detached child | Passed; child confirmed alive before whole-VM destruction | 1,260 ms |
| Fresh VM | Passed; neither marker nor matching child present | 1,283 ms |

Every result verified stopped state. Cloudflare's instance readback independently
reported all four stopped with exit code zero. Repeating the private RPC returned
the exact saved batch without new executions. These elapsed values are not billed
CPU measurements, capacity estimates or representative cold-start percentiles.

The application, Worker, both namespaces and registry tag were removed; subsequent
readbacks verified absence. The loopback operator stopped and temporary registry
authentication was removed. Receipts are under the diagnostic worktree's
`.cache/manifest-qualification-trial/`. All ten jobs across the three separately
approved scopes are consumed. No stable package or public service was published.
Further tests need a prepared, reviewed scope and new authorization.
