import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const DEPENDENCIES = ['three', 'react', 'react-dom', '@react-three/fiber'] as const;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function packageVersion(name: string, root: string): string {
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (metadata.name !== name || typeof metadata.version !== 'string' || !VERSION.test(metadata.version)) throw new Error(`Invalid producer package metadata for ${name}`);
  return metadata.version;
}

function toolVersion(name: string): string {
  let directory = dirname(require.resolve(name));
  while (true) {
    const path = join(directory, 'package.json');
    if (existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).name === name) return packageVersion(name, directory);
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot identify the ${name} producer version`);
    directory = parent;
  }
}

/** Build-time evidence only: resolve dependencies from modules actually included, never declaration ranges. */
export function sceneProducerReceipt(modules: readonly string[], chunks: readonly { file: string; code: string }[]) {
  const roots = new Map<string, Set<string>>(DEPENDENCIES.map(name => [name, new Set<string>()]));
  for (const id of modules) {
    const root = /^(.*\/node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(id.replaceAll('\\', '/').split('?')[0]!);
    if (root) roots.get(root[2]!)?.add(root[1]!);
  }
  const dependencies = Object.fromEntries([...roots].map(([name, copies]) => {
    if (copies.size > 1) throw new Error(`Producer has multiple ${name} roots`);
    return [name, copies.size ? packageVersion(name, [...copies][0]!) : null];
  }));
  return {
    schema: 'kiln.scene-producer/1', dependencies,
    build: { vite: toolVersion('vite'), pluginReact: toolVersion('@vitejs/plugin-react') },
    chunks: chunks.map(({ file, code }) => ({ file, bytes: new TextEncoder().encode(code).length, sha256: createHash('sha256').update(code).digest('hex') })).sort((a, b) => a.file.localeCompare(b.file, 'en')),
  };
}
