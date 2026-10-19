# Out of Office: the office view, rendered as layers for the game. Run headless:
#   blender --background --factory-startup --python office.py -- <outdir> [layer ...]
# Writes <outdir>/layers/<name>.png and <outdir>/layers/meta.json. With no layer
# names it renders everything: 'base' (lit room), 'dark' (lights out), and one
# transparent PNG per upgrade tier / horror prop (collections named up_* / fx_*).
import bpy, math, os, sys, random

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.dirname(os.path.abspath(__file__))
ONLY = argv[1:]
VARIANT = 'base'
TEX = os.path.join(OUT, 'crt-desktop.png')
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------- materials ----------
def mat(name, color, rough=0.8, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m

def noisy(m, scale, c2, fac_lo=0.35, fac_hi=0.75, bump=0.0):
    """Mix a second color in with noise (grime, fabric, carpet)."""
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = 8
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].position = fac_lo; r.color_ramp.elements[1].position = fac_hi
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs[6].default_value = b.inputs['Base Color'].default_value[:]
    mix.inputs[7].default_value = (*c2, 1)
    nt.links.new(n.outputs['Fac'], r.inputs['Fac'])
    nt.links.new(r.outputs['Color'], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    if bump:
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = scale * 20
        nt.links.new(n2.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

M = {}
M['carpet'] = noisy(mat('carpet', (0.24, 0.18, 0.08), 0.95), 3, (0.15, 0.11, 0.05), bump=0.25)
M['wall'] = noisy(mat('wall', (0.62, 0.53, 0.30), 0.9), 1.5, (0.55, 0.46, 0.26), 0.45, 0.8)
M['fabric'] = noisy(mat('fabric', (0.46, 0.42, 0.34), 1.0), 6, (0.38, 0.34, 0.27), bump=0.15)
M['trim'] = mat('trim', (0.62, 0.58, 0.50), 0.5)
M['desk'] = mat('desk', (0.66, 0.56, 0.40), 0.45)
M['plastic'] = noisy(mat('plastic', (0.74, 0.70, 0.58), 0.5), 4, (0.62, 0.57, 0.44), 0.5, 0.9)
M['dark'] = mat('dark', (0.05, 0.05, 0.05), 0.6)
M['keys'] = mat('keys', (0.60, 0.57, 0.48), 0.6)
M['cork'] = noisy(mat('cork', (0.50, 0.33, 0.17), 1.0), 40, (0.36, 0.22, 0.10), 0.3, 0.7, bump=0.3)
M['door'] = mat('door', (0.35, 0.24, 0.14), 0.6)
M['red'] = mat('red', (0.55, 0.06, 0.04), 0.4)
M['mug'] = mat('mug', (0.75, 0.73, 0.68), 0.3)
M['coffee'] = mat('coffee', (0.07, 0.03, 0.01), 0.1)
M['lamp'] = mat('lamp', (1, 1, 1), 0.5, (1.0, 0.98, 0.86), 6.0)
M['lampoff'] = mat('lampoff', (0.55, 0.55, 0.50), 0.5)
M['vend'] = mat('vend', (0.55, 0.03, 0.02), 0.35)
M['vendlit'] = mat('vendlit', (0.7, 0.85, 1.0), 0.3, (0.55, 0.8, 1.0), 3.0)
M['vendglow'] = mat('vendglow', (0.9, 0.9, 0.8), 0.3, (0.95, 0.92, 0.75), 2.5)
M['crtoff'] = mat('crtoff', (0.04, 0.06, 0.05), 0.2, (0.05, 0.12, 0.08), 0.6)
PAPER = [mat('p%d' % i, c, 0.9) for i, c in enumerate(
    [(0.85, 0.83, 0.75), (0.90, 0.82, 0.30), (0.75, 0.85, 0.80), (0.92, 0.65, 0.65), (0.86, 0.86, 0.86)])]

# ceiling: drop tiles from a brick texture, plus water stains
cm = mat('ceiling', (0.80, 0.78, 0.70), 0.95); nt = cm.node_tree; b = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord')
br = nt.nodes.new('ShaderNodeTexBrick')
br.inputs['Color1'].default_value = (0.80, 0.78, 0.70, 1); br.inputs['Color2'].default_value = (0.76, 0.74, 0.66, 1)
br.inputs['Mortar'].default_value = (0.48, 0.46, 0.40, 1); br.inputs['Scale'].default_value = 1.0
br.inputs['Mortar Size'].default_value = 0.015; br.inputs['Brick Width'].default_value = 0.6
br.inputs['Row Height'].default_value = 0.6; br.offset = 0.0
st = nt.nodes.new('ShaderNodeTexNoise'); st.inputs['Scale'].default_value = 0.35; st.inputs['Detail'].default_value = 10
sr = nt.nodes.new('ShaderNodeValToRGB'); sr.color_ramp.elements[0].position = 0.58; sr.color_ramp.elements[1].position = 0.68
sm = nt.nodes.new('ShaderNodeMix'); sm.data_type = 'RGBA'; sm.inputs[7].default_value = (0.42, 0.30, 0.13, 1)
nt.links.new(tc.outputs['Object'], br.inputs['Vector']); nt.links.new(tc.outputs['Object'], st.inputs['Vector'])
nt.links.new(br.outputs['Color'], sm.inputs[6]); nt.links.new(st.outputs['Fac'], sr.inputs['Fac'])
nt.links.new(sr.outputs['Color'], sm.inputs[0]); nt.links.new(sm.outputs[2], b.inputs['Base Color'])
M['ceiling'] = cm

# CRT screen shows the game's Win95 desktop
sm_ = bpy.data.materials.new('screen'); sm_.use_nodes = True; nt = sm_.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
img = nt.nodes.new('ShaderNodeTexImage')
if os.path.exists(TEX): img.image = bpy.data.images.load(TEX)
em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.6
nt.links.new(img.outputs['Color'], em.inputs['Color'])
nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
M['screen'] = sm_


# ---------- collections: every object goes into the active one ----------
def col(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name); sc.collection.children.link(c)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[name]
    return c

# ---------- geometry helpers ----------
def box(name, x0, y0, z0, x1, y1, z1, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0+x1)/2, (y0+y1)/2, (z0+z1)/2))
    o = bpy.context.object; o.name = name; o.scale = (abs(x1-x0), abs(y1-y0), abs(z1-z0))
    bpy.ops.object.transform_apply(scale=True); o.data.materials.append(M[m] if isinstance(m, str) else m)
    return o

