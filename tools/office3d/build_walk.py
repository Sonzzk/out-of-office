# Turn walk.py's output into the game's assets: public/walk/*.json (glTF) and the
# lightmaps as JPEG, downsized (the game renders at 320x180, so 2048 is plenty).
#   python3 build_walk.py <walk.py outdir>/walk <repo>/public/walk
import base64, json, os, struct, sys
from PIL import Image


def glb_to_json(src, dst):
    """Artifacts don't serve .glb, so ship plain glTF JSON with the buffer embedded."""
    data = open(src, 'rb').read()
    n = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + n])
    binlen = struct.unpack_from('<I', data, 20 + n)[0]
    blob = data[28 + n:28 + n + binlen]
    gltf['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(blob).decode()
    json.dump(gltf, open(dst, 'w'), separators=(',', ':'))

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name, size in (('base', 2048), ('dark', 1024), ('props', 1024)):
    im = Image.open(os.path.join(src, name + '.png')).convert('RGB')
    im.resize((size, size), Image.LANCZOS).save(os.path.join(dst, name + '.jpg'), quality=86, optimize=True)
for name in ('office', 'figure'):
    glb_to_json(os.path.join(src, name + '.glb'), os.path.join(dst, name + '.json'))
for f in sorted(os.listdir(dst)):
    print(f, os.path.getsize(os.path.join(dst, f)) // 1024, 'KB')
