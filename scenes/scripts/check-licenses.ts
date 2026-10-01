import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { findInstalledPackage, printCheck, readJson, ROOT, slash, workspaceManifests, type Manifest } from './check-common';

export const ALLOWED_LICENSES = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'CC0-1.0']);
/** SPDX OR can choose a permitted branch; every AND term must be permitted. Unknown syntax fails closed. */
export function isAllowedLicense(expression: string): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0, valid = true;
  function term(): boolean {
    const token = tokens[position++];
    if (token === '(') { const value = disjunction(); if (tokens[position++] !== ')') valid = false; return value; }
    if (!token || token === ')' || token === 'AND' || token === 'OR') { valid = false; return false; }
    return ALLOWED_LICENSES.has(token);
  }
  function conjunction(): boolean {
    let value = term();
    while (tokens[position] === 'AND') { position++; const next = term(); value = value && next; }
    return value;
  }
  function disjunction(): boolean {
    let value = conjunction();
    while (tokens[position] === 'OR') { position++; const next = conjunction(); value = value || next; }
    return value;
  }
  const result = disjunction();
  return valid && position === tokens.length && result;
}
export interface LicenseRecord { name: string; version: string; license: string; path: string; noticeFiles: string[]; scope: 'production' | 'bundled' | 'vendor' }
function licenseFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && /^(?:licen[cs]e|copying|notice)(?:\.|-|$)/i.test(e.name)).map(e => join(dir, e.name));
}
function licenseOf(manifest: Manifest): string {
  return typeof manifest.license === 'string' ? manifest.license : manifest.license?.type ?? 'UNKNOWN';
}
export function auditLicenses(root = ROOT, bundledModules: string[] = []): { records: LicenseRecord[]; problems: string[]; excludedDirectDev: string[] } {
  const manifests = workspaceManifests(root), records: LicenseRecord[] = [], problems: string[] = [];
  const visited = new Set<string>();
  const workspaces = new Map(manifests.filter(m => m.json.name).map(m => [m.json.name!, join(root, m.path)]));
  const queue: { manifest: string; scope: 'production' | 'bundled' }[] = [];
  function enqueue(name: string, from: string, optional = false, scope: 'production' | 'bundled' = 'production'): void {
    const file = workspaces.get(name) ?? findInstalledPackage(from, name);
    if (file) queue.push({ manifest: file, scope });
    else if (!optional) problems.push(`missing installed production dependency ${name} from ${slash(relative(root, from))}`);
  }
  for (const item of manifests) {
    const dir = dirname(join(root, item.path));
    for (const name of Object.keys(item.json.dependencies ?? {})) enqueue(name, dir);
    for (const name of Object.keys(item.json.optionalDependencies ?? {})) enqueue(name, dir, true);
    // Hosts provide peers to source consumers; the standalone bundles the runtime peers.
    for (const name of Object.keys(item.json.peerDependencies ?? {})) {
      if (!name.startsWith('@types/')) enqueue(name, dir, item.json.peerDependenciesMeta?.[name]?.optional === true);
    }
  }
  for (const moduleId of bundledModules) {
    if (moduleId.startsWith('\0')) continue;
    let dir = dirname(resolve(root, moduleId.split('?')[0]!));
    while (true) {
      const file = join(dir, 'package.json');
      if (existsSync(file)) { queue.push({ manifest: file, scope: 'bundled' }); break; }
      const parent = dirname(dir); if (parent === dir) { problems.push(`cannot identify bundled module package: ${moduleId}`); break; } dir = parent;
    }
  }
  while (queue.length) {
    const item = queue.shift()!, file = realpathSync(item.manifest);
    if (visited.has(file)) continue;
    visited.add(file);
    const manifest = readJson(file), dir = dirname(file);
    // Workspace code has the root MIT license. Third-party records are installed packages.
    if (!workspaces.has(manifest.name ?? '')) {
      const license = licenseOf(manifest), notices = licenseFiles(dir);
      const record: LicenseRecord = { name: manifest.name ?? slash(relative(root, dir)), version: manifest.version ?? 'unknown', license, path: slash(relative(root, dir)), noticeFiles: notices.map(slash), scope: item.scope };
      records.push(record);
      if (!isAllowedLicense(license)) problems.push(`${record.name}@${record.version}: license ${license} is outside the production allowlist`);
    }
    for (const name of Object.keys(manifest.dependencies ?? {})) enqueue(name, dir, false, item.scope);
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) enqueue(name, dir, true, item.scope);
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (!name.startsWith('@types/')) enqueue(name, dir, manifest.peerDependenciesMeta?.[name]?.optional === true, item.scope);
    }
  }
  for (const item of manifests.filter(m => m.path !== 'package.json')) {
    const vendor = join(root, item.path, '..', 'vendor');
    if (!existsSync(vendor)) continue;
    for (const entry of readdirSync(vendor, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const dir = join(vendor, entry.name), upstream = join(dir, 'UPSTREAM.json');
      if (!existsSync(upstream)) { problems.push(`${slash(relative(root, dir))}: vendored source requires UPSTREAM.json`); continue; }
      const meta = readJson<{ license?: string; licence?: string; version?: string; repository?: string; commit?: string }>(upstream);
      const notices = licenseFiles(dir), text = notices.map(file => readFileSync(file, 'utf8')).join('\n');
      // Field Grass's upstream metadata need not repeat the license; read its actual MIT grant.
      const license = meta.license ?? meta.licence ?? (/Permission is hereby granted, free of charge[\s\S]*THE SOFTWARE IS PROVIDED "AS IS"/i.test(text) ? 'MIT' : 'UNKNOWN');
      records.push({ name: entry.name, version: meta.version ?? 'unknown', license, path: slash(relative(root, dir)), noticeFiles: notices.map(slash), scope: 'vendor' });
      if (!isAllowedLicense(license)) problems.push(`${entry.name}: vendor license ${license} is outside the production allowlist`);
      if (!notices.length) problems.push(`${entry.name}: vendored LICENSE is missing`);
      if (!meta.repository || !meta.commit || !meta.version) problems.push(`${entry.name}: UPSTREAM.json needs repository, commit and version`);
    }
  }
  records.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const included = new Set(records.map(r => r.name));
  const excludedDirectDev = [...new Set(manifests.flatMap(m => Object.keys(m.json.devDependencies ?? {})))].filter(name => !included.has(name)).sort();
  return { records, problems, excludedDirectDev };
}
export function renderNotices(records: LicenseRecord[]): string {
  return ['Third-party notices', 'Production dependencies and vendored sources. Test/build-only dependencies are excluded unless bundled.', '', ...records.map(record => [
    `${record.name}@${record.version} — ${record.license}`, `Source: ${record.path}`, ...(record.noticeFiles.length ? record.noticeFiles.map(file => readFileSync(file, 'utf8').trim()) : ['License declared in installed package.json. This package archive does not contain a separate LICENSE/COPYING/NOTICE file.']), '',
  ].join('\n'))].join('\n') + '\n';
}
if (import.meta.main) {
  try {
    const args = process.argv.slice(2), modulesAt = args.indexOf('--bundle-modules'), noticeAt = args.indexOf('--write-notices');
    const modules = modulesAt >= 0 ? readJson<{ modules: string[] }>(resolve(ROOT, args[modulesAt + 1]!)).modules : [];
    const result = auditLicenses(ROOT, modules);
    if (noticeAt >= 0 && result.problems.length === 0) {
      const out = resolve(ROOT, args[noticeAt + 1]!);
      if (!out.startsWith(ROOT + '/') && !out.startsWith(ROOT + '\\')) throw new Error('notices output must stay inside scenes');
      mkdirSync(dirname(out), { recursive: true });
      if (!realpathSync(dirname(out)).startsWith(realpathSync(ROOT))) throw new Error('notices output resolves outside scenes');
      writeFileSync(out, renderNotices(result.records));
    }
    printCheck('production-licenses', result.problems, { records: result.records, excludedDirectDev: result.excludedDirectDev, missingNoticeFiles: result.records.filter(r => !r.noticeFiles.length).map(r => r.name), bundledModuleCount: modules.length, scope: 'Installed production dependency graph, runtime peers, vendor sources, plus explicit public bundle module graph when supplied. Dev-only axe-core (MPL-2.0) is not shipped.' });
  } catch (error) { printCheck('production-licenses', [String(error)]); }
}
