import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { hashBytes } from './mirror-core.mjs';
import { holodeckUploadList, stageHolodeckShots } from './stage-holodeck.mjs';

const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true }); });
const put = async (path: string, data: Buffer | string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); };
const SIZE = { width: 32, height: 18 };
const png = (colour: string, size = SIZE) => sharp({ create: { ...size, channels: 3, background: colour } }).png().toBuffer();
const PACKS = [{ id: 'holodeck-isle', scene: 'isle' }, { id: 'holodeck-cabin', scene: 'cabin' }];
const camera = (x: number) => ({ position: [x, 10, 20], target: [0, 0, 0], fov: 55, cove: true });
const SHOTS = {
  'holodeck-isle': [{ view: 'isle-wide', camera: camera(1), alt: 'The isle from above.' }, { view: 'isle-shore', camera: camera(2), alt: 'The isle shore.' }],
  'holodeck-cabin': [{ view: 'cabin-exterior', camera: camera(3), alt: 'The cabin outside.' }, { view: 'cabin-living', camera: camera(4), alt: 'The cabin living room.' }],
};
const WORLDS = { site: 'https://holodeck.example/', worldPath: 'worlds/{id}/', worlds: { 'holodeck-isle': 'isle', 'holodeck-cabin': 'cabin' } };

/** A capture folder as scripts/capture-holodeck-shots.mjs writes it, and a Kiln site with other media already pinned. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-holodeck-shots-')); directories.push(root);
  const captures = join(root, 'captures'), site = join(root, 'site'), mirror = join(root, 'mirror');
  const shots: Record<string, unknown> = {};
  for (const [index, [pack, list]] of Object.entries(SHOTS).entries()) {
    for (const entry of list) {
      await put(join(captures, `${entry.view}.png`), await png(['#2080c0', '#604020'][index]!));
      shots[entry.view] = { world: `https://holodeck.example/worlds/${pack.replace('holodeck-', '')}/`, manifestSha256: 'a'.repeat(64), camera: entry.camera, backend: 'WebGPU', drawCalls: 10, browser: 'HeadlessChrome/155', capturedAt: '2026-10-25T21:00:00.000Z' };
    }
  }
  await put(join(captures, 'receipt.json'), JSON.stringify({ tool: 'scripts/capture-holodeck-shots.mjs', size: SIZE, shots }));
  await put(join(site, 'src/data/mirror-manifest.json'), JSON.stringify({ files: [{ path: 'media/other/kept.png', bytes: 1, sha256: '0'.repeat(64) }] }));
  await put(join(site, 'src/data/commons-build.json'), JSON.stringify({ viewerModels: [], images: [{ inputPath: 'media/other/kept.png', width: 1, height: 1 }] }));
  return { root, captures, site, mirror };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const stage = (f: Fixture, options = {}) => stageHolodeckShots({ captures: f.captures, mirror: f.mirror, site: f.site, size: SIZE, shots: SHOTS, packs: PACKS, worlds: WORLDS, ...options });
const receipt = async (f: Fixture, change: (value: any) => void) => {
  const value = JSON.parse(await readFile(join(f.captures, 'receipt.json'), 'utf8')); change(value);
  await put(join(f.captures, 'receipt.json'), JSON.stringify(value));
};

test('each pack gets its two captured scene shots, wide view first, at content-addressed keys with their capture record', async () => {
  const f = await fixture();
  const record = await stage(f);
  expect(Object.keys(record.packs)).toEqual(['holodeck-isle', 'holodeck-cabin']);
  const [wide, shore] = record.packs['holodeck-isle'];
  const captured = await readFile(join(f.captures, 'isle-wide.png'));
  expect(wide).toMatchObject({ view: 'isle-wide', width: 32, height: 18, alt: 'The isle from above.', inputPath: `media/holodeck/scenes/${hashBytes(captured)}/isle-wide.png`, sha256: hashBytes(captured), bytes: captured.length });
  expect(wide.src).toBe(`/media/holodeck/scenes/${hashBytes(captured)}/isle-wide.webp`);
  expect(wide.capture).toEqual({ tool: 'scripts/capture-holodeck-shots.mjs', world: 'https://holodeck.example/worlds/isle/', manifestSha256: 'a'.repeat(64), camera: camera(1), backend: 'WebGPU', browser: 'HeadlessChrome/155', capturedAt: '2026-10-25T21:00:00.000Z' });
  expect(shore.view).toBe('isle-shore');
  expect(await readFile(join(f.mirror, wide.inputPath))).toEqual(captured);
  // Shots are pinned for the asset host and planned as responsive images; other media is left alone.
  const paths = Object.values(record.packs).flat().map((image: any) => image.inputPath);
  const pins = JSON.parse(await readFile(join(f.site, 'src/data/mirror-manifest.json'), 'utf8')).files;
  expect(pins.map((pin: any) => pin.path).sort()).toEqual(['media/other/kept.png', ...paths].sort());
  const plan = JSON.parse(await readFile(join(f.site, 'src/data/commons-build.json'), 'utf8'));
  expect(plan.images.map((image: any) => image.inputPath)).toEqual(['media/other/kept.png', ...paths]);
  expect(plan.images[1]).not.toHaveProperty('capture');
  expect(JSON.parse(await readFile(join(f.site, 'src/data/holodeck-shots.json'), 'utf8'))).toEqual(record);
  // Staging the same captures again changes nothing.
  const before = await readFile(join(f.site, 'src/data/commons-build.json'), 'utf8');
  expect(await stage(f)).toEqual(record);
  expect(await readFile(join(f.site, 'src/data/commons-build.json'), 'utf8')).toBe(before);
});

test('a shot is refused unless it was captured from its scene with the declared camera, on WebGPU, at the required size', async () => {
  const f = await fixture();
  await expect(stage(f, { shots: { ...SHOTS, 'holodeck-cabin': [SHOTS['holodeck-cabin'][0]] } })).rejects.toThrow('two shots');
  await expect(stage(f, { packs: [...PACKS, { id: 'holodeck-cove', scene: 'cove' }] })).rejects.toThrow('holodeck-cove');
  await expect(stage(f, { size: { width: 1920, height: 1080 } })).rejects.toThrow('1920');
  await receipt(f, (value) => { value.shots['cabin-living'].camera.fov = 70; });
  await expect(stage(f)).rejects.toThrow('cabin-living');
  await receipt(f, (value) => { value.shots['cabin-living'].camera.fov = 55; value.shots['isle-shore'].backend = 'WebGL2'; });
  await expect(stage(f)).rejects.toThrow('WebGPU');
  await receipt(f, (value) => { value.shots['isle-shore'].backend = 'WebGPU'; value.shots['isle-shore'].world = 'https://holodeck.example/worlds/cabin/'; });
  await expect(stage(f)).rejects.toThrow('isle-shore');
});

test('the upload list includes scene shots the asset host has not verified', async () => {
  const f = await fixture();
  const record = await stage(f);
  await put(join(f.site, 'src/data/holodeck.json'), JSON.stringify({ assets: [], packs: [] }));
  const list = await holodeckUploadList({ mirror: f.mirror, site: f.site, ledger: join(f.root, 'published.json') });
  expect(list.map((entry: any) => entry.path).sort()).toEqual(Object.values(record.packs).flat().map((image: any) => image.inputPath).sort());
});
