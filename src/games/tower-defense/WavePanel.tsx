import { useEffect, useMemo, useState } from 'react';
import type { BattleWorld } from './BattleWorld';
import type { ContentCatalog } from './data/catalog';

export function WavePanel({ world, catalog, onStart }: { world: BattleWorld; catalog: ContentCatalog; onStart: () => void }) {
  const [, refresh] = useState(0);
  const state = world.summary();
  const waves = useMemo(() => world.level.waveIds.map(id => {
    const wave = catalog.wave(id);
    return { ...wave, count: wave.entries.reduce((sum, entry) => sum + entry.count, 0),
      spawnDuration: Math.max(...wave.entries.map(entry => (entry.count - 1) * entry.interval)) };
  }), [world, catalog]);
  useEffect(() => {
    const timer = window.setInterval(() => refresh(value => value + 1), 100);
    return () => clearInterval(timer);
  }, [world]);
  const waiting = state.phase === 'ready' || state.phase === 'intermission';
  const settled = state.phase === 'intermission' || state.phase === 'won';
  const next = waiting ? waves[state.wave] : null;
  const labels = {
    ready: '准备布防', running: `第 ${state.wave} / ${state.totalWaves} 波`,
    intermission: `第 ${state.wave} 波守住了`, won: '防守成功', lost: `第 ${state.wave} 波失守`,
  };
  return <div className="battle-panel">
    <div className={`battle-status ${state.phase}`} data-battle-summary={JSON.stringify(state)}>
      <strong role="status">{labels[state.phase]}</strong>
      <span>{state.wave === 0 ? `守住全部 ${state.totalWaves} 波` : `本波击杀 ${state.waveKills} · 漏怪 ${state.waveLeaks}`}</span>
      <small>{state.phase === 'running' ? `场上 ${state.active} · 待出 ${state.pending}`
        : settled ? `已获波次奖励 +${waves[state.wave - 1].reward} 金币`
        : state.phase === 'lost' ? '生命耗尽，重新开始再布防' : '选格建塔，再开始波次'}</small>
    </div>
    <button className="battle-start" type="button" disabled={world.paused || !waiting}
      onClick={onStart}>
      {state.phase === 'intermission' ? '下一波' : '开始波次'}
    </button>
    <ol className="battle-waves" aria-label="波次进度">
      {waves.map((wave, index) => {
        const complete = index < state.wave - 1 || (settled && index === state.wave - 1);
        const current = index === state.wave - 1 && !settled;
        return <li key={index} className={complete ? 'complete' : current ? 'current' : ''}
          aria-current={current ? 'step' : undefined}>第{index + 1}波 <b>{wave.count} 只</b></li>;
      })}
    </ol>
    {next && <p className="battle-next">下一波 {next.count} 只 · 约 {Math.ceil(next.spawnDuration)} 秒出场 · 奖励 {next.reward}
      <small>{state.phase === 'intermission' ? '金币、生命和塔已保留，补好防线后再开波。' : '后续敌人更密集，预留金币逐步补塔。'}</small>
    </p>}
    {(state.phase === 'won' || state.phase === 'lost') && <p className="battle-result">
      {state.phase === 'won' ? `全部 ${state.totalWaves} 波已守住` : `止步第 ${state.wave} / ${state.totalWaves} 波`}
      <small>累计击杀 {state.kills} · 漏怪 {state.leaks} · 剩余生命 {state.lives}</small>
    </p>}
  </div>;
}
