# Draw optimization landing (PR 1): plan of record

Status: waiting for the owner to pass the goal statement at the end of this file. Nothing below is implemented
until then. Written 2026-10-02 at 13:17 -04:00.

## Purpose

Land the draw-optimization cycle's scene work as PR 1 against `main`. It carries the owner's answers of 2 October
to the decision sweep, the gates, the timing and the dogfood run, and records corrected before the push.

The engine part (`e72b610`, the `optimize: 'full'` wiring and decisions D1-D3, D23 and D34) is not in this plan. It
is PR 2, which the 0.10.0 engine agent builds after PR #129 merges, from
`docs/reviews/2026-10-02-draw-optimization-engine-handoff.md`.

## Inputs

- **The cycle's records:** the plan `docs/plans/2026-10-01-draw-optimization-cycle.md`, the review
  `docs/reviews/2026-10-02-draw-optimization.md` and the engine handoff above.
- **Decision briefs** (ignored, `tmp/drawcalls/decisions/`): `decide-sweep.brief.md` (D15-D34 and the batch
  order), `summary.txt` (D1-D14), the `decide-*.brief.md` files, and `answers.md`, which holds the owner's answers
  in the owner's order.
- **The reversed-depth prototype:** `tmp/drawcalls/flicker/README.md`, `tmp/drawcalls/flicker/build-variant.ts` and
  `tmp/drawcalls/flicker/variants/revz2.diff` (build label `flicker-revz2`). The tablet A/B is in
  `scenes/evidence/perf/tablet-2026-10-02/tablet-revz-2026-10-02/`.
- **Pilot parity:** `tmp/drawcalls/decisions/decide-sweep/e2-samephase.ts`, the prototype of the paired audit, and
  its 17 same-phase pairs.
- **v1-readiness:** PR #129 at `966c8d6` is open. It shares no file with this branch.

## Owner decisions (2026-10-02, 12:53-13:08 -04:00)

The owner took the recommended option on every question.

### The rules

- **D16, the tablet bar.** p95 at most 33.3 ms and D-41 stay the gate. Adopting a change on the tablet also needs:
  - the share of frames within one refresh not to fall by more than 1 point in 3 of 3 pairs;
  - busy × clock not to rise by more than 3% in 3 of 3 pairs.

  A miss needs the owner's explicit acceptance. The timing runner reports the Mali clock and busy × clock.
- **D18, thin lines.** The thin-line budget becomes part of B-06 for every scene: at most 100 pixels over 32 levels
  beyond the repeat capture, per 1280×720 view. It is defined in this repository. `compareParityImages` gains the
  check and all three parity tools use it. The accepted residuals are ratified:
  - golden arrival, 74 px;
  - day span, 52 px;
  - low shore reflections, 21-35 px.
- **D17, re-baselines.** A change that an owner decision adopts re-records its scene's count baseline in the same
  commit. The commit records provenance (build, commit, views, backends) and adds a one-line DECISIONS note naming
  the decision.
- **D20, the Farm pilot.** Before/after parity gates every change. At each Farm release, a paired audit runs on
  WebGPU and on WebGL2:
  - the new build and the last accepted build are captured at the same pilot phase;
  - a view fails only where the new build fails and the accepted build passes.

  This amends D-53 and D-64. The sweep's 17 of 17 same-phase pairs are recorded as this cycle's pilot evidence.

### Golden Gate

- **D15, the skyline flicker.** Golden Gate adopts reversed depth through a scene-kit renderer option. The option is
  off by default and Golden Gate opts in. It comes with three adaptations, each with unit tests:
  - the sky is drawn first, without a depth test;
  - the reflector's oblique projection is rebuilt for reversed depth;
  - the polygon-offset sign is flipped.

  The 17 thin-line flags are accepted as corrections. The change lands in PR 1.
- **D7 and D7b are moot.** There is no tower split.
- **D5, the reflection.** The High reflection drops the traffic, including the driven car, and the fog banks, as
  WATER-SPEC says.
- **Vegetation cards** stay in the reflection. WATER-SPEC's "cards" is read as the fog cards it names at its line
  36. The reading is recorded in DECISIONS.
- **D6, the banks hook.** The fog banks get a `hidden` flag that their update respects, in its own commit.

### The Farm

