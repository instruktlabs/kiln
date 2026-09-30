import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { ASSET_BASE, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';
import { applyOwnerAcceptance } from './content-evidence.mjs';
import { applyRigBridge, applyRigPosters } from './rig-posters-core.mjs';
import { BRIDGE_CAPTURES, BRIDGE_REVIEW_SHEET, bridgeCaptureFile, bridgeTierFiles } from './bridge-captures.mjs';
import { imageSrcsets } from './media-variants.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const describeAsset = {
  farmhouse: ['Buildings', 'Cream masonry house with a charcoal gabled roof, olive shutters and a timber porch.'],
  barn: ['Buildings', 'Red timber barn with white door bracing, a grey roof and an open side shelter.'],
  windmill: ['Buildings', 'Open timber wind pump with a metal rotor, tail vane and four braced legs.'],
  watermill: ['Buildings', 'Pale masonry mill house with a gabled roof and an exposed timber waterwheel.'],
  'fence-straight': ['Fencing', 'Two timber rails between pointed posts, with a two-metre post-centre span.'],
  'fence-corner': ['Fencing', 'Two matching timber fence runs joined at a right-angle corner post.'],
  'fence-gate': ['Fencing', 'Braced timber gate with visible hinges and a three-metre usable opening.'],
  tractor: ['Vehicles', 'Orange open-seat tractor with rear wheel guards, treaded tyres and a front grille.'],
  trailer: ['Vehicles', 'Four-wheel timber farm trailer with low side boards and a drawbar.'],
  barrel: ['Props', 'Upright wooden barrel with a closed stave lid and three dark metal hoops.'],
  'hay-bale': ['Props', 'Rectangular golden hay bale held by two parallel twine bands.'],
  farmer: ['Characters', 'Farmer in blue overalls and a brimmed hat, carrying a three-prong pitchfork.'],
  cow: ['Animals', 'Brown-and-cream cow with small horns, a pink muzzle and dark hooves.'],
  sheep: ['Animals', 'Sheep with a faceted white fleece, dark face and four dark legs.'],
  chicken: ['Animals', 'White hen with a red comb, yellow legs and raised tail feathers.'],
  'cabbage-stage-1': ['Crops', 'Small cabbage seedling emerging from a low, faceted soil patch.'],
  'cabbage-stage-2': ['Crops', 'Young cabbage with spreading pale-green leaves on a soil patch.'],
  'cabbage-stage-3': ['Crops', 'Open cabbage rosette with layered green leaves and an upright centre.'],
  'cabbage-stage-4': ['Crops', 'Mature pale-green cabbage head held by broad outer leaves.'],
  wheat: ['Crops', 'Cluster of golden wheat stems with narrow leaves and upright seed heads.'],
  'pumpkin-plant': ['Crops', 'Low pumpkin vine with green leaves and two faceted orange fruits.'],
  'faceted-tree': ['Nature', 'Small deciduous tree with a branching brown trunk and a faceted green crown.'],
  'rock-cluster': ['Nature', 'Group of low, pale faceted rocks with a larger central stone.'],
};
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const modelNames = { 'claude-opus-5-5': 'Claude Opus 5.5', 'gpt-6-astra': 'GPT-6 Astra', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'gemini-3.8-flash-high': 'Gemini 3.8 Flash High' };

export function inspectGlb(bytes) {
  const data = Buffer.from(bytes);
  if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error('Invalid GLB header');
  const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)).trim());
  const bounds = new Box3(); let triangles = 0; let meshes = 0;
  const parts = [];
  const visit = (index, parent, parentPath) => {
    const node = json.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local);
    const path = [...parentPath, node.name ?? `node_${index}`];
    if (node.mesh !== undefined) {
      meshes++; parts.push(path.join('/'));
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        const count = primitive.indices !== undefined ? json.accessors[primitive.indices].count : accessor.count;
        triangles += (primitive.mode ?? 4) === 4 ? count / 3 : 0;
        if (!accessor.min || !accessor.max) throw new Error(`GLB position bounds missing: ${path.join('/')}`);
        for (let corner = 0; corner < 8; corner++) bounds.expandByPoint(new Vector3(...[0, 1, 2].map((axis) => ((corner >> axis) & 1) ? accessor.max[axis] : accessor.min[axis])).applyMatrix4(world));
      }
    }
    for (const child of node.children ?? []) visit(child, world, path);
  };
  for (const index of json.scenes[json.scene ?? 0].nodes) visit(index, new Matrix4(), []);
  return { triangles, meshes, materials: json.materials?.length ?? 0, bounds: bounds.getSize(new Vector3()).toArray(), boundsMin: bounds.min.toArray(), boundsMax: bounds.max.toArray(), clips: (json.animations ?? []).map((clip) => clip.name), partPaths: parts };
}

