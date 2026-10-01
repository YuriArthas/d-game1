import { Box3, BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { DEMO_CONTENT } from '../tower-defense/data/content';
import { ContentCatalog } from '../tower-defense/data/catalog';
import type { WaveData } from '../tower-defense/data/types';

import { RoutePath } from '../tower-defense/RoutePath';
import { EnemyUnit, type UnitView } from '../tower-defense/EnemyUnit';

type ViewFactory = (color: string) => UnitView;

export class EnemyView implements UnitView {
  readonly root = new Group();
  private readonly body: Mesh<SphereGeometry, MeshStandardMaterial>;
  private deathTime = 0;
  private disposed = false;

  constructor(color: string) {
    this.body = new Mesh(new SphereGeometry(0.2, 12, 8), new MeshStandardMaterial({ color }));
    this.body.castShadow = true;
    this.body.position.y = 0.22;
    this.root.add(this.body);
  }
  sync(position: Vector3): void { this.root.position.copy(position); }
  update(_delta: number): void {}
  markDead(): void { this.body.material.color.set('#ee6474'); }
  // A deliberately simple death presentation, not a skeleton animation.
  updateDeath(delta: number): boolean {
    this.deathTime += delta;
    this.body.scale.setScalar(Math.max(0, 1 - this.deathTime / 0.8));
    return this.deathTime >= 0.8;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.body.geometry.dispose();
    this.body.material.dispose();
  }
}

export class GameWorld {
  readonly root = new Group();
  readonly bounds: Box3;
  readonly wave: WaveData;
  readonly plannedCount: number;
  private readonly routes = new Map<string, RoutePath>();
  private readonly lines: Line<BufferGeometry, LineBasicMaterial>[] = [];
  private readonly units = new Map<string, EnemyUnit>();
  private spawned: number[] = [];
  private accumulator = 0;
  private step = 0;
  private disposed = false;
  private created = 0;
  private released = 0;
  private dead = 0;
  private escaped = 0;
  private active = 0;
  private complete = false;
  private totalCreated = 0;
  private totalReleased = 0;
  paused = true;
  generation = 0;
  renderMemory = { geometries: 0, textures: 0 };
  readonly fixedStep = 1 / 60;

  constructor(private readonly catalog: ContentCatalog, readonly levelId: string, readonly waveId: string,
    private readonly createView: ViewFactory = color => new EnemyView(color)) {
    const level = catalog.level(levelId);
    if (!level.waveIds.includes(waveId)) throw new Error(`波次不属于关卡：${levelId}/${waveId}`);
    this.wave = catalog.wave(waveId);
    this.plannedCount = this.wave.entries.reduce((sum, entry) => sum + entry.count, 0);
    for (const id of catalog.map(level.mapId).routeIds) {
      const route = new RoutePath(catalog.route(id));
      this.routes.set(id, route);
      const line = new Line(new BufferGeometry().setFromPoints([...route.points]), new LineBasicMaterial({ color: '#c2d9ce' }));
      line.position.y = 0.015;
      this.lines.push(line);
      this.root.add(line);
    }
    this.bounds = new Box3().setFromPoints([...this.routes.values()].flatMap(route => [...route.points])).expandByScalar(0.6);
    this.reset();
  }
  private requireOpen(): void { if (this.disposed) throw new Error('世界已经释放'); }
  start(): void { this.requireOpen(); this.paused = false; }
  pause(): void { this.requireOpen(); this.paused = true; }
  private clearUnits(): void {
    for (const unit of this.units.values()) { unit.dispose(); this.totalReleased++; }
    this.units.clear();
    this.active = 0;
  }
  reset(): void {
    this.requireOpen();
    this.clearUnits();
    this.spawned = this.wave.entries.map(() => 0);
    this.step = this.accumulator = this.created = this.released = this.dead = this.escaped = 0;
    this.complete = false;
    this.paused = true;
    this.generation++;
  }
  kill(count: number): void {
    this.requireOpen();
    for (const unit of this.units.values()) {
      if (count <= 0) break;
      if (unit.kill()) { this.dead++; this.active--; count--; }
    }
    this.complete = this.created === this.plannedCount && this.active === 0;
  }
  tick(delta: number): void {
    if (this.disposed || this.paused || (this.complete && this.units.size === 0)) return;
    // Bound catch-up after a background tab; preserve the fractional fixed step.
    this.accumulator += Math.min(delta, 0.25);
    while (this.accumulator + 1e-9 >= this.fixedStep) {
      this.advance();
      this.accumulator = Math.max(0, this.accumulator - this.fixedStep);
    }
    // Exactly one presentation advance per rendered frame, using simulated time only.
    for (const [id, unit] of this.units) {
      unit.present();
      if (unit.released) this.releaseUnit(id);
    }
  }
  private advance(): void {
    const running = !this.complete;
    const colors = ['#e9b85e', '#70b7ee', '#b998eb', '#ef9474', '#80d4aa'];
    if (running) this.wave.entries.forEach((entry, index) => {
      // Entries run concurrently, first spawn at t=0, zero interval is a burst.
      while (this.spawned[index] < entry.count && this.spawned[index] * entry.interval <= this.step * this.fixedStep + 1e-9) {
        const id = `${this.generation}:${++this.created}`;
        const unit = new EnemyUnit(id, this.catalog.enemy(entry.enemyId), entry.routeId,
          this.routes.get(entry.routeId)!, () => this.createView(colors[index % colors.length]));
        this.units.set(id, unit);
        this.active++;
        this.root.add(unit.view.root);
        this.totalCreated++;
        this.spawned[index]++;
      }
    });
    for (const [id, unit] of this.units) {
      unit.tick(this.fixedStep);
      if (unit.released) {
        this.escaped++;
        this.active--;
        this.releaseUnit(id);
      }
    }
    if (running) this.step++;
    this.complete = this.created === this.plannedCount && this.active === 0;
  }
  private releaseUnit(id: string): void {
    this.units.delete(id);
    this.released++;
    this.totalReleased++;
  }
  summary() {
    return {
      levelId: this.levelId, waveId: this.waveId, generation: this.generation, paused: this.paused, closed: this.disposed, complete: this.complete,
      elapsed: this.step * this.fixedStep, plannedCount: this.plannedCount,
      activeCount: this.active,
      dyingCount: this.units.size - this.active,
      deadCount: this.dead, escapedCount: this.escaped, releasedCount: this.released, createdCount: this.created,
      pendingCount: this.plannedCount - this.created, retainedCount: this.units.size,
      totalCreated: this.totalCreated, totalReleased: this.totalReleased,
      renderMemory: this.renderMemory,
    };
  }
  inspect() {
    return {
      ...this.summary(),
      units: [...this.units.values()].map(unit => ({ id: unit.id, definitionId: unit.definition.id, routeId: unit.routeId,
        state: unit.state, health: unit.health, progress: unit.progress, animation: unit.view.inspect?.() })),
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = true;
    this.clearUnits();
    this.lines.forEach(line => { line.removeFromParent(); line.geometry.dispose(); line.material.dispose(); });
    this.root.removeFromParent();
  }
}

export function createDemoWorld(levelId: string, waveId: string, createView?: ViewFactory): GameWorld {
  return new GameWorld(new ContentCatalog(DEMO_CONTENT), levelId, waveId, createView);
}
