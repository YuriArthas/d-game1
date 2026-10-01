import type { ContentSource } from './types';

// Five lanes keep all 50 probe units visible without changing their route positions.
const lanes = Array.from({ length: 5 }, (_, index) => ({
  id: `p2-lane-${index + 1}`,
  waypoints: [[-5, 0, index * 1.4 - 2.8], [5, 0, index * 1.4 - 2.8]] as const,
}));

export const DEMO_CONTENT: ContentSource = {
  routes: [{
    id: 'p2-demo-route',
    waypoints: [[-4, 0, -2], [-1.5, 0, -2], [-1.5, 0, 1.5], [2.5, 0, 1.5], [4, 0, -1]],
  }, ...lanes, {
    id: 'placement-route',
    waypoints: [[-12, 0, -2], [-2, 0, -2], [-2, 0, 2], [12, 0, 2]],
  }],
  enemies: [
    { id: 'p2-demo-enemy', maxHealth: 10, moveSpeed: 0.9, reward: 1 },
    { id: 'p2-lifecycle-enemy', maxHealth: 10, moveSpeed: 0.65, reward: 1 },
    { id: 'combat-skeleton', maxHealth: 10, moveSpeed: 1.8, reward: 5 },
  ],
  towers: [{ id: 'arrow-tower', cost: 30, range: 7, damage: 5, cooldown: 1.2, windup: 0.5, projectileSpeed: 14 }],
  waves: [
    { id: 'p2-demo-wave', entries: [{ enemyId: 'p2-demo-enemy', count: 3, interval: 1, routeId: 'p2-demo-route' }], reward: 5 },
    {
      id: 'p2-lifecycle-wave',
      entries: lanes.map(route => ({ enemyId: 'p2-lifecycle-enemy', count: 10, interval: 0.8, routeId: route.id })),
      reward: 5,
    },
    { id: 'placement-wave', entries: [{ enemyId: 'combat-skeleton', count: 8, interval: 1.2, routeId: 'placement-route' }], reward: 10 },
  ],
  maps: [
    { id: 'p2-demo-map', routeIds: ['p2-demo-route'] },
    { id: 'p2-lanes-map', routeIds: lanes.map(route => route.id) },
    {
      id: 'placement-map', routeIds: ['placement-route'],
      buildGrid: {
        origin: [-12, -8], cellSize: 4,
        buildableCells: [
          [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
          [3, 1], [4, 1], [5, 1], [0, 2], [1, 2],
          [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
        ],
      },
    },
  ],
  levels: [
    { id: 'p2-demo', mapId: 'p2-demo-map', waveIds: ['p2-demo-wave'], startingGold: 100, baseLives: 20 },
    { id: 'p2-lifecycle-50', mapId: 'p2-lanes-map', waveIds: ['p2-lifecycle-wave'], startingGold: 100, baseLives: 20 },
    { id: 'placement-demo', mapId: 'placement-map', waveIds: ['placement-wave'], startingGold: 100, baseLives: 5 },
  ],
};
