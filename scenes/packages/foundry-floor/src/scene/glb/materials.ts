// SPDX-License-Identifier: MIT
// The node materials every baked group shares: the material arrives as vertex data (bake.ts), so four materials draw
// the whole fab. Tinted groups also read a per-instance `ffTint` (rgb, strength) that replaces the colour of the
// vertices flagged with the entity's tint material (lot class on FOUPs, synthetic traffic on vehicles).
//
// Instancing is the material's, not three's InstancedMesh: each instance's matrix arrives as four instanced vec4
// attributes (INSTANCE_COLUMNS, written by entity-set.ts) on a plain Mesh. three 0.186 gives every InstancedMesh of at
// most 1,024 instances a uniform buffer named after its node id and adds the mesh's uuid to the material cache key, so
// each instanced mesh would build and link its own program (sim-spec 11: at most 32 programs; SPEC INV 4.4). Plain
// meshes with the same material and attribute layout share one node build, one program pair and one pipeline.
import { FrontSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import type { Node, NodeBuilder } from 'three/webgpu';
import { attribute, mat4, mix, normalLocal, positionLocal, transformNormal, vec4 } from 'three/tsl';

// TSL's node types are loose; one alias keeps the calls readable (as the other scene packages do).
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The instance matrix columns (column-major, as Matrix4.elements) of a baked group's instances. */
export const INSTANCE_COLUMNS = ['ffI0', 'ffI1', 'ffI2', 'ffI3'] as const;

/** MeshStandardNodeMaterial placing each vertex and normal by the instance matrix in INSTANCE_COLUMNS. */
class InstancedGlbMaterial extends MeshStandardNodeMaterial {
  override customProgramCacheKey(): string { return super.customProgramCacheKey() + ':ff-instanced'; }
  override setupPosition(builder: NodeBuilder): Node {
    const [c0, c1, c2, c3] = INSTANCE_COLUMNS.map(name => attribute(name, 'vec4') as N);
    const m = (mat4 as N)(c0, c1, c2, c3) as N;
    (positionLocal as N).assign(m.mul(positionLocal).xyz);
    (normalLocal as N).assign(transformNormal(normalLocal as N, m));
    return super.setupPosition(builder);
  }
}

export interface GlbMaterials {
  get(transparent: boolean, tinted: boolean): MeshStandardNodeMaterial;
  /** Proxy boxes (pending assets, the landing) with per-instance colours. */
  proxy: MeshStandardNodeMaterial;
  /** Moving vehicles drawn as pulses from 60x. */
  pulse: MeshBasicNodeMaterial;
  dispose(): void;
}

function glbMaterial(transparent: boolean, tinted: boolean): MeshStandardNodeMaterial {
  const material = new InstancedGlbMaterial();
  material.name = `foundry-floor-glb${transparent ? '-transparent' : ''}${tinted ? '-tinted' : ''}`;
  material.side = FrontSide;
  const base = attribute('color', 'vec3') as N, pbr = attribute('ffMat', 'vec4') as N;
  if (tinted) {
    const tint = attribute('ffTint', 'vec4') as N;
    const rgb = mix(base, tint.xyz, pbr.w.mul(tint.w)) as N;
    material.colorNode = vec4(rgb, 1);
  } else material.colorNode = vec4(base, 1);
  material.roughnessNode = pbr.x;
  material.metalnessNode = pbr.y;
  material.emissiveNode = attribute('ffEmis', 'vec3') as N;
  if (transparent) {
    material.transparent = true;
    material.depthWrite = false;
    material.opacityNode = pbr.z;
  }
  return material;
}

export function createGlbMaterials(): GlbMaterials {
  const cache = new Map<string, MeshStandardNodeMaterial>();
  const proxy = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0 });
  proxy.name = 'foundry-floor-proxy';
  const pulse = new MeshBasicNodeMaterial();
  pulse.name = 'foundry-floor-pulse';
  return {
    get(transparent, tinted) {
      const key = `${transparent ? 1 : 0}${tinted ? 1 : 0}`;
      let material = cache.get(key);
      if (!material) cache.set(key, (material = glbMaterial(transparent, tinted)));
      return material;
    },
    proxy, pulse,
    dispose() { for (const material of cache.values()) material.dispose(); proxy.dispose(); pulse.dispose(); cache.clear(); },
  };
}
