import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Group, Vector3 } from 'three';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--target', 'es2022',
  '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck', '--outDir', 'artifacts/runtime-tests',
  'src/games/runtime-test/RuntimeWorld.ts', 'src/games/rendering/cloneSkeletonModel.ts',
  'src/games/tower-defense/BattleWorld.ts',
  'src/games/tower-defense/ArrowTowerViews.ts', 'src/vite-env.d.ts',
  'src/games/diagnostics/GpuTimer.ts'], { stdio: 'inherit' });
// Resolve the compiler's extensionless local imports only within the test output.
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/artifacts/runtime-tests/') && specifier.startsWith('.') && !specifier.endsWith('.js')) specifier += '.js';
  return next(specifier, context);
} });
const { ContentCatalog } = await import('../../artifacts/runtime-tests/tower-defense/data/catalog.js');
const { DEMO_CONTENT } = await import('../../artifacts/runtime-tests/tower-defense/data/content.js');
const { GameWorld } = await import('../../artifacts/runtime-tests/runtime-test/RuntimeWorld.js');
const { EnemyUnit } = await import('../../artifacts/runtime-tests/tower-defense/EnemyUnit.js');
const { RoutePath } = await import('../../artifacts/runtime-tests/tower-defense/RoutePath.js');
let checks = 0;
function rejects(edit, pattern) {
  const source = structuredClone(DEMO_CONTENT); edit(source);
  assert.throws(() => new ContentCatalog(source), pattern); checks++;
}
rejects(s => s.enemies.push(s.enemies[0]), /重复/);
rejects(s => s.enemies[0].moveSpeed = NaN, /数值无效/);
rejects(s => s.enemies[0].maxHealth = Infinity, /数值无效/);
rejects(s => s.waves[0].entries[0].count = 1.5, /生成参数无效/);
rejects(s => s.waves[0].entries[0].interval = Infinity, /生成参数无效/);
rejects(s => s.waves[0].reward = NaN, /奖励无效/);
rejects(s => s.levels[0].baseLives = Infinity, /初始参数无效/);
rejects(s => s.routes[0].waypoints[0][0] = Infinity, /坐标无效/);
rejects(s => s.routes[0].waypoints[1] = s.routes[0].waypoints[0], /零长度/);
rejects(s => s.routes[0].waypoints = [[-1e308, 0, 0], [1e308, 0, 0]], /总长度无效/);
rejects(s => s.waves[0].entries[0].enemyId = 'missing', /引用不存在/);
rejects(s => s.waves[0].entries[0].routeId = 'p2-lane-1', /不属于关卡/);
rejects(s => s.levels[0].waveIds = [], /没有波次/);
const source = structuredClone(DEMO_CONTENT);
source.waves[0].entries = [
  { enemyId: 'p2-demo-enemy', count: 4, interval: 0.5, routeId: 'p2-demo-route' },
  { enemyId: 'p2-lifecycle-enemy', count: 2, interval: 0, routeId: 'p2-demo-route' },
];
const catalog = new ContentCatalog(source);
const world = new GameWorld(catalog, 'p2-demo', 'p2-demo-wave');
assert.equal(world.inspect().createdCount, 0);
world.start(); world.tick(1 / 60);
assert.equal(world.inspect().createdCount, 3); // both entries used, interval zero respected
for (let i = 0; i < 90; i++) world.tick(1 / 60);
assert.equal(world.inspect().createdCount, 6); // no silent cap at three
world.pause();
const frozen = world.inspect(); world.tick(1); assert.deepEqual(world.inspect(), frozen);
world.kill(2);
assert.equal(world.inspect().deadCount, 2); assert.equal(world.inspect().dyingCount, 2);
const deathFrozen = world.inspect(); world.tick(2); assert.deepEqual(world.inspect(), deathFrozen);
world.start(); for (let i = 0; i < 60; i++) world.tick(1 / 60);
assert.equal(world.inspect().releasedCount, 2);
for (let i = 0; i < 1600; i++) world.tick(1 / 60);
let report = world.inspect();
assert.equal(report.escapedCount, 4); assert.equal(report.releasedCount, 6);
assert.equal(report.retainedCount, 0); assert.equal(report.totalCreated, report.totalReleased);
for (let cycle = 0; cycle < 4; cycle++) {
  world.reset(); world.start(); world.tick(0.1);
  assert.equal(world.inspect().totalCreated - world.inspect().totalReleased, 3);
}
world.dispose(); world.dispose(); report = world.inspect();
assert.equal(report.totalCreated, report.totalReleased); assert.equal(report.retainedCount, 0);
assert.throws(() => world.reset(), /已经释放/);
// The same elapsed time split across render frames produces identical simulation state.
const a = new GameWorld(catalog, 'p2-demo', 'p2-demo-wave');
const b = new GameWorld(catalog, 'p2-demo', 'p2-demo-wave');
a.start(); b.start();
for (let i = 0; i < 120; i++) a.tick(1 / 60);
for (let i = 0; i < 20; i++) b.tick(0.1);
assert.deepEqual(a.inspect(), b.inspect());
for (let i = 0; i < 1800; i++) a.tick(1 / 60);
for (let i = 0; i < 300; i++) b.tick(0.1);
assert.deepEqual(a.inspect(), b.inspect()); a.dispose(); b.dispose();
// Editing the source count, speed and route changes the running world.
source.enemies[0].moveSpeed = 6;
source.routes[0].waypoints = [[0, 0, 0], [3, 0, 0]];
source.waves[0].entries = [{ enemyId: 'p2-demo-enemy', count: 7, interval: 0, routeId: 'p2-demo-route' }];
const changed = new GameWorld(new ContentCatalog(source), 'p2-demo', 'p2-demo-wave');
changed.start(); for (let i = 0; i < 40; i++) changed.tick(1 / 60);
assert.equal(changed.inspect().escapedCount, 7); changed.dispose();
console.log(`${checks} invalid-content cases passed; scheduling, pause, death, release, reset, fixed steps and edited content passed.`);

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
class RecordingView {
  root = new Group(); updates = []; deathUpdates = []; deathTime = 0; disposals = 0; inspections = 0;
  position = new Vector3(); direction = new Vector3();
  sync(position, direction) { this.position.copy(position); this.direction.copy(direction); }
  update(delta) { this.updates.push(delta); }
  markDead() {}
  updateDeath(delta) { this.deathUpdates.push(delta); this.deathTime += delta; return this.deathTime >= 0.8; }
  dispose() { this.disposals++; }
  inspect() { this.inspections++; return { time: this.updates.reduce((a, b) => a + b, 0), deathTime: this.deathTime }; }
}
const timedSource = structuredClone(DEMO_CONTENT);
timedSource.waves[0].entries = [{ enemyId: 'p2-demo-enemy', count: 3, interval: 0.1, routeId: 'p2-demo-route' }];
const views = [];
const timed = new GameWorld(new ContentCatalog(timedSource), 'p2-demo', 'p2-demo-wave', () => {
  const view = new RecordingView(); views.push(view); return view;
});
timed.start(); timed.tick(10); // catch-up capped at 0.25s, even for animation
assert.equal(views.length, 3);
for (const view of views) assert.equal(view.updates.length, 1); // one update, not 15
near(views[0].updates[0], 0.25);
near(views[1].updates[0], 0.15);
near(views[2].updates[0], 0.05); // new actors receive only their own simulated lifetime
timed.summary(); timed.summary();
assert.ok(views.every(view => view.inspections === 0));
timed.kill(10);
const completed = timed.summary();
assert.equal(completed.complete, true);
assert.equal(completed.activeCount, 0);
assert.equal(completed.dyingCount, 3);
assert.equal(completed.paused, false); // completion does not freeze dying views
timed.pause(); timed.tick(10);
assert.ok(views.every(view => view.deathTime === 0));
timed.start(); timed.tick(0.25);
assert.equal(timed.summary().elapsed, completed.elapsed); // wave clock is already stopped
assert.ok(views.every(view => Math.abs(view.deathTime - 0.25) < 1e-9));
for (let i = 0; i < 3; i++) timed.tick(0.25);
assert.equal(timed.summary().retainedCount, 0);
assert.ok(views.every(view => view.disposals === 1));
timed.reset();
assert.equal(timed.summary().complete, false);
assert.equal(timed.summary().totalCreated, timed.summary().totalReleased);
timed.start(); timed.tick(1 / 60); timed.kill(1);
assert.equal(timed.summary().activeCount, 0);
assert.equal(timed.summary().pendingCount, 2);
assert.equal(timed.summary().complete, false); // zero living enemies alone is not completion
timed.tick(0.1);
assert.equal(timed.summary().createdCount, 2);
timed.dispose();

