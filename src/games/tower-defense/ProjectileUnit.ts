import { Vector3, type Group } from 'three';
import type { EnemyUnit } from './EnemyUnit';

export interface ProjectileView {
  readonly root: Group;
  sync(tip: Vector3, direction: Vector3): void;
  dispose(): void;
}

// The first skeleton has a fixed chest aim point one metre above its route position.
// Position is the arrow tip, so damage coincides with the tip reaching that point.
export class ProjectileUnit {
  readonly direction = new Vector3();
  private readonly destination = new Vector3();
  constructor(readonly id: number, readonly target: EnemyUnit, readonly position: Vector3,
    readonly speed: number, readonly damage: number, readonly view: ProjectileView) {
    this.aim(); this.present();
  }
  private aim(): void {
    this.destination.copy(this.target.position); this.destination.y += 1;
    this.direction.subVectors(this.destination, this.position).normalize();
  }
  tick(delta: number): 'flying' | 'hit' | 'expired' {
    if (this.target.state !== 'active') return 'expired';
    this.aim();
    if (this.position.distanceTo(this.destination) <= this.speed * delta) {
      this.position.copy(this.destination);
      return 'hit';
    }
    this.position.addScaledVector(this.direction, this.speed * delta);
    return 'flying';
  }
  present(): void { this.view.sync(this.position, this.direction); }
  dispose(): void { this.view.dispose(); }
}
