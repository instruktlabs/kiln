# Rendering and materials

Kiln provides CPU geometry views and GPU PBR views. Use the returned `viewFidelity` to determine which visual conclusions a render supports.

Review an authored animation with the same sampler used by MCP:

```sh
kiln animation asset.kiln.js --clip Walk --phases 0,0.25,0.5,0.75,1 --views walk.png --render gpu --json
```

A saved program reference can replace the source filename. Phases are fractions of
clip duration; `--frames 4` selects an evenly spaced count instead. Use `--camera`
for a named angle, `--shot camera.json` for one shared camera-shot object, and
`--framing locked|follow`. `--per-frame` writes numbered PNGs; the JSON receipt
identifies their phases, paths and material fidelity. Images show posed derivatives
of the exported clip, without changing source or replacing the delivery GLB.
Use `--render cpu` when geometry-only review is sufficient. Intermediate samples
can expose contact or attachment problems but do not establish continuous collision
safety. See `kiln animation --help` for the complete options.

| Mode | Use |
|---|---|
| `--render auto` | Use GPU views for textured or metallic scenes when available; otherwise use CPU geometry views |
| `--render cpu` | Deterministic geometry review without a GPU |
| `--render gpu` | Require GPU rendering; report failure if unavailable |
| `--render-port URL` | Select a GPU render service |

CPU views show silhouette, orientation, proportion, and contact. They do not reproduce the asset's PBR materials. Translucent (opacity below 1) surfaces are composited after opaque geometry, farthest first, so parts behind glazing stay visible whatever order the scene lists them in. Use GPU views to review textures, roughness, metalness, and normal relief. GPU output can vary by device and driver.

### Review lighting

New GPU tool captures use **`review-neutral-v1`**. The rig uses the room PMREM
environment at intensity 0.4352, white hemisphere light at 1.0879, and white
key/fill/rim lights at 0.136/0.0204/0.0204. The directional positions remain
`[4,7,5]`, `[-4,3,2]`, and `[-2,5,-5]`; shadows remain off. Exposure is 0.9.

Review Neutral derives from the [Khronos PBR Neutral construction](https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral),
with glare compensation reduced from 0.04 to 0.015 for this measured rig,
compression starting at 0.785 and highlight desaturation 0.15. It is a Kiln
variant, not the unmodified Khronos mapper. The white lights and gentler display
transform preserve base-colour hue while leaving orientation and specular cues.
The analytic inverse keeps every named backdrop inside the tone-mapped pass,
so clear pixels match the CPU table and silhouettes retain the existing MSAA path.

In the calibrated D3D12 chart, a key-facing metalness-0, roughness-1 panel authored
as sRGB `#C0362C` reads `(193,51,40)`, compared with `(255,177,147)` under
`neutral-studio-v1`. Mean CIEDE2000 error over 24 ColorChecker sRGB patches plus
that orange is 0.51 for the new rig, versus 28.09 for tool v1. This is a reference
orientation calibration, not a promise that every shaded pixel equals its albedo.
Roughness, surface orientation, reflections and the destination's lighting still
change appearance. Review dark silhouettes on neutral or light when they merge
with the dark backdrop. GPU images remain visual evidence only; QA receives no pixels.

Author albedo for the material and its calibrated destination; do not darken it
to compensate for bright review lighting. Existing assets compensated for v1 may
look too dark in the new rig and need individual material review. There is no
automatic albedo conversion.

`neutral-studio-v1` and `gallery-studio-v1` retain their original lights and ACES
exposures (1.38 and 0.9). Camera requests that already accept `lightingPresetId`
can still select either ID; HTTP uses `lighting_preset_id`. Legacy direction-only
requests use the new default. The website poster script continues to select
`gallery-studio-v1`. Composer's former `neutral-studio-v2` default had no renderer
definition; new presentation documents now use `review-neutral-v1`. Saved
documents naming the unsupported ID require an explicit edit; it is not aliased.

The tool input schemas and cache-key format are unchanged. An explicit lighting
ID separates camera cache entries. Renderer source and dependency fingerprints
also invalidate captures with an omitted lighting ID after this upgrade; old
receipts retain their producer identity. Upgrade the host and renderer together.
An incompatible service already on the shared socket is reported, never replaced
automatically. Existing cached images remain historical evidence of their old rig.

### Running the GPU renderer

[`render-service/`](../render-service/) in this repository is the renderer: GLB bytes in, PBR PNG views
out, headless three.js `WebGPURenderer` on Dawn. No browser and no X server.

Renderer code is included with Kiln. Keep optional dependencies enabled when
installing the official package so its native GPU dependency can be installed at
the package root. Check `kiln service status` before changing an installation;
missing or incompatible dependencies require reinstalling Kiln with optional
dependencies enabled. A source checkout uses `bun install --frozen-lockfile` at
the repository root. Dependency readiness alone does not prove GPU/device support.

