#!/usr/bin/env bun
// Browser runtime spike (#377): bundle the build path for the browser and, from the same
// entry, for Node. Every Node-only edge the browser build meets is recorded by module and
// importer, then shimmed (crypto, sharp), left to Bun's browser fallback (buffer) or replaced by a
// stub that throws a named error if it is ever called. Writes under tmp/browser-runtime-spike/,
// which is ignored. Not part of the package.
//
//   bun scripts/browser-runtime-spike/bundle.mjs
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
export const outRoot = join(repo, 'tmp', 'browser-runtime-spike');
const rel = (path) => relative(repo, path).replace(/\\/g, '/');

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const nativePackages = new Set(['sharp', '@napi-rs/canvas']);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Names an importer takes from `specifier`, read from its import statements. */
function importedNames(source, specifier) {
  const names = new Set();
  const spec = `['"]${escapeRegExp(specifier)}['"]`;
  for (const match of source.matchAll(
    new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+${spec}`, 'g'),
  ))
    for (const part of match[1].split(',')) {
      const item = part.trim();
      if (!item || item.startsWith('type ')) continue;
      names.add(item.split(/\s+as\s+/)[0].trim());
    }
  for (const match of source.matchAll(
    new RegExp(`import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+${spec}`, 'g'),
  ))
    for (const use of source.matchAll(new RegExp(`\\b${match[1]}\\.(\\w+)`, 'g')))
      names.add(use[1]);
  return [...names].filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default');
}

function stubModule(module, importer, names) {
  const label = module.replace(/^node:/, '');
  const lines = [
    `const where = ${JSON.stringify(rel(importer))};`,
    'const fail = (name) => function nodeOnly() {',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: generated stub source, not a template here
    '  throw new Error(`Node-only ${name} was called in the browser build (imported by ${where}).`);',
    '};',
  ];
  for (const name of names) {
    // util.promisify runs at module load (src/kit.ts); the wrapped function fails when called.
    if (label === 'util' && name === 'promisify')
      lines.push(
        'export const promisify = (fn) => (...args) => Promise.resolve().then(() => fn(...args));',
      );
    else lines.push(`export const ${name} = fail(${JSON.stringify(`${label}.${name}`)});`);
  }
  lines.push(
    // A callable target, so `(await import(x)).default(...)` also fails with the module's name.
    `export default new Proxy(fail(${JSON.stringify(label)}), { get: (_, key) => (typeof key === 'string' ? fail(${JSON.stringify(label)} + '.' + key) : undefined) });`,
  );
  return lines.join('\n');
}

function edgePlugin(edges) {
  return {
    name: 'kiln-browser-node-edges',
    setup(build) {
      // Bun does not carry pluginData from onResolve to onLoad, so stubs are keyed by path.
      const stubs = new Map();
      build.onResolve({ filter: /.*/ }, async (args) => {
        const isBuiltin = builtins.has(args.path);
        if (!isBuiltin && !nativePackages.has(args.path)) return undefined;
        const module = args.path.replace(/^node:/, '');
        const edge = { module, importer: rel(args.importer), kind: args.kind };
        if (module === 'crypto') {
          edges.push({ ...edge, action: 'shim: sync SHA-256 and SHA-1 (crypto-shim.mjs)' });
          return { path: join(here, 'crypto-shim.mjs') };
        }
        if (module === 'sharp') {
          edges.push({
            ...edge,
            action: 'shim: raw-to-PNG encode, PNG-to-RGBA decode (sharp-shim.mjs)',
          });
          return { path: join(here, 'sharp-shim.mjs') };
        }
        if (module === 'buffer') {
          edges.push({ ...edge, action: "Bun's browser fallback for node:buffer" });
          return undefined;
        }
        const source = await readFile(args.importer, 'utf8').catch(() => '');
        const names = importedNames(source, args.path);
        edges.push({ ...edge, names, action: 'stub: throws if called' });
        const path = `${args.path}|${args.importer}`;
        stubs.set(path, { module: args.path, importer: args.importer, names });
        return { path, namespace: 'kiln-node-stub' };
      });
      build.onLoad({ filter: /.*/, namespace: 'kiln-node-stub' }, ({ path }) => {
        const stub = stubs.get(path);
        return { contents: stubModule(stub.module, stub.importer, stub.names), loader: 'js' };
      });
    },
  };
}

const entrypoints = [join(here, 'entry.ts'), join(here, 'worker.ts')];
// The engine reads host flags (KILN_GLTF_EXPORTER, KILN_QA_*, KILN_BAKE_*) from process.env.
// A page has no environment: every flag is unset, and the Node reference runs with them unset.
const browserDefine = { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' };

async function browserBuild(outdir, minify, edges) {
  await rm(outdir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints,
    outdir,
    target: 'browser',
    format: 'esm',
    splitting: true,
    minify,
    sourcemap: 'none',
    define: browserDefine,
    naming: { entry: '[name].js', chunk: 'chunk-[hash].js' },
    plugins: [edgePlugin(edges)],
    throw: false,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error('Browser bundle failed.');
  }
  // manifold-3d locates its WASM beside the module with new URL('manifold.wasm', import.meta.url).
  await copyFile(
    join(repo, 'node_modules/manifold-3d/manifold.wasm'),
    join(outdir, 'manifold.wasm'),
  );
  return result;
}

/** Which chunk holds each source module, from the comments of the unminified build. */
async function moduleMap(outdir) {
  const map = {};
  for (const file of await readdir(outdir)) {
    if (!file.endsWith('.js')) continue;
    const text = await readFile(join(outdir, file), 'utf8');
    for (const match of text.matchAll(/^\/\/ ((?:src|node_modules|scripts)\/[^\n]+)$/gm))
      map[match[1].trim()] = file;
  }
  return map;
}

/** Static import graph of the unminified chunks: which chunks load with the entry. */
async function staticClosure(outdir, entry) {
  const seen = new Set();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = await readFile(join(outdir, file), 'utf8');
    // Static `from "./x.js"` and bare `import "./x.js"`; dynamic import("./x.js") stays lazy.
    for (const match of text.matchAll(/(?:from\s*|import\s*)"\.\/([^"]+\.js)"/g))
      await visit(match[1]);
  };
  await visit(entry);
  return [...seen];
}

function sizes(bytes) {
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
      },
    }).length,
  };
}

async function sizeReport(outdir, eager) {
  const files = {};
  const total = { raw: 0, gzip: 0, brotli: 0 };
  const initial = { raw: 0, gzip: 0, brotli: 0 };
  for (const file of (await readdir(outdir)).sort()) {
    const measured = sizes(await readFile(join(outdir, file)));
    files[file] = { ...measured, eager: eager.includes(file) };
    for (const key of Object.keys(total)) {
      total[key] += measured[key];
      if (eager.includes(file)) initial[key] += measured[key];
    }
  }
  return { files, total, initialEntry: initial };
}

export async function bundleSpike() {
  await mkdir(outRoot, { recursive: true });
  const edges = [];
  const minified = join(outRoot, 'browser');
  const plain = join(outRoot, 'browser-plain');
  await browserBuild(minified, true, edges);
  await browserBuild(plain, false, []);

  const modules = await moduleMap(plain);
  const eagerPlain = await staticClosure(plain, 'entry.js');
  const eagerMin = await staticClosure(minified, 'entry.js');
  const placed = edges.map((edge) => ({
    ...edge,
    chunk: modules[edge.importer] ?? '(unknown)',
    loadsWithEntry: eagerPlain.includes(modules[edge.importer]),
  }));
  const unique = [];
  const keys = new Set();
  for (const edge of placed) {
    const key = `${edge.module}|${edge.importer}|${edge.kind}`;
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(edge);
  }
  unique.sort((a, b) => a.importer.localeCompare(b.importer) || a.module.localeCompare(b.module));

  const node = join(outRoot, 'node');
  await rm(node, { recursive: true, force: true });
  const nodeResult = await Bun.build({
    entrypoints: [join(here, 'entry.ts')],
    outdir: node,
    target: 'node',
    format: 'esm',
    packages: 'external',
    naming: { entry: '[name].mjs' },
    throw: false,
  });
  if (!nodeResult.success) {
    for (const log of nodeResult.logs) console.error(String(log));
    throw new Error('Node bundle failed.');
  }

  const report = {
    bun: Bun.version,
    browser: await sizeReport(minified, eagerMin),
    unminifiedEntryClosure: eagerPlain,
    modulesByChunk: modules,
    edges: unique,
  };
  await writeFile(join(outRoot, 'bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.main) {
  const report = await bundleSpike();
  const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
  const { total, initialEntry } = report.browser;
  console.log(
    `initial (entry closure): ${kb(initialEntry.raw)} raw, ${kb(initialEntry.gzip)} gzip, ${kb(initialEntry.brotli)} brotli`,
  );
  console.log(
    `all files incl. lazy chunks and manifold.wasm: ${kb(total.raw)} raw, ${kb(total.gzip)} gzip, ${kb(total.brotli)} brotli`,
  );
  for (const [file, size] of Object.entries(report.browser.files))
    console.log(
      `  ${file.padEnd(28)} ${kb(size.raw).padStart(12)} ${kb(size.gzip).padStart(12)} ${kb(size.brotli).padStart(12)} ${size.eager ? 'entry' : 'lazy'}`,
    );
  console.log(`${report.edges.length} Node-only edges:`);
  for (const edge of report.edges)
    console.log(
      `  ${edge.module.padEnd(16)} ${edge.importer.padEnd(48)} ${edge.kind.padEnd(16)} ${edge.loadsWithEntry ? 'entry' : 'lazy '} ${edge.action}${edge.names?.length ? ` [${edge.names.join(', ')}]` : ''}`,
    );
}
