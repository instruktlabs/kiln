import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageFiles } from '@kiln-scenes/scene-kit/staging';
import { NOTICES, verifyPack } from '../../../../site/scripts/scene-pack.mjs';
import { describeFinding, scanFiles } from '../../../../site/scripts/private-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const xRoot = resolve(here, '../../../../..');

function workspace(envName, rel) {
  if (process.env[envName]) return resolve(process.env[envName]);
  const candidate = resolve(xRoot, rel);
  if (!existsSync(join(candidate, 'assets', 'kiln'))) throw new Error(`${envName} is unset and ${rel} has no assets/kiln beside this checkout`);
  return candidate;
}

const roots = {
  cathedral: workspace('KILN_CATHEDRAL_ROOT', join('kiln-text-to-3d-run', 'cathedral')),
  'cathedral-square': workspace('KILN_TOWN_KIT_ROOT', join('kiln-text-to-3d-run', 'cathedral-square')),
  'cathedral-crucifix': workspace('KILN_CRUCIFIX_ROOT', join('kiln-text-to-3d-run', 'cathedral-crucifix')),
};
const manifest = JSON.parse(readFileSync(join(pkg, 'ASSET-MANIFEST.json'), 'utf8'));
const { release } = manifest;
if (!/^cs[1-9][0-9]*$/.test(release)) throw new Error('Invalid Cathedral Square pack release');
const files = [];
const models = [];
for (const asset of manifest.assets) {
  const root = roots[asset.workspace];
  if (!root) throw new Error(`No workspace for ${asset.id}`);
  const from = join(root, 'assets', 'kiln', asset.assetId, 'revisions', asset.revisionId, 'asset.glb');
  if (!existsSync(from)) throw new Error(`Missing saved revision for ${asset.id}`);
  const bytes = readFileSync(from);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== asset.bytes || sha256 !== asset.sha256) throw new Error(`${asset.id} does not match ASSET-MANIFEST.json (${bytes.length} bytes, ${sha256})`);
  const to = `models/${asset.id}.glb`;
  files.push({ from, to, sha256 });
  models.push({ id: asset.id, to });
}
const publicDir = join(pkg, 'standalone', 'public');
const out = join(publicDir, 'assets');
mkdirSync(publicDir, { recursive: true });
copyFileSync(join(pkg, 'THIRD-PARTY-NOTICES.txt'), join(publicDir, NOTICES));
const staged = stageFiles({ id: 'cathedral-square', release, three: '0.187.0', out, force: true, models, data: {}, files });
const inventory = await verifyPack(out, join(publicDir, NOTICES));
const scan = await scanFiles(out, { files: ['pack.json', 'SHA256SUMS', ...inventory.paths], label: `cathedral-square/${release}/` });
const noticesScan = await scanFiles(publicDir, { files: [NOTICES] });
const findings = [...scan.findings, ...noticesScan.findings];
if (findings.length) throw new Error(findings.slice(0, 8).map(describeFinding).join('\n'));
const record = {
  schema: 'kiln.scene-pack/1',
  id: inventory.id,
  release: inventory.release,
  three: inventory.three,
  source: 'packages/cathedral-square/standalone/public',
  base: `/scene-packs/${inventory.id}/${inventory.release}/`,
  sealedFiles: inventory.sealedFiles,
  sealedBytes: inventory.sealedBytes,
  totalFiles: inventory.totalFiles,
  totalBytes: inventory.totalBytes,
  packJsonSha256: inventory.packJsonSha256,
  sha256sumsSha256: inventory.sha256sumsSha256,
  noticesSha256: inventory.noticesSha256,
};
writeFileSync(join(pkg, 'scene-pack.fragment.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ staged, id: record.id, release: record.release, three: record.three, sealedFiles: record.sealedFiles, totalBytes: record.totalBytes, packJsonSha256: record.packJsonSha256 }, null, 2));
