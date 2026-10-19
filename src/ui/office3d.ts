// The office around your desk: a pre-rendered first-person view of your
// cubicle and the hallway (rendered in Blender, see backrooms-sim/3d-office),
// composited from layers so bought upgrades appear in the room, and dithered
// live so it matches the pixel art. Click the CRT to sit down at the Win95
// desktop; "Look up" on the taskbar brings the room back.
//
// The room also carries the horror: tubes that flicker and die, footsteps in
// the hall, knocking on the door, a phone ringing in an empty cubicle, and,
// as the infection grows, something standing at the end of the hall.

import { OFFICE_CRT, OFFICE_HOT, OFFICE_LAYERS, OFFICE_PALETTE } from "../data/office3d";
import { tier } from "../sim/facilities";
import { officeLayers } from "../sim/officeRoom";
import { has } from "../sim/projects";
import type { GameState } from "../sim/state";
import { game, onChange } from "../store";
import { humFlicker, isCalm, sfx } from "./audio";
import { notify } from "./uncanny";

const FW = 640; // composited frame (the size the layers ship at)
const FH = 360;
const W = 320; // dithered frame on screen
const H = 180;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const DITHER = 22;
const SAT = 1.2; // colour boost, matched in build_assets.py

type Mode = "room" | "desk" | "walk";
let mode: Mode = "desk";
let root: HTMLElement;
let view: HTMLCanvasElement;
let hint: HTMLElement;
let stand: HTMLButtonElement;
let desk: HTMLElement;
let unease = 0.15; // 0.15 (fresh) .. 1 (fully infected), same scale as the desktop
let lightsOn = true;
let figure = false; // something is standing at the end of the hall
let busy = false; // mid zoom
const images = new Map<string, HTMLImageElement>();
let loaded = false;

const frame = document.createElement("canvas");
frame.width = FW;
frame.height = FH;
const fctx = frame.getContext("2d", { willReadFrequently: true })!;
const small = document.createElement("canvas");
small.width = W;
small.height = H;
const sctx = small.getContext("2d", { willReadFrequently: true })!;

// Nearest palette colour for every 5-bit-per-channel RGB, built once.
const LUT = new Uint8Array(32 * 32 * 32);
{
  const n = OFFICE_PALETTE.length / 3;
  for (let i = 0; i < LUT.length; i++) {
    const r = ((i >> 10) << 3) + 4, g = (((i >> 5) & 31) << 3) + 4, b = ((i & 31) << 3) + 4;
    let best = 0, bd = Infinity;
    for (let p = 0; p < n; p++) {
      const dr = r - OFFICE_PALETTE[p * 3], dg = g - OFFICE_PALETTE[p * 3 + 1], db = b - OFFICE_PALETTE[p * 3 + 2];
      const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (d < bd) (bd = d), (best = p);
    }
    LUT[i] = best;
  }
}
// Darker corners, like the stylize pass on the rest of the art.
const VIGNETTE = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const d = Math.min(1, Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) / 1.414);
    VIGNETTE[y * W + x] = 1 - 0.45 * d ** 1.8;
  }

function load(name: string): Promise<void> {
  return new Promise((done) => {
    const img = new Image();
    img.onload = img.onerror = () => done();
    img.src = `./office/${name}.png`;
    images.set(name, img);
  });
}

