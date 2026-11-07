"""Render a clean 2x2 four-view sheet for Tripo multiview generation.

The source blend is kept untouched. Blender uses -Y as the cavalry forward axis;
the sheet order is front, left, back, right as expected by the RAB Tripo flow.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets-source/cavalry/cavalry.blend"
OUT = ROOT / "artifacts/cavalry/tripo"
OUT.mkdir(parents=True, exist_ok=True)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_view(name, location):
    scene = bpy.context.scene
    camera = scene.camera
    camera.location = location
    look_at(camera, (0, 0, 1.65))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.35
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.06, 0.08, 0.12)
    # Use the authored idle pose and keep all geometry visible in every view.
    rig = next((o for o in scene.objects if o.type == "ARMATURE"), None)
    if rig and rig.animation_data and rig.animation_data.action:
        scene.frame_set(int(rig.animation_data.action.frame_range[0]))
    render_view("front", (0, -8.5, 3.15))
    render_view("left", (8.5, 0, 3.15))
    render_view("back", (0, 8.5, 3.15))
    render_view("right", (-8.5, 0, 3.15))

    print("CAVALRY_VIEWS", OUT, flush=True)


main()