def plane(name, cx, cy, cz, sx, sy, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, cz), rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(scale=True); o.data.materials.append(M[m] if isinstance(m, str) else m)
    return o

def cyl(name, x, y, z, r, d, m, verts=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=(x, y, z), rotation=rot)
    o = bpy.context.object; o.name = name; o.data.materials.append(M[m] if isinstance(m, str) else m)
    return o

M['vendlit'] = mat('vendlit', (0.7, 0.85, 1.0), 0.3, (0.55, 0.8, 1.0), 3.0)
M['vend'] = mat('vend', (0.55, 0.03, 0.02), 0.35)
M['vend2'] = mat('vend2', (0.12, 0.16, 0.22), 0.35)
M['steel'] = mat('steel', (0.55, 0.56, 0.58), 0.3); M['steel'].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.8
M['green'] = mat('greenled', (0.1, 0.8, 0.2), 0.3, (0.1, 1.0, 0.2), 4)
M['redled'] = mat('redled', (0.9, 0.1, 0.05), 0.3, (1.0, 0.1, 0.05), 5)
M['amber'] = mat('amberled', (0.9, 0.6, 0.1), 0.3, (1.0, 0.6, 0.1), 4)
M['static'] = mat('static', (0.5, 0.55, 0.5), 0.3, (0.55, 0.65, 0.6), 1.2)
M['labglow'] = mat('labglow', (0.4, 0.9, 0.5), 0.3, (0.35, 1.0, 0.45), 2.0)
M['jar'] = mat('jarglow', (0.6, 1.0, 0.3), 0.2, (0.5, 1.0, 0.2), 3.0)
M['jar2'] = mat('jarglow2', (0.7, 0.3, 1.0), 0.2, (0.6, 0.2, 1.0), 4.0)
M['glass'] = mat('glass_dark', (0.05, 0.06, 0.06), 0.1)
M['blinds'] = mat('blinds', (0.70, 0.68, 0.60), 0.6)
M['couch'] = noisy(mat('couch', (0.22, 0.28, 0.20), 1.0), 8, (0.17, 0.22, 0.15))
M['roomlit'] = mat('roomlit', (1, 1, 1), 0.5, (1.0, 0.96, 0.80), 2.2)
M['void'] = mat('void', (0.0, 0.0, 0.0), 1.0)
M['skin'] = mat('figure', (0.01, 0.01, 0.01), 0.9)
M['eyes'] = mat('eyes', (1, 1, 1), 0.05, (1.0, 0.95, 0.8), 1.5)

PH = 1.1          # 90s low cubicle walls: you can see over them
CEIL = 2.7
X0, X1, Y0, Y1 = -9.0, 2.6, -3.0, 18.0

def partition(name, x0, y0, x1, y1, h=PH):
    t = 0.06
    if abs(x1 - x0) < abs(y1 - y0): x0, x1 = x0 - t/2, x0 + t/2
    else: y0, y1 = y0 - t/2, y0 + t/2
    box(name, x0, y0, 0, x1, y1, h - 0.03, 'fabric')
    box(name + '_cap', x0 - 0.005, y0 - 0.005, h - 0.03, x1 + 0.005, y1 + 0.005, h, 'trim')

def place(parts, x, y, z, deg):
    import mathutils
    for p in parts:
        p.matrix_world = mathutils.Matrix.Translation((x, y, z)) @ mathutils.Matrix.Rotation(math.radians(deg), 4, 'Z') @ p.matrix_world

