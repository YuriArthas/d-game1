import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnimationMixer, LoopOnce, LoopRepeat, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationActor } from '../../artifacts/runtime-tests/test-game/animation/AnimationActor.js';
import { cloneSkeletonModel } from '../../artifacts/runtime-tests/rendering/cloneSkeletonModel.js';
import { disposeScene } from '../../artifacts/runtime-tests/rendering/disposeScene.js';

const bytes = fs.readFileSync('public/assets/frontier/moss-runner.glb');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.length), '');
const sourceTracks = gltf.animations.map(c => c.tracks.map(t => t.name));
const actor = new AnimationActor(cloneSkeletonModel(gltf.scene), 'moss-runner', gltf.animations, () => {});
const other = new AnimationActor(cloneSkeletonModel(gltf.scene), 'moss-runner', gltf.animations, () => {});
const reference = gltf.scene;
const mixer = new AnimationMixer(reference);
const lower = ['Body', 'Leg-1', 'Shin-1', 'Leg1', 'Shin1'];
const upper = ['Spine', 'Head', 'Arm-1', 'Fore-1', 'Arm1', 'Fore1', 'Scarf'];
const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v-b[i])));
const matrices = (root, names) => names.flatMap(name => root.getObjectByName(name).matrixWorld.toArray());
const localRotation = name => actor.root.getObjectByName(name).quaternion.clone();
let refAction;
function referenceMotion(name, once = false) {
  mixer.stopAllAction();
  refAction = mixer.clipAction(gltf.animations.find(c => c.name === name)).reset();
  refAction.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
  refAction.clampWhenFinished = once;
  refAction.play();
}
function sampleReference(time) { refAction.time = time; refAction.paused = true; mixer.update(0); reference.updateMatrixWorld(true); }

// Compare against the original full-body Walk, not another instance of the split implementation.
actor.play('walk'); referenceMotion('Walk'); actor.upperBody.play();
let peakArmDifference = 0, maxLowerError = 0;
for (let i = 0; i < 100; i++) {
  actor.update(1/60); mixer.update(1/60); reference.updateMatrixWorld(true);
  const error = diff(matrices(actor.root, lower), matrices(reference, lower));
  maxLowerError = Math.max(maxLowerError, error);
  assert.ok(error < 1e-6, 'upper attack must not alter any lower-body world transform');
  const hand = actor.root.getObjectByName('Fore1').getWorldPosition(new Vector3());
  peakArmDifference = Math.max(peakArmDifference, hand.distanceTo(reference.getObjectByName('Fore1').getWorldPosition(new Vector3())));
}
assert.ok(peakArmDifference > .2, 'upper attack visibly changes the arm pose');
assert.equal(actor.inspect().state, 'playing', 'upper completion cannot finish locomotion');
assert.equal(actor.upperBody.inspect().finishes, 1);
assert.equal(actor.upperBody.inspect().playing, false, 'attack fades back automatically');
assert.ok(diff(matrices(actor.root, upper), matrices(reference, upper)) < 1e-6, 'normal upper walk restored after release');

// 0 / 50 / 100 percent really blends only the upper subtree.
actor.upperBody.play(true); actor.seek(.18); actor.upperBody.seek(.55);
sampleReference(.18);
actor.upperBody.setWeight(0); actor.update(0);
assert.ok(diff(matrices(actor.root, [...lower, ...upper]), matrices(reference, [...lower, ...upper])) < 1e-6);
const zero = localRotation('Spine');
actor.upperBody.setWeight(1); actor.update(0);
const full = localRotation('Spine');
assert.ok(zero.angleTo(full) > .1);
actor.upperBody.setWeight(.5); actor.update(0);
const halfway = localRotation('Spine');
assert.ok(halfway.angleTo(new Quaternion().slerpQuaternions(zero, full, .5)) < 1e-5);
assert.ok(diff(matrices(actor.root, lower), matrices(reference, lower)) < 1e-6);
actor.upperBody.setWeight(1);

// Lower pause, upper pause and playback rates are independent.
actor.reset(); actor.play('walk'); actor.upperBody.play(true);
actor.setSpeed(.5); actor.upperBody.setSpeed(2); actor.update(.15);
actor.togglePause();
const lowerTime = actor.inspect().time, upperTime = actor.upperBody.inspect().time;
actor.update(.1);
assert.equal(actor.inspect().time, lowerTime);
assert.ok(Math.abs(actor.upperBody.inspect().time-upperTime-.2) < 1e-6);
actor.togglePause(); actor.upperBody.togglePause();
const heldUpper = actor.upperBody.inspect().time, beforeLower = actor.inspect().time;
actor.update(.1);
assert.equal(actor.upperBody.inspect().time, heldUpper);
assert.ok(Math.abs(actor.inspect().time-beforeLower-.05) < 1e-6);
actor.upperBody.togglePause();
const attackBeforeSwitch = actor.upperBody.inspect().time;
actor.play('idle');
assert.equal(actor.upperBody.inspect().time, attackBeforeSwitch, 'changing locomotion does not restart attack');
actor.update(.07); assert.ok(actor.upperBody.inspect().time !== attackBeforeSwitch);

// Other actors stay independent, and full-body death takes exclusive ownership.
other.seek(0); const untouched = other.inspect().pose;
actor.setSpeed(1); actor.play('death'); referenceMotion('Death', true);
assert.equal(actor.upperBody.inspect().available, false);
assert.equal(actor.upperBody.inspect().playing, false);
assert.throws(() => actor.upperBody.play(), /基础动作/);
for (let i = 0; i < 90; i++) {
  actor.update(1/60); mixer.update(1/60); reference.updateMatrixWorld(true);
  assert.ok(diff(matrices(actor.root, [...lower, ...upper]), matrices(reference, [...lower, ...upper])) < 1e-6);
}
assert.equal(actor.inspect().state, 'finished');
assert.deepEqual(other.inspect().pose, untouched);
actor.reset();
assert.equal(actor.upperBody.inspect().available, true);
assert.equal(actor.upperBody.inspect().playing, false);
actor.play('walk'); actor.upperBody.play(true); actor.update(.2); actor.upperBody.stop(); actor.update(.13);
assert.equal(actor.upperBody.inspect().playing, false);
assert.deepEqual(gltf.animations.map(c => c.tracks.map(t => t.name)), sourceTracks, 'masking leaves source clips unchanged');
actor.dispose(); other.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(reference); disposeScene(reference);
fs.writeFileSync('artifacts/frontier/split-body-checks.json', JSON.stringify({ maxLowerError, peakArmDifference,
  checks: ['masked override', 'base equivalence', 'weights', 'independent clocks', 'base switching', 'one-shot return', 'death interruption', 'actor isolation'] }, null, 2));
console.log('Split body: upper attack preserves original lower walk exactly; 0/50/100% weights, independent clocks, base switching, fade return, exclusive death and isolated actors passed.');
