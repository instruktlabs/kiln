# v1 readiness cycle: plan of record

Status, 1 October 2026: the owner answered fifteen decisions today through the question tool,
then set the session models and added the Troy pack attempt (rows 10 and 15 to 18 of the table
below), and asked for a goal statement to start the cycle. Nothing here is implemented yet. This
is a dated record. It never overrides current code, `AGENTS.md` or the changelog, and it does
not imply release acceptance.

All work happens in the worktree `C:/Users/Mattm/X/kiln-v1-readiness` on branch `v1-readiness`,
cut from `origin/main` at `v0.9.0` (`143ecba`). The main checkout `C:/Users/Mattm/X/kiln-oss`
belongs to a separate site design pass: never edit, switch, stash or clean it from this work.

## Objective

Make Kiln's MCP server, and everything an agent reads from it, fit inside the limits real
harnesses impose. Prove it first-hand on Claude Code, Codex, OpenCode and Agy, and leave the
owner a branch ready for a 1.0 decision. The measure is the contract table below, enforced by an
offline test suite, plus traces from real sessions on lower-tier models.

The live sessions also attempt a first asset pack, the Battle of Troy, because their output is
worth keeping when it is good. That is secondary: fixing Kiln and token efficiency come first.

Out of scope for this cycle: finishing or releasing a pack, serving skills over MCP, regrouping
the seventeen tools, publishing anywhere (npm, the MCP Registry, plugin marketplaces), hosted CI
and the site.

## Goal statement

The owner passes this text to start the cycle (for example with `/goal`, which accepts up to
4,000 characters and judges completion only from what the conversation shows).

<!-- goal:start -->
```text
Complete the Kiln v1 readiness cycle recorded in docs/plans/2026-10-01-v1-readiness-cycle.md, working only in the worktree C:/Users/Mattm/X/kiln-v1-readiness on branch v1-readiness. Read that plan first: it holds the contract, the steps, my decisions, the session rules and the Troy inventory. Keep its progress log current, stamped from the clock.

Done when all of these have been shown in this conversation:
1. Contract gate: an offline test suite inside `bun run test` enforces every rule in the plan's contract table and passes, including both protocol revisions, answers before the engine loads, schemas within 5,000 bytes, definitions within 45,000 characters, results within 40,000 and errors that name the next step.
2. Offline gate on the final commit, after `node scripts/build-runtime.mjs all`: check:toolchain, check:skills, typecheck, lint, test, test:render-service and test:coverage each exit 0 with no coverage threshold lowered. Print every exit code and the test totals.
3. Fresh clone: a new clone of the branch installs, rebuilds dist/ identical to the committed copy, passes the gate and test:package, and produces a workspace whose Kiln tools come up for claude, codex, opencode and agy.
4. Four-harness table: filled first-hand on the final build for Claude Code, Codex, OpenCode and Agy: protocol revision, Kiln tools on the first model request, largest result, any truncation, and a live session on 2026-07-28 where the harness has a switch. A cell that could not be measured says so and why.
5. Live sessions within my cap of 50 sessions, 30 minutes each, split as the plan's table says. Models: Claude Code on claude-sonnet-5-5, with claude-opus-5-5 at higher effort for the characters; Codex on gpt-6.1-sol; Agy on gemini-3.8-flash-high; OpenCode on Meta Muse Spark 1.3 Contributor. Every trace is read, each finding is fixed with a test or listed with the reason it was left, and a dated report is in docs/reviews/.
6. Troy pack attempt: the report lists each candidate with its evidence, triangles, materials and draw calls, names the pick per subject and gives the composed scene's totals, or says which subjects have no usable candidate. The pack stays local for my review.
7. The records match the code: version 0.10.0, a changelog that marks the breaking changes, README, docs/tools.md, skills, plugin manifests and generated workspace instructions.
8. A read-only cleanup list gives a proposed action and reason for each worktree, branch, log and stale folder.
9. A final report states what changed, the evidence for each contract rule, the lean-versus-compact comparison and what it decided, every exclusion, and each decision left to me.

Rules that hold throughout:
- Kiln fixes and token efficiency come first. The pack never displaces a contract fix or takes a session beyond the cap.
- Test first: write the failing test, see it fail for the expected reason, make the smallest fix, rerun the focused test and then the gate.
- Local commits on v1-readiness only, each ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No push, tag, PR, merge, publish, deploy, upload or history rewrite.
- Never edit, switch, stash or clean C:/Users/Mattm/X/kiln-oss. Never edit user-level harness configuration. Never read or print secrets, .env files or sign-in stores.
- Live sessions use fresh workspaces, isolated configuration and only the models named above. Each Agy session gets a new empty home under C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10/agy-homes/.
- Delete nothing. Lower no contract limit and no coverage threshold.

The goal is also complete when you stop and report one of these with evidence: continuing would break a rule above; the session cap is reached; a contract limit cannot be met without my decision; Agy cannot sign in under a new empty home or lists an MCP server there (finish everything else first); or the plan marks the next decision as mine.
```
<!-- goal:end -->

