// Stage the Seed Town pack: the kit files as their saved revisions export them with carried
// sizes (`kiln export --profile runtime --carry-shapes`), and one data file with each kit's defaults
// and size ranges from its saved declaration.
//
//   bun packages/seed-town/scripts/stage-pack.mjs          verify against ASSET-MANIFEST.json and stage
//   bun packages/seed-town/scripts/stage-pack.mjs --pin    rewrite ASSET-MANIFEST.json from the workspace, then stage
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageFiles } from '@kiln-scenes/scene-kit/staging';
import { NOTICES, verifyPack } from '../../../../site/scripts/scene-pack.mjs';
import { describeFinding, scanFiles } from '../../../../site/scripts/private-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const xRoot = resolve(here, '../../../../..');
const pin = process.argv.includes('--pin');

const KITS = ['facade-bay', 'ground-bay', 'roof', 'paving', 'junction', 'street-lamp', 'signage', 'street-furniture', 'tree'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));

function workspace() {
  if (process.env.KILN_SEED_TOWN_ROOT) return resolve(process.env.KILN_SEED_TOWN_ROOT);
  // A worktree sits deeper than a checkout, so look beside each ancestor.
  for (let dir = xRoot, i = 0; i < 6; i++, dir = dirname(dir)) {
    const candidate = join(dir, 'kiln-seed-street');
    if (existsSync(join(candidate, 'assets', 'kiln'))) return candidate;
  }
  throw new Error('KILN_SEED_TOWN_ROOT is unset and no kiln-seed-street workspace with assets/kiln was found beside this checkout');
}

const root = workspace();
const carriedDir = process.env.KILN_SEED_TOWN_CARRIED ? resolve(process.env.KILN_SEED_TOWN_CARRIED) : join(root, 'out', 'carried');
const manifestPath = join(pkg, 'ASSET-MANIFEST.json');

/** One kit as the workspace holds it: the carried runtime file, its sidecar and the revision it came from. */
function readKit(id) {
  const glbPath = join(carriedDir, `${id}.glb`), sidecarPath = join(carriedDir, `${id}.kiln-metadata.json`);
  if (!existsSync(glbPath) || !existsSync(sidecarPath)) throw new Error(`Missing carried export for ${id}: run kiln export <asset> <revision> --format glb --profile runtime --carry-shapes`);
  const bytes = readFileSync(glbPath), sidecar = json(sidecarPath);
  const { assetId, revisionId } = sidecar.source ?? {};
  if (!assetId || !revisionId) throw new Error(`Sidecar for ${id} names no saved revision`);
  const revisionDir = join(root, 'assets', 'kiln', assetId, 'revisions', revisionId);
  const saved = json(join(revisionDir, 'manifest.json'));
  const savedGlb = sha256(readFileSync(join(revisionDir, 'asset.glb')));
  if (`sha256:${savedGlb}` !== sidecar.source.glbSha256) throw new Error(`${id}: the carried export was not made from the saved revision ${revisionId}`);
  const rebuild = Object.entries(sidecar.params?.shapes ?? {}).filter(([, shape]) => shape.mode !== 'morph').map(([name]) => name);
  if (rebuild.length) throw new Error(`${id}: sizes not carried by the export: ${rebuild.join(', ')}`);
  const declared = saved.build?.params?.params;
  if (!declared) throw new Error(`${id}: the saved revision records no parameter declaration`);
  const defaults = {}, sizes = {};
  for (const [name, spec] of Object.entries(declared)) {
    defaults[name] = spec.default;
    if (spec.type === 'range' || spec.type === 'int') sizes[name] = { min: spec.min, default: spec.default, max: spec.max };
  }
  for (const name of Object.keys(sizes)) if (!sidecar.params?.shapes?.[name]) throw new Error(`${id}: size ${name} is declared but the export does not carry it`);
  return {
    glbPath, bytes, declaration: { defaults, sizes },
    entry: {
      id, name: saved.name, collectionId: 'project', collectionQualifiedId: `project/${assetId}`, assetId, revisionId,
      savedGlbSha256: savedGlb, sourceSha256: String(sidecar.source.sourceSha256).replace(/^sha256:/, ''),
      sha256: sha256(bytes), bytes: bytes.length,
    },
  };
}

const kits = KITS.map(readKit);
let manifest;
if (pin) {
  const previous = existsSync(manifestPath) ? json(manifestPath) : {};
  manifest = {
    schema: 'kiln.seed-town-manifest/1',
    collectionId: 'project',
    note: 'Exact pins of the town kits. sha256 and bytes are those of the runtime file the saved revision exports with carried sizes; savedGlbSha256 is the saved revision itself. Collection project is workspace storage.',
    release: previous.release ?? 'st1',
    assets: kits.map(kit => kit.entry),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} else {
  manifest = json(manifestPath);
  for (const kit of kits) {
    const pinned = manifest.assets.find(asset => asset.id === kit.entry.id);
    if (!pinned) throw new Error(`ASSET-MANIFEST.json does not list ${kit.entry.id}`);
    for (const key of ['assetId', 'revisionId', 'savedGlbSha256', 'sourceSha256', 'sha256', 'bytes']) {
      if (pinned[key] !== kit.entry[key]) throw new Error(`${kit.entry.id} does not match ASSET-MANIFEST.json (${key}: ${kit.entry[key]})`);
    }
  }
  if (manifest.assets.length !== kits.length) throw new Error('ASSET-MANIFEST.json lists a kit the scene does not use');
}
const { release } = manifest;
if (!/^st[1-9][0-9]*$/.test(release)) throw new Error('Invalid Seed Town pack release');

const scratch = mkdtempSync(join(tmpdir(), 'seed-town-stage-'));
try {
  const declarations = { schema: 'kiln.seed-town-kits/1', kits: Object.fromEntries(kits.map(kit => [kit.entry.id, kit.declaration])) };
  const declarationsPath = join(scratch, 'kits.json');
  writeFileSync(declarationsPath, `${JSON.stringify(declarations)}\n`);
  const files = [
    ...kits.map(kit => ({ from: kit.glbPath, to: `models/${kit.entry.id}.glb`, sha256: kit.entry.sha256 })),
    { from: declarationsPath, to: 'data/kits.json' },
  ];
  const models = kits.map(kit => ({ id: kit.entry.id, to: `models/${kit.entry.id}.glb` }));
  const publicDir = join(pkg, 'standalone', 'public');
  const out = join(publicDir, 'assets');
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(join(pkg, 'THIRD-PARTY-NOTICES.txt'), join(publicDir, NOTICES));
  const staged = stageFiles({ id: 'seed-town', release, three: '0.187.0', out, force: true, models, data: { kits: 'data/kits.json' }, files });
  const inventory = await verifyPack(out, join(publicDir, NOTICES));
  const scan = await scanFiles(out, { files: ['pack.json', 'SHA256SUMS', ...inventory.paths], label: `seed-town/${release}/` });
  const noticesScan = await scanFiles(publicDir, { files: [NOTICES] });
  const findings = [...scan.findings, ...noticesScan.findings];
  if (findings.length) throw new Error(findings.slice(0, 8).map(describeFinding).join('\n'));
  const record = {
    schema: 'kiln.scene-pack/1',
    id: inventory.id,
    release: inventory.release,
    three: inventory.three,
    source: 'packages/seed-town/standalone/public',
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
  console.log(JSON.stringify({ staged, pinned: pin, id: record.id, release: record.release, three: record.three, sealedFiles: record.sealedFiles, totalBytes: record.totalBytes, packJsonSha256: record.packJsonSha256 }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
