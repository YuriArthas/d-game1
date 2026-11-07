"""Bind the Tripo cavalry mesh to the authored 27-bone cavalry rig.

This is deliberately a reviewable intermediate: the original authored mesh is
removed from the exported variant, the existing rig/actions are retained, and
the generated mesh keeps Tripo's baked material and UVs. The nearest-bone pass
is deterministic and leaves a clear basis for manual paint correction in
Blender where a production asset needs it.
"""
import bpy
import bmesh
import json
import math
import os
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets-source/cavalry/cavalry.blend"
TRIPO = Path(os.environ.get("TRIPO_INPUT_GLB", ROOT / "artifacts/cavalry/tripo/original-lowpoly-002/result/texture/cavalry-tripo-textured.glb"))
OUT_GLB = Path(os.environ.get("TRIPO_OUTPUT_GLB", ROOT / "public/assets/cavalry/cavalry-tripo.glb"))
OUT_BLEND = Path(os.environ.get("TRIPO_OUTPUT_BLEND", ROOT / "assets-source/cavalry/cavalry-tripo.blend"))
OUT_INFO = Path(os.environ.get("TRIPO_OUTPUT_INFO", ROOT / "artifacts/cavalry/tripo/result/bind-result.json"))
TRIPO_TASK_ID = os.environ.get("TRIPO_TASK_ID", "0d0ce66c-e14f-4977-a0ca-7ec2144f5478")
TRIPO_TEXTURE_TASK_ID = os.environ.get("TRIPO_TEXTURE_TASK_ID", "ee1c036a-8760-498c-8617-ce676ef01df0")
MIRROR_X = os.environ.get("TRIPO_MIRROR_X", "0") == "1"
TEXTURE_SIZE = int(os.environ.get("TRIPO_TEXTURE_SIZE", "512"))
if TEXTURE_SIZE not in (256, 512, 1024):
    raise RuntimeError('TRIPO_TEXTURE_SIZE must be 256, 512 or 1024')


def point_segment_distance(point, a, b):
    ab = b - a
    denom = ab.length_squared
    if denom <= 1e-10:
        return (point - a).length
    t = max(0.0, min(1.0, (point - a).dot(ab) / denom))
    return (point - (a + t * ab)).length


def bounds(mesh):
    points = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def align_generated_mesh(mesh):
    # Tripo's canonical output in this task has +X as the long horse axis.
    # The authored rig uses -Y forward, so rotate -90 degrees around Z and
    # scale its one-unit output to the authored 3.4 m cavalry height.
    # Tripo's imported node uses quaternion rotation mode; assigning
    # rotation_euler without switching modes is silently ignored in Blender.
    # Set the mode first so the long horse axis really maps to the rig's -Y
    # forward direction.
    mesh.rotation_mode = 'XYZ'
    mesh.rotation_euler[2] = -math.pi / 2
    mesh.scale = (3.4, 3.4, 3.4)
    bpy.context.view_layer.update()
    lo, hi = bounds(mesh)
    mesh.location.x -= (lo.x + hi.x) / 2
    mesh.location.y -= (lo.y + hi.y) / 2
    mesh.location.z += 0.025 - lo.z
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()
    return bounds(mesh)


