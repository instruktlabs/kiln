import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverRecords, readSavedRevision } from './stage-asset-delivery.mjs';
import { verifyPack } from './scene-pack.mjs';
import { reviewDirectory, stagePackGallery } from './stage-pack-gallery.mjs';

const SITE = fileURLToPath(new URL('../', import.meta.url));
const PKG = resolve(SITE, '../scenes/packages/cathedral-square');
const ID = 'cathedral-square';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const relativeModel = (slug) => `models/${slug}.glb`;
const editorial = {
  cathedral: ['Gothic Cathedral', 'A Gothic cathedral with a vaulted nave, carved west portals, stained glass and an articulated roofline.'],
  'house-timber-gable-door': ['Timber gable house with doorway', 'A timber-framed house with a street-facing gable and a ground-floor doorway.'],
  'house-timber-gable-narrow': ['Narrow timber gable house', 'A tall, narrow timber-framed house with a street-facing gable.'],
  'house-timber-gable-shop': ['Timber gable shop house', 'A timber-framed house with a gabled roof and a street-level shopfront.'],
  'house-stone-gable-shop': ['Stone gable shop house', 'A masonry house with a street-facing gable and a shopfront.'],
  'house-stone-gable-tall': ['Tall stone gable house', 'A tall masonry townhouse with a street-facing gable.'],
  'house-stone-eaves-arcade': ['Stone arcade house with dormers', 'A masonry townhouse with a ground-floor arcade and dormers on the street-facing roof slope.'],
  'house-plaster-eaves-arcade': ['Plaster arcade house with dormers', 'A plaster townhouse with a ground-floor arcade and dormers on the tiled roof.'],
  'house-plaster-eaves-shop': ['Plaster shop house with dormers', 'A plaster townhouse with a street-level shopfront and a pair of dormers.'],
  lantern: ['Square street lantern', 'A lantern and its street mounting for the cathedral quarter.'],
  fountain: ['Parvis spire fountain', 'A stone fountain with a central spire and basin for the cathedral forecourt.'],
  'tree-a': ['Plane tree A', 'The first plane tree variant used along the streets and lanes.'],
  'tree-b': ['Plane tree B', 'The second plane tree variant used along the streets and lanes.'],
  'stall-red': ['Red market stall', 'A market stall with a red striped canopy.'],
  'stall-green': ['Green market stall', 'A market stall with a green striped canopy.'],
  'cafe-red': ['Red café set', 'Outdoor café furniture with a red parasol.'],
  'cafe-green': ['Green café set', 'Outdoor café furniture with a green parasol.'],
  bench: ['Square bench', 'A bench for the streets and squares around the cathedral.'],
  bollard: ['Square bollard', 'A street bollard from the cathedral square kit.'],
  ground: ['Square paving swatches', 'Four reusable paving and ground materials. The walkthrough applies them to its generated street layout.'],
  crucifix: ['Gothic Cathedral Crucifix', 'A carved crucifix with corpus, cross and base. The walkthrough also places two timber-only wall crosses from this model.'],
  'nave-pew': ['Gothic oak nave pew', 'An oak pew with carved lancet end panels, three floor supports and a fixed padded kneeler.'],
};

/** Verify the common scene/catalog identity before deriving presentation data from saved receipts. */
export async function collectCathedralGallery(pins, pack, readRevision) {
  if (pack.id !== ID || !/^[a-z0-9-]+$/.test(pack.release)) throw new Error('Unexpected scene pack identity');
  const modelById = new Map(pack.models.map((model) => [model.id, model]));
  const seals = new Map(pack.files.map((file) => [file.path, file]));
  const ids = new Set(pins.map((pin) => pin.id));
  const identities = new Set(pins.map((pin) => `${pin.collectionId}/${pin.assetId}/${pin.revisionId}`));
  if (!ids.size || ids.size !== pins.length || identities.size !== pins.length ||
    pack.models.length !== pins.length || modelById.size !== pins.length) throw new Error('Scene inventory differs from gallery pins');

  const assets = [];
  for (const pin of pins) {
    const member = relativeModel(pin.id);
    const seal = seals.get(member);
    if (!/^[a-z0-9-]+$/.test(pin.id) || modelById.get(pin.id)?.path !== member ||
      !/^[a-f0-9]{64}$/.test(pin.sha256) || seal?.sha256 !== pin.sha256 || seal.bytes !== pin.bytes) {
      throw new Error(`${pin.id}: sealed scene model differs from the selected revision`);
    }
    const record = await readRevision(pin);
    const saved = record?.manifest;
    const savedModel = saved?.files?.['asset.glb'];
    if (!saved?.editable || saved.assetId !== pin.assetId || saved.revisionId !== pin.revisionId ||
      savedModel?.sha256 !== `sha256:${pin.sha256}` || savedModel.bytes !== pin.bytes) {
      throw new Error(`${pin.id}: saved revision does not match the selected scene model`);
    }
    const measured = saved.build?.integration;
    const metrics = measured?.renderMetrics;
    const size = measured?.bounds?.size;
    if (measured?.artifactSha256 !== pin.sha256 || size?.length !== 3 ||
      size.some((dimension) => !Number.isFinite(dimension)) ||
      !Number.isInteger(metrics?.triangles) || !Number.isInteger(metrics?.uniqueMaterials)) {
      throw new Error(`${pin.id}: measured GLB facts are unavailable for the selected revision`);
    }
    const [name, description] = editorial[pin.id] ?? [pin.name, saved.description];
    assets.push({
      slug: pin.id, name, description, collection: pin.collectionId,
      assetId: pin.assetId, revisionId: pin.revisionId, parentRevision: saved.parentRevision ?? null,
      instances: pin.instances, attribution: saved.attribution ?? {},
      metrics: { triangles: metrics.triangles, materials: metrics.uniqueMaterials, bounds: size },
      runtimeModelDownload: { member, bytes: pin.bytes, sha256: pin.sha256 },
    });
  }
  return { id: ID, name: 'Cathedral Square', release: pack.release, assets };
}

