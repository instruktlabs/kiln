import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENE_DEDUPE, packageRoots, posix } from './scene-source.mjs';

export const PRODUCER_SCHEMA = 'kiln.scene-producer/1';
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const version = (value, name) => {
  if (typeof value !== 'string' || !VERSION.test(value)) throw new Error(`Invalid producer ${name} version`);
  return value;
};
const rootsFor = (modules) => {
  if (!Array.isArray(modules) || modules.some((id) => typeof id !== 'string')) throw new Error('Invalid producer modules');
  const roots = packageRoots(modules);
  for (const [name, copies] of roots) if (copies.size > 1) throw new Error(`Producer has multiple ${name} roots`);
  return roots;
};

/** A sealed Bun store path is historical evidence; an unversioned path says nothing about a version. */
function pathVersion(root, name) {
  if (!root) return null;
  const prefix = `${name.replace('/', '+')}@`;
  const store = /\/node_modules\/\.bun\/([^/]+)\/node_modules\//.exec(posix(root))?.[1];
  if (!store?.startsWith(prefix)) return null;
  // Bun's optional peer-context suffix is not part of the package version.
  const candidate = store.slice(prefix.length).replace(/\+[0-9a-f]+$/, '');
  return version(candidate, name);
}

function checkedChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('Producer receipt has no chunks');
  const seen = new Set();
  return chunks.map((chunk) => {
    if (!chunk || typeof chunk.file !== 'string' || !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/.test(chunk.file)
      || seen.has(chunk.file) || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0 || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error('Invalid producer chunk');
    seen.add(chunk.file);
    return { file: chunk.file, bytes: chunk.bytes, sha256: chunk.sha256 };
  }).sort((a, b) => a.file.localeCompare(b.file, 'en'));
}

/** Verify a producer receipt against the bytes being staged; never consult this machine's packages. */
export function producerEvidence({ modules, producer, chunks }) {
  const roots = rootsFor(modules);
  const inferred = Object.fromEntries([...roots].map(([name, copies]) => [name, pathVersion([...copies][0], name)]));
  if (producer === undefined) return { source: 'module-paths', dependencies: inferred, build: { vite: null, pluginReact: null } };
  if (!producer || producer.schema !== PRODUCER_SCHEMA) throw new Error('Unknown scene producer schema');
  const dependencies = {};
  for (const name of SCENE_DEDUPE) {
    const value = producer.dependencies?.[name];
    if (roots.get(name).size === 0) {
      if (value !== null) throw new Error(`Producer lists absent ${name}`);
      dependencies[name] = null;
      continue;
    }
    dependencies[name] = version(value, name);
    if (inferred[name] && inferred[name] !== value) throw new Error(`Producer ${name} version contradicts module paths`);
  }
  const build = { vite: version(producer.build?.vite, 'vite'), pluginReact: version(producer.build?.pluginReact, 'pluginReact') };
  if (JSON.stringify(checkedChunks(producer.chunks)) !== JSON.stringify(checkedChunks(chunks))) throw new Error('Producer chunks do not match the runtime');
  return { source: 'producer-receipt', dependencies, build };
}

/** Used only while producing a new build: read the package roots that actually contributed modules. */
export function createProducerReceipt({ modules, chunks, build }) {
  const dependencies = Object.fromEntries([...rootsFor(modules)].map(([name, roots]) => {
    if (roots.size === 0) return [name, null];
    const metadata = JSON.parse(readFileSync(join([...roots][0], 'package.json'), 'utf8'));
    if (metadata.name !== name) throw new Error(`Producer package metadata does not name ${name}`);
    return [name, version(metadata.version, name)];
  }));
  const producer = { schema: PRODUCER_SCHEMA, dependencies, build: { vite: build.vite, pluginReact: build.pluginReact }, chunks: checkedChunks(chunks) };
  producerEvidence({ modules, producer, chunks });
  return producer;
}
