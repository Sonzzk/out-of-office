// Walking around the office: the same Blender scene as the still view, as
// real-time 3D. The Cycles lighting is baked into texture atlases
// (tools/office3d/walk.py), so the meshes only need unlit materials; the frame
// renders at 320x180 and goes through the same palette dither as the still.
//
// Loaded on demand from office3d.ts when you stand up from the desk. WASD or
// the arrows and the mouse on a computer, a left-thumb stick and right-thumb
// look on a phone. Walk back to the CRT and press E (or tap) to sit down.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OFFICE_PALETTE } from "../data/office3d";
import { tier } from "../sim/facilities";
import { officeLayers } from "../sim/officeRoom";
import { has } from "../sim/projects";
import type { GameState } from "../sim/state";
import { humFlicker, isCalm, sfx } from "./audio";

const W = 320;
const H = 180;
const EYE = 1.6; // standing eye height, metres
const RADIUS = 0.25;
const SPEED = 1.5; // a tired office walk, m/s
const SAT = 1.2;

export type WalkHooks = {
  state: () => GameState;
  unease: () => number;
  figure: () => boolean;
  setFigure: (on: boolean) => void;
  toast: (title: string, text: string) => void;
  sitDown: () => void;
  leave: () => void;
};

// Blender is Z-up, glTF is Y-up: blender (x, y, z) -> three (x, z, -y).
const B = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

/** Things you can use, by where they stand in the Blender scene. */
type Spot = { id: string; at: THREE.Vector3; reach: number; label: string; ok?: () => boolean };

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let target: THREE.WebGLRenderTarget;
let post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
let meshes = new Map<string, THREE.Mesh>();
let solids: THREE.Object3D[] = [];
let figureObj: THREE.Object3D | undefined;
let atlases: Record<string, THREE.Texture> = {};
let lightsOn = true;
let ready: Promise<void> | undefined;

let host: HTMLElement | undefined;
let hint: HTMLElement;
let stick: HTMLElement;
let hooks: WalkHooks;
let running = false;
let yaw = 0;
let pitch = 0;
let last = 0;
let stepT = 0;
let staredAt = 0;
let unseenFor = 0;
const keys = new Set<string>();
const move = { x: 0, y: 0 }; // touch stick, -1..1
let focus: Spot | undefined;

const spots: Spot[] = [
  { id: "crt", at: B(-0.95, 0.95, 0.95), reach: 1.3, label: "Sit down" },
  { id: "vending", at: B(2.2, 7.6, 1.1), reach: 1.4, label: "Buy a can", ok: () => tier(hooks.state(), "breakroom") >= 1 },
  { id: "door", at: B(2.55, 3.9, 1.1), reach: 1.4, label: "Try the door" },
  { id: "phone", at: B(-0.11, 1.1, 0.8), reach: 1.2, label: "Pick up the phone" },
  { id: "cooler", at: B(2.38, 5.36, 1.0), reach: 1.2, label: "Water cooler" },
  { id: "lab", at: B(2.55, 13.2, 1.4), reach: 1.6, label: "Look through the blinds", ok: () => tier(hooks.state(), "lab") >= 1 },
  { id: "end", at: B(1.45, 18, 1.1), reach: 1.5, label: "The dark doorway" },
];

function load(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const tex = new THREE.TextureLoader();
    const gl = new GLTFLoader();
    const atlas = (n: string) =>
      tex.loadAsync(`./walk/${n}.jpg`).then((t) => {
        t.flipY = false; // glTF UVs
        t.colorSpace = THREE.NoColorSpace; // keep the baked sRGB values as they are, like the still
        t.anisotropy = 4;
        atlases[n] = t;
      });
    const [office, fig] = await Promise.all([
      gl.loadAsync("./walk/office.glb"),
      gl.loadAsync("./walk/figure.glb"),
      atlas("base"),
      atlas("dark"),
      atlas("props"),
    ]);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070605);
    scene.fog = new THREE.Fog(0x0d0b07, 6, 22);
    office.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.material = new THREE.MeshBasicMaterial({ map: o.name === "base" ? atlases.base : atlases.props, fog: true });
      meshes.set(o.name, o);
    });
    scene.add(office.scene);
    solids = [...meshes.values()];
    figureObj = fig.scene;
    figureObj.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = new THREE.MeshLambertMaterial({ color: 0x9a8f80, fog: true });
    });
    scene.add(figureObj);
    scene.add(new THREE.HemisphereLight(0xfff1c8, 0x2a2416, 1.6));
    const tube = new THREE.PointLight(0xfff4d0, 6, 6, 1.5);
    tube.position.copy(B(1.4, 16.3, 2.6));
    scene.add(tube);
  })();
  return ready;
}

