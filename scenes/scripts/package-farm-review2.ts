import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
const root = resolve(import.meta.dir, '..'), base = resolve(root, '../engine-work/local-v09-review/revision2-20260930/farm-site-intake');
const out = resolve(base, 'scene-download'), source = resolve(out, 'source');
await mkdir(source, { recursive: true });
const copy = async (path: string, to = path) => { const dest = resolve(source, to); await mkdir(resolve(dest, '..'), { recursive: true }); await cp(resolve(root, path), dest, { recursive: true }); };
for (const path of ['packages/farm/src', 'packages/farm/vendor', 'packages/farm/standalone', 'packages/scene-kit/src', 'types']) await copy(path);
for (const path of ['LICENSE', 'toolchain.json', 'tsconfig.json', 'tsconfig.base.json', 'packages/farm/package.json', 'packages/scene-kit/package.json', 'scripts/build-farm.ts', 'scripts/check-common.ts', 'scripts/check-licenses.ts', 'scripts/static-server.mjs']) await copy(path);
await copy('packages/farm/staged/r35-local-review');
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
manifest.workspaces = ['packages/farm', 'packages/scene-kit'];
manifest.scripts = { build: 'bun scripts/build-farm.ts --release r35-local-review --label rebuilt --mode public', typecheck: 'tsc --noEmit -p tsconfig.json' };
await writeFile(resolve(source, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
const lock = JSON.parse((await readFile(resolve(root, 'bun.lock'), 'utf8')).replace(/,\s*([}\]])/g, '$1'));
for (const name of ['foundry-floor', 'golden-gate']) { delete lock.workspaces[`packages/${name}`]; delete lock.packages[`@kiln-scenes/${name}`]; }
await writeFile(resolve(source, 'bun.lock'), JSON.stringify(lock, null, 2) + '\n');
await cp(resolve(root, 'packages/farm/dist/review-r2/standalone'), resolve(out, 'scene'), { recursive: true,
  filter: path => !path.endsWith('bundle-modules.json') });
await cp(resolve(root, 'LICENSE'), resolve(out, 'LICENSE-SCENE.txt'));
await writeFile(resolve(out, 'README.md'), `# Shapes & Seasons Farm: runnable scene and source\n\nLocal review r35, with first-person walking, pointer capture and revised farmer hands. Owner acceptance and publication remain pending.\n\nRun \`node scene/serve.mjs --verify\` and open the printed local URL. The bundled scene needs no install, model provider or Kiln renderer. WebGPU is selected when available, with WebGL2 fallback.\n\nChoose Walk the farm, then click the scene to capture the mouse. WASD or arrows walk; Shift runs; E interacts. Escape releases the mouse and returns to overview. A second Escape can leave the host scene. Walking has fixed eye height and no zoom. Tractor driving retains drag-orbit and wheel zoom. On touch, use the joystick and drag the scene to look; pinch zoom applies while driving.\n\nThe \`source/\` folder contains the current React Farm scene, shared scene kit, Field Grass source, exact staged runtime pack, dependency lock and build tooling. Scene software is MIT; asset declarations and dependency notices are in \`scene/assets/licenses/\`, \`scene/THIRD-PARTY-NOTICES.txt\` and \`LICENSE-SCENE.txt\`. The separate editable download supplies asset authoring sources.\n\nRebuild from \`source/\` with pinned Bun 1.4.2, Node 22.23.2 and npm 12.0.2: \`bun install --frozen-lockfile\`, then \`bun run build\`. Use \`--offline\` on install only with a populated Bun cache. Output is \`source/packages/farm/dist/rebuilt/standalone/\`. The bundled runnable scene is ready without this step.\n\nThe source dependency lock retains exact third-party resolution; only unrelated workspace entries were removed. Build-time module reports are omitted from the public runnable folder because they contain local filesystem paths. This packaging does not confer physical-mobile or performance acceptance.\n`);
if (!process.argv.includes('--seal')) { console.log(JSON.stringify({ prepared: out, source })); process.exit(0); }
const replayFiles: { path: string; sha256: string }[] = [];
async function verifyReplay(directory: string, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + item.name;
    if (item.isDirectory()) await verifyReplay(resolve(directory, item.name), path + '/');
    else {
      const a = await readFile(resolve(directory, item.name)), b = await readFile(resolve(source, 'packages/farm/dist/rebuilt/standalone', path));
      const sha256 = createHash('sha256').update(a).digest('hex');
      if (sha256 !== createHash('sha256').update(b).digest('hex')) throw new Error('Rebuild differs: ' + path);
      replayFiles.push({ path: 'scene/' + path, sha256: 'sha256:' + sha256 });
    }
  }
}
await verifyReplay(resolve(out, 'scene'));
await mkdir(resolve(out, 'metadata'), { recursive: true });
await writeFile(resolve(out, 'metadata/rebuild-proof.json'), JSON.stringify({ toolchain: { bun: '1.4.2', node: '22.23.2', npm: '12.0.2' }, dependencyInstall: 'frozen lockfile, lifecycle scripts disabled; initial offline cache lacked five dependencies so the locked package install populated them', command: 'bun run build', compared: 'Every shipped runnable file matches the rebuilt output byte-for-byte; build-only module-path report omitted.', files: replayFiles }, null, 2) + '\n');
const files: Record<string, Uint8Array> = {}, hashes: Record<string, { bytes: number; sha256: string }> = {};
async function collect(directory: string, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === 'dist' || item.name === 'evidence' || item.name === 'delivery.json') continue;
    if (item.isSymbolicLink()) throw new Error('Unexpected symlink ' + item.name);
    const path = prefix + item.name, absolute = resolve(directory, item.name);
    if (item.isDirectory()) await collect(absolute, path + '/');
    else { const bytes = await readFile(absolute); files[path] = bytes; hashes[path] = { bytes: bytes.length, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') }; }
  }
}
await collect(out);
const delivery = { schemaVersion: 1, downloadProfile: 'scene', pack: 'Shapes & Seasons Farm', state: 'local-review-candidate', projectId: 'farm-pack-review2', projectRevision: 'r_0000000002_0dcfa1bae019346ce3191dec1bb5e6674ef8b1e2f32ffba8c6d65efa2d97b377', fullPackAccepted: false,
  acceptance: { fullPackAccepted: false, approvedAssets: 22, plannedAssets: 23, pendingAssets: ['farmer'], performanceQualified: false, publicationAuthorized: false }, files: hashes };
const deliveryBytes = Buffer.from(JSON.stringify(delivery, null, 2) + '\n'); files['delivery.json'] = deliveryBytes; await writeFile(resolve(out, 'delivery.json'), deliveryBytes);
const archive = 'shapes-and-seasons-farm-scene.zip', bytes = zipSync(files, { level: 6 }); await writeFile(resolve(base, archive), bytes);
const row = { profile: 'scene', archive, bytes: bytes.length, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), files: Object.keys(files).length, assets: 23 };
await writeFile(resolve(base, 'scene-download-row.json'), JSON.stringify(row, null, 2) + '\n'); console.log(JSON.stringify({ source: resolve(base, archive), ...row }));
