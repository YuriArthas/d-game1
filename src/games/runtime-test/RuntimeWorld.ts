import { Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';

export type EnemyState = 'active' | 'escaped';

export interface RouteDefinition {
  readonly waypoints: readonly Vector3[];
}

export class RouteFollower {
  private readonly segmentLengths: number[] = [];
  private readonly cumulative: number[] = [0];
  readonly length: number;

  constructor(private readonly route: RouteDefinition) {
    for (let index = 1; index < route.waypoints.length; index += 1) {
      const segmentLength = route.waypoints[index - 1].distanceTo(route.waypoints[index]);
      this.segmentLengths.push(segmentLength);
      this.cumulative.push(this.cumulative[index - 1] + segmentLength);
    }
    this.length = this.cumulative.at(-1) ?? 0;
  }

  get points(): readonly Vector3[] { return this.route.waypoints; }

  positionAt(progress: number, target = new Vector3()): Vector3 {
    if (this.route.waypoints.length === 0) return target.set(0, 0, 0);
    if (this.route.waypoints.length === 1 || this.length === 0) return target.copy(this.route.waypoints[0]);
    const distance = Math.max(0, Math.min(1, progress)) * this.length;
    let segment = this.segmentLengths.length - 1;
    for (let index = 0; index < this.segmentLengths.length; index += 1) {
      if (distance <= this.cumulative[index + 1]) { segment = index; break; }
    }
    const start = this.route.waypoints[segment];
    const end = this.route.waypoints[segment + 1];
    const span = this.segmentLengths[segment] || 1;
    return target.copy(start).lerp(end, (distance - this.cumulative[segment]) / span);
  }
}

export class EnemyView {
  readonly root = new Group();
  private readonly body: Mesh;

  constructor(color: string) {
    this.body = new Mesh(new SphereGeometry(0.28, 16, 10), new MeshStandardMaterial({ color }));
    this.body.castShadow = true;
    this.body.position.y = 0.32;
    this.root.add(this.body);
  }

  sync(position: Vector3, state: EnemyState): void {
    this.root.position.copy(position);
    this.root.visible = state === 'active';
  }

  dispose(): void {
    this.body.geometry.dispose();
    (this.body.material as MeshStandardMaterial).dispose();
  }
}

export class EnemyUnit {
  state: EnemyState = 'active';
  progress = 0;
  ticks = 0;
  readonly view: EnemyView;
  private readonly position = new Vector3();

  constructor(readonly id: string, private readonly follower: RouteFollower, readonly speed: number, color: string, initialProgress = 0) {
    this.progress = initialProgress;
    this.view = new EnemyView(color);
    this.syncView();
  }

  tick(deltaSeconds: number): void {
    if (this.state !== 'active') return;
    this.ticks += 1;
    this.progress = Math.min(1, this.progress + (this.speed * deltaSeconds) / this.follower.length);
    if (this.progress >= 1) this.state = 'escaped';
    this.syncView();
  }

  private syncView(): void {
    this.follower.positionAt(this.progress, this.position);
    this.view.sync(this.position, this.state);
  }

  dispose(): void { this.view.dispose(); }
}

export class GameWorld {
  readonly root = new Group();
  readonly route: RouteFollower;
  units: EnemyUnit[] = [];
  paused = true;
  elapsed = 0;
  generation = 0;
  private disposed = false;

  constructor(route: RouteDefinition) {
    this.route = new RouteFollower(route);
    this.reset();
  }

  start(): void { this.paused = false; }
  pause(): void { this.paused = true; }

  reset(): void {
    this.units.forEach(unit => { this.root.remove(unit.view.root); unit.dispose(); });
    this.units = [
      new EnemyUnit('enemy-a', this.route, 0.9, '#e47b6d', 0),
      new EnemyUnit('enemy-b', this.route, 0.65, '#6da7e4', 0.08),
      new EnemyUnit('enemy-c', this.route, 0.45, '#e4c86d', 0.16),
    ];
    this.units.forEach(unit => this.root.add(unit.view.root));
    this.elapsed = 0;
    this.paused = true;
    this.generation += 1;
  }

  tick(deltaSeconds: number): void {
    if (this.disposed || this.paused) return;
    const delta = Math.min(deltaSeconds, 0.1);
    this.elapsed += delta;
    this.units.forEach(unit => unit.tick(delta));
  }

  inspect() {
    return {
      generation: this.generation,
      paused: this.paused,
      elapsed: Number(this.elapsed.toFixed(3)),
      units: this.units.map(unit => ({ id: unit.id, state: unit.state, progress: Number(unit.progress.toFixed(3)), ticks: unit.ticks })),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.units.forEach(unit => { this.root.remove(unit.view.root); unit.dispose(); });
    this.units = [];
  }
}

export function createDemoWorld(): GameWorld {
  return new GameWorld({ waypoints: [
    new Vector3(-4, 0, -2), new Vector3(-1.5, 0, -2), new Vector3(-1.5, 0, 1.5),
    new Vector3(2.5, 0, 1.5), new Vector3(4, 0, -1),
  ] });
}
