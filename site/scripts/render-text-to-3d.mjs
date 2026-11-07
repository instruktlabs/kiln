import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inspectGlb } from './generate-commons.mjs';
import { connectRig, fitCamera, orbitDirection, sha256Of } from './rig-render.mjs';
import { mergeGlbs } from './stage-text-to-3d.mjs';

/**
 * The stills for /text-to-3d/: the gallery's review rig applied to the exact saved GLBs, with nothing composited or retouched.
 * One still may set a second saved GLB in the scene at its true size: `with` names its workspace, its saved revision by
 * position, a name for the placing node, and `translation`. Nothing else about either model changes.
 *
 *   bun scripts/render-text-to-3d.mjs <workspace> --service http://127.0.0.1:8017 --engine <installed package>
 *
 * The render service and `--engine` are the published package. <workspace>/run/stills.json lists the views: name, step (a saved revision by position, 1-based), size, then
 * an orbit `[azimuth, elevation]`, a `direction` or an exact perspective `camera`, padding, alt and caption.
 */
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const workspace = args[0] && resolve(args[0]);
const service = option('--service');
const engineDir = option('--engine') && resolve(option('--engine'));
if (!workspace || !service || !engineDir) throw Error('Usage: bun scripts/render-text-to-3d.mjs <workspace> --service URL --engine PACKAGE_DIR');

const only = option('--only')?.split(',');
async function savedRevisions(directory) {
  const assets = join(directory, 'assets/kiln');
  const [assetId] = await readdir(assets);
  const manifests = await Promise.all((await readdir(join(assets, assetId, 'revisions'))).map(async (id) => JSON.parse(await readFile(join(assets, assetId, 'revisions', id, 'manifest.json'), 'utf8'))));
  const revisions = manifests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const glbOf = (revision) => readFile(join(assets, assetId, 'revisions', revision.revisionId, 'asset.glb'));
  return { assetId, revisions, glbOf };
}
const { assetId, revisions, glbOf } = await savedRevisions(workspace);
const stills = JSON.parse(await readFile(join(workspace, 'run/stills.json'), 'utf8'));

// An installed package is not a git tree: its identity is its version.
const rig = await connectRig({ url: service, engineDir, provenance: () => null });
const out = join(workspace, 'renders');
await mkdir(out, { recursive: true });
const manifestPath = join(out, 'manifest.json');
const previous = only ? JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"images":[]}')).images : [];
const images = previous.filter((image) => !stills.some((still) => still.name === image.name && only?.includes(still.name)));
for (const still of stills.filter((candidate) => !only || only.includes(candidate.name))) {
  const revision = revisions[still.step - 1];
  if (!revision) throw Error(`${still.name}: no saved revision ${still.step}`);
  const saved = await glbOf(revision);
  const other = still.with && await savedRevisions(resolve(workspace, still.with.workspace));
  const placed = other && other.revisions[still.with.step - 1];
  if (other && !placed) throw Error(`${still.name}: no saved revision ${still.with.step} in ${still.with.workspace}`);
  const glb = placed ? mergeGlbs(saved, await other.glbOf(placed), { name: still.with.name, translation: still.with.translation }) : saved;
  const facts = inspectGlb(saved);
  const camera = still.camera
    ? rig.engine.camera.validateResolvedAssetCamera({ version: 'kiln.camera.v1', projection: 'perspective', up: [0, 1, 0], aspect: still.width / still.height, ...still.camera })
    : fitCamera(rig.engine, { min: facts.boundsMin, max: facts.boundsMax }, still.direction ?? orbitDirection(still.orbit[0], still.orbit[1]), { aspect: still.width / still.height, padding: still.padding ?? 1.02 });
  const { pngs, receipt } = await rig.capture({ glb, cameras: [camera], width: still.width, height: still.height });
  const file = `${still.name}.png`;
  await writeFile(join(out, file), pngs[0]);
  images.push({ name: still.name, file, alt: still.alt, caption: still.caption, revisionId: revision.revisionId, ...(placed ? { with: { revisionId: placed.revisionId, translation: still.with.translation } } : {}), origin: 'review-rig', receipt: { ...receipt, sha256: sha256Of(pngs[0]) } });
  console.log(`${file}: ${still.width}x${still.height}, ${pngs[0].length} bytes, revision ${revision.revisionId}`);
}
await writeFile(manifestPath, `${JSON.stringify({ assetId, renderer: rig.service.rendererId, images }, null, 2)}\n`);
