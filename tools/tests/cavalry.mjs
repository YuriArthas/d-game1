import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnimationMixer, LoopOnce, LoopRepeat, PropertyBinding, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationActor } from '../../artifacts/runtime-tests/test-game/animation/AnimationActor.js';
import { cloneSkeletonModel } from '../../artifacts/runtime-tests/rendering/cloneSkeletonModel.js';
import { disposeScene } from '../../artifacts/runtime-tests/rendering/disposeScene.js';

const bytes = fs.readFileSync('public/assets/cavalry/cavalry.glb');
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20+jsonLength));
const triangles = json.meshes.flatMap(m => m.primitives).reduce((sum, p) => sum+json.accessors[p.indices].count/3, 0);
assert.ok(triangles >= 1800 && triangles <= 2200, `triangle budget: ${triangles}`);
assert.equal(json.skins.length, 1); assert.equal(json.materials.length, 1); assert.equal(json.images.length, 1);
const bin = bytes.subarray(28+jsonLength);
const imageView = json.bufferViews[json.images[0].bufferView];
const png = bin.subarray(imageView.byteOffset, imageView.byteOffset+imageView.byteLength);
assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 256); assert.equal(png.readUInt32BE(20), 256);

// The Tripo review variant is checked independently so the original authored
// 2000-face fallback remains covered while the Web page exercises the new
// roughly-5000-face asset.
const tripoBytes = fs.readFileSync('public/assets/cavalry/cavalry-tripo.glb');
const tripoJsonLength = tripoBytes.readUInt32LE(12);
const tripoJson = JSON.parse(tripoBytes.subarray(20, 20 + tripoJsonLength));
const tripoTriangles = tripoJson.meshes.flatMap(m => m.primitives)
  .reduce((sum, p) => sum + tripoJson.accessors[p.indices].count / 3, 0);
assert.ok(tripoTriangles >= 4000 && tripoTriangles <= 5200, `Tripo triangle budget: ${tripoTriangles}`);
assert.equal(tripoJson.skins.length, 1);
assert.equal(tripoJson.skins[0].joints.length, 27);
assert.equal(tripoJson.materials.length, 1);
assert.equal(tripoJson.images.length, 1);
assert.equal(tripoJson.images[0].mimeType, 'image/png');
const tripoImageView = tripoJson.bufferViews[tripoJson.images[0].bufferView];
const tripoBinStart = 28 + tripoJsonLength;
const tripoImage = tripoBytes.subarray(tripoBinStart + (tripoImageView.byteOffset ?? 0),
  tripoBinStart + (tripoImageView.byteOffset ?? 0) + tripoImageView.byteLength);
assert.equal(tripoImage.toString('hex', 0, 8), '89504e470d0a1a0a');
assert.equal(tripoImage.readUInt32BE(16), 512);
assert.equal(tripoImage.readUInt32BE(20), 512);
assert.ok(tripoJson.meshes.flatMap(m => m.primitives).some(p => p.attributes?.TEXCOORD_0 !== undefined && p.material === 0));
assert.deepEqual(tripoJson.animations.map(c => c.name).sort(), ['Attack', 'Charge', 'Dead', 'Idle', 'Run']);

