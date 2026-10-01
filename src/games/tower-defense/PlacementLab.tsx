import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box3, Vector3 } from 'three';
import { createFrameSample, FrameHud } from '../diagnostics/FrameStats';
import { SceneRenderer } from '../rendering/SceneRenderer';
import { FitCamera } from '../rendering/FitCamera';
import { ArrowTowerViews, type ArrowTowerView } from './ArrowTowerViews';
import { cellKey } from './BuildGrid';
import { ContentCatalog } from './data/catalog';
import { DEMO_CONTENT } from './data/content';
import type { GridCell, RouteData } from './data/types';
import { BattleWorld, type PlacementFailure } from './BattleWorld';
import { SkeletonViews } from './SkeletonViews';

const LEVEL_ID = 'placement-demo';
const TOWER_ID = 'arrow-tower';
const REASONS: Record<PlacementFailure, string> = {
  paused: '已暂停，恢复后可建造', finished: '本局已结束，重新开始可再次布防', unbuildable: '这里不可建造，请选择浅色空地',
  occupied: '这里已经有一座塔', 'insufficient-gold': '金币不足，当前无法建造',
};
const catalog = new ContentCatalog(DEMO_CONTENT);
const tower = catalog.tower(TOWER_ID);

interface Session {
  world: BattleWorld;
  skeletons: SkeletonViews;
  assets: ArrowTowerViews;
  preview: ArrowTowerView;
  routes: readonly RouteData[];
  bounds: Box3;
}

export function PlacementLab() {
  const [revision, setRevision] = useState(0);
  return <PlacementSession key={revision} onReload={() => setRevision(value => value + 1)} />;
}

function PlacementSession({ onReload }: { onReload: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let owned: Session | null = null;
    let assets: ArrowTowerViews | null = null;
    let skeletons: SkeletonViews | null = null;
    const load = async () => {
      try {
        const results = await Promise.allSettled([ArrowTowerViews.load(), SkeletonViews.load(1, true)]);
        if (results[0].status === 'fulfilled') assets = results[0].value;
        if (results[1].status === 'fulfilled') skeletons = results[1].value;
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        const loaded = assets!, enemies = skeletons!;
        if (!active) { loaded.dispose(); enemies.dispose(); return; }
        const world = new BattleWorld(catalog, LEVEL_ID, {
          tower: position => loaded.create(position), enemy: enemies.create, projectile: loaded.createProjectile,
        });
        const preview = loaded.create([0, 0], true);
        preview.root.visible = false;
        const routes = catalog.map(world.level.mapId).routeIds.map(id => catalog.route(id));
        const points = routes.flatMap(route => route.waypoints.map(point => new Vector3(...point)));
        for (const cell of world.grid.data.buildableCells) {
          const [x, z] = world.grid.center(cell); points.push(new Vector3(x, 0, z));
        }
        const bounds = new Box3().setFromPoints(points).expandByScalar(world.grid.data.cellSize / 2 + 0.5);
        bounds.min.y = -0.5; bounds.max.y = loaded.height;
        owned = { world, assets: loaded, skeletons: enemies, preview, routes, bounds };
        setSession(owned);
      } catch (reason) {
        assets?.dispose(); skeletons?.dispose();
        if (active) setError(String(reason));
      }
    };
    void load();
    return () => { active = false; owned?.world.dispose(); assets?.dispose(); skeletons?.dispose(); };
  }, []);
  if (error) return <div className="placement-loading" role="alert">加载失败：{error}<button onClick={onReload}>重试加载</button></div>;
  if (!session) return <div className="placement-loading" role="status">正在准备地图与箭塔…</div>;
  return <PlacementBoard session={session} />;
}

