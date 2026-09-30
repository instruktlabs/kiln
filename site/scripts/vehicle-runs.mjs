import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRequest } from './bridge-requests.mjs';
import { writeJson } from './media-pins.mjs';
import { VEHICLE_RUNS } from './vehicles-spec.mjs';

/**
 * The runs that saved the delivered vehicle revisions, as the site records them: what each run asked for (model,
 * reasoning effort, harness), the receipt and invocation that say so pinned by SHA-256, and how the run ended.
 * A run's requested effort stays separate from any independent confirmation; none of these receipts confirms one.
 * One run (`sonnet-vehicles-b/first-retry1`) is 'failed': it reached its spending cap after it had saved all three
 * vehicles, which is why it is accepted here with its stop reason recorded rather than hidden.
 *
 *   node scripts/vehicle-runs.mjs --commons C:/Users/Mattm/X/kiln-commons
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VEHICLE_RUNS_FILE = join(SITE, 'src/data/vehicle-runs.json');

export async function vehicleRuns(commons, runs = VEHICLE_RUNS) {
  const records = [];
  for (const run of runs) records.push({ ...(await runRequest(commons, run, { statuses: ['completed', 'failed'], outcome: true })), label: run.label });
  return records;
}

async function main(argv = process.argv.slice(2)) {
  const commons = argv.includes('--commons') ? argv[argv.indexOf('--commons') + 1] : undefined;
  if (!commons) throw new Error('Usage: node scripts/vehicle-runs.mjs --commons DIR');
  const records = await vehicleRuns(resolve(commons));
  await writeJson(VEHICLE_RUNS_FILE, records);
  for (const record of records) {
    console.log(`${record.author}/${record.stage}: ${record.requestedModel} effort ${record.requestedEffort} via ${record.harness} ${record.harnessVersion}, confirmed ${record.confirmedEffort}, ${record.status} (${record.stop}), ${record.startedAt} to ${record.endedAt}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
