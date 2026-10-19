# The office view, from Blender

The room you see before you sit at the desktop (`src/ui/office3d.ts`) is a
Blender scene built by a script, rendered as layers, and shipped as small PNGs.

1. Render (Blender 5.1, Cycles): put `office.py` and `crt-desktop.png` in one
   folder and run
   `blender --background --factory-startup --python office.py -- <folder> [layer ...]`.
   With no layer names it renders everything into `<folder>/layers/`:
   `base` (lights on), `dark` (lights out), one transparent PNG per upgrade
   tier (`up_<upgrade>_<tier>`) and story prop (`fx_*`), plus `meta.json`
   (where the CRT and each prop sit on screen). `closeup` renders a review
   shot of the hall entity.
2. Build: `python3 build_assets.py <folder>/layers <repo>` writes
   `public/office/*.png` (640x360) and `src/data/office3d.ts` (positions and
   the 96-colour dither palette).
3. Watch live: open `office.blend` with `--python live_view.py` and the
   Blender window reloads every time the build script saves.

Room props are low poly on purpose. Entities are not: they are sculpted from
metaballs with skin-modifier fingers and displacement.

## Walking the office

`walk.py` builds the same scene and bakes its Cycles lighting into atlases, so
the game can show it in real-time 3D (`src/ui/walk3d.ts`, three.js, loaded only
when you press **Stand up**):

    blender --background --factory-startup --python walk.py -- <outdir> [atlas size] [samples]
    python3 build_walk.py <outdir>/walk ../../public/walk   (glb -> glTF JSON, lightmaps -> JPEG)

It writes `office.glb` (one mesh per collection: `base`, every `up_*` tier and
both `fx_door_*` states), the lightmaps `base` (lights on), `dark` (lights out)
and `props` (all upgrade props), and `figure.glb` (the hall entity, full detail).
At 4096 / 256 samples the bake takes about 13 minutes on the RTX 3060.