When local dependencies are available, CLI and MCP auto mode start the service lazily on
the first view that needs PBR shading. A managed service is shared by compatible clients
and survives the session that started it. It exits after five minutes with no admitted
uploads, queued jobs or active renders. Health polling does not extend that timeout.
`RENDER_SERVICE_IDLE_MS` configures managed idle time from 1 to 3,600,000 milliseconds.

After renderer installation or repair, call `kiln_renderer({action:"reprobe"})` in
the existing MCP or native session. It refreshes the connection and resets a failed
local startup attempt; the next view starts the service if needed. Reprobe does not
install dependencies, start/stop a service, or render. It preserves the selected
CPU/local/remote mode and credentials. Restart the host after changing environment
variables, credentials or Kiln itself. `kiln service reprobe` checks readiness in its
own CLI process; it cannot refresh a different running session.

`kiln discover --capabilities --json` and MCP `kiln_discover({capabilities:true})`
report `renderer` readiness without starting a renderer or requesting an image.
Renderer selection uses an explicit `--render` first, then `KILN_RENDER`, then
`auto`. The selected value must be `auto`, `cpu` or `gpu`; an invalid value names
its source (`--render` or `KILN_RENDER`) in the error. An explicit valid option
overrides even an invalid environment value. This applies to render/capture,
generation, inspection, animation, saving and migration rebuilds. `edit` only edits
retained source and never selects a renderer. With `KILN_RENDER=cpu` and no override,
CLI commands neither discover nor start a render service. The CLI also reads
`KILN_RENDER_PORT_URL`; MCP reports its session's selected route and attached port.
`configured` describes routing, not successful
rendering. `on-demand` means local dependencies are ready but no GPU has been tested;
`available` means compatible health responded. `authentication-required` means a
token is missing; `authentication-unverified` means one is configured but public
health cannot prove it works. Unknown injected ports remain `unknown`.
Each capability request refreshes health, while the session's route stays fixed.
`reprobeRequired` identifies a session that can attach a newly ready renderer by
calling `kiln_renderer` with `action:"reprobe"`. Existing view operations keep their
original connection; subsequent views use the refreshed one. Only actual returned
`viewFidelity` establishes material evidence.
CPU mode does not probe services, and ordinary Discovery searches remain offline.

The same capability response lists `materials.approvedTextures` as exact resource
IDs grouped by allowed material slot. Placeholder swatches are excluded. Local
workers report their embedded catalog; a resolver installed only in the parent
process is not available to them. An external evaluator reports `null` unless its
host declares resources. `resourceEvidence: configuration-only` means a resource
can be requested, not that its bytes have been fetched or validated. The render
still validates actual resource bytes and reports failures. Use `loadApprovedTexture`
or `materialRecipe` with the listed IDs, and `proceduralTexture` for other surfaces.

Start it by hand from the Kiln installation root for a service that remains running
even while idle:

```bash
node --import ./render-service/src/register-hooks.mjs render-service/src/server.mjs
```

On Windows, automatic startup uses the bundled Windows PowerShell launcher to
isolate the shared renderer from shell output pipes. The CLI can then finish while
the renderer remains available. Launcher failures are reported directly; if the
native renderer exits during startup, use the manual command above to inspect its
driver error output. Automatic startup does not capture that native stderr stream.

Managed services use port 8000 by default, or `KILN_RENDER_SERVICE_PORT` on the client.
Set `PORT` to the matching value when starting a service manually. A manual start has
`RENDER_SERVICE_MODE=manual` by default and no idle shutdown. Hosts never stop a shared
service merely because their own session ends.

**The socket is the registry.** `/health` identifies the protocol, source and dependency
build, capture producer, process and lifetime mode. A client joins only verified compatible
health. An old, incompatible or unresponsive listener is reported and left in place; it is
not treated as an available renderer or automatically replaced. The initiating PID records
provenance and does not control the lifetime of other clients' work.

```bash
bun run kiln service status   # installation, health, build identity and lifetime
bun run kiln service start    # start a managed local service now, or report the current one
bun run kiln service reprobe  # fresh check; nonzero unless a running service is verified compatible
bun run kiln service stop     # explicitly stop the verified configured local service
```

`status` and `reprobe` do not install packages or stop services. The old `service prune`
command is removed. `stop` rechecks the configured loopback service's identity before
signaling it; a remote service's reported PID never authorizes killing a local process.
`start` uses the same launcher as an on-demand view and prints the port, renderer, process,
lifetime and build fingerprint. It joins a current service rather than starting a second
one, and exits nonzero without starting anything when the installation is not ready or a
stale, foreign or unknown listener holds the socket; it never replaces a listener. The
service it starts is managed, so it exits after its idle timeout and the next view that
needs it starts it again; start one by hand, as above, for a service that stays running.

**Either way it binds loopback, and widening that costs a token.** `POST /render` takes a 48 MB GLB
and renders it on the GPU one frame at a time, so an exposed bind with no auth hands any caller on
that network both your GPU and a binary-asset parser. `HOST` widens the bind and a bind wider than
loopback requires `RENDER_SERVICE_TOKEN` -- without one the service refuses to start rather than
warning. `RENDER_SERVICE_ALLOW_UNAUTHENTICATED=1` waives that when something in front of the process
already authenticates for it. The container image sets `HOST=0.0.0.0` itself, because a container
binding loopback is unreachable through `-p`.

