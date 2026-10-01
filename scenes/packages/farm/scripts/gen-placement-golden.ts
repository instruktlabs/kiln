/** One-time read-only sealed-pilot oracle. ORACLE=1 compares without rewriting fixtures. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const base = resolve(process.cwd(), '.tmp/pilot-r33'), sceneBase = resolve(base, 'scene');
const output = resolve(process.cwd(), 'packages/farm/fixtures');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sources: Record<string, string> = {};
function source(name: string) { const text = readFileSync(resolve(sceneBase, name), 'utf8'); sources[name] = hash(text); return text; }
const manifest = JSON.parse(source('scene.json')), layoutBytes = source('layout.json'), layout = JSON.parse(layoutBytes);
if (JSON.stringify(layout) !== JSON.stringify(manifest.layout)) throw new Error('Sealed scene and layout disagree');
const viewer = source('viewer.mjs');
const planting = new Function(source('planting.mjs').replaceAll('export ', '') + ';return {soilPartName,applyPlanting};')();
const sceneMotion = new Function(source('scene-motion.mjs').replaceAll('export ', '') + ';return sceneClipTimeScale;')();
const herdFactory = new Function(source('herd-motion.mjs').replaceAll('export ', '') + ';return createHerdMotion;')();
const clipStart = viewer.indexOf('function chooseClip('), clipEnd = viewer.indexOf('\nconst playbackLabel', clipStart);
const placementStart = viewer.indexOf(' for(const placement of manifest.layout.placements)'), placementEnd = viewer.indexOf('\n play=createFarmPlay', placementStart);
const initialStart = viewer.indexOf(' for(const i of instances){const preferred='), initialEnd = viewer.indexOf('\n', initialStart + 1);
if ([clipStart, clipEnd, placementStart, placementEnd, initialStart, initialEnd].some(n => n < 0)) throw new Error('Sealed viewer extraction markers changed');
const chooseClip = new Function('THREE', 'sceneClipTimeScale', viewer.slice(clipStart, clipEnd) + ';return chooseClip;')(THREE, sceneMotion);
const models = new Map(), modelFixtures: Record<string, unknown> = {};
const loader = new GLTFLoader();
// The oracle tests placement/clip data, not decoded image pixels. No DOM, GPU or network request.
loader.register(() => ({ name: 'KILN_ORACLE_NO_IMAGES', loadTexture: () => Promise.resolve(null as unknown as THREE.Texture) }));
function nodeSnapshot(node: THREE.Object3D): unknown { return { name: node.name, mesh: !!(node as THREE.Mesh).isMesh, children: node.children.map(nodeSnapshot) }; }
for (const asset of manifest.assets) {
  const path = resolve(sceneBase, asset.file), bytes = readFileSync(path);
  if ('sha256:' + hash(bytes) !== asset.runtimeSha256) throw new Error('Sealed model hash mismatch: ' + asset.id);
  sources[asset.file] = hash(bytes);
  const model = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  models.set(asset.id, model);
  modelFixtures[asset.id] = { scene: nodeSnapshot(model.scene), clips: model.animations.map(c => ({ name: c.name, duration: c.duration })) };
}
const instances: any[] = [], scene = new THREE.Scene();
new Function('THREE', 'clone', 'manifest', 'models', 'scene', 'instances', 'soilPartName', 'applyPlanting', viewer.slice(placementStart, placementEnd))(THREE, clone, manifest, models, scene, instances, planting.soilPartName, planting.applyPlanting);
new Function('instances', 'chooseClip', viewer.slice(initialStart, initialEnd))(instances, chooseClip);
const byAsset: Record<string, number> = {};
const placements = instances.map((i, n) => {
  byAsset[i.asset.id] = (byAsset[i.asset.id] ?? 0) + 1;
  return { id: i.id, asset: i.asset.id, position: i.object.position.toArray(), yaw: i.object.rotation.y, soilVisible: i.soilVisible ?? null,
    initial: { id: i.id, instanceIndex: n, clipIndex: i.clipIndex, clip: i.action?.getClip().name ?? null, time: i.action?.time ?? 0, timeScale: i.action?.timeScale ?? 1 } };
});
const provenance = { revision: manifest.projectRevision, runtimeArchiveSha256: manifest.runtimeArchiveSha256, threeRevision: THREE.REVISION, sources,
  method: 'Verified r33; GLTFLoader skips image decoding only. Executes sealed viewer placement/chooseClip/initial-clip source spans and sealed herd-motion module. No port implementation is imported.' };
const placementFixture = { provenance, entries: layout.placements.length, count: instances.length, byAsset, models: modelFixtures, placements };
const herd = herdFactory(THREE, { instances, chooseClip });
const actors = instances.filter(i => ['cow', 'sheep', 'chicken'].includes(i.asset.id));
const snapshot = () => actors.map(i => ({ id: i.id, position: i.object.position.toArray(), quaternion: i.object.quaternion.toArray(), yaw: i.object.rotation.y,
  clipIndex: i.clipIndex, clip: i.action?.getClip().name ?? null, time: i.action?.time ?? 0, timeScale: i.action?.timeScale ?? 1, paused: i.action?.paused ?? false }));
const frames = [0, 1, 5, 10, 19, 20, 35, 80, 90, 110, 220, 300, 600], samples = [];
herd.start(); let frame = 0;
for (const target of frames) {
  while (frame < target) { herd.update(.1); for (const i of instances) if (i.action) i.mixer.update(.1); frame++; }
  samples.push({ frame, report: herd.report(), actors: snapshot() });
}
herd.stop(); const stopped = snapshot();
const herdFixture = { provenance, dt: .1, samples, stopped };
mkdirSync(output, { recursive: true });
for (const [name, contents] of [['layout.json', layoutBytes], ['placements.json', JSON.stringify(placementFixture, null, 2) + '\n'], ['herd.json', JSON.stringify(herdFixture, null, 2) + '\n']]) {
  const path = resolve(output, name!);
  if (process.env.ORACLE === '1') {
    if (readFileSync(path, 'utf8') !== contents) throw new Error('Frozen pilot fixture differs: ' + name);
  } else {
    if (name === 'layout.json' && existsSync(path) && readFileSync(path, 'utf8') === contents) continue;
    if (existsSync(path)) throw new Error('Refusing to overwrite frozen fixture: ' + path);
    writeFileSync(path, contents!);
  }
}
console.log(JSON.stringify({ mode: process.env.ORACLE === '1' ? 'compare' : 'generate', entries: layout.placements.length, placements: instances.length, actors: actors.length, samples: samples.length, sources }));
