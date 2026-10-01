import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { FitCamera } from '../StaticPreview';
import { AnimationSession } from './AnimationSession';
import type { AnimatedKind } from './AnimationActor';

const STATES: Record<string, string> = { ready: '准备', playing: '播放中', paused: '暂停', finished: '已结束' };

export function AnimationLab() {
  const [kind, setKind] = useState<AnimatedKind>('tower');
  const [generation, setGeneration] = useState(0);
  const [session, setSession] = useState<AnimationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    let owned: AnimationSession | null = null;
    setSession(null); setError(null);
    AnimationSession.load(kind).then(loaded => {
      if (!active) { loaded.dispose(); return; }
      owned = loaded; setSession(loaded);
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; owned?.dispose(); };
  }, [kind, generation]);
  useEffect(() => {
    const timer = window.setInterval(() => refresh(value => value + 1), 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="animation-lab" data-session-report={session ? JSON.stringify(session.inspect()) : undefined}>
      <div className="lab-toolbar">
        <label>验证模型 <select aria-label="验证模型" value={kind} onChange={event => setKind(event.target.value as AnimatedKind)}>
          <option value="tower">箭塔</option><option value="skeleton">骷髅</option>
        </select></label>
        <button disabled={!session || session.closed} onClick={() => session?.dispose()}>卸载资源</button>
        <button onClick={() => setGeneration(value => value + 1)}>重新加载</button>
        <span role="status">{error ? `加载失败：${error}` : !session ? '模型加载中…' : session.closed ? '资源已卸载' : '模型已加载'}</span>
      </div>
      <div className="lab-canvas">
        <Canvas orthographic shadows="percentage" dpr={[1, 2]} camera={{ position: [6, 7, 9], near: 0.1, far: 100 }}>
          <color attach="background" args={['#172033']} />
          <hemisphereLight args={['#dceaff', '#59654c', 2]} />
          <directionalLight castShadow intensity={2.4} position={[4, 7, 5]}
            shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8}
            shadow-camera-top={8} shadow-camera-bottom={-8} shadow-normalBias={0.015} />
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[30, 30]} /><meshStandardMaterial color="#5c8d62" />
          </mesh>
          {session && <><FitCamera bounds={session.bounds} /><Actors session={session} /></>}
        </Canvas>
      </div>
      <div className="lab-controls">
        {[0, 1].map(index => {
          const actor = session?.actors[index];
          const state = actor?.inspect();
          return <section key={index} className="actor-controls" aria-label={`实例 ${index === 0 ? 'A' : 'B'}`}>
            <strong>实例 {index === 0 ? 'A（左）' : 'B（右）'} · {state ? STATES[state.state] : '未创建'}</strong>
            <div className="actor-buttons">
              {kind === 'tower' ? <>
                <button disabled={!actor} onClick={() => actor?.play('shoot')}>播放一次</button>
                <button disabled={!actor} onClick={() => actor?.play('shoot', true)}>循环播放</button>
              </> : <>
                <button disabled={!actor} onClick={() => actor?.play('idle')}>待机</button>
                <button disabled={!actor} onClick={() => actor?.play('walk')}>行走</button>
                <button disabled={!actor} onClick={() => actor?.play('death')}>死亡</button>
              </>}
              <button disabled={!actor} onClick={() => actor?.reset()}>复位</button>
              <button disabled={!actor || state?.state === 'finished' || state?.state === 'ready'} onClick={() => actor?.togglePause()}>
                {state?.state === 'paused' ? '继续' : '暂停'}
              </button>
            </div>
            <label>速度 <select aria-label="播放速度" value={state?.speed ?? 1} disabled={!actor}
              onChange={event => { actor?.setSpeed(Number(event.target.value)); refresh(value => value + 1); }}>
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
            </select></label>
            <label className="time-control">动作进度
              <input aria-label="动作进度" type="range" min="0" max={state?.duration ?? 1} step="0.01"
                value={state?.time ?? 0} disabled={!actor}
                onChange={event => { actor?.seek(Number(event.target.value)); refresh(value => value + 1); }} />
            </label>
            <button disabled={!session || session.closed} onClick={() => actor ? session?.destroy(index) : session?.create(index)}>
              {actor ? '销毁实例' : '创建实例'}
            </button>
          </section>;
        })}
      </div>
    </section>
  );
}

function Actors({ session }: { session: AnimationSession }) {
  useFrame(({ gl }, delta) => {
    session.update(delta);
    session.renderMemory = { ...gl.info.memory };
  });
  return <primitive object={session.root} dispose={null} />;
}
