import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { SkeletonActor, type SkeletonMotion } from './SkeletonActor';

type MotionRequest = { motion: SkeletonMotion; sequence: number };
const MODEL_URL = `${import.meta.env.BASE_URL}assets/kaykit-skeletons/Skeleton_Minion.glb`;
const MOTIONS: { motion: SkeletonMotion; label: string }[] = [
  { motion: 'idle', label: '待机' },
  { motion: 'walk', label: '行走' },
  { motion: 'death', label: '死亡' },
];

export function SkeletonTest() {
  const [request, setRequest] = useState<MotionRequest>({ motion: 'idle', sequence: 0 });
  const [status, setStatus] = useState('模型加载中…');
  const ready = status === '模型已加载';
  return (
    <section className="game-page">
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: [3.8, 3.4, 5], fov: 45 }}>
        <SceneCamera />
        <color attach="background" args={['#172033']} />
        <hemisphereLight args={['#dceaff', '#59654c', 2]} />
        <directionalLight castShadow intensity={2.4} position={[4, 7, 3]} shadow-mapSize={[1024, 1024]} shadow-normalBias={0.03} />
        <mesh receiveShadow position={[0, -0.15, 0]}>
          <boxGeometry args={[8, 0.3, 8]} />
          <meshStandardMaterial color="#5c8d62" />
        </mesh>
        <SkeletonModel request={request} onStatus={setStatus} />
      </Canvas>
      <section className="animation-panel" aria-label="骷髅动作测试">
        <strong>KayKit 骷髅测试</strong>
        <p role="status">{status}</p>
        <div className="animation-buttons">
          {MOTIONS.map(({ motion, label }) => (
            <button key={motion} type="button" disabled={!ready}
              aria-pressed={request.motion === motion}
              onClick={() => setRequest((previous) => ({ motion, sequence: previous.sequence + 1 }))}>
              {label}
            </button>
          ))}
        </div>
        <small>行走原地播放 · 死亡播放一次 · 再点可重播</small>
      </section>
    </section>
  );
}

function SkeletonModel({ request, onStatus }: {
  request: MotionRequest;
  onStatus: (status: string) => void;
}) {
  const [actor, setActor] = useState<SkeletonActor | null>(null);
  useEffect(() => {
    let active = true;
    let owned: SkeletonActor | null = null;
    SkeletonActor.load(MODEL_URL).then((loaded) => {
      if (!active) { loaded.dispose(); return; }
      owned = loaded;
      setActor(loaded);
      onStatus('模型已加载');
    }).catch((error: unknown) => {
      if (active) onStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      active = false;
      owned?.dispose();
    };
  }, [onStatus]);

  useEffect(() => { actor?.play(request.motion); }, [actor, request]);
  useFrame((_, delta) => actor?.update(delta));
  return actor ? <primitive object={actor.root} dispose={null} /> : null;
}

function SceneCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(0, 0.8, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}
