import { expect, test } from 'bun:test';
import { Document } from '@gltf-transform/core';
import { createGltfIO } from './gltf-io';
import { compareRevisionGlbs } from './revision-comparison';
import { loadGlbReviewScene } from './views/glb';
import { listCameraSubjects } from './views/camera';
import { renderGLBInProcess as render } from './render';
import { TIERED_CAR, TIERED_CAR_CHAINS } from './__tests__/helpers/lod-fixture';

test('animation-only edits cannot hide behind unchanged static geometry', async () => {
  const code = `function build(){const r=createRoot('Root');const j=createPivot('Joint',[0,0,0],r);createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:j});return r;}
  function animate(){return [createClip('Idle',1,[rotationTrack('Joint_Joint',[{time:0,rotation:[0,0,0]},{time:1,rotation:[0,0,45]}])])];}`;
  const original = await render(code);
  const changed = await render(code.replace('0,0,45', '0,0,90'));
  const comparison = await compareRevisionGlbs(original.glb, changed.glb);
  expect(comparison.summary.changed).toBe(0);
  expect(comparison.animation.summary.changed).toBe(1);
  expect(comparison.animation.changes[0]?.property).toBe('rotation');
  const same = await compareRevisionGlbs(original.glb, original.glb);
  expect(same.animation.summary.unchanged).toBe(1);
});

async function fixture(
  change:
    | 'none'
    | 'geometry'
    | 'move'
    | 'material'
    | 'texture'
    | 'rename'
    | 'duplicate'
    | 'morph'
    | 'scene-title'
    | 'reorder' = 'none',
) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const material = doc.createMaterial('paint').setBaseColorFactor([0.2, 0.4, 0.8, 1]);
  material.setBaseColorTexture(
    doc
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([1, 2, change === 'texture' ? 4 : 3])),
  );
  if (change === 'material') material.setMetallicFactor(0.7);
  const pos = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, change === 'geometry' ? 2 : 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute('POSITION', pos).setMaterial(material);
  if (change === 'morph')
    primitive.addTarget(doc.createPrimitiveTarget().setAttribute('POSITION', pos));
  const part = doc
    .createNode(change === 'rename' ? 'Replacement' : 'Part')
    .setMesh(doc.createMesh().addPrimitive(primitive));
  const root = doc
    .createNode('Root')
    .setScale([2, 3, 1])
    .setTranslation([change === 'move' ? 4 : 0, 1, 0])
    .addChild(part);
  if (change === 'duplicate') root.addChild(doc.createNode('Part'));
  const fixed = doc
    .createNode('Fixed')
    .setMesh(doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos)));
  if (change === 'reorder') root.removeChild(part).addChild(fixed).addChild(part);
  else root.addChild(fixed);
  doc.createScene(change === 'scene-title' ? 'Revised / title' : '').addChild(root);
  return createGltfIO().writeBinary(doc);
}

test('revision comparison uses exported data, stable named paths and precise world bounds', async () => {
  const before = await fixture();
  const same = await compareRevisionGlbs(before, await fixture('reorder'));
  expect(same.summary).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 3 });
  expect(same.changes).toEqual([]);
  expect(same.before.bounds).toEqual({ min: [0, 1, 0], max: [2, 4, 0], size: [2, 3, 0] });
  expect(same.before.glbSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  const moved = await compareRevisionGlbs(before, await fixture('move'));
  const part = moved.changes.find((c) => c.name === 'Part')!;
  expect(part.fields).toEqual(['transform', 'bounds']);
  expect(part.afterBounds!.min).toEqual([4, 1, 0]);
});

test('revision comparison distinguishes geometry, PBR material and texture-byte changes', async () => {
  const before = await fixture();
  for (const change of ['geometry', 'material', 'texture'] as const) {
    const result = await compareRevisionGlbs(before, await fixture(change));
    const part = result.changes.find((c) => c.name === 'Part')!;
    expect(part.fields).toContain(change === 'geometry' ? 'geometry' : 'material');
    expect(part.fields).not.toContain('transform');
    if (change !== 'geometry') expect(part.fields).not.toContain('geometry');
  }
});

