import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hashBytes, verifyArchive } from './mirror-core.mjs';
import { holodeckObjectPath, holodeckUploadList, recordHolodeckPublished, stageHolodeck } from './stage-holodeck.mjs';

const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true }); });

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzVkAAAAASUVORK5CYII=', 'base64');
const seal = (bytes: Buffer) => ({ bytes: bytes.length, sha256: hashBytes(bytes) });
const put = async (path: string, data: Buffer | string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); };

function triangleGlb(name: string, extras?: Record<string, unknown>) {
  const bin = Buffer.alloc(44); for (const [i, v] of [0, 0, 0, 1, 0, 0, 0, 1, 0].entries()) bin.writeFloatLE(v, i * 4); for (let i = 0; i < 3; i++) bin.writeUInt16LE(i, 36 + i * 2);
  const document = { asset: { version: '2.0', ...(extras ? { extras } : {}) }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{}], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }], buffers: [{ byteLength: 44 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }] };
  const raw = Buffer.from(JSON.stringify(document)); const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const b = Buffer.alloc(28 + json.length + bin.length); b.write('glTF'); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8); b.writeUInt32LE(json.length, 12); b.write('JSON', 16); json.copy(b, 20); b.writeUInt32LE(bin.length, 20 + json.length); b.write('BIN\0', 24 + json.length); bin.copy(b, 28 + json.length); return b;
}

const SLUGS = ['shell', 'palm', 'lantern'] as const;
const ids = (slug: string) => { const c = (SLUGS.indexOf(slug as never) + 1).toString(16); return { assetId: 'a_' + c.repeat(32), revisionId: 'r_' + c.repeat(32) }; };
const presentations = Object.fromEntries(SLUGS.map((slug) => [slug, { name: slug, description: `A ${slug}.`, category: 'prop' }]));

/** A Kiln store holding one saved revision per slug, and a fake runtime export that keeps the canonical binary. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-holodeck-stage-')); directories.push(root);
  const store = join(root, 'store'), site = join(root, 'site'), packsRoot = join(root, 'packs'), mirror = join(root, 'mirror');
  const runtimes: Record<string, { glb: Buffer; metadata: Buffer }> = {};
  const assets: Record<string, unknown> = {};
  for (const slug of SLUGS) {
    const { assetId, revisionId } = ids(slug);
    const canonical = triangleGlb(slug), source = Buffer.from(`const meta={name:'${slug}'};function build(){return createRoot('${slug}');}`);
    const files = { 'asset.glb': canonical, 'source.kiln.js': source, 'preview.png': png };
    const manifest = Buffer.from(JSON.stringify({ version: 'kiln.asset.v1', assetId, revisionId, name: slug, tags: [], createdAt: '2026-10-24T00:00:00.000Z', editable: true, files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: 'sha256:' + hashBytes(bytes) }])) }));
    const dir = join(store, assetId, 'revisions', revisionId);
    await put(join(dir, 'manifest.json'), manifest);
    for (const [name, bytes] of Object.entries(files)) await put(join(dir, name), bytes);
    const metadata = Buffer.from(JSON.stringify({ version: 'kiln.runtime-metadata.v1', source: { assetId, revisionId, glbSha256: 'sha256:' + hashBytes(canonical), sourceSha256: 'sha256:' + hashBytes(source) } }));
    runtimes[slug] = { glb: triangleGlb(slug, { kilnProvenanceV1: { version: 'kiln.provenance.v1', profile: 'runtime', metadata: { uri: `${slug}.kiln-metadata.json`, sha256: 'sha256:' + hashBytes(metadata) } } }), metadata };
    assets[slug] = { store: 'fixture', collection: 'project', assetId, revisionId, manifest: seal(manifest), canonical: seal(canonical), source: seal(source), placements: [] };
  }
  await put(join(packsRoot, 'LICENSES/CC0-1.0.txt'), 'CC0 1.0 Universal (fixture)\n');
  await put(join(site, 'src/data/mirror-manifest.json'), JSON.stringify({ files: [] }));
  await put(join(site, 'src/data/commons-build.json'), JSON.stringify({ viewerModels: [] }));
  await put(join(root, 'kiln/package.json'), JSON.stringify({ version: '9.9.9' }));
  const exporter = async ({ slug }: { slug: string }) => runtimes[slug];
  return { root, store, site, packsRoot, mirror, assets, exporter, kiln: join(root, 'kiln') };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const PACK = (id: string, expectedAssets: number) => ({ id, scene: id, name: id, description: `The ${id} pack.`, expectedAssets });

/** Stage one release: each pack lists its slugs, and every slug records the packs that place it. */
async function stageRelease(f: Fixture, release: string, packs: Record<string, string[]>) {
  const assets = JSON.parse(JSON.stringify(f.assets));
  for (const [pack, slugs] of Object.entries(packs)) for (const slug of slugs) assets[slug].placements.push({ pack });
  const used = Object.fromEntries(Object.entries(assets).filter(([, record]: [string, any]) => record.placements.length));
  const selectionFile = join(f.root, `selection-${release}.json`);
  await put(selectionFile, JSON.stringify({ schemaVersion: 1, release, licence: 'CC0-1.0', versions: 'final-only', packs: Object.fromEntries(Object.entries(packs).map(([id, slugs]) => [id, { assets: slugs, source: { kind: 'fixture' } }])), assets: used }));
  return stageHolodeck({ kiln: f.kiln, mirror: f.mirror, stores: { fixture: f.store }, selectionFile, site: f.site, packsRoot: f.packsRoot, exporter: f.exporter, packs: Object.entries(packs).map(([id, slugs]) => PACK(id, slugs.length)), presentations, approved: () => true });
}

