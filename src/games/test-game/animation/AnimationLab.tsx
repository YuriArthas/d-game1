import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FitCamera } from '../../rendering/FitCamera';
import { AnimationSession } from './AnimationSession';
import { ANIMATED_MODELS, type AnimatedKind } from './AnimationModels';

const STATES: Record<string, string> = { ready: '准备', playing: '播放中', paused: '暂停', finished: '已结束' };

const CAVALRY_VIEWS = {
  perspective: { label: '斜前方', yaw: -.4 },
  front: { label: '正面', yaw: 0 },
  side: { label: '侧面', yaw: Math.PI / 2 },
  back: { label: '背面', yaw: Math.PI },
};
type CavalryView = keyof typeof CAVALRY_VIEWS | 'custom';

export function AnimationLab({ fixedKind }: { fixedKind?: AnimatedKind }) {
  const [kind, setKind] = useState<AnimatedKind>(() => {
    const requested = new URLSearchParams(window.location.hash.split('?')[1]).get('asset');
    return fixedKind ?? (Object.keys(ANIMATED_MODELS) as AnimatedKind[]).find(key => key === requested) ?? 'tower';
  });
  const model = ANIMATED_MODELS[kind];
  const [angle, setAngle] = useState<CavalryView>('perspective');
  const [viewYaw, setViewYaw] = useState(CAVALRY_VIEWS.perspective.yaw);
  const [viewRevision, setViewRevision] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startYaw: number } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [session, setSession] = useState<AnimationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, refresh] = useState(0);
  useLayoutEffect(() => { session?.setViewYaw(viewYaw); }, [session, viewYaw]);
  useEffect(() => {
    if (kind !== 'cavalry') return;
    setAngle('perspective');
    setViewYaw(CAVALRY_VIEWS.perspective.yaw);
    setViewRevision(value => value + 1);
  }, [kind]);
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

  const beginRotation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (kind !== 'cavalry' || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startYaw: viewYaw };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const rotateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    event.preventDefault();
    setAngle('custom');
    setViewYaw(start.startYaw + (event.clientX - start.startX) * .009);
    setViewRevision(value => value + 1);
  };
  const endRotation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragging(false);
  };

  return (
    <section className={`animation-lab${model.upperBody ? ' has-upper-layer' : ''}`} data-session-report={session ? JSON.stringify(session.inspect()) : undefined}>
      <div className="lab-toolbar">
        {!fixedKind && <label>验证模型 <select aria-label="验证模型" value={kind} onChange={event => setKind(event.target.value as AnimatedKind)}>
          {Object.entries(ANIMATED_MODELS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
        </select></label>}
        {kind === 'cavalry' && <label>观察角度 <select aria-label="观察角度" value={angle} onChange={event => {
          const next = event.target.value as keyof typeof CAVALRY_VIEWS;
          setAngle(next); setViewYaw(CAVALRY_VIEWS[next].yaw); setViewRevision(value => value + 1);
        }}>
          {angle === 'custom' && <option value="custom">自定义</option>}
          {Object.entries(CAVALRY_VIEWS).map(([id, view]) => <option key={id} value={id}>{view.label}</option>)}
        </select></label>}
        <button disabled={!session || session.closed} onClick={() => session?.dispose()}>卸载资源</button>
        <button onClick={() => setGeneration(value => value + 1)}>重新加载</button>
        <span role="status">{error ? `加载失败：${error}` : !session ? '模型加载中…' : session.closed ? '资源已卸载' : '模型已加载'}</span>
        {model.upperBody && <small className="layer-hint">先播放基础移动，再点“上身攻击”。上下身可分别暂停；死亡会结束分层。</small>}
      </div>
      <div className={`lab-canvas${kind === 'cavalry' ? ` cavalry-rotatable${dragging ? ' is-dragging' : ''}` : ''}`}
        onPointerDown={beginRotation} onPointerMove={rotateFromPointer}
        onPointerUp={endRotation} onPointerCancel={endRotation}>
        {kind === 'cavalry' && <div className="cavalry-drag-hint" aria-hidden="true">拖动旋转 · 触摸可用</div>}
        <Canvas orthographic shadows="percentage" dpr={[1, 2]} camera={{ position: [6, 7, 9], near: 0.1, far: 100 }}>
          <color attach="background" args={[kind === 'cavalry' ? '#b4bfcc' : '#172033']} />
          <hemisphereLight args={['#dceaff', '#59654c', 2]} />
          <directionalLight castShadow intensity={2.4} position={[4, 7, 5]}
            shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8}
            shadow-camera-top={8} shadow-camera-bottom={-8} shadow-normalBias={0.015} />
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[200, 200]} /><meshStandardMaterial color={kind === 'cavalry' ? '#858f9e' : '#5c8d62'} />
          </mesh>
          {session && <><FitCamera key={kind === 'cavalry' ? `${kind}-${viewRevision}` : kind} bounds={session.bounds} padding={kind === 'cavalry' ? 1.1 : 1.35}
            offset={kind === 'cavalry' ? [0, 1.5, 10] : kind === 'moss-runner' ? [4, 4, 9] : [6, 7, 9]} /><Actors session={session} /></>}
        </Canvas>
      </div>
      <div className="lab-controls">
        {[0, 1].map(index => {
          const actor = session?.actors[index];
          const state = actor?.inspect();
          const upper = state?.upperBody;
          const split = upper?.available;
          return <section key={index} className="actor-controls" aria-label={`实例 ${index === 0 ? 'A' : 'B'}`}>
            <strong>实例 {index === 0 ? 'A（左）' : 'B（右）'} · {split ? '下身' : ''}{state ? STATES[state.state] : '未创建'}</strong>
            <div className="actor-buttons">
              {model.type === 'tower' ? <>
                {model.motions.idle && <button disabled={!actor} onClick={() => actor?.play('idle')}>待机</button>}
                <button disabled={!actor} onClick={() => actor?.play('shoot')}>播放一次</button>
                <button disabled={!actor} onClick={() => actor?.play('shoot', true)}>循环播放</button>
              </> : <>
                <button disabled={!actor} onClick={() => actor?.play('idle')}>待机</button>
                {model.motions.walk && <button disabled={!actor} onClick={() => actor?.play('walk')}>行走</button>}
                {model.motions.run && <button disabled={!actor} onClick={() => actor?.play('run')}>奔跑</button>}
                {model.motions.charge && <button disabled={!actor} onClick={() => actor?.play('charge')}>冲锋</button>}
                <button disabled={!actor} onClick={() => actor?.play('death')}>死亡</button>
              </>}
              <button disabled={!actor} onClick={() => actor?.reset()}>复位</button>
              <button disabled={!actor || state?.state === 'finished' || state?.state === 'ready'} onClick={() => actor?.togglePause()}>
                {state?.state === 'paused' ? '继续' : '暂停'}{split ? '下身' : ''}
              </button>
            </div>
            <label>{split ? '下身速度' : '速度'} <select aria-label="播放速度" value={state?.speed ?? 1} disabled={!actor}
              onChange={event => { actor?.setSpeed(Number(event.target.value)); refresh(value => value + 1); }}>
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
            </select></label>
            <label className="time-control">{split ? '下身进度' : '动作进度'}
              <input aria-label="动作进度" type="range" min="0" max={state?.duration ?? 1} step="0.01"
                value={state?.time ?? 0} disabled={!actor}
                onChange={event => { actor?.seek(Number(event.target.value)); refresh(value => value + 1); }} />
            </label>
            {actor?.upperBody && upper && <div className="upper-controls" aria-label="上身动作">
              <strong>上身 · {upper.state === 'off' ? '跟随基础动作' : upper.state === 'paused' ? '攻击已暂停' : upper.state === 'fading-out' ? '恢复基础动作' : '攻击中'}</strong>
              <div className="actor-buttons">
                <button disabled={!upper.available} onClick={() => actor.upperBody?.play()}>上身攻击</button>
                <button disabled={!upper.available} onClick={() => actor.upperBody?.play(true)}>循环上身攻击</button>
                <button disabled={!upper.playing} onClick={() => actor.upperBody?.stop()}>停止上身攻击</button>
                <button disabled={!upper.playing || upper.state === 'fading-out'} onClick={() => actor.upperBody?.togglePause()}>{upper.paused ? '继续上身' : '暂停上身'}</button>
              </div>
              <label>上身速度 <select aria-label="上身速度" value={upper.speed} onChange={event => actor.upperBody?.setSpeed(Number(event.target.value))}>
                <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
              </select></label>
              <label className="time-control">混合权重 {Math.round(upper.weight * 100)}%
                <input aria-label="上身混合权重" type="range" min="0" max="1" step="0.05" value={upper.weight}
                  onChange={event => { actor.upperBody?.setWeight(Number(event.target.value)); actor.update(0); }} />
              </label>
              <label className="time-control">上身进度
                <input aria-label="上身进度" type="range" min="0" max={upper.duration} step="0.01" value={upper.time}
                  disabled={!upper.playing} onChange={event => { actor.upperBody?.seek(Number(event.target.value)); actor.update(0); }} />
              </label>
            </div>}
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
