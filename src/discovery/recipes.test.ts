import { expect, test } from 'bun:test';
import { WebIO } from '@gltf-transform/core';
import * as THREE from 'three';
import sharp from 'sharp';
import {
  MATERIAL_RECIPE_IDS,
  MATERIAL_RECIPE_LIBRARY_V1,
  type MaterialRecipeId,
} from '../material-recipes';
import {
  CHARACTER_BODY_PLANS,
  readCharacterRigGraphV1,
  collectCharacterJointNodes,
  BIPED_RIG_PRESET_V1,
  QUADRUPED_RIG_PRESET_V1,
} from '../character';
import { executeKilnCode, renderSceneToGLB } from '../render';
import { createDiscovery, listDiscoveryEntries } from './index';

const recipes = () => listDiscoveryEntries().filter((e) => e.kind === 'recipe');
test('Discovery publishes every material baseline and body-plan guidance as optional recipes', () => {
  const entries = recipes();
  for (const id of MATERIAL_RECIPE_IDS)
    expect(
      entries.some((e) => e.id === `recipe:material-${id.split('.').slice(2, -1).join('-')}-v1`),
    ).toBe(true);
  for (const plan of CHARACTER_BODY_PLANS)
    expect(entries.some((e) => e.id === `recipe:rig-${plan}-v1`)).toBe(true);
  for (const e of entries) {
    expect(e.recipe.steps.length).toBeGreaterThan(0);
    expect(e.recipe.adaptations.length).toBeGreaterThan(0);
    expect(e.recipe.checks.length).toBeGreaterThan(0);
    expect(e.limitations.length).toBeGreaterThan(0);
  }
});
test('recipe retrieval finds related ordinary language without changing host policy or capabilities', async () => {
  let capabilityReads = 0;
  const query = createDiscovery(async () => {
    capabilityReads++;
    return {};
  });
  for (const [text, id] of [
    ['wooden timber grain', 'recipe:material-wood-v1'],
    ['four legged creature', 'recipe:rig-quadruped-v1'],
    ['transparent glass window', 'recipe:material-glass-v1'],
    ['replaceable multipart support', 'recipe:editable-assembly-v1'],
    ['attached raised vein seam', 'recipe:surface-detail-v1'],
    ['alpha leaf card cutout', 'recipe:foliage-cutout-v1'],
    ['stripes follow a curved rail', 'recipe:directional-sweep-v1'],
  ] as const) {
    const result = await query({ query: text, kind: 'recipe' });
    expect(result.entries.slice(0, 6).map((e) => e.id)).toContain(id);
    const detail = await query({ ids: [id] });
    expect(detail.entries[0]?.kind).toBe('recipe');
  }
  expect(capabilityReads).toBe(0);
});
test('a bare recipe slug selects its recipe and search prints the id materialRecipe takes', async () => {
  const query = createDiscovery(async () => ({}));
  // Dogfood A-A2 / B-A2: agents copy the search id without its kind prefix.
  const bare = await query({ ids: ['material-wood-v1'] });
  expect(bare.error).toBeUndefined();
  expect(bare.entries.map((e) => e.id)).toEqual(['recipe:material-wood-v1']);
  const twice = await query({ ids: ['material-wood-v1', 'recipe:material-wood-v1'] });
  expect(twice.error?.code).toBe('DUPLICATE_ID');
  for (const id of MATERIAL_RECIPE_IDS) {
    const slug = id.split('.').slice(2, -1).join('-');
    const found = await query({ query: `${slug.replace('-', ' ')} material` });
    expect(found.text).toContain(`materialRecipe(${JSON.stringify(id)})`);
  }
});
test('every published recipe example executes in the authoring sandbox and exports cleanly', async () => {
  const entries = recipes();
  expect(entries.length).toBeGreaterThanOrEqual(17);
  for (const e of entries) {
    const { root } = await executeKilnCode(e.recipe.example);
    const output = await renderSceneToGLB(root, { optimize: 'off' });
    expect(output.gltfValidation.issues.numErrors).toBe(0);
    const doc = await new WebIO().readBinary(output.bytes);
    if (e.id.startsWith('recipe:material-')) {
      const id =
        `kiln.material.${e.id.slice('recipe:material-'.length, -3)}.v1` as MaterialRecipeId;
      const material = doc
        .getRoot()
        .listMaterials()
        .find((m) => m.getName() === id)!;
      expect(material).toBeDefined();
      const baseline = MATERIAL_RECIPE_LIBRARY_V1[id].defaults;
      expect(material.getAlphaMode()).toBe(baseline.alphaMode);
      expect(material.getDoubleSided()).toBe(baseline.doubleSided);
      expect(material.getMetallicFactor()).toBeCloseTo(baseline.metallicFactor);
      expect(material.getRoughnessFactor()).toBeCloseTo(baseline.roughnessFactor);
    } else if (e.id.startsWith('recipe:rig-')) {
      const graph = readCharacterRigGraphV1(root);
      expect(graph).toBeDefined();
      expect(
        collectCharacterJointNodes(root)
          .map((j) => j.descriptor.role)
          .sort(),
      ).toEqual(graph!.joints.map((j) => j.role).sort());
      if (graph!.bodyPlan === 'biped') expect(graph).toEqual(BIPED_RIG_PRESET_V1);
      if (graph!.bodyPlan === 'quadruped') expect(graph).toEqual(QUADRUPED_RIG_PRESET_V1);
      const exportedGraph = doc
        .getRoot()
        .listNodes()
        .find((n) => n.getExtras().kilnCharacterRig)
        ?.getExtras().kilnCharacterRig;
      expect(exportedGraph).toEqual(graph);
      const joints = doc
        .getRoot()
        .listNodes()
        .filter((n) => n.getExtras().kilnCharacterJoint);
      expect(joints.length).toBe(graph!.joints.length);
      for (const joint of graph!.joints) {
        const node = joints.find(
          (n) => (n.getExtras().kilnCharacterJoint as { role: string }).role === joint.role,
        )!;
        expect(node.getTranslation()).toEqual(joint.rest.translation);
        if (joint.parentRole)
          expect(
            (node.getParentNode()!.getExtras().kilnCharacterJoint as { role: string }).role,
          ).toBe(joint.parentRole);
      }
    }
  }
});