export function selectBridgeArchive(files, revision) {
  const candidates = files.filter((entry) => /^standalone\/golden-gate-bridge\/[^/]+\/golden-gate-editable\.zip$/.test(entry.path));
  if (revision) {
    const selected = candidates.find((entry) => entry.path.includes(`/${revision}/`));
    if (!selected) throw new Error(`Bridge revision not found in manifest: ${revision}`);
    return selected;
  }
  if (candidates.length !== 1) throw new Error('Specify --bridge-revision when the manifest does not contain exactly one Bridge revision');
  return candidates[0];
}

export function imageRecord(path, width, height, description = '') {
  const stem = path.replace(/\.[^.]+$/, '');
  return { src: `/${stem}.webp`, width, height, alt: description, ...imageSrcsets(path, width), inputPath: path };
}

const BRIDGE_DESCRIPTION = 'A metre-scale procedural suspension bridge with Art Deco towers, main cables, suspenders and a six-lane roadway, saved as full, web and far tiers from one Kiln source.';
const BRIDGE_REVIEW_ALT = 'Six saved review views of the Golden Gate Bridge: front, right, back, left, top and three-quarter.';
const BRIDGE_REVIEW = {
  status: 'awaiting-owner-review',
  ownerAccepted: false,
  scope: 'Review 3 is the delivered revision of each tier. The export sizes and hashes, the node changes since review 2 and the roadway profile were checked with tools other than the author’s, and these revisions were accepted as delivered on 29 September 2026. The owner has not signed off the bridge as a gallery asset, and performance in a destination project is not qualified.',
};
const BRIDGE_LIMITS = [
  'Visual reconstruction, not an engineering survey.',
  '1937 suspension composition with requested modern median, lighting and later lateral bracing.',
  'Secondary details include declared estimates.',
  'No terrain, water, traffic, people or approach viaducts. The piers, fender and anchorage bases reach below the waterline (the south tower footing to Y −32 m); no seabed or water surface is modelled.',
  'The far tier is a distance version: it omits the under-deck framing and the expansion joints.',
];

/**
 * The delivery's three tiers, in display order. Each runtime GLB is checked against the accepted pin and measured
 * (never typed); each editable archive is verified and must hold the pinned revision and parent; the export's
 * metadata sidecar must be pinned beside them.
 */
export async function bridgeTierRecords({ tiersFile, base, pinned, fileByPath }) {
  const records = [];
  for (const name of ['full', 'web', 'far']) {
    const tier = tiersFile.tiers.find((entry) => entry.tier === name);
    if (!tier) throw new Error(`The accepted tiers list has no ${name} tier`);
    const files = bridgeTierFiles(name);
    const glb = await pinned(`${base}${files.glb}`);
    verifyBytes(glb, tier.glb, `${name} runtime GLB`);
    const metrics = inspectGlb(glb);
    if (metrics.triangles !== tier.glb.triangles) throw new Error(`${name}: ${metrics.triangles} triangles measured, ${tier.glb.triangles} pinned`);
    const archive = verifyArchive(await pinned(`${base}${files.zip}`), 'editable');
    if (archive.manifest.revisionId !== tier.revision || archive.manifest.parentRevision !== tier.parent) throw new Error(`${name}: the editable archive holds ${archive.manifest.revisionId} (parent ${archive.manifest.parentRevision}), not ${tier.revision} (parent ${tier.parent})`);
    const source = archive.files[`${archive.prefix}source.kiln.js`];
    const file = (name) => {
      const pin = fileByPath.get(`${base}${name}`);
      if (!pin) throw new Error(`No manifest pin for ${base}${name}`);
      return { path: pin.path, bytes: pin.bytes, sha256: pin.sha256, url: `${ASSET_BASE}${pin.path}` };
    };
    records.push({
      tier: name,
      revisionId: tier.revision,
      parentRevision: tier.parent,
      licensed: { revisionId: tier.licensed.revision, parentRevision: tier.licensed.parent },
      metrics: { triangles: metrics.triangles, meshes: metrics.meshes, materials: metrics.materials, bounds: metrics.bounds, boundsMin: metrics.boundsMin, boundsMax: metrics.boundsMax },
      runtime: file(files.glb),
      metadata: file(files.metadata),
      editable: { ...file(files.zip), sourceBytes: source.length, sourceSha256: hashBytes(source) },
    });
  }
  return records;
}

