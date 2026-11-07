"""Original low-poly creature/tower samples. Blender 5; metres, Z up, -Y forward.

Run: blender -b --factory-startup -t 4 --python-exit-code 1 --python tools/blender/build_frontier.py
Each creature has a single rigid-weighted mesh and an editable armature.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/frontier'
SOURCE = ROOT / 'assets-source/frontier'
ART = ROOT / 'artifacts/frontier'
for directory in (OUT, SOURCE, ART):
    directory.mkdir(parents=True, exist_ok=True)
ONLY = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FPS = 30


def material(name, color, metal=0, glow=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = mat.diffuse_color
    shader.inputs['Roughness'].default_value = .65 if not metal else .38
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Emission Color'].default_value = mat.diffuse_color
    shader.inputs['Emission Strength'].default_value = glow
    return mat


def start():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = FPS
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1
    s.render.film_transparent = False
    bpy.context.preferences.filepaths.save_version = 0
    s.view_settings.view_transform = 'AgX'
    s.world = bpy.data.worlds.new('Studio')
    s.world.node_tree.nodes['Background'].inputs[0].default_value = (.21, .28, .36, 1)
    s.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    return {name: material(name, *args) for name, args in {
        'Chitin': ((.14, .075, .23),), 'Chitin edge': ((.30, .16, .38),),
        'Bone': ((.76, .65, .43),), 'Bone tips': ((.96, .85, .61),),
        'Eyes': ((1, .27, .035), 0, 1.5), 'Ember crystal': ((.90, .22, .04), .1, .45), 'Eye sockets': ((.025, .015, .04),),
        'Goblin skin': ((.17, .39, .29),), 'Goblin light': ((.30, .57, .39),),
        'Leather': ((.23, .105, .06),), 'Cloth': ((.55, .12, .055),),
        'Rock': ((.19, .24, .30),), 'Rock face': ((.34, .40, .47),),
        'Cracks': ((.025, .09, .12),), 'Crystal': ((.08, .65, .82), .15, .45),
        'Crystal light': ((.48, .93, 1), .1, .8),
        'Stone': ((.31, .37, .36),), 'Stone trim': ((.52, .57, .49),),
        'Timber': ((.25, .115, .045),), 'Timber edge': ((.48, .265, .105),),
        'Iron': ((.065, .105, .13), .7), 'Brass': ((.64, .37, .105), .65),
        'Teal': ((.045, .34, .33),), 'Bore': ((.006, .012, .018),),
    }.items()}


def empty(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.parent, o.location = parent, loc
    o.empty_display_size = .16
    return o


class Sculpt:
    def __init__(self):
        self.parts = []

    def finish(self, obj, name, mat, bone, bevel=0):
        obj.name = name
        obj.data.materials.append(mat)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel:
            mod = obj.modifiers.new('Cut edges', 'BEVEL')
            mod.width, mod.segments = bevel, 1
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if bone:
            obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        self.parts.append(obj)
        return obj

    def box(self, name, loc, size, mat, bone='Body', bevel=.04, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rotation)
        o = bpy.context.object
        o.scale = size
        return self.finish(o, name, mat, bone, bevel)

    def ico(self, name, loc, size, mat, bone='Body', subdivisions=1):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
        o = bpy.context.object
        o.scale = size
        return self.finish(o, name, mat, bone)

    def segment(self, name, a, b, radius, mat, bone='Body', end=None, vertices=6, caps=True):
        a, b = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
            radius2=radius if end is None else end, depth=(b-a).length, location=(a+b)/2,
            end_fill_type='NGON' if caps else 'NOTHING')
        o = bpy.context.object
        o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        return self.finish(o, name, mat, bone)

    def crystal(self, name, loc, radius, height, mat, bone='Body', tilt=(0, 0, 0)):
        # Long hexagonal prism with an asymmetric pointed crown, rather than a cone.
        vertices = []
        for z, r in [(0, radius*.62), (height*.18, radius), (height*.73, radius*.8)]:
            vertices.extend((math.cos(i*math.tau/6)*r, math.sin(i*math.tau/6)*r, z) for i in range(6))
        vertices.append((radius*.17, 0, height))
        faces = [tuple(reversed(range(6)))]
        for ring in range(2):
            faces.extend((ring*6+i, ring*6+(i+1)%6, (ring+1)*6+(i+1)%6, (ring+1)*6+i) for i in range(6))
        faces.extend((12+i, 12+(i+1)%6, 18) for i in range(6))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        o = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(o)
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        o.location, o.rotation_euler = loc, tilt
        return self.finish(o, name, mat, bone)

    def join(self, name, parent, rig=None):
        bpy.ops.object.select_all(action='DESELECT')
        for o in self.parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        o = bpy.context.object
        o.name = name
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        o.parent = parent
        if rig:
            mod = o.modifiers.new('Rigid segment skin', 'ARMATURE')
            mod.object = rig
        return o


def armature(parent, bones):
    data = bpy.data.armatures.new('Rig')
    rig = bpy.data.objects.new('Rig', data)
    bpy.context.scene.collection.objects.link(rig)
    rig.parent = parent
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, owner in bones:
        b = data.edit_bones.new(name)
        b.head, b.tail = head, Vector(head) + Vector((0, 0, .25))
        if owner:
            b.parent = data.edit_bones[owner]
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
    return rig


def pose(rig, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    b = rig.pose.bones[name]
    # Bone local Y follows world Z; local Z follows world -Y.
    b.location = (loc[0], loc[2], -loc[1])
    b.rotation_euler = (rot[0], rot[2], -rot[1])
    b.scale = (scale[0], scale[2], scale[1])


def animate(rig, name, length, fn, floor_contact=False, keyed_bones=None):
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(length+1):
        for b in rig.pose.bones:
            b.location = (0, 0, 0)
            b.rotation_euler = (0, 0, 0)
            b.scale = (1, 1, 1)
        fn(frame/length)
        if floor_contact:
            # Offline floor-contact constraint baked into Body keys, never a runtime correction.
            bpy.context.view_layer.update()
            mesh_obj = next(o for o in rig.children if o.type == 'MESH')
            evaluated = mesh_obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            lowest = min((evaluated.matrix_world @ v.co).z for v in mesh.vertices)
            evaluated.to_mesh_clear()
            rig.pose.bones['Body'].location.y -= lowest
        for b in rig.pose.bones:
            if keyed_bones is not None and b.name not in keyed_bones:
                continue
            for prop in ('location', 'rotation_euler', 'scale'):
                b.keyframe_insert(data_path=prop, frame=frame, group=b.name)
    return action


def creature(kind, m):
    root = empty('EnemyRoot')
    s = Sculpt()
    if kind == 'bone-crawler':
        bones = [('Body', (0, 0, .55), None), ('Head', (0, -.55, .58), 'Body')]
        for sign in (-1, 1):
            for i, y in enumerate((-.52, 0, .52)):
                leg = f'Leg{sign}_{i}'
                hip, knee, foot = (sign*.43, y, .6), (sign*.95, y-.12, .43), (sign*1.10, y-.28, .035)
                bones.extend([(leg, hip, 'Body'), (leg+'Tip', knee, leg)])
                s.segment('Chitin thigh', hip, knee, .12, m['Chitin edge'], leg, end=.075)
                s.ico('Ivory joint', knee, (.12, .13, .12), m['Bone'], leg)
                s.segment('Hook leg', knee, foot, .075, m['Bone tips'], leg+'Tip', end=.02)
        s.ico('Abdomen', (0, .25, .65), (.62, .86, .42), m['Chitin'], subdivisions=2)
        for i in range(3):
            s.ico('Overlapping carapace', (0, .03+i*.28, 1.04), (.50-i*.075, .245, .14), m['Bone' if i%2 else 'Bone tips'])
            s.segment('Dorsal spine', (0, .13+i*.29, 1.12), (0, .25+i*.29, 1.40), .105, m['Bone'], end=0)
        s.ico('Skull mask', (0, -.66, .62), (.46, .39, .32), m['Bone'], 'Head', 2)
        for sign in (-1, 1):
            s.ico('Eye socket', (sign*.22, -.976, .72), (.15, .055, .105), m['Eye sockets'], 'Head')
            s.ico('Amber eye', (sign*.22, -1.024, .73), (.065, .028, .043), m['Eyes'], 'Head')
            s.segment('Mandible', (sign*.30, -.88, .50), (sign*.44, -1.14, .36), .1, m['Chitin edge'], 'Head', end=.07)
            s.segment('Fang', (sign*.44, -1.14, .36), (sign*.20, -1.26, .36), .075, m['Bone tips'], 'Head', end=0)
        height = 1.40
    elif kind == 'moss-runner':
        bones = [('Body', (0, .03, .95), None), ('Spine', (0, .015, 1.02), 'Body'),
                 ('Head', (0, -.07, 1.54), 'Spine')]
        s.ico('Tapered torso', (0, .015, 1.20), (.34, .23, .43), m['Goblin skin'], 'Spine', subdivisions=2)
        s.box('Leather belt', (0, 0, .91), (.58, .42, .13), m['Leather'], bevel=.06)
        s.box('Belt buckle', (0, -.235, .91), (.14, .06, .14), m['Brass'], bevel=.02)
        for sign in (-1, 1):
            leg, shin, arm, fore = f'Leg{sign}', f'Shin{sign}', f'Arm{sign}', f'Fore{sign}'
            hip, knee, ankle = (sign*.20, .025, .88), (sign*.25, -.06, .46), (sign*.26, .035, .14)
            shoulder, elbow, hand = (sign*.31, 0, 1.44), (sign*.46, .035, 1.1), (sign*.49, -.16, .83)
            bones.extend([(leg, hip, 'Body'), (shin, knee, leg), (arm, shoulder, 'Spine'), (fore, elbow, arm)])
            s.segment('Runner thigh', hip, knee, .13, m['Goblin skin'], leg, end=.105)
            s.ico('Knee joint', knee, (.105, .105, .105), m['Goblin skin'], leg)
            s.segment('Runner calf', knee, ankle, .10, m['Goblin light'], shin, end=.065)
            s.box('Foot wrap', (sign*.26, -.055, .10), (.22, .37, .20), m['Leather'], shin, .055)
            s.segment('Upper arm', shoulder, elbow, .11, m['Goblin skin'], arm, end=.09)
            s.ico('Elbow joint', elbow, (.085, .085, .085), m['Goblin skin'], arm)
            s.segment('Forearm', elbow, hand, .09, m['Goblin light'], fore, end=.075)
            s.ico('Hand', hand, (.105, .12, .12), m['Goblin light'], fore)
            s.ico('Ear', (sign*.48, -.005, 1.87), (.33, .11, .13), m['Goblin skin'], 'Head')
            s.ico('Ear inner', (sign*.47, -.09, 1.88), (.22, .025, .067), m['Goblin light'], 'Head')
        s.ico('Oversized angular head', (0, -.08, 1.76), (.39, .29, .34), m['Goblin skin'], 'Head', 2)
        s.ico('Muzzle', (0, -.32, 1.65), (.235, .17, .12), m['Goblin light'], 'Head')
        s.ico('Nose', (0, -.39, 1.78), (.095, .13, .12), m['Goblin light'], 'Head')
        for sign in (-1, 1):
            s.box('Angry eye socket', (sign*.19, -.322, 1.86), (.23, .045, .125), m['Eye sockets'], 'Head', .018, (0, sign*.15, 0))
            s.box('Amber eye', (sign*.19, -.348, 1.85), (.135, .025, .063), m['Eyes'], 'Head', .009)
            s.segment('Tusk', (sign*.17, -.402, 1.58), (sign*.19, -.41, 1.76), .045, m['Bone tips'], 'Head', end=0)
            s.segment('Small horn', (sign*.22, -.01, 2.0), (sign*.27, .10, 2.20), .085, m['Bone'], 'Head', end=0)
        s.box('Scarf collar', (0, -.015, 1.49), (.55, .41, .13), m['Cloth'], 'Spine', bevel=.035)
        bones.append(('Scarf', (0, .20, 1.49), 'Spine'))
        s.box('Trailing scarf', (.06, .51, 1.45), (.26, .65, .055), m['Cloth'], 'Scarf', .015, (-.13, 0, -.15))
        height = 2.2
    else:
        bones = [('Body', (0, .08, 1.13), None), ('Head', (0, -.22, 1.98), 'Body')]
        s.ico('Massive core', (0, .09, 1.62), (.84, .53, .77), m['Cracks'], subdivisions=2)
        s.ico('Chest slab', (0, -.33, 1.77), (.69, .22, .47), m['Rock face'])
        s.ico('Back slab', (0, .45, 1.78), (.67, .25, .50), m['Rock'])
        s.crystal('Heart shard', (0, -.56, 1.54), .15, .40, m['Ember crystal'], tilt=(.18, 0, 0))
        for sign in (-1, 1):
            hip, knee = (sign*.38, .08, 1.1), (sign*.44, .08, .55)
            shoulder, elbow = (sign*.79, .0, 1.98), (sign*1.05, -.04, 1.32)
            leg, shin, arm, fore = f'Leg{sign}', f'Shin{sign}', f'Arm{sign}', f'Fore{sign}'
            bones.extend([(leg, hip, 'Body'), (shin, knee, leg), (arm, shoulder, 'Body'), (fore, elbow, arm)])
            s.segment('Rock thigh', hip, knee, .28, m['Rock'], leg, end=.24)
            s.ico('Knee plate', (sign*.44, -.12, .58), (.29, .22, .27), m['Rock face'], leg)
            s.box('Heavy shin', (sign*.44, .08, .33), (.40, .42, .50), m['Rock'], shin, .09)
            s.box('Stone foot', (sign*.44, -.13, .14), (.56, .70, .28), m['Rock face'], shin, .10)
            s.ico('Huge shoulder', (sign*.85, 0, 2.02), (.48, .43, .42), m['Rock face'], arm)
            s.segment('Upper arm core', shoulder, elbow, .25, m['Cracks'], arm, end=.22)
            s.ico('Forearm slab', (sign*1.08, -.07, 1.22), (.33, .34, .46), m['Rock'], fore)
            s.box('Giant fist', (sign*1.12, -.18, .88), (.54, .53, .47), m['Rock face'], fore, .12)
            for i in range(3):
                s.box('Knuckle', (sign*1.12+(i-1)*.14, -.44, .90), (.12, .09, .18), m['Rock'], fore, .025)
            s.crystal('Shoulder crystal', (sign*.82, .05, 2.26), .16, .58, m['Ember crystal'], arm, (0, sign*.35, 0))
            s.crystal('Outer crystal', (sign*1.04, .15, 2.15), .12, .43, m['Ember crystal'], arm, (0, sign*.65, 0))
        s.box('Stone head', (0, -.27, 2.26), (.67, .56, .57), m['Rock face'], 'Head', .12)
        s.box('Dark visor', (0, -.564, 2.29), (.52, .05, .115), m['Cracks'], 'Head', .02)
        for sign in (-1, 1):
            s.box('Cold eye', (sign*.155, -.596, 2.30), (.13, .018, .06), m['Eyes'], 'Head', .008)
        s.box('Heavy brow', (0, -.56, 2.42), (.67, .15, .16), m['Rock'], 'Head', .03)
        s.box('Jaw', (0, -.44, 2.035), (.45, .33, .13), m['Rock'], 'Head', .035)
        height = 2.84
    rig = armature(root, bones)
    s.join('CreatureMesh', rig, rig)

    def idle(t):
        w = math.sin(t*math.tau)
        pose(rig, 'Body', loc=(0, 0, .025*w), rot=(0, .012*w, 0))
        pose(rig, 'Head', rot=(.025*w, 0, .04*w))
        if kind == 'moss-runner':
            pose(rig, 'Scarf', rot=(.09*w, 0, .06*w))

    def walk(t):
        w = math.sin(t*math.tau)
        bounce = 1-math.cos(t*math.tau*2)
        if kind == 'bone-crawler':
            pose(rig, 'Body', loc=(0, 0, .025*bounce), rot=(0, .04*w, .025*w))
            for sign in (-1, 1):
                for i in range(3):
                    phase = t*math.tau + (i%2)*math.pi + (math.pi if sign == 1 else 0)
                    swing = math.sin(phase)
                    pose(rig, f'Leg{sign}_{i}', rot=(.16*swing, sign*.19*max(0, swing), sign*.20*swing))
                    pose(rig, f'Leg{sign}_{i}Tip', rot=(0, -sign*.25*max(0, swing), 0))
        else:
            fast = kind == 'moss-runner'
            stride = .65 if fast else .30
            pose(rig, 'Body', loc=(0, 0, (.045 if fast else .023)*bounce), rot=(.10 if fast else .025, .045*w, 0))
            pose(rig, 'Head', rot=(-.07 if fast else -.02, 0, -.035*w))
            for sign in (-1, 1):
                swing = w*sign
                pose(rig, f'Leg{sign}', rot=(stride*swing, 0, 0))
                pose(rig, f'Shin{sign}', rot=(-.65*max(0, -swing) if fast else -.25*max(0, -swing), 0, 0))
                pose(rig, f'Arm{sign}', rot=(-stride*swing, 0, sign*.04))
                pose(rig, f'Fore{sign}', rot=(-.35-.25*max(0, swing) if fast else -.10, 0, 0))
            if fast:
                pose(rig, 'Scarf', rot=(.2+.12*w, 0, .10*w))

    def death(t):
        # Recoil, fall, settle; the final portion is a held corpse pose.
        q = min(1, max(0, (t-.12)/.65))
        q = q*q*(3-2*q)
        if kind == 'bone-crawler':
            pose(rig, 'Body', loc=(0, 0, -.28*q), rot=(0, .12*q, 0))
            for sign in (-1, 1):
                for i in range(3):
                    pose(rig, f'Leg{sign}_{i}', rot=(0, -sign*.58*q, sign*.10*q))
                    pose(rig, f'Leg{sign}_{i}Tip', rot=(0, -sign*.75*q, 0))
            pose(rig, 'Head', rot=(-.20*q, 0, -.15*q))
        else:
            fast = kind == 'moss-runner'
            pose(rig, 'Body', loc=(0, .22*q, -(.57 if fast else .66)*q), rot=(-math.pi/2*q, .08*q, .10*q))
            pose(rig, 'Head', rot=(.15*q, 0, -.12*q))
            for sign in (-1, 1):
                pose(rig, f'Arm{sign}', rot=(-.2*q, sign*.55*q, 0))
                pose(rig, f'Fore{sign}', rot=(-.4*q, 0, 0))
                pose(rig, f'Leg{sign}', rot=(.2*q, sign*.10*q, 0))
                pose(rig, f'Shin{sign}', rot=(-.35*q, 0, 0))
    clips = {'Idle': animate(rig, 'Idle', 60, idle, True),
             'Walk': animate(rig, 'Walk', 24 if kind == 'bone-crawler' else 20 if kind == 'moss-runner' else 42, walk, True),
             'Death': animate(rig, 'Death', 36 if kind != 'stone-brute' else 48, death, True)}
    if kind == 'moss-runner':
        # Only the upper subtree is keyed. Locomotion keeps ownership of Body and legs.
        def upper_attack(t):
            keys = [(0, 0, 0), (.22, 1, 0), (.40, 1, 0), (.56, 0, 1), (.70, 0, .85), (1, 0, 0)]
            for (ta, wa, ha), (tb, wb, hb) in zip(keys, keys[1:]):
                if ta <= t <= tb:
                    q = (t-ta)/(tb-ta)
                    q = q*q*(3-2*q)
                    windup, hit = wa+(wb-wa)*q, ha+(hb-ha)*q
                    break
            pose(rig, 'Spine', rot=(.05*hit, 0, -.30*windup+.25*hit))
            pose(rig, 'Head', rot=(-.06*hit, 0, .15*windup-.12*hit))
            pose(rig, 'Arm1', rot=(-.30*windup-1.45*hit, -.10*windup, -.12*hit))
            pose(rig, 'Fore1', rot=(-1.65*windup-.10*hit, 0, 0))
            pose(rig, 'Arm-1', rot=(-.40*(windup+hit), 0, -.08*(windup+hit)))
            pose(rig, 'Fore-1', rot=(-.70*(windup+hit), 0, 0))
            pose(rig, 'Scarf', rot=(.16*hit, 0, -.20*windup+.18*hit))
        upper_bones = {'Spine', 'Head', 'Arm1', 'Fore1', 'Arm-1', 'Fore-1', 'Scarf'}
        clips['UpperAttack'] = animate(rig, 'UpperAttack', 30, upper_attack, keyed_bones=upper_bones)
    return root, rig, clips, height


def tower(kind, m):
    root = empty('TowerRoot')
    base = Sculpt()
    base.box('Broad foundation', (0, 0, .16), (2.35, 2.35, .32), m['Stone'], None, .11)
    base.box('Foundation bevel', (0, 0, .37), (2.16, 2.16, .15), m['Stone trim'], None, .045)
    for x in (-.88, .88):
        for y in (-.88, .88):
            base.box('Corner fastening', (x, y, .47), (.20, .20, .08), m['Brass'], None, .015)
    if kind == 'cannon-tower':
        for x in (-.68, .68):
            base.box('Timber pier', (x, 0, .96), (.36, 1.38, 1.05), m['Timber'], None, .06)
            for z in (.65, 1.25):
                base.box('Iron strap', (x, 0, z), (.39, 1.42, .12), m['Iron'], None, .015)
        base.box('Deck', (0, 0, 1.48), (1.94, 1.84, .22), m['Timber edge'], None, .06)
        base.segment('Bearing', (0, 0, 1.59), (0, 0, 1.75), .66, m['Iron'], None, vertices=12)
        base.box('Teal shield', (0, -.945, 1.47), (.70, .055, .27), m['Teal'], None, .035)
        base.join('FoundationMesh', root)
        turret = empty('TurretYaw', root)
        rig = armature(turret, [('Mount', (0, 0, 1.75), None), ('Barrel', (0, 0, 2.18), 'Mount')])
        s = Sculpt()
        for x in (-.53, .53):
            s.box('Trunnion mount', (x, .02, 1.96), (.23, .64, .56), m['Iron'], 'Mount', .07)
            s.segment('Axle cap', (x-.13, 0, 2.17), (x+.13, 0, 2.17), .19, m['Brass'], 'Mount', vertices=10)
        s.segment('Cannon body', (0, .52, 2.21), (0, -.99, 2.21), .34, m['Iron'], 'Barrel', end=.26, vertices=12, caps=False)
        s.ico('Breech dome', (0, .52, 2.21), (.34, .29, .34), m['Iron'], 'Barrel', 2)
        for y, radius in [( .34, .365), (-.62, .30), (-1.03, .32)]:
            s.segment('Brass barrel band', (0, y+.07, 2.21), (0, y-.07, 2.21), radius, m['Brass'], 'Barrel', vertices=12, caps=y > -1)
        # Actual hollow muzzle: outer/inner rings and a recessed bore disk.
        vertices, faces = [], []
        for y, radius in [(-1.14, .30), (-1.14, .205), (-.90, .205)]:
            vertices.extend((radius*math.cos(i*math.tau/12), y, 2.21+radius*math.sin(i*math.tau/12)) for i in range(12))
        for ring in range(2):
            faces.extend((ring*12+i, ring*12+(i+1)%12, (ring+1)*12+(i+1)%12, (ring+1)*12+i) for i in range(12))
        mesh = bpy.data.meshes.new('Hollow muzzle')
        mesh.from_pydata(vertices, [], faces)
        o = bpy.data.objects.new('Muzzle rim', mesh)
        bpy.context.scene.collection.objects.link(o)
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        s.finish(o, 'Hollow muzzle', m['Iron'], 'Barrel')
        s.segment('Dark bore back', (0, -.895, 2.21), (0, -.89, 2.21), .204, m['Bore'], 'Barrel', vertices=12)
        s.box('Sight', (0, -.53, 2.52), (.09, .15, .12), m['Teal'], 'Barrel', .015)
        s.join('CannonMesh', rig, rig)
        empty('Muzzle', turret, (0, -1.14, 2.21))
        def shoot(t):
            recoil = 0 if t <= .4 else .30*((1-t)/(1-14/30))**2 if t >= 14/30 else .30*(t-.4)/(2/30)
            pose(rig, 'Barrel', loc=(0, recoil, 0))
            pose(rig, 'Mount', rot=(-.045*math.sin(max(0, t-.4)/.6*math.pi), 0, 0))
        clips = {'Shoot': animate(rig, 'Shoot', 30, shoot)}
        height = 2.63
    else:
        base.segment('Lower octagon', (0, 0, .45), (0, 0, .72), .86, m['Stone trim'], None, vertices=8)
        base.segment('Tapered column', (0, 0, .68), (0, 0, 1.86), .63, m['Stone'], None, end=.43, vertices=8)
        for sign in (-1, 1):
            base.box('Teal inlay front', (sign*.25, -.50, 1.13), (.08, .035, .61), m['Teal'], None, .01)
            base.box('Teal inlay side', (sign*.50, -.18, 1.13), (.035, .08, .61), m['Teal'], None, .01)
        base.segment('Crown collar', (0, 0, 1.78), (0, 0, 2.01), .67, m['Brass'], None, vertices=8)
        base.segment('Crystal cradle', (0, 0, 2.0), (0, 0, 2.14), .61, m['Iron'], None, end=.48, vertices=8)
        base.join('FoundationMesh', root)
        turret = empty('TurretYaw', root)
        bones = [('Core', (0, 0, 2.34), None)] + [(f'Shard{i}', (math.cos(i*math.tau/3)*.61, math.sin(i*math.tau/3)*.61, 2.1), None) for i in range(3)]
        rig = armature(turret, bones)
        s = Sculpt()
        s.crystal('Floating heart', (0, 0, 2.23), .33, 1.07, m['Crystal light'], 'Core')
        for i in range(3):
            a = i*math.tau/3
            x, y = math.cos(a)*.61, math.sin(a)*.61
            s.crystal('Orbit shard', (x, y, 2.10), .17, .69, m['Crystal'], f'Shard{i}', (.12*math.sin(a), -.12*math.cos(a), a))
        s.join('CrystalMesh', rig, rig)
        empty('Muzzle', turret, (0, 0, 2.80))
        def idle(t):
            pose(rig, 'Core', loc=(0, 0, .075*math.sin(t*math.tau)), rot=(0, 0, .14*math.sin(t*math.tau)))
            for i in range(3):
                pose(rig, f'Shard{i}', loc=(0, 0, .06*math.sin(t*math.tau+i*math.tau/3)))
        def shoot(t):
            charge = math.sin(min(t/.5, 1)*math.pi/2) if t <= .5 else max(0, 1-(t-.5)/.5)
            pulse = math.sin(max(0, t-.5)*math.tau)*.12
            pose(rig, 'Core', loc=(0, 0, .17*charge), rot=(0, 0, .65*charge), scale=(1+charge*.14,)*3)
            for i in range(3):
                a = i*math.tau/3
                r = -.13*charge+pulse
                pose(rig, f'Shard{i}', loc=(math.cos(a)*r, math.sin(a)*r, .20*charge), rot=(0, 0, .3*charge))
        clips = {'Idle': animate(rig, 'Idle', 60, idle), 'Shoot': animate(rig, 'Shoot', 36, shoot)}
        height = 3.4
    return root, rig, clips, height


def set_action(rig, action, frame=0):
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def stage(height, m):
    s = bpy.context.scene
    sculpt = Sculpt()
    sculpt.box('Display plinth', (0, 0, -.11), (3.4, 3.4, .20), m['Teal'], None, .10)
    floor = material('Studio floor', (.033, .055, .072))
    sculpt.box('Studio floor', (0, 0, -.25), (200, 200, .20), floor, None, 0)
    target = Vector((0, 0, height*.46))
    for name, loc, energy, size, color in [('Key', (3, -4, 7), 900, 5, (1, .84, .66)), ('Fill', (-4, -2, 4), 600, 5, (.57, .78, 1)), ('Rim', (2, 4, 6), 1100, 3, (.37, .80, 1))]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        o = bpy.context.object
        o.name, o.data.energy, o.data.size, o.data.color = name, energy, size, color
        o.rotation_euler = (target-o.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(5, -8, 5.4))
    camera = bpy.context.object
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', max(3.6, height*1.42)
    s.camera = camera
    s.render.engine = 'CYCLES'
    s.cycles.device, s.cycles.samples = 'CPU', 24
    s.cycles.use_denoising = True
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = 720, 720, 100
    s.render.image_settings.file_format = 'PNG'


def build(kind):
    m = start()
    is_tower = kind.endswith('tower')
    root, rig, clips, height = tower(kind, m) if is_tower else creature(kind, m)
    set_action(rig, next(iter(clips.values())))
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, int(next(iter(clips.values())).frame_range[1])
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root, *root.children_recursive]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = OUT / f'{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_extras=True,
        export_force_sampling=True, export_anim_slide_to_zero=True)
    data = path.read_bytes()
    gltf = json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])
    names = {a['name'] for a in gltf['animations']}
    assert names == set(clips), (kind, names, set(clips))
    assert len(gltf['skins']) == 1
    assert not gltf.get('images'), 'No texture dependency expected'
    info = {'bytes': len(data), 'bones': len(rig.data.bones), 'skins': len(gltf['skins']),
        'triangles': sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf['meshes'] for p in mesh['primitives']),
        'materials': len(gltf['materials']),
        'animations': {a['name']: max(gltf['accessors'][sampler['input']]['max'][0] for sampler in a['samplers']) for a in gltf['animations']},
        'root': root.name, 'forward': '+Z (glTF)', 'up': '+Y (glTF)', 'units': 'metres'}
    if is_tower:
        info['release_seconds'] = .4 if kind == 'cannon-tower' else .60
        info['muzzle_blender'] = list(bpy.data.objects['Muzzle'].location)
    stage(height, m)
    for clip, frame in [(next(iter(clips)), 0), ('Shoot' if is_tower else 'Walk', 13 if kind != 'stone-brute' else 10), ('Shoot' if is_tower else 'Death', 18 if is_tower else int(clips['Death'].frame_range[1]))]:
        set_action(rig, clips[clip], frame)
        bpy.context.scene.render.filepath = str(ART / f'{kind}-{clip.lower()}-{frame}.png')
        bpy.ops.render.render(write_still=True)
    if kind == 'moss-runner':
        set_action(rig, clips['UpperAttack'], 17)
        bpy.context.scene.render.filepath = str(ART / 'moss-runner-upper-attack.png')
        bpy.ops.render.render(write_still=True)
    set_action(rig, next(iter(clips.values())))
    for clip, action in clips.items():
        bpy.context.scene.timeline_markers.new(clip, frame=0)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'{kind}.blend'))
    # Reimport the delivery GLB and check every clip survived.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    assert bpy.data.objects.get(info['root']) is not None
    assert names == {a.name for a in bpy.data.actions}
    info['reimport_actions'] = sorted(a.name for a in bpy.data.actions)
    (ART / f'{kind}.json').write_text(json.dumps(info, indent=2))
    print('FRONTIER_ASSET_COMPLETE', kind, json.dumps(info), flush=True)


for kind in ONLY or ['bone-crawler', 'moss-runner', 'stone-brute', 'cannon-tower', 'frost-tower']:
    build(kind)
