import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectVehicleGlb, loaderDraws } from './vehicle-glb.mjs';
import { storedZip } from './stage-vehicles.mjs';
import { verifyArchive } from './mirror-core.mjs';

// A preserved local intake. It does not run the historical r2 authoring pipeline or publish files.
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commons = process.env.KILN_COMMONS_DIR;
if (!commons) throw new Error('Set KILN_COMMONS_DIR to the authored workspace');
const review = join(commons, 'engine-work/local-v09-review/revision2-20260930');
const author = join(commons, 'showcase/authors/codex-review2-asset-repairs');
const mirror = process.env.KILN_ASSET_MIRROR ?? join(site, '.cache/round-4/mirror');
const output = join(review, 'vehicles-runtime');
await mkdir(join(review, 'inputs'), { recursive: true });
const baselinePath = join(review, 'inputs/vehicles-r2.json');
try { await copyFile(join(site, 'src/data/packs/vehicles.json'), baselinePath, 1); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
if (baseline.release !== 'r2') throw new Error('Expected the preserved r2 baseline');
const receiptPath = join(author, 'delivery/VEHICLE-REPAIR-RECEIPT.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const verify = (bytes, pin, label) => {
  if (bytes.length !== pin.bytes || hash(bytes) !== pin.sha256.replace(/^sha256:/, '')) throw new Error(`Pin mismatch: ${label}`);
  return bytes;
};
const receiptBytes = await readFile(receiptPath);
if (hash(receiptBytes) !== '2e11c6c3d59778b2c82d74e26e3178b20a0eea798e5fd69afc1e02f5eba3557b') throw new Error('Repair receipt changed');
const receipt = JSON.parse(receiptBytes);
const members = {};
const assets = [];
const measurements = {};
for (const prior of baseline.assets) {
  const repair = receipt.assets.find((asset) => asset.id === prior.id);
  if (!repair || repair.inputParentRevision !== prior.revisionId) throw new Error(`Parent mismatch: ${prior.id}`);
  const changed = repair.status === 'repaired-child';
  const glb = changed
    ? verify(await readFile(join(author, repair.files['asset.glb'].path)), repair.files['asset.glb'], prior.id)
    : verify(await readFile(join(mirror, prior.runtimeDownload.path)), prior.runtimeDownload, prior.id);
  const measured = inspectVehicleGlb(glb);
  if (measured.form !== 'MSFT_lod' || measured.extensionsRequired.length) throw new Error(`Runtime LOD contract failed: ${prior.id}`);
  const loaded = await loaderDraws(glb);
  if (loaded.triangles !== measured.drawnByPlainLoader.triangles) throw new Error(`Default loader mismatch: ${prior.id}`);
  const manifest = changed ? JSON.parse(await readFile(join(author, repair.files['manifest.json'].path), 'utf8')) : null;
  if (changed && (manifest.revisionId !== repair.outputRevision || manifest.parentRevision !== prior.revisionId)) throw new Error(`Saved identity mismatch: ${prior.id}`);
  let licence = verify(await readFile(join(mirror, prior.licence.path)), prior.licence, `${prior.id} licence`);
  if (changed) licence = Buffer.from(licence.toString('utf8')
    .replace(`Saved revision: ${prior.revisionId}`, `Saved revision: ${repair.outputRevision}`)
    .replace(/^Delivered GLB SHA-256:.*$/m, `Delivered GLB SHA-256: ${hash(glb)} (exact saved export with optional MSFT_lod)`)
    + `\nPreserved parent revision: ${prior.revisionId}\nLocal review 2: rear lamp fit corrected; owner review of this child is pending.\n`);
  const model = `models/${prior.slug}.glb`;
  const licenceMember = `licenses/${prior.slug}.ASSET-LICENSE.txt`;
  members[model] = glb;
  members[licenceMember] = licence;
  assets.push({
    slug: prior.slug, name: prior.name, assetId: prior.assetId,
    revisionId: changed ? repair.outputRevision : prior.revisionId,
    parentRevision: changed ? prior.revisionId : prior.parentRevision,
    model, licence: licenceMember, changed, ownerAccepted: changed ? false : prior.review.ownerAccepted,
    tiers: measured.tiers.map(({ tier, triangles, bodyTriangles, wheelTriangles }) => ({ tier, triangles, bodyTriangles, wheelTriangles })),
  });
  measurements[prior.slug] = measured;
}
const files = Object.fromEntries(Object.entries(members).map(([path, bytes]) => [path, { bytes: bytes.length, sha256: hash(bytes) }]));
const inventory = { schemaVersion: 1, pack: baseline.name, profile: 'runtime', release: 'r3-local-review', license: 'CC0-1.0', assets, files };
members['delivery.json'] = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`);
const zip = storedZip(members, new Date('2026-10-01T00:00:00Z'));
verifyArchive(zip, 'delivery');
for (const [path, bytes] of Object.entries(members)) {
  await mkdir(dirname(join(output, path)), { recursive: true });
  await writeFile(join(output, path), bytes);
}
await writeFile(join(output, 'generic-road-vehicles-runtime.zip'), zip);
await writeFile(join(output, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);
await writeFile(join(output, 'intake.json'), `${JSON.stringify({ schema: 'kiln.review2.vehicles-intake/1', receiptSha256: hash(receiptBytes), deliverySha256: hash(members['delivery.json']), archive: { bytes: zip.length, sha256: hash(zip) }, assets: assets.map(({ slug, revisionId, changed }) => ({ slug, revisionId, changed })) }, null, 2)}\n`);
console.log(JSON.stringify({ output, release: inventory.release, assets: assets.length, changed: assets.filter((asset) => asset.changed).length, archiveSha256: hash(zip) }));