// CPU animation verification does not render textures. Validate the real embedded
// PNG above and expose its dimensions to Three's image loader; browser smoke tests
// separately exercise actual PNG decode, UVs and WebGL rendering.
const previousBitmap = globalThis.createImageBitmap, previousSelf = globalThis.self;
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const b = Buffer.from(await blob.arrayBuffer());
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), close() {} };
};
let gltf;
try { gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.length), ''); }
finally {
  if (previousBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = previousBitmap;
  if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf;
}
assert.deepEqual(gltf.animations.map(c => c.name).sort(), ['Attack','Charge','Dead','Idle','Run']);
const originalNames = gltf.animations.map(c => c.tracks.map(t => t.name));
const attack = gltf.animations.find(c => c.name === 'Attack');
const upper = new Set();
gltf.scene.getObjectByName('RiderSpine').traverse(b => { if (b.isBone) upper.add(b.name); });
// glTF exporters may include static tracks outside the mask. They must never animate.
for (const track of attack.tracks) if (!upper.has(PropertyBinding.parseTrackName(track.name).nodeName)) {
  for (let i = track.getValueSize(); i < track.values.length; i++) assert.ok(Math.abs(track.values[i]-track.values[i%track.getValueSize()]) < 1e-6);
}
const actor = new AnimationActor(cloneSkeletonModel(gltf.scene), 'cavalry', gltf.animations, () => {});
const other = new AnimationActor(cloneSkeletonModel(gltf.scene), 'cavalry', gltf.animations, () => {});
const reference = gltf.scene, mixer = new AnimationMixer(reference);
const lower = [];
reference.traverse(b => { if (b.isBone && !upper.has(b.name)) lower.push(b.name); });
const matrix = (root, names) => names.flatMap(n => root.getObjectByName(n).matrixWorld.toArray());
const diff = (a, b) => Math.max(...a.map((v,i) => Math.abs(v-b[i])));
let maxLowerError = 0, peakArmDifference = 0;
let referenceAction;
function playReference(name) {
  mixer.stopAllAction();
  referenceAction = mixer.clipAction(gltf.animations.find(c => c.name === name)).reset();
  referenceAction.setLoop(name === 'Dead' ? LoopOnce : LoopRepeat, name === 'Dead' ? 1 : Infinity);
  referenceAction.clampWhenFinished = name === 'Dead';
  referenceAction.play();
}
actor.play('run'); playReference('Run'); actor.upperBody.play();
for (let i = 0; i < 120; i++) {
  actor.update(1/60); mixer.update(1/60); reference.updateMatrixWorld(true);
  const error = diff(matrix(actor.root, lower), matrix(reference, lower));
  maxLowerError = Math.max(maxLowerError, error);
  assert.ok(error < 1e-6, 'rider upper attack must preserve horse and rider lower-body transforms');
  peakArmDifference = Math.max(peakArmDifference, actor.root.getObjectByName('RiderForeR').getWorldPosition(new Vector3()).distanceTo(reference.getObjectByName('RiderForeR').getWorldPosition(new Vector3())));
}
assert.ok(peakArmDifference > .15);
assert.equal(actor.inspect().state, 'playing'); assert.equal(actor.upperBody.inspect().playing, false);
assert.ok(diff(matrix(actor.root, [...upper]), matrix(reference, [...upper])) < 1e-6);
actor.upperBody.play(true); actor.seek(.2); actor.upperBody.seek(.58);
referenceAction.time = .2; referenceAction.paused = true; mixer.update(0); reference.updateMatrixWorld(true);
actor.upperBody.setWeight(0); actor.update(0);
assert.ok(diff(matrix(actor.root, [...lower, ...upper]), matrix(reference, [...lower, ...upper])) < 1e-6);
const zero = actor.root.getObjectByName('RiderSpine').quaternion.clone();
actor.upperBody.setWeight(1); actor.update(0);
const full = actor.root.getObjectByName('RiderSpine').quaternion.clone();
assert.ok(zero.angleTo(full) > .1);
actor.upperBody.setWeight(.5); actor.update(0);
assert.ok(actor.root.getObjectByName('RiderSpine').quaternion.angleTo(new Quaternion().slerpQuaternions(zero, full, .5)) < 1e-5);
actor.reset(); actor.play('run'); actor.upperBody.play(true); actor.update(.2);
actor.togglePause(); const lowerTime = actor.inspect().time, upperTime = actor.upperBody.inspect().time;
actor.update(.15); assert.equal(actor.inspect().time, lowerTime); assert.ok(actor.upperBody.inspect().time > upperTime);
actor.togglePause(); actor.upperBody.togglePause(); const heldUpper = actor.upperBody.inspect().time;
actor.update(.1); assert.equal(actor.upperBody.inspect().time, heldUpper); assert.notEqual(actor.inspect().time, lowerTime);
actor.play('charge'); assert.equal(actor.upperBody.inspect().playing, false); assert.equal(actor.upperBody.inspect().available, false);
actor.update(1.5); assert.ok(actor.inspect().loops >= 2);
const untouched = other.inspect().pose;
actor.play('death'); playReference('Dead');
for (let i = 0; i < 120; i++) {
  actor.update(1/60); mixer.update(1/60); reference.updateMatrixWorld(true);
  assert.ok(diff(matrix(actor.root, [...lower, ...upper]), matrix(reference, [...lower, ...upper])) < 1e-6);
}
assert.equal(actor.inspect().state, 'finished'); assert.equal(actor.inspect().finishes, 1);
assert.equal(actor.upperBody.inspect().playing, false); assert.deepEqual(other.inspect().pose, untouched);
const deadPelvis = actor.root.getObjectByName('RiderPelvis').getWorldPosition(new Vector3());
assert.ok(deadPelvis.y < .55, `rider falls off the saddle: ${deadPelvis.toArray()}`);

// Exercise the real exported deforming vertices, not just bone key names.
let skinned; reference.traverse(o => { if (o.isSkinnedMesh) skinned=o; });
const samples = {};
for (const name of ['Idle', 'Run', 'Charge', 'Dead']) {
  playReference(name); referenceAction.paused = true;
  let low = Infinity, high = -Infinity;
  const duration = referenceAction.getClip().duration;
  for (let frame = 0; frame <= Math.ceil(duration*60); frame++) {
    referenceAction.time = Math.min(frame/60, duration); mixer.update(0); reference.updateMatrixWorld(true);
    for (let i = 0; i < skinned.geometry.attributes.position.count; i++) {
      const point = skinned.getVertexPosition(i, new Vector3()).applyMatrix4(skinned.matrixWorld);
      assert.ok(point.toArray().every(Number.isFinite));
      low = Math.min(low, point.y); high = Math.max(high, point.y);
    }
    assert.deepEqual(reference.getObjectByName('CavalryRoot').position.toArray(), [0,0,0]);
  }
  assert.ok(low > -.025, `${name}: ground penetration ${low}`);
  if (name !== 'Dead') {
    referenceAction.time = 0; mixer.update(0); reference.updateMatrixWorld(true);
    const beginning = matrix(reference, [...lower,...upper]);
    referenceAction.time = duration; mixer.update(0); reference.updateMatrixWorld(true);
    assert.ok(diff(beginning, matrix(reference, [...lower,...upper])) < 1e-5, `${name}: loop seam`);
  } else {
    referenceAction.time = duration-.15; mixer.update(0); reference.updateMatrixWorld(true);
    const settled = matrix(reference, [...lower,...upper]);
    referenceAction.time = duration; mixer.update(0); reference.updateMatrixWorld(true);
    assert.ok(diff(settled, matrix(reference, [...lower,...upper])) < 1e-6, 'death holds its settled pose');
  }
  samples[name] = {low, high};
}
assert.deepEqual(gltf.animations.map(c => c.tracks.map(t => t.name)), originalNames);
actor.dispose(); other.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(reference); disposeScene(reference);
fs.mkdirSync('artifacts/cavalry', {recursive:true});
fs.writeFileSync('artifacts/cavalry/checks.json', JSON.stringify({triangles, maxLowerError, peakArmDifference, samples}, null, 2));
console.log(`Cavalry passed: ${triangles} triangles, 256 texture, one material/skin; Tripo ~5000-face variant has a 512 texture and preserved UV; original Run lower transforms preserved, weights/clocks/isolation, charge/death interruption, floor/loop/settling and fixed root.`);
