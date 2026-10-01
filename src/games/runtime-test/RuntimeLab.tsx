import { Canvas, useFrame } from '@react-three/fiber';
import { memo, useEffect, useState } from 'react';
import { FitCamera } from '../rendering/FitCamera';
import { DEMO_CONTENT } from '../tower-defense/data/content';
import { createDemoWorld, type GameWorld } from './RuntimeWorld';
import { SkeletonViews } from '../tower-defense/SkeletonViews';
import { createFrameSample, FrameHud, type FrameSample } from '../diagnostics/FrameStats';
import { SceneRenderer } from '../rendering/SceneRenderer';

export function RuntimeLab() {
  const [presentation, setPresentation] = useState('sphere');
  const [revision, setRevision] = useState(0);
  const [levelId, setLevelId] = useState('p2-demo');
  const level = DEMO_CONTENT.levels.find(candidate => candidate.id === levelId)!;
  const [waveId, setWaveId] = useState(level.waveIds[0]);
  return <div className="runtime-page">
    <div className="runtime-picker">
      <strong>数据与生命周期</strong>
      <label>场景 <select aria-label="运行时场景" value={levelId} onChange={event => {
        const next = DEMO_CONTENT.levels.find(candidate => candidate.id === event.target.value)!;
        setLevelId(next.id); setWaveId(next.waveIds[0]);
      }}>
        {DEMO_CONTENT.levels.map(item => <option key={item.id} value={item.id}>
          {item.id === 'p2-demo' ? '3 个单位 · 折线路线' : item.id === 'p2-lifecycle-50' ? '50 个单位 · 五条路线' : item.id === 'placement-demo' ? '建造地图 · 路线验证' : item.id}
        </option>)}
      </select></label>
      <label>模型 <select aria-label="运行时模型" value={presentation} onChange={event => setPresentation(event.target.value)}>
        <option value="sphere">球体</option><option value="skeleton">骷髅（骨骼动画）</option>
      </select></label>
      {level.waveIds.length > 1 && <label>波次 <select aria-label="验证波次" value={waveId} onChange={event => setWaveId(event.target.value)}>
        {level.waveIds.map(id => <option key={id}>{id}</option>)}
      </select></label>}
    </div>
    <RuntimeSession key={`${levelId}/${waveId}/${presentation}/${revision}`} levelId={levelId} waveId={waveId}
      presentation={presentation} onReload={() => setRevision(value => value + 1)} />
  </div>;
}

