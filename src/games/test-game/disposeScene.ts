import { Material, Mesh, Object3D, SkinnedMesh, Texture } from 'three';

// Only dispose scenes owned by this instance; never pass shared loader-cache scenes.
export function disposeScene(root: Object3D): void {
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  const meshes = new Set<Mesh>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes.add(object);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });
  const skeletons = new Set([...meshes].filter((mesh): mesh is SkinnedMesh => mesh instanceof SkinnedMesh).map((mesh) => mesh.skeleton));
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of new Set([...meshes].map((mesh) => mesh.geometry))) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    const data = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close();
    texture.dispose();
  }
}
