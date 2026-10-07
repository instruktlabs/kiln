# Private hosted lifecycle qualification, October 7

The owner-approved candidate `4b3dc62ece74ec3b364f68b231a45d6deea15555`
passed its deployed gateway and native lifecycle qualification. This is private
Cloudflare integration evidence, not public-launch or live upstream OAuth acceptance.

## Candidate and results

All 25 CI checks passed before provisioning. Eight private Workers used temporary
D1, KV, R2 and seven SQLite Durable Object namespaces. The deployed module hashes,
current 100-percent versions, bindings, image references, nine migrations, disabled
public surfaces, logging and SSH were read back before invocation. No Google or
GitHub credential was bound to this candidate.

The fixed one-use run passed all 13 gateway preflight checks and all 21 native
stages. It created and read a procedural material, rendered and saved an asset,
reopened its editable source, exported and downloaded its GLB/material closure,
denied anonymous and foreign-account access, restored a removed material from the
saved revision, rendered again, and returned 429 after fourteen admitted MCP
requests. Denied source/material tool calls have HTTP 200 MCP error envelopes;
the checker verifies their denial and absence of leaked content.

The run consumed **20 VM starts**: fourteen coordinators, three evaluations and
three renders, below the approved ceiling of 22. Every observed instance stopped
with exit code zero. Admission was paused, with zero active requests or pending
cleanup, the allowance was permanently closed and no recovery alarm remained.

The render took 28.831 seconds; the render after restoration took 19.141 seconds.
The two 392-by-392 PNGs were byte-identical, SHA-256
`3f47657e2c3414ba0a54280cf04537e82f6d2fa3fa083482a2c0a777a4d6ca92`.
Visual inspection showed the expected textured cube. Both responses identified
software Vulkan/llvmpipe and full-material fidelity, without CPU fallback. The
in-loop result correctly remained `exactArtifact: false`; its input GLB hash matched
the downloaded 2,540-byte GLB. Independent glTF validation found zero errors and
warnings, one mesh/material/embedded PNG and no external resource URI. This small
fixture does not establish arbitrary scene quality, load capacity or owner acceptance.

Images remained pinned to:

- Coordinator: `sha256:d78f29a8565e2df4957f60607ee25645bff81e8221bc75b56b2992d7e17d4482`.
- Software renderer/evaluator: `sha256:64022900f0c298668076db054c44e019dad6a3813751a92dec7a06ceb734fe24`.

## Readback correction

The initial preflight refused to run. Cloudflare's raw script-settings endpoint
returned `observability: null`, while its CLI expanded disabled logging into
inactive defaults including `persist: true`. The verifier now requires independent
raw settings, rejects missing evidence and active/contradictory logging, and handles
the observed omitted empty collections and matching D1 ID alias. Regression tests
failed before the correction. All 425 hosting tests, typechecks, builds and targeted
lint passed after it; the correction is commit `f772edd`. The deployed runtime and
approved image bytes remained at `4b3dc62`.

The private remote observer also printed provider internal-error references while
its status, run and stop calls returned 200 and the durable results passed. Their
cause is unresolved. Retain this diagnostic separately from the successful actual
outputs and cleanup; qualify public HTTPS/client behavior without relying solely
on this development tunnel. No additional support message or compute retry was sent.

## Cleanup and costs

Before deletion, 36 synthetic R2 objects totaling 679,640 bytes were retained with
hashes. The operator rechecked exact IDs and stopped instances, removed the three
Container applications and eight Workers, then the bucket, D1 and KV. Final inventory
confirmed all seven trial namespaces absent too. The local observer was stopped
and port 8798 no longer listened. Registry images were intentionally preserved;
provider-managed Analytics Engine records have separate three-month retention.

The Analytics SQL catalog exposed the private dataset. Query readback confirmed
ingestion of the fixed route/status fields, and all six prepared alert queries
returned one numeric zero for an empty interval. No Cron was deployed in this
trial and no alert destination was configured; scheduled-health and delivery
qualification remain open.

Provider start-to-stopped intervals totaled 145.923 instance-seconds. At the current
[Container rates](https://developers.cloudflare.com/containers/platform/pricing/),
modeling fully allocated CPU over those intervals gives about **$0.0036** for
Container CPU/memory/disk before allowances. This is neither a metered invoice nor
the whole trial cost: Worker/DO/storage/image/egress charges and any startup billing
outside those timestamps are not measured here. The approved $1 was a spending
allowance, not a Cloudflare billing cap. Twenty actual starts are consumed; the
unused two-start ceiling does not authorize another run.

Local receipts: `.cache/lifecycle-operator/result-4b3dc62.json`,
`.cache/lifecycle-readback-4b3dc62-before3/`,
`.cache/lifecycle-readback-4b3dc62-after/`, and
`.cache/lifecycle-cleanup-4b3dc62/` (including `cleanup-receipt.json`,
`qualification-summary.json`, `independent-glb-validation.json`, images and retained
synthetic bytes). These ignored files contain local qualification evidence, not
publishable provider credentials.

## Identity and directory progress

Google and the organization-owned GitHub OAuth clients now exist. Their approved
credentials were encrypted and round-trip verified with Windows DPAPI outside
the repository. The exposed original Google secret was disabled. Neither provider
credential has been uploaded to Cloudflare, and successful live sign-in is unproven.
Google remains in testing mode; branding and production audience remain pending.

With explicit owner approval, an email was sent to `directory@anthropic.com` about
the local plugin's executable acknowledgement, the two validator policy holds and
Instrukt Labs publisher ownership. The connector returned a SENT receipt. This
was clarification, not a directory submission; no declaration or terms were accepted.

Remaining: deployed retention/recovery, live identity/account controls, operational
alerts and representative abuse/load/cost checks; a concrete approved public route
and real MCP clients; directory submissions; then the deferred README/Troy/site
documentation refresh. npm 1.0 and the GitHub release remain separate completed
deliverables. No new package was published by this work.
