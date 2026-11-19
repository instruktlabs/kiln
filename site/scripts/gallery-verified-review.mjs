import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import galleryOrder from '../src/data/gallery-order.json' with { type: 'json' };
import {
  CATHEDRAL_SQUARE_ID,
  cathedralAssetHref,
  cathedralGalleryAssets,
  cathedralModelUrl,
} from '../src/lib/cathedral-gallery.ts';
import { SITE as SITE_ORIGIN } from '../src/lib/config.ts';
import { assetDelivery } from '../src/lib/delivery.ts';
import { buildGallery } from '../src/lib/gallery.ts';
import {
  QA_EVIDENCE_KIND,
  QA_REPORT_DIR,
  VERIFIED_BAR_HREF,
  VERIFIED_BAR_VERSION,
  modelSha256,
  qaErrorsAndWarnings,
  validateVerifiedReviews,
} from '../src/lib/gallery-verified.ts';
import { H7_ID, h7AssetHref, h7GalleryAssets, h7ModelUrl } from '../src/lib/h7-gallery.ts';
import { holodeckAssetHref, holodeckAssets } from '../src/lib/holodeck.ts';
import {
  SEED_TOWN_ID,
  seedTownAssetHref,
  seedTownGalleryAssets,
  seedTownModelUrl,
} from '../src/lib/seed-town-gallery.ts';
import { textTo3dAssetHref, textTo3dGalleryAssets } from '../src/lib/text-to-3d-gallery.ts';
import { ASSET_BASE, assetPath, hashBytes } from './mirror-core.mjs';

/**
 * Review candidates for the verified gallery tier (docs/gallery-verified.md) on the exact GLB each
 * card serves, and write what the owner needs to approve or reject them in one sitting.
 *
 * For each card it finds the GLB the card's page loads and checks its SHA-256 against the card's pin;
 * reads those bytes back into a scene with the engine (`loadGlbReviewScene`, never a rebuild from
 * source) and measures FLUSH_FACES and runs the QA rules on them; draws the default six-view sheet
 * through the shared render service and keeps its viewFidelity; then writes a pending record with
 * every field filled, one finding per QA error and warning with a proposed note, the QA report the
 * record names, and one standalone review page with the sheets inlined.
 *
 * Run from site/ with Bun (the engine is TypeScript), with a compatible render service listening
 * (`kiln service start` starts a managed one; this script never starts or stops one):
 *
 *   bun scripts/gallery-verified-review.mjs --first 14 [--out ../tmp/gallery-verified-review]
 *     [--mirror DIR]... [--library DIR]... [--fetch] [--date YYYY-MM-DD] [--view-timeout-ms MS]
 *     [--render-url URL] [--engine ENGINE_CHECKOUT]
 *   bun scripts/gallery-verified-review.mjs /gallery/holodeck/plaza-fountain/ ...
 *
 * The render service is found at --render-url, KILN_RENDER_SERVICE_URL or port
 * KILN_RENDER_SERVICE_PORT (8000), and must run this engine's renderer source. --engine measures
 * with another engine checkout's source instead of this one's.
 *
 * Bytes come from `--mirror` folders laid out like the asset host or the built site (`packs/...`,
 * `scene-packs/...`), from saved revisions in `--library` collection folders whose `asset.glb` is
 * the served file, or, with `--fetch`, from the pinned object on the asset host. Every copy is
 * checked against the pinned SHA-256 and size. `--library` also supplies a revision's saved
 * requirements for QA and an asset ID a card does not carry.
 *
 * After the owner decides, record the decisions (this checks them against the bar before writing):
 *
 *   bun scripts/gallery-verified-review.mjs --promote ../tmp/gallery-verified-review
 *     --verified HREF_OR_REVISION,... --rejected HREF_OR_REVISION,... [--date YYYY-MM-DD]
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SITE, '..');
const DATA = join(SITE, 'src/data');
export const REVIEW_TOOL = 'site/scripts/gallery-verified-review.mjs';
export const DEFAULT_OUT = join(REPO, 'tmp/gallery-verified-review');
const BACKDROP = 'neutral';
/** A large GLB takes longer to upload and draw than an in-loop view; the engine's own default is 8 s. */
export const VIEW_TIMEOUT_MS = 180_000;
/** The material slots the engine's readback fills, and the usage each image is decoded for. */
const TEXTURE_SLOTS = [
  ['map', 'albedo'],
  ['emissiveMap', 'emissive'],
  ['normalMap', 'normal'],
  ['roughnessMap', 'metallicRoughness'],
  ['metalnessMap', 'metallicRoughness'],
  ['aoMap', 'occlusion'],
];
export const READBACK =
  'loadGlbReviewScene (src/views/glb.ts) on the pinned bytes; each embedded image decoded with loadTexture (src/textures.ts) so the material rule sees its pixels, as after the export bake; flush faces and the scene rules on the single root node of the glTF scene; the final-GLB rules (Khronos validator, runtime cost, material advice) on the bytes';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const message = (error) => (error instanceof Error ? error.message : String(error));
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
/** A count and the verb that agrees with it: `1 needs`, `2 need`. */
const agree = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** The cards to review: hrefs as given, or the first `first` of the gallery's curated order. */
export function selectCards({ hrefs = [], first } = {}, cards = buildGallery(true)) {
  const wanted = first === undefined ? hrefs : galleryOrder.order.slice(0, first);
  if (!wanted.length) throw new Error('Name gallery cards by href, or --first N for the curated order');
  return wanted.map((href) => {
    const card = cards.find((candidate) => candidate.href === href);
    if (!card) throw new Error(`No gallery card ${href}`);
    return card;
  });
}

