import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashBytes } from './mirror-core.mjs';
import { discoverRecords, readSavedRevision } from './stage-asset-delivery.mjs';
import { reviewDirectory, stagePackGallery } from './stage-pack-gallery.mjs';

/**
 * Stage the H-7 gallery collection from the saved revisions listed in packs/h-7/selection.json.
 *
 *   bun scripts/stage-h7-gallery.mjs --workspace-root DIR [--mirror DIR] [--allow-pending-statement]
 *
 * The collection has no scene: each model is its revision's saved `asset.glb`, byte for byte. The selection, the
 * saved manifest and the rights record must name the same model and source hashes. An entry with `partOf` is an extra
 * model of another card (a lower detail level, a corpse): it is staged and licensed like the rest and has no page.
 */

const SITE = fileURLToPath(new URL('../', import.meta.url));
const ROOT = resolve(SITE, '..');
const PACK = join(ROOT, 'packs/h-7');
const ID = 'h-7';
export const PENDING_STATEMENT = 'PENDING OWNER WORDING';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const memberOf = (id) => `models/${id}.glb`;

/** The clip names and declared extensions in a GLB's JSON chunk. */
export function glbFacts(glb) {
  if (glb.length < 20 || glb.toString('latin1', 0, 4) !== 'glTF' || glb.toString('latin1', 16, 20) !== 'JSON' ||
    20 + glb.readUInt32LE(12) > glb.length) throw new Error('Not a GLB with a JSON chunk');
  const document = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  return {
    clips: (document.animations ?? []).map((clip) => clip.name).filter(Boolean),
    extensionsUsed: document.extensionsUsed ?? [],
  };
}

/** The rights record must be CC0, have a final owner statement (unless allowed) and pin each selected model and source. */
export function checkH7Rights(rights, selection, { allowPendingStatement = false } = {}) {
  const license = rights?.decision;
  if (license?.ownerStatement === PENDING_STATEMENT && !allowPendingStatement) {
    throw new Error(`H-7 rights statement is still "${PENDING_STATEMENT}"; record the owner's words in packs/h-7/rights.json, or pass --allow-pending-statement for a local stage`);
  }
  if (!license?.ownerStatement || license.spdx !== 'CC0-1.0' || !license.url || !license.scope) {
    throw new Error('H-7 rights record is not a complete CC0 decision');
  }
  const pins = new Map((rights.pins ?? []).map((pin) => [pin.id, pin]));
  if (pins.size !== (rights.pins ?? []).length || pins.size !== selection.assets.length) {
    throw new Error('H-7 public licence does not cover exactly the selected revisions');
  }
  for (const asset of selection.assets) {
    const pin = pins.get(asset.id);
    if (pin?.assetId !== asset.assetId || pin.revisionId !== asset.revisionId || pin.sha256 !== asset.sha256 ||
      pin.source?.sha256 !== `sha256:${asset.sourceSha256}` || !Number.isInteger(pin.source?.bytes)) {
      throw new Error(`${asset.id}: public licence does not cover the saved revision`);
    }
  }
  return pins;
}

