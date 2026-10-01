import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { FitCamera } from '../rendering/FitCamera';
import { StaticPreviewAsset, type AssetKind } from './StaticPreviewAsset';

export function StaticPreview({ kind }: { kind: AssetKind }) {
  const [asset, setAsset] = useState<StaticPreviewAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let owned: StaticPreviewAsset | null = null;
    StaticPreviewAsset.load(kind).then((loaded) => {
      if (!active) { loaded.dispose(); return; }
      owned = loaded;
      setAsset(loaded);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; owned?.dispose(); };
  }, [kind]);

  return (
    <section className="static-preview">
      <div className="static-canvas">
        <Canvas orthographic shadows="percentage" dpr={[1, 2]} camera={{ position: [6, 7, 9], near: 0.1, far: 100 }}>
          <color attach="background" args={['#172033']} />
          <hemisphereLight args={['#dceaff', '#59654c', 2]} />
          <directionalLight castShadow intensity={2.4} position={[4, 7, 5]}
            shadow-mapSize={[1024, 1024]} shadow-normalBias={0.015} />
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#5c8d62" />
          </mesh>
          {asset && <><FitCamera bounds={asset.bounds} /><primitive object={asset.root} dispose={null} /></>}
        </Canvas>
      </div>
      <div className="preview-status" role="status" data-model-report={asset ? JSON.stringify(asset.report) : undefined}>
        {error ? `加载失败：${error}` : asset ? '模型已加载 · 静态预览' : '模型加载中…'}
      </div>
    </section>
  );
}
