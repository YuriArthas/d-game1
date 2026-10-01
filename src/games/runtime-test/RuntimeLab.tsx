import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, Line as ThreeLine, LineBasicMaterial, Vector3 } from 'three';
import { createDemoWorld, type GameWorld } from './RuntimeWorld';

export function RuntimeLab() {
  const world = useMemo(() => createDemoWorld(), []);
  const [, refresh] = useState(0);
  useEffect(() => () => world.dispose(), [world]);
  useEffect(() => {
    const timer = window.setInterval(() => refresh(value => value + 1), 100);
    return () => window.clearInterval(timer);
  }, []);
  const report = world.inspect();
  return <section className="runtime-lab" data-runtime-report={JSON.stringify(report)}>
    <div className="runtime-toolbar">
      <strong>P2.1 运行时验证</strong>
      <button type="button" onClick={() => world.start()} disabled={!world.paused}>开始</button>
      <button type="button" onClick={() => world.pause()} disabled={world.paused}>暂停</button>
      <button type="button" onClick={() => world.reset()}>重新开始</button>
      <span role="status">{world.paused ? '已暂停' : '运行中'} · 第 {report.generation} 局</span>
    </div>
    <div className="runtime-canvas">
      <Canvas shadows="percentage" camera={{ position: [0, 8, 8], fov: 45 }}>
        <color attach="background" args={['#172033']} />
        <hemisphereLight args={['#dceaff', '#59654c', 2]} />
        <directionalLight castShadow intensity={2} position={[3, 7, 4]} />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[14, 12]} /><meshStandardMaterial color="#466b54" />
        </mesh>
        <RouteLine world={world} />
        <WorldScene world={world} />
        <CameraTarget />
      </Canvas>
    </div>
    <div className="runtime-report">
      <span>逻辑时间 {report.elapsed.toFixed(1)}s</span>
      <span>单位 {report.units.filter(unit => unit.state === 'active').length}/{report.units.length} 活跃</span>
      <span>每个单位独立 ticks：{report.units.map(unit => `${unit.id}=${unit.ticks}`).join(' · ')}</span>
    </div>
  </section>;
}

function WorldScene({ world }: { world: GameWorld }) {
  useFrame((_, delta) => world.tick(delta));
  return <primitive object={world.root} dispose={null} />;
}

function RouteLine({ world }: { world: GameWorld }) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry().setFromPoints([...world.route.points]);
    return new ThreeLine(geometry, new LineBasicMaterial({ color: '#dceaff' }));
  }, [world]);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); }, [line]);
  return <primitive object={line} />;
}

function CameraTarget() {
  const { camera } = useThree();
  const target = useRef(new Vector3(0, 0, 0));
  useEffect(() => { camera.lookAt(target.current); }, [camera]);
  return null;
}
