import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashBytes } from './mirror-core.mjs';
import { describeFinding, scanFiles } from './private-data.mjs';
import { verifyPack } from './scene-pack.mjs';
import { discoverRecords, readSavedRevision } from './stage-asset-delivery.mjs';
import { reviewDirectory, stagePackGallery } from './stage-pack-gallery.mjs';

/**
 * Stage the Seed Town gallery collection from the scene's sealed pack and the saved revisions it was exported from.
 *
 *   bun scripts/stage-seed-town-gallery.mjs --workspace DIR [--carried DIR] [--mirror DIR] [--allow-pending-statement]
 *
 * The scene's models are carried runtime exports (`kiln export --profile runtime --carry-shapes`), not the saved
 * `asset.glb`. Each kit is tied together three ways: the sealed pack model equals the manifest's carried pin; the GLB's
 * provenance pointer names its sidecar by file name and SHA-256; and the sidecar and the saved revision both name the
 * manifest's saved GLB and source hashes, which the rights record pins too. The kit list is the manifest's.
 */

const SITE = fileURLToPath(new URL('../', import.meta.url));
const ROOT = resolve(SITE, '..');
const PKG = join(ROOT, 'scenes/packages/seed-town');
const ID = 'seed-town';
export const PENDING_STATEMENT = 'PENDING OWNER WORDING';
const SIDECAR_VERSION = 'kiln.runtime-metadata.v1';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const memberOf = (id) => `models/${id}.glb`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The `asset.extras.kilnProvenanceV1.metadata` pointer from a GLB's JSON chunk. */
export function provenancePointer(glb) {
  if (glb.length < 20 || glb.toString('latin1', 0, 4) !== 'glTF' || glb.toString('latin1', 16, 20) !== 'JSON') return undefined;
  const length = glb.readUInt32LE(12);
  if (20 + length > glb.length) return undefined;
  try {
    return JSON.parse(glb.toString('utf8', 20, 20 + length)).asset?.extras?.kilnProvenanceV1?.metadata;
  } catch {
    return undefined;
  }
}

/** The rights record must be CC0, have a final owner statement (unless allowed) and pin each kit's saved model and source. */
export function checkSeedTownRights(rights, manifest, { allowPendingStatement = false } = {}) {
  const license = rights?.decision;
  if (license?.ownerStatement === PENDING_STATEMENT && !allowPendingStatement) {
    throw new Error(`Seed Town rights statement is still "${PENDING_STATEMENT}"; record the owner's words in packs/seed-town/rights.json, or pass --allow-pending-statement for a local stage`);
  }
  if (!license?.ownerStatement || license.spdx !== 'CC0-1.0' || !license.url || !license.scope) {
    throw new Error('Seed Town rights record is not a complete CC0 decision');
  }
  const pins = new Map((rights.pins ?? []).map((pin) => [pin.id, pin]));
  if (pins.size !== (rights.pins ?? []).length || pins.size !== manifest.assets.length) {
    throw new Error('Seed Town public licence does not cover exactly the scene kits');
  }
  for (const kit of manifest.assets) {
    const pin = pins.get(kit.id);
    if (pin?.assetId !== kit.assetId || pin.revisionId !== kit.revisionId || pin.sha256 !== kit.savedGlbSha256 ||
      pin.source?.sha256 !== `sha256:${kit.sourceSha256}` || !Number.isInteger(pin.source?.bytes)) {
      throw new Error(`${kit.id}: public licence does not cover the saved revision`);
    }
  }
  return pins;
}

/** What a kit lets you set, from the saved declaration, checked against the pack data and the carried sidecar. */
function kitParameters(kit, declared, data, sidecar) {
  const carried = sidecar.params ?? {};
  if (carried.dropped?.length) throw new Error(`${kit.id}: the export does not carry ${carried.dropped.join(', ')}`);
  if (!data || !same(data.defaults, Object.fromEntries(Object.entries(declared).map(([name, spec]) => [name, spec.default])))) {
    throw new Error(`${kit.id}: kits.json defaults differ from the saved declaration`);
  }
  const parameters = { options: [], sizes: [], colours: [], variants: Object.keys(carried.presets ?? {}) };
  const sizes = {};
  for (const [name, spec] of Object.entries(declared)) {
    const describe = spec.describe ? { describe: spec.describe } : {};
    if (spec.type === 'range' || spec.type === 'int') {
      if (carried.shapes?.[name]?.mode !== 'morph') throw new Error(`${kit.id}: the export does not carry size ${name}`);
      sizes[name] = { min: spec.min, default: spec.default, max: spec.max };
      parameters.sizes.push({ name, min: spec.min, default: spec.default, max: spec.max, ...(spec.unit ? { unit: spec.unit } : {}), ...describe });
    } else if (spec.type === 'choice' || spec.type === 'toggle') {
      if (!carried.switches?.[name]?.length) throw new Error(`${kit.id}: the export does not carry option ${name}`);
      parameters.options.push(spec.type === 'choice'
        ? { name, kind: 'choice', values: spec.options, default: spec.default, ...describe }
        : { name, kind: 'toggle', default: spec.default, ...describe });
    } else if (spec.type === 'color') {
      if (!carried.colors?.[name]?.length) throw new Error(`${kit.id}: the export does not carry colour ${name}`);
      parameters.colours.push({ name, default: spec.default, ...describe });
    } else {
      throw new Error(`${kit.id}: unsupported parameter type ${spec.type} for ${name}`);
    }
  }
  if (!same(data.sizes, sizes)) throw new Error(`${kit.id}: kits.json sizes differ from the saved declaration`);
  return parameters;
}

