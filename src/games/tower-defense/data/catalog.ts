import type { ContentSource, EnemyData, LevelData, MapData, RouteData, TowerData, WaveData } from './types';

function indexById<T extends { id: string }>(kind: string, values: readonly T[]): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (!value.id.trim()) throw new Error(`${kind} 缺少 id`);
    if (result.has(value.id)) throw new Error(`${kind} id 重复：${value.id}`);
    result.set(value.id, value);
  }
  return result;
}

function requireRef<T>(kind: string, id: string, values: ReadonlyMap<string, T>): T {
  const value = values.get(id);
  if (!value) throw new Error(`${kind} 引用不存在：${id}`);
  return value;
}

export class ContentCatalog {
  private readonly routes: ReadonlyMap<string, RouteData>;
  private readonly enemies: ReadonlyMap<string, EnemyData>;
  private readonly towers: ReadonlyMap<string, TowerData>;
  private readonly waves: ReadonlyMap<string, WaveData>;
  private readonly maps: ReadonlyMap<string, MapData>;
  private readonly levels: ReadonlyMap<string, LevelData>;

  constructor(source: ContentSource) {
    this.routes = indexById('路线', source.routes);
    this.enemies = indexById('敌人', source.enemies);
    this.towers = indexById('塔', source.towers);
    this.waves = indexById('波次', source.waves);
    this.maps = indexById('地图', source.maps);
    this.levels = indexById('关卡', source.levels);
    this.validate(source);
  }

  route(id: string): RouteData { return requireRef('路线', id, this.routes); }
  enemy(id: string): EnemyData { return requireRef('敌人', id, this.enemies); }
  tower(id: string): TowerData { return requireRef('塔', id, this.towers); }
  wave(id: string): WaveData { return requireRef('波次', id, this.waves); }
  map(id: string): MapData { return requireRef('地图', id, this.maps); }
  level(id: string): LevelData { return requireRef('关卡', id, this.levels); }

  private validate(source: ContentSource): void {
    for (const route of source.routes) {
      if (route.waypoints.length < 2) throw new Error(`路线至少需要两个点：${route.id}`);
      if (route.waypoints.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value)))) {
        throw new Error(`路线坐标无效：${route.id}`);
      }
      let totalLength = 0;
      for (let index = 1; index < route.waypoints.length; index += 1) {
        const length = Math.hypot(...route.waypoints[index].map((value, axis) => value - route.waypoints[index - 1][axis]));
        if (length === 0) {
          throw new Error(`路线存在零长度线段：${route.id}/${index - 1}`);
        }
        totalLength += length;
      }
      if (!Number.isFinite(totalLength)) throw new Error(`路线总长度无效：${route.id}`);
    }
    for (const enemy of source.enemies) {
      if (!Number.isFinite(enemy.maxHealth) || enemy.maxHealth <= 0 ||
        !Number.isFinite(enemy.moveSpeed) || enemy.moveSpeed <= 0 || !Number.isFinite(enemy.reward) || enemy.reward < 0) {
        throw new Error(`敌人数值无效：${enemy.id}`);
      }
    }
    for (const tower of source.towers) {
      if (!Number.isFinite(tower.cost) || tower.cost < 0) throw new Error(`塔费用无效：${tower.id}`);
      if ([tower.range, tower.damage, tower.cooldown, tower.windup, tower.projectileSpeed]
        .some(value => !Number.isFinite(value) || value <= 0) || tower.windup > tower.cooldown) {
        throw new Error(`塔攻击参数无效：${tower.id}`);
      }
    }
    for (const map of source.maps) {
      if (map.routeIds.length === 0) throw new Error(`地图没有路线：${map.id}`);
      map.routeIds.forEach(routeId => requireRef('地图路线', routeId, this.routes));
      const grid = map.buildGrid;
      if (grid) {
        if (grid.origin.length !== 2 || grid.origin.some(value => !Number.isFinite(value)) ||
          !Number.isFinite(grid.cellSize) || grid.cellSize <= 0) throw new Error(`建造网格参数无效：${map.id}`);
        const cells = new Set<string>();
        for (const cell of grid.buildableCells) {
          if (cell.length !== 2 || cell.some(value => !Number.isSafeInteger(value))) throw new Error(`建造格坐标无效：${map.id}`);
          if (cells.has(cell.join(','))) throw new Error(`建造格重复：${map.id}/${cell}`);
          cells.add(cell.join(','));
        }
      }
    }
    for (const wave of source.waves) {
      if (wave.entries.length === 0) throw new Error(`波次没有生成项：${wave.id}`);
      if (!Number.isFinite(wave.reward) || wave.reward < 0) throw new Error(`波次奖励无效：${wave.id}`);
      for (const entry of wave.entries) {
        requireRef('波次敌人', entry.enemyId, this.enemies);
        requireRef('波次路线', entry.routeId, this.routes);
        if (!Number.isSafeInteger(entry.count) || entry.count <= 0 || !Number.isFinite(entry.interval) || entry.interval < 0) throw new Error(`波次生成参数无效：${wave.id}`);
      }
    }
    for (const level of source.levels) {
      const map = requireRef('关卡地图', level.mapId, this.maps);
      if (!Number.isFinite(level.startingGold) || level.startingGold < 0 ||
        !Number.isSafeInteger(level.baseLives) || level.baseLives <= 0) throw new Error(`关卡初始参数无效：${level.id}`);
      if (level.waveIds.length === 0) throw new Error(`关卡没有波次：${level.id}`);
      level.waveIds.forEach(waveId => {
        const wave = requireRef('关卡波次', waveId, this.waves);
        wave.entries.forEach(entry => {
          if (!map.routeIds.includes(entry.routeId)) {
            throw new Error(`波次路线不属于关卡地图：${level.id}/${entry.routeId}`);
          }
        });
      });
    }
  }
}
