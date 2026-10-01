import { Box3, Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from './disposeScene';

export type AssetKind = 'tower' | 'bow' | 'arrow';
const FILES: Record<AssetKind, string[]> = {
  tower: ['arrow-tower.glb', 'arrow.glb'],
  bow: ['bow.glb'],
  arrow: ['arrow.glb'],
};

// One owned preview instance, with no mixer, aiming or projectile simulation.
export class StaticPreviewAsset {
  readonly root = new Group();
  readonly bounds: Box3;
  readonly report: {
    kind: AssetKind;
    files: string[];
    bounds: { min: number[]; max: number[] };
    muzzle: number[] | null;
    arrow: number[] | null;
    clips: string[];
  };

  static async load(kind: AssetKind): Promise<StaticPreviewAsset> {
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(FILES[kind].map((file) =>
      loader.loadAsync(`${import.meta.env.BASE_URL}assets/arrow-tower/${file}`)));
    const models = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const failed = results.find((result) => result.status === 'rejected');
    try {
      if (failed?.status === 'rejected') throw failed.reason;
      return new StaticPreviewAsset(kind, models.map((model) => model.scene),
        models.flatMap((model) => model.animations.map((clip) => clip.name)));
    } catch (error) {
      for (const model of models) disposeScene(model.scene);
      throw error;
    }
  }

  private constructor(kind: AssetKind, scenes: Group[], clips: string[]) {
    this.root.name = `StaticPreview:${kind}`;
    const model = scenes[0];
    this.root.add(model);
    if (kind === 'tower') {
      const muzzle = model.getObjectByName('Muzzle');
      if (!muzzle) throw new Error('箭塔缺少 Muzzle 出箭节点');
      // Use the exported socket transform, including its inherited orientation.
      muzzle.add(scenes[1]);
    }
    this.root.updateMatrixWorld(true);
    const initialBounds = new Box3().setFromObject(this.root, true);
    if (kind === 'tower' && Math.abs(initialBounds.min.y) > 0.001) {
      throw new Error(`箭塔地面原点不正确：${initialBounds.min.y}`);
    }
    // Standalone assets use their own modelling origin. Place their bottom on the display floor.
    if (kind !== 'tower') this.root.position.y = -initialBounds.min.y;
    this.root.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.root.updateMatrixWorld(true);
    this.bounds = new Box3().setFromObject(this.root, true);
    const worldPosition = (name: string) => this.root.getObjectByName(name)?.getWorldPosition(new Vector3()).toArray() ?? null;
    this.report = {
      kind, files: FILES[kind],
      bounds: { min: this.bounds.min.toArray(), max: this.bounds.max.toArray() },
      muzzle: worldPosition('Muzzle'), arrow: worldPosition('ArrowRoot'), clips,
    };
  }

  dispose(): void { disposeScene(this.root); }
}
