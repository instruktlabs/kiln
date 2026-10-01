// SPDX-License-Identifier: MIT
// Count-based FF3 floor-transport comparison. No wall-clock performance measurement is made here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFab, DAY_MS, FAB_DATA, SANITY_BAND, sanityVerdict, windowMetrics } from '../src/sim/index';

const out = fileURLToPath(new URL('../evidence/sim-spec/ff3-floor', import.meta.url));
const records = [];
for (const seed of [1, 2, 3]) {
  const cases = [];
  for (const enabled of [false, true]) {
    const data = { ...FAB_DATA, config: { ...FAB_DATA.config, floorTransport: { ...FAB_DATA.config.floorTransport!, enabled } } };
    const fab = createFab({ seed, data });
    fab.step(60 * DAY_MS);
    const metrics = windowMetrics(fab.sim, 30, 60);
    cases.push({ enabled, metrics, originalD43Verdict: sanityVerdict(metrics), hash: fab.hash(), floor: fab.sim.S.floor,
      eventCounts: Object.fromEntries(Object.entries(fab.sim.eventCounts).filter(([k]) => k.startsWith('floor'))),
      conservation: { released: fab.sim.S.nextLot - 1, shipped: fab.sim.S.stats.shipped, present: fab.sim.S.lots.length } });
  }
  records.push({ seed, cases });
  console.log(`seed ${seed}: ${JSON.stringify(cases.map(c => ({ enabled: c.enabled, metrics: c.metrics, delivered: c.floor.delivered, collected: c.floor.collected, byStation: c.floor.completedByStation, byCarrier: c.floor.completedByCarrier })))}`);
}
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'comparison.json'), JSON.stringify({ schema: 'foundry-floor.floor-transport-comparison/1',
  note: 'Synthetic twin behavior comparison with the same production inputs, floor routing disabled versus enabled. No claim of physical calibration. D-43 band unchanged.',
  band: SANITY_BAND, config: FAB_DATA.config.floorTransport, records }, null, 2) + '\n');
