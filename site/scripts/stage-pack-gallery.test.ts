import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashBytes } from './mirror-core.mjs';
import { stagePackGallery } from './stage-pack-gallery.mjs';

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

const parent = `r_${'1'.repeat(32)}`, child = `r_${'2'.repeat(32)}`, other = `r_${'3'.repeat(32)}`;
const assetId = `a_${'a'.repeat(32)}`;
const license = { spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', scope: 'Fixture scope.' };
const posterOf = (revisionId: string) => ({
  src: `/media/rig/review-neutral-v1/fixture/r1/bench.webp`, width: 1024, height: 1024, alt: 'A bench.',
  inputPath: 'media/rig/review-neutral-v1/fixture/r1/bench.png', sourceRevisionId: revisionId, exactRevision: true, rig: 'review-neutral-v1',
});

/** A one-asset pack staged as release r2, over a catalog whose bench was last staged at `prior`. */
async function stage(prior: { revisionId: string; poster: ReturnType<typeof posterOf>; assetId?: string }) {
  const site = await mkdtemp(join(tmpdir(), 'pack-gallery-')); dirs.push(site);
  const glb = Buffer.from('child bench glb');
  const model = { member: 'models/bench.glb', bytes: glb.length, sha256: hashBytes(glb) };
  await mkdir(join(site, 'src/data/packs'), { recursive: true });
  await mkdir(join(site, 'assets/models'), { recursive: true });
  await writeFile(join(site, 'assets/models/bench.glb'), glb);
  await writeFile(join(site, 'src/data/asset-delivery.json'), JSON.stringify({ schemaVersion: 1, groups: {} }));
  await writeFile(join(site, 'src/data/mirror-manifest.json'), JSON.stringify({ files: [] }));
  const catalogOut = join(site, 'src/data/packs/fixture.json');
  await writeFile(catalogOut, JSON.stringify({ assets: [{
    slug: 'bench', assetId: prior.assetId ?? assetId, revisionId: prior.revisionId,
    runtimeModelDownload: { member: model.member, bytes: 9, sha256: '0'.repeat(64) }, poster: prior.poster,
  }] }));
  const manifest = { version: 'kiln.asset.v1', assetId, revisionId: child, parentRevision: parent, editable: true, files: { 'asset.glb': { sha256: `sha256:${model.sha256}`, bytes: glb.length } } };
  const catalog = {
    id: 'fixture', name: 'Fixture', release: 'r2', license,
    assets: [{ slug: 'bench', collection: 'project', assetId, revisionId: child, parentRevision: parent, runtimeModelDownload: model }],
  };
  await stagePackGallery({
    site, id: 'fixture', catalog, license, notices: Buffer.from('Fixture notices'),
    records: new Map([['bench', { manifest, files: { 'asset.glb': glb } }]]),
    assetsDir: join(site, 'assets'), mirror: join(site, 'mirror'), reviewPath: join(site, '.cache/review'), catalogOut,
  });
  return JSON.parse(await readFile(catalogOut, 'utf8')).assets[0];
}

test('a poster rendered from the selected revision\'s parent stays, marked as an earlier revision\'s, until its own is rendered', async () => {
  const staged = await stage({ revisionId: parent, poster: posterOf(parent) });
  expect(staged.revisionId).toBe(child);
  expect(staged.poster).toEqual({ ...posterOf(parent), exactRevision: false });
});

test('a poster of any other revision or asset is dropped rather than shown for the selected revision', async () => {
  expect((await stage({ revisionId: other, poster: posterOf(other) })).poster).toBeUndefined();
  expect((await stage({ revisionId: parent, poster: posterOf(parent), assetId: `a_${'b'.repeat(32)}` })).poster).toBeUndefined();
  // A poster already carried from an earlier revision is not carried again to that revision's child.
  expect((await stage({ revisionId: parent, poster: { ...posterOf(other), exactRevision: false } })).poster).toBeUndefined();
});
