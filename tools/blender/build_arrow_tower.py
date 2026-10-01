"""Blender 5: build an original tower, bow and arrow; export and validate GLBs."""
import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/arrow-tower'
SOURCE = ROOT / 'assets-source/arrow-tower'
EVIDENCE = ROOT / 'artifacts/arrow-tower'
for directory in (OUT, SOURCE, EVIDENCE):
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start, scene.frame_end = 0, 30
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1


def material(name, color, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = mat.diffuse_color
    shader.inputs['Roughness'].default_value = .72
    shader.inputs['Metallic'].default_value = metallic
    return mat


wood = material('Warm timber', (.32, .13, .045))
lightwood = material('Fresh timber', (.54, .28, .10))
stone = material('Foundation stone', (.32, .38, .40))
stone_light = material('Edge stone', (.45, .51, .52))
metal = material('Dark iron', (.095, .14, .17), .5)
teal = material('Teal accent', (.045, .35, .32))
cord = material('Bowstring', (.83, .72, .48))
steel = material('Arrow steel', (.55, .65, .68), .65)
feather = material('Ivory fletching', (.80, .84, .72))


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent, obj.location = parent, location
    obj.empty_display_size = .15
    return obj


def finish(obj, name, mat, parent):
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def box(name, center, size, mat, parent, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = finish(bpy.context.object, name, mat, parent)
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Small bevel', 'BEVEL')
        modifier.width, modifier.segments = bevel, 1
    return obj


def beam(name, start, end, radius, mat, parent, vertices=8):
    start, end = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(end-start).length,
                                      location=(start+end)/2)
    obj = finish(bpy.context.object, name, mat, parent)
    obj.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    return obj


tower = empty('TowerRoot')
box('Foundation', (0, 0, .16), (2.2, 2.2, .32), stone, tower, .09)
box('FoundationCap', (0, 0, .36), (2.06, 2.06, .12), stone_light, tower)
for x in (-.74, .74):
    for y in (-.74, .74):
        box('TimberPost', (x, y, 1.25), (.25, .25, 1.7), wood, tower)
        for z in (.57, 1.9):
            box('PostBand', (x, y, z), (.28, .28, .13), metal, tower, .01)
for y in (-.74, .74):
    beam('CrossBrace', (-.74, y, .6), (.74, y, 1.87), .075, lightwood, tower)
    beam('CrossBrace', (.74, y, .6), (-.74, y, 1.87), .075, lightwood, tower)
for x in (-.74, .74):
    beam('SideBrace', (x, -.74, .6), (x, .74, 1.87), .075, lightwood, tower)
box('DeckRim', (0, 0, 2.04), (2.12, 2.12, .24), wood, tower)
for i in range(7):
    box('DeckPlank', ((i-3)*.28, 0, 2.19), (.265, 1.99, .08), lightwood, tower, .012)
for x in (-.95, .95):
    for y in (-.9, .9):
        box('ParapetPost', (x, y, 2.47), (.14, .14, .6), wood, tower, .02)
    box('SideRail', (x, 0, 2.65), (.13, 1.95, .13), lightwood, tower)
box('RearRail', (0, .9, 2.65), (1.9, .13, .13), lightwood, tower)
box('TealFrontPlaque', (0, -1.075, 2.06), (.62, .045, .23), teal, tower, .018)
for x in (-.24, .24):
    beam('PlaqueRivet', (x, -1.11, 2.06), (x, -1.08, 2.06), .036, steel, tower)
beam('TurretFoot', (0, 0, 2.24), (0, 0, 2.44), .30, metal, tower, 12)
turret = empty('TurretYaw', tower, (0, 0, 2.44))
box('TurretColumn', (0, .16, .31), (.22, .27, .62), wood, turret)
bow = empty('BowRoot', turret, (0, -.12, .68))
box('BowGrip', (0, -.13, 0), (.12, .19, .3), teal, bow, .025)
for sign in (-1, 1):
    points = [(0, -.13, sign*.1), (0, -.30, sign*.36),
              (0, -.23, sign*.69), (0, 0, sign*.94)]
    for i in range(3):
        beam('BowLimb', points[i], points[i+1], [.075, .063, .045][i], lightwood, bow)
    beam('BowTip', (0, -.027, sign*.91), (0, .015, sign*.96), .047, metal, bow)
empty('Muzzle', bow, (0, -.63, 0))

# One tiny rig deforms only the bowstring; targeting rotation belongs to TurretYaw.
armature = bpy.data.armatures.new('BowStringRig')
rig = bpy.data.objects.new('BowRig', armature)
scene.collection.objects.link(rig)
rig.parent = bow
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
anchor = armature.edit_bones.new('Anchor')
anchor.head, anchor.tail = (0, 0, -.2), (0, 0, 0)
pull = armature.edit_bones.new('StringPull')
pull.head, pull.tail, pull.parent = (0, 0, 0), (0, .2, 0), anchor
bpy.ops.object.mode_set(mode='OBJECT')
verts, faces, anchor_ids, pull_ids = [], [], [], []
for sign in (-1, 1):
    first = len(verts)
    for center, ids in [((0, 0, sign*.94), anchor_ids), ((0, 0, 0), pull_ids)]:
        for i in range(4):
            angle = math.tau*i/4
            ids.append(len(verts))
            verts.append((center[0]+.012*math.cos(angle), center[1]+.012*math.sin(angle), center[2]))
    for i in range(4):
        faces.append((first+i, first+(i+1)%4, first+4+(i+1)%4, first+4+i))
mesh = bpy.data.meshes.new('StringMesh')
mesh.from_pydata(verts, [], faces)
string = bpy.data.objects.new('BowString', mesh)
scene.collection.objects.link(string)
finish(string, 'BowString', cord, rig)
string.vertex_groups.new(name='Anchor').add(anchor_ids, 1, 'REPLACE')
string.vertex_groups.new(name='StringPull').add(pull_ids, 1, 'REPLACE')
string.modifiers.new('String deformation', 'ARMATURE').object = rig
pull_pose = rig.pose.bones['StringPull']
for frame, distance in [(0, 0), (11, .38), (13, .38), (15, 0), (17, .045), (21, 0), (30, 0)]:
    pull_pose.location = (0, distance, 0)
    pull_pose.keyframe_insert(data_path='location', frame=frame)
rig.animation_data.action.name = 'Shoot'

arrow = empty('ArrowRoot')
beam('ArrowShaft', (0, .63, 0), (0, -.58, 0), .028, lightwood, arrow)
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.11, radius2=0, depth=.23,
                               location=(0, -.695, 0), rotation=(math.pi/2, 0, 0))
