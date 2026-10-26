import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendHolodeckExample, repointHolodeckExample } from './select-holodeck.mjs';
import { hashBytes } from './mirror-core.mjs';
import { holodeckSlug } from './holodeck-spec.mjs';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const seal = (bytes: Buffer) => ({ bytes: bytes.length, sha256: hashBytes(bytes) });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'holodeck-selection-test-')); roots.push(root);
  const holodeck = join(root, 'holodeck'), store = join(root, 'store');
  const example = 'winter-mountainside-cabin', packId = `holodeck-${example}`;
  const exampleDir = join(holodeck, 'examples', example);
  await mkdir(join(exampleDir, 'world'), { recursive: true });
  await mkdir(join(exampleDir, 'assets/imports'), { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', holodeck, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  const shared = Buffer.from('fixture shared canonical GLB'), cabin = Buffer.from('fixture new canonical GLB');
  const source = Buffer.from('// synthetic test source'), material = Buffer.from('{"fixture":true}');
  const sharedId = 'a_' + '1'.repeat(32), sharedRevision = 'r_' + '1'.repeat(32);
  const assetId = 'a_' + '2'.repeat(32), revisionId = 'r_' + '2'.repeat(32);
  const files = { 'asset.glb': seal(cabin), 'source.kiln.js': seal(source) };
  const manifest = Buffer.from(JSON.stringify({ assetId, revisionId, editable: true, files, build: { dependencies: [{ kind: 'kiln.material.v2' }] } }));
  const revisionDir = join(store, assetId, 'revisions', revisionId);
  await mkdir(revisionDir, { recursive: true });
  await Promise.all(Object.entries({ 'manifest.json': manifest, 'asset.glb': cabin, 'source.kiln.js': source, 'materials.kiln.json': material }).map(([name, bytes]) => writeFile(join(revisionDir, name), bytes)));
  const assets = [
    { id: 'structure', file: 'assets/imports/shared.glb', provenance: { collection: 'project', assetId: sharedId, revisionId: sharedRevision } },
    { id: 'cabin-shell', file: 'assets/imports/cabin.glb', provenance: { collection: 'project', assetId, revisionId } },
  ];
  await writeFile(join(exampleDir, 'world/world.json'), JSON.stringify({ revision: 0, scene: { assets } }));
  await writeFile(join(exampleDir, 'example.json'), JSON.stringify({ id: example, sourceRevision: 17 }));
  await writeFile(join(exampleDir, assets[0].file), shared);
  await writeFile(join(exampleDir, assets[1].file), cabin);
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture example');
  const ref = git('rev-parse', 'HEAD');
  const selection = {
    schemaVersion: 1, release: 'holodeck-old', licence: 'CC0-1.0', versions: 'final-only',
    packs: { 'holodeck-cove': { scene: 'cove', source: { commit: 'old-pinned-commit' }, assets: ['cove-structure'] } },
    assets: { 'cove-structure': { store: 'unavailable-old-store', collection: 'project', assetId: sharedId, revisionId: sharedRevision, canonical: seal(shared), manifest: seal(Buffer.from('old-manifest')), source: seal(Buffer.from('old-source')), preview: null, placements: [{ pack: 'holodeck-cove', id: 'structure' }] } },
  };
  const options = {
    selection, holodeck, ref, example, stores: { winter: store }, release: 'holodeck-new',
    packs: [{ id: packId, scene: example, expectedAssets: 2 }],
    presentations: { 'cove-structure': { name: 'Shared' }, 'winter-cabin-shell': { name: 'Cabin' } },
  };
  return { options, selection, git, exampleDir, revisionDir, material, manifest, packId };
}

test('append reads the committed example, preserves prior packs and sources, and seals new editable material dependencies', async () => {
  const f = await fixture(), before = structuredClone(f.selection);
  // The working file is deliberately changed: selection must read the requested commit.
  await writeFile(join(f.exampleDir, 'world/world.json'), '{}');
  const result = await appendHolodeckExample(f.options);
  expect(f.selection).toEqual(before);
  expect(result.release).toBe('holodeck-new');
  expect(result.packs['holodeck-cove']).toEqual(before.packs['holodeck-cove']);
  expect(result.assets['cove-structure']).toEqual({ ...before.assets['cove-structure'], placements: [...before.assets['cove-structure'].placements, { pack: f.packId, id: 'structure' }] });
  expect(result.packs[f.packId]).toMatchObject({ scene: f.options.example, source: { kind: 'holodeck-example', commit: f.options.ref, sourceRevision: 17 }, assets: ['cove-structure', 'winter-cabin-shell'] });
  expect(result.assets['winter-cabin-shell']).toMatchObject({ store: 'winter', collection: 'project', manifest: seal(f.manifest), materials: seal(f.material), placements: [{ pack: f.packId, id: 'cabin-shell' }] });
  expect(await appendHolodeckExample(f.options)).toEqual(result);
});

test('append requires a new release, a configured pack, and an exact inventory', async () => {
  const { options } = await fixture();
  await expect(appendHolodeckExample({ ...options, release: options.selection.release })).rejects.toThrow('new release');
  await expect(appendHolodeckExample({ ...options, packs: [] })).rejects.toThrow('configured pack');
  await expect(appendHolodeckExample({ ...options, packs: [{ ...options.packs[0], expectedAssets: 3 }] })).rejects.toThrow('expected 3');
  await expect(appendHolodeckExample({ ...options, presentations: {} })).rejects.toThrow('gallery presentation');
});

test('append refuses replacement of existing packs and conflicting shared identities', async () => {
  const { options, selection, packId } = await fixture();
  await expect(appendHolodeckExample({ ...options, selection: { ...selection, packs: { ...selection.packs, [packId]: {} } } })).rejects.toThrow('already selected');
  const changed = structuredClone(selection); changed.assets['cove-structure'].revisionId = 'r_' + '9'.repeat(32);
  await expect(appendHolodeckExample({ ...options, selection: changed })).rejects.toThrow('shared revision');
  const changedHash = structuredClone(selection); changedHash.assets['cove-structure'].canonical.sha256 = '0'.repeat(64);
  await expect(appendHolodeckExample({ ...options, selection: changedHash })).rejects.toThrow('canonical');
});

test('append rejects a changed shared revision even when the example renames the asset', async () => {
  const { options, selection } = await fixture();
  const previousPack = 'holodeck-earlier-cabin';
  const previous = {
    ...selection,
    packs: { ...selection.packs, [previousPack]: { scene: 'earlier-cabin', source: { commit: 'old-pinned-commit' }, assets: ['earlier-cabin-shell'] } },
    assets: {
      ...selection.assets,
      'earlier-cabin-shell': {
        ...selection.assets['cove-structure'],
        assetId: 'a_' + '2'.repeat(32), revisionId: 'r_' + '3'.repeat(32),
        placements: [{ pack: previousPack, id: 'old-cabin-shell' }],
      },
    },
  };
  const before = structuredClone(previous);
  await expect(appendHolodeckExample({ ...options, selection: previous })).rejects.toThrow('shared revision');
  expect(previous).toEqual(before);
});

test('append rejects changed saved source before producing any selection', async () => {
  const { options, revisionDir } = await fixture();
  await writeFile(join(revisionDir, 'source.kiln.js'), '// modified');
  await expect(appendHolodeckExample(options)).rejects.toThrow();
  expect(JSON.parse(await readFile(join(revisionDir, 'manifest.json'), 'utf8')).assetId).toBe('a_' + '2'.repeat(32));
});

test('winter gallery slugs share only the established Cove modules', () => {
  expect(holodeckSlug('holodeck-winter-mountainside-cabin', 'structure')).toBe('cove-structure');
  expect(holodeckSlug('holodeck-winter-mountainside-cabin', 'cabin-shell')).toBe('winter-cabin-shell');
  expect(holodeckSlug('holodeck-crescent-cove', 'shelter')).toBe('crescent-shelter');
});

async function repointFixture() {
  const root = await mkdtemp(join(tmpdir(), 'holodeck-repoint-test-')); roots.push(root);
  const holodeck = join(root, 'holodeck'), store = join(root, 'store');
  const example = 'crescent-cove', packId = `holodeck-${example}`;
  const exampleDir = join(holodeck, 'examples', example);
  await mkdir(join(exampleDir, 'world'), { recursive: true });
  await mkdir(join(exampleDir, 'assets/imports'), { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', holodeck, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  const shared = Buffer.from('fixture shared canonical GLB'), shell = Buffer.from('fixture unchanged canonical GLB');
  const sharedId = 'a_' + '1'.repeat(32), sharedRevision = 'r_' + '1'.repeat(32);
  const shellId = 'a_' + '4'.repeat(32), shellRevision = 'r_' + '4'.repeat(32);
  const palmId = 'a_' + '2'.repeat(32), staged = 'r_' + '2'.repeat(32), next = 'r_' + '3'.repeat(32);
  const revisions: Record<string, { glb: Buffer, manifest: Buffer }> = {};
  for (const [revisionId, parentRevision] of [[staged, undefined], [next, staged]] as const) {
    const glb = Buffer.from(`fixture palm ${revisionId}`), source = Buffer.from(`// palm ${revisionId}`);
    const manifest = Buffer.from(JSON.stringify({ assetId: palmId, revisionId, ...(parentRevision ? { parentRevision } : {}), editable: true, files: { 'asset.glb': seal(glb), 'source.kiln.js': seal(source) } }));
    const dir = join(store, palmId, 'revisions', revisionId);
    await mkdir(dir, { recursive: true });
    await Promise.all(Object.entries({ 'manifest.json': manifest, 'asset.glb': glb, 'source.kiln.js': source }).map(([name, bytes]) => writeFile(join(dir, name), bytes)));
    revisions[revisionId] = { glb, manifest };
  }
  const assets = [
    { id: 'structure', file: 'assets/imports/shared.glb', provenance: { collection: 'project', assetId: sharedId, revisionId: sharedRevision } },
    { id: 'shell', file: 'assets/imports/shell.glb', provenance: { collection: 'project', assetId: shellId, revisionId: shellRevision } },
    { id: 'palm', file: 'assets/imports/palm.glb', provenance: { collection: 'project', assetId: palmId, revisionId: next } },
  ];
  await writeFile(join(exampleDir, 'world/world.json'), JSON.stringify({ revision: 0, scene: { assets } }));
  await writeFile(join(exampleDir, 'example.json'), JSON.stringify({ id: example, sourceRevision: 17 }));
  await writeFile(join(exampleDir, assets[0].file), shared);
  await writeFile(join(exampleDir, assets[1].file), shell);
  await writeFile(join(exampleDir, assets[2].file), revisions[next].glb);
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture revision 17');
  const ref = git('rev-parse', 'HEAD');
  const record = (assetId: string, revisionId: string, canonical: Buffer, placements: { pack: string, id: string }[]) => ({ store: 'unavailable-old-store', collection: 'project', assetId, revisionId, manifest: seal(Buffer.from(`old manifest ${revisionId}`)), source: seal(Buffer.from(`old source ${revisionId}`)), canonical: seal(canonical), preview: null, placements });
  const selection = {
    schemaVersion: 1, release: 'holodeck-old', licence: 'CC0-1.0', versions: 'final-only',
    packs: {
      'holodeck-cove': { scene: 'cove', source: { commit: 'old-pinned-commit' }, assets: ['cove-structure'] },
      [packId]: { scene: example, source: { kind: 'holodeck-example', ref: 'unpushed', commit: 'unpushed', path: `examples/${example}`, sourceRevision: 16, worldSha256: '0'.repeat(64) }, assets: ['cove-structure', 'crescent-shell', 'crescent-palm'] },
    },
    assets: {
      'cove-structure': record(sharedId, sharedRevision, shared, [{ pack: packId, id: 'structure' }, { pack: 'holodeck-cove', id: 'structure' }]),
      'crescent-shell': record(shellId, shellRevision, shell, [{ pack: packId, id: 'shell' }]),
      'crescent-palm': { ...record(palmId, staged, revisions[staged].glb, [{ pack: packId, id: 'palm' }]), store: 'tropical', manifest: seal(revisions[staged].manifest) },
    },
  };
  const options = {
    selection, holodeck, ref, example, stores: { tropical: store }, release: 'holodeck-new',
    packs: [{ id: 'holodeck-cove', scene: 'cove', expectedAssets: 1 }, { id: packId, scene: example, expectedAssets: 3 }],
    presentations: { 'cove-structure': { name: 'Shared' }, 'crescent-shell': { name: 'Shell' }, 'crescent-palm': { name: 'Palm' } },
  };
  return { options, selection, packId, palmId, next, staged, revisions };
}

test('repoint moves a selected example to a newer commit and replaces only the revisions it changed', async () => {
  const f = await repointFixture(), before = structuredClone(f.selection);
  const result = await repointHolodeckExample(f.options);
  expect(f.selection).toEqual(before);
  expect(result.release).toBe('holodeck-new');
  expect(Object.keys(result.packs)).toEqual(Object.keys(before.packs));
  expect(result.packs['holodeck-cove']).toEqual(before.packs['holodeck-cove']);
  expect(result.packs[f.packId]).toEqual({ scene: 'crescent-cove', source: { kind: 'holodeck-example', ref: f.options.ref, commit: f.options.ref, path: 'examples/crescent-cove', sourceRevision: 17, worldSha256: expect.any(String) }, assets: ['cove-structure', 'crescent-shell', 'crescent-palm'] });
  // Unchanged and shared records keep their frozen seals, stores and order, even ones no local store holds.
  expect(Object.keys(result.assets)).toEqual(Object.keys(before.assets));
  expect(result.assets['cove-structure']).toEqual(before.assets['cove-structure']);
  expect(result.assets['crescent-shell']).toEqual(before.assets['crescent-shell']);
  expect(result.assets['crescent-palm']).toMatchObject({ store: 'tropical', assetId: f.palmId, revisionId: f.next, parentRevision: f.staged, manifest: seal(f.revisions[f.next].manifest), canonical: seal(f.revisions[f.next].glb), placements: [{ pack: f.packId, id: 'palm' }] });
  expect(await repointHolodeckExample(f.options)).toEqual(result);
});

test('repoint refuses unselected packs, stale releases and source revisions, changed shared revisions and unrelated revisions', async () => {
  const f = await repointFixture();
  const otherPacks = { 'holodeck-cove': f.selection.packs['holodeck-cove'] };
  await expect(repointHolodeckExample({ ...f.options, selection: { ...f.selection, packs: otherPacks } })).rejects.toThrow('not selected');
  await expect(repointHolodeckExample({ ...f.options, release: f.selection.release })).rejects.toThrow('new release');
  const newer = structuredClone(f.selection); newer.packs[f.packId].source.sourceRevision = 18;
  await expect(repointHolodeckExample({ ...f.options, selection: newer })).rejects.toThrow('source revision cannot go backward');
  const shared = structuredClone(f.selection); shared.assets['cove-structure'].revisionId = 'r_' + '9'.repeat(32);
  await expect(repointHolodeckExample({ ...f.options, selection: shared })).rejects.toThrow('shared revision');
  const unrelated = structuredClone(f.selection); unrelated.assets['crescent-palm'].revisionId = 'r_' + '8'.repeat(32);
  await expect(repointHolodeckExample({ ...f.options, selection: unrelated })).rejects.toThrow('does not descend');
});


test('repoint accepts a committed asset repair without inventing an authoring-world revision', async () => {
  const f = await repointFixture();
  const selection = structuredClone(f.selection);
  selection.packs[f.packId].source.sourceRevision = 17;
  const result = await repointHolodeckExample({ ...f.options, selection });
  expect(result.packs[f.packId].source.sourceRevision).toBe(17);
  expect(result.assets['crescent-palm'].parentRevision).toBe(f.staged);
  const repeated = { ...f.options, selection: result, release: 'holodeck-next-maintenance' };
  await expect(repointHolodeckExample(repeated)).rejects.toThrow('newer committed example');
});
