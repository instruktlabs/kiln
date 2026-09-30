# Project foundation performance qualification

The owner stopped competing Cog work and authorized performance testing. Browser sampling used the clean-installed `f649e5b906b7922065048a75e723d17c5b97c49338b85c65fe40aa0ce700804d` candidate; the final optimized candidate has identical viewer bytes. Live Review baseline and optimized measurements are complete. These technical fixtures qualify the local foundation at the measured conditions, not Farm art, a game budget, or release readiness.

## Conditions

- AMD Ryzen 7 3700X, 8 cores / 16 logical processors, approximately 32 GB RAM; NVIDIA RTX 3070, driver `32.0.16.1074`.
- AMD Ryzen High Performance power profile; Windows reports the display at 143 Hz. Browser receipts identify Chrome 153 / WebGL 2 / ANGLE D3D11. Native capture is a separate Dawn D3D12 path.
- Four leftover Vite servers from the paused Vietnam War Sim work were stopped after verifying their executable/script identities. No project files or agent state were removed. This task's unused viewers were closed. The shared renderer's ownership and lifecycle were not changed.
- A one-second CPU / device-wide NVIDIA monitor ran throughout. Desktop, instrumentation and normal dashboard polling remained active. Device-wide memory and utilization are not browser-specific allocation or GPU execution measurements.
- Browser and native capture lanes ran sequentially. No regression suites, package builds or model providers ran during sampling.

## Browser results

Three fresh-page loads and three paired warm three-second measurements were collected for each fixture. A fresh page creates a new renderer/parser; HTTP, OS and GPU caches were not purged. Load timing starts at GLB parsing and ends after the first render submission, excluding download and presentation completion. Steady frame samples begin after loaded state and do not measure immediate load-transition pacing.

All twelve receipts use the same 782×530 CSS canvas, **625×424 drawing buffer**, DPR 0.8, Studio lighting, Rest pose and default Orbit framing. The browser document was 2400×1350 CSS despite a requested 1920×1080 viewport override; browser zoom was not independently verified. This is a dashboard panel measurement, not a full-screen 1080p game test.

| Fixture | Exact GLB bytes | Draws / triangles | Fresh load times (ms) | Median load (ms) | Frame interval p50 / p95 |
| --- | ---: | --- | --- | ---: | --- |
| Textured cube | 17,916 | 1 / 12 | 27.9, 19.6, 27.0 | 27.0 | 6.9 / 7.0 ms |
| Representative scene | 15,790,356 | 321 / 97,292 | 216.8, 228.7, 204.5 | 216.8 | 6.9 / 7.0 ms |

The first cube sample's maximum interval was 13.9 ms; the remaining maxima were 7.1–7.2 ms. All twelve p95 values were 7.0 ms. Pacing is consistent with the display refresh limit; it does not establish GPU headroom or execution time. The representative scene reports three geometry objects, 48 texture objects and two programs. Those counts are not GPU memory bytes.

Ambient rows within the actual sampling windows show median CPU utilization 11.526% (range 4.504–25.543%), GPU temperature 47–53°C, graphics clocks 435–720 MHz and device power 28.35–52.74 W. These totals include the workload. There were 34 monitor rows within sample windows, 167 across the overall span, maximum consecutive gap 1.072 seconds and no gap over two seconds. Sampling windows are inferred from receipt completion and duration, with command-dispatch bounds retained; they are not synchronized GPU traces.

The small and representative GLB hashes are respectively `sha256:0f069f14642225800ed64a62fab60b386cc00bae6a033294a7104e7d65706f52` and `sha256:96faf9d7e9848f185054f1f5aeda5570612d1c5b8a3ff1351af00dee343dd84c`. These are existing technical fixtures, not newly authored Farm assets. No repeatable spike justified adding a DevTools diagnostic trace. Browser canvas and the temporary viewport override were closed/reset afterward.

Evidence: [browser report](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/controlled-performance/browser-report.md), [per-sample windows, hashes and ambient statistics](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/controlled-performance/summary.json), and [raw receipts](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/controlled-performance/browser-samples.json).

## Observer measurement attempts

The first harness attempt supplied the cube with a newer project material lock instead of its source's exact retained material revision. Evaluation rejected the mismatch before GPU admission. The second attempt corrected immutable dependencies and produced exact, full-material GPU artifacts, but correctly failed its warm-cache assertion: this `--omit=peer` installation could not fingerprint a missing required transitive peer and conservatively used per-process memory rather than disk reuse. Neither attempt supplies an accepted off/on performance comparison. Their receipts remain separate from the final protocol.

