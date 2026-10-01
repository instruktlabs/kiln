import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const posix = (path) => path.replaceAll('\\', '/');

/** Maintained scene source in the same repository; older separate workspaces remain supported. */
export const DEFAULT_SCENES_DIR = '../scenes';
/** A scene runtime and the site share one physical copy of each of these packages. */
export const SCENE_DEDUPE = ['three', 'react', 'react-dom', '@react-three/fiber'];
/** Workspace packages the site builds into the Farm runtime as source; `farm` depends on `scene-kit`. */
export const SCENE_PACKAGES = ['farm', 'scene-kit'];
/** The scene kit's runtime facade: what bare `three` resolves to in a scene (`export * from 'three/webgpu'`). */
export const THREE_FACADE = 'packages/scene-kit/src/renderer/three-runtime.ts';
/** Build-time module read by the scene pages and the shell: which scene runtimes are staged. */
export const SCENE_FLAG_MODULE = 'virtual:kiln-scenes';
/** Directories under public/ that scripts/scene-pack.mjs and scripts/scene-runtime.mjs own. */
export const PACK_DIRECTORY = 'scene-packs';
export const RUNTIME_DIRECTORY = 'scene-runtime';

/**
 * Locate the scenes workspace. `KILN_SITE_SCENES_DIR` is absolute or relative to `site/`; `off`
 * disables the scene explicitly. Unset, repository source wins over the legacy sibling checkout. A path that
 * was asked for but is not a scenes workspace is an error, never a silent fallback.
 */
export function resolveScenesDir({ env = process.env, site = SITE } = {}) {
  const requested = env.KILN_SITE_SCENES_DIR?.trim();
  if (requested && /^(?:off|none|false|0)$/i.test(requested)) return null;
  const candidates = requested ? [requested] : [DEFAULT_SCENES_DIR, '../../kiln-commons/scenes'];
  for (const candidate of candidates) {
    const dir = resolve(site, candidate);
    if (existsSync(resolve(dir, 'packages/farm/package.json'))) return dir;
  }
  if (requested) {
    throw new Error(
      `KILN_SITE_SCENES_DIR is not a scenes workspace (no packages/farm/package.json): ${resolve(site, requested)}`,
    );
  }
  return null;
}

/** Absolute path of the kit's three facade in a scenes workspace. */
export const threeFacade = (scenesDir) => posix(resolve(scenesDir, THREE_FACADE));

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * One exact alias per entry of a package's `exports` map, so a runtime build consumes the workspace
 * source without a link: dependency. The `browser` condition wins, as it does for the client build.
 */
export function exportAliases(packageDir, name) {
  const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
  return Object.entries(manifest.exports ?? {}).map(([key, value]) => {
    const target = typeof value === 'string' ? value : (value.browser ?? value.default);
    if (typeof target !== 'string' || key.includes('*')) {
      throw new Error(`Unsupported exports entry in ${name}: ${key}`);
    }
    const specifier = key === '.' ? name : `${name}/${key.slice(2)}`;
    return {
      find: new RegExp(`^${escapeRegExp(specifier)}$`),
      replacement: posix(resolve(packageDir, target)),
    };
  });
}

const PACKAGE_ROOT = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;

/** The package roots a bundle's module ids come from, per guarded package (empty when absent). */
export function packageRoots(moduleIds, names = SCENE_DEDUPE) {
  const roots = new Map(names.map((name) => [name, new Set()]));
  for (const id of moduleIds) {
    const root = PACKAGE_ROOT.exec(id.split('?')[0])?.[1];
    if (!root) continue;
    roots.get(posix(root).replace(/^.*\/node_modules\//, ''))?.add(root);
  }
  return roots;
}

/** Module ids of a bundle that come from more than one copy of a guarded package. */
export function duplicatePackages(moduleIds, names = SCENE_DEDUPE) {
  return [...packageRoots(moduleIds, names)]
    .filter(([, copies]) => copies.size > 1)
    .map(([name, copies]) => ({ name, copies: [...copies].sort() }));
}

/** The manifest a staged runtime carries; null when the scene has none staged. */
export function stagedRuntime(id, site = SITE) {
  const file = resolve(site, 'public', RUNTIME_DIRECTORY, id, 'runtime.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** The scene pack record the catalog holds for a scene (src/data/scene-packs.json). */
export function scenePackRecord(id, site = SITE) {
  const file = resolve(site, 'src/data/scene-packs.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8'))[id] ?? null) : null;
}

/**
 * What a page may state about a staged pack, read from the served (verified) pack.json rather than typed: its
 * release, each model's path, size and SHA-256, and the pack's own `source` block (for Golden Gate, the bridge
 * revisions the scene loads).
 */
function servedPack(packFile) {
  const manifest = JSON.parse(readFileSync(packFile, 'utf8'));
  const files = new Map((manifest.files ?? []).map((file) => [file.path, file]));
  const models = {};
  for (const model of manifest.models ?? []) {
    const file = files.get(model.path);
    if (!file) throw new Error(`pack.json model ${model.id} is not a sealed file: ${model.path}`);
    models[model.id] = { path: model.path, bytes: file.bytes, sha256: file.sha256 };
  }
  return { release: manifest.release ?? null, models, source: manifest.source ?? null };
}

/**
 * A scene is included when both halves are staged: its runtime (the code) and its verified pack
 * (the data). One without the other cannot run, so the page keeps its status panel.
 */
export function stagedScenes(site = SITE) {
  const scenes = {};
  for (const id of ['farm', 'golden-gate', 'foundry-floor']) {
    const runtime = stagedRuntime(id, site);
    const pack = scenePackRecord(id, site);
    const packFile = pack?.base ? resolve(site, 'public', pack.base.replace(/^\/+/, ''), 'pack.json') : null;
    scenes[id] = runtime && packFile && existsSync(packFile)
      ? { kind: runtime.kind, url: runtime.url, file: runtime.file, bytes: runtime.bytes, gzipBytes: runtime.gzipBytes, sha256: runtime.sha256, pack: servedPack(packFile) }
      : null;
  }
  return scenes;
}

let announced = false;
function announce(message) {
  return {
    name: 'kiln-scene-source',
    configResolved() {
      if (announced) return;
      announced = true;
      console.info(message);
    },
  };
}

/**
 * Site (Astro) build settings for scenes. The scene code is not part of the site's module graph:
 * scripts/scene-runtime.mjs builds it separately (bare `three` resolved to the scene kit's facade, as
 * in the kit's own build) and scripts/scene-pack.mjs stages the data, so the gallery viewer keeps the
 * classic three build. This exposes which runtimes are staged as `virtual:kiln-scenes`.
 */
export function sceneSiteConfig({ site = SITE } = {}) {
  const scenes = stagedScenes(site);
  const included = Object.entries(scenes).filter(([, scene]) => scene).map(([id]) => id);
  const flagId = `\0${SCENE_FLAG_MODULE}`;
  return {
    scenes,
    included,
    plugins: [
      announce(`Scenes: ${included.length ? `${included.join(', ')} staged` : 'none staged (run node scripts/scene-pack.mjs and node scripts/scene-runtime.mjs); Explore keeps its status panel'}.`),
      {
        name: 'kiln-scene-flag',
        resolveId: (id) => (id === SCENE_FLAG_MODULE ? flagId : undefined),
        load: (id) => (id === flagId ? `export const sceneRuntimes = ${JSON.stringify(scenes)};` : undefined),
      },
    ],
  };
}
