import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnimationMixer, LoopOnce, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { cloneSkeletonModel } from '../../artifacts/runtime-tests/rendering/cloneSkeletonModel.js';

// Load the actual rig/geometry/clips in Node. Only material references are removed;
// image decoding and final rendering are covered by the browser regression.
const asset = fs.readFileSync('public/assets/kaykit-skeletons/Skeleton_Minion.glb');
const jsonLength = asset.readUInt32LE(12);
const data = JSON.parse(asset.subarray(20, 20 + jsonLength).toString());
for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const json = Buffer.from(JSON.stringify(data));
const paddedLength = Math.ceil(json.length / 4) * 4;
const binaryChunk = asset.subarray(20 + jsonLength);
const stripped = Buffer.alloc(20 + paddedLength + binaryChunk.length, 0x20);
asset.copy(stripped, 0, 0, 20);
stripped.writeUInt32LE(stripped.length, 8);
stripped.writeUInt32LE(paddedLength, 12);
json.copy(stripped, 20);
binaryChunk.copy(stripped, 20 + paddedLength);
const gltf = await new GLTFLoader().parseAsync(stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.length), '');
const meshes = root => { const result = []; root.traverse(object => { if (object instanceof SkinnedMesh) result.push(object); }); return result; };
const originalMeshes = meshes(gltf.scene);
assert.equal(originalMeshes.length, 9);
assert.equal(new Set(originalMeshes.map(mesh => mesh.skeleton)).size, 1);
const reference = clone(gltf.scene), actor = cloneSkeletonModel(gltf.scene), other = cloneSkeletonModel(gltf.scene);
const expected = meshes(reference), actual = meshes(actor), independent = meshes(other);
assert.equal(new Set(actual.map(mesh => mesh.skeleton)).size, 1);
assert.notEqual(actual[0].skeleton, independent[0].skeleton);
assert.notEqual(actual[0].skeleton.bones[0], independent[0].skeleton.bones[0]);
for (let i = 0; i < actual.length; i++) {
  assert.equal(actual[i].geometry, originalMeshes[i].geometry);
  assert.deepEqual(actual[i].bindMatrix.elements, expected[i].bindMatrix.elements);
  assert.deepEqual(actual[i].bindMatrixInverse.elements, expected[i].bindMatrixInverse.elements);
  assert.deepEqual(actual[i].skeleton.bones.map(bone => bone.name), expected[i].skeleton.bones.map(bone => bone.name));
  assert.deepEqual(actual[i].skeleton.boneInverses.map(m => m.elements), expected[i].skeleton.boneInverses.map(m => m.elements));
}
const a = new AnimationMixer(reference), b = new AnimationMixer(actor);
const idleBones = independent[0].skeleton.bones.map(bone => bone.quaternion.toArray());
let vertices = 0;
for (const name of ['Walking_A', 'Death_A']) {
  a.stopAllAction(); b.stopAllAction();
  const clip = gltf.animations.find(item => item.name === name);
  a.clipAction(clip).setLoop(LoopOnce, 1).play(); b.clipAction(clip).setLoop(LoopOnce, 1).play();
  for (const delta of [0, 0.17, 0.36]) {
    a.update(delta); b.update(delta);
    reference.updateMatrixWorld(true); actor.updateMatrixWorld(true);
    for (let m = 0; m < actual.length; m++) {
      const positions = actual[m].geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const p = new Vector3().fromBufferAttribute(positions, i), q = p.clone();
        expected[m].applyBoneTransform(i, p); actual[m].applyBoneTransform(i, q);
        assert.ok(p.distanceTo(q) < 1e-7, `${name}: mesh ${m}, vertex ${i}`);
        vertices++;
      }
    }
  }
}
assert.deepEqual(independent[0].skeleton.bones.map(bone => bone.quaternion.toArray()), idleBones);
// Different source skins must remain distinct, even when they reference the same bones.
const multiSkin = cloneSkeletonModel(gltf.scene);
const multiMeshes = meshes(multiSkin);
multiMeshes[0].skeleton = multiMeshes[0].skeleton.clone();
const preserved = meshes(cloneSkeletonModel(multiSkin));
assert.equal(new Set(preserved.map(mesh => mesh.skeleton)).size, 2);
console.log(`Actual GLB skin compatibility, independent actors, preserved binds, ${vertices} posed vertex comparisons and distinct-skin preservation passed.`);
