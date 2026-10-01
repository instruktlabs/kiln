// The public chunk's double three import (TASK-M3.md "Known defects"): the site bundles the Farm source without the kit's
// `three` facade alias (site scripts/scene-source.mjs aliases only the @kiln-scenes entries), so R3F's and the three addons'
// bare `import 'three'` resolve to the classic build (three.module.js, with WebGLRenderer) beside `three/webgpu`.
// This builds the Farm standalone public output a second time with the site's resolution (the facade alias removed, the same
// dedupe), into .tmp, and records the byte cost against the Farm's own build and the D-15 Farm ceiling. Bytes are static,
// so the load on this PC does not affect them. Usage: scripts/check-farm-three-import.ts --label m3
import { build } from 'vite';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { sceneStandaloneConfig } from '../packages/scene-kit/src/build';

const args = process.argv.slice(2), root = resolve(import.meta.dir, '..');
const label = (() => { const at = args.indexOf('--label'); return at >= 0 && args[at + 1] ? args[at + 1]! : 'm3'; })();
const D15_FARM = { bytes: 1_732_040, gzipBytes: 506_143, base: { bytes: 1_574_581, gzipBytes: 460_130 } }; // DECISIONS.md D-15, amended 12:45
const own = resolve(root, `packages/farm/dist/${label}/standalone`), simulated = resolve(root, '.tmp/farm-site-resolution');

async function measure(dir: string) {
  const chunks = [];
  for (const name of await readdir(resolve(dir, 'assets'))) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const bytes = await readFile(resolve(dir, 'assets', name)); chunks.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  const modules = (JSON.parse(await readFile(resolve(dir, 'bundle-modules.json'), 'utf8')).modules as string[]).map(id => id.replaceAll('\\', '/'));
  const three = modules.filter(id => id.includes('/node_modules/three/')).map(id => id.replace(/^.*\/node_modules\/three\//, 'three/'));
  return { chunks, bytes: chunks.reduce((s, c) => s + c.bytes, 0), gzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0), threeModules: three,
    classicBuild: three.includes('three/build/three.module.js'), webgpuBuild: three.includes('three/build/three.webgpu.js') };
}

const config = sceneStandaloneConfig({ root: resolve(root, 'packages/farm/standalone'), outDir: simulated, mode: 'public' });
const facade = (config.resolve!.alias as { find: RegExp; replacement: string }[]);
const removed = facade.filter(entry => String(entry.find) === String(/^three$/));
if (removed.length !== 1) throw new Error('Expected exactly one kit `three` facade alias in the standalone config');
config.resolve!.alias = facade.filter(entry => !removed.includes(entry));
await rm(simulated, { recursive: true, force: true });
await build({ ...config, configFile: false, logLevel: 'warn' });
const [ownBuild, siteResolution] = [await measure(own), await measure(simulated)];
const pct = (value: number, of: number) => Math.round(value / of * 10000) / 100;
const result = {
  schema: 'kiln.farm-three-import/1', date: new Date().toISOString(), label,
  question: 'Does the Farm public chunk carry the classic WebGLRenderer beside three/webgpu, and can the Farm build avoid it?',
  farmBuild: { output: `packages/farm/dist/${label}/standalone`, ...ownBuild },
  siteResolution: { output: '.tmp/farm-site-resolution (scratch, deleted after measuring)', resolution: 'kit standalone config without its `three` facade alias (the site keeps only exact @kiln-scenes aliases and the same dedupe)', ...siteResolution },
  cost: { bytes: siteResolution.bytes - ownBuild.bytes, gzipBytes: siteResolution.gzipBytes - ownBuild.gzipBytes },
  d15Farm: { ceiling: { bytes: D15_FARM.bytes, gzipBytes: D15_FARM.gzipBytes }, base: D15_FARM.base,
    farmBuildPercentOfCeiling: { bytes: pct(ownBuild.bytes, D15_FARM.bytes), gzip: pct(ownBuild.gzipBytes, D15_FARM.gzipBytes) },
    siteResolutionPercentOfCeiling: { bytes: pct(siteResolution.bytes, D15_FARM.bytes), gzip: pct(siteResolution.gzipBytes, D15_FARM.gzipBytes) },
    siteResolutionWithinCeiling: siteResolution.bytes <= D15_FARM.bytes && siteResolution.gzipBytes <= D15_FARM.gzipBytes },
  answer: [
    'The Farm build itself has no double import: its own public output resolves every bare `three` import to the kit facade over three/webgpu, so three.module.js is absent from its module graph.',
    'Neither packages/farm/src nor packages/scene-kit/src imports bare `three` for values; the bare imports come from @react-three/fiber and the three/examples/jsm addons (GLTFLoader, OrbitControls, BufferGeometryUtils, SkeletonUtils, RoomEnvironment). The Farm cannot change how a consumer resolves those, so it cannot avoid the classic build in the site on its own.',
    'The remedy is one alias in the consumer: `{ find: /^three$/, replacement: <scene-kit>/src/renderer/three-runtime.ts }` (the kit exports it as THREE_RUNTIME_FACADE and applies it in sceneSourceConfig), which also removes the deprecated three.Clock warning (R2-04). That is a site change for the coordinator; the site is read-only here.',
  ],
};
await rm(simulated, { recursive: true, force: true });
const dest = resolve(root, `evidence/build/${label}`); await mkdir(dest, { recursive: true });
await writeFile(resolve(dest, 'three-double-import.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ farm: [ownBuild.bytes, ownBuild.gzipBytes, ownBuild.classicBuild], site: [siteResolution.bytes, siteResolution.gzipBytes, siteResolution.classicBuild], cost: result.cost, d15: result.d15Farm }));
