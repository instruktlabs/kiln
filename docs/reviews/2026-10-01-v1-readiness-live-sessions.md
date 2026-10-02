# Kiln v1 readiness: live sessions and the Troy pack attempt, 1 and 2 October 2026

A record of its day. It states what the live sessions found on 0.10.0, what was fixed with a
test, what was left and why, and which pack candidates exist. It is not a release acceptance:
the decisions listed at the end are the owner's.

## 1. What this report covers

- Builds under test, all 0.10.0 on branch `v1-readiness`: the after-fix sessions ran on
  `51e382b` (`runtime-0.10.0`), the wave and the characters on `3f4e40a`
  (`runtime-0.10.0-fix1`), the refine pair and the blind block on `333e69c`
  (`runtime-0.10.0-fix2`), the scene pair and the reserve sessions on `3fc369c`
  (`runtime-0.10.0-fix3`). The baseline ran on 0.9.0 (`143ecba`, `runtime-0.9.0`).
- Harnesses: Claude Code 2.1.287, Codex 0.160.0, OpenCode 2.0.14 (2.0.21 is published; the
  owner's background service runs from the installed binary), Agy 1.2.14. Each runtime is a
  fresh clone with a frozen install and a rebuild proved identical to the committed `dist/`.
- Models: Claude Code `claude-sonnet-5-5` at high (the characters `claude-opus-5-5` at xhigh),
  Codex `gpt-6.1-sol` at high, OpenCode `opencode-go/muse-spark-1.3-contributor`, Agy
  `gemini-3.8-flash-high`.
- Sessions: 50 of the owner's 50 (30 minutes each): 7 baseline, 8 after the fix round,
  20 paired wave, 4 characters, 2 refine, 4 blind, 2 scene, 3 reserve (two chariots for the table's OpenCode and Agy cells, and the Claude Code scene repeated after its account limit).
- Evidence: `C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10\` (local; nothing uploaded):
  `findings.md` (every finding and session), `picks.md`, `sessions/<id>/out/` (relay trace,
  harness events, `result.json`), `blind/`, `gate/`, `measurements/`. The plan's progress log
  (`docs/plans/2026-10-01-v1-readiness-cycle.md`) carries the gates and commits.

## 1a. What changed: the branch's commits

Nine commits on `v1-readiness` after `main` (`c734e2a`), each ending with the Claude trailer,
none pushed. `CHANGELOG.md` states each change under 0.10.0 and marks the breaking ones;
`docs/migration.md` has the client's view.

| Commit | When | What |
| --- | --- | --- |
| `185f728` | 1 Oct 17:35 | The plan of record; the blind driver can clone a named repository (`--repository`). |
| `2e12e12` | 1 Oct 18:21 | MCP server and client libraries 2.2.0, ext-apps 2.0.3. |
| `8d54eb6` | 1 Oct 19:27 | Protocol 2026-07-28 served from a thin entry (`dist/mcp-server.mjs`) that answers `tools/list` and `server/discover` from a generated manifest before the engine loads; cache hints; the pre-handshake guard; durable handles (rule 10). |
| `5d56895` | 1 Oct 20:05 | The three host tools flattened to one object each with an `action` enum; nested records opaque in the schema and served by Discovery `shape` entries; camera shapes stated once; every schema within 5,000 bytes; instructions 692 characters; `file` input beside `code` and `programRef`; the configured project named to the agent. |
| `aa3c570` | 1 Oct 22:00 | Every result one-line JSON led by the verdict; findings grouped by code; `detail` levels (`lean`, `compact`, `full`) with `KILN_RESULT_DETAIL`; `full` bounded at 40,000; errors are `isError` sentences naming the next call and no path; the CLI receipts share the compaction. |
| `51e382b` | 1 Oct 22:00 | The generated guide at 4,461 characters, `CLAUDE.md` as `@AGENTS.md`, one skill registry per harness, the author skill under 16,000 characters, manifests and records at 0.10.0. |
| `3f4e40a` | 1 Oct 23:29 | Compact comparisons (counts, before/after, twelve changes) and per-view receipts as what differs; every compact edit under the default limit; no doubled period in input errors. |
| `333e69c` | 2 Oct 01:31 | Six-decimal rounding, one shot per camera with frames, bounded pose bounds; a `full` edit bounded as a whole; `get` without a revision reads the only or newest one; an unknown key answered with the keys the tool takes; the skills say `full` is for a second look only; a measured test budget. |
| `3fc369c` | 2 Oct 02:48 | A nested record that fails to parse is a tool error naming its Discovery shape; a wrong camera subject is answered with the shot's fix; `kiln_edit` no longer echoes the source of an edit sent by `code` (`includeCode` opt-in, bounded); the CLI `material list` prints summaries; the blind driver counts Agy's tool steps. |

The commit that follows `3fc369c` carries this report, the plan's progress log, the cleanup list
and two measured test budgets in `src/__tests__/cli-render-json.test.ts` (3.2 to 4.8 s and 11.3 to
14.0 s in the gates of 2 October, 20 s on the same tree in a fresh clone's gate beside two live
sessions). The final gate and the fresh clone ran on that commit; a last docs-only commit adds their
numbers here and to the plan's progress log.

## 1b. Final gate and fresh clone

FINAL_GATE_PARAGRAPH

## 2. Contract evidence

One row per rule of the plan's contract table, on the final build.

| Rule | Evidence |
| --- | --- |
| 1 Both revisions | `src/__tests__/mcp-conformance.test.ts` (12) drives the built server over stdio with `initialize` (2025-06-18 and 2025-11-25) and `server/discover` (2026-07-28). Live: Claude Code opens with `server/discover` by default on the live API (f13, w33 to w36, c37 to c40) and with the switch (f14); Codex `initialize` 2025-06-18 by default (f11, w27 to w32) and `server/discover` with `features.mcp_2026_07_28` (f12); Agy `server/discover` by default (every Agy session); OpenCode `initialize` 2025-11-25 (every OpenCode session; its per-server `protocol` entry does not reach a stdio server, H22). |
| 2 First answer before the engine | The thin entry (`dist/mcp-server.mjs`, protocol library and manifest only) answers `tools/list` and `server/discover` before `dist/mcp-engine.mjs` loads: startup test 229 to 245 ms; rig on 51e382b 261 to 290 ms after process start; fresh-clone checker 265 to 374 ms across the four harness workspaces; the rig on the final build, run beside two live sessions: Claude Code's `server/discover` answered 16 ms and `tools/list` 291 ms after process start, Codex's 21 ms and 343 ms (`rig-0.10.0-fix3`, `cc-live-first-modern`, `cx-live-first-modern`); fresh clone of `3fc369c`: the four generated workspaces answered `tools/list` with 17 tools on both revisions in 273 to 348 ms (claude 286 and 319, codex 285 and 273, opencode 277 and 274, agy 320 and 348; `measurements/fresh-3fc369c-tools-up-*.json`). |
| 3 Plain schemas | `src/tools/__tests__/registry-contract.test.ts`: no root `oneOf`/`anyOf`; `kiln_project`, `kiln_material` and `kiln_review` are flat objects with an `action` enum. Rig: all 17 tools in Claude Code's first request with tool search off (0.9.0 dropped three). |
| 4 Schemas within 5,000 bytes | Largest `kiln_render` at 4,914 bytes; all 17 within 5,000 (`registry-contract.test.ts`). |
| 5 Short text | Instructions 692 characters; every description within 1,024 with its purpose in the first 250. |
| 6 Definitions within 45,000 | 17 definitions 39,603 characters as JSON (the fourteen base tools 32,695, under their 32,768 budget test). |
| 7 Results within 20,000 by default, 40,000 at most | `src/__tests__/result-contract.test.ts` (the 130-part asset, the renamed 60-part grid, the compare page, the six-shot edit, the nine-frame animation, an edit by `code` with and without `includeCode`, every case in compact, lean and full). Live sizes that drove the fixes: compact edits 20,069 to 27,865 on 51e382b (F19, F23), a compare page 38,952 (F22), a nine-frame animation 24,223 (F24), a full edit 40,533 (F25), by-code edits 28,539 and 28,167 (F30). On the final build: s42 `kiln_render` 13,684 with four named shots, r48 `kiln_edit` 14,977, r47 `kiln_edit` 13,496, s41 `kiln_render` 11,116, s50 `kiln_render` 11,302 (compact with named shots; `kiln_inspect` 11,176): every default result under 20,000 and every result under 40,000. |
| 8 Newest result stands alone | Fixture test on the lead fields and their order; every live render, edit and inspection led with `ok`, `acceptance`, `disposition`, `blockers`, `findings` and `next`. |
| 9 Errors that teach | `src/__tests__/mcp-errors.test.ts` (`teaches()`: a cause, the next call, no local path, no doubled period) over the stdio server; live: F21, F26, F27, F29 and F31 each came from a live error and each is a test now; the errors the models recovered from unaided named the part (`MAT_TEXTURE_UV_MISSING`, w36), the fields (`oldString`/`newString`, w30), the similar paths (w17, w35, b44) or the fix (`UNSAFE_THREE…`, w36; `this`, w29). |
| 10 Durable handles | `src/__tests__/mcp-handles.test.ts`; live: every refine session (f08, f10, f12, f14, w25, w26, c38 to c40) edited a saved revision by `programRef` in a later process. |
| 11 Stable tool list | Two-process byte comparison test; rig: identical definitions across runs. |
| 12 Lean standing knowledge | Generated guide 4,461 characters; `CLAUDE.md` is `@AGENTS.md`; `bun run check:skills` holds every skill within 16,000 characters and 500 lines and makes every `detail: "full"` sentence say "only" (H28). |
| 13 No structured copy beside a picture | Fixture test; live: no image result carried `structuredContent` (relay traces). |

## 3. Four-harness table on the final build

Measured first-hand on `runtime-0.10.0-fix3` (`3fc369c`): the rig (`tools/rig-final.ps1`,
a stand-in provider, no model) for the request shapes of Claude Code and Codex, and the live
sessions of that build (s41, s42, r47, r48) for the rest. Cells that rest on an earlier build
say so. The plan's 0.9.0 and 51e382b tables stay in the plan for comparison.

| | Claude Code 2.1.287 | Codex 0.160.0 | OpenCode 2.0.14 | Agy 1.2.14 |
| --- | --- | --- | --- | --- |
| Protocol revision | `server/discover`, stateless 2026-07-28 by default on the live API (every live session from b06b on; f14 the same with `MCP_PROTOCOL_NEGOTIATION=auto`); against the rig's stand-in API the default run opens with `initialize` 2025-11-25 and the switch brings `server/discover` (H27) | `initialize` at 2025-06-18 by default (every live session); `server/discover` 2026-07-28 with `features.mcp_2026_07_28` (f12) | `initialize` at 2025-11-25 in every session; `protocol: "2026-07-28"` on the server entry did not change it (f08, H22), and neither did `protocol: "auto"` (r47): the harness reads both values, the stdio server still receives `initialize` 2025-11-25 | `server/discover`, stateless 2026-07-28 by default in every session |
| Kiln tools on the first model request | Deferred behind tool search on the live API (H25): the init record lists the 17 Kiln tools as deferred and the model's first action selects them by name; the rig on the final build (`rig-0.10.0-fix3`): with tool search off all 17 definitions whole, 36,718 of the 89,009 tool characters in a 112,372-character first request (`cc-live-first`, the same with the switch); with tool search on, 14 built-in tools and a placeholder, no Kiln definition (`cc-wi-flat`) | None in the request catalog (code mode): the rig on the final build shows 11 built-in tools, 36,957 characters, no Kiln definition, the workspace guide in context and the three Kiln skills listed (`cx-live-first`); the model reaches Kiln through `kiln_workspace.kiln_discover` after reading the skill | None on the tool list; r47's first tool step was `execute` running `search({query: "kiln_discover"})` in code, a 21,755-character page (three `search` pages and fourteen `execute` steps in all; 20,743 characters for the first page on 51e382b) | None on the tool list; one JSON file per tool under the home, read on demand |
| Largest result | 11,116 (`kiln_render` as an explicit `compact` with a 2×1 capture, s41) and s50 `kiln_render` 11,302 (compact with named shots; `kiln_inspect` 11,176), delivered whole; before the fixes 27,302 (f14) | 13,684 (`kiln_render` with four named shots, s42; `kiln_edit` 10,780), delivered whole; before the fixes 27,351 (f11) | 13,496 (`kiln_edit`, r47; `kiln_render` 11,573), delivered whole; before the fixes 20,441 (f08) | 14,977 (`kiln_edit`, r48; a 10,000-character `kiln_source` page at 10,321), through the spill file; before the fixes 38,952 (f10) |
| Truncation seen | None at these sizes | None at these sizes (the cut near 40,000 seen on 0.9.0 was never reached again) | None at these sizes; code mode re-serialises results with indentation (H21) | Nothing cut; results above about 4,000 characters are written to a file the model reads back, one extra step each (H23) |
| Live session on 2026-07-28 | Yes: by default (f13, the wave, the characters, s41) and with the switch (f14) | Yes: f12 with `features.mcp_2026_07_28` | Not achieved: f08 with `protocol: "2026-07-28"` and r47 with `"auto"` on the server entry both opened with `initialize` 2025-11-25 (H22); OpenCode 2.0.14 has no other switch for a stdio server | Yes: every session by default |
| Model, effort, result on the final build | `claude-sonnet-5-5`, high: s41 257 s, 14 Kiln calls, 1 error (an unknown key, answered with the keys the tool takes), no scene, $1.02: the harness stopped with "You've hit your session limit · resets 3:40am" (the owner's account limit, not Kiln's); repeated as s50: s50 1,216 s, 36 Kiln calls, 7 errors (a path before the file existed; the model's throw-as-print probe, answered with the generic rejection, H30; one empty build; four TypeErrors answered with the type-error advice), the composed scene saved (208,178 tris, 125 draws, 32 materials, inside the `scene-web` budget); 65,408 output, 6,581,856 cached reads; $2.75 | `gpt-6.1-sol`, high: s42 1,563 s, 28 Kiln calls, 1 error (the sandbox refused `module` in the first composition; the model fixed it), the composed scene saved (279,332 tris, 452 draws, 33 materials); 5,684,785 input of which 5,493,888 cached, 26,929 output | `opencode-go/muse-spark-1.3-contributor`: r47 189 s, 23 Kiln calls, 0 errors, one chariot (4,076 tris, 61 draws); 83,872 input + 820,353 cached, 7,163 output; $0.013 | `gemini-3.8-flash-high`: r48 661 s, 31 Kiln calls, 0 errors, one chariot (8,680 tris, 71 draws) linked into the inventory; 487,525 input + 10,008,008 cached, 107,079 output (73,671 reasoning), 91 steps |
| Images reached the model | Yes (GPU views described) | Yes | The render and edit results carry the PNG as a `file` part beside the text in code mode | Through the spilled `media_0.png` |

## 4. Live sessions

Fifty sessions were allowed; fifty ran. Wall is the harness process's lifetime; calls are
Kiln tool calls through the logging relay with the errors among them; the largest result is
the longest text a Kiln tool returned; tokens are the harness's own counts (Codex reports no
cost and counts reasoning inside output; Agy reports no cost). Every trace was read; the
findings are in section 5.

### Baseline on 0.9.0 (1 October, afternoon)

| Session | Harness, model | Wall | Calls (errors) | Largest result | Saved | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| b01-opencode-wiring | OpenCode | 31 s | | | crate | Wiring check; the model listed the parts |
| b02-agy-wiring | Agy | 181 s | | `kiln_edit` 22,214 | crate | `server/discover` 2026-07-28 by default; results over about 4,000 characters spilled to files |
| b03-opencode-chariot | OpenCode | 217 s | 8 then the CLI | `kiln_discover` 14,376 (CLI `render --json` 51,312) | 1 | Built standalone (F1); a quoting failure in code mode sent the model to the CLI (F2); $0.019 |
| b04-agy-chariot | Agy | 369 s | 29 | | 1 | Standalone (F1); 466,646 input + 4,657,186 cached |
| b05-codex-chariot | Codex | 30 min kill | 23 | `kiln_render` full 79,078 | 1 (saved at 17:41) | Asset done in 20 minutes, then the harness sat behind the viewer the skill told it to launch (F7); 1,973,600 input of which 1,854,208 cached |
| b06-claude-chariot | Claude Code | 4 s | 0 | | 0 | Died on sign-in; the owner signed the CLI in through its browser flow |
| b06b-claude-chariot | Claude Code, sonnet-5-5 | 213 s | 16 turns | `kiln_edit` 35,776 | 1 | `server/discover` by default on the live API (H27); $0.87 |

### After the fix round, on 51e382b (1 October, evening)

| Session | Harness, model | Wall | Calls (errors) | Largest result | Saved | Tokens, cost | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| f07-opencode-chariot | OpenCode | 483 s | 23 (0) | `kiln_edit` 20,069 | 1 | 98,860 in + 937,443 cached, 6,153 out; $0.015 | Project used; F19; PNG parts beside the text in code mode |
| f08-opencode-refine | OpenCode, `protocol: 2026-07-28` requested | 288 s | 13 (0) | `kiln_edit` 20,441 | revision 2 | 202,598 + 756,692 cached, 3,704 out; $0.024 | Opened with `initialize` 2025-11-25 anyway (H22) |
| f09-agy-chariot | Agy | 713 s | 42 (1) | `kiln_edit` 27,865 | 1, linked into the inventory | 1,054,573 + 9,765,101 cached, 78,866 out | Three cache misses; spill threshold 3,913 to 4,160 (H23); F21 |
| f10-agy-refine | Agy | 480 s | 18 (0) | `kiln_inspect` 38,952 | revision 2 | 442,339 + 5,412,639 cached, 53,747 out | F22 |
| f11-codex-chariot | Codex | 362 s | 20 (0) | `kiln_render` full 22,590 | 1 | 1,030,694 in (907,904 cached), 8,519 out | `initialize` 2025-06-18; compact edit 27,351 (F19) |
| f12-codex-refine | Codex, `features.mcp_2026_07_28` | 388 s | 26 (0) | `kiln_inspect` 19,073 | revision 2 | 1,324,852 (1,232,000 cached), 7,629 out | `server/discover`; manifest resource 48,007 (H26) |
| f13-claude-chariot | Claude Code, sonnet-5-5 | 292 s | 17 (0) | `kiln_edit` 22,417 | 1 | 32,890 out (21,083 thinking), 1,203,072 cached reads; $1.10 | `server/discover` by default; tools deferred behind tool search (H25); F23 |
| f14-claude-refine | Claude Code, `MCP_PROTOCOL_NEGOTIATION=auto` | 143 s | 9 (0) | `kiln_edit` 27,302 | revision 2 | 15,333 out (11,083 thinking), 439,238 cached reads; $0.54 | F19 and F23 |

### Paired wave on 3f4e40a (1 and 2 October, night), lean against compact

Each pair is the same prompt on one harness, the lean arm with `KILN_RESULT_DETAIL=lean`
on the server and the compact arm on the packaged default; order within a pair as the plan
fixed it.

| Session | Harness, model | Wall | Calls (errors) | Largest result | Result characters | Saved | Tokens, cost |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| w15-opencode-sword-compact | OpenCode | 124 s | 18 (0) | `kiln_edit` 14,498 (`full`) | 92,526 | sword 208 tris, 4 draws | 72,999 + 520,622 cached, 2,964 out; $0.010 |
| w16-opencode-sword-lean | OpenCode | 144 s | 14 (0) | `kiln_edit` 26,514 (`full`) | 108,782 | sword 496 tris, 11 draws | 94,570 + 812,899, 4,275 out; $0.014 |
| w17-opencode-shield-lean | OpenCode | 202 s | 22 (2) | `kiln_edit` 26,974 (`full`) | 143,524 | shield 1,272 tris, 10 draws | 92,067 + 1,114,693, 4,739 out; $0.015 |
| w18-opencode-shield-compact | OpenCode | 181 s | 15 (0) | `kiln_edit` 29,694 (`full`) | 114,933 | shield 1,216 tris, 11 draws | 90,677 + 658,177, 3,675 out; $0.013 |
| w19-opencode-wall-compact | OpenCode | 233 s | 14 (0) | `kiln_edit` 12,630 | 79,046 | wall 168 tris, 14 draws | 68,193 + 608,769, 4,047 out; $0.011 |
| w20-opencode-wall-lean | OpenCode | 172 s | 18 (0) | `kiln_project` 9,240 | 68,570 | wall 264 tris, 22 draws | 173,115 + 668,176, 4,186 out; $0.021 |
| w21-agy-horse-lean | Agy | 562 s | 38 (1) | `kiln_edit` 40,533 (`full`; F25) | 210,341 | horse 1,324 tris, 55 draws, two clips | 502,812 + 9,591,005, 82,167 out |
| w22-agy-horse-compact | Agy | 696 s | 43 (2) | `kiln_edit` 17,269 | 272,897 | horse 1,784 tris, 68 draws | 595,470 + 13,512,995, 89,905 out |
| w23-agy-bow-compact | Agy | 493 s | 27 (1) | `kiln_edit` 17,229 | 188,942 | bow set 1,404 tris, 34 draws | 461,516 + 8,408,861, 87,420 out |
| w24-agy-bow-lean | Agy | 411 s | 21 (0) | `kiln_edit` 37,388 (`full`) | 140,957 | bow set 1,400 tris, 33 draws | 384,474 + 5,966,581, 80,234 out |
| w27-codex-galley-compact | Codex | 392 s | 18 (0) | `kiln_discover` 14,331 | 77,861 | galley 4,788 tris, 4 draws | 873,171 in (799,360 cached), 9,139 out |
| w28-codex-galley-lean | Codex | 564 s | 21 (2) | `kiln_discover` 14,281 | 98,442 | galley 6,480 tris, 4 draws | 1,424,874 (1,338,368), 13,116 out |
| w29-codex-temple-lean | Codex | 511 s | 25 (1) | `kiln_render` 21,640 (`full`) | 135,505 | temple 1,736 tris, 13 draws | 1,276,452 (1,179,008), 12,837 out |
| w30-codex-temple-compact | Codex | 877 s | 30 (1) | `kiln_render` 35,208 (`full`) | 226,179 | temple 2,024 tris, 12 draws | 2,499,550 (2,361,984), 17,335 out |
| w31-codex-house-compact | Codex | 525 s | 22 (0) | `kiln_edit` 14,263 | 127,907 | house 876 tris, 8 draws | 1,660,517 (1,544,576), 11,936 out |
| w32-codex-house-lean | Codex | 689 s | 29 (0) | `kiln_edit` 14,456 | 152,197 | house 1,104 tris, 15 draws | 1,682,187 (1,538,816), 14,815 out |
| w33-claude-gate-lean | Claude Code, sonnet-5-5 | 280 s | 23 (0) | `kiln_discover` 12,651 | 111,157 | gate 392 tris, 28 draws, door clip | 27,775 out, 1,707,556 cached reads; $1.09 |
| w34-claude-gate-compact | Claude Code, sonnet-5-5 | 293 s | 13 (0) | `kiln_discover` 14,098 | 85,768 | gate 516 tris, 7 draws, door clip | 33,704 out, 1,204,397 cached reads; $1.07 |
| w35-claude-trojan-horse-compact | Claude Code, sonnet-5-5 | 376 s | 19 (3) | `kiln_discover` 11,927 | 85,628 | Trojan Horse 2,476 tris, 30 draws, hatch clip | 43,801 out, 1,783,832 cached reads; $1.27 |
| w36-claude-trojan-horse-lean | Claude Code, sonnet-5-5 | 672 s | 41 (3) | `kiln_edit` 18,389 | 157,948 | Trojan Horse 2,060 tris, 16 draws, hatch clip | 62,335 out, 4,497,556 cached reads; $2.22 |

### Characters on 3f4e40a, Claude Code on Opus 5.5 at xhigh, one shared workspace

| Session | Wall | Calls (errors) | Largest result | Result characters | Saved | Tokens, cost |
| --- | --- | --- | --- | ---: | --- | --- |
| c37-claude-trojan-soldier | 932 s | 23 (0) | `kiln_screenshot_animation` 24,223 (F24) | 164,288 | Trojan soldier 1,860 tris, 24 draws, idle and attack | 89,680 out, 3,737,717 cached reads; $4.26 |
| c38-claude-greek-soldier | 326 s | 11 (0) | `kiln_edit` 20,556 (F24) | 82,534 | Greek soldier 2,000 tris, 24 draws | 29,572 out, 1,550,384 cached; $2.00 |
| c39-claude-hector | 574 s | 17 (0) | `kiln_edit` 16,908 (`compact`) | 96,099 | Hector 2,224 tris, 25 draws | 53,680 out, 2,410,108 cached; $2.80 |
| c40-claude-achilles | 736 s | 16 (1) | `kiln_screenshot_animation` 18,696 | 146,574 | Achilles 2,424 tris, 27 draws | 67,735 out, 4,490,461 cached; $3.92 |

### Refine pair on 333e69c, Agy, the picked wall breached

| Session | Wall | Calls (errors) | Largest result | Result characters | Saved | Tokens |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| w25-agy-wall-breach-lean | 423 s | 21 (0) | `kiln_inspect compare` 10,644 (`compact`) | 69,467 | revision 2: 528 tris, 44 draws | 313,589 + 3,656,833 cached, 71,088 out |
| w26-agy-wall-breach-compact | 432 s | 24 (0) | `kiln_edit` 28,539 (F30) | 146,438 | revision 2: 684 tris, 57 draws | 363,472 + 5,488,430 cached, 57,878 out |

### Blind block on 333e69c, standalone, through `scripts/tier2-dogfood.mjs --run-live`

The outer agent starts with an empty MCP configuration and only the goal; what it does with
the installed package is the measurement. Its event stream holds no MCP trace, so result
sizes come from the workspace's retained review operations, not from a relay.

| Run | Harness, model | Wall | What the outer agent did | Saved |
| --- | --- | --- | --- | --- |
| b43 spear | OpenCode | 886 s | 33 tool calls, no MCP of its own: generated a workspace with `create-workspace.mjs --harness opencode`, wrote a brief and launched an inner `opencode run --standalone --auto` twice (the first met the provider's "backend is temporarily overloaded"); the inner session authored through `kiln_workspace` (6 retained review operations, 2 programs) | spear 3,356 tris, 18 draws, 4 materials, accepted/pass |
| b44 amphora | OpenCode | 280 s | 52 tool calls, no MCP: generated a workspace and authored through the CLI alone (`discover` four times, `source`, `render --json`, `inspect` four times, `save`); one shot subject by bare name got the cause, two exact paths and the wrong `next` (F31); `kiln save --help` printed the whole global usage | amphora 9,856 tris, 14 draws, 4 materials, accepted/pass |
| b45 tent | Agy | 803 s | 53 tool steps (31 commands, 20 file reads, 2 writes; 406,037 input + 3,597,670 cached, 26,767 output), no MCP of its own: cloned the runtime repository, installed and built it, generated a workspace with `create-workspace.mjs --harness agy`, found `agy mcp list` empty in its new home, then launched an inner `agy.mjs --print` session told to use only `kiln_workspace`; the inner session authored through the MCP server (7 retained review operations, 3 programs) and exported the source and GLB; the driver's receipt counted no tools (S13) | army tent 6,200 tris, 234 draws, 15 materials, accepted/pass |
| b46 brazier | Agy | 882 s | 69 tool steps (36 commands, 23 file reads, 9 task notes, 1 write; 497,969 input + 5,609,582 cached, 32,800 output), no MCP of its own: cloned, installed and built the runtime, generated a workspace, ran `kiln.mjs discover` and `service status` itself, probed the MCP server through a first inner `agy.mjs --print`, read engine source from the clone with `Select-String` (a clean-room deviation, H29), then launched the inner authoring session told to use only `kiln_workspace`; the inner session authored through the MCP server (7 retained review operations, 3 programs) | brazier 17,566 tris, 185 draws, 4 materials, accepted/pass |

### Scene pair on `3fc369c`, the battle before the gate from the picked assets

| Session | Harness, model | Wall | Calls (errors) | Largest result | Result characters | Scene | Tokens, cost |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| s41-claude-scene | Claude Code, sonnet-5-5 | 257 s | 14 (1) | `kiln_render` 11,116 | 58,793 | none: the harness stopped at the account's session limit after the first render of the composition | 26,239 out, 1,697,749 cached reads; $1.02 |
| s42-codex-scene | Codex | 1,563 s | 28 (1) | `kiln_render` 13,684 | 136,248 | Battle before Troy's gate `a_b56056c9…` / `r_b987d82f…`: 279,332 tris, 452 draws, 33 materials, 15 textures, 5,982 KB, accepted/warn; `viewer.html`, `battle.glb` and the editable zip exported | 5,684,785 in (5,493,888 cached), 26,929 out (8,510 reasoning) |
| s50-claude-scene-repeat (session 50, the s41 prompt again after the limit reset) | Claude Code, sonnet-5-5 | 1,216 s | 36 (7) | `kiln_render` 11,302 | 103,461 | Battle before the gate `battle-scene` / `r_150bbef8…`: 208,178 tris, 125 draws, 32 materials, 75 geometries, 15 textures, 14,034 KB, accepted/warn, inside the `scene-web` budget; no export beside the workspace | 65,408 out, 6,581,856 cached reads; $2.75 |

### Reserve sessions on `3fc369c` (the war chariot again, for the table's OpenCode and Agy cells)

| Session | Harness, model | Wall | Calls (errors) | Largest result | Result characters | Saved | Tokens, cost |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| r47-opencode-chariot-reserve (`protocol: "auto"` on the server entry) | OpenCode | 189 s | 23 (0) | `kiln_edit` 13,496 | 110,314 | chariot 4,076 tris, 61 draws, 3 materials, accepted/warn | 83,872 + 820,353 cached, 7,163 out; $0.013 |
| r48-agy-chariot-reserve | Agy | 661 s | 31 (0) | `kiln_edit` 14,977 | 163,361 | chariot 8,680 tris, 71 draws, 4 materials, accepted/warn, linked into the inventory | 487,525 + 10,008,008 cached, 107,079 out (73,671 reasoning) |

## 5. Findings and dispositions

Numbered as in `findings.md`. S: setup and tooling, found before any live session; F: Kiln
findings; H: harness facts, which change no Kiln code.

Fixed with a test, in commit order:

- Step 1 (`8d54eb6`): S3/S12 and S11 (the thin entry answers before the engine loads; a
  configuration problem is a tool result, not a dead server), F6 (an out-of-date workspace is
  reported through the protocol), F12 (rule 2 timings), rule 10 handles.
- Step 2 (`5d56895`): F1 and F8 (the configured project is named to the agent and
  in every save and render result), F2 (`file` input beside `code` and `programRef`), F13 and
  F15 (flat actions, opaque nested records served by Discovery `shape` entries, instructions
  692 characters), F14 (descriptions trimmed under the fourteen-tool budget instead of raising
  it), S5 (instructions no longer cut by Claude Code).
- Step 3 (`aa3c570`): S4 (`ok: false` is `isError` with a next step), F3 and F9 (one
  compaction for MCP and the CLI receipts; one-line JSON; findings grouped by code), F16 (the
  floating-parts warning once, bounded), S1 (the project-import refusal names `--id`).
- Step 4 (`51e382b`): F5 and F11 (the guide is 4,461 characters and points at a cheaper
  installation check), F7 (the skill never launches the viewer in a headless run), S7 (the
  Codex launcher forwards `KILN_PROJECT`), S9 (the driver counts workspace MCP use from the
  manifest's names), S10 (the dogfooding doc names `--standalone`), H16 (one skill registry
  per harness).
- Fix pass on 51e382b (`3f4e40a`): F19 and F19b (compact comparison of counts, before/after
  and twelve changes; the diff shrinks last), F21 (no doubled period), F22 (one comparison
  page for `kiln_edit` and `kiln_inspect compare`), F23 (per-view receipts as what differs
  from the summary).
- Fix pass on 3f4e40a (`333e69c`): H28 (skills say `full` is for a second look only, enforced
  by `check:skills`), F24 (six-decimal rounding, one shot per camera with frames, bounded
  `poseBounds`), F25 (a `full` edit bounded as a whole inside 40,000), F26 (`get` without a
  revision reads the only or newest one), F27 (an unknown key is answered with the keys the
  tool takes).
- Fix pass on 333e69c (`3fc369c`): F29 (a nested record that fails to parse is a tool error
  naming its Discovery shape), F30 (`kiln_edit` no longer echoes the source of an edit sent
  by `code`; `includeCode` is bounded), F31 (a wrong camera subject is answered with the
  shot's fix, not the source's).

Left, with the reason:

- F28: the sandbox refuses `this` inside an object-literal method. Allowing it is a policy
  change that needs a strict-mode guarantee for generated code before the safety net can tell
  a method receiver from the host global; one instance in 36 authoring sessions, and the
  error taught the fix. Owner's list.
- F4: the CLI a model runs beside the MCP server does not see `KILN_PROJECT` unless the same
  environment or `--project` is given; stated in the docs, no engine change.
- F10 and F17: measurement facts (Codex's event stream holds every result whole; the rig's
  stand-in socket crashed once and was rerun).
- S2 (the CLI `material list` printing every manifest) was fixed in `3fc369c` and is listed above; its sibling, `kiln material get` needing both ids where the MCP action reads the only revision, is on the owner's list.
- S6, S8: harness isolation limits (Codex loads user-level `AGENTS.md` and skills even with
  `--ignore-user-config`; `opencode models --standalone` prints nothing), recorded per
  session.
- H1 to H15, H17 to H27: first-hand harness facts; the ones that shape the table are H21
  (OpenCode re-serialises results with indentation in code mode), H22 (OpenCode's per-server
  `protocol` entry does not reach a stdio server), H23 (Agy spills results over about 4,000
  characters to a file the model reads back), H25 (Claude Code defers the Kiln tools behind
  tool search on the live API), H26 (the pretty-printed manifest resource and the repeated
  material pins; owner's list), H27 (Claude Code opens with `server/discover` by default on
  the live API).

## 6. Lean against compact

The ten wave pairs ran the same prompt on one harness twice on `runtime-0.10.0-fix1`, the
lean arm with `KILN_RESULT_DETAIL=lean` on the server and the compact arm on the packaged
default (`tools/pair-compare.mjs --batch wave`). Result characters are the text every Kiln
tool returned to the model over the session; output tokens are the harness's own count for
the whole session; the sums were computed from the table at 01:55.

| Pair | Harness | Result characters lean | compact | Δ | Output tokens lean | compact | Δ | Saved lean / compact | Lean arm asked | Compact arm asked |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| sword | OpenCode | 108,782 | 92,526 | +17.6% | 4,275 | 2,964 | +44.2% | 1 / 1 | 2 full | 2 full |
| shield | OpenCode | 143,524 | 114,933 | +24.9% | 4,739 | 3,675 | +29.0% | 1 / 1 | 3 full | 2 full |
| wall | OpenCode | 68,570 | 79,046 | −13.3% | 4,186 | 4,047 | +3.4% | 1 / 1 | none | none |
| horse | Agy | 210,341 | 272,897 | −22.9% | 82,167 | 89,905 | −8.6% | 1 / 1 | 2 full | none |
| bow | Agy | 140,957 | 188,942 | −25.4% | 80,234 | 87,420 | −8.2% | 1 / 1 | 2 full | none |
| galley | Codex | 98,442 | 77,861 | +26.4% | 13,116 | 9,139 | +43.5% | 1 / 1 | 1 full | none |
| temple | Codex | 135,505 | 226,179 | −40.1% | 12,837 | 17,335 | −25.9% | 1 / 1 | 1 full, 1 compact | 1 full |
| house | Codex | 152,197 | 127,907 | +19.0% | 14,815 | 11,936 | +24.1% | 1 / 1 | 2 compact | 1 full, 1 lean |
| gate | Claude Code | 111,157 | 85,768 | +29.6% | 27,775 | 33,704 | −17.6% | 1 / 1 | 2 compact | 1 lean |
| Trojan Horse | Claude Code | 157,948 | 85,628 | +84.5% | 62,335 | 43,801 | +42.3% | 1 / 1 | 4 compact, 1 full | 3 lean |
| **all ten** | | **1,327,423** | **1,351,687** | **−1.8%** | **306,479** | **303,926** | **+0.8%** | **10 / 10** | | |

By harness: OpenCode (3 pairs) characters 320,876 lean against 286,505 compact, output
13,200 against 10,686; Agy (2) 351,298 against 461,839, output 162,401 against 177,325;
Codex (3) 386,144 against 431,947, output 40,768 against 38,410; Claude Code (2) 269,105
against 171,396, output 90,110 against 77,505. Lean received fewer characters in four pairs
and spent fewer output tokens in four; the two Agy pairs are the only ones where it won both.

Confounders: the wave ran before the H28 skills fix, so several lean arms asked
`detail: 'full'` on their first render (OpenCode sword and shield, Agy horse and bow, Codex
galley), which the fixed skills now discourage; the Claude Code Trojan Horse lean arm made
seventeen edits against the compact arm's one render and one edit, a difference in the
model's own iteration rather than in the result shapes; Codex counts its reasoning tokens
inside output and reports no cost. The Agy refine pair on `runtime-0.10.0-fix2`, after the
skills fix: lean 69,467 characters and 71,088 output tokens (49,060 reasoning), compact
146,438 and 57,878 (38,261 reasoning), both saved revision 2: fewer characters again for
lean, more output.

Decision 12 made lean the default only if task success is no lower and tokens per finished
asset are lower. Task success was equal (every arm saved its asset and every save was
accepted by QA), but tokens per finished asset were not lower overall (+0.8% output, −1.8%
result characters), so **compact stays the packaged default**; `lean` stays a per-host
choice through `KILN_RESULT_DETAIL` and a per-call one through `detail`. The evidence does
support lean for Agy specifically: fewer characters in all three Agy pairs, fewer output
tokens in the two wave pairs, and its 3,913 to 4,160-character inline threshold makes every
large result a spill. Whether the generated Agy workspace should set `lean` is left to the
owner.

## 7. Troy pack candidates

Metrics are Kiln's own at save time (`manifest.build.integration.renderMetrics`); the reads
are from each revision's six-view sheet. Nothing enters the gallery or the site; the pack
stays local for the owner's review.

| Subject | Pick | Triangles | Draw calls | Materials | Also considered | Why |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Wall section | w19 `a_784f8007…` / `r_12fa73f2…` | 168 | 14 | 2 | w20 (264, 22, 3) | Battered footing, mudbrick body with timber lacing, six merlons, flat ends that tile; w20 reads half-timbered at 8 more draws. |
| Breached wall | w25 revision 2 `r_99688a42…` (child of the w19 pick) | 528 | 44 | 2 | w26 revision 2 (684, 57) | A wider gap with fallen timbers in the rubble at thirteen draws fewer. |
| Sword | w15 `a_f71b1807…` | 208 | 4 | 2 | w16 (496, 11) | Leaf blade, bronze guard and wooden grip in four draws; the most repeated prop. |
| Shield | w17 `a_0a67bce7…` | 1,272 | 10 | 2 | w18 (1,216, 11) | The deeper dish, one draw fewer. |
| Bow, arrows and quiver | w23 `bow-set` | 1,404 | 34 | 2 | w24 (1,400, 33) | Darker pinned timber and bronze fittings sit with the pack. |
| Horse | w21 `horse` | 1,324 | 55 | 3 | w22 (1,784, 68, no textures; the cleaner silhouette) | Pinned textured materials like the rest, 13 draws fewer, `Stand` and `Gallop`; the barrel body is the trade-off (owner's call). |
| War chariot | f11 `a_6858bae4…` / `r_b277a52b…` (refined) | 4,156 | 16 | 4 | f09 (6,572, 112), f13 (4,832, 66), f07 (4,708, 57) | Red-panelled car, javelin quiver, yoke with terrets and spoked wheels at a seventh of f09's draws. |
| War galley | w28 `a_582ae189…` | 6,480 | 4 | 4 | w27 (4,788, 4, 3; the smoother hull) | Upswept stem and stern and a striped sail read as a war galley from every view, for 1,692 more triangles. |
| Temple hall | w30 `a_3a4fc574…` | 2,024 | 12 | 4 | w29 (1,736, 13) | Beam-ended cornice, plain plaster walls and a deeper porch in one draw fewer. |
| House | w31 `a_65b2d411…` | 876 | 8 | 4 | w32 (1,104, 15; accepted/warn) | Battered footing and coursed mudbrick in the pack's palette at half the draws, no QA warning. |
| City gate | w34 `city-gate` | 516 | 7 | 4 | w33 (392, 28) | Timber lintel and beam ends at a quarter of the draws; both carry observe warnings (`GEO_PART_SELF_INTERSECTION`, `MATERIAL_IMAGE_COUNT_BUDGET` at nine textures). |
| Trojan Horse | w36 `wooden-horse` | 2,060 | 16 | 3 | w35 (2,476, 30; the rounder body) | Slender striped body, carved head, bronze-hubbed wheels at half the draws; hatch clip. |
| Trojan soldier | c37 `trojan-soldier` | 1,860 | 24 | 3 | — | The one candidate; idle and attack clips. |
| Greek soldier | c38 `greek-soldier` | 2,000 | 24 | 3 | — | From the saved Trojan soldier, rig and clips kept. |
| Hector | c39 `hector` | 2,224 | 25 | 3 | — | From the Trojan soldier. |
| Achilles | c40 `achilles` | 2,424 | 27 | 3 | — | From the Greek soldier. |

Every subject of the inventory has a candidate.

Composed scene (s42, Codex, `sessions/s42-codex-scene/ws/assets/kiln/a_b56056c910ef4e8894d866bbf24ad78e/revisions/r_b987d82f497643cb8db5902cb5f7fffd/`, with `battle.glb`, `viewer.html` and the editable zip beside the workspace): **279,332 triangles, 452 draw calls, 33 materials, 71 geometries, 15 textures, 5,982 KB**, accepted/warn. It instances both armies from the two soldiers, places Achilles and Hector, the wall sections with the breach, the gate, chariots with horses, the galley and the wooden horse, and it updated the project inventory itself.

The Claude Code composition (s50, Sonnet 5.5, `sessions/s50-claude-scene-repeat/ws/assets/kiln/battle-scene/revisions/r_150bbef8028442ae90ce5a957250f61b/`): **208,178 triangles, 125 draw calls, 32 materials, 75 geometries, 15 textures, 14,034 KB**, accepted/warn, inside the project's `scene-web` budget (150 draws, 400,000 triangles). It places seven wall sections and the breach, the gate posed open from its `open` clip, three houses and the temple hall, defenders and archers on the walk, three shield-line clashes, Greeks through the breach, a Trojan line from the gate, and Hector and Achilles in chariots; it composed through a script of its own that wraps each saved revision's source. The two compositions take different routes to the same assets (452 draws at 5,982 KB against 125 draws at 14,034 KB); both stay local for the owner's pick.

## 8. Exclusions

- Hosted CI did not run; the gate ran locally and every exit code is in the plan's log.
- OpenCode 2.0.21 was not installed: the owner's background service runs from the installed
  2.0.14 and a second copy would share its database (decision 11).
- OpenCode on 2026-07-28 was not achieved (H22): the per-server `protocol` entry with
  `"2026-07-28"` (f08) and with `"auto"` (r47) both left the client on `initialize` 2025-11-25.
- Claude Code's `claude mcp list` approval state is user-level and was left as it was.
- Claude Code sessions see the owner's plugins and skills (`--setting-sources project` does
  not cover plugins); their MCP servers were isolated to the workspace's own.
- The blind runs' outer event streams hold no MCP trace, so their result sizes were not
  measured; their Kiln evidence is the workspace's retained review operations.
- Agy reports no cost and Codex reports no cost; token counts stand in.
- The outer Agy agent of the brazier blind run read engine source from its clone before
  briefing the inner author (H29); the inner session itself worked from the workspace's
  guide and skills. The result stands as a blind run with that deviation noted.
- The driver's receipts for the two Agy blind runs were produced before S13 was fixed, so
  they say `toolUsage: {}`; the counts in this report were read from the event streams by
  hand (one call per step index).
- Sessions ran on a loaded host (other work on this PC), which stretches wall times and the
  gate's test budgets; sizes and token counts are unaffected.
- The Claude Code scene session s41 was cut by the owner's account session limit, not by Kiln
  or the 30-minute cap; it counts and was repeated as session 50.
- The fresh clone of `3fc369c` failed its gate's `test` step on two CLI JSON tests at the 20 s
  budget while two live sessions ran beside it (3,115 pass, 2 fail; the same run's coverage
  step passed them at 4.8 and 11.5 s). The two tests now carry measured budgets and the fresh
  clone was rerun on the final commit (section 1b).

## 9. Decisions left to the owner

- The dropped plugin `$schema` (its URL answered 404).
- The site release value 0.10.0.
- Updating OpenCode to 2.0.21 over the running background service.
- Whether the generated Agy workspace should set `KILN_RESULT_DETAIL=lean` (section 6).
- Serving saved manifests as resources minified, and whether a project revision should imply
  its material pins instead of repeating them per call (H26).
- The horse pick: w21's pinned materials and lower draws against w22's cleaner silhouette.
- F28: allowing `this` inside object-literal and class methods in generated code.
- One name for a material: `resourceId` in projects and pins, `materialId` in the tool.
- The CLI `kiln asset <id> <revision>` requires both while `kiln_assets get` reads the newest
  revision; and `kiln save --help` prints the global usage.
- Whether `module`, like `this`, should be allowed in generated code the sandbox checks (s42's
  first composition hit it; the error taught the fix).
- Where the composed battle scene goes: it stays in the session workspaces for review; nothing
  enters the gallery or the site.

## 10. Cleanup list

The read-only cleanup list is `kiln-dogfood/v1-readiness-2026-10/cleanup/cleanup-list-2026-10-02.md`
(with the step-0 inventory `cleanup-list-draft.md` and `cleanup-facts.json` beside it): one row
per worktree, branch, log and stale folder with a proposed action and its reason. Nothing was
deleted, moved or pruned during the cycle; every action there waits for the owner.
