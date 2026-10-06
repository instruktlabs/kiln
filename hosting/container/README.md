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
controller change still needs exact-source CI and live failure-path qualification.

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
