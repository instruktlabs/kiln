import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDeliveryArchive, isSavedMaterialDependency, revisionBundle } from './asset-delivery.mjs';
import sharp from 'sharp';
import { readJson, syncGroup, writeJson } from './media-pins.mjs';
import { imageSrcsets } from './media-variants.mjs';
import { ASSET_BASE, assetPath, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';
import { HOLODECK_ASSETS, HOLODECK_ID, HOLODECK_IMPORT_KILN, HOLODECK_PACKS, HOLODECK_PLANNED, HOLODECK_SHOT_SIZE, HOLODECK_SHOTS, holodeckApproved } from './holodeck-spec.mjs';
import { materialClosure, metricsOf, verifyRuntimeProfile } from './stage-cabin-woods.mjs';

/**
 * Stage the Holodeck scene packs from the frozen selection (`packs/holodeck/selection.json`) and the read-only Kiln
 * stores that hold its saved revisions. Every revision is verified against the selection before anything is written.
 * Runtime GLBs come from Kiln's own runtime export profile and must keep the canonical binary exactly.
 *
 *   node scripts/stage-holodeck.mjs --kiln KILN_PACKAGE_DIR --mirror .localdata/holodeck-delivery \
 *     --store island-trial=DIR --store holodeck-assets=DIR --store courtyard-plaza=DIR --store tropical-island=DIR
 *   node scripts/stage-holodeck.mjs --shots --captures CAPTURE_DIR --mirror .localdata/holodeck-delivery
 *   node scripts/stage-holodeck.mjs --upload-list --mirror .localdata/holodeck-delivery
 *   node scripts/stage-holodeck.mjs --record-published .localdata/holodeck-delivery/holodeck-upload-list.json.published.json
 *   node scripts/stage-holodeck.mjs --recover-store DIR --mirror .localdata/holodeck-delivery [--only slug,slug]
 *
 * A revision whose store is gone is read back from the editable bundle this release already published, verified
 * against every hash the selection freezes; the result names every revision taken that way. `--recover-store`
 * materialises those bundles as a Kiln store again, so a lost store is rebuilt rather than mourned.
 *
 * Generated downloads go to the ignored mirror at content-addressed keys, `packs/holodeck/objects/<sha256>/<file>`,
 * shared by every release that keeps their bytes, and are pinned in `src/data/mirror-manifest.json` for the asset
 * host; lightweight sources and manifests are kept in `packs/holodeck/sources/`. `packs/holodeck/published.json`
 * records the objects the asset host has served back, so the upload list names only new ones. Nothing is uploaded
 * or published.
 */

const SITE = resolve(import.meta.dirname, '..');
const PACKS_ROOT = resolve(SITE, '../packs/holodeck');
const json = (bytes) => JSON.parse(bytes.toString('utf8'));
const strip = (sha) => sha.replace(/^sha256:/, '');
const PUBLISHED = join(PACKS_ROOT, 'published.json');
export const HOLODECK_OBJECTS = `packs/${HOLODECK_ID}/objects/`;
/** A download's key: its SHA-256 names the folder and the file keeps its readable name, so equal bytes share a key. */
export function holodeckObjectPath(name, bytes) {
  if (assetPath(name).includes('/')) throw new Error(`Object names are single files: ${name}`);
  return `${HOLODECK_OBJECTS}${hashBytes(bytes)}/${name}`;
}
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
    if (!prior.equals(bytes)) throw new Error(`Existing staged object differs from its content address: ${path}`);
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

/** Fetch a published object from the asset host. */
const fetchAssetObject = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

/**
 * The one object pinned as an asset's editable revision bundle. Object keys are content-addressed, so the pin is the
 * current revision's bundle whichever release first published it.
 */
export function holodeckBundlePin(pins, slug) {
  const name = `/${slug}-editable.zip`;
  const found = pins.filter((record) => record.path.startsWith(HOLODECK_OBJECTS) && record.path.endsWith(name));
  if (found.length > 1) throw new Error(`More than one object is pinned as ${slug}-editable.zip`);
  return found[0];
}

/** Read a pinned object: from the mirror, else from the asset host once the ledger records it serving the object back. */
async function readPinnedObject(pin, { mirror, published, fetchObject }) {
  if (mirror) {
    try { return verifyBytes(await readFile(join(mirror, assetPath(pin.path))), pin, pin.path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const served = published.get(pin.path);
  if (!served) throw new Error(`${pin.path} is not in the mirror and published.json does not record the asset host serving it back`);
  if (!sameObject(served, pin)) throw new Error(`The asset host holds different bytes at ${pin.path}`);
  return verifyBytes(await fetchObject(ASSET_BASE + pin.path), pin, pin.path);
}

/**
 * One selected revision read back out of its published editable bundle, as its Kiln store held it. The bundle is a
 * standard Kiln revision bundle, so every sealed member is the stored file byte for byte; only its own
 * `manifest.json` is re-serialised without the trailing newline a store writes, so the manifest comes from the
 * `sources/` record this repository keeps. Both are verified against the selection, and the bundle must name the
 * selected revision.
 */
export function holodeckRevisionFromBundle({ slug, chosen, bundle, manifestBytes }) {
  const stored = json(verifyBytes(manifestBytes, chosen.manifest, `${slug} manifest`));
  const { files, manifest, prefix } = verifyArchive(bundle, 'editable');
  if (manifest.assetId !== chosen.assetId || manifest.revisionId !== chosen.revisionId) throw new Error(`${slug}: the published bundle holds ${manifest.assetId}/${manifest.revisionId}, not the selected revision`);
  if (JSON.stringify(manifest) !== JSON.stringify(stored)) throw new Error(`${slug}: the kept manifest and the published bundle describe different revisions`);
  const members = { 'manifest.json': Buffer.from(manifestBytes) };
  for (const name of Object.keys(manifest.files)) members[name] = Buffer.from(files[prefix + name]);
  const materials = files[`${prefix}materials.kiln.json`];
  if (materials) members['materials.kiln.json'] = Buffer.from(materials);
  return members;
}

/** A selected revision's store files, read back from the bundle pinned for it. */
async function revisionFromPublished({ slug, chosen, pins, published, mirror, fetchObject, packsRoot }) {
  const pin = holodeckBundlePin(pins, slug);
  if (!pin) throw new Error(`No editable bundle is pinned for ${slug}: its Kiln store is its only copy`);
  const bundle = await readPinnedObject(pin, { mirror, published, fetchObject });
  const manifestBytes = await readFile(join(packsRoot, `sources/${chosen.collection}/${chosen.assetId}/${chosen.revisionId}/manifest.json`));
  return { pin, members: holodeckRevisionFromBundle({ slug, chosen, bundle, manifestBytes }) };
}

/**
 * Materialise a Kiln store from the published editable bundles, so a lost store can be rebuilt. Each revision is
 * written to `<out>/<assetId>/revisions/<revisionId>` exactly as its store held it; an existing file must already
 * hold those bytes.
 */
export async function recoverHolodeckStore({ out, only, mirror, selectionFile = join(PACKS_ROOT, 'selection.json'), site = SITE, packsRoot = PACKS_ROOT, fetchObject = fetchAssetObject }) {
  if (!out) throw new Error('An explicit output store directory is required');
  const selection = json(await readFile(selectionFile));
  const pins = (await readJson(join(site, 'src/data/mirror-manifest.json'))).files;
  const published = await readLedger(join(packsRoot, 'published.json'));
  const revisions = [];
  for (const [slug, chosen] of Object.entries(selection.assets)) {
    if (only && !only.includes(slug)) continue;
    const { pin, members } = await revisionFromPublished({ slug, chosen, pins, published, mirror, fetchObject, packsRoot });
    for (const [name, bytes] of Object.entries(members)) await writeImmutable(out, `${chosen.assetId}/revisions/${chosen.revisionId}/${name}`, bytes);
    revisions.push({ slug, store: chosen.store, assetId: chosen.assetId, revisionId: chosen.revisionId, bundle: pin.path });
  }
  const unknown = (only ?? []).filter((slug) => !revisions.some((record) => record.slug === slug));
  if (unknown.length) throw new Error(`Not selected: ${unknown.join(', ')}`);
  return { store: out, revisions };
}

/**
 * Suggest the next free `<stem>-<NN>` after a release ID that is already spent, keeping the counter's width.
 */
export function nextHolodeckRelease(release, taken) {
  const match = /^(.*)-(\d+)$/.exec(release);
  if (!match) return undefined;
  const [, stem, counter] = match;
  for (let next = Number(counter) + 1; next < Number(counter) + 100; next++) {
    const candidate = `${stem}-${String(next).padStart(counter.length, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return undefined;
}

/**
 * A release ID names one staged state. `releases.json` records every ID a release has spent and the selection it
 * staged, so a branch cannot quietly reuse an ID another branch already spent on different content: #272 and #273
 * both did, and five generated files had to be merged entry by entry afterwards. Restaging the same selection under
 * the same ID is the normal release loop and changes nothing. An ID recorded without its selection was used before
 * this ledger existed and cannot be reclaimed, because nothing can show it described the same content.
 */
export function claimHolodeckRelease({ release, selection, recorded }) {
  const releases = new Map((recorded?.releases ?? []).map((record) => [record.release, record]));
  const seal = { bytes: selection.length, sha256: hashBytes(selection) };
  const prior = releases.get(release);
  if (prior && !(prior.selection && sameObject(prior.selection, seal))) {
    const free = nextHolodeckRelease(release, new Set(releases.keys()));
    const held = prior.selection ? `a different selection (${prior.selection.sha256.slice(0, 12)})` : 'content this ledger did not record';
    throw new Error(`Release ${release} already staged ${held}: choose a new HOLODECK_RELEASE${free ? `, such as ${free}` : ''}`);
  }
  releases.set(release, { release, selection: seal });
  return { schemaVersion: 1, releases: [...releases.values()].sort((a, b) => a.release.localeCompare(b.release, 'en')) };
}

/**
 * Stage the selection, recovering any revision whose store is gone from its published bundle. The recovery workspace
 * is a throwaway copy of those revisions; the stores themselves stay read-only.
 */
export async function stageHolodeck(options) {
  const recovery = { revisions: [], bundles: new Map() };
  try { return await stageSelection(options, recovery); }
  finally { if (recovery.root) await rm(recovery.root, { recursive: true, force: true }); }
}

async function stageSelection({ kiln, mirror, stores, selectionFile = join(PACKS_ROOT, 'selection.json'), site = SITE, packsRoot = PACKS_ROOT, exporter = runtimeExport, packs: packSpecs = HOLODECK_PACKS, presentations = HOLODECK_ASSETS, approved = holodeckApproved, fetchObject = fetchAssetObject }, recovery) {
  if (!kiln || !mirror || !stores) throw new Error('An explicit Kiln package, mirror and store set are required');
  const selectionBytes = await readFile(selectionFile), selection = json(selectionBytes);
  if (selection.schemaVersion !== 1 || selection.licence !== 'CC0-1.0' || !/^[a-z0-9-]+$/.test(selection.release)) throw new Error('Invalid Holodeck selection');
  const releaseFile = join(packsRoot, 'releases.json');
  let recordedReleases;
  try { recordedReleases = await readJson(releaseFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const releases = claimHolodeckRelease({ release: selection.release, selection: selectionBytes, recorded: recordedReleases });
  const kilnVersion = json(await readFile(join(kiln, 'package.json'))).version;
  const release = selection.release;
  const licence = holodeckLicence(), cc0 = await readFile(join(packsRoot, 'LICENSES/CC0-1.0.txt'));
  const manifestFile = join(site, 'src/data/mirror-manifest.json'), planFile = join(site, 'src/data/commons-build.json');
  const pins = await readJson(manifestFile), published = await readLedger(join(packsRoot, 'published.json'));
  const output = new Map(), names = new Set(), lightweight = new Map(), staged = {};
  const add = (name, bytes) => {
    if (names.has(name)) throw new Error(`Duplicate staged output: ${name}`);
    names.add(name);
    const path = holodeckObjectPath(name, bytes);
    output.set(path, Buffer.from(bytes));
    return { path, url: ASSET_BASE + path, bytes: bytes.length, sha256: hashBytes(bytes) };
  };

  for (const [slug, chosen] of Object.entries(selection.assets)) {
    const presentation = presentations[slug];
    if (!presentation) throw new Error(`No gallery presentation for ${slug}`);
    let revisionDir = stores[chosen.store] && join(stores[chosen.store], chosen.assetId, 'revisions', chosen.revisionId);
    if (!revisionDir || !existsSync(revisionDir)) {
      // The store is gone or no longer holds this revision: read it back from the bundle the release published.
      const { pin, members } = await revisionFromPublished({ slug, chosen, pins: pins.files, published, mirror, fetchObject, packsRoot });
      recovery.root ??= await mkdtemp(join(tmpdir(), 'kiln-holodeck-recovered-'));
      revisionDir = join(recovery.root, chosen.assetId, 'revisions', chosen.revisionId);
      for (const [name, bytes] of Object.entries(members)) await writeImmutable(recovery.root, `${chosen.assetId}/revisions/${chosen.revisionId}/${name}`, bytes);
      recovery.revisions.push({ slug, store: chosen.store, assetId: chosen.assetId, revisionId: chosen.revisionId, bundle: pin.path });
      recovery.bundles.set(slug, pin.path);
    }
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
    // Object keys are content addresses, so a wrong input would quietly land at a new key rather than fail. A
    // recovered revision must rebuild the very bundle it was read from.
    const recoveredFrom = recovery.bundles.get(slug);
    if (recoveredFrom && holodeckObjectPath(`${slug}-editable.zip`, editable) !== recoveredFrom) throw new Error(`${slug}: rebuilding from ${recoveredFrom} did not reproduce it byte for byte`);
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
        runtimeModelDownload: add(`${slug}.glb`, runtime),
        runtimeDownload: add(`${slug}-runtime.zip`, buildDeliveryArchive({ profile: 'runtime', group: HOLODECK_ID, assets: [entry], files: runtimeFiles })),
        editableDownload: add(`${slug}-editable.zip`, editable),
        poster: null,
        metrics: metricsOf(canonical, manifest),
        review: approved(slug, manifest.revisionId) ? { ownerAccepted: true, status: 'accepted' } : { ownerAccepted: false, status: 'awaiting-owner-review' },
        historyScope: 'selected-only',
      },
    };
  }

  const packs = [];
  for (const spec of packSpecs) {
    const chosen = selection.packs[spec.id];
    if (!chosen || chosen.assets.length !== spec.expectedAssets) throw new Error(`${spec.id}: the selection does not hold ${spec.expectedAssets} assets`);
    const members = chosen.assets.map((slug) => staged[slug]);
    const inventory = members.map((member) => member.entry);
    // Neither the release nor the staging exporter appears here, so an unchanged pack keeps its bytes and its key.
    const readme = Buffer.from(`${spec.name} (Holodeck scene pack)\n\n${spec.description}\n\nRuntime assets: GLBs under models/ with Kiln runtime metadata sidecars. They need no Kiln install.\nFull Kiln assets: each ZIP under revisions/ is a standard Kiln revision bundle (model, exact source, editing manifest and preview). Import one with node kiln.mjs import revision.zip, using Kiln ${HOLODECK_IMPORT_KILN} or later. These are final versions only: earlier revisions are omitted by choice, and each parent revision identifier is kept as provenance (delivery.json lists them under omittedParents).\n\nAsset licence: CC0-1.0 (LICENSE.txt, LICENSES/CC0-1.0.txt).\n`);
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
  for (const [path, bytes] of output) {
    const prior = pins.files.find((record) => record.path === path);
    if (prior && (prior.sha256 !== hashBytes(bytes) || prior.bytes !== bytes.length)) throw new Error(`A different file is already pinned at ${path}; use a new release`);
  }
  for (const [path, bytes] of output) await writeImmutable(mirror, path, bytes);
  for (const [path, bytes] of lightweight) { const target = join(packsRoot, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  // Pins follow the current catalog: objects it no longer uses are unpinned, never deleted. Posters are pinned separately.
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
  await writeJson(releaseFile, releases);
  return { catalog, files: output.size, bytes: [...output.values()].reduce((sum, bytes) => sum + bytes.length, 0), recovered: recovery.revisions };
}

export const HOLODECK_SHOTS_DIR = `media/${HOLODECK_ID}/scenes/`;
export const HOLODECK_WORLDS = join(SITE, 'src/data/holodeck-worlds.json');
/** A pack's walkable world on the Holodeck site, as the pack pages link it. */
export const holodeckWorld = (worlds, packId) => new URL(worlds.worldPath.replace('{id}', encodeURIComponent(worlds.worlds[packId])), worlds.site).href;
const sameCamera = (a, b) => JSON.stringify([a?.position, a?.target, a?.fov, a?.cove]) === JSON.stringify([b.position, b.target, b.fov, b.cove]);

/**
 * Stage each pack's two scene shots from a folder written by `scripts/capture-holodeck-shots.mjs`. Every shot must
 * have been captured from its pack's world with the camera the spec declares, on WebGPU, as a PNG at the shot size;
 * its receipt entry becomes the image's capture record and the spec gives its alternative text. Shots are kept at
 * content-addressed keys in the mirror, pinned for the asset host and planned as responsive images;
 * `src/data/holodeck-shots.json` records them.
 */
export async function stageHolodeckShots({ captures, mirror, site = SITE, size = HOLODECK_SHOT_SIZE, shots = HOLODECK_SHOTS, packs = HOLODECK_PACKS, worlds }) {
  if (!captures || !mirror) throw new Error('An explicit captures folder and mirror are required');
  worlds ??= await readJson(HOLODECK_WORLDS);
  const receipt = await readJson(join(captures, 'receipt.json'));
  const record = { schemaVersion: 1, size, packs: {} };
  const output = new Map();
  for (const pack of packs) {
    const list = shots[pack.id];
    if (!Array.isArray(list) || list.length !== 2) throw new Error(`${pack.id}: declare two shots, a wide view first`);
    const world = holodeckWorld(worlds, pack.id);
    record.packs[pack.id] = [];
    for (const { view, camera, alt } of list) {
      const captured = receipt.shots?.[view];
      if (!captured || captured.world !== world || !sameCamera(captured.camera, camera)) throw new Error(`${pack.id}/${view}: no capture from ${world} with the declared camera`);
      if (captured.backend !== 'WebGPU') throw new Error(`${pack.id}/${view}: captured on ${captured.backend}, not WebGPU`);
      const bytes = await readFile(join(captures, `${view}.png`));
      const { format, width, height } = await sharp(bytes).metadata();
      if (format !== 'png' || width !== size.width || height !== size.height) throw new Error(`${pack.id}/${view}: expected a ${size.width}×${size.height} PNG, found ${format} ${width}×${height}`);
      const sha256 = hashBytes(bytes), path = `${HOLODECK_SHOTS_DIR}${sha256}/${view}.png`;
      output.set(path, bytes);
      const { manifestSha256, backend, browser, capturedAt } = captured;
      record.packs[pack.id].push({
        view, src: `/${path.replace(/\.png$/, '.webp')}`, width, height, alt, ...imageSrcsets(path, width), inputPath: path, bytes: bytes.length, sha256,
        capture: { tool: receipt.tool, world, manifestSha256, camera, backend, browser, capturedAt },
      });
    }
  }
  for (const [path, bytes] of output) await writeImmutable(mirror, path, bytes);
  const images = Object.values(record.packs).flat();
  const manifestFile = join(site, 'src/data/mirror-manifest.json'), planFile = join(site, 'src/data/commons-build.json');
  const pins = await readJson(manifestFile);
  for (const image of images) {
    const prior = pins.files.find((pin) => pin.path === image.inputPath);
    if (prior && (prior.sha256 !== image.sha256 || prior.bytes !== image.bytes)) throw new Error(`A different file is already pinned at ${image.inputPath}`);
  }
  const pinned = images.map((image) => ({ path: image.inputPath, bytes: image.bytes, sha256: image.sha256 }));
  await writeJson(manifestFile, { ...pins, files: syncGroup(pins.files, 'path', HOLODECK_SHOTS_DIR, pinned) });
  const plan = await readJson(planFile);
  await writeJson(planFile, { ...plan, images: syncGroup(plan.images ?? [], 'inputPath', HOLODECK_SHOTS_DIR, images.map(({ view, bytes, sha256, capture, ...image }) => image)) });
  await writeJson(join(site, 'src/data/holodeck-shots.json'), record);
  return record;
}

const readLedger = async (ledger) => {
  try { return new Map((await readJson(ledger)).objects.map((record) => [record.path, record])); }
  catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
};
const sameObject = (a, b) => a.sha256 === b.sha256 && a.bytes === b.bytes;

/**
 * The catalog's objects (downloads and posters) that the asset host has not yet served back, as a publish-assets.mjs
 * upload list, each verified in the mirror. Objects recorded in the published ledger are left out.
 */
export async function holodeckUploadList({ mirror, site = SITE, ledger = PUBLISHED }) {
  const catalog = await readJson(join(site, 'src/data/holodeck.json'));
  const missingPosters = catalog.assets.filter((asset) => !asset.poster).map((asset) => asset.slug);
  if (missingPosters.length) throw new Error(`Render the Holodeck posters before listing uploads: ${missingPosters.join(', ')}`);
  let shots = { packs: {} };
  try { shots = await readJson(join(site, 'src/data/holodeck-shots.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const used = new Set([
    ...catalog.assets.flatMap((asset) => [asset.runtimeModelDownload.path, asset.runtimeDownload.path, asset.editableDownload.path, asset.poster.inputPath]),
    ...catalog.packs.flatMap((pack) => pack.downloads.map((download) => download.path)),
    ...Object.values(shots.packs).flat().map((image) => image.inputPath),
  ]);
  const pins = new Map((await readJson(join(site, 'src/data/mirror-manifest.json'))).files.map((record) => [record.path, record]));
  const published = await readLedger(ledger);
  const records = [];
  for (const path of used) {
    const record = pins.get(path);
    if (!record) throw new Error(`The catalog uses an unpinned object: ${path}`);
    const prior = published.get(path);
    if (prior && !sameObject(prior, record)) throw new Error(`The asset host holds different bytes at ${path}`);
    if (!prior) records.push(record);
  }
  for (const record of records) verifyBytes(await readFile(join(mirror, assetPath(record.path))), record, record.path);
  return records;
}

/** Record the objects a publish-assets.mjs receipt read back from the asset host in the published ledger. */
export async function recordHolodeckPublished({ receipt, ledger = PUBLISHED }) {
  const published = await readLedger(ledger);
  let added = 0;
  for (const file of (await readJson(receipt)).files) {
    const record = { path: assetPath(file.path), bytes: file.bytes, sha256: file.sha256 };
    if (typeof file.verifiedUrl !== 'string' || !file.verifiedUrl.startsWith(ASSET_BASE + record.path + '?')) throw new Error(`${record.path} was not read back from the asset host`);
    const prior = published.get(record.path);
    if (prior && !sameObject(prior, record)) throw new Error(`The ledger already holds different bytes at ${record.path}`);
    if (!prior) { published.set(record.path, record); added++; }
  }
  await writeJson(ledger, { schemaVersion: 1, objects: [...published.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')) });
  return { added, objects: published.size };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = { stores: {} };
  const uploadList = args.includes('--upload-list'), shots = args.includes('--shots');
  const rest = args.filter((arg) => arg !== '--upload-list' && arg !== '--shots');
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--store') { const [name, dir] = value.split(/=(.*)/s); options.stores[name] = await realpath(dir); }
    else if (['--kiln', '--mirror', '--captures'].includes(flag)) options[flag.slice(2)] = resolve(value);
    else if (flag === '--record-published') options.receipt = resolve(value);
    else if (flag === '--recover-store') options.out = resolve(value);
    else if (flag === '--only') options.only = value.split(',');
    else throw new Error(`Unknown option ${flag}`);
  }
  if (options.out) {
    console.log(JSON.stringify(await recoverHolodeckStore(options), null, 2));
  } else if (shots) {
    const record = await stageHolodeckShots(options);
    console.log(JSON.stringify({ shots: Object.fromEntries(Object.entries(record.packs).map(([id, images]) => [id, images.map((image) => image.inputPath)])) }, null, 2));
  } else if (options.receipt) {
    console.log(JSON.stringify(await recordHolodeckPublished({ receipt: options.receipt }), null, 2));
  } else if (uploadList) {
    const records = await holodeckUploadList(options);
    const file = join(options.mirror, 'holodeck-upload-list.json');
    await writeFile(file, JSON.stringify(records, null, 2) + '\n');
    console.log(JSON.stringify({ file, files: records.length, bytes: records.reduce((sum, record) => sum + record.bytes, 0) }, null, 2));
  } else {
    const { catalog, files, bytes, recovered } = await stageHolodeck(options);
    console.log(JSON.stringify({ release: catalog.release, files, bytes, recovered, packs: catalog.packs.map((pack) => ({ id: pack.id, assets: pack.assetCount, downloads: pack.downloads.map((d) => ({ profile: d.profile, bytes: d.bytes, sha256: d.sha256 })) })) }, null, 2));
  }
}
