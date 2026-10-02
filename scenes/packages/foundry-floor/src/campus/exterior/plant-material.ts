// SPDX-License-Identifier: MIT
// One material graph for every campus plant. Each part's colour and roughness arrive as vertex data (`plantLook`, linear
// rgb then roughness), so the leaf, needle and bark materials of eight plant types draw through one material. Instancing is
// the material's, as in the fab's baked groups (scene/glb/materials.ts): each instance's matrix arrives as four instanced
// vec4 attributes (PLANT_COLUMNS) on a plain Mesh, so every plant mesh shares one node build, one program pair and one
// pipeline, where three 0.186 gives every InstancedMesh of at most 1,024 instances a uniform buffer named after its node id
// and its uuid in the cache key (a pipeline per mesh).
import { FrontSide, MeshStandardNodeMaterial } from 'three/webgpu';
import type { Material, MeshStandardMaterial, Node, NodeBuilder } from 'three/webgpu';
import { attribute, mat4, normalLocal, positionLocal, transformNormal, vec4 } from 'three/tsl';

// TSL's node types are loose; one alias keeps the calls readable (as the fab's materials do).
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The instance matrix columns (column-major, as Matrix4.elements) of a plant mesh's instances. */
export const PLANT_COLUMNS = ['plantI0', 'plantI1', 'plantI2', 'plantI3'] as const;

/**
 * The instance transform lives in setupPosition, which only this material's own build runs: a pass that draws with an override
 * material (shadow depth, a depth prepass, picking) would put every plant at its origin. Shared plant meshes therefore never
 * cast shadows (tests/unit/campus-vegetation-shared.test.ts); a pass like that needs the transform in a node it carries over.
 */
class InstancedPlantMaterial extends MeshStandardNodeMaterial {
  override customProgramCacheKey(): string { return super.customProgramCacheKey() + ':plant-instanced'; }
  override setupPosition(builder: NodeBuilder): Node {
    const [c0, c1, c2, c3] = PLANT_COLUMNS.map(name => attribute(name, 'vec4') as N);
    const m = (mat4 as N)(c0, c1, c2, c3) as N;
    (positionLocal as N).assign(m.mul(positionLocal).xyz);
    (normalLocal as N).assign(transformNormal(normalLocal as N, m));
    return super.setupPosition(builder);
  }
}

/** The one material every shared plant mesh uses: opaque, matte, FrontSide, colour and roughness from `plantLook`. */
export function createPlantMaterial(): MeshStandardNodeMaterial {
  const material = new InstancedPlantMaterial(), look = attribute('plantLook', 'vec4') as N;
  material.name = 'foundry-floor-plant';
  material.side = FrontSide;
  material.colorNode = vec4(look.xyz, 1);
  material.roughnessNode = look.w;
  return material;
}

/**
 * A part's look as vertex data: the linear colour and roughness of a plain opaque matte standard material (what the saved
 * plants use, no maps, no emission), or null for any material that data cannot reproduce exactly. The float32 values are
 * the ones the material's own uniforms would hold.
 */
export function plantLook(material: Material): [number, number, number, number] | null {
  const m = material as MeshStandardMaterial;
  if (!m.isMeshStandardMaterial || (m as { isMeshPhysicalMaterial?: boolean }).isMeshPhysicalMaterial || (m as { isNodeMaterial?: boolean }).isNodeMaterial) return null;
  if (m.metalness !== 0 || m.emissive.r + m.emissive.g + m.emissive.b !== 0 || m.transparent || m.opacity !== 1 || m.side !== FrontSide || m.vertexColors || m.alphaTest !== 0 || m.flatShading || m.envMapIntensity !== 1) return null;
  for (const key in m) if ((m as unknown as Record<string, { isTexture?: boolean } | null>)[key]?.isTexture) return null;
  return [Math.fround(m.color.r), Math.fround(m.color.g), Math.fround(m.color.b), Math.fround(m.roughness)];
}