finish(bpy.context.object, 'ArrowHead', steel, arrow)
for i in range(3):
    angle = i*math.tau/3
    feather_points = [(0, .59, 0), (0, .25, 0),
                      (.13*math.cos(angle), .36, .13*math.sin(angle)),
                      (.13*math.cos(angle), .58, .13*math.sin(angle))]
    data = bpy.data.meshes.new('FeatherMesh')
    data.from_pydata(feather_points, [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new('ArrowFeather', data)
    scene.collection.objects.link(obj)
    finish(obj, 'ArrowFeather', feather, arrow)
empty('ArrowTip', arrow, (0, -.81, 0))


def descendants(root):
    return [root, *root.children_recursive]


def export(root, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename), export_format='GLB', use_selection=True,
                              export_animations=True, export_animation_mode='ACTIONS', export_extras=True)
    blob = (OUT/filename).read_bytes()
    data = json.loads(blob[20:20+struct.unpack_from('<I', blob, 12)[0]])
    return {'bytes': len(blob), 'nodes': [node.get('name') for node in data['nodes']],
            'animations': [a['name'] for a in data.get('animations', [])],
            'animation_seconds': {a['name']: [min(data['accessors'][s['input']]['min'][0] for s in a['samplers']),
                                            max(data['accessors'][s['input']]['max'][0] for s in a['samplers'])]
                                  for a in data.get('animations', [])},
            'skins': len(data.get('skins', []))}


scene.frame_set(0)
report = {'blender': bpy.app.version_string, 'units': 'metres', 'runtime_up': '+Y',
          'runtime_forward': '+Z', 'blender_up': '+Z', 'blender_forward': '-Y', 'files': {}}
report['files']['arrow-tower.glb'] = export(tower, 'arrow-tower.glb')
parent, location = bow.parent, bow.location.copy()
bow.parent, bow.location = None, (0, 0, 0)
report['files']['bow.glb'] = export(bow, 'bow.glb')
bow.parent, bow.location = parent, location
report['files']['arrow.glb'] = export(arrow, 'arrow.glb')
assert 'Shoot' in report['files']['arrow-tower.glb']['animations']
assert report['files']['arrow-tower.glb']['animation_seconds']['Shoot'] == [0.0, 1.0]
assert {'TowerRoot', 'TurretYaw', 'BowRoot', 'Muzzle'} <= set(report['files']['arrow-tower.glb']['nodes'])
assert {'ArrowRoot', 'ArrowTip'} <= set(report['files']['arrow.glb']['nodes'])

# Presentation objects are added after exports and never enter the game assets.
ground = material('Display ground', (.095, .16, .14))
box('DisplayGround', (0, 0, -.12), (200, 200, .2), ground, None, 0)
scene.world = bpy.data.worlds.new('DisplayWorld')
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.22, .26, .32, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
bpy.ops.object.light_add(type='AREA', location=(2, -5, 8))
bpy.context.object.data.energy, bpy.context.object.data.size = 1100, 6
bpy.context.object.rotation_euler = (Vector((0, 0, 1.5))-bpy.context.object.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(6, -9, 6))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1.9))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type, camera.data.ortho_scale = 'ORTHO', 5.8
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device, scene.cycles.samples = 'CPU', 24
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 900, 900, 100
scene.render.image_settings.file_format = 'PNG'


