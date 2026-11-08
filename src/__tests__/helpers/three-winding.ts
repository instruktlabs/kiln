/**
 * What three.js draws for a GLB, without a GPU. CPU rasterization expands every instance to its
 * own matrix, so it cannot show three's per-object winding choice; this helper applies that
 * choice (`WebGLRenderer.renderBufferDirect`, `WebGPUPipelineUtils`: the winding comes from
 * `object.matrixWorld`, never from `instanceMatrix`) to what GLTFLoader actually loads.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

type Face = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** Load a GLB the way a three.js application does and resolve its world matrices. */
export async function loadThreeScene(bytes: Uint8Array): Promise<THREE.Object3D> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  return scene;
}

function instanceMatrices(mesh: THREE.Mesh): THREE.Matrix4[] {
  if (!(mesh as THREE.InstancedMesh).isInstancedMesh) return [new THREE.Matrix4()];
  const instanced = mesh as THREE.InstancedMesh;
  return Array.from({ length: instanced.count }, (_, index) => {
    const matrix = new THREE.Matrix4();
    instanced.getMatrixAt(index, matrix);
    return matrix;
  });
}

/** World triangles of the faces three.js keeps when the camera lies along `toCamera`. */
export function drawnFaces(scene: THREE.Object3D, toCamera: THREE.Vector3Like): Face[] {
  const camera = new THREE.Vector3().copy(toCamera);
  const faces: Face[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material;
    const frontFaceCW = mesh.matrixWorld.determinant() < 0;
    const positions = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : positions.count;
    for (const instance of instanceMatrices(mesh)) {
      const world = mesh.matrixWorld.clone().multiply(instance);
      for (let start = 0; start + 2 < count; start += 3) {
        const corner = (offset: number) =>
          new THREE.Vector3()
            .fromBufferAttribute(positions, index ? index.getX(start + offset) : start + offset)
            .applyMatrix4(world);
        const face: Face = [corner(0), corner(1), corner(2)];
        const towardCamera =
          new THREE.Vector3()
            .subVectors(face[1], face[0])
            .cross(new THREE.Vector3().subVectors(face[2], face[0]))
            .dot(camera) > 0;
        const front = towardCamera !== frontFaceCW;
        if (material.side === THREE.DoubleSide || front === (material.side === THREE.FrontSide))
          faces.push(face);
      }
    }
  });
  return faces;
}

/** Faces of `actual` with no counterpart in `expected`, and the reverse, within `tolerance`. */
export function facesDifference(
  actual: readonly Face[],
  expected: readonly Face[],
  tolerance = 1e-3,
): { extra: number; missing: number } {
  const sameCorner = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b) <= tolerance;
  const sameFace = (a: Face, b: Face) => a.every((p) => b.some((q) => sameCorner(p, q)));
  const unmatched = [...expected];
  let extra = 0;
  for (const face of actual) {
    const match = unmatched.findIndex((candidate) => sameFace(face, candidate));
    if (match < 0) extra += 1;
    else unmatched.splice(match, 1);
  }
  return { extra, missing: unmatched.length };
}

/** Directions that see both sides of an axis-aligned face on all three axes. */
export const REVIEW_DIRECTIONS: readonly THREE.Vector3Like[] = [
  { x: 0.3, y: 0.5, z: 1 },
  { x: -0.3, y: -0.5, z: -1 },
  { x: 1, y: 0.2, z: -0.4 },
  { x: -1, y: -0.2, z: 0.4 },
];

/** The copies an `EXT_mesh_gpu_instancing` InstancedMesh draws wrong-way-round under three. */
export function wronglyWoundInstances(scene: THREE.Object3D): number {
  let wrong = 0;
  scene.traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    for (const instance of instanceMatrices(mesh)) if (instance.determinant() < 0) wrong += 1;
  });
  return wrong;
}
