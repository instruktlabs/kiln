import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PENDING_STATEMENT, checkH7Rights, collectH7Gallery, glbFacts } from './stage-h7-gallery.mjs';

const root = new URL('../../', import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** A GLB with only a JSON chunk: enough for the facts the stager reads. */
function glb(document: object): Buffer {
  let body = Buffer.from(JSON.stringify(document));
  body = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + body.length, 8);
  header.writeUInt32LE(body.length, 12);
  header.write('JSON', 16, 'latin1');
  return Buffer.concat([header, body]);
}

const source = Buffer.from('export default () => {};\n');
function fixture() {
  const models: Record<string, Buffer> = {
    bug: glb({ asset: { version: '2.0' }, extensionsUsed: ['KHR_node_visibility'], animations: [{ name: 'Walk' }, { name: 'Run' }] }),
    'bug-low': glb({ asset: { version: '2.0' }, animations: [{ name: 'Walk' }] }),
  };
  const pin = (id: string, extra = {}) => ({
    id, workspace: 'bug', assetId: `a_${id}`, revisionId: `r_${id}`, sha256: sha(models[id]!), bytes: models[id]!.length,
    sourceSha256: sha(source), ...extra,
  });
  const selection = { id: 'h-7', name: 'H-7', release: 'h7-1', collectionId: 'project', assets: [pin('bug'), pin('bug-low', { partOf: 'bug' })] };
  const names = { assets: { bug: { name: 'Bug', description: 'A bug.' }, 'bug-low': { name: 'Bug, low detail', description: 'The bug with fewer triangles.' } } };
  const record = (id: string) => ({
    files: { 'asset.glb': models[id]!, 'source.kiln.js': source },
    manifest: {
      editable: true, assetId: `a_${id}`, revisionId: `r_${id}`, parentRevision: 'r_parent',
      attribution: { model: 'a-model', harness: 'a-harness' },
      files: {
        'asset.glb': { sha256: `sha256:${sha(models[id]!)}`, bytes: models[id]!.length },
        'source.kiln.js': { sha256: `sha256:${sha(source)}`, bytes: source.length },
      },
      build: {
        dependencies: [] as object[],
        integration: { artifactSha256: sha(models[id]!), bounds: { size: [1, 2, 3] }, renderMetrics: { triangles: 12, uniqueMaterials: 2 } },
      },
    },
  });
  const records = new Map([['bug', record('bug')], ['bug-low', record('bug-low')]]);
  return { selection, names, records, readRevision: async (pin: { id: string }) => records.get(pin.id) };
}

test('a GLB reports its clips and declared extensions', () => {
  expect(glbFacts(glb({ extensionsUsed: ['KHR_x'], animations: [{ name: 'Walk' }, {}] }))).toEqual({ clips: ['Walk'], extensionsUsed: ['KHR_x'] });
  expect(glbFacts(glb({}))).toEqual({ clips: [], extensionsUsed: [] });
  expect(() => glbFacts(Buffer.from('not a glb at all, just text'))).toThrow(/GLB/);
});

test('the selection projects into a catalog with the saved facts, and an extra model keeps the card it ships with', async () => {
  const { selection, names, readRevision } = fixture();
  const catalog = await collectH7Gallery({ selection, names, readRevision });
  expect(catalog).toMatchObject({ id: 'h-7', name: 'H-7', release: 'h7-1' });
  expect(catalog.assets.map((asset: { slug: string }) => asset.slug)).toEqual(['bug', 'bug-low']);
  expect(catalog.assets[0]).toEqual({
    slug: 'bug', name: 'Bug', description: 'A bug.', collection: 'project', assetId: 'a_bug', revisionId: 'r_bug',
    parentRevision: 'r_parent', attribution: { model: 'a-model', harness: 'a-harness' },
    metrics: { triangles: 12, materials: 2, bounds: [1, 2, 3] }, clips: ['Walk', 'Run'], extensionsUsed: ['KHR_node_visibility'],
    runtimeModelDownload: { member: 'models/bug.glb', bytes: selection.assets[0]!.bytes, sha256: selection.assets[0]!.sha256 },
  });
  expect(catalog.assets[1].partOf).toBe('bug');
});

