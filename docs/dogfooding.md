# Dogfooding

Three tiers, and they answer different questions. Running the cheap one does not tell you
what the expensive one would have. Per-harness install, flags and MCP config locations are in
[headless harnesses](harnesses.md).

The current V1 campaign is tracked in the [progress checkpoint](plans/2026-09-22-progress-checkpoint.md)
and [reviewed run evidence](reviews/2026-09-22-opencode-main-campaign.md). It uses
frozen checkout workspaces; later installed-package acceptance remains separate.
Authorized free models and existing subscriptions may be used, with the model,
runtime and guidance fixed within each trial. Historical run receipts below keep
the versions, tool names and outcomes that were actually observed.

The [October 5 eight-asset campaign](reviews/2026-10-05-blind-assets.md) adds fresh
AGY/Gemini 3.8 Flash High and OpenCode/Muse Spark Contributor 1.3 trials: four public
clone/setup attempts, four prepared authorings and four localized edits. Its two
assisted OpenCode recoveries remain distinct from the incomplete blind handoffs.
The report covers native traces, independent export checks, visual defects and
the resulting evaluation-tool and skill changes.

| tier | question it answers | cost |
| --- | --- | --- |
| 0 · wiring smoke | can this harness reach the tools at all? | one short turn |
| 1 · plain-prompt authoring | can an agent make an asset the way a user would? | a real authoring run |
| 2 · blind end-to-end | can an agent set Kiln up from nothing and then use it? | a clone, a build, and nested runs |

## Tier 0 — wiring smoke

```bash
bun run smoke:harness                       # every CLI on PATH
bun run smoke:harness -- --harness copilot  # one
```

**What Tier 0 cannot see: the generated launcher.** It invokes each CLI directly, so a harness
whose workspace reaches it only through `node <harness>.mjs` passes this tier while being
completely unusable from a real workspace. Two did, for months. `workspace-bootstrap.test.ts`
now covers the launcher's shape, and Tier 1 is what exercises it for real -- run Tier 1 from a
generated workspace using the command its own `START.md` names, never the bare CLI.

This is a **wiring probe, not a dogfood.** It names a tool on purpose, because its whole job
is to prove that a named tool is reachable and that the engine accepts what came back. Passing
it means the plumbing works. It says nothing about whether an agent can author anything.

## Tier 1 — plain-prompt authoring

**The prompt is the brief, and the brief is one sentence.** Create a workspace for the
harness, then ask for an asset the way a user would:

```bash
node scripts/create-workspace.mjs /tmp/dogfood-opencode --harness opencode
cd /tmp/dogfood-opencode
opencode run --auto -m PROVIDER/MODEL "Generate a weathered dockside crane asset."
```

The workspace already registers the skills and the MCP server and writes an AGENTS.md that
points at them, so the agent discovers `kiln-author-asset` and invokes it itself. That
discovery is part of what is being tested. Four rules, each of which came from a run that
failed for a reason unrelated to Kiln:

- **Never name a tool in the prompt.** Copilot namespaces MCP tools as `<server>-<tool>`, so
  an agent told to call `kiln_discover` can miss its prefixed registration and
  report the tools missing while listing its own tools shows them as
  `kiln_workspace-kiln_*`. A prompt that names a tool is a prompt that only runs on some
  harnesses.
- **Never put the brief in a file.** Telling an agent to read `BRIEF.md` adds two failure
  modes that have nothing to do with Kiln: the agent needs working file tools, and its working
  directory has to be right. Pass the prompt as the prompt.
- **Do not script the steps.** A step list measures whether the model can follow a step list.
  It also actively suppresses skill use: a prompt ending "and nothing else" stops an agent from
  reading the skill that would have told it the real API.
- **Ask for the subject, not the API.** "A weathered dockside crane with rusted steel and
  frayed rope" gets textures because the subject needs them. "Call `pbrMaterial`" gets a
  material call and an asset nobody asked for.

Judge the result against the engine, never the agent's own report. Rebuild the saved source
independently, and read `viewFidelity` before saying anything about material: a geometry-flat
CPU view is evidence about shape only.

## Tier 2 — blind end-to-end