/** Verify each manifest kit end to end and project it into the gallery catalog. */
export async function collectSeedTownGallery({ manifest, pack, kits, names, readModel, readRevision, readSidecar }) {
  if (pack.id !== ID || !/^st[1-9][0-9]*$/.test(pack.release) || pack.release !== manifest.release) {
    throw new Error('Scene pack identity or release differs from ASSET-MANIFEST.json');
  }
  const modelById = new Map(pack.models.map((model) => [model.id, model]));
  const seals = new Map(pack.files.map((file) => [file.path, file]));
  const pins = manifest.assets;
  const ids = new Set(pins.map((pin) => pin.id));
  const identities = new Set(pins.map((pin) => `${pin.collectionId ?? manifest.collectionId}/${pin.assetId}/${pin.revisionId}`));
  if (!ids.size || ids.size !== pins.length || identities.size !== pins.length ||
    pack.models.length !== pins.length || modelById.size !== pins.length) throw new Error('Scene inventory differs from gallery pins');

  const assets = [];
  for (const pin of pins) {
    const member = memberOf(pin.id);
    const seal = seals.get(member);
    const model = /^[a-z0-9-]+$/.test(pin.id) && modelById.get(pin.id)?.path === member ? await readModel(member) : undefined;
    if (!model || !/^[a-f0-9]{64}$/.test(pin.sha256) || seal?.sha256 !== pin.sha256 || seal.bytes !== pin.bytes ||
      hashBytes(model) !== pin.sha256 || model.length !== pin.bytes) {
      throw new Error(`${pin.id}: sealed scene model differs from the carried pin`);
    }
    const editorial = names.kits?.[pin.id];
    if (!editorial?.name || !editorial.description) throw new Error(`${pin.id}: add its public name and description to packs/seed-town/names.json`);

    const record = await readRevision(pin);
    const saved = record?.manifest;
    const savedModel = saved?.files?.['asset.glb'];
    const savedSource = saved?.files?.['source.kiln.js'];
    if (!saved?.editable || saved.assetId !== pin.assetId || saved.revisionId !== pin.revisionId ||
      savedModel?.sha256 !== `sha256:${pin.savedGlbSha256}` || savedSource?.sha256 !== `sha256:${pin.sourceSha256}`) {
      throw new Error(`${pin.id}: saved revision does not match the manifest's saved model and source`);
    }
    const measured = saved.build?.integration;
    const metrics = measured?.renderMetrics;
    const size = measured?.bounds?.size;
    if (measured?.artifactSha256 !== pin.savedGlbSha256 || size?.length !== 3 ||
      size.some((dimension) => !Number.isFinite(dimension)) ||
      !Number.isInteger(metrics?.triangles) || !Number.isInteger(metrics?.uniqueMaterials)) {
      throw new Error(`${pin.id}: measured GLB facts are unavailable for the saved revision`);
    }

    const pointer = provenancePointer(model);
    const uri = `${pin.id}.kiln-metadata.json`;
    if (pointer?.uri !== uri || !/^sha256:[a-f0-9]{64}$/.test(pointer.sha256 ?? '')) {
      throw new Error(`${pin.id}: the carried model does not name its sidecar ${uri}`);
    }
    const sidecarBytes = await readSidecar(pin, uri);
    if (`sha256:${hashBytes(sidecarBytes)}` !== pointer.sha256) throw new Error(`${pin.id}: sidecar bytes differ from the carried model's pointer`);
    const sidecar = JSON.parse(sidecarBytes.toString('utf8'));
    if (sidecar.version !== SIDECAR_VERSION) throw new Error(`${pin.id}: sidecar is not ${SIDECAR_VERSION}`);
    if (!same(sidecar.source, { assetId: pin.assetId, revisionId: pin.revisionId, glbSha256: `sha256:${pin.savedGlbSha256}`, sourceSha256: `sha256:${pin.sourceSha256}` })) {
      throw new Error(`${pin.id}: sidecar names another revision than the manifest`);
    }
    const declared = saved.build?.params?.params;
    if (!declared) throw new Error(`${pin.id}: the saved revision records no parameter declaration`);

    assets.push({
      slug: pin.id, name: editorial.name, description: editorial.description, collection: pin.collectionId ?? manifest.collectionId,
      assetId: pin.assetId, revisionId: pin.revisionId, parentRevision: saved.parentRevision ?? null,
      attribution: saved.attribution ?? {},
      metrics: { triangles: metrics.triangles, materials: metrics.uniqueMaterials, bounds: size },
      savedModel: { sha256: pin.savedGlbSha256, bytes: savedModel.bytes },
      runtimeModelDownload: { member, bytes: pin.bytes, sha256: pin.sha256 },
      runtimeMetadata: { member: `models/${uri}`, bytes: sidecarBytes.length, sha256: hashBytes(sidecarBytes) },
      parameters: kitParameters(pin, declared, kits.kits?.[pin.id], sidecar),
    });
  }
  return { id: ID, name: 'Seed Town', release: pack.release, assets };
}

