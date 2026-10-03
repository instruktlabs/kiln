// CPU integration against restored, externally pinned packs. No browser, renderer or provider calls.
import { resolve } from 'node:path';
import { verifyReleasedSceneInputs, type ReleasePins } from './release-inputs';

const ROOT = resolve(import.meta.dir, '..');
const SUITES = [
  './packages/foundry-floor/tests/unit/glb-world.test.ts',
  './packages/foundry-floor/tests/unit/campus-vegetation-shared.test.ts',
  './packages/golden-gate/tests/unit/vehicle-models.test.ts',
];
interface GateOptions {
  root?: string;
  pins?: ReleasePins;
  run?: (command: string[], options: { cwd: string; env: Record<string, string | undefined> }) => number;
}
export function runReleaseInputGate({ root = ROOT, pins, run = (command, options) => Bun.spawnSync(command, { ...options, stdout: 'inherit', stderr: 'inherit' }).exitCode }: GateOptions = {}): number {
  const inputs = verifyReleasedSceneInputs({ root, pins });
  console.log(`Exact released inputs verified: ${inputs.map(r => `${r.scene} ${r.release} (${r.models} models, ${r.files} files)`).join('; ')}.`);
  return run([process.execPath, 'test', ...SUITES, '--timeout', '20000'], { cwd: root, env: { ...process.env, KILN_SCENE_RELEASE_INPUTS: '1' } });
}
if (import.meta.main) process.exitCode = runReleaseInputGate();
