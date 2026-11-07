# Original creature and tower samples

Created for this project with Blender 5.1.2. Geometry, materials, rigs and animation
keyframes are authored by `tools/blender/build_frontier.py`; no third-party models,
textures or motion clips are used. The low-poly characters use rigid segment
weights, not smooth anatomical deformation.

Editable sources: `assets-source/frontier/*.blend`. Each file includes the model,
armature, named Actions and a lit presentation scene. Cameras, lights, display
plinths and floors are excluded from the GLBs. Select `Rig` in Blender and use the
Action Editor to choose a clip; animation is on the armature, not the scene root.

| File | Role sample | Clips (seconds) |
| --- | --- | --- |
| bone-crawler.glb | Six-legged swarm creature | Idle 2; Walk 0.8; Death 1.2 |
| moss-runner.glb | Fast biped with scarf | Idle 2; Walk 2/3; Death 1.2; UpperAttack 1 |
| stone-brute.glb | Broad, heavy creature with ember crystals | Idle 2; Walk 1.4; Death 1.6 |
| cannon-tower.glb | Timber/stone cannon with barrel recoil | Shoot 1 |
| frost-tower.glb | Stone spire with floating crystals | Idle 2; Shoot 1.2 |

- Units: metres. Blender Z up / -Y forward; glTF and Three.js Y up / +Z forward.
- `EnemyRoot` / `TowerRoot`: stationary ground-centre identity, no locomotion.
- `Rig`: one armature per asset; material primitives share one skin.
- `Idle` / `Walk`: matching endpoint poses, intended to loop.
- `Death`: one-shot fall/collapse, held final pose. Play once and clamp.
- Runner `UpperAttack`: upper-body windup, forward strike and recovery. Blender
  keys only Spine and its children (Head, arms, forearms, Scarf). The preview
  masks imported tracks to that subtree; Body/hips/legs stay on Idle or Walk.
  Preview attack weight ranges from 0 to 1, with a 0.12 s blend in/out. Death
  interrupts the upper layer and owns the complete rig.
- `Shoot`: one-shot pose cycle returning to rest. Cannon release: 0.4 s;
  frost release: 0.6 s. These are asset timing conventions, not damage callbacks.
- `TurretYaw`: parent of the tower's animated assembly, rotates around runtime Y.
- `Muzzle`: fixed launch reference under `TurretYaw`, not a moving recoil socket.
  Cannon glTF position: (0, 2.21, 1.14). Frost: (0, 2.8, 0).
- All colors are embedded PBR materials; no image textures or external URLs.
- Foot/corpse floor contact is solved when authoring and baked into Body keys.
  Runtime code does not reposition or repair the models.

Preview through the existing test game's “动作与实例” page. These assets have not
been assigned combat stats, enemy spawn entries, tower attacks or upgrade rules.

Rebuild from the repository root:

```bash
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python tools/blender/build_frontier.py
```

To rebuild a subset, append `-- bone-crawler cannon-tower` (use the file stems).
Exports are reimported into Blender, and measurements are written to
`artifacts/frontier/<asset>.json`. Renders are evidence outside the runtime bundle.
