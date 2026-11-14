/**
 * What is drawn outside the town besides the trees themselves: the meadow, the paved roads over it,
 * the fallen leaves and the shade under the trees. Five draws, however many trees or roads a town has.
 */
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Group, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardNodeMaterial, Quaternion, RepeatWrapping, RGBAFormat, UnsignedByteType, Vector3,
} from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import { positionWorld, texture, uniform, uv, vertexColor } from 'three/tsl';
import { grassMottle, GROUND, groundGrit, meadowGeometry, roadGeometry } from './ground';
import type { GroundMesh } from './ground';
import { MEADOW_DRAWN } from './layout';
import type { TownFrame } from './layout';
import type { Outskirts } from './outskirts';
import type { TownPlacement } from './plan/town-plan.js';

function geometryOf(ground: GroundMesh, colorSize: 3 | 4): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(ground.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(ground.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(ground.colors, colorSize));
  geometry.setAttribute('uv', new BufferAttribute(ground.uvs, 2));
  geometry.setIndex(new BufferAttribute(ground.index, 1));
  return geometry;
}

/** A unit disc lying flat whose colour carries how solid it is: 1 in the middle, 0 at the rim. */
function discGeometry(rings: number, segments: number): BufferGeometry {
  const positions = [0, 0, 0], normals = [0, 1, 0], colors = [1, 1, 1, 1], index: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const radius = r / rings, fade = (1 - radius * radius) ** 1.5;
    for (let s = 0; s < segments; s++) {
      const angle = s / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      normals.push(0, 1, 0);
      colors.push(1, 1, 1, fade);
    }
  }
  for (let s = 0; s < segments; s++) index.push(0, 1 + (s + 1) % segments, 1 + s);
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const inner = 1 + (r - 1) * segments, outer = inner + segments, next = (s + 1) % segments;
      index.push(inner + s, inner + next, outer + s, inner + next, outer + next, outer + s);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
  geometry.setIndex(index);
  return geometry;
}

/** How dark a tree's shade is at noon, and the least the sun's height counts for when it is low. */
const SHADE = { depth: 0.46, lift: 0.04, lowSun: 0.16, reach: 2.4 };
/** Fallen leaves lie a little over the grass and under the shade. */
const LITTER = { lift: 0.022, cover: 0.7, tile: 6, earth: '#5e4a2c' };
/** Open ground sees the whole sky, which a street between walls does not: at dusk it is lit this much more. */
const OPEN_SKY = 0.9;
/** The paving kit's textures repeat every this many metres. */
const TILE = { sett: 1, stone: 2 };

interface Standing { x: number; z: number; height: number; width: number }

export interface Country {
  /** Lay the ground for a town. */
  fit(frame: TownFrame, outskirts: Outskirts): void;
  /** Turn the shade to the sun; `dusk` runs 0 by day to 1 at dusk and thins it. */
  light(sun: readonly [number, number, number], dusk: number): void;
  dispose(): void;
}

