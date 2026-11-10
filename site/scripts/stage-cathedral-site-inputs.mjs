import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deterministicZip } from './asset-delivery.mjs';
import { hashBytes } from './mirror-core.mjs';
import { verifyPack, packRecord } from './scene-pack.mjs';
import { checkedSceneArchive } from './scene-inputs.mjs';
import { describeFinding, scanFiles } from './private-data.mjs';

const SITE = resolve(import.meta.dirname, '..');
const INPUT_SOURCE = '.cache/site-inputs/cathedral-square/standalone';

/** Package only the verified runtime data, never an author's workspace or unrelated build files. */
export async function cathedralInputArchive(source) {
  const inventory = await verifyPack(join(source, 'assets'), join(source, 'THIRD-PARTY-NOTICES.txt'));
  if (inventory.id !== 'cathedral-square') throw new Error('Expected Cathedral Square pack');
  const scans = await Promise.all([
    scanFiles(join(source, 'assets'), { files: ['pack.json', 'SHA256SUMS', ...inventory.paths] }),
    scanFiles(source, { files: ['THIRD-PARTY-NOTICES.txt'] }),
  ]);
  const findings = scans.flatMap(scan => scan.findings);
  if (findings.length) throw new Error(findings.map(describeFinding).join('\n'));
  const members = {};
  for (const path of ['pack.json', 'SHA256SUMS', ...inventory.paths].sort()) {
    members[`assets/${path}`] = new Uint8Array(await readFile(join(source, 'assets', path)));
  }
  members['THIRD-PARTY-NOTICES.txt'] = new Uint8Array(await readFile(join(source, 'THIRD-PARTY-NOTICES.txt')));
  const bytes = deterministicZip(members);
  const record = { id: inventory.id, release: inventory.release, path: `scene-inputs/cathedral-square/${inventory.release}/cathedral-square.zip`, bytes: bytes.length, sha256: hashBytes(bytes), packJsonSha256: inventory.packJsonSha256 };
  checkedSceneArchive(bytes, record);
  return { bytes, record, inventory };
}

export async function stageCathedralSiteInputs({ site = SITE, source = resolve(site, '../scenes/packages/cathedral-square/standalone/public'), mirror = resolve(site, '.localdata/cathedral-release') } = {}) {
  const result = await cathedralInputArchive(source);
  const target = join(mirror, result.record.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, result.bytes);
  const inputsPath = join(site, 'src/data/scene-inputs.json');
  const inputs = JSON.parse(await readFile(inputsPath, 'utf8'));
  inputs.files = [...inputs.files.filter(record => record.id !== result.record.id), result.record];
  await writeFile(inputsPath, `${JSON.stringify(inputs, null, 2)}\n`);
  const catalogPath = join(site, 'src/data/scene-packs.json');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  catalog[result.record.id] = packRecord(result.inventory, { ...catalog[result.record.id], source: INPUT_SOURCE });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { target, ...result.record };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const option = flag => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : undefined; };
  console.log(JSON.stringify(await stageCathedralSiteInputs({ source: option('--source'), mirror: option('--mirror') }), null, 2));
}