const sitePath = (url) => url.split('?')[0].replace(/^\//, '');
const hostPath = (url) => (url.startsWith(ASSET_BASE) ? url.slice(ASSET_BASE.length) : undefined);

/**
 * The GLB a card's page serves: the URL its viewer loads, and the relative paths where those exact
 * bytes live on the asset host or in the built site. The SHA-256 must be the card's own pin.
 */
export function servedModel(card) {
  let served;
  const find = (assets, href) => assets.find((asset) => href(asset) === card.href);
  if (card.href.startsWith('/gallery/holodeck/')) {
    const asset = find(holodeckAssets, holodeckAssetHref);
    const file = asset?.runtimeModelDownload;
    if (file)
      served = {
        ...file,
        url: `${file.url}?revision=${encodeURIComponent(asset.revisionId)}`,
        paths: [file.path],
        hostPath: file.path,
      };
  } else if (card.href.startsWith('/gallery/h-7/')) {
    const asset = find(h7GalleryAssets(true), (candidate) => h7AssetHref(candidate.slug));
    const file = asset && assetDelivery(H7_ID, asset.slug).runtimeDownload;
    if (file) served = { ...file, url: h7ModelUrl(asset), paths: [file.path], hostPath: file.path };
  } else if (
    card.href.startsWith('/gallery/cathedral-square/') ||
    card.href.startsWith('/gallery/seed-town/')
  ) {
    // Scene-pack cards load the model from the site's own staged pack; the delivery copy on the
    // asset host is the same file when its hash says so.
    const cathedral = card.href.startsWith('/gallery/cathedral-square/');
    const asset = cathedral
      ? find(cathedralGalleryAssets(true), (candidate) => cathedralAssetHref(candidate.slug))
      : find(seedTownGalleryAssets(true), (candidate) => seedTownAssetHref(candidate.slug));
    if (asset) {
      const url = cathedral ? cathedralModelUrl(asset) : seedTownModelUrl(asset);
      const delivery = assetDelivery(cathedral ? CATHEDRAL_SQUARE_ID : SEED_TOWN_ID, asset.slug)
        .runtimeDownload;
      const same = delivery.sha256 === asset.runtimeModelDownload.sha256;
      served = {
        url,
        bytes: asset.runtimeModelDownload.bytes,
        sha256: asset.runtimeModelDownload.sha256,
        paths: [sitePath(url), ...(same ? [delivery.path] : [])],
        ...(same ? { hostPath: delivery.path } : {}),
      };
    }
  } else if (card.href.startsWith('/gallery/text-to-3d/')) {
    const asset = find(textTo3dGalleryAssets(true), (candidate) => textTo3dAssetHref(candidate.slug));
    const file = asset?.runtimeDownload;
    const path = file && hostPath(file.url);
    if (path) served = { url: file.url, bytes: file.bytes, sha256: file.sha256, paths: [path], hostPath: path };
  }
  if (!served) throw new Error(`${card.href}: this review does not know which GLB the card's page serves`);
  if (served.sha256 !== modelSha256(card))
    throw new Error(`${card.href}: the page serves ${served.sha256}, but the card pins ${modelSha256(card)}`);
  for (const path of served.paths) assetPath(path);
  return {
    url: served.url,
    bytes: served.bytes,
    sha256: served.sha256,
    paths: served.paths,
    ...(served.hostPath ? { hostPath: served.hostPath } : {}),
  };
}

/** The saved revision of a card, from this repository's pack sources or a collection folder. */
export function findSavedRevision({ revisionId, assetId }, { libraries = [], packs = join(REPO, 'packs') } = {}) {
  const directories = [];
  const list = (path) => {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  };
  // packs/<pack>/sources/<collection>/<assetId>/<revisionId>/ keeps a pack's saved manifests.
  if (assetId)
    for (const pack of list(packs))
      for (const collection of list(join(packs, pack, 'sources')))
        directories.push(join(packs, pack, 'sources', collection, assetId, revisionId));
  // A collection folder: <root>/<assetId>/revisions/<revisionId>/.
  for (const root of libraries)
    for (const id of assetId ? [assetId] : list(root).filter((name) => /^a_[0-9a-f]{32}$/.test(name)))
      directories.push(join(root, id, 'revisions', revisionId));
  for (const directory of directories) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest.revisionId !== revisionId || (assetId && manifest.assetId !== assetId)) continue;
    const saved = manifest.files?.['asset.glb'];
    const glb = join(directory, 'asset.glb');
    return {
      directory,
      assetId: manifest.assetId,
      requirements: manifest.build?.options?.requirements,
      ...(saved?.sha256
        ? { savedGlb: { sha256: String(saved.sha256).replace(/^sha256:/, ''), bytes: saved.bytes, ...(existsSync(glb) ? { path: glb } : {}) } }
        : {}),
    };
  }
  return undefined;
}

/**
 * The served bytes, from the first source that holds exactly them: the cache, each mirror, a saved
 * `asset.glb` with the same hash, then (only with `fetch`) the pinned object on the asset host.
 */