/** Build and seal the kit models, sidecars and editable archives locally. Upload is a separate action. */
export async function stageSeedTownGallery({
  workspace = process.env.KILN_SEED_TOWN_ROOT, carried, source = join(PKG, 'standalone/public'),
  mirror = join(SITE, '.localdata/seed-town-release'), reviewOut = join(SITE, '.cache/seed-town-delivery'),
  catalogOut = join(SITE, 'src/data/packs/seed-town.json'), allowPendingStatement = false,
} = {}) {
  const reviewPath = reviewDirectory(SITE, reviewOut);
  const [manifest, rights, names, taxonomy] = await Promise.all([
    json(join(PKG, 'ASSET-MANIFEST.json')),
    json(join(ROOT, 'packs/seed-town/rights.json')),
    json(join(ROOT, 'packs/seed-town/names.json')),
    json(join(SITE, 'src/data/gallery-taxonomy.json')),
  ]);
  const rightsPins = checkSeedTownRights(rights, manifest, { allowPendingStatement });
  if (rights.dependencies?.length) throw new Error('Seed Town rights record lists third-party resources; their terms need their own review');
  for (const kit of manifest.assets) {
    if (!taxonomy.assets[`/gallery/${ID}/${kit.id}/`]) throw new Error(`${kit.id}: add /gallery/${ID}/${kit.id}/ to src/data/gallery-taxonomy.json`);
  }
  if (!workspace) throw new Error('Specify the Seed Town authoring workspace with --workspace or KILN_SEED_TOWN_ROOT');
  const carriedDir = resolve(carried ?? process.env.KILN_SEED_TOWN_CARRIED ?? join(workspace, 'out/carried'));
  const assetsDir = join(source, 'assets');
  const noticesPath = join(source, 'THIRD-PARTY-NOTICES.txt');
  await verifyPack(assetsDir, noticesPath);
  const [pack, notices] = await Promise.all([json(join(assetsDir, 'pack.json')), readFile(noticesPath)]);
  const license = rights.decision;
  if (!notices.toString('utf8').includes(license.url)) throw new Error('Seed Town notices do not name the CC0 licence');
  const kits = await json(join(assetsDir, pack.data?.kits ?? 'data/kits.json'));
  const index = await discoverRecords([resolve(workspace)]);
  const records = new Map();
  const sidecars = new Map();
  const catalog = await collectSeedTownGallery({
    manifest, pack, kits, names,
    readModel: (member) => readFile(join(assetsDir, member)),
    readRevision: async (pin) => {
      const record = await readSavedRevision({ ...pin, collection: pin.collectionId ?? manifest.collectionId }, index);
      const saved = record?.manifest.files?.['source.kiln.js'];
      if (saved?.bytes !== rightsPins.get(pin.id).source.bytes) throw new Error(`${pin.id}: licence record does not match the saved source bytes`);
      const dependencies = record.manifest.build?.dependencies ?? [];
      if (dependencies.length) {
        throw new Error(`${pin.id}: the saved revision uses third-party resources with no licence record: ${dependencies.map((item) => item.resourceId ?? item.kind).join(', ')}`);
      }
      records.set(pin.id, record);
      return record;
    },
    readSidecar: async (pin, uri) => {
      if (basename(uri) !== uri) throw new Error(`${pin.id}: sidecar name must be a sibling file name`);
      const bytes = await readFile(join(carriedDir, uri));
      const scan = await scanFiles(carriedDir, { files: [uri] });
      if (scan.findings.length) throw new Error(scan.findings.slice(0, 5).map(describeFinding).join('\n'));
      sidecars.set(pin.id, bytes);
      return bytes;
    },
  });
  catalog.license = { spdx: license.spdx, url: license.url, scope: license.scope };
  return stagePackGallery({
    site: SITE, id: ID, catalog, records, license, notices, assetsDir, mirror, reviewPath, catalogOut,
    // The GLB names its sidecar by sibling file name, so the sidecar ships beside it in every runtime form.
    companions: (asset) => [{ key: 'runtimeMetadataDownload', member: asset.runtimeMetadata.member, bytes: sidecars.get(asset.slug) }],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const option = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  await stageSeedTownGallery({
    workspace: option('--workspace'), carried: option('--carried'), source: option('--source'),
    mirror: option('--mirror'), reviewOut: option('--review-out'),
    allowPendingStatement: argv.includes('--allow-pending-statement'),
  });
}