- **D10:** variant A stays.
- **D8:** economy exempts the trailer from the small-caster rule: `keepSmallCasters: ['farmer', 'trailer']`.
- **D9:** the live map stays at full tier size.
- **D11 and D11b:** minimal keeps its 64 woodland cells. DECISIONS records the tablet's GPU cost as the gate's
  reason: busy × clock was +4.5% to +27.2%, higher in 12 of 12 pairs. That replaces SPEC section 15's D-03 reason.
- **D12:** no hero instancing.
- **D28:** the tractor's kinematics stay as they are.

### Tiers, scenes and backlog

- **D14:** minimal stays in every scene on the tablet. Golden Gate at economy may be revisited after the flyover
  stall is fixed.
- **D13:** the Foundry structures stay as they are.
- **D22:** the three pre-existing stalls are worked on after PR 1. The Golden Gate flyover fix comes before any
  Golden Gate tier change.
- **D25:** the R8 shadow target goes to the backlog.
- **D26:** scene-kit correctness comes soon after PR 1 (anchor names, and morph-target and `positionNode` motion
  detection).
- **D27:** Golden Gate loads `data/layout.json` at run time, after PR 1. Golden Gate's other deferred items stay in
  the backlog.
- **D33:** the next performance cycle targets GPU work: per-tree culled packing, then vegetation LOD.

### Landing

- **D1 and D4.** There are two PRs:
  - PR 1, from this plan: every `draw-optimization` commit except `e72b610`, plus the work below;
  - PR 2: the engine work, built by the engine agent after 0.10.0.
- **D30, records.** One record commit:
  - fixes the six known errors;
  - adds the pilot result and this decision round;
  - replaces the two private links with "private report page (owner)" in every file that is pushed.

  The records ride PR 1. The private page gets the same corrections.
- **D29, the site.** The Farm ships at the next site build, after the site's own Farm build check. Golden Gate and
  Foundry Floor are resealed later, in one site change, with an approved upload (D-12).
- **D19, checks.**
  - `scenes/scripts/tests` joins the portable test runner.
  - Golden Gate's count baseline is committed as JSON.
  - glb-world's staged path is fixed.
  - A release checklist runs the three live count checks and the bundle ceilings before any site pack.
- **D21, hub timing.** The 14 hub cells at balanced and economy, and the Golden Gate hero orbit, run before PR 1.
  They run on the final PR 1 build, only after a recorded quiet check. At 13:03 another project's CI held the hub,
  and its fans were audible. Per-frame GPU timestamps are added only if the balanced rise reproduces.
- **D24, skills.** The compose-scene corrections go in PR 1:
  - the instanced-pipeline sentence;
  - split buckets where the per-part draw order matters;
  - read mobile GPU work as busy × clock;
  - a note on depth precision over long view distances.

  The authoring and QA proposals go to the engine agent.