def crt(name, cx, cy, z, face_deg, on=True, screen=None):
    """Beige CRT, low-poly: front bezel, tapered back, recessed screen."""
    parts = [box(name + '_front', -0.21, -0.03, 0.04, 0.21, 0.12, 0.42, 'plastic'),
             box(name + '_back', -0.16, 0.12, 0.08, 0.16, 0.36, 0.38, 'plastic'),
             box(name + '_foot', -0.14, 0.02, 0.0, 0.14, 0.26, 0.04, 'plastic'),
             plane(name + '_scr', 0, -0.031, 0.235, 0.32, 0.24, screen or ('screen' if on else 'crtoff'), rot=(math.pi/2, 0, 0)),
             box(name + '_led', 0.15, -0.04, 0.07, 0.17, -0.03, 0.08, 'vendglow')]
    place(parts, cx, cy, z, face_deg)

def phone(name, x0, y0, m='plastic'):
    box(name, x0, y0, 0.75, x0 + 0.18, y0 + 0.2, 0.80, m)
    box(name + '_rx', x0 + 0.01, y0, 0.80, x0 + 0.17, y0 + 0.05, 0.83, 'dark')

def vending(name, y0, body, glass, cans=True):
    """Vending machine against the right wall, facing the hallway (-X)."""
    x1 = X1 - 0.02; x0 = x1 - 0.75; y1 = y0 + 0.85
    box(name, x0, y0, 0, x1, y1, 1.85, body)
    box(name + '_glass', x0 - 0.01, y0 + 0.07, 0.55, x0, y0 + 0.55, 1.75, glass)
    box(name + '_panel', x0 - 0.01, y0 + 0.6, 0.9, x0, y0 + 0.78, 1.5, 'dark')
    box(name + '_slot', x0 - 0.01, y0 + 0.1, 0.2, x0, y0 + 0.5, 0.4, 'dark')
    box(name + '_coin', x0 - 0.015, y0 + 0.65, 1.3, x0 - 0.01, y0 + 0.72, 1.4, 'steel')
    if cans:
        for r in range(5):
            for c in range(4):
                box('%s_can%d_%d' % (name, r, c), x0 - 0.02, y0 + 0.1 + c * 0.11, 0.65 + r * 0.22, x0 - 0.011, y0 + 0.17 + c * 0.11, 0.75 + r * 0.22,
                    PAPER[(r + c) % 5])

# ======================= BASE ROOM =======================
col('base')
box('floor', X0, Y0, -0.1, X1, Y1, 0, 'carpet')
box('ceiling', X0, Y0, CEIL, X1, Y1, CEIL + 0.1, 'ceiling')
box('wall_r', X1, Y0, 0, X1 + 0.1, Y1, CEIL, 'wall')
box('wall_l', X0 - 0.1, Y0, 0, X0, Y1, CEIL, 'wall')
box('wall_end', X0, Y1, 0, X1, Y1 + 0.1, CEIL, 'wall')
box('wall_back', X0, Y0 - 0.1, 0, X1, Y0, CEIL, 'wall')
box('base_r', X1 - 0.02, Y0, 0, X1, Y1, 0.1, 'trim')

# our cubicle (x -1.8..0.2, y -1.2..1.3), open to the corridor on the right
partition('my_front', -1.8, 1.3, 0.2, 1.3)
partition('my_left', -1.8, -1.2, -1.8, 1.3)
box('my_desk', -1.78, 0.6, 0.72, 0.18, 1.27, 0.75, 'desk')
box('my_desk_l', -1.78, -0.6, 0.72, -1.15, 0.6, 0.75, 'desk')   # L-return
box('my_pedestal', -0.5, 0.65, 0, 0.1, 1.25, 0.72, 'trim')
crt('my_crt', -0.95, 0.95, 0.75, 25)
box('kbd', -0.98, 0.62, 0.75, -0.55, 0.78, 0.775, 'plastic')
for r in range(4):
    for c in range(13):
        kx = -0.965 + c * 0.031; ky = 0.635 + r * 0.033
        box('key%d_%d' % (r, c), kx, ky, 0.775, kx + 0.025, ky + 0.026, 0.783, 'keys')
box('mouse', -0.45, 0.68, 0.75, -0.40, 0.76, 0.775, 'plastic')
box('pad', -0.50, 0.63, 0.75, -0.33, 0.80, 0.752, 'dark')
cyl('mug', -0.2, 0.78, 0.80, 0.04, 0.1, 'mug')
cyl('coffee', -0.2, 0.78, 0.845, 0.035, 0.005, 'coffee')
for i in range(6):
    box('paper%d' % i, -1.6, 0.75 + 0.01 * i, 0.75 + 0.006 * i, -1.32, 1.1 + 0.01 * i, 0.756 + 0.006 * i, PAPER[i % 2 * 4])