Tier 1 starts from a workspace this repository generated. Tier 2 does not, and that is the
point: it tests the path a new user actually walks, where the setup instructions are part of
the software under test.

Give an agent the repository location and a goal, and nothing else. It has to clone or copy the
checkout, install dependencies, build the runtime, create a workspace, register the MCP server
for whichever harness it chose, verify the tools came up, and only then author. A run that
fails here has usually found a documentation defect rather than an engine defect -- which is a
class of bug no tier-0 or tier-1 run can reach, because both are handed a working
configuration.

The fuller form nests: the blind agent launches its **own** headless agents to do the
authoring, so the thing under test is Kiln's setup surface as consumed by an agent that then
has to hand it to another agent. `kiln-setup-workspace` is the skill that path is supposed to
follow, and whether the agent finds it unaided is part of the result.

Record for every tier: the exact harness version and model id, whether images actually reached
the model, what the agent inherited (user-level skills, MCP servers, memory, permissions), and
the transcript. A quota or authentication failure is not a measure of asset quality, and an
interrupted run is not a completed asset.

### Reproducible Tier 2 driver

`dogfood:tier2` drives the outer, blind agent. It supports Agy, Claude Code, Codex, Hermes and
OpenCode, using each harness's verified isolation: an operator-prepared clean auth home for Agy,
strict empty MCP for Claude, ignored user configuration and rules for Codex, safe mode or an
isolated home for Hermes, and a fresh XDG configuration plus pure mode for OpenCode. The ordinary
routes keep their normal authentication store. Adding another adapter is appropriate only after
its isolation can be demonstrated; a clean current directory by itself does not suppress
user-level skills or MCP servers.

The command is a dry run unless `--run-live` and an authorization record are both present. Start
by inspecting the exact invocation without spending quota:

```bash
bun run dogfood:tier2 -- \
  --harness codex \
  --goal "a tide-powered cliffside signal station with articulated counterweights"
```

For a live three-run batch, record the operator's approval and quota/spend boundary first, then
pass three independent, substantial goals:

```bash
bun run dogfood:tier2 -- \
  --harness codex \
  --run-live \
  --authorization docs/evaluation/approved-tier2-run.md \
  --timeout 45m \
  --goal "a tide-powered cliffside signal station with articulated counterweights" \
  --goal "a botanical clockwork conservatory whose solar petals track the sun" \
  --goal "a lunar salvage crawler with a folding crane and articulated suspension"
```

Use `--compact-tokens 333000` only for a route whose usable context is larger than 333k. Omit it
to keep the harness default when the context size is smaller or unknown. Claude Code maps it to
`--autocompact`; Codex maps it to `model_auto_compact_token_limit` with `total` scope. Compaction
is part of the headless-session evidence: confirm in the raw trace that work continues afterward,
not merely that a compact event occurred.

The outer prompt contains the public repository URL, the asset objective, and the required
end-state: a fresh clone, a separate workspace, and an independently launched headless author.
It does not name setup commands, skills, Kiln tools, primitives, or examples. Those are the public
surface being tested. Claude runs in safe mode with a strict empty MCP configuration and no saved
outer session. Codex ignores user configuration and execution rules and uses an ephemeral outer
session. OpenCode uses `--standalone` under a fresh `XDG_CONFIG_HOME`; Hermes uses `--safe-mode`.
Agy has no equivalent flag, so it requires `--agy-home` pointing to an operator-prepared home
whose `agy mcp list` is empty and which exposes only the authentication/runtime files the test
needs. The driver never copies credentials into it. Authentication remains available where the
selected route requires it. The outer agent receives unrestricted shell access because cloning,
installation, workspace creation, and its child process require it; run this only on a machine or
VM where that authority is acceptable.

Hermes can anonymously route OpenCode Free models. Contributor-tier models may train on prompts
and completions and therefore fail closed in unattended mode. Use
`--allow-data-training-tier` only for public, non-sensitive evaluation material after recording
that choice; the driver places the acknowledgement in a run-local isolated `HERMES_HOME`, never
the operator's profile. For example:

```bash
bun run dogfood:tier2 -- \
  --harness hermes \
  --provider opencode-free \
  --model muse-spark-1.3-contributor-free \
  --allow-data-training-tier \
  --goal "an ornate desert astrolabe caravan shrine"
```

