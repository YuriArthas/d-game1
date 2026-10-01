interface GpuSample { gpuMs: number | null; gpuFrame: number | null; gpuStatus: string }
interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
// Queries are asynchronous and bounded. Never finish/wait for the GPU on the CPU thread.
export class GpuTimer {
  private readonly ext: TimerExtension | null;
  private pending: { query: WebGLQuery; frame: number }[] = [];
  private current: WebGLQuery | null = null;
  constructor(private readonly gl: WebGL2RenderingContext, private readonly sample: GpuSample) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    sample.gpuStatus = this.ext ? '等待样本' : '不可用';
    sample.gpuMs = sample.gpuFrame = null;
  }
  begin(): void {
    const { gl, ext, sample } = this;
    if (!ext || gl.isContextLost()) { sample.gpuMs = sample.gpuFrame = null; sample.gpuStatus = ext ? '上下文丢失' : '不可用'; return; }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      this.clear(); sample.gpuMs = sample.gpuFrame = null; sample.gpuStatus = '计时失效'; return;
    }
    while (this.pending.length && gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
      const item = this.pending.shift()!;
      const ms = Number(gl.getQueryParameter(item.query, gl.QUERY_RESULT)) / 1e6;
      gl.deleteQuery(item.query);
      sample.gpuMs = Number.isFinite(ms) && ms >= 0 ? ms : null;
      sample.gpuFrame = item.frame; sample.gpuStatus = '异步';
    }
    if (this.pending.length >= 4 || gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return;
    this.current = gl.createQuery();
    if (this.current) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.current);
  }
  end(frame: number): void {
    if (!this.current || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.current, frame }); this.current = null;
  }
  private clear(): void { this.pending.forEach(item => this.gl.deleteQuery(item.query)); this.pending = []; }
  dispose(): void {
    if (this.current && this.ext) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.gl.deleteQuery(this.current); this.current = null; }
    this.clear();
  }
}