## Owner decisions, 1 October 2026

| # | Decision | Answer |
| --- | --- | --- |
| 1 | The 1.0 bar | Hard gate. Every contract limit is an offline test in `bun run test`; a breach fails the build. |
| 2 | Protocol stance | Serve MCP 2026-07-28 first and keep the 2025 handshake, with tests for both. Generated workspaces leave each harness on its own default; the docs list each harness's switch. Confirmed later the same day, once it was clear that no measured harness defaults to 2026-07-28: Kiln follows each harness, and the cycle proves the new revision live by running one session per harness with the switch set for that session only. |
| 3 | MCP libraries | Bump the server and client libraries from 2.0.0 to 2.2.0 and `ext-apps` from 2.0.0 to 2.0.3 as the first fix commit, kept only if the tests for both revisions pass on them. |
| 4 | Version | 0.10.0 on the branch, with the breaking changes marked in the changelog. The owner cuts 1.0.0 after reviewing the wave. |
| 5 | Where the goal ends | After the wave and one fix pass on what its traces show. Finishing or releasing a pack is a separate goal (see 17). |
| 6 | Git | Local commits on `v1-readiness` only. No push, tag, PR or merge. |
| 7 | Cleanup | A read-only list. The owner approves it and runs the deletes. |
| 8 | Attribution | Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No PR footer. |
| 9 | Session cap | 50 live sessions in total, 30 minutes each. |
| 10 | Models, OpenCode and Agy | OpenCode on Meta Muse Spark 1.3 Contributor. Agy on Gemini 3.8 Flash (High), id `gemini-3.8-flash-high`; the owner first chose Low and changed it later the same day. |
| 11 | CLI versions | Update OpenCode (2.0.14 installed, 2.0.21 published) and Agy (1.2.14 installed) before the baseline. Never update over OpenCode's running background service: stop and ask. |
| 12 | Lean results | Build lean render results and changes-only edit results behind a `detail` value. The wave runs the same briefs both ways. Lean becomes the default only if task success is no lower and tokens per finished asset are lower. The comparison goes in the final report either way. |
| 13 | Startup design | A short spike measures both designs. Lazy-load the engine if the tool list can load without it; otherwise a thin entry that answers from a build-time manifest. Record the numbers behind the choice. |
| 14 | Skills over MCP | After 1.0. Record it as the first item after release. |
| 15 | Agy home | First answer: the owner supplies a path. He then asked for it to be worked out: every Agy session gets a new empty folder under `C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10/agy-homes/` as its home. Agy signs in from the OS keyring, so no sign-in file is copied, linked or read. |
| 16 | Models, Claude Code and Codex | Claude Code on Sonnet 5.5, id `claude-sonnet-5-5`. Codex on GPT-6.1-Sol, id `gpt-6.1-sol`. |
| 17 | Troy pack attempt | The live sessions attempt a project and an eventual pack on the Battle of Troy, Greeks against Trojans: the city with its wall and buildings, people, the weapons they carry (swords, shields, bows and arrows), horses, boats and the wooden horse, coherent as a pack and frugal with draw calls once placed in a scene. Keep the planning light; the cycle stays on fixing Kiln and on token efficiency. |
| 18 | Characters | The people, both the soldiers and key characters such as Achilles and Hector, may use Opus 5.5 at a higher reasoning effort, because they are the hardest subjects. |

Rows 10 and 15 to 18 came as messages after the fifteen question-tool answers.

Defaults set after those messages, which the owner can edit:

- Effort: `high` for Sonnet 5.5 and GPT-6.1-Sol (whose own default in Codex is `low`), `xhigh`
  for the Opus 5.5 character sessions. Never `max`: an earlier Sonnet authoring session at `max`
  thrashed on compaction.
- The session split across the four harnesses, in the table under "Live sessions".
- How the pack is built from the sessions, under "Troy pack attempt".

Defaults the owner was shown and left unchanged:

- No vendor-specific metadata key unless the vendor documents it, a measurement shows it helps,
  and other harnesses ignore it. Today that means none.
- The contract suite lives in `bun run test`. The capture rig is committed as a manual script
  and never runs in CI.
- The tool count stays at seventeen. The final report gives per-tool call counts from the traces
  and a recommendation.
- Publishing is prepared, not done: manifests are corrected and nothing is listed or uploaded.

## What was measured on 0.9.0

Measured on 1 October 2026 with a scripted rig: each harness talks to a local stand-in provider
with a dummy key under isolated configuration, so no model is called. Evidence is in the ignored
folder `tmp/harness-probe/`. `verify-plan-numbers.mjs` there re-derives the definition, guide
and skill sizes; `probe/runs-*.log` and `probe/runs/*/summary.json` hold the result sizes.

