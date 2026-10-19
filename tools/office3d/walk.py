# Out of Office: export the office for the walkable view. Builds the same scene
# as office.py, bakes its Cycles lighting into texture atlases and writes glTF:
#   blender --background --factory-startup --python walk.py -- <outdir>
# Writes <outdir>/walk/office.glb (one mesh per collection: base, up_*, fx_door_*),
# lightmaps base.png / props.png / dark.png, figure.glb and walk.json.
import bpy, os, sys, json, math

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else HERE
SIZE = int(argv[1]) if len(argv) > 1 else 4096
SAMPLES = int(argv[2]) if len(argv) > 2 else 256
WD = os.path.join(OUT, 'walk'); os.makedirs(WD, exist_ok=True)

OFFICE = os.path.join(HERE, 'office.py')
g = {'__file__': OFFICE, '__name__': '__main__', 'SCENE_ONLY': True}
exec(compile(open(OFFICE).read(), OFFICE, 'exec'), g)
M, sc = g['M'], bpy.context.scene
sc.cycles.samples = SAMPLES
sc.render.bake.margin = 6
sc.cycles.bake_type = 'COMBINED'

def lc(name): return bpy.context.view_layer.layer_collection.children[name]
COLS = [c.name for c in bpy.data.collections]

def select(objs):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def join(name, cname):
    """All meshes of one collection become one object (modifiers applied)."""
    objs = [o for o in bpy.data.collections[cname].objects if o.type == 'MESH']
    if not objs: return None
    select(objs)
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.object; o.name = name; o.data.name = name
    return o

for c in COLS:   # every collection on so everything can be joined and baked
    lc(c).exclude = False
groups = {c: join(c, c) for c in COLS if c == 'base' or c.startswith(('up_', 'fx_door'))}
groups = {k: v for k, v in groups.items() if v}
print('JOINED', {k: len(v.data.polygons) for k, v in groups.items()})

def unwrap(objs, margin):
    select(objs)
    for o in objs:
        uv = o.data.uv_layers.new(name='bake'); o.data.uv_layers.active = uv; uv.active_render = True
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=1.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')

base = [groups['base']]
props = [v for k, v in groups.items() if k != 'base']
unwrap(base, 0.0008)
unwrap(props, 0.003)

def atlas(name, size):
    img = bpy.data.images.new(name, size, size, float_buffer=True); img.colorspace_settings.name = 'Linear Rec.709'
    return img

def bake(objs, img):
    """Point every material's active image node at img, then bake COMBINED."""
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nt = m.node_tree; n = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE'; n.image = img; nt.nodes.active = n
    select(objs)
    bpy.ops.object.bake(type='COMBINED', margin=6, use_clear=True)
    img.filepath_raw = ''
    return img

def save(img, path):
    img.save_render(path, scene=sc)   # applies the exposure / view transform the stills use
    print('SAVED', path)

lamp = M['lamp'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
world = sc.world.node_tree.nodes['Background'].inputs['Color']
def lights(on):
    lamp.default_value = 6.0 if on else 0.0
    world.default_value = (0.03, 0.03, 0.025, 1) if on else (0.004, 0.005, 0.006, 1)
    lc('lights').exclude = not on; lc('glow').exclude = on

# 1. the room with the lights on, upgrades and the figure out of the way
for c in COLS:
    if c.startswith(('up_', 'fx_')): lc(c).exclude = True
lc('fx_door_closed').exclude = False
lights(True)
save(bake(base, atlas('base', SIZE)), os.path.join(WD, 'base.png'))
# 2. lights out: only the CRT glow and the exit sign
lights(False)
save(bake(base, atlas('dark', SIZE // 2)), os.path.join(WD, 'dark.png'))
# 3. every upgrade prop, lit, baked into one shared atlas
lights(True)
for c in COLS:
    if c.startswith(('up_', 'fx_door')): lc(c).exclude = False
lc('fx_door_open').exclude = False   # both doors bake together; the game shows one
save(bake(props, atlas('props', SIZE // 2)), os.path.join(WD, 'props.png'))
lc('fx_door_closed').exclude = False

# ---------- export: only the bake UVs, no materials (the game binds the atlases) ----------
for o in groups.values():
    for uv in [u for u in o.data.uv_layers if u.name != 'bake']: o.data.uv_layers.remove(uv)
    o.data.materials.clear()
select(list(groups.values()))
bpy.ops.export_scene.gltf(filepath=os.path.join(WD, 'office.glb'), use_selection=True, export_format='GLB',
                          export_materials='NONE', export_texcoords=True, export_normals=False, export_yup=True)

# the figure: full detail, its own simple material in the game
fig = [o for o in bpy.data.collections['fx_figure'].objects if o.type == 'MESH']
lc('fx_figure').exclude = False
select(fig)
for o in fig:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
bpy.context.view_layer.objects.active = fig[0]
bpy.ops.object.join(); f = bpy.context.object; f.name = 'figure'
f.data.materials.clear()
tris = sum(len(p.vertices) - 2 for p in f.data.polygons)
if tris > 120000:
    d = f.modifiers.new('dec', 'DECIMATE'); d.ratio = 120000 / tris; bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
select([f])
bpy.ops.export_scene.gltf(filepath=os.path.join(WD, 'figure.glb'), use_selection=True, export_format='GLB',
                          export_materials='NONE', export_texcoords=False, export_normals=True, export_yup=True)

cam = sc.camera
meta = {'start': list(cam.location), 'yaw': math.degrees(cam.rotation_euler.z),
        'meshes': sorted(groups), 'figure_tris': sum(len(p.vertices) - 2 for p in f.data.polygons)}
json.dump(meta, open(os.path.join(WD, 'walk.json'), 'w'), indent=1)
print('WALKDONE', meta)
