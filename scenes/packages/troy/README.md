# Troy reference scene

Troy uses Three.js directly, including its WebGPU renderer and WebGL2 fallback.
Farm, Golden Gate and Foundry Floor use React Three Fiber. Each scene keeps its
existing framework; they share the repository's exact Three.js version, 0.186.1.

`web/` contains editable scene modules: terrain, ocean, crowds, hero combat,
archers, controls, landing/regrouping and playback. Module directories preserve
their original relative URLs. Older controllers remain available for explicit
comparison options; the current defaults are in `web/runtime-policy.mjs`.
Tests here cover portable source, transport, path safety and the local module graph.
They do not establish visual acceptance or hardware performance.

## Run from a clean checkout

Install the pinned scene dependencies once. Troy declares its own parser, and the
scenes installation provides Three.js and archive helpers. Installation does not
automatically download Troy's runtime data.

```sh
# From the repository root:
cd scenes
bun install --frozen-lockfile
cd packages/troy
npm test
npm run hydrate
npm run dev
```

Open `http://127.0.0.1:4421/`. Set `TROY_PREVIEW_PORT` when that port is occupied.
Change `web/` source and reload the page to continue development. The server serves
local source first and takes GLBs, pose banks and JSON inputs from `.runtime/`.
It serves the locally installed Three.js package; no private author workspace,
Kiln MCP server or `.kiln` configuration is needed for scene development.

The optional `hydrate` command downloads the archive pinned by `runtime-pin.json`,
checks its exact byte count and SHA-256, and extracts bounded runtime data into the
ignored `.runtime/` directory. It excludes the archive's JavaScript, HTML and
vendor code, so an old release cannot replace your current edited source. It also
creates lossless gzip companions and a transport manifest for the current data.
To use an already downloaded archive, run `node scripts/hydrate-runtime.mjs PATH`.
Hydration is an explicit download of approximately 51.6 MB for the initial pin;
the normal repository clone contains source, not these generated payloads.

The current runtime pin is `troy-20261005-07`, a text correction of release 06
with identical model and bank payloads. Update it to the newly sealed and
verified release when adopting changed model/bank inputs. A pin change requires
rehydration; the preview refuses a cache selected for another release.

The archer bank also checks the exact bytes of its source inputs. Two retained
modules have a trailing CRLF line and scoped Git attributes preserve those bytes.
Keep those line endings when using the initial pin; editing bank inputs requires
rebaking and verifying the bank, rather than changing or bypassing its hashes.

## Build a public runtime

Keep source modules editable and prepare derivatives in a separate staged web
directory. Copy the required verified runtime data and pinned Three.js there;
then run, from the repository root:

```sh
node scenes/packages/troy/scripts/prepare-runtime-transport.mjs STAGED_WEB
bun scenes/packages/troy/scripts/bundle-scene.mjs STAGED_WEB scenes/node_modules/three
```

The transport step preserves original bank bytes and their existing clip/bounds
contracts. Supported browsers request gzip companions; others request and verify
the original. Exact duplicate payloads share one startup fetch, and fetch admission
is bounded. Servers may expose gzip file bytes or apply HTTP gzip decoding; the
reader verifies the exact original bank identity in either case. The bundle step
parses and preserves each source module's URL before
relocating code, so nested bank paths still resolve correctly. It updates only the
staged HTML entry and needs an unbundled source entry as input. Run with the pinned
Bun 1.4.2 and installed parser; seal hashes after both steps.

Asset authoring and rebaking remain separate tasks. Use a separate live Kiln
workspace for authored asset revisions, and the corresponding pinned source and
material inputs. These browser modules support continued scene editing; they do
not claim to recreate every historical pose bank from unspecified author files.
The editable asset downloads and source packs carry their own rebuild resources.

Full warmup still admits hidden and future representations before playback. Do
not remove it merely to improve startup timing: first combat, landing and reserve
transitions must remain smooth. Qualify exact candidates on the quiet hub at the
agreed 1440×900 balanced target; local source tests and screenshots are functional
evidence. The original per-module scene remains available for comparisons.