function PlacementBoard({ session }: { session: Session }) {
  const { world, assets } = session;
  const [sample] = useState(createFrameSample);
  const [timing, setTiming] = useState(true);
  const [selected, setSelected] = useState<GridCell | null>(null);
  const [message, setMessage] = useState('选择一块浅色空地，预览你的第一座箭塔。');
  const [, refresh] = useState(0);
  const failure = selected ? world.checkPlacement(selected, TOWER_ID) : null;
  const select = useCallback((cell: GridCell) => {
    if (world.paused) return;
    setSelected(cell);
    const reason = world.checkPlacement(cell, TOWER_ID);
    setMessage(reason ? REASONS[reason] : '位置可用，确认后建造。');
  }, [world]);
  const cancel = () => { setSelected(null); setMessage('已取消预览，选择空地可重新放置。'); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelected(null); setMessage('已取消预览，选择空地可重新放置。'); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => {
    let previous = `${world.gold}/${world.lives}/${world.phase}`;
    const timer = window.setInterval(() => {
      const current = `${world.gold}/${world.lives}/${world.phase}`;
      if (current !== previous) { previous = current; refresh(value => value + 1); }
    }, 100);
    return () => clearInterval(timer);
  }, [world]);
  const confirm = () => {
    if (!selected) return;
    const reason = world.place(selected, TOWER_ID);
    if (reason) setMessage(REASONS[reason]);
    else { setSelected(null); setMessage(`箭塔已建造，花费 ${tower.cost} 金币。`); }
    refresh(value => value + 1);
  };
  const togglePause = () => {
    world.togglePause();
    setMessage(world.paused ? '已暂停。' : ['won', 'lost'].includes(world.phase) ? REASONS.finished : '已恢复，可继续布防。');
    refresh(value => value + 1);
  };
  const reset = () => {
    world.reset(); setSelected(null); setMessage('已重新开始，金币和建造位置已重置。');
    refresh(value => value + 1);
  };
  return <section className="placement-lab" data-placement-report={JSON.stringify({ ...world.summary(), selected, failure,
    towers: [...world.towers.values()].map(unit => ({ id: unit.id, cell: unit.cell, position: unit.position })) })}
    data-placement-resources={JSON.stringify(assets.inspect())} data-placement-grid={JSON.stringify(world.grid.data)}>
    <div className="placement-toolbar">
      <div className="placement-title"><strong>营地布防</strong><small>单箭塔战斗 · 守住出口</small></div>
      <div className="placement-gold">金币 <b>{world.gold}</b></div>
      <span className="placement-lives">生命 <b>{world.lives}</b></span>
      {timing && <FrameHud sample={sample} />}
      <button type="button" onClick={togglePause}>{world.paused ? '恢复' : '暂停'}</button>
      <button type="button" onClick={reset}>重新开始</button>
    </div>
    <div className="placement-canvas">
      {world.paused && <div className="placement-paused">已暂停</div>}
      <BattleCanvas session={session} selected={selected} failure={failure} onSelect={select} sample={sample} timing={timing} />
    </div>
    <aside className="placement-controls" aria-label="建造面板">
      <div className="battle-panel">
        <BattleStatus session={session} />
        <button className="battle-start" type="button" disabled={world.paused || !['ready', 'intermission'].includes(world.phase)}
          onClick={() => { world.startWave(); refresh(value => value + 1); }}>
          {world.phase === 'intermission' ? '下一波' : '开始波次'}
        </button>
      </div>
      <div className="placement-tower-card"><span aria-hidden="true">↟</span><div><strong>箭塔</strong><small>{tower.cost} 金币 / 座 · 占一格</small></div></div>
      <p className={`placement-message${failure ? ' invalid' : ''}`} role="status">{selected && failure ? REASONS[failure] : message}</p>
      <div className="placement-actions">
        <button type="button" className="placement-confirm" onClick={confirm} disabled={!selected || failure !== null}>确认建造</button>
        <button type="button" onClick={cancel} disabled={!selected}>取消</button>
      </div>
      <p className="placement-hint">浅色空地可建造。建议先在路线前、中段各放一座，再开始波次；战斗中也能补塔。每只漏怪扣 1 点生命。</p>
      <div className="placement-footnote"><span>射程 {tower.range}m · 伤害 {tower.damage} · 间隔 {tower.cooldown}s</span>
        <label><input type="checkbox" checked={timing} onChange={event => setTiming(event.target.checked)} />帧耗时</label>
      </div>
      <BattleDetails session={session} />
    </aside>
  </section>;
}