test('a changed model, source, name or dependency stops the stage', async () => {
  const run = async (change: (f: ReturnType<typeof fixture>) => void) => {
    const f = fixture();
    change(f);
    return collectH7Gallery({ selection: f.selection, names: f.names, readRevision: f.readRevision });
  };
  await expect(run((f) => { f.selection.assets[0]!.sha256 = 'a'.repeat(64); })).rejects.toThrow(/bug: saved revision does not match/);
  await expect(run((f) => { f.selection.assets[0]!.sourceSha256 = 'b'.repeat(64); })).rejects.toThrow(/bug: saved revision does not match/);
  await expect(run((f) => { f.records.get('bug')!.files['asset.glb'] = Buffer.from('other'); })).rejects.toThrow(/bug: saved model bytes differ/);
  await expect(run((f) => { delete (f.names.assets as Record<string, unknown>).bug; })).rejects.toThrow(/bug: add its public name/);
  await expect(run((f) => { f.records.get('bug')!.manifest.build.dependencies.push({ resourceId: 'kiln.texture.x' }); })).rejects.toThrow(/third-party/);
  await expect(run((f) => { f.records.delete('bug-low'); })).rejects.toThrow(/bug-low: saved revision/);
  await expect(run((f) => { f.selection.release = 'v2'; })).rejects.toThrow(/identity/);
});

test('an extra model must name a card that exists and has a page of its own', async () => {
  const f = fixture();
  (f.selection.assets[1] as { partOf: string }).partOf = 'nothing';
  await expect(collectH7Gallery(f)).rejects.toThrow(/bug-low: partOf/);
  const g = fixture();
  (g.selection.assets[0] as { partOf?: string }).partOf = 'bug-low';
  await expect(collectH7Gallery(g)).rejects.toThrow(/partOf/);
});

test('the rights record must be a final CC0 decision that pins exactly the selection', () => {
  const { selection } = fixture();
  const decision = { date: '2026-11-13', ownerStatement: 'CC0', spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', scope: 'Models and sources.' };
  const pins = selection.assets.map((asset) => ({
    id: asset.id, assetId: asset.assetId, revisionId: asset.revisionId, sha256: asset.sha256,
    source: { sha256: `sha256:${asset.sourceSha256}`, bytes: source.length },
  }));
  expect(checkH7Rights({ decision, pins }, selection).size).toBe(2);
  expect(() => checkH7Rights({ decision: { ...decision, ownerStatement: PENDING_STATEMENT }, pins }, selection)).toThrow(/still/);
  expect(checkH7Rights({ decision: { ...decision, ownerStatement: PENDING_STATEMENT }, pins }, selection, { allowPendingStatement: true }).size).toBe(2);
  expect(() => checkH7Rights({ decision: { ...decision, spdx: 'MIT' }, pins }, selection)).toThrow(/CC0/);
  expect(() => checkH7Rights({ decision, pins: pins.slice(1) }, selection)).toThrow(/exactly/);
  expect(() => checkH7Rights({ decision, pins: [{ ...pins[0]!, sha256: 'c'.repeat(64) }, pins[1]!] }, selection)).toThrow(/bug: public licence/);
});

test('the checked-in selection, rights, names and gallery taxonomy cover the same assets', () => {
  const selection = json('packs/h-7/selection.json');
  const rights = json('packs/h-7/rights.json');
  const names = json('packs/h-7/names.json');
  const taxonomy = json('site/src/data/gallery-taxonomy.json');
  const ids = selection.assets.map((asset: { id: string }) => asset.id);
  expect(selection).toMatchObject({ id: 'h-7', release: expect.stringMatching(/^h7-[1-9][0-9]*$/) });
  expect(rights.pins.map((pin: { id: string }) => pin.id)).toEqual(ids);
  expect(Object.keys(names.assets)).toEqual(ids);
  expect(rights.dependencies).toEqual([]);
  expect(rights.decision.ownerStatement).toBe('CC0, matching the existing free Kiln packs');
  expect(checkH7Rights(rights, selection).size).toBe(ids.length);
  for (const asset of selection.assets) {
    expect(Boolean(taxonomy.assets[`/gallery/h-7/${asset.id}/`])).toBe(!asset.partOf);
    for (const text of [names.assets[asset.id].name, names.assets[asset.id].description]) expect(text).not.toMatch(/accept|approv|review/i);
  }
  expect(readFileSync(new URL('packs/h-7/THIRD-PARTY-NOTICES.txt', root), 'utf8')).toContain(rights.decision.url);
});
