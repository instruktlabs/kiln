import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, dependencySpecifier, filesUnder, findInstalledPackage, parseLock, printCheck, readJson, slash, workspaceManifests, type Manifest } from './check-common';
import { inspectToolchain, REQUIRED_TOOLCHAIN, type Toolchain } from './check-toolchain';

export const APPROVED_PINS: Record<string, string> = {
  react: '19.3.0', 'react-dom': '19.3.0', '@react-three/fiber': '9.8.1', three: '0.186.1',
  '@types/three': '0.186.0', '@types/react': '^19.3.0', '@types/react-dom': '^19.3.0', 'three-mesh-bvh': '0.9.15',
  typescript: '7.0.2', 'typescript-6': 'npm:typescript@6.0.3', vite: '8.3.2', '@vitejs/plugin-react': '6.1.1',
  'puppeteer-core': '25.12.0', 'axe-core': '4.13.0', fflate: '0.8.3', pngjs: '7.0.0', pixelmatch: '7.2.0', npm: '12.2.0',
};
const RUNTIME_PEERS = ['react', 'react-dom', '@react-three/fiber', 'three'] as const;
export interface PinSnapshot {
  manifests: { path: string; json: Manifest }[];
  lockfiles: string[];
  lock: { packages: Record<string, unknown> };
  site: Manifest; engine: Manifest; renderService: Manifest;
  toolchain: Toolchain; siteToolchain: Toolchain;
  siteViteVersions: string[];
  installedThree: { path: string; version: string }[];
}
export function validatePins(s: PinSnapshot): string[] {
  const problems: string[] = [];
  const allowed = { ...APPROVED_PINS, '@types/react': dependencySpecifier(s.site, '@types/react'), '@types/react-dom': dependencySpecifier(s.site, '@types/react-dom') };
  for (const { path, json } of s.manifests) {
    if (json.private !== true) problems.push(`${path}: must remain private`);
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      for (const [name, value] of Object.entries(json[section] ?? {})) {
        if (name === '@kiln-scenes/scene-kit' && value === 'workspace:*' && path !== 'packages/scene-kit/package.json') continue;
        const expected = allowed[name];
        if (!expected) problems.push(`${path} ${section}: unapproved direct dependency ${name}`);
        else if (value !== expected) problems.push(`${path} ${section}: ${name} must be ${expected}, got ${value}`);
      }
    }
    // Troy is a direct Three.js reference scene; existing R3F scenes keep all peers.
    const runtimePeers = path === 'packages/troy/package.json' ? ['three'] as const : RUNTIME_PEERS;
    if (path !== 'package.json') for (const peer of runtimePeers) {
      for (const section of ['peerDependencies', 'devDependencies'] as const) {
        if (json[section]?.[peer] !== APPROVED_PINS[peer]) problems.push(`${path} ${section}: missing exact ${peer} ${APPROVED_PINS[peer]}`);
      }
    }
  }
  const root = s.manifests.find(m => m.path === 'package.json')?.json;
  if (root?.packageManager !== 'bun@1.4.2') problems.push('package.json packageManager must be bun@1.4.2');
  for (const name of ['typescript', 'typescript-6']) {
    if (root?.devDependencies?.[name] !== APPROVED_PINS[name]) problems.push(`root devDependency ${name} must be ${APPROVED_PINS[name]}`);
  }
  for (const name of RUNTIME_PEERS) if (dependencySpecifier(s.site, name) !== APPROVED_PINS[name]) problems.push(`website ${name} must equal scenes pin ${APPROVED_PINS[name]}`);
  for (const [label, manifest] of [['engine', s.engine], ['render service', s.renderService]] as const) {
    if (dependencySpecifier(manifest, 'three') !== '0.186.1') problems.push(`${label} three must equal scenes pin 0.186.1`);
  }
  if (dependencySpecifier(s.site, '@types/three') !== '0.186.0') problems.push('website @types/three must be 0.186.0');
  if (dependencySpecifier(s.site, 'typescript') !== '6.0.3') problems.push('website typescript must match typescript-6 alias 6.0.3');
  if (!s.siteViteVersions.includes(APPROVED_PINS.vite!)) problems.push(`website lockfile does not resolve approved Vite ${APPROVED_PINS.vite}`);
  if (s.lockfiles.length !== 1 || s.lockfiles[0] !== 'bun.lock') problems.push(`expected one lockfile at bun.lock; found ${s.lockfiles.join(', ') || 'none'}`);
  const three = Object.entries(s.lock.packages ?? {}).filter(([name, entry]) => name === 'three' || (Array.isArray(entry) && /^three@/.test(String(entry[0]))));
  if (three.length !== 1 || !Array.isArray(three[0]?.[1]) || three[0]![1][0] !== 'three@0.186.1') {
    problems.push(`lockfile must contain exactly one three resolution at 0.186.1; got ${three.map(([name, entry]) => `${name}: ${JSON.stringify(entry)}`).join(', ') || 'none'}`);
  }
  if (s.installedThree.length !== 1 || s.installedThree[0]?.version !== '0.186.1') problems.push(`expected one physical three installation at 0.186.1; got ${JSON.stringify(s.installedThree)}`);
  for (const name of Object.keys(REQUIRED_TOOLCHAIN) as (keyof Toolchain)[]) {
    if (s.toolchain[name] !== REQUIRED_TOOLCHAIN[name]) problems.push(`toolchain ${name} must be ${REQUIRED_TOOLCHAIN[name]}`);
    if (s.toolchain[name] !== s.siteToolchain[name]) problems.push(`toolchain ${name} differs from website`);
  }
  return problems;
}
export function collectPinSnapshot(root = ROOT): PinSnapshot {
  const repoRoot = resolve(root, '..');
  const siteRoot = join(repoRoot, 'site');
  const manifests = workspaceManifests(root);
  const siteLockFile = join(siteRoot, 'bun.lock');
  if (!existsSync(siteLockFile)) throw new Error(`website Bun lockfile is missing: ${siteLockFile}`);
  const siteLock = parseLock(readFileSync(siteLockFile, 'utf8'));
  const siteViteVersions = Object.values(siteLock.packages ?? {}).flatMap(entry => Array.isArray(entry) && /^vite@/.test(String(entry[0])) ? [String(entry[0]).slice(5)] : []);
  const installed = new Map<string, string>();
  for (const m of manifests) {
    const file = findInstalledPackage(dirname(join(root, m.path)), 'three');
    if (!file) throw new Error(`${m.path}: three is not installed`);
    installed.set(dirname(file), readJson(file).version ?? 'unknown');
  }
  return {
    manifests, lockfiles: filesUnder(root).filter(p => /(?:^|[\\/])(?:bun\.lockb?|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(p)).map(p => slash(relative(root, p))).sort(),
    lock: parseLock(readFileSync(join(root, 'bun.lock'), 'utf8')),
    site: readJson(join(siteRoot, 'package.json')),
    engine: readJson(join(repoRoot, 'package.json')), renderService: readJson(join(repoRoot, 'render-service/package.json')),
    toolchain: readJson(join(root, 'toolchain.json')), siteToolchain: readJson(join(repoRoot, 'toolchain.json')), siteViteVersions,
    installedThree: [...installed].map(([path, version]) => ({ path: slash(path), version })),
  };
}
if (import.meta.main) {
  try {
    const snapshot = collectPinSnapshot();
    const problems = [...validatePins(snapshot), ...inspectToolchain().problems];
    printCheck('pins', problems, { manifests: snapshot.manifests.map(m => m.path), lockfiles: snapshot.lockfiles, installedThree: snapshot.installedThree, websiteVite: snapshot.siteViteVersions });
  } catch (error) { printCheck('pins', [String(error)]); }
}
