import { Group, Vector3 } from 'three';
import { BuildGrid, cellKey } from './BuildGrid';
import { EnemyUnit, type ViewFactory } from './EnemyUnit';
import { ProjectileUnit, type ProjectileView } from './ProjectileUnit';
import { RoutePath } from './RoutePath';
import { TowerUnit, type TowerView } from './TowerUnit';
import type { ContentCatalog } from './data/catalog';
import type { GridCell, LevelData, Vec2Data, WaveData } from './data/types';

export type PlacementFailure = 'paused' | 'finished' | 'unbuildable' | 'occupied' | 'insufficient-gold';
export type BattlePhase = 'ready' | 'running' | 'intermission' | 'won' | 'lost';
export interface BattleViews {
  tower(position: Vec2Data): TowerView;
  enemy: ViewFactory;
  projectile(): ProjectileView;
}

// Owns membership, the fixed clock and settlement. Units own their actual behavior.
export class BattleWorld {
  readonly root = new Group(); // Dynamic enemies and arrows; towers are mounted by the build UI.
  readonly level: LevelData;
  readonly grid: BuildGrid;
  private readonly placed = new Map<string, TowerUnit>();
  private readonly enemies = new Map<string, EnemyUnit>();
  private readonly projectiles = new Map<number, ProjectileUnit>();
  private readonly routes = new Map<string, RoutePath>();
  private nextTowerId = 1;
  private nextArrowId = 1;
  private closed = false;
  private accumulator = 0;
  private step = 0;
  private waveIndex = -1;
  private wave: WaveData | null = null;
  private spawned: number[] = [];
  private created = 0;
  private active = 0;
  private kills = 0;
  private leaks = 0;
  private waveStartKills = 0;
  private waveStartLeaks = 0;
  private shots = 0;
  private hits = 0;
  gold: number;
  lives: number;
  paused = false;
  phase: BattlePhase = 'ready';
  generation = 1;
  readonly fixedStep = 1 / 60;