def mirror_x_and_uv(mesh):
    """Correct Tripo front-view handedness while retaining baked details.

    Under the authored rig's handedness the unmirrored Tripo shield lands in
    ``RiderForeR``. Mirroring the centered mesh maps that shield to
    ``RiderForeL`` and the weapon to the opposite arm. The UVs stay unchanged:
    each polygon keeps sampling the baked island generated for that polygon.
    """
    for vertex in mesh.data.vertices:
        vertex.co.x = -vertex.co.x
    mesh.data.update()
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def remove_tripo_extra_shield(mesh):
    """Remove the second shield hallucinated on the sword arm by Tripo.

    The fresh mesh task visibly contains two disconnected shield shells. The
    unwanted shell is the isolated group at the opposite side of the rider:
    its component center is x < -0.35, y > 0.10 and its vertical extent is
    greater than 0.5 m after cavalry alignment. This deletes only those
    disconnected components; the source-side shield and sword remain intact.
    """
    adjacency = [set() for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        for vertex_index in polygon.vertices:
            adjacency[vertex_index].update(other for other in polygon.vertices if other != vertex_index)
    seen = set()
    remove = set()
    for start in range(len(adjacency)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            index = stack.pop()
            component.append(index)
            for other in adjacency[index]:
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        points = [mesh.matrix_world @ mesh.data.vertices[index].co for index in component]
        lo = Vector((min(point[i] for point in points) for i in range(3)))
        hi = Vector((max(point[i] for point in points) for i in range(3)))
        center = (lo + hi) / 2
        broad_extra = center.x < -.35 and center.y > .10 and center.z > 1.60 and (hi.z - lo.z) > .50
        extra_rim = center.x < -.20 and center.y > .25 and center.z > 2.30 and (hi.z - lo.z) > .20
        extra_outer_rim = center.x < -.55 and center.y > .35 and center.z > 1.80 and (hi.z - lo.z) > .25
        if broad_extra or extra_rim or extra_outer_rim:
            remove.update(component)
    if not remove:
        return {'removed_vertices': 0, 'removed_triangles': 0}
    before = len(mesh.data.polygons)
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[index] for index in remove], context='VERTS')
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    return {'removed_vertices': len(remove), 'removed_triangles': before - len(mesh.data.polygons)}


def resize_tripo_textures(mesh, size):
    """Keep the real Tripo bake while meeting the ordinary-unit texture cap."""
    used = set()
    for material in mesh.data.materials:
        if not material or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                used.add(node.image)
    resized = []
    for image in used:
        if image.source != 'FILE' or image.size[0] <= 0 or image.size[1] <= 0:
            continue
        if image.size[0] == size and image.size[1] == size:
            continue
        image.scale(size, size)
        image.pack()
        resized.append({'name': image.name, 'width': size, 'height': size})
    return resized


def add_neck_bridge(mesh):
    """Add a small low-poly collar that physically overlaps head and torso.

    Tripo's output is a collection of shell components. The collar makes the
    rider read as one connected body even when the helmet and chest follow
    different bones during the authored idle/attack clips.
    """
    bpy.ops.mesh.primitive_cone_add(
        vertices=8,
        radius1=.19,
        radius2=.15,
        depth=.24,
        location=(.08, .28, 2.68),
    )
    bridge = bpy.context.object
    bridge.name = 'RiderNeckBridge'
    # Give the bridge the imported Tripo material before joining. Otherwise
    # glTF exports it as a second material-less primitive, which costs an
    # extra WebGL geometry/material resource.
    if mesh.data.materials:
        bridge.data.materials.append(mesh.data.materials[0])
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bridge.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    return mesh


def nearest_weights(mesh, rig):
    # Pose-bone heads/tails are in world space and match the visible rest pose.
    while mesh.vertex_groups:
        mesh.vertex_groups.remove(mesh.vertex_groups[0])
    segments = []
    for bone in rig.pose.bones:
        segments.append((bone.name, bone.head.copy(), bone.tail.copy()))
    groups = {name: mesh.vertex_groups.new(name=name) for name, _, _ in segments}
    for vertex in mesh.data.vertices:
        point = mesh.matrix_world @ vertex.co
        # The broad shield is a rigid prop. A distance-only seed can choose
        # rider legs for its lower edge because those bones are physically
        # close in this compact cavalry silhouette. Keep the entire visible
        # face on the left forearm so it cannot appear at the right elbow or
        # drift with a horse leg during Run/Attack.
        shield_side = -1.0 if MIRROR_X else 1.0
        if point.x * shield_side > .38 and shield_side * point.y < .08 and 1.98 < point.z < 2.78:
            groups['RiderForeL'].add([vertex.index], 1.0, 'REPLACE')
            continue
        # Keep the physical neck bridge and the helmet's lower rim on the
        # spine. Only the upper helmet follows RiderHead, so head turns cannot
        # open a visible seam at the collar.
        rider_center_x = -.08 if MIRROR_X else .08
        if 2.52 <= point.z <= 2.80 and abs(point.x - rider_center_x) < .34 and .00 < point.y < .62:
            groups['RiderSpine'].add([vertex.index], 1.0, 'REPLACE')
            continue
        if point.z > 2.80 and abs(point.x - rider_center_x) < .45 and -.05 < point.y < .68:
            groups['RiderHead'].add([vertex.index], 1.0, 'REPLACE')
            continue
        distances = sorted((point_segment_distance(point, head, tail), name)
                           for name, head, tail in segments)
        # Four influences are enough for smooth body/neck transitions while
        # keeping the exported skin cheap for Roblox.
        selected = distances[:4]
        weights = [math.exp(-distance * 7.0) for distance, _ in selected]
        total = sum(weights) or 1.0
        for weight, (_, name) in zip(weights, selected):
            groups[name].add([vertex.index], weight / total, 'REPLACE')


