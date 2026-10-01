// Seal the exact inputs only after proving the stored warm start and every hourly hash against a fresh replay.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFab, DAY_MS, FAB_DATA } from '../src/sim/index';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pin = (path: string) => {
  const bytes = readFileSync(resolve(pkg, path));
  return { path, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const seed = FAB_DATA.config.seeds.default;
const warmPath = `data/warm/seed-${seed}.json`;
const hashesPath = 'evidence/sim/hashes.json';
const recorded = JSON.parse(readFileSync(resolve(pkg, hashesPath), 'utf8')) as { seed: number; hashes: string[]; day30Hash: string };
const fab = createFab({ seed });
fab.step(30 * DAY_MS);
if (recorded.seed !== seed || JSON.stringify(fab.hourlyHashes()) !== JSON.stringify(recorded.hashes) || fab.hash() !== recorded.day30Hash) throw new Error('fresh replay differs from recorded hourly hashes');
if (fab.snapshot() !== readFileSync(resolve(pkg, warmPath), 'utf8')) throw new Error('fresh replay differs from stored warm bytes');
const receipt = {
  schema: 'foundry-floor.evidence.warm-pins/1', seed, hours: 720, day30Hash: fab.hash(),
  warm: pin(warmPath),
  inputs: ['data/layout.json', 'data/rail-graph.json', 'data/route.json', 'data/tools.json', 'data/sim-config.json'].map(pin),
  hashes: pin(hashesPath),
  verification: { freshReplay: true, byteIdenticalWarmSnapshot: true, hourlyHashesMatched: recorded.hashes.length },
};
writeFileSync(resolve(pkg, 'evidence/sim/ff3-warm-pins.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
