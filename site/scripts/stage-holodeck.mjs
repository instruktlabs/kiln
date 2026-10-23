import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDeliveryArchive, isSavedMaterialDependency, revisionBundle } from './asset-delivery.mjs';
import { readJson, writeJson } from './media-pins.mjs';
import { ASSET_BASE, assetPath, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';
import { HOLODECK_ASSETS, HOLODECK_ID, HOLODECK_PACKS, HOLODECK_PLANNED, holodeckApproved } from './holodeck-spec.mjs';
import { materialClosure, metricsOf, verifyRuntimeProfile } from './stage-cabin-woods.mjs';

/**
 * Stage the Holodeck scene packs from the frozen selection (`packs/holodeck/selection.json`) and the read-only Kiln
 * stores that hold its saved revisions. Every revision is verified against the selection before anything is written.
 * Runtime GLBs come from Kiln's own runtime export profile and must keep the canonical binary exactly.
 *
 *   node scripts/stage-holodeck.mjs --kiln KILN_PACKAGE_DIR --mirror .localdata/holodeck-delivery \
 *     --store island-trial=DIR --store holodeck-assets=DIR --store courtyard-plaza=DIR --store tropical-island=DIR
 *   node scripts/stage-holodeck.mjs --upload-list --mirror .localdata/holodeck-delivery
 *
 * Generated downloads go to the ignored mirror under `packs/holodeck/<release>/` and are pinned in
 * `src/data/mirror-manifest.json` for the asset host; lightweight sources and manifests are kept in
 * `packs/holodeck/sources/`. Nothing is uploaded or published.
 */

const SITE = resolve(import.meta.dirname, '..');
const PACKS_ROOT = resolve(SITE, '../packs/holodeck');
const json = (bytes) => JSON.parse(bytes.toString('utf8'));
const strip = (sha) => sha.replace(/^sha256:/, '');
export const holodeckPrefix = (release) => `packs/${HOLODECK_ID}/${release}/`;
export const HOLODECK_OMISSION = 'Earlier revisions are omitted by choice: this pack delivers the final version only. The parent revision identifier is kept as provenance.';

export function holodeckLicence() {
  return Buffer.from([
    'SPDX-License-Identifier: CC0-1.0',
    '',
    'The Holodeck scene assets in this archive (models, runtime metadata, saved manifests, previews and Kiln source',
    'programs) are dedicated to the public domain under CC0 1.0 Universal by their owner, Matthew Kissinger, subject',
    'to final release approval. The full legal code is in LICENSES/CC0-1.0.txt and at',
    'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
    '',
    'CC0 applies only to rights the owner holds. Trademark and third-party rights are not waived. Kiln and Holodeck',
    'software keep their own licences.',
    '',
  ].join('\n'));
}

/** Run Kiln's runtime export for one saved revision in a throwaway workspace that holds only a copy of it. */
async function runtimeExport({ kiln, revisionDir, assetId, revisionId, slug }) {
  const workspace = await mkdtemp(join(tmpdir(), 'kiln-holodeck-export-'));
  try {
    await cp(revisionDir, join(workspace, 'assets/kiln', assetId, 'revisions', revisionId), { recursive: true });
    const out = join(workspace, 'out', `${slug}.glb`);
    const cli = pathToFileURL(join(kiln, 'dist/cli.mjs')).href;
    const script = `const { main } = await import(${JSON.stringify(cli)}); await main(${JSON.stringify(['export', assetId, revisionId, '--profile', 'runtime', '--out', out, '--json'])});`;
    const receipt = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: workspace,
      env: { ...process.env, KILN_WORKSPACE: workspace, KILN_PROGRAM_STORE: join(workspace, '.kiln/programs') },
      maxBuffer: 16 * 1024 * 1024,
    }).toString('utf8'));
    if (!receipt.ok || receipt.profile !== 'runtime' || receipt.assetId !== assetId || receipt.revisionId !== revisionId) throw new Error(`Runtime export failed for ${slug}`);
    const files = Object.fromEntries(await Promise.all(receipt.files.map(async (file) => [file.kind, verifyBytes(await readFile(file.path), { bytes: file.bytes, sha256: strip(file.sha256) }, `${slug} ${file.kind}`)])));
    if (!files.glb || !files.metadata) throw new Error(`Runtime export for ${slug} lacks its GLB or metadata`);
    return files;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/** Immutable mirror writes: an existing file must already hold exactly these bytes. */
