import { AnimationLab } from '../test-game/animation/AnimationLab';

export function CavalryTest({ onBack }: { onBack: () => void }) {
  return <main className="asset-test-page cavalry-test-page">
    <header className="preview-header">
      <button type="button" onClick={onBack}>← 返回游戏列表</button>
      <div><strong>蓝银骑兵 · 动作测试</strong><small>左右独立播放 · 奔跑时可叠加长枪攻击 · 冲锋与死亡播放全身动作</small></div>
    </header>
    <div className="preview-content"><AnimationLab fixedKind="cavalry" /></div>
  </main>;
}