The installed disk-cache finding must not be hidden by installing a dependency, weakening cache identity, changing renderer deadlines, or relabeling cold evaluations as warm. CLI startup/evaluation cost and the separately instrumented API lane require explicit cache-state labels.

## Completed observer baseline

Run 03 completed 48 measured operations and four warmups on the installed `f649` candidate, from `2026-09-27T01:28:02.276Z` to `01:30:46.894Z`. For each CLI/API × small/representative × empty/near-200 condition, three off/on pairs alternated order. Empty-start journals accumulated three observed records. Near-limit journals began with 198 independently copied, explicitly synthetic artifact-only records (four large, 194 small, 69,962,150 retained bytes), then reached the 200-operation retention limit. No seed generation or file copying overlapped timing.

**Pin-seed correction:** the harness set two `operation.pinned` metadata flags but omitted the separate authoritative six-byte `pinned` files. These journals therefore had **zero effective pins**, not the two claimed in their original manifest. Raw receipts are retained unchanged; timing, artifact and counter evidence remain valid for that unpinned workload. They do not qualify the intended pin-retention condition. A separate corrected `f649` near-limit baseline creates both real markers, asserts validated pin counts and pin-ID survival before/after, and is required for direct comparison with the optimized candidate. Its initial retained byte total is 69,962,162.

The CLI uses the exact installed Node bundle and includes startup, source evaluation, GPU capture, PNG output and implicit journal flush. Its configured disk cache conservatively falls back to process memory because the qualification installation deliberately omitted peers: `manifold-3d` declares required `esbuild-wasm ^0.27.3`, which is absent. The CLI therefore evaluates each operation cold; startup includes the fingerprint attempt. This is not a warmed CLI baseline. The API lane is a separate Node instrumentation bundle built from that same installed source, with a warmed in-memory evaluator cache and disabled capture cache. Its return and explicit flush are timed separately.

| Condition | CLI median paired addition, on minus off | API median on-flush | Unchanged snapshot median |
| --- | ---: | ---: | ---: |
| Small, near 200 records | 1,470.5 ms | 1,780.0 ms | approximately 283–295 ms across lanes |
| Representative, near 200 records | 1,189.9 ms | 1,230.5 ms | approximately 283–295 ms across lanes |
| Small, empty-start | within run-to-run variation | 32.6 ms | approximately 6–7 ms |
| Representative, empty-start | small positive addition | 27.4 ms | approximately 6–7 ms |

API tool-return paired differences were small and inconsistent in sign; they do not establish a latency improvement from observation. The retained journal cost is distinct from that return. Source inspection found three full validation scans per publication (cleanup, retention records, cleanup), including repeated per-record file checks. This justified removing redundant scans within the existing writer lock and using bounded concurrent fresh reads, while retaining cross-process freshness and all validation.

Every measured API operation made one evaluator request, zero actual evaluations after warmup, and one GPU-port call: totals **24 / 0 / 24**. Both API warmups independently recorded **1 / 1 / 1**. All 24 observed operations across the two lanes retained exactly the PNG returned to the caller. Off operations added no journal entry; on operations added one, including at retention. No CPU fallback or extra image capture supplied the result.

There were 154 ambient rows in this window, CPU median 12.95% (7.26–28.22%). Device GPU utilization ranged 0–62% and includes actual capture work; it is not background-only utilization. Retained byte totals are logical file sizes, not physical disk write traffic. Snapshot timing covers domain reads and JSON serialization, not HTTP or browser DOM work. Three pairs per condition establish a useful local comparison, not statistical guarantees.

Evidence: [baseline report](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run03/report.md), [paired statistics](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run03/summary.json), [all operations and counters](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run03/results.json), and [installed-cache diagnosis](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run03/installed-cache-diagnostic.json).

## Corrected baseline with real pins

Run 04 repeated only the affected near-limit conditions on the same installed `f649` candidate: 24 measured operations, four normal warmups, 198 starting records, 69,962,162 logical bytes and two actual pin marker files. Every operation checked `snapshot().retention.pinned === 2` and the continued presence of the original pinned operation IDs, including after reaching 200 records. All artifact, capture-hash and call-count checks passed. Run 03's empty-start conditions remain valid and separate.

| Workload, near 200 with two pins | CLI median paired addition | API median on-flush | Unchanged snapshot medians across lanes |
| --- | ---: | ---: | ---: |
| Small | 1,517.4 ms | 1,827.9 ms | 286.8–318.9 ms |
| Representative | 1,629.4 ms | 1,213.6 ms | 286.8–318.9 ms |