function BattleCanvas({ session, selected, failure, onSelect, sample, timing }: {
  session: Session; selected: GridCell | null; failure: PlacementFailure | null; onSelect: (cell: GridCell) => void;
  sample: ReturnType<typeof createFrameSample>; timing: boolean;
}) {
  return <Canvas orthographic shadows="percentage" dpr={[1, 1.5]} camera={{ position: [6, 7, 9], near: 0.1, far: 150 }}>
        <color attach="background" args={['#1b2c32']} />
        <hemisphereLight args={['#ffefcf', '#6a8064', 2.4]} />
        <directionalLight castShadow position={[6, 16, 9]} intensity={2.5}
          shadow-mapSize={[1024, 1024]} shadow-normalBias={0.025}
          shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={18} shadow-camera-bottom={-18} />
        <FitCamera bounds={session.bounds} offset={[0, 20, 14]} padding={1.08} />
        <CameraReport />
        <BuildScene session={session} selected={selected} failure={failure} onSelect={onSelect} />
        <SceneRenderer sample={timing ? sample : undefined} />
      </Canvas>;
}

function BattleStatus({ session }: { session: Session }) {
  const [state, setState] = useState(() => session.world.summary());
  useEffect(() => {
    const timer = window.setInterval(() => setState(session.world.summary()), 100);
    return () => clearInterval(timer);
  }, [session]);
  const labels = { ready: '准备布防', running: `第 ${state.wave} 波`, intermission: '本波守住了', won: '防守成功', lost: '防线失守' };
  return <div className={`battle-status ${state.phase}`} data-battle-summary={JSON.stringify(state)} aria-live="polite">
    <strong>{labels[state.phase]}</strong>
    <span>击杀 {state.kills} · 漏怪 {state.leaks}</span>
    <small>场上 {state.active} · 待出 {state.pending}</small>
  </div>;
}

function BattleDetails({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  return <details className="battle-details" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>战斗详情</summary>{open && <BattleReport session={session} />}
  </details>;
}
function BattleReport({ session }: { session: Session }) {
  const read = useCallback(() => ({ ...session.world.inspect(), resources: { towers: session.assets.inspect(), skeletons: session.skeletons.inspect() } }), [session]);
  const [report, setReport] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setReport(read()), 100);
    return () => clearInterval(timer);
  }, [read]);
  return <pre data-battle-report={JSON.stringify(report)}>箭矢 {report.arrows} · 出箭 {report.shots} · 命中 {report.hits}{'\n'}死亡动画 {report.dying} · 波次时间 {report.elapsed.toFixed(1)}s</pre>;
}

