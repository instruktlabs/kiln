/**
 * Review views of an asset with MSFT_lod chains.
 *
 * A default sheet draws what a loader without the extension draws: LOD0 and the parts outside
 * every set. A shot whose subject names a lower level, by path or by name, draws that level in
 * LOD0's place, and every result says which level each chain drew in each view. The CPU and GPU
 * producers draw the same scene: a default sheet sends both the artifact bytes, and a shot
 * sends both the same derivative bytes.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PbrRenderPort, PbrRenderRequest } from '../composer/render-port';
import { createGltfIO } from '../gltf-io';
import { renderGLBInProcess } from '../render';
import { createKilnProgramToolRegistry, type KilnToolContext } from '../tools/registry';
import { encodePng, loadGlbReviewScene } from '../views';
import { listCameraSubjects } from '../views/camera';
import { loadGlbGeometryFlatScene } from '../views/glb';
import { withSubjectLevel } from '../views/lod';
import { TIERED_CAR, TIERED_CAR_CHAINS } from './helpers/lod-fixture';

const BODY = TIERED_CAR_CHAINS[0]!;
const LOD1 = BODY.levels[1]!.path;
const LOD2 = BODY.levels[2]!.path;

interface ReviewResult {
  ok: boolean;
  error?: string;
  views?: string[];
  cameraShots?: { name: string; subject: { path: string; bounds: { max: number[] } } }[];
  cameraShot?: { subject: { path: string } };
  subjectFrame?: unknown;
  part?: string;
  derivativeReceipts?: { inputGlbSha256: string; rendererId: string }[];
  viewFidelity?: { rendererId: string };
  levelsOfDetail?: { path: string; drawn: number[] }[];
}

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function tool(name: string, context: KilnToolContext = {}) {
  const [definition] = createKilnProgramToolRegistry({
    evaluatorPort: { render: renderGLBInProcess },
    ...context,
  }).filter((candidate) => candidate.name === name);
  return (input: unknown) => definition!.run(input) as Promise<ReviewResult>;
}

/** A GPU stand-in that records each request and answers with blank cells and receipts. */
function fakeGpu(requests: PbrRenderRequest[]): PbrRenderPort {
  return async (request) => {
    requests.push(request);
    const size = request.width ?? request.size ?? 384;
    const png = new Uint8Array(encodePng(new Uint8Array(size * size * 3).fill(90), size, size));
    return {
      ok: true,
      rendererId: 'gpu:lod-test',
      viewsPng: (request.cameras ?? request.viewDirs ?? [[0, 0, 1]]).map(() => png),
      ...(request.cameras
        ? {
            cameras: request.cameras,
            width: request.width,
            height: request.height,
            derivativeFidelity: {
              materialFaithful: true as const,
              inputGlbSha256: sha(request.glb) as `sha256:${string}`,
            },
          }
        : {}),
    };
  };
}

/** Names of the mesh-bearing nodes a loader reaches from the scene, primitive suffix removed. */
async function drawnMeshes(glb: Uint8Array): Promise<string[]> {
  const doc = await createGltfIO().readBinary(glb);
  const names: string[] = [];
  const visit = (node: import('@gltf-transform/core').Node) => {
    if (node.getMesh()) names.push(node.getName().replace(/:primitive-\d+$/, ''));
    for (const child of node.listChildren()) visit(child);
  };
  for (const node of doc.getRoot().getDefaultScene()!.listChildren()) visit(node);
  return names.sort();
}

const drawnByChain = (result: ReviewResult) => result.levelsOfDetail!.map((chain) => chain.drawn);

const SHOTS = {
  version: 'kiln.capture.v1',
  size: 128,
  shots: [
    { name: 'far', subject: { path: LOD2 }, visibility: 'isolate' },
    { name: 'mid', subject: { path: LOD1 } },
    { name: 'near' },
  ],
};

