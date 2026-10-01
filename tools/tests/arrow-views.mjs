import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ArrowTowerViews } from '../../artifacts/runtime-tests/tower-defense/ArrowTowerViews.js';

const load = async file => {
  const bytes = fs.readFileSync(`public/assets/arrow-tower/${file}.glb`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
};
const [tower, arrow] = await Promise.all([load('arrow-tower'), load('arrow')]);
const resources = ArrowTowerViews.fromModels(tower, arrow);
const a = resources.create([3, -4]), b = resources.create([-5, 8]);
const modelTip = a.root.getObjectByName('ArrowTip');
const loaded = a.root.getObjectByName('LoadedArrow');
const sample = (view, heading, age, windup) => { view.sync(heading, age, windup); view.root.updateMatrixWorld(true); };
const logicalTip = new Vector3();
let fixedAge = 0;
for (let i = 0; i < 30; i++) fixedAge += 1 / 60;
sample(a, 0, fixedAge, 0.5);
assert.equal(loaded.visible, false, 'fixed-step logical release must hide the loaded arrow in the same frame');
for (const heading of [0, Math.PI / 2, -Math.PI / 3, Math.PI]) {
  for (const windup of [0.25, 0.5, 0.8]) {
    sample(a, heading, windup, windup);
    a.launchPosition(heading, logicalTip);
    assert.ok(logicalTip.distanceTo(modelTip.getWorldPosition(new Vector3())) < 1e-6, 'logical launch matches the actual posed tip');
    assert.equal(loaded.visible, false);
    // A cached logical origin must not depend on the last rendered pose.
    sample(a, heading, windup * 0.5, windup);
    const drawn = modelTip.getWorldPosition(new Vector3());
    assert.ok(drawn.distanceTo(logicalTip) > 0.1, 'Shoot must draw the loaded arrow back');
    const stable = new Vector3(); a.launchPosition(heading, stable);
    assert.ok(stable.distanceTo(logicalTip) < 1e-9);
    assert.equal(loaded.visible, true);
    sample(a, heading, windup * 2, windup); assert.equal(loaded.visible, true);
  }
}
sample(b, 0, null, 0.5);
const untouched = b.root.getObjectByName('ArrowTip').getWorldPosition(new Vector3());
sample(a, 1, 0.25, 0.5);
assert.deepEqual(b.root.getObjectByName('ArrowTip').getWorldPosition(new Vector3()), untouched);
const projectile = resources.createProjectile();
for (const direction of [new Vector3(0, 0, 1), new Vector3(1, -1, 2).normalize()]) {
  projectile.sync(new Vector3(4, 2, -5), direction); projectile.root.updateMatrixWorld(true);
  assert.ok(projectile.root.getObjectByName('ArrowTip').getWorldPosition(new Vector3()).distanceTo(new Vector3(4, 2, -5)) < 1e-7);
}
projectile.dispose(); a.dispose(); b.dispose();
assert.equal(resources.inspect().active, 0); assert.equal(resources.inspect().arrows, 0);
assert.equal(resources.inspect().geometryDisposals, 0);
resources.dispose(); assert.ok(resources.inspect().geometryDisposals > 0);
const disposed = resources.inspect(); resources.dispose(); assert.deepEqual(resources.inspect(), disposed);
const invalid = await load('arrow-tower'), companion = await load('arrow');
invalid.scene.getObjectByName('Muzzle').removeFromParent();
assert.throws(() => ArrowTowerViews.fromModels(invalid, companion), /资产缺少/);
console.log('Arrow assets: authored windup pose, logical/visual release agreement at multiple headings and speeds, pose independence, projectile tip alignment and shared-resource ownership passed.');