/** Record a poster per staged model, as scripts/rig-posters.mjs does, then stage again so the catalog shows them. */
async function stageWithPosters(f: Fixture, release: string, packs: Record<string, string[]>) {
  const { catalog } = await stageRelease(f, release, packs);
  const posters: Record<string, unknown> = {};
  const pins = JSON.parse(await readFile(join(f.site, 'src/data/mirror-manifest.json'), 'utf8'));
  for (const asset of catalog.assets) {
    const path = `media/rig/review-neutral-v1/holodeck/${asset.slug}.png`;
    await put(join(f.mirror, path), png);
    if (!pins.files.some((record: { path: string }) => record.path === path)) pins.files.push({ path, ...seal(png) });
    posters[`holodeck:${asset.slug}`] = { path, width: 1, height: 1, assetId: asset.assetId, revisionId: asset.revisionId, glb: { bytes: asset.runtimeModelDownload.bytes, sha256: asset.runtimeModelDownload.sha256 } };
  }
  await put(join(f.site, 'src/data/mirror-manifest.json'), JSON.stringify(pins));
  await put(join(f.site, 'src/data/rig-posters.json'), JSON.stringify({ posters }));
  return (await stageRelease(f, release, packs)).catalog;
}

const downloads = (catalog: any) => [
  ...catalog.assets.flatMap((asset: any) => [asset.runtimeModelDownload, asset.runtimeDownload, asset.editableDownload]),
  ...catalog.packs.flatMap((pack: any) => pack.downloads),
];

test('downloads live at content-addressed keys that keep a readable file name', async () => {
  const f = await fixture();
  const { catalog } = await stageRelease(f, 'holodeck-fixture-01', { 'holodeck-cove': ['shell', 'palm'] });
  const shell = catalog.assets.find((asset: any) => asset.slug === 'shell');
  expect(shell.runtimeModelDownload.path).toBe(`packs/holodeck/objects/${shell.runtimeModelDownload.sha256}/shell.glb`);
  expect(shell.runtimeDownload.path).toMatch(/^packs\/holodeck\/objects\/[0-9a-f]{64}\/shell-runtime\.zip$/);
  expect(shell.editableDownload.path).toMatch(/^packs\/holodeck\/objects\/[0-9a-f]{64}\/shell-editable\.zip$/);
  for (const download of downloads(catalog)) {
    const name = download.path.split('/').at(-1);
    expect(download.path).toBe(holodeckObjectPath(name, await readFile(join(f.mirror, download.path))));
    expect(download.url).toBe('https://assets.kilnstudio.tools/' + download.path);
  }
  expect(catalog.release).toBe('holodeck-fixture-01');
  expect(catalog.packs[0].downloads.map((d: any) => d.path.split('/').at(-1))).toEqual(['holodeck-cove-runtime.zip', 'holodeck-cove-editable.zip']);
});

