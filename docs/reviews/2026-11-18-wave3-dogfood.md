# Wave 3 dogfood: flush faces at authoring time (#365) and the author-skill ledger (#370)

Run on 2026-11-18 on the maintainer's Windows PC. This review records:

- whether agents fix `FLUSH_FACES` from the warning text alone (#365);
- what an authoring session spends its context on (#370);
- the author-skill trim, and the same tasks re-run on it.

## Setup

- **Tasks:** three one-sentence prompts, chosen because each invites overlays on a host surface:
  - a cottage front door with a window, a brass letter slot and a number plate;
  - a fishing boat hull with a painted waterline stripe, a name board and portholes;
  - a shop front with a display window, a sign board and a door with a push plate.
- **Harnesses:**
  - Claude Code 2.1.322 with Sonnet 5.5 (`claude -p`, `--strict-mcp-config`);
  - Codex CLI 0.170.0 with Sol 6.2 (`node codex.mjs`, no other Kiln server).
- **Workspaces:** each run had a fresh workspace from `scripts/create-workspace.mjs`, served by the engine under test.
- **Engines:**
  - "Before": `d4d3d66e`.
  - "After": `07843f67`, which is `a975622c` (gate CPU logging only) plus the skill trim.
- **Scheduling:** all six runs of each set ran at once.
- **Ledger:** taken from each trace (Claude Code `stream-json`, Codex `exec --json`).
  - Text entering the context is counted by category at 4 characters per token: skill and reference files, `kiln_discover` results, other Kiln results, and other reads.
  - Images are counted apart.
  - Model usage is the trace's own final usage record.

## #365: flush faces at authoring time

Every one of the 12 runs saved an asset with no open `FLUSH_FACES` pair. Each pair was fixed by moving or resizing a face by a few millimetres. No run asked for a helper, and none placed an overlay worse after reading the warning.

| Run | Before: pairs, then edits to clear | After: pairs, then edits to clear |
| --- | --- | --- |
| Claude, door | 6 → 2 → 0, 2 edits | 3 → 0, 1 edit |
| Claude, boat | 1 → 0, 1 edit | 2 → 1 → 0, 2 edits |
| Claude, shop front | 10 → 3 → 0, 2 edits | 1 → 0, 1 edit |
| Codex, door | 1 → 0, 1 edit | 2 → 1 → 0 over 3 edits |
| Codex, boat | none | none |
| Codex, shop front | none | 11 after an edit → 1 → 0, 2 edits |

**Decision: guidance only, no placement helper.**

- The warning names both parts, the plane, the shared area and the distance to move. That was enough every time.
- A helper that keeps overlays clear of their host would add a Discovery entry and a contract for a problem the text already solves in one or two edits.
- Reopen this if a later run leaves a pair open at save, or spends more than three edits on one pair.

## #370: the token ledger

### Before the trim

| Run | Skills | Discovery | Other Kiln results | Other reads | Output | Calls | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Claude, door | 6.4k | 4.3k | 5.2k | 0 | 7.7k | 11 | 68 |
| Claude, boat | 6.4k | 2.7k | 7.0k | 0 | 7.4k | 10 | 68 |
| Claude, shop front | 6.4k | 2.5k | 7.5k | 0 | 8.1k | 9 | 70 |
| Codex, door | 19.4k | 8.9k | 22.3k | 18.1k | 13.7k | 36 | 378 |
| Codex, boat | 24.4k | 11.8k | 20.5k | 24.4k | 18.2k | 34 | 498 |
| Codex, shop front | 30.7k | 9.8k | 15.4k | 26.8k | 20.4k | 37 | 527 |

All figures except calls and seconds are estimated tokens.

- **Claude Code:**
  - The first request is about 47,200 tokens, most of it the harness's own system prompt and tool definitions.
  - The skill read is `kiln-author-asset/SKILL.md` plus `program-contract.md`, about 25,200 characters (≈ 6,300 tokens).
  - Sessions take 10–12 turns.
- **Codex:**
  - Codex reads much more. Each run read the author, QA and refine `SKILL.md` files up front, then several references. All three read `export-profiles.md`, although none was asked for delivery files.
  - Its input is 1.6–2.7M tokens a run, about 94% cached.

### Target and trim

- **Target:** the default read (author `SKILL.md` plus the program contract) at or under about 22,000 characters, a cut of about 800 tokens from every session.
- **Conditional read:** `export-profiles.md` becomes a read only when the user asks for delivery files beyond the saved asset.

The trim moves material most runs never need out of `SKILL.md` and into the references:

- the CLI file commands, now in `camera-cli.md`;
- animation and interior sampling, and part listing;
- what a saved preview keeps, now in `camera-recipes.md`.

It also shortens the Live Review, engine handoff and attribution paragraphs to their rules. Phrases the workspace tests pin, and the destination and viewer rules, are kept word for word. `SKILL.md` goes from 15,998 to 12,842 bytes, and the default read from about 25,200 to about 22,050 characters. CLI commands stay out of the references served to the native harness.

### After the trim

| Run | Skills | Discovery | Other Kiln results | Other reads | Output | Calls | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Claude, door | 5.6k | 5.6k | 3.9k | 0 | 8.7k | 11 | 80 |
| Claude, boat | 2.4k | 3.5k | 4.3k | 0 | 12.0k | 10 | 103 |
| Claude, shop front | 5.6k | 0.6k | 3.3k | 0 | 3.9k | 7 | 37 |
| Codex, door | 19.1k | 7.0k | 32.2k | 10.2k | 16.6k | 36 | 464 |
| Codex, boat | 34.9k | 8.1k | 11.8k | 7.1k | 21.3k | 34 | 547 |
| Codex, shop front | 16.5k | 12.2k | 33.9k | 8.2k | 20.4k | 45 | 554 |

- **Claude Code:**
  - The skill read fell from 6.4k to 5.6k tokens, as targeted. The boat run loaded the skill through the Skill tool and read less.
  - All three runs built, cleared every flush pair and saved, with the same number of turns as before.
- **Codex:**
  - None of the three runs read `export-profiles.md`; before, all three did.
  - The skill total still swings between 16.5k and 34.9k with which references Codex chooses. The boat run read all of `geometry-recipes.md`, 48,000 characters with `camera-cli.md`.
  - Three runs per harness cannot separate the trim from that variance.
- **Results were the same:** all six runs built and saved, and no QA finding was left open.

### What these numbers do not show

- **Cost:** Claude Code's cost fell from $0.48–0.50 to $0.23–0.39 a run. That is mostly prompt caching, not the trim: the "after" runs started 17 minutes after the "before" runs and found the harness prefix already cached. Cache writes fell from about 91,000 to 39,000–54,000 tokens a run.
- **Time:** wall-clock time also varied with load. A test gate was running during the Codex "after" runs.
- **Memory confound:** the Codex runs used the maintainer's Codex home, and every run searched its memory file before starting. That is outside Kiln's control and the same in both sets, but it adds reads Kiln did not cause. The next clean-room Codex run should disable memories, or use a home that has none.

## Follow-ups

- Codex reads the QA and refine skills at the start of an authoring task, about 15,000–19,000 characters before any build. Their descriptions could say when to read them more plainly. This is worth one more measured pass, not a rewrite.
- No helper is needed for #365.