def render(name, frame):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    # Preview arrow tail follows the drawn string; projectile motion is a future runtime concern.
    arrow.location = (0, -.12-.63+pull_pose.location.y, 3.12)
    arrow.hide_render = frame >= 15
    for obj in arrow.children_recursive:
        obj.hide_render = arrow.hide_render
    scene.render.filepath = str(EVIDENCE/name)
    bpy.ops.render.render(write_still=True)


render('tower-ready.png', 0)
render('tower-drawn.png', 13)
render('tower-released.png', 21)
camera.location = (5, -7, 10)
camera.rotation_euler = (Vector((0, 0, 1.6))-camera.location).to_track_quat('-Z', 'Y').to_euler()
render('tower-top.png', 0)
camera.location = (6, -9, 6)
camera.rotation_euler = (Vector((0, 0, 1.9))-camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'arrow-tower.blend'))

# Reimport every exported asset, rather than relying only on the exporter result.
for filename, info in report['files'].items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT/filename))
    bpy.context.view_layer.update()
    root_name = {'arrow-tower.glb': 'TowerRoot', 'bow.glb': 'BowRoot', 'arrow.glb': 'ArrowRoot'}[filename]
    imported_root = bpy.data.objects.get(root_name)
    assert imported_root is not None, f'Missing asset root: {root_name}'
    # Blender adds hidden bone-display helper meshes outside the asset hierarchy.
    objects = descendants(imported_root)
    points = [obj.matrix_world@Vector(p) for obj in objects if obj.type == 'MESH' for p in obj.bound_box]
    info['reimport_bounds_blender'] = {
        'min': [min(p[axis] for p in points) for axis in range(3)],
        'max': [max(p[axis] for p in points) for axis in range(3)]}
    info['reimport_actions'] = [a.name for a in bpy.data.actions]
    if filename != 'arrow.glb':
        assert bpy.data.actions.get('Shoot'), 'Shoot animation lost'
    if filename == 'arrow-tower.glb':
        assert abs(info['reimport_bounds_blender']['min'][2]) < .001
        assert bpy.data.objects.get('Muzzle') is not None
        muzzle_position = bpy.data.objects['Muzzle'].matrix_world.translation
        assert (muzzle_position-Vector((0, -.75, 3.12))).length < .001
        info['muzzle_world_blender'] = list(muzzle_position)
(EVIDENCE/'report.json').write_text(json.dumps(report, indent=2))
print('ARROW_TOWER_PROBE_COMPLETE')