// A transition between fixed steps must not apply earlier walking time to death.
const view = new RecordingView();
const route = new RoutePath({ id: 'corner', waypoints: [[-4, 0, -2], [-1, 0, -2], [-1, 0, 1]] });
const enemy = new EnemyUnit('transition', { id: 'enemy', maxHealth: 10, moveSpeed: 1, reward: 1 }, 'corner', route, () => view);
assert.deepEqual(view.direction.toArray(), [1, 0, 0]); // heading comes from route at birth
enemy.tick(0.1); enemy.kill(); enemy.tick(0.05); enemy.present();
assert.equal(view.updates.length, 0);
near(view.deathTime, 0.05);
assert.equal(enemy.kill(), false);
enemy.dispose();
// Death on the final fixed step still presents the final position, with zero death time.
const finalView = new RecordingView();
const finalEnemy = new EnemyUnit('final-step', { id: 'enemy', maxHealth: 10, moveSpeed: 1, reward: 1 }, 'corner', route, () => finalView);
finalEnemy.tick(0.2); finalEnemy.damage(10); finalEnemy.present();
assert.deepEqual(finalView.position.toArray(), finalEnemy.position.toArray());
assert.equal(finalView.deathTime, 0);
assert.equal(finalView.updates.length, 0);
finalEnemy.dispose();
const position = new Vector3(), direction = new Vector3();
route.sample(0.5, position, direction);
assert.deepEqual(position.toArray(), [-1, 0, -2]);
assert.deepEqual(direction.toArray(), [0, 0, 1]);
console.log('Wave completion before view cleanup, pause during cleanup, per-frame animation, spawn age, catch-up cap, mid-frame death, route heading and cheap summaries passed.');

