import { Group, Vector3 } from 'three';
import type { EnemyData } from './data/types';
import type { RoutePath } from './RoutePath';

export interface UnitView {
  readonly root: Group;
  sync(position: Vector3, direction: Vector3, healthFraction: number): void;
  update(delta: number): void;
  markDead(): void;
  updateDeath(delta: number): boolean;
  dispose(): void;
  inspect?(): unknown;
}
export type ViewFactory = () => UnitView;

export class EnemyUnit {
  state: 'active' | 'dead' | 'escaped' = 'active';
  progress = 0;
  health: number;
  readonly view: UnitView;
  released = false;
  readonly position = new Vector3();
  readonly direction = new Vector3();
  private presentationDelta = 0;

  constructor(readonly id: string, readonly definition: EnemyData, readonly routeId: string,
    private readonly route: RoutePath, createView: ViewFactory) {
    this.health = definition.maxHealth;
    this.view = createView();
    this.route.sample(0, this.position, this.direction);
    this.view.sync(this.position, this.direction, this.health / this.definition.maxHealth);
  }
  get remainingDistance(): number { return (1 - this.progress) * this.route.length; }
  damage(amount: number): boolean {
    if (this.state !== 'active') return false;
    this.health = Math.max(0, this.health - amount);
    return this.health === 0 && this.kill();
  }
  kill(): boolean {
    if (this.released || this.state !== 'active') return false;
    this.health = 0;
    this.state = 'dead'; // Logical death precedes visual completion.
    // Earlier walking time in this render frame must not advance the new death clip.
    this.presentationDelta = 0;
    this.view.markDead();
    return true;
  }
  tick(delta: number): void {
    this.presentationDelta += delta;
    if (this.state === 'dead') return;
    this.progress = Math.min(1, this.progress + this.definition.moveSpeed * delta / this.route.length);
    this.route.sample(this.progress, this.position, this.direction);
    if (this.progress >= 1) { this.state = 'escaped'; this.dispose(); }
  }
  present(): void {
    const delta = this.presentationDelta;
    this.presentationDelta = 0;
    this.view.sync(this.position, this.direction, this.health / this.definition.maxHealth);
    if (delta === 0) return;
    if (this.state === 'dead') {
      if (this.view.updateDeath(delta)) this.dispose();
    } else this.view.update(delta);
  }
  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.view.dispose();
  }
}