test('a new release reuses every unchanged object and adds only what changed', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', { 'holodeck-cove': ['shell', 'palm'], 'holodeck-tide': ['palm'] })).catalog;
  // The next release adds a scene that shares the palm: palm gains a pack, but its bytes and the old packs' bytes do not change.
  const second = (await stageRelease(f, 'holodeck-fixture-02', { 'holodeck-cove': ['shell', 'palm'], 'holodeck-tide': ['palm'], 'holodeck-winter': ['palm', 'lantern'] })).catalog;
  const before = new Set(downloads(first).map((download: any) => download.path));
  const added = downloads(second).filter((download: any) => !before.has(download.path)).map((download: any) => download.path.split('/').at(-1)).sort();
  expect(added).toEqual(['holodeck-winter-editable.zip', 'holodeck-winter-runtime.zip', 'lantern-editable.zip', 'lantern-runtime.zip', 'lantern.glb']);
  expect(second.assets.find((asset: any) => asset.slug === 'palm').packs).toEqual(['holodeck-cove', 'holodeck-tide', 'holodeck-winter']);
  // Pack READMEs name neither the release nor the exporter that staged it, so they stay byte-identical across releases.
  const readme = Buffer.from(verifyArchive(await readFile(join(f.mirror, second.packs[0].downloads[0].path))).files['README.txt']).toString();
  expect(readme).not.toContain('holodeck-fixture');
  expect(readme).not.toContain('9.9.9');
  // Pins and viewer models follow the current catalog, and every pinned object is in the mirror.
  const pins = JSON.parse(await readFile(join(f.site, 'src/data/mirror-manifest.json'), 'utf8')).files.map((record: any) => record.path).sort();
  expect(pins).toEqual([...new Set(downloads(second).map((download: any) => download.path))].sort());
  const plan = JSON.parse(await readFile(join(f.site, 'src/data/commons-build.json'), 'utf8'));
  expect(plan.viewerModels.sort()).toEqual(second.assets.map((asset: any) => asset.runtimeModelDownload.path).sort());
});

test('the upload list holds only objects the asset host has not verified', async () => {
  const f = await fixture();
  const ledger = join(f.packsRoot, 'published.json');
  const first = await stageWithPosters(f, 'holodeck-fixture-01', { 'holodeck-cove': ['shell', 'palm'] });
  const initial = await holodeckUploadList({ mirror: f.mirror, site: f.site, ledger });
  expect(initial).toHaveLength(downloads(first).length + first.assets.length);
  // publish-assets.mjs writes this receipt after reading every object back from the host.
  const receipt = { files: initial.map((record: any) => ({ ...record, url: 'https://assets.kilnstudio.tools/' + record.path, verifiedUrl: 'https://assets.kilnstudio.tools/' + record.path + '?__kiln_publish=x', uploaded: true })) };
  await put(join(f.root, 'receipt.json'), JSON.stringify(receipt));
  expect((await recordHolodeckPublished({ receipt: join(f.root, 'receipt.json'), ledger })).added).toBe(initial.length);
  expect(await holodeckUploadList({ mirror: f.mirror, site: f.site, ledger })).toEqual([]);

  await stageWithPosters(f, 'holodeck-fixture-02', { 'holodeck-cove': ['shell', 'palm'], 'holodeck-winter': ['palm', 'lantern'] });
  const next = await holodeckUploadList({ mirror: f.mirror, site: f.site, ledger });
  expect(next.map((record: any) => record.path.split('/').at(-1)).sort()).toEqual(['holodeck-winter-editable.zip', 'holodeck-winter-runtime.zip', 'lantern-editable.zip', 'lantern-runtime.zip', 'lantern.glb', 'lantern.png']);
  // Recording the same publication again changes nothing.
  expect((await recordHolodeckPublished({ receipt: join(f.root, 'receipt.json'), ledger })).added).toBe(0);
});

test('immutable keys refuse different bytes in the mirror, the ledger and the receipt', async () => {
  const f = await fixture();
  const ledger = join(f.packsRoot, 'published.json');
  const catalog = await stageWithPosters(f, 'holodeck-fixture-01', { 'holodeck-cove': ['shell'] });
  const model = catalog.assets[0].runtimeModelDownload;
  // A receipt entry that was never read back from the host is not evidence of publication.
  await put(join(f.root, 'unverified.json'), JSON.stringify({ files: [{ path: model.path, bytes: model.bytes, sha256: model.sha256, uploaded: true }] }));
  await expect(recordHolodeckPublished({ receipt: join(f.root, 'unverified.json'), ledger })).rejects.toThrow('read back');
  await put(ledger, JSON.stringify({ schemaVersion: 1, objects: [{ path: model.path, bytes: model.bytes, sha256: '0'.repeat(64) }] }));
  await expect(holodeckUploadList({ mirror: f.mirror, site: f.site, ledger })).rejects.toThrow('different bytes');
  await rm(ledger);
  await writeFile(join(f.mirror, model.path), Buffer.from('tampered'));
  await expect(stageRelease(f, 'holodeck-fixture-02', { 'holodeck-cove': ['shell'] })).rejects.toThrow('differs');
});
