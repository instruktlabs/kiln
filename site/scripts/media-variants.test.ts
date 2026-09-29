import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { MEDIA_WIDTHS, refreshMediaSrcsets } from './media-variants.mjs';
import { imageRecord } from './generate-commons.mjs';
import { buildCommons } from './fetch-mirror.mjs';
import { hashBytes } from './mirror-core.mjs';
const json = async (path: string, value: unknown) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value)); };
const withoutSrcsets = (value: unknown): unknown => Array.isArray(value) ? value.map(withoutSrcsets) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !['srcsetWebp', 'srcsetAvif'].includes(key)).map(([key, item]) => [key, withoutSrcsets(item)])) : value;

test('derived-only refresh preserves revisions, seals, source and image qualifications', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-site-variants-'));
  try {
    const image = { inputPath: 'media/farm/r33/scene/scene.webp', src: '/media/farm/r33/scene/scene.webp', width: 1440, height: 925, alt: 'Scene', sourceDelivery: 'r33', exactRevision: false, revisionQualification: 'Not recaptured', srcsetWebp: 'old', srcsetAvif: 'old' };
    const farm = { revision: 'r34', fullPackAccepted: true, sourceSha256: 'source-pin', downloads: [{ sha256: 'archive-pin' }], scene: { poster: image }, floorRevision: { before: { ...image, width: 508 } } };
    const bridge = { revisionId: 'r_verified', metrics: { clips: [] }, runtimeDownload: { sha256: 'model-pin' }, poster: image };
    const plan = { images: [image], sources: [{ sha256: 'source-pin', archive: 'sealed.zip' }], models: [{ sha256: 'model-pin' }] };
    const files = ['packs/farm.json', 'standalone/golden-gate-bridge.json', 'commons-build.json'];
    for (const [i, value] of [farm, bridge, plan].entries()) await json(join(temp, files[i]!), value);
    const result = await refreshMediaSrcsets({ dataDir: temp }); expect(result.filesChanged).toBe(3);
    for (const [i, prior] of [farm, bridge, plan].entries()) expect(withoutSrcsets(JSON.parse(await readFile(join(temp, files[i]!), 'utf8')))).toEqual(withoutSrcsets(prior));
    const after = JSON.parse(await readFile(join(temp, files[0]!), 'utf8')); expect(after.scene.poster.srcsetAvif).toContain('scene-672.avif 672w'); expect(after.floorRevision.before.srcsetAvif).not.toContain('672w');
    expect((await refreshMediaSrcsets({ dataDir: temp })).filesChanged).toBe(0);
  } finally { const target = resolve(temp); if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-variants-')) throw new Error('Unsafe cleanup path'); await rm(target, { recursive: true, force: true }); }
});

test('mirror generation emits exactly the widths advertised by the catalog helper', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-site-variant-build-'));
  try {
    const dataDir = join(temp, 'data'), mirror = join(temp, 'mirror'), publicDir = join(temp, 'public');
    const inputPath = 'media/farm/fixture/scene.png', bytes = await sharp({ create: { width: 768, height: 2, channels: 3, background: '#eee9df' } }).png().toBuffer();
    await mkdir(dirname(join(mirror, inputPath)), { recursive: true }); await writeFile(join(mirror, inputPath), bytes);
    const image = imageRecord(inputPath, 768, 2, 'Fixture');
    await json(join(dataDir, 'commons-build.json'), { archives: [], models: [], sources: [], images: [image] }); await json(join(dataDir, 'mirror-manifest.json'), { files: [{ path: inputPath, bytes: bytes.length, sha256: hashBytes(bytes) }] }); await json(join(dataDir, 'upload-manifest.json'), { files: [] });
    await mkdir(join(dataDir, 'standalone'), { recursive: true }); await writeFile(join(dataDir, 'standalone/golden-gate-reference.md'), 'Fixture reference');
    await buildCommons({ dataDir, mirror, publicDir, cache: join(temp, 'cache'), enabled: true });
    const expected = MEDIA_WIDTHS.filter((width: number) => width <= image.width); expect(expected).toContain(672);
    for (const [format, srcset] of [['avif', image.srcsetAvif], ['webp', image.srcsetWebp]]) {
      const rows = srcset.split(', ').map((row: string) => row.split(' ')); expect(rows.map((row: string[]) => Number(row[1]?.slice(0, -1)))).toEqual(expected);
      for (const [path, size] of rows) expect((await sharp(await readFile(join(publicDir, path.slice(1)))).metadata()).width).toBe(Number(size.slice(0, -1)));
      expect(srcset).toContain(`scene-672.${format} 672w`);
    }
  } finally { const target = resolve(temp); if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-variant-build-')) throw new Error('Unsafe cleanup path'); await rm(target, { recursive: true, force: true }); }
}, 20000);
