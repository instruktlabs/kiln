// Run with Bun, installed scene/site dependencies, Chrome, FFmpeg and FFprobe.
//   bun scripts/stage-seed-town-workflow.mjs HYDRATED_SITE_PUBLIC FACADE_SOURCE [--proof]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { launchChrome } from '../../scenes/packages/scene-kit/src/testing/node.ts';
import { duration, shots } from '../../scenes/packages/seed-town/scripts/workflow-sequence.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scene = resolve(site, '../scenes/packages/seed-town');
const [publicDir, sourceFile] = process.argv.slice(2);
if (!sourceFile) throw Error('Expected a hydrated site/public directory and the pinned facade-bay.kiln.js source.');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function pinned(file, sha) {
  const bytes = await readFile(file);
  if (hash(bytes) !== sha) throw Error('Input hash mismatch: ' + file);
  return bytes;
}
const manifest = await json(join(scene, 'ASSET-MANIFEST.json'));
const published = (await json(join(site, 'src/data/scene-media.json')))['seed-town'];
const directory = join(resolve(publicDir), 'scene-packs/seed-town', manifest.release);
const pack = JSON.parse(await pinned(join(directory, 'pack.json'), published.capture.packJsonSha256));
const modules = manifest.assets.map(({id, revisionId, sha256}) => ({id, revision: revisionId, sha256}));
const lead = manifest.assets.find(asset => asset.id === 'facade-bay');
const source = await pinned(resolve(sourceFile), lead.sourceSha256);
if (published.capture.seed !== '2026' || published.capture.hour !== 'day' || published.capture.release !== manifest.release) {
  throw Error('The assembly must match the published seed, hour and pack');
}
const map = new Map();
for (const item of modules) map.set('/models/' + item.id + '.glb', await pinned(join(directory, 'models', item.id + '.glb'), item.sha256));
map.set('/kits.json', await pinned(join(directory, 'data/kits.json'), pack.files.find(item => item.path === pack.data.kits).sha256));
map.set('/archivo.woff2', await readFile(join(site, 'public/fonts/archivo-latin-full-normal.woff2')));
map.set('/', '<style>@font-face{font-family:Archivo;src:url(/archivo.woff2);font-weight:100 900}</style>');
const bundle = await Bun.build({entrypoints: [join(scene, 'scripts/workflow.mjs')], target: 'browser', minify: true});
if (!bundle.success) throw Error(bundle.logs.join('\n'));
map.set('/film.js', await bundle.outputs[0].text());
const server = Bun.serve({hostname: '127.0.0.1', port: 0, fetch(request) {
  const path = new URL(request.url).pathname;
  const bytes = map.get(path);
  return bytes ? new Response(bytes, {headers: {'Content-Type': path === '/' ? 'text/html' : path === '/film.js' ? 'text/javascript' : 'application/octet-stream'}}) : new Response('', {status: 404});
}});
const fps = 24, frameCount = fps * duration;
const cache = join(site, '.cache/seed-town-film');
await mkdir(cache, {recursive: true});
const work = await mkdtemp(join(cache, 'take-'));
console.log('Frames and review captures: ' + work);
let browser, evidence;
try {
  browser = await launchChrome({workspace: work, name: 'workflow'});
  const page = await browser.newPage();
  page.on('pageerror', err => console.warn(err.message));
  await page.goto('http://127.0.0.1:' + server.port);
  evidence = await page.evaluate(async () => {
    const {prepareFilm} = await import('/film.js');
    const {frame, ...evidence} = await prepareFilm();
    window.workflowFrame = frame;
    return evidence;
  });
  const proof = process.argv.includes('--proof');
  const frames = proof ? [0, 3.5, 5.8, 7.8, 10, 11.8, 13.2, 15.4, 17.2, 19.6, 22.5, 24.4, 27.5].map(t => Math.round(t * fps)) :
    Array.from({length: frameCount}, (_, i) => i);
  for (const i of frames) {
    const encoded = await page.evaluate(t => window.workflowFrame(t), i / fps);
    const picture = Buffer.from(encoded, 'base64');
    await writeFile(join(work, 'frame-' + String(i).padStart(4, '0') + '.png'), picture);
  }
  const cover = await page.evaluate(t => window.workflowFrame(t, false), (frameCount - 1) / fps);
  await writeFile(join(work, 'poster.png'), Buffer.from(cover, 'base64'));
} finally {
  try { if (browser) await browser.close(); } finally { server.stop(); }
}
if (process.argv.includes('--proof')) process.exit(0);
function command(binary, args) {
  const run = spawnSync(binary, args, {encoding: 'utf8'});
  if (run.status !== 0) throw Error(run.stderr || run.error?.message || 'Command failed');
  return run.stdout;
}
const ffmpeg = args => command(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const mp4 = join(work, 'workflow.mp4'), gif = join(work, 'workflow.gif');
const frames = ['-framerate', String(fps), '-i', join(work, 'frame-%04d.png')];
ffmpeg([...frames, '-frames:v', String(frameCount), '-an', '-c:v', 'libx264', '-threads', '4', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
const info = JSON.parse(command(process.env.FFPROBE_PATH ?? 'ffprobe', ['-v', 'error', '-of', 'json', '-show_streams', mp4])).streams[0];
if (info.width !== 1280 || info.height !== 720 || Number(info.nb_frames) !== frameCount || Number(info.duration) !== duration || info.r_frame_rate !== fps + '/1') throw Error('Incomplete workflow film');
ffmpeg([...frames, '-filter_complex_threads', '2', '-filter_complex', 'fps=8,scale=512:288:flags=area,split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', gif]);
const filmPoster = await sharp(join(work, 'poster.png')).webp({quality: 86}).toBuffer();
const assets = [['workflow.mp4', await readFile(mp4)], ['workflow.gif', await readFile(gif)], ['poster.webp', filmPoster], ['facade-bay.kiln.js', source]];
const base = '/workflow/seed-town/' + hash(Buffer.concat(assets.map(([, bytes]) => bytes))).slice(0, 16) + '/';
const output = join(site, 'public', base), files = [];
await mkdir(output, {recursive: true});
for (const [name, bytes] of assets) {
  await writeFile(join(output, name), bytes);
  files.push({path: 'public' + base + name, bytes: bytes.length, sha256: hash(bytes)});
}
const code = source.toString('utf8');
const excerpt = code.slice(code.indexOf('  dusk: { lit: true }'), code.indexOf('\n} });')).trimEnd();
await writeFile(join(site, 'src/data/asset-to-scene.json'), JSON.stringify({
  asset: {id: lead.id, revision: lead.revisionId, placement: evidence.placement, instances: evidence.instances},
  modules,
  scene: {id: 'seed-town', seed: published.capture.seed, hour: published.capture.hour, release: manifest.release, buildings: evidence.buildings, townPlacements: evidence.placements, plantedTrees: evidence.plantedTrees, packJsonSha256: published.capture.packJsonSha256},
  capture: {backend: evidence.backend, frameCount, shots, variants: evidence.variants, buildingPlacements: evidence.buildingPlacements},
  media: {mp4: base + 'workflow.mp4', gif: base + 'workflow.gif', poster: base + 'poster.webp', width: 1280, height: 720, fps, duration},
  source: {href: base + 'facade-bay.kiln.js', sha256: lead.sourceSha256, label: 'Seed Town window bay presets', caption: 'The same bay can have a shuttered window, an iron balcony or a half-timbered wall.', excerpt},
  files,
}, null, 2) + '\n');
console.log('Staged ' + base);