def count_triangles(path):
    blob = path.read_bytes()
    json_length = struct.unpack_from('<I', blob, 12)[0]
    document = json.loads(blob[20:20 + json_length].decode('utf-8').rstrip())
    total = 0
    for mesh in document.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            accessor = document.get('accessors', [])[primitive.get('indices', -1)]
            if primitive.get('mode', 4) == 4:
                total += accessor.get('count', 0) // 3
    return document, total


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    root = bpy.data.objects.get('CavalryRoot')
    rig = bpy.data.objects.get('CavalryRig')
    old_mesh = bpy.data.objects.get('CavalryMesh')
    if root is None or rig is None or old_mesh is None:
        raise RuntimeError('authored cavalry rig not found')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=str(TRIPO))
    imported = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name != 'CavalryMesh']
    if len(imported) != 1:
        raise RuntimeError(f'expected one Tripo mesh, got {[o.name for o in imported]}')
    mesh = imported[0]
    mesh.name = 'CavalryTripoMesh'
    lo, hi = align_generated_mesh(mesh)
    removed_extra_shield = remove_tripo_extra_shield(mesh)
    resized_textures = resize_tripo_textures(mesh, TEXTURE_SIZE)
    mesh = add_neck_bridge(mesh)
    if MIRROR_X:
        mirror_x_and_uv(mesh)
    if not mesh.data.materials:
        raise RuntimeError('Tripo textured GLB imported without a material')

    # Remove the authored mesh so the exported variant contains one Tripo mesh
    # with its original UVs/material and one skin.
    bpy.data.objects.remove(old_mesh, do_unlink=True)
    mesh.parent = rig
    mesh.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = mesh.modifiers.new('CavalryRig Skin', 'ARMATURE')
    modifier.object = rig
    nearest_weights(mesh, rig)

    root['asset_role'] = 'ordinary cavalry, Tripo 5000-face review variant'
    root['triangle_budget'] = 5000
    root['generated_by'] = 'TRIPO_HTTP_MULTIVIEW_TO_MODEL'
    root['tripo_task'] = TRIPO_TASK_ID
    root['tripo_texture_task'] = TRIPO_TEXTURE_TASK_ID
    root['texture_source'] = 'TRIPO_HTTP_TEXTURE_MODEL'
    root['texture_alignment'] = 'original_image'
    root['handedness'] = 'mirrored X from Tripo output; shield RiderForeL, weapon RiderForeR' if MIRROR_X else 'Tripo output retained; shield remapped to RiderForeL, weapon RiderForeR'
    root['weighting'] = 'deterministic four-nearest-bone seed; inspect horse legs, rider hips, shield and weapon'

    rig.animation_data.action = bpy.data.actions.get('Idle')
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True); rig.select_set(True); mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_extras=True,
        export_force_sampling=True, export_anim_slide_to_zero=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    document, triangles = count_triangles(OUT_GLB)
    info = {
        'triangles': triangles,
        'bones': len(rig.data.bones),
        'skins': len(document.get('skins', [])),
        'meshes': len(document.get('meshes', [])),
        'materials': len(document.get('materials', [])),
        'animations': sorted(a.get('name') for a in document.get('animations', [])),
        'bounds': {'min': list(lo), 'max': list(hi)},
        'weighting': 'four-nearest-bone distance seed',
        'texture': {'source': 'Tripo texture_model', 'task_id': TRIPO_TEXTURE_TASK_ID, 'preserved_uv': True},
        'texture_resize': resized_textures,
        'removed_extra_shield': removed_extra_shield,
        'handedness': 'mirrored X from Tripo output; shield RiderForeL, weapon RiderForeR' if MIRROR_X else 'Tripo output retained; shield remapped to RiderForeL, weapon RiderForeR',
    }
    OUT_INFO.write_text(json.dumps(info, indent=2), encoding='utf-8')
    print('TRIPO_RIGGED_COMPLETE', json.dumps(info), flush=True)


main()
