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

## Owner decisions, 2 October 2026

Answered through the question tool after the cycle closed (the report's section 9 listed
them), in five batches, with one answer given as a message. They govern the follow-up cycle
below; where one changes an earlier decision it says so.

| # | Decision | Answer |
| --- | --- | --- |
| 19 | Merge path | Push `v1-readiness` and open one PR against `main`, after the follow-ups in 23 to 28 land on the same branch test first and the gate and fresh clone pass on the final commit (changes decision 6 for that one push and one PR; the merge stays the owner's). Decision 8 holds: commits carry the trailer and the PR body carries no footer. |
| 20 | Site release value | 0.10.0 stays; the owner cuts 1.0.0 later (decision 4). |
| 21 | Plugin `$schema` | Stays out: the dropped URL answered 404. |
| 22 | OpenCode version | Stays at 2.0.14 (decision 11 holds); never update over the running background service. |
| 23 | F28, `this` | Allow `this` inside object-literal and class methods in generated code, test first, under a strict-mode guarantee so the safety net can tell a method receiver from the host global. Keep refusing `module`. |
| 24 | H30, generic rejection | The generic "Generated asset execution was rejected." sentence gains engine-owned advice: a thrown message never crosses the sandbox; measure with `kiln_inspect`. The adversarial isolation test's exact match moves to the first sentence. |
| 25 | Material id | `kiln_material` accepts `resourceId` as an alias of `materialId`; the docs keep `materialId`. |
| 26 | Lean for Agy | `kiln-init` writes `KILN_RESULT_DETAIL=lean` into the generated Agy workspace's server entry only; the other harnesses keep the compact default (closes decision 12 with the wave's measurement: lean won both measures only in the Agy pairs). |
| 27 | H26, resources and pins | Both: saved manifests are served as resources minified, and a project revision implies its material pins, with explicit pins winning when a call names them. |
| 28 | CLI edges | `kiln asset <id>` reads the newest revision when no revision is named; `kiln save --help` prints its own usage. |
| 29 | Order | The follow-ups land on `v1-readiness` before the PR: test-first commits, the gate again, the fresh clone, then the push and the PR. |
| 30 | Wall masonry | The `warm-brick` preset reads as fired brick and its box UVs stretched. Two procedural materials from the palette replace it on all five masonry structures (wall, breach, gate, house, temple) and in the scene: `troy-limestone` (coursed blocks, 1.2 m tile) and `troy-mudbrick` (plastered courses, 1 m tile), with every box face mapped in world units. Done by this session through the 0.10.0 CLI in the review workspace `kiln-dogfood/v1-readiness-2026-10/review/troy-refine/` (no live session), stopping after the two materials and the wall's revision 2 for the owner's look before the rest. |
| 31 | Horse | w21 (pinned materials, 55 draws, Stand and Gallop clips), with its barrel body slimmed as revision 2 in the same pass and shown in the viewer before the scene is recomposed. |
| 32 | Scene | s50's composition is carried: recomposed from the refined revisions, no new layout; s42's stays as it is for comparison. |
| 33 | Pack home | The pack is finished properly on this side (refined revisions, project pins, `picks.md`, the report addendum, the viewer) and stays local. The full pack and scene are a later task for a different agent, after the optimization agent's findings are folded back into Kiln and its skills; no full scene authoring in this cycle. |
| 34 | Cleanup | After the PR merges; the owner runs the removals himself (decision 7 holds). |

Decision 33 came as a message; the others as question-tool answers.

### Follow-up goal statement

The owner passes this text to start the follow-up cycle. It is within `/goal`'s 4,000
characters.