test('renames are add/remove, changes paginate without hiding total counts', async () => {
  const result = await compareRevisionGlbs(await fixture(), await fixture('rename'), { limit: 1 });
  expect(result.summary).toEqual({ added: 1, removed: 1, changed: 0, unchanged: 2 });
  expect(result.changes).toHaveLength(1);
  expect(result.nextOffset).toBe(1);
  const end = await compareRevisionGlbs(await fixture(), await fixture('rename'), {
    offset: 1,
    limit: 1,
  });
  expect(end.changes[0]!.status).not.toBe(result.changes[0]!.status);
  expect(end.nextOffset).toBeNull();
});

test('ambiguous identities and unsupported deformation fail explicitly', async () => {
  const before = await fixture();
  await expect(compareRevisionGlbs(before, await fixture('duplicate'))).rejects.toThrow(
    'unique nonempty sibling names',
  );
  await expect(compareRevisionGlbs(before, await fixture('morph'))).rejects.toThrow('morph');
  await expect(compareRevisionGlbs(before, before, { limit: 0 })).rejects.toThrow('page');
});

test('bounds follow referenced vertices, not unused accessor outliers', async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = doc
    .createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 100, 100, 100]));
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(new Uint16Array([0, 1, 2]));
  doc
    .createScene()
    .addChild(
      doc
        .createNode('Triangle')
        .setMesh(
          doc
            .createMesh()
            .addPrimitive(
              doc.createPrimitive().setAttribute('POSITION', positions).setIndices(indices),
            ),
        ),
    );
  const bytes = await createGltfIO().writeBinary(doc);
  expect((await compareRevisionGlbs(bytes, bytes)).after.bounds!.size).toEqual([1, 1, 0]);
});

test('selected subtree reports are complete regardless of unrelated changes or pagination', async () => {
  const before = await fixture();
  const paths = ['/Scene[0]/Root[0]/Fixed[0]', '/Scene[0]/Root[0]/Part[0]'];
  const compared = await compareRevisionGlbs(before, await fixture('material'), {
    paths,
    limit: 1,
    offset: 100,
  });
  expect(compared.changes).toEqual([]);
  expect(compared.subtrees).toMatchObject([
    {
      path: paths[0],
      status: 'unchanged',
      summary: { added: 0, removed: 0, changed: 0, unchanged: 1 },
    },
    { path: paths[1], status: 'changed', summary: { changed: 1 } },
  ]);
  const moved = await compareRevisionGlbs(before, await fixture('move'), { paths: [paths[1]!] });
  expect(moved.subtrees![0]!.status).toBe('changed');
  const renamed = await compareRevisionGlbs(before, await fixture('rename'), {
    paths: ['/Scene[0]/Root[0]', paths[1]!],
  });
  expect(renamed.subtrees).toMatchObject([
    { status: 'changed', summary: { added: 1, removed: 1, unchanged: 2 } },
    { status: 'removed', summary: { removed: 1 } },
  ]);
  for (const invalid of [
    ['/Root[0]/Part[0]'],
    [paths[0]!, paths[0]!],
    [],
    Array(13).fill(paths[0]!),
  ]) {
    await expect(compareRevisionGlbs(before, before, { paths: invalid })).rejects.toThrow();
  }
});

test('comparison paths can be copied directly from exported-scene inspection subjects', async () => {
  const before = await fixture();
  const scene = await loadGlbReviewScene(before);
  const path = listCameraSubjects(scene.root).find((s) => s.node.name === 'Part')!.path;
  expect(path).toBe('/Scene[0]/Root[0]/Part[0]');
  expect((await compareRevisionGlbs(before, before, { paths: [path] })).subtrees![0]!.status).toBe(
    'unchanged',
  );
});