- **D31, dogfood.** One compose-scene dogfood run before PR 1, and the usual runs before PR 2. Both use Agy and
  OpenCode (the owner's words: "use agy and opencode for dogfood").
- **D32, scratch.** The leaked browser profiles were removed on 2 October (see the progress log). The `decide-*`,
  `review-*` and `fix-*` builds and snapshots are removed once this goal is passed. In PR 1, `launchChrome` removes
  its profile on close, with a test.
- **D20 follow-through.** The tool work comes after PR 1: the busy-port fix, a paired mode promoted from the
  prototype, and the B-07 texture-golden re-baseline (39 at every view since the prewarm pass, 41 with the shadow
  cache). PR 1's own audit uses the prototype script.

## Defaults set by the coordinator (owner may edit)

- **Tablet scope.** The D16 bar applies to this tablet, the only X-07 device measured. A higher GPU clock at the
  same frame rate counts as more GPU work.
- **No kiln-commons edits.** `kiln-commons` (SPEC, WATER-SPEC) is not edited. DECISIONS holds the in-repo
  definitions.
- **No tablet rerun for D15.** The final Golden Gate build must match `flicker-revz2` in parity at minimal and
  economy (B-06, and the thin-line count within the repeat-capture noise). A larger difference triggers a tablet A/B
  rerun under D16.
- **The landing branch.** It is `draw-optimization-landing`, cut from `origin/main`. `draw-optimization` stays
  intact as the engine agent's source for `e72b610`. If PR #129 merges before the final gates, the landing branch is
  rebased onto the new `origin/main` and the gates rerun.
- **Numbering.** New DECISIONS entries start at D-65. Answers that change nothing are listed together in one entry.
- **Dogfood sessions.**
  - They use the frozen-runtime runner in `C:/Users/Mattm/X/kiln-dogfood/v1-readiness-2026-10/tools/`
    (`make-runtime.ps1` on the landing branch, then `session.mjs`), with one compose-scene task.
  - Harnesses and models: OpenCode on Meta Muse Spark 1.3 Contributor (the owner's dogfood preference), and Agy on
    `gemini-3.8-flash-high` (the v1 cycle's Agy model), in a fresh empty Agy home.
  - Every trace is read; exit codes are not trusted.
- **Commits** stay local in logical steps until the final push step, with the usual trailer.

## Boundaries

- **Checkouts.** Never edit, stash, switch or clean `C:/Users/Mattm/X/kiln-oss` or `C:/Users/Mattm/X/kiln-v1-readiness`.
  Never edit a file that PR #129 changes. Never touch `site/` in any checkout. The site's Farm build check runs in a
  fresh clone outside both.
- **Outward actions.** No deploy, no asset upload (D-12) and no upstream posts (OD-10). Artifacts stay private.
- **Spend.** The D31 dogfood runs are the only live spend.
- **Timing** runs only on quiet hosts: the hub headed at 120 Hz after a recorded quiet check; the tablet only quiet
  and cool, with its mappings removed afterwards.
- **Push and PR** happen only as the goal's last item, and PR 1 is not merged.

## Steps

**L0, branch.**
- Cut `draw-optimization-landing` from `origin/main` and cherry-pick every `draw-optimization` commit except
  `e72b610`.
- Show that `node scripts/build-runtime.mjs all` leaves `dist/` byte-identical to its base.
- Run `check:skills`, the typecheck and lint.

**L1, decisions.** Add DECISIONS entries from D-65:
- the rules: D16, D17, D18, D20;
- Golden Gate: D15, D5, the vegetation-card reading;
- the Farm: D8, D11;
- the tiers: D14;
- one entry listing the answers that change nothing (D7, D7b, D9, D10, D12, D13, D28) and the backlog (D22, D25,
  D26, D27, D33).

**L2, scene changes, test first.**
- D15: the kit option and Golden Gate's opt-in, with the three adaptations under unit tests.
  - Parity against `draw-after` on WebGPU, with exactly the 17 accepted flags, plus WebGL2.
  - Equivalence with `flicker-revz2` at minimal and economy.
- D5: reflection content; parity, and the counts re-baselined under D17.
- D6: the banks' hidden flag.
- D8: the trailer exemption at economy, with image pairs, and counts if they move.
- D18: the thin-line check in `compareParityImages`, used by all three parity tools.
- D16: clock and busy × clock in the timing runner.
- D19:
  - the portable runner includes `scenes/scripts/tests`;
  - Golden Gate's baseline JSON is committed;
  - glb-world's staged path is fixed;
  - the release checklist is written.
- D32: `launchChrome` removes its profile on close.

**L3, skills.** Add the D24 corrections to `skills/kiln-compose-scene/references/runtime-scenes.md` (and to
`SKILL.md` if needed), then run `bun run check:skills`.

**L4, records.**
- Apply the D30 corrections to the review and the cycle plan, and add the pilot result and this decision round.
- Replace the links.
- Update the private report page.

**L5, evidence.**
- The paired pilot audit of the final Farm build against `draw-base`, on WebGPU and WebGL2, using the prototype.
- The count probe on the final builds.
- The hub timing (D21) against `draw-base`, using the commands in `tmp/drawcalls/s6/timing-full.report.md`.

**L6, gates on a quiet host.**
- Engine: typecheck, lint, test, `test:render-service`, `test:coverage` and `check:skills`.
- Scenes: typecheck, lint and test, which now includes `scripts/tests`.
- A fresh clone with `bun install --frozen-lockfile`, a byte-identical `dist/`, the site's Farm build check, and the
  bundle ceilings.

**L7, dogfood.**
- One compose-scene session each in Agy and OpenCode; read the traces.
- Fix any guidance the runs show is wrong, then rerun the affected gates.

**L8, clean-up.** Remove the `decide-*`, `review-*` and `fix-*` builds and the `scenes/.tmp/build-src` snapshots.
Keep `draw-base`, `draw-after`, `flicker-revz2`, the evidence and the reports.

**L9, PR.**
- Push `draw-optimization-landing` and open PR 1 against `main`.
- Bind it, and read its CI; do not merge.

## After PR 1 (not in this goal)

- **Engine PR 2,** by the engine agent: D1, D2 (a), D3 (a), D23 (b), D34 (a), the authoring and QA proposals, and
  dogfood in Agy and OpenCode.
- **Scenes:**
  - the D20 tool work;
  - the D22 stalls;
  - D26 correctness;
  - D27's run-time layout;
  - the D29 reseal of Golden Gate and Foundry Floor, with an approved upload;
  - the D33 GPU-work cycle.

## Progress log

- 13:17: plan written. The answers are in `tmp/drawcalls/decisions/answers.md`, and the engine handoff gained the
  owner's engine answers.
- 13:17-13:19: D32 clean-up, approved as "clean now".
  - 352 of the 356 leaked Chrome folders in `scenes/.tmp` were removed (`*-chrome-XXXXXX` profiles and Chrome's
    `chrome_chrome_BITS_*` temp folders). C: gained 13,661 MB.
  - Four `rgf-gg-*` profiles, about 1 MB in all, are left. Some of their files deny access, even to reading their
    permissions. Removing them needs an ownership or permission change, which is left to the owner.
  - No Chrome, Bun or Node process was using the worktree. No record cites a profile path.
- 13:20: the batch times in `answers.md`, this plan and the handoff were corrected from the session transcript.
  They had been stamped 2-22 minutes too late.

## Goal statement

<!-- goal:start -->
Land the draw-optimization scene work as PR 1 by following docs/plans/2026-10-02-draw-optimization-landing.md (owner answers of 2 October to sweep decisions D1-D34). Work on a new branch, draw-optimization-landing, cut from origin/main in the worktree C:/Users/Mattm/X/kiln-draw-optimization, with every draw-optimization commit except e72b610 cherry-picked (the engine modules are for the engine agent's PR 2). Never edit, stash, switch or clean C:/Users/Mattm/X/kiln-oss or C:/Users/Mattm/X/kiln-v1-readiness. Never edit a file PR #129 changes. Never touch site/, deploy, upload assets or post upstream. Artifacts stay private. The only live spend is the D31 dogfood runs.

Done when each item is shown by printed output in this conversation:
1. The landing branch rebuilds dist/ byte-identical to its base.
2. Golden Gate has a scene-kit reversed-depth option, off by default, that Golden Gate opts into, with the sky, reflector and polygon-offset adaptations under unit tests. Its High reflection drops traffic and fog banks, and the banks get a hidden flag. Parity against draw-after passes B-06 on WebGPU and WebGL2, with thin-line flags limited to the 17 accepted ones, and it matches flicker-revz2 at minimal and economy.
3. The Farm's economy tier keeps the trailer's small shadows, shown as image pairs.
4. compareParityImages enforces the thin-line budget for all three parity tools. The timing runner reports clock and busy x clock. scenes/scripts/tests runs in bun run test. Golden Gate's count baseline JSON is committed. glb-world's budget test runs. launchChrome removes its profile on close, with a test.
5. scenes/DECISIONS.md records the 2 October answers from D-65 onward, with re-baselines in the commits that move counts.
6. kiln-compose-scene carries the D24 corrections, and bun run check:skills passes.
7. The records are corrected per D30, with no private links, and the private report page is updated.
8. Evidence: a paired pilot audit of the final Farm build on WebGPU and WebGL2, and the 14 hub cells plus the Golden Gate hero orbit on a quiet hub (headed, 120 Hz, load recorded).
9. Final gates on a quiet host pass: engine typecheck, lint, test, test:render-service, test:coverage and check:skills; scenes typecheck, lint and test; a fresh clone with bun install --frozen-lockfile; the site's Farm build check in that clone; and the bundle ceilings.
10. One compose-scene dogfood session each in Agy and OpenCode, with the traces read and the findings fixed or recorded.
11. The decide, review and fix scratch builds are removed; draw-base, draw-after, flicker-revz2, the evidence and the reports are kept.
12. The landing branch is pushed and PR 1 is opened against main, with its CI read. It is not merged.

Stop and report, rather than treat as unmet, when:
- a gate or budget test fails in a way that needs an owner decision;
- a change would touch a PR #129 file;
- parity differs beyond the accepted flags;
- the hub or tablet is not quiet (report the pending timing with commands instead of waiting);
- a dogfood session fails for harness or account reasons;
- CI fails for reasons outside this branch.
<!-- goal:end -->