export async function pinnedGlb(served, { cache, mirrors = [], saved = [], fetch: allowFetch = false, fetchImpl = fetch } = {}) {
  const exact = (bytes) => bytes.length === served.bytes && hashBytes(bytes) === served.sha256;
  const rejected = [];
  const files = [
    ...[cache, ...mirrors].filter(Boolean).flatMap((root) => served.paths.map((path) => join(root, path))),
    ...saved,
  ];
  for (const file of files) {
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      continue;
    }
    if (exact(bytes)) return { bytes: new Uint8Array(bytes), source: file };
    rejected.push(file);
  }
  if (allowFetch && served.hostPath) {
    const url = new URL(served.hostPath, ASSET_BASE);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!exact(bytes)) throw new Error(`${url} did not serve the pinned bytes (${served.sha256})`);
    if (cache) {
      const target = join(cache, served.hostPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    return { bytes, source: url.href };
  }
  throw new Error(
    `No verified copy of ${served.url} (SHA-256 ${served.sha256}, ${served.bytes} bytes). Name a folder laid out like the asset host or the built site with --mirror, a saved collection with --library, or allow --fetch from ${ASSET_BASE}.${rejected.length ? ` Other bytes were found at ${rejected.join(', ')}.` : ''}`,
  );
}

/** The engine modules the review uses, loaded from an engine tree's TypeScript source. */
export async function loadReviewEngine(engineDir = REPO) {
  const load = (file) => import(pathToFileURL(join(engineDir, 'src', file)).href);
  const names = {
    glb: 'views/glb.ts',
    flush: 'qa/flush-faces.ts',
    run: 'qa/requirements-run.ts',
    gltf: 'qa/gltf.ts',
    metrics: 'metrics.ts',
    materials: 'material-metrics.ts',
    budget: 'budget.ts',
    io: 'gltf-io.ts',
    requirements: 'requirements-context.ts',
    textures: 'textures.ts',
    port: 'views/port.ts',
    capture: 'views/capture.ts',
    client: 'render-service-client.ts',
  };
  const modules = Object.fromEntries(
    await Promise.all(Object.entries(names).map(async ([key, file]) => [key, await load(file)])),
  );
  const pkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8'));
  let sourceCommit = 'unknown';
  let sourceDirty = false;
  try {
    const git = (...args) => execFileSync('git', ['-C', engineDir, ...args], { encoding: 'utf8' }).trim();
    // The engine is its source and renderer: name the commit that last changed them.
    sourceCommit = git('log', '-1', '--format=%H', '--', 'src', 'render-service');
    sourceDirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src', 'render-service') !== '';
  } catch {
    /* Not a checkout: the version still names the engine. */
  }
  return { ...modules, identity: { name: pkg.name, version: pkg.version, sourceCommit, sourceDirty } };
}

/** The requirements a saved revision was built with, or the defaults when none was found. */
export function reviewRequirements(engine, saved) {
  const raw = saved?.requirements;
  if (raw !== undefined)
    try {
      const context =
        raw?.kind === 'kiln.requirements-context.v1'
          ? engine.requirements.validateRequirementsContext(raw)
          : engine.requirements.resolveRequirementsContext(raw);
      return { context, source: 'saved revision manifest' };
    } catch (error) {
      return {
        context: engine.requirements.resolveRequirementsContext(),
        source: `default: the saved requirements could not be read (${message(error)})`,
      };
    }
  return { context: engine.requirements.resolveRequirementsContext(), source: 'default: no saved manifest found' };
}

/**
 * The engine's readback keeps each embedded image as encoded bytes only (the CPU raster never samples
 * them), so the material rule would report every textured slot as undecodable. Decode each image the
 * way an author's texture is decoded, keeping only its size and alpha, so the rule judges the pixels.
 */
async function decodeEmbeddedImages(engine, root) {
  const textures = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      for (const [slot, usage] of TEXTURE_SLOTS) {
        const texture = material?.[slot];
        if (texture && !textures.has(texture)) textures.set(texture, usage);
      }
  });
  let decoded = 0;
  const failures = [];
  for (const [texture, usage] of textures) {
    const encoded = texture.userData?.encoded;
    if (!encoded?.bytes || texture.userData.kilnTexture) continue;
    try {
      const image = await engine.textures.loadTexture(encoded.bytes, { usage, name: texture.name });
      texture.image = { width: image.image.width, height: image.image.height };
      texture.userData.kilnTexture = image.userData.kilnTexture;
      decoded++;
    } catch (error) {
      failures.push(`${texture.name || '(unnamed texture)'}: ${message(error)}`);
    }
  }
  return { decoded, failures };
}

/** The flush-face report as the record and the page need it. */
function flushSummary(engine, report) {
  return {
    pairs: report.candidates,
    truncated: report.truncated,
    unexaminedParts: report.unexaminedParts,
    triangles: report.triangles,
    examined: report.examined,
    matching: report.matching,
    hidden: report.hidden,
    omitted: report.omitted,
    listed: report.pairs,
    ...(report.occlusion ? { occlusion: report.occlusion } : {}),
    warning: engine.flush.flushFaceWarnings(report)[0] ?? null,
  };
}

/** FLUSH_FACES alone, for a comparison GLB. */
export async function flushFacesOf(engine, bytes) {
  const { root } = await engine.glb.loadGlbReviewScene(bytes);
  return flushSummary(engine, engine.flush.analyzeFlushFaces(qaRoot(root)));
}

/** The glTF scene's single root node, the object the source path's QA ran on; else the scene group. */
const qaRoot = (scene) => (scene.children.length === 1 ? scene.children[0] : scene);

/**
 * FLUSH_FACES and every QA rule on exact GLB bytes, the way `renderSceneToGLB` runs them on a built
 * scene and its export, with the default rule policy. Returns the QA report to store for those
 * bytes (`evidence`), and the glTF document and clips read from them, for the proposed notes.
 */