test('scene title changes retain node identity and report both exact inspection paths', async () => {
  const before = await fixture();
  const path = '/Scene[0]/Root[0]/Part[0]';
  const result = await compareRevisionGlbs(before, await fixture('scene-title'), { paths: [path] });
  expect(result.summary).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 3 });
  expect(result.subtrees![0]).toMatchObject({
    path,
    status: 'unchanged',
    beforePath: path,
    afterPath: '/Revised%20%2F%20title[0]/Root[0]/Part[0]',
  });
});

test('an MSFT_lod chain compares every level at the path it takes in LOD0 place', async () => {
  const before = (await render(TIERED_CAR)).glb;
  const same = await compareRevisionGlbs(before, before);
  // Car; five LOD0 nodes with the body's two parts and four tyres; two lower body levels with
  // a part each; four empty wheel levels.
  expect(same.summary).toEqual({
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 1 + (5 + 2 + 4) + 2 * 2 + 4,
  });
  // Headline bounds are LOD0's: the 3 m far block is a level, not part of the drawn asset.
  expect(same.before.bounds!.max[1]).toBeCloseTo(1.5, 6);

  const narrower = TIERED_CAR.replace(
    'boxGeo(4 - lod * 0.5,',
    'boxGeo(lod === 1 ? 3.6 : 4 - lod * 0.5,',
  );
  const changed = await compareRevisionGlbs(before, (await render(narrower)).glb);
  const level = `${TIERED_CAR_CHAINS[0]!.levels[1]!.path}`;
  expect(changed.changes.map((change) => [change.path, change.fields])).toEqual([
    [level, ['bounds']],
    [`${level}/Mesh_Shell1[0]`, ['geometry', 'bounds']],
  ]);
  expect(changed.changes[1]!.afterBounds!.size[0]).toBeCloseTo(3.6, 6);

  // A level sits under LOD0's parent: moving the parent moves every level's bounds.
  const moved = await compareRevisionGlbs(
    before,
    (
      await render(
        TIERED_CAR.replace("createRoot('Car');", "createRoot('Car'); root.position.x = 2;"),
      )
    ).glb,
  );
  const far = moved.changes.find(
    (change) => change.path === TIERED_CAR_CHAINS[0]!.levels[2]!.path,
  )!;
  expect(far.fields).toContain('bounds');
  expect(far.afterBounds!.min[0]! - far.beforeBounds!.min[0]!).toBeCloseTo(2, 6);
  expect(moved.after.bounds!.max[1]).toBeCloseTo(1.5, 6);
});

test('hiding a part is a visibility change, and bounds count what draws', async () => {
  const program = (hide: boolean) => `function build(){
    const r=createRoot('Root');const m=gameMaterial('#888888');
    createPart('Body',boxGeo(1,1,1),m,{parent:r,position:[0,0.5,0]});
    const cover=createPart('Cover',boxGeo(2,0.2,2),m,{parent:r,position:[0,3,0]});
    ${hide ? 'cover.visible=false;' : ''}return r;}`;
  const result = await compareRevisionGlbs(
    (await render(program(false))).glb,
    (await render(program(true))).glb,
  );
  const change = (name: string) => result.changes.find((c) => c.name === name);
  expect(change('Mesh_Cover')!.fields).toEqual(['visibility']);
  // A part's own bounds are where it draws when shown; its ancestors count only what draws.
  expect(change('Mesh_Cover')!.afterBounds).toEqual(change('Mesh_Cover')!.beforeBounds);
  expect(change('Root')!.fields).toEqual(['bounds']);
  expect(change('Mesh_Body')).toBeUndefined();
  expect(result.before.bounds!.max[1]).toBeCloseTo(3.1, 6);
  expect(result.after.bounds!.max[1]).toBeCloseTo(1, 6);
});