function constructionExample(id: string): string {
  const entry = recipes().find((recipe) => recipe.id === id);
  expect(entry).toBeDefined();
  return entry!.recipe.example;
}

test('cutout recipe exports alpha-bearing material and UVs without treating its placeholder as production foliage', async () => {
  const source = constructionExample('recipe:foliage-cutout-v1');
  const { root } = await executeKilnCode(source);
  const doc = await new WebIO().readBinary(
    (await renderSceneToGLB(root, { optimize: 'off' })).bytes,
  );
  const material = doc.getRoot().listMaterials()[0]!;
  expect(material.getAlphaMode()).toBe('MASK');
  expect(material.getAlphaCutoff()).toBe(0.5);
  expect(material.getDoubleSided()).toBe(true);
  const { data, info } = await sharp(material.getBaseColorTexture()!.getImage()!)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Array.from(
    { length: info.width * info.height },
    (_, i) => data[i * info.channels + 3]!,
  );
  expect(Math.min(...alpha)).toBeLessThan(128);
  expect(Math.max(...alpha)).toBeGreaterThan(128);
  const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  expect(primitive.getAttribute('TEXCOORD_0')!.getCount()).toBe(
    primitive.getAttribute('POSITION')!.getCount(),
  );
  expect(
    recipes()
      .find((r) => r.id === 'recipe:foliage-cutout-v1')!
      .limitations.join(' '),
  ).toMatch(/placeholder/);
});

test('directional sweep keeps longitudinal UVs and the bound pattern through a bend edit', async () => {
  const source = constructionExample('recipe:directional-sweep-v1');
  const docs = [];
  for (const bend of [0.2, -0.2]) {
    const { root } = await executeKilnCode(
      source.replace('const curveOffset = 0.2;', `const curveOffset = ${bend};`),
    );
    docs.push(
      await new WebIO().readBinary((await renderSceneToGLB(root, { optimize: 'off' })).bytes),
    );
  }
  const first = docs[0]!.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const revised = docs[1]!.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  expect(first.getAttribute('POSITION')!.getArray()).not.toEqual(
    revised.getAttribute('POSITION')!.getArray(),
  );
  expect(first.getAttribute('TEXCOORD_0')!.getArray()).toEqual(
    revised.getAttribute('TEXCOORD_0')!.getArray(),
  );
  expect(first.getMaterial()!.getBaseColorTexture()!.getImage()).toEqual(
    revised.getMaterial()!.getBaseColorTexture()!.getImage(),
  );
  const uv = first.getAttribute('TEXCOORD_0')!;
  const path = Array.from(
    { length: 33 },
    (_, i) => new THREE.Vector3((1.2 * i) / 32, 0.25, 0.2 * Math.sin((2 * Math.PI * i) / 32)),
  );
  const distances = [0];
  for (let i = 1; i < path.length; i++)
    distances.push(distances[i - 1]! + path[i]!.distanceTo(path[i - 1]!));
  for (let station = 0; station < 33; station++) {
    // The example uses 16 profile points plus a duplicated UV seam per station.
    const start = uv.getElement(station * 17, []);
    const end = uv.getElement(station * 17 + 16, []);
    expect(start[0]).toBeCloseTo(0, 6);
    expect(end[0]).toBeCloseTo(1, 6);
    expect(start[1]).toBeCloseTo(distances[station]! / distances.at(-1)!, 6);
    expect(end[1]).toBeCloseTo(start[1]!, 6);
  }
});

