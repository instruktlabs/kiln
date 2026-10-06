# Private evaluation image

Current qualification: the exact stable software image and per-job controller
passed the twelve fixed Cloudflare cases in [the resilience record](../probe/RESILIENCE.md).
The earlier preparation notes below retain their narrower evidence. Production
dispatch, representative load and costs remain open. The separate MCP coordinator
image described below has local Docker proof only.

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

`Dockerfile.software` extends the four-file evaluator context with the built
`native-render.mjs` and `render.mjs`, for exactly six files. It adds Mesa's software
Vulkan implementation. Copy it into the context as `Dockerfile`.
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

## One-shot software render entry

The current software image includes `/opt/kiln/render.mjs`, a fixed one-shot
producer selected only by `KilnRenderJob`. The private coordinator sends GLB bytes
and view options through the versioned renderer port. The entry validates the
request and self-contained GLB before loading graphics, explicitly selects the
pinned Mesa ICD, emits bounded JSON and exits. It opens no listener and receives
no source program, tenant information, storage binding or credentials.

After building the hosting bundles, put `.cache/hosted-worker/native-render.mjs`
and `hosting/container/render.mjs` into the otherwise unchanged minimal software
context. Verify the built file against `native-render-build.json`. Build for
Linux AMD64 without provenance, then run:

```sh
node hosting/scripts/smoke-native-render.mjs kiln-software-entry:local-v1
```

The script creates and removes one uniquely named offline local container with
two CPUs, 4 GiB memory, 128 PIDs, dropped capabilities and no privilege escalation.
The fixed trusted fixture is passed over stdin, without a workspace mount. It
exercises the actual renderer entry through the installed private port and decodes
eight 128px PNGs: six views across three backdrops, a beauty image and an explicit
camera view. Each retains red/green material evidence. Request identity, exact
camera metadata and malformed-input rejection are checked. The entry succeeds
without inheriting the image's Vulkan environment. CI runs the same check.

Local final image manifest
`sha256:64022900f0c298668076db054c44e019dad6a3813751a92dec7a06ceb734fe24`
passes this procedure with the exact published stable archive. Its dependency
lock remains `fdcb5cd754cdb78de52eb530efb9a993a30c8742e83c939103edc6112fd77ba1`.
Receipts, PNGs, inventories and the six-file context receipt are retained under
`.cache/software-render-entry/final-qualification/` and its parent directory.
The test container's removal was independently read back. No cloud upload or
execution occurred. The newly integrated coordinator/render job path still needs
provider qualification; the earlier twelve-case trial used the historical image.

## Private MCP coordinator image

`Dockerfile.host` serves the installed package's actual MCP factory through the
private Node adapter. Unlike the evaluator image, it has a private port 3000
listener. Its explicit remote evaluator profile sends source only to the outside
controller's fixed evaluation endpoint. It contains no identity-provider secrets,
tenant identifier, storage mount or public route. `KILN_PUBLIC_ORIGIN` is its only
application setting and must be an exact HTTPS origin.

From the checkout root, using the pinned Node/npm tools:

```sh
npm run build --prefix hosting
node hosting/scripts/prepare-native-host.mjs /path/to/qualified-kiln-1.0.0.tgz
cd .cache/native-host-image/context
npm install --package-lock-only --ignore-scripts --no-fund
cd ../../..
docker build --platform linux/amd64 --provenance=false --tag kiln-native-host:local .cache/native-host-image/context
node hosting/scripts/smoke-native-host.mjs kiln-native-host:local
```

The preparer requires an empty directory inside this checkout's `.cache`, verifies
the archive against `.github/published-candidate.json` and copies the checked
runtime bundles, entrypoint and Dockerfile. Its seven-file context becomes eight
files after lock generation. Never expand the build context to include the repo,
credentials or other caches. Retain the generated lock and inventories: separate
builds can resolve different transitive dependencies and have different image
digests even when the package archive is identical.

The qualification script creates one disposable local container with networking
disabled, a read-only filesystem, non-root user, dropped capabilities and bounded
memory/CPU. It checks readiness, modern tool discovery, legacy initialization,
foreign-host/credential rejection and failure without private services. No host
port is published. The script removes its uniquely named container and saves
identities, inventories and the result under `.cache/native-host-image/qualification`.
CI runs the same procedure without registry publication or Cloudflare access.

Local image `sha256:5402d67069e8b5c9d355e4f49b9ae92d353171b381d27496f85f5794adf95d75`
passed all six checks with the exact published 1.0.0 archive and fourteen registry
tools. Its retained dependency lock SHA-256 is
`f635b9ba48046e4fdb265eb980df55cf1303c4bc0fd109db477ef870ef0b273f`.
Both the hosting lock and generated image lock reported zero known npm audit
findings. This image has not been uploaded or qualified on Cloudflare. Storage,
child evaluation/render dispatch and global admission are now implemented and
locally tested; the combined deployed path remains an end-to-end qualification
requirement. The historical coordinator image above predates render-port injection
and must not be used as the integrated launch candidate.

The render-enabled coordinator was rebuilt locally as manifest
`sha256:029c4fba6f0521a5a18c9dde364d07b5ffc076fe4d988358868950de40134b66`.
Its exact stable archive, unchanged dependency lock and all six coordinator checks
pass. The receipt is `.cache/native-host-render/qualification/receipt.json`.
It has not been uploaded to Cloudflare.
