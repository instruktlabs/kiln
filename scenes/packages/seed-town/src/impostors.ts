/**
 * The trees too far off to walk to, drawn as pictures of the tree kit. The pictures are made here, in
 * the browser, from the kit itself: each form is drawn once from two sides into one texture, with
 * its leaves, turning leaves and bark in separate channels so that every far tree still takes its
 * own three colours. One draw for all of them, however many a town has.
 */
import {
  Color, DoubleSide, Group, InstancedInterleavedBuffer, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial,
  OrthographicCamera, PlaneGeometry, RenderTarget, Scene,
} from 'three/webgpu';
import type { Side, Texture, WebGPURenderer } from 'three/webgpu';
import { cameraPosition, cameraViewMatrix, float, instancedBufferAttribute, normalWorld, positionGeometry, texture, uv, vec2, vec3, vec4 } from 'three/tsl';
import { shows, weights } from './kit-spec';
import type { ParamValues } from './kit-spec';
import type { FarTree, TreeForm } from './outskirts';
import type { Kit } from './town';

/** The tree each form's picture is taken of. A far tree's picture is stretched to its own height and spread. */
export const PORTRAITS: Record<TreeForm, { height: number; spread: number; width: number }> = {
  broad: { height: 12, spread: 8.4, width: 10.4 },
  column: { height: 14, spread: 5, width: 3.6 },
  open: { height: 9, spread: 4.5, width: 6 },
  conifer: { height: 12, spread: 4.8, width: 5.2 },
  shrub: { height: 2.4, spread: 2.8, width: 3.6 },
};
const FORMS = Object.keys(PORTRAITS) as TreeForm[];
/** Two sides of each form, so a wood is not one picture repeated. */
const SIDES = [0.4, 2.5];
const CELL = 256, FOOT = 0.03, HEAD = 1.04, FILL = 0.94;
/** Floats an instance carries: place (x, z, width, height), picture (u, v, width, height), leaf, turning leaf, bark. */
const STRIDE = 17;

/** Where a form's picture lies in the texture, and the size of what it shows, metres. */
export interface Portrait { u: number; v: number; du: number; dv: number; width: number; height: number }

/** The layout of the pictures: a column a form, a row a side. Pure, so it can be checked without a renderer. */
export function portraitLayout(): { columns: number; rows: number; cells: Record<TreeForm, { scale: number; portraits: Portrait[] }> } {
  const columns = FORMS.length, rows = SIDES.length, cells = {} as Record<TreeForm, { scale: number; portraits: Portrait[] }>;
  FORMS.forEach((form, i) => {
    const { height, width } = PORTRAITS[form], tall = height * HEAD, scale = FILL / Math.max(tall, width);
    cells[form] = {
      scale,
      portraits: SIDES.map((_, j) => ({
        u: (i + 0.5 - width * scale / 2) / columns, v: (j + FOOT) / rows, du: width * scale / columns, dv: tall * scale / rows, width, height: tall,
      })),
    };
  });
  return { columns, rows, cells };
}

