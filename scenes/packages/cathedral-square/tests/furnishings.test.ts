import { expect, test } from 'bun:test';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three/webgpu';
import { buildCrucifixPlacements, PEW_PLACEMENTS } from '../src/furnishings';

test('the principal crucifix hangs centrally without its standing base and keeps the corpus and footrest', () => {
  const asset = new Group();
  const cross = new Group(); cross.name = 'Joint_Cross'; asset.add(cross);
  for (const name of ['Mesh_Cross_Post', 'Mesh_Cross_BaseMoulding', 'Mesh_Cross_Suppedaneum']) {
    const part = new Mesh(new BoxGeometry(.1, .2, .1), new MeshStandardMaterial()); part.name = name; cross.add(part);
  }
  const beam = new Mesh(new BoxGeometry(.096, .23, 1.82), new MeshStandardMaterial());
  beam.name = 'Mesh_Cross_Beam'; beam.position.set(-.038, 1.735, 0); cross.add(beam);
  const corpus = new Mesh(new BoxGeometry(.1, 1.5, .8), new MeshStandardMaterial()); corpus.name = 'Mesh_Corpus'; asset.add(corpus);
  const cathedral = new Group();
  const vault = new Mesh(new BoxGeometry(10, .4, 10), new MeshStandardMaterial());
  vault.name = 'Mesh_ChoirVault2_Stone'; vault.position.set(-56.4, 39.6, 0); cathedral.add(vault);
  const result = buildCrucifixPlacements(asset, cathedral);
  expect(result.children).toHaveLength(4);
  expect(result.children[0]!.getObjectByName('Mesh_Corpus')).toBeDefined();
  expect(result.children[0]!.getObjectByName('Mesh_Cross_Suppedaneum')).toBeDefined();
  expect(result.children[0]!.getObjectByName('Mesh_Cross_BaseMoulding')).toBeUndefined();
  expect(result.children[0]!.position.toArray()).toEqual([-56.4, 5.3, 0]);
  const suspension = result.getObjectByName('CrucifixSuspension')!;
  expect(suspension).toBeDefined();
  const cables = suspension.children.filter(node => node.name.endsWith('_Cable')) as Mesh[];
  expect(cables).toHaveLength(2);
  for (const cable of cables) {
    const { lower, upper, upperPart } = cable.userData.suspension;
    expect(upperPart).toBe(vault.name);
    expect(upper[1]).toBeCloseTo(39.4, 5);
    expect(lower[1]).toBeCloseTo(5.3 + (1.735 + .115) * 1.6, 5);
    expect(upper[0]).toBeCloseTo(lower[0], 5);
    expect(upper[2]).toBeCloseTo(lower[2], 5);
    const length = new Vector3(...upper).distanceTo(new Vector3(...lower));
    expect((cable.geometry as import('three/webgpu').CylinderGeometry).parameters.height).toBeCloseTo(length, 5);
  }
  const owned = suspension.children as Mesh[];
  expect(owned.every(mesh => mesh.userData.squareOwned === true)).toBe(true);
  expect(new Set(owned.map(mesh => mesh.geometry)).size).toBe(owned.length);
  expect(new Set(owned.map(mesh => mesh.material)).size).toBe(owned.length);
  for (const wall of result.children.filter(node => node.name.endsWith('WallCross'))) {
    const names: string[] = []; wall.traverse(n => { if ((n as Mesh).isMesh) names.push(n.name); });
    expect(names.sort()).toEqual(['Mesh_Cross_Beam', 'Mesh_Cross_Post']);
  }
  expect(asset.parent).toBeNull();
  expect(asset.getObjectByName('Mesh_Corpus')).toBe(corpus);
  expect(asset.getObjectByName('Mesh_Cross_BaseMoulding')).toBeDefined();
});

test('pews preserve the central aisle and avoid pier-aligned cross passages', () => {
  expect(PEW_PLACEMENTS).toHaveLength(44);
  for (const p of PEW_PLACEMENTS) {
    expect(Math.abs(p.z) - 1.8).toBeCloseTo(1.5);
    expect(p.rotation).toBe(Math.PI);
    for (let k = 0; k <= 11; k++) expect(Math.abs(p.x - (48 - k * 6.6))).toBeGreaterThan(2.39);
  }
  for (let i = 0; i < PEW_PLACEMENTS.length; i++) for (let j = i + 1; j < PEW_PLACEMENTS.length; j++) {
    const a = PEW_PLACEMENTS[i]!, b = PEW_PLACEMENTS[j]!;
    if (a.z === b.z) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(1.79);
  }
});
