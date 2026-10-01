import { AnimationClip, BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import fixture from '../../fixtures/placements.json';

interface NodeFixture { name: string; mesh: boolean; children: NodeFixture[] }
/** Frozen real node names/topology and real clip durations; geometry is irrelevant to placement tests. */
export function fixturePack() {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  function node(value: NodeFixture): Group | Mesh {
    const object = value.mesh ? new Mesh(geometry, material) : new Group(); object.name = value.name;
    for (const child of value.children) object.add(node(child)); return object;
  }
  const models = new Map<string, GLTF>();
  for (const [id, value] of Object.entries(fixture.models)) {
    const scene = node(value.scene) as Group;
    models.set(id, { scene, scenes: [scene], animations: value.clips.map(c => new AnimationClip(c.name, c.duration, [])), cameras: [], asset: { version: '2.0' }, parser: {} } as GLTF);
  }
  return { pack: { models } as LoadedPack, dispose() { geometry.dispose(); material.dispose(); } };
}
