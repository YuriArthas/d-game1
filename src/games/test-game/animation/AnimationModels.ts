export type AnimatedKind = 'tower' | 'skeleton' | 'bone-crawler' | 'moss-runner' | 'stone-brute' | 'cannon-tower' | 'frost-tower' | 'cavalry';
export type Motion = 'ready' | 'shoot' | 'idle' | 'walk' | 'run' | 'charge' | 'death';

interface PreviewModel {
  label: string;
  type: 'tower' | 'enemy';
  path: string;
  spacing: number;
  motions: Partial<Record<Motion, string>>;
  upperBody?: { rootBone: string; attack: string };
}

// Asset-preview choices only; these do not define combat types or balance.
export const ANIMATED_MODELS: Record<AnimatedKind, PreviewModel> = {
  tower: { label: '箭塔', type: 'tower', path: 'arrow-tower/arrow-tower.glb', spacing: 2.05, motions: { shoot: 'Shoot' } },
  skeleton: { label: '骷髅', type: 'enemy', path: 'kaykit-skeletons/Skeleton_Minion.glb', spacing: 1.25,
    motions: { idle: 'Idle', walk: 'Walking_A', death: 'Death_A' } },
  'bone-crawler': { label: '原创 · 骨甲爬虫', type: 'enemy', path: 'frontier/bone-crawler.glb', spacing: 1.65,
    motions: { idle: 'Idle', walk: 'Walk', death: 'Death' } },
  'moss-runner': { label: '原创 · 疾行小鬼', type: 'enemy', path: 'frontier/moss-runner.glb', spacing: 1.25,
    motions: { idle: 'Idle', walk: 'Walk', death: 'Death' },
    upperBody: { rootBone: 'Spine', attack: 'UpperAttack' } },
  'stone-brute': { label: '原创 · 岩甲巨怪', type: 'enemy', path: 'frontier/stone-brute.glb', spacing: 1.85,
    motions: { idle: 'Idle', walk: 'Walk', death: 'Death' } },
  'cannon-tower': { label: '原创 · 炮塔', type: 'tower', path: 'frontier/cannon-tower.glb', spacing: 2.05, motions: { shoot: 'Shoot' } },
  'frost-tower': { label: '原创 · 冰霜塔', type: 'tower', path: 'frontier/frost-tower.glb', spacing: 2.05,
    motions: { idle: 'Idle', shoot: 'Shoot' } },
  cavalry: { label: '测试 · 蓝银骑兵（Tripo 4766面）', type: 'enemy', path: 'cavalry/cavalry-tripo.glb', spacing: 2.1,
    motions: { idle: 'Idle', run: 'Run', charge: 'Charge', death: 'Dead' },
    upperBody: { rootBone: 'RiderSpine', attack: 'Attack' } },
};
