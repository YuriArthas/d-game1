import { AnimationClip, AnimationMixer, Box3, Group, LoopOnce, Material, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { cloneSkeletonModel } from '../rendering/cloneSkeletonModel';
import { disposeScene } from '../rendering/disposeScene';
import type { Vec2Data } from './data/types';
import type { TowerView } from './TowerUnit';
import type { ProjectileView } from './ProjectileUnit';

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const RELEASE_TIME = 0.5; // Authored Shoot clip release point, mapped to gameplay windup.

export class ArrowTowerViews {
  private readonly views = new Set<ArrowTowerView>();
  private readonly arrows = new Set<ArrowView>();
  private closed = false;
  private created = 0;
  private released = 0;
  private arrowsCreated = 0;
  private arrowsReleased = 0;
  private geometryDisposals = 0;
  readonly height: number;

  static async load(): Promise<ArrowTowerViews> {
    const results = await Promise.allSettled(['arrow-tower.glb', 'arrow.glb'].map(file =>
      new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/arrow-tower/${file}`)));
    const models = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') { models.forEach(model => disposeScene(model.scene)); throw failure.reason; }
    return ArrowTowerViews.fromModels(models[0], models[1]);
  }
  // Takes ownership of both decoded assets, including cleanup on validation failure.
  static fromModels(tower: GLTF, arrow: GLTF): ArrowTowerViews {
    const muzzle = tower.scene.getObjectByName('Muzzle'), pull = tower.scene.getObjectByName('StringPull');
    const yaw = tower.scene.getObjectByName('TurretYaw'), tip = arrow.scene.getObjectByName('ArrowTip');
    const shoot = tower.animations.find(clip => clip.name === 'Shoot');
    if (!muzzle || !pull || !yaw || !tip || !shoot || shoot.duration < RELEASE_TIME) {
      disposeScene(tower.scene); disposeScene(arrow.scene);
      throw new Error('箭塔资产缺少 Muzzle / StringPull / TurretYaw / ArrowTip 或有效 Shoot 动作');
    }
    arrow.scene.updateMatrixWorld(true);
    const tipOffset = tip.getWorldPosition(new Vector3());
    const projectile = arrow.scene.clone(true);
    arrow.scene.name = 'LoadedArrow';
    muzzle.add(arrow.scene);
    tower.scene.updateMatrixWorld(true);
    pull.attach(arrow.scene);
    // Cache release geometry at load time. Logic never reads a previous render's bone pose.
    const mixer = new AnimationMixer(tower.scene);
    mixer.clipAction(shoot).play(); mixer.setTime(RELEASE_TIME);
    tower.scene.updateMatrixWorld(true);
    const launchOffset = tip.getWorldPosition(new Vector3());
    mixer.stopAllAction(); mixer.uncacheRoot(tower.scene);
    try { return new ArrowTowerViews(tower.scene, projectile, shoot, launchOffset, tipOffset); }
    catch (error) { disposeScene(tower.scene); throw error; }
  }
  private constructor(private readonly template: Object3D, private readonly arrowTemplate: Object3D,
    private readonly shoot: AnimationClip, private readonly launchOffset: Vector3, private readonly tipOffset: Vector3) {
    template.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(template, true);
    if (Math.abs(bounds.min.y) > 0.001) throw new Error('箭塔地面原点不正确');
    this.height = bounds.max.y;
    const geometries = new Set<Mesh['geometry']>();
    template.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = object.receiveShadow = true;
        geometries.add(object.geometry);
      }
    });
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => this.geometryDisposals++));
  }
  create(position: Vec2Data, preview = false): ArrowTowerView {
    const view = new ArrowTowerView(cloneSkeletonModel(this.template), this.shoot, this.launchOffset, preview, () => {
      this.views.delete(view); this.released++;
    });
    view.root.position.set(position[0], 0, position[1]);
    this.views.add(view); this.created++;
    return view;
  }
  createProjectile = (): ProjectileView => {
    const view = new ArrowView(this.arrowTemplate.clone(true), this.tipOffset, () => {
      this.arrows.delete(view); this.arrowsReleased++;
    });
    this.arrows.add(view); this.arrowsCreated++;
    return view;
  };
  inspect() {
    return { active: this.views.size, created: this.created, released: this.released, geometryDisposals: this.geometryDisposals,
      arrows: this.arrows.size, arrowsCreated: this.arrowsCreated, arrowsReleased: this.arrowsReleased };
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const view of this.views) view.dispose();
    for (const arrow of this.arrows) arrow.dispose();
    // Loaded and flying arrows share geometry/materials owned by the tower template.
    disposeScene(this.template);
  }
}

export class ArrowTowerView implements TowerView {
  readonly root = new Group();
  private readonly skeletons = new Set<SkinnedMesh['skeleton']>();
  private readonly previewMaterials: Material[] = [];
  private readonly mixer: AnimationMixer;
  private readonly action;
  private readonly yaw: Object3D;
  private readonly loadedArrow: Object3D;
  private disposed = false;

  constructor(model: Object3D, clip: AnimationClip, private readonly launchOffset: Vector3,
    preview: boolean, private readonly release: () => void) {
    this.root.add(model);
    this.yaw = model.getObjectByName('TurretYaw')!;
    this.loadedArrow = model.getObjectByName('LoadedArrow')!;
    this.mixer = new AnimationMixer(model);
    this.action = this.mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
    this.action.paused = true;
    this.mixer.update(0);
    const materials = new Map<Material, Material>();
    const translucent = (material: Material) => {
      let owned = materials.get(material);
      if (!owned) {
        owned = material.clone(); owned.transparent = true; owned.opacity = 0.48; owned.depthWrite = false;
        materials.set(material, owned); this.previewMaterials.push(owned);
      }
      return owned;
    };
    model.traverse(object => {
      if (object instanceof SkinnedMesh) this.skeletons.add(object.skeleton);
      if (preview && object instanceof Mesh) {
        object.castShadow = false;
        object.material = Array.isArray(object.material) ? object.material.map(translucent) : translucent(object.material);
      }
    });
  }
  sync(heading: number, attackAge: number | null, windup: number): void {
    const time = attackAge === null ? 0 : attackAge * RELEASE_TIME / windup;
    this.action.time = Math.min(time, this.action.getClip().duration);
    this.mixer.update(0);
    this.yaw.rotation.y = heading;
    this.loadedArrow.visible = attackAge === null || attackAge + 1e-9 < windup || time >= this.action.getClip().duration;
  }
  launchPosition(heading: number, result: Vector3): void {
    result.copy(this.launchOffset).applyAxisAngle(UP, heading).add(this.root.position);
  }
  showPreview(position: Vec2Data, color: string, visible: boolean): void {
    this.root.position.set(position[0], 0, position[1]);
    this.root.visible = visible;
    for (const material of this.previewMaterials) {
      if (material instanceof MeshStandardMaterial) { material.emissive.set(color); material.emissiveIntensity = 0.35; }
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot());
    this.skeletons.forEach(skeleton => skeleton.dispose());
    this.previewMaterials.forEach(material => material.dispose());
    this.release();
  }
}

class ArrowView implements ProjectileView {
  readonly root = new Group();
  constructor(model: Object3D, tipOffset: Vector3, private readonly release: () => void) {
    model.position.sub(tipOffset);
    this.root.add(model);
  }
  sync(tip: Vector3, direction: Vector3): void {
    this.root.position.copy(tip);
    this.root.quaternion.setFromUnitVectors(FORWARD, direction);
  }
  dispose(): void { this.root.removeFromParent(); this.release(); }
}
