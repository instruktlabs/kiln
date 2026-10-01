import * as THREE from 'three';

// Exact catalog IDs whose delivered GLBs have an independently audited Paint shell.
const VEHICLES = new Set(['hatchback', 'sedan', 'suv', 'pickup', 'box-truck', 'transit-bus']);
export const PAINT_SWATCHES = [
  { name: 'Red', hex: '#aa2639' },
  { name: 'Blue', hex: '#275aad' },
  { name: 'Green', hex: '#285747' },
  { name: 'Yellow', hex: '#e4ad28' },
  { name: 'Silver', hex: '#9fa6ad' },
  { name: 'Black', hex: '#20252c' },
] as const;

/** Clone only the paint material and object graph; cached GLTF materials remain untouched. */
export function createVehiclePaint(
  source: THREE.Object3D,
  assetId?: string,
):
  | {
      scene: THREE.Object3D;
      originalHex: string;
      setColour: (colour: string | null) => void;
    }
  | undefined {
  if (!assetId || !VEHICLES.has(assetId)) return undefined;
  const candidates = new Set<THREE.MeshStandardMaterial>();
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name === 'Paint' && material instanceof THREE.MeshStandardMaterial)
        candidates.add(material);
    }
  });
  if (candidates.size !== 1) return undefined;
  const original = [...candidates][0]!;
  const paint = original.clone();
  const scene = source.clone(true);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => (material === original ? paint : material))
      : object.material === original
        ? paint
        : object.material;
  });
  return {
    scene,
    originalHex: `#${original.color.getHexString()}`,
    setColour(colour) {
      if (colour === null) paint.color.copy(original.color);
      else {
        if (!/^#[0-9a-f]{6}$/i.test(colour))
          throw new Error('Paint must be a six-digit hex colour');
        paint.color.set(colour);
      }
    },
  };
}
