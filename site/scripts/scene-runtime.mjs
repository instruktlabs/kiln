import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { RUNTIME_DIRECTORY, SCENE_DEDUPE, SCENE_PACKAGES, duplicatePackages, exportAliases, packageRoots, posix, resolveScenesDir, threeFacade } from './scene-source.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUNTIME_SCHEMA = 'kiln.scene-runtime/1';
export const RUNTIME_MANIFEST = 'runtime.json';

/**
 * Per-scene bundle ceilings (scenes DECISIONS.md D-15, amended 2026-09-29 12:45: each scene freezes
 * its own ceiling from its first passing build plus 10 percent). Bytes are exact; gzip is measured the
 * way the D-15 records measure it, with Bun's `node:zlib` gzipSync at its default level.
 */
export const CEILINGS = {
  farm: { bytes: 1_732_040, gzipBytes: 506_143 },
  'golden-gate': { bytes: 1_796_415, gzipBytes: 530_691 },
};

/** Scene runtimes the site builds itself from scene source. Others are staged from a standalone build. */
export const BUILT_RUNTIMES = {
  farm: { entry: 'src/scenes/runtime/farm.ts', packages: SCENE_PACKAGES },
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const GZIP_PROGRAM = "import { gzipSync } from 'node:zlib'; const parts = []; for await (const part of process.stdin) parts.push(part); process.stdout.write(String(gzipSync(Buffer.concat(parts)).length));";

/**
 * Gzip size as the D-15 ceilings measure it. Bun's zlib is not Node's (the same Farm chunk is 462,421
 * bytes under Bun and 458,306 under Node 22), so a run under Node asks Bun, which the site already
 * requires for its lockfile. Without Bun the Node figure is returned and marked as such.
 */
export function gzipMeasure(bytes) {
  if (globalThis.Bun) return { bytes: gzipSync(bytes).length, method: 'bun-zlib' };
  const result = spawnSync('bun', ['--eval', GZIP_PROGRAM], { input: bytes, maxBuffer: 1 << 20, encoding: 'utf8' });
  if (result.status === 0 && /^\d+$/.test(result.stdout.trim())) return { bytes: Number(result.stdout.trim()), method: 'bun-zlib' };
  return { bytes: gzipSync(bytes).length, method: 'node-zlib' };
}

/** Fails the runtime build if the scene pulled a second three, React, React DOM or R3F into the graph. */
export function singleCopyGuard(onModules) {
  return {
    name: 'kiln-scene-single-copy',
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap((chunk) => (chunk.type === 'chunk' ? Object.keys(chunk.modules) : []));
      onModules?.(ids);
      const duplicates = duplicatePackages(ids);
      if (duplicates.length) {
        const detail = duplicates.map(({ name, copies }) => `${name}: ${copies.join(', ')}`).join('; ');
        this.error(`A scene runtime must share one copy of ${SCENE_DEDUPE.join(', ')}. Duplicates: ${detail}`);
      }
    },
  };
}

/** The guarded packages and the package roots the bundle used for each (one root each when deduped). */
export function packageCopies(moduleIds, names = SCENE_DEDUPE) {
  return Object.fromEntries([...packageRoots(moduleIds, names)].map(([name, roots]) => [name, [...roots].map(posix).sort()]));
}

/**
 * Vite settings for a scene runtime, the same way the scene kit's `sceneSourceConfig('public')`
 * builds a public scene: bare `three` resolves to the kit's runtime facade (one webgpu-based
 * three, no second WebGLRenderer copy), the shared packages resolve to one copy, and the public
 * build constants are false. `alias: false` reproduces a consumer without the facade for measurement.
 */
export function runtimeViteConfig({ react, scenesDir, packages, entry, outDir, name, alias = true, site = SITE, plugins = [] }) {
  const aliases = [
    ...(alias ? [{ find: /^three$/, replacement: threeFacade(scenesDir) }] : []),
    ...packages.flatMap((pkg) => exportAliases(resolve(scenesDir, 'packages', pkg), `@kiln-scenes/${pkg}`)),
  ];
  return {
    configFile: false,
    envDir: false,
    root: site,
    logLevel: 'warn',
    publicDir: false,
    plugins: [react(), ...plugins],
    define: { 'import.meta.env.KILN_DEV': false, 'import.meta.env.KILN_TEST': false },
    resolve: { alias: aliases, dedupe: [...SCENE_DEDUPE] },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      reportCompressedSize: false,
      // An application build of a script entry, not library mode: library mode keeps ES whitespace, and the
      // scene kit's own builds (the numbers the D-15 ceilings measure) are application builds.
      modulePreload: false,
      chunkSizeWarningLimit: 4096, // the per-scene D-15 ceiling is the size gate
      rollupOptions: {
        input: { [name]: resolve(site, entry) },
        preserveEntrySignatures: 'strict',
        output: { entryFileNames: `${name}-[hash].js`, codeSplitting: false },
      },
    },
  };
}

