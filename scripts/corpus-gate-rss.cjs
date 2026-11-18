// Preloaded into each corpus-gate evaluator worker (`node --require`): on exit, record the
// worker's peak resident set in KiB where the gate asked, so the run can report peak memory
// without instrumenting the engine. A worker killed at its deadline writes nothing.
const target = process.env.KILN_CORPUS_GATE_RSS_FILE;
if (target)
  process.on('exit', () => {
    try {
      require('node:fs').writeFileSync(target, String(process.resourceUsage().maxRSS));
    } catch {
      /* Measurement only. */
    }
  });
