import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { generateCommons } from './generate-commons.mjs';
import { hashBytes } from './mirror-core.mjs';
const save = async (path: string, bytes: string | Uint8Array) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };
const json = (path: string, value: unknown) => save(path, JSON.stringify(value));
const seal = (bytes: Uint8Array) => ({ bytes: bytes.length, sha256: hashBytes(bytes) });
function fixtureGlb() {
  const data = JSON.stringify({ scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Bridge', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ count: 3, min: [0, 0, 0], max: [1, 1, 1] }, { count: 3 }], materials: [{}] });
  const length = Math.ceil(Buffer.byteLength(data) / 4) * 4;
  const glb = Buffer.alloc(length + 20, 32); glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(length, 12); glb.writeUInt32LE(0x4e4f534a, 16); glb.write(data, 20); return glb;
}
test('Bridge-only replacement preserves the selected r34 Farm, media, pins and upload list', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-site-bridge-only-'));
  try {
    const out = join(temp, 'data'), inputs = join(temp, 'inputs'), mirror = join(temp, 'mirror');
    const base = 'standalone/golden-gate-bridge/r_new/', old = 'standalone/golden-gate-bridge/r_old/';
    const farmText = '{ "revision": "r34", "assets": [{"id":"farmhouse","revisionId":"r_accepted_child"}] }\n', uploads = '{"files":[{"path":"packs/farm/r34/models/farmhouse.glb"}]}\n';
    await save(join(out, 'packs/farm.json'), farmText); await save(join(out, 'upload-manifest.json'), uploads);
    const farmImage = { inputPath: 'media/farm/r34/cutout/farmhouse.webp', revision: 'r_accepted_child' }, otherImage = { inputPath: 'media/other.webp' };
    const farmSource = { archive: 'packs/farm/r34/editable.zip', output: 'sources/farmhouse.kiln.js' }, farmModel = { archive: 'packs/farm/r34/runtime.zip', output: 'models/farm/farmhouse.glb' };
    await json(join(out, 'commons-build.json'), { schemaVersion: 1, retained: 'plan metadata', images: [farmImage, otherImage, { inputPath: `${old}captures/classic-neutral.png` }], archives: ['packs/farm/r34/runtime.zip', `${old}golden-gate-editable.zip`], sources: [farmSource, { archive: `${old}golden-gate-editable.zip`, output: 'sources/golden-gate-bridge.kiln.js' }], models: [farmModel, { path: `${old}golden-gate-runtime.glb`, output: 'models/standalone/golden-gate-bridge.glb' }] });
    const farmPin = { path: 'packs/farm/r34/runtime.zip', bytes: 42, sha256: 'farm-pin' }, mediaPin = { path: farmImage.inputPath, bytes: 17, sha256: 'media-pin' };
    await json(join(out, 'mirror-manifest.json'), { base: 'https://assets.kilnstudio.tools/', retained: 'pin metadata', files: [farmPin, mediaPin, { path: `${old}golden-gate-editable.zip`, bytes: 1, sha256: 'old' }] });
    const source = strToU8('const meta = { name: "Bridge fixture" };'), glb = fixtureGlb();
    const revision = { name: 'Golden Gate Bridge', assetId: 'a_fixture', revisionId: 'r_new', parentRevision: 'r_old', files: { 'source.kiln.js': seal(source) } };
    const archive = zipSync({ 'bridge/source.kiln.js': source, 'bridge/manifest.json': strToU8(JSON.stringify(revision)) });
    const files = [];
    for (const [name, bytes] of [['golden-gate-editable.zip', archive], ['golden-gate-runtime.glb', glb]] as const) { await save(join(mirror, base, name), bytes); files.push({ path: base + name, ...seal(bytes) }); }
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#eee9df' } }).png().toBuffer();
    for (const name of ['classic-neutral', 'review-sheet-neutral', 'water-level-neutral', 'deck-neutral', 'tower-top-neutral', 'elevation-neutral']) { const path = `${base}captures/${name}.png`; await save(join(mirror, path), png); files.push({ path, ...seal(png) }); }
    await save(join(inputs, 'golden-gate/REFERENCE.md'), '## Published dimensions adopted\n| Quantity | Published | Model metres | Source |\n|---|---|---|---|\n| Span | 1 m | 1 | fixture |\n## Estimates\n');
    await save(join(inputs, 'golden-gate/REPORT.md'), '| Fixture | `r_aabb` |\n');
    const manifest = join(temp, 'new-manifest.json'); await json(manifest, { files: [...files, { path: 'packs/farm/r33/runtime.zip', bytes: 8, sha256: 'stale-farm-pin' }] });
    const result = await generateCommons({ inputs, mirror, manifest, bridgeRevision: 'r_new', onlyBridge: true, out });
    expect(result.bridge.revisionId).toBe('r_new'); expect(await readFile(join(out, 'packs/farm.json'), 'utf8')).toBe(farmText); expect(await readFile(join(out, 'upload-manifest.json'), 'utf8')).toBe(uploads);
    const plan = JSON.parse(await readFile(join(out, 'commons-build.json'), 'utf8'));
    expect(plan.images.filter((entry: { inputPath: string }) => !entry.inputPath.startsWith('standalone/'))).toEqual([farmImage, otherImage]); expect(plan.archives).toEqual(['packs/farm/r34/runtime.zip', `${base}golden-gate-editable.zip`]);
    expect(plan.sources[0]).toEqual(farmSource); expect(plan.models[0]).toEqual(farmModel); expect(plan.retained).toBe('plan metadata'); expect(plan.sources[1].archive).toBe(`${base}golden-gate-editable.zip`); expect(plan.models[1].path).toBe(`${base}golden-gate-runtime.glb`);
    const pins = JSON.parse(await readFile(join(out, 'mirror-manifest.json'), 'utf8')); expect(pins.files).toEqual([farmPin, mediaPin, ...files]); expect(pins.retained).toBe('pin metadata');
  } finally {
    const target = resolve(temp); if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-bridge-only-')) throw new Error('Unsafe test cleanup path'); await rm(target, { recursive: true, force: true });
  }
});