/** Build one scene runtime into `outDir`; returns its single chunk and the module graph it used. */
export async function buildRuntime({ id = 'farm', scenesDir, outDir, alias = true, site = SITE } = {}) {
  const runtime = BUILT_RUNTIMES[id];
  if (!runtime) throw new Error(`No site-built runtime for ${id}`);
  if (!scenesDir) throw new Error('A scenes workspace is required to build a scene runtime');
  const { build } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  let modules = [];
  const config = runtimeViteConfig({ react, scenesDir, packages: runtime.packages, entry: runtime.entry, outDir, name: id, alias, site, plugins: [singleCopyGuard((ids) => { modules = ids; })] });
  await build(config);
  const files = (await readdir(outDir)).filter((file) => file.endsWith('.js'));
  if (files.length !== 1) throw new Error(`Expected one runtime chunk for ${id}, found ${files.length}: ${files.join(', ')}`);
  const file = files[0];
  const bytes = await readFile(join(outDir, file));
  const gzip = gzipMeasure(bytes);
  return {
    id,
    file,
    bytes: bytes.length,
    gzipBytes: gzip.bytes,
    gzipMethod: gzip.method,
    sha256: sha256(bytes),
    modules: [...new Set(modules)].sort(),
    copies: packageCopies(modules),
    facade: modules.some((moduleId) => posix(moduleId).endsWith('/packages/scene-kit/src/renderer/three-runtime.ts')),
  };
}

/** Whether a measurement is within its scene's D-15 ceiling. */
export function checkCeiling(id, measurement) {
  const ceiling = CEILINGS[id];
  if (!ceiling) return { within: null, ceiling: null };
  return {
    ceiling,
    within: measurement.bytes <= ceiling.bytes && measurement.gzipBytes <= ceiling.gzipBytes,
    percent: { bytes: Number(((measurement.bytes / ceiling.bytes) * 100).toFixed(1)), gzipBytes: Number(((measurement.gzipBytes / ceiling.gzipBytes) * 100).toFixed(1)) },
  };
}

