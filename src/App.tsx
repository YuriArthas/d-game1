import { useEffect, useState } from 'react';
import { TestGame } from './games/test-game/TestGame';
import { CavalryTest } from './games/cavalry/CavalryTest';

const TEST_GAME_PATH = '/games/test-game';
const CAVALRY_PATH = '/games/cavalry';

function currentPath(): string {
  return window.location.hash.replace(/^#/, '').split('?')[0].replace(/\/$/, '') || '/';
}

export function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const handleHashChange = () => setPath(currentPath());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (nextPath: string) => {
    window.location.hash = nextPath === '/' ? '' : nextPath;
    setPath(nextPath);
  };

  if (path === TEST_GAME_PATH) {
    return <TestGame onBack={() => navigate('/')} />;
  }
  if (path === CAVALRY_PATH) return <CavalryTest onBack={() => navigate('/')} />;

  return <GameList onOpenTestGame={() => navigate(TEST_GAME_PATH)} onOpenCavalry={() => navigate(CAVALRY_PATH)} />;
}

function GameList({ onOpenTestGame, onOpenCavalry }: { onOpenTestGame: () => void; onOpenCavalry: () => void }) {
  return (
    <main className="launcher-page">
      <section className="launcher-card">
        <p className="eyebrow">Three.js Game Test Server</p>
        <h1>游戏列表</h1>
        <p className="launcher-description">
          选择游戏，或进入模型与动作测试。
        </p>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/block-blast/index.html`}>
          <span><strong>方块消除者</strong><small>方块消除 · 手机竖屏 · 挑战最高分</small></span>
          <span aria-hidden="true">进入游戏&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/mining/index.html`}>
          <span><strong>Mining</strong><small>单机挖矿 · 横屏 · 游戏准备中</small></span>
          <span aria-hidden="true">进入游戏&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/mining-test/index.html`}>
          <span><strong>Mining 测试版</strong><small>场景调整预览 · 草甸布局与完整远景</small></span>
          <span aria-hidden="true">进入测试&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/mining-surface/index.html`}>
          <span><strong>松风矿谷 · 场景设计</strong><small>地表布局与光影 · 独立场景</small></span>
          <span aria-hidden="true">进入场景&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/mining-surface-play/index.html`}>
          <span><strong>Mining · 松风矿谷试玩</strong><small>主线玩法 · 松风矿谷场景</small></span>
          <span aria-hidden="true">进入试玩&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/mining-light/index.html`}>
          <span><strong>松风矿谷 · 光照材质样板</strong><small>地面与墙角 · 晴日与暖阳</small></span>
          <span aria-hidden="true">进入样板&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/survivor-test/index.html`}>
          <span><strong>Survivor 测试版</strong><small>Three.js 空项目 · 场景准备中</small></span>
          <span aria-hidden="true">进入测试&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/pick-needle/index.html`}>
          <span><strong>草堆寻针</strong><small>单机找针 · 横屏 · 美术制作中</small></span>
          <span aria-hidden="true">进入游戏&nbsp; →</span>
        </a>
        <a className="game-entry" style={{ textDecoration: 'none' }} href={`${import.meta.env.BASE_URL}games/pick-needle-test/index.html`}>
          <span><strong>草堆寻针 测试版</strong><small>功能开发预览 · 工具与关卡</small></span>
          <span aria-hidden="true">进入测试&nbsp; →</span>
        </a>
        <button className="game-entry" type="button" onClick={onOpenTestGame}>
          <span>
            <strong>塔防模型测试</strong>
            <small>箭塔 · 弓箭 · 骷髅</small>
          </span>
          <span aria-hidden="true">进入游戏&nbsp; →</span>
        </button>
        <button className="game-entry" type="button" onClick={onOpenCavalry}>
          <span><strong>骑兵动作测试</strong><small>蓝银骑士 · 待机 · 奔跑 · 挥剑 · 冲锋 · 死亡</small></span>
          <span aria-hidden="true">进入游戏&nbsp; →</span>
        </button>
      </section>
    </main>
  );
}
