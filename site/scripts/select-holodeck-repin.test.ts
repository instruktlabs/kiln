import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repinHolodeckRevisions } from './select-holodeck.mjs';
import { hashBytes } from './mirror-core.mjs';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const seal = (bytes: Buffer) => ({ bytes: bytes.length, sha256: hashBytes(bytes) });
const id = (prefix: string, digit: string) => `${prefix}_${digit.repeat(32)}`;

/**
 * A Holodeck repository with three commits: parents everywhere, then the Tidemark roof child alone, then every child.
 * The Cove module is shared by the Cove, Tidemark and the Courtyard; the Courtyard pack reads an authoring world whose
 * committed example has the same source revision.
 */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'holodeck-repin-test-')); roots.push(root);
  const holodeck = join(root, 'holodeck'), store = join(root, 'store');
  const git = (...args: string[]) => execFileSync('git', ['-C', holodeck, ...args], { encoding: 'utf8' }).trim();
  await mkdir(holodeck, { recursive: true });
  git('init', '--quiet');
  const structure = id('a', '1'), roof = id('a', '2'), bench = id('a', '3'), palm = id('a', '4');
  const parents = { [structure]: id('r', '1'), [roof]: id('r', '2'), [bench]: id('r', '3') };
  const children = { [structure]: id('r', '5'), [roof]: id('r', '6'), [bench]: id('r', '7') };
  const glbs: Record<string, Buffer> = {}, manifests: Record<string, Buffer> = {};
  for (const assetId of [structure, roof, bench]) {
    for (const [revisionId, parentRevision] of [[parents[assetId], undefined], [children[assetId], parents[assetId]]] as const) {
      const glb = Buffer.from(`glb ${revisionId}`), source = Buffer.from(`// source ${revisionId}`);
      const manifest = Buffer.from(JSON.stringify({ assetId, revisionId, ...(parentRevision ? { parentRevision } : {}), editable: true, files: { 'asset.glb': seal(glb), 'source.kiln.js': seal(source) } }));
      const dir = join(store, assetId, 'revisions', revisionId);
      await mkdir(dir, { recursive: true });
      await Promise.all(Object.entries({ 'manifest.json': manifest, 'asset.glb': glb, 'source.kiln.js': source }).map(([name, bytes]) => writeFile(join(dir, name), bytes)));
      glbs[revisionId] = glb; manifests[revisionId] = manifest;
    }
  }
  const palmGlb = Buffer.from('glb palm');
  const write = async (path: string, bytes: Buffer | string) => { await mkdir(join(holodeck, path, '..'), { recursive: true }); await writeFile(join(holodeck, path), bytes); };
  async function commit(pins: Record<string, string>, message: string) {
    const entry = (worldId: string, assetId: string, revisionId: string) => ({ id: worldId, file: `assets/imports/${worldId}.glb`, provenance: { collection: 'project', assetId, revisionId } });
    const scenes = {
      tidemark: [entry('structure', structure, pins[structure]!), entry('island-palm', palm, id('r', '4')), entry('island-hut-roof', roof, pins[roof]!)],
      courtyard: [entry('structure', structure, pins[structure]!), entry('bench-park', bench, pins[bench]!)],
    };
    for (const [scene, assets] of Object.entries(scenes)) {
      await write(`examples/${scene}/world/world.json`, JSON.stringify({ revision: 0, scene: { assets } }));
      await write(`examples/${scene}/example.json`, JSON.stringify({ id: scene, sourceRevision: scene === 'tidemark' ? 8 : 9 }));
      for (const asset of assets) await write(`examples/${scene}/${asset.file}`, asset.provenance.assetId === palm ? palmGlb : glbs[asset.provenance.revisionId]!);
    }
    await write('assets/cove/modules/structure/provenance.json', JSON.stringify({ collection: 'project', assetId: structure, revisionId: pins[structure] }));
    await write('public/assets/cove-modules/structure.glb', glbs[pins[structure]!]!);
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  }
  const first = await commit(parents, 'Parents');
  const roofOnly = await commit({ ...parents, [roof]: children[roof]! }, 'Roof child');
  const all = await commit(children, 'Every child');

  const record = (store: string, assetId: string, revisionId: string, placements: { pack: string, id: string }[]) => ({ store, collection: 'project', assetId, revisionId, manifest: seal(manifests[revisionId]!), source: seal(Buffer.from(`// source ${revisionId}`)), canonical: seal(glbs[revisionId]!), preview: null, placements });
  const selection = {
    schemaVersion: 1, release: 'holodeck-old', licence: 'CC0-1.0', versions: 'final-only',
    packs: {
      'holodeck-tidemark': { scene: 'tidemark', source: { kind: 'holodeck-example', ref: 'main', commit: first, path: 'examples/tidemark', sourceRevision: 8, worldSha256: '0'.repeat(64) }, assets: ['cove-structure', 'island-palm', 'island-hut-roof'] },
      'holodeck-courtyard': { scene: 'courtyard', source: { kind: 'holodeck-world', revision: 9, worldSha256: '1'.repeat(64) }, assets: ['cove-structure', 'bench-park'] },
      'holodeck-cove': { scene: 'cove', source: { kind: 'holodeck-modules', ref: 'main', commit: first, files: 'assets/cove/modules/*/provenance.json, public/assets/cove-modules/*.glb' }, assets: ['cove-structure'] },
    },
    assets: {
      'cove-structure': record('shared', structure, parents[structure]!, [{ pack: 'holodeck-cove', id: 'structure' }, { pack: 'holodeck-tidemark', id: 'structure' }, { pack: 'holodeck-courtyard', id: 'structure' }]),
      'island-palm': { store: 'unavailable-old-store', collection: 'project', assetId: palm, revisionId: id('r', '4'), manifest: seal(Buffer.from('old manifest')), source: seal(Buffer.from('old source')), canonical: seal(palmGlb), preview: null, placements: [{ pack: 'holodeck-tidemark', id: 'island-palm' }] },
      'island-hut-roof': record('island', roof, parents[roof]!, [{ pack: 'holodeck-tidemark', id: 'island-hut-roof' }]),
      'bench-park': record('plaza', bench, parents[bench]!, [{ pack: 'holodeck-courtyard', id: 'bench-park' }]),
    },
  };
  const revisions = {
    'cove-structure': { from: parents[structure]!, to: children[structure]! },
    'island-hut-roof': { from: parents[roof]!, to: children[roof]! },
    'bench-park': { from: parents[bench]!, to: children[bench]! },
  };
  const options = {
    selection, holodeck, ref: all, revisions, stores: { shared: store }, release: 'holodeck-new',
    packs: [{ id: 'holodeck-tidemark', scene: 'tidemark', expectedAssets: 3 }, { id: 'holodeck-courtyard', scene: 'courtyard', expectedAssets: 2 }, { id: 'holodeck-cove', scene: 'cove', expectedAssets: 1 }],
    presentations: { 'cove-structure': {}, 'island-palm': {}, 'island-hut-roof': {}, 'bench-park': {} },
  };
  return { options, selection, revisions, first, roofOnly, all, glbs, manifests, children, parents, structure, roof, bench, write, git };
}

