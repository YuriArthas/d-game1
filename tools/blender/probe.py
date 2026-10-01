"""Run with Blender --background --factory-startup --python probe.py -- OUTPUT_DIR."""
import bpy
import hashlib
import json
from pathlib import Path
import struct
import sys
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'public/assets/kaykit-skeletons/Skeleton_Minion.glb'
REPORT = {'version': bpy.app.version_string, 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest()}


def setup_stage():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = 30
    scene.world.color = (0.18, 0.18, 0.18)
    bpy.ops.object.camera_add(location=(4, -6, 3.5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 0.9)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 4.3
    scene.camera = camera
    bpy.ops.object.light_add(type='AREA', location=(2, -4, 6))
    bpy.context.object.data.energy = 650
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 5
    bpy.context.object.rotation_euler = (Vector((0, 0, 1)) - bpy.context.object.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200)
    ground = bpy.context.object
    ground.name = 'ProbeGround'
    material = bpy.data.materials.new('ProbeGroundMaterial')
    material.diffuse_color = (0.10, 0.23, 0.15, 1)
    if material.node_tree is None:
        material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = material.diffuse_color
    ground.data.materials.append(material)


def render(name):
    bpy.context.scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
setup_stage()
render('cube.png')
REPORT['primitive_cpu_render'] = True

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
imported = list(bpy.context.scene.objects)
rigs = [obj for obj in imported if obj.type == 'ARMATURE']
meshes = [obj for obj in imported if obj.type == 'MESH']
assert len(rigs) == 1, f'Expected one rig, found {len(rigs)}'
rig = rigs[0]
actions = {name: bpy.data.actions.get(name) for name in ('Idle', 'Walking_A', 'Death_A')}
assert all(actions.values()), f'Missing actions: {actions}'
REPORT['import'] = {
    'mesh_objects': len(meshes), 'armatures': len(rigs), 'bones': len(rig.data.bones),
    'actions': len(bpy.data.actions),
    'selected_actions': {name: list(action.frame_range) for name, action in actions.items()},
    'materials': sorted({mat.name for obj in meshes for mat in obj.data.materials if mat}),
    'images': [{'name': img.name, 'size': list(img.size), 'packed': bool(img.packed_file)} for img in bpy.data.images if img.type == 'IMAGE'],
}

# Exercise reversible transform and material edits on the imported test copy.
original_location = rig.location.copy()
original_scale = rig.scale.copy()
rig.location.x += 1
rig.scale *= 1.25
bpy.context.view_layer.update()
REPORT['transform_edit'] = {'location': list(rig.location), 'scale': list(rig.scale)}
rig.location = original_location
rig.scale = original_scale
material = next(mat for obj in meshes for mat in obj.data.materials if mat and mat.node_tree)
bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
old_roughness = bsdf.inputs['Roughness'].default_value
bsdf.inputs['Roughness'].default_value = 0.65
REPORT['material_edit'] = {'material': material.name, 'roughness_before': old_roughness, 'roughness_test': bsdf.inputs['Roughness'].default_value}
bsdf.inputs['Roughness'].default_value = old_roughness

# The importer stashes clips in NLA tracks; mute them while selecting one action.
for obj in imported:
    if obj.animation_data:
        for track in obj.animation_data.nla_tracks:
            track.mute = True


def pose(name, frame):
    action = actions[name]
    rig.animation_data_create()
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(int(frame))
    bpy.context.view_layer.update()


setup_stage()
pose('Idle', 1)
render('idle.png')
pose('Walking_A', 5)
render('walk-a.png')
pose('Walking_A', 15)
render('walk-b.png')
pose('Death_A', actions['Death_A'].frame_range[1])
render('death.png')
pose('Idle', 1)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'skeleton-probe.blend'))

# Export only character objects. Keep original clips; do not replace the game asset.
bpy.ops.object.select_all(action='DESELECT')
for obj in imported:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
export_path = OUT / 'skeleton-roundtrip.glb'
bpy.ops.export_scene.gltf(filepath=str(export_path), export_format='GLB', use_selection=True,
                          export_animations=True, export_animation_mode='ACTIONS')
blob = export_path.read_bytes()
gltf = json.loads(blob[20:20 + struct.unpack_from('<I', blob, 12)[0]])
exported_names = [clip['name'] for clip in gltf.get('animations', [])]
REPORT['export'] = {'bytes': len(blob), 'animations': exported_names,
                    'skins': len(gltf.get('skins', [])), 'images': gltf.get('images', [])}
assert all(name in exported_names for name in actions), exported_names

# Import exported file into a fresh scene to verify an actual round trip.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(export_path))
REPORT['reimport'] = {'mesh_objects': sum(obj.type == 'MESH' for obj in bpy.context.scene.objects),
                       'armatures': sum(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects),
                       'actions': len(bpy.data.actions)}
assert REPORT['reimport']['armatures'] == 1
assert all(bpy.data.actions.get(name) for name in actions)
(OUT / 'report.json').write_text(json.dumps(REPORT, indent=2, ensure_ascii=False))
print('PROBE_COMPLETE', json.dumps(REPORT['reimport']))
