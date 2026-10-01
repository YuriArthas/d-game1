"""Open the generated .blend in Blender GUI, then run this script for a screenshot."""
import bpy

bpy.context.preferences.view.show_splash = False


def prepare():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            space = area.spaces.active
            space.overlay.show_overlays = False
            space.shading.type = 'MATERIAL'
            space.region_3d.view_perspective = 'CAMERA'
            space.region_3d.view_camera_zoom = 8
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    print('BLENDER_GUI_READY', flush=True)
    return None


bpy.app.timers.register(prepare, first_interval=2)
