import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  BoxGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { PbrRenderRequest } from '../composer/render-port';
import * as renderModule from '../render';
import { renderReviewDerivativeGlb, renderSceneToGLB } from '../render';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { loadGlbReviewScene } from '../views';
import { encodePng } from '../views/png';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Textures, tangents, a second UV set, a hidden part and a repeated mesh in one artifact. */
function authored(): Group {
  const root = new Group();
  root.name = 'Root';
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    pixels[i * 4] = (i * 7) % 256;
    pixels[i * 4 + 1] = (i * 13) % 256;
    pixels[i * 4 + 2] = (i * 29) % 256;
    pixels[i * 4 + 3] = 255;
  }
  const color = new DataTexture(pixels, 16, 16);
  color.colorSpace = SRGBColorSpace;
  color.wrapS = color.wrapT = RepeatWrapping;
  color.needsUpdate = true;
  const normal = new DataTexture(pixels.slice(), 16, 16);
  normal.needsUpdate = true;
  const geometry = new BoxGeometry(1, 2, 3);
  geometry.setAttribute('uv1', geometry.getAttribute('uv')!.clone());
  const material = new MeshStandardMaterial({ map: color, normalMap: normal, roughness: 0.4 });
  for (const [name, x] of [
    ['Left', -2],
    ['Right', 2],
  ] as const) {
    const part = new Mesh(geometry, material);
    part.name = name;
    part.position.x = x;
    root.add(part);
  }
  const hidden = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#ff0000' }));
  hidden.name = 'Hidden';
  hidden.visible = false;
  root.add(hidden);
  return root;
}

afterEach(() => {
  // Spies must not outlive the test that installed them.
  for (const spy of spies.splice(0)) spy.mockRestore();
});
const spies: { mockRestore(): void }[] = [];

describe('renderReviewDerivativeGlb', () => {
  for (const gltfExporter of ['three', 'legacy'] as const)
    test(`writes the bytes a derivative export writes (${gltfExporter})`, async () => {
      const artifact = (await renderSceneToGLB(authored(), { optimize: 'off' })).bytes;
      const evidence = await loadGlbReviewScene(artifact);
      const bytesOnly = await loadGlbReviewScene(artifact);
      const full = await renderSceneToGLB(evidence.root as never, {
        derivative: true,
        gltfExporter,
      });
      const reviewed = await renderReviewDerivativeGlb(bytesOnly.root as never, { gltfExporter });
      expect(sha(reviewed)).toBe(sha(full.bytes));
    });

  test('refuses a scene with nothing to draw, as the evidence path does', async () => {
    const empty = new Group();
    await expect(renderSceneToGLB(empty, { derivative: true })).rejects.toThrow(
      'no measurable scene',
    );
    await expect(renderReviewDerivativeGlb(empty)).rejects.toThrow('no measurable scene');
    const allHidden = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.visible = false;
    allHidden.add(mesh);
    await expect(renderReviewDerivativeGlb(allHidden)).rejects.toThrow('every triangle is hidden');
  });
});

describe('view cells', () => {
  const code =
    "const meta={name:'pair',category:'prop'};function build(){const r=createRoot('Root');" +
    "createPart('Near',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});" +
    "createPart('Far',boxGeo(1,1,1),gameMaterial('#333333'),{parent:r,position:[3,0,0]});return r;}";
  const port = async (req: PbrRenderRequest) => ({
    ok: true,
    rendererId: 'gpu:test',
    cameras: req.cameras,
    width: req.width,
    height: req.height,
    viewsPng: (req.cameras ?? []).map(() => encodePng(new Uint8Array(128 * 128 * 3), 128, 128)),
    derivativeFidelity: {
      materialFaithful: true as const,
      inputGlbSha256: `sha256:${sha(req.glb)}` as const,
    },
  });

  test('a shot that needs a derivative pays for its bytes only', async () => {
    const evidence = spyOn(renderModule, 'renderSceneToGLB');
    spies.push(evidence);
    const render = createKilnProgramToolRegistry({ viewRenderPort: port }).find(
      (def) => def.name === 'kiln_render',
    )!;
    const out = (await render.run({
      code,
      capture: {
        version: 'kiln.capture.v1',
        size: 128,
        shots: [{ subject: { name: 'Mesh_Near' }, visibility: 'isolate' }],
      },
    })) as { ok: boolean };
    expect(out.ok).toBe(true);
    // The build itself may run in this process; only a derivative export would be waste.
    const derivatives = evidence.mock.calls.filter(([, options]) => options?.derivative === true);
    expect(derivatives).toHaveLength(0);
  });
});
