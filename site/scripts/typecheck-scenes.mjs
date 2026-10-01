import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENE_DEDUPE, SCENE_PACKAGES, posix, resolveScenesDir } from './scene-source.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The runtime entries the site builds from scene source; each is type-checked with the scene it imports. */
export const RUNTIME_ENTRIES = ['src/scenes/runtime/farm.ts'];

/**
 * One path mapping per `exports` entry of a workspace package, the same entries the runtime build
 * aliases (scripts/scene-source.mjs), so the check reads the sources the build reads.
 */
export function packagePaths(scenesDir) {
  const paths = {};
  for (const name of SCENE_PACKAGES) {
    const directory = resolve(scenesDir, 'packages', name);
    const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    for (const [key, value] of Object.entries(manifest.exports ?? {})) {
      const target = typeof value === 'string' ? value : (value.browser ?? value.default);
      if (typeof target !== 'string' || key.includes('*')) throw new Error(`Unsupported exports entry in ${name}: ${key}`);
      paths[key === '.' ? `@kiln-scenes/${name}` : `@kiln-scenes/${name}/${key.slice(2)}`] = [posix(resolve(directory, target))];
    }
  }
  return paths;
}

/**
 * The type-level twin of `resolve.dedupe`: the runtime entry lives in the site, whose own node_modules
 * hold their own copies of the React and three type packages. Every specifier the entry (or the sources)
 * reaches maps to the copy the scenes workspace resolves, so the program holds one `Ref`, one `Clock`.
 */
export function dedupePaths(scenesDir) {
  const paths = {};
  for (const name of SCENE_DEDUPE) {
    const link = resolve(scenesDir, 'node_modules', '@types', name);
    if (!existsSync(link)) continue; // packages that ship their own types (@react-three/fiber) resolve inside the workspace only
    const directory = posix(realpathSync(link));
    paths[name] = [`${directory}/index.d.ts`];
    if (name.startsWith('react')) paths[`${name}/*`] = [`${directory}/*`];
  }
  return paths;
}

/**
 * The compiler settings of the scene kit's own consumer check (packages/scene-kit/consumer/tsconfig.json):
 * the workspace base config, the `browser` export condition and the workspace's ambient types, over the
 * site's runtime entries. The site's TypeScript runs it, so the sources are checked with the site's pin.
 */
export function scenesTsconfig({ scenesDir, site = SITE }) {
  const ambient = readdirSync(resolve(scenesDir, 'types')).filter((name) => name.endsWith('.d.ts')).sort().map((name) => posix(resolve(scenesDir, 'types', name)));
  return {
    extends: posix(resolve(scenesDir, 'tsconfig.base.json')),
    // typeRoots mirrors what the kit's own check sees: only the workspace's global types, never the site's.
    compilerOptions: { customConditions: ['browser'], noEmit: true, typeRoots: [posix(resolve(scenesDir, 'node_modules/@types'))], paths: { ...dedupePaths(scenesDir), ...packagePaths(scenesDir) } },
    files: [...RUNTIME_ENTRIES.map((entry) => posix(resolve(site, entry))), ...ambient],
  };
}

export async function typecheckScenes({ scenesDir, site = SITE } = {}) {
  const tsc = resolve(site, 'node_modules/typescript/bin/tsc');
  const version = JSON.parse(readFileSync(resolve(site, 'node_modules/typescript/package.json'), 'utf8')).version;
  const config = join(site, '.cache', 'tsconfig.scenes.json');
  await mkdir(dirname(config), { recursive: true });
  await writeFile(config, `${JSON.stringify(scenesTsconfig({ scenesDir, site }), null, 2)}\n`);
  const result = spawnSync(process.execPath, [tsc, '-p', config, '--pretty', 'false'], { encoding: 'utf8', cwd: site });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const listed = spawnSync(process.execPath, [tsc, '-p', config, '--listFilesOnly'], { encoding: 'utf8', cwd: site }).stdout.split(/\r?\n/).map((line) => line.replaceAll('\\', '/'));
  const sceneSourceFiles = listed.filter((line) => line.includes('/packages/')).length;
  // One copy of each dedupe package's types: the program lists each package's entry declaration once.
  const typeCopies = Object.fromEntries(SCENE_DEDUPE.map((name) => [name, listed.filter((line) => line.endsWith(`/node_modules/@types/${name}/index.d.ts`)).length]));
  return { version, exitCode: result.status, output, sceneSourceFiles, typeCopies };
}

export async function main(env = process.env, site = SITE) {
  const scenesDir = resolveScenesDir({ env, site });
  if (!scenesDir || !existsSync(join(scenesDir, 'tsconfig.base.json'))) {
    console.log('Scene sources not type-checked: no scenes workspace (KILN_SITE_SCENES_DIR).');
    return null;
  }
  const result = await typecheckScenes({ scenesDir, site });
  if (result.exitCode !== 0) throw new Error(`The scene sources do not type-check with TypeScript ${result.version}:\n${result.output}`);
  const duplicated = Object.entries(result.typeCopies).filter(([, count]) => count > 1);
  if (duplicated.length) throw new Error(`The type check loaded more than one copy of: ${duplicated.map(([name, count]) => `${name} (${count})`).join(', ')}`);
  console.log(`Scene sources type-check with TypeScript ${result.version} (${result.sceneSourceFiles} scene package files, browser condition, the scene kit's compiler settings, type packages loaded once: ${JSON.stringify(Object.fromEntries(Object.entries(result.typeCopies).filter(([, count]) => count > 0)))}).`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