export async function qaPinnedGlb(engine, bytes, { requirements } = {}) {
  const { context, source } = requirements ?? reviewRequirements(engine);
  const { root: scene, clips } = await engine.glb.loadGlbReviewScene(bytes);
  const images = await decodeEmbeddedImages(engine, scene);
  const root = qaRoot(scene);
  const flush = flushSummary(engine, engine.flush.analyzeFlushFaces(root));
  const policy = {};
  const sceneEvidence = await engine.run.collectRequirementsSceneEvidence(context, root, policy);
  const sceneReport = engine.run.runRequirementsSceneQa(context, root, clips, policy, sceneEvidence);
  const validation = await engine.gltf.validateFinalGlbBytes(bytes);
  const doc = await engine.io.createGltfIO().readBinary(Uint8Array.from(bytes));
  let instanceability;
  let metricsError;
  try {
    instanceability = engine.metrics.gradeInstanceability(engine.metrics.collectGlbMetrics(doc), {
      mergeCandidates: engine.metrics.materialMergeCandidates(doc),
    });
  } catch (error) {
    metricsError = message(error);
  }
  let materialMetrics;
  let materialAdvice = [];
  try {
    materialMetrics = engine.materials.collectMaterialMetricsV1(doc);
    const extras = doc.getRoot().getDefaultScene()?.getExtras() ?? {};
    // A declared material limit is measured by the budget receipt instead of these notes.
    if (!engine.budget.declaresMaterialLimits(engine.budget.readBudgetDeclaration(extras[engine.budget.KILN_BUDGET_KEY])))
      materialAdvice = engine.materials.adviseMaterialsV1(materialMetrics, engine.materials.DEFAULT_MATERIAL_REFERENCE);
  } catch {
    /* The advice is advisory, as in the build. */
  }
  const qa = await engine.run.appendRequirementsFinalQa(
    context,
    sceneReport,
    validation,
    bytes,
    instanceability,
    metricsError,
    materialMetrics,
    materialAdvice,
  );
  const evidence = {
    kind: QA_EVIDENCE_KIND,
    version: 1,
    glbSha256: hashBytes(bytes),
    glbBytes: bytes.length,
    engine: engine.identity,
    readback: READBACK,
    readbackDetail: {
      rootNode: root === scene ? null : root.name,
      imagesDecoded: images.decoded,
      imageDecodeFailures: images.failures,
    },
    requirements: source,
    policy: 'default',
    flushFaces: flush,
    qa,
  };
  return { evidence, doc, clips };
}

/** The default six-view sheet through a render port, and the viewFidelity the engine reports for it. */
export async function captureSheet(engine, port, bytes, { timeoutMs = VIEW_TIMEOUT_MS } = {}) {
  const inputGlbSha256 = `sha256:${hashBytes(bytes)}`;
  let attested;
  const watched = async (request, execution) => {
    const result = await port(request, execution);
    attested = result?.derivativeFidelity;
    return result;
  };
  const outcome = await engine.port.captureViewsViaPort(watched, bytes, timeoutMs);
  const shots = `default six-view sheet: ${engine.capture.describeCapture(engine.capture.resolveGridCapture(undefined))}`;
  const failed = (reason, png = null, rendererId = 'none') => ({
    png,
    shots,
    viewFidelity: {
      version: 'kiln.view-fidelity.v1',
      requested: 'full-preferred',
      delivered: 'none',
      materialFaithful: false,
      exactArtifact: false,
      rendererId,
      inputGlbSha256,
      degraded: true,
      degradeReason: reason,
    },
  });
  if (!outcome.ok) return failed(outcome.reason);
  // Like the rig capture: views count as material evidence only when the renderer attested
  // full-material fidelity for exactly these bytes.
  if (attested?.materialFaithful !== true || attested.inputGlbSha256 !== inputGlbSha256)
    return failed('the renderer did not attest full-material fidelity for these bytes', outcome.png, outcome.rendererId);
  return {
    png: outcome.png,
    shots,
    viewFidelity: {
      version: 'kiln.view-fidelity.v1',
      requested: 'full-preferred',
      delivered: 'full-material',
      materialFaithful: true,
      exactArtifact: true,
      rendererId: outcome.rendererId,
      inputGlbSha256,
      degraded: false,
    },
  };
}

/** A note for one QA error or warning, from facts in the bytes where the code allows. */
export function proposeNote(finding, { doc, clips = [] } = {}) {
  if (finding.code === 'GLTF_NODE_SKINNED_MESH_NON_ROOT' && doc) {
    const index = /^\/nodes\/(\d+)$/.exec(finding.subject ?? '')?.[1];
    const node = index === undefined ? undefined : doc.getRoot().listNodes()[Number(index)];
    if (node) {
      const parents = [];
      for (let parent = node.getParentNode(); parent; parent = parent.getParentNode()) parents.push(parent);
      const identity = (candidate) =>
        candidate.getTranslation().every((value) => value === 0) &&
        candidate.getRotation().every((value, axis) => value === (axis === 3 ? 1 : 0)) &&
        candidate.getScale().every((value) => value === 1);
      const names = parents.map((parent) => parent.getName() || '(unnamed)').join(', ');
      if (parents.every(identity))
        return `The skinned mesh ${node.getName() || finding.subject} sits under ${names}, whose transform is identity, so a runtime that ignores parent transforms for skinned meshes draws it in the same place. Accepted.`;
      return `The skinned mesh ${node.getName() || finding.subject} sits under ${names}, which carry a transform a runtime ignores for skinned meshes; check the views in an engine that follows glTF before accepting.`;
    }
  }
  if (finding.code === 'UNIVERSAL_DUPLICATE_NODE_NAME') {
    const name = finding.message.match(/"([^"]+)"/)?.[1];
    const targeted = name && clips.some((clip) => clip.tracks?.some((track) => track.name?.split('.')[0] === name));
    if (name && !targeted)
      return `Two nodes are named "${name}"; no clip track targets that name, so no animation binding is ambiguous. Accepted.`;
  }
  if (finding.code === 'MAT_NORMAL_TANGENTS_MISSING')
    return 'The normal-mapped mesh carries no TANGENT data, so each runtime derives its own; the views show the normal-mapped shading as intended. Accepted.';
  return `${finding.message} Accepted after the visual review: the views do not show a problem from it.`;
}

