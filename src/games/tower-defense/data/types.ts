export type Vec3Data = readonly [number, number, number];
export type Vec2Data = readonly [number, number];
export type GridCell = readonly [column: number, row: number];

export interface BuildGridData {
  readonly origin: Vec2Data; // X/Z corner of cell (0, 0).
  readonly cellSize: number;
  readonly buildableCells: readonly GridCell[];
}

export interface TowerData {
  readonly id: string;
  readonly cost: number;
  readonly range: number;
  readonly damage: number;
  readonly cooldown: number; // Attack start to next attack start, in seconds.
  readonly windup: number; // Logical release time after locking a target.
  readonly projectileSpeed: number;
}

export interface RouteData {
  readonly id: string;
  readonly waypoints: readonly Vec3Data[];
}

export interface EnemyData {
  readonly id: string;
  readonly maxHealth: number;
  readonly moveSpeed: number;
  readonly reward: number;
}

export interface SpawnEntry {
  readonly enemyId: string;
  readonly count: number;
  readonly interval: number;
  readonly routeId: string;
}

export interface WaveData {
  readonly id: string;
  readonly entries: readonly SpawnEntry[];
  readonly reward: number;
}

export interface MapData {
  readonly id: string;
  readonly routeIds: readonly string[];
  readonly buildGrid?: BuildGridData; // Route-only probes have no construction area.
}

export interface LevelData {
  readonly id: string;
  readonly mapId: string;
  readonly waveIds: readonly string[];
  readonly startingGold: number;
  readonly baseLives: number;
}

export interface ContentSource {
  readonly routes: readonly RouteData[];
  readonly enemies: readonly EnemyData[];
  readonly towers: readonly TowerData[];
  readonly waves: readonly WaveData[];
  readonly maps: readonly MapData[];
  readonly levels: readonly LevelData[];
}
