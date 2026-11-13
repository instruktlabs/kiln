// SPDX-License-Identifier: MIT
// The Golden Gate adapter of the scene pack swap tool (site/scripts/scene-pack-swap.mjs): the members that name a
// swapped bridge tier or vehicle are regenerated, and the original stager's licence-lineage rule is kept.
import { describe, expect, test } from 'bun:test';
import { bridgeTriangles, checkLicensedLineage, swapCredits, swapPackJson, swapSceneIndex } from '../../scripts/pack-swap-adapter';

const R = (c: string) => `r_${c.repeat(32)}`;
const OLD_WEB = R('1'), NEW_WEB = R('2'), MID = R('3'), LICENSED = R('4'), LICENSED_PARENT = R('5'), OLD_CAR = R('6'), NEW_CAR = R('7');

/** A GLB with one mesh of `count` triangles drawn by `instances` nodes. */
function glb(count: number, instances: number) {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Root', children: Array.from({ length: instances }, (_, i) => i + 1) }, ...Array.from({ length: instances }, () => ({ mesh: 0 }))],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 3, type: 'VEC3', componentType: 5126 }, { count: count * 3, type: 'SCALAR', componentType: 5123 }] };
  const raw = Buffer.from(JSON.stringify(json)), body = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
  raw.copy(body);
  const out = Buffer.alloc(20 + body.length);
  out.write('glTF'); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(body.length, 12); out.write('JSON', 16); body.copy(out, 20);
  return out;
}
const WEB = glb(5, 3);
const swaps = [
  { member: 'bridge/golden-gate-web.glb', revision: NEW_WEB, sha256: 'b'.repeat(64), bytes: WEB, manifest: { assetId: 'a_bridge', revisionId: NEW_WEB, parentRevision: OLD_WEB }, previous: { revision: OLD_WEB, sha256: 'a'.repeat(64) } },
  { member: 'vehicles/sedan.glb', revision: NEW_CAR, sha256: 'd'.repeat(64), bytes: glb(1, 1), manifest: { assetId: 'generic-sedan', revisionId: NEW_CAR, parentRevision: OLD_CAR }, previous: { revision: OLD_CAR, sha256: 'c'.repeat(64) } },
];
const index = {
  schema: 'golden-gate-scene/1', release: 'g9',
  bridge: { web: { model: 'bridge-web', path: 'bridge/golden-gate-web.glb', assetId: 'a_bridge', revision: OLD_WEB, parentRevision: MID, lineage: [OLD_WEB, MID, LICENSED], bytes: 9, triangles: 1, licence: 'licenses/bridge/golden-gate.ASSET-LICENSE.txt' },
    far: { model: 'bridge-far', path: 'bridge/golden-gate-far.glb', revision: R('8'), lineage: [R('8')] } },
  vehicles: { sedan: { model: 'vehicle-sedan', path: 'vehicles/sedan.glb', asset: 'generic-sedan', revision: OLD_CAR }, suv: { revision: R('9') } },
};
const licence = `Golden Gate Bridge\nSPDX-License-Identifier: CC0-1.0\n\nFix-up 1\n  web   ${LICENSED}  parent ${LICENSED_PARENT}  golden-gate-web.glb\n`;

describe('Golden Gate pack swap adapter', () => {
  test('counts bridge triangles per drawn node, as the staged scene index records them', () => {
    expect(bridgeTriangles(WEB)).toBe(15);
  });

  test('moves a swapped bridge tier to its child: revision, parent, lineage from the child, bytes and triangles', () => {
    const out = swapSceneIndex(index, swaps as never);
    expect(out.bridge.web).toEqual({ ...index.bridge.web, revision: NEW_WEB, parentRevision: OLD_WEB, lineage: [NEW_WEB, OLD_WEB, MID, LICENSED], bytes: WEB.length, triangles: 15 });
    expect(out.bridge.far).toEqual(index.bridge.far);
    expect(out.vehicles.sedan).toEqual({ ...index.vehicles.sedan, revision: NEW_CAR });
    expect(out.vehicles.suv).toEqual(index.vehicles.suv);
    expect(out.release).toBe('g9');
  });

  test('refuses a child whose saved parent is not the sealed revision', () => {
    const orphan = [{ ...swaps[0]!, manifest: { ...swaps[0]!.manifest, parentRevision: MID } }];
    expect(() => swapSceneIndex(index, orphan as never)).toThrow(/parent/);
  });

  test('keeps the stager\'s licence rule: the lineage ends at the revision the licence names, with its parent and file', () => {
    const pin = { revision: LICENSED, parent: LICENSED_PARENT };
    expect(() => checkLicensedLineage(licence, 'golden-gate-web.glb', [NEW_WEB, OLD_WEB, MID, LICENSED], pin)).not.toThrow();
    expect(() => checkLicensedLineage(licence, 'golden-gate-far.glb', [NEW_WEB, OLD_WEB, MID, LICENSED], pin)).toThrow(/licence/);
    expect(() => checkLicensedLineage(licence.replace(LICENSED_PARENT, R('0')), 'golden-gate-web.glb', [NEW_WEB, LICENSED], pin)).toThrow(/licence/);
    expect(() => checkLicensedLineage(licence, 'golden-gate-web.glb', [NEW_WEB, OLD_WEB, MID], pin)).toThrow(/licensed revision/);
    expect(() => checkLicensedLineage(licence, 'golden-gate-web.glb', [NEW_WEB, ...Array.from({ length: 8 }, (_, i) => R(String.fromCharCode(97 + i))), LICENSED], pin)).toThrow(/eight generations/);
  });

  test('renames the bridge credits and source pins, and the file list revisions', () => {
    const credits = [{ name: `Golden Gate Bridge model (web runtime, Kiln revision ${OLD_WEB}, fix-up 1)`, licence: 'CC0-1.0' }, { name: 'Vehicle: sedan', licence: 'CC0-1.0' }];
    expect(swapCredits(credits, swaps as never)).toEqual([{ name: `Golden Gate Bridge model (web runtime, Kiln revision ${NEW_WEB}, fix-up 1)`, licence: 'CC0-1.0' }, credits[1]]);
    const pack = { credits, source: { bridge: { web: OLD_WEB, far: R('8') }, vehicles: ['sedan'] } };
    const next = swapPackJson(structuredClone(pack), swaps as never);
    expect(next.source.bridge).toEqual({ web: NEW_WEB, far: R('8') });
    expect(next.credits[0].name).toContain(NEW_WEB);
    expect(() => swapCredits([{ name: 'Vehicle: sedan' }], swaps as never)).toThrow(/credit/);
  });
});