phone('phone', -0.2, 1.0)
# corkboard on the inside of the front wall
box('cork', -0.45, 1.25, 0.80, 0.12, 1.27, 1.06, 'cork')
box('cork_frame', -0.46, 1.262, 0.79, 0.13, 1.272, 1.07, 'trim')
for i, (x, z, w, h) in enumerate([(-0.42, 0.95, 0.12, 0.09), (-0.27, 0.86, 0.10, 0.14), (-0.13, 0.97, 0.09, 0.07),
                                   (-0.02, 0.83, 0.12, 0.08), (-0.03, 0.95, 0.11, 0.09), (-0.40, 0.83, 0.08, 0.08)]):
    box('note%d' % i, x, 1.245, z, x + w, 1.25, z + h, PAPER[i % 5])
    box('pin%d' % i, x + w/2 - 0.006, 1.235, z + h - 0.02, x + w/2 + 0.006, 1.245, z + h - 0.008, 'red')
box('sticky', -1.02, 0.86, 1.10, -0.95, 0.87, 1.16, PAPER[1])
# a little screen glow on the desk (only used with the lights out)
col('glow')
bpy.ops.object.light_add(type='AREA', location=(-0.85, 0.78, 0.98), rotation=(math.radians(-80), 0, math.radians(25)))
L = bpy.context.object; L.name = 'crt_glow'; L.data.size = 0.3; L.data.energy = 4; L.data.color = (0.85, 0.9, 0.6)
col('base')

# the cubicle farm to the left of the corridor
for row in range(7):
    y = 1.3 + row * 2.4
    partition('row%d' % row, X0 + 0.4, y + 2.4, 0.2, y + 2.4)
    for c_, x in enumerate([-1.8, -4.2, -6.6]):
        partition('div%d_%d' % (row, c_), x, y + 0.3, x, y + 2.4)
        if random.random() < 0.7:
            box('desk%d_%d' % (row, c_), x + 0.05, y + 1.75, 0.72, x + 2.3, y + 2.35, 0.75, 'desk')
            crt('crt%d_%d' % (row, c_), x + 0.6 + random.random() * 1.0, y + 2.0, 0.75, 180 + random.uniform(-15, 15), on=False)
    partition('side%d' % row, 0.2, y + 1.2, 0.2, y + 2.4)

# corridor right wall: the floor-2 door frame, a water cooler, an extinguisher,
# the lab window, a second (always shut) door, and a dark doorway at the end
DOOR_Y = 3.4
box('doorframe', X1 - 0.03, DOOR_Y - 0.07, 0, X1, DOOR_Y + 1.02, 2.17, 'trim')
box('doorhole', X1 - 0.025, DOOR_Y, 0, X1 - 0.02, DOOR_Y + 0.95, 2.1, 'void')
box('cooler', X1 - 0.38, 5.2, 0, X1 - 0.06, 5.52, 1.0, 'plastic')
cyl('jug', X1 - 0.22, 5.36, 1.22, 0.14, 0.42, mat('jug', (0.12, 0.35, 0.75), 0.1), verts=12)
box('extinguisher', X1 - 0.16, 6.1, 1.0, X1 - 0.04, 6.22, 1.45, 'red')
LAB_Y = 12.2
box('labframe', X1 - 0.04, LAB_Y - 0.05, 0.85, X1, LAB_Y + 2.05, 2.05, 'trim')
box('labglass', X1 - 0.045, LAB_Y, 0.9, X1 - 0.04, LAB_Y + 2.0, 2.0, 'glass')
for i in range(12):
    box('slat%d' % i, X1 - 0.06, LAB_Y + 0.02, 0.95 + i * 0.087, X1 - 0.05, LAB_Y + 1.98, 0.98 + i * 0.087, 'blinds')
box('doorframe2', X1 - 0.03, 15.23, 0, X1, 16.32, 2.17, 'trim')
box('door2', X1 - 0.05, 15.3, 0, X1 - 0.02, 16.25, 2.1, 'door')
box('knob2', X1 - 0.09, 16.12, 1.0, X1 - 0.05, 16.16, 1.04, 'trim')
box('enddoor_frame', 0.95, Y1 - 0.03, 0, 1.95, Y1, 2.2, 'trim')
box('enddoor', 1.0, Y1 - 0.035, 0, 1.9, Y1 - 0.03, 2.15, 'void')
box('exit_sign', 1.25, Y1 - 0.05, 2.28, 1.65, Y1 - 0.01, 2.42, mat('exit', (0.05, 0.6, 0.1), 0.3, (0.05, 1.0, 0.15), 1.5))

# ceiling troffers (visual panels are base; the actual lights live in 'lights')
LAMPS = []
for x in (-7.0, -4.6, -2.2, 1.4):
    y = -1.7
    while y < Y1 - 1:
        plane('troffer', x, y, CEIL - 0.005, 0.6, 1.2, 'lamp', rot=(math.pi, 0, 0)); LAMPS.append((x, y))
        box('troffer_rim', x - 0.32, y - 0.62, CEIL - 0.004, x + 0.32, y + 0.62, CEIL, 'trim')
        y += 2.4
