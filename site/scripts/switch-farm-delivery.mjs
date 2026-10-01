import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ASSET_BASE, assetPath, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';
import { imageRecord, inspectGlb } from './generate-commons.mjs';
import { applyOwnerAcceptance } from './content-evidence.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
const readJson = async (path) => parse(await readFile(path));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const names = { 'claude-opus-5-5': 'Claude Opus 5.5', 'gpt-6-astra': 'GPT-6 Astra', 'gemini-3.8-flash-high': 'Gemini 3.8 Flash High' };

/** Handoffs may express file inventories as keyed objects or arrays. No unsealed path is accepted. */
export function handoffRecords(handoff) {
  const rows = [];
  for (const collection of [handoff.files, handoff.downloads, handoff.changedMedia, handoff.evidence]) {
    if (!collection) continue;
    for (const [key, record] of Array.isArray(collection) ? collection.map((value) => [null, value]) : Object.entries(collection)) {
      if (!record || typeof record !== 'object') throw new Error('Handoff file lacks a SHA-256/size seal');
      const localPath = record.localPath ?? record.sourcePath ?? record.file ?? record.archive ?? record.path ?? key;
      if (!localPath || !Number.isSafeInteger(record.bytes) || !/^((sha256:)?[a-f0-9]{64})$/.test(record.sha256 ?? '')) throw new Error(`Handoff file lacks a SHA-256/size seal: ${localPath ?? key}`);
      let publicPath = record.r2Path ?? record.publicPath ?? record.targetPath;
      if (publicPath?.startsWith(ASSET_BASE)) publicPath = publicPath.slice(ASSET_BASE.length);
      if (publicPath) assetPath(publicPath);
      rows.push({ ...record, localPath, publicPath, sha256: record.sha256.replace(/^sha256:/, '') });
    }
  }
  return rows;
}

export function changedAssetMedia(asset, previous, records) {
  if (asset.revisionId === previous.revisionId) return null;
  const mediaFor = (kind) => records.find((entry) => (entry.assetId === asset.id || entry.asset === asset.id || entry.id === asset.id || entry.publicPath?.endsWith(`/${kind}/${asset.id}.webp`) || entry.publicPath?.endsWith(`/${kind}/${asset.id}.png`)) && (entry.kind === kind || entry.role === kind || entry.publicPath?.includes(`/${kind}/`)));
  const cutout = mediaFor('cutout'); const poster = mediaFor('poster');
  if (!cutout || !poster) throw new Error(`Changed revision ${asset.id} requires sealed cutout and poster media in site-handoff.json`);
  for (const media of [cutout, poster]) if (media.revisionId && media.revisionId !== asset.revisionId) throw new Error(`Media revision disagrees with ${asset.id}`);
  return { cutout, poster };
}

