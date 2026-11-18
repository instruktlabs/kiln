import { describe, expect, test } from 'bun:test';
import { NodeIO } from '@gltf-transform/core';
import { renderGLB } from '../render';

const wrapBuild = (body: string) => `
const meta = { name: 'Orphans' };
function build() {
  const root = createRoot('Orphans');
  const mat = gameMaterial(0x888888);
  ${body}
  return root;
}
`;

const orphanWarnings = (warnings: string[]) =>
  warnings.filter((w) => w.startsWith('PART_NOT_IN_ASSET'));
const prefixWarnings = (warnings: string[]) =>
  warnings.filter((w) => w.startsWith('NAME_PREFIX_DOUBLED'));

describe('createPart that never joins the asset', () => {
  test('names each part built without a parent and absent from the GLB', async () => {
    const r = await renderGLB(
      wrapBuild(`
  createPart('Kept', boxGeo(1, 1, 1), mat, { parent: root });
  createPart('Lost_A', boxGeo(1, 1, 1), mat, { position: [2, 0, 0] });
  createPart('Lost_B', boxGeo(1, 1, 1), mat, { position: [4, 0, 0], pivot: true });
`),
    );
    const [warning, ...rest] = orphanWarnings(r.warnings);
    expect(rest).toEqual([]);
    expect(warning).toContain('"Lost_A"');
    expect(warning).toContain('"Lost_B"');
    expect(warning).not.toContain('"Kept"');
    expect(warning).toContain('parent: root');
    const doc = await new NodeIO().readBinary(r.glb);
    const names = doc
      .getRoot()
      .listNodes()
      .map((n) => n.getName());
    expect(names).toContain('Mesh_Kept');
    expect(names).not.toContain('Mesh_Lost_A');
  });

  test('is silent when every part ends up under the root', async () => {
    const r = await renderGLB(
      wrapBuild(`
  const arm = createPivot('Arm', [0, 1, 0], root);
  createPart('A', boxGeo(1, 1, 1), mat, { parent: arm });
  const late = createPart('B', boxGeo(1, 1, 1), mat);
  root.add(late);
  const group = new THREE.Group();
  const nested = createPart('C', boxGeo(1, 1, 1), mat, { parent: group });
  root.add(group);
  const moved = createPart('D', boxGeo(1, 1, 1), mat, { pivot: true });
  arm.add(moved);
`),
    );
    expect(orphanWarnings(r.warnings)).toEqual([]);
  });

  test('leaves alone a part that had a parent and was removed, or was handed to a Boolean', async () => {
    const r = await renderGLB(
      wrapBuild(`
  const gone = createPart('Gone', boxGeo(1, 1, 1), mat, { parent: root });
  root.remove(gone);
  const a = createPart('OperandA', boxGeo(1, 1, 1), mat);
  const b = createPart('OperandB', boxGeo(0.5, 2, 0.5), mat);
  const cut = await boolDiff('Cut', a, b);
  root.add(cut);
`).replace('function build()', 'async function build()'),
    );
    expect(orphanWarnings(r.warnings)).toEqual([]);
  });

  test('a long list is cut with a count', async () => {
    const r = await renderGLB(
      wrapBuild(`
  createPart('Kept', boxGeo(1, 1, 1), mat, { parent: root });
  for (let i = 0; i < 9; i++) createPart('Lost_' + i, boxGeo(1, 1, 1), mat);
`),
    );
    const [warning] = orphanWarnings(r.warnings);
    expect(warning).toContain('9 parts');
    expect(warning).toContain('"Lost_0"');
    expect(warning).toContain('and 4 more');
    expect(warning).not.toContain('"Lost_8"');
  });
});

describe('a name that already starts with the prefix the helper adds', () => {
  test('createPivot warns on a Joint_ name and states the resulting node name', async () => {
    const r = await renderGLB(
      wrapBuild(`
  const j = createPivot('Joint_Arm', [0, 0, 0], root);
  createPart('A', boxGeo(1, 1, 1), mat, { parent: j });
`),
    );
    const [warning] = prefixWarnings(r.warnings);
    expect(warning).toContain('createPivot adds the Joint_ prefix itself');
    expect(warning).toContain('1 name already starts');
    expect(warning).toContain('"Joint_Joint_Arm"');
    expect(warning).toContain('"Joint_Arm"');
    expect(warning).toContain('"Arm"');
  });

  test('createPart warns on Mesh_, and on Joint_ only when pivot is set', async () => {
    const r = await renderGLB(
      wrapBuild(`
  createPart('Mesh_Wheel', boxGeo(1, 1, 1), mat, { parent: root });
  createPart('Joint_Door', boxGeo(1, 1, 1), mat, { parent: root, pivot: true });
  createPart('Joint_Plain', boxGeo(1, 1, 1), mat, { parent: root });
`),
    );
    const warnings = prefixWarnings(r.warnings);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('createPart adds the Mesh_ prefix itself');
    expect(warnings[0]).toContain('"Mesh_Mesh_Wheel"');
    expect(warnings[1]).toContain('createPart adds the Joint_ prefix itself');
    expect(warnings[1]).toContain('"Joint_Joint_Door"');
    expect(warnings[1]).not.toContain('Joint_Plain');
  });

  test('many names make one warning that counts the rest', async () => {
    const r = await renderGLB(
      wrapBuild(`
  for (let i = 0; i < 8; i++) createPart('Mesh_Rib' + i, boxGeo(1, 1, 1), mat, { parent: root });
`),
    );
    const warnings = prefixWarnings(r.warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('8 names already start');
    expect(warnings[0]).toContain('and 3 more');
  });

  test('ordinary names produce neither warning', async () => {
    const r = await renderGLB(
      wrapBuild(`
  const j = createPivot('Arm', [0, 0, 0], root);
  createPart('A', boxGeo(1, 1, 1), mat, { parent: j, pivot: true });
`),
    );
    expect(r.warnings).toEqual([]);
  });
});