col('lights')
for lx, ly in LAMPS:   # (box/plane apply their transforms, so object locations are all at the origin)
    bpy.ops.object.light_add(type='AREA', location=(lx, ly, CEIL - 0.02))
    L = bpy.context.object; L.data.shape = 'RECTANGLE'; L.data.size = 0.6; L.data.size_y = 1.2
    L.data.energy = 30; L.data.color = (1.0, 0.97, 0.82)

# ======================= UPGRADE LAYERS =======================
# Break Room: vending machines and a coffee nook appear in the hallway alcove.
col('up_breakroom_1'); vending('vendA', 7.2, 'vend', 'vendlit')
col('up_breakroom_2'); vending('vendB', 8.15, 'vend2', 'vendlit')
col('up_breakroom_3')
box('counter', X1 - 0.55, 9.15, 0, X1 - 0.02, 10.2, 0.9, 'desk')
box('counter_top', X1 - 0.58, 9.13, 0.9, X1 - 0.02, 10.22, 0.94, 'trim')
box('coffeemaker', X1 - 0.4, 9.3, 0.94, X1 - 0.12, 9.57, 1.3, 'dark')
cyl('carafe', X1 - 0.3, 9.43, 1.03, 0.06, 0.15, 'coffee')
box('coffee_led', X1 - 0.41, 9.5, 1.2, X1 - 0.405, 9.53, 1.22, 'redled')
cyl('mug2', X1 - 0.3, 9.9, 0.99, 0.04, 0.1, PAPER[3])
cyl('mug3', X1 - 0.42, 10.0, 0.99, 0.04, 0.1, 'mug')
col('up_breakroom_4')
box('aid_box', X1 - 0.12, 9.45, 1.45, X1 - 0.01, 9.9, 1.85, PAPER[4])
box('aid_cross_v', X1 - 0.125, 9.65, 1.55, X1 - 0.12, 9.7, 1.75, 'red')
box('aid_cross_h', X1 - 0.125, 9.58, 1.625, X1 - 0.12, 9.77, 1.675, 'red')

# Dispatch Desk: more lines on your desk.
col('up_dispatch_1'); phone('phone2', -0.48, 1.03)
col('up_dispatch_2')
box('switchboard', -0.72, 0.95, 0.75, -0.5, 1.22, 0.9, 'plastic')
for i in range(6):
    box('sb_led%d' % i, -0.70 + i * 0.033, 0.945, 0.86, -0.685 + i * 0.033, 0.95, 0.875, ['green', 'amber', 'redled'][i % 3])
col('up_dispatch_3')
box('headset_band', -0.6, 0.85, 0.75, -0.58, 0.95, 0.77, 'dark')
cyl('headset_cup', -0.62, 0.86, 0.775, 0.035, 0.03, 'dark')
box('tray', 0.0, 0.82, 0.75, 0.17, 1.02, 0.79, 'dark')
for i in range(4):
    box('calllog%d' % i, 0.015, 0.835, 0.755 + 0.008 * i, 0.155, 1.005, 0.759 + 0.008 * i, PAPER[1 if i == 3 else 4])
col('up_dispatch_4'); phone('hotline', -0.02, 0.6 + 0.0, 'red')
box('hotline_led', 0.12, 0.6, 0.80, 0.14, 0.62, 0.82, 'redled')

# Radio Mast: the desk radio's antenna grows (exclusive: show the highest tier).
for t, h in enumerate((0.12, 0.2, 0.3, 0.42), 1):
    col('up_mast_%d' % t)
    box('radio%d' % t, 0.0, 1.05, 0.75, 0.17, 1.2, 0.86, 'dark')
    box('radio_dial%d' % t, 0.02, 1.045, 0.79, 0.09, 1.05, 0.83, 'amber')
    cyl('antenna%d' % t, 0.14, 1.15, 0.86 + h / 2, 0.004, h, 'steel', verts=6)
    if t >= 3: cyl('antenna_tip%d' % t, 0.14, 1.15, 0.86 + h, 0.012, 0.02, 'redled', verts=6)

