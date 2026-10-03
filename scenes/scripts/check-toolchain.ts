import { spawnSync } from 'node:child_process';
import { readJson, ROOT, printCheck } from './check-common';
import { join } from 'node:path';

export const REQUIRED_TOOLCHAIN = { bun: '1.4.2', node: '22.23.3', npm: '12.2.0' } as const;
export type Toolchain = Record<keyof typeof REQUIRED_TOOLCHAIN, string>;
export function validateToolchain(expected: Toolchain, actual: Toolchain): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(REQUIRED_TOOLCHAIN) as (keyof Toolchain)[]) {
    if (expected[key] !== REQUIRED_TOOLCHAIN[key]) problems.push(`toolchain.json ${key} must be ${REQUIRED_TOOLCHAIN[key]}, got ${expected[key]}`);
    if (actual[key] !== expected[key]) problems.push(`${key} runtime must be ${expected[key]}, got ${actual[key]}`);
  }
  return problems;
}
export function inspectToolchain(root = ROOT): { expected: Toolchain; actual: Toolchain; problems: string[] } {
  const expected = readJson<Toolchain>(join(root, 'toolchain.json'));
  const commandVersion = (name: 'bun' | 'node' | 'npm'): string => {
    // npm installed at the approved root pin; execute its CLI with the same selected Node.
    // This does not install, fetch registry metadata, or execute package lifecycle hooks.
    const args = name === 'npm' ? [join(root, 'node_modules/npm/bin/npm-cli.js'), '--version'] : ['--version'];
    const result = spawnSync(name === 'npm' ? 'node' : name, args, { cwd: root, encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? result.stdout.trim().replace(/^v/, '') : `unavailable (${result.error?.message ?? result.stderr.trim()})`;
  };
  const actual = { bun: commandVersion('bun'), node: commandVersion('node'), npm: commandVersion('npm') };
  return { expected, actual, problems: validateToolchain(expected, actual) };
}
if (import.meta.main) {
  try { const result = inspectToolchain(); printCheck('toolchain', result.problems, { expected: result.expected, actual: result.actual }); }
  catch (error) { printCheck('toolchain', [String(error)]); }
}
