import { expect, spyOn, test } from 'bun:test';
await import('three');
const { PerspectiveCamera, Scene, Group, Mesh, ACESFilmicToneMapping, SRGBColorSpace } = await import('three/webgpu');
const { float } = await import('three/tsl');
const { buildInteriorAo, interiorAoEnabled, interiorAoBlend, markInteriorOccluders } = await import('../src/interior-ao-pipeline');
import type { WebGPURenderer } from 'three/webgpu';

test('AO candidate includes economical WebGPU sampling and excludes minimal or WebGL', () => {
  expect(interiorAoEnabled('high', 'webgpu')).toBe(true);
  expect(interiorAoEnabled('balanced', 'webgpu')).toBe(true);
  expect(interiorAoEnabled('economy', 'webgpu')).toBe(true);
  expect(interiorAoEnabled('minimal', 'webgpu')).toBe(false);
  for (const tier of ['minimal', 'economy', 'balanced', 'high']) expect(interiorAoEnabled(tier, 'webgl2')).toBe(false);
});

test('economy bounds sampling cost while retaining half-resolution depth-aware blur', () => {
  const renderer = { samples: 4, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace } as WebGPURenderer;
  const built = buildInteriorAo(renderer, new Scene(), new PerspectiveCamera(), float(1), [], 'economy');
  expect(built.ao.samples.value).toBe(8);
  expect(built.ao.resolutionScale).toBe(.5);
  expect(built.ao.blurEnabled).toBe(true);
  built.dispose();
});

test('the filtered prepass has an independent render-list camera with matching projection', () => {
  const renderer = { samples: 4, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace } as WebGPURenderer;
  const camera = new PerspectiveCamera(38, 16 / 9, .15, 2600);
  camera.position.set(-52, 2.8, .1); camera.updateMatrixWorld();
  const built = buildInteriorAo(renderer, new Scene(), camera, float(1));
  expect(built.prePass.camera).not.toBe(camera);
  expect(built.prePass.camera.projectionMatrix.equals(camera.projectionMatrix)).toBe(true);
  expect(built.prePass.camera.matrixWorld.equals(camera.matrixWorld)).toBe(true);
  built.dispose();
});

test('camera transitions are bounded and exterior immediately resumes the direct render path', () => {
  const first = interiorAoBlend(0, 1, 1 / 60);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(.2);
  expect(interiorAoBlend(first, 1, 1 / 60)).toBeGreaterThan(first);
  expect(interiorAoBlend(1, 0, 1 / 60)).toBe(0);
  expect(interiorAoBlend(0, 1, -1)).toBe(0);
  expect(interiorAoBlend(0, 1, 10)).toBe(interiorAoBlend(0, 1, .1));
});

test('occluder scope excludes town and restores only the owned layer bit across rebuilds', () => {
  const cathedral = new Group(), stone = new Mesh(), inherited = new Mesh(), town = new Mesh();
  cathedral.add(stone, inherited); inherited.layers.enable(3); stone.layers.enable(30);
  const restore = markInteriorOccluders([cathedral, stone]);
  expect(stone.layers.isEnabled(3)).toBe(true);
  expect(town.layers.isEnabled(3)).toBe(false);
  // A shadow-cache change after publication must survive AO teardown.
  stone.layers.enable(31); restore(); restore();
  expect(stone.layers.isEnabled(3)).toBe(false);
  expect(stone.layers.isEnabled(0)).toBe(true);
  expect(stone.layers.isEnabled(30)).toBe(true);
  expect(stone.layers.isEnabled(31)).toBe(true);
  expect(inherited.layers.isEnabled(3)).toBe(true);
  const rebuilt = new Mesh(), restoreNew = markInteriorOccluders([rebuilt]);
  expect(rebuilt.layers.isEnabled(3)).toBe(true);
  expect(stone.layers.isEnabled(3)).toBe(false);
  restoreNew(); expect(rebuilt.layers.isEnabled(3)).toBe(false);
});

test('AO uses opaque depth and normals, affects indirect light only, and owns only its render resources', () => {
  const renderer = { samples: 4, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace } as WebGPURenderer;
  const weight = float(1), built = buildInteriorAo(renderer, new Scene(), new PerspectiveCamera(), weight);
  expect(built.prePass.transparent).toBe(false);
  expect(built.prePass.opaque).toBe(true);
  expect(built.ao.resolutionScale).toBe(.5);
  expect(built.ao.radius.value).toBeLessThanOrEqual(.35);
  expect(built.ao.samples.value).toBe(16);
  expect(built.ao.blurEnabled).toBe(true);
  // Direct colour is not multiplied by the AO output. The context supplies only material AO.
  expect(built.pipeline.outputNode).toBe(built.scenePass);
  expect(built.pipeline.outputColorTransform).toBe(true);
  const aoContext = built.scenePass.contextNode!.value as { getAO: (input: unknown, builder: unknown) => unknown };
  const previous = float(.8);
  expect(aoContext.getAO(previous, { material: { transparent: true } })).toBe(previous);
  expect(aoContext.getAO(null, { material: { transparent: false } })).toBe(built.maskedAo);
  const disposals = [built.pipeline, built.prePass, built.scenePass, built.ao].map(node => spyOn(node, 'dispose'));
  const borrowed = spyOn(weight, 'dispose');
  built.dispose(); built.dispose();
  for (const disposed of disposals) expect(disposed).toHaveBeenCalledTimes(1);
  expect(borrowed).not.toHaveBeenCalled();
});