# Security Desk: cameras and screens in the hallway.
col('up_security_1')
cyl('dome', 1.4, 5.0, CEIL - 0.06, 0.1, 0.12, 'glass', verts=12)
cyl('dome_base', 1.4, 5.0, CEIL - 0.01, 0.13, 0.02, 'plastic', verts=12)
col('up_security_2')
box('keypad', X1 - 0.04, DOOR_Y + 1.12, 1.2, X1 - 0.01, DOOR_Y + 1.27, 1.45, 'dark')
box('keypad_led', X1 - 0.045, DOOR_Y + 1.17, 1.4, X1 - 0.04, DOOR_Y + 1.22, 1.42, 'redled')
box('sign', X1 - 0.02, DOOR_Y + 0.15, 2.22, X1 - 0.01, DOOR_Y + 0.8, 2.38, PAPER[1])
col('up_security_3')
box('tv_arm', X1 - 0.25, 6.68, 2.35, X1 - 0.01, 6.72, 2.4, 'steel')
box('tv', X1 - 0.6, 6.45, 1.98, X1 - 0.22, 6.95, 2.36, 'dark')
box('tv_screen', X1 - 0.605, 6.5, 2.03, X1 - 0.6, 6.9, 2.31, 'static')
col('up_security_4')
cyl('dome2', -1.0, 4.5, CEIL - 0.06, 0.1, 0.12, 'glass', verts=12)
cyl('dome2_base', -1.0, 4.5, CEIL - 0.01, 0.13, 0.02, 'plastic', verts=12)
box('dome2_led', -1.02, 4.39, CEIL - 0.09, -0.98, 4.4, CEIL - 0.07, 'redled')

# Lab Benches: the lab behind the window lights up and fills with jars.
col('up_lab_1')
box('lab_lit', X1 - 0.049, LAB_Y, 0.9, X1 - 0.046, LAB_Y + 2.0, 2.0, 'labglow')
col('up_lab_2')
for i in range(3): cyl('jar%d' % i, X1 - 0.1, LAB_Y + 0.3 + i * 0.25, 1.0, 0.05, 0.14, 'jar', verts=8)
col('up_lab_3')
for i in range(4): cyl('jarb%d' % i, X1 - 0.1, LAB_Y + 1.05 + i * 0.25, 1.0, 0.05, 0.14, 'jar', verts=8)
col('up_lab_4')
cyl('bigjar', X1 - 0.12, LAB_Y + 1.0, 1.25, 0.09, 0.5, 'jar2', verts=10)

