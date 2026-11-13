import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compareTrees, rebuildCabinInputs } from './cabin-site-swap.mjs';
import { hashBytes } from './mirror-core.mjs';

const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true }); });
const aid = `a_${'a'.repeat(32)}`, parent = `r_${'b'.repeat(32)}`, child = `r_${'c'.repeat(32)}`;
const encode = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const put = async (path: string, bytes: Buffer | string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };

async function revision(store: string, revisionId: string, glb: string, src: string, parentRevision?: string) {
  const files = { 'asset.glb': Buffer.from(glb), 'source.kiln.js': Buffer.from(src), 'preview.png': Buffer.from('png') };
  const manifest = { assetId: aid, revisionId, ...(parentRevision ? { parentRevision } : {}), files: Object.fromEntries(Object.entries(files).map(([n, b]) => [n, { bytes: b.length, sha256: `sha256:${hashBytes(b)}` }])) };
  const dir = join(store, aid, 'revisions', revisionId);
  await put(join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, bytes] of Object.entries(files)) await put(join(dir, name), bytes);
  await put(join(dir, 'materials.kiln.json'), '{"schemaVersion":2,"records":[]}');
  return { dir, manifest, files };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-cabin-swap-')); directories.push(root);
  const store = join(root, 'store');
  const saved = await revision(store, parent, 'parent glb', 'parent source');
  const runtime = Buffer.from('parent runtime'), metadata = Buffer.from('parent sidecar');
  const materials = await readFile(join(saved.dir, 'materials.kiln.json')), manifestBytes = await readFile(join(saved.dir, 'manifest.json'));
  const sourceSha = hashBytes(saved.files['source.kiln.js']);
  const entry = { name: 'Fixture', collection: 'project', assetId: aid, revisionId: parent, sourceRef: `p_${sourceSha.slice(0, 12)}`, canonicalSha256: hashBytes(saved.files['asset.glb']), runtimeSha256: hashBytes(runtime), sourceSha256: sourceSha, manifestSha256: hashBytes(manifestBytes), materialsSha256: hashBytes(materials), sha256: hashBytes(runtime), bytes: runtime.length, url: `./assets/fixture-${hashBytes(runtime).slice(0, 12)}.glb`, metadataURL: './assets/fixture.kiln-metadata.json', metadataSha256: hashBytes(metadata), metadataBytes: metadata.length };
  const collection = encode({ schemaVersion: 1, ownerVisualApproval: false, assets: { fixture: entry } });
  const code = Buffer.from('<!doctype html><script src="./assets/game.js"></script>');
  const scene: [string, Buffer][] = [['web/game.html', code], [`web/woodland/${entry.url.slice(2)}`, runtime], ['web/woodland/assets/fixture.kiln-metadata.json', metadata], ['web/woodland/collection.json', collection]];
  const pin = encode({ schemaVersion: 1, release: 'cabin-old', selectionSha256: 'f'.repeat(64), maxArchiveBytes: 1, files: scene.slice(1).map(([path, b]) => ({ path, bytes: b.length, sha256: hashBytes(b) })).sort((a, b) => (a.path < b.path ? -1 : 1)) });
  const html = Buffer.from('<title>source</title>');
  const sourceManifest = encode({ schemaVersion: 1, origin: 'scenes/packages/cabin-woods-psx-horror', files: [{ path: 'game.html', bytes: html.length, sha256: hashBytes(html) }, { path: 'runtime-pin.json', bytes: pin.length, sha256: hashBytes(pin) }] });
  const files = new Map<string, Buffer>([...scene, ['scene-source/game.html', html], ['scene-source/runtime-pin.json', pin], ['scene-source/source-manifest.json', sourceManifest],
    ['pack.json', encode({ release: 'cabin-old', files: scene.map(([path, b]) => ({ path, bytes: b.length, sha256: hashBytes(b) })) })]]);
  const catalog = { assets: [{ slug: 'fixture', name: 'Fixture', description: 'A fixture.', category: 'Cabin and woodland', collection: 'project', assetId: aid, revisionId: parent, sourceRef: entry.sourceRef }], textureResources: [] };
  return { root, store, files, catalog, entry, code, runtime };
}

async function childSwap(f: Awaited<ReturnType<typeof fixture>>, edit: (manifest: Record<string, unknown>) => void = () => {}) {
  const saved = await revision(join(f.root, 'inputs'), child, 'child glb', 'child source', parent);
  edit(saved.manifest);
  const bytes = Buffer.from('child runtime');
  return { member: 'models/fixture.glb', fileAbsolute: join(saved.dir, 'asset.glb'), revision: child, sha256: hashBytes(bytes), bytes, manifest: saved.manifest, runtimeMetadata: { name: 'fixture.kiln-metadata.json', bytes: Buffer.from('child sidecar') }, previous: { revision: parent, sha256: hashBytes(f.runtime) } };
}

const tree = async (dir: string, paths: string[]) => new Map(await Promise.all(paths.map(async (p) => [p, await readFile(join(dir, p))] as [string, Buffer])));

