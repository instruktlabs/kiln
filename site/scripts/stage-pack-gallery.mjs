import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { buildDeliveryArchive, revisionBundle } from './asset-delivery.mjs';
import { ASSET_BASE, assetPath, hashBytes, verifyBytes } from './mirror-core.mjs';
import { syncGroup, writeJson, writeMirrorFile } from './media-pins.mjs';
import { describeFinding, scanFiles } from './private-data.mjs';

/**
 * The delivery half shared by the scene gallery stagers (Cathedral Square, Seed Town): each entry verifies its own
 * scene pack, saved revisions and rights record into a catalog, and this writes the downloads, the receipts, the
 * catalog, the delivery group and the mirror pins. Nothing is uploaded.
 */

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

/** The review directory holds unpublished receipts and revision ZIPs, so it must stay inside site/.cache. */
export function reviewDirectory(site, reviewOut) {
  const reviewPath = resolve(reviewOut);
  const rel = relative(join(site, '.cache'), reviewPath);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error('The delivery review directory must be inside site/.cache');
  }
  return reviewPath;
}

/**
 * Stage a verified catalog. `records` maps each slug to its saved revision record; `license` is the rights decision;
 * `notices` the scene pack's third-party notices. `companions(asset)` may name further runtime files that travel
 * with an asset's model ({ key, member, bytes }): each joins the runtime pack and becomes the asset's `key` download.
 */
export async function stagePackGallery({
  site, id, catalog, records, license, notices, assetsDir, mirror, reviewPath, catalogOut, companions = () => [],
}) {
  const deliveryFile = join(site, 'src/data/asset-delivery.json');
  const delivery = await json(deliveryFile);
  const previousDownloads = new Map((delivery.groups[id]?.assets ?? []).map((asset) => [asset.slug, asset]));
  const releaseDir = join(reviewPath, catalog.release);
  const mirrorPrefix = `packs/${id}/${catalog.release}`;
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
      previous.path.startsWith(`packs/${id}/`) && previous.path.endsWith(`/${path}`);
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
      profile: 'editable', group: id, assets: [pin],
      files: { ...archiveNotices, 'README.txt': readme, [sourceEntry]: bundle },
    });
    const previous = previousDownloads.get(slug);
    const runtimeDownload = await writeDownload(model.member, glb, previous?.runtimeDownload);
    const extra = {};
    for (const companion of companions(asset)) {
      runtime[companion.member] = companion.bytes;
      extra[companion.key] = await writeDownload(companion.member, companion.bytes, previous?.[companion.key]);
    }
    receipt.assets.push({
      ...pin, runtimeDownload, ...extra,
      editableDownload: await writeDownload(`editable/${slug}.zip`, archive, previous?.editableDownload),
      dependencies: record.manifest.build?.dependencies ?? [],
    });
  }
  const inventory = receipt.assets.map(({ slug, collection, assetId, revisionId, includedRevisions, missingParents, omittedParents }) =>
    ({ slug, collection, assetId, revisionId, includedRevisions, missingParents, omittedParents }));
  for (const [profile, files] of [['runtime', runtime], ['editable', editable]]) {
    const archive = buildDeliveryArchive({ profile, group: id, files: { ...files, ...archiveNotices }, assets: inventory });
    receipt.packs.push({ profile, ...await writeDownload(`${id}-${profile}.zip`, archive) });
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

  delivery.groups[id] = { standalone: false, downloads: receipt.packs, assets: receipt.assets.map(({ dependencies, ...asset }) => asset) };
  await writeJson(deliveryFile, delivery);
  const mirrorFile = join(site, 'src/data/mirror-manifest.json');
  const mirrorData = await json(mirrorFile);
  await writeJson(mirrorFile, {
    ...mirrorData, files: syncGroup(mirrorData.files, 'path', `${mirrorPrefix}/`, uploadPins),
  });
  console.log(`Staged ${catalog.assets.length} ${catalog.name} revision pairs in ${mirror}`);
  return { catalog, receipt };
}