# ======================= STORY / HORROR LAYERS =======================
col('fx_door_closed')
box('door', X1 - 0.05, DOOR_Y, 0, X1 - 0.02, DOOR_Y + 0.95, 2.1, 'door')
box('knob', X1 - 0.09, DOOR_Y + 0.82, 1.0, X1 - 0.05, DOOR_Y + 0.86, 1.04, 'trim')
col('fx_door_open')   # floor 2: the door stands open onto a lit stairwell
box('door_lit', X1 - 0.022, DOOR_Y, 0, X1 - 0.018, DOOR_Y + 0.95, 2.1, 'roomlit')
box('door_open', X1 - 0.95, DOOR_Y - 0.04, 0, X1 - 0.05, DOOR_Y - 0.01, 2.1, 'door')
col('fx_figure')      # something at the end of the hall
def entity(name, x, y):
    """A gaunt, too-tall humanoid: a vertex skeleton grown into flesh with the
    Skin modifier, smoothed by subdivision and made lumpy by displacement."""
    J = {  # joint: (position, radius). Hunched forward, head hanging and tilted.
        'pelvis': ((0, 0.02, 1.16), 0.085), 'waist': ((0, 0.02, 1.36), 0.055), 'spine': ((0, -0.01, 1.56), 0.07),
        'chest': ((0, -0.07, 1.76), 0.1), 'neck': ((0.01, -0.15, 1.9), 0.032), 'neck2': ((0.03, -0.21, 1.97), 0.03),
        'jaw': ((0.05, -0.27, 1.95), 0.045), 'skull': ((0.08, -0.29, 2.05), 0.07), 'crown': ((0.11, -0.27, 2.16), 0.055),
        'hipL': ((-0.09, 0.02, 1.1), 0.06), 'thL': ((-0.1, 0.0, 0.86), 0.045), 'knL': ((-0.11, -0.05, 0.6), 0.04),
        'caL': ((-0.115, -0.01, 0.33), 0.03), 'anL': ((-0.12, 0.02, 0.07), 0.02), 'toL': ((-0.13, -0.15, 0.02), 0.018),
        'hipR': ((0.09, 0.02, 1.1), 0.06), 'thR': ((0.1, 0.01, 0.86), 0.045), 'knR': ((0.115, -0.02, 0.6), 0.04),
        'caR': ((0.12, 0.01, 0.33), 0.03), 'anR': ((0.13, 0.04, 0.07), 0.02), 'toR': ((0.15, -0.12, 0.02), 0.018),
    }
    E_ = [('pelvis', 'waist'), ('waist', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'neck2'), ('neck2', 'jaw'),
          ('jaw', 'skull'), ('skull', 'crown'),
          ('pelvis', 'hipL'), ('hipL', 'thL'), ('thL', 'knL'), ('knL', 'caL'), ('caL', 'anL'), ('anL', 'toL'),
          ('pelvis', 'hipR'), ('hipR', 'thR'), ('thR', 'knR'), ('knR', 'caR'), ('caR', 'anR'), ('anR', 'toR')]
    # arms far too long, hanging past the knees, with knobbly joints and tapering bones
    for side, sx, sway in (('L', -1, 0.0), ('R', 1, 0.03)):
        pts = [('sh', (sx * 0.19, -0.05, 1.84), 0.04), ('up', (sx * 0.23, -0.07, 1.6), 0.028),
               ('el', (sx * 0.25, -0.08, 1.34), 0.032), ('fa', (sx * 0.26, -0.1 - sway, 1.07), 0.022),
               ('wr', (sx * 0.26, -0.12 - sway, 0.8), 0.018), ('pa', (sx * 0.265, -0.14 - sway, 0.72), 0.026)]
        prev = 'chest'
        for k, p, r in pts:
            J[k + side] = (p, r); E_.append((prev, k + side)); prev = k + side
        w = J['pa' + side][0]
        for i, spread in enumerate((-0.025, -0.008, 0.01, 0.026)):
            ks = ['f%s%d_%d' % (side, i, j) for j in range(4)]
            long_ = 1.0 if i in (1, 2) else 0.8
            J[ks[0]] = ((w[0] + spread, w[1] - 0.01, w[2] - 0.06), 0.009)
            J[ks[1]] = ((w[0] + spread * 1.3, w[1] - 0.03, w[2] - 0.06 - 0.12 * long_), 0.008)
            J[ks[2]] = ((w[0] + spread * 1.5, w[1] - 0.03, w[2] - 0.06 - 0.24 * long_), 0.006)
            J[ks[3]] = ((w[0] + spread * 1.5, w[1] + 0.0, w[2] - 0.06 - 0.31 * long_), 0.004)
            E_ += [('pa' + side, ks[0]), (ks[0], ks[1]), (ks[1], ks[2]), (ks[2], ks[3])]
    keys = list(J)
    sm = mat('entity_skin', (0.34, 0.31, 0.28), 0.42)
    noisy(sm, 12, (0.14, 0.11, 0.11), 0.45, 0.75, bump=0.5)
    sm.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value = 0.15
    import mathutils
    V = mathutils.Vector
    # Body: metaballs, so ribs, joints and limbs melt into one starved body.
    mb = bpy.data.metaballs.new(name + '_flesh'); mb.resolution = 0.012; mb.render_resolution = 0.006; mb.threshold = 0.6
    hand = lambda k: k.startswith('f') and '_' in k   # finger joints: fL0_1 ...
    for k in keys:
        if hand(k): continue
        p, r = J[k]; e = mb.elements.new(); e.co = p; e.radius = r * 1.85; e.stiffness = 2.0
    for a_, b_ in E_:   # a string of overlapping balls along every bone
        if hand(a_) or hand(b_): continue
        pa, ra = V(J[a_][0]), J[a_][1]; pb, rb = V(J[b_][0]), J[b_][1]
        n = max(2, int((pb - pa).length / (0.5 * min(ra, rb))))
        for i in range(1, n):
            f = i / n; e = mb.elements.new(); e.co = pa.lerp(pb, f)
            e.radius = (ra + (rb - ra) * f) * 1.6; e.stiffness = 2.0
    for zz, w, dep in ((1.62, 0.13, 0.08), (1.72, 0.15, 0.09), (1.8, 0.15, 0.08)):   # ribcage
        e = mb.elements.new(type='ELLIPSOID'); e.co = (0, -0.06, zz); e.size_x = w / 0.16; e.size_y = dep / 0.16; e.size_z = 0.5; e.radius = 0.28; e.stiffness = 2.0
    e = mb.elements.new(type='ELLIPSOID'); e.co = (0.08, -0.3, 2.07); e.size_x = 0.6; e.size_y = 0.75; e.size_z = 1.0   # long skull
    e.radius = 0.15; e.rotation = mathutils.Euler((math.radians(-35), 0, math.radians(15))).to_quaternion()
    mo = bpy.data.objects.new(name + '_flesh', mb); bpy.context.collection.objects.link(mo)
    bpy.context.view_layer.objects.active = mo; bpy.ops.object.select_all(action='DESELECT'); mo.select_set(True)
    bpy.context.view_layer.update()
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active; o.name = name
    tex = bpy.data.textures.new(name + '_lumps', 'CLOUDS'); tex.noise_scale = 0.03
    d = o.modifiers.new('lumps', 'DISPLACE'); d.texture = tex; d.strength = 0.005; d.mid_level = 0.5
    o.data.materials.append(sm)
    for p in o.data.polygons: p.use_smooth = True
    # Hands: long fingers grown with the Skin modifier (metaballs would melt them together).
    hk = [k for k in keys if hand(k) or k.startswith('pa')]
    hm = bpy.data.meshes.new(name + '_hands')
    hm.from_pydata([J[k][0] for k in hk], [(hk.index(a_), hk.index(b_)) for a_, b_ in E_ if a_ in hk and b_ in hk], [])
    h = bpy.data.objects.new(name + '_hands', hm); bpy.context.collection.objects.link(h)
    h.modifiers.new('skin', 'SKIN')
    for i, k in enumerate(hk):
        sv = hm.skin_vertices[0].data[i]; sv.radius = (J[k][1], J[k][1]); sv.use_root = k.startswith('pa')
    h.modifiers.new('sub', 'SUBSURF').levels = 2
    h.data.materials.append(sm)
    for p in h.data.polygons: p.use_smooth = True
    # eyes: two small wet points, deep in the skull
    eyes = []
    for ex in (-0.035, 0.035):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.01, location=(0.085 + ex, -0.345, 2.05))
        e = bpy.context.object; e.data.materials.append(M['eyes']); eyes.append(e)
    import mathutils
    for p in [o, h] + eyes:
        p.matrix_world = mathutils.Matrix.Translation((x, y, 0)) @ mathutils.Matrix.Rotation(math.radians(8), 4, 'Z') @ p.matrix_world
    return o

