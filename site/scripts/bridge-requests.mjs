import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashBytes } from './mirror-core.mjs';
import { writeJson } from './media-pins.mjs';

/**
 * The runs that authored the Golden Gate Bridge revisions, as the site records them: what each run asked for
 * (model, reasoning effort, harness) and which receipt and invocation say so, pinned by SHA-256. A run's
 * requested effort stays separate from any independent confirmation; none of these receipts confirms one.
 *
 *   node scripts/bridge-requests.mjs --commons C:/Users/Mattm/X/kiln-commons
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `stage` is the id the lineage file refers to; `dir` is the run folder under `showcase/runs/<author>/`. */
export const BRIDGE_RUNS = [
  { stage: 'first', author: 'astra-golden-gate', dir: 'first' },
  { stage: 'review-1', author: 'astra-golden-gate', dir: 'review-1' },
  { stage: 'review-2', author: 'astra-golden-gate', dir: 'review-2' },
  { stage: 'fix-up-1', author: 'sonnet-gg-bridge-fix', dir: 'first' },
  { stage: 'fix-review-1', author: 'sonnet-gg-bridge-fix', dir: 'review-1' },
  { stage: 'fix-review-2', author: 'sonnet-gg-bridge-fix', dir: 'review-2' },
  { stage: 'fix-review-3', author: 'sonnet-gg-bridge-fix', dir: 'review-3' },
];

/**
 * One run as the site records it. `statuses` are the receipt statuses the caller accepts (a run that saved its
 * work and then stopped at a spending cap is 'failed'); `outcome` adds the status and the harness's stop
 * reason to the record, for callers that show them.
 */
export async function runRequest(commons, run, { statuses = ['completed'], outcome = false } = {}) {
  const base = `showcase/runs/${run.author}/${run.dir}`;
  const read = async (name) => {
    const bytes = await readFile(join(commons, base, name));
    return { bytes, json: JSON.parse(bytes.toString('utf8')) };
  };
  const receipt = await read('receipt.json');
  const invocation = await read('invocation.json');
  const r = receipt.json;
  if (!statuses.includes(r.status)) throw new Error(`${base} is ${r.status}, not ${statuses.length === 1 && statuses[0] === 'completed' ? 'a completed run' : `a ${statuses.join(' or ')} run`}`);
  for (const key of ['requestedModel', 'requestedEffort', 'harness', 'harnessVersion']) {
    if (r[key] !== invocation.json[key]) throw new Error(`${base}: receipt and invocation disagree on ${key}`);
  }
  const reported = r.reportedModels ?? [];
  return {
    stage: run.stage,
    author: run.author,
    requestedModel: r.requestedModel,
    requestedEffort: r.requestedEffort,
    harness: r.harness,
    harnessVersion: r.harnessVersion,
    confirmedEffort: null,
    confirmation: 'Requested in receipt and invocation; effective reasoning effort not independently confirmed.',
    modelReported: reported.length ? reported : null,
    ...(outcome ? { status: r.status, stop: r.result?.subtype ?? null } : {}),
    startedAt: r.startedAt,
    endedAt: r.lastEventAt,
    source: {
      receipt: `${base}/receipt.json`,
      receiptSha256: hashBytes(receipt.bytes),
      invocation: `${base}/invocation.json`,
      invocationSha256: hashBytes(invocation.bytes),
    },
  };
}

export const bridgeRequest = (commons, run) => runRequest(commons, run);

export async function bridgeRequests(commons, runs = BRIDGE_RUNS) {
  const requests = [];
  for (const run of runs) requests.push(await bridgeRequest(commons, run));
  return requests;
}

async function main(argv = process.argv.slice(2)) {
  const commons = argv.includes('--commons') ? argv[argv.indexOf('--commons') + 1] : undefined;
  if (!commons) throw new Error('Usage: node scripts/bridge-requests.mjs --commons DIR');
  const requests = await bridgeRequests(resolve(commons));
  await writeJson(join(SITE, 'src/data/bridge-requests.json'), requests);
  for (const request of requests) console.log(`${request.stage}: ${request.requestedModel} effort ${request.requestedEffort} via ${request.harness} ${request.harnessVersion}, confirmed ${request.confirmedEffort}, receipt ${request.source.receiptSha256.slice(0, 12)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