function makePost(): void {
  const pal = [];
  for (let i = 0; i < OFFICE_PALETTE.length; i += 3)
    pal.push(new THREE.Vector3(OFFICE_PALETTE[i] / 255, OFFICE_PALETTE[i + 1] / 255, OFFICE_PALETTE[i + 2] / 255));
  const mat = new THREE.ShaderMaterial({
    uniforms: { frame: { value: target.texture }, pal: { value: pal }, gain: { value: 1 } },
    vertexShader: `varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      uniform sampler2D frame; uniform vec3 pal[${pal.length}]; uniform float gain; varying vec2 v;
      float bayer(vec2 p){ int x = int(mod(p.x, 4.)), y = int(mod(p.y, 4.));
        int i = y * 4 + x; float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
        for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16. - .5; return 0.; }
      void main(){
        vec3 c = texture2D(frame, v).rgb * gain;
        float l = dot(c, vec3(.3, .59, .11));
        float d = min(1., length((v - .5) * 2.) / 1.414);
        c = (vec3(l) + (c - l) * ${SAT.toFixed(2)}) * 1.04 * (1. - .45 * pow(d, 1.8));
        c = clamp(c + bayer(gl_FragCoord.xy) * 22. / 255., 0., 1.);
        vec3 best = pal[0]; float bd = 1e9;
        for (int k = 0; k < ${pal.length}; k++) { vec3 e = (c - pal[k]) * vec3(.548, .768, .332); float dd = dot(e, e);
          if (dd < bd) { bd = dd; best = pal[k]; } }
        gl_FragColor = vec4(best, 1.);
      }`,
  });
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  post = { scene: s, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
}

/** Show the props the company has paid for, hide the rest. */
function syncProps(): void {
  const s = hooks.state();
  const want = new Set(officeLayers(s, {}));
  for (const [name, m] of meshes) if (name !== "base") m.visible = want.has(name);
  if (figureObj) figureObj.visible = hooks.figure() && !isCalm();
  const base = meshes.get("base");
  if (base) (base.material as THREE.MeshBasicMaterial).map = lightsOn ? atlases.base : atlases.dark;
  for (const [name, m] of meshes)
    if (name !== "base") (m.material as THREE.MeshBasicMaterial).color.setScalar(lightsOn ? 1 : 0.12);
  scene.fog = new THREE.Fog(lightsOn ? 0x0d0b07 : 0x010101, lightsOn ? 6 : 1, lightsOn ? 22 : 9);
}

const ray = new THREE.Raycaster();
/** Can you move from p along d (unit, horizontal) by len without walking into anything? */
function blocked(p: THREE.Vector3, d: THREE.Vector3, len: number): boolean {
  for (const h of [0.3, 0.74, 1.05, 1.5]) {
    ray.set(new THREE.Vector3(p.x, h, p.z), d);
    ray.far = len + RADIUS;
    if (ray.intersectObjects(solids, false).length) return true;
  }
  return false;
}

function step(dt: number): void {
  const f = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0) + -move.y;
  const r = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + move.x;
  if (keys.has("arrowleft")) yaw += dt * 1.8;
  if (keys.has("arrowright")) yaw -= dt * 1.8;
  const p = camera.position;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const v = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
  const len = Math.min(1, v.length());
  if (len > 0.05) {
    v.normalize();
    const dist = len * SPEED * dt;
    // slide along walls: try the move whole, then each axis on its own
    for (const d of [v, new THREE.Vector3(Math.sign(v.x), 0, 0), new THREE.Vector3(0, 0, Math.sign(v.z))]) {
      if (!d.lengthSq()) continue;
      const s = d === v ? dist : dist * Math.abs(d.x ? v.x : v.z);
      if (!blocked(p, d, s)) {
        p.addScaledVector(d, s);
        break;
      }
    }
    stepT += dist;
    if (stepT > 0.7) (stepT = 0), sfx("step", { gain: 0.25 });
    p.y = EYE + Math.sin(stepT / 0.7 * Math.PI * 2) * 0.012; // a little bob
  }
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

/** The thing at the end of the hall: it goes when you look at it too long or walk up to it,
 *  and while your back is turned it comes a little closer. */
function haunt(dt: number): void {
  if (figureObj) figureObj.visible = hooks.figure() && !isCalm();
  if (!figureObj || !figureObj.visible) {
    staredAt = unseenFor = 0;
    return;
  }
  const at = new THREE.Vector3(1.45, 1.4, -17.55).add(figureObj.position);
  const to = at.clone().sub(camera.position);
  const dist = to.length();
  const seen = to.normalize().dot(camera.getWorldDirection(new THREE.Vector3())) > 0.85;
  staredAt = seen ? staredAt + dt : 0;
  unseenFor = seen ? 0 : unseenFor + dt;
  if (dist < 4 || staredAt > 2.5) {
    vanish();
    return;
  }
  if (unseenFor > 6 && hooks.unease() >= 0.5) {
    unseenFor = 0;
    const toward = camera.position.clone().sub(at).setY(0).normalize().multiplyScalar(1.6);
    figureObj.position.add(toward);
    sfx("far-steps", { gain: 0.5 });
  }
}

function vanish(): void {
  staredAt = 0;
  sfx("thump");
  flicker(900, () => {
    hooks.setFigure(false);
    if (figureObj) figureObj.position.set(0, 0, 0);
  });
}

function flicker(ms: number, after?: () => void): void {
  humFlicker(Math.min(400, ms));
  sfx("buzz");
  let t = 0;
  const steps = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < steps; i++) {
    const on = i % 2 === 1;
    setTimeout(() => ((lightsOn = on), syncProps()), t);
    t += 40 + Math.random() * 120;
  }
  setTimeout(() => ((lightsOn = false), after?.(), syncProps()), t);
  setTimeout(() => ((lightsOn = true), syncProps()), t + ms);
}

