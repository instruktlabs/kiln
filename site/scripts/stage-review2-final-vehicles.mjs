import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ensureVehicleWheelLod, inspectVehicleGlb, loaderDraws } from './vehicle-glb.mjs';
import { storedZip } from './stage-vehicles.mjs';
import { verifyArchive, verifyBytes } from './mirror-core.mjs';

// Explicit, preserved final intake. Input pins are recorded only after author handoffs close.
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commons = process.env.KILN_COMMONS_DIR;
if (!commons) throw new Error('Set KILN_COMMONS_DIR');
const review = join(commons, 'engine-work/local-v09-review/revision2-20260930');
const mirror = process.env.KILN_ASSET_MIRROR ?? join(site, '.cache/round-4/mirror');
const output = join(review, 'vehicles-runtime-final');
try { await access(output); throw new Error(`Refusing to overwrite preserved intake: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputs = JSON.parse(await readFile(join(review, 'inputs/vehicles-final-inputs.json'), 'utf8'));
const baselineBytes = await readFile(join(review, 'inputs/vehicles-r3.json'));
verifyBytes(baselineBytes, inputs.baseline, 'preserved r3 catalog');
const baseline = JSON.parse(baselineBytes);
if (baseline.release !== 'r3-local-review' || inputs.assets.length !== 6) throw new Error('Expected six final inputs and the r3 baseline');
for (const document of inputs.documents) verifyBytes(await readFile(document.path), document, document.path);
const members = {};
const assets = [];
const measurements = {};
for (const prior of baseline.assets) {
  const input = inputs.assets.find((item) => item.slug === prior.slug);
  if (!input) throw new Error(`Missing ${prior.slug}`);
  const readPinned = async (name) => verifyBytes(await readFile(join(input.directory, name)), input.files[name], `${prior.slug}/${name}`);
  const saved = JSON.parse(await readPinned('manifest.json'));
  if (saved.assetId !== prior.assetId || saved.revisionId !== input.revisionId || saved.revisionId === prior.revisionId) throw new Error(`Wrong saved identity: ${prior.slug}`);
  const canonical = await readPinned('asset.glb');
  const source = await readPinned('source.kiln.js');
  const preview = await readPinned('preview.png');
  for (const [name, bytes] of [['asset.glb', canonical], ['source.kiln.js', source], ['preview.png', preview]]) {
    const pin = saved.files[name];
    verifyBytes(bytes, { ...pin, sha256: pin.sha256.replace(/^sha256:/, '') }, `${prior.slug} manifest ${name}`);
  }
  const history = JSON.parse(await readPinned('history.json'));
  if (history.current.revisionId !== saved.revisionId || history.current.parentRevision !== saved.parentRevision) throw new Error(`History head mismatch: ${prior.slug}`);
  const chain = [saved];
  let current = saved;
  const seen = new Set([saved.revisionId]);
  while (current.revisionId !== prior.revisionId) {
    const parent = history.ancestors.find((item) => item.revisionId === current.parentRevision);
    if (!parent || parent.assetId !== prior.assetId || seen.has(parent.revisionId)) throw new Error(`Broken saved lineage: ${prior.slug}`);
    seen.add(parent.revisionId);
    let parentManifest;
    for (const file of parent.files) {
      const bytes = verifyBytes(await readFile(resolve(input.workspace, file.path)), file, file.path);
      if (file.path.endsWith('/manifest.json')) parentManifest = JSON.parse(bytes);
    }
    if (!parentManifest || parentManifest.revisionId !== parent.revisionId || (parentManifest.parentRevision ?? null) !== (parent.parentRevision ?? null)) throw new Error(`Ancestor manifest mismatch: ${prior.slug}`);
    current = parentManifest;
    chain.push(current);
  }
  const editable = verifyArchive(await readPinned('editable.zip'), 'editable');
  if (editable.manifest.assetId !== saved.assetId || editable.manifest.revisionId !== saved.revisionId) throw new Error(`Editable identity mismatch: ${prior.slug}`);
  const sourceMember = Object.keys(editable.files).find((path) => path.endsWith('/source.kiln.js'));
  if (!sourceMember || !Buffer.from(editable.files[sourceMember]).equals(source)) throw new Error(`Editable source mismatch: ${prior.slug}`);
  const glb = ensureVehicleWheelLod(canonical);
  const measured = inspectVehicleGlb(glb);
  const before = await loaderDraws(canonical);
  const loaded = await loaderDraws(glb);
  if (measured.form !== 'MSFT_lod' || measured.extensionsRequired.length || !measured.wheelsHiddenAtLastTier || before.triangles !== loaded.triangles || before.meshes !== loaded.meshes || loaded.triangles !== measured.drawnByPlainLoader.triangles) throw new Error(`Runtime LOD contract failed: ${prior.slug}`);
  let licence = verifyBytes(await readFile(join(mirror, prior.licence.path)), prior.licence, `${prior.slug} licence`).toString('utf8');
  licence = licence.replace(/^Saved revision:.*$/m, `Saved revision: ${saved.revisionId}`)
    .replace(/^Delivered GLB SHA-256:.*$/m, `Delivered GLB SHA-256: ${hash(glb)} (runtime derivative: optional MSFT_lod body and wheel-cull links)`)
    + `\nCanonical saved GLB SHA-256: ${hash(canonical)}\nImmediate saved parent: ${saved.parentRevision}\nLocal review 2: ${input.change}; owner review of this revision is pending.\n`;
  const model = `models/${prior.slug}.glb`;
  const licenceMember = `licenses/${prior.slug}.ASSET-LICENSE.txt`;
  members[model] = glb;
  members[licenceMember] = Buffer.from(licence);
  assets.push({ slug: prior.slug, name: prior.name, assetId: saved.assetId, revisionId: saved.revisionId, parentRevision: saved.parentRevision, previousDeliveryRevision: prior.revisionId, model, licence: licenceMember, changed: true, change: input.change, ownerAccepted: false, canonical: { bytes: canonical.length, sha256: hash(canonical) }, savedChain: chain.map(({ revisionId, parentRevision, createdAt, description, attribution }) => ({ revisionId, parentRevision, createdAt, description, attribution })), tiers: measured.tiers.map(({ tier, triangles, bodyTriangles, wheelTriangles }) => ({ tier, triangles, bodyTriangles, wheelTriangles })) });
  measurements[prior.slug] = measured;
}
const files = Object.fromEntries(Object.entries(members).map(([path, bytes]) => [path, { bytes: bytes.length, sha256: hash(bytes) }]));
const inventory = { schemaVersion: 1, pack: baseline.name, profile: 'runtime', release: 'r4-local-review', license: 'CC0-1.0', assets, files };
members['delivery.json'] = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`);
const zip = storedZip(members, new Date('2026-10-01T00:00:00Z'));
verifyArchive(zip, 'delivery');
for (const [path, bytes] of Object.entries(members)) { await mkdir(dirname(join(output, path)), { recursive: true }); await writeFile(join(output, path), bytes); }
await writeFile(join(output, 'generic-road-vehicles-runtime.zip'), zip);
const measurementBytes = Buffer.from(`${JSON.stringify(measurements, null, 2)}\n`);
await writeFile(join(output, 'measurements.json'), measurementBytes);
await writeFile(join(output, 'intake.json'), `${JSON.stringify({ schema: 'kiln.review2.final-vehicles-intake/1', inputsSha256: hash(await readFile(join(review, 'inputs/vehicles-final-inputs.json'))), deliverySha256: hash(members['delivery.json']), measurements: { bytes: measurementBytes.length, sha256: hash(measurementBytes) }, archive: { bytes: zip.length, sha256: hash(zip) }, ownerAccepted: false, assets: assets.map(({ slug, revisionId, parentRevision, canonical, change }) => ({ slug, revisionId, parentRevision, canonical, change })) }, null, 2)}\n`);
console.log(JSON.stringify({ output, release: inventory.release, assets: assets.length, archiveSha256: hash(zip) }));