const toolVersion = (name, site = SITE) => {
  try {
    return JSON.parse(readFileSync(resolve(site, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

/** The public build record stored beside the staged runtime. It carries no local paths. */
export function runtimeManifest(id, measurement, { kind = 'module', site = SITE } = {}) {
  const fit = checkCeiling(id, measurement);
  return {
    schema: RUNTIME_SCHEMA,
    id,
    kind,
    file: measurement.file,
    url: `/${RUNTIME_DIRECTORY}/${id}/${measurement.file}`,
    bytes: measurement.bytes,
    gzipBytes: measurement.gzipBytes,
    gzipMethod: measurement.gzipMethod,
    sha256: measurement.sha256,
    ceiling: { ...fit.ceiling, decision: 'D-15', withinCeiling: fit.within, percent: fit.percent },
    three: { version: toolVersion('three', site), facade: measurement.facade, copies: Object.fromEntries(Object.entries(measurement.copies).map(([name, roots]) => [name, roots.map((root) => root.replace(/^.*\/node_modules\//, 'node_modules/'))])) },
    build: { vite: toolVersion('vite', site), pluginReact: toolVersion('@vitejs/plugin-react', site), dedupe: [...SCENE_DEDUPE] },
  };
}

/** Where a scene's runtime is staged under public/. */
export const stagedRuntimeDirectory = (id, site = SITE) => resolve(site, 'public', RUNTIME_DIRECTORY, id);

/** Build a scene runtime and stage it (chunk plus manifest) into public/scene-runtime/<id>/. */
export async function stageRuntime({ id = 'farm', scenesDir, site = SITE, alias = true, scratch = resolve(site, '.cache/scene-runtime') } = {}) {
  const out = join(scratch, id);
  await rm(out, { recursive: true, force: true });
  const measurement = await buildRuntime({ id, scenesDir, outDir: out, alias, site });
  const fit = checkCeiling(id, measurement);
  if (fit.within === false) {
    throw new Error(`The ${id} runtime is over its D-15 ceiling: ${measurement.bytes} B / ${measurement.gzipBytes} B gzip against ${fit.ceiling.bytes} B / ${fit.ceiling.gzipBytes} B gzip`);
  }
  if (alias && !measurement.facade) throw new Error(`The ${id} runtime was built without the scene kit's three facade`);
  const target = stagedRuntimeDirectory(id, site);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const bytes = await readFile(join(out, measurement.file));
  await writeFile(join(target, measurement.file), bytes);
  const manifest = runtimeManifest(id, measurement, { site });
  await writeFile(join(target, RUNTIME_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return { measurement, manifest, target };
}

export const FRAME_FILE = 'frame.html';
const FRAME_TITLES = { 'golden-gate': 'Golden Gate Bridge scene' };

/**
 * The page a frame-kind scene runs in: the elements the scene's standalone entry looks up (its
 * container, status line and two buttons it wires), the pack location, and a small reporter that turns
 * the entry's status line into messages for the shell (progress text, then ready, or an error). The
 * scene's own chunk stays byte for byte as built.
 */
export function frameDocument({ id, file, packBase }) {
  const title = FRAME_TITLES[id] ?? 'Scene';
  const container = id;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="kiln-asset-base" content="${packBase}">
<link rel="icon" href="data:,">
<title>${title}</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#1b2630;color:#fff;font:15px/1.45 system-ui,sans-serif}#scene-shell{position:absolute;inset:0}#${container}{width:100%;height:100%}#page-status{position:absolute;left:0;right:0;bottom:0;margin:0;padding:.75rem 1rem;background:rgba(0,0,0,.6)}#page-status:empty{display:none}</style>
<script type="module" src="./${file}"></script>
</head>
<body>
<main id="scene-shell"><div id="${container}"></div><p id="page-status" role="status">Loading scene…</p></main>
<button id="exit-scene" type="button" hidden>Exit scene</button>
<button id="fullscreen-scene" type="button" hidden>Fullscreen</button>
<script>
(function () {
  var status = document.getElementById('page-status');
  function post(message) {
    if (window.parent !== window) window.parent.postMessage(Object.assign({ source: 'kiln-scene' }, message), location.origin);
  }
  function report() {
    var text = status.textContent.trim();
    if (/^Scene could not start/i.test(text)) post({ state: 'error', message: text });
    else if (text) post({ state: 'progress', text: text });
    else post({ state: 'ready' });
  }
  new MutationObserver(report).observe(status, { childList: true, characterData: true, subtree: true });
  report();
})();
</script>
</body>
</html>
`;
}

/**
 * Measure the public chunk of a standalone build and check its module list: exactly one chunk, one
 * copy of each guarded package, the kit's three facade present, within the D-15 ceiling. Returns the
 * measurement and the record the catalog keeps for it.
 */
export async function measureFrameRuntime({ id, source }) {
  const assets = join(source, 'assets');
  const chunks = (await readdir(assets)).filter((name) => /^index-[A-Za-z0-9_-]+.js$/.test(name));
  if (chunks.length !== 1) throw new Error(`Expected one public chunk in ${assets}, found ${chunks.length}: ${chunks.join(', ')}`);
  const bytes = await readFile(join(assets, chunks[0]));
  const modulesBytes = await readFile(join(source, 'bundle-modules.json'));
  const modules = JSON.parse(modulesBytes.toString('utf8')).modules;
  if (!Array.isArray(modules)) throw new Error('bundle-modules.json lists no modules');
  const duplicates = duplicatePackages(modules);
  if (duplicates.length) {
    throw new Error(`The ${id} build carries more than one copy of ${duplicates.map(({ name, copies }) => `${name} (${copies.join(', ')})`).join('; ')}`);
  }
  const gzip = gzipMeasure(bytes);
  const measurement = {
    id,
    file: chunks[0],
    bytes: bytes.length,
    gzipBytes: gzip.bytes,
    gzipMethod: gzip.method,
    sha256: sha256(bytes),
    modules,
    copies: packageCopies(modules),
    facade: modules.some((moduleId) => posix(moduleId).endsWith('/packages/scene-kit/src/renderer/three-runtime.ts')),
  };
  if (measurement.copies.three.length !== 1) throw new Error(`The ${id} build must contain exactly one three package; found ${measurement.copies.three.length}`);
  if (!measurement.facade) throw new Error(`The ${id} build does not use the scene kit's three facade`);
  const fit = checkCeiling(id, measurement);
  if (fit.within === false) throw new Error(`The ${id} runtime is over its D-15 ceiling: ${measurement.bytes} B / ${measurement.gzipBytes} B gzip against ${fit.ceiling.bytes} B / ${fit.ceiling.gzipBytes} B gzip`);
  return {
    measurement,
    record: { kind: 'frame', file: measurement.file, bytes: measurement.bytes, gzipBytes: measurement.gzipBytes, gzipMethod: measurement.gzipMethod, sha256: measurement.sha256, modulesSha256: sha256(modulesBytes) },
  };
}

/** Stage a standalone build's public chunk (byte for byte) with its frame page and manifest. */
export async function stageFrameRuntime({ id, source, measurement, packBase, site = SITE }) {
  const target = stagedRuntimeDirectory(id, site);
  const { file } = measurement.measurement;
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await copyFile(join(source, 'assets', file), join(target, file));
  if (sha256(await readFile(join(target, file))) !== measurement.measurement.sha256) throw new Error(`The staged ${id} chunk differs from its source`);
  const frame = frameDocument({ id, file, packBase });
  await writeFile(join(target, FRAME_FILE), frame);
  const manifest = {
    ...runtimeManifest(id, measurement.measurement, { kind: 'frame', site }),
    url: `/${RUNTIME_DIRECTORY}/${id}/${FRAME_FILE}`,
    chunk: `/${RUNTIME_DIRECTORY}/${id}/${file}`,
    frameSha256: sha256(Buffer.from(frame)),
    modulesSha256: measurement.record.modulesSha256,
  };
  await writeFile(join(target, RUNTIME_MANIFEST), `${JSON.stringify(manifest, null, 2)}
`);
  return manifest;
}

/** The chunk a staged manifest describes, re-read and re-hashed. */
export async function verifyStagedRuntime(directory) {
  const manifest = JSON.parse(await readFile(join(directory, RUNTIME_MANIFEST), 'utf8'));
  if (manifest.schema !== RUNTIME_SCHEMA) throw new Error(`Not a ${RUNTIME_SCHEMA} manifest: ${directory}`);
  const bytes = await readFile(join(directory, manifest.file));
  if (bytes.length !== manifest.bytes || sha256(bytes) !== manifest.sha256) throw new Error(`The staged runtime ${manifest.file} does not match its manifest`);
  return manifest;
}

export async function main(argv = process.argv.slice(2), env = process.env, site = SITE) {
  const option = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const id = option('--scene') ?? 'farm';
  const scenesDir = resolveScenesDir({ env, site });
  const served = stagedRuntimeDirectory(id, site);
  if (!scenesDir) {
    const removed = existsSync(served);
    if (removed) await rm(served, { recursive: true, force: true });
    console.log(`Scene runtime ${id} not built: no scenes workspace (KILN_SITE_SCENES_DIR). The scene keeps its fallback.${removed ? ' A copy staged earlier was removed.' : ''}`);
    return null;
  }
  if (argv.includes('--measure')) {
    // Measurement only: build with and without the kit's three facade into scratch; nothing is staged.
    const scratch = resolve(site, '.cache/scene-runtime-measure');
    const result = {};
    for (const alias of [true, false]) {
      const measurement = await buildRuntime({ id, scenesDir, outDir: join(scratch, alias ? 'alias' : 'no-alias'), alias, site });
      result[alias ? 'withAlias' : 'withoutAlias'] = { file: measurement.file, bytes: measurement.bytes, gzipBytes: measurement.gzipBytes, gzipMethod: measurement.gzipMethod, sha256: measurement.sha256, facade: measurement.facade, threeCopies: measurement.copies.three.length, ...checkCeiling(id, measurement) };
    }
    console.log(JSON.stringify({ id, ...result }, null, 2));
    return result;
  }
  const { measurement, manifest, target } = await stageRuntime({ id, scenesDir, site, alias: !argv.includes('--no-alias') });
  console.log(`Staged scene runtime ${id}: ${manifest.file}, ${measurement.bytes} bytes, ${measurement.gzipBytes} bytes gzip (${measurement.gzipMethod}); ${manifest.ceiling.percent.bytes}% and ${manifest.ceiling.percent.gzipBytes}% of the D-15 ceiling; one three copy: ${manifest.three.copies.three.length === 1}; into ${target}.`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
