---
name: kiln-batch-dispatch
description: Run requested Kiln asset batches or compare coding-agent harnesses and models in isolated workspaces. Use for repeatable trials, source-reference workflow checks, and distinguishing provider, tool, and asset-quality failures.
license: MIT
metadata:
  kiln-workflow: workspace
---

# Run comparable asset trials

Use the user's requested harness and exact model identifier. Verify what the provider actually ran; do not silently substitute a default or older model.

1. Create a fresh workspace for each candidate using [clean-room evaluation](references/clean-room-evaluation.md). A named Kiln project is optional; use matching project configuration only when the trial calls for it. Keep the engine checkout and example collection outside the agent's task context.
2. Give each candidate the same brief, installed skills, image budget, time limit, and starting asset where applicable. Record inherited tools, instructions, memory, and permissions.
3. Verify tool access and actual image delivery with one small run before dispatching a batch. Model vision support and harness image forwarding are separate checks.
4. Exercise the whole revision loop: render source once, use the returned `programRef`, read a source window, edit an exact anchor, inspect a part, and export the same revision. Check that later calls do not resend the program and that unrelated source survives the edit.
5. Retain the brief, exact model, harness version, requested and independently confirmed thinking effort, transcript, source, images, package/skill hashes, and outcome. Leave unexposed effort unknown. Keep the original author and each later refiner distinct. Rebuild the saved source independently of the agent's success claim.
6. Review shapes under consistent cameras and lighting. Separate provider outages or quota limits, harness failures, tool/schema failures, engine failures, and visual quality. An interrupted run is not a completed asset.

After a shared package or skill change, rerun the affected workflow with the final candidate. A successful earlier revision does not validate later instructions. Record manual repairs separately from model output.

Adding a reviewed asset to a gallery is a separate task. Do it only when that addition is requested, retaining model provenance and later edits.