The window was `01:37:22.073–01:39:30.579Z`. CPU utilization had median 17.9%, range 7.4–53.0%; device GPU utilization had median 23%, range 5–64%, including the workload. One representative CLI pair took 14.49 seconds on / 10.96 seconds off and coincided with the CPU peak. It remains in the data; the monitor does not establish its cause. Cross-window ambient differences limit precision of an old/new comparison, even though the workload and pair order are fixed.

Evidence: [corrected report](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run04-pinned-baseline/report.md), [raw results](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run04-pinned-baseline/results.json), and [pin survival proof](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run04-pinned-baseline/pin-proof.json).

## Optimization and final qualification

The resulting journal change is deliberately local to filesystem observation: at most eight fresh record reads overlap; their results and errors retain directory order. The writer reuses the validated pre-publication scan only while holding its existing cross-process lock. Orphan deletion refreshes the affected directory's byte accounting; post-publication cleanup checks only the operation just written. No persistent index, watcher, cross-call snapshot cache, renderer policy or cache-identity exception was introduced.

The optimized candidate is `sha256:698ab98937d32b15fc36b686fd36ee2488e6074ffaed23178d4d69f8e0865ac7`, source hash `d6586b7a629a6f08be29efd215af0bb4b99b903c7a487bc3f5b70b8f49d09c04`. Focused journal proof passes 19 tests / 81 assertions, including bounded concurrency, deterministic malformed-record reporting, orphan-byte release with actual external pins, and visibility of another instance's changes after an unchanged poll. Full regression/coverage passes 2,782 tests, two skips, zero failures, with 95.16% functions and 92.29% lines. The same final tarball passes all 17 package and 28 clean-installed workflow checks. Its viewer app, styles and both HTML files are byte-identical to the browser-measured installation.

The final run used that exact installed candidate and tarball, after setup and a settled interval. It completed **48 measured operations, four warmups and 48 polling reads**, without an assertion failure. All 24 observed operations retained the exact returned artifact and PNG. Each workload produced one PNG hash across its 24 CLI/API operations. All 24 near-limit operations preserved the same two real pin IDs. Measured API counts were again **24 evaluator requests / zero actual evaluations after warmup / 24 GPU-port calls**; both API warmups were independently **1 / 1 / 1**.

Near-limit comparisons below use the corrected run 04 baseline with actual pins, not the earlier unpinned seed. Values are descriptive medians in milliseconds; CLI differences are paired on-minus-off, while flush and polling are timed separately.

| Measurement | Small: before → optimized | Representative: before → optimized |
| --- | ---: | ---: |
| CLI added latency | 1,517.4 → 281.2 | 1,629.4 → 238.3 |
| API explicit on-flush | 1,827.9 → 245.4 | 1,213.6 → 140.8 |
| Unchanged snapshot, CLI workspace | 288.2 → 106.4 | 295.4 → 104.0 |
| Unchanged snapshot, API workspace | 286.8 → 105.8 | 318.9 → 112.3 |

The final window was `2026-09-27T01:50:28.605–01:53:01.404Z`. Its 144 ambient rows show CPU median 16.67%, range 8.92–31.43%, and device GPU median 23%, range 19–62%; those include the workload. The separate settled pre-run interval had CPU average 4.28%, range 1.20–8.49%, and a 210 MHz / approximately 26 W GPU. Keep the old/new ambient differences and all outliers visible: this is a local comparison of the same workload, not a guaranteed speedup for every host or a GPU-throughput claim.

Evidence: [final report](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run05-final/report.md), [raw operations](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run05-final/results.json), [before/after statistics](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run05-final/comparison.json), [ambient context](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run05-final/ambient-summary.json), and [effective pin proof](C:/Users/Mattm/.codex/visualizations/2026/09/26/01a0dfa7-ea0e-73a3-8bc4-743fb44d3d1b/kiln-commons-research/performance/observer-qualification-run05-final/pin-proof.json). All sampling is finished and task monitors/viewers are stopped; other work can resume.

## Limits and next use

The peer-omitting installation's conservative disk-cache refusal remains explicit. No peer was installed to alter this comparison, and ordinary installations with that peer present require their own startup/cache measurement. Cache identity policy and renderer connection/deadline policy were not changed by the journal optimization.

Browser measurement does not qualify Rome, mobile hardware, another engine, full-screen rendering, animation-heavy scenes or the future Farm proving scene. Use the Farm brief's numerical targets as hypotheses until its real assets and assembled scene can be measured. Artistic approval, importer compatibility and public package/Commons release remain separate decisions.
