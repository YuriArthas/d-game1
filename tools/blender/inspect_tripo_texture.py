"""Render the Tripo textured GLB without replacing its materials."""
import bpy
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
GLB = Path(os.environ.get("TRIPO_INPUT_GLB", ROOT / "artifacts/cavalry/tripo/original-lowpoly-001/result/texture/cavalry-tripo-textured.glb"))
OUT = Path(os.environ.get("TRIPO_INSPECT_OUT", GLB.parent))
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("Tripo Texture Preview World")
scene.world.color = (0.06, 0.08, 0.12)
meshes = [o for o in scene.objects if o.type == "MESH"]
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
center = (lo + hi) / 2
extent = max(hi - lo)
for loc, power, size in [((4, -5, 7), 1100, 5), ((-4, -2, 4), 700, 4), ((2, 4, 5), 900, 4)]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
camera_location = (0, -extent * 1.9, center.z + extent * .4) if os.environ.get("TRIPO_CAMERA") == "front" else (extent * 1.2, -extent * 1.7, center.z + extent * .55)
bpy.ops.object.camera_add(location=camera_location)
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = extent * 1.18
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera
scene.render.filepath = str(OUT / "textured-inspect.png")
bpy.ops.render.render(write_still=True)
print("TRIPO_TEXTURE_BOUNDS", list(lo), list(hi), "materials", [(o.name, [m.name if m else None for m in o.data.materials]) for o in meshes], flush=True)
