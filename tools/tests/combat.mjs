import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { BattleWorld } from '../../artifacts/runtime-tests/tower-defense/BattleWorld.js';
import { TowerUnit } from '../../artifacts/runtime-tests/tower-defense/TowerUnit.js';
import { EnemyUnit } from '../../artifacts/runtime-tests/tower-defense/EnemyUnit.js';
import { ProjectileUnit } from '../../artifacts/runtime-tests/tower-defense/ProjectileUnit.js';
import { RoutePath } from '../../artifacts/runtime-tests/tower-defense/RoutePath.js';
import { ContentCatalog } from '../../artifacts/runtime-tests/tower-defense/data/catalog.js';
import { DEMO_CONTENT } from '../../artifacts/runtime-tests/tower-defense/data/content.js';

class EnemyView {
  root = new Group(); released = 0; deathTime = 0; updates = []; deathUpdates = [];
  sync() {} update(dt) { this.updates.push(dt); } markDead() {}
  updateDeath(dt) { this.deathUpdates.push(dt); this.deathTime += dt; return this.deathTime >= 0.8; }
  dispose() { this.root.removeFromParent(); this.released++; }
}
class TowerView {
  root = new Group(); released = 0; samples = [];
  constructor(position) { this.root.position.set(position[0], 0, position[1]); }
  sync(...args) { this.samples.push(args); }
  launchPosition(_heading, result) { result.copy(this.root.position); result.y = 3; }
  dispose() { this.released++; }
}
class ArrowView {
  root = new Group(); released = 0;
  sync(tip) { this.root.position.copy(tip); }
  dispose() { this.root.removeFromParent(); this.released++; }
}
function source() {
  const data = structuredClone(DEMO_CONTENT);
  data.routes.find(x => x.id === 'placement-route').waypoints = [[0, 0, 2], [30, 0, 2]];
  data.maps.find(x => x.id === 'placement-map').buildGrid = { origin: [-2, -2], cellSize: 4, buildableCells: [[0, 0], [1, 0], [2, 0]] };
  Object.assign(data.towers[0], { range: 50, damage: 10, cooldown: 1.2, windup: 0.5, projectileSpeed: 14 });
  data.waves.find(x => x.id === 'placement-wave').entries = [{ enemyId: 'combat-skeleton', count: 1, interval: 0, routeId: 'placement-route' }];
  return data;
}
const fixtures = [];
function fixture(data = source()) {
  const towers = [], enemies = [], arrows = [];
  const world = new BattleWorld(new ContentCatalog(data), 'placement-demo', {
    tower: p => { const v = new TowerView(p); towers.push(v); return v; },
    enemy: () => { const v = new EnemyView(); enemies.push(v); return v; },
    projectile: () => { const v = new ArrowView(); arrows.push(v); return v; },
  });
  const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) world.tick(1 / 60); };
  const f = { world, towers, enemies, arrows, tick }; fixtures.push(f); return f;
}

// Two simultaneous arrows on one enemy: the later arrow expires, reward and hit occur once.
const one = fixture();
one.world.place([0, 0], 'arrow-tower'); one.world.place([1, 0], 'arrow-tower');
assert.equal(one.world.startWave(), true); assert.equal(one.world.startWave(), false);
one.tick(1);
let report = one.world.inspect();
assert.equal(report.phase, 'won'); assert.equal(report.kills, 1); assert.equal(report.hits, 1);
assert.equal(report.shots, 2); assert.equal(report.gold, 55); assert.equal(report.dying, 1);
assert.equal(one.world.place([2, 0], 'arrow-tower'), 'finished');
one.world.togglePause(); const pausedCorpse = one.world.inspect(); one.tick(1); assert.deepEqual(one.world.inspect(), pausedCorpse);
one.world.togglePause(); one.tick(2);
assert.equal(one.world.inspect().dying, 0); assert.equal(one.world.gold, 55);
assert.equal(one.world.summary().elapsed, report.elapsed);
assert.ok(one.arrows.every(v => v.released === 1));

// Nonlethal hits only change health. Two hits are needed; animations do not inflict damage.
const twoData = source(); twoData.towers[0].damage = 5;
const two = fixture(twoData); two.world.place([0, 0], 'arrow-tower'); two.world.startWave();
two.tick(1); report = two.world.inspect();
assert.equal(report.hits, 1); assert.equal(report.enemies[0].health, 5); assert.equal(report.gold, 70);
two.tick(2); assert.equal(two.world.summary().kills, 1); assert.equal(two.world.summary().hits, 2); assert.equal(two.world.gold, 85);

// Pause both a locked windup and an arrow in flight. Reset drops all old references and clocks.
const pauseData = source(); pauseData.towers[0].projectileSpeed = 1;
const pause = fixture(pauseData); pause.world.place([0, 0], 'arrow-tower'); pause.world.startWave(); pause.tick(0.25);
for (const wait of [0.5, 0]) {
  pause.world.togglePause(); const before = pause.world.inspect(); pause.tick(2); assert.deepEqual(pause.world.inspect(), before);
  pause.world.togglePause(); pause.tick(wait);
}
assert.equal(pause.world.summary().arrows, 1);
pause.world.reset(); report = pause.world.inspect();
assert.equal(report.phase, 'ready'); assert.equal(report.gold, 100); assert.equal(report.lives, 5);
assert.equal(report.enemies.length, 0); assert.equal(report.projectiles.length, 0); assert.equal(report.towers.length, 0);
assert.ok([...pause.towers, ...pause.enemies, ...pause.arrows].every(v => v.released === 1));
pause.world.startWave(); pause.tick(1); assert.equal(pause.world.summary().shots, 0);

