import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const posix = (path) => path.replaceAll('\\', '/');

/** Sibling checkouts: <workspace>/kiln-site-workbench/site beside <workspace>/kiln-commons/scenes. */
export const DEFAULT_SCENES_DIR = '../../kiln-commons/scenes';
/** The scene and the site share one physical copy of each of these packages. */
export const SCENE_DEDUPE = ['three', 'react', 'react-dom', '@react-three/fiber'];
/** Workspace packages consumed as source; `farm` depends on `scene-kit`. */
export const SCENE_PACKAGES = ['farm', 'scene-kit'];
/** Stands in for `@kiln-scenes/farm` in builds that cannot see the scene source. */
export const SCENE_FALLBACK = 'src/scenes/farm/unavailable.tsx';
/** Build-time flag module read by the Farm page and shell. */
export const SCENE_FLAG_MODULE = 'virtual:kiln-farm-scene';

/**
 * Locate the scenes workspace. `KILN_SITE_SCENES_DIR` is absolute or relative to `site/`; `off`
 * disables the scene explicitly. Unset, the sibling checkout is used when it exists. A path that
 * was asked for but is not a scenes workspace is an error, never a silent fallback.
 */
export function resolveScenesDir({ env = process.env, site = SITE } = {}) {
  const requested = env.KILN_SITE_SCENES_DIR?.trim();
  if (requested && /^(?:off|none|false|0)$/i.test(requested)) return null;
  const dir = resolve(site, requested || DEFAULT_SCENES_DIR);
  if (existsSync(resolve(dir, 'packages/farm/package.json'))) return dir;
  if (requested) {
    throw new Error(
      `KILN_SITE_SCENES_DIR is not a scenes workspace (no packages/farm/package.json): ${dir}`,
    );
  }
  return null;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * One exact alias per entry of a package's `exports` map, so the site consumes the workspace
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

/** Module ids of a bundle that come from more than one copy of a guarded package. */
export function duplicatePackages(moduleIds, names = SCENE_DEDUPE) {
  const roots = new Map();
  for (const id of moduleIds) {
    const root = PACKAGE_ROOT.exec(id.split('?')[0])?.[1];
    if (!root) continue;
    const name = posix(root).replace(/^.*\/node_modules\//, '');
    if (!names.includes(name)) continue;
    roots.set(name, new Set([...(roots.get(name) ?? []), root]));
  }
  return [...roots].filter(([, copies]) => copies.size > 1).map(([name, copies]) => ({ name, copies: [...copies].sort() }));
}

/** Fails the build if the scene pulled a second three, React, React DOM or R3F into the graph. */
function singleCopyGuard() {
  return {
    name: 'kiln-scene-single-copy',
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap((chunk) => (chunk.type === 'chunk' ? Object.keys(chunk.modules) : []));
      const duplicates = duplicatePackages(ids);
      if (duplicates.length) {
        const detail = duplicates.map(({ name, copies }) => `${name}: ${copies.join(', ')}`).join('; ');
        this.error(`The Farm scene must share one copy of ${SCENE_DEDUPE.join(', ')}. Duplicates: ${detail}`);
      }
    },
  };
}

/** Where the staged scene pack lands, from the pack record in the Farm catalog. */
export function stagedPackFile(site = SITE) {
  const farm = JSON.parse(readFileSync(resolve(site, 'src/data/packs/farm.json'), 'utf8'));
  const base = farm.scene?.pack?.base;
  return base ? resolve(site, 'public', base.replace(/^\/+/, ''), 'pack.json') : null;
}

let announced = false;
function announce(plugin) {
  return {
    name: 'kiln-scene-source',
    configResolved() {
      if (announced) return;
      announced = true;
      console.info(plugin);
    },
  };
}

/**
 * Vite settings that let the site consume `@kiln-scenes/farm` and `@kiln-scenes/scene-kit` as
 * source from a scenes workspace: exact-entry aliases, one copy of the shared packages, the
 * public-build constants the scene expects, and dev-server read access. Without a workspace, or
 * without a staged pack to serve, `@kiln-scenes/farm` resolves to the site's own fallback.
 */
export function sceneSourceConfig({ site = SITE, env = process.env } = {}) {
  const scenesDir = resolveScenesDir({ env, site });
  const packFile = stagedPackFile(site);
  const included = Boolean(scenesDir && packFile && existsSync(packFile));
  const alias = included
    ? SCENE_PACKAGES.flatMap((name) => exportAliases(resolve(scenesDir, 'packages', name), `@kiln-scenes/${name}`))
    : [{ find: /^@kiln-scenes\/farm$/, replacement: posix(resolve(site, SCENE_FALLBACK)) }];
  const flagId = `\0${SCENE_FLAG_MODULE}`;
  const note = included
    ? `Farm scene: source ${posix(scenesDir)}, staged pack ${posix(dirname(packFile))}`
    : `Farm scene: not included (${scenesDir ? 'no staged pack, run node scripts/scene-pack.mjs' : 'no scenes workspace, set KILN_SITE_SCENES_DIR'}); Explore keeps its fallback.`;
  return {
    included,
    scenesDir,
    plugins: [
      announce(note),
      {
        name: 'kiln-scene-flag',
        resolveId: (id) => (id === SCENE_FLAG_MODULE ? flagId : undefined),
        load: (id) => (id === flagId ? `export const farmSceneIncluded = ${included};` : undefined),
      },
      ...(included ? [singleCopyGuard()] : []),
    ],
    define: { 'import.meta.env.KILN_DEV': false, 'import.meta.env.KILN_TEST': false },
    resolve: { alias, dedupe: [...SCENE_DEDUPE] },
    server: { fs: { allow: [site, ...(scenesDir ? [scenesDir] : [])] } },
  };
}