await import('./skinning.mjs');
await import('./placement.mjs');
await import('./combat.mjs');
await import('./waves.mjs');
await import('./arrow-views.mjs');

const { GpuTimer } = await import('../../artifacts/runtime-tests/diagnostics/GpuTimer.js');
function gpuMock(supported = true) {
  const gl = { QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2, CURRENT_QUERY: 3, alive: new Set(), active: null, disjoint: false, ready: false,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 } : null,
    isContextLost: () => false, getParameter() { return this.disjoint; },
    getQuery() { return this.active; }, createQuery() { const q = {}; this.alive.add(q); return q; },
    beginQuery(_, q) { assert.equal(this.active, null); this.active = q; }, endQuery() { this.active = null; },
    getQueryParameter(_, key) { return key === this.QUERY_RESULT_AVAILABLE ? this.ready : 2500000; },
    deleteQuery(q) { this.alive.delete(q); },
  };
  return gl;
}
const gpuSample = { gpuMs: null, gpuFrame: null, gpuStatus: '' };
const unsupported = new GpuTimer(gpuMock(false), gpuSample);
unsupported.begin(); unsupported.end(1); assert.equal(gpuSample.gpuMs, null); assert.equal(gpuSample.gpuStatus, '不可用'); unsupported.dispose();
const gl = gpuMock(); const gpu = new GpuTimer(gl, gpuSample);
for (let frame = 1; frame < 20; frame++) { gpu.begin(); gpu.end(frame); }
assert.equal(gl.alive.size, 4); // bounded pending queue
assert.equal(gpuSample.gpuMs, null); // never read unavailable result
 gl.ready = true; gpu.begin(); gpu.end(20); assert.equal(gpuSample.gpuMs, 2.5); assert.equal(gpuSample.gpuFrame, 4);
gl.disjoint = true; gpu.begin(); gpu.end(21); assert.equal(gpuSample.gpuMs, null); assert.equal(gl.alive.size, 0);
gl.disjoint = false; gpu.begin(); gpu.dispose(); assert.equal(gl.active, null); assert.equal(gl.alive.size, 0);
console.log('GPU timer: unsupported, bounded async queries, nanosecond conversion, disjoint invalidation and disposal passed.');
