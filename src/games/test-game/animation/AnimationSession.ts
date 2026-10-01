import { Box3, BufferGeometry, Group, Material, Mesh, Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeScene } from '../disposeScene';
import { AnimationActor, type AnimatedKind } from './AnimationActor';

export class AnimationSession {
  readonly root = new Group();
  readonly actors: (AnimationActor | null)[] = [null, null];
  readonly bounds: Box3;
  closed = false;
  private alive = 0;
  private created = 0;
  private destroyed = 0;
  private resourceDisposals = { geometry: 0, material: 0, texture: 0 };
  private resourceCounts = { geometry: 0, material: 0, texture: 0 };
  renderMemory = { geometries: 0, textures: 0 };

  static async load(kind: AnimatedKind): Promise<AnimationSession> {
    const paths = kind === 'tower' ? ['arrow-tower/arrow-tower.glb', 'arrow-tower/arrow.glb'] : ['kaykit-skeletons/Skeleton_Minion.glb'];
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
  }

  create(index: number): void {
    if (this.closed) throw new Error('资源已卸载');
    if (this.actors[index]) return;
    const root = clone(this.template.scene) as Group;
    const actor = new AnimationActor(root, this.kind, this.template.animations, () => { this.alive--; this.destroyed++; });
    root.position.x = (index === 0 ? -1 : 1) * (this.kind === 'tower' ? 2.05 : 1.25);
    this.root.add(root);
    this.actors[index] = actor;
    this.alive++; this.created++;
  }

  destroy(index: number): void { this.actors[index]?.dispose(); this.actors[index] = null; }
  update(delta: number): void { this.actors.forEach(actor => actor?.update(delta)); }
  inspect() {
    return { kind: this.kind, closed: this.closed, alive: this.alive, created: this.created, destroyed: this.destroyed,
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