function nearest(): Spot | undefined {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  let best: Spot | undefined, bd = Infinity;
  for (const s of spots) {
    if (s.ok && !s.ok()) continue;
    const to = s.at.clone().sub(camera.position);
    const d = Math.hypot(to.x, to.z);
    if (d > s.reach || to.normalize().dot(dir) < 0.75) continue;
    if (d < bd) (bd = d), (best = s);
  }
  return best;
}

function use(s: Spot | undefined): void {
  if (!s) return;
  const u = hooks.unease();
  const st = hooks.state();
  if (s.id === "crt") return stop(true);
  if (s.id === "vending") (sfx("clunk"), hooks.toast("Break Room", u > 0.6 ? "Something drops in the machine. It is warm." : "The machine takes your coin and keeps it."));
  if (s.id === "door") {
    if (has(st, "floor2")) hooks.toast("Floor 2", "The stairs go up further than the building does.");
    else (sfx("knock", { gain: 0.5 }), hooks.toast("Locked", u > 0.5 ? "You knock. Something knocks back, a moment too late." : "FLOOR 2: AUTHORISED STAFF ONLY."));
  }
  if (s.id === "phone") hooks.toast("Desk phone", "Dial tone. Crews call through the desktop, not this.");
  if (s.id === "cooler") (sfx("squelch", { gain: 0.3 }), hooks.toast("Water cooler", u > 0.5 ? "The water tastes faintly of almonds." : "Glug. The jug has been full since 1994."));
  if (s.id === "lab") hooks.toast("Lab", "Through the blinds: jars, humming. One of them turns to face you.");
  if (s.id === "end") (sfx("far-steps", { gain: 0.6 }), hooks.toast("Exit", u > 0.5 ? "The doorway is darker the closer you get. You step back." : "EXIT. It does not open from this side."));
}

function frame(now: number): void {
  if (!running || !renderer) return;
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  step(dt);
  haunt(dt);
  const f = nearest();
  if (f !== focus) {
    focus = f;
    hint.textContent = f ? `${matchMedia("(pointer: coarse)").matches ? "Tap" : "E"}: ${f.label}` : "";
    hint.hidden = !f;
  }
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(post.scene, post.cam);
  requestAnimationFrame(frame);
}