entity('fig', 1.45, Y1 - 0.45)

sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
WBG = sc.world.node_tree.nodes['Background'].inputs['Color']; WBG.default_value = (0.03, 0.03, 0.025, 1)

# ---------- camera: sitting at our desk, turned a little toward the hallway ----------
bpy.ops.object.camera_add(location=(-0.5, -0.6, 1.18), rotation=(math.radians(90.5), 0, math.radians(-11)))
cam = bpy.context.object; cam.data.lens = 24; sc.camera = cam

# ---------- render setup ----------
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev; prefs.get_devices()
            if any(d.type == dev for d in prefs.devices): break
        except TypeError: pass
    for d in prefs.devices: d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed, CPU', e)
sc.cycles.samples = 160
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
try: sc.view_settings.view_transform = 'Standard'
except TypeError: pass
sc.view_settings.exposure = -0.6
sc.render.image_settings.color_mode = 'RGBA'

# ---------- meta: where things are on screen, for clicks and the CRT zoom ----------
import json
from bpy_extras.object_utils import world_to_camera_view
bpy.context.view_layer.update()
def screen_pts(objs):
    pts = []
    for o in objs:
        if o.type != 'MESH': continue
        for v in o.data.vertices:
            p = world_to_camera_view(sc, cam, o.matrix_world @ v.co)
            pts.append((round(p.x, 4), round(1 - p.y, 4)))
    return pts
def bbox(objs):
    p = screen_pts(objs); xs = [a for a, _ in p]; ys = [b for _, b in p]
    return [max(0, min(xs)), max(0, min(ys)), min(1, max(xs)), min(1, max(ys))]
scr = bpy.data.objects['my_crt_scr']
corners = [tuple(round(c, 4) for c in (lambda p: (p.x, 1 - p.y))(world_to_camera_view(sc, cam, scr.matrix_world @ v.co))) for v in scr.data.vertices]
cols = [c.name for c in bpy.data.collections]
meta = {'size': [1280, 720], 'crt': corners,
        'hot': {c: bbox(bpy.data.collections[c].objects) for c in cols if c.startswith(('up_', 'fx_'))}}
meta['hot']['phone'] = bbox([bpy.data.objects['phone'], bpy.data.objects['phone_rx']])
meta['hot']['door'] = bbox([bpy.data.objects['doorframe']])
meta['hot']['hall_end'] = bbox([bpy.data.objects['enddoor_frame']])
LD = os.path.join(OUT, 'layers'); os.makedirs(LD, exist_ok=True)
json.dump(meta, open(os.path.join(LD, 'meta.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'office.blend'))

# ---------- render passes (skipped when walk.py only wants the scene) ----------
if not globals().get('SCENE_ONLY'):
    def lc(name): return bpy.context.view_layer.layer_collection.children[name]
    def setup(visible, holdout=(), transparent=False):
        for c in cols:
            l = lc(c); l.exclude = c not in visible and c not in holdout; l.holdout = c in holdout
        sc.render.film_transparent = transparent
    def lights(on):
        M['lamp'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 6.0 if on else 0.0
        WBG.default_value = (0.03, 0.03, 0.025, 1) if on else (0.004, 0.005, 0.006, 1)
    def render(name):
        if ONLY and name not in ONLY: return
        sc.render.filepath = os.path.join(LD, name + '.png')
        bpy.ops.render.render(write_still=True); print('RENDERED', name)

    if 'closeup' in ONLY:   # review shot of the hall entity
        import mathutils
        bpy.ops.object.camera_add(location=(1.0, Y1 - 4.2, 1.5))
        cu = bpy.context.object; cu.data.lens = 40
        d = mathutils.Vector((1.45, Y1 - 0.45, 1.35)) - cu.location
        cu.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.camera = cu; lights(True); setup({'base', 'lights', 'fx_door_closed', 'fx_figure'}); render('closeup'); sc.camera = cam
    lights(True); setup({'base', 'lights', 'fx_door_closed'}); render('base')
    lights(False); setup({'base', 'glow', 'fx_door_closed'}); render('dark')
    lights(True)
    for c in cols:
        if c.startswith(('up_', 'fx_')):
            setup({c, 'lights'}, holdout={'base'}, transparent=True); render(c)
    print('ALLDONE')
