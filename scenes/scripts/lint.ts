// `bun run lint` (M3, 2026-09-29). The monorepo pins no linter and installs are limited to the SPEC 3.1 pins, so
// this lint uses only what is pinned: the workspace TypeScript 7.0.2 compiler with the unused-code options the
// typecheck leaves off, plus plain text rules over sources, tests and scripts. No download, no browser, no build.
//   Gate:     packages/scene-kit, packages/farm, scripts (this builder's scope).
//   Advisory: other scene packages (their builders own them); findings are printed, never fixed or failed here.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const GATED = ['packages/scene-kit', 'packages/farm'];
const slash = (p: string) => p.replaceAll('\\', '/');
const packages = readdirSync(join(ROOT, 'packages')).filter(name => statSync(join(ROOT, 'packages', name)).isDirectory()).map(name => `packages/${name}`);
const advisory = packages.filter(p => !GATED.includes(p));

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'staged', '.tmp', '.runtime', 'vendor'].includes(name)) continue;
    const path = join(dir, name), stat = statSync(path);
    if (stat.isDirectory()) files(path, out); else if (/\.(?:ts|tsx|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

interface Finding { file: string; line: number; rule: string; text: string }
const findings: Finding[] = [];

// 1. Unused locals and parameters, over the typecheck's own include set (sources; tests and scripts have no Bun types pinned).
const scratch = join(ROOT, '.tmp', 'lint'); mkdirSync(scratch, { recursive: true });
const config = join(scratch, 'tsconfig.lint.json');
writeFileSync(config, JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true },
  include: ['../../packages/**/*.ts', '../../packages/**/*.tsx', '../../types/**/*.d.ts'], exclude: ['../../**/node_modules', '../../**/dist', '../../**/staged', '../../**/tests'] }, null, 2));
const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', config], { cwd: ROOT, encoding: 'utf8' });
if (tsc.error) throw tsc.error;
for (const line of `${tsc.stdout}\n${tsc.stderr}`.split(/\r?\n/)) {
  const match = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/.exec(line.trim()); if (!match) continue;
  findings.push({ file: slash(relative(ROOT, resolve(ROOT, match[1]!))), line: Number(match[2]), rule: match[3]!, text: match[4]! });
}
rmSync(scratch, { recursive: true, force: true });

// 2. Text rules.
const browserSource = (file: string) => /^packages\/[^/]+\/src\//.test(file) && !/\/testing\/node\.ts$|\/build\//.test(file);
for (const path of [...packages.flatMap(p => files(join(ROOT, p))), ...files(join(ROOT, 'scripts'))]) {
  const file = slash(relative(ROOT, path)), lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((text, index) => {
    const add = (rule: string) => findings.push({ file, line: index + 1, rule, text: text.trim().slice(0, 160) });
    if (/\b(?:test|describe|it)\.only\(/.test(text)) add('no-focused-tests');
    if (/^\s*debugger\s*;?\s*$/.test(text)) add('no-debugger');
    if (browserSource(file) && /\bconsole\.log\(/.test(text)) add('no-console-log-in-runtime');
    if (/\s+$/.test(text) && text.trim()) add('no-trailing-whitespace');
    if (/^(?:<{7}|>{7})(?: |$)/.test(text)) add('no-conflict-markers');
  });
}

const owner = (file: string) => GATED.find(p => file.startsWith(p + '/')) ?? (file.startsWith('scripts/') ? 'scripts' : advisory.find(p => file.startsWith(p + '/')) ?? 'other');
const gated = findings.filter(f => owner(f.file) !== 'other' && !advisory.includes(owner(f.file)));
const advice = findings.filter(f => advisory.includes(owner(f.file)));
for (const f of gated) console.log(`${f.file}:${f.line}: ${f.rule} ${f.text}`);
for (const f of advice) console.log(`advisory ${f.file}:${f.line}: ${f.rule} ${f.text}`);
console.log(JSON.stringify({ check: 'lint', gated: [...GATED, 'scripts'], advisory, findings: gated.length, advisoryFindings: advice.length, ok: gated.length === 0 }));
if (gated.length) process.exitCode = 1;