describe('default sheets draw LOD0', () => {
  test('on the CPU and through a GLTFLoader renderer, from the artifact bytes', async () => {
    const glb = (await renderGLBInProcess(TIERED_CAR)).glb;
    const cpu = await tool('kiln_render')({ code: TIERED_CAR });

    expect(cpu.ok).toBe(true);
    expect(cpu.views).toHaveLength(6);
    expect(drawnByChain(cpu)).toEqual(TIERED_CAR_CHAINS.map(() => [0, 0, 0, 0, 0, 0]));
    // The CPU sheet rasterizes the scene: LOD0's two parts and the four tyres.
    expect((await loadGlbGeometryFlatScene(glb)).meshCount).toBe(6);
    // The GPU service and the local viewer load the same bytes with GLTFLoader.
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');
    const loaded: string[] = [];
    gltf.scene.traverse((node) => loaded.push(node.name));
    expect(loaded).toContain('Body_LOD0');
    expect(loaded).not.toContain('Body_LOD1');
    expect(loaded).not.toContain('Body_LOD2');

    const requests: PbrRenderRequest[] = [];
    const gpu = await tool('kiln_render', {
      viewRenderPort: fakeGpu(requests),
      viewRenderRequired: true,
    })({ code: TIERED_CAR });
    expect(gpu.viewFidelity?.rendererId).toBe('gpu:lod-test');
    expect(requests).toHaveLength(1);
    expect(sha(requests[0]!.glb)).toBe(sha(glb));
    expect(drawnByChain(gpu)).toEqual(drawnByChain(cpu));
  });
});