test('assembly recipe exports nested replacement roots and isolates a bracket edit', async () => {
  const source = constructionExample('recipe:editable-assembly-v1');
  const baseline = (await executeKilnCode(source)).root;
  const revised = (
    await executeKilnCode(
      source.replace('const replaceSecond = false;', 'const replaceSecond = true;'),
    )
  ).root;
  const exportDoc = async (root: THREE.Object3D) =>
    new WebIO().readBinary((await renderSceneToGLB(root, { optimize: 'off' })).bytes);
  const before = await exportDoc(baseline);
  const after = await exportDoc(revised);
  const find = (doc: typeof before, name: string) =>
    doc
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === name)!;
  const secondName = baseline.children[1]!.name;
  const bracketName = baseline.children[1]!.children[2]!.name;
  const replacedName = baseline.children[1]!.children[2]!.children[0]!.name;
  for (const name of ['Support', secondName]) {
    expect(find(before, name).getParentNode()?.getName()).toBe('EditableSupports');
    expect(find(before, name).listChildren()).toHaveLength(3);
  }
  expect(find(after, bracketName).getParentNode()?.getName()).toBe(secondName);
  expect(find(after, bracketName).listChildren()).toHaveLength(2);
  expect(find(before, bracketName).listChildren()).toHaveLength(1);
  for (const node of before
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh() && node.getName() !== replacedName)) {
    const preserved = find(after, node.getName());
    expect(preserved.getWorldMatrix()).toEqual(node.getWorldMatrix());
    expect(preserved.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!.getArray()).toEqual(
      node.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!.getArray(),
    );
  }
});

test('surface detail shares the exported carrier boundary before and after a width edit', async () => {
  const source = constructionExample('recipe:surface-detail-v1');
  for (const width of [0.8, 1.04]) {
    const { root } = await executeKilnCode(
      source.replace('const width = 0.8;', `const width = ${width};`),
    );
    const doc = await new WebIO().readBinary(
      (await renderSceneToGLB(root, { optimize: 'off' })).bytes,
    );
    const primitive = (name: string) =>
      doc
        .getRoot()
        .listNodes()
        .find((n) => n.getName() === name)!
        .getMesh()!
        .listPrimitives()[0]!;
    const carrier = primitive('Mesh_Carrier');
    const detail = primitive('Mesh_RaisedDetail');
    const positions = carrier.getAttribute('POSITION')!;
    const uv = carrier.getAttribute('TEXCOORD_0')!;
    const detailUV = detail.getAttribute('TEXCOORD_0')!;
    const detailPosition = detail.getAttribute('POSITION')!;
    let boundary = 0,
      raised = 0;
    for (let i = 0; i < detailUV.getCount(); i++) {
      const [u, v] = detailUV.getElement(i, [] as number[]);
      const original = Array.from({ length: uv.getCount() }, (_, index) => index).find((index) => {
        const sample = uv.getElement(index, []);
        return sample[0] === u && sample[1] === v;
      })!;
      expect(original).toBeDefined();
      const distance = new THREE.Vector3()
        .fromArray(detailPosition.getElement(i, []))
        .distanceTo(new THREE.Vector3().fromArray(positions.getElement(original, [])));
      if (u === 15 / 32 || u === 17 / 32 || v === 0 || v === 1) {
        expect(distance).toBeLessThan(1e-7);
        boundary++;
      } else {
        expect(distance).toBeGreaterThan(0);
        expect(distance).toBeLessThanOrEqual(0.015001);
        raised++;
      }
    }
    expect(boundary).toBeGreaterThan(60);
    expect(raised).toBe(31);
    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(1.2, 6);
  }
});
