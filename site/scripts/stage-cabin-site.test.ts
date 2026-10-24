import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packCabinSite, stageCabinSite } from './stage-cabin-site.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cabin-site-'));
  const source = join(root, 'source'), mirror = join(root, 'mirror'), site = join(root, 'site');
  await mkdir(join(source, 'models'), { recursive: true });
  await writeFile(join(source, 'pack.json'), '{"release":"cabin-test-01"}\n');
  await writeFile(join(source, 'models/bed.glb'), Buffer.from([1, 2, 3]));
  await mkdir(join(site, 'src/data'), { recursive: true });
  await writeFile(join(site, 'src/data/cabin-woods-psx-horror.json'), JSON.stringify({ release: 'cabin-test-01' }));
  return { root, source, mirror, site };
}
const staged = (site: string) => join(site, 'public/asset-demos/cabin-woods-psx-horror');

test('the sealed site archive restages the exact Cabin files at their public path', async () => {
  const { root, source, mirror, site } = await fixture();
  try {
    const record = await packCabinSite({ source, mirror, release: 'cabin-test-01' });
    expect(record).toMatchObject({ release: 'cabin-test-01', path: 'packs/cabin-woods-psx-horror/cabin-test-01/cabin-woods-psx-horror-site.zip', files: 2 });
    const result = await stageCabinSite({ site, record, mirror, enabled: true });
    expect(result).toMatchObject({ release: 'cabin-test-01', files: 2, unchanged: false });
    expect((await readdir(staged(site))).sort()).toEqual(['models', 'pack.json']);
    expect(await readFile(join(staged(site), 'models/bed.glb'))).toEqual(Buffer.from([1, 2, 3]));
    expect((await stageCabinSite({ site, record, mirror, enabled: true })).unchanged).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('different earlier staging is kept under .cache, never deleted', async () => {
  const { root, source, mirror, site } = await fixture();
  try {
    const record = await packCabinSite({ source, mirror, release: 'cabin-test-01' });
    await mkdir(staged(site), { recursive: true });
    await writeFile(join(staged(site), 'old.txt'), 'earlier');
    await stageCabinSite({ site, record, mirror, enabled: true });
    expect((await readdir(staged(site))).sort()).toEqual(['models', 'pack.json']);
    const history = join(site, '.cache/cabin-site/staged-history');
    const [kept] = await readdir(history);
    expect(await readFile(join(history, kept, 'old.txt'), 'utf8')).toBe('earlier');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the archive must match the catalog release and its pinned bytes', async () => {
  const { root, source, mirror, site } = await fixture();
  try {
    const record = await packCabinSite({ source, mirror, release: 'cabin-test-01' });
    await expect(stageCabinSite({ site, record: { ...record, release: 'cabin-test-02' }, mirror, enabled: true })).rejects.toThrow('differs from the catalog');
    await expect(stageCabinSite({ site, record: { ...record, sha256: '0'.repeat(64) }, mirror, enabled: true })).rejects.toThrow();
    expect(await stageCabinSite({ site, record, mirror, enabled: false })).toEqual({ skipped: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});
