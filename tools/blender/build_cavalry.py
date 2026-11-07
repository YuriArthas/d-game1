"""Original blue/silver cavalry. Blender 5, metres, Z up, -Y forward.

Build: blender -b --factory-startup -t 4 --python-exit-code 1 --python tools/blender/build_cavalry.py
One palette texture (256 square), one material, one rig, approximately 2000 triangles.
Constraints and leg IK are baked offline; there is no runtime pose repair.
"""
import bpy
import bmesh
import json
import math
import struct
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/cavalry'
SOURCE = ROOT / 'assets-source/cavalry'
ART = ROOT / 'artifacts/cavalry'
for directory in (OUT, SOURCE, ART):
    directory.mkdir(parents=True, exist_ok=True)
FPS = 30


def start():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    bpy.context.preferences.filepaths.save_version = 0
    scene.world = bpy.data.worlds.new('Cavalry Studio')
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.18, .21, .26, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    colors = {
        'Horse': (.085, .095, .12), 'HorseLight': (.14, .16, .20),
        'Steel': (.57, .61, .68), 'SteelDark': (.25, .28, .33),
        'Blue': (.09, .22, .48), 'BlueLight': (.18, .36, .69),
        'Leather': (.26, .16, .105), 'Gold': (.71, .54, .25),
        'Black': (.018, .022, .028),
    }
    materials = {}
    for name, color in colors.items():
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
        materials[name] = mat
    return materials


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent, obj.location = parent, loc
    obj.empty_display_size = .12
    return obj


class Sculpt:
    def __init__(self):
        self.parts = []

    def finish(self, obj, name, mat, bone, bevel=0):
        obj.name = name
        obj.data.materials.append(mat)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel:
            modifier = obj.modifiers.new('Cut edges', 'BEVEL')
            modifier.width, modifier.segments = bevel, 1
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        self.parts.append(obj)
        return obj

    def mesh(self, name, vertices, faces, mat, bone):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        return self.finish(obj, name, mat, bone)

    def box(self, name, loc, size, mat, bone, bevel=.025, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rotation)
        obj = bpy.context.object
        obj.scale = size
        return self.finish(obj, name, mat, bone, bevel)

    def ico(self, name, loc, size, mat, bone, subdivisions=1):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
        obj = bpy.context.object
        obj.scale = size
        return self.finish(obj, name, mat, bone)

    def segment(self, name, a, b, radius, mat, bone, end=None, vertices=8):
        a, b = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
            radius2=radius if end is None else end, depth=(b-a).length,
            location=(a+b)/2, end_fill_type='NGON')
        obj = bpy.context.object
        obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        return self.finish(obj, name, mat, bone)

    def rings(self, name, sections, mat, bone, count=12, axis='y'):
        """Profiled mesh with shared ring vertices; no intersecting torso primitives."""
        vertices = []
        for center, r1, r2 in sections:
            x, y, z = center
            for i in range(count):
                a = math.tau*i/count
                if axis == 'y':
                    vertices.append((x+r1*math.cos(a), y, z+r2*math.sin(a)))
                else:
                    vertices.append((x+r1*math.cos(a), y+r2*math.sin(a), z))
        faces = [tuple(reversed(range(count)))]
        for ring in range(len(sections)-1):
            for i in range(count):
                faces.append((ring*count+i, ring*count+(i+1)%count,
                    (ring+1)*count+(i+1)%count, (ring+1)*count+i))
        faces.append(tuple((len(sections)-1)*count+i for i in range(count)))
        return self.mesh(name, vertices, faces, mat, bone)

    def panel(self, name, polygon, mat, bone, depth=.025):
        # Extrude along the panel normal, including the X-facing horse cloth.
        n = len(polygon)
        normal = (Vector(polygon[1])-Vector(polygon[0])).cross(Vector(polygon[2])-Vector(polygon[0])).normalized()
        vertices = list(polygon) + [tuple(Vector(p)+normal*depth) for p in polygon]
        faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
        faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
        return self.mesh(name, vertices, faces, mat, bone)

    def join(self, name, rig):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        mesh = bpy.context.object
        mesh.name = name
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bm = bmesh.new()
        bm.from_mesh(mesh.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh.data)
        bm.free()
        mesh.parent = rig
        mesh.modifiers.new('Rigid low-poly skin', 'ARMATURE').object = rig
        return mesh