/** Draw the pictures. Leaves go to red, turning leaves to green and bark to blue, each shaded from above. */
function takePortraits(renderer: WebGPURenderer, tree: Kit): RenderTarget {
  const layout = portraitLayout(), scene = new Scene(), made: MeshBasicNodeMaterial[] = [];
  const channel: Record<string, [number, number, number]> = { leaf: [1, 0, 0], leafAccent: [0, 1, 0], bark: [0, 0, 1] };
  const shade = normalWorld.y.mul(0.3).add(normalWorld.z.mul(0.08)).add(0.62);
  const materials = new Map<string, MeshBasicNodeMaterial>();
  const materialFor = (colour: string, source: { map: Texture | null; alphaTest: number; side: Side }) => {
    const { map } = source, key = `${colour}:${map?.uuid ?? ''}`, existing = materials.get(key);
    if (existing) return existing;
    const material = new MeshBasicNodeMaterial({ fog: false, toneMapped: false, side: source.side });
    const [r, g, b] = channel[colour] ?? [0, 0, 1];
    const detail = map ? texture(map, uv()) : null, lit = vec3(r, g, b).mul(shade).mul(detail ? detail.g.mul(0.6).add(0.4) : float(1));
    // Leaves are cut out of their texture; the picture keeps the gaps.
    material.colorNode = detail && source.alphaTest > 0 ? vec4(lit, detail.a) : lit;
    material.alphaTest = source.alphaTest;
    materials.set(key, material);
    made.push(material);
    return material;
  };
  const influence: number[] = [];
  FORMS.forEach((form, i) => {
    const { height, spread } = PORTRAITS[form], values: ParamValues = { form, height, spread };
    SIDES.forEach((side, j) => {
      const group = new Group();
      group.position.set(i + 0.5, j + FOOT, 0);
      group.scale.setScalar(layout.cells[form].scale);
      group.rotation.y = side;
      for (const part of tree.parts) {
        if (!shows(part.spec, tree.declaration, values)) continue;
        const mesh = new Mesh(part.geometry, materialFor(part.spec.colour ?? 'bark', part.material));
        influence.length = part.spec.targets.length;
        weights(tree.id, part.spec, tree.declaration, values, influence);
        mesh.morphTargetInfluences = [...influence];
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      scene.add(group);
    });
  });
  const camera = new OrthographicCamera(0, layout.columns, layout.rows, 0, 0.1, 200);
  camera.position.set(0, 0, 100);
  camera.updateMatrixWorld();
  const target = new RenderTarget(layout.columns * CELL, layout.rows * CELL, { samples: 4, depthBuffer: true });
  target.texture.name = 'Far tree pictures';
  target.texture.generateMipmaps = true;
  target.texture.minFilter = LinearMipmapLinearFilter;
  target.texture.magFilter = LinearFilter;
  const before = renderer.getRenderTarget(), colour = renderer.getClearColor(new Color()), alpha = renderer.getClearAlpha();
  try {
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(before);
    renderer.setClearColor(colour, alpha);
    scene.clear();
    for (const material of made) material.dispose();
  }
  return target;
}

export interface Impostors {
  /** Whether the pictures have been taken. Until then nothing is drawn. */
  readonly ready: boolean;
  /** Take the pictures, once the renderer can draw. */
  prepare(renderer: WebGPURenderer): void;
  /** Stand a town's far trees. `offset` moves plan coordinates to the scene's. */
  fit(far: readonly FarTree[], offset: readonly [number, number, number]): void;
  readonly count: number;
  dispose(): void;
}

export function createImpostors(parent: Group, tree: Kit, capacity = 8192): Impostors {
  const layout = portraitLayout();
  const data = new Float32Array(capacity * STRIDE), buffer = new InstancedInterleavedBuffer(data, STRIDE);
  // The attribute nodes come untyped; say what each is.
  const four = (offset: number) => instancedBufferAttribute(buffer, 'vec4', STRIDE, offset) as unknown as ReturnType<typeof vec4>;
  const three = (offset: number) => instancedBufferAttribute(buffer, 'vec3', STRIDE, offset) as unknown as ReturnType<typeof vec3>;
  const place = four(0), picture = four(4), leaf = three(8), accent = three(11), bark = three(14);
  // A card one unit wide and one tall, standing on its foot.
  const card = new PlaneGeometry(1, 1);
  card.translate(0, 0.5, 0);
  let target: RenderTarget | null = null, mesh: Mesh | null = null, material: MeshStandardNodeMaterial | null = null, count = 0, disposed = false;
  const tint = new Color();

  const build = (pictures: Texture) => {
    const made = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, side: DoubleSide });
    // The card stands at its tree and turns about the upright to face the eye.
    const foot = vec3(place.x, 0, place.y), away = cameraPosition.sub(foot), flat = vec2(away.x, away.z).normalize();
    const right = vec3(flat.y, 0, flat.x.negate());
    made.positionNode = foot.add(right.mul(positionGeometry.x.mul(place.z))).add(vec3(0, 1, 0).mul(positionGeometry.y.mul(place.w)));
    // Lit as ground-up foliage: mostly from above, a little from the side that faces the eye.
    made.normalNode = vec3(flat.x.mul(0.45), 1, flat.y.mul(0.45)).normalize().transformDirection(cameraViewMatrix);
    // The picture is stored top row first, so a card reads it from the top down.
    const sample = texture(pictures, vec2(picture.x.add(uv().x.mul(picture.z)), float(1).sub(picture.y.add(uv().y.mul(picture.w)))));
    // The picture's colours were thinned by its own edge; divide that back out.
    const cover = sample.a.max(0.001);
    made.colorNode = vec4(leaf.mul(sample.r).add(accent.mul(sample.g)).add(bark.mul(sample.b)).div(cover), sample.a);
    made.alphaTest = 0.42;
    made.name = 'far-trees';
    const cards = new Mesh(card, made);
    cards.name = 'Far trees';
    cards.frustumCulled = false;
    cards.castShadow = false;
    cards.receiveShadow = false;
    cards.count = count;
    cards.visible = count > 0;
    parent.add(cards);
    material = made;
    mesh = cards;
  };

  return {
    get ready() { return target !== null; },
    get count() { return count; },
    prepare(renderer) {
      if (disposed || target) return;
      target = takePortraits(renderer, tree);
      build(target.texture);
    },
    fit(far, offset) {
      count = Math.min(capacity, far.length);
      for (let i = 0; i < count; i++) {
        const one = far[i]!, portrait = PORTRAITS[one.form], sides = layout.cells[one.form].portraits;
        // Which side a tree shows is fixed by where it stands, so it does not change from frame to frame.
        const side = sides[Math.abs(Math.round(one.x * 7 + one.z * 13)) % sides.length]!, at = i * STRIDE;
        data[at] = one.x + offset[0];
        data[at + 1] = one.z + offset[2];
        data[at + 2] = side.width * one.spread / portrait.spread;
        data[at + 3] = side.height * one.height / portrait.height;
        data[at + 4] = side.u;
        data[at + 5] = side.v;
        data[at + 6] = side.du;
        data[at + 7] = side.dv;
        [one.leaf, one.accent, one.bark].forEach((hex, k) => {
          tint.set(hex);
          data[at + 8 + k * 3] = tint.r;
          data[at + 9 + k * 3] = tint.g;
          data[at + 10 + k * 3] = tint.b;
        });
      }
      buffer.needsUpdate = true;
      if (mesh) { mesh.count = count; mesh.visible = count > 0; }
    },
    dispose() {
      disposed = true;
      mesh?.removeFromParent();
      material?.dispose();
      card.dispose();
      target?.dispose();
      target = null;
      mesh = null;
    },
  };
}
