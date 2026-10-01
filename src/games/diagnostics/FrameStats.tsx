import { GpuTimer } from './GpuTimer';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';

export interface FrameSample {
  frame: number;
  intervalMs: number;
  cpuMs: number;
  updateMs: number;
  submitMs: number;
  gpuMs: number | null;
  gpuFrame: number | null;
  gpuStatus: string;
}
export function createFrameSample(): FrameSample {
  return { frame: 0, intervalMs: 0, cpuMs: 0, updateMs: 0, submitMs: 0, gpuMs: null, gpuFrame: null, gpuStatus: '检测中' };
}

// Instrument the render owner's pass; this hook never renders a scene itself.
// CPU excludes React/DOM and browser composition. GPU queries never block.
export function useFrameTiming(sample?: FrameSample) {
  const { gl } = useThree();
  const started = useRef(0);
  const submitted = useRef(0);
  const timer = useRef<GpuTimer | null>(null);
  useEffect(() => {
    if (!sample) return;
    // This project's Three.js WebGLRenderer requires WebGL2.
    const context = gl.getContext() as WebGL2RenderingContext;
    const restore = () => { timer.current = new GpuTimer(context, sample); };
    const lost = () => {
      timer.current?.dispose(); timer.current = null;
      sample.gpuMs = sample.gpuFrame = null; sample.gpuStatus = '上下文丢失';
    };
    restore();
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', restore);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', restore);
      timer.current?.dispose(); timer.current = null;
    };
  }, [gl, sample]);
  useFrame((_, delta) => {
    if (!sample) return;
    started.current = performance.now();
    sample.intervalMs = delta * 1000;
  }, -1000);
  return sample ? {
    beginRender() {
      sample.updateMs = performance.now() - started.current;
      timer.current?.begin();
      submitted.current = performance.now();
    },
    endRender() {
      timer.current?.end(sample.frame + 1);
      const ended = performance.now();
      sample.submitMs = ended - submitted.current;
      sample.cpuMs = ended - started.current;
      sample.frame++;
    },
  } : undefined;
}

export function FrameHud({ sample }: { sample: FrameSample }) {
  const [, refresh] = useState(0);
  useEffect(() => { const id = window.setInterval(() => refresh(value => value + 1), 250); return () => clearInterval(id); }, []);
  const value = (ms: number) => sample.frame ? `${ms.toFixed(2)} ms` : '—';
  const gpuFresh = sample.gpuMs !== null && sample.gpuFrame !== null && sample.frame - sample.gpuFrame <= 120;
  return <div className="frame-hud" data-frame-report={JSON.stringify(sample)} title="每帧采样，面板每 250ms 更新。CPU 为帧回调与渲染提交耗时，不含页面其他工作；GPU 为异步渲染计时。">
    <span>帧循环 CPU <b>{value(sample.cpuMs)}</b></span>
    <span>GPU <b>{gpuFresh ? `${sample.gpuMs!.toFixed(2)} ms` : sample.gpuMs !== null ? '样本过期' : sample.gpuStatus}</b></span>
    <span>帧间隔 {value(sample.intervalMs)}</span>
    <small>更新 {value(sample.updateMs)} · 提交 {value(sample.submitMs)} · GPU {gpuFresh ? `帧 #${sample.gpuFrame}` : '—'}</small>
  </div>;
}
