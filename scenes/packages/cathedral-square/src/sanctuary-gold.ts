import type { Material, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three/webgpu';

/** Clone only indoor gilding; source colours, metallic response and textures stay authored. */
export function createSanctuaryGoldBinding(cathedral: Object3D, furnishings: Object3D) {
  const originals = new Map<Mesh, Material | Material[]>(), copies = new Map<Material, MeshStandardMaterial>();
  const bind = (root: Object3D, selected: (mesh: Mesh) => boolean) => root.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !selected(mesh)) return;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!source.some(material => ['Gilding', 'Gold_Leaf'].includes(material.name))) return;
    originals.set(mesh, mesh.material);
    const mapped = source.map(material => {
      if (!['Gilding', 'Gold_Leaf'].includes(material.name)) return material;
      let copy = copies.get(material);
      if (!copy) { copy = (material as MeshStandardMaterial).clone(); copies.set(material, copy); }
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? mapped : mapped[0]!;
  });
  bind(cathedral, mesh => /^Mesh_(Sanctuary|Retable)_/.test(mesh.name));
  bind(furnishings, () => true);
  let disposed = false;
  return {
    materialCount: copies.size,
    hideForCapture(scene: Object3D) {
      const materials = new Set(copies.values()), visibility = new Map<Mesh, boolean>();
      scene.traverse(node => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!source.some(material => materials.has(material as MeshStandardMaterial))) return;
        visibility.set(mesh, mesh.visible); mesh.visible = false;
      });
      return () => { for (const [mesh, visible] of visibility) mesh.visible = visible; visibility.clear(); };
    },
    setEnvironment(texture: Texture | null) {
      if (disposed) return;
      for (const material of copies.values()) { material.envMap = texture; material.envMapIntensity = 2.2; material.needsUpdate = true; }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const [mesh, material] of originals) mesh.material = material;
      // The clone borrows every authored texture. The capture component owns its envMap.
      for (const material of copies.values()) material.dispose();
      originals.clear(); copies.clear();
    },
  };
}
