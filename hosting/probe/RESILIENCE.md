# Stable native rendering and recovery qualification

Prepared on 6 October 2026. **Not yet authorized or executed on Cloudflare.**
All ten jobs in the earlier three scopes are consumed and their resources removed.
This candidate proposes a new, single twelve-job batch with a separate $1 trial
allowance. It must stop on the first failure and cannot reset or repeat its claim.
The allowance is a planning bound, not a Cloudflare-enforced invoice cap.

## Exact candidate

`resilience.wrangler.jsonc` pins the independently built Linux/AMD64 software image
`sha256:84a0fa62bcffa010b9ac1c5f2f0e2cf9045a9cdb6407f621e8049e6a37f9de99`.
Its image configuration is
`sha256:9c369c15226828815e0ebdb15cdc2091eb426fb42aa016f1556c8723307cddf3`.
It contains the now-public stable package whose archive SHA-256 is
`6ed3d6b9964429f14c3c6a0a6a13d56be509dd0f40b07061a37d491f901c1508`.
The package lock audit reported zero known findings. The separate software image
adds Mesa Vulkan/llvmpipe to the CPU image; it contains no probe scripts, provider
credentials, user assets or listening application server.

Pinned Wrangler 4.147.0 dry-run compilation produces a 30.68 KiB Worker with SHA-256
`5d4021d4bbdc4920ccffe1eb34f93cd64f6d9752e73e19ffff75bede9ad594b8`.
Gitleaks finds no matches in the probe source or actual Worker/source-map output.
Production bundle checks exclude all probe and test imports.

## Bounded provider work

Each job uses a fresh `standard-2` instance and the production
`ContainerEvaluationJob` controller: immutable image, numeric UID/GID `1000:1000`,
Internet disabled, bounded input/output, durable watchdog, whole-instance
destruction and stopped-state confirmation. Only the following fixed programs
can run through the private `runFixed` service RPC:

| Order | Case | Required evidence |
| --- | --- | --- |
| 1 | CPU preview | Actual stable evaluation and 128px CPU PNG matching the independent local digest |
| 2 | Software views | Software Vulkan adapter; six 128px textured views across neutral/dark/light; retained PNGs, hashes and colour counts |
| 3 | Native networking | Direct TCP/DNS outside Node vm cannot reach the tested Internet, metadata or renderer endpoints |
| 4 | Marker and child | Write a temporary marker and establish a detached child is alive before destroying the VM |
| 5 | Fresh VM | Neither marker nor child from the previous VM exists |
| 6 | Native deadline | A native parent/child busy loop reaches readiness; the host deadline destroys the VM |
| 7 | Native cancellation | Cancel 250ms after native readiness; destroy the whole VM and return the cancellation outcome |
| 8 | stdout flood | Native readiness followed by output exhaustion trips the 1KiB stdout bound and destroys the VM |
| 9 | stderr flood | Native readiness followed by output exhaustion trips the 16KiB stderr bound and destroys the VM |
| 10 | Memory exhaustion | A child allocates beyond the VM allowance; SIGKILL and a positive kernel OOM counter delta are required |
| 11 | Durable recovery | Inject one controller destruction failure; the real Durable Object alarm must subsequently confirm whole-VM destruction |
| 12 | Engine afterward | A fresh VM executes the actual stable image entry and returns the expected 1,912-byte GLB digest |

Native deadline and recovery jobs have 15-second deadlines; the others have
60-second deadlines. Destruction/readback has a shared five-second bound. Native
deadline evidence requires readiness at least one second before the deadline, so
a startup failure cannot pass as an execution timeout. Recovery is observed from
a different Durable Object for at most 45 seconds; the observer never calls the
alarm handler itself. Operator cleanup after a missing alarm remains a failed
result, even if a later callback succeeds.

stdout is limited to 64KiB except the explicit flood case and software views.
The six-image response is bounded at 512KiB; local measurement is 274,255 bytes.
PNG signatures, structure, CRCs, dimensions and digests are validated outside the
VM. Downloaded images must also be decoded and inspected before accepting the
cloud rendering result; these are fixed material fixtures, not comprehensive
visual-quality acceptance. SQLite-backed DO storage permits a combined key/value
up to 2MB, above this bounded receipt
([Cloudflare limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).

The coordinator persists its claim before execution, retains each result, runs
sequentially and stops at the first failed case. Retries return the saved record;
interrupted claims cannot silently restart. HTTP handlers always return 404;
there are no routes, workers.dev/preview URLs, cron triggers or identity bindings.
Native stdout/stderr logging is disabled. No arbitrary user source or external
model call is accepted. A loopback-only operator receives the private service RPC.

At current [Container rates](https://developers.cloudflare.com/containers/platform/pricing/),
twelve fully busy 65-second standard-2 jobs model approximately $0.028 for CPU,
allocated memory and disk before included allowances. Worker/DO, registry and
other charges are additional. This is a conservative short-trial calculation,
not a settled invoice or production capacity measurement.

## Local evidence and execution procedure

The focused tests first failed for missing private configuration and acceptance
of truncated PNGs, then passed after the fixes. All 148 hosted tests, all three
hosted typechecks, five production bundle checks, root typecheck and lint pass.
Real workerd RPC tests deny public HTTP execution, fail closed without native
compute and retain the one-use fixed batch across retries.

All twelve fixed programs were exercised in restricted local Docker containers.
The six material views and CPU preview decoded successfully; one material view
was visually inspected. The software fixture initially truncated stdout at 64KiB;
it now waits for the output stream to flush. The memory fixture observed one
cgroup OOM kill with a 512MiB local cap. Busy-loop/flood checks prove those fixtures
run and can be stopped locally, not that Cloudflare's deadlines or alarm recovery
work. All local containers were removed and absence verified. Local receipts are
under `.cache/resilience-local/`; the untracked local runner is
`.cache/qualify-resilience-local.mjs`.

Before requesting cloud approval, require exact-source Linux/Windows hosted CI.
After approval, upload only the immutable runtime manifest and verify remote
digest/config/layers. Verify the deployed Worker bundle/image identity and absence
of public routes/triggers. Trigger once through the private operator and retain
the results. Verify all instances stopped, including any failed case. Replaying
the RPC must return the retained record without new jobs. Remove the exact trial
application, Worker, namespaces and registry tag with absence readbacks; stop the
operator and remove its temporary registry login. Do not restart a failed batch
or recreate its namespaces under this allowance.

Passing this trial would qualify these native/rendering/failure paths only.
Authenticated MCP routing, account controls, private artifact lifecycle, global
admission, load/cost measurement, production deployment and directory submissions
remain separate launch work.
