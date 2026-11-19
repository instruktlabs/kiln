# Opaque sandbox rejections, reproduced and classified (2026-11-18)

Follow-up 6 of [the authored source study](2026-11-18-authored-source-study.md),
[#415](https://github.com/instruktlabs/kiln/issues/415). Nothing here changes what the sandbox
allows, and no GLB changes: only the text of an error does.

## Method

**M** The study's counting scripts were throwaway and are gone, so the exact eight calls are not
recoverable. This follow-up instead takes every distinct program that the maintainer dogfood
transcripts before 13 November 2026 show ending in the generic rejection (the sentence plus the
fixed engine paragraph, no named cause): 12 programs in 6 sessions. The two sessions dated 18
November fall after the study window and are left out. The programs were read from the retained
`.kiln/programs` stores beside those runs, never copied into the repository, and each was run
against this branch's parent (`origin/main` at `a721e54c`) with the default subprocess evaluator
(`KILN_RENDER=cpu`). The cause is the error class and engine-written message the worker threw, or
the static rule `kiln_validate` reports, read in-process for this review only; neither is added
to a result.

## Table

| # | Session (harness) | Program | Cause found on `origin/main` | Owner |
| --- | --- | --- | --- | --- |
| 1 | followups 2026-11-13 (Claude Code) | `p_8f399377b00c` | `projectUV` refused its options object | Engine: helper precondition |
| 2 | followups 2026-11-13 (Claude Code) | `p_e924989d0993` | Not reproduced: builds | n/a |
| 3 | guidance-align 2026-11-12 (Claude Code) | `p_d240e3caa683` | `export` statement (`HAS_EXPORT`, `SYNTAX_ERROR`) | Sandbox: static check, already named by `Source check:` |
| 4 | organic-cycle 2026-10-16, boulders (author run) | `p_6ad27c054b42` | `hull` operand with 34 vertices, not whole triangles | Engine: geometry precondition |
| 5 | organic-cycle 2026-10-16, boulders (author run) | `p_f5a2d18472e1` | Not reproduced: builds | n/a |
| 6 | scenes 1.3.0 2026-10-17, coastal-yard (Antigravity) | `p_7c8d62829209` | `import` and `export` statements, `value:` keyframe key | Sandbox: static check, already named |
| 7 | scenes 1.3.0 2026-10-17, fungal-grotto (Antigravity) | `p_d1b00de1af97` | `export` statement | Sandbox: static check, already named |
| 8 | scenes 1.3.0 2026-10-17, fungal-grotto (Antigravity) | `p_640acb1d2c44` | `taperedTube` radii count differs from path points | Engine: helper precondition |
| 9 | scenes 1.3.0 2026-10-17, fungal-grotto (Antigravity) | `p_26f3aac9ce08` | Not reproduced: builds | n/a |
| 10 | scenes 1.3.0 2026-10-17, fungal-grotto (Antigravity) | `p_664c790f57af` | Not reproduced: builds | n/a |
| 11 | release 1.2.3 2026-10-13, bag (Antigravity) | `p_91c9649b6460` | `sweepProfile` scale pairs differ from path stations | Engine: helper precondition |
| 12 | release 1.2.3 2026-10-13, bag (Antigravity) | `p_33e710c0ad97` | Not reproduced: builds | n/a |

The fungal-grotto agent's run of probe programs is rows 7 to 10: one rejected program, then four
edits of it, each rejected the same way in the transcript. Rows 2, 5, 9, 10 and 12 build today, so
the rejection they showed then came from a helper or sandbox state that has since changed; they
are reported as not reproduced rather than guessed at.

Of the 12, 4 were engine-owned helper preconditions (rows 1, 4, 8, 11), 3 were static source
refusals (rows 3, 6, 7) and 5 were not reproduced. The static refusals are sandbox-owned and
already carry `Source check:` with the rule and line (`HAS_EXPORT`, `HAS_IMPORT`,
`KEYFRAME_VALUE_KEY`), added in the host after the worker's generic sentence; they stay as they
are. The generic sentence stays for any other plain `Error`.

## Decisions

Four closed causes are new. Each helper threw a plain `Error` whose text was engine-written but
could not cross the worker boundary, so it surfaced as the generic sentence. Each now throws
`AuthoringDiagnosticError` with a closed cause, keeping the same in-process message, and the
host turns the cause into fixed advice. No argument value, mesh name, helper file or stack
crosses the boundary; the tests check for that.

| Cause | Thrown by | New advice names |
| --- | --- | --- |
| `UV_PROJECTION_OPTIONS` | every `projectUV` precondition | the three projections, the accepted option keys, which apply to cylindrical only |
| `TAPERED_TUBE_ARGUMENT` | `taperedTube` path, radii and section scale checks | one radius per path point, positive and finite, and a way to derive radii from the path |
| `SWEEP_PROFILE_ARGUMENT` | `sweepProfile` and `loftProfiles` path, scale, twist, cap and up checks | path rules, scale as one pair per station, twist, cap and up rules |
| `CSG_OPERAND_MESH` | the operand checks shared by `boolUnion`, `boolDiff` and `hull` | whole triangles, finite positions, UVs, valid groups, baked skins and instances, empty groups |

Not changed, and why: the shared 2D profile outline checks (`profile requires ...`, used by
`extrudeProfile`, which already names `PROFILE_SOLID_FAILED`), the empty-result check of a
Boolean, the argument-count checks of `boolUnion`, `boolDiff` and `hull`, and the `metaballSurface`,
`catmullRomPath` and `spiralPath` checks. None appeared in these 12 programs. They stay generic
until a transcript shows one.

## Acceptance

- Table: above, 12 programs, cause found or "not reproduced".
- Each new cause has a focused test, `src/evaluator/helper-argument-diagnostic.test.ts`: it runs
  the worker handler and the real subprocess, checks the closed wire shape and the advice, and
  asserts that no source marker, argument value or helper file name appears. The tests were
  written first and failed with the generic rejection.
- The opaque path stays for everything else; `rejection-cause.test.ts` still passes unchanged.
- Corpus rebuild ([#417](https://github.com/instruktlabs/kiln/issues/417)) is unchanged. Only
  thrown error classes and advice text changed; no helper's successful path was edited, so no
  GLB changes. The existing sweep, organic, UV projection and CSG suites pass unchanged.
