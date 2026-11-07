import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnimationMixer, LoopOnce, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationActor } from '../../artifacts/runtime-tests/test-game/animation/AnimationActor.js';
import { cloneSkeletonModel } from '../../artifacts/runtime-tests/rendering/cloneSkeletonModel.js';
import { disposeScene } from '../../artifacts/runtime-tests/rendering/disposeScene.js';

const kinds = ['bone-crawler', 'moss-runner', 'stone-brute', 'cannon-tower', 'frost-tower'];
const report = {};
const positions = root => {
  root.updateMatrixWorld(true);
  const values = [];
  root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      const p = o.getVertexPosition(i, new Vector3()).applyMatrix4(o.matrixWorld);
      assert.ok(p.toArray().every(Number.isFinite), 'posed vertex must be finite');
      values.push(...p.toArray());
    }
  });
  return values;
};
const minY = values => Math.min(...values.filter((_, i) => i % 3 === 1));
const maxY = values => Math.max(...values.filter((_, i) => i % 3 === 1));
const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v-b[i])));
for (const kind of kinds) {
  const bytes = fs.readFileSync(`public/assets/frontier/${kind}.glb`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.length), '');
  const enemy = !kind.endsWith('tower');
  const expected = enemy ? kind === 'moss-runner' ? ['Death', 'Idle', 'UpperAttack', 'Walk'] : ['Death', 'Idle', 'Walk'] : kind === 'frost-tower' ? ['Idle', 'Shoot'] : ['Shoot'];
  assert.deepEqual(gltf.animations.map(c => c.name).sort(), expected);
  const root = gltf.scene.getObjectByName(enemy ? 'EnemyRoot' : 'TowerRoot');
  assert.ok(root);
  const origin = root.position.toArray();
  const mixer = new AnimationMixer(gltf.scene);
  const clips = {};
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    const sample = t => { action.time = t; mixer.update(0); return positions(gltf.scene); };
    const first = sample(0), last = sample(clip.duration);
    if (clip.name !== 'Death') assert.ok(distance(first, last) < 1e-4, `${kind}/${clip.name}: seamless return pose`);
    const excursion = Math.max(...[.25, .43, .75].map(t => distance(first, sample(clip.duration*t))));
    assert.ok(excursion > .01, `${kind}/${clip.name}: visible deformation (${excursion})`);
    const lows = [];
    for (let frame = 0; frame <= Math.round(clip.duration*30); frame++) {
      const verts = sample(frame/30);
      lows.push(minY(verts));
      assert.deepEqual(root.position.toArray(), origin, 'in-place animation must not move asset root');
    }
    if (enemy) {
      assert.ok(Math.min(...lows) > -.005, `${kind}/${clip.name}: floor penetration ${Math.min(...lows)}`);
      assert.ok(Math.max(...lows) < .015, `${kind}/${clip.name}: lost floor contact ${Math.max(...lows)}`);
    } else assert.ok(Math.abs(minY(first)) < .0001, 'tower foundation is on ground');
    if (clip.name === 'Death') {
      assert.ok(maxY(last) < maxY(first)*(kind === 'bone-crawler' ? .92 : .7), `${kind}: fallen silhouette`);
      assert.ok(distance(last, sample(clip.duration*.9)) < 1e-4, 'corpse pose holds');
    }
    clips[clip.name] = { duration: clip.duration, minFloor: Math.min(...lows), maxFloor: Math.max(...lows), vertices: first.length/3 };
  }
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  if (!enemy) {
    assert.ok(root.getObjectByName('TurretYaw'));
    assert.ok(root.getObjectByName('Muzzle'));
  }
  let releases = 0;
  const a = new AnimationActor(cloneSkeletonModel(gltf.scene), kind, gltf.animations, () => releases++);
  const b = new AnimationActor(cloneSkeletonModel(gltf.scene), kind, gltf.animations, () => releases++);
  assert.equal(a.skeletons.size, 1, 'material primitives share one skin within an instance');
  assert.equal(b.skeletons.size, 1);
  assert.notEqual([...a.skeletons][0], [...b.skeletons][0]);
  b.seek(0);
  const held = b.inspect().pose;
  a.play(enemy ? 'walk' : 'shoot'); a.update(.24);
  assert.deepEqual(b.inspect().pose, held, 'other instance is independent');
  a.togglePause(); const paused = a.inspect().pose; a.update(.3);
  assert.deepEqual(a.inspect().pose, paused);
  a.play(enemy ? 'death' : 'shoot'); a.update(3);
  assert.equal(a.inspect().state, 'finished'); assert.equal(a.inspect().finishes, 1);
  const end = a.inspect().pose; a.update(2); assert.deepEqual(a.inspect().pose, end);
  a.reset(); assert.equal(a.inspect().motion, enemy || kind === 'frost-tower' ? 'idle' : 'ready');
  a.dispose(); b.play(enemy ? 'walk' : 'shoot'); b.update(.25);
  assert.equal(b.inspect().state, 'playing');
  b.dispose(); assert.equal(releases, 2); disposeScene(gltf.scene);
  report[kind] = { bytes: bytes.length, clips, independentInstances: true };
}
fs.mkdirSync('artifacts/frontier', { recursive: true });
fs.writeFileSync('artifacts/frontier/runtime-checks.json', JSON.stringify(report, null, 2));
console.log('Frontier assets: actual GLB clips, posed vertices, floor contact, loop seams, held death, stable roots, per-instance skin ownership and playback passed.');
