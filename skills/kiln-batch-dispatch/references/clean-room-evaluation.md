# Clean-room evaluation

Workspace creation, harness choice and verifying that the tools came up are covered by the `kiln-setup-workspace` skill; this file covers only what an evaluation adds on top. Create the workspace with `--skills batch` so this workflow is present in the candidate, and use a separate fresh workspace per candidate.

Keep evaluation notes and output in the workspace. Do not give the model the engine implementation or prior examples unless that is the comparison being tested.

## What isolation means

A clean workspace limits task context. It is not an operating-system sandbox or a requirement to create a Kiln project. Record inherited global instructions, tools, memory, authentication, and filesystem permissions without copying secrets into receipts. Do not alter user-wide configuration to make a run appear isolated. Use a separate Hermes profile when required by its launcher; give headless harnesses absolute workspace and artifact paths.

Use a new workspace when testing changed skills. `--repair` repairs generated integration files while preserving existing copied skills; it is not a way to refresh a candidate silently.

Hash the package and every installed skill resource recursively, not only `SKILL.md`. Keep the exact model identifier and harness version beside the run. When a provider reports a resolved model identity, retain it as well.

## A small but complete trial

Use a brief with three recognizable parts and one requested revision. Save the first `programRef`; render, source-view, source-edit, and inspect by reference. Export the revised source and GLB. Compare unrelated source text before and after, and verify the changed part in a targeted image. A source handle proves revision reuse; it does not by itself prove a render-cache hit.

Check the actual transcript for tool images received by the model. Metadata that labels a model as vision-capable is insufficient evidence. Keep camera framing and image count comparable between candidates.

Repository scripts such as `scripts/dispatch-asset.mjs`, `scripts/check-vision.mjs`, and harness smoke commands are optional developer tools in the engine checkout, not files promised in an installed authoring project. Provider-backed runs can incur usage. Use them only within the requested run and budget.

Report completed, interrupted, and failed trials separately. Keep provider availability, image forwarding, tool correctness, source reuse, exported geometry, and visual quality as distinct findings. Do not turn a quota interruption into an engine failure or count an unreviewed partial image as a completed result.

Read the final native terminal event and process result when classifying a run.
A recovered stream error can precede successful completion; retain the error
without overriding the later result. A live or unknown process is not terminal
because a poll timed out. Inspect saved artifacts independently of either claim.

For Antigravity, use the generated `node agy.mjs` launcher. Print mode disables
automatic slash-command and skill expansion. In the brief, require the project skill
copies and `kiln_workspace` server; use absolute task-file paths. Before asset work,
call that server's `kiln_discover` with `{ capabilities: true }` and retain the
runtime/store receipt. Global plugins may still be available: audit which server
and skill paths were actually used, rather than trusting the final message.
