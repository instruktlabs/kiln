import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createKilnProgramToolRegistry } from '../registry';
import { encodePng } from '../../views/png';

const code = `
function build() {
  const root = new THREE.Group(); root.name = 'Root';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 2,0,0, 0,1,0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); mesh.name = 'Surface';
  const bone = new THREE.Bone(); bone.name = 'Joint'; mesh.add(bone); root.add(mesh);
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  other.name = 'Other'; other.position.x = 5; root.add(other);
  root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([bone])); return root;
}
function animate() {
  return [new THREE.AnimationClip('Turn', 1, [new THREE.QuaternionKeyframeTrack('Joint.quaternion',
    [0,1], [0,0,0,1, 0,0,Math.SQRT1_2,Math.SQRT1_2])])];
}`;

test('isolated animated and double-sided review derivatives keep their skin through the public tool path', async () => {
  const prior = process.env.KILN_GLTF_EXPORTER;
  process.env.KILN_GLTF_EXPORTER = 'three';
  try {
    const captured: Array<{ meshes: number; side: number; vertex: number[] }> = [];
    const tools = createKilnProgramToolRegistry({
      cacheCaptures: false,
      viewRenderRequired: true,
      viewRenderPort: async (request) => {
        const { width, height } = request;
        if (width === undefined || height === undefined)
          throw new Error('Expected rectangular capture dimensions');
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(request.glb).buffer, '');
        let meshes = 0;
        let skin: THREE.SkinnedMesh | undefined;
        loaded.scene.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) meshes++;
          if ((node as THREE.SkinnedMesh).isSkinnedMesh) skin = node as THREE.SkinnedMesh;
        });
        expect(skin).toBeDefined();
        loaded.scene.updateMatrixWorld(true);
        captured.push({
          meshes,
          side: (skin!.material as THREE.Material).side,
          vertex: skin!
            .getVertexPosition(1, new THREE.Vector3())
            .applyMatrix4(skin!.matrixWorld)
            .toArray(),
        });
        return {
          ok: true,
          rendererId: 'gpu:test',
          cameras: request.cameras,
          width,
          height,
          viewsPng: [encodePng(new Uint8Array(width * height * 3), width, height)],
          derivativeFidelity: {
            materialFaithful: true,
            inputGlbSha256: `sha256:${createHash('sha256').update(request.glb).digest('hex')}`,
          },
        };
      },
    });
    const animation = tools.find((tool) => tool.name === 'kiln_screenshot_animation')!;
    const motion = await animation.run({
      code,
      clip: 'Turn',
      frameTimes: [0, 0.5, 1],
      size: 128,
      shot: { subject: { name: 'Surface' }, visibility: 'isolate' },
    });
    expect(motion).toMatchObject({ ok: true });
    expect(captured).toHaveLength(3);
    for (const row of captured) {
      expect(row.meshes).toBe(1);
      expect(row.side).toBe(THREE.FrontSide);
    }
    for (const [i, angle] of [0, Math.PI / 4, Math.PI / 2].entries()) {
      expect(captured[i]!.vertex[0]).toBeCloseTo(2 * Math.cos(angle), 5);
      expect(captured[i]!.vertex[1]).toBeCloseTo(2 * Math.sin(angle), 5);
    }
    captured.length = 0;
    const interior = tools.find((tool) => tool.name === 'kiln_view_interior')!;
    const result = await interior.run({ code, nodeName: 'Other', size: 128 });
    expect(result).toMatchObject({ ok: true });
    expect(captured).toHaveLength(3);
    for (const row of captured) {
      expect(row.meshes).toBe(1);
      expect(row.side).toBe(THREE.DoubleSide);
      expect(row.vertex).toEqual([2, 0, 0]);
    }
    captured.length = 0;
    const again = await animation.run({ code, clip: 'Turn', frameTimes: [0], size: 128 });
    expect(again).toMatchObject({ ok: true });
    expect(captured[0]).toMatchObject({ meshes: 2, side: THREE.FrontSide, vertex: [2, 0, 0] });
  } finally {
    if (prior === undefined) delete process.env.KILN_GLTF_EXPORTER;
    else process.env.KILN_GLTF_EXPORTER = prior;
  }
});
