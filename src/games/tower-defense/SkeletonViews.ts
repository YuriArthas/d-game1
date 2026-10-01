import { AnimationClip, AnimationMixer, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { cloneSkeletonModel } from '../rendering/cloneSkeletonModel';
import { disposeScene } from '../rendering/disposeScene';
import type { UnitView } from './EnemyUnit';

// One concrete skeleton asset; callers choose their display scale explicitly.
export class SkeletonViews {
  private readonly views = new Set<SkeletonView>();
  private closed = false;
  private created = 0;
  private released = 0;
  private sharedGeometryDisposals = 0;
  private readonly walk: AnimationClip;
  private readonly death: AnimationClip;

  static async load(scale: number, healthBars: boolean): Promise<SkeletonViews> {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/kaykit-skeletons/Skeleton_Minion.glb`);
    try { return new SkeletonViews(gltf, scale, healthBars); }
    catch (error) { disposeScene(gltf.scene); throw error; }
  }
  private constructor(private readonly template: GLTF, private readonly scale: number, private readonly healthBars: boolean) {
    const requireClip = (name: string) => {
      const clip = template.animations.find(item => item.name === name);
      if (!clip || clip.duration <= 0) throw new Error(`骷髅缺少有效动作：${name}`);
      return clip;
    };
    requireClip('Idle'); this.walk = requireClip('Walking_A'); this.death = requireClip('Death_A');
    const geometries = new Set<Mesh['geometry']>();
    let hasSkin = false;
    template.scene.traverse(object => {
      if (object instanceof Mesh) geometries.add(object.geometry);
      if (object instanceof SkinnedMesh) hasSkin = true;
    });
    if (!hasSkin) throw new Error('骷髅模型缺少蒙皮网格');
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => this.sharedGeometryDisposals++));
  }
  create = (): UnitView => {
    if (this.closed) throw new Error('骷髅模板已卸载');
    const view = new SkeletonView(cloneSkeletonModel(this.template.scene), this.walk, this.death, this.scale, this.healthBars, () => {
      this.views.delete(view); this.released++;
    });
    this.views.add(view); this.created++;
    return view;
  };
  inspect() { return { closed: this.closed, activeViews: this.views.size, created: this.created, released: this.released, sharedGeometryDisposals: this.sharedGeometryDisposals }; }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const view of this.views) view.dispose();
    disposeScene(this.template.scene);
  }
}

class SkeletonView implements UnitView {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly skeletons = new Set<SkinnedMesh['skeleton']>();
  private readonly mesh: SkinnedMesh;
  private readonly meshCount: number;
  private finished = false;
  private disposed = false;
  private action;
  private readonly deathAction;
  private readonly healthBar: Group | null;
  private readonly healthFill: Mesh<PlaneGeometry, MeshBasicMaterial> | null;

  constructor(model: Object3D, walk: AnimationClip, death: AnimationClip, scale: number, healthBars: boolean, private readonly release: () => void) {
    const meshes: SkinnedMesh[] = [];
    model.traverse(object => {
      if (object instanceof Mesh) object.castShadow = true;
      if (object instanceof SkinnedMesh) { meshes.push(object); this.skeletons.add(object.skeleton); }
    });
    this.mesh = meshes[0];
    this.meshCount = meshes.length;
    model.scale.setScalar(scale);
    this.root.add(model);
    this.healthBar = healthBars ? new Group() : null;
    this.healthFill = healthBars ? new Mesh(new PlaneGeometry(1, 0.12), new MeshBasicMaterial({ color: '#b9eb89', depthTest: false })) : null;
    if (this.healthBar && this.healthFill) {
      const back = new Mesh(new PlaneGeometry(1.1, 0.22), new MeshBasicMaterial({ color: '#203536', depthTest: false }));
      this.healthFill.geometry.translate(0.5, 0, 0);
      this.healthFill.position.set(-0.5, 0, 0.005);
      back.renderOrder = 2; this.healthFill.renderOrder = 3;
      this.healthBar.add(back, this.healthFill);
      this.healthBar.position.y = 2.4;
      this.healthBar.rotation.x = -Math.atan2(20, 14);
      this.root.add(this.healthBar);
    }
    this.mixer = new AnimationMixer(model);
    this.action = this.mixer.clipAction(walk).setLoop(LoopRepeat, Infinity).play();
    this.deathAction = this.mixer.clipAction(death).setLoop(LoopOnce, 1);
    this.deathAction.clampWhenFinished = true;
    this.mixer.addEventListener('finished', event => { if (event.action === this.deathAction) this.finished = true; });
    this.mixer.update(0);
  }
  sync(position: Vector3, direction: Vector3, healthFraction: number): void {
    this.root.rotation.y = Math.atan2(direction.x, direction.z);
    this.root.position.copy(position);
    if (this.healthBar && this.healthFill) {
      this.healthBar.rotation.set(-Math.atan2(20, 14), -this.root.rotation.y, 0, 'YXZ');
      this.healthFill.scale.x = healthFraction;
    }
  }
  update(delta: number): void { this.mixer.update(delta); }
  markDead(): void {
    if (this.healthBar) this.healthBar.visible = false;
    this.action.stop(); this.action = this.deathAction.reset().play(); this.mixer.update(0);
  }
  updateDeath(delta: number): boolean { this.mixer.update(delta); return this.finished; }
  inspect() {
    const bone = this.mesh.skeleton.bones[0];
    return { clip: this.action.getClip().name, time: this.action.time, clock: this.mixer.time,
      skeletonId: this.mesh.skeleton.uuid, boneId: bone.uuid, geometryId: this.mesh.geometry.uuid,
      skeletonCount: this.skeletons.size, skinnedMeshCount: this.meshCount,
      pose: bone.quaternion.toArray(), heading: this.root.rotation.y };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot());
    for (const skeleton of this.skeletons) skeleton.dispose();
    this.healthBar?.traverse(object => {
      if (object instanceof Mesh) { object.geometry.dispose(); object.material.dispose(); }
    });
    this.release();
  }
}
