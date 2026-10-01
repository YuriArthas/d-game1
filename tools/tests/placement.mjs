import assert from 'node:assert/strict';
import { Group } from 'three';
import { ContentCatalog } from '../../artifacts/runtime-tests/tower-defense/data/catalog.js';
import { DEMO_CONTENT } from '../../artifacts/runtime-tests/tower-defense/data/content.js';
import { BattleWorld } from '../../artifacts/runtime-tests/tower-defense/BattleWorld.js';

const catalog = new ContentCatalog(DEMO_CONTENT);
const views = [];
const createView = position => {
  const view = { root: new Group(), position, released: 0, dispose() { this.released++; } };
  views.push(view); return view;
};
const factories = { tower: createView, enemy: () => { throw new Error('unexpected enemy'); }, projectile: () => { throw new Error('unexpected projectile'); } };
const world = new BattleWorld(catalog, 'placement-demo', factories);
assert.throws(() => new BattleWorld(catalog, 'p2-demo', factories), /未定义建造网格/);
const grid = world.grid;
for (const cell of grid.data.buildableCells) assert.deepEqual(grid.cellAt(...grid.center(cell)), cell);
assert.deepEqual(grid.cellAt(-12.001, -8.001), [-1, -1]);
assert.deepEqual(grid.cellAt(-8, -8), [1, 0]);
assert.equal(grid.canBuild(grid.cellAt(12, 8)), false);
// Authored build cells leave every segment of this map's route unobstructed.
const route = catalog.route('placement-route');
for (let i = 1; i < route.waypoints.length; i++) {
  const a = route.waypoints[i - 1], b = route.waypoints[i];
  for (let step = 0; step <= 40; step++) {
    const t = step / 40;
    assert.equal(grid.canBuild(grid.cellAt(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t)), false);
  }
}
assert.equal(world.checkPlacement([0, 0], 'arrow-tower'), null);
assert.equal(world.gold, 100); assert.equal(views.length, 0); // preview has no transaction
assert.equal(world.place([1, 1], 'arrow-tower'), 'unbuildable'); // authored road
assert.equal(world.place([-1, -1], 'arrow-tower'), 'unbuildable');
assert.equal(world.gold, 100); assert.equal(views.length, 0);
world.togglePause();
assert.equal(world.place([0, 0], 'arrow-tower'), 'paused');
assert.equal(world.gold, 100); assert.equal(views.length, 0);
world.togglePause();
assert.equal(world.place([0, 0], 'arrow-tower'), null);
assert.equal(world.gold, 70); assert.deepEqual(views[0].position, [-10, -6]);
assert.equal(world.place([0, 0], 'arrow-tower'), 'occupied'); // stale preview/double submit
assert.equal(world.gold, 70); assert.equal(views.length, 1);
assert.equal(world.place([1, 0], 'arrow-tower'), null);
assert.equal(world.place([2, 0], 'arrow-tower'), null);
assert.equal(world.place([3, 0], 'arrow-tower'), 'insufficient-gold');
assert.equal(world.gold, 10); assert.equal(world.towers.size, 3); assert.equal(views.length, 3);
for (let i = 0; i < 3; i++) {
  world.togglePause(); world.reset();
  assert.equal(world.paused, false); assert.equal(world.gold, 100); assert.equal(world.towers.size, 0);
  assert.ok(views.every(view => view.released === 1));
  assert.equal(world.place([0, 0], 'arrow-tower'), null);
}
world.dispose(); world.dispose();
assert.ok(views.every(view => view.released === 1));
assert.throws(() => world.place([0, 0], 'arrow-tower'), /已经释放/);

const failing = new BattleWorld(catalog, 'placement-demo', { ...factories, tower: () => { throw new Error('resource failure'); } });
assert.throws(() => failing.place([0, 0], 'arrow-tower'), /resource failure/);
assert.equal(failing.gold, 100); assert.equal(failing.towers.size, 0); failing.dispose();

const edited = structuredClone(DEMO_CONTENT);
edited.levels.find(level => level.id === 'placement-demo').startingGold = 18;
edited.towers[0].cost = 9;
edited.maps.find(map => map.id === 'placement-map').buildGrid = { origin: [100, -20], cellSize: 3, buildableCells: [[-1, 2], [0, 2], [1, 2]] };
const changed = new BattleWorld(new ContentCatalog(edited), 'placement-demo', factories);
assert.equal(changed.place([-1, 2], 'arrow-tower'), null);
assert.deepEqual(changed.inspect().towers[0].position, [98.5, -12.5]);
assert.equal(changed.place([0, 2], 'arrow-tower'), null);
assert.equal(changed.gold, 0);
assert.equal(changed.place([1, 2], 'arrow-tower'), 'insufficient-gold'); changed.dispose();

for (const [edit, pattern] of [
  [source => source.towers[0].cost = -1, /费用无效/],
  [source => source.towers[0].cost = NaN, /费用无效/],
  [source => source.towers.push(source.towers[0]), /重复/],
  [source => source.maps[2].buildGrid.cellSize = 0, /网格参数无效/],
  [source => source.maps[2].buildGrid.origin[0] = Infinity, /网格参数无效/],
  [source => source.maps[2].buildGrid.buildableCells.push([0, 0]), /建造格重复/],
  [source => source.maps[2].buildGrid.buildableCells[0][0] = 0.5, /建造格坐标无效/],
]) {
  const source = structuredClone(DEMO_CONTENT); edit(source);
  assert.throws(() => new ContentCatalog(source), pattern);
}
console.log('Placement: grid coordinates, road/outside rejection, atomic cost/occupancy, duplicate submission, pause/reset/disposal, resource failure, edited content and seven invalid-content cases passed.');