/** Switch only from a supplied, sealed handoff. Source archives are read-only; staged copies stay in site/.cache. */
export async function switchFarmDelivery({ handoff: handoffPath, revision: requestedRevision, sourceRoot, dataDir = join(SITE, 'src/data'), cache = join(SITE, '.cache/commons') }) {
  const handoffBytes = await readFile(handoffPath);
  const handoff = parse(handoffBytes);
  const documented = handoff.kind === 'shapes-and-seasons-farm-site-handoff';
  if (documented && !sourceRoot) throw new Error('This handoff uses workspace-relative paths; supply --source-root DIR');
  const revision = requestedRevision ?? handoff.deliveryRevision ?? (/^r\d+$/.test(handoff.revision ?? '') ? handoff.revision : null) ?? basename(dirname(handoffPath)).match(/farm-(r\d+)-documented-downloads/)?.[1];
  if (!/^r\d+$/.test(revision ?? '')) throw new Error('Supply --revision r34 or a handoff in farm-r34-documented-downloads');
  const base = `packs/farm/${revision}/`;
  const records = handoffRecords(handoff);
  const directory = dirname(resolve(handoffPath));
  const inputRoot = sourceRoot ? resolve(sourceRoot) : directory;
  const baseline = await readJson(join(dataDir, 'packs/farm.json'));
  const manifest = await readJson(join(dataDir, 'mirror-manifest.json'));
  const oldPlan = await readJson(join(dataDir, 'commons-build.json'));
  const owner = await readJson(join(dataDir, 'owner-review.json'));
  const inputBytes = new Map(); const newPins = [];
  const recordFor = (file) => {
    const record = records.find((entry) => basename(entry.localPath.replaceAll('\\', '/')) === file);
    if (!record) throw new Error(`Handoff does not seal ${file}`);
    return record;
  };
  const readSealed = async (record, defaultPublicPath) => {
    const local = isAbsolute(record.localPath) ? record.localPath : resolve(inputRoot, assetPath(record.localPath.replaceAll('\\', '/')));
    if (sourceRoot && (relative(inputRoot, local).startsWith('..') || isAbsolute(relative(inputRoot, local)))) throw new Error('Handoff source path escapes --source-root');
    const bytes = await readFile(local); verifyBytes(bytes, record, basename(local));
    const path = assetPath(record.publicPath ?? defaultPublicPath);
    if (!path.startsWith('packs/farm/') && !path.startsWith('media/farm/')) throw new Error(`Handoff public path is not a Farm asset: ${path}`);
    inputBytes.set(path, bytes);
    const pin = { path, bytes: bytes.length, sha256: hashBytes(bytes) };
    if (!newPins.some((item) => item.path === path)) newPins.push(pin);
    return { path, bytes };
  };
  const indexFile = await readSealed(recordFor('downloads.json'), `${base}downloads.json`);
  const index = parse(indexFile.bytes);
  if (typeof index.fullPackAccepted !== 'boolean' || !index.projectRevision) throw new Error('Download index must record exact project revision and acceptance');
  if (documented && (handoff.pack.projectRevision !== index.projectRevision || handoff.acceptance.fullPackAccepted !== index.fullPackAccepted || handoff.acceptance.approvedAssets !== handoff.pack.assetCount)) throw new Error('Handoff acceptance or project revision disagrees with download index');
  const archives = new Map();
  for (const profile of ['runtime', 'editable', 'scene']) {
    const item = index.downloads.find((entry) => entry.profile === profile);
    if (!item) throw new Error(`Download index is missing ${profile}`);
    const sealed = await readSealed(recordFor(item.archive), `${base}${item.archive}`);
    verifyBytes(sealed.bytes, item, item.archive);
    const archive = verifyArchive(sealed.bytes);
    if (archive.manifest.projectRevision !== index.projectRevision || archive.manifest.fullPackAccepted !== index.fullPackAccepted) throw new Error(`Archive and download index disagree on ${profile} revision/acceptance`);
    archives.set(profile, { ...archive, path: sealed.path });
  }
  const runtime = archives.get('runtime'); const editable = archives.get('editable');
  const sourceAssets = runtime.manifest.assets;
  if (sourceAssets.length !== baseline.assets.length) throw new Error('Handoff inventory count changed; review the website catalog before switching');
  const currentReviews = new Map(baseline.ownerReview.revisions.map((entry) => [entry.id, entry]));
  const toImage = async (record, asset, kind, alt) => {
    const sealed = await readSealed(record, `media/farm/${revision}/${kind}/${asset.id}${/\.png$/i.test(record.localPath) ? '.png' : '.webp'}`);
    const meta = await sharp(sealed.bytes).metadata();
    return imageRecord(sealed.path, meta.width, meta.height, alt);
  };
  const stagePreview = async (asset, record) => {
    const member = assetPath(record.member);
    const bytes = runtime.files[member];
    if (!bytes) throw new Error(`Sealed preview member missing: ${member}`);
    verifyBytes(bytes, record, member);
    const path = `media/farm/${revision}/poster/${asset.id}.png`;
    inputBytes.set(path, bytes); newPins.push({ path, bytes: bytes.length, sha256: hashBytes(bytes) });
    const meta = await sharp(bytes).metadata();
    return { ...imageRecord(path, meta.width, meta.height, `Six saved review views of ${asset.name ?? asset.id}.`), sourceRevisionId: asset.revisionId, exactRevision: true };
  };
  const models = []; const sources = []; const uploads = []; const assets = [];
  for (const asset of sourceAssets) {
    const previous = baseline.assets.find((entry) => entry.id === asset.id);
    if (!previous) throw new Error(`Unreviewed new asset in handoff: ${asset.id}`);
    const metadata = parse(runtime.files[`models/${asset.id}.json`]);
    if (metadata.revisionId !== asset.revisionId) throw new Error(`Runtime revision mismatch: ${asset.id}`);
    const runtimeMember = metadata.runtime.file;
    const glb = runtime.files[runtimeMember]; const sourceMember = `sources/${asset.id}.kiln.js`; const source = editable.files[sourceMember];
    verifyBytes(glb, metadata.runtime, runtimeMember);
    if (hashBytes(source) !== metadata.source.sourceSha256.replace(/^sha256:/, '')) throw new Error(`Editable source revision mismatch: ${asset.id}`);
    const metrics = inspectGlb(glb);
    if (metrics.triangles !== asset.triangles) throw new Error(`Runtime metrics disagree: ${asset.id}`);
    const handoffAsset = handoff.assets?.find((entry) => entry.id === asset.id);
    if (documented && (!handoffAsset || handoffAsset.revisionId !== asset.revisionId || handoffAsset.ownerApproval?.verdict !== 'accepted')) throw new Error(`Handoff owner approval does not identify ${asset.id}`);
    let poster = previous.poster; let reviewImage = previous.reviewImage;
    if (asset.revisionId !== previous.revisionId) {
      if (documented) {
        const mediaValidity = handoff.media?.r33SiteMediaValidity?.find((entry) => entry.media === previous.poster.inputPath);
        const changes = handoff.farmhouse?.changes;
        if (asset.id !== 'farmhouse' || handoff.farmhouse?.before?.revisionId !== previous.revisionId || handoff.farmhouse?.after?.revisionId !== asset.revisionId || !changes?.boundsUnchanged || changes.materialChanges !== 0 || changes.exteriorRayProbes?.identical !== true || changes.exteriorRayProbes?.count !== 132 || !/^(expected )?valid/.test(mediaValidity?.status ?? '')) throw new Error(`Changed revision ${asset.id} lacks verified exterior-image reuse evidence`);
        poster = { ...previous.poster, sourceRevisionId: previous.revisionId, exactRevision: false, revisionQualification: `Exterior view from ${baseline.revision}, revision ${previous.revisionId}. Exterior geometry and bounds are unchanged; this view was not re-rendered for ${revision}, so window tint may differ.` };
        if (!handoffAsset.preview) throw new Error(`Changed revision ${asset.id} lacks a sealed preview`);
        reviewImage = await stagePreview(asset, handoffAsset.preview);
      } else {
        const imagery = changedAssetMedia(asset, previous, records);
        poster = { ...await toImage(imagery.cutout, asset, 'cutout', previous.poster.alt), sourceRevisionId: asset.revisionId, exactRevision: true };
        reviewImage = { ...await toImage(imagery.poster, asset, 'poster', previous.reviewImage.alt), sourceRevisionId: asset.revisionId, exactRevision: true };
      }
    }
    const accepted = currentReviews.get(asset.id);
    if (!accepted || accepted.revisionId !== asset.revisionId || !accepted.ownerAccepted) throw new Error(`Current owner acceptance does not identify the delivered revision: ${asset.id}`);
    const history = asset.authorship.history.map((entry) => ({ stage: entry.stage, revisionId: entry.revisionId, parentRevisionId: entry.parentRevisionId, model: names[entry.confirmed?.model ?? entry.requested?.model] ?? entry.confirmed?.model ?? entry.requested?.model, modelId: entry.confirmed?.model ?? entry.requested?.model, requestedEffort: entry.requested?.effort ?? null, confirmedEffort: entry.confirmed?.effort ?? null, harness: entry.harness?.name ?? null, harnessVersion: entry.harness?.version ?? null, confirmation: entry.confirmation ?? 'Not recorded' }));
    const downloadPath = `${base}models/${asset.id}.glb`;
    const download = { path: downloadPath, url: `${ASSET_BASE}${downloadPath}`, bytes: glb.length, sha256: hashBytes(glb), archive: runtime.path, member: runtimeMember };
    models.push({ archive: runtime.path, member: runtimeMember, output: previous.modelPath.slice(1), bytes: glb.length, sha256: hashBytes(glb) });
    sources.push({ archive: editable.path, member: sourceMember, output: previous.sourcePath.slice(1), bytes: source.length, sha256: hashBytes(source) });
    uploads.push(download);
    assets.push({ ...previous, revisionId: asset.revisionId, parentRevision: history.at(-1)?.parentRevisionId ?? null, metrics, sourceSha256: hashBytes(source), runtimeDownload: download, poster, reviewImage, provenance: { originalModel: names[asset.authorship.originalModel] ?? asset.authorship.originalModel, refinementModels: asset.authorship.refinementModels.map((id) => names[id] ?? id), history }, revisions: history, review: { status: 'accepted', ownerAccepted: true, scope: 'Exact delivered revision matches the current owner-accepted revision.', recordedAt: owner.date, source: owner.source } });
  }
  let scenePoster = baseline.scene.poster;
  const sceneRecord = records.find((entry) => entry.kind === 'scene' || entry.role === 'scene' || entry.publicPath?.includes('/scene/'));
  if (sceneRecord) scenePoster = await toImage(sceneRecord, { id: 'farm-scene-wide' }, 'scene', baseline.scene.poster.alt);
  else if (documented) {
    const validity = handoff.media?.r33SiteMediaValidity?.find((entry) => entry.media.includes('/scene/'));
    if (!validity?.status.startsWith('valid for layout and exterior')) throw new Error('Handoff lacks scene-poster reuse evidence');
    const sourceDelivery = baseline.scene.poster.sourceDelivery ?? baseline.revision;
    scenePoster = { ...baseline.scene.poster, sourceDelivery, exactRevision: false, revisionQualification: `Scene view from ${sourceDelivery}. Layout and exterior are unchanged; it was not re-captured for ${revision}. Farmhouse windows may differ at pixel level.` };
  }
  let farm = { ...baseline, revision, projectRevision: index.projectRevision, fullPackAccepted: index.fullPackAccepted, ownerApprovedAssets: assets.length, assets, downloads: index.downloads.map((entry) => ({ ...baseline.downloads.find((old) => old.profile === entry.profile), ...entry, sha256: entry.sha256.replace(/^sha256:/, ''), path: archives.get(entry.profile).path, url: `${ASSET_BASE}${archives.get(entry.profile).path}`, compatibility: handoff.downloads?.find((record) => record.profile === entry.profile)?.compatibility ?? baseline.downloads.find((old) => old.profile === entry.profile)?.compatibility })), scene: { ...baseline.scene, assetBase: `${ASSET_BASE}${base}`, poster: scenePoster }, handoff: { source: `farm-pilot/delivery/farm-${revision}-documented-downloads/site-handoff.json`, sha256: hashBytes(handoffBytes), previousDelivery: baseline.revision } };
  farm.deliveryHistory = baseline.deliveryHistory ?? [];
  if (baseline.revision !== revision && !farm.deliveryHistory.some((entry) => entry.revision === baseline.revision)) farm.deliveryHistory = [...farm.deliveryHistory, { revision: baseline.revision, projectRevision: baseline.projectRevision, fullPackAccepted: baseline.fullPackAccepted, acceptedAssets: baseline.deliveryReview?.acceptedAssets ?? baseline.ownerApprovedAssets, total: baseline.assetCount, downloads: baseline.downloads.map(({ profile, path, bytes, sha256 }) => ({ profile, path, bytes, sha256 })) }];
  if (documented) farm.qualification = { performanceQualified: handoff.acceptance.performanceQualified, publicationAuthorized: handoff.acceptance.publicationAuthorized, note: 'Owner approval records visual review. Scene performance qualification remains open.' };
  farm = applyOwnerAcceptance(farm, owner);
  const images = [...assets.flatMap((asset) => [asset.poster, asset.reviewImage]), farm.scene.poster, farm.floorRevision.before, farm.floorRevision.after, ...oldPlan.images.filter((image) => !image.inputPath.startsWith('media/farm/'))];
  const plan = { ...oldPlan, images, archives: [...archives.values()].map((archive) => archive.path).concat(oldPlan.archives.filter((path) => !path.startsWith('packs/farm/'))), models: models.concat(oldPlan.models.filter((model) => !model.output.startsWith('models/farm/'))), sources: sources.concat(oldPlan.sources.filter((source) => !baseline.assets.some((asset) => asset.sourcePath === `/${source.output}`))) };
  // All required data, hashes, media and identities have passed before any persistent catalog mutation.
  for (const [path, bytes] of inputBytes) { const target = join(cache, 'mirror', path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  for (const record of uploads) { const target = join(cache, 'upload', record.path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, runtime.files[record.member]); }
  await writeJson(join(dataDir, 'packs/farm.json'), farm);
  await writeJson(join(dataDir, 'commons-build.json'), plan);
  await writeJson(join(dataDir, 'mirror-manifest.json'), { ...manifest, files: manifest.files.filter((file) => !newPins.some((pin) => pin.path === file.path)).concat(newPins) });
  await writeJson(join(dataDir, 'upload-manifest.json'), { base: ASSET_BASE, note: 'Additional exact GLBs extracted from the sealed runtime ZIP; upload only after owner authorization.', files: uploads });
  return { revision, assets: assets.length, fullPackAccepted: farm.fullPackAccepted, newPinnedFiles: newPins.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => { if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]); return pairs; }, []));
  if (!args.handoff) throw new Error('Usage: node scripts/switch-farm-delivery.mjs --handoff /path/to/site-handoff.json [--source-root DIR] [--revision r34]');
  console.log(JSON.stringify(await switchFarmDelivery({ ...args, sourceRoot: args['source-root'] }), null, 2));
}