// A surviving base receives its wave reward. Last life lost wins over same-step completion.
for (const lives of [1, 2]) {
  const data = source(); data.routes.find(x => x.id === 'placement-route').waypoints = [[0, 0, 2], [0.03, 0, 2]];
  data.levels.find(x => x.id === 'placement-demo').baseLives = lives;
  const f = fixture(data); f.world.startWave(); f.tick(0.1);
  assert.equal(f.world.summary().leaks, 1); assert.equal(f.world.lives, lives - 1);
  assert.equal(f.world.phase, lives === 1 ? 'lost' : 'won');
  assert.equal(f.world.gold, lives === 1 ? 100 : 110);
  assert.equal(f.world.startWave(), false); f.tick(1); assert.equal(f.world.summary().leaks, 1);
}

// Multi-entry spawn scheduling, burst spawning and each new actor's own presentation age.
const spawnData = source(); spawnData.waves.find(x => x.id === 'placement-wave').entries = [
  { enemyId: 'combat-skeleton', count: 3, interval: 0.1, routeId: 'placement-route' },
  { enemyId: 'combat-skeleton', count: 2, interval: 0, routeId: 'placement-route' },
];
const born = fixture(spawnData); born.world.startWave(); born.world.tick(10);
assert.equal(born.enemies.length, 5);
const ages = born.enemies.map(v => v.updates[0]).sort((a, b) => a - b);
[0.05, 0.15, 0.25, 0.25, 0.25].forEach((age, i) => assert.ok(Math.abs(ages[i] - age) < 1e-9));
assert.ok(born.enemies.every(v => v.updates.length === 1));

// Same logical duration in different render chunks produces identical combat results.
const deterministicData = source(); deterministicData.waves.find(x => x.id === 'placement-wave').entries[0].count = 8;
deterministicData.waves.find(x => x.id === 'placement-wave').entries[0].interval = 0.7;
const a = fixture(deterministicData), b = fixture(deterministicData);
for (const f of [a, b]) { f.world.place([0, 0], 'arrow-tower'); f.world.startWave(); }
a.tick(8); for (let i = 0; i < 80; i++) b.world.tick(0.1);
assert.deepEqual(a.world.inspect(), b.world.inspect());
assert.equal(a.towers[0].samples.length, 480); assert.equal(b.towers[0].samples.length, 80);

// Manual next-wave transition reuses economy/towers while completion is settled once per wave.
const waves = source(); waves.levels.find(x => x.id === 'placement-demo').waveIds.push('placement-wave');
const multi = fixture(waves); multi.world.place([0, 0], 'arrow-tower'); multi.world.startWave(); multi.tick(2);
assert.equal(multi.world.phase, 'intermission'); assert.equal(multi.world.gold, 85);
assert.equal(multi.world.startWave(), true); multi.tick(3);
assert.equal(multi.world.phase, 'won'); assert.equal(multi.world.gold, 100); assert.equal(multi.world.summary().kills, 2);

// Target ranking uses remaining metres, not normalized progress or lexical IDs.
function enemy(id, length) {
  return new EnemyUnit(id, { id: 'e', maxHealth: 10, moveSpeed: 1, reward: 5 }, 'r',
    new RoutePath({ id: 'r', waypoints: [[0, 0, 0], [length, 0, 0]] }), () => new EnemyView());
}
const first = enemy('10', 10), second = enemy('2', 10), longer = enemy('1', 20);
const def = { ...DEMO_CONTENT.towers[0], range: 5 };
const tower = new TowerUnit(1, def, [0, 0], [0, 0], new TowerView([0, 0]));
tower.tick(1 / 60, [longer, first, second], () => assert.fail('no shot at attack start'));
assert.equal(tower.target, first);
// Out of range at release cancels the shot and retains its cooldown, despite a valid alternative.
first.position.x = 6; let fired = 0;
for (let i = 0; i < 30; i++) tower.tick(1 / 60, [first, second], () => fired++);
assert.equal(fired, 0); assert.equal(tower.target, null);
for (let i = 0; i < 41; i++) tower.tick(1 / 60, [second], () => fired++);
assert.equal(tower.target, null); assert.equal(fired, 0);
tower.tick(1 / 60, [second], () => fired++); assert.equal(tower.target, second);
second.kill(); for (let i = 0; i < 30; i++) tower.tick(1 / 60, [second], () => fired++);
assert.equal(fired, 0); assert.equal(tower.target, null);

// A projectile follows the original target, expires on death/escape, and cannot hit a replacement.
for (const state of ['dead', 'escaped']) {
  const target = enemy('t', 20), arrowView = new ArrowView();
  const arrow = new ProjectileUnit(1, target, new Vector3(-2, 1, 0), 2, 5, arrowView);
  target.position.z = 2; assert.equal(arrow.tick(0.1), 'flying'); assert.ok(arrow.position.z > 0);
  target.state = state; assert.equal(arrow.tick(0.1), 'expired'); assert.equal(target.health, 10);
  arrow.dispose(); target.dispose(); assert.equal(arrowView.released, 1);
}
for (const field of ['range', 'damage', 'cooldown', 'windup', 'projectileSpeed']) {
  const data = source(); data.towers[0][field] = 0;
  assert.throws(() => new ContentCatalog(data), /攻击参数无效/);
}
const invalid = source(); invalid.towers[0].windup = 2; assert.throws(() => new ContentCatalog(invalid), /攻击参数无效/);
for (const f of fixtures) {
  f.world.dispose(); f.world.dispose();
  assert.ok([...f.towers, ...f.enemies, ...f.arrows].every(v => v.released === 1));
}
for (const e of [first, second, longer]) e.dispose(); tower.dispose();
console.log('Combat: targeting/ties, windup cancellation/cooldown, homing expiry, single hit/reward, leak/loss priority, wave settlement, per-frame presentation, determinism, pause/reset and exact resource release passed.');