describe('a shot draws the level its subject names', () => {
  test('by path, in LOD0 place, and says which level each chain drew', async () => {
    const result = await tool('kiln_render')({ code: TIERED_CAR, capture: SHOTS });

    expect(result.ok).toBe(true);
    expect(result.cameraShots!.map((shot) => shot.subject.path)).toEqual([
      LOD2,
      LOD1,
      '/Tiered%20Car[0]',
    ]);
    // LOD2 is the 3 m block; LOD1 stands 1.5 m like LOD0.
    expect(result.cameraShots![0]!.subject.bounds.max[1]).toBeCloseTo(3, 6);
    expect(result.cameraShots![1]!.subject.bounds.max[1]).toBeCloseTo(1.5, 6);
    expect(drawnByChain(result)).toEqual([
      [2, 1, 0],
      ...TIERED_CAR_CHAINS.slice(1).map(() => [0, 0, 0]),
    ]);
  });

  test('by a path inside the level or by a name only a level carries', async () => {
    const result = await tool('kiln_render')({
      code: TIERED_CAR,
      capture: {
        version: 'kiln.capture.v1',
        size: 128,
        shots: [
          { subject: { path: `${LOD1}/Mesh_Shell1[0]` } },
          { subject: { name: 'Mesh_Shell2' } },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.cameraShots!.map((shot) => shot.subject.path)).toEqual([
      `${LOD1}/Mesh_Shell1[0]`,
      `${LOD2}/Mesh_Shell2[0]`,
    ]);
    expect(result.levelsOfDetail![0]!.drawn).toEqual([1, 2]);
  });

  test('the CPU and the GPU draw the same derivative bytes for every shot', async () => {
    // Whole receipts (renderer and input bytes per view) are full detail; compact and lean
    // keep only what differs from the viewFidelity summary.
    const cpu = await tool('kiln_render')({ code: TIERED_CAR, capture: SHOTS, detail: 'full' });
    const requests: PbrRenderRequest[] = [];
    const gpu = await tool('kiln_render', { viewRenderPort: fakeGpu(requests) })({
      code: TIERED_CAR,
      capture: SHOTS,
      detail: 'full',
    });

    expect(gpu.derivativeReceipts!.map((receipt) => receipt.rendererId)).toEqual([
      'gpu:lod-test',
      'gpu:lod-test',
      'gpu:lod-test',
    ]);
    expect(gpu.derivativeReceipts!.map((receipt) => receipt.inputGlbSha256)).toEqual(
      cpu.derivativeReceipts!.map((receipt) => receipt.inputGlbSha256),
    );
    expect(drawnByChain(gpu)).toEqual(drawnByChain(cpu));
    const tyres = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].map((w) => `Mesh_Tyre_${w}`);
    expect(await drawnMeshes(requests[0]!.glb)).toEqual(['Mesh_Shell2']);
    expect(await drawnMeshes(requests[1]!.glb)).toEqual(['Mesh_Shell1', ...tyres].sort());
    expect(await drawnMeshes(requests[2]!.glb)).toEqual(
      ['Mesh_Mirror', 'Mesh_Shell0', ...tyres].sort(),
    );
  });

  test('a name two lower levels share is ambiguous; a path picks one', async () => {
    // Two sets whose LOD1 levels each hold a part named Panel.
    const pair = `const meta = { name: 'Pair' };
function build() {
  const root = createRoot('Pair');
  const paint = gameMaterial(0x3366aa);
  for (const [side, x] of [['Left', -2], ['Right', 2]]) {
    const tiers = [0, 1].map((lod) => {
      const group = new THREE.Group();
      group.name = side + '_LOD' + lod;
      group.position.set(x, 0, 0);
      root.add(group);
      createPart(lod === 0 ? side + 'Detail' : 'Panel', boxGeo(1, 1, 1), paint, { parent: group });
      return group;
    });
    defineLod(tiers, { screenCoverage: [0.01, 0.001] });
  }
  return root;
}`;
    const shot = (subject: object) =>
      tool('kiln_render')({
        code: pair,
        capture: { version: 'kiln.capture.v1', size: 128, shots: [{ subject }] },
      });
    const left = '/Pair[0]/Pair[0]/Left_LOD1[0]/Mesh_Panel[0]';
    const right = '/Pair[0]/Pair[0]/Right_LOD1[0]/Mesh_Panel[0]';

    const ambiguous = await shot({ name: 'Mesh_Panel' });
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.error).toContain(
      `ambiguous camera subject: 2 nodes in lower levels of detail match "Mesh_Panel"; choose one path: ${left}, ${right}`,
    );
    const picked = await shot({ path: right });
    expect(picked.ok).toBe(true);
    expect(picked.cameraShots![0]!.subject.path).toBe(right);
    expect(drawnByChain(picked)).toEqual([[0], [1]]);
    // A path under a level that names no node there draws nothing new and reports it missing.
    const missing = await shot({ path: `${right.slice(0, -'/Mesh_Panel[0]'.length)}/Nope[0]` });
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain('missing camera subject');
  });

  test('kiln_inspect frames a lower level through a shot or a legacy part', async () => {
    const inspect = tool('kiln_inspect');
    const shot = await inspect({
      code: TIERED_CAR,
      shot: { subject: { path: LOD2 }, visibility: 'isolate' },
    });
    expect(shot.ok).toBe(true);
    expect(shot.cameraShot!.subject.path).toBe(LOD2);
    expect(shot.subjectFrame).toBeDefined();
    expect(drawnByChain(shot)).toEqual([[2], ...TIERED_CAR_CHAINS.slice(1).map(() => [0])]);

    const legacy = await inspect({ code: TIERED_CAR, part: 'Body_LOD1', isolate: true });
    expect(legacy.ok).toBe(true);
    expect(legacy.part).toBe('Body_LOD1');
    expect(drawnByChain(legacy)).toEqual([[1], ...TIERED_CAR_CHAINS.slice(1).map(() => [0])]);
  });

  test('the review scene is restored after the level draws', async () => {
    const { root } = await loadGlbReviewScene((await renderGLBInProcess(TIERED_CAR)).glb);
    const paths = () => listCameraSubjects(root).map((subject) => subject.path);
    const before = paths();
    expect(before).toContain(BODY.path);
    expect(before).not.toContain(LOD1);

    const during = await withSubjectLevel(root, { path: LOD1 }, async (levels) => {
      expect(levels).toEqual([1, 0, 0, 0, 0]);
      return paths();
    });
    expect(during).toContain(LOD1);
    expect(during).not.toContain(BODY.path);
    expect(paths()).toEqual(before);
    await expect(
      withSubjectLevel(root, { path: LOD1 }, async () => {
        throw new Error('render failed');
      }),
    ).rejects.toThrow('render failed');
    expect(paths()).toEqual(before);
  });
});
