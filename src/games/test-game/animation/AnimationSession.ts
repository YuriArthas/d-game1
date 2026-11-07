import { Box3, BufferGeometry, Group, Material, Mesh, Texture, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { cloneSkeletonModel } from '../../rendering/cloneSkeletonModel';
import { ANIMATED_MODELS } from './AnimationModels';
import { disposeScene } from '../../rendering/disposeScene';
import { AnimationActor, type AnimatedKind } from './AnimationActor';

export class AnimationSession {
  readonly root = new Group();
  readonly actors: (AnimationActor | null)[] = [null, null];
  readonly bounds: Box3;
  closed = false;
  private alive = 0;
  private created = 0;
  private destroyed = 0;
  private viewYaw = -.4;
  private resourceDisposals = { geometry: 0, material: 0, texture: 0 };
  private resourceCounts = { geometry: 0, material: 0, texture: 0 };
  renderMemory = { geometries: 0, textures: 0 };

  static async load(kind: AnimatedKind): Promise<AnimationSession> {
    const paths = [ANIMATED_MODELS[kind].path];
    if (kind === 'tower') paths.push('arrow-tower/arrow.glb');
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(paths.map(path => loader.loadAsync(`${import.meta.env.BASE_URL}assets/${path}`)));
    const models = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      for (const model of models) disposeScene(model.scene);
      throw failure.reason;
    }
    const template = models[0];
    if (kind === 'tower') {
      const muzzle = template.scene.getObjectByName('Muzzle');
      if (!muzzle) { models.forEach(model => disposeScene(model.scene)); throw new Error('缺少 Muzzle'); }
      models[1].scene.name = 'LoadedArrow';
      muzzle.add(models[1].scene);
    }
    try { return new AnimationSession(kind, template); }
    catch (error) { disposeScene(template.scene); throw error; }
  }

  private constructor(readonly kind: AnimatedKind, private readonly template: GLTF) {
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
    template.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        Object.values(material).forEach(value => { if (value instanceof Texture) textures.add(value); });
      }
    });
    this.resourceCounts = { geometry: geometries.size, material: materials.size, texture: textures.size };
    geometries.forEach(resource => resource.addEventListener('dispose', () => this.resourceDisposals.geometry++));
    materials.forEach(resource => resource.addEventListener('dispose', () => this.resourceDisposals.material++));
    textures.forEach(resource => resource.addEventListener('dispose', () => this.resourceDisposals.texture++));
    this.create(0); this.create(1);
    this.root.updateMatrixWorld(true);
    this.bounds = new Box3().setFromObject(this.root, true);
    if (kind === 'cavalry') this.setViewYaw(-.4);
  }

  setViewYaw(yaw: number): void {
    if (this.kind !== 'cavalry' || this.closed) return;
    this.viewYaw = yaw;
    const envelope: unknown = this.template.scene.getObjectByName('CavalryRoot')?.userData.motion_bounds;
    if (!Array.isArray(envelope) || envelope.length !== 6 || !envelope.every(Number.isFinite)) {
      throw new Error('骑兵资产缺少动作取景范围');
    }
    this.bounds.makeEmpty();
    for (const actor of this.actors) {
      if (!actor) continue;
      actor.root.rotation.y = yaw;
      actor.root.updateMatrixWorld(true);
      for (const x of [envelope[0], envelope[3]]) for (const y of [envelope[1], envelope[4]]) for (const z of [envelope[2], envelope[5]]) {
        this.bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(actor.root.matrixWorld));
      }
    }
  }

  create(index: number): void {
    if (this.closed) throw new Error('资源已卸载');
    if (this.actors[index]) return;
    const root = cloneSkeletonModel(this.template.scene) as Group;
    if (this.kind === 'cavalry') root.rotation.y = this.viewYaw;
    const actor = new AnimationActor(root, this.kind, this.template.animations, () => { this.alive--; this.destroyed++; });
    root.position.x = (index === 0 ? -1 : 1) * ANIMATED_MODELS[this.kind].spacing;
    this.root.add(root);
    this.actors[index] = actor;
    this.alive++; this.created++;
  }

  destroy(index: number): void { this.actors[index]?.dispose(); this.actors[index] = null; }
  update(delta: number): void { this.actors.forEach(actor => actor?.update(delta)); }
  inspect() {
    return { kind: this.kind, closed: this.closed, alive: this.alive, created: this.created, destroyed: this.destroyed,
      viewYaw: this.kind === 'cavalry' ? this.viewYaw : null,
      resourceCounts: this.resourceCounts, resourceDisposals: this.resourceDisposals, renderMemory: this.renderMemory,
      actors: this.actors.map(actor => actor?.inspect() ?? null) };
  }
  dispose(): void {
    if (this.closed) return;
    this.destroy(0); this.destroy(1);
    this.closed = true;
    disposeScene(this.template.scene);
  }
}
