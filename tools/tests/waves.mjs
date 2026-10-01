import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BattleWorld } from '../../artifacts/runtime-tests/tower-defense/BattleWorld.js';
import { ArrowTowerViews } from '../../artifacts/runtime-tests/tower-defense/ArrowTowerViews.js';
import { ContentCatalog } from '../../artifacts/runtime-tests/tower-defense/data/catalog.js';
import { DEMO_CONTENT } from '../../artifacts/runtime-tests/tower-defense/data/content.js';

const load = async file => {
  const bytes = fs.readFileSync(`public/assets/arrow-tower/${file}.glb`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
};
const assets = ArrowTowerViews.fromModels(await load('arrow-tower'), await load('arrow'));
function create(data) {
  const views = [];
  const world = new BattleWorld(new ContentCatalog(data), 'placement-demo', {
    tower: p => assets.create(p), projectile: assets.createProjectile,
    enemy: () => {
      const view = { root: new Group(), deathTime: 0, releases: 0, sync() {}, update() {}, markDead() {},
        updateDeath(dt) { this.deathTime += dt; return this.deathTime >= 0.8; },
        dispose() { this.releases++; this.root.removeFromParent(); } };
      views.push(view); return view;
    },
  });
  const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) world.tick(1 / 60); };
  const finish = () => {
    for (let i = 0; i < 60 * 90 && world.phase === 'running'; i++) world.tick(1 / 60);
    assert.notEqual(world.phase, 'running', 'wave must settle within its route/spawn budget');
    return world.summary();
  };
  return { world, views, tick, finish };
}

// Transition while a corpse remains: preserve economy, towers and lives; reset only wave counters.
const data = structuredClone(DEMO_CONTENT);
const level = data.levels.find(l => l.id === 'placement-demo');
level.waveIds = ['placement-wave', 'placement-wave-2']; level.baseLives = 1;
for (const id of level.waveIds) data.waves.find(w => w.id === id).entries[0].count = 1;
data.waves.find(w => w.id === 'placement-wave-2').entries[0].enemyId = 'unreachable';
data.enemies.push({ id: 'unreachable', maxHealth: 1e6, moveSpeed: 10, reward: 5 });
const f = create(data); f.world.place([1, 0], 'arrow-tower');
f.world.startWave(); const first = f.finish();
assert.equal(first.phase, 'intermission'); assert.equal(first.dying, 1);
assert.equal(first.waveKills, 1); assert.equal(first.waveLeaks, 0); assert.equal(first.gold, 85);
const tower = [...f.world.towers.values()][0], corpseId = f.world.inspect().enemies[0].id;
f.world.togglePause(); const frozen = f.world.inspect();
assert.equal(f.world.startWave(), false); f.tick(1); assert.deepEqual(f.world.inspect(), frozen);
f.world.togglePause();
assert.equal(f.world.startWave(), true); assert.equal(f.world.startWave(), false);
let state = f.world.summary();
assert.equal(state.wave, 2); assert.equal(state.elapsed, 0); assert.equal(state.waveKills, 0); assert.equal(state.kills, 1);
assert.equal(state.waveLeaks, 0); assert.equal(state.gold, 85); assert.equal(state.lives, 1); assert.equal(state.dying, 1);
assert.equal([...f.world.towers.values()][0], tower); assert.equal(tower.target, null);
f.tick(1 / 60);
assert.ok(f.world.inspect().enemies.some(e => e.id === corpseId));
assert.equal(new Set(f.world.inspect().enemies.map(e => e.id)).size, 2);
const lost = f.finish();
assert.equal(lost.phase, 'lost'); assert.equal(lost.wave, 2); assert.equal(lost.lives, 0);
assert.equal(lost.kills, 1); assert.equal(lost.waveKills, 0); assert.equal(lost.waveLeaks, 1);
assert.equal(lost.gold, 85, 'failure retains earlier rewards but never pays the failed wave reward');
assert.equal(f.world.startWave(), false);
f.world.reset(); state = f.world.summary();
assert.equal(state.wave, 0); assert.equal(state.waveKills, 0); assert.equal(state.waveLeaks, 0); assert.equal(state.kills, 0);
assert.equal(state.lives, 1); assert.equal(state.gold, 100); assert.equal(state.phase, 'ready');
f.world.dispose(); assert.ok(f.views.every(view => view.releases === 1));

// Authored three-wave game, with the real arrow-tower launch geometry.
const catalog = new ContentCatalog(DEMO_CONTENT), demo = catalog.level('placement-demo');
const perWave = demo.waveIds.map(id => catalog.wave(id));
const total = perWave.reduce((sum, w) => sum + w.entries.reduce((n, e) => n + e.count, 0), 0);
const balance = [];
for (const additions of [
  [[[1, 0], [3, 1]], [[0, 2], [5, 1]], [[1, 2], [4, 1]]],
  [[[1, 0], [3, 1], [5, 1]], [], []],
]) {
  const game = create(DEMO_CONTENT), reports = [];
  let built = 0, rewards = 0, previousKills = 0, previousLeaks = 0;
  for (let index = 0; index < perWave.length; index++) {
    for (const cell of additions[index]) { assert.equal(game.world.place(cell, 'arrow-tower'), null); built++; }
    assert.equal(game.world.startWave(), true);
    const report = game.finish(); reports.push(report);
    assert.equal(report.waveKills, report.kills - previousKills); assert.equal(report.waveLeaks, report.leaks - previousLeaks);
    previousKills = report.kills; previousLeaks = report.leaks;
    if (report.phase !== 'lost') rewards += perWave[index].reward;
    assert.equal(report.gold, demo.startingGold - built * catalog.tower('arrow-tower').cost + report.kills * catalog.enemy('combat-skeleton').reward + rewards);
    assert.equal(report.lives, demo.baseLives - report.leaks);
    if (report.phase === 'lost') break;
    game.tick(2); const waiting = game.world.summary(); game.tick(3);
    assert.deepEqual(game.world.summary(), waiting, 'intermission must not spawn, advance the wave clock or pay rewards again');
  }
  balance.push(reports);
  game.world.reset(); assert.equal(game.world.summary().wave, 0); assert.equal(game.world.gold, 100);
  game.world.dispose(); assert.ok(game.views.every(view => view.releases === 1));
}
assert.equal(balance[0].at(-1).phase, 'won'); assert.equal(balance[0].at(-1).wave, 3);
assert.equal(balance[0].at(-1).kills + balance[0].at(-1).leaks, total);
assert.equal(balance[1].at(-1).phase, 'lost'); assert.equal(balance[1].at(-1).wave, 3);
assert.equal(assets.inspect().active, 0); assert.equal(assets.inspect().arrows, 0);
assets.dispose();
fs.mkdirSync('artifacts/waves', { recursive: true });
fs.writeFileSync('artifacts/waves/balance.json', JSON.stringify(balance, null, 2));
console.log('Waves: corpse overlap, paused/double start, per-wave versus total counters, economy/life/tower continuity, later-wave loss priority, reset, authored three-wave victory and insufficient-defense loss passed.');
