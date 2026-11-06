# Test, CI and complexity audit (5 November 2026)

The audit was measured at `cde4dfe` as analysis only. The owner then widened it to trimming
tests and landing the changes; [What landed](#what-landed) records that, and the sections after
it are the original findings. Like other dated reviews this is a historical record, not an
override of code or `AGENTS.md`.

Labels used throughout: **M** measured here, **D** derived by arithmetic from measured
numbers but not run end to end, **E** estimated.

## What landed

The owner widened the audit to trimming tests and landing the changes, relayed through the coordinating
session. Each row is its own squash-merged PR. CI numbers are from real runs; "active" is first job start
to last job end, which leaves out time queued for runners.

| PR | Change | Effect |
| --- | --- | --- |
| [#323](https://github.com/instruktlabs/kiln/pull/323) | Exporter pass moved to its own job behind a gate keeping the `typecheck · lint · test` context | **596 s on its first run, against 10.2 min (612 s) calculated and 936 s before** |
| [#324](https://github.com/instruktlabs/kiln/pull/324) | Stale tests retired, load-only failures removed, corpus subset on the two repeat legs | 25 fewer tests, 5 fewer files, 1,923 fewer lines; coverage counts identical |
| [#328](https://github.com/instruktlabs/kiln/pull/328) | `check:merge-markers` in the Linux job | About 0.5 s; catches `<<<<<<< `, `||||||| `, `>>>>>>> ` |
| [#330](https://github.com/instruktlabs/kiln/pull/330) | Biome cognitive complexity limit of 100, with 13 per-file ceilings | Under 1 s; stops growth. No refactor, no `src/` change |
| [#325](https://github.com/instruktlabs/kiln/pull/325) | Windows suite split into two shards behind a gate | Longest Windows job 561–592 s → 288–380 s over three PR runs, no new failures |

### Measured CI time

| Stage | Longest job | Run, active | Notes |
| --- | ---: | ---: | --- |
| Before, 25-run medians | 933 s (Linux) | 936 s wall | Full suite twice in one job |
| After #323, its own run | 592 s (Windows) | 592 s | Windows now longest |
| Other runs with #323 but without the trim or shards | 430–619 s (Windows) | 488–620 s | |
| After #323 and #324, on `main` | 396–571 s (Windows), 494–508 s (coverage) | 515–572 s | |
| **All five landed, `main` at `065134d`** | **472 s (coverage)** | **477 s, or 522 s with 44 s queued** | Windows shards 222 + 315 s; exporter 437 s; 35.8 runner-minutes against 38.0 before |

**Single runs are noisy.** The same coverage step took 302–485 s across these runs with near-identical tests, so
differences under about 60 s between single runs mean little. Runner queueing can add more: #324's run waited
310 s before starting, while several sessions were pushing.

### What the trim saved

- **Exporter pass step:** 372–461 s across runs without the trim (median 453 s) and 291–417 s with it (median 329 s).
  That difference includes runner noise. The arithmetic from per-file times predicts about 57 s.
- **Corpus, measured directly by CPU time:** the examples file went from 274 s to 122 s on the subset legs. That is
  44%, not the 29% of pure execution time reported in the audit, because module load and the inventory checks
  still run. The Linux coverage pass keeps all 86 examples.
- **`cli-render-environment`, CPU time:** 70 s to 40 s, 23 tests to 15.
- **Budgets:** 26 tests and one hook that timed out only under load. These do not shorten CI. They stop local gates
  failing on a busy machine, which was the friction reported.

### Coverage

| | `LH` / `LF` lines | `FNH` / `FNF` functions | Verdict |
| --- | ---: | ---: | --- |
| Base `6bf1e5f`, CI | 77,236 / 83,032 | 5,653 / 5,921 | functions 95.47%, lines 93.02% |
| Trimmed branch, full local run | 77,236 / 83,032 | 5,653 / 5,921 | functions 95.47%, lines 93.02% |
| #324 in CI, after merging #322 | | | functions 95.49%, lines 93.04%; 88 functions, 781 lines of slack |

The thresholds were not changed. No trim commit lost a line, so the small rise comes from #322. The local run had 2
timeouts at load 20, and both tests then got budgets.

### What was removed, and why

| Test file | Why it was stale |
| --- | --- |
| `src/__tests__/architecture-expansion-gate.test.ts` | 1,317 lines measuring a closed shed/hip decision against test-only candidates; 0 unique lines; hashes pinned to the legacy converter. The decision stays in `docs/reviews/2026-09-23-helper-promotion-decisions.md`, which still calls it "retained" |
| `src/experiments/w8-quadruped-gait-profile.test.ts` | Test-only candidates; imports no engine code |
| `src/vegetation-prompt.test.ts` | `src/vegetation-prompt.ts` is unreachable from any export or entry point |
| `scripts/qualify-full-optimizer.test.mjs` | One-off script, named only in a dated plan |
| `scripts/evaluation/observe-shipping.test.mjs` | One-off evaluation recorder, named only in dated plans |

Also changed: 8 CLI tests merged away in `cli-render-environment`; three prose regexes and two exact pins dropped; a
Windows `EBUSY` in test cleanup no longer fails a test whose assertions passed.

**Reviewed and kept, though they look stale:**

- `retired-helpers` and `dispatch-categories`: the source still implements those rejections.
- Migration tests (`cli-migration`, `migration-rebuild`, `manifest-migration`): the migration code still ships.
- `authoring-diagnostic`: 14 s, but many cases prove a closed diagnostic code survives the worker boundary.
- `packaged-save-provenance`: packaging identity, on the keep list.

Unreachable from any shipped entry, left for the owner: `src/breadth-prompt.ts`, `src/vegetation-prompt.ts` and everything
under `src/experiments/`. The scripts behind the two removed script tests also remain.

### The merge-train cost

`main` requires branches to be up to date, and `dist/build.json` records a hash of `src/`, so PRs that change source
conflict with each other in addition to going stale. 61 of the 166 commits since 15 September touch `dist/build.json`.

| Train | PRs | First opened to last merged | Per PR | CI runs on those branches |
| --- | ---: | ---: | ---: | ---: |
| Batch 1, 6 November, before these changes: #318–#321 | 4 | 95 min | About 24 min | 12 PR runs, 3 of them cancelled, plus 4 `main` runs |
| These PRs: #323, #324, #328, #330 | 4 | 71 min | About 18 min | Test-only, so no `dist/` conflict |

These do not compare like for like: the second train changed no `dist/` and raced other PRs. The direction is the
point: only one ready PR can land per CI run. `dist/` itself is not fixed by anything here. Options for the owner, none done:

1. **Stop PRs carrying `dist/`.** Build it at release or in a post-merge step. The `build portable Node package` job
   already builds a fresh `dist/` before packing, so PRs would still prove it builds. This removes the conflict, but
   the identity tests (`mcp-bundle`, `workspace-setup`, `runtime-build-identity`) are on the keep list and would have
   to change where they run, so it needs a decision.
2. **Then use a merge queue** instead of strict up-to-date. That needs a `merge_group` trigger in `ci.yml`. Without
   the first step a queue does not help, because each merged group would have a stale `dist/`.
3. **Turning strict off alone is not enough:** source PRs would still conflict on `dist/build.json`.

### Recommendations left for the owner

- **Narrow the exporter pass on PRs (change 3).** No real exporter defect in about seven weeks, but this changes what
  the gate sees. With parallel jobs it would now save runner time rather than wall time.
- **Skip engine jobs by path (change 6).** Would have skipped 9% of commits, but it changes what the gate sees.
- **Retire experiment source with its tests (change 7).** Lines 92.93% and functions 95.52% (D), but it changes `src/`
  and forces a `dist/` rebuild.
- **Move the full corpus out of the coverage pass (change 5).** Coverage now shares the critical path with Windows,
  so this would cut wall time by about 49 s (D), and a separate job would keep every example in the gate.
- **CLI start-up and complexity refactors (changes 9, 10 and the refactor list).** Not attempted; refactors were out of scope.

Local notes: `/tmp` on the audit machine filled during this work, because worktrees with `node_modules` are about 750 MB
each. In worktrees outside `.claude/worktrees`, `bun run lint` also reported an unused suppression in a `site/` file
that CI's lint does not report; the cause was not investigated.

## Summary of the original audit

1. **The problem is one duplicated step, not too many tests.** The Linux job is the critical
   path at 933 s of CI's 936 s, and 892 s of it is the full suite run twice: once for coverage
   (451 s), once with `KILN_GLTF_EXPORTER=three` (441 s). Moving the second pass into its own
   job takes CI from about 15.6 to about 10.2 minutes with no test removed and no coverage
   lost (D).
2. **That second pass has not found a real defect in its retained history.** Five CI runs
   failed in that step alone: three were one flaky test and two were tests that had not pinned
   the legacy exporter (M). Only 93 s of the 438 s pass is in non-spawning files shown to reach
   the exporter selection in process (M).
3. **Deleting small tests saves no time.** 3,065 of the 4,057 tests (76%) total 5.4 s. 93 tests
   take 226 s. 72 spawning files take 228 s, about half the suite (M).
4. **Agents did not copy-paste tests.** Across 3,442 statically extracted tests there are no
   exact duplicate bodies and five near-duplicate pairs (M). Overlap exists, but it is overlap
   of paths, and line coverage can't justify deletion by itself.
5. **The historical example corpus is the best single target.** It costs 69 s per pass and adds
   17 lines beyond the rest of the suite. 23 of its 86 examples reach every line it reaches, in
   29% of its time (M).
6. **Three tempting fixes do not work as they stand.** `bun test --parallel=4` hung (M). Merging
   sharded LCOV would report 88.22% instead of 93.00% (M). Removing the experiment tests without
   their source costs 860 lines against 745 of slack and fails the gate (M).
7. **A cognitive complexity limit is worth adding, at 100 first.** That flags 13 functions, all
   orchestrators; the default of 15 flags 472 (M). Exhaustive validators score low on it, so
   they are not caught by accident.

Correction to the brief: the coverage verdict is **functions 95.47%, lines 93.00%**, with 86
functions and 745 lines of slack (`LF` 82,813, `LH` 77,016, `FNF` 5,913, `FNH` 5,645, from the
retained CI artifact of `cde4dfe`). The brief had the labels the other way round.

## How this was measured

- **CI:** 25 successful `ci.yml` runs (15 `main`, 10 pull request) for medians, plus job and step
  results for the 58 failed runs back to 25 June. Test names come from the logs GitHub still
  retains, which go back to 5 September.
- **Local:** Bun 1.4.2, Node 22.23.3, 8 cores, shared with another session and other work. Load
  ran from 5 to 28 and my processes often got about 20% of a core, so **local absolutes are not
  comparable to CI**: the serial suite took 1,190 s here against 441 s in CI. Only ratios and
  pass/fail results are used from local runs.
- **Per-file coverage:** every test file run alone, 507 runs. As a control, the union of those
  runs hits exactly CI's 77,016 lines with **zero mismatches in either direction**, so the
  attribution reproduces the gate's number.
- **Complexity:** ESLint `complexity` and Biome `noExcessiveCognitiveComplexity`, run from
  outside the repo, over 455 files in `src/` and `scripts/` excluding tests and generated code.

Limits worth carrying into any decision:

- **Coverage does not follow child processes.** 54 files with 346 tests and 96 s show no in-process
  `src/` coverage at all, including `workspace-bootstrap` and `packaged-save-provenance`. Zero
  unique lines there means unmeasured, not redundant.
- **Line overlap is not assertion overlap.** A file with zero unique lines can still be the only
  place a behaviour is asserted. Coverage nominates candidates; it never decides.
- **Bun's LCOV omits `render.ts` for `examples.test.ts`,** whose work runs at module scope under
  top-level await. The corpus figures below come from a separate run of each example inside a
  real test, where `render.ts` does appear.
- **Git history is weak evidence here.** Work lands squashed (median 6 files per commit, p90 32,
  19 commits over 100 files), so a test changing with its implementation says little. Of 507 test
  files, 274 have never changed since creation.
- **Per-file times come from CI log timestamps,** which are noisy below about 0.1 s.
- **Failure history is seven to eight weeks of logs.** A test that has not fired in that window
  has not been shown useless.

## Baseline timings

### CI (medians over 25 runs)

| Job | Median | Min–max | On critical path |
| --- | ---: | ---: | --- |
| `typecheck · lint · test` | 933 s | 682–984 | **yes** |
| `typecheck · lint · test (Windows)` | 609 s | 392–681 | next |
| `Node package · Windows` | 185 s | 143–260 | after `build portable` |
| `Node package · macOS x64` | 146 s | 97–233 | |
| `build portable Node package` | 76 s | 46–99 | |
| `Node package · macOS arm64` | 69 s | 49–95 | |
| `Node package · Linux` 20.15.0 / 22.2.0 / 24.20.0 | 59 / 56 / 56 s | 36–96 | |
| `Installed renderer · Linux software Vulkan` | 50 s | 35–505 | |
| `render service tests` | 35 s | 29–47 | |
| **Whole run, wall** | **936 s (15.6 min)** | 685–2,721 | |
| **Runner time, sum of job medians** | **38.0 min** | | |

| Step | Median |
| --- | ---: |
| Linux: unit tests and coverage gate | 451 s |
| Linux: unit tests, community exporter selected | 441 s |
| Windows: unit tests | 532 s |
| Windows: `bun install` | 26 s |
| Windows package smoke | 133 s |
| Typecheck, Lint, SDK build | 3 s, 3 s, 5 s |

Other workflows, averages since 20 October: Website 215–223 s (path-filtered; 113 s of it is
building assets), Plugin Security Scan 87 s, native hosting preflight 83 s, Scenes 63–112 s.

### Local (contended, see above)

| Command | Local | Load at start | CI equivalent |
| --- | ---: | --- | ---: |
| `bun run build:sdk` | 15.3 s | 9.5 | 5 s |
| `bun run typecheck` | 9.0 s | 10.4 | 3 s |
| `bun run lint` | 4.9 s | 12.4 | 3 s |
| `node scripts/build-runtime.mjs all` | 28.7 s | 13.6 | 7 s (`build:runtime`) |
| `bun run test:render-service` | 21.8 s | 17.8 | 18 s |
| `node scripts/exporter-cli-check.mjs` | 28.2 s | 15.8 | 7 s |
| `bun test src scripts` serial, JUnit | 1,190 s, 0 failures | 15.6 | 441 s |
| `bun run test:coverage` | 3,282 s, **12 timeouts**, 4,036 pass; LCOV still exactly 77,016 of 82,813 lines | 12–25 | 451 s, 0 failures |
| Every file in its own process, 4 at once | 627–690 s; 507 and 506 of 507 files pass | 6–21 | not run |
| `--shard=k/4`, 4 concurrent | **inconclusive:** hit my 900 s bound; all 32 failures were timeouts | 25–50 | not run |
| `--parallel=4`, whole suite | **hung:** two of four workers spinning at about 97% CPU with no progress for over 17 min, killed | 5–14 | not run |
| `--parallel=4`, files with no direct spawn | **inconclusive:** hit my 420 s bound, all listed failures timeouts | 40–50 | not run |

The other session's "lint past 3 minutes" did not reproduce: `biome check .` in the main
checkout took 6.1 s at load 27.

### Where the suite's 451 s goes (CI, Linux)

| Slice | Share |
| --- | ---: |
| 3,065 tests under 10 ms | 5.4 s |
| 178 tests at 500 ms or more | 286 s |
| 93 tests at 1 s or more | 226 s |
| 72 files that spawn processes | 228 s |
| Top 10 files / top 50 files | 45% / 79% |
| Corpus work at module scope, in no test's time | 69 s |

Slowest files: `examples` 69.0 s, `packaged-save-provenance` 20.8, `workspace-bootstrap` 17.6,
`cli-render-json` 17.5, `cli-render-environment` 16.2, `asset-cli` 15.6, `authoring-diagnostic`
14.1, `project-cli` 13.0, `workspace-upgrade` 10.2, `result-contract` 9.4.

Slowest tests: `CLI saves, exports, imports, and restores a revision` 10.3 s, `CLI samples real
clips` 8.0, `renders retained source with a capture file` 7.8, `source JSON is the shared
kiln_source result` 7.2, `reuses a packaged Node build` 6.3, `contract rule 7: every tool and
action` 6.3, `compiled CLI renders and saves standalone` 6.1, `edit, inspect and animation honor
exact CLI project selection` 5.8.

The slow tests are almost all CLI subprocess calls: 72 tests over 1 s make about 313 calls for
179 s, or **0.57 s per call** (static count, so approximate). Most of a call is start-up, since
`kiln --version` loads the whole 3.7 MB bundle.

## Ranked changes

Time saved is per CI run unless stated. "Wall" is what a contributor waits for; "runner" is
compute. Coverage figures are against the 86-function, 745-line slack.

| # | Change | Saved | Risk | Coverage lost |
| --- | --- | --- | --- | --- |
| 1 | Run the exporter pass as its own job, behind an aggregator keeping the required context name | **wall 936 → ~610 s (D)**; runner +~40 s | Low | None |
| 2 | Split Windows `bun test` into two `--shard` legs behind an aggregator | wall ~610 → ~490 s (E); runner +~80 s | Low to medium, see below | None; Windows has no ratchet |
| 3 | Narrow the exporter pass on PRs to files that reach the exporter, keep the full pass on `main` | runner −~345 s (D: 93 s of 438 s) | **Medium: owner decision** | None to the ratchet; it reads the first pass only |
| 4 | Run a 23-example corpus subset outside the Linux coverage pass | Windows −~37 s, exporter −~45 s (D) | Low | None if Linux keeps the full corpus |
| 5 | Move the full corpus out of the coverage pass into its own job | wall −~49 s (D); runner +~60 s | Low | 0 lines: the 23 cover all 17 unique lines (M) |
| 6 | Skip the engine jobs when only `site/` or `scenes/` changed | 9% of runs, 15 of 164 commits since 15 September, skip about 15 min (M) | Medium: required contexts must still report | None |
| 7 | Retire finished experiment gates, source included | −10.3 s per pass, −~31 s runner over three passes (M); −~2,900 lines | Low to medium: owner decision | **Lines 92.93%, functions 95.52% (D)** |
| 8 | Merge the render-environment matrix from 23 CLI tests to about 9 | −~10 s per pass (E) | Low | 0 lines (M), but spawned code is invisible to coverage |
| 9 | Run authoring-diagnostic cases in process, keeping one through the worker | −~8 s per pass (E) | Low | 3 unique lines to re-check; **wait for the evaluator work** |
| 10 | Lazy-load heavy imports in the CLI for commands that do not need them | −~60 s per pass if 0.2 s of each 313+ calls goes (E), and users gain | Medium | Unknown; needs a spike |
| 11 | Replace brittle pins in `reliability.test.mjs` and prose pins in tests | 0 s; avoids re-runs, see below | Low | 0 lines |
| 12 | Fix `concurrent cold starts` if it recurs | About one 15-min re-run per flake; 3 red runs in 11 days, none since 17 October (M) | Low | None |
| 13 | Add Biome cognitive complexity at 100 | Stops growth; lint cost under 1 s (M) | Low | n/a |

### Notes on the ranked changes

**1. Exporter job.** The repository already has this pattern: `linux-package-gate` keeps a
required context stable behind expanded jobs, "no protection setting needs to be removed or
weakened". Doing the same here means no branch-protection change. It does have to update
`REQUIRED_CHECKS` in `scripts/reliability.test.mjs`, which fails on any added job by design.
After this Windows is the critical path, which is why change 2 follows. Coverage instrumentation
is not worth targeting: it adds about 10 s over a plain run.

**2. Windows shards.** Use separate jobs rather than concurrent processes in one job. Under
contention the CLI tests time out, and in-job concurrency would create that contention on purpose.
Shard only the plain legs. **Do not shard coverage:** Bun's per-run line tables differ, so a union
has 87,302 lines against CI's 82,813 and the same 77,016 hits would report 88.22%. Sharded coverage
would need a normalised denominator, and that is a change to the contract.

The `--shard` flag itself could not be timed here, because the box reached load 50. What the record does
show is that files pass when run as four concurrent independent processes: 507 of 507 in one run and 506
of 507 in another, where the one failure was a 20 s budget under load. So files don't interfere with each
other. **`--parallel` must not be
adopted on this evidence:** whether its hang is Bun's or this suite's, it needs one run on a CI runner to
settle. Spinning workers with unreaped children suggest the spawning tests, but that's not established.

**3. Narrower exporter pass.** Retained history for the step:

| Run | Failing test | Actual cause |
| --- | --- | --- |
| 2026-10-01 | `default exporter keeps emissive intensity` (3 tests) | Test assumed the default exporter |
| 2026-10-07, 10-13, 10-17 (`main`) | `concurrent cold starts join one verified managed service` | Flaky service-startup test |
| 2026-10-22 | `legacy samples a channel-1 occlusion map` | Test assumed the default exporter; since pinned |

So no real community-exporter defect in about seven weeks, and the pass's own cost includes
forcing unrelated tests to pin their exporter. The exporter is still tested elsewhere:
`community-exporter.test.ts`, `rig-export`, `uv-projection`, `skinned-review`, the built-CLI
`exporter-cli-check.mjs`, and package smoke on six platform legs. **The cost of narrowing is real,
though:** a defect only the corpus or a spawned CLI would show under `three` would be found after
merge, on `main`. That is a weakening of the PR gate for an opt-in exporter, so it's the owner's
call. Change 1 gets most of the wall-clock win without it. Path-triggering the full pass on
`src/community-exporter.ts`, `src/render.ts` and `src/views/port.ts` would narrow the gap.

Trial of the subset with `KILN_GLTF_EXPORTER=three` (M): 179 files, 1,473 of 1,475 tests pass, with both
failures at the 20 s budget under load, not exporter defects. The subset was picked by Bun's LCOV hitting
`src/render.ts:1770`, so it omits the corpus and every spawning file by construction. The list would need
review before use, and it can miss paths reached only through a worker.

**4 and 5. Corpus.** Per-example results:

| Examples, greedy order | Lines of the corpus covered | Share of corpus time |
| ---: | ---: | ---: |
| 4 | the 17 lines nothing else hits | 2.2% |
| 10 | 97.04% | 4.8% |
| 15 | 99.05% | 9.8% |
| 20 | 99.71% | 16.7% |
| 23 | 100% | 29.2% |
| 86 | 100% | 100% |

The slowest five (`mech`, `sushi-store`, `diving-helmet`, `robot-arm`, `cathedral`) take 31% of the
time. The corpus's one recorded catch (2026-09-05, nine tests, mostly exact warning text) included
`alpine-cable-terminal`, which is in the subset. The subset is:
`crate, alpine-cable-terminal, well, demo-clockwork-dragonfly, windmill, blast-furnace,
demo-argent-aircraft-carrier, air-defense-radar, comms-satellite, lighthouse, arcade-cabinet,
mechanical-peacock, demo-dauntless-cv-08, cafe-racer, crawler-crane, demo-solar-sail-courier,
demo-floating-observatory, demo-umbra-submarine, radio-telescope, field-gun, fighter-jet,
sushi-store, cathedral`.

Lines are not inputs, so this keeps code reach and gives up unusual combinations of it. That is
why the full corpus should keep running in a gating job, unless the owner chooses otherwise.

**6. Path filter.** Do not skip for docs or `.github` changes: `reliability.test.mjs`, the doc-drift
tests and `check-toolchain` read those files, and `site/package.json` and `scenes/package.json` are
read by two tests, so those manifests must stay in the trigger set. A workflow-level `paths:` filter
would block merges through a required context that never reports, as `reliability.test.mjs`
explains; use a changes job with `if:` so the contexts report as skipped.

**7. Experiments.** Removing `w6`/`w7` tests alone loses 860 lines and **fails the ratchet**. Removing
`src/experiments/w6-material-vegetation.ts` and `w7-vegetation-lod.ts` with them gives lines 92.93%
and functions 95.52%. Any `src/` removal changes the source hash and forces a `dist/` rebuild.
Found in passing: `w7-vegetation-lod.ts` imports `../__tests__/helpers/requirements-fixture`, while
`package.json` ships `src/**/*.ts` and excludes `__tests__`, so the published file has a broken import.

**11. Pins.** Of the 57 distinct tests that failed in retained logs, the most repeated were
`standalone agent context stays concise` (3 runs), `coverage is measured, ratcheted, and retained`
(2 runs, one of them a Dependabot action bump that tripped its pinned `upload-artifact` SHA), and
`install guidance does not hard-code a release tarball version` (2 runs). Keep what each enforces;
change how the coverage one checks it.

**Not worth a PR (M):**

- *Caches and setup.* `bun install` on Linux is under 3 s. Windows is 26 s, and caching would save
  perhaps 15 s (E). `npm install -g` is 4 s. Typecheck (already TypeScript 7) and Lint are 3 s each.
- *Dropping Windows lint and typecheck.* About 7 s.
- *A shared CLI bundle across tests.* 15 test files rebuild `cli.ts`, but `Bun.build` takes 99–177 ms.
- *`NODE_COMPILE_CACHE`.* No measurable change to CLI start-up.
- *Dropping pure-logic files on Windows.* 320 files take 79 s of 548 s. All Windows-only failures in
  the record were in OS-touching files, so this is defensible, but it saves only 14% for a new
  allow-list. Shards do better.
- *Package matrix.* Not on the critical path. Each leg attests a platform the release claims.

## Which tests are excess

Whole-suite candidates are few. The 170 non-spawning files with zero unique lines total 57 s, and the
largest are protocol and behaviour tests that belong on the keep list, so a coverage-driven sweep
would save little and would remove real assertions. 148 of those have some in-process coverage: 739
tests, 18,836 lines of test code, 45 s. That is a maintenance question to take file by file, with
per-assertion review.

| Tests | Evidence | Verdict |
| --- | --- | --- |
| `src/experiments/w8-quadruped-gait-profile.test.ts` | 289 lines; test-only candidates; imports no engine code, so produces no `src/` coverage; one commit, 10 July | **Remove** |
| `src/__tests__/architecture-expansion-gate.test.ts` | 1,317 lines, 5 tests, 3.4 s, 0 unique lines; measures a closed shed/hip decision; touched by 8 commits; hashes pinned to the legacy converter. `docs/reviews/2026-09-23-helper-promotion-decisions.md` calls it "retained", and plan item R06 may revisit it | **Remove from the gate; owner confirms**, recoverable from git |
| `src/experiments/w6-*.test.ts`, `w7-*.test.ts` | 7 s; decision gates for closed VEG/MAT items; cover only their own experiment source (849 of the 860 lines) | **Remove with source** (change 7) |
| `src/__tests__/cli-render-environment.test.ts` | 5 commands × 4 modes through real CLI spawns, 16.2 s, 0 lost lines. The modes are one selection rule | **Merge:** four modes on `render`, one each on the other commands |
| `src/evaluator/authoring-diagnostic.test.ts` | 14.1 s, 31 tests, 3 unique lines; many cases repeat the worker round trip | **Make faster**, after the evaluator work |
| `src/__tests__/examples.test.ts` | 69 s, 17 unique lines | **Make faster**, changes 4 and 5 |
| `src/__tests__/packaged-save-provenance.test.ts` | 20.8 s, 9 tests; off/memory variants repeat a packaged spawn. Coverage can't see it | **Make faster:** table-drive the variants, keep the identity-failure cases. Saving not estimated |
| `coverage is measured, ratcheted, and retained` in `scripts/reliability.test.mjs` | Failed in 2 runs; pins the exact coverage command and an action SHA that Dependabot moves | **Merge:** keep thresholds, measured scope and the job's presence; drop the SHA and the full-string match |
| `src/__tests__/scene-delivery-guidance.test.ts` | Regexes over skill prose (`/regenerat/`, `/immutable/`), so a rewording fails and a wrong meaning can pass | **Remove or reduce** to the field names that are emitted |
| Literal-string asserts in `workspace-bootstrap`, `workspace-upgrade`, `workspace-adoption` | 39 text-pin tests in 14 files, 154 string asserts. Many check generated files users receive, which is behaviour | **Keep,** trim when touched |
| `scripts/tier2-dogfood.test.mjs` | 717 lines for a repo-only driver; 7 distinct failing tests, 6 of them only on Windows | **Keep**: it found true platform defects. Revisit if the driver is retired |

Failure history gives context: only about 23 of the 507 test files fired in the retained window (57
distinct tests), which is ordinary for a gate and is no case against the rest.

## Tests that look excessive but must stay

Together the boundary files named here take about 25 s of the 451 s, so there is little to gain by
touching them.

| Group | Files | Why |
| --- | --- | --- |
| Sandbox and isolation | `evaluator/isolation.test.ts`, `isolation-adversarial`, `production-boundary`, `isolated-validator`, `subprocess*`, `csg-sandbox`, `assembly-sandbox`, `sandbox-three-bridge`, `agent/providers-isolation`, `discovery/service-adversarial`, `texture-resolver-boundary` | Model-authored code runs here. A regression is a security failure and no other test would show it |
| Protocol and wire | `evaluator/protocol`, `requirements-protocol`, `mcp-conformance`, `mcp-parity`, `mcp-errors`, `mcp-startup`, `mcp-cancellation`, `mcp-server.smoke`, `openrouter-conformance`, `openrouter-reasoning-wire` | Zero unique lines for several, on purpose: they assert wire shape, not code reach |
| Registry and result contract | `tools/__tests__/registry-contract`, `operation-contract`, `operation-registry`, `mcp-manifest`, `result-contract`, `discovery/catalog-schema`, `query-schema`, `qa/registry` | `AGENTS.md` names the registry as the single source of truth, and both skins depend on these. `result-contract`'s 6.3 s test is the one guard on output limits |
| Package and `dist/` identity | `runtime-build-identity`, `installed-runtime-identity`, `mcp-bundle`, `package-contents`, `views/__tests__/renderer-id-package`, `build-runtime`, `scripts/peer-ranges`, `package-overrides`, `verify-package-receipt`, `smoke-sdk-types` | Committed bundles and published contents can't be checked any other way. `peer-ranges` fired correctly on Dependabot PRs |
| Gate on the gate | `scripts/check-coverage`, `check-toolchain`, `check-skills`, `reliability` (`every CI job blocks`, `every command the agent guide tells you to run exists`, `committed runtime bundle records the version`) | Each comment records a past silent failure. Keep these; only the brittle pins above change |
| Determinism | 65 test files mention byte stability or reproducibility, e.g. `material-presets`, `qa/vegetation-corpus`, `views/__tests__/views` | Required by the no-`Date.now()` rule. Cheap and hard to replace |
| Render service lifecycle | `render-service-lifecycle`, `render-service-hardening`, `render-service-host`, `cli-service-lifecycle`, `renderer-auth-integration`, `renderer-refresh`, `render-service-fixture-lifecycle` | Pin the one-service-per-machine rules in `AGENTS.md`. Stabilise the flaky case, don't delete it |
| Real-defect regressions | `texture-sharing`, `asset-cli-texture-sharing` (#287), `qa/structural-coverage` (#289), `views/__tests__/glb` (#292), `texture-atlas-uv-column` (#293), `evaluator/source-budget`, `subprocess-pipe-close` (#299), `material-advice` (#176), `uv-projection`, `profile` (#178), `geometry-composition-regression`, `visibility-regression` | Each maps to a filed defect. A regression test can have zero unique lines and still be the only assert of what the defect was |
| Windows-found paths | `workspace-bootstrap`, `workspace-upgrade`, `service-cli`, `assets`, Windows resolution cases | 10 of 33 runs with test failures failed only on Windows, in real path, shell and process code. This is the argument for keeping the Windows leg at full strength |
| Exporter-specific | `community-exporter`, `exporter-*`, `rig-export`, `geometry-export-contract`, `runtime-three-*` | These are what would replace a narrower exporter pass |

Skips are platform-conditional and not hiding anything: 3 Windows-only tests on Linux, 2 POSIX-only
tests on Windows.

## Cyclomatic complexity

7,020 functions, sum of cyclomatic complexity 29,969, median 2, p90 10, p99 37. The two ESLint
variants agree to within 4 functions at every threshold, so dispatch switches are not the cause.

| Threshold | Cyclomatic | in `src/` | Cognitive (Biome) |
| ---: | ---: | ---: | ---: |
| > 15 | 367 | 339 | 472 |
| > 25 | 154 | 136 | 242 |
| > 30 | 114 | 103 | 179 |
| > 50 | 43 | 39 | 80 |
| > 75 | 14 | 11 | 29 |
| > 100 | 4 | 3 | 13 |

The ratio of cognitive to cyclomatic separates the two kinds of function well. A flat validator
scores below about 1, and a nested orchestrator scores 1.3 or more.

### Worth refactoring

Ranked on complexity and on commits to the file since 1 September. "CC" is cyclomatic, "Cog" cognitive.

| Function | CC | Cog | Lines | Commits | Why |
| --- | ---: | ---: | ---: | ---: | --- |
| `assetMain`, `src/asset-cli.ts:91` | 192 | 255 | 592 | 16 | Flag parsing and every subcommand in one function, the worst and among the busiest. Split per subcommand with a declarative flag table. Well covered by CLI tests |
| `runRequirementsSceneQa`, `src/qa/requirements-run.ts:125` | 120 | 255 | 274 | 6 | Deep nesting, ratio 2.13. Split into one pure check per requirement |
| `renderSceneToGLB`, `src/render.ts:1758` | 88 | 104 | 367 | 24 | High churn, carries the exporter branch |
| `createWorkspace`, `scripts/create-workspace.mjs:639` | 95 | 116 | 240 | 18 | Plus `upgradeWorkspace` (39, 60). `AGENTS.md` requires these to stay aligned with skills, so they change often |
| `buildNode`, `src/views/glb.ts:627` | 68 | 182 | 244 | 7 | Worst nesting, ratio 2.68 |
| `runMain` and `emit`, `src/cli.ts:767`, `:309` | 62, 62 | 76, 70 | 134, 183 | 22 | Changed with every CLI feature |
| `setupProject`, `scripts/workspace-project.mjs:117` | 111 | 168 | 269 | 2 | Bad, but low churn: do when touched |
| `projectMain`, `src/project-cli.ts:155` | 64 | 113 | 186 | 4 | Same treatment as `assetMain` |
| `inspectAtlasScene`, `src/qa/atlas.ts:75` | 156 | 232 | 526 | 2 | Very long, rarely changed: do when touched |

Refactoring moves branches rather than removing them, so the realistic gain is in the worst function
(for example `assetMain` from 192 to under 40) and not in the total. `src/tools/registry.ts` has seven of
the top 25 hotspots (`runRenderViews` 58 and 55, 33 commits), but the other session is working there,
so it waits. Hold `decodeEvaluatorResultV2` and `src/local-runtime.ts` for the same reason.

### Legitimately long: leave

- **Exhaustive validators and normalisers** (ratio under about 1.2): `decodeEvaluatorResultV2` 96/54,
  `createAssetIntentV1` 81/57, `normalizeVfxIntent` 69/47, `normalizeArchitectureIntent` 55/38,
  `assertCalibrationPromotion` 57/42, `validateRequirementsQaReport` 49/43,
  `validateRenderServiceHealth` 39/23, `releaseMetadataProblems` 38. Flat by nature, and splitting them
  hides the checklist.
- **Geometry algorithms with low churn:** `projectUV` 82, `repeatAlongCurve` 79, `simplifyGeometry` 75,
  `subdivide` 64, `prepareUnwrap` 61, `buildLoft` 39, `deform` 48. Each is one algorithm, and byte-level
  output makes a refactor risky for little gain.
- **Argument parsers in repo tools:** `parseArgs` in `scripts/tier2-dogfood.mjs` 59/83.

### Should a lint threshold be added?

**Yes, using Biome's `noExcessiveCognitiveComplexity`, starting at `maxAllowedComplexity: 100`.**

- It needs no new dependency and adds under 1 s. Biome has no cyclomatic rule, and adding ESLint for one
  isn't worth a second linter.
- 100 flags 13 functions, all orchestrators: `assetMain`, `runRequirementsSceneQa`, `inspectAtlasScene`,
  `buildNode`, `setupProject`, `replicateAssembly`, `repeatAlongCurve`, `createWorkspace`, `projectMain`,
  the `geometry-export.ts:198` arrow function, `simplifyGeometry`, `inspectDelivery`, `renderSceneToGLB`.
  Each gets an explicit `biome-ignore` naming the debt, in keeping with this repo's zero-baseline lint.
- No validator is flagged, because they are flat, so no carve-outs are needed.
- Ratchet to 75 (29 functions) and then 50 (80) as the list shrinks. **Don't use the default of 15**: 472
  suppressions would be noise and teach people to ignore the rule.
- `repeatAlongCurve` and `simplifyGeometry` would stay suppressed indefinitely under the advice above, which
  is acceptable.

## Suggested PR order

Each is small and can stop at any point.

1. **Exporter job behind an aggregator** (change 1). Update `REQUIRED_CHECKS`. Fixes the stale "about two
   minutes" comment on the Windows job while there. Largest gain, no coverage risk.
2. **Windows shards behind the same aggregator pattern** (change 2).
3. **Retire closed experiment gates** (change 7, W8 first as it needs no source change). Rebuild `dist/`, and
   record the new verdict. Owner confirms the shed/hip gate.
4. **Corpus subset for Windows and the exporter pass** (change 4), then decide on change 5.
5. **Test-pin cleanup** (change 11) and the render-environment merge (change 8).
6. **Biome complexity limit at 100** (change 13).
7. **Decide on the narrower exporter pass** (change 3), with the 7-week record in front of the owner. Only
   this one and the path filter (change 6) change what the gate sees.
8. **Refactors, one per PR, starting with `assetMain`.** Then `cli.ts` and `render.ts` once the other session
   finishes. Change 9 follows the evaluator work.
9. **CLI start-up spike** (change 10), which may also help users.

Expected wall time: 936 s now, about 610 s after PR 1, about 490 s after PR 2, about 440 s if the corpus moves
out (D/E). Coverage stays serial, so about 7 minutes is the floor without further test work.

## Other things noticed

- `AGENTS.md` credits the ratchet to `bunfig.toml`; it lives in `coverage-thresholds.json` and
  `scripts/check-coverage.mjs`.
- `coverage-thresholds.json` records a 12 September baseline (95.39 / 92.59) against today's 95.47 / 93.00.
- `bun --coverage-dir` is silently overridden by `coverageDir` in `bunfig.toml`.
- `tsconfig.json` doesn't include `scripts/`, so repo tools aren't typechecked.
- `render-service/package.json` lists test files by name, so a new one doesn't run until added.