/** Verify each selected revision against its saved manifest and bytes, and project it into the gallery catalog. */
export async function collectH7Gallery({ selection, names, readRevision }) {
  if (selection.id !== ID || !/^h7-[1-9][0-9]*$/.test(selection.release)) throw new Error('Unexpected H-7 selection identity or release');
  const pins = selection.assets;
  const byId = new Map(pins.map((pin) => [pin.id, pin]));
  const identities = new Set(pins.map((pin) => `${pin.assetId}/${pin.revisionId}`));
  if (!pins.length || byId.size !== pins.length || identities.size !== pins.length) throw new Error('H-7 selection lists an asset or revision twice');
  for (const pin of pins) {
    if (pin.partOf !== undefined && (!byId.has(pin.partOf) || byId.get(pin.partOf).partOf !== undefined)) {
      throw new Error(`${pin.id}: partOf must name a card in the selection that has a page of its own`);
    }
  }

  const assets = [];
  for (const pin of pins) {
    if (!/^[a-z0-9-]+$/.test(pin.id) || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error(`${pin.id}: malformed selection entry`);
    const editorial = names.assets?.[pin.id];
    if (!editorial?.name || !editorial.description) throw new Error(`${pin.id}: add its public name and description to packs/h-7/names.json`);

    const record = await readRevision(pin);
    const saved = record?.manifest;
    const savedModel = saved?.files?.['asset.glb'];
    const savedSource = saved?.files?.['source.kiln.js'];
    if (!saved?.editable || saved.assetId !== pin.assetId || saved.revisionId !== pin.revisionId ||
      savedModel?.sha256 !== `sha256:${pin.sha256}` || savedModel.bytes !== pin.bytes ||
      savedSource?.sha256 !== `sha256:${pin.sourceSha256}`) {
      throw new Error(`${pin.id}: saved revision does not match the selection's model and source`);
    }
    const model = record.files?.['asset.glb'];
    if (!model || hashBytes(model) !== pin.sha256 || model.length !== pin.bytes) throw new Error(`${pin.id}: saved model bytes differ from the selection`);
    const dependencies = saved.build?.dependencies ?? [];
    if (dependencies.length) {
      throw new Error(`${pin.id}: the saved revision uses third-party resources with no licence record: ${dependencies.map((item) => item.resourceId ?? item.kind).join(', ')}`);
    }
    const measured = saved.build?.integration;
    const metrics = measured?.renderMetrics;
    const size = measured?.bounds?.size;
    if (measured?.artifactSha256 !== pin.sha256 || size?.length !== 3 ||
      size.some((dimension) => !Number.isFinite(dimension)) ||
      !Number.isInteger(metrics?.triangles) || !Number.isInteger(metrics?.uniqueMaterials)) {
      throw new Error(`${pin.id}: measured GLB facts are unavailable for the saved revision`);
    }
    assets.push({
      slug: pin.id, name: editorial.name, description: editorial.description, collection: selection.collectionId,
      assetId: pin.assetId, revisionId: pin.revisionId, parentRevision: saved.parentRevision ?? null,
      attribution: saved.attribution ?? {},
      metrics: { triangles: metrics.triangles, materials: metrics.uniqueMaterials, bounds: size },
      ...glbFacts(model),
      runtimeModelDownload: { member: memberOf(pin.id), bytes: pin.bytes, sha256: pin.sha256 },
      ...(pin.partOf ? { partOf: pin.partOf } : {}),
    });
  }
  return { id: ID, name: selection.name, release: selection.release, assets };
}

/** Build and seal the models and editable archives locally. Upload is a separate action. */
export async function stageH7Gallery({
  workspaceRoot = process.env.KILN_H7_ASSETS_ROOT, mirror = join(SITE, '.localdata/h-7-release'),
  reviewOut = join(SITE, '.cache/h-7-delivery'), catalogOut = join(SITE, 'src/data/packs/h-7.json'),
  allowPendingStatement = false,
} = {}) {
  const reviewPath = reviewDirectory(SITE, reviewOut);
  const [selection, rights, names, taxonomy, notices] = await Promise.all([
    json(join(PACK, 'selection.json')), json(join(PACK, 'rights.json')), json(join(PACK, 'names.json')),
    json(join(SITE, 'src/data/gallery-taxonomy.json')), readFile(join(PACK, 'THIRD-PARTY-NOTICES.txt')),
  ]);
  const rightsPins = checkH7Rights(rights, selection, { allowPendingStatement });
  if (rights.dependencies?.length) throw new Error('H-7 rights record lists third-party resources; their terms need their own review');
  const license = rights.decision;
  if (!notices.toString('utf8').includes(license.url)) throw new Error('H-7 notices do not name the CC0 licence');
  for (const asset of selection.assets) {
    const href = `/gallery/${ID}/${asset.id}/`;
    if (!asset.partOf && !taxonomy.assets[href]) throw new Error(`${asset.id}: add ${href} to src/data/gallery-taxonomy.json`);
  }
  if (!workspaceRoot) throw new Error('Specify the directory that holds the H-7 authoring workspaces with --workspace-root or KILN_H7_ASSETS_ROOT');
  const roots = [...new Set(selection.assets.map((asset) => asset.workspace))].map((name) => join(resolve(workspaceRoot), name));
  const index = await discoverRecords(roots);
  const records = new Map();
  const catalog = await collectH7Gallery({
    selection, names,
    readRevision: async (pin) => {
      const record = await readSavedRevision({ ...pin, collection: selection.collectionId }, index);
      if (record?.manifest.files?.['source.kiln.js']?.bytes !== rightsPins.get(pin.id).source.bytes) {
        throw new Error(`${pin.id}: licence record does not match the saved source bytes`);
      }
      records.set(pin.id, record);
      return record;
    },
  });
  catalog.license = { spdx: license.spdx, url: license.url, scope: license.scope };
  // The shared stager reads each model from a directory; here that is a copy of the saved revision's own file.
  const assetsDir = join(reviewPath, 'assets');
  await mkdir(join(assetsDir, 'models'), { recursive: true });
  for (const asset of catalog.assets) {
    await writeFile(join(assetsDir, asset.runtimeModelDownload.member), records.get(asset.slug).files['asset.glb']);
  }
  return stagePackGallery({ site: SITE, id: ID, catalog, records, license, notices, assetsDir, mirror, reviewPath, catalogOut });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const option = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  await stageH7Gallery({
    workspaceRoot: option('--workspace-root'), mirror: option('--mirror'), reviewOut: option('--review-out'),
    allowPendingStatement: argv.includes('--allow-pending-statement'),
  });
}
