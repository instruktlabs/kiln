import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { hashBytes, verifyBytes } from './mirror-core.mjs';
import { inspectGlb } from './generate-commons.mjs';
import { connectRig, fitCamera } from './rig-render.mjs';
import { publicTroyHtml } from './troy-html.mjs';

// Release preparation is explicit. The normal build only fetches sealed inputs.
const [input, output, releaseOverride] = process.argv.slice(2);
if (!input || !output) throw new Error('Pass the portable Troy directory and an output directory');
const site = resolve(import.meta.dirname, '..'), repo = resolve(site, '..'), out = resolve(output);
const pack = JSON.parse(await readFile(resolve(input, 'pack.json'), 'utf8'));
const inventory = JSON.parse(await readFile(resolve(repo, 'packs/troy/inventory.json'), 'utf8'));
const release = releaseOverride ?? pack.release, base = `/scene-packs/troy/${release}/`;
if (!/^[a-z0-9-]+$/.test(release)) throw new Error('Invalid public release');
const files = {}, seals = {}, assets = [], captureReceipts = [];
async function emit(path, bytes) {
  files[path] = bytes;
  seals[path] = { bytes: bytes.length, sha256: hashBytes(bytes) };
  const dest = resolve(out, path); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, bytes);
}
for (const f of pack.files.filter(f => f.path.startsWith('web/') || f.path === 'serve.mjs' || /^sources\/assets\/[^/]+\/[^/]+\/(?:manifest|materials\.kiln)\.json$/.test(f.path))) {
  const bytes = await readFile(resolve(input, f.path)); verifyBytes(bytes, f);
  await emit(f.path, f.path.endsWith('.html') ? publicTroyHtml(bytes) : bytes);
}
const targets = pack.assets.map(pin => ({ ...pin, path: resolve(input, pin.source, 'asset.glb'), manifest: resolve(input, pin.source, 'manifest.json') }));
for (const a of inventory.assets.filter(a => !targets.some(t => t.slug === a.slug))) {
  targets.push({ ...a, manifest: resolve(repo, 'packs/troy/assets', a.slug + '.manifest.json'), remote: a.glb });
}
const rig = await connectRig();
for (const target of targets) {
  const manifest = JSON.parse(await readFile(target.manifest, 'utf8'));
  let bytes;
  if (target.path) bytes = await readFile(target.path);
  else {
    const response = await fetch(target.remote, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Missing Troy asset ${target.slug}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  verifyBytes(bytes, manifest.files['asset.glb'], target.slug);
  const facts = inspectGlb(bytes), category = ['achilles','hector','greek-soldier','trojan-soldier'].includes(target.slug) ? 'Characters' : ['olive','cypress','fig','shrub'].includes(target.slug) ? 'Nature' : target.slug === 'horse' ? 'Animals' : ['war-galley','war-chariot'].includes(target.slug) ? 'Vehicles' : ['sword','shield','bow-set'].includes(target.slug) ? 'Equipment' : target.slug === 'battle-scene-reference' ? 'Compositions' : 'Buildings';
  const camera = fitCamera(rig.engine, { min: facts.boundsMin, max: facts.boundsMax }, [0.7,0.45,1], { padding: 1.12 });
  const capture = await rig.capture({ glb: bytes, cameras: [camera], width: 1024, height: 1024 });
  const poster = await sharp(capture.pngs[0]).webp({ quality: 88 }).toBuffer();
  await emit(`models/${target.slug}.glb`, bytes); await emit(`media/${target.slug}.webp`, poster);
  captureReceipts.push({ slug: target.slug, ...capture.receipt, posterSha256: hashBytes(poster) });
  assets.push({ slug: target.slug, name: target.slug === 'wall-breached' ? 'Breached wall' : manifest.name, pack: 'troy', category, description: `${target.slug === 'wall-breached' ? 'Breached wall' : manifest.name}, from the Troy collection.`, assetId: manifest.assetId, revisionId: manifest.revisionId, metrics: facts, runtimeDownload: { url: `${base}models/${target.slug}.glb`, bytes: bytes.length, sha256: hashBytes(bytes) }, poster: { src: `${base}media/${target.slug}.webp`, width: 1024, height: 1024, alt: manifest.name, srcsetAvif: '', srcsetWebp: `${base}media/${target.slug}.webp 1024w` }, review: { ownerAccepted: false, status: 'published' } });
}
// Scene captures come from the actual playfield, supplied by its input check.
for (const name of ['scene-coast','scene-city']) await emit(`media/${name}.webp`, await readFile(resolve(out, name + '.webp')));
await emit('LICENSE.txt', Buffer.from('Troy authored asset content: CC0 1.0 Universal, to the extent of the owner\'s rights. See https://creativecommons.org/publicdomain/zero/1.0/legalcode . Scene code, Kiln and Third-party components retain their own licenses.\n'));
await emit('SCENE-LICENSE.txt', await readFile(resolve(repo, 'LICENSE')));
await emit('README.md', Buffer.from('# Troy\n\nRun `node serve.mjs`, then open http://127.0.0.1:4440/web/.\n\nChoose Explore or Fight, and select Achilles or Hector. WASD moves; left click or J is a light attack; right click or K is a heavy attack; hold Space to block. Touch actions appear when playing a hero. More opens secondary controls.\n\nThe web modules are editable scene code. The models directory contains all 21 collection GLBs. Three.js is bundled, so playing does not require dependency installation. Asset authoring sources remain in the Kiln Troy pack; they require Kiln and the pinned material resources.\n'));
await emit('THIRD-PARTY-NOTICES.txt', Buffer.from('Authored asset content: CC0 1.0, see LICENSE.txt. Kiln scene code: MIT, see SCENE-LICENSE.txt. Three.js 0.186.1: MIT, see web/vendor/three/LICENSE. Asset material records and attribution are retained in sources/assets and the Kiln Troy source pack.\n'));
const modelFiles = Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith('models/') || path === 'LICENSE.txt'));
const modelZip = zipSync(modelFiles, { level: 6 });
const modelDownload = { path: `packs/troy/${release}/troy-models.zip`, bytes: modelZip.length, sha256: hashBytes(modelZip) };
await writeFile(resolve(out, 'troy-models.zip'), modelZip);
const sceneFiles=Object.entries(seals).filter(([path])=>path!=='THIRD-PARTY-NOTICES.txt').map(([path,record])=>({path,...record}));
await emit('pack.json',Buffer.from(JSON.stringify({schema:'kiln.scene-pack/1',id:'troy',release,three:'0.186.1',models:assets.map(a=>({id:a.slug,path:`models/${a.slug}.glb`})),source:{browserManifestSha256:pack.sourceManifestSha256},files:sceneFiles},null,2)+'\n'));
await emit('SHA256SUMS',Buffer.from(sceneFiles.map(f=>f.sha256+'  '+f.path).join('\n')+'\n'));
files['delivery.json'] = Buffer.from(JSON.stringify({ schema: 'kiln.delivery/1', release, files: seals }, null, 2) + '\n');
const archive = zipSync(files, { level: 6 });
const delivery = { release, path: `packs/troy/${release}/troy-scene.zip`, bytes: archive.length, sha256: hashBytes(archive), sourceManifestSha256: pack.sourceManifestSha256 };
await writeFile(resolve(out, 'troy-scene.zip'), archive);
await writeFile(resolve(site, 'src/data/troy-delivery.json'), JSON.stringify(delivery, null, 2) + '\n');
await writeFile(resolve(site, 'src/data/troy.json'), JSON.stringify({ name: 'Troy', base, release, license: 'CC0-1.0', assetCount: assets.length, description: 'A Bronze Age coast, battlefield and city. Explore Troy or fight as Achilles or Hector.', models: { ...modelDownload, url: 'https://assets.kilnstudio.tools/' + modelDownload.path }, scene: { ...delivery, url: 'https://assets.kilnstudio.tools/' + delivery.path }, posters: ['scene-coast','scene-city'].map(name => ({ src: `${base}media/${name}.webp`, width: 1440, height: 900, srcsetAvif: '', srcsetWebp: `${base}media/${name}.webp 1440w`, alt: name === 'scene-coast' ? 'Troy and its landed fleet, seen from above the sea' : 'Achilles and Hector fighting before Troy, with army formations and the city walls' })), assets }, null, 2) + '\n');
await writeFile(resolve(out, 'capture-receipts.json'), JSON.stringify(captureReceipts, null, 2) + '\n');
console.log(JSON.stringify({ assets: assets.length, files: Object.keys(files).length, archiveBytes: archive.length, sha256: delivery.sha256 }));
