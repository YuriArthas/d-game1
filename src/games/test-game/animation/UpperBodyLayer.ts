import { AnimationAction, AnimationClip, AnimationMixer, Bone, LoopOnce, LoopRepeat, Object3D, PropertyBinding } from 'three';

// One masked upper-body override. Bones outside the configured subtree belong to the base action.
export class UpperBodyLayer {
  private readonly bones = new Set<string>();
  private readonly partitions = new Map<AnimationClip, { lower: AnimationClip; upper: AnimationClip }>();
  private readonly attack: AnimationAction;
  private base: AnimationAction | null = null;
  private playing = false;
  private fadingOut = false;
  private paused = false;
  private envelope = 0;
  private weight = 1;
  private speed = 1;
  private finishes = 0;
  private loops = 0;

  constructor(root: Object3D, private readonly mixer: AnimationMixer, clips: AnimationClip[], options = { rootBone: 'Spine', attack: 'UpperAttack' }) {
    const spine = root.getObjectByName(options.rootBone);
    const attack = clips.find(clip => clip.name === options.attack);
    if (!(spine instanceof Bone) || !attack) throw new Error(`分层样本缺少 ${options.rootBone} 骨骼或 ${options.attack} 动作`);
    spine.traverse(node => { if (node instanceof Bone) this.bones.add(node.name); });
    const tracks = attack.tracks.filter(track => this.isUpper(track.name));
    if (tracks.length === 0) throw new Error(`${options.attack} 没有上半身轨道`);
    this.attack = mixer.clipAction(new AnimationClip(`${options.attack}:upper`, attack.duration, tracks));
    mixer.addEventListener('finished', event => {
      if (event.action !== this.attack) return;
      this.finishes++;
      this.fadingOut = true;
    });
    mixer.addEventListener('loop', event => {
      if (event.action === this.attack) this.loops += Math.abs(event.loopDelta);
    });
  }

  private isUpper(trackName: string): boolean {
    return this.bones.has(PropertyBinding.parseTrackName(trackName).nodeName);
  }

  beginBase(source: AnimationClip, speed: number): AnimationClip {
    let pair = this.partitions.get(source);
    if (!pair) {
      pair = {
        lower: new AnimationClip(`${source.name}:lower`, source.duration, source.tracks.filter(t => !this.isUpper(t.name))),
        upper: new AnimationClip(`${source.name}:upper`, source.duration, source.tracks.filter(t => this.isUpper(t.name))),
      };
      this.partitions.set(source, pair);
    }
    this.base?.stop();
    this.base = this.mixer.clipAction(pair.upper).reset().setLoop(LoopRepeat, Infinity);
    this.base.setEffectiveTimeScale(speed).play();
    this.applyWeights();
    return pair.lower;
  }

  play(loop = false): void {
    if (!this.base) throw new Error('上身攻击需要待机或行走中的基础动作');
    this.attack.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    this.attack.clampWhenFinished = true;
    this.attack.setEffectiveTimeScale(this.speed).play();
    this.playing = true;
    this.fadingOut = this.paused = false;
    this.envelope = this.finishes = this.loops = 0;
    this.applyWeights();
  }

  stop(): void {
    this.fadingOut = true;
    this.paused = false;
    this.attack.paused = true; // Hold the current upper pose while blending back to locomotion.
  }

  update(delta: number): void {
    if (!this.playing || this.paused) return;
    this.envelope = Math.max(0, Math.min(1, this.envelope + (this.fadingOut ? -1 : 1) * delta / .12));
    if (this.fadingOut && this.envelope === 0) {
      this.attack.stop();
      this.playing = this.fadingOut = false;
    }
    this.applyWeights();
  }

  private applyWeights(): void {
    const amount = this.envelope * this.weight;
    this.base?.setEffectiveWeight(1 - amount);
    this.attack.setEffectiveWeight(amount);
  }

  setWeight(weight: number): void { this.weight = weight; this.applyWeights(); }
  setSpeed(speed: number): void { this.speed = speed; this.attack.setEffectiveTimeScale(speed); }
  togglePause(): void { this.paused = !this.paused; this.attack.paused = this.paused; }
  seek(seconds: number): void {
    this.attack.enabled = true;
    this.attack.time = Math.max(0, Math.min(seconds, this.attack.getClip().duration));
    this.attack.paused = this.paused = true;
    this.fadingOut = false;
    this.envelope = 1;
    this.applyWeights();
  }
  pauseBase(paused: boolean): void { if (this.base) this.base.paused = paused; }
  seekBase(seconds: number): void {
    if (!this.base) return;
    this.base.time = seconds;
    this.base.paused = true;
  }
  setBaseSpeed(speed: number): void { this.base?.setEffectiveTimeScale(speed); }

  interrupt(): void {
    this.base?.stop();
    this.base = null;
    this.attack.stop();
    this.playing = this.fadingOut = this.paused = false;
    this.envelope = 0;
  }

  inspect() {
    return { available: this.base !== null, playing: this.playing, paused: this.paused,
      state: !this.playing ? 'off' : this.paused ? 'paused' : this.fadingOut ? 'fading-out' : 'playing',
      time: this.attack.time, duration: this.attack.getClip().duration, speed: this.speed,
      weight: this.weight, effectiveWeight: this.weight * this.envelope, finishes: this.finishes, loops: this.loops };
  }
}