def palette(mesh):
    colors = [mat.diffuse_color[:] for mat in mesh.data.materials]
    size, cells = 256, 4
    pixels = []
    for y in range(size):
        for x in range(size):
            index = min(len(colors)-1, (y//64)*cells+x//64)
            pixels.extend(colors[index])
    image = bpy.data.images.new('CavalryPalette256', width=size, height=size, alpha=False)
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(OUT/'cavalry-palette-256.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    # Primitive meshes carry their own UVMap. Export only the palette UVs.
    while mesh.data.uv_layers:
        mesh.data.uv_layers.remove(mesh.data.uv_layers[0])
    uv = mesh.data.uv_layers.new(name='PaletteUV')
    uv.active_render = True
    for face in mesh.data.polygons:
        index = face.material_index
        center = ((index%cells+.5)/cells, (index//cells+.5)/cells)
        for loop in face.loop_indices:
            uv.data[loop].uv = center
        face.material_index = 0
    mat = bpy.data.materials.new('Cavalry Palette')
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value = .72
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image, tex.interpolation = image, 'Closest'
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)


def armature(parent, bones):
    data = bpy.data.armatures.new('CavalryRig')
    rig = bpy.data.objects.new('CavalryRig', data)
    bpy.context.scene.collection.objects.link(rig)
    rig.parent = parent
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, owner in bones:
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, Vector(head)+Vector((0, 0, .20))
        if owner:
            bone.parent = data.edit_bones[owner]
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'
    return rig


def pose(rig, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    bone = rig.pose.bones[name]
    bone.location = (loc[0], loc[2], -loc[1])
    bone.rotation_euler = (rot[0], rot[2], -rot[1])


def world_pose(rig, name, position, rotation):
    """Bake a desired armature-space pose, including the current parent transform."""
    bpy.context.view_layer.update()
    bone = rig.pose.bones[name]
    rest_rotation = bone.bone.matrix_local.to_3x3().to_4x4()
    desired = Matrix.Translation(Vector(position)) @ Euler(rotation, 'XYZ').to_matrix().to_4x4() @ rest_rotation
    bone.matrix = desired
    bpy.context.view_layer.update()


def smooth(value):
    value = max(0, min(1, value))
    return value*value*(3-2*value)


def keyed(t, keys):
    for (a, values), (b, next_values) in zip(keys, keys[1:]):
        if a <= t <= b:
            q = smooth((t-a)/(b-a))
            return [x+(y-x)*q for x, y in zip(values, next_values)]
    return keys[-1][1]


def animate(rig, name, length, callback, keyed_bones=None):
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(length+1):
        for bone in rig.pose.bones:
            bone.matrix_basis.identity()
        callback(frame/length)
        for bone in rig.pose.bones:
            if keyed_bones is not None and bone.name not in keyed_bones:
                continue
            for prop in ('location', 'rotation_euler', 'scale'):
                bone.keyframe_insert(data_path=prop, frame=frame, group=bone.name)
    # Dense baked samples still need eased tangents. Linear interpolation makes
    # the hoof and lance travel look like a sequence of rigid key poses even at
    # 30 fps; clamped Bezier handles preserve the authored contacts without
    # introducing overshoot at the loop seam.
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag = strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = 'BEZIER'
                            point.handle_left_type = 'AUTO_CLAMPED'
                            point.handle_right_type = 'AUTO_CLAMPED'
    return action


def create_cavalry(m):
    root = empty('CavalryRoot')
    s = Sculpt()
    leg_points = {}
    for label, x, y in [('FL', -.39, -.58), ('FR', .39, -.58), ('BL', -.39, .62), ('BR', .39, .62)]:
        front = label.startswith('F')
        hip = Vector((x, y, 1.28))
        knee = Vector((x, y+(-.13 if front else .15), .68))
        ankle = Vector((x, y+(.025 if front else -.025), .16))
        leg_points[label] = (hip, knee, ankle)
    bones = [('HorseBody', (0, 0, 1.43), None),
        ('HorseNeck', (0, -.65, 1.75), 'HorseBody'),
        ('HorseHead', (0, -1.11, 2.12), 'HorseNeck'),
        ('HorseTail', (0, .91, 1.55), 'HorseBody')]
    for label, (hip, knee, ankle) in leg_points.items():
        bones.extend([(f'HorseLeg{label}', hip, 'HorseBody'),
            (f'HorseShin{label}', knee, f'HorseLeg{label}'),
            (f'HorseHoof{label}', ankle, f'HorseShin{label}')])
    bones += [('RiderPelvis', (0, .03, 2.09), 'HorseBody'),
        ('RiderSpine', (0, .02, 2.31), 'RiderPelvis'),
        ('RiderHead', (0, -.025, 2.88), 'RiderSpine'),
        ('RiderArmL', (-.31, 0, 2.69), 'RiderSpine'),
        ('RiderForeL', (-.46, -.14, 2.45), 'RiderArmL'),
        ('RiderArmR', (.31, 0, 2.69), 'RiderSpine'),
        ('RiderForeR', (.46, -.14, 2.45), 'RiderArmR')]
    for sign, label in [(-1, 'L'), (1, 'R')]:
        bones += [(f'RiderLeg{label}', (sign*.23, .02, 2.07), 'RiderPelvis'),
            (f'RiderShin{label}', (sign*.52, -.26, 1.75), f'RiderLeg{label}')]
    rig = armature(root, bones)

    # Contoured continuous horse torso, neck, head, low-poly mane and tail.
    s.rings('Horse torso', [((0, y, z), rx, rz) for y, z, rx, rz in [
        (-.92, 1.47, .18, .22), (-.70, 1.50, .41, .44), (-.36, 1.44, .50, .48),
        (.12, 1.40, .49, .44), (.60, 1.46, .44, .44), (.91, 1.49, .22, .28)]], m['Horse'], 'HorseBody', 12)
    s.rings('Horse neck', [((0, y, z), rx, rz) for y, z, rx, rz in [
        (-.52, 1.70, .31, .32), (-.70, 1.90, .28, .38), (-.86, 2.11, .23, .31),
        (-1.00, 2.20, .18, .21)]], m['HorseLight'], 'HorseNeck', 12)
    s.rings('Horse head', [((0, y, z), rx, rz) for y, z, rx, rz in [
        (-.99, 2.18, .14, .19), (-1.11, 2.24, .22, .28), (-1.29, 2.19, .22, .24),
        (-1.48, 2.05, .16, .16), (-1.65, 1.99, .17, .14)]], m['Horse'], 'HorseHead', 12)
    for sign in (-1, 1):
        x = sign*.13
        s.panel('Horse ear', [(x-.06, -1.11, 2.44), (x-.035, -1.05, 2.69),
            (x+.04, -1.07, 2.64), (x+.06, -1.15, 2.43)], m['Horse'], 'HorseHead', .08)
        s.ico('Horse eye', (sign*.217, -1.30, 2.26), (.023, .055, .038), m['Black'], 'HorseHead')
    s.panel('Mane', [(-.04, -.86, 2.47), (-.04, -.58, 2.23), (-.04, -.35, 1.88),
        (-.04, -.56, 1.93), (-.04, -.88, 2.31)], m['Black'], 'HorseNeck', .14)
    s.rings('Tail', [((0, y, z), rx, rz) for y, z, rx, rz in [
        (.92, 1.57, .08, .09), (1.11, 1.42, .12, .16), (1.29, 1.12, .13, .21),
        (1.33, .68, .08, .13), (1.29, .48, .015, .015)]], m['Black'], 'HorseTail', 8)
    for label, (hip, knee, ankle) in leg_points.items():
        s.segment('Upper leg', hip, knee, .15, m['Horse'], f'HorseLeg{label}', end=.075)
        s.ico('Knee', knee, (.095, .09, .09), m['HorseLight'], f'HorseLeg{label}')
        s.segment('Lower leg', knee, ankle, .075, m['HorseLight'], f'HorseShin{label}', end=.055)
        s.box('Hoof', (ankle.x, ankle.y-.025, .09), (.18, .27, .18), m['Black'], f'HorseHoof{label}', .02)

    # Barding panels: broad blue shapes and silver hems, no micro ornament.
    for sign in (-1, 1):
        x = sign*.52
        polygon = [(x, -.53, 1.74), (x, .70, 1.74), (x, .82, 1.08),
            (x, .25, 1.03), (x, -.10, 1.10), (x, -.54, 1.05)]
        s.panel('Blue side barding', polygon, m['Blue'], 'HorseBody', sign*.045)
        s.segment('Barding silver hem', (x, -.52, 1.05), (x, .80, 1.08), .035, m['Steel'], 'HorseBody', vertices=4)
        s.panel('Barding diamond', [(x+sign*.032, .39, 1.41), (x+sign*.032, .28, 1.26),
            (x+sign*.032, .16, 1.41), (x+sign*.032, .28, 1.58)], m['Steel'], 'HorseBody', .012)
    s.panel('Front barding', [(-.37, -.88, 1.70), (.37, -.88, 1.70), (.31, -.92, 1.10),
        (0, -.94, .91), (-.31, -.92, 1.10)], m['Blue'], 'HorseBody', .04)
    s.panel('Front diamond', [(0, -.973, 1.53), (.10, -.975, 1.37), (0, -.977, 1.20),
        (-.10, -.975, 1.37)], m['Steel'], 'HorseBody', .02)
    s.box('Saddle', (0, .04, 1.91), (.74, .56, .14), m['Leather'], 'HorseBody', .035)
    s.box('Saddle rear', (0, .31, 2.02), (.61, .12, .21), m['Leather'], 'HorseBody', 0)
    s.box('Saddle front', (0, -.21, 2.00), (.54, .10, .15), m['Leather'], 'HorseBody', 0)
    s.panel('Blue face armor', [(-.13, -1.345, 2.39), (.13, -1.345, 2.39),
        (.115, -1.57, 2.13), (0, -1.60, 2.04), (-.115, -1.57, 2.13)], m['Blue'], 'HorseHead', .025)
    # Bridle and reins are simple strips; no hair strands or simulated cables.
    for sign in (-1, 1):
        s.segment('Bridle cheek', (sign*.23, -1.20, 2.37), (sign*.20, -1.59, 1.98), .020, m['Leather'], 'HorseHead', vertices=4)
        s.segment('Bridle nose', (sign*.20, -1.59, 1.98), (0, -1.72, 2.05), .020, m['Leather'], 'HorseHead', vertices=4)
    # Reins stop at the saddle. They belong to the horse, independent of attacking hands.
    s.segment('Rein L', (-.19, -1.57, 1.98), (-.29, -.30, 2.07), .018, m['Leather'], 'HorseNeck', vertices=4)
    s.segment('Rein R', (.19, -1.57, 1.98), (.29, -.30, 2.07), .018, m['Leather'], 'HorseNeck', vertices=4)

    # Rider silhouette, actual bent legs, gauntlets, angular helmet, kite shield and long lance.
    s.box('Pelvis', (0, .03, 2.09), (.46, .30, .25), m['SteelDark'], 'RiderPelvis', 0)
    s.rings('Breastplate', [((0, -.015, z), rx, ry) for z, rx, ry in [
        (2.19, .21, .15), (2.37, .24, .17), (2.58, .29, .18), (2.72, .23, .15)]], m['Steel'], 'RiderSpine', 8, 'z')
    s.panel('Surcoat', [(-.19, -.198, 2.64), (.19, -.198, 2.64), (.18, -.206, 2.26),
        (0, -.215, 2.18), (-.18, -.206, 2.26)], m['Blue'], 'RiderSpine', .022)
    s.panel('Chest diamond', [(0, -.239, 2.57), (.07, -.239, 2.47),
        (0, -.241, 2.37), (-.07, -.239, 2.47)], m['Steel'], 'RiderSpine', .01)
    s.segment('Belt', (-.24, -.01, 2.22), (.24, -.01, 2.22), .045, m['Leather'], 'RiderPelvis', vertices=4)
    s.box('Belt buckle', (0, -.19, 2.22), (.10, .035, .09), m['Gold'], 'RiderPelvis', 0)
    s.rings('Helmet', [((0, -.025, z), rx, ry) for z, rx, ry in [
        (2.80, .21, .19), (2.93, .245, .23), (3.10, .225, .21), (3.24, .10, .09)]], m['Steel'], 'RiderHead', 10, 'z')
    s.box('Visor shadow', (0, -.260, 2.97), (.35, .022, .058), m['Black'], 'RiderHead', 0)
    s.box('Visor bar', (0, -.282, 2.91), (.043, .023, .15), m['Steel'], 'RiderHead', 0)
    s.panel('Blue plume', [(-.03, -.02, 3.22), (-.03, .01, 3.43), (-.03, .20, 3.45),
        (-.03, .33, 3.29), (-.03, .48, 3.11), (-.03, .25, 3.18)], m['BlueLight'], 'RiderHead', .09)
    s.box('Blue collar', (0, -.035, 2.76), (.43, .35, .09), m['Blue'], 'RiderSpine', 0)
    for sign, label in [(-1, 'L'), (1, 'R')]:
        arm, fore = f'RiderArm{label}', f'RiderFore{label}'
        s.ico('Shoulder plate', (sign*.32, -.01, 2.71), (.19, .22, .17), m['Blue'], arm)
        s.segment('Shoulder silver rim', (sign*.41, -.14, 2.70), (sign*.46, .10, 2.66), .028, m['Steel'], arm, vertices=4)
        s.segment('Upper arm', (sign*.32, 0, 2.67), (sign*.46, -.14, 2.45), .105, m['SteelDark'], arm, end=.075)
        s.ico('Elbow plate', (sign*.46, -.14, 2.45), (.085, .105, .085), m['Steel'], arm)
        s.segment('Forearm', (sign*.46, -.14, 2.45), (sign*.52, -.38, 2.40), .08, m['Steel'], fore, end=.065)
        s.box('Gauntlet', (sign*.53, -.40, 2.39), (.12, .15, .13), m['SteelDark'], fore, 0)
        leg, shin = f'RiderLeg{label}', f'RiderShin{label}'
        s.segment('Thigh', (sign*.23, .02, 2.07), (sign*.52, -.26, 1.75), .115, m['SteelDark'], leg, end=.09)
        s.ico('Knee armor', (sign*.52, -.29, 1.75), (.11, .12, .11), m['Steel'], leg)
        s.segment('Greave', (sign*.52, -.26, 1.75), (sign*.56, -.12, 1.40), .09, m['Steel'], shin, end=.065)
        s.box('Boot', (sign*.56, -.18, 1.35), (.17, .34, .15), m['SteelDark'], shin, 0)
        s.segment('Stirrup side', (sign*.61, -.11, 1.32), (sign*.61, -.09, 1.49), .019, m['Leather'], shin, vertices=4)
        s.segment('Stirrup base', (sign*.47, -.11, 1.30), (sign*.65, -.11, 1.30), .025, m['Gold'], shin, vertices=4)
    shield = [(-.88, -.45, 2.76), (-.38, -.45, 2.76), (-.35, -.46, 2.39),
        (-.63, -.49, 2.05), (-.91, -.46, 2.39)]
    s.panel('Shield silver rim', shield, m['Steel'], 'RiderForeL', .055)
    s.panel('Shield blue face', [(-.84, -.507, 2.71), (-.42, -.507, 2.71), (-.40, -.518, 2.40),
        (-.63, -.543, 2.13), (-.86, -.518, 2.40)], m['Blue'], 'RiderForeL', .02)
    s.panel('Shield diamond', [(-.63, -.559, 2.61), (-.54, -.559, 2.46), (-.63, -.567, 2.30),
        (-.72, -.559, 2.46)], m['Steel'], 'RiderForeL', .015)
    hand = Vector((.53, -.40, 2.39))
    # Long cavalry lance: most of the shaft projects in front of the horse. It is
    # one rigid prop on the forearm so the thrust and charge share the same grip.
    # Keep the lance long enough to read as a cavalry weapon at the web preview
    # scale.  A very small lateral offset keeps the point visible in the three
    # quarter camera while the main axis still follows the horse's forward
    # direction (-Y).
    shaft_end = hand + Vector((-.14, -2.62, .20))
    s.segment('Lance shaft', hand, shaft_end, .032, m['Leather'], 'RiderForeR', end=.026, vertices=6)
    s.segment('Lance grip wrap', hand+Vector((0, -.16, .025)), hand+Vector((0, .10, -.015)), .060, m['Gold'], 'RiderForeR', end=.050, vertices=6)
    spear_base = shaft_end
    spear_tip = shaft_end + Vector((-.025, -.38, .035))
    s.segment('Lance spearhead', spear_base, spear_tip, .11, m['Steel'], 'RiderForeR', end=0, vertices=4)
    s.segment('Lance pennant', hand+Vector((-.02, -.48, .045)), hand+Vector((-.10, -.91, .045)), .012, m['BlueLight'], 'RiderForeR', end=.004, vertices=4)
    mesh = s.join('CavalryMesh', rig)
    palette(mesh)

    def leg_ik(label, target, body_z=0):
        hip, knee, ankle = leg_points[label]
        target = Vector(target)-Vector((0, 0, body_z))
        delta = target-hip
        distance = delta.length
        a, b = (knee-hip).length, (ankle-knee).length
        assert distance < a+b+1e-6, (label, distance, a+b)
        distance = min(a+b-.00001, max(abs(a-b)+.00001, distance))
        direction = delta.normalized()
        projected = (a*a-b*b+distance*distance)/(2*distance)
        perpendicular = Vector((0, direction.z, -direction.y))
        if label.startswith('B'):
            perpendicular = -perpendicular
        solved_knee = hip+direction*projected+perpendicular*math.sqrt(max(0, a*a-projected*projected))
        def angle(v):
            return math.atan2(v.z, v.y)
        upper = angle(solved_knee-hip)-angle(knee-hip)
        lower = angle(target-solved_knee)-angle(ankle-knee)-upper
        pose(rig, f'HorseLeg{label}', rot=(upper, 0, 0))
        pose(rig, f'HorseShin{label}', rot=(lower, 0, 0))
        pose(rig, f'HorseHoof{label}', rot=(-upper-lower, 0, 0))

    def gait(t, fast=False):
        # Four-beat canter: each hoof gets a quiet weight-bearing section and a
        # shorter, higher swing.  The old cycle drove all feet through nearly
        # identical linear arcs, which made the horse read like four pistons.
        # These offsets leave a small overlap between hind and fore support,
        # while the eased swing gives a visible lift and soft landing.
        # Keep the pelvis low enough that the extended rear hoof can still reach
        # the floor; the bob is relative to this grounded stance.
        body_z = -.12 + (.030 if fast else .022) * math.cos(math.tau*(t+.08))
        body_pitch = (.045 if fast else .026) * math.sin(math.tau*(t+.08))
        pose(rig, 'HorseBody', loc=(0, 0, body_z), rot=(body_pitch, 0, 0))
        duty, stride, lift = (.56, .43, .42) if fast else (.64, .30, .30)
        phases = {'BL': 0.00, 'BR': .17, 'FL': .47, 'FR': .64}
        for label, offset in phases.items():
            hip, knee, ankle = leg_points[label]
            phase = (t+offset)%1
            if phase < duty:
                y = -stride+2*stride*phase/duty
                # Keep the hoof close to the floor during support; the tiny arc
                # avoids an unnaturally frozen knee at the midpoint.
                z = .012 * math.sin(math.pi*phase/duty)
            else:
                q = (phase-duty)/(1-duty)
                swing = smooth(q)
                y = stride-2*stride*swing
                # Raise the hoof early, tuck it under the body, and settle it
                # before contact instead of keeping a symmetric semicircle.
                z = lift * (math.sin(math.pi*q) ** .72)
            # A small authored clearance keeps the rigid low-poly hoof above the
            # exported floor after the body pitch is applied.
            ground_clearance = .035 if fast else .018
            leg_ik(label, (ankle.x, ankle.y+y, ankle.z+z+ground_clearance), body_z)
        wave = math.sin(math.tau*t)
        pose(rig, 'HorseNeck', rot=((-.10 if fast else -.025)+.035*wave, 0, .012*wave))
        pose(rig, 'HorseHead', rot=(.035*wave, 0, .018*wave))
        pose(rig, 'HorseTail', rot=(.035*wave, .08 if fast else .025, .09*wave))
        pose(rig, 'RiderPelvis', loc=(0, 0, .010*(1-math.cos(math.tau*t))), rot=(.035 if fast else .016, 0, 0))
        pose(rig, 'RiderSpine', rot=(.22 if fast else .075, 0, .018*wave))
        pose(rig, 'RiderHead', rot=(-.16 if fast else -.055, 0, 0))
        if fast:
            pose(rig, 'RiderArmL', rot=(.34, 0, -.12))
            pose(rig, 'RiderForeL', rot=(-.34, 0, 0))
        pose(rig, 'RiderArmR', rot=(.28, -.06, .08))
        pose(rig, 'RiderForeR', rot=(-.44, 0, 0))

    def idle(t):
        wave = math.sin(t*math.tau)
        pose(rig, 'HorseBody', loc=(0, 0, .007*wave))
        pose(rig, 'HorseNeck', rot=(.018*wave, 0, .012*wave))
        pose(rig, 'HorseHead', rot=(-.025*wave, 0, .018*wave))
        pose(rig, 'HorseTail', rot=(0, 0, .05*wave))
        pose(rig, 'RiderSpine', rot=(.012*wave, 0, -.01*wave))
        pose(rig, 'RiderHead', rot=(-.01*wave, 0, .02*wave))

    def attack(t):
        # A lance thrust should travel along the horse's forward axis. Counter-
        # rotate the upper arm and forearm so the hand moves forward/back while
        # the shaft stays level; the previous one-axis pitch read as an upward
        # lift followed by a downward strike.
        arm, fore, twist, lean, reach = keyed(t, [
            # Start close to the rider, jab forward, hold the point briefly,
            # then pull the complete arm back to the neutral carry pose.
            (0, (.58, -.58, -.16, -.01, .28)), (.12, (.62, -.62, -.18, -.01, .30)),
            (.34, (-.76, .76, .18, .025, -.32)), (.50, (-.72, .72, .16, .02, -.32)),
            (.70, (0, 0, 0, 0, 0)), (1, (0, 0, 0, 0, 0))])
        pose(rig, 'RiderSpine', rot=(lean, 0, twist))
        pose(rig, 'RiderHead', rot=(-lean*.4, 0, -twist*.45))
        # Translate the complete weapon arm along the forward axis.  Its parent
        # translation keeps the grip/forearm connected while the counter-rotated
        # joints keep the lance level during the jab and the recovery.
        pose(rig, 'RiderArmR', loc=(0, reach, 0), rot=(arm, .08, -.12*math.sin(math.pi*t)))
        pose(rig, 'RiderForeR', rot=(fore, 0, 0))
        pose(rig, 'RiderArmL', rot=(.12*math.sin(math.pi*t), 0, -.08))
        pose(rig, 'RiderForeL', rot=(-.10*math.sin(math.pi*t), 0, 0))

    def dead(t):
        stumble = smooth((t-.03)/.42)
        stop = smooth((t-.35)/.4)
        pose(rig, 'HorseBody', loc=(0, .07*stumble, -.27*stumble), rot=(.10*stumble-.05*stop, 0, .04*stumble))
        pose(rig, 'HorseNeck', rot=(.40*stumble, 0, -.08*stumble))
        pose(rig, 'HorseHead', rot=(.18*stumble, 0, -.06*stumble))
        for label in leg_points:
            pose(rig, f'HorseLeg{label}', rot=((.44 if label.startswith('F') else -.17)*stumble, 0, 0))
            pose(rig, f'HorseShin{label}', rot=(-.92*stumble if label.startswith('F') else .16*stumble, 0, 0))
            pose(rig, f'HorseHoof{label}', rot=(.25*stumble, 0, 0))
        fall = smooth((t-.15)/.68)
        # Detach with baked pelvis transforms while preserving a single rig.
        position = (1.13*fall, .03+.23*fall, 2.09-1.77*fall)
        rotation = (.10*fall, math.pi/2*fall, -.12*fall)
        world_pose(rig, 'RiderPelvis', position, rotation)
        pose(rig, 'RiderSpine', rot=(.12*math.sin(math.pi*fall), 0, -.10*fall))
        pose(rig, 'RiderHead', rot=(.08*fall, 0, -.08*fall))
        pose(rig, 'RiderArmL', rot=(-.10*fall, -.18*fall, -.16*fall))
        pose(rig, 'RiderForeL', rot=(-.38*fall, 0, 0))
        pose(rig, 'RiderArmR', rot=(.10*fall, .15*fall, -.70*fall))
        pose(rig, 'RiderForeR', rot=(-.25*fall, 0, -.40*fall))
        pose(rig, 'RiderLegL', rot=(.20*fall, 0, .10*fall))
        pose(rig, 'RiderLegR', rot=(-.15*fall, 0, -.60*fall))
        pose(rig, 'RiderShinL', rot=(-.22*fall, 0, 0))
        pose(rig, 'RiderShinR', rot=(-.12*fall, 0, -.20*fall))
        # Preserve floor contact, baked only into this asset's death clip. Rider
        # and horse are measured independently because the rider has fallen off.
        bpy.context.view_layer.update()
        evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        geom = evaluated.to_mesh()
        rider_indices = set()
        horse_indices = set()
        group_names = {group.index: group.name for group in mesh.vertex_groups}
        for vertex in mesh.data.vertices:
            owner = group_names[vertex.groups[0].group]
            (rider_indices if owner.startswith('Rider') else horse_indices).add(vertex.index)
        low_horse = min(geom.vertices[i].co.z for i in horse_indices)
        low_rider = min(geom.vertices[i].co.z for i in rider_indices)
        evaluated.to_mesh_clear()
        # The exact initial pose is preserved; solve only negative contact or the settled fall.
        horse_lift = max(0, -low_horse)
        rig.pose.bones['HorseBody'].location.y += horse_lift
        corrected = Vector(position)+Vector((0, 0, max(0, .01-low_rider)))
        world_pose(rig, 'RiderPelvis', corrected, rotation)

    upper = {'RiderSpine', 'RiderHead', 'RiderArmL', 'RiderForeL', 'RiderArmR', 'RiderForeR'}
    clips = {'Idle': animate(rig, 'Idle', 66, idle),
        'Run': animate(rig, 'Run', 27, lambda t: gait(t)),
        'Attack': animate(rig, 'Attack', 30, attack, upper),
        'Charge': animate(rig, 'Charge', 21, lambda t: gait(t, True)),
        'Dead': animate(rig, 'Dead', 54, dead)}
    root['asset_role'] = 'ordinary cavalry, web animation review'
    root['triangle_budget'] = 2000
    root['attack_hit_seconds'] = .58
    root['upper_body_root'] = 'RiderSpine'
    return root, rig, mesh, clips


def set_action(rig, action, frame=0):
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def stage():
    scene = bpy.context.scene
    scene.view_settings.view_transform = 'AgX'
    scene.render.engine = 'CYCLES'
    scene.cycles.device, scene.cycles.samples = 'CPU', 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 960, 720
    target = Vector((0, 0, 1.55))
    for loc, power, size in [((4, -5, 7), 900, 5), ((-4, -2, 4), 600, 4), ((2, 4, 5), 900, 4)]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        obj = bpy.context.object
        obj.data.energy, obj.data.size = power, size
        obj.rotation_euler = (target-obj.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(5, -8, 4.3))
    camera = bpy.context.object
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 5.0
    scene.camera = camera


def build():
    mats = start()
    root, rig, mesh, clips = create_cavalry(mats)
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for action in clips.values():
        for frame in range(int(action.frame_range[1])+1):
            set_action(rig, action, frame)
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            geom = evaluated.to_mesh()
            for vertex in geom.vertices:
                for i in range(3):
                    minimum[i] = min(minimum[i], vertex.co[i])
                    maximum[i] = max(maximum[i], vertex.co[i])
            evaluated.to_mesh_clear()
    # glTF is Y-up and +Z-forward. Keep the entire death/attack envelope visible.
    root['motion_bounds'] = [minimum.x, minimum.z, -maximum.y, maximum.x, maximum.z, -minimum.y]
    set_action(rig, clips['Idle'])
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 66
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = OUT/'cavalry.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_extras=True,
        export_force_sampling=True, export_anim_slide_to_zero=True)
    blob = path.read_bytes()
    gltf = json.loads(blob[20:20+struct.unpack_from('<I', blob, 12)[0]])
    names = {clip['name'] for clip in gltf.get('animations', [])}
    assert names == set(clips), (names, set(clips))
    assert len(gltf.get('skins', [])) == 1
    assert len(gltf.get('images', [])) == 1
    assert len(gltf.get('materials', [])) == 1
    triangles = sum(gltf['accessors'][p['indices']]['count']//3 for data in gltf['meshes'] for p in data['primitives'])
    assert triangles <= 2200, triangles
    info = {'bytes': len(blob), 'triangles': triangles, 'bones': len(rig.data.bones),
        'skins': len(gltf['skins']), 'materials': len(gltf['materials']), 'textures': ['256x256 palette'],
        'animations': {a['name']: max(gltf['accessors'][sm['input']]['max'][0] for sm in a['samplers']) for a in gltf['animations']},
        'root': root.name, 'forward': '+Z (glTF)', 'up': '+Y (glTF)', 'units': 'metres'}
    stage()
    set_action(rig, clips['Idle'])
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'cavalry.blend'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    assert {action.name for action in bpy.data.actions} == names
    assert len([o for o in bpy.context.scene.objects if o.type == 'ARMATURE']) == 1
    info['reimport_actions'] = sorted(names)
    (ART/'asset.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    print('CAVALRY_ASSET_COMPLETE', json.dumps(info), flush=True)


build()
