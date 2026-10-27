import { afterEach, expect, test } from 'bun:test';
import { unzipSync, zipSync } from 'fflate';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hashBytes, verifyArchive } from './mirror-core.mjs';
import { holodeckObjectPath, holodeckUploadList, recordHolodeckPublished, recoverHolodeckStore, stageHolodeck } from './stage-holodeck.mjs';

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

const selectionPath = (f: Fixture, release: string) => join(f.root, `selection-${release}.json`);

/** Stage one release: each pack lists its slugs, and every slug records the packs that place it. */
async function stageRelease(f: Fixture, release: string, packs: Record<string, string[]>, overrides: Record<string, unknown> = {}) {
  const assets = JSON.parse(JSON.stringify(f.assets));
  for (const [pack, slugs] of Object.entries(packs)) for (const slug of slugs) assets[slug].placements.push({ pack });
  const used = Object.fromEntries(Object.entries(assets).filter(([, record]: [string, any]) => record.placements.length));
  const selectionFile = selectionPath(f, release);
  await put(selectionFile, JSON.stringify({ schemaVersion: 1, release, licence: 'CC0-1.0', versions: 'final-only', packs: Object.fromEntries(Object.entries(packs).map(([id, slugs]) => [id, { assets: slugs, source: { kind: 'fixture' } }])), assets: used }));
  return stageHolodeck({ kiln: f.kiln, mirror: f.mirror, stores: { fixture: f.store }, selectionFile, site: f.site, packsRoot: f.packsRoot, exporter: f.exporter, packs: Object.entries(packs).map(([id, slugs]) => PACK(id, slugs.length)), presentations, approved: () => true, ...overrides });
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

const COVE = { 'holodeck-cove': ['shell', 'palm'] };
const bundlePath = (catalog: any, slug: string) => catalog.assets.find((asset: any) => asset.slug === slug).editableDownload.path;

test('a lost store restages byte-identical packs from the published editable bundles and says which', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog;
  // The store is gone. Every revision is read back from the editable bundle the release published, which the
  // mirror still holds at its content-addressed key.
  const again = await stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {} });
  expect(again.recovered).toEqual([
    { slug: 'shell', store: 'fixture', assetId: ids('shell').assetId, revisionId: ids('shell').revisionId, bundle: bundlePath(first, 'shell') },
    { slug: 'palm', store: 'fixture', assetId: ids('palm').assetId, revisionId: ids('palm').revisionId, bundle: bundlePath(first, 'palm') },
  ]);
  expect(downloads(again.catalog)).toEqual(downloads(first));
  expect(again.catalog).toEqual(first);
});

test('a named store that lacks the selected revision falls back for that revision alone', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog;
  await rm(join(f.store, ids('palm').assetId), { recursive: true });
  const again = await stageRelease(f, 'holodeck-fixture-01', COVE);
  expect(again.recovered.map((record: any) => record.slug)).toEqual(['palm']);
  expect(again.catalog).toEqual(first);
});

test('a published bundle whose bytes differ from its pin is refused', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog;
  await writeFile(join(f.mirror, bundlePath(first, 'shell')), Buffer.from('tampered'));
  await expect(stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {} })).rejects.toThrow('SHA-256');
});

/** Pin `bytes` as `<slug>-editable.zip`, optionally in place of the object already pinned under that name. */
async function pinAsBundle(f: Fixture, slug: string, bytes: Buffer, { replace = true } = {}) {
  const path = holodeckObjectPath(`${slug}-editable.zip`, bytes);
  await put(join(f.mirror, path), bytes);
  const pins = JSON.parse(await readFile(join(f.site, 'src/data/mirror-manifest.json'), 'utf8'));
  const kept = replace ? pins.files.filter((pin: { path: string }) => !pin.path.endsWith(`/${slug}-editable.zip`)) : pins.files;
  await put(join(f.site, 'src/data/mirror-manifest.json'), JSON.stringify({ ...pins, files: [...kept, { path, ...seal(bytes) }] }));
}

test('a bundle pinned under one asset name that holds another revision is refused', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog;
  // An object that verifies against its pin but carries the palm revision under the shell's readable name.
  const palm = await readFile(join(f.mirror, bundlePath(first, 'palm')));
  await pinAsBundle(f, 'shell', palm, { replace: false });
  await expect(stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {} })).rejects.toThrow('More than one object is pinned');
  await pinAsBundle(f, 'shell', palm);
  await expect(stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {} })).rejects.toThrow('not the selected revision');
});