function RuntimeSession({ levelId, waveId, presentation, onReload }: { levelId: string; waveId: string; presentation: string; onReload: () => void }) {
  const [sample] = useState(createFrameSample);
  const [resources, setResources] = useState<SkeletonViews | null>(null);
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [timingEnabled, setTimingEnabled] = useState(true);
  const [, refresh] = useState(0);
  // Allocate in the effect so each StrictMode setup owns a fresh disposable world.
  useEffect(() => {
    let active = true;
    let owned: GameWorld | null = null;
    let pool: SkeletonViews | null = null;
    const load = async () => {
      try {
        if (presentation === 'skeleton') {
          pool = await SkeletonViews.load(0.42, false);
          if (!active) { pool.dispose(); return; }
        }
        owned = createDemoWorld(levelId, waveId, pool?.create);
        setResources(pool); setWorld(owned);
      } catch (reason) { owned?.dispose(); pool?.dispose(); if (active) setError(String(reason)); }
    };
    void load();
    const timer = window.setInterval(() => refresh(value => value + 1), 250);
    return () => { active = false; window.clearInterval(timer); owned?.dispose(); pool?.dispose(); };
  }, [levelId, waveId, presentation]);
  if (error) return <p role="alert">加载失败：{error} <button onClick={onReload}>重试加载</button></p>;
  if (!world) return <p role="status">加载中…</p>;
  const report = world.summary();
  const settled = report.complete && report.retainedCount === 0;
  const details = detailsOpen ? world.inspect() : null;
  const poolReport = resources?.inspect() ?? null;
  const act = (action: () => void) => { action(); refresh(value => value + 1); };
  return <section className="runtime-lab" data-runtime-report={JSON.stringify(details ?? report)} data-resource-report={JSON.stringify(poolReport)}>
    <div className="runtime-toolbar">
      <button type="button" onClick={() => act(() => world.start())} disabled={!report.paused || settled || report.closed}>开始 / 继续</button>
      <button type="button" onClick={() => act(() => world.pause())} disabled={report.paused || settled || report.closed}>暂停</button>
      <button type="button" onClick={() => act(() => world.kill(10))} disabled={report.activeCount === 0}>击杀 10 个</button>
      <button type="button" disabled={report.closed} onClick={() => act(() => world.reset())}>重新开始</button>
      <button type="button" disabled={report.closed} onClick={() => act(() => { world.dispose(); resources?.dispose(); })}>卸载资源</button>
      <button type="button" onClick={onReload}>重载资源</button>
      <label><input type="checkbox" checked={timingEnabled} onChange={event => setTimingEnabled(event.target.checked)} />帧耗时</label>
      <span role="status">{report.closed ? '已卸载' : report.complete
        ? settled ? '波次完成 · 表现已清理' : `波次完成 · 死亡表现${report.paused ? '已暂停' : '清理中'}`
        : report.paused ? '已暂停' : '运行中'} · 第 {report.generation} 轮</span>
    </div>
    <RuntimeCanvas world={world} sample={timingEnabled ? sample : undefined} />
    <div className="runtime-report">
      <div className="runtime-counts">
        <span>时间 <b>{report.elapsed.toFixed(1)}s</b></span>
        <span>待生成 <b>{report.pendingCount}</b></span>
        <span>活跃 <b>{report.activeCount}</b></span>
        <span>死亡表现 <b>{report.dyingCount}</b></span>
        <span>已抵达 <b>{report.escapedCount}</b></span>
        <span>已释放 <b>{report.releasedCount}</b></span>
      </div>
      <p>点击开始后按间隔生成；暂停可检查死亡瞬间。{presentation === 'skeleton' ? '骷髅共享资源、独立骨骼；死亡动作结束后释放。' : '球体为验证占位。'}当前无塔和胜负规则。</p>
      <details onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>数据与释放记录</summary>
        <div>配置 {levelId} / {waveId} · 本轮计划 {report.plannedCount} 个 · 累计创建/释放 {report.totalCreated}/{report.totalReleased} · 渲染几何体 {report.renderMemory.geometries}</div>
        {poolReport && <div>模型资源：实例创建/释放 {poolReport.created}/{poolReport.released} · 共享几何体释放 {poolReport.sharedGeometryDisposals}</div>}
        <div className="runtime-entries">{world.wave.entries.map((entry, index) =>
          <div key={index}>{entry.enemyId} · {entry.routeId} · {entry.count} 个 · 间隔 {entry.interval}s</div>)}</div>
        {details && <pre>{JSON.stringify(details.units, null, 2)}</pre>}
      </details>
    </div>
  </section>;
}

// Summary/UI refreshes must not rerender the Canvas subtree.
const RuntimeCanvas = memo(function RuntimeCanvas({ world, sample }: { world: GameWorld; sample?: FrameSample }) {
  return <div className="runtime-canvas">
    {sample && <FrameHud sample={sample} />}
    <Canvas orthographic shadows="percentage" dpr={[1, 1.5]} camera={{ position: [6, 7, 9], near: 0.1, far: 100 }}>
      <color attach="background" args={['#172033']} />
      <hemisphereLight args={['#dceaff', '#59654c', 2]} />
      <directionalLight castShadow intensity={2} position={[3, 7, 4]}
        shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[30, 30]} /><meshStandardMaterial color="#466b54" />
      </mesh>
      <FitCamera bounds={world.bounds} />
      <WorldScene world={world} />
      <SceneRenderer sample={sample} />
    </Canvas>
  </div>;
});

function WorldScene({ world }: { world: GameWorld }) {
  useFrame(({ gl }, delta) => {
    world.tick(delta);
    world.renderMemory = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
  });
  return <primitive object={world.root} dispose={null} />;
}