By default, raw evidence is written with private permissions under ignored
`.dogfood/tier2/<batch>/`, while each working directory lives outside the checkout under the OS
temporary directory. Use `--out /external/evidence/path` and
`--workspace-root /external/workspaces/path` for durable evidence. An output directory inside the
checkout is refused unless it is under `.dogfood/`. Each run retains:

- the exact invocation and inherited environment **names** (never values);
- stdout JSONL and stderr without lossy filtering;
- a sanitized receipt with path and credential-pattern redaction;
- source and GLB candidate paths, sizes, and hashes from outside cloned examples/build output.

### Retaining evaluation assets

Dogfood assets are local-only candidates by default. Every Tier 2 run imports each newly saved Kiln
revision or matching standalone source/GLB export into the standard user `library` collection in
the operating system's user-data directory (`$XDG_DATA_HOME/kiln/library` or
`~/.local/share/kiln/library` on Linux).
The collection is independent of the temporary workspace and contains the exact source, GLB,
optional preview, hashes, manifest metadata, run provenance, and `index.json`. Its importer scans the whole
batch workspace so an outer agent that creates a sibling asset workspace is still captured.
Managed and loose copies with identical source/GLB hashes merge into one entry; distinct preview
variants are retained rather than overwritten.

“Dogfood” is maintainer evaluation terminology for the importing workflow, not wording for the
ordinary product flow. User-facing skills and the standard viewer describe generating assets,
saving them to collections, and browsing **This project** or **Your library**.

This user library is deliberately unrelated to `examples/` and the site build. **Never copy a
candidate into the public gallery unless the operator explicitly asks to promote that specific
asset.** A successful dogfood run, a good model review, or visibility in the local viewer is not
promotion approval.

Recover saved revisions from older workspaces without publishing anything:

```bash
bun run dogfood:gallery -- /path/to/old-run /path/to/another-run
```

Use `--gallery-root /private/path` to relocate the archive. Tier 2 accepts the same option, and
`--no-local-gallery` is the explicit opt-out for an intentionally disposable run. Tier 2 also
accepts `--repository URL_OR_PATH`, the repository the outer agent clones (a local mirror or a
branch under test instead of the public repository), and `--agy-home PATH` for Agy. Re-importing the
same bytes is safe: entries are content-addressed and provenance is merged rather than duplicated.
Review the collection in Kiln's normal interactive asset viewer from an asset workspace:

```bash
node kiln.mjs view
```

The printed loopback URL opens the single orbit, zoom, pan, wireframe, lighting, animation,
revision, and download UI used for all saved assets. Select **Your library** in its collection
sidebar. The importer never copies candidates into `examples/` or the site build. Public promotion
remains a separate, manual operation after visual and provenance review.

The archive root is required to be outside the repository, and every record is stamped
`publication.state: "local-only"`. The importer refuses a repository-contained destination. These
are the enforcement boundaries; the collection name stays neutral so evaluation runs and ordinary
asset creation can grow the same local library without confusing an agent about the asset's use.

A recovery pass on 14 September 2026 found 28 distinct source/GLB pairs from retained dogfood
workspaces and session scratchpads; all 28 had a preview. The archive is machine-local and is not a
new checked-in collection or a site-gallery input.

Raw traces can still contain model-printed secrets or private paths. Keep the raw directory private
and publish only a reviewed sanitized receipt. The receipt never promotes an artifact on the
agent's own claim: both a newly discovered `.kiln.js` source and a GLB are required for
`completed-pending-review`, and that status still requires visual and provenance review.

Outcome classes are deliberately operational. `provider-quota` and `authentication` come only
from explicit structured error events or stderr; ordinary telemetry fields such as
`rateLimitType` cannot trigger them. A provider-level failure stops the remaining batch instead of
spending calls that cannot succeed. `timed-out` uses a per-run process group and kills only the
spawned outer agent and its descendants—there is no process-name reaper. `partial-asset`,
`asset-failure`, and `harness-error` remain distinct so setup failures are not scored as weak 3D
work.

Claude Code may be pointed at an operator-controlled compatibility proxy through its normal
environment for private harness testing. That route is experimental evaluation infrastructure,
not a Kiln installation recommendation. Record the proxy version, resolved model, and whether MCP
image blocks and nested tool calls survived in the reviewed receipt; never copy OAuth token
contents into the run directory or documentation.