**The server.** Kiln 0.9.0 already answers MCP 2026-07-28: `server/discover` returns
`supportedVersions: ["2026-07-28"]`, and `initialize` still answers 2025-11-25 or 2025-06-18.
The gaps:

- No repository test speaks 2026-07-28. The smoke tests use only the 2025-11-25 handshake.
- Cache hints are library defaults (`ttlMs: 0`, `cacheScope: private`).
- A request with neither a protocol version nor a prior handshake is served.
- `listChanged` is advertised for tools and resources but never emitted.
- The lockfile holds the server, client and `ext-apps` libraries at 2.0.0.
- The first byte arrives after 1,140 ms with `KILN_RENDER=cpu` and 1,265 ms with `auto`; bare
  Node starts in about 45 ms. Node's compile cache gave no gain. The cost is spread over bundle
  compile, the workspace skill-hash check, file checks and the render probe. Re-measure in step 0.

**The definitions.** Seventeen tools, 75,497 characters in all. Schema bytes sum to 62,729.

| Tool | Schema bytes | Note |
| --- | ---: | --- |
| `kiln_material` | 18,845 | root `oneOf`; repeats the layers choice and a date-time pattern twice |
| `kiln_project` | 10,130 | root `oneOf` |
| `kiln_inspect` | 6,439 | |
| `kiln_edit` | 5,915 | |
| `kiln_render` | 5,029 | |
| `kiln_review` | 1,428 | root `oneOf` |

The other eleven are under 5,000 bytes. Descriptions sum to 7,380 characters, the longest is 875
and four exceed 512. Server instructions are 2,297 characters.

**The results** (characters of text the harness received).

| Result | Claude Code 2.1.287 | Codex 0.159.3 |
| --- | ---: | ---: |
| Render, compact, crate | 12,510 | 12,161 to 12,236 |
| Render, compact, carousel | 13,512 | not captured |
| Render, `detail: 'full'`, crate | 74,020 | cut at 40,047 |
| Render, `detail: 'full'`, carousel | 55,592 | not captured |
| Part listing | saved to a file (60.4 KB) | cut at 40,151 |
| Review listing, 42 stored operations | 245,548: an error, then a file | cut at 40,149 |

**The harnesses.**

| | Claude Code 2.1.287 | Codex 0.159.3 | OpenCode 2.0.14 | Agy 1.2.14 |
| --- | --- | --- | --- | --- |
| Opens a local server with | `initialize` at 2025-11-25; 2026-07-28 with `MCP_PROTOCOL_NEGOTIATION=auto` and `MCP_SDK_GENERATION=v2` (first-hand) | `initialize` at 2025-06-18; 2026-07-28 with `features.mcp_2026_07_28 = true` and `CODEX_MCP_PROTOCOL_VERSION=2026-07-28` (first-hand) | not exercised. The 2.0.14 binary's config schema gives each server a `protocol` setting: `legacy` (default, the `initialize` handshake up to 2025-11-25), `auto` (tries 2026-07-28, falls back) or `2026-07-28` | not measured. The 1.2.14 binary lists revisions 2024-11-05 to 2026-07-28 and `server/discover`; `agy mcp list` starts no server, so the opening message needs a session |
| Kiln tools on the first model request | all seventeen, three misdeclared | none: it waits 1.0 s and Kiln answers later. All seventeen when the first answers are immediate (first-hand, both revisions) | not measured | not measured |
| Limits on definitions | root `oneOf` rewritten so `action` allows only the first branch, or the tool dropped behind a custom API address (first-hand); descriptions and instructions cut at 2,048 characters (vendor docs) | schemas over 5,000 bytes compacted: nested fields of `kiln_project` and `kiln_material` arrive as `unknown` (first-hand, and the config schema) | sends every definition on every request (earlier traces; re-measure) | not measured |
| Limits on results | large image-free results saved to a file with a preview; warning at 10,000 tokens, limit 25,000 (vendor docs) | cut near 40,000 characters (first-hand) | 2,000 lines or 50 KB, then a file (earlier research; re-measure) | 70 to 80 KB moved to a file (earlier traces; re-measure) |

**Smaller defects.**

- `kiln_review` `get` with an unknown id returns a raw file error containing a local path.
- Codex setup is described three ways; a generator comment and `START.md` say Codex reads no
  project-local config, which is stale.
- The root `plugin.json` `$schema` URL returns 404, and `.codex-plugin/plugin.json` is named
  `kiln-oss` while the other manifests say `kiln`.
- `kiln-init --help` lists five harnesses; the generator supports seven.
- The generated workspace guide is 10,716 characters and is written identically to `AGENTS.md`
  and `CLAUDE.md`.
