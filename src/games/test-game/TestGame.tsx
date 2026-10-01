import { useState } from 'react';
import { SkeletonTest } from './SkeletonTest';
import { StaticPreview } from './StaticPreview';
import type { AssetKind } from './StaticPreviewAsset';
import { AnimationLab } from './animation/AnimationLab';
import { RuntimeLab } from '../runtime-test/RuntimeLab';
import { PlacementLab } from '../tower-defense/PlacementLab';

type PreviewKind = AssetKind | 'skeleton' | 'animation' | 'runtime' | 'placement';
const PREVIEWS: { kind: PreviewKind; label: string }[] = [
  { kind: 'placement', label: '网格建造' },
  { kind: 'runtime', label: '运行时验证' },
  { kind: 'animation', label: '动作与实例' },
  { kind: 'tower', label: '箭塔' },
  { kind: 'bow', label: '独立弓' },
  { kind: 'arrow', label: '独立箭' },
  { kind: 'skeleton', label: '骷髅' },
];

export function TestGame({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<PreviewKind>(() => {
    const requested = new URLSearchParams(window.location.hash.split('?')[1]).get('view');
    return PREVIEWS.find(preview => preview.kind === requested)?.kind ?? 'animation';
  });
  return (
    <main className={`asset-test-page${kind === 'placement' ? ' placement-test-page' : ''}`}>
      <header className="preview-header">
        <button type="button" onClick={onBack}>← 返回游戏列表</button>
        <nav aria-label="选择测试模型">
          {PREVIEWS.map((preview) => (
            <button type="button" key={preview.kind} aria-pressed={kind === preview.kind}
              onClick={() => setKind(preview.kind)}>{preview.label}</button>
          ))}
        </nav>
      </header>
      <div className="preview-content">
        {kind === 'placement' ? <PlacementLab /> : kind === 'runtime' ? <RuntimeLab /> : kind === 'animation' ? <AnimationLab /> : kind === 'skeleton' ? <SkeletonTest /> : <StaticPreview key={kind} kind={kind} />}
      </div>
    </main>
  );
}