test('a bundle that no longer rebuilds byte for byte is refused rather than landing at a new key', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog;
  // The same revision, sealed members and all, packed with different ZIP settings: every hash the selection freezes
  // still verifies, so only rebuilding the object catches it.
  const members = unzipSync(await readFile(join(f.mirror, bundlePath(first, 'shell'))));
  const repacked = Buffer.from(zipSync(Object.fromEntries(Object.keys(members).sort().map((name) => [name, [members[name]!, { level: 0, mtime: new Date(1980, 0, 1) }] as const]))));
  await pinAsBundle(f, 'shell', repacked);
  await expect(stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {} })).rejects.toThrow('did not reproduce it byte for byte');
});

test('a bundle missing from the mirror comes from the asset host, and only once it served it back', async () => {
  const f = await fixture();
  const first = (await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog;
  const shell = bundlePath(first, 'shell');
  const served = await readFile(join(f.mirror, shell));
  await rm(join(f.mirror, shell));
  const asked: string[] = [];
  const fetchObject = async (url: string) => { asked.push(url); return served; };
  // Nothing in the ledger: the host has never served this object, so staging says so rather than guessing a URL.
  await expect(stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {}, fetchObject })).rejects.toThrow('published.json');
  await put(join(f.packsRoot, 'published.json'), JSON.stringify({ schemaVersion: 1, objects: [{ path: shell, bytes: served.length, sha256: hashBytes(served) }] }));
  const again = await stageRelease(f, 'holodeck-fixture-01', COVE, { stores: {}, fetchObject });
  expect(asked).toEqual([`https://assets.kilnstudio.tools/${shell}`]);
  expect(again.catalog).toEqual(first);
});

test('the recovery command rebuilds a store whose revisions are the stored bytes', async () => {
  const f = await fixture();
  await stageRelease(f, 'holodeck-fixture-01', COVE);
  const out = join(f.root, 'recovered');
  const recovered = await recoverHolodeckStore({ out, mirror: f.mirror, selectionFile: selectionPath(f, 'holodeck-fixture-01'), site: f.site, packsRoot: f.packsRoot });
  expect(recovered.revisions.map((record: any) => record.slug)).toEqual(['shell', 'palm']);
  for (const slug of ['shell', 'palm']) {
    const { assetId, revisionId } = ids(slug);
    for (const name of ['manifest.json', 'asset.glb', 'source.kiln.js', 'preview.png']) {
      const where = join(assetId, 'revisions', revisionId, name);
      expect(await readFile(join(out, where))).toEqual(await readFile(join(f.store, where)));
    }
  }
  // A store rebuilt this way stages on its own: nothing falls back to a bundle.
  const again = await stageRelease(f, 'holodeck-fixture-01', COVE, { stores: { fixture: out } });
  expect(again.recovered).toEqual([]);
});

test('a release ID that already staged other content is refused, with the next free one', async () => {
  const f = await fixture();
  const ledger = join(f.packsRoot, 'releases.json');
  await stageRelease(f, 'holodeck-fixture-01', COVE);
  expect(JSON.parse(await readFile(ledger, 'utf8')).releases.map((record: any) => record.release)).toEqual(['holodeck-fixture-01']);
  // Two packs staged in parallel both saw the same previous release and both chose the same next ID.
  await expect(stageRelease(f, 'holodeck-fixture-01', { 'holodeck-cove': ['shell'] })).rejects.toThrow('holodeck-fixture-02');
  // Restaging the same selection under the same ID is the normal release loop and adds nothing.
  expect((await stageRelease(f, 'holodeck-fixture-01', COVE)).catalog.release).toBe('holodeck-fixture-01');
  await stageRelease(f, 'holodeck-fixture-02', { 'holodeck-cove': ['shell'] });
  expect(JSON.parse(await readFile(ledger, 'utf8')).releases.map((record: any) => record.release)).toEqual(['holodeck-fixture-01', 'holodeck-fixture-02']);
  // An ID recorded as used but whose selection is unknown cannot be claimed either.
  await put(ledger, JSON.stringify({ schemaVersion: 1, releases: [{ release: 'holodeck-fixture-03' }] }));
  await expect(stageRelease(f, 'holodeck-fixture-03', COVE)).rejects.toThrow('holodeck-fixture-04');
});