let lastKey = "";
function draw(force = false): void {
  if (!loaded || !view) return;
  const layers = officeLayers(game() ?? stateRef, { figure });
  const key = `${lightsOn}|${layers.join(",")}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  const ok = (n: string) => images.get(n)?.complete && images.get(n)!.naturalWidth > 0;
  fctx.globalAlpha = 1;
  if (ok(lightsOn ? "base" : "dark")) fctx.drawImage(images.get(lightsOn ? "base" : "dark")!, 0, 0, FW, FH);
  for (const n of layers) {
    if (!ok(n)) continue;
    // With the lights out the props sink into the dark; the thing in the hall stays a pale shape.
    fctx.globalAlpha = lightsOn ? 1 : n === "fx_figure" ? 0.3 : 0.12;
    fctx.drawImage(images.get(n)!, 0, 0, FW, FH);
  }
  fctx.globalAlpha = 1;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(frame, 0, 0, W, H);
  const img = sctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0, i = 0; y < H; y++)
    for (let x = 0; x < W; x++, i += 4) {
      const v = VIGNETTE[y * W + x];
      const t = BAYER[(y & 3) * 4 + (x & 3)] * DITHER;
      // a little more of the Backrooms yellow, then darker corners and the ordered dither
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      const r = Math.max(0, Math.min(255, (l + (d[i] - l) * SAT) * 1.04 * v + t));
      const g = Math.max(0, Math.min(255, (l + (d[i + 1] - l) * SAT) * 1.04 * v + t));
      const b = Math.max(0, Math.min(255, (l + (d[i + 2] - l) * SAT) * 1.04 * v + t));
      const p = LUT[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)] * 3;
      d[i] = OFFICE_PALETTE[p];
      d[i + 1] = OFFICE_PALETTE[p + 1];
      d[i + 2] = OFFICE_PALETTE[p + 2];
    }
  view.getContext("2d")!.putImageData(img, 0, 0);
}

let stateRef: GameState;

/** Where the 16:9 frame sits inside the view element (cover, or contain on tall screens). */
function frameRect(): { x: number; y: number; w: number; h: number } {
  const r = view.getBoundingClientRect();
  const tall = r.height > r.width;
  const s = tall ? Math.min(r.width / 16, r.height / 9) : Math.max(r.width / 16, r.height / 9);
  const w = 16 * s, h = 9 * s;
  return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
}

function crtBox(): [number, number, number, number] {
  const xs = OFFICE_CRT.map((p) => p[0]), ys = OFFICE_CRT.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

type Hot = { id: string; box: [number, number, number, number]; act: () => void };
function hotspots(): Hot[] {
  const s = game() ?? stateRef;
  const list: Hot[] = [{ id: "crt", box: crtBox(), act: sitDown }];
  if (figure && lightsOn) list.push({ id: "figure", box: pad(OFFICE_HOT.fx_figure, 0.01), act: stare });
  if (tier(s, "breakroom") >= 1)
    list.push({ id: "vending", box: OFFICE_HOT[tier(s, "breakroom") >= 2 ? "up_breakroom_2" : "up_breakroom_1"], act: vend });
  list.push({ id: "door", box: OFFICE_HOT.door, act: door });
  list.push({ id: "phone", box: pad(OFFICE_HOT.phone, 0.01), act: phone });
  return list;
}
const pad = (b: [number, number, number, number], p: number): [number, number, number, number] => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];

function hit(e: MouseEvent): Hot | undefined {
  const f = frameRect();
  const x = (e.clientX - f.x) / f.w, y = (e.clientY - f.y) / f.h;
  return hotspots().find((h) => x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3]);
}

const toast = (title: string, text: string) => notify(root, "./art/icons/U-warning.png", title, text, 6000);

function vend(): void {
  sfx("clunk");
  toast("Break Room", unease > 0.6 ? "Something drops in the machine. It is warm." : "The machine takes your coin and keeps it.");
}
function door(): void {
  const s = game() ?? stateRef;
  if (has(s, "floor2")) toast("Floor 2", "The stairwell light is on. Nobody remembers installing it.");
  else {
    sfx("knock", { pan: 0.6, gain: 0.5 });
    toast("Locked", unease > 0.5 ? "You knock. Something knocks back, a moment too late." : "FLOOR 2: AUTHORISED STAFF ONLY.");
  }
}
function phone(): void {
  toast("Desk phone", "Dial tone. Crews call through the desktop, not this.");
}
function stare(): void {
  sfx("thump");
  flicker(900, () => (figure = false));
}

/** The tubes stutter, then settle. `after` runs while the room is dark. */
function flicker(ms: number, after?: () => void): void {
  humFlicker(Math.min(400, ms));
  sfx("buzz");
  const steps = 3 + Math.floor(Math.random() * 4);
  let t = 0;
  for (let i = 0; i < steps; i++) {
    const on = i % 2 === 1;
    setTimeout(() => {
      lightsOn = on;
      draw();
    }, t);
    t += 40 + Math.random() * 120;
  }
  setTimeout(() => {
    lightsOn = false;
    after?.();
    draw();
  }, t);
  setTimeout(() => {
    lightsOn = true;
    draw();
  }, t + ms);
}

function sitDown(): void {
  if (busy || mode === "desk") return;
  busy = true;
  sfx("click");
  const f = frameRect(), r = view.getBoundingClientRect(), b = crtBox();
  const cx = f.x - r.left + ((b[0] + b[2]) / 2) * f.w, cy = f.y - r.top + ((b[1] + b[3]) / 2) * f.h;
  const scale = r.width / ((b[2] - b[0]) * f.w);
  view.style.transformOrigin = `${cx}px ${cy}px`;
  view.style.transition = "transform .7s cubic-bezier(.6,0,.9,.5)";
  view.style.transform = `scale(${scale.toFixed(2)})`;
  hint.hidden = true;
  setTimeout(() => {
    root.classList.add("gone");
  }, 450);
  setTimeout(() => {
    root.hidden = true;
    root.classList.remove("gone");
    view.style.transition = "none";
    view.style.transform = "none";
    mode = "desk";
    busy = false;
    desk.querySelector<HTMLElement>(".start")?.focus({ preventScroll: true });
  }, 800);
}

/** Get up from the desk and walk the office in real-time 3D (walk3d.ts, loaded on first use). */
async function standUp(): Promise<void> {
  if (busy || mode !== "room") return;
  busy = true;
  stand.textContent = "Standing up...";
  try {
    const walk = await import("./walk3d");
    walkDebug = walk.debugWalk;
    await walk.startWalk(root, {
      state: () => game() ?? stateRef,
      unease: () => (isCalm() ? Math.min(unease, 0.2) : unease),
      figure: () => figure,
      setFigure: (on) => (figure = on),
      toast,
      sitDown,
      leave: () => {
        mode = "room";
        view.hidden = false;
        stand.hidden = false;
        hint.hidden = false;
        draw(true);
        view.focus({ preventScroll: true });
      },
    });
    mode = "walk";
    view.hidden = true;
    stand.hidden = true;
    hint.hidden = true;
  } catch (err) {
    console.warn("walking failed", err);
    toast("Your legs", "You try to stand up. You stay seated.");
  } finally {
    stand.textContent = "Stand up";
    busy = false;
  }
}
let walkDebug: ((opts?: Record<string, unknown>) => unknown) | undefined;
/** Test hook for the walking view (undefined until you have stood up once). */
export const debugWalk = (opts: Record<string, unknown> = {}) => walkDebug?.(opts);

/** Lean back from the screen and look at the room. */
export function lookUp(): void {
  if (busy || mode === "room" || !root) return;
  busy = true;
  mode = "room";
  draw(true);
  root.hidden = false;
  root.classList.add("gone");
  const f = frameRect(), r = view.getBoundingClientRect(), b = crtBox();
  const cx = f.x - r.left + ((b[0] + b[2]) / 2) * f.w, cy = f.y - r.top + ((b[1] + b[3]) / 2) * f.h;
  view.style.transition = "none";
  view.style.transformOrigin = `${cx}px ${cy}px`;
  view.style.transform = `scale(${(r.width / ((b[2] - b[0]) * f.w)).toFixed(2)})`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      view.style.transition = "transform .6s cubic-bezier(.2,.6,.3,1)";
      view.style.transform = "none";
      root.classList.remove("gone");
      setTimeout(() => {
        busy = false;
        view.focus({ preventScroll: true });
      }, 620);
    }),
  );
}

export const officeMode = () => mode;

/** 0.15..1, the same unease the desktop uses. */
export function setOfficeUnease(v: number): void {
  unease = Math.max(0, Math.min(1, v));
}

// --- the room's own life -------------------------------------------------
// One event every so often, picked from a pool that darkens with the unease.
// Sounds play whether you are looking at the room or the screen; the figure
// only waits for you to look up.
let nextEvent = 0;
function tickRoom(now: number): void {
  if (!nextEvent) nextEvent = now + 15000 + Math.random() * 20000;
  if (now < nextEvent || busy) return;
  const calm = isCalm();
  const u = calm ? Math.min(unease, 0.2) : unease;
  nextEvent = now + (20000 + Math.random() * 40000) / (0.6 + u);
  const s = game() ?? stateRef;
  const pool: [number, () => void][] = [
    [1, () => sfx("far-ring", { pan: -0.5, gain: 0.5 })],
    [0.8, () => (mode === "room" ? flicker(120) : (humFlicker(150), sfx("buzz")))],
  ];
  if (tier(s, "breakroom") >= 1) pool.push([0.6, () => sfx("clunk", { pan: 0.5, gain: 0.35 })]);
  if (u >= 0.3) pool.push([0.9 * u, () => sfx("far-steps", { pan: 0.45, gain: 0.6 })]);
  if (u >= 0.45) pool.push([0.7 * u, () => sfx("knock", { pan: 0.55, gain: 0.45 })]);
  if (u >= 0.5 && !calm && !figure)
    pool.push([
      u,
      () => {
        // It arrives in the dark and leaves in the dark.
        if (mode === "room") flicker(500, () => (figure = true));
        else figure = true;
        setTimeout(() => (mode === "room" ? flicker(700, () => (figure = false)) : (figure = false), draw()), 25000 + Math.random() * 30000);
      },
    ]);
  if (u >= 0.75 && !calm && mode === "room")
    pool.push([0.6, () => (sfx("far-steps", { pan: 0.3, gain: 0.8 }), flicker(2500 + Math.random() * 2500))]);
  let roll = Math.random() * pool.reduce((a, p) => a + p[0], 0);
  for (const [w, fn] of pool) if ((roll -= w) <= 0) return fn();
}

export function mountOffice(parent: HTMLElement, deskEl: HTMLElement, state: GameState, startInRoom: boolean): void {
  stateRef = state;
  desk = deskEl;
  root = document.createElement("div");
  root.className = "office";
  root.hidden = true;
  root.innerHTML = `
    <canvas width="${W}" height="${H}" tabindex="0" role="img" aria-label="Your cubicle. A beige CRT, a corkboard, and a long fluorescent hallway."></canvas>
    <div class="office-hint">Click the monitor to sit down</div>
    <button class="office-stand" title="Get up and walk around the office (W)">Stand up</button>`;
  parent.appendChild(root);
  view = root.querySelector("canvas")!;
  hint = root.querySelector(".office-hint")!;
  stand = root.querySelector(".office-stand")!;
  stand.addEventListener("click", () => void standUp());
  view.addEventListener("click", (e) => hit(e)?.act());
  view.addEventListener("mousemove", (e) => (view.style.cursor = hit(e) ? "pointer" : "default"));
  view.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") (e.preventDefault(), sitDown());
    if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") (e.preventDefault(), void standUp());
  });
  desk.querySelector("[data-lookup]")?.addEventListener("click", lookUp);
  onChange(() => mode === "room" && draw());
  window.addEventListener("resize", () => mode === "room" && draw(true));

  const names = ["base", "dark", ...OFFICE_LAYERS];
  void Promise.all(names.map(load)).then(() => {
    loaded = true;
    if (startInRoom) {
      mode = "room";
      root.hidden = false;
      draw(true);
      view.focus({ preventScroll: true });
    }
  });
  setInterval(() => {
    if (loaded) tickRoom(Date.now());
  }, 1000);
}

/** Test hooks: force the figure or the lights, and read the room's state. */
export function debugOffice(opts: { figure?: boolean; lights?: boolean; upgrades?: Record<string, number>; floor2?: boolean } = {}) {
  const s = game() ?? stateRef;
  if (opts.upgrades) Object.assign(s.upgrades, opts.upgrades);
  if (opts.floor2 && !has(s, "floor2")) s.projects = [...(s.projects ?? []), "floor2"];
  if (opts.figure !== undefined) figure = opts.figure;
  if (opts.lights !== undefined) lightsOn = opts.lights;
  draw(true);
  return { mode, figure, lightsOn, loaded, layers: officeLayers(game() ?? stateRef, { figure }) };
}