function repeating(bytes: Uint8Array, size: number): DataTexture {
  const map = new DataTexture(bytes, size, size, RGBAFormat, UnsignedByteType);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

/** `paving` holds the paving kit's own sett and stone textures, so a road wears what the streets wear. */
export function createCountry(parent: Group, paving: { sett: Texture | null; stone: Texture | null }): Country {
  const size = 256, mottle = repeating(grassMottle(size), size), grit = repeating(groundGrit(size), size);
  const open = uniform(1);
  const gritAt = (scale: number) => texture(grit, uv().mul(scale)).g.mul(0.56).add(0.72);

  // The mottling at three scales: broad patches from the air, then tussocks, then soft grain; and
  // sharp grit over it, which the distance averages away. The corners' colours multiply it.
  const meadowMaterial = new MeshStandardNodeMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
  meadowMaterial.colorNode = texture(mottle, uv()).rgb.mul(texture(mottle, uv().mul(11.3)).g.mul(0.42).add(0.76)).mul(texture(mottle, uv().mul(47)).g.mul(0.5).add(0.72))
    .mul(gritAt(GROUND.tile / GROUND.grit)).mul(open);
  meadowMaterial.name = 'meadow';
  const meadow = new Mesh(new BufferGeometry(), meadowMaterial);
  meadow.name = 'Meadow';

  // A road's texture coordinates are metres along and across it.
  const carriageMaterial = new MeshStandardNodeMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  carriageMaterial.colorNode = (paving.sett ? texture(paving.sett, uv().mul(1 / TILE.sett)).rgb : gritAt(1 / GROUND.grit)).mul(open);
  carriageMaterial.name = 'road-setts';
  const carriage = new Mesh(new BufferGeometry(), carriageMaterial);
  carriage.name = 'Road carriageways';

  // Kerbs and shoulders fade into the grass, so they are blended and never write depth.
  const edgingMaterial = new MeshStandardNodeMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
  edgingMaterial.colorNode = (paving.stone ? texture(paving.stone, uv().mul(1 / TILE.stone)).rgb : gritAt(1 / GROUND.grit)).mul(open);
  edgingMaterial.name = 'road-edging';
  const edging = new Mesh(new BufferGeometry(), edgingMaterial);
  edging.name = 'Road kerbs';

  for (const mesh of [meadow, carriage, edging]) {
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  }
  edging.renderOrder = 1;

  // Fallen leaves: a patch under each tree in its own colour, broken into flecks by the grit and
  // thinning toward its rim.
  const litterMaterial = new MeshStandardNodeMaterial({
    color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const fleck = texture(grit, positionWorld.xz.mul(1 / LITTER.tile)).g;
  litterMaterial.colorNode = fleck.mul(0.6).add(0.7).mul(open);
  // Near to, single leaves: a fleck is there or it is not. Far off the grit averages out and the patch is a soft tint.
  litterMaterial.opacityNode = fleck.sub(0.5).mul(7).add(vertexColor().a.mul(0.55).sub(0.08)).clamp(0, 1).mul(LITTER.cover);
  litterMaterial.name = 'fallen-leaves';
  const litterDisc = discGeometry(3, 14);
  let litter: InstancedMesh | null = null, litterCapacity = 0;

  const shadeMaterial = new MeshBasicMaterial({
    color: 0x0b0e16, vertexColors: true, transparent: true, depthWrite: false, fog: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10,
  });
  shadeMaterial.name = 'tree-shade';
  const shadeDisc = discGeometry(3, 18);
  let shade: InstancedMesh | null = null, capacity = 0, standing: Standing[] = [];
  const lit = { sun: [NaN, NaN, NaN], dusk: NaN };
  const matrix = new Matrix4(), position = new Vector3(), turn = new Quaternion(), scale = new Vector3(), up = new Vector3(0, 1, 0), level = new Quaternion(), tint = new Color(), earth = new Color(LITTER.earth);

  const cast = (sun: readonly [number, number, number]) => {
    if (!shade) return;
    const flat = Math.hypot(sun[0], sun[2]), run = flat / Math.max(SHADE.lowSun, sun[1]);
    // Away from the sun along the ground; straight down when the sun is overhead.
    const gx = flat > 1e-6 ? -sun[0] / flat : 1, gz = flat > 1e-6 ? -sun[2] / flat : 0;
    turn.setFromAxisAngle(up, Math.atan2(-gz, gx));
    standing.forEach((tree, i) => {
      const out = Math.min(tree.height * 0.62 * run, tree.height * SHADE.reach), long = tree.width / 2 + Math.min(tree.height * 0.3 * run, tree.height * SHADE.reach * 0.6);
      position.set(tree.x + gx * out, SHADE.lift, tree.z + gz * out);
      scale.set(long, 1, tree.width / 2 * 1.1);
      shade!.setMatrixAt(i, matrix.compose(position, turn, scale));
    });
    shade.instanceMatrix.needsUpdate = true;
  };

  return {
    fit(frame, outskirts) {
      const [ox, , oz] = frame.offset;
      const thresholds = outskirts.thresholds.map(t => ({ ...t, x: t.x + ox, z: t.z + oz }));
      const moved = outskirts.roads.map(road => ({
        ...road, from: [road.from[0] + ox, road.from[1] + oz] as [number, number], points: road.points.map(([x, z]) => [x + ox, z + oz] as [number, number]),
      }));
      const linear = (hex: string) => { tint.set(hex); return [tint.r, tint.g, tint.b]; };
      const built = roadGeometry(moved, linear(outskirts.paving.sett), linear(outskirts.paving.kerb));
      meadow.geometry.dispose();
      meadow.geometry = geometryOf(meadowGeometry(frame, thresholds, MEADOW_DRAWN), 3);
      carriage.geometry.dispose();
      carriage.geometry = geometryOf(built.carriage, 3);
      edging.geometry.dispose();
      edging.geometry = geometryOf(built.edging, 4);

      if (!litter || outskirts.litter.length > litterCapacity) {
        litter?.removeFromParent();
        litter?.dispose();
        litterCapacity = Math.max(16, Math.ceil(outskirts.litter.length * 1.3));
        litter = new InstancedMesh(litterDisc, litterMaterial, litterCapacity);
        litter.name = 'Fallen leaves';
        litter.frustumCulled = false;
        litter.receiveShadow = true;
        litter.renderOrder = 2;
        parent.add(litter);
      }
      const leaves = litter;
      outskirts.litter.forEach((patch, i) => {
        position.set(patch.x + ox, LITTER.lift, patch.z + oz);
        scale.set(patch.radius, 1, patch.radius);
        leaves.setMatrixAt(i, matrix.compose(position, level, scale));
        // Fallen leaves are duller than those still on the tree.
        leaves.setColorAt(i, tint.set(patch.colour).lerp(earth, 0.45).multiplyScalar(0.55 + 0.45 * patch.strength));
      });
      leaves.count = outskirts.litter.length;
      leaves.visible = outskirts.litter.length > 0;
      leaves.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

      standing = outskirts.trees.map((tree: TownPlacement) => {
        const spread = Number(tree.values.spread), column = tree.values.form === 'column';
        return { x: tree.pos[0] + ox, z: tree.pos[2] + oz, height: Number(tree.values.height), width: column ? spread * 0.5 : spread };
      });
      if (!shade || standing.length > capacity) {
        shade?.removeFromParent();
        shade?.dispose();
        capacity = Math.max(16, Math.ceil(standing.length * 1.3));
        shade = new InstancedMesh(shadeDisc, shadeMaterial, capacity);
        shade.name = 'Tree shade';
        shade.frustumCulled = false;
        shade.renderOrder = 3;
        parent.add(shade);
      }
      shade.count = standing.length;
      shade.visible = standing.length > 0;
      lit.sun = [NaN, NaN, NaN];
    },
    light(sun, dusk) {
      if (sun[0] !== lit.sun[0] || sun[1] !== lit.sun[1] || sun[2] !== lit.sun[2]) {
        lit.sun = [sun[0], sun[1], sun[2]];
        cast(sun);
      }
      if (dusk !== lit.dusk) {
        lit.dusk = dusk;
        shadeMaterial.opacity = SHADE.depth * (1 - 0.45 * dusk);
        open.value = 1 + OPEN_SKY * dusk;
      }
    },
    dispose() {
      for (const mesh of [meadow, carriage, edging]) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      for (const mesh of [shade, litter]) { mesh?.removeFromParent(); mesh?.dispose(); }
      shadeDisc.dispose();
      litterDisc.dispose();
      for (const material of [meadowMaterial, carriageMaterial, edgingMaterial, litterMaterial, shadeMaterial]) material.dispose();
      mottle.dispose();
      grit.dispose();
    },
  };
}