- `export-profiles.md` and `engine-handoff.md` exist as identical copies in two skills.
  `kiln-author-asset/SKILL.md` is 18,933 characters.
- `docs/dogfooding.md` says the blind driver runs OpenCode with `--pure`; the driver passes
  `--standalone`. Verify, then align.

## The contract

Each rule is the strictest limit any of the four harnesses imposes. Each has a test in the
normal gate. A rule that cannot be met is reported to the owner; it is never relaxed quietly.

| # | Rule | Limit | Set by | Gate check |
| --- | --- | --- | --- | --- |
| 1 | Both protocol revisions | Stateless requests and `server/discover` at 2026-07-28; `initialize` at 2025-11-25 and 2025-06-18 | The current spec; Claude Code and Codex still default to the handshake | Conformance tests drive the built server over stdio in both modes: discovery, tool list, a tool call, a resource read, the error codes for a missing capability block and an unknown version, and result metadata |
| 2 | First answer before the engine | The handshake, discovery and the tool list are answered without loading the engine or touching the workspace or renderer; under 300 ms on this PC | Codex waits 1.0 s for an optional server | The test asserts the three answers arrive before any engine module loads. The 300 ms figure is measured by the rig, not asserted in CI, because runner speed varies |
| 3 | Plain schemas | Root is `type: "object"` with no root `oneOf`, `anyOf` or `allOf`; a multi-action tool takes an `action` enum that the server validates | Claude Code rewrites or drops root combinators | Registry test over every tool |
| 4 | Small schemas | Each input schema at most 5,000 bytes of `JSON.stringify` | Codex compacts larger ones | Registry test |
| 5 | Short text | Server instructions at most 700 characters with the first 512 self-contained; each description at most 1,024 characters with its purpose in the first 250 | Claude Code cuts both at 2,048; tool search and Codex surface the opening | Registry test on lengths and on the first sentence ending inside 250 characters |
| 6 | Small total | All tool definitions together at most 45,000 characters | OpenCode sends every definition on every request | Registry test |
| 7 | Bounded results | Default result text at most 20,000 characters; none over 40,000 for any `detail` value or action; JSON on one line; larger content is paged with a cursor or stays in the retained report file, whose path is returned | Codex cuts near 40,000 characters; OpenCode at 2,000 lines or 50 KB | Fixture matrix over every tool and action, including a store with more than 40 review operations and a large part listing |
| 8 | Newest result stands alone | Render and edit results lead with verdict, blockers, what changed, the current `programRef` and the next step | Claude Code clears older tool results first | Fixture test on presence and order |
| 9 | Errors that teach | A failure sets `isError: true`, names the cause and the next call to make, and contains no absolute local path | Every model | Fixture matrix: unknown handle, unknown id, invalid action, missing field, renderer unavailable |
| 10 | Durable handles | `programRef` and other server-minted handles work across processes; the creating tool's description states retention; an unknown or expired handle is a tool error with a recovery step | 2026-07-28 has no session state | Test across two server processes |
| 11 | Stable tool list | Same order and bytes across processes; `listChanged` advertised only if Kiln emits it | Reordering breaks prompt caches | Test compares two processes |
| 12 | Lean standing knowledge | Generated workspace guide at most 5,000 characters; generated `CLAUDE.md` is a one-line import of `AGENTS.md`; each `SKILL.md` at most 16,000 characters and 500 lines; each reference file has one source | The guide rides on every request; Claude Code re-injects at most 5,000 tokens of a skill after compaction | `check:skills` and the workspace bootstrap tests |
| 13 | No structured copy beside a picture | A result that carries an image never also carries `structuredContent` | Claude Code replaces the text with it; Codex is reported to drop the image (unverified) | Fixture test |

Design rules behind the table, for choices the table does not settle:

- Four budgets: what is always in context (definitions, instructions, the guide), knowledge
  fetched on demand (skills, `kiln_discover`), each result, and the model's own arguments.
- Design to the strictest harness. Put the signal first. State each fact in one place.
- Receipts belong in the retained record, not the conversation. Results are bounded by
  construction, and detail is disclosed on request.
- Arguments are output tokens: work by reference and never ask the model to resend a program.
- Results are plain JSON with stable keys, so script-driven callers can use them unparsed.

## Steps

Every behaviour change is test first: the failing test, the expected failure seen, the smallest
fix, the focused test, then the gate. After runtime source changes, rebuild with
`node scripts/build-runtime.mjs all` before any CLI or MCP check.

### Step 0: set up, baseline, rig

1. `bun install --frozen-lockfile`, build, and run the whole offline gate once on the untouched
   branch. Use the pinned toolchain in `toolchain.json`; if this PC's default Node fails
   `check:toolchain`, switch with fnm and leave the pins alone.