/** What the record should say and why: the automated bar items, and what needs the owner's eye. */
export function proposal({ flush, viewFidelity, findings, assetId, collection, savedFlush }) {
  const fails = [];
  const judgment = [];
  if (flush.pairs > 0) fails.push(`FLUSH_FACES reports ${plural(flush.pairs, 'pair')}`);
  if (flush.truncated)
    fails.push(
      `the flush-face check stopped at its budget after ${flush.examined.toLocaleString('en-US')} of ${flush.triangles.toLocaleString('en-US')} triangles`,
    );
  if (!viewFidelity.materialFaithful)
    fails.push(`no material-faithful views: ${viewFidelity.degradeReason ?? viewFidelity.delivered}`);
  else if (!viewFidelity.exactArtifact) fails.push('the views were not drawn from the pinned bytes');
  if (!assetId) fails.push('the asset ID is unknown: name the saved collection with --library');
  if (flush.unexaminedParts > 0)
    judgment.push(
      `${plural(flush.unexaminedParts, 'part')} skinned, morphed or instanced, so FLUSH_FACES did not measure ${flush.examined === 0 ? 'anything' : 'them'}`,
    );
  if (savedFlush && savedFlush.pairs > 0)
    judgment.push(
      `the saved asset.glb of this revision, which the check can measure, has ${plural(savedFlush.pairs, 'flush-face pair')}`,
    );
  if (findings.length)
    judgment.push(
      `${findings.length} QA ${findings.length === 1 ? 'error or warning' : 'errors or warnings'} to settle: ${[...new Set(findings.map((finding) => finding.code))].join(', ')}`,
    );
  if (!collection) judgment.push('the card names no collection; the record says project');
  const verdict = fails.length || (savedFlush && savedFlush.pairs > 0) ? 'rejected' : 'verified';
  return {
    verdict,
    standing: fails.length ? 'fails the bar' : judgment.length ? 'needs the owner’s judgment' : 'likely to pass',
    reasons: [...fails, ...judgment],
  };
}