### Blind setup trials · 13 September 2026

These are setup-path observations, not a model leaderboard. Each outer agent received only the
public repository URL, a substantial asset goal, and the required end state. The OpenCode and Agy
images were reviewed by a human after the run; the driver status alone never establishes quality.

| Outer route | Result | Evidence and qualification |
| --- | --- | --- |
| Claude Code 2.1.269 · Claude Opus 5 | Completed once; two later starts hit provider quota | Produced a weathered lighthouse after cloning, setup, a nested 86-turn author, nine revisions, and GPU review: 16,245 triangles, 38,461-byte source and 1,763,612-byte GLB. The result was detailed rather than placeholder geometry. |
| OpenCode 1.18.30 · Muse Spark 1.3 Contributor Free | Completed, pending review, 25m10s | Produced a deep-sea cartographer console after three render/edit cycles: 16,548 triangles, 10,962-byte source and 266,976-byte GLB. Its relief map, drawers, porthole and articulated plotting arms read coherently, but CPU views cannot establish its materials. |
| OpenCode 1.18.30 · Muse Spark 1.3 Contributor Free · after the neutral-backdrop and test-budget merges (2026-09-16) | Completed, pending review, 5m42s | Cloned, ran `bun install --frozen-lockfile` and `bun run build:runtime`, found `kiln-setup-workspace` unaided, created an OpenCode workspace and verified it with a CPU crate render. It dispatched the author as an in-session `task` subagent rather than a separate `opencode run --dir` process, so the workspace MCP server was never loaded and the child worked through the CLI (`render`, `source`, `save`) with PNG readback over three review cycles. The clean room held: the child read only the workspace skills and its own retained program. Saved a brass diving helmet with a hinged faceplate, side ports, hose elbow and verdigris band: 24,152 triangles, 10,469-byte source and 377,456-byte GLB, zero tool errors; the preview is a CPU view because the render service was not installed. The nested-author sentence in the setup skill comes from this run, and the receipt now records `toolUsage.workspaceMcp` so a CLI-only completion is visible without reading the trace. |
| OpenCode 1.18.30 · Muse Spark 1.3 Contributor Free · after the render-service registry and nested-author docs merged (2026-09-17) | Completed, pending review, 3m56s | Cloned the merged main, ran `bun install --frozen-lockfile` and `bun run build:runtime`, read `docs/clean-room.md` and the setup skill, created an OpenCode workspace and verified it with a CPU crate render. This time it followed the nested-author sentence: it wrote a brief and started the author as a separate `opencode run --dir <workspace>` process, so the workspace MCP server loaded. The child made nine `kiln_workspace_kiln_*` calls with zero errors (`kiln_list_primitives` with `capabilities: true` first, then `kiln_render`, `kiln_source` twice, `kiln_edit`), revised once from the PNG on disk (spread the side ribs, opened the door wider, unique part names), and wrote the final source and GLB through the CLI `source` and `render` commands rather than `kiln_save`, so the workspace store holds programs but no saved asset. Produced a cast-iron wood stove with a hinged door, mica window, swept flue elbow, legs and rivets: 3,020 triangles, 10,383-byte source and 85,884-byte GLB; CPU views only because the render service was not installed, which the child reported as unresolved rather than as material evidence. The clean room held: the child read only the workspace files, its brief and the authoring skill. The outer receipt still says `toolUsage.workspaceMcp: not-exercised`, because that field is computed from the outer agent's own event stream and a nested author's calls live in the child's OpenCode session; read the field as a statement about the outer agent, and open the child session to see the MCP path. |
| Agy 1.2.2 · Gemini 3.8 Flash High | Completed, pending review, 27m28s | Produced a detailed polar chronometer/armillary: 72,244 triangles, 57,670-byte source and 2,365,024-byte GLB, with a material-faithful GPU view. The outer setup agent also read a cloned Kiln example and engine source before authoring; that is a clean-room protocol failure and useful contamination evidence, even though the asset succeeded. |
| Codex 0.154.0 · GPT-5.6 Luna, xhigh | Asset recovered; later provider quota | Cloned, configured a workspace, and launched a nested author that saved and exported a 16,604-triangle Ancient Tidal Observatory with a material-faithful GPU preview. The outer agent created the asset workspace beside `run-01`, exposing a driver discovery bug: the old receipt incorrectly reported no export. Whole-batch discovery and automatic local-gallery capture now cover this shape. |
| Hermes 0.21.2 · GPT-5.6 Luna, xhigh through Codex OAuth | Provider quota after 2m43s | Reached clone and workspace setup under an isolated `HERMES_HOME`; quota arrived before authoring. An earlier attempt proved that Hermes safe mode alone does not isolate its state database, so the driver now always supplies an isolated home. |
| Hermes 0.21.2 · Muse Spark 1.3 Contributor Free | Tool-protocol failure | With the data-training acknowledgement isolated to the run, the model emitted literal `atem:function_calls` markup instead of executable Hermes tool calls. A catalogue `toolcall=true` label was therefore insufficient for this route. |
| Hermes 0.21.2 · MiMo v2.5 Free | Provider quota | The route returned HTTP 429 after three retries before setup could be evaluated. |
| Hermes 0.21.2 · Nemotron 3.5 Lightning Free | Tool calls pass; Tier 2 protocol fail with retained asset | A direct keyless `opencode-free` probe produced a structured `terminal` call and consumed its result. The blind run cloned and set up Kiln, then authored a 5,760-triangle Celestial Telegraph itself instead of launching a child agent; it also read a checked-in example. The valid source/GLB/CPU preview is retained locally, but the run does not satisfy the nested clean-room protocol. |
| Hermes 0.21.2 · Ling 3.0 Flash Free | Tool-call compatibility pass | A direct keyless probe emitted and completed a structured `terminal` call. No full asset run was attempted. DeepSeek V4 Flash Free reported unavailable, MiMo returned 429, and Nemotron 3 Ultra did not answer within the 30-second probe window. |
| Codex 0.154.0 · GPT-5.6 Luna, xhigh · second run | Completed, pending review | Luna cloned and built Kiln, created the workspace, recovered from an OpenCode child route with zero balance, then launched a configured GPT-5.6 Sol child. The child produced a 15,296-triangle Deep-Space Salvage Winch, saved two collection revisions, and exported source, GLB, and a material-faithful GPU contact sheet. The local archive preserved both managed previews and the loose contact sheet. |