2. Point the rig in `tmp/harness-probe/` at this worktree's build. Its scripts still name the
   main checkout's `dist/mcp-server.mjs`.
3. Update OpenCode and Agy (decision 11) and record versions before and after.
4. Extend the offline rig to OpenCode: `opencode run --standalone` under a fresh
   `XDG_CONFIG_HOME` with a stand-in provider. An isolated `opencode mcp list` hung on 2.0.14 on
   1 October; find out why before relying on it.
5. Agy cannot be pointed at a stand-in provider. Its facts come from short live sessions through
   a logging relay (`scripts/observe-mcp.mjs` or the rig's relay), each under a new empty home.
6. Build the Troy seed workspace on 0.9.0 and fix the session wording, order and harness for
   each subject (see "Troy pack attempt").
7. Fill the four-harness table for 0.9.0, then run the baseline sessions.
8. Give the blind driver (`scripts/tier2-dogfood.mjs`) a repository option, test first, so a
   blind run can clone a local mirror of this unpushed branch. Today it names only the public URL.
9. Draft the cleanup list.

### Step 1: protocol and startup

- Library bump first (decision 3), then the gate.
- Conformance tests for both revisions in the gate and in the smoke tests.
- The startup spike (decision 13), then the fix. The workspace skill-hash check and the render
  probe leave the startup path; their diagnostics must still reach the agent.
- Real cache hints: definitions are fixed for a build.
- For a request with neither a version nor a prior handshake, confirm the spec text, then refuse
  with the documented error.
- Advertise `listChanged` only if Kiln emits it.
- State handle retention in the creating tools' descriptions and return a recovery step for an
  unknown or expired handle.
- Keep the prompt exit on stdin close (about 22 ms today) under a test.
- Docs state the supported revisions and each harness's switch, checked against the vendor docs
  at writing time.

### Step 2: tool surface, as one versioned batch

Tool definitions are prompt-cached, so every schema and description change lands together under
0.10.0, with each break named in the changelog.

- `kiln_project`, `kiln_material` and `kiln_review` become one object with an `action` enum.
  The server validates per-action requirements and names the missing field.
- Schemas come under 5,000 bytes by removing repeats and by serving nested input shapes from
  `kiln_discover` on request.
- Instructions come under 700 characters; every description opens with its purpose.
- `src/tools/registry.ts` stays the single source. Both skins iterate it, the name-parity test
  stays green, and `docs/tools.md` is regenerated.
- Rig check: Claude Code declares every action of the three tools, in a normal session and
  behind a custom API address, and Codex shows no `unknown` field.

### Step 3: results

- JSON on one line everywhere (23% fewer tokens in the rig, nothing lost).
- The review listing returns one short record per operation, paged with a cursor; `get` returns
  one operation in full.
- The part listing returns paths by default, paged.
- `detail: 'full'` returns the requested sections inside the limit plus the path of the retained
  report. The retained file is pretty-printed so line-based file tools can read it. The name
  `full` keeps working.
- Lean render results and changes-only edit results sit behind a `detail` value (decision 12).
  The server-side default is switchable at startup for the paired comparison without a schema
  change.
- Signal order per rule 8. Error matrix per rule 9, including the raw file error from
  `kiln_review`.
- Smaller single-view images where the rig's PNG measurements show a gain.
- Compaction stays at the output boundary, after the retained artifact is recorded
  (`src/tools/review-detail.ts`).

### Step 4: knowledge and setup surface

- Halve the generated workspace guide and make the generated `CLAUDE.md` a one-line import.
  Existing workspaces are never rewritten silently: qualify fresh setup and managed upgrade.
- Remove skill copies no harness needs. Check each harness first: OpenCode's generated config
  points at `skills/`, and the server instructions name that folder.
- One source for the duplicated reference files; trim `kiln-author-asset/SKILL.md`.
- Doc corrections from the defect list; manifests corrected and versioned 0.10.0.
- `check:skills` enforces rule 12.

### Step 5: proof

- Rerun the offline rig on the final build: Claude Code and Codex in both protocol modes, and
  OpenCode.
- Rebuild the Troy seed workspace on the final build, then two short live sessions on each of
  the four harnesses.
- The wave, then the trace report in `docs/reviews/`.
- One fix pass, test first. After any change to shared skills or tool text, rerun the affected
  sessions from the reserve.
- Pick the pack candidates and record their numbers and the scene totals in the report.
- Fresh-clone proof: clone the branch, install, rebuild `dist/` identical to the committed copy,
  run the gate and `bun run test:package`, create a workspace for each of the four harnesses and
  confirm its Kiln tools come up.

### Step 6: cleanup list and final report

The list covers the worktrees (14 today), local branches (17), remote branches (2), the
`.dogfood-*.log` files in the main checkout and the `kiln*` folders beside the repo (about 45),
each with a proposed action and reason. Nothing is deleted, moved or pruned.

The final report follows item 9 of the goal statement. Hosted CI is an exclusion by
construction, because nothing is pushed.

## Live sessions

`docs/dogfooding.md` defines the three tiers and the prompt rules: one sentence, no tool names,
no brief file, no scripted steps, ask for the subject. `skills/kiln-batch-dispatch` gives the
trial rules. This plan is the authorization record that `dogfood:tier2 --run-live` requires.

| Block | Sessions | What |
| --- | ---: | --- |
| Baseline on 0.9.0 | 6 | A relay-logged wiring session on OpenCode and on Agy; one plain-prompt authoring session on each of the four harnesses, all on the chariot brief |
| After the fix round | 8 | Two per harness: the chariot brief again, then refining that saved chariot by reference |
| Wave | up to 36 | 22 paired sessions: 11 subjects, each run in both result modes on one harness (3 subjects each on OpenCode, Agy and Codex, 2 on Claude Code); 4 character sessions on Claude Code with Opus 5.5; 2 scene sessions, one each on Claude Code and Codex; 4 blind new-user runs through `dogfood:tier2` (2 each on OpenCode and Agy); 4 in reserve for repeats and for confirming the fix pass |

That is 12 sessions each on OpenCode, Agy and Claude Code, 10 on Codex and 4 in reserve.

- One launched harness process against a live model is one session. A blind run and its nested
  author count as one. A session that dies on quota or sign-in still counts. A planned session
  that turns out not to be needed returns to the reserve.
- Deadline 30 minutes each (`--timeout 30m`). A provider-level failure stops the batch.
- Subjects come from the Troy inventory below. Between them they cover a static prop, a
  hard-surface asset with moving parts, an animated subject, an enclosed interior, a
  material-led subject, refining a saved asset and composing a scene. Fix and record the exact
  wording, the order and the harness for each subject before the first session, not after
  seeing results.
- The result mode is set by server configuration, never by the prompt. Both sessions of a pair
  start from the same workspace state. Compare task success, total tokens per finished asset,
  and follow-up calls for detail. Character, scene and blind sessions use the default mode and
  stay out of the comparison.
- Isolation: OpenCode under a fresh `XDG_CONFIG_HOME` with `--standalone`; Agy under a new
  empty home for every session, because Agy keeps conversation state in its home; Claude Code
  with `--safe-mode --strict-mcp-config`; Codex with `--ignore-user-config --ignore-rules`.
  User-level configuration is never edited. Never read sign-in stores or the `credential` and
  `account` tables of OpenCode's database. Leave the owner's OpenCode background service alone.
- Agy homes: checked on 1 October 2026 with the blind driver's own child environment and no
  prompt. Under a new empty home `agy models` exits 0 and lists `gemini-3.8-flash-high`, and
  `agy mcp list` prints "No MCP servers configured." Repeat that check before the first Agy
  session. The folder `probe-01` there is used; it is not a session home. The blind driver takes
  one `--agy-home` per batch, so Agy blind runs go one run per batch.
- Models (decisions 10, 16 and 18): Claude Code on `claude-sonnet-5-5`; Codex on `gpt-6.1-sol`
  (in the model list of Codex 0.159.3); Agy on `gemini-3.8-flash-high`; OpenCode on Meta Muse
  Spark 1.3 Contributor, whose id is confirmed with `opencode models` first; the four character
  sessions on `claude-opus-5-5`. Do not substitute a model: if one is unavailable, stop that
  harness's sessions and report. Record the exact model id, effort and harness version for
  every session from its trace, and whether images reached the model.
- Protocol: sessions run on each harness's own default. The exception is the refine session of
  each after-fix pair, which sets that harness's 2026-07-28 switch for the one process or
  workspace (Claude Code, Codex and OpenCode today; Agy if it turns out to have one), so the new
  revision is exercised with a real model on every harness that offers a switch. Generated
  workspaces never set the switch. Record the revision every session used.
- Contributor-tier models may train on prompts. Sessions carry only public repository content
  and public-style briefs.
- Before reading a result, confirm the session called the workspace server's tools and that its
  trace exists. Read every trace. Rebuild saved source independently. A CPU view is evidence
  about shape, not material.
- Check `kiln service status` first and share a compatible render service. Never stop a service
  this cycle did not start; if the listener is incompatible, use a separate port through
  `KILN_RENDER_SERVICE_PORT` and say so in the evidence. Check CPU and GPU load before timing.
- Workspaces and raw evidence live under `C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10/`,
  outside the repository. Raw traces stay private; only a reviewed report enters `docs/reviews/`.
- Dogfood assets are local-only candidates. None enters the gallery or the site.

## Troy pack attempt

Decisions 17 and 18. The sessions above need subjects anyway, so they build towards one pack and
its scene. This section is deliberately short: the pack is an attempt, and it never displaces a
contract fix or takes a session beyond the cap.

- **Source.** The Iliad story and Late Bronze Age buildings and equipment. The film is a
  reference for scale and mood only: no design and no actor's likeness is copied from it.
- **One project.** A seed workspace holds a Kiln project `troy`: the brief (metres, a 1.8 m
  soldier, the hand grip size, a short palette and style note, a draw-call target per kind of
  asset), the inventory below, a design profile and a small pinned material set. Each session
  workspace is a copy of the seed with `KILN_PROJECT=troy`, so the prompt stays one sentence
  and names only the subject. That also exercises `kiln_project` and `kiln_material` in real
  sessions, including whether a configured project's brief reaches the agent unprompted. Blind
  runs stay standalone. A recorded script builds the seed, once on 0.9.0 and once on the final
  build.
- **Draw calls.** Shared materials keep the material count low. Each candidate's triangles,
  materials and draw calls come from Kiln's own metrics. The composed scene reports its totals
  and instances repeated pieces. Optimization derivatives belong to the scene and never become
  requirements for a standalone asset.
- **Characters.** The Trojan soldier is authored first. The Greek soldier, Hector and Achilles
  are made from the picked soldier by reference, so proportions, rig and grips stay consistent.
  If the first session leaves no usable soldier, the next character session continues it
  rather than starting a variant.
- **Selection.** After the traces are read, pick at most one candidate per subject on evidence:
  QA, an independent rebuild of the saved source, and GPU views where material matters. Link the
  picked revisions to the project inventory through Kiln's own commands, never by editing
  records by hand. Export the editable and runtime packages locally if the picks support it.
- **Limits.** Candidates only: the owner's review decides what the pack contains, and nothing
  enters the gallery or the site. A subject without a usable candidate is listed as work for
  the separate pack goal, with a wall tower and further named characters.

Proposed inventory. The wording is fixed in step 0.

| Where | Subjects |
| --- | --- |
| Baseline and after the fix round, all four harnesses | war chariot; then refining it by reference |
| Paired wave, structures | wall section that tiles; gate with doors that open; house that can be entered; temple hall |
| Paired wave, animals and set pieces | horse; Greek ship; the wooden horse on wheels with a hatch |
| Paired wave, weapons | sword; round shield; bow with arrows and quiver |
| Paired wave, refine | the picked wall section, breached |
| Characters, Claude Code on Opus 5.5 | Trojan soldier with an idle and an attack; then by reference a Greek soldier, Hector and Achilles |
| Scene, Claude Code and Codex | the battle before the gate, composed from the picked assets |
| Blind runs, standalone | spear; amphora; army tent; brazier |

Session wording, order and harness, fixed on 1 October 2026 before the first session. Each prompt
is the whole message. Sessions in the Troy project run in a fresh workspace that imported the seed
package, with `KILN_PROJECT=troy` set on the workspace server; the prompt never names the project.

| # | Block | Harness | Prompt |
| ---: | --- | --- | --- |
| 1 | Baseline wiring, standalone | OpenCode | Make a small wooden crate, then list its parts. |
| 2 | Baseline wiring, standalone | Agy | Make a small wooden crate, then list its parts. |
| 3 to 6 | Baseline | OpenCode, Agy, Codex, Claude Code | Make a Late Bronze Age war chariot. |
| 7 to 14 | After the fix round, two per harness | OpenCode, Agy, Codex, Claude Code | Make a Late Bronze Age war chariot. Then, in the same workspace with the 2026-07-28 switch set: Refine the saved war chariot: give it a quiver of javelins on the right side of the car and thicker wheel rims. |
| 15, 16 | Pair, compact first | OpenCode | Make a Bronze Age sword. |
| 17, 18 | Pair, lean first | OpenCode | Make a round bronze-faced shield with a grip on the back. |
| 19, 20 | Pair, compact first | OpenCode | Make a section of Troy's city wall that tiles end to end. |
| 21, 22 | Pair, lean first | Agy | Make a chariot horse with a standing pose and a gallop. |
| 23, 24 | Pair, compact first | Agy | Make a bow with arrows and a quiver. |
| 25, 26 | Pair, lean first, after the wall pick | Agy | Refine the saved wall section into a breached one, with a gap wide enough for three soldiers and rubble at its foot. |
| 27, 28 | Pair, compact first | Codex | Make a Greek war galley with a mast, a sail and oars. |
| 29, 30 | Pair, lean first | Codex | Make a temple hall for Troy's citadel with a columned porch and an interior. |
| 31, 32 | Pair, compact first | Codex | Make a Trojan house that a soldier can walk into. |
| 33, 34 | Pair, lean first | Claude Code | Make Troy's city gate with two doors that open. |
| 35, 36 | Pair, compact first | Claude Code | Make the Trojan Horse: a huge wooden horse on wheels with a hatch that opens in its belly. |
| 37 | Character, Opus 5.5 at `xhigh` | Claude Code | Make a Trojan soldier with an idle animation and an attack animation. |
| 38 | Character, same workspace | Claude Code | Make a Greek soldier from the saved Trojan soldier, keeping its proportions, rig and animations. |
| 39 | Character, same workspace | Claude Code | Make Hector from the saved Trojan soldier, keeping its proportions, rig and animations. |
| 40 | Character, same workspace | Claude Code | Make Achilles from the saved Greek soldier, keeping its proportions, rig and animations. |
| 41, 42 | Scene, after the picks | Claude Code, Codex | Compose the battle before Troy's gate from the saved assets in this workspace. |
| 43, 44 | Blind, standalone | OpenCode | Goals: a Bronze Age spear; an amphora. |
| 45, 46 | Blind, standalone | Agy | Goals: an army tent; a brazier. |
| 47 to 50 | Reserve | | Repeats and confirming the fix pass. |

Launch rules settled while building the session runner on 1 October:

- Every session reaches the workspace server through a logging relay
  (`kiln-dogfood/v1-readiness-2026-10/tools/mcp-relay.mjs`), because nothing else records the
  protocol revision a harness used. The relay passes bytes through unchanged.
- Claude Code authoring sessions use `--setting-sources project --strict-mcp-config --mcp-config`
  instead of `--safe-mode`: safe mode also disables the workspace's own `CLAUDE.md` and skills,
  which are part of what a session tests. Blind runs keep safe mode for the outer agent.
- OpenCode stays on 2.0.14. Version 2.0.21 is published, but the owner's background service runs
  from the installed binary and a second copy would share its database. The update is the owner's
  decision.
- `kiln project import` refuses the package's own project id, so the seed project is `troy-seed`
  and each session workspace imports it as `troy`.
- Sessions use a render-service port of their own (`KILN_RENDER_SERVICE_PORT`), one per Kiln
  build, so they never share or replace a service started by other work on this PC.

## Stop and report

Stop, state what was found and wait for the owner when:

- continuing would need a push, tag, PR, merge, publish, deploy, upload, history rewrite or a
  deletion;
- the session cap is reached;
- a contract limit or a coverage threshold would have to be lowered;
- Agy cannot sign in under a new empty home, or `agy mcp list` there is not empty (finish
  everything else first);
- a named model is unavailable in its harness (finish the other harnesses first);
- OpenCode's background service blocks its update;
- a dependency beyond decision 3 would be added, or the tool set would be regrouped.

## Progress log

Stamp each entry from the clock, not from an estimate.

| When | What |
| --- | --- |
| 2026-10-01 16:20 -04:00 | Plan recorded with the owner's fifteen decisions. Rig copy refreshed in `tmp/harness-probe/`. No code changed. |
| 2026-10-01 16:38 -04:00 | Decisions 10 and 15 amended and 16 to 18 added from the owner's later messages: models, Agy homes, the Troy pack attempt and Opus 5.5 for characters. Agy homes root created and checked with no prompt sent. `gpt-6.1-sol` confirmed in Codex's model list. Session table and goal statement rewritten. No code changed. |
| 2026-10-01 16:50 -04:00 | Owner asked whether 2026-07-28 should be the default. Read OpenCode's per-server protocol setting from its 2.0.14 binary; Agy starts no server without a session, so its opening message is still unmeasured. Decision 2 confirmed through the question tool: follow each harness, with one live session per harness on the new revision. No code changed. |
| 2026-10-01 17:08 -04:00 | Goal started about 16:52. Step 0.1: `bun install --frozen-lockfile`, then the whole gate on the untouched branch (143ecba) under Node 22.23.2 from fnm: build-runtime, check:toolchain, check:skills, typecheck, lint, test, test:render-service and test:coverage all exit 0. `test`: 3042 pass, 2 skip, 0 fail across 387 files. `test:render-service`: 78 pass. Coverage ratchet: functions 95.22% (minimum 94.00%, 57 functions of slack), lines 92.48% (minimum 92.10%, 250 lines of slack). The rebuild left `dist/` identical to the committed copy. Logs in `kiln-dogfood/v1-readiness-2026-10/gate/baseline-0.9.0/`. Step 0.2: the twelve rig scripts now name this worktree. Step 0.3 so far: Agy 1.2.14 is already the latest (`agy update` changed nothing); OpenCode is 2.0.14 with 2.0.21 published, and the owner's background service runs from the installed binary, so no in-place update; Claude Code 2.1.287 is the latest; Codex is 0.159.3 with 0.160.0 published. OpenCode lists `opencode-go/muse-spark-1.3-contributor`, the id the 0.9 campaign used. No code changed, 0 of 50 sessions used. |