/** The delivery's licence text, verified against its pin; the section names the revisions it was written for. */
export function bridgeLicenceRecord({ tiersFile, base, fileByPath, bytes }) {
  const pin = fileByPath.get(`${base}${tiersFile.licence.file}`);
  if (!pin) throw new Error(`No manifest pin for ${base}${tiersFile.licence.file}`);
  verifyBytes(bytes, tiersFile.licence, tiersFile.licence.file);
  return { file: tiersFile.licence.file, path: pin.path, bytes: pin.bytes, sha256: pin.sha256, url: `${ASSET_BASE}${pin.path}`, section: tiersFile.licence.section, licensedRevisions: tiersFile.tiers.map((tier) => ({ tier: tier.tier, revisionId: tier.licensed.revision, parentRevision: tier.licensed.parent })) };
}

export async function generateCommons({ inputs, mirror, manifest: manifestPath, bridgeRevision, onlyBridge = false, out = join(SITE, 'src/data') }) {
  if (!inputs || !mirror || !manifestPath) throw new Error('Usage: generate-commons.mjs --inputs DIR --mirror DIR --manifest FILE [--bridge-revision REVISION] [--only-bridge] [--out DIR]');
  const manifest = await readJson(manifestPath);
  const fileByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const pinned = async (path) => {
    const record = fileByPath.get(path);
    if (!record) throw new Error(`No manifest pin for ${path}`);
    const bytes = await readFile(join(mirror, path)); verifyBytes(bytes, record, path); return bytes;
  };
  const bridgeRequests = await readJson(join(SITE, 'src/data/bridge-requests.json'));
  const bridgeFirstRequest = bridgeRequests.find((request) => request.stage === 'first');
  const sourcePins = [];
  const derivatives = [];
  const rigRecord = await readJson(join(out, 'rig-posters.json')).catch(() => undefined);
  let farm; let assets;
  if (onlyBridge) {
    farm = await readJson(join(out, 'packs/farm.json'));
  } else {
    const media = await readJson(join(inputs, 'media.json'));
    const scene = await readJson(join(inputs, 'farm/scene.json'));
    const requirements = await readJson(join(inputs, 'farm/production-requirements.json'));
    const owner = await readJson(join(inputs, 'farm/consolidated-owner-review.json'));
    const floor = await readJson(join(inputs, 'farm/farmhouse-floor-review.json'));
    const ownerDecision = await readJson(join(SITE, 'src/data/owner-review.json'));
    const downloadIndex = JSON.parse((await pinned('packs/farm/r33/downloads.json')).toString());
    const farmBase = 'packs/farm/r33/';
    const runtime = verifyArchive(await pinned(`${farmBase}shapes-and-seasons-farm-runtime.zip`));
    const editable = verifyArchive(await pinned(`${farmBase}shapes-and-seasons-farm-editable.zip`));
    const image = (path, alt) => {
      const record = media.find((item) => item.path === path);
      if (!record) throw new Error(`Missing image dimensions for ${path}`);
      if (!fileByPath.has(path)) throw new Error(`Missing image manifest pin for ${path}`);
      return imageRecord(path, record.width, record.height, alt ?? record.description);
    };
    assets = scene.assets.map((asset) => {
      const runtimePath = `models/${asset.id}.glb`;
      const sourceMember = `sources/${asset.id}.kiln.js`;
      const glb = runtime.files[runtimePath]; const source = editable.files[sourceMember];
      if (!glb || !source) throw new Error(`Archive lacks asset ${asset.id}`);
      verifyBytes(glb, { bytes: asset.runtimeBytes, sha256: asset.runtimeSha256 }, asset.id);
      if (hashBytes(source) !== asset.sourceSha256.replace('sha256:', '')) throw new Error(`Source revision mismatch: ${asset.id}`);
      const decision = owner.decisions.find((entry) => entry.id === asset.id);
      if (decision?.revisionId !== asset.revisionId) throw new Error(`Owner review revision mismatch: ${asset.id}`);
      const metrics = inspectGlb(glb);
      if (metrics.triangles !== asset.triangles) throw new Error(`Triangle count mismatch: ${asset.id}`);
      const [category, description] = describeAsset[asset.id];
      const history = asset.authorship.history.map((entry) => ({ stage: entry.stage, revisionId: entry.revisionId, parentRevisionId: entry.parentRevisionId, model: modelNames[entry.confirmed.model] ?? entry.confirmed.model, modelId: entry.confirmed.model, requestedEffort: entry.requested.effort, confirmedEffort: entry.confirmed.effort, harness: entry.harness.name, harnessVersion: entry.harness.version, confirmation: entry.confirmation }));
      const downloadPath = `${farmBase}models/${asset.id}.glb`;
      const download = { path: downloadPath, url: `${ASSET_BASE}${downloadPath}`, bytes: glb.length, sha256: hashBytes(glb), archive: `${farmBase}shapes-and-seasons-farm-runtime.zip`, member: runtimePath };
      derivatives.push(download);
      sourcePins.push({ archive: `${farmBase}shapes-and-seasons-farm-editable.zip`, member: sourceMember, output: `sources/${asset.id}.kiln.js`, bytes: source.length, sha256: hashBytes(source) });
      return { id: asset.id, slug: asset.id, name: requirements.inventory.find((item) => item.id === asset.id).name, pack: 'farm', category, description, assetId: asset.assetId, revisionId: asset.revisionId, parentRevision: history.at(-1).parentRevisionId, metrics, poster: image(`media/farm/r33/cutout/${asset.id}.webp`, description), reviewImage: image(`media/farm/r33/poster/${asset.id}.webp`, `Six rendered review views of ${asset.name}.`), sourcePath: `/sources/${asset.id}.kiln.js`, sourceSha256: hashBytes(source), modelPath: `/models/farm/${asset.id}.glb`, runtimeDownload: download, provenance: { originalModel: modelNames[asset.authorship.originalModel] ?? asset.authorship.originalModel, refinementModels: asset.authorship.refinementModels.map((value) => modelNames[value] ?? value), history }, revisions: history, review: { status: decision.verdict, ownerAccepted: decision.verdict === 'accepted', scope: decision.scope, recordedAt: decision.recordedAt }, license: 'CC0-1.0', sceneDeepLink: null };
    });
    const contents = {
      runtime: ['23 standalone runtime GLBs', 'Asset metadata and provenance', 'Applicable license notices'],
      editable: ['23 asset sources', '10 material records and 30 texture maps', 'Pinned rebuild kit and authoring metadata'],
      scene: ['Runnable scene and editable scene modules', 'Runtime assets', 'Bundled browser dependencies and notices'],
    };
    const compatibility = {
      runtime: 'glTF 2.0 / GLB. Metres; +X forward, +Y up, +Z right. Application integration is separate.',
      editable: 'Pinned rebuild kit; install its locked npm dependencies before rebuilding. A populated npm cache is needed for offline installation.',
      scene: 'Run node scene/serve.mjs. Desktop third-person play; mobile orbit viewing. Three.js 0.186.1, WebGPU with WebGL2 fallback. No npm install or model account needed for viewing.',
    };
    farm = { schemaVersion: 1, id: 'farm', name: 'Shapes & Seasons Farm', description: 'A low-poly farm collection with buildings, fencing, crops, animals and working animation clips.', revision: 'r33', projectRevision: downloadIndex.projectRevision, fullPackAccepted: downloadIndex.fullPackAccepted, ownerApprovedAssets: assets.filter((asset) => asset.review.ownerAccepted).length, assetCount: assets.length, materialRecords: 10, textureMaps: 30, license: 'CC0-1.0', licenseScope: 'CC0-1.0 covers authored asset content only, to the extent of the owner’s rights. Kiln, the scene code, Three.js, BVH, Field Grass and other components retain their own licenses.', downloads: downloadIndex.downloads.map((item) => ({ ...item, sha256: item.sha256.replace('sha256:', ''), path: `${farmBase}${item.archive}`, url: `${ASSET_BASE}${farmBase}${item.archive}`, contents: contents[item.profile], compatibility: compatibility[item.profile] })), scene: { available: false, status: 'in-production', assetBase: `${ASSET_BASE}${farmBase}`, poster: image('media/farm/r33/scene/farm-scene-wide.webp'), description: 'The interactive site scene is being rebuilt in React Three Fiber. The scene download contains the current runnable version.', desktop: ['Third-person play as Rowan', 'Doors and gates', 'Bridge crossing', 'Tractor driving'], mobile: ['Orbit viewing'], excluded: ['Trailer towing', 'General vehicle physics', 'Mobile walking and driving'], command: 'node scene/serve.mjs' }, floorRevision: { ...floor, parentRevision: assets.find((asset) => asset.id === 'farmhouse').revisionId, before: image('media/farm/revisions/farmhouse-floor-before.webp', 'Farmhouse interior before the floor revision, with a masonry-looking floor.'), after: image('media/farm/revisions/farmhouse-floor-after.webp', 'Farmhouse interior after the revision, with honey-coloured wooden floorboards.') }, assets };
  
    farm = applyOwnerAcceptance(farm, ownerDecision);
    // Posters rendered under the review rig (scripts/rig-posters.mjs) replace the delivery's own exterior images.
    farm = { ...farm, assets: applyRigPosters(farm.assets, 'farm', rigRecord) };
    assets = farm.assets;
  }

  // The revision is selected by the manifest, never an unverified directory scan.
  const bridgeArchive = selectBridgeArchive(manifest.files, bridgeRevision);
  const bridgeBase = bridgeArchive.path.slice(0, -'golden-gate-editable.zip'.length);
  const bridgeBundle = verifyArchive(await pinned(bridgeArchive.path), 'editable');
  const bridgeManifest = bridgeBundle.manifest;
  const bridgeGlb = await pinned(`${bridgeBase}golden-gate-runtime.glb`);
  const bridgeSource = bridgeBundle.files[`${bridgeBundle.prefix}source.kiln.js`];
  const bridgeMetrics = inspectGlb(bridgeGlb);
  const bridgeImage = async (file, alt) => {
    const path = `${bridgeBase}captures/${file}`;
    const bytes = await pinned(path); const size = await sharp(bytes).metadata();
    return imageRecord(path, size.width, size.height, alt);
  };
  const references = await readFile(join(inputs, 'golden-gate/REFERENCE.md'), 'utf8');
  const dimensions = references.split('## Published dimensions adopted')[1].split('## Estimates')[0].split('\n').filter((line) => line.startsWith('|') && !line.startsWith('|---') && !line.startsWith('| Quantity')).map((line) => { const cells = line.split('|').slice(1, -1).map((cell) => cell.trim()); return { quantity: cells[0], published: cells[1], metres: cells[2], source: cells[3] }; });
  // A delivery with the accepted tiers and its lineage (src/data/standalone) lists all three tiers and every saved
  // revision with the run that saved it; an older delivery falls back to the stage table of its report.
  const tiersFile = await readJson(join(out, 'standalone/golden-gate-tiers.json')).catch(() => undefined);
  const lineageFile = await readJson(join(out, 'standalone/golden-gate-lineage.json')).catch(() => undefined);
  const expandStage = (entry) => {
    const request = bridgeRequests.find((candidate) => candidate.stage === entry.request);
    if (!request) throw new Error(`The lineage names a run the site does not record: ${entry.request}`);
    return { stage: entry.stage, revisionId: entry.revisionId, parentRevisionId: entry.parentRevisionId, request: entry.request, model: modelNames[request.requestedModel] ?? request.requestedModel, modelId: request.requestedModel, requestedEffort: request.requestedEffort, confirmedEffort: request.confirmedEffort, harness: request.harness, harnessVersion: request.harnessVersion };
  };
  let bridgeHistory;
  let bridgeTierHistory;
  if (lineageFile) {
    if (lineageFile.full.at(-1).revisionId !== bridgeManifest.revisionId) throw new Error(`The lineage ends at ${lineageFile.full.at(-1).revisionId}, but the selected revision is ${bridgeManifest.revisionId}`);
    bridgeHistory = lineageFile.full.map(expandStage);
    bridgeTierHistory = Object.fromEntries(Object.entries(lineageFile.tiers).map(([tier, list]) => [tier, list.map(expandStage)]));
  } else {
    const report = await readFile(join(inputs, 'golden-gate/REPORT.md'), 'utf8');
    bridgeHistory = [...report.matchAll(/^\| ([^|]+) \| `(r_[a-f0-9]+)` \|$/gm)].map((match) => ({ stage: match[1].trim(), revisionId: match[2], model: 'GPT-6 Astra', modelId: 'gpt-6-astra', requestedEffort: bridgeFirstRequest.requestedEffort, confirmedEffort: null, harness: bridgeFirstRequest.harness, harnessVersion: bridgeFirstRequest.harnessVersion }));
  }
  const bridgeModels = [...new Set(bridgeHistory.map((entry) => entry.model))];
  const bridgeTiers = tiersFile ? await bridgeTierRecords({ tiersFile, base: bridgeBase, pinned, fileByPath }) : undefined;
  const bridgeLicence = tiersFile ? bridgeLicenceRecord({ tiersFile, base: bridgeBase, fileByPath, bytes: await pinned(`${bridgeBase}${tiersFile.licence.file}`) }) : undefined;
  const bridgeRuntimeRecord = fileByPath.get(`${bridgeBase}golden-gate-runtime.glb`);
  const posterCapture = BRIDGE_CAPTURES.find((capture) => capture.poster);
  let bridge = { schemaVersion: 1, id: 'golden-gate-bridge', slug: 'golden-gate-bridge', name: bridgeManifest.name, pack: null, category: 'Architecture', description: tiersFile ? BRIDGE_DESCRIPTION : 'A metre-scale procedural suspension bridge with Art Deco towers, main cables, suspenders and a six-lane roadway.', assetId: bridgeManifest.assetId, revisionId: bridgeManifest.revisionId, parentRevision: bridgeManifest.parentRevision, metrics: bridgeMetrics, poster: await bridgeImage(bridgeCaptureFile(posterCapture.name), posterCapture.alt), reviewImage: await bridgeImage(bridgeCaptureFile(BRIDGE_REVIEW_SHEET), BRIDGE_REVIEW_ALT), captures: await Promise.all(BRIDGE_CAPTURES.filter((capture) => !capture.poster).map((capture) => bridgeImage(bridgeCaptureFile(capture.name), capture.alt))), sourcePath: '/sources/golden-gate-bridge.kiln.js', sourceSha256: hashBytes(bridgeSource), modelPath: '/models/standalone/golden-gate-bridge.glb', runtimeDownload: { ...bridgeRuntimeRecord, url: `${ASSET_BASE}${bridgeRuntimeRecord.path}` }, editableDownload: { ...bridgeArchive, url: `${ASSET_BASE}${bridgeArchive.path}` }, ...(tiersFile ? { delivery: tiersFile.delivery, tiers: bridgeTiers, licence: bridgeLicence } : {}), provenance: { originalModel: bridgeModels[0], refinementModels: bridgeModels.slice(1), history: bridgeHistory, ...(bridgeTierHistory ? { tierHistory: bridgeTierHistory } : {}), requests: bridgeRequests }, revisions: bridgeHistory, review: tiersFile ? BRIDGE_REVIEW : { status: 'review-in-progress', ownerAccepted: false, scope: 'Export integrity passed for this revision. A further review round is in progress; this candidate will be replaced. Artistic acceptance and destination performance are not established.' }, license: 'CC0-1.0', licenseScope: 'Original procedural geometry and embedded maps are CC0. Reference photographs are excluded; software retains its own licenses.', sceneDeepLink: null, referenceLedger: '/sources/golden-gate-bridge/REFERENCE.md', publishedDimensions: dimensions, referenceSources: [{ id: 'D1', name: 'Golden Gate Bridge District: Design & construction stats', url: 'https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/' }, { id: 'D2', name: 'Golden Gate Bridge District: Historic resources', url: 'https://www.goldengate.org/assets/1/6/suicide-deterrent-finding-of-effect.pdf' }, { id: 'H', name: 'Library of Congress: HAER CA-31', url: 'https://www.loc.gov/item/ca1355/' }], limits: tiersFile ? BRIDGE_LIMITS : ['Visual reconstruction, not an engineering survey.', '1937 suspension composition with requested modern median, lighting and later lateral bracing.', 'Secondary details include declared estimates.', 'No terrain, water, traffic, people or approach viaducts.'] };
  // The bridge's poster and detail views come from the review rig's record when it holds them for this revision.
  bridge = applyRigBridge(bridge, rigRecord);
  sourcePins.push({ archive: bridgeArchive.path, profile: 'editable', member: `${bridgeBundle.prefix}source.kiln.js`, output: 'sources/golden-gate-bridge.kiln.js', bytes: bridgeSource.length, sha256: hashBytes(bridgeSource) });
  const bridgeImages = [bridge.poster, bridge.reviewImage, ...bridge.captures];
  const bridgeModel = { path: bridgeRuntimeRecord.path, output: bridge.modelPath.slice(1), bytes: bridgeRuntimeRecord.bytes, sha256: bridgeRuntimeRecord.sha256 };
  const isBridgePath = (path) => path?.startsWith('standalone/golden-gate-bridge/');
  let nextManifest = manifest;
  let plan;
  if (onlyBridge) {
    // Preserve the selected Farm (including future deliveries) and every unrelated asset.
    // The incoming manifest may still contain obsolete Farm pins; they are not imported.
    const previousManifest = await readJson(join(out, 'mirror-manifest.json'));
    const previousPlan = await readJson(join(out, 'commons-build.json'));
    nextManifest = { ...previousManifest, files: [...previousManifest.files.filter((entry) => !isBridgePath(entry.path)), ...manifest.files.filter((entry) => entry.path.startsWith(bridgeBase))] };
    plan = { ...previousPlan,
      images: [...previousPlan.images.filter((entry) => !isBridgePath(entry.inputPath)), ...bridgeImages],
      archives: [...previousPlan.archives.filter((path) => !isBridgePath(path)), bridgeArchive.path],
      sources: [...previousPlan.sources.filter((entry) => entry.output !== 'sources/golden-gate-bridge.kiln.js'), ...sourcePins],
      models: [...previousPlan.models.filter((entry) => entry.output !== 'models/standalone/golden-gate-bridge.glb'), bridgeModel],
    };
  } else {
    plan = { schemaVersion: 1, images: [...assets.flatMap((asset) => [asset.poster, asset.reviewImage]), farm.scene.poster, farm.floorRevision.before, farm.floorRevision.after, ...bridgeImages], archives: farm.downloads.map((entry) => entry.path).concat(bridgeArchive.path), sources: sourcePins, models: assets.map((asset) => ({ archive: asset.runtimeDownload.archive, member: asset.runtimeDownload.member, output: asset.modelPath.slice(1), bytes: asset.runtimeDownload.bytes, sha256: asset.runtimeDownload.sha256 })).concat(bridgeModel) };
  }
  if (!onlyBridge) {
    await writeJson(join(out, 'packs/farm.json'), farm);
    await writeJson(join(out, 'upload-manifest.json'), { base: ASSET_BASE, note: 'Additional exact GLBs extracted from the sealed runtime ZIP; upload these alongside the supplied mirror only after owner authorization.', files: derivatives });
  }
  await writeJson(join(out, 'standalone/golden-gate-bridge.json'), bridge);
  await mkdir(join(out, 'standalone'), { recursive: true });
  await writeFile(join(out, 'standalone/golden-gate-reference.md'), references);
  await writeJson(join(out, 'mirror-manifest.json'), nextManifest);
  await writeJson(join(out, 'commons-build.json'), plan);
  return { farm, bridge };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => { if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]); return pairs; }, []));
  const { farm, bridge } = await generateCommons({ ...args, bridgeRevision: args['bridge-revision'], onlyBridge: Object.hasOwn(args, 'only-bridge') });
  console.log(`${Object.hasOwn(args, 'only-bridge') ? 'Preserved' : 'Generated'} ${farm.assets.length} Farm assets and ${bridge.name} at ${bridge.revisionId}; sealed delivery and current owner acceptance remain separate.`);
}
