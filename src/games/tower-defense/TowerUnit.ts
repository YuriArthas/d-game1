import { Vector3, type Group } from 'three';
import type { EnemyUnit } from './EnemyUnit';
import type { GridCell, TowerData, Vec2Data } from './data/types';

export interface TowerView {
  readonly root: Group;
  sync(heading: number, attackAge: number | null, windup: number): void;
  launchPosition(heading: number, result: Vector3): void;
  dispose(): void;
}

export class TowerUnit {
  target: EnemyUnit | null = null;
  attackAge: number | null = null;
  heading = 0;
  constructor(readonly id: number, readonly definition: TowerData, readonly cell: GridCell,
    readonly position: Vec2Data, readonly view: TowerView) {}

  private inRange(enemy: EnemyUnit): boolean {
    return (enemy.position.x - this.position[0]) ** 2 + (enemy.position.z - this.position[1]) ** 2 <= this.definition.range ** 2;
  }
  tick(delta: number, enemies: Iterable<EnemyUnit>, launch: (tower: TowerUnit, target: EnemyUnit) => void): void {
    if (this.attackAge !== null) this.attackAge += delta;
    if (this.target) {
      const target = this.target;
      if (target.state === 'active') this.aim(target);
      if (this.attackAge! + 1e-9 >= this.definition.windup) {
        this.target = null;
        if (target.state === 'active' && this.inRange(target)) launch(this, target);
      }
    }
    if (this.target || (this.attackAge !== null && this.attackAge + 1e-9 < this.definition.cooldown)) return;
    // Map iteration preserves spawn order, so equal distances keep the earlier enemy.
    for (const enemy of enemies) {
      if (enemy.state === 'active' && this.inRange(enemy) &&
        (!this.target || enemy.remainingDistance < this.target.remainingDistance)) this.target = enemy;
    }
    if (this.target) { this.attackAge = 0; this.aim(this.target); }
  }
  private aim(target: EnemyUnit): void {
    this.heading = Math.atan2(target.position.x - this.position[0], target.position.z - this.position[1]);
  }
  finish(delta: number): void {
    this.target = null;
    if (this.attackAge !== null) this.attackAge += delta;
  }
  present(): void { this.view.sync(this.heading, this.attackAge, this.definition.windup); }
  dispose(): void { this.target = null; this.view.dispose(); }
}
