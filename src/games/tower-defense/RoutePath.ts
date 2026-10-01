import { Vector3 } from 'three';
import type { RouteData } from './data/types';

export class RoutePath {
  readonly points: readonly Vector3[];
  readonly length: number;
  private readonly lengths: number[];

  constructor(route: RouteData) {
    this.points = route.waypoints.map(point => new Vector3(...point));
    this.lengths = this.points.slice(1).map((point, i) => Math.hypot(
      point.x - this.points[i].x, point.y - this.points[i].y, point.z - this.points[i].z));
    this.length = this.lengths.reduce((sum, length) => sum + length, 0);
  }

  // ContentCatalog validates geometry once; EnemyUnit owns progress in [0, 1].
  sample(progress: number, position: Vector3, direction: Vector3): void {
    let remaining = progress * this.length;
    let i = 0;
    while (i < this.lengths.length - 1 && remaining >= this.lengths[i]) {
      remaining -= this.lengths[i];
      i++;
    }
    position.copy(this.points[i]).lerp(this.points[i + 1], remaining / this.lengths[i]);
    direction.subVectors(this.points[i + 1], this.points[i]).divideScalar(this.lengths[i]);
  }
}
