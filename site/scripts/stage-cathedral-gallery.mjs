import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDeliveryArchive, revisionBundle } from './asset-delivery.mjs';
import { discoverRecords, readSavedRevision } from './stage-asset-delivery.mjs';
import { ASSET_BASE, assetPath, hashBytes, verifyBytes } from './mirror-core.mjs';
import { syncGroup, writeJson, writeMirrorFile } from './media-pins.mjs';
import { verifyPack } from './scene-pack.mjs';
import { describeFinding, scanFiles } from './private-data.mjs';

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
  const reviewPath = resolve(reviewOut);
  const rel = relative(join(SITE, '.cache'), reviewPath);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error('The delivery review directory must be inside site/.cache');
  }
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

  const deliveryFile = join(SITE, 'src/data/asset-delivery.json');
  const delivery = await json(deliveryFile);
  const previousDownloads = new Map((delivery.groups[ID]?.assets ?? []).map((asset) => [asset.slug, asset]));
  const releaseDir = join(reviewPath, catalog.release);
  const mirrorPrefix = `packs/${ID}/${catalog.release}`;
  const runtime = {}, editable = {};
  const receipt = { release: catalog.release, scope: 'local-release-candidate', license: catalog.license, assets: [], packs: [] };
  const modelLicense = Buffer.from(`SPDX-License-Identifier: ${license.spdx}\n${license.scope}\n${license.url}\n`);
  const archiveNotices = { 'LICENSE.txt': modelLicense, 'THIRD-PARTY-NOTICES.txt': notices };
  const uploadPins = [];
  const write = async (path, bytes) => {
    const file = join(releaseDir, path);
    await mkdir(resolve(file, '..'), { recursive: true });
    await writeFile(file, bytes);
    return { path, bytes: bytes.length, sha256: hashBytes(bytes) };
  };
  const writeDownload = async (path, bytes, previous) => {
    const sha256 = hashBytes(bytes);
    const reused = previous?.sha256 === sha256 && previous.bytes === bytes.length &&
      previous.path.startsWith(`packs/${ID}/`) && previous.path.endsWith(`/${path}`);
    const key = reused ? assetPath(previous.path) : `${mirrorPrefix}/${path}`;
    const pin = { path: key, bytes: bytes.length, sha256 };
    try {
      verifyBytes(await readFile(join(mirror, key)), pin);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeMirrorFile(mirror, key, bytes);
    }
    uploadPins.push(pin);
    return { ...pin, url: new URL(pin.path, ASSET_BASE).href };
  };
  for (const asset of catalog.assets) {
    const model = asset.runtimeModelDownload;
    const glb = verifyBytes(await readFile(join(assetsDir, model.member)), model, asset.slug);
    const record = records.get(asset.slug);
    const bundle = revisionBundle(record);
    const sourceEntry = `revisions/${asset.collection}/${asset.assetId}/${asset.revisionId}.zip`;
    runtime[model.member] = glb;
    editable[sourceEntry] = bundle;
    await write(sourceEntry, bundle);
    const scan = await scanFiles(releaseDir, { files: [sourceEntry] });
    if (scan.findings.length) throw new Error(scan.findings.slice(0, 5).map(describeFinding).join('\n'));
    const { slug, collection, assetId, revisionId, parentRevision } = asset;
    const pin = { slug, collection, assetId, revisionId, includedRevisions: [revisionId], missingParents: [], omittedParents: parentRevision ? [parentRevision] : [] };
    const readme = Buffer.from(`Selected revision: ${collection}/${assetId}/${revisionId}\nImport the nested revision ZIP into Kiln Library.\n`);
    const archive = buildDeliveryArchive({
      profile: 'editable', group: ID, assets: [pin],
      files: { ...archiveNotices, 'README.txt': readme, [sourceEntry]: bundle },
    });
    receipt.assets.push({
      ...pin, runtimeDownload: await writeDownload(model.member, glb, previousDownloads.get(slug)?.runtimeDownload),
      editableDownload: await writeDownload(`editable/${slug}.zip`, archive, previousDownloads.get(slug)?.editableDownload),
      dependencies: record.manifest.build?.dependencies ?? [],
    });
  }
  const inventory = receipt.assets.map(({ runtimeDownload, editableDownload, dependencies, ...pin }) => pin);
  for (const [profile, files] of [['runtime', runtime], ['editable', editable]]) {
    const archive = buildDeliveryArchive({ profile, group: ID, files: { ...files, ...archiveNotices }, assets: inventory });
    receipt.packs.push({ profile, ...await writeDownload(`${ID}-${profile}.zip`, archive) });
  }
  await write('review-delivery.json', Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  await write('upload-pins.json', Buffer.from(JSON.stringify(uploadPins, null, 2) + '\n'));

  // Poster metadata belongs to the rig pipeline. A rerun keeps only exact matching pins.
  const previous = await json(catalogOut).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return { assets: [] };
  });
  const priorAssets = new Map(previous.assets.map((asset) => [asset.slug, asset]));
  for (const asset of catalog.assets) {
    const prior = priorAssets.get(asset.slug);
    if (prior?.revisionId === asset.revisionId && prior.runtimeModelDownload?.sha256 === asset.runtimeModelDownload.sha256 && prior.poster) {
      asset.poster = prior.poster;
    }
  }
  await writeJson(catalogOut, catalog);

  delivery.groups[ID] = { standalone: false, downloads: receipt.packs, assets: receipt.assets.map(({ dependencies, ...asset }) => asset) };
  await writeJson(deliveryFile, delivery);
  const mirrorFile = join(SITE, 'src/data/mirror-manifest.json');
  const mirrorData = await json(mirrorFile);
  await writeJson(mirrorFile, {
    ...mirrorData, files: syncGroup(mirrorData.files, 'path', `${mirrorPrefix}/`, uploadPins),
  });
  console.log(`Staged ${catalog.assets.length} Cathedral Square revision pairs in ${mirror}`);
  return { catalog, receipt };
}


if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const option = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  await stageCathedralGallery({ workspaceRoot: option('--workspace-root'), source: option('--source'), mirror: option('--mirror'), reviewOut: option('--review-out') });
}
