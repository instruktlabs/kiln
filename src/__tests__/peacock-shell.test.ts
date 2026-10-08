import { readFile } from 'node:fs/promises';
import { expect, it } from 'bun:test';
import { FrontSide, type Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveEvaluatorPortV2 } from '../evaluator/protocol';

it('Peacock enamel shell faces outward without double-sided masking', async () => {
  const source = await readFile(
    new URL('./fixtures/mechanical-peacock.kiln.js', import.meta.url),
    'utf8',
  );
  const { glb } = await resolveEvaluatorPortV2(undefined, 'trusted-local').render(source);
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');
  const mesh = scene.getObjectByName('Mesh_BodyShell') as Mesh;
  expect(mesh).toBeDefined();
  expect(Array.isArray(mesh.material)).toBe(false);
  if (Array.isArray(mesh.material)) throw new Error('Expected one enamel material');
  expect(mesh.material.side).toBe(FrontSide);
  const positions = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let inward = 0;
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    a.fromBufferAttribute(positions, index?.getX(i) ?? i);
    b.fromBufferAttribute(positions, index?.getX(i + 1) ?? i + 1);
    c.fromBufferAttribute(positions, index?.getX(i + 2) ?? i + 2);
    const center = a.clone().add(b).add(c).divideScalar(3);
    const normal = b.sub(a).cross(c.sub(a));
    if (center.y * normal.y + center.z * normal.z <= 0) inward++;
  }
  expect(inward).toBe(0);
});