/** The pending record: every field of the final record filled, marked pending until the owner decides. */
export function pendingRecord({ card, served, saved, evidence, qaReport, views, proposed, date, doc, clips }) {
  const findings = qaErrorsAndWarnings(evidence).map((finding) => ({
    code: finding.code,
    ...(finding.subject === undefined ? {} : { subject: finding.subject }),
    resolution: 'accepted',
    note: proposeNote(finding, { doc, clips }),
  }));
  const differs = saved?.savedGlb && saved.savedGlb.sha256 !== served.sha256;
  return {
    status: 'pending',
    collection: card.collection ?? 'project',
    assetId: card.assetId ?? saved?.assetId ?? '',
    revisionId: card.revisionId,
    glbSha256: served.sha256,
    bar: VERIFIED_BAR_VERSION,
    verdict: proposed.verdict,
    date,
    reviewer: 'owner',
    flushFaces: {
      pairs: evidence.flushFaces.pairs,
      truncated: evidence.flushFaces.truncated,
      unexaminedParts: evidence.flushFaces.unexaminedParts,
    },
    qaReport,
    findings,
    views: {
      shots: views.shots,
      backdrop: BACKDROP,
      rendererId: views.viewFidelity.rendererId,
      delivered: views.viewFidelity.delivered,
      materialFaithful: views.viewFidelity.materialFaithful,
      exactArtifact: views.viewFidelity.exactArtifact,
    },
    note: `Reviewed on the GLB the card serves (${served.url})${differs ? `, which is not the saved asset.glb (${saved.savedGlb.sha256})` : ''}.`,
  };
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** One standalone page: every candidate's sheet, flush result and findings with their proposed notes. */
export function reviewPage({ generated, engine, renderer, candidates }) {
  const counts = { 'likely to pass': 0, 'needs the owner’s judgment': 0, 'fails the bar': 0 };
  for (const candidate of candidates) counts[candidate.proposed.standing]++;
  const row = (candidate) => {
    const { card, record, proposed } = candidate;
    const flush = candidate.evidence.flushFaces;
    return `<tr><td><a href="#${escapeHtml(record.revisionId)}">${escapeHtml(card.name)}</a></td><td class="${proposed.verdict}">${escapeHtml(proposed.standing)}</td><td>${flush.pairs}${flush.truncated ? ', truncated' : ''}${flush.unexaminedParts ? `, ${flush.unexaminedParts} unexamined` : ''}</td><td>${record.findings.length}</td><td>${record.views.materialFaithful ? 'material-faithful' : 'not material-faithful'}</td></tr>`;
  };
  const section = (candidate) => {
    const { card, served, record, proposed, evidence, viewFidelity, source, savedFlush } = candidate;
    const flush = evidence.flushFaces;
    const notes = Object.values(evidence.qa.dimensions).flatMap((dimension) =>
      dimension.findings.filter((finding) => finding.disposition === 'observe'),
    );
    const image = candidate.png
      ? `<img alt="Six views of ${escapeHtml(card.name)}" src="data:image/png;base64,${Buffer.from(candidate.png).toString('base64')}">`
      : `<p class="missing">No views: ${escapeHtml(viewFidelity.degradeReason ?? 'not drawn')}</p>`;
    const pairs = flush.listed.length
      ? `<ul>${flush.listed.map((pair) => `<li>${escapeHtml(pair.parts.join(' and '))}: ${pair.sharedArea} m² near [${pair.at.join(', ')}]${pair.occlusion ? `, ${pair.occlusion}` : ''}</li>`).join('')}</ul>${flush.omitted ? `<p>${plural(flush.omitted, 'more pair')} not listed.</p>` : ''}`
      : '';
    // The record holds one finding per QA error and warning, in report order.
    const reported = qaErrorsAndWarnings(evidence);
    const findings = record.findings.length
      ? `<table><tr><th>Code</th><th>Subject</th><th>QA message</th><th>Proposed note</th></tr>${record.findings
          .map((finding, index) => {
            const measured = reported[index];
            const kind = measured ? (measured.disposition === 'block' ? ' (error)' : ' (warning)') : '';
            return `<tr><td>${escapeHtml(finding.code)}${kind}</td><td>${escapeHtml(finding.subject ?? '')}</td><td>${escapeHtml(measured?.message ?? '')}</td><td>${escapeHtml(finding.note)}</td></tr>`;
          })
          .join('')}</table>`
      : '<p>No QA errors or warnings.</p>';
    return `<section id="${escapeHtml(record.revisionId)}">
<h2>${escapeHtml(card.name)} <span class="${proposed.verdict}">${escapeHtml(proposed.standing)}: propose ${proposed.verdict}</span></h2>
<p><a href="${escapeHtml(SITE_ORIGIN + card.href)}">${escapeHtml(card.href)}</a> &middot; ${escapeHtml(record.collection)} / ${escapeHtml(record.assetId || 'asset ID unknown')} / ${escapeHtml(record.revisionId)}</p>
${proposed.reasons.length ? `<ul class="reasons">${proposed.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}
${image}
<dl>
<dt>Served GLB</dt><dd>${escapeHtml(served.url)}<br>SHA-256 ${escapeHtml(served.sha256)}, ${served.bytes.toLocaleString('en-US')} bytes, read from ${escapeHtml(source)}</dd>
<dt>Views</dt><dd>${escapeHtml(record.views.shots)}; ${escapeHtml(record.views.backdrop)} backdrop; ${escapeHtml(viewFidelity.rendererId)}; delivered ${escapeHtml(viewFidelity.delivered)}, materialFaithful ${viewFidelity.materialFaithful}, exactArtifact ${viewFidelity.exactArtifact}</dd>
<dt>FLUSH_FACES</dt><dd>${plural(flush.pairs, 'pair')}${flush.truncated ? ', truncated' : ''}; ${flush.examined.toLocaleString('en-US')} of ${flush.triangles.toLocaleString('en-US')} triangles measured; ${flush.unexaminedParts} unexamined parts; ${flush.matching} matching and ${flush.hidden} hidden pairs not reported${flush.warning ? `<br>${escapeHtml(flush.warning)}` : ''}${pairs}${savedFlush ? `<br>The saved asset.glb of this revision: ${plural(savedFlush.pairs, 'pair')}${savedFlush.truncated ? ', truncated' : ''}, ${savedFlush.examined.toLocaleString('en-US')} triangles measured.` : ''}</dd>
<dt>QA</dt><dd>${escapeHtml(evidence.qa.disposition)} (${escapeHtml(evidence.qa.acceptance)}); requirements: ${escapeHtml(evidence.requirements)}</dd>
</dl>
<h3>QA errors and warnings</h3>
${findings}
<details><summary>${plural(notes.length, 'informational note')} (no resolution needed)</summary><ul>${notes.map((note) => `<li>${escapeHtml(note.code)}: ${escapeHtml(note.message)}</li>`).join('')}</ul></details>
<p class="files">Pending record: records/${escapeHtml(candidate.recordFile)} &middot; QA report: data/${escapeHtml(record.qaReport.path)} (SHA-256 ${escapeHtml(record.qaReport.sha256)})</p>
</section>`;
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Verified gallery review</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem;color:#1d1d1b;background:#fbfaf7}
h1{font-size:1.6rem}h2{font-size:1.25rem;margin-top:3rem;border-top:1px solid #ccc;padding-top:1rem}
img{max-width:100%;border:1px solid #ddd;background:#fff}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ddd;padding:.35rem .5rem;text-align:left;vertical-align:top}
dt{font-weight:600;margin-top:.5rem}dd{margin-left:1rem}.verified{color:#1f6f3d}.rejected{color:#a2361f}
.reasons li{margin:.15rem 0}.files{font-size:.85rem;color:#555}.missing{padding:2rem;background:#eee}
code{font-size:.9em}
</style></head><body>
<h1>Verified gallery review</h1>
<p>${plural(candidates.length, 'candidate')}: ${counts['likely to pass']} likely to pass, ${agree(counts['needs the owner’s judgment'], 'needs', 'need')} the owner&rsquo;s judgment, ${agree(counts['fails the bar'], 'fails', 'fail')} the bar (<a href="${escapeHtml(VERIFIED_BAR_HREF)}">docs/gallery-verified.md</a>). Generated ${escapeHtml(generated)} by ${escapeHtml(REVIEW_TOOL)} with ${escapeHtml(engine.name)} ${escapeHtml(engine.version)} (source ${escapeHtml(engine.sourceCommit.slice(0, 12))}${engine.sourceDirty ? ', with uncommitted changes' : ''}); views by ${escapeHtml(renderer)}.</p>
<p>Every measurement is of the GLB the card serves, read back with the engine, not rebuilt. Each pending record proposes a verdict and a note for every QA error and warning; informational notes need none. Record decisions with <code>bun scripts/gallery-verified-review.mjs --promote DIR --verified HREF,... --rejected HREF,...</code>, which checks each record against the bar before writing.</p>
<table><tr><th>Card</th><th>Standing</th><th>Flush pairs</th><th>Errors and warnings</th><th>Views</th></tr>${candidates.map(row).join('')}</table>
${candidates.map(section).join('\n')}
</body></html>
`;
}

/** Review each card, writing the QA reports, pending records, sheets and page under `out`. */
export async function review(cards, { engine, port, renderer, out = DEFAULT_OUT, mirrors = [], libraries = [], fetch: allowFetch = false, date, timeoutMs, log = console.log } = {}) {
  const candidates = [];
  for (const card of cards) {
    const served = servedModel(card);
    const saved = findSavedRevision(card, { libraries });
    const savedFiles = saved?.savedGlb?.path && saved.savedGlb.sha256 === served.sha256 ? [saved.savedGlb.path] : [];
    const { bytes, source } = await pinnedGlb(served, {
      cache: join(SITE, '.cache/gallery-verified-review'),
      mirrors,
      saved: savedFiles,
      fetch: allowFetch,
    });
    const { evidence, doc, clips } = await qaPinnedGlb(engine, bytes, {
      requirements: reviewRequirements(engine, saved),
    });
    // A served GLB whose parts the check cannot measure is compared with the saved one, when it differs.
    let savedFlush;
    if (evidence.flushFaces.unexaminedParts > 0 && saved?.savedGlb?.path && saved.savedGlb.sha256 !== served.sha256)
      savedFlush = await flushFacesOf(engine, new Uint8Array(await readFile(saved.savedGlb.path)));
    const views = await captureSheet(engine, port, bytes, { timeoutMs });
    const stem = `${card.revisionId}-${served.sha256.slice(0, 12)}`;
    const evidenceBytes = Buffer.from(json(evidence));
    const qaPath = `${QA_REPORT_DIR}${stem}.json`;
    await mkdir(join(out, 'data', QA_REPORT_DIR), { recursive: true });
    await writeFile(join(out, 'data', qaPath), evidenceBytes);
    const findings = qaErrorsAndWarnings(evidence);
    const proposed = proposal({
      flush: evidence.flushFaces,
      viewFidelity: views.viewFidelity,
      findings,
      assetId: card.assetId ?? saved?.assetId,
      collection: card.collection,
      savedFlush,
    });
    const record = pendingRecord({
      card,
      served,
      saved,
      evidence,
      qaReport: { path: qaPath, sha256: hashBytes(evidenceBytes) },
      views,
      proposed,
      date,
      doc,
      clips,
    });
    await mkdir(join(out, 'records'), { recursive: true });
    await writeFile(join(out, 'records', `${stem}.json`), json(record));
    if (views.png) {
      await mkdir(join(out, 'views'), { recursive: true });
      await writeFile(join(out, 'views', `${stem}.png`), views.png);
    }
    const flush = evidence.flushFaces;
    log(
      `${card.href}  flush ${flush.pairs}${flush.truncated ? ' truncated' : ''}${flush.unexaminedParts ? ` (${flush.unexaminedParts} unexamined)` : ''}  errors/warnings ${findings.length}  views ${views.viewFidelity.delivered}/${views.viewFidelity.materialFaithful ? 'faithful' : 'not faithful'}  -> ${proposed.standing}`,
    );
    candidates.push({ card, served, saved, source, evidence, record, proposed, viewFidelity: views.viewFidelity, png: views.png, savedFlush, recordFile: `${stem}.json` });
  }
  const pending = {
    description: `Pending owner review records written by ${REVIEW_TOOL}. Each is refused by the site until the owner sets its verdict and removes status; --promote does that for the records it is told about.`,
    bar: VERIFIED_BAR_VERSION,
    reviews: candidates.map((candidate) => candidate.record),
  };
  await writeFile(join(out, 'pending.json'), json(pending));
  const generated = new Date().toISOString();
  await writeFile(join(out, 'review.html'), reviewPage({ generated, engine: engine.identity, renderer, candidates }));
  await writeFile(
    join(out, 'run.json'),
    json({
      generated,
      tool: REVIEW_TOOL,
      engine: engine.identity,
      renderer,
      cards: candidates.map(({ card, served, source, saved, proposed, viewFidelity, savedFlush }) => ({
        href: card.href,
        served,
        source,
        saved: saved ? { directory: saved.directory, savedGlb: saved.savedGlb } : null,
        proposed,
        viewFidelity,
        ...(savedFlush ? { savedFlush: { pairs: savedFlush.pairs, truncated: savedFlush.truncated, examined: savedFlush.examined } } : {}),
      })),
    }),
  );
  return candidates;
}

/** Match a decision to a pending record by card href or revision ID. */
const decided = (record, cards, ids) =>
  ids.includes(record.revisionId) ||
  cards.some((card) => card.revisionId === record.revisionId && ids.includes(card.href));

/**
 * Record the owner's decisions: each named pending record gets its verdict and date, loses its
 * status, and joins the record file with its QA report. The whole file is checked against the bar
 * before anything is written, so a record that does not meet it is never kept as verified.
 */
export async function promote(reviewDir, { verified = [], rejected = [], date, data = DATA, cards = buildGallery(true) } = {}) {
  const pending = JSON.parse(await readFile(join(reviewDir, 'pending.json'), 'utf8'));
  const both = verified.filter((id) => rejected.includes(id));
  if (both.length) throw new Error(`Decided both ways: ${both.join(', ')}`);
  const chosen = [];
  for (const record of pending.reviews) {
    const verdict = decided(record, cards, verified) ? 'verified' : decided(record, cards, rejected) ? 'rejected' : undefined;
    if (!verdict) continue;
    const { status: _pending, ...rest } = record;
    chosen.push({ ...rest, verdict, ...(date ? { date } : {}) });
  }
  const named = [...verified, ...rejected];
  const unmatched = named.filter(
    (id) => !pending.reviews.some((record) => decided(record, cards, [id])),
  );
  if (unmatched.length) throw new Error(`No pending record for ${unmatched.join(', ')}`);
  const recordsPath = join(data, 'gallery-verified.json');
  const current = JSON.parse(await readFile(recordsPath, 'utf8'));
  const key = (record) => `${record.revisionId}:${record.glbSha256}`;
  const replaced = new Set(chosen.map(key));
  const next = { ...current, reviews: [...current.reviews.filter((record) => !replaced.has(key(record))), ...chosen] };
  // Check against the QA reports as they will be stored, before touching the site's data.
  const stored = (path) => {
    const fresh = chosen.find((record) => record.qaReport.path === path);
    return readFileSync(fresh ? join(reviewDir, 'data', path) : join(data, path));
  };
  validateVerifiedReviews(next, { readQaFile: stored });
  for (const record of chosen) {
    const target = join(data, record.qaReport.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(reviewDir, 'data', record.qaReport.path), target);
  }
  await writeFile(recordsPath, json(next));
  return chosen;
}

function parseArgs(argv) {
  const options = { hrefs: [], mirrors: [], libraries: [], verified: [], rejected: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--first') options.first = Number(value());
    else if (arg === '--mirror') options.mirrors.push(resolve(value()));
    else if (arg === '--library') options.libraries.push(resolve(value()));
    else if (arg === '--fetch') options.fetch = true;
    else if (arg === '--out') options.out = resolve(value());
    else if (arg === '--date') options.date = value();
    else if (arg === '--view-timeout-ms') options.timeoutMs = Number(value());
    else if (arg === '--render-url') options.url = value();
    else if (arg === '--engine') options.engine = resolve(value());
    else if (arg === '--promote') options.promote = resolve(value());
    else if (arg === '--verified') options.verified.push(...value().split(',').filter(Boolean));
    else if (arg === '--rejected') options.rejected.push(...value().split(',').filter(Boolean));
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.hrefs.push(arg);
  }
  if (options.first !== undefined && !(Number.isInteger(options.first) && options.first > 0))
    throw new Error('--first needs a positive whole number');
  if (options.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(options.date))
    throw new Error('--date must be YYYY-MM-DD');
  return options;
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  // Stored QA reports are read relative to site/, as the site build reads them.
  const here = resolve(process.cwd());
  if ((process.platform === 'win32' ? here.toLowerCase() !== SITE.toLowerCase() : here !== SITE))
    throw new Error(`Run this from ${SITE}`);
  if (options.promote) {
    const chosen = await promote(options.promote, { verified: options.verified, rejected: options.rejected, date: options.date ?? today() });
    for (const record of chosen) console.log(`${record.verdict}  ${record.revisionId}  ${record.glbSha256}`);
    console.log(`Recorded ${plural(chosen.length, 'decision')} in src/data/gallery-verified.json.`);
    return;
  }
  // The bar asks for the default sheet; a grid variant would change it.
  if (env.KILN_GRID_VARIANT) throw new Error('Unset KILN_GRID_VARIANT: the bar names the default six-view sheet');
  const cards = selectCards(options);
  const engine = await loadReviewEngine(options.engine);
  const url = options.url ?? env.KILN_RENDER_SERVICE_URL ?? `http://127.0.0.1:${env.KILN_RENDER_SERVICE_PORT ?? 8000}`;
  const token = env.KILN_RENDER_TOKEN ?? env.RENDER_SERVICE_TOKEN;
  const fingerprint = engine.client.packagedRendererSourceFingerprint();
  const probe = await engine.client.readRenderServiceHealth(url, { token });
  if (probe.kind !== 'service')
    throw new Error(`No compatible render service at ${url} (${probe.kind}${probe.reason ? `: ${probe.reason}` : ''}). Start a managed one with \`kiln service start\` from ${engine.identity.name} at ${options.engine ?? REPO}.`);
  if (probe.health.compatibility.sourceFingerprint !== fingerprint)
    throw new Error(`The render service at ${url} runs other renderer source than this engine; it was not replaced.`);
  const port = engine.client.makeRemoteRenderPort(url, token, fingerprint);
  const renderer = `${probe.health.rendererId} at ${url}`;
  const out = options.out ?? DEFAULT_OUT;
  await review(cards, { engine, port, renderer, out, mirrors: options.mirrors, libraries: options.libraries, fetch: options.fetch, date: options.date ?? today(), timeoutMs: options.timeoutMs });
  console.log(`Review page: ${join(out, 'review.html')}`);
  console.log(`Pending records: ${join(out, 'pending.json')}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main().catch((error) => {
    console.error(message(error));
    process.exitCode = 1;
  });
