import { useEffect, useState } from 'react';
import { TestGame } from './games/test-game/TestGame';

const TEST_GAME_PATH = '/games/test-game';

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

  return <GameList onOpenTestGame={() => navigate(TEST_GAME_PATH)} />;
}

function GameList({ onOpenTestGame }: { onOpenTestGame: () => void }) {
  return (
    <main className="launcher-page">
      <section className="launcher-card">
        <p className="eyebrow">Three.js Game Test Server</p>
        <h1>游戏列表</h1>
        <p className="launcher-description">
          这是用于测试游戏入口的外层页面。当前只有一个测试游戏。
        </p>
        <button className="game-entry" type="button" onClick={onOpenTestGame}>
          <span>
            <strong>塔防模型测试</strong>
            <small>箭塔 · 弓箭 · 骷髅</small>
          </span>
          <span aria-hidden="true">进入游戏&nbsp; →</span>
        </button>
      </section>
    </main>
  );
}