test('without swaps the rebuilt scene inputs are the published files and only the runtime pin names the new selection', async () => {
  const f = await fixture();
  const out = await rebuildCabinInputs({ files: f.files, catalog: f.catalog, stores: [f.store], release: 'cabin-old', work: join(f.root, 'work') });
  const built = await tree(join(out.scene, 'build'), ['web/game.html', `web/woodland/${f.entry.url.slice(2)}`, 'web/woodland/collection.json']);
  for (const [path, bytes] of built) expect(bytes.equals(f.files.get(path)!), path).toBe(true);
  const pin = JSON.parse(await readFile(join(out.source, 'runtime-pin.json'), 'utf8'));
  expect(pin.selectionSha256).toBe(out.selectionSha256);
  expect(pin.files).toEqual(JSON.parse(f.files.get('scene-source/runtime-pin.json')!.toString()).files);
  const selection = JSON.parse(await readFile(out.selection, 'utf8'));
  expect(selection.assets.fixture).toMatchObject({ revisionId: parent, runtimeSha256: f.entry.runtimeSha256, manifestSha256: f.entry.manifestSha256, materialsSha256: f.entry.materialsSha256 });
});

test('a swap replaces only the model, its sidecar and the records naming them; the code stays byte for byte', async () => {
  const f = await fixture();
  const swap = await childSwap(f);
  const out = await rebuildCabinInputs({ files: f.files, catalog: f.catalog, stores: [f.store], swaps: [swap], release: 'cabin-new', work: join(f.root, 'work') });
  const url = `./assets/fixture-${swap.sha256.slice(0, 12)}.glb`;
  expect(out.collection.assets.fixture).toMatchObject({ revisionId: child, url, sha256: swap.sha256, runtimeSha256: swap.sha256, bytes: swap.bytes.length, sourceRef: `p_${hashBytes(Buffer.from('child source')).slice(0, 12)}`, metadataSha256: hashBytes(swap.runtimeMetadata.bytes), name: 'Fixture' });
  expect(out.collection.ownerVisualApproval).toBe(false);
  expect(out.removed).toEqual([`web/woodland/${f.entry.url.slice(2)}`]);
  expect((await readFile(join(out.scene, 'build/web/game.html'))).equals(f.code)).toBe(true);
  expect((await readFile(join(out.scene, 'build/web/woodland', url.slice(2)))).equals(swap.bytes)).toBe(true);
  expect((await readFile(join(out.scene, 'build/web/woodland/collection.json'))).equals(encode(out.collection))).toBe(true);
  expect((await readFile(join(out.scene, 'build/web/woodland/assets/fixture.kiln-metadata.json'))).equals(swap.runtimeMetadata.bytes)).toBe(true);
  const seal = JSON.parse(await readFile(join(out.scene, 'stage-manifest.json'), 'utf8'));
  expect(seal.files.map((e: { path: string }) => e.path)).toEqual(['web/game.html', `web/woodland/${url.slice(2)}`, 'web/woodland/assets/fixture.kiln-metadata.json', 'web/woodland/collection.json']);
  const pin = JSON.parse(await readFile(join(out.source, 'runtime-pin.json'), 'utf8'));
  expect(pin.release).toBe('cabin-new');
  expect(pin.files.map((e: { path: string }) => e.path)).toContain(`web/woodland/${url.slice(2)}`);
  const sourceSeal = JSON.parse(await readFile(join(out.source, 'source-manifest.json'), 'utf8'));
  expect(sourceSeal.files.find((e: { path: string }) => e.path === 'runtime-pin.json').sha256).toBe(hashBytes(await readFile(join(out.source, 'runtime-pin.json'))));
  expect(await readFile(join(out.workspace, 'assets/kiln', aid, 'revisions', child, 'materials.kiln.json'), 'utf8')).toContain('records');
});

test('a catalog already moved to the swap revisions rebuilds the same inputs', async () => {
  const f = await fixture();
  const swap = await childSwap(f);
  const first = await rebuildCabinInputs({ files: f.files, catalog: f.catalog, stores: [f.store], swaps: [swap], release: 'cabin-new', work: join(f.root, 'w1') });
  const moved = { ...f.catalog, assets: [{ ...f.catalog.assets[0], revisionId: child, sourceRef: 'p_moved' }] };
  const again = await rebuildCabinInputs({ files: f.files, catalog: moved, stores: [f.store], swaps: [swap], release: 'cabin-new', work: join(f.root, 'w2') });
  expect(again.selectionSha256).toBe(first.selectionSha256);
  await expect(rebuildCabinInputs({ files: f.files, catalog: moved, stores: [f.store], release: 'cabin-new', work: join(f.root, 'w3') })).rejects.toThrow('the catalog names');
});

test('a swap must be a saved child of the scene revision and name the scene model it replaces', async () => {
  const f = await fixture();
  const stranger = await childSwap(f, (m) => { m.parentRevision = `r_${'d'.repeat(32)}`; });
  await expect(rebuildCabinInputs({ files: f.files, catalog: f.catalog, stores: [f.store], swaps: [stranger], release: 'cabin-new', work: join(f.root, 'w1') })).rejects.toThrow('saved child');
  const stale = await childSwap(f);
  await expect(rebuildCabinInputs({ files: f.files, catalog: f.catalog, stores: [f.store], swaps: [{ ...stale, previous: { revision: parent, sha256: '0'.repeat(64) } }], release: 'cabin-new', work: join(f.root, 'w2') })).rejects.toThrow('previous pin');
  await expect(rebuildCabinInputs({ files: f.files, catalog: f.catalog, stores: [f.store], swaps: [{ ...stale, member: 'models/other.glb' }], release: 'cabin-new', work: join(f.root, 'w3') })).rejects.toThrow('no catalog asset');
});

test('tree comparison names changed, added and removed members', () => {
  const a = new Map([['x', Buffer.from('1')], ['y', Buffer.from('2')]]), b = new Map([['x', Buffer.from('1')], ['y', Buffer.from('3')], ['z', Buffer.from('4')]]);
  expect(compareTrees(a, b)).toEqual({ changed: ['y'], added: ['z'], removed: [], unchanged: 1 });
});
