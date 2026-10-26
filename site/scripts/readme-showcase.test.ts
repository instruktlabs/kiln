import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { selectReadmeShots } from './readme-showcase.mjs';

const shots = { packs: { cabin: [{ view: 'exterior' }, { view: 'interior' }] } };

test('README picks named views independently of the website cover and capture order', () => {
  const picks = [{ worldId: 'cabin', view: 'exterior', width: 960 }];
  expect(selectReadmeShots(picks, shots)).toEqual([{ ...picks[0], shot: { view: 'exterior' } }]);
  expect(selectReadmeShots(picks, { packs: { cabin: [...shots.packs.cabin].reverse() } })).toEqual(selectReadmeShots(picks, shots));
});

test('a missing named view or duplicate world is refused instead of choosing another image', () => {
  const pick = { worldId: 'cabin', view: 'exterior', width: 960 };
  expect(() => selectReadmeShots([{ ...pick, view: 'missing' }], shots)).toThrow(/missing/);
  expect(() => selectReadmeShots([pick, pick], shots)).toThrow(/Duplicate/);
});

test('a bundled scene uses its recorded capture and keeps its own destination', () => {
  const pick = { worldId: 'bridge', view: 'drive', width: 960, url: 'https://kilnstudio.tools/scenes/golden-gate/' };
  const media = { bridge: { poster: { inputPath: 'bridge-drive.png' }, capture: { view: 'drive', pngSha256: 'capture-hash', renderer: { backend: 'webgpu' } } } };
  const [selected] = selectReadmeShots([pick], shots, media);
  expect(selected.shot).toMatchObject({ view: 'drive', inputPath: 'bridge-drive.png', sha256: 'capture-hash', capture: { backend: 'WebGPU', world: pick.url } });
  expect(() => selectReadmeShots([{ ...pick, view: 'missing' }], shots, media)).toThrow(/Missing/);
});

test('README stills match the chosen WebGPU captures and recorded file hashes', async () => {
  const root = resolve(import.meta.dir, '../..');
  const json = async (file: string) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
  const captures = await json('site/src/data/holodeck-shots.json');
  const picks = selectReadmeShots(await json('assets/readme/selection.json'), captures, await json('site/src/data/scene-media.json'));
  const { images } = await json('assets/readme/holodeck-showcase.json');
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  expect(images).toHaveLength(picks.length);
  for (const [index, image] of images.entries()) {
    const pick = picks[index];
    expect(image.view).toBe(pick.shot.view);
    expect(pick.shot.capture.backend).toBe('WebGPU');
    expect(image.inputPath).toBe(pick.shot.inputPath);
    expect(image.inputSha256).toBe(pick.shot.sha256);
    expect(readme).toContain(image.world);
    const bytes = await readFile(resolve(root, 'assets/readme', image.file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
    const metadata = await sharp(bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([image.width, image.height]);
    expect(readme).toContain(`assets/readme/${image.file}`);
  }
});

test('all four collage images have the same 16:9 dimensions', async () => {
  const { images } = JSON.parse(await readFile(resolve(import.meta.dir, '../../assets/readme/holodeck-showcase.json'), 'utf8'));
  expect(images).toHaveLength(4);
  expect(new Set(images.map((image: { width: number; height: number }) => `${image.width}x${image.height}`)).size).toBe(1);
  for (const image of images) expect(image.width * 9).toBe(image.height * 16);
});
