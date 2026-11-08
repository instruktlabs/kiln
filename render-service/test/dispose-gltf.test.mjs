import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { disposeGltf } from '../src/dispose-gltf.mjs';

/** A parsed GLB as GLTFLoader returns it: one scene holding one instanced batch. */
function parsed() {
  const geometry = new THREE.BoxGeometry();
  const environment = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(),
    envMap: environment,
  });
  const batch = new THREE.InstancedMesh(geometry, material, 3);
  batch.setColorAt(0, new THREE.Color(0xff0000));
  const scene = new THREE.Group();
  scene.add(batch);
  const disposed = [];
  const watch = (name, resource) => resource.addEventListener('dispose', () => disposed.push(name));
  watch('geometry', geometry);
  watch('material', material);
  watch('map', material.map);
  watch('environment', environment);
  watch('instanceMatrix', batch.instanceMatrix);
  watch('instanceColor', batch.instanceColor);
  return { gltf: { scene, scenes: [scene] }, environment, disposed };
}

// three r187's InstancedMesh.dispose() frees its instance matrix and colour buffers, and the WebGPU attribute manager
// releases a buffer on that event (r186 left both to garbage collection). A batch's instance buffers go with the parse.
test("a request's instanced batch releases its instance buffers with its geometry and material", () => {
  const { gltf, environment, disposed } = parsed();
  disposeGltf(gltf, [environment]);
  assert.deepEqual(disposed.sort(), [
    'geometry',
    'instanceColor',
    'instanceMatrix',
    'map',
    'material',
  ]);
});

test('the shared environment map survives', () => {
  const { gltf, environment, disposed } = parsed();
  disposeGltf(gltf, [environment]);
  assert.ok(!disposed.includes('environment'));
});
