# Private evaluation image

This is the CPU-only image for the explicit Cloudflare per-job adapter. It opens
no network listener. A private Durable Object starts a fresh VM from an immutable
digest with internet disabled, executes `evaluate.mjs` with piped input/output,
and destroys the entire VM before accepting a result. Do not run arbitrary user
source with this entry on the workstation or in the trusted MCP coordinator.

Build a minimal context containing exactly four files:

- This `Dockerfile` and `evaluate.mjs`.
- The qualified installed-package archive renamed `candidate.tgz`.
- `candidate.sha256`, containing its approved SHA-256, two spaces, and
  `candidate.tgz`.

Never use the checkout, an authored workspace, credential directories or all of
`.cache` as the Docker build context. Build for `linux/amd64`. The build verifies
the supplied archive and installs dependencies without lifecycle scripts. Retain
the final image digest, `/opt/kiln/package-lock.json`, `/opt/kiln/os-packages.txt`
and `/opt/kiln/node-version.txt`; the npm archive alone does not pin transitive
dependencies or establish the image's identity. The base image digest is shared
with the existing native preflight. The Linux image build and deterministic
installed-package fixture passed in [CI run 37479877969](https://github.com/instruktlabs/kiln/actions/runs/37479877969).
The RC image's runtime manifest subsequently passed the fixed evaluation and
basic provider-boundary checks in [the qualification record](../probe/QUALIFICATION.md).
Rendering, adversarial resource limits, recovery and production routing remain
unqualified.

The production controller now requires both `running === false` and a `null`
inspection after `destroy()` before releasing output or deleting its watchdog.
Destruction and inspection share a five-second budget. Unknown or failed readback
keeps the job unfinished for durable recovery. This follows the documented
[Container API shutdown contract](https://developers.cloudflare.com/containers/api/durable-object-container/).
Regression tests first reproduced accepted output after an unconfirmed shutdown,
then passed with the verification in place, including a stalled inspection and
recovery after an initially failed readback. All 136 hosted tests, three hosted
typechecks, five bundle checks and root typecheck/lint passed locally. This
controller passed exact-source Linux/Windows hosted checks in
[run 37525915541](https://github.com/instruktlabs/kiln/actions/runs/37525915541).
Live failure-path qualification remains open.

The entry's byte limits and engine schema validation are defensive transport
checks. A JavaScript timer, Linux user ID and the engine's local VM implementation
are not security boundaries. Cloudflare must enforce the no-network policy and
the outside controller must enforce admission, deadlines and destruction. The VM
must contain no provider credentials, user account records, other tenants' files,
R2 mounts, reusable source or snapshots. Treat every byte returned by it as
untrusted, including QA claims, filenames and diagnostics.

Before production routing, qualify the exact deployed image and Worker pair:
fixed native fixtures and CPU images, blocked internet/metadata/localhost access,
cross-job filesystem isolation, descendants and infinite-loop deadlines, output
floods, cancellation during startup and execution, memory exhaustion, controller
restart/alarm recovery, and confirmed container destruction. Run only fixed
adversarial fixtures in this private probe, with bounded concurrency, compute,
cost and teardown. Record cold starts and billed resources separately from engine
compute time. The old Bubblewrap adapter remains fail-closed and has no automatic
fallback to this entry.

## Software-rendering candidate

`Dockerfile.software` uses the same four-file context and evaluator entry, adding
Mesa's software Vulkan implementation. Copy it into the context as `Dockerfile`.
Build with `--platform linux/amd64 --provenance=false` to retain the directly
addressable runtime manifest. The final immutable image digest, rather than the
Dockerfile alone, identifies installed OS and npm dependencies. No probe script,
credential, network listener or storage mount is included in the image.

The exact main `1.0.0` archive (`6ed3d6b9...1508`) was installed locally in image
`sha256:84a0fa62bcffa010b9ac1c5f2f0e2cf9045a9cdb6407f621e8049e6a37f9de99`.
With networking disabled, all capabilities dropped, no privilege escalation,
two CPUs and a 4 GiB memory limit, the real entry produced the same 1,912-byte
GLB twice and its CPU preview passed at 128 pixels. The packaged renderer also
produced six textured views across all three backdrops using llvmpipe/Mesa
25.0.7 and Vulkan; each view retained red and green texture evidence. Temporary
test containers were removed. These are local functionality checks, not
Cloudflare isolation, throughput or cost measurements.

The image lock SHA-256 is
`fdcb5cd754cdb78de52eb530efb9a993a30c8742e83c939103edc6112fd77ba1`.
The diagnostic worktree retains its inventories, exact image, CPU GLB/PNG and six
software images under `.cache/stable-software-image/`. CI now builds both image
variants using the explicitly recorded public package and tests the installed
entry; the software variant additionally runs the packaged renderer fixture.
While that public record still names the RC, CI does not qualify the stable
archive by implication. A prepared, reviewed provider trial is still required
before uploading or running this new stable image on Cloudflare.

Both CI image variants passed at source `b34d56f` in
[run 37526078285](https://github.com/instruktlabs/kiln/actions/runs/37526078285).
That run uses the public RC archive and therefore complements, rather than
replaces, the exact-stable local receipt above. The stable image's retained npm
lock also returned zero known findings in an `npm audit --omit=dev` on 6 October.
No cloud resource was created for this image preparation.
