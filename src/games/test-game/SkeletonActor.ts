import {
  AnimationAction, AnimationMixer, LoopOnce, LoopRepeat,
  Mesh, Object3D,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from './disposeScene';

export type SkeletonMotion = 'idle' | 'walk' | 'death';
const CLIPS: Record<SkeletonMotion, string> = {
  idle: 'Idle', walk: 'Walking_A', death: 'Death_A',
};

// Each load owns its scene, skeleton, mixer and GPU resources; no shared cache yet.
export class SkeletonActor {
  readonly root: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions: Record<SkeletonMotion, AnimationAction>;

  static async load(url: string): Promise<SkeletonActor> {
    const gltf = await new GLTFLoader().loadAsync(url);
    try {
      return new SkeletonActor(gltf);
    } catch (error) {
      disposeScene(gltf.scene);
      throw error;
    }
  }

  private constructor(gltf: GLTF) {
    this.root = gltf.scene;
    this.mixer = new AnimationMixer(this.root);
    const action = (motion: SkeletonMotion) => {
      const clip = gltf.animations.find((candidate) => candidate.name === CLIPS[motion]);
      if (!clip) throw new Error(`模型缺少动作：${CLIPS[motion]}`);
      return this.mixer.clipAction(clip);
    };
    this.actions = { idle: action('idle'), walk: action('walk'), death: action('death') };
    this.root.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = true;
    });
  }

  play(motion: SkeletonMotion): void {
    this.mixer.stopAllAction();
    const action = this.actions[motion];
    action.reset();
    action.setLoop(motion === 'death' ? LoopOnce : LoopRepeat, motion === 'death' ? 1 : Infinity);
    action.clampWhenFinished = motion === 'death';
    action.play();
  }

  update(deltaSeconds: number): void { this.mixer.update(deltaSeconds); }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    disposeScene(this.root);
  }
}