The completed OpenCode and Agy runs both created `KILN_PROGRESS.md` and resumed their multi-cycle
work from exact program references, validating the persistence shape generated into new
workspaces. None of these trials crossed 333k usable context or emitted a compaction event. The
per-harness controls in [Headless harnesses](harnesses.md#long-running-sessions-and-compaction) are therefore mapped
and syntax-checked, but continuation after a real 333k compaction remains an explicit unverified
test case.

The second Luna run used the 333,000-token Codex ceiling and continued normally without compacting.
Its stream reported 7,609,537 cumulative input tokens, of which 7,330,816 were cached; non-cached
cumulative input was 278,721, still below the configured ceiling. That confirms the one-run setting
did not disrupt a nested workflow, but it is not evidence of post-compaction continuation.

For the private Claude-with-Codex experiment, two third-party projects were inspected. The broad
[Claude Code Router](https://github.com/musistudio/claude-code-router) required connector scopes
that were absent and modified operator-global Claude/Codex profiles despite attempted XDG
isolation, so it was rejected and those changes were restored. The narrower
[claude-code-proxy](https://github.com/raine/claude-code-proxy) 0.1.39 was pinned by release hash
and run loopback-only from temporary state. Claude Code through that bridge completed a text smoke,
a native Read tool call, discovery of all 13 Kiln MCP tools, and a GPU material-faithful astrolabe
render whose image reached Claude's context. This proves the private evaluation route works for
the exercised calls; it is not shipped setup guidance and does not imply support for either proxy.

Findings from these trials produced concrete fixes: GPU-before-session guidance, complete headless
launch shapes, attached Agy `--print=TEXT` spelling, harness-specific clean homes, receipt
redaction and quota classification, exclusion of installed skill samples from artifact discovery,
documented procedural texture keys and camera contracts, clearer category semantics, and closed
actionable diagnostics for strict procedural keys and non-closing periodic surfaces.

## Harness checks · 5 September 2026

These checks exercise source reuse across tool calls. They are small integration tests, not a model-quality ranking.

### Procedure

Each run received a new directory outside the engine checkout, the five Kiln skills, a task brief, a local CLI launcher, and a project MCP configuration. Refinement runs also received one well program. No example library or engine implementation was supplied as task context.

The task was to change `POST_W` from `0.13` to `0.18`, preserve all other source, render the original, find the constant through `kiln_source`, edit by `programRef`, inspect a post, and export the revision. We compared exported bytes against the exact expected replacement and recorded MCP requests and responses with [observe-mcp.mjs](../scripts/observe-mcp.mjs).

The directory separation is not a security sandbox. Provider authentication remained available; harness-managed instructions and permissions could still apply. An earlier Antigravity attempt searched outside the task directory while resolving a relative brief, so it was excluded. The successful rerun used a new explicit project, added directory, and absolute paths.

### Results

| Harness and selected model | Time | Exact source edit | Qualification |
|---|---:|---|---|
| OpenCode 1.18.27 · Muse Spark 1.3 Contributor | 48 s | Pass | Five Kiln calls, all by reference; full requested sequence completed |
| OpenCode 1.18.27 · Omen Alpha | — | Not run successfully | Provider rejected the request at its weekly usage limit; no Kiln calls |
| Antigravity · Gemini 3.8 Flash High | 137 s | Pass | Four Kiln calls, all by reference; explicit project and paths required |
| Hermes · Qwen 3.5 35B A3B | 92 s | Pass | Compatibility check only; seven calls exceeded the six-call brief |
| OpenCode 1.18.27 · Gemini 3.1 Flash Lite | 36 s | Pass | Compatibility check only; omitted the requested inspection call |
| Codex 0.153.3 · configured default | 138 s | Pass | Model identity was not captured; initial CLI duplicate-start defect was found and fixed |

The requested frontier OpenCode identifier was `opencode/muse-spark-1.3-contributor-free`. Omen was requested as `opencode-go/omen-alpha`. The older Gemini and Qwen runs are retained only as compatibility evidence, not as substitutes in the frontier comparison. Claude was excluded from further runs after a provider credit refusal.

The supplied source was 10,601 bytes. Muse's edit arguments were 174 bytes, including the reference and replacement; its five Kiln requests totaled 573 bytes. Source lookup responses remain bounded source text, and images still have their normal payload cost.

All successful refinement runs used references without inline source in subsequent MCP requests. Reference-mode edit responses omitted the updated source. The server returned image blocks, and the models reported image review; those reports alone do not establish the quality of visual judgment. These refinement runs used CPU views and cannot establish material fidelity.

### What changed after testing

- Fixed duplicate CLI execution when importing the Node bundle. Source import now prints one reference; export performs one write.
- Added explicit workspace and absolute-path guidance for Antigravity and Hermes. Hermes's generated launcher sets a separate profile and terminal directory.
- Kept source viewing separate from editing. A read is bounded and has no mutation; an edit returns a new revision and renders by default.
- Shortened tool descriptions and skills, including guidance for missing references, failed edits, and degraded images.

### New asset trial

Muse Spark 1.3 Contributor also authored [the tidal observatory](../examples/tidal-observatory.kiln.js) from a design brief, with no starting asset. It used the tools to build and review the structure, then refined the island shape and category metadata after reviewer feedback using saved references.

The final geometry has 10,968 triangles. A separate GPU gallery render was inspected after authoring; the model's own views were CPU-only because the local render service required an authentication token. The result is a stylized specimen: its shiny copper and simplified rock do not fully match the requested aged surfaces. It is not evidence that material review succeeded in the model loop.

The checked-in source adds a provenance header to the model's final exported program. No geometry or materials were manually rewritten. Existing gallery examples retain their own model credits and refinement notes.

### Scope of the conclusion

The checks support using immutable source references to eliminate repeated program transmission across CLI and MCP calls. They do not establish universal model superiority, complete harness isolation, or a cross-call geometry cache. See [the design](programs.md) for storage lifetime, limits, and the current MCP rationale.