async function writeImmutable(root, path, bytes) {
  const target = join(root, assetPath(path));
  try {
    const prior = await readFile(target);
    if (!prior.equals(bytes)) throw new Error(`Existing staged file differs; use a new release: ${path}`);
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export async function stageHolodeck({ kiln, mirror, stores, selectionFile = join(PACKS_ROOT, 'selection.json'), site = SITE, packsRoot = PACKS_ROOT, exporter = runtimeExport }) {
  if (!kiln || !mirror || !stores || !Object.keys(stores).length) throw new Error('Explicit Kiln package, mirror and stores are required');
  const selection = json(await readFile(selectionFile));
  if (selection.schemaVersion !== 1 || selection.licence !== 'CC0-1.0' || !/^[a-z0-9-]+$/.test(selection.release)) throw new Error('Invalid Holodeck selection');
  const kilnVersion = json(await readFile(join(kiln, 'package.json'))).version;
  const release = selection.release, prefix = holodeckPrefix(release);
  const licence = holodeckLicence(), cc0 = await readFile(join(packsRoot, 'LICENSES/CC0-1.0.txt'));
  const output = new Map(), lightweight = new Map(), staged = {};
  const add = (path, bytes) => {
    const full = prefix + assetPath(path);
    if (output.has(full)) throw new Error(`Duplicate staged output: ${full}`);
    output.set(full, Buffer.from(bytes));
    return { path: full, url: ASSET_BASE + full, bytes: bytes.length, sha256: hashBytes(bytes) };
  };

  for (const [slug, chosen] of Object.entries(selection.assets)) {
    const presentation = HOLODECK_ASSETS[slug];
    if (!presentation) throw new Error(`No gallery presentation for ${slug}`);
    if (!stores[chosen.store]) throw new Error(`No --store given for ${chosen.store}`);
    const revisionDir = join(stores[chosen.store], chosen.assetId, 'revisions', chosen.revisionId);
    const manifestBytes = verifyBytes(await readFile(join(revisionDir, 'manifest.json')), chosen.manifest, `${slug} manifest`);
    const manifest = json(manifestBytes);
    if (manifest.assetId !== chosen.assetId || manifest.revisionId !== chosen.revisionId || !manifest.editable) throw new Error(`${slug}: saved revision identity differs from the selection`);
    // A revision that uses saved materials ships their closure in its editable bundle, verified against the selection.
    const dependencies = (manifest.build?.dependencies ?? []).filter(isSavedMaterialDependency);
    if (Boolean(dependencies.length) !== Boolean(chosen.materials)) throw new Error(`${slug}: the selection and the saved revision disagree about a material closure`);
    let materialResources;
    if (dependencies.length) {
      materialResources = json(verifyBytes(await readFile(join(revisionDir, 'materials.kiln.json')), chosen.materials, `${slug} material closure`));
      materialClosure(materialResources, dependencies.map((dependency) => dependency.manifest));
    }
    const files = {};
    for (const [name, seal] of Object.entries(manifest.files)) files[name] = verifyBytes(await readFile(join(revisionDir, name)), { bytes: seal.bytes, sha256: strip(seal.sha256) }, `${slug}/${name}`);
    const canonical = verifyBytes(files['asset.glb'], chosen.canonical, `${slug} canonical`);
    const source = verifyBytes(files['source.kiln.js'], chosen.source, `${slug} source`);
    const { glb: runtime, metadata } = await exporter({ kiln, revisionDir, assetId: chosen.assetId, revisionId: chosen.revisionId, slug });
    verifyRuntimeProfile(canonical, runtime, metadata, slug);
    const meta = json(metadata);
    if (meta.source?.assetId !== manifest.assetId || meta.source?.revisionId !== manifest.revisionId || strip(meta.source?.glbSha256 ?? '') !== hashBytes(canonical) || strip(meta.source?.sourceSha256 ?? '') !== hashBytes(source)) throw new Error(`${slug}: runtime sidecar names another revision`);
    // Final versions only: an earlier revision is left out by choice, and the inventory says so rather than
    // listing it as unavailable.
    const entry = {
      slug, collection: chosen.collection, assetId: manifest.assetId, revisionId: manifest.revisionId,
      ...(manifest.parentRevision ? { parentRevision: manifest.parentRevision } : {}),
      includedRevisions: [manifest.revisionId], missingParents: [],
      omittedParents: manifest.parentRevision ? [manifest.parentRevision] : [],
      ...(manifest.parentRevision ? { omission: HOLODECK_OMISSION } : {}),
      historyScope: 'selected-only', sourceSha256: hashBytes(source),
    };
    const editable = revisionBundle({ manifest, files, ...(materialResources ? { materialResources } : {}) });
    verifyArchive(editable, 'editable');
    const runtimeFiles = { [`models/${slug}.glb`]: runtime, [`models/${slug}.kiln-metadata.json`]: metadata, 'LICENSE.txt': licence, 'LICENSES/CC0-1.0.txt': cc0 };
    const identity = `${chosen.collection}/${manifest.assetId}/${manifest.revisionId}`;
    lightweight.set(`sources/${identity}/source.kiln.js`, source);
    lightweight.set(`sources/${identity}/manifest.json`, manifestBytes);
    staged[slug] = {
      entry, runtime, metadata, editable, identity,
      asset: {
        slug, name: presentation.name, description: presentation.description, category: presentation.category,
        pack: chosen.placements[0].pack, packs: [...new Set(chosen.placements.map((placement) => placement.pack))],
        placements: chosen.placements,
        collection: chosen.collection, assetId: manifest.assetId, revisionId: manifest.revisionId,
        ...(manifest.parentRevision ? { parentRevision: manifest.parentRevision } : {}),
        sourcePath: `packs/holodeck/sources/${identity}/source.kiln.js`, sourceSha256: entry.sourceSha256,
        runtimeModelDownload: add(`models/${slug}.glb`, runtime),
        runtimeDownload: add(`runtime/${slug}.zip`, buildDeliveryArchive({ profile: 'runtime', group: HOLODECK_ID, assets: [entry], files: runtimeFiles })),
        editableDownload: add(`editable/${slug}.zip`, editable),
        poster: null,
        metrics: metricsOf(canonical, manifest),
        review: holodeckApproved(slug, manifest.revisionId) ? { ownerAccepted: true, status: 'accepted' } : { ownerAccepted: false, status: 'awaiting-owner-review' },
        historyScope: 'selected-only',
      },
    };
  }

  const packs = [];
  for (const spec of HOLODECK_PACKS) {
    const chosen = selection.packs[spec.id];
    if (!chosen || chosen.assets.length !== spec.expectedAssets) throw new Error(`${spec.id}: the selection does not hold ${spec.expectedAssets} assets`);
    const members = chosen.assets.map((slug) => staged[slug]);
    const inventory = members.map((member) => member.entry);
    const readme = Buffer.from(`${spec.name} (Holodeck scene pack, ${release})\n\n${spec.description}\n\nRuntime assets: GLBs under models/ with Kiln runtime metadata sidecars. They need no Kiln install.\nFull Kiln assets: each ZIP under revisions/ is a standard Kiln revision bundle (model, exact source, editing manifest and preview). Import one with node kiln.mjs import revision.zip, using Kiln ${kilnVersion} or later. These are final versions only: earlier revisions are omitted by choice, and each parent revision identifier is kept as provenance (delivery.json lists them under omittedParents).\n\nAsset licence: CC0-1.0 (LICENSE.txt, LICENSES/CC0-1.0.txt).\n`);
    const runtimeMembers = { 'LICENSE.txt': licence, 'LICENSES/CC0-1.0.txt': cc0, 'README.txt': readme };
    const editableMembers = { 'LICENSE.txt': licence, 'LICENSES/CC0-1.0.txt': cc0, 'README.txt': readme };
    for (const member of members) {
      runtimeMembers[`models/${member.asset.slug}.glb`] = member.runtime;
      runtimeMembers[`models/${member.asset.slug}.kiln-metadata.json`] = member.metadata;
      editableMembers[`revisions/${member.identity}.zip`] = member.editable;
    }
    const approved = members.every((member) => member.asset.review.ownerAccepted);
    packs.push({
      id: spec.id, scene: spec.scene, name: spec.name, description: spec.description,
      available: approved, status: approved ? 'Available' : 'Owner review pending', assetCount: members.length,
      source: chosen.source, assets: chosen.assets,
      ...(chosen.sceneStillPlacesEarlier ? { sceneStillPlacesEarlier: chosen.sceneStillPlacesEarlier } : {}),
      downloads: [
        { profile: 'runtime', label: 'Runtime assets', ...add(`${spec.id}-runtime.zip`, buildDeliveryArchive({ profile: 'runtime', group: spec.id, assets: inventory, files: runtimeMembers })) },
        { profile: 'editable', label: 'Full Kiln assets (remixable)', ...add(`${spec.id}-editable.zip`, buildDeliveryArchive({ profile: 'editable', group: spec.id, assets: inventory, files: editableMembers })) },
      ],
    });
  }

  // Lightweight records are immutable once kept; check them all before writing anything.
  for (const [path, bytes] of lightweight) {
    try { if (!(await readFile(join(packsRoot, path))).equals(bytes)) throw new Error(`Existing source record conflict: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const manifestFile = join(site, 'src/data/mirror-manifest.json'), planFile = join(site, 'src/data/commons-build.json');
  const pins = await readJson(manifestFile);
  for (const [path, bytes] of output) {
    const prior = pins.files.find((record) => record.path === path);
    if (prior && (prior.sha256 !== hashBytes(bytes) || prior.bytes !== bytes.length)) throw new Error(`A different file is already pinned at ${path}; use a new release`);
  }
  for (const [path, bytes] of output) await writeImmutable(mirror, path, bytes);
  for (const [path, bytes] of lightweight) { const target = join(packsRoot, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  // A new release replaces every earlier unpublished Holodeck download pin; posters are pinned separately.
  const kept = pins.files.filter((record) => !record.path.startsWith(`packs/${HOLODECK_ID}/`) || output.has(record.path));
  const pinned = new Set(kept.map((record) => record.path));
  await writeJson(manifestFile, { ...pins, files: [...kept, ...[...output].filter(([path]) => !pinned.has(path)).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hashBytes(bytes) }))] });
  const plan = await readJson(planFile);
  const viewerModels = Object.values(staged).map((member) => member.asset.runtimeModelDownload.path);
  await writeJson(planFile, { ...plan, viewerModels: [...(plan.viewerModels ?? []).filter((path) => !path.startsWith(`packs/${HOLODECK_ID}/`)), ...viewerModels] });

  let recorded;
  try { recorded = await readJson(join(site, 'src/data/rig-posters.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const assets = applyRigPosters(Object.values(staged).map((member) => member.asset), HOLODECK_ID, recorded);
  const catalog = {
    schemaVersion: 1, id: HOLODECK_ID, release, base: ASSET_BASE,
    licence: { spdx: 'CC0-1.0', note: 'Dedicated to the public domain by the owner, subject to final release approval. Kiln and Holodeck software keep their own licences.' },
    runtimeExporter: `@instruktlabs/kiln@${kilnVersion}`,
    packs, planned: HOLODECK_PLANNED, assets,
  };
  await writeJson(join(site, 'src/data/holodeck.json'), catalog);
  return { catalog, files: output.size, bytes: [...output.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
}

/** The pinned Holodeck objects (downloads and posters) as a publish-assets.mjs upload list, each verified in the mirror. */
export async function holodeckUploadList({ mirror, site = SITE }) {
  const catalog = await readJson(join(site, 'src/data/holodeck.json'));
  // Posters stay valid across releases that keep a model's bytes, so they are listed by what the catalog uses.
  const posters = new Set(catalog.assets.map((asset) => asset.poster?.inputPath).filter(Boolean));
  const records = (await readJson(join(site, 'src/data/mirror-manifest.json'))).files.filter((record) => record.path.startsWith(holodeckPrefix(catalog.release)) || posters.has(record.path));
  for (const record of records) verifyBytes(await readFile(join(mirror, assetPath(record.path))), record, record.path);
  const missingPosters = catalog.assets.filter((asset) => !asset.poster).map((asset) => asset.slug);
  if (missingPosters.length) throw new Error(`Render the Holodeck posters before listing uploads: ${missingPosters.join(', ')}`);
  return records;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = { stores: {} };
  const uploadList = args.includes('--upload-list');
  const rest = args.filter((arg) => arg !== '--upload-list');
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--store') { const [name, dir] = value.split(/=(.*)/s); options.stores[name] = await realpath(dir); }
    else if (['--kiln', '--mirror'].includes(flag)) options[flag.slice(2)] = resolve(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  if (uploadList) {
    const records = await holodeckUploadList(options);
    const file = join(options.mirror, 'holodeck-upload-list.json');
    await writeFile(file, JSON.stringify(records, null, 2) + '\n');
    console.log(JSON.stringify({ file, files: records.length, bytes: records.reduce((sum, record) => sum + record.bytes, 0) }, null, 2));
  } else {
    const { catalog, files, bytes } = await stageHolodeck(options);
    console.log(JSON.stringify({ release: catalog.release, files, bytes, packs: catalog.packs.map((pack) => ({ id: pack.id, assets: pack.assetCount, downloads: pack.downloads.map((d) => ({ profile: d.profile, bytes: d.bytes, sha256: d.sha256 })) })) }, null, 2));
  }
}
