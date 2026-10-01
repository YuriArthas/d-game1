import { AnimationAction, AnimationClip, AnimationMixer, Bone, Group, LoopOnce, LoopRepeat, Mesh, Object3D, SkinnedMesh } from 'three';

export type AnimatedKind = 'tower' | 'skeleton';
export type Motion = 'ready' | 'shoot' | 'idle' | 'walk' | 'death';
const NAMES: Partial<Record<Motion, string>> = { shoot: 'Shoot', idle: 'Idle', walk: 'Walking_A', death: 'Death_A' };

export class AnimationActor {
  readonly mixer: AnimationMixer;
  private action: AnimationAction | null = null;
  private motion: Motion = 'ready';
  private state = 'ready';
  private speed = 1;
  private loops = 0;
  private finishes = 0;
  private playbackId = 0;
  private destroyed = false;
  private arrow: Object3D | undefined;
  readonly skeletons = new Set<SkinnedMesh['skeleton']>();

  constructor(readonly root: Group, readonly kind: AnimatedKind,
    private readonly clips: AnimationClip[], private readonly release: () => void) {
    this.mixer = new AnimationMixer(root);
    root.traverse(object => {
      if (object instanceof SkinnedMesh) this.skeletons.add(object.skeleton);
    });
    for (const motion of kind === 'tower' ? ['shoot'] : ['idle', 'walk', 'death']) {
      if (!clips.some(clip => clip.name === NAMES[motion as Motion])) throw new Error(`缺少动作：${motion}`);
    }
    if (kind === 'tower') {
      this.arrow = root.getObjectByName('LoadedArrow');
      const pull = root.getObjectByName('StringPull');
      if (!this.arrow || !pull) throw new Error('箭塔缺少装填箭或 StringPull 骨骼');
      root.updateMatrixWorld(true);
      // Preserve the loaded pose while making the arrow follow the string centre.
      pull.attach(this.arrow);
    }
    this.mixer.addEventListener('loop', event => { this.loops += Math.abs(event.loopDelta); });
    this.mixer.addEventListener('finished', () => { this.finishes++; this.state = 'finished'; });
    this.reset();
  }

  play(motion: Motion, loop = false): void {
    if (this.destroyed) throw new Error('实例已经销毁');
    if (motion === 'ready') { this.reset(); return; }
    const clip = this.clips.find(candidate => candidate.name === NAMES[motion]);
    if (!clip) throw new Error(`缺少动作：${motion}`);
    this.mixer.stopAllAction();
    this.playbackId++;
    this.motion = motion;
    this.action = this.mixer.clipAction(clip).reset();
    const repeat = motion === 'idle' || motion === 'walk' || (motion === 'shoot' && loop);
    this.action.setLoop(repeat ? LoopRepeat : LoopOnce, repeat ? Infinity : 1);
    this.action.clampWhenFinished = !repeat;
    this.action.setEffectiveTimeScale(this.speed);
    this.action.play();
    this.state = 'playing';
    this.loops = this.finishes = 0;
    this.update(0);
  }

  reset(): void {
    if (this.kind === 'skeleton') { this.play('idle'); return; }
    this.play('shoot');
    this.seek(0);
    this.motion = 'ready';
    this.state = 'ready';
  }

  seek(seconds: number): void {
    if (!this.action) return;
    if (this.kind === 'tower') this.motion = 'shoot';
    this.action.enabled = true;
    this.action.paused = true;
    this.action.time = Math.max(0, Math.min(seconds, this.action.getClip().duration));
    this.state = 'paused';
    this.update(0);
  }

  togglePause(): void {
    if (!this.action || this.state === 'finished' || this.state === 'ready') return;
    this.action.paused = !this.action.paused;
    this.state = this.action.paused ? 'paused' : 'playing';
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.action?.setEffectiveTimeScale(speed);
  }

  update(delta: number): void {
    if (this.destroyed) return;
    this.mixer.update(delta);
    if (this.arrow) this.arrow.visible = this.motion === 'ready' || (this.action?.time ?? 0) < 0.5;
    this.root.updateMatrixWorld(true);
  }

  inspect() {
    const meshes: Mesh[] = [];
    this.root.traverse(o => { if (o instanceof Mesh) meshes.push(o); });
    const bones: Bone[] = [];
    this.root.traverse(o => { if (o instanceof Bone) bones.push(o); });
    return {
      id: this.root.uuid, playbackId: this.playbackId, clock: this.mixer.time, motion: this.motion, state: this.state,
      time: this.action?.time ?? 0, duration: this.action?.getClip().duration ?? 1,
      speed: this.speed, loops: this.loops, finishes: this.finishes,
      arrowVisible: this.arrow?.visible ?? null,
      skeletonIds: [...this.skeletons].map(s => s.uuid), firstBoneId: bones[0]?.uuid,
      geometryId: meshes[0]?.geometry.uuid,
      materialId: meshes[0] && (Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material).uuid,
      pose: bones.flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()].map(v => Math.round(v * 10000))),
    };
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    // SkeletonUtils clones share geometry/material/texture, but own their skeletons and bone textures.
    for (const skeleton of this.skeletons) skeleton.dispose();
    this.release();
  }
}