<!-- goal2:start -->
```text
Complete the Kiln v1 readiness follow-ups recorded under "Owner decisions, 2 October 2026" in docs/plans/2026-10-01-v1-readiness-cycle.md, working only in the worktree C:/Users/Mattm/X/kiln-v1-readiness on branch v1-readiness. Keep the plan's progress log current, stamped from the clock.

Done when all of these have been shown in this conversation:
1. Engine follow-ups as separate commits, each test first with the failing test shown, then the smallest fix: the sandbox allows `this` inside object-literal and class methods under a strict-mode guarantee and still refuses `module` (decision 23); the generic "Generated asset execution was rejected." error carries engine-owned advice and the isolation test's exact match sits on its first sentence (24); kiln_material accepts resourceId as an alias of materialId while the docs keep materialId (25); kiln-init writes KILN_RESULT_DETAIL=lean into the generated Agy workspace's server entry only (26); saved manifests are served as resources minified and a project revision implies its material pins with explicit pins winning (27); `kiln asset <id>` reads the newest revision and `kiln save --help` prints its own usage (28). The changelog, docs/migration.md, docs/tools.md and the skills state each change.
2. Troy pack material pass, local only: troy-limestone and troy-mudbrick replace warm-brick on the wall, breach, gate, house and temple as new revisions with world-unit box UVs; the horse w21 gets a slimmer body as a revision; s50's composition is recomposed from those revisions with no new layout; every revision is in the viewer, in picks.md and in a report addendum with triangles, draws and materials. No live model session, no new scene authoring, nothing published.
3. Offline gate on the final commit after `node scripts/build-runtime.mjs all`: check:toolchain, check:skills, typecheck, lint, test, test:render-service and test:coverage each exit 0 with no coverage threshold lowered; print every exit code and the test totals. A fresh clone of that commit installs, rebuilds dist/ identical to the committed copy, passes the gate and test:package, and its workspaces answer 17 tools for claude, codex, opencode and agy.
4. Records match the code: version 0.10.0, the changelog, README, docs/tools.md, skills, plugin manifests, generated workspace instructions, the report's addendum and the plan's log.
5. Then, and only then: push v1-readiness to origin and open one PR against main with the report linked, no footer in its body. No merge, tag, publish, deploy or history rewrite.

Rules that hold throughout: local commits on v1-readiness only, each ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; never edit, switch, stash or clean C:/Users/Mattm/X/kiln-oss; never edit user-level harness configuration; never read or print secrets, .env files or sign-in stores; delete nothing; lower no contract limit and no coverage threshold; no live model sessions (the cap is spent); keep the tool input schemas stable.

The goal is also complete when you stop and report one of these with evidence: continuing would break a rule above; a contract limit cannot be met without my decision; or the plan marks the next decision as mine.
```
<!-- goal2:end -->

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
| 2026-10-01 18:06 -04:00 | Step 0.3: Codex updated 0.159.3 to 0.160.0 at 17:09; OpenCode stays at 2.0.14 because the owner's background service runs from the installed binary (the owner's call). Steps 0.2, 0.4 and 0.5: the rig gained `--live` and a root option; OpenCode and Agy facts came from relay-logged live sessions rather than a stand-in. Step 0.6: frozen clone `runtime-0.9.0` of 143ecba (install and rebuild leave it clean); the Troy seed was built on it by a recorded script (project `troy-seed`, imported into each session as `troy`: 17 inventory items, 12 palette roles, five pinned preset materials); the session wording and order are fixed in the table above. Step 0.7: seven sessions used. b01 OpenCode wiring 31 s; b02 Agy wiring 181 s, one asset; b03 OpenCode chariot 217 s, one asset through the CLI after a quoting failure in code mode; b04 Agy chariot 369 s, one asset; b05 Codex chariot, asset saved by 17:41, then the harness sat behind a viewer the skill told it to launch until the 30-minute kill; b06 Claude Code died on sign-in in 4 s; b06b, after the owner signed the CLI in through its browser flow at about 17:52, 213 s, one asset. Every session built standalone: none saw the configured project (F1, F8). Findings S1 to S12, F1 to F11 and H1 to H15 are in the local `findings.md`; the live four-harness table is below. Step 0.8: the blind driver's `--repository` option, test first, committed with the plan as 185f728. Step 0.9: the cleanup inventory is delegated and still running. Step 1 begun: the decision 13 spike measured Node alone at 48 ms, the protocol library at about 158 ms and the whole 0.9.0 entry at 492 ms, so the design is a thin entry answering from a generated manifest; the both-revision conformance tests are written (12 tests; 3 fail on 0.9.0 for Kiln-side gaps: a claim-less request before any handshake is served, and `listChanged` is advertised and acknowledged though never emitted); the libraries are bumped to server and client 2.2.0 and ext-apps 2.0.3 with the same 9 pass and 3 fail on both versions, and the full gate on the bump is running. 7 of 50 sessions used. |
| 2026-10-01 18:52 -04:00 | The bump gate passed every step but lint, which failed only on the formatting of the new test helper; fixed, and the bump committed as 2e12e12 with the plan. Step 1 implemented, test first: `src/mcp-core.ts` (handlers over a manifest on the low-level `Server`, cache hints, the pre-handshake guard), `src/mcp-engine.ts` (definitions, execution, resource reads, the packaged host), `src/mcp-manifest.ts` and `scripts/generate-mcp-manifest.ts` (`src/generated/mcp-manifest.json`, 210,990 characters, regenerated by the `mcp` build), and `src/mcp-server.ts` as the thin entry (219 KB bundled, protocol library and manifest only) loading `dist/mcp-engine.mjs` (2.85 MB) on the first call that needs it and warming it after the first `tools/list`. Conformance 12 of 12, startup 5 of 5, manifest 2 of 2; the stale-workspace test now proves recovery in the same process after `--upgrade`. Measured: first answer 229 and 245 ms in the startup test and 332 to 421 ms by the rig dump while the gate loaded the CPU (1,486 ms on 0.9.0 idle); definitions 74,471 characters (75,497), `ttlMs` 86,400,000 public on discover and lists, no `listChanged`, byte-identical definitions across processes. Typecheck and lint clean; the full gate on this tree is running and its `test` step already reported one failure of mine: the new AGENTS.md paragraph pushed the file over its 12 KiB contract, trimmed to 12,230 bytes (9 of 9 reliability contracts pass on rerun). Rule 10 (durable handles, recovery text, retention in descriptions) is written as a test and waits for the gate before the source changes. Step 0.9 finished: the read-only inventory is in `kiln-dogfood/v1-readiness-2026-10/cleanup/` (`cleanup-facts.json`, `cleanup-list-draft.md`); while it ran, another Claude Code session (pid 31032, not this one) removed 12 of 14 worktrees and 12 of 14 local branches between about 18:17 and 18:22, three of them with uncommitted changes; every deleted branch tip still exists as a commit and the SHAs are in the inventory. This worktree and the main checkout remain. 7 of 50 sessions used. |
| 2026-10-01 19:27 -04:00 | Step 1 finished and committed as 8d54eb6 (53 files). The thin-entry gate at 18:44 passed every step except `test`, whose one failure was the AGENTS.md size contract already fixed; its coverage step ran the same tests green. Rule 10 test first (`src/__tests__/mcp-handles.test.ts`: a handle from one process resolves in a second process sharing `KILN_PROGRAM_STORE`; an unknown handle on `kiln_source` and `kiln_render` names `kiln_validate` and `programRef` and no local path; the issuing tools state retention), failing as expected on the message and the descriptions, then the smallest fix: `programNotFound` in `src/program-store.ts` used by both stores, `ProgramStore.retention` ("kept in the program store across sessions and processes, never evicted" for the file store), the sentence in the six handle-returning descriptions, `docs/tools.md` generated over the file store. The first gate on that tree failed one older budget test (fourteen base tools under 32,768 characters: 33,085 with the sentence), so the same descriptions dropped the words that repeated the field text (32,695 now; F14) rather than raising the budget. Second gate, all exit 0: `test` 3067 pass, 2 skip, 0 fail across 391 files; render-service 78 pass; coverage functions 94.98% (minimum 94.00%), lines 92.33% (minimum 92.10%), both above the ratchet and slightly below the 0.9.0 figures because the new entry modules are thinner on tests. Step 2 begins with the rules 3 to 6 registry test. 7 of 50 sessions used. |
| 2026-10-01 20:04 -04:00 | Step 2 finished, test first (`src/tools/__tests__/registry-contract.test.ts` for rules 3 to 6 over the packaged manifest, failing on the three root unions, four schemas over 5,000 bytes and the 2,297-character instructions; `configured-project.test.ts` for F1/F8; `source-file-input.test.ts` for F2). Fix: `kiln_project`, `kiln_material` and `kiln_review` are flat objects with an `action` enum and server-side requirement errors (`src/tools/actions.ts`); nested `draft`, `patch`, `payload`, `capture` and `shot` records are opaque in the schema and served in full by the new Discovery kind `shape` (`src/discovery/shapes.ts`); camera shapes are stated once in `src/tools/capture-input.ts`; `file` input beside `code` and `programRef`; capabilities, overview and bound results name the configured project; instructions rewritten to 692 characters. Measured on the regenerated manifest: the seventeen advertised definitions 39,603 characters as JSON (74,649 at 8d54eb6), every schema within 5,000 bytes (largest `kiln_render` 4,914; `kiln_material` was 18,788), schemas 26,475 bytes in all (61,598), manifest 72,659 characters (205,917). `docs/tools.md` is now generated from the packaged manifest (seventeen tools). AGENTS.md names the new modules at 12,253 bytes of its 12 KiB. Gate `step2-surface` at 20:04, all exit 0: `test` 3080 pass, 2 skip, 0 fail across 394 files; render-service 78 pass; coverage functions 94.90% (minimum 94.00%), lines 92.34% (minimum 92.10%). The rig check of the flat actions on Claude Code and Codex waits for the after-fix build in step 5. 7 of 50 sessions used. |
| 2026-10-01 21:59 -04:00 | Step 3 finished, test first (`src/__tests__/result-contract.test.ts` for rules 7, 8 and 13, `mcp-errors.test.ts` for rule 9, `review-detail.test.ts`, `render-warnings.test.ts`). Every result is one-line JSON led by the verdict; the compact report groups findings by code; `detail` takes `lean`, `compact` or `full` on the five review tools with `KILN_RESULT_DETAIL` as the packaged default; `full` is bounded at 40,000 characters and names the pretty-printed retained report; review listing pages and `get`/`pin` are bounded; part listing is paths unless `placement: true`; errors are `isError` sentences naming the next call and no path. The step-3 fixture (97 parts, all floating) measured compact 23,978 characters before the warning fix and 9,103 after, `full` 16,734 with 80 paths, `lean` 2,018; the duplication was the floating-parts check run twice (export and the re-imported review scene) naming 47 parts each with a 170-character fix, now one bounded warning (F16; F3, F9, S1 and S4 closed). The first gate on the tree failed `test` on three assertions of mine (`lastFaithful` dropped from compact `viewEvidence`, the save error's leading phrase, the derivative-views hash test); fixed, 42 of 42 on the focused suites. Committed next, as the first of two commits after the step-4 gate below, which ran on the combined tree; the SHAs are in the step 5 row. 7 of 50 sessions used. |
| 2026-10-01 21:59 -04:00 | Step 4 finished. Measured first-hand: Codex 0.160.0 reads a project's `.codex/config.toml` only once `$CODEX_HOME/config.toml` marks it trusted (H17); Claude Code 2.1.287 loads `AGENTS.md` only where no `CLAUDE.md` exists and never loads an imported file twice (H18); Claude Code's binary names `.claude/skills` and `.agents/skills`, OpenCode's only `skills.paths` (H16). Test first (`workspace-bootstrap.test.ts`: guide within 5,000 characters, `CLAUDE.md` is `@AGENTS.md`, one registry per harness, `KILN_PROJECT` forwarded; `workspace-upgrade.test.ts`: the second registry of a 0.9 workspace is retired or reported as a conflict; `tier2-dogfood.test.mjs`: tool names from the manifest; `check-skills.test.mjs`: rule 12 limits and one source per file). Guide 10,716 to 4,461 characters; author skill 19,030 to 15,846; `engine-handoff.md` once in the QA skill and `export-profiles.md` once in the author skill; `kiln-init --help` names seven harnesses; manifests 0.10.0 and `kiln`, the 404 `$schema` dropped; version 0.10.0 in `package.json`, README, `docs/install.md`, the site release value and the changelog heading. The first gate on the combined tree failed `test` on two assertions of mine (the `MCP_SERVER_VERSION` literal still 0.9.0 against the 0.10.0 package; cross-skill markdown links, which the skill-resources test requires to resolve inside their skill, now plain mentions by skill and path); fixed, and gate `step4-knowledge-2` at 21:58 on the combined step 3 and 4 tree, all exit 0: `test` 3105 pass, 2 skip, 0 fail across 398 files; render-service 78 pass; coverage functions 95.05% (minimum 94.00%), lines 92.41% (minimum 92.10%), both above the ratchet. Committed next as the second commit. Near miss recorded: a .NET relative path in the PowerShell tool resolved against the main checkout; nothing was written there (`git status` clean). 7 of 50 sessions used. |
| 2026-10-01 22:34 -04:00 | Steps 3 and 4 committed as `aa3c570` and `51e382b` (the two staged reference-file deletions rode in `aa3c570`, so the skill tree is self-consistent only at `51e382b`; no history rewrite). Step 5 so far, on `runtime-0.10.0` (a fresh clone of `51e382b`: frozen install 24 s, rebuild 7 s, `dist/` identical, build identity `sha256:45dec4b0…`): the rig on the after-fix build passed its ten runs (one rerun after a rig-only socket crash, F17): Claude Code's first request carries all 17 tools (36,538 characters; 0.9.0 dropped three), `tools/list` answered 261 to 290 ms, both revisions on both harnesses, the flat actions answer, largest scripted result 20,320, nothing truncated (H19, H20, F18). Fresh-clone proof rehearsed end to end on `51e382b` by `tools/fresh-clone.ps1` with the gate skipped: `test:package` 71 s exit 0, four generated workspaces answer 17 tools on both revisions (265 to 374 ms) from each harness's own file, listings recorded with their limits. Live after-fix sessions, all built on the configured project: f07 OpenCode 483 s one asset; f08 OpenCode refine 288 s, revision 2, but its `protocol: 2026-07-28` entry did not change the handshake (H22, OpenCode's cell says so); f09 Agy 713 s, one asset linked into the inventory, `server/discover` by default, inline threshold now between 3,913 and 4,160 characters, three cache misses (H23); f10 Agy refine running, f11 to f14 queued in `sessions/afterfix.log`. Found and fixed test first: F19, a compact `kiln_edit` over rule 7 (20,069, 20,441 and 27,865 characters: the whole comparison with bounds per change), now a compact comparison of counts, before/after and twelve path/name/status/fields changes, with the diff shrinking last (`review-detail.test.ts`, the rule-7 grid case; focused suites 27 pass; typecheck and lint clean; gate `step5-f19` running, five steps exit 0 so far). Found, not yet fixed: F21, a doubled period in invalid-input errors (`actions.ts:50`; fix with a `teaches()` assertion after the gate). Ready and parse-checked: `tools/step5-wave.ps1 -Runtime <name>` (new runtime, wave and character specs rewritten onto it, sessions 15 to 24, 27 to 36 and 37 to 40 in order), `tools/pack-metrics.mjs` (eight saved revisions so far from `build.integration.renderMetrics`), `tools/fresh-clone.ps1` for the final commit. Next: F21, gate, commit the fix pass, then the wave on the new runtime. Local findings in `kiln-dogfood/v1-readiness-2026-10/findings.md`; report skeleton in the scratchpad. 10 of 50 sessions used (f10 counts). |
| 2026-10-01 23:28 -04:00 | The 22:34 count was one short: seven baseline sessions (b06 counts) plus f07 to f10 made 11. The after-fix batch finished: f11 Codex chariot 362 s, one asset; f12 Codex refine 388 s on `features.mcp_2026_07_28` (opened with `server/discover`), revision 2; f13 Claude Code chariot 292 s, one asset, $1.10; f14 Claude Code refine 143 s with `MCP_PROTOCOL_NEGOTIATION=auto`, revision 2; 0 tool errors in the four; every trace read (H24 to H27, F19b, F20, F23 in `findings.md`). 15 of 50 sessions used. Fixed test first on the 51e382b tree: F19 (compact comparison of counts, before/after and twelve path/name/status/fields changes; the diff shrinks last, never below 2,000), F21 (`describeInputError` strips each issue's own period; `teaches()` rejects `..` in every rule-9 body), F22 (one `compactComparison()` serves `kiln_edit` and `kiln_inspect compare` in compact and lean; the page stays a page, under 5,500 characters for 50 entries), F23 (a compact or lean per-view receipt is its label, `cameraFidelity`, `captureCache` and what differs from `viewFidelity`, beside the summary and inside it; cameras stay in `cameraShots`; two engine tests that read whole receipts ask `detail: 'full'`). The live sizes behind them: compact edits 20,069 to 27,865 on all four harnesses, a compare page of 38,952, a six-shot edit of 22,417. Gate `step5-fixpass` on this tree with the rebuild, 23:05 to 23:21: build-runtime, check:toolchain, check:skills, typecheck, lint, test, test:render-service and test:coverage all green: `test` 3108 pass, 2 skip, 0 fail across 398 files (462 s); render-service 78 pass; coverage functions 95.06% (minimum 94.00%, 50 functions of slack), lines 92.42% (minimum 92.10%, 211 lines of slack); no threshold changed. Its stdout summary was lost because the launch had no output redirection, so the four fast steps were rerun inline on the same tree (check:toolchain, check:skills, typecheck, lint: exit 0 each) and the three test steps answer from their complete logs in `gate/step5-fixpass/` (0 fail; coverage gate passed); the final gate is launched with redirection. `docs/tools.md` regenerated unchanged; `docs/cameras.md` and `docs/migration.md` state the compact comparison and receipt shapes; the changelog marks the breaks. The four-harness table on 0.10.0 is recorded below the 0.9.0 table (H25: Claude Code defers the Kiln tools behind tool search on the live API; H27: it opens with `server/discover` by default there, correcting the 0.9.0 cell). Committed next; the wave then runs on a fresh runtime of that commit, with the character batch in parallel with the wave batch to save about an hour (two sessions at a time share the render service; sizes and tokens are unaffected). |
| 2026-10-02 01:33 -04:00 | The wave on `runtime-0.10.0-fix1` (a fresh clone of 3f4e40a) and the character batch ran side by side; every landed trace read (`findings.md`): w15 to w24 and w27 to w33 (OpenCode sword, shield and wall pairs; Agy horse and bow pairs; Codex galley, temple and house pairs; the first Claude Code gate session) and c37 to c40 (Opus 5.5 at xhigh: the Trojan soldier with idle and attack clips, then the Greek soldier, Hector and Achilles from the saved rigs; $12.98 in all). Found and fixed test first on the 3f4e40a tree: H28 (every skill sentence steering to `detail: "full"` now says "only" and `check:skills` enforces it; gate `step5-skills` at 23:56 all exit 0), F24 (a compact nine-frame animation at 24,223: six-decimal rounding, one shot per camera with `frames`, shared receipt fields on `viewFidelity`, `lastFaithful` omitted when current, `poseBounds` bounded with `poseBoundsOmitted`), F25 (a `full` edit at 40,533: the diff, then the comparison, then the render bounded as a whole inside 40,000), F26 (`kiln_material get` and `kiln_assets get`/`restore` read the only or newest revision when none is named; three live refusals) and F27 (an unrecognized key is answered with the keys the tool takes; Codex had passed the palette's `resourceId` to `kiln_material` twice). Left and listed: F28 (the sandbox refuses `this` inside an object method; one instance, the error taught the fix). Gates: `step5-fix2` (00:19) was killed in its test step at about 00:21 together with the tool-launched process tree it belonged to, so gates now start detached (`tools/launch-gate.ps1` through `Win32_Process.Create`); `step5-fix2b` (00:41 to 01:02) passed every step but `test:coverage`, where `cli-standalone.test.ts` (9.9 s in the plain step) passed its 20 s budget under coverage instrumentation on the loaded host and the threshold script never ran; its budget is now 60 s with the measured duration; `step5-fix2c` (01:08 to 01:30) on the combined tree, all exit 0: `test` 3115 pass, 2 skip, 0 fail across 399 files (615 s); render-service 78 pass; coverage 3115 pass, functions 95.10% (minimum 94.00%, 53 of slack), lines 92.44% (minimum 92.10%, 224 of slack); no threshold changed. Committed as `333e69c` (30 files; both checkouts clean). Picks so far in `picks.md`: wall w19, sword w15, shield w17, horse w21, bow w23, chariot f11, galley w28, temple w30, house w31 and the four characters from c37 to c40; the gate and the Trojan Horse wait for w34 to w36. Lean against compact so far on Codex: the galley and the house cost more lean (98,442 against 77,861 and 152,197 against 127,907 result characters), the temple less (135,505 against 226,179); the Agy pairs and the refine pair decide. The blind driver was dry-run on the fix1 runtime (both harness plans correct). `runtime-0.10.0-fix2` is made from `333e69c` next; then the refine pair and the four blind sessions run as one chain beside the wave's last three. 37 of 50 sessions used (w34 counts). |
| 2026-10-02 02:49 -04:00 | The wave finished at 01:52 (w34 to w36 landed and read: the Claude Code gate and Trojan Horse pairs), the Agy refine pair ran on `runtime-0.10.0-fix2` (w25 lean 423 s and w26 compact 432 s, 0 errors, revision 2 of the seeded w19 wall in each) and the blind block ran through the package's own `scripts/tier2-dogfood.mjs --run-live` (recorded approval in `authorizations/blind-sessions-2026-10-02.md`): OpenCode spear 886 s (the outer agent generated a workspace, wrote a brief and ran an inner `opencode run` that authored through `kiln_workspace`; accepted/pass, 3,356 triangles; its first inner launch hit the provider's "backend is temporarily overloaded"), OpenCode amphora 280 s (the outer agent authored through the CLI alone; accepted/pass, 9,856 triangles), Agy army tent 803 s (the outer agent cloned the runtime, installed and built it, generated a workspace, found `agy mcp list` empty in its new home and launched an inner `agy.mjs --print` session that authored through the MCP server; accepted/pass, 6,200 triangles, 234 draws), Agy brazier 882 s (the same route, with the outer agent also reading engine source from its clone, H29; accepted/pass, 17,566 triangles, 185 draws). The driver's receipts for the two Agy runs counted no tools (S13, fixed in this commit); the outer streams hold no MCP trace, so the blind runs give no result sizes. Every pick is made (`picks.md`): wall w19, breached wall w25 (revision 2), sword w15, shield w17, bow w23, horse w21, chariot f11, galley w28, temple w30, house w31, gate w34, Trojan Horse w36, the four characters from c37 to c40. Lean against compact over the ten wave pairs (sums from `pair-compare.mjs --batch wave`): result characters 1,327,423 lean against 1,351,687 compact (−1.8%), output tokens 306,479 against 303,926 (+0.8%), 10 of 10 saved in each arm; lean won both measures only in the two Agy pairs (−24% characters, −8% output), so compact stays the packaged default and lean for Agy is the owner's call (decision 12; the comparison and its confounders are in the report). Found and fixed test first on the 333e69c tree: F29 (w35: a shot with the camera fields at its root came back `ok: false` with zod's issue dump under "Fix the error in the source"; the capture guard now rethrows a parse failure as the rule-9 sentence naming `shape:camera-shot` or `shape:capture`), F30 (w26: both default edits at 28,539 and 28,167 characters because an edit sent by `code` echoed the patched source; `includeCode` now defaults to false and, asked for, the source is bounded with the result), F31 (b44: a camera subject naming no node was answered with "Fix the error in the source"; `next` now names the shot's fix), S2 (the CLI `material list` printed every manifest, 34,116 characters for five pinned materials; it prints the `kiln_material list` summaries) and S13 (the blind driver counted no tools for an Agy stream; it reads `step_update` tool steps). Listed, not fixed: F28 (the sandbox refuses `this` in an object method). Gate `step5-fix3` was stopped three times to fold each of these into one run (the second relaunch failed `typecheck` on a test of mine, fixed inline) and relaunched at 02:28; it ran to 02:47 on the combined tree, all exit 0: `test` 3117 pass, 2 skip, 0 fail across 399 files (565 s); render-service 78 pass; coverage 3117 pass, functions 95.13% (minimum 94.00%, 54 of slack), lines 92.44% (minimum 92.10%, 227 of slack); no threshold changed. Committed as `3fc369c` (26 files; both checkouts clean). `ROADMAP.md` names 0.10.0 as the current release. Next: `runtime-0.10.0-fix3`, the scene pair (41, 42) and the two reserve sessions (47, 48) on it, then the final gate, the fresh clone and the four-harness table on that build. 45 of 50 sessions used. |
| 2026-10-02 02:56 -04:00 | Stopped by the usage limit of this session, with work in flight. Done since 02:49: `runtime-0.10.0-fix3` (a fresh clone of `3fc369c`: frozen install 27 s, rebuild 7 s, `dist/` identical, build identity `sha256:306f465a…`); the rig on it (`rig-0.10.0-fix3`, ten runs exit 0: Claude Code's first request carries all 17 definitions, 36,718 characters, with tool search off and none with it on; Codex's catalog holds 11 built-in tools and no Kiln definition; `server/discover` answered 16 and 21 ms and `tools/list` 291 and 343 ms after process start beside two live sessions; largest scripted results 20,330 `full` and 15,480); both scene sessions seeded with the fifteen picked asset folders (`scratchpad/step5/seed-scene.ps1`, listings recorded); r47 OpenCode reserve with `protocol: "auto"` on the server entry: 189 s, 23 calls, 0 errors, one chariot (4,076 triangles, 61 draws, accepted/warn), largest `kiln_edit` 13,496, and it still opened with `initialize` 2025-11-25 (H22 holds for `"auto"`); its first tool step was `search({query: "kiln_discover"})` (three `search` pages, fourteen `execute` steps). Running detached when this session stopped: s42 Codex scene (started 02:55:06), r48 Agy reserve (02:54:10), and the fresh-clone proof `fresh-3fc369c` (02:54:18; gate inside the clone past `lint` exit 0, then `test:package` and the four tools-up checks with the new empty home `agy-homes/fresh-3fc369c-agy`; logs under `measurements/fresh-3fc369c-*`). s41 Claude Code scene ended at 02:55:06 with exit 1 after 257 s and is not yet read (`sessions/s41-claude-scene/out/`). Blind runs b45 and b46 read and recorded (`findings.md`: S13 and H29). Left for the next session: read s41, s42 and r48 (`tools/session-brief.mjs`), the composed scene's totals (`tools/pack-metrics.mjs`), the four-harness table cells on the final build, the fresh-clone summary, the dated report from `scratchpad/step5/report-draft.md` into `docs/reviews/2026-10-01-v1-readiness-live-sessions.md`, the cleanup list's final placeholders (`cleanup/cleanup-list-2026-10-02.md`), the records commit (`scratchpad/step5/commit-records.txt`) and the final gate on it with every exit code printed. 49 of 50 sessions used (s42 and r48 count). Landed after the stop, read from their logs only: r48 Agy reserve 661 s, 31 calls, 0 errors, one chariot, largest `kiln_edit` 14,977, `server/discover` 2026-07-28 by default; the fresh clone `fresh-3fc369c` at 03:21: clone, frozen install and rebuild exit 0 with `dist/` identical, `test:package` exit 0 (80 s), four generated workspaces each answering 17 tools on both revisions (273 to 348 ms) with their harness listings recorded (Agy under the new empty home: "No MCP servers configured."), but its gate's `test` step exit 1 (900 s): 3115 pass, 2 fail, both CLI JSON tests (`render JSON describes exact files…` and `source JSON is the shared kiln_source result…`) at the 20,000 ms budget on a host running two live sessions and this gate at once; the same tree's coverage step in that run (3117 pass, 0 fail, ratchet passed) and gate `step5-fix3` passed them. The next session reruns the fresh-clone gate on a quieter host or gives those two tests a measured budget as `cli-standalone` got (a code change: commit and gate again); until then goal item 3 is not shown. |
| 2026-10-02 08:23 -04:00 | Session 50 ran at 07:53 as the s41 prompt again after the account limit reset (`s50-claude-scene-repeat`, Claude Code 2.1.287 on `claude-sonnet-5-5`): exit 0, 1,216 s, 36 calls, 7 errors each answered with a next step (a path before the file existed; the model's own `throw new Error(text)` probe to print bounding boxes, answered with the generic rejection, H30, no Kiln change: no message crosses the sandbox by design; one empty build; four TypeErrors with the type-error advice), 103,461 result characters, largest `kiln_render` 11,302 (compact, named shots), lean asked 18 times, `server/discover` 2026-07-28 by default; "Battle before the gate" `battle-scene` / `r_150bbef8…` saved at 208,178 triangles, 125 draws, 32 materials, 15 textures, 14,034 KB, accepted/warn, inside the `scene-web` budget; 65,408 output, 6,581,856 cached reads, $2.75. Every trace of the cycle is read and every finding is fixed with a test or listed with its reason (`findings.md`: F1 to F31, S1 to S13, H1 to H30; H17 and H18 are in the step-4 row above). The two CLI JSON tests that failed the fresh clone's gate at the 20 s budget under load now carry 60 s budgets with their measured durations (3.2 to 4.8 s and 11.3 to 14.0 s in the gates of 2 October; 20.2 and 20.0 s in that fresh clone); focused run 6 pass. The dated report is `docs/reviews/2026-10-01-v1-readiness-live-sessions.md` (coverage, one row of evidence per contract rule, the four-harness table on `3fc369c`, every session, dispositions, lean against compact, the pack picks with both composed scenes, exclusions, owner decisions, the cleanup pointer); the read-only cleanup list is `kiln-dogfood/v1-readiness-2026-10/cleanup/cleanup-list-2026-10-02.md`; `picks.md` gained the two composed scenes. Committed next as the records commit (the report, this log, the two budgets); then the final gate (`tools/launch-gate.ps1 -Label final -Build`, detached) and the fresh clone of that commit run one after the other on this loaded host, and a docs-only commit records their numbers here and in the report's section 1b. 50 of 50 sessions used. |
| 2026-10-02 09:06 -04:00 | Records commit `6ec32a1` at 08:24 (the report, the session-50 row, the two budgets). Gate `final` on it with the rebuild, 08:24 to 08:55, failed its `test` step: build-runtime, check:toolchain, check:skills, typecheck and lint exit 0; `test` exit 1 (932 s): 3112 pass, 2 skip, 5 fail across 399 files, all five timeouts of CLI-spawning tests at their 20 and 30 s budgets (the asset CLI round trip at 30 s; the project, material and project-sharing CLI tests and one packaged-save-provenance probe at 20 s) while the host ran at 97% CPU on sixteen logical processors (another checkout's Astro dev server, browsers, other sessions' node and claude processes; measured with `Get-Counter` at 08:56); render-service exit 0 (78 pass); `test:coverage` exit 0 (774 s): 3117 pass, 2 skip, 0 fail, functions 95.13% (minimum 94.00%), lines 92.44% (minimum 92.10%), so the same tree passed every test under instrumentation minutes later. The five run in 2 to 10 s on the gates of 2 October; the budgets guard hangs, not load. Done as the rule allows (a larger budget needs the measured durations beside it): 60 s for the three project and material CLI tests, the project-selection test and both CLI render JSON tests (the records commit had put the first one's 60 s on its neighbour; corrected), 90 s for the animation and capture-file tests and each provenance probe (its child timeout 60 s), 120 s for the asset CLI round trip; every budget's comment carries its gate, fresh-clone and loaded-host durations. Focused run of the seven files: 24 pass, 0 fail (201 s); typecheck exit 0; lint exit 0 after `biome format` reflowed the provenance file's three-argument `it` calls. Committed next as the budgets commit; gate `final-2` with the rebuild and then the fresh clone run on it, one after the other; the docs-only commit that follows records their numbers. 50 of 50 sessions used. |
| 2026-10-02 09:47 -04:00 | Budgets commit `6c50ec9` at 09:07. Gate `final-2` on it with the rebuild, 09:07 to 09:26 (`gate/final-2/`), every step exit 0: build-runtime 0 (4 s), check:toolchain 0, check:skills 0, typecheck 0, lint 0, `test` 0 (557 s: 3117 pass, 2 skip, 0 fail across 399 files), `test:render-service` 0 (78 pass), `test:coverage` 0 (565 s: 3117 pass, 2 skip, 0 fail; functions 95.13% against the 94.00% minimum, 54 of slack; lines 92.44% against 92.10%, 227 of slack; no threshold changed). Fresh clone `fresh-6c50ec9` of the branch tip, 09:26 to 09:45 (`measurements/fresh-6c50ec9-*.log`, `gate/fresh-fresh-6c50ec9/`): clone, frozen install (25 s) and rebuild (8 s) exit 0 with `dist/` identical to the committed copy (build identity `sha256:306f465a65156d1a5c8bdefabdd898f65ebf4f76920f8a0bfb13563f1f30acac`); its gate passed every step (check:toolchain, check:skills, typecheck, lint exit 0; test exit 0, 471 s: 3117 pass, 2 skip, 0 fail across 399 files; test:render-service exit 0, 78 pass; test:coverage exit 0, 501 s: 3117 pass, 0 fail, functions 95.13%, lines 92.44%); `test:package` exit 0 (80 s); four generated workspaces each answering 17 tools on both revisions in 306 to 368 ms (claude 354 and 327, codex 312 and 306, opencode 314 and 318, agy 368 and 332), Agy under the new empty home `agy-homes/fresh-6c50ec9-agy` with its own listing recorded. The report's sections 1a, 1b and 8 and the cleanup list carry these numbers; this docs-only commit closes the cycle (`git diff --stat 6c50ec9..HEAD` touches only `docs/`). Goal items 1 to 9 are shown in the conversation and in the report; what remains is the owner's: the decisions in the report's section 9, the merge of `v1-readiness` (never pushed), the cleanup actions, and the pack's two composed scenes. 50 of 50 sessions used. |
| 2026-10-02 10:35 -04:00 | The owner answered every open decision through the question tool in five batches (rows 19 to 34 above, one answer as a message), and the follow-up goal statement is recorded between the `goal2` markers (3218 characters) for him to pass; nothing is pushed. The material pass of decision 30 begun in `kiln-dogfood/v1-readiness-2026-10/review/troy-refine/ws` (a copy of s50's workspace without its review cache, 16 assets): `troy-limestone` `sha256:118cd21f…` and `troy-mudbrick` `sha256:42191418…` created through `kiln material procedural` from palette colours (base colour 512 px and packed roughness 256 px; 1.2 m and 1 m tiles; a derived normal map is preset-only, so none); project `troy` revision 2 pins them under the roles `limestone` and `mudbrick` with the preset kept for the record; the wall's revision 2 `r_29dcf948…` (parent `r_12fa73f2…`, same part names and dimensions) maps every box face in world units, limestone on the battered footing and mudbrick on the body, parapet, merlons and curb: accepted/warn with the one warning revision 1 had, GPU material-faithful views, 168 triangles, 14 draws, 3 materials, 7 textures, 302,776-byte GLB. The viewer (`tools/view-troy.ps1`, port 4318) serves 42 collections, `troy-refine` beside the session ones, for the owner's comparison of the two revisions before the breach, gate, house, temple, horse and the recompose. No code changed; both checkouts clean. |
| 2026-10-02 11:04 -04:00 | Follow-up goal passed by the owner at about 10:38. Decision 23 done test first: `generated-source-policy.test.ts` gained six allowed `this` placements (object-literal method, function property and getter; class method with constructor, field initializer; an arrow inside a method), six refused ones (top level, function declaration and expression, top-level arrow, a function nested in a method, an arrow in a plain function), `module` still refused, a strict-mode unbound assignment and strict-only syntax errors (`with`, a legacy octal literal) named with their line; eight failed on the old analyzer and evaluator. Fix: `validation.ts` allows `this` where the nearest non-arrow function is a `Property` or `MethodDefinition` value (or inside a `PropertyDefinition` or `StaticBlock`) and parses a second time with the directive on the same first line so every line number stays; `render.ts` prepends 'use strict' to the Function body; `source-bindings.ts` drops the Annex B hoisting (a block-level function binds in its block, so `retired-helpers.test.ts` moves that case to the refused list). Focused 120 pass; evaluator, build-cache, result-contract, errors and registry-contract suites 128 pass; examples and `src/tools` 213 pass; typecheck 0, lint 0 after biome, check:skills 0. Changelog section "Generated code", `docs/migration.md` strict-mode bullet and the author skill's program contract say so. Committed as `7202312`, whose copy of this plan carried the whole file inside this row (the append script's file variable shadowed its text parameter); repaired in the next commit, no history rewrite. No live session. |
| 2026-10-02 11:07 -04:00 | Decision 24 done test first: `isolation-adversarial.test.ts` now matches the exact first sentence and then the whole string against the sentence plus `EXECUTION_REJECTED_ADVICE` (nothing else may follow), and `rejection-cause.test.ts` throws an `Error('PRIVATE_MARKER')` from build(): the wire error stays `{ code, message }` with no marker, the subprocess error is the sentence plus the engine's advice naming `kiln_inspect` and `kiln_validate`, and a TypeError rejection keeps its own advice alone; both failed first on the missing export. Fix: `EXECUTION_REJECTED_ADVICE` in `authoring-diagnostic.ts`; `EvaluatorPortError` and `EvaluatorSubprocessError` append it to a bare `EXECUTION_REJECTED` (no usage builds that code with a custom message). Evaluator, rule-9, result-contract, LOD, open-shell and policy suites 174 pass; typecheck 0, lint 0. Changelog bullet under "Generated code"; `docs/runtime.md` names the constant. The plan repaired (the 11:04 row of `7202312` held a copy of the whole file). Committed next. |
| 2026-10-02 11:09 -04:00 | Decision 25 done test first: `materials.test.ts` calls `get` with `resourceId` alone (same result as `materialId`) and with both naming different materials (refused with the fix), failing first on the strict parse; the rule-9 stdio case moves its unknown key to `material` and gains an alias case whose answer is the unknown-material sentence naming the list. Fix: `aliasMaterialId` in `materials.ts` resolves the alias before the strict parse, so the advertised schema (prompt-cached) and `docs/tools.md` are unchanged. Runtime rebuilt for the stdio suite; materials, actions and rule-9 suites 13 pass; typecheck 0, lint 0. Changelog bullet under "Tool surface". Committed next. |
| 2026-10-02 11:16 -04:00 | Decision 27 done test first: `workspace.test.ts` now expects an explicit pin of another revision of a project material to win (bound pins and resources are the call's; failed first with "Conflicting material revisions for wood"), and `assets-tools.test.ts` reads the saved `manifest.json` resource and expects one line (failed first with the pretty-printed text). Fix: `FileWorkspace.run` takes the project's or inherited pins and then the call's, later wins by `resourceId`; `resourceText` in `mcp-engine.ts` serves a JSON resource as `JSON.stringify(JSON.parse(text))` and anything else as it is; the `materialDependencies` description of the six workspace-bound tools now reads "Pins for this call; each replaces the project pin of its resourceId." in the same 68 bytes, so every schema keeps its size (`registry-contract` passes; manifest 74,286 characters and `docs/tools.md` regenerated, twelve lines each). Workspace, asset-resource, workspace-MCP and registry-contract suites pass; typecheck 0, lint 0. Changelog bullet under "Tool surface" marked breaking; migration note. Committed next. |
| 2026-10-02 11:17 -04:00 | Decision 26 done test first: the Agy bootstrap test reads the generated `.agents/mcp_config.json` and expects `KILN_RESULT_DETAIL: lean` beside `KILN_RENDER: auto` on the server entry (failed first on the missing key), and the harness-spelling test expects no such key for Copilot and Cursor. Fix: `scripts/create-workspace.mjs` spreads the lean default into the Agy entry alone, with the measurement beside it (lean won both measures only in the Agy pairs: 24% fewer result characters, 8% fewer output tokens). Bootstrap suite passes; `docs/runtime.md` row, `docs/google.md` and a changelog bullet under "Knowledge and setup" say so, including what `kiln-init --check` reports for an existing Antigravity workspace. Committed next. |
| 2026-10-02 11:19 -04:00 | Decision 28 done test first: `asset-cli.test.ts` gained a test that saves a crate and a child revision, reads `kiln asset <id>` without a revision (the child), with one (the parent), refuses `export` without one, and reads `kiln save --help` as the save usage alone (under 1,500 characters, no viewer lines); against the committed CLI it fails on its first assertion, and the `dist/` built before the change shows the old answers (`save --help` 2,275 characters with the viewer block, `asset <id>` exit 1 "requires asset ID and revision ID"). Fix: `newestRevision` exported from the registry and used by `asset` when no revision is named (`export` still requires one); `SAVE_USAGE` printed for `save --help`, built from the same lines as the assets block. CLI suites 11 pass; typecheck 0, lint 0. `dist/` rebuilt from the whole tree (`node scripts/build-runtime.mjs all`) and committed with it, so the branch tip carries bundles of its own source. Changelog bullet under "Results". Decisions 23 to 28 are done; the material pass follows. |
| 2026-10-02 11:40 -04:00 | Material pass (decisions 30 to 33) done through the 0.10.0 CLI (`runtime-0.10.0-fix3`) in `review/troy-refine/` on a copy of s50's workspace, each source render-checked and its six-view sheet read before the save, every revision accepted and material-faithful: breached wall revision 3 `r_98d0a72a…` at 11:20 (528 tris, 44 draws, 3 materials: limestone footings, spurs, apron and half the tumbled blocks, mudbrick elsewhere, same 44 parts), city gate revision 2 `r_932d7b9a…` at 11:32 (516/7/4), house revision 2 `r_de6797d6…` at 11:32 (876/8/3, the tinted plaster gone), temple hall revision 2 `r_85c06c03…` at 11:32 (2,024/12/4, textured resources instead of flat tints), horse revision 2 `r_f088964e…` at 11:32 (1,324/55/3, the body 0.8 to 0.84 as wide as deep, legs 0.16 m off centre, clips and joints unchanged); the house and temple now carry the four-image `MATERIAL_IMAGE_COUNT_BUDGET` warn the wall and gate already had. Scene: s50's source recomposed by `review/troy-refine/scene/recompose.mjs` (six asset blocks swapped for the new revisions, the 13,531-byte helpers-and-layout tail byte-identical), render-checked (26 s) and saved as `battle-scene` revision 2 `r_4573e90a…` at 11:34 (208,178 tris, 130 draws from 125, 28 materials from 32, 16 textures, 14,126 KB, accepted/warn, inside `scene-web`). Viewer restarted at 11:36 with the new revisions. `picks.md` gained the material-pass table; the report gained section 11 and the answers in section 9. |

### Four-harness table on 0.9.0, live baseline sessions of 1 October 2026

Measured from the relay traces and harness event streams of sessions b01 to b06b (0.9.0 at
143ecba, render service on port 18410). The rig figures from the morning stay in the table
under "What was measured on 0.9.0".

| | Claude Code 2.1.287 | Codex 0.160.0 | OpenCode 2.0.14 | Agy 1.2.14 |
| --- | --- | --- | --- | --- |
| Protocol revision | `initialize` at 2025-11-25 | `initialize` at 2025-06-18 | `initialize` at 2025-11-25 | `server/discover`, stateless 2026-07-28 with `subscriptions/listen` |
| Kiln tools on the first model request | Deferred behind `ToolSearch` under the real API: the model's first action selected seven Kiln tools by name, then called them directly. The rig (custom API address, tool search off) saw 14 of 17 in the first request, 38,762 characters, the three root-`oneOf` tools dropped | None in the request catalog (code mode); the model reached Kiln on its third step through `kiln_discover` | None on the tool list; the model's `search` page of 10 of 17 definitions was 47,947 characters | None on the tool list; one JSON file per tool is written under the home and read on demand (7,024 bytes for `kiln_inspect`) |
| Largest result | 35,776 characters (`kiln_edit`, b06b), delivered whole | 79,078 characters (`kiln_render` with `detail: 'full'`, b05); the harness event holds it whole, the rig shows the model request cut near 40,000 | 14,376 characters (`kiln_discover`, b03); outside MCP a CLI `render --json` receipt of 51,312 | 22,214 characters (`kiln_edit`, b02) |
| Truncation seen | None at these sizes | At the model request, near 40,000 (rig) | None at these sizes | Results above a size between 3,878 and 6,529 characters are not returned inline: written to a file the model then reads, one to three extra steps each |
| Live session on 2026-07-28 | Not yet (the after-fix refine session carries the switch) | Not yet (same) | Not yet (same) | Yes: b02 and b04 by default |
| Model, effort, result | `claude-sonnet-5-5`, high: 16 turns, 213 s, one asset, $0.87 | `gpt-6.1-sol`, high: 23 Kiln calls, one asset, 1,973,600 input tokens of which 1,854,208 cached | `opencode-go/muse-spark-1.3-contributor`: 8 Kiln calls then the CLI, one asset, $0.019 | `gemini-3.8-flash-high`: 29 Kiln calls, 64 steps, one asset, 466,646 input tokens plus 4,657,186 cached |
| Images reached the model | Yes (GPU views described) | Yes | No attachment from `execute`; the model read a PNG the CLI wrote | Through the spilled `media_0.png`, or a PNG the CLI wrote |

Correction (2026-10-01 23:15 -04:00): the Claude Code revision cell above came from the rig and from b06, the four-second sign-in failure. The relay trace of b06b, the baseline session that built the asset, opens with `server/discover` and stateless 2026-07-28 requests, with no `MCP_` variable set (H27). The table below carries the live answer.

### Four-harness table on 0.10.0, after-fix sessions f07 to f14 of 1 October 2026

Measured first-hand from the relay traces and harness event streams of f07 to f14 on
`runtime-0.10.0` (`51e382b`, render service 18420) and from the rig on the same build. The
fix pass that followed (F19, F21, F22, F23) changes result sizes only; the wave sessions on
the fix-pass build update the size cells below when they land. A cell that could not be
measured says so.

| | Claude Code 2.1.287 | Codex 0.160.0 | OpenCode 2.0.14 | Agy 1.2.14 |
| --- | --- | --- | --- | --- |
| Protocol revision | `server/discover`, stateless 2026-07-28 by default on the live API (f13, with no `MCP_` variable; b06b the same on 0.9.0). Against the rig's stand-in API the default run opened with `initialize` 2025-11-25 and `MCP_PROTOCOL_NEGOTIATION=auto` with `MCP_SDK_GENERATION=v2` brought `server/discover` (H27) | `initialize` at 2025-06-18 by default (f11); `server/discover` 2026-07-28 with `features.mcp_2026_07_28` (f12), which Codex itself labels under development | `initialize` at 2025-11-25 (f07, f08); the per-server `protocol: "2026-07-28"` entry did not change it (H22) | `server/discover`, stateless 2026-07-28 by default (f09, f10) |
| Kiln tools on the first model request | Deferred behind `ToolSearch` on the live API: f13's init record lists 48 tools with the 17 Kiln tools deferred, and the model's first action selected seven by name (a 0-character result; the schemas join the next request). The rig showed both states of the switch: `ENABLE_TOOL_SEARCH=true` sent 14 built-in tools and a placeholder (57,413 characters, no Kiln definition); unset, all 17 definitions whole, 36,538 of 112,174 characters (0.9.0 dropped three) (H25) | None in the request catalog (code mode: 11 built-in tools, 36,957 characters); the model reached Kiln through `kiln_workspace.kiln_discover` on its first tool step after reading the skill (f11, f12) | None on the tool list; the model's first `search({query: "kiln discover"})` page was 20,743 characters (47,947 on 0.9.0 for 10 of 17) | None on the tool list; one JSON file per tool under the home, read on demand (f09 read ten of them, each twice) |
| Largest result | 27,302 characters (`kiln_edit` with four shots and the comparison, f14; 22,417 with six shots, f13), delivered whole; both over the default limit (F19, F23, fixed in the fix pass) | 22,590 (`kiln_render` with `detail: 'full'`, f11, allowed under 40,000); 19,073 (`kiln_inspect`, f12); the compact edits 27,351 and 25,628 (F19) | 20,441 (`kiln_edit`, f08) and 20,069 (f07), which code mode re-serialised to 29,681 and 29,040 with indentation (H21) | 38,952 (`kiln_inspect compare`, f10; F22) and 27,865 (`kiln_edit`, f09; F19) |
| Truncation seen | None at these sizes | None at these sizes (the cut near 40,000 seen on 0.9.0 was not reached) | None at these sizes | Nothing cut; results above a size between 3,913 and 4,160 characters are written to a file the model reads back, one extra step each (H23); the Discovery overview (4,233) and capabilities (5,384) spill |
| Live session on 2026-07-28 | Yes: f13 by default and f14 with the switch | Yes: f12 with `features.mcp_2026_07_28` | Not achieved: f08 asked for it on the server entry and the client still opened with `initialize` at 2025-11-25 (H22); a reserve session with `protocol: "auto"` only if sessions remain | Yes: f09 and f10 by default |
| Model, effort, result | `claude-sonnet-5-5`, high: f13 26 turns, 292 s, one asset, $1.10 (32,890 output tokens, 21,083 of them thinking); f14 13 turns, 143 s, revision 2, $0.54 | `gpt-6.1-sol`, high: f11 362 s, 20 Kiln calls, one asset, 1,030,694 input tokens of which 907,904 cached, 8,519 output; f12 388 s, 26 calls, revision 2, 1,324,852 input of which 1,232,000 cached, 7,629 output | `opencode-go/muse-spark-1.3-contributor`: f07 483 s, 23 Kiln calls, one asset, $0.015; f08 288 s, 13 calls, revision 2, $0.024 (202,598 input plus 756,692 cached, 3,704 output) | `gemini-3.8-flash-high`: f09 713 s, 42 Kiln calls, one asset linked into the inventory, 1,054,573 input plus 9,765,101 cached, 78,866 output; f10 480 s, 18 calls, revision 2, 442,339 input plus 5,412,639 cached, 53,747 output |
| Images reached the model | Yes (GPU views described; f13 judged joints and the wheel roll from them) | Yes (f12: "reviewed GPU views and wheel motion") | The render and edit results carried the PNG as a `file` part beside the text in code mode (three in f07, two in f08), and f08 also read the saved `preview.png` with its `read` tool; on 0.9.0 the model had only the CLI's PNG | Through the spilled `media_0.png` (f09: two cache misses followed its `view_file`) |
