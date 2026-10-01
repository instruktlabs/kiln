// SPDX-License-Identifier: MIT
// This PC's load sample (TASK.md: every timing taken here is indicative and carries its load sample). Runs the
// workspace's read-only scripts/load-sample.ps1 (CPU total %, GPU 3D %, process counts); starts and stops nothing.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCENES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export function loadSample(): Promise<Record<string, unknown>> {
  const script = resolve(SCENES_ROOT, 'scripts/load-sample.ps1');
  if (process.platform !== 'win32' || !existsSync(script)) return Promise.resolve({ error: 'no load sample on this platform' });
  return new Promise(done => execFile('pwsh', ['-NoProfile', '-File', script], { timeout: 30_000 }, (error, stdout) => {
    if (error) { done({ error: String(error) }); return; }
    try { done(JSON.parse(String(stdout).trim()) as Record<string, unknown>); } catch { done({ error: 'unparsed load sample', raw: String(stdout).slice(0, 400) }); }
  }));
}
