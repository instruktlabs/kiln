/** Read-only qualification of the exact asset packs restored by site/scripts/scene-inputs.mjs. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPackPath, validateManifest } from '../packages/scene-kit/src/assets/manifest';
import { verifyStaged } from '../packages/scene-kit/src/staging';

export const RELEASE_SCENES = ['farm', 'golden-gate', 'foundry-floor'] as const;
type Scene = typeof RELEASE_SCENES[number];
export type ReleasePins = Record<Scene, { id: string; release: string; three: string; packJsonSha256: string; sha256sumsSha256: string }>;
const ROOT = resolve(import.meta.dir, '..');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const releasedAssetRoot = (root: string, scene: Scene) => resolve(root, '.cache/site-inputs', scene, 'standalone/assets');

export function verifyReleasedSceneInputs({ root = ROOT, pins = JSON.parse(readFileSync(resolve(root, '../site/src/data/scene-packs.json'), 'utf8')) as ReleasePins }: { root?: string; pins?: ReleasePins } = {}) {
  return RELEASE_SCENES.map(scene => {
    const assets = releasedAssetRoot(root, scene), pin = pins[scene];
    if (!existsSync(resolve(assets, 'pack.json')) || !existsSync(resolve(assets, 'SHA256SUMS'))) {
      throw new Error(`${scene}: released inputs are missing. Restore them with node ../site/scripts/scene-inputs.mjs before running test:release-inputs.`);
    }
    if (!pin || pin.id !== scene) throw new Error(`${scene}: missing or invalid external release pin`);
    const packBytes = readFileSync(resolve(assets, 'pack.json'));
    if (sha(packBytes) !== pin.packJsonSha256) throw new Error(`${scene}: pack.json pin mismatch`);
    if (sha(readFileSync(resolve(assets, 'SHA256SUMS'))) !== pin.sha256sumsSha256) throw new Error(`${scene}: SHA256SUMS pin mismatch`);
    const pack = validateManifest(JSON.parse(packBytes.toString('utf8')));
    if (pack.id !== pin.id || pack.release !== pin.release || pack.three !== pin.three) throw new Error(`${scene}: release identity mismatch`);
    // Standalone archives also contain their old build's top-level code chunks. Like build-scene,
    // this gate qualifies asset/data inputs for current source, not the archived renderer runtime.
    const problems = verifyStaged(assets).problems.filter(problem => !/^[^/]+\.(?:js|css): extra staged file$/.test(problem));
    if (problems.length) throw new Error(`${scene}: released inputs failed verification:\n${problems.join('\n')}`);
    return { scene, release: pack.release, models: pack.models.length, files: pack.files.length, packSha256: pin.packJsonSha256 };
  });
}

/** Optional local tests may use the same pinned author/staged bytes; release qualification never falls back. */
export function findSceneFixture(input: { scene: Scene; path: string; sha256: string; bytes?: number },
  { root = ROOT, fallback = [], required = process.env.KILN_SCENE_RELEASE_INPUTS === '1' }: { root?: string; fallback?: string[]; required?: boolean } = {}): string | undefined {
  assertPackPath(input.path);
  const released = resolve(releasedAssetRoot(root, input.scene), input.path);
  const matches = (path: string) => {
    if (!existsSync(path)) return false;
    const bytes = readFileSync(path);
    return (input.bytes === undefined || input.bytes === bytes.length) && sha(bytes) === input.sha256;
  };
  if (matches(released)) return released;
  if (required || existsSync(released)) throw new Error(`Required released fixture is missing or differs from its pin: ${input.scene}/${input.path}`);
  return fallback.find(matches);
}
