/**
 * Audit the gallery images that live in R2 rather than in git history.
 *
 * The counterpart to `scripts/upload-posters.mjs`: that script publishes and
 * refuses to void a receipt, this one checks afterwards that what is published
 * is still there and still the attested bytes. Both exist because the images
 * moved out of `examples/renders/` -- 117 MB of history for files no tool reads
 * -- while their provenance stayed behind. The 83 receipts in that directory are
 * the manifest: one per poster, each recording the sha256 of the exact PNG the
 * renderer emitted.
 *
 * Deliberately standalone rather than folded into `site/scripts/verify-assets.mjs`,
 * which reads `site/public/assets/index.json` and so cannot run until the whole
 * gallery build has succeeded. This check has no such precondition, and it is the
 * only place that can honestly assert an image exists: a local manifest would
 * only record that an upload once happened, and would pass while the bucket
 * returns 404.
 *
 * Existence is checked for every object. Hashes are checked wherever a receipt
 * exists, which is every poster but `tidal-observatory` -- an archive entry kept
 * for the docs that predates the receipts -- and none of the animations, since
 * GIFs are assembled from frames and were never attested individually.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { exampleArchivePath } from './example-archive.mjs';

const RECEIPTS = exampleArchivePath('examples/renders');
const BASE = process.env.KILN_POSTER_BASE ?? 'https://assets.kilnstudio.tools/renders';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Images published without a receipt, named individually so the gap is visible. */
const UNATTESTED = [
  'tidal-observatory.png',
  'carousel.gif',
  'orrery.gif',
  'radio-telescope.gif',
  'robot-arm.gif',
];

const entries = await readdir(RECEIPTS);
const attested = entries.filter((f) => f.endsWith('.json')).sort();
if (attested.length === 0) throw new Error(`No poster receipts found in ${RECEIPTS}`);

const failures = [];
let hashed = 0;
let present = 0;

for (const file of [...attested.map((f) => f.replace(/\.json$/, '.png')), ...UNATTESTED]) {
  const url = `${BASE}/${file}`;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    failures.push(`${file}: unreachable (${err instanceof Error ? err.message : String(err)})`);
    continue;
  }
  if (!response.ok) {
    failures.push(`${file}: HTTP ${response.status} from ${url}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  present += 1;

  const expected = /\.gif$/.test(file) ? '.gif' : '.png';
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith(expected === '.gif' ? 'image/gif' : 'image/png'))
    failures.push(`${file}: served as ${type || 'no content-type'}`);

  if (UNATTESTED.includes(file)) continue;
  const receipt = JSON.parse(
    await readFile(join(RECEIPTS, file.replace(/\.png$/, '.json')), 'utf8'),
  );
  if (!receipt.imageHash) {
    failures.push(`${file}: receipt records no imageHash`);
    continue;
  }
  const digest = sha(bytes);
  if (digest !== receipt.imageHash) {
    failures.push(
      `${file}: published bytes differ from the receipt.\n  receipt: ${receipt.imageHash}\n  served:  ${digest}`,
    );
    continue;
  }
  hashed += 1;
}

if (failures.length > 0) {
  console.error(`${failures.length} poster check${failures.length === 1 ? '' : 's'} failed:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(
  `Verified ${present} published images at ${BASE}: ${hashed} byte-identical to their receipts, ${UNATTESTED.length} present but unattested (${UNATTESTED.join(', ')}).`,
);
