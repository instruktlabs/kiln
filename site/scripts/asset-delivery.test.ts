import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { buildDeliveryArchive, collectHistory, revisionBundle } from './asset-delivery.mjs';
import { hashBytes, verifyArchive } from './mirror-core.mjs';
import { decodeAssetBundle } from '../../src/assets';

const record = (revisionId: string, parentRevision?: string) => {
  const source = Buffer.from(`return '${revisionId}';`);
  return { manifest: { assetId: 'soldier', revisionId, parentRevision, editable: true,
    files: { 'source.kiln.js': { bytes: source.length, sha256: `sha256:${hashBytes(source)}` } } },
    files: { 'source.kiln.js': source } };
};
describe('asset delivery', () => {
  test('includes actual ancestor records, declaring an unavailable parent without fabricating it', async () => {
    const records = new Map([['r_current', record('r_current', 'r_previous')], ['r_previous', record('r_previous', 'r_missing')]]);
    const result = await collectHistory({ collection: 'project', assetId: 'soldier', revisionId: 'r_current' }, async (pin: any) => records.get(pin.revisionId));
    expect(result.records.map((item: any) => item.manifest.revisionId)).toEqual(['r_current', 'r_previous']);
    expect(result.missingParents).toEqual(['r_missing']);
  });
  test('rejects cycles and incorrect collection-qualified identities', async () => {
    await expect(collectHistory({ collection: 'project', assetId: 'soldier', revisionId: 'r_one' }, async () => record('r_one', 'r_one'))).rejects.toThrow('cycle');
    await expect(collectHistory({ collection: 'project', assetId: 'soldier', revisionId: 'r_one' }, async () => record('r_other'))).rejects.toThrow('identity');
  });
  test('archive bytes are deterministic and inventory seals every member', () => {
    const files = { 'sources/b.js': Buffer.from('b'), 'sources/a.js': Buffer.from('a') };
    const first = buildDeliveryArchive({ profile: 'editable', group: 'farm', files });
    const next = buildDeliveryArchive({ profile: 'editable', group: 'farm', files: Object.fromEntries(Object.entries(files).reverse()) });
    expect(first.equals(next)).toBe(true);
    const decoded = unzipSync(first);
    const manifest = JSON.parse(new TextDecoder().decode(decoded['delivery.json']));
    for (const [path, seal] of Object.entries(manifest.files) as [string, any][]) expect(hashBytes(decoded[path])).toBe(seal.sha256);
    expect(Object.keys(manifest.files)).toEqual(['sources/a.js', 'sources/b.js']);
  });
  test('rejects traversal and reserved delivery manifests', () => {
    expect(() => buildDeliveryArchive({ profile: 'editable', group: 'farm', files: { '../secret': Buffer.from('x') } })).toThrow('Unsafe');
    expect(() => buildDeliveryArchive({ profile: 'editable', group: 'farm', files: { 'delivery.json': Buffer.from('x') } })).toThrow('reserved');
  });
  test('editable delivery envelopes verify under the editable download path', () => {
    const bytes = buildDeliveryArchive({ profile: 'editable', group: 'farm', files: { 'revisions/old.zip': Buffer.from('example') } });
    expect(verifyArchive(bytes, 'editable').manifest.profile).toBe('editable');
  });
  test('a nested revision reopens in the actual Kiln decoder with source and metadata intact', () => {
    const source = Buffer.from('return new Group();');
    const encodedJson = Buffer.from('{"asset":{"version":"2.0"}}  ');
    const glb = Buffer.alloc(20 + encodedJson.length);
    glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(encodedJson.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); encodedJson.copy(glb, 20);
    const files = { 'asset.glb': glb, 'source.kiln.js': source };
    const manifest = { version: 'kiln.asset.v1', assetId: 'soldier', revisionId: 'r_current', name: 'Soldier', tags: [],
      createdAt: '2026-10-05T00:00:00.000Z', editable: true, files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: `sha256:${hashBytes(bytes)}` }])) };
    const decoded = decodeAssetBundle(revisionBundle({ manifest, files }));
    expect(decoded[0].manifest).toEqual(manifest);
    expect(Buffer.from(decoded[0].files['source.kiln.js']).equals(source)).toBe(true);
  });
});