  constructor(private readonly catalog: ContentCatalog, levelId: string, private readonly views: BattleViews) {
    this.level = catalog.level(levelId);
    const map = catalog.map(this.level.mapId);
    if (!map.buildGrid) throw new Error(`地图未定义建造网格：${this.level.mapId}`);
    this.grid = new BuildGrid(map.buildGrid);
    for (const id of map.routeIds) this.routes.set(id, new RoutePath(catalog.route(id)));
    this.gold = this.level.startingGold;
    this.lives = this.level.baseLives;
  }
  get towers(): ReadonlyMap<string, TowerUnit> { return this.placed; }
  checkPlacement(cell: GridCell, towerId: string): PlacementFailure | null {
    const tower = this.catalog.tower(towerId);
    if (this.paused) return 'paused';
    if (this.phase === 'won' || this.phase === 'lost') return 'finished';
    if (!this.grid.canBuild(cell)) return 'unbuildable';
    if (this.placed.has(cellKey(cell))) return 'occupied';
    if (this.gold < tower.cost) return 'insufficient-gold';
    return null;
  }
  place(cell: GridCell, towerId: string): PlacementFailure | null {
    this.requireOpen();
    const failure = this.checkPlacement(cell, towerId);
    if (failure) return failure;
    const definition = this.catalog.tower(towerId), position = this.grid.center(cell);
    const view = this.views.tower(position);
    this.placed.set(cellKey(cell), new TowerUnit(this.nextTowerId++, definition, [cell[0], cell[1]], position, view));
    this.gold -= definition.cost;
    return null;
  }
  startWave(): boolean {
    this.requireOpen();
    if (this.paused || (this.phase !== 'ready' && this.phase !== 'intermission')) return false;
    this.wave = this.catalog.wave(this.level.waveIds[++this.waveIndex]);
    this.spawned = this.wave.entries.map(() => 0);
    this.waveStartKills = this.kills;
    this.waveStartLeaks = this.leaks;
    this.step = 0;
    this.accumulator = 0;
    this.phase = 'running';
    return true;
  }
  togglePause(): void { this.requireOpen(); this.paused = !this.paused; }
  tick(delta: number): void {
    if (this.closed || this.paused) return;
    this.accumulator += Math.min(delta, 0.25);
    while (this.accumulator + 1e-9 >= this.fixedStep) {
      this.advance();
      this.accumulator = Math.max(0, this.accumulator - this.fixedStep);
    }
    for (const [id, enemy] of this.enemies) {
      enemy.present();
      if (enemy.released) this.enemies.delete(id);
    }
    for (const tower of this.placed.values()) tower.present();
    for (const arrow of this.projectiles.values()) arrow.present();
  }
  private advance(): void {
    const dt = this.fixedStep;
    if (this.phase !== 'running') {
      for (const enemy of this.enemies.values()) if (enemy.state === 'dead') enemy.tick(dt);
      for (const tower of this.placed.values()) tower.finish(dt);
      return;
    }
    const wave = this.wave!;
    wave.entries.forEach((entry, index) => {
      while (this.spawned[index] < entry.count && this.spawned[index] * entry.interval <= this.step * dt + 1e-9) {
        const id = `${this.generation}:${++this.created}`;
        const enemy = new EnemyUnit(id, this.catalog.enemy(entry.enemyId), entry.routeId,
          this.routes.get(entry.routeId)!, this.views.enemy);
        this.enemies.set(id, enemy); this.root.add(enemy.view.root);
        this.spawned[index]++; this.active++;
      }
    });
    // Movement/escapes precede impacts. A target reaching the exit this step cannot be hit afterward.
    for (const [id, enemy] of this.enemies) {
      enemy.tick(dt);
      if (enemy.state === 'escaped') {
        this.enemies.delete(id); this.active--; this.leaks++;
        this.lives = Math.max(0, this.lives - 1);
      }
    }
    this.step++;
    if (this.lives === 0) { this.finishWave('lost'); return; }
    for (const [id, arrow] of this.projectiles) {
      const result = arrow.tick(dt);
      if (result === 'flying') continue;
      if (result === 'hit') {
        this.hits++;
        if (arrow.target.damage(arrow.damage)) {
          this.kills++; this.active--; this.gold += arrow.target.definition.reward;
        }
      }
      arrow.dispose(); this.projectiles.delete(id);
    }
    for (const tower of this.placed.values()) tower.tick(dt, this.enemies.values(), (source, target) => {
      const origin = new Vector3(); source.view.launchPosition(source.heading, origin);
      const arrow = new ProjectileUnit(this.nextArrowId++, target, origin,
        source.definition.projectileSpeed, source.definition.damage, this.views.projectile());
      this.projectiles.set(arrow.id, arrow); this.root.add(arrow.view.root); this.shots++;
    });
    if (this.active === 0 && wave.entries.every((entry, index) => this.spawned[index] === entry.count)) {
      this.gold += wave.reward;
      this.finishWave(this.waveIndex === this.level.waveIds.length - 1 ? 'won' : 'intermission');
    }
  }
  private finishWave(phase: BattlePhase): void {
    this.phase = phase;
    for (const arrow of this.projectiles.values()) arrow.dispose();
    this.projectiles.clear();
    for (const tower of this.placed.values()) tower.finish(0);
  }
  reset(): void {
    this.requireOpen(); this.clear();
    this.gold = this.level.startingGold; this.lives = this.level.baseLives;
    this.paused = false; this.phase = 'ready'; this.generation++;
    this.wave = null; this.waveIndex = -1; this.spawned = [];
    this.step = this.accumulator = this.created = this.active = this.kills = this.leaks = this.shots = this.hits = 0;
    this.waveStartKills = this.waveStartLeaks = 0;
  }
  private clear(): void {
    for (const arrow of this.projectiles.values()) arrow.dispose();
    for (const tower of this.placed.values()) tower.dispose();
    for (const enemy of this.enemies.values()) enemy.dispose();
    this.projectiles.clear(); this.placed.clear(); this.enemies.clear(); this.active = 0;
  }
  private requireOpen(): void { if (this.closed) throw new Error('战斗世界已经释放'); }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.clear(); this.root.removeFromParent();
  }
  summary() {
    return { levelId: this.level.id, gold: this.gold, lives: this.lives, phase: this.phase,
      paused: this.paused, generation: this.generation, wave: this.waveIndex + 1,
      totalWaves: this.level.waveIds.length, elapsed: this.step * this.fixedStep,
      active: this.active, dying: this.enemies.size - this.active, kills: this.kills, leaks: this.leaks,
      waveKills: this.kills - this.waveStartKills, waveLeaks: this.leaks - this.waveStartLeaks,
      shots: this.shots, hits: this.hits, arrows: this.projectiles.size,
      pending: this.wave ? this.wave.entries.reduce((sum, entry, i) => sum + entry.count - this.spawned[i], 0) : 0 };
  }
  inspect() {
    return { ...this.summary(),
      towers: [...this.placed.values()].map(tower => ({ id: tower.id, definitionId: tower.definition.id,
        cell: tower.cell, position: tower.position, target: tower.target?.id ?? null, attackAge: tower.attackAge, heading: tower.heading })),
      enemies: [...this.enemies.values()].map(enemy => ({ id: enemy.id, state: enemy.state, health: enemy.health,
        progress: enemy.progress, position: enemy.position.toArray() })),
      projectiles: [...this.projectiles.values()].map(arrow => ({ id: arrow.id, target: arrow.target.id, position: arrow.position.toArray() })),
    };
  }
}
