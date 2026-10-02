import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { filesUnder, printCheck, ROOT, slash, workspaceManifests } from './check-common';

export const DENYLIST = ['__kilnScene', '__kilnProbeOverride', 'DevPanel', 'registerWorkload', 'feedFrameTimes', 'probeFrames', 'sceneSummary', 'probeSystems', 'probeAsset', 'msaaPolicy', 'MSAA discard tripped', 'kiln-render-probe', 'Preview farm activity', 'suite-client', 'createMeasurement', 'sample-case', '#view-quality', 'Look exploration', 'Unknown look option', 'plantingShared', 'bridgeMerge', 'reflectionStandIns', 'shadowOnce', 'shadowRearm'] as const;
export interface HygieneHit { file: string; token: string; line: number }
export function findHygieneHits(file: string, text: string): HygieneHit[] {
  return DENYLIST.flatMap(token => {
    const position = text.indexOf(token);
    return position === -1 ? [] : [{ file, token, line: text.slice(0, position).split('\n').length }];
  });
}
export function publicOutputs(root = ROOT): string[] {
  return workspaceManifests(root).filter(m => m.path !== 'package.json').map(m => join(root, m.path, '..', 'dist', 'standalone'));
}
export function checkHygiene(dirs: string[]): { files: number; bytes: number; problems: string[]; hits: HygieneHit[] } {
  let files = 0, bytes = 0;
  const problems: string[] = [], hits: HygieneHit[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) { problems.push(`public output missing: ${dir}`); continue; }
    const sourceFiles = filesUnder(dir, new Set(['node_modules'])).filter(p => /\.(?:[cm]?js|css|html|map)$/i.test(p));
    if (!sourceFiles.length) problems.push(`public output contains no bundle or HTML: ${dir}`);
    for (const file of sourceFiles) {
      const content = readFileSync(file); files++; bytes += content.byteLength;
      hits.push(...findHygieneHits(slash(relative(ROOT, file)), content.toString('utf8')));
    }
  }
  problems.push(...hits.map(hit => `${hit.file}:${hit.line}: forbidden public token ${hit.token}`));
  return { files, bytes, problems, hits };
}
if (import.meta.main) {
  try {
    const dirs = process.argv.slice(2).filter(a => a !== '--').map(p => resolve(ROOT, p));
    const result = checkHygiene(dirs.length ? dirs : publicOutputs());
    if (!dirs.length && !publicOutputs().length) result.problems.push('no public outputs configured');
    printCheck('public-bundle-hygiene', result.problems, { files: result.files, bytes: result.bytes, hits: result.hits });
  } catch (error) { printCheck('public-bundle-hygiene', [String(error)]); }
}
