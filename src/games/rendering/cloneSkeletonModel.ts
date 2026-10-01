import { Object3D, Skeleton, SkinnedMesh } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// SkeletonUtils clones per mesh. Restore the source's shared-skin relationships
// within this actor, while keeping bones and Skeletons independent across actors.
export function cloneSkeletonModel(source: Object3D): Object3D {
  const skins: Skeleton[] = [];
  source.traverse(object => { if (object instanceof SkinnedMesh) skins.push(object.skeleton); });
  const model = clone(source);
  const skeletons = new Map<Skeleton, Skeleton>();
  let index = 0;
  model.traverse(object => {
    if (!(object instanceof SkinnedMesh)) return;
    const sourceSkin = skins[index++];
    const shared = skeletons.get(sourceSkin);
    if (shared) {
      object.skeleton.dispose();
      // Bind matrices belong to the mesh; preserve them unchanged.
      object.skeleton = shared;
    } else skeletons.set(sourceSkin, object.skeleton);
  });
  return model;
}
