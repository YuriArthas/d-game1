import { useFrame } from '@react-three/fiber';
import { useFrameTiming, type FrameSample } from '../diagnostics/FrameStats';

// The single render owner for the runtime scene, with optional timing.
export function SceneRenderer({ sample }: { sample?: FrameSample }) {
  const timing = useFrameTiming(sample);
  useFrame(({ gl, scene, camera }) => {
    timing?.beginRender();
    try { gl.render(scene, camera); }
    finally { timing?.endRender(); }
  }, 1);
  return null;
}
