# Private native lifecycle qualification stage

This component prepares the next private combined-service trial. It has not been
deployed, does not authorize spending and cannot reuse an earlier allowance.
The operator, remote bindings, exact images, cleanup and full combined candidate
still need qualification before requesting a new execution approval.

`lifecycle-run.ts` performs 21 fixed stages, in order:

1. Create and read a small procedural material.
2. Render and save an asset using its exact locked material revision.
3. Restore the program, read its editable source and export the saved revision.
4. Read its GLB and manifest; require exact evaluator image provenance and full
   material fidelity rather than accepting an unverified or CPU fallback result.
5. Download source, GLB and material closure. Match source bytes, the GLB hash and
   material contents to the preceding responses; require `no-store`.
6. Deny another account and an anonymous browser the owner's download. Deny
   foreign source/material reads without leaking their contents in error bodies.
7. Remove only the disposable owner's live material group through a private
   control, import the saved asset into its library, then retrieve the restored
   material and render the retained source again.
8. Require the next MCP request to be rejected by the configured compute quota.

This requires 14 admitted MCP requests and one quota rejection. The local actual
engine fixture observes three evaluations and three renders. The separate
`LifecycleBudget` permits at most 14 coordinator, four evaluation and four render
claims, a ceiling of **22 VM starts** once wired into the private wrappers.
Claims are transactional, survive reconstruction, consume failed starts and cannot
be refunded, reset or reopened. Closing before opening permanently refuses the
allowance. This proposed ceiling is not an active approval or a dollar estimate.

A transaction claims the lifecycle once before opening its ports. Interrupted,
concurrent or repeated invocations return the stored record and cannot retry the
sequence. Each stage stops the run on failure. HTTP requests carry abort signals;
MCP responses have a 140-second outer deadline, downloads 15 seconds, and body
reads, evidence retention and control/status operations ten seconds each. These
are outer observation bounds; production VM deadlines and cleanup remain separate.
Responses are limited to 8 MiB each and retained evidence to 64 MiB per run.

The runner seals the allowance and pauses admission on exit, then requires zero
active requests and pending cleanup. This is not proof of cloud-resource removal;
the outer operator must independently inventory and delete the disposable resources.
Its receipt contains stage names, outcomes, durations, response status/size/hash
and verified engine identity. Credentials, source, download URLs and exceptions do
not enter the receipt. Raw synthetic responses remain private bounded evidence.

The local native fixture creates a fresh host for each request against the actual
Node engine and tenant/R2 adapter. It uses a synthetic view producer and directly
addresses private storage for downloads. Therefore it does not qualify real
software Vulkan output, browser authentication or Cloudflare VM behavior. The
separate gateway preflight covers real local gateway/token routing with synthetic
identities; combining these stages is still required.

Adversarial replays of actual engine responses reject altered download bytes,
unverified manifest identity and leaked source/material data, including JSON-escaped
source inside error responses. Additional cases prove allowance concurrency,
one-use replay, oversized-body refusal and the actual ten-second evidence-write
deadline. Late evidence completion cannot resume an already failed sequence.

Live upstream OAuth, linking/deletion actions, real scheduled recovery, retention,
load, settled costs, alerts and public-client verification remain launch gates.
