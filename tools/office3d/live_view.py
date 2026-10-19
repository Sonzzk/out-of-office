# Blender GUI helper: look through the scene camera in Material Preview, and
# reload office.blend whenever the headless build script saves a new version.
#   blender office.blend --python live_view.py
import bpy, os
from bpy.app.handlers import persistent

state = {'mtime': 0.0}

def camera_view():
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type != 'VIEW_3D': continue
            for sp in area.spaces:
                if sp.type == 'VIEW_3D':
                    sp.shading.type = 'MATERIAL'
                    sp.overlay.show_extras = False
                    sp.region_3d.view_perspective = 'CAMERA'
    return None

def watch():
    path = bpy.data.filepath
    if path and os.path.exists(path):
        m = os.path.getmtime(path)
        if state['mtime'] and m > state['mtime'] + 0.5 and not bpy.data.is_dirty:
            state['mtime'] = m
            bpy.ops.wm.revert_mainfile()
            return None
        state['mtime'] = state['mtime'] or m
    return 2.0

@persistent
def on_load(_):
    p = bpy.data.filepath
    state['mtime'] = os.path.getmtime(p) if p and os.path.exists(p) else 0.0
    bpy.app.timers.register(camera_view, first_interval=0.5)
    if not bpy.app.timers.is_registered(watch):
        bpy.app.timers.register(watch, first_interval=2.0)

bpy.app.handlers.load_post.append(on_load)
on_load(None)
