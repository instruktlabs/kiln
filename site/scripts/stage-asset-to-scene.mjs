import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Stage a captured presentation of existing assets; never author in the engine checkout.
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = process.argv[2] && resolve(process.argv[2]);
if (!workspace || workspace.startsWith(resolve(site, '..'))) throw Error('A separate capture workspace is required.');
const read = (name) => readFile(join(workspace, name));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await read('web/manifest.json'));
const proof = JSON.parse(await read('web/captures/property/proof.json'));
const catalog = JSON.parse(await readFile(join(site, 'src/data/holodeck.json')));
const pack = catalog.packs.find((p) => p.id === 'holodeck-winter-mountainside-cabin');
if (proof.backend !== 'WebGPU' || !proof.shadows || manifest.scene.capture.backend !== 'WebGPU') throw Error('Missing GPU capture evidence.');
for (const id of ['wmc-loft-bed', 'wmc-kitchen-run', 'wmc-sofa-wool']) if (!manifest.interiorAssets?.includes(id) || !proof.interiorAssets?.includes(id)) throw Error('Missing interior assembly evidence: ' + id);
if (manifest.worldSha256 !== pack.source.worldSha256 || proof.worldSha256 !== manifest.worldSha256) throw Error('World snapshot mismatch.');
for (const module of manifest.modules) {
  const saved = catalog.assets.find((a) => a.slug === module.slug);
  if (module.revision !== saved.revisionId || module.placedRevision !== saved.revisionId || hash(await read('web/' + module.model)) !== module.sha256 || proof.modules.find((m) => m.id === module.id)?.sha256 !== module.sha256) throw Error('Module revision or capture mismatch: ' + module.id);
}
if (hash(await read('web/scene.webp')) !== hash(await readFile(join(site, 'public', manifest.scene.src)))) throw Error('Scene capture mismatch.');
const source = await read('wall.kiln.js');
if (hash(source) !== catalog.assets.find((a) => a.slug === manifest.asset.slug).sourceSha256) throw Error('Source mismatch.');
const staging = join(site, '.cache/asset-to-scene');
await mkdir(staging, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr || result.error?.message || 'Media command failed');
  return result.stdout;
};
if (proof.style !== 'property-film-v1' || proof.placementMethod !== 'grounded-reveal' || proof.fps !== 30 || proof.frameCount !== Math.round(proof.duration * proof.fps) || proof.duration < 25 || proof.duration > 40 || proof.shots.map((shot) => shot.id).join(',') !== 'asset,reveal,architecture,living,living-tour,stairs,loft,scene') throw Error('Incomplete property film shot plan.');
if (proof.upstairsAssembly?.internalTreadCount !== 17 || proof.upstairsAssembly.maxVisibleTreadsBeforeBuild !== 0 || proof.upstairsAssembly.visibleTreadsAfterBuild !== 17 || !proof.upstairsAssembly.landingVisible || proof.upstairsAssembly.hiddenUntil < proof.shots.find((shot) => shot.id === 'living-tour').end) throw Error('Staircase appears before the upstairs sequence or the landing is incomplete.');
const frameHashes = [];
for (let index = 0; index < proof.frameCount; index++) {
  frameHashes.push(hash(await read(`web/captures/property/frame-${String(index).padStart(4, '0')}.png`)));
}
proof.framesSha256 = hash(Buffer.from(frameHashes.join('\n')));
const actionStart = Math.ceil(proof.shots.find((shot) => shot.id === 'reveal').start * proof.fps);
const actionEnd = Math.floor(proof.shots.find((shot) => shot.id === 'loft').end * proof.fps);
let repeated = 1, longestHold = 1;
for (let frame = actionStart + 1; frame < actionEnd; frame++) {
  repeated = frameHashes[frame] === frameHashes[frame - 1] ? repeated + 1 : 1;
  longestHold = Math.max(longestHold, repeated);
}
proof.maxAssemblyHoldSeconds = longestHold / proof.fps;
const ffmpeg = (args) => run(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
ffmpeg(['-framerate', String(proof.fps), '-i', join(workspace, 'web/captures/property/frame-%04d.png'), '-frames:v', String(proof.frameCount), '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(staging, 'workflow.mp4')]);
const input = join(staging, 'workflow.mp4');
const inspected = JSON.parse(run(process.env.FFPROBE_PATH ?? 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', input]));
if (Number(inspected.streams[0].nb_frames) !== proof.frameCount || Math.abs(Number(inspected.format.duration) - proof.duration) > .01 || inspected.streams[0].r_frame_rate !== '30/1' || inspected.streams[0].width !== 1280 || inspected.streams[0].height !== 720) throw Error('Encoded clip differs from the directed frame sequence.');
ffmpeg(['-i', input, '-filter_complex_threads', '2', '-filter_complex', 'fps=8,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', join(staging, 'workflow.gif')]);
ffmpeg(['-ss', String(proof.shots.find((shot) => shot.id === 'loft').review), '-i', input, '-frames:v', '1', join(staging, 'poster.png')]);
await sharp(join(staging, 'poster.png')).webp({ quality: 90 }).toFile(join(staging, 'poster.webp'));
await writeFile(join(staging, 'wall.kiln.js'), source);
const names = ['workflow.mp4', 'workflow.gif', 'poster.webp', 'wall.kiln.js'];
const bytes = await Promise.all(names.map((name) => readFile(join(staging, name))));
const base = `/workflow/winter-cabin/${hash(Buffer.concat(bytes)).slice(0, 16)}/`;
await mkdir(join(site, 'public', base), { recursive: true });
const files = [];
for (let i = 0; i < names.length; i++) {
  await writeFile(join(site, 'public', base, names[i]), bytes[i]);
  files.push({ path: `public${base}${names[i]}`, sha256: hash(bytes[i]), bytes: bytes[i].length });
}
const text = source.toString('utf8');
const excerpt = text.slice(text.indexOf('async function wallRect'), text.indexOf('async function floorBuild')).trim();
await writeFile(join(site, 'src/data/asset-to-scene.json'), JSON.stringify({
  asset: manifest.asset, modules: manifest.modules, interiorAssets: manifest.interiorAssets, placements: manifest.objects.length, worldSha256: manifest.worldSha256,
  capture: proof, scene: manifest.scene,
  media: { mp4: base + 'workflow.mp4', gif: base + 'workflow.gif', poster: base + 'poster.webp', width: 1280, height: 720, fps: proof.fps, duration: Number(inspected.format.duration) },
  source: { href: base + 'wall.kiln.js', sha256: hash(source), excerpt }, files,
}, null, 2) + '\n');
console.log(`Staged one workflow: ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes at ${base}`);
