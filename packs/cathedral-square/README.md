# Cathedral Square asset delivery

The selected 22 revisions are in [the scene inventory](../../scenes/packages/cathedral-square/ASSET-MANIFEST.json). The gallery, the scene and the runtime downloads use the same saved GLBs. The editable downloads wrap standard Kiln revision ZIPs with the licence and third-party notices.

[Rights and texture provenance](rights.json) lists the 22 selected revisions and their exact model and source hashes. It binds the owner's CC0 designation to those model and editable source files. The owner granted CC0 to the extent of their rights. The six Poly Haven texture families retain their recorded source terms. Saved revisions retain their original model and harness attribution. The cathedral was originally authored with Claude Opus 5.5 in Claude Code and the selected repair records GPT-6 Astra in Codex. The three dormer repairs retain Claude Opus 5.5 parent records and credit GPT-6.1 Sol in Codex on the selected revisions. Gemini 4 Argon (High) in Antigravity authored the original crucifix. The selected child corrects two strokes in the raised INRI and records GPT-6.1 Sol in Codex.

## Prepare the delivery

From `site/`, stage the scene's sealed pack first, then generate the downloads from the three local authoring stores:

```sh
bun scripts/stage-cathedral-gallery.mjs --workspace-root /path/to/authoring-workspaces --mirror .localdata/cathedral-release
bun scripts/rig-posters.mjs cathedral-square --mirror .localdata/cathedral-release --service http://127.0.0.1:8000 --engine /path/to/compatible-kiln
```

The mirror contains the 22 runtime GLBs, 22 editable asset downloads, the two aggregate packs and the exact-revision poster inputs. The stager records download pins and an upload list without uploading files. The poster tool pins its own inputs in the site mirror manifest. The scene input archive is staged separately from the same pack.

Restore the selected editable revisions from the staged mirror:

```sh
node scripts/hydrate-asset-sources.mjs --group cathedral-square --mirror .localdata/cathedral-release --output /path/to/review-workspace
```

Each revision keeps its parent reference. The delivery contains the listed selected revisions. The owner's designation here applies to those revisions. The separate baked cathedral shown on the historical text-to-3d page retains its existing revision.