// --- input -------------------------------------------------------------------
const onKey = (e: KeyboardEvent) => {
  if (!running) return;
  const k = e.key.toLowerCase();
  if (e.type === "keydown") {
    if (k === "e" || k === "enter") (e.preventDefault(), use(focus));
    if (k === "escape" && !document.pointerLockElement) stop(false);
    keys.add(k);
  } else keys.delete(k);
};
const onMouse = (e: MouseEvent) => {
  if (!running || document.pointerLockElement !== renderer?.domElement) return;
  yaw -= e.movementX * 0.0025;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.0025));
};
let lookTouch = -1, moveTouch = -1, lx = 0, ly = 0, mx = 0, my = 0;
function onTouch(e: TouchEvent): void {
  if (!running || !host) return;
  e.preventDefault();
  const r = host.getBoundingClientRect();
  for (const t of Array.from(e.changedTouches)) {
    if (e.type === "touchstart") {
      if (t.clientX < r.left + r.width / 2 && moveTouch < 0) {
        moveTouch = t.identifier, mx = t.clientX, my = t.clientY;
        stick.hidden = false;
        stick.style.left = `${mx - r.left}px`;
        stick.style.top = `${my - r.top}px`;
      } else if (lookTouch < 0) (lookTouch = t.identifier), (lx = t.clientX), (ly = t.clientY);
    } else if (e.type === "touchmove") {
      if (t.identifier === moveTouch) {
        move.x = Math.max(-1, Math.min(1, (t.clientX - mx) / 50));
        move.y = Math.max(-1, Math.min(1, (t.clientY - my) / 50));
      } else if (t.identifier === lookTouch) {
        yaw -= (t.clientX - lx) * 0.006;
        pitch = Math.max(-1.2, Math.min(1.2, pitch - (t.clientY - ly) * 0.006));
        (lx = t.clientX), (ly = t.clientY);
      }
    } else {
      if (t.identifier === moveTouch) (moveTouch = -1), (move.x = move.y = 0), (stick.hidden = true);
      if (t.identifier === lookTouch) lookTouch = -1;
    }
  }
}

/** Stand up from the desk. Resolves once the office is on screen. */
export async function startWalk(parent: HTMLElement, h: WalkHooks): Promise<void> {
  hooks = h;
  await load();
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the dither works on the baked sRGB values directly
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    target = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.NoColorSpace });
    camera = new THREE.PerspectiveCamera(62, W / H, 0.05, 40);
    makePost();
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKey);
    addEventListener("mousemove", onMouse);
  }
  host = document.createElement("div");
  host.className = "walk";
  host.innerHTML = `<div class="walk-hint" hidden></div><div class="walk-stick" hidden></div>
    <div class="walk-help">${matchMedia("(pointer: coarse)").matches ? "Left thumb: walk · Right thumb: look" : "Click to look around · WASD to walk · Esc to sit back down"}</div>`;
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "The office, walking. Walk back to your desk to sit down.");
  hint = host.querySelector(".walk-hint")!;
  stick = host.querySelector(".walk-stick")!;
  parent.appendChild(host);
  renderer.domElement.addEventListener("click", () => {
    if (matchMedia("(pointer: coarse)").matches) return;
    if (document.pointerLockElement !== renderer!.domElement) void renderer!.domElement.requestPointerLock?.();
    else use(focus);
  });
  hint.addEventListener("click", () => use(focus));
  for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) host.addEventListener(t, onTouch as EventListener, { passive: false });
  hint.addEventListener("touchend", (e) => (e.stopPropagation(), use(focus)));
  // Stand up where the still camera sits, facing the same way.
  camera.position.copy(B(-0.5, -0.6, EYE));
  yaw = (-11 * Math.PI) / 180;
  pitch = -0.08;
  lightsOn = true;
  keys.clear();
  syncProps();
  running = true;
  last = 0;
  sfx("step", { gain: 0.3 });
  requestAnimationFrame(frame);
}

/** Leave walking. `sit` goes straight to the desktop, otherwise back to the still view. */
export function stop(sit: boolean): void {
  if (!running) return;
  running = false;
  if (document.pointerLockElement) document.exitPointerLock();
  host?.remove();
  host = undefined;
  hooks.leave();
  if (sit) hooks.sitDown();
}

export const walking = () => running;

/** Test hooks: place the player, force the figure, read where things are. */
export function debugWalk(opts: { at?: [number, number]; yaw?: number; figure?: boolean; lights?: boolean; keys?: string[] } = {}) {
  if (opts.at) camera.position.copy(B(opts.at[0], opts.at[1], EYE));
  if (opts.yaw !== undefined) yaw = (opts.yaw * Math.PI) / 180;
  if (opts.figure !== undefined) hooks.setFigure(opts.figure);
  if (opts.lights !== undefined) lightsOn = opts.lights;
  if (opts.keys) (keys.clear(), opts.keys.forEach((k) => keys.add(k)));
  if (renderer) syncProps();
  const p = camera?.position;
  return {
    running,
    at: p ? [+p.x.toFixed(2), +(-p.z).toFixed(2)] : null,
    focus: focus?.id ?? null,
    figure: !!figureObj?.visible,
    props: [...meshes].filter(([, m]) => m.visible).map(([n]) => n),
  };
}
