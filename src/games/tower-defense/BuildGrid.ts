import type { BuildGridData, GridCell, Vec2Data } from './data/types';

export const cellKey = (cell: GridCell): string => `${cell[0]},${cell[1]}`;

export class BuildGrid {
  private readonly buildable: ReadonlySet<string>;
  constructor(readonly data: BuildGridData) {
    this.buildable = new Set(data.buildableCells.map(cellKey));
  }
  cellAt(x: number, z: number): GridCell {
    return [Math.floor((x - this.data.origin[0]) / this.data.cellSize),
      Math.floor((z - this.data.origin[1]) / this.data.cellSize)];
  }
  center(cell: GridCell): Vec2Data {
    return [this.data.origin[0] + (cell[0] + 0.5) * this.data.cellSize,
      this.data.origin[1] + (cell[1] + 0.5) * this.data.cellSize];
  }
  canBuild(cell: GridCell): boolean { return this.buildable.has(cellKey(cell)); }
}