test('repin moves shared and authoring-world revisions to their children in every pack that lists them, in one update', async () => {
  const f = await fixture(), before = structuredClone(f.selection);
  const result = await repinHolodeckRevisions(f.options);
  expect(f.selection).toEqual(before);
  expect(result.release).toBe('holodeck-new');
  expect(Object.keys(result.assets)).toEqual(Object.keys(before.assets));
  expect(Object.keys(result.packs)).toEqual(Object.keys(before.packs));
  for (const pack of Object.values(result.packs)) expect(pack.assets).toEqual(before.packs[pack.scene === 'cove' ? 'holodeck-cove' : `holodeck-${pack.scene}` as keyof typeof before.packs].assets);
  // A shared record moves once and keeps every placement; an unchanged record keeps its frozen seals and store.
  expect(result.assets['cove-structure']).toEqual({ store: 'shared', collection: 'project', assetId: f.structure, revisionId: f.children[f.structure], parentRevision: f.parents[f.structure], manifest: seal(f.manifests[f.children[f.structure]!]!), source: seal(Buffer.from(`// source ${f.children[f.structure]}`)), canonical: seal(f.glbs[f.children[f.structure]!]!), preview: null, placements: before.assets['cove-structure'].placements });
  expect(result.assets['island-palm']).toEqual(before.assets['island-palm']);
  expect(result.assets['island-hut-roof'].revisionId).toBe(f.children[f.roof]);
  expect(result.assets['bench-park'].revisionId).toBe(f.children[f.bench]);
  // Every re-read scene names the one commit; the Courtyard's authoring world becomes its committed example of the same revision.
  expect(result.packs['holodeck-tidemark'].source).toEqual({ kind: 'holodeck-example', ref: f.all, commit: f.all, path: 'examples/tidemark', sourceRevision: 8, worldSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(result.packs['holodeck-cove'].source).toEqual({ kind: 'holodeck-modules', ref: f.all, commit: f.all, files: before.packs['holodeck-cove'].source.files });
  expect(result.packs['holodeck-courtyard'].source).toEqual({ kind: 'holodeck-example', ref: f.all, commit: f.all, path: 'examples/courtyard', sourceRevision: 9, worldSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(await repinHolodeckRevisions(f.options)).toEqual(result);
});

test('repin refuses a stale map, a missing slug, an unrelated child and a reused release', async () => {
  const f = await fixture();
  await expect(repinHolodeckRevisions({ ...f.options, revisions: { ...f.revisions, 'bench-park': { from: id('r', '9'), to: f.revisions['bench-park'].to } } })).rejects.toThrow('stale');
  await expect(repinHolodeckRevisions({ ...f.options, revisions: { ...f.revisions, 'not-selected': { from: id('r', '1'), to: id('r', '5') } } })).rejects.toThrow('not selected');
  await expect(repinHolodeckRevisions({ ...f.options, revisions: {} })).rejects.toThrow('map');
  await expect(repinHolodeckRevisions({ ...f.options, release: f.selection.release })).rejects.toThrow('new release');
  const unrelated = structuredClone(f.selection); unrelated.assets['bench-park'].revisionId = f.children[f.bench]!;
  await expect(repinHolodeckRevisions({ ...f.options, selection: unrelated, revisions: { ...f.revisions, 'bench-park': { from: f.children[f.bench]!, to: f.parents[f.bench]! } } })).rejects.toThrow('does not descend');
});

test('repin refuses unless every pack it re-reads places exactly the mapped result', async () => {
  const f = await fixture();
  // The scenes at this commit place the children of assets the map leaves out.
  const { 'bench-park': _, ...partial } = f.revisions;
  await expect(repinHolodeckRevisions({ ...f.options, revisions: partial })).rejects.toThrow('bench-park');
  // At the parents' commit the scenes still place what the map moves away from.
  await expect(repinHolodeckRevisions({ ...f.options, ref: f.first })).rejects.toThrow('places');
  // Tidemark alone moves at this commit, so it would leave the Cove's commit behind.
  await expect(repinHolodeckRevisions({ ...f.options, ref: f.roofOnly, revisions: { 'island-hut-roof': f.revisions['island-hut-roof'] } })).rejects.toThrow('Tidemark');
});

test('repin refuses an authoring world whose committed example is another revision', async () => {
  const f = await fixture();
  await f.write('examples/courtyard/example.json', JSON.stringify({ id: 'courtyard', sourceRevision: 10 }));
  f.git('add', '.'); f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Courtyard revision 10');
  await expect(repinHolodeckRevisions({ ...f.options, ref: f.git('rev-parse', 'HEAD') })).rejects.toThrow('authoring-world revision');
});