/** Build and seal the selected models and editable archives locally. Upload is a separate action. */
export async function stageCathedralGallery({
  workspaceRoot, source = join(PKG, 'standalone/public'), mirror = join(SITE, '.localdata/cathedral-release'),
  reviewOut = join(SITE, '.cache/cathedral-square-delivery'),
  catalogOut = join(SITE, 'src/data/packs/cathedral-square.json'),
} = {}) {
  const reviewPath = reviewDirectory(SITE, reviewOut);
  if (!workspaceRoot) throw new Error('Specify the directory containing the three cathedral authoring workspaces');
  const manifest = await json(join(PKG, 'ASSET-MANIFEST.json'));
  const assetsDir = join(source, 'assets');
  const noticesPath = join(source, 'THIRD-PARTY-NOTICES.txt');
  await verifyPack(assetsDir, noticesPath);
  const [pack, rights, notices] = await Promise.all([
    json(join(assetsDir, 'pack.json')),
    json(resolve(SITE, '../packs/cathedral-square/rights.json')),
    readFile(noticesPath),
  ]);
  const rightsPins = new Map(rights.pins.map((pin) => [pin.id, pin]));
  const textures = new Map(rights.dependencies.map((pin) => [pin.resourceId, pin]));
  const license = rights.decision;
  if (license.spdx !== 'CC0-1.0' || rightsPins.size !== manifest.assets.length ||
    !notices.toString('utf8').includes(license.url)) throw new Error('Cathedral Square rights record does not cover the staged scene');
  const roots = [...new Set(manifest.assets.map((pin) => pin.workspace))].map((name) => join(workspaceRoot, name));
  const index = await discoverRecords(roots);
  const records = new Map();
  const catalog = await collectCathedralGallery(manifest.assets, pack, async (pin) => {
    const approved = rightsPins.get(pin.id);
    if (approved?.assetId !== pin.assetId || approved.revisionId !== pin.revisionId || approved.sha256 !== pin.sha256) {
      throw new Error(`${pin.id}: public licence does not cover the selected revision`);
    }
    const record = await readSavedRevision({ ...pin, collection: pin.collectionId }, index);
    const source = record?.manifest.files?.['source.kiln.js'];
    if (!approved.source?.sha256 || source?.sha256 !== approved.source.sha256 || source.bytes !== approved.source.bytes) {
      throw new Error(`${pin.id}: licence record does not match the selected source bytes`);
    }
    for (const dependency of record?.manifest.build?.dependencies ?? []) {
      const resource = textures.get(dependency.resourceId);
      if (resource?.contentHash !== dependency.contentHash || !resource?.license?.spdx) {
        throw new Error(`${pin.id}: rights evidence missing for ${dependency.resourceId ?? dependency.kind}`);
      }
    }
    records.set(pin.id, record);
    return record;
  });
  catalog.license = { spdx: license.spdx, url: license.url, scope: license.scope };

  return stagePackGallery({ site: SITE, id: ID, catalog, records, license, notices, assetsDir, mirror, reviewPath, catalogOut });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const option = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  await stageCathedralGallery({ workspaceRoot: option('--workspace-root'), source: option('--source'), mirror: option('--mirror'), reviewOut: option('--review-out') });
}
