import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRuntimePayload } from './served-runtime.mjs';

/**
 * What the site serves for each staged scene, hashed and compared with what the site's own records say.
 *
 *   bun scripts/verify-scene-served.mjs <site-url> [dist-directory]
 *
 * Run it with bun: the D-15 ceilings are measured with Bun's zlib, and the gzip figure has to use the same method.
 * For each scene it fetches `runtime.json` and the runtime chunk over HTTP and checks bytes, gzip bytes, SHA-256, the
 * ceiling and the single copy of three, react, react-dom and @react-three/fiber; then it re-hashes every file the
 * staged pack's `SHA256SUMS` seals, in the directory the site is served from, and compares `pack.json`,
 * `SHA256SUMS` and the notices with the records in `src/data/scene-packs.json`. When
 * `KILN_SITE_SCENE_PACK_DIR_<SCENE>` names a scene's frozen build, the served chunk must be that build's chunk byte
 * for byte (Golden Gate's chunk is its authors' own build, staged unchanged). Exit 1 on any mismatch.
 */
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2];
const distribution = resolve(process.argv[3] ?? join(SITE, 'dist'));
if (!base) throw new Error('Usage: bun scripts/verify-scene-served.mjs <site-url> [dist-directory]');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const records = JSON.parse(readFileSync(join(SITE, 'src/data/scene-packs.json'), 'utf8'));
let failures = 0;
const line = (ok, text) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok    ' : 'FAILED'} ${text}`);
};
const get = async (path) => {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const envName = (id) => `KILN_SITE_SCENE_PACK_DIR_${id.toUpperCase().replace(/-/g, '_')}`;

for (const [id, record] of Object.entries(records)) {
  const runtime = JSON.parse((await get(`/scene-runtime/${id}/runtime.json`)).toString('utf8'));
  const payload = await verifyRuntimePayload(runtime, get);
  console.log(`${id}: ${payload.files} served chunks verified, ${payload.bytes} B, ${payload.gzipBytes} B gzip, entry sha256 ${runtime.sha256}`);
  const initial = runtime.initialLoad ?? payload;
  line(runtime.ceiling.withinCeiling && initial.bytes <= runtime.ceiling.bytes && initial.gzipBytes <= runtime.ceiling.gzipBytes, `${id} ${runtime.initialLoad ? 'verified initial campus closure' : 'aggregate payload'} inside the ${runtime.ceiling.decision} ceiling`);
  line(runtime.three.facade === true && Object.values(runtime.three.copies).every((copies) => copies.length === 1), `${id} one copy each of three, react, react-dom and @react-three/fiber`);

  const pack = join(distribution, 'scene-packs', id, record.release);
  const sums = readFileSync(join(pack, 'SHA256SUMS'), 'utf8').split(/\r?\n/).filter(Boolean).map((row) => /^([0-9a-f]{64}) [ *](.+)$/.exec(row));
  line(sums.every(Boolean), `${id} SHA256SUMS parses (${sums.length} entries)`);
  const bad = sums.filter((match) => match && (!existsSync(join(pack, match[2])) || sha(readFileSync(join(pack, match[2]))) !== match[1]));
  line(bad.length === 0 && sums.length === record.sealedFiles, `${id} ${record.release}: ${sums.length - bad.length} of ${sums.length} sealed files match SHA256SUMS; the record says ${record.sealedFiles}`);
  line(sha(readFileSync(join(pack, 'pack.json'))) === record.packJsonSha256, `${id} pack.json sha256 equals the record`);
  line(sha(readFileSync(join(pack, 'SHA256SUMS'))) === record.sha256sumsSha256, `${id} SHA256SUMS sha256 equals the record`);
  line(sha(readFileSync(join(pack, 'THIRD-PARTY-NOTICES.txt'))) === record.noticesSha256, `${id} THIRD-PARTY-NOTICES.txt sha256 equals the record`);
  for (const match of sums.filter(Boolean)) {
    line(sha(await get(`${record.base}${match[2]}`)) === match[1], `${id} served ${match[2]} equals its seal`);
  }
  for (const file of ['pack.json', 'SHA256SUMS', 'THIRD-PARTY-NOTICES.txt']) {
    line(sha(await get(`${record.base}${file}`)) === sha(readFileSync(join(pack, file))), `${id} served ${file} equals the staged record`);
  }

  if (process.env[envName(id)] && runtime.kind === 'frame') {
    for (const chunk of runtime.chunks ?? [runtime]) {
      const frozen = join(process.env[envName(id)], 'assets', chunk.file);
      line(existsSync(frozen) && sha(readFileSync(frozen)) === chunk.sha256, `${id} served ${chunk.file} is byte for byte the frozen build`);
    }
  }
}
console.log(failures ? `${failures} FAILED` : `All scene hash checks passed (${Object.keys(records).length} scenes).`);
process.exitCode = failures ? 1 : 0;
