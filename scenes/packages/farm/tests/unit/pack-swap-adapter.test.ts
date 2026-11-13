// SPDX-License-Identifier: MIT
// The Farm adapter of the scene pack swap tool (site/scripts/scene-pack-swap.mjs): pack.json's source records the
// parent release and each swapped model as a replacement of its parent revision, in stage-review2.ts's shape.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { regenerate, swapFarmSource } from '../../scripts/pack-swap-adapter';

const R = (c: string) => `r_${c.repeat(32)}`;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const OLD = R('1'), NEW = R('2'), GRAND = R('3');
const manifest = { assetId: 'a_farmer', revisionId: NEW, parentRevision: OLD, description: 'Rowan, child of r_1 with its model unchanged. Flush-face fix: strap box depth 0.047 -> 0.051….' };
const swap = { id: 'farmer', member: 'models/farmer.glb', revision: NEW, sha256: 'b'.repeat(64), bytes: new Uint8Array(4), saved: new Uint8Array([1, 2]), manifest, previous: { revision: OLD, sha256: 'a'.repeat(64) } };
const source = { parentRelease: 'r35', parentPackSha256: 'c'.repeat(64), ownerAccepted: false, projectId: 'farm-pack-review3', projectRevision: 'r_0000000002_x',
  replacements: [{ id: 'farmer', assetId: 'a_farmer', parentRevision: GRAND, revision: OLD, sha256: 'a'.repeat(64), exportProfile: 'runtime', canonicalSha256: 'd'.repeat(64), scope: 'Earlier repair.' }] };

describe('Farm pack swap adapter', () => {
  test('records the parent release and the swapped farmer as a replacement of its parent revision', () => {
    expect(swapFarmSource(source, [swap] as never, { release: 'r36', packJsonSha256: 'e'.repeat(64) })).toEqual({
      parentRelease: 'r36', parentPackSha256: 'e'.repeat(64), ownerAccepted: false,
      replacements: [{ id: 'farmer', assetId: 'a_farmer', parentRevision: OLD, revision: NEW, sha256: 'b'.repeat(64), exportProfile: 'runtime',
        canonicalSha256: createHash('sha256').update(new Uint8Array([1, 2])).digest('hex'), scope: 'Flush-face fix: strap box depth 0.047 -> 0.051' }],
    });
  });

  test('refuses a swap that is not a saved child of the sealed revision', () => {
    expect(() => swapFarmSource(source, [{ ...swap, manifest: { ...manifest, parentRevision: GRAND } }] as never, { release: 'r36', packJsonSha256: 'e'.repeat(64) })).toThrow(/child/);
  });

  test('the hook rewrites only pack.json and declares its lineage history', () => {
    const pack = `${JSON.stringify({ release: 'r36', source }, null, 2)}\n`;
    const out = regenerate({ files: new Map([['assets/pack.json', Buffer.from(pack)]]), manifest: JSON.parse(pack), swaps: [swap] as never, previousRelease: 'r36' });
    expect(out.members).toEqual({});
    expect(Object.keys(out.history)).toEqual(['pack.json']);
    expect(out.packJson(JSON.parse(pack)).source.parentPackSha256).toBe(sha(pack));
  });
});
