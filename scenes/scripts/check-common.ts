import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export interface Manifest {
  name?: string; version?: string; private?: boolean; packageManager?: string; license?: string | { type?: string };
  dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}
export function readJson<T = Manifest>(file: string): T { return JSON.parse(readFileSync(file, 'utf8')) as T; }
export function slash(path: string): string { return path.replaceAll('\\', '/'); }
export const IGNORED_DIRS = new Set(['node_modules', '.git', '.tmp', '.runtime', 'staged', 'dist', 'evidence']);
/** Never follows junctions/symlinks or reads secret files. */
export function filesUnder(dir: string, skip = IGNORED_DIRS): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.env') || entry.isSymbolicLink()) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name)) files.push(...filesUnder(file, skip)); }
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
export function workspaceManifests(root = ROOT): { path: string; json: Manifest }[] {
  const paths = [join(root, 'package.json')];
  const packages = join(root, 'packages');
  if (existsSync(packages)) for (const entry of readdirSync(packages, { withFileTypes: true })) {
    const file = join(packages, entry.name, 'package.json');
    if (entry.isDirectory() && existsSync(file)) paths.push(file);
  }
  return paths.map(file => ({ path: slash(relative(root, file)), json: readJson(file) }));
}
/** Bun lockfiles are JSON with comments and trailing commas. Strip only outside strings. */
export function parseLock(text: string): { packages: Record<string, unknown>; [key: string]: unknown } {
  let output = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { output += c; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; output += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; output += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    if (c === ',') { let j = i + 1; while (/\s/.test(text[j] ?? '') && j < text.length) j++; if (text[j] === '}' || text[j] === ']') continue; }
    output += c;
  }
  return JSON.parse(output);
}
export function dependencySpecifier(manifest: Manifest, name: string): string | undefined {
  return manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? manifest.peerDependencies?.[name];
}
export function findInstalledPackage(from: string, name: string): string | null {
  let dir = resolve(from);
  while (true) {
    const file = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(file)) return realpathSync(file);
    const parent = dirname(dir); if (parent === dir) return null; dir = parent;
  }
}
export function printCheck(name: string, problems: readonly string[], details?: unknown): void {
  console.log(JSON.stringify({ check: name, ok: problems.length === 0, problems, ...(details === undefined ? {} : { details }) }, null, 2));
  if (problems.length) process.exitCode = 1;
}