function BuildScene({ session, selected, failure, onSelect }: {
  session: Session; selected: GridCell | null; failure: PlacementFailure | null; onSelect: (cell: GridCell) => void;
}) {
  const { world, preview, bounds, routes } = session;
  useFrame((_, delta) => world.tick(delta));
  const size = world.grid.data.cellSize;
  const center = useMemo(() => bounds.getCenter(new Vector3()), [bounds]);
  const extent = useMemo(() => bounds.getSize(new Vector3()), [bounds]);
  const color = failure ? '#ed856e' : '#c5ec82';
  useLayoutEffect(() => {
    if (!selected) { preview.root.visible = false; return; }
    preview.showPreview(world.grid.center(selected), color,
      world.grid.canBuild(selected) && !world.towers.has(cellKey(selected)));
  }, [world, preview, selected, color, world.towers.size]);
  const down = useRef<{ id: number; x: number; y: number } | null>(null);
  const pointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    down.current = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    if (down.current) (event.target as Element).setPointerCapture(event.pointerId);
  };
  const pointerUp = (event: ThreeEvent<PointerEvent>, cell: GridCell) => {
    event.stopPropagation();
    const start = down.current; down.current = null;
    if (start && event.isPrimary && event.pointerId === start.id &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) onSelect(cell);
  };
  return <>
    <mesh receiveShadow position={[center.x, -0.38, center.z]}>
      <boxGeometry args={[extent.x, 0.5, extent.z]} /><meshStandardMaterial color="#557961" roughness={1} />
    </mesh>
    {routes.flatMap(route => route.waypoints.slice(1).map((point, index) => {
      const a = route.waypoints[index], dx = point[0] - a[0], dz = point[2] - a[2];
      return <mesh key={`${route.id}/${index}`} receiveShadow position={[(a[0] + point[0]) / 2, -0.07, (a[2] + point[2]) / 2]}
        rotation={[0, Math.atan2(dx, dz), 0]}>
        <boxGeometry args={[size * 0.85, 0.1, Math.hypot(dx, dz) + size * 0.85]} />
        <meshStandardMaterial color="#b79a70" roughness={1} />
      </mesh>;
    }))}
    {world.grid.data.buildableCells.map(cell => {
      const [x, z] = world.grid.center(cell), occupied = world.towers.has(cellKey(cell));
      return <mesh key={cellKey(cell)} receiveShadow position={[x, -0.06, z]}>
        <boxGeometry args={[size * 0.86, 0.12, size * 0.86]} />
        <meshStandardMaterial color={occupied ? '#71947e' : '#a2b998'} roughness={1} />
      </mesh>;
    })}
    {routes.flatMap(route => [route.waypoints[0], route.waypoints[route.waypoints.length - 1]].map((point, i) =>
      <mesh key={`${route.id}/end/${i}`} position={[point[0], 0.18, point[2]]}>
        <cylinderGeometry args={[0.45, 0.6, 0.4, 8]} /><meshStandardMaterial color={i === 0 ? '#a5e3be' : '#f3bd70'} />
      </mesh>))}
    <mesh position={[center.x, 0, center.z]} rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={pointerDown} onPointerUp={event => pointerUp(event, world.grid.cellAt(event.point.x, event.point.z))}
      onPointerCancel={() => { down.current = null; }}>
      <planeGeometry args={[extent.x, extent.z]} /><meshBasicMaterial visible={false} />
    </mesh>
    {[...world.towers.values()].map(unit => <primitive key={unit.id} object={unit.view.root} dispose={null}
      onPointerDown={pointerDown} onPointerUp={(event: ThreeEvent<PointerEvent>) => pointerUp(event, unit.cell)}
      onPointerCancel={() => { down.current = null; }} />)}
    <primitive object={world.root} dispose={null} />
    <primitive object={preview.root} dispose={null} />
    {selected && world.grid.canBuild(selected) && <mesh position={[world.grid.center(selected)[0], 0.035, world.grid.center(selected)[1]]}
      rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[tower.range - 0.06, tower.range, 80]} />
      <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
    </mesh>}
    {selected && <mesh position={[world.grid.center(selected)[0], 0.025, world.grid.center(selected)[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size * 0.92, size * 0.92]} /><meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
    </mesh>}
  </>;
}

// Read-only camera evidence for pointer tests; updates only when the viewport changes.
function CameraReport() {
  const { camera, size, gl } = useThree();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      gl.domElement.dataset.placementCamera = JSON.stringify({ projection: camera.projectionMatrix.elements,
        view: camera.matrixWorldInverse.elements });
    });
    return () => cancelAnimationFrame(frame);
  }, [camera, size.width, size.height, gl]);
  return null;
}
