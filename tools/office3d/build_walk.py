# Turn walk.py's output into the game's assets: public/walk/*.glb and the
# lightmaps as JPEG, downsized (the game renders at 320x180, so 2048 is plenty).
#   python3 build_walk.py <walk.py outdir>/walk <repo>/public/walk
import os, shutil, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name, size in (('base', 2048), ('dark', 1024), ('props', 1024)):
    im = Image.open(os.path.join(src, name + '.png')).convert('RGB')
    im.resize((size, size), Image.LANCZOS).save(os.path.join(dst, name + '.jpg'), quality=86, optimize=True)
for name in ('office.glb', 'figure.glb'):
    shutil.copy(os.path.join(src, name), os.path.join(dst, name))
for f in sorted(os.listdir(dst)):
    print(f, os.path.getsize(os.path.join(dst, f)) // 1024, 'KB')