For local render services, client sessions automatically inherit `RENDER_SERVICE_TOKEN` as a fallback when `KILN_RENDER_TOKEN` is unset, whether starting on demand or joining an existing local service sharing the same environment on port 8000. `KILN_RENDER_TOKEN` remains the explicit client credential: set it to override the local token or to authenticate against a remote service. Explicit remote endpoints (`--render-port URL` or `KILN_RENDER_PORT_URL`) never infer credentials from `RENDER_SERVICE_TOKEN` and require `KILN_RENDER_TOKEN` directly. An explicit URL with exactly the shared local socket's origin (`http://127.0.0.1:8000`, or the `KILN_RENDER_SERVICE_PORT` port) names that socket, not another device, so it is the local route with local credentials. See the service README for deployment and authentication options.

`--render cpu` neither probes nor starts a service. Local `auto` and `gpu` can start one
on demand; `gpu` requires a successful GPU result instead of accepting a CPU fallback.
An explicitly selected remote URL stays remote on failure and never starts a local GPU
as a substitute. A URL naming the shared local socket takes the local route instead: it
joins or starts the local service on demand, and starts it again after a managed service
exits idle. Use the same compatible Kiln build on the renderer device.

In `auto` mode, ordinary untextured scenes with zero metalness and no advanced
material extensions select CPU views,
even when a GPU is available. Use `--render gpu` to review PBR appearance for these
scenes, including roughness on nonmetallic surfaces. This deliberate CPU selection
is distinct from an unavailable GPU service causing degradation. Read `viewFidelity`,
`degraded` and `degradeReason` before drawing material conclusions. Structural QA
does not use image pixels.

The service accepts self-contained GLB input: embed buffers and PNG images, or use bounded
base64 data URIs. External URLs and file paths are rejected before loading. PNG was already
the native decoder's supported image format; JPEG, WebP, AVIF and KTX images now fail
explicitly instead of losing their maps silently. PNGs are limited to 4,096 pixels per
dimension and 33,554,432 decoded pixels in total. Compressed geometry extensions are not
supported. GLBs are limited to 48 MiB, with additional JSON, accessor and hierarchy bounds.

Admission includes uploads, queued jobs and running work: at most eight jobs and 256 MiB
of reserved input bytes. Excess admission returns HTTP 503. A stalled upload expires after
15 seconds with HTTP 408. A disconnected queued job is removed immediately; active native
work finishes before its resources are released and its canceled result is discarded.
These are input and scheduling limits, not a total process-memory or GPU-memory ceiling.

## Materials, and where the pixels come from

Nothing in this pipeline samples an image model, textures included. There are two ways a surface gets
its detail, and a model authoring an asset reaches for both in the same program.

The first is **procedural**: a declarative stack of layers the model writes out as data, which the
engine rasterizes into a texture.

```js
const brick = proceduralTexture({
  schemaVersion: 2,
  size: 256,
  usage: 'albedo',
  layers: [
    { op: 'bricks', brick: 0x8c4a32, mortar: 0xbfb6a8, rows: 12, cols: 6, mortarWidth: 0.08 },
    { op: 'noise', colorA: 0x000000, colorB: 0x604030, scale: 24, octaves: 4, seed: 7,
      blend: 'multiply', opacity: 0.35 },
  ],
});

const wall = pbrMaterial({ albedo: brick, normal: normalMapFromHeight(brick), roughness: 0.9 });
```

The layer operations are strict objects; fields from another operation are errors:

| `op` | Required fields | Optional operation fields |
| --- | --- | --- |
| `solid` | `color` | — |
| `checker` | `colorA`, `colorB` | `squares` |
| `stripes` | `colorA`, `colorB` | `count`, `angleDeg` |
| `gradient` | `from`, `to` | `angleDeg` |
| `bricks` | `brick`, `mortar` | `rows`, `cols`, `mortarWidth`, `stagger` |
| `noise` | `colorA`, `colorB` | `scale`, `octaves`, `seed` |

Every layer also accepts `blend` (`normal`, `multiply`, `screen`, or `overlay`) and `opacity` from 0 to 1. Pattern counts are integers from 1 to 256; noise octaves are 1 to 6. Seeded noise is tileable and reproducible. Call `kiln_discover({ ids: ["proceduralTexture"] })` to retrieve this contract and an executable example.

The bundled scanned library contains Poly Haven CC0 material families with recorded provenance. Use catalog IDs rather than file paths or URLs. Assets embed their textures and do not fetch them at runtime.

Procedural layers suit regular patterns such as brickwork and painted stripes. Scanned materials can provide irregular surfaces such as bark, soil, or leather. Choose based on the requested appearance and check the result in a material-faithful view.
