import { entityDef } from "../data/entities";
import { levelDef, type LevelStyle } from "../data/levels";
import { ITEMS } from "../data/items";
import type { Expedition } from "../sim/expedition";
import { DARK, WALL, isOpen, type Level, type Pt } from "../sim/level";
import { isCalm, sfx } from "./audio";

// A live first-person view from the lead's body camera. It is a small raycaster
// over the same level grid the sim walks, drawn at a low resolution and dressed
// as VHS footage. It only reads the run; nothing here touches the sim.

const W = 160; // 3D buffer; scaled up to the canvas without smoothing
const H = 100;
const OUT_W = 320;
const OUT_H = 200;
const FOV = 0.8; // camera plane length
const FAR = 14;

export interface CamInput {
  lv: Level;
  exp: Expedition;
  operator: string;
  day: number;
  infection: number; // 0..100, makes the feed worse
  taken: number[]; // loot indexes already picked up
  levelName: string;
  depth: number;
  mates?: string[]; // portrait files of the other crew still out, drawn ahead of the lead
}

export interface Bodycam {
  update(input: CamInput): void;
}

const imgs = new Map<string, HTMLImageElement>();
function image(src: string): HTMLImageElement {
  let img = imgs.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imgs.set(src, img);
  }
  return img;
}

// The way out: a freight portal with a hazard frame and a humming teal opening.
// A few frames so the opening shimmers.
let portalSrc: string[] | null = null;
function portalFrames(): string[] {
  if (portalSrc) return portalSrc;
  portalSrc = [];
  for (let f = 0; f < 4; f++) {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3a3f44";
    g.fillRect(6, 8, 84, 120);
    g.fillStyle = "#12161a";
    g.fillRect(14, 22, 68, 106);
    const grad = g.createLinearGradient(0, 22, 0, 128);
    grad.addColorStop(0, "#c8fbf2");
    grad.addColorStop(0.5, "#5fd6c8");
    grad.addColorStop(1, "#1f7a74");
    g.fillStyle = grad;
    g.fillRect(16, 24, 64, 104);
    for (let y = 24 + ((f * 7) % 14); y < 128; y += 14) {
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.fillRect(16, y, 64, 3);
    }
    // Hazard stripes on the lintel and both posts.
    const stripes = (x: number, y: number, w: number, h: number, vertical: boolean) => {
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.fillStyle = "#e0b81c";
      g.fillRect(x, y, w, h);
      g.fillStyle = "#16181a";
      const span = vertical ? h : w;
      for (let k = -12; k < span + 12; k += 12) {
        g.beginPath();
        if (vertical) {
          g.moveTo(x, y + k);
          g.lineTo(x + w, y + k - 6);
          g.lineTo(x + w, y + k);
          g.lineTo(x, y + k + 6);
        } else {
          g.moveTo(x + k, y + h);
          g.lineTo(x + k + 6, y + h);
          g.lineTo(x + k + 12, y);
          g.lineTo(x + k + 6, y);
        }
        g.fill();
      }
      g.restore();
    };
    stripes(6, 8, 84, 14, false);
    stripes(6, 22, 8, 106, true);
    stripes(82, 22, 8, 106, true);
    // A lamp bar and a little EXIT box above the door.
    g.fillStyle = f % 2 ? "#ff7a3a" : "#ffc15a";
    g.fillRect(40, 1, 16, 5);
    g.fillStyle = "#0e1a12";
    g.fillRect(34, 10, 28, 10);
    g.fillStyle = "#3dd67a";
    g.fillRect(36, 12, 24, 6);
    g.fillStyle = "#0e1a12";
    for (let k = 0; k < 4; k++) g.fillRect(38 + k * 6, 13, 3, 4);
    portalSrc.push(c.toDataURL());
  }
  return portalSrc;
}

const hash = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---- Materials ---------------------------------------------------------------
// Each level style has its own wall, floor and ceiling. They write into the
// scratch colour below so a pixel costs no allocation. Everything is a pure
// function of position (and the clock, for water), so nothing flickers by accident.
let R = 0;
let G = 0;
let B = 0;
let GLOW = 0; // set by emissive decals: how much of the lamp light survives the dark
const rgb = (r: number, g: number, b: number) => {
  R = r;
  G = g;
  B = b;
};
const mul = (k: number) => {
  R *= k;
  G *= k;
  B *= k;
};
const fr = (x: number) => x - Math.floor(x);
const inr = (x: number, a: number, b: number) => x >= a && x <= b;

type WallFn = (u: number, v: number, h: number) => void;
type FloorFn = (fx: number, fy: number, ux: number, uy: number, h: number, t: number) => void;
type CeilFn = (fx: number, fy: number, ux: number, uy: number, h: number, lit: boolean) => void;
interface Mat {
  wall: WallFn;
  floor: FloorFn;
  ceil: CeilFn;
  fog: number; // how fast light falls off with distance
  light: number; // overall brightness
  decals: [door: number, board: number, vent: number, sign: number, stain: number, sig: number]; // chance per wall face
}

const tiles: CeilFn = (fx, fy, ux, uy, h, lit) => {
  const panel = (Math.floor(fx) + Math.floor(fy)) % 2 === 0 && inr(ux, 0.2, 0.8) && inr(uy, 0.3, 0.7);
  const grid = ux < 0.04 || uy < 0.04;
  if (panel && lit) rgb(255, 250, 220);
  else if (grid) rgb(120, 118, 100);
  else rgb(168, 164, 140);
};

const MATS: Record<LevelStyle, Mat> = {
  // Yellow wallpaper, damp carpet, buzzing tiles.
  halls: {
    fog: 0.045, light: 1, decals: [0.07, 0.04, 0.04, 0.03, 0.07, 0.06],
    wall: (u, v) => {
      const s = Math.floor(u * 16) % 2 ? 0.9 : 1;
      rgb(176 * s, 156 * s, 64 * s);
      if (v > 0.9) rgb(70, 52, 30);
      else if (v > 0.55 && v < 0.58) mul(0.7);
      if (hash(Math.floor(u * 6), Math.floor(v * 8), 5) > 0.88) {
        R *= 0.74;
        G *= 0.72;
        B *= 0.6;
      }
    },
    floor: (fx, fy) => {
      const t = hash(Math.floor(fx * 10), Math.floor(fy * 10));
      rgb(118 + t * 16, 100 + t * 14, 52 + t * 10);
    },
    ceil: tiles,
  },
  // Grey concrete, with crate stacks along the shelving.
  aisles: {
    fog: 0.05, light: 0.92, decals: [0.04, 0.03, 0.02, 0.04, 0.05, 0.1],
    wall: (u, v, h) => {
      const sp = 0.92 + hash(Math.floor(u * 24), Math.floor(v * 24), 2) * 0.16;
      rgb(128 * sp, 128 * sp, 122 * sp);
      if (h < 0.5 && v > 0.38 && v < 0.97) {
        // Crates two high, three across.
        const cu = fr(u * 3);
        const cv = fr((v - 0.38) * 3.4);
        const edge = cu < 0.08 || cv < 0.1;
        const tone = 0.85 + hash(Math.floor(u * 3), Math.floor((v - 0.38) * 3.4), 4) * 0.3;
        rgb(158 * tone, 112 * tone, 62 * tone);
        if (edge) mul(0.55);
        else if (Math.abs(cu - cv) < 0.07) mul(0.82);
      } else {
        if (v > 0.9) rgb(60, 60, 58);
        else if (inr(v, 0.7, 0.75)) rgb(190, 160, 40);
        if (fr(u * 2) < 0.02) mul(0.7);
      }
    },
    floor: (fx, fy, ux, uy, h) => {
      const sp = 0.9 + hash(Math.floor(fx * 12), Math.floor(fy * 12), 3) * 0.2;
      rgb(108 * sp, 108 * sp, 102 * sp);
      if (ux < 0.03 || uy < 0.03) mul(0.75);
      if (h > 0.5 && inr(uy, 0.46, 0.54)) rgb(180 * sp, 150 * sp, 36);
    },
    ceil: (fx, fy, ux, uy, h, lit) => {
      rgb(46, 46, 48);
      if (ux < 0.06 || uy < 0.06) rgb(30, 30, 32);
      if (lit && Math.floor(fy) % 2 === 0 && inr(uy, 0.42, 0.58) && inr(ux, 0.1, 0.9)) rgb(235, 240, 225);
    },
  },
  // Hot dark tunnels of pipework.
  pipes: {
    fog: 0.045, light: 1.15, decals: [0.02, 0, 0.05, 0, 0.1, 0.1],
    wall: (u, v, h) => {
      rgb(50, 46, 44);
      const bands: [number, number][] = [[0.12, 0.28], [0.4, 0.5], [0.68, 0.84]];
      for (let i = 0; i < 3; i++) {
        const [a, b] = bands[i];
        if (v >= a && v <= b) {
          const k = (v - a) / (b - a);
          const shade = 0.55 + 0.45 * Math.sin(k * Math.PI);
          if ((i + Math.floor(h * 7)) % 2) rgb(125 * shade, 70 * shade, 44 * shade);
          else rgb(92 * shade, 98 * shade, 102 * shade);
          if (fr(u * 4) < 0.04) mul(0.6);
        }
      }
      if (u < 0.05 || u > 0.95) rgb(28, 26, 26);
    },
    floor: (fx, fy, ux, uy, h) => {
      rgb(36, 36, 34);
      if (fr(fx * 4) < 0.18 || fr(fy * 4) < 0.18) rgb(66, 62, 56);
      if (h > 0.8) R += 14;
    },
    ceil: (fx, fy, ux, uy) => {
      rgb(32, 30, 30);
      if (inr(uy, 0.3, 0.5)) {
        const s = 0.55 + 0.45 * Math.sin(((uy - 0.3) / 0.2) * Math.PI);
        rgb(110 * s, 64 * s, 42 * s);
      }
      if (ux < 0.04) mul(0.5);
    },
  },
  // Blue-grey panels, vents and status lights.
  machines: {
    fog: 0.05, light: 0.95, decals: [0.04, 0.03, 0.08, 0.05, 0.02, 0.12],
    wall: (u, v, h) => {
      rgb(70, 86, 98);
      if (fr(u * 4) < 0.03 || inr(v, 0.49, 0.51)) mul(0.6);
      if (h > 0.5 && inr(v, 0.1, 0.3) && fr(v * 20) < 0.5) mul(0.5);
      const cx = Math.floor(u * 8);
      const cy = Math.floor(v * 6);
      if (hash(cx, cy, Math.floor(h * 1000)) > 0.9 && fr(u * 8) > 0.3 && fr(u * 8) < 0.7 && fr(v * 6) > 0.35 && fr(v * 6) < 0.65) {
        const k = hash(cx, cy, 11);
        if (k < 0.5) rgb(60, 220, 100);
        else if (k < 0.8) rgb(240, 180, 40);
        else rgb(230, 60, 50);
        GLOW = 0.5;
      }
      if (v > 0.93) rgb(30, 34, 38);
    },
    floor: (fx, fy, ux, uy, h) => {
      const sp = 0.9 + hash(Math.floor(fx * 8), Math.floor(fy * 8), 6) * 0.15;
      rgb(80 * sp, 86 * sp, 90 * sp);
      if (ux < 0.04 || uy < 0.04) mul(0.6);
      if (h > 0.85 && (uy < 0.12 || uy > 0.88) && fr((ux + uy) * 6) < 0.5) rgb(180, 150, 30);
    },
    ceil: (fx, fy, ux, uy, h, lit) => {
      rgb(34, 38, 42);
      if (inr(ux, 0.4, 0.6)) rgb(52, 56, 60);
      if (lit && (Math.floor(fx) + Math.floor(fy)) % 3 === 0 && inr(ux, 0.25, 0.75) && inr(uy, 0.4, 0.6)) rgb(200, 225, 255);
    },
  },
  // Cubicle grey, office-blue carpet tiles.
  openplan: {
    fog: 0.04, light: 1, decals: [0.05, 0.08, 0.03, 0.04, 0.03, 0.12],
    wall: (u, v, h) => {
      if (h < 0.55) {
        const f = 0.93 + hash(Math.floor(u * 40), Math.floor(v * 30), 7) * 0.12;
        rgb(118 * f, 130 * f, 142 * f);
        if (v < 0.07 || inr(v, 0.5, 0.52)) rgb(58, 62, 68);
        if (v > 0.94) rgb(30, 30, 32);
      } else {
        rgb(188, 186, 172);
        if (v > 0.9) rgb(92, 90, 84);
        else if (v < 0.05) mul(0.85);
      }
    },
    floor: (fx, fy) => {
      const k = (Math.floor(fx * 2) + Math.floor(fy * 2)) % 2 ? 1 : 0.9;
      const t = hash(Math.floor(fx * 14), Math.floor(fy * 14), 8) * 0.1 + 0.95;
      rgb(70 * k * t, 82 * k * t, 100 * k * t);
    },
    ceil: (fx, fy, ux, uy, h, lit) => {
      const panel = (Math.floor(fx) + Math.floor(fy)) % 2 === 0 && inr(ux, 0.15, 0.85) && inr(uy, 0.25, 0.75);
      if (panel && lit) rgb(255, 255, 245);
      else if (ux < 0.04 || uy < 0.04) rgb(130, 130, 124);
      else rgb(196, 196, 188);
    },
  },
  // Damask wallpaper, wood panelling, patterned carpet.
  hotel: {
    fog: 0.045, light: 0.95, decals: [0.12, 0, 0.02, 0.03, 0.04, 0.08],
    wall: (u, v) => {
      rgb(108, 32, 40);
      const d = Math.abs(fr(u * 6) - 0.5) + Math.abs(fr(v * 8) - 0.5);
      if (d < 0.16) rgb(168, 128, 60);
      if (v > 0.7) {
        rgb(72, 42, 26);
        if (fr(u * 3) < 0.05 || inr(v, 0.7, 0.72)) mul(0.6);
        else if (inr(fr(u * 3), 0.2, 0.8) && inr(v, 0.78, 0.94)) mul(1.15);
      }
      if (v < 0.05) rgb(190, 170, 130);
    },
    floor: (fx, fy) => {
      rgb(98, 26, 32);
      const d = Math.abs(fr(fx * 2) - 0.5) + Math.abs(fr(fy * 2) - 0.5);
      if (d < 0.2) rgb(150, 112, 52);
      else if (d > 0.45) rgb(70, 18, 24);
    },
    ceil: (fx, fy, ux, uy, h, lit) => {
      rgb(172, 152, 122);
      if (Math.hypot(ux - 0.5, uy - 0.5) < 0.22) rgb(150, 128, 98);
      if (Math.hypot(ux - 0.5, uy - 0.5) < 0.1) lit ? rgb(255, 235, 180) : rgb(100, 88, 70);
      if (ux < 0.04 || uy < 0.04) rgb(120, 100, 76);
    },
  },
  // Office walls with a tide line; the floor is water and shows the lights.
  flooded: {
    fog: 0.055, light: 1, decals: [0.05, 0.03, 0.03, 0.04, 0.1, 0.07],
    wall: (u, v) => {
      const f = 0.94 + hash(Math.floor(u * 30), Math.floor(v * 20), 9) * 0.1;
      rgb(152 * f, 142 * f, 114 * f);
      if (v > 0.6) {
        rgb(66 * f, 84 * f, 80 * f);
        if (v < 0.64) rgb(120, 150, 140);
      }
    },
    floor: (fx, fy, ux, uy, h, t) => {
      const s = Math.sin(fx * 6 + t / 400) + Math.sin(fy * 7 - t / 530) + Math.sin((fx + fy) * 3.1 + t / 700);
      rgb(34, 64, 68);
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      // The ceiling panels, mirrored and broken up by the ripples.
      const wob = Math.sin(fy * 9 + t / 300) * 0.07;
      if ((cx + cy) % 2 === 0 && inr(ux + wob, 0.2, 0.8) && inr(uy, 0.3, 0.7)) {
        R += 120;
        G += 130;
        B += 110;
      }
      const k = 1 + s * 0.13;
      R *= k;
      G *= k;
      B *= k;
      if (s > 2.1) {
        R += 40;
        G += 50;
        B += 50;
      }
    },
    ceil: (fx, fy, ux, uy, h, lit) => {
      tiles(fx, fy, ux, uy, h, lit);
      mul(0.78);
      if (h > 0.6) {
        R *= 0.7;
        G *= 0.7;
        B *= 0.65;
      }
    },
  },
  // Rock, strata and wet dirt.
  caves: {
    fog: 0.05, light: 0.9, decals: [0, 0, 0, 0, 0.08, 0.07],
    wall: (u, v, h) => {
      const n = hash(Math.floor(u * 9), Math.floor(v * 9), 12) * 0.35 + hash(Math.floor(u * 3), Math.floor(v * 4), 13) * 0.3 + 0.65;
      const strata = 0.9 + 0.1 * Math.sin(v * 14 + h * 4 + u * 2);
      rgb(96 * n * strata, 76 * n * strata, 56 * n * strata);
    },
    floor: (fx, fy) => {
      const n = 0.8 + hash(Math.floor(fx * 9), Math.floor(fy * 9), 14) * 0.35;
      rgb(74 * n, 58 * n, 44 * n);
      if (hash(Math.floor(fx * 2), Math.floor(fy * 2), 15) > 0.9) rgb(40, 52, 56);
    },
    ceil: (fx, fy) => {
      const n = 0.7 + hash(Math.floor(fx * 6), Math.floor(fy * 6), 16) * 0.4;
      rgb(54 * n, 44 * n, 36 * n);
    },
  },
  // Night siding and brick, tarmac, a black sky with stars.
  streets: {
    fog: 0.032, light: 1.2, decals: [0.1, 0, 0, 0, 0.02, 0.22],
    wall: (u, v, h) => {
      if (h > 0.6) {
        rgb(96, 52, 44);
        if (fr(v * 12) < 0.12 || fr(u * 6 + (Math.floor(v * 12) % 2) * 0.5) < 0.06) rgb(120, 112, 104);
      } else {
        rgb(54, 60, 80);
        if (fr(v * 9) < 0.12) mul(0.65);
      }
      if (v < 0.06) rgb(24, 26, 34);
      else if (v > 0.92) rgb(70, 72, 74);
    },
    floor: (fx, fy, ux, uy, h) => {
      const n = 0.85 + hash(Math.floor(fx * 14), Math.floor(fy * 14), 17) * 0.3;
      rgb(46 * n, 48 * n, 54 * n);
      if (inr(uy, 0.47, 0.53) && ux < 0.5) rgb(180, 160, 60);
      if (h > 0.94 && Math.hypot(ux - 0.5, uy - 0.5) < 0.22) rgb(30, 30, 34);
    },
    ceil: (fx, fy) => {
      rgb(12, 16, 30);
      if (hash(Math.floor(fx * 9), Math.floor(fy * 9), 18) > 0.985) rgb(220, 225, 245);
    },
  },
  // Wheat to the horizon.
  field: {
    fog: 0.012, light: 1.15, decals: [0, 0, 0, 0, 0, 0.08],
    wall: (u, v) => {
      const s = hash(Math.floor(u * 44), 0, 19);
      const sw = 0.8 + s * 0.4;
      if (v < 0.08 + s * 0.12) rgb(150, 182, 214);
      else {
        rgb(186 * sw, 154 * sw, 70 * sw);
        if (v < 0.3) mul(1.08);
        if (fr(v * 6 + s) < 0.1) mul(0.82);
      }
    },
    floor: (fx, fy) => {
      const s = hash(Math.floor(fx * 16), Math.floor(fy * 16), 20);
      rgb(168 * (0.8 + s * 0.4), 138 * (0.8 + s * 0.4), 60 * (0.8 + s * 0.4));
    },
    ceil: (fx, fy, ux, uy, h, lit) => {
      rgb(118, 160, 206);
      if (hash(Math.floor(fx * 3), Math.floor(fy * 3), 21) > 0.9) rgb(176, 200, 226);
    },
  },
};

// Wall decals, chosen by hashing the wall face so every corridor reads differently
// and nothing moves between frames. kind 0 is bare wall.
const kindFor = (mat: Mat, mx: number, my: number, face: number): number => {
  let x = hash(mx, my, 31 + face);
  for (let k = 0; k < 6; k++) {
    if (x < mat.decals[k]) return k + 1;
    x -= mat.decals[k];
  }
  return 0;
};

function decal(kind: number, style: LevelStyle, u: number, v: number, h: number): void {
  switch (kind) {
    case 1: {
      // Door: frame, two panels, handle.
      if (u < 0.28 || u > 0.72 || v < 0.18) return;
      if (u < 0.31 || u > 0.69 || v < 0.21) return rgb(44, 34, 26);
      if (style === "hotel") rgb(110, 72, 40);
      else if (h < 0.33) rgb(112, 80, 48);
      else if (h < 0.66) rgb(84, 98, 94);
      else rgb(122, 54, 46);
      const inset = inr(u, 0.36, 0.64) && (inr(v, 0.27, 0.46) || inr(v, 0.52, 0.8));
      if (inset) {
        const e = Math.min(u - 0.36, 0.64 - u) < 0.014 || Math.min(v - (v < 0.5 ? 0.27 : 0.52), (v < 0.5 ? 0.46 : 0.8) - v) < 0.014;
        mul(e ? 0.75 : 1.07);
      }
      if (v > 0.97) rgb(8, 8, 8);
      if (inr(u, 0.6, 0.65) && inr(v, 0.5, 0.56)) rgb(214, 192, 112);
      return;
    }
    case 2: {
      // Notice board with a few pinned sheets.
      if (!inr(u, 0.22, 0.78) || !inr(v, 0.22, 0.58)) return;
      if (u < 0.245 || u > 0.755 || v < 0.245 || v > 0.555) return rgb(88, 60, 36);
      rgb(176, 140, 92);
      const gu = (u - 0.25) / 0.5;
      const gv = (v - 0.25) / 0.3;
      const cu = Math.floor(gu * 3);
      const cv = Math.floor(gv * 2);
      if (hash(cu, cv, Math.floor(h * 997)) > 0.3 && fr(gu * 3) > 0.15 && fr(gu * 3) < 0.85 && fr(gv * 2) > 0.15 && fr(gv * 2) < 0.9) rgb(232, 228, 208);
      return;
    }
    case 3: {
      // Vent grille.
      if (!inr(u, 0.34, 0.66) || !inr(v, 0.14, 0.34)) return;
      if (u < 0.355 || u > 0.645 || v < 0.155 || v > 0.325) return rgb(48, 48, 48);
      return fr((v - 0.14) * 20) < 0.5 ? rgb(18, 18, 18) : rgb(98, 100, 100);
    }
    case 4: {
      // Exit-style sign, lit from inside.
      if (!inr(u, 0.36, 0.64) || !inr(v, 0.1, 0.24)) return;
      GLOW = 0.7;
      if (u < 0.375 || u > 0.625 || v < 0.115 || v > 0.225) return rgb(235, 245, 235);
      if (inr(u, 0.44, 0.56) && inr(v, 0.15, 0.19)) return rgb(235, 245, 235);
      return rgb(24, 126, 64);
    }
    case 5: {
      // Water stain running down from the ceiling.
      const len = 0.12 + hash(Math.floor(u * 10), Math.floor(h * 1000), 41) * 0.4;
      if (u < 0.12 || u > 0.88 || v > len) return;
      const k = 0.62 + (v / len) * 0.3;
      R *= k;
      G *= k * 0.97;
      B *= k * 0.85;
      return;
    }
    default:
      break;
  }
  // Kind 6: the signature of the level.
  switch (style) {
    case "halls": {
      // Tally marks scratched into the paper.
      for (let i = 0; i < 4; i++) if (inr(v, 0.34, 0.6) && Math.abs(u - (0.3 + i * 0.1)) < 0.012) return rgb(66, 46, 26);
      if (inr(v, 0.45, 0.48) && inr(u, 0.25, 0.65)) rgb(66, 46, 26);
      return;
    }
    case "aisles": {
      if (inr(v, 0.1, 0.22)) return fr((u + v) * 8) < 0.5 ? rgb(208, 176, 36) : rgb(24, 24, 24);
      if (inr(u, 0.4, 0.6) && inr(v, 0.3, 0.46)) return inr(u, 0.46, 0.54) && inr(v, 0.34, 0.42) ? rgb(24, 24, 24) : rgb(220, 190, 40);
      return;
    }
    case "pipes": {
      // A valve wheel.
      const du = u - 0.5;
      const dv = v - 0.45;
      const d = Math.hypot(du, dv);
      if (d < 0.05) return rgb(30, 26, 26);
      if (Math.abs(d - 0.2) < 0.035 || (d < 0.2 && (Math.abs(du) < 0.018 || Math.abs(dv) < 0.018))) rgb(168, 42, 34);
      return;
    }
    case "machines": {
      if (!inr(u, 0.2, 0.8) || !inr(v, 0.2, 0.6)) return;
      if (u < 0.215 || u > 0.785 || v < 0.215 || v > 0.585) return rgb(110, 118, 124);
      rgb(14, 20, 26);
      const i = Math.floor((u - 0.25) / 0.1);
      if (i >= 0 && i < 5 && fr((u - 0.25) / 0.1) < 0.6 && v > 0.55 - hash(i, Math.floor(h * 997), 43) * 0.28) {
        rgb(60, 210, 100);
        GLOW = 0.5;
      }
      return;
    }
    case "openplan": {
      // A monitor with a note on it, and another on the partition.
      if (inr(u, 0.3, 0.7) && inr(v, 0.3, 0.58)) {
        if (u < 0.315 || u > 0.685 || v < 0.315 || v > 0.565) return rgb(28, 28, 32);
        rgb(52, 112, 150);
        if (fr(v * 18) < 0.3 && u < 0.6) rgb(210, 226, 235);
        return;
      }
      if (inr(u, 0.72, 0.8) && inr(v, 0.35, 0.43)) return rgb(240, 222, 92);
      if (inr(u, 0.2, 0.27) && inr(v, 0.5, 0.58)) return rgb(236, 150, 170);
      return;
    }
    case "hotel": {
      // A gilt-framed picture of nothing much.
      if (!inr(u, 0.25, 0.75) || !inr(v, 0.2, 0.6)) return;
      if (u < 0.29 || u > 0.71 || v < 0.24 || v > 0.56) return rgb(182, 142, 62);
      return v > 0.42 ? rgb(34, 54, 44) : rgb(70, 86, 108);
    }
    case "flooded": {
      // A life ring.
      const du = u - 0.5;
      const dv = v - 0.4;
      const d = Math.hypot(du, dv);
      if (d < 0.07 || d > 0.17) return;
      return Math.floor((Math.atan2(dv, du) + Math.PI) * 1.9) % 2 ? rgb(236, 236, 230) : rgb(224, 96, 36);
    }
    case "caves": {
      // A vending machine nobody has restocked.
      if (!inr(u, 0.22, 0.78) || v < 0.12 || v > 0.96) return;
      if (u < 0.25 || u > 0.75) return rgb(60, 64, 76);
      if (inr(u, 0.28, 0.58) && inr(v, 0.2, 0.62)) {
        GLOW = 0.55;
        const sh = fr((v - 0.2) / 0.42 * 4) < 0.1;
        if (sh) return rgb(70, 76, 84);
        const k = hash(Math.floor((u - 0.28) / 0.05), Math.floor((v - 0.2) / 0.105), Math.floor(h * 997));
        return k > 0.7 ? rgb(120, 170, 190) : k > 0.35 ? rgb(210, 90, 50) : rgb(220, 190, 80);
      }
      return rgb(150, 44, 44);
    }
    case "streets": {
      // A lit window.
      if (!inr(u, 0.28, 0.72) || !inr(v, 0.2, 0.58)) return;
      if (u < 0.3 || u > 0.7 || v < 0.22 || v > 0.56 || Math.abs(u - 0.5) < 0.012 || Math.abs(v - 0.39) < 0.012) return rgb(26, 24, 24);
      GLOW = 0.8;
      return h > 0.5 && u > 0.52 ? rgb(190, 150, 70) : rgb(236, 196, 104);
    }
    case "field": {
      // A fence post with a crossbar.
      if (inr(u, 0.46, 0.54) && v > 0.12) return rgb(112, 86, 52);
      if (inr(v, 0.3, 0.37) && inr(u, 0.14, 0.86)) rgb(120, 92, 56);
      return;
    }
  }
}

export function createBodycam(canvas: HTMLCanvasElement, first: CamInput, opts: { fps?: number } = {}): Bodycam {
  const frameMs = opts.fps ? 1000 / opts.fps : 0; // small tiles do not need sixty frames a second
  let lastDrawn = 0;
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Live body camera feed from the team lead. The radio log describes what it shows.");
  const out = canvas.getContext("2d")!;
  const buf = document.createElement("canvas");
  buf.width = W;
  buf.height = H;
  const bctx = buf.getContext("2d")!;
  const frame = bctx.createImageData(W, H);
  const px = frame.data;
  const zbuf = new Float32Array(W);
  const noise = document.createElement("canvas");
  noise.width = 80;
  noise.height = 50;
  const nctx = noise.getContext("2d")!;
  const nimg = nctx.createImageData(80, 50);
  const tmp = document.createElement("canvas");
  const tctx = tmp.getContext("2d")!;

  let input = first;
  let from: Pt = { ...first.exp.pos };
  let to: Pt = { ...first.exp.pos };
  let moved = performance.now();
  let tickMs = 550;
  let lastTick = first.exp.tick;
  let lastTickAt = performance.now();
  let angle = 0;
  let target = 0;
  let heading = 0; // where the body is going; the head follows
  let turning = false;
  let headHold = 0;
  let glance = 0;
  let glanceUntil = 0;
  let gaze = 0; // standing still: the offset toward the longest open stretch
  let nextGaze = 0;
  let nextGlance = performance.now() + 2500;
  let lastFrame = performance.now();
  let holdUntil = 0;
  let stepPhase = 0;
  let lastStep = 0;
  let danger = 0;
  let lastBeat = 0;
  const spotted = new Set<string>();
  let stopped = false;
  let tearUntil = 0; // a tracking tear, while it lasts
  let tearY = 0;
  let tearH = 0;
  let tearDx = 0;
  let cutUntil = 0; // deep in the infection the feed sometimes shows somewhere you have not sent anyone
  let nextCut = performance.now() + (location.search.includes("cutaway") ? 2000 : 20000 + Math.random() * 20000); // ?cutaway for play-tests

  const rotate = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));

  function update(next: CamInput): void {
    const now = performance.now();
    if (next.exp.tick !== lastTick) {
      tickMs = Math.min(700, Math.max(30, now - lastTickAt));
      lastTick = next.exp.tick;
      lastTickAt = now;
    }
    const p = next.exp.pos;
    if (p.x !== to.x || p.y !== to.y) {
      from = at(now);
      to = { ...p };
      moved = now;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (dx || dy) target = Math.atan2(dy, dx);
    }
    input = next;
  }
  function at(now: number): Pt {
    const t = Math.min(1, (now - moved) / tickMs);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  function los(lv: Level, a: Pt, b: Pt): boolean {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3);
    for (let i = 1; i < n; i++) {
      const x = Math.floor(a.x + 0.5 + ((b.x - a.x) * i) / n);
      const y = Math.floor(a.y + 0.5 + ((b.y - a.y) * i) / n);
      if (lv.cells[y * lv.w + x] === WALL) return false;
    }
    return true;
  }

  function render(now: number): void {
    const { lv, exp } = input;
    const done = exp.phase === "done";
    const p = at(now);
    const px0 = p.x + 0.5;
    const py0 = p.y + 0.5;
    const moving = !done && now - moved < tickMs * 1.05 && (to.x !== from.x || to.y !== from.y);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const nervy = 1 + danger * 1.5 + input.infection / 60;

    // A head on a walking body. Walking, it faces where it is going and swings
    // into corners before the body gets there; standing, it looks down the
    // longest open stretch instead of at a wall; glances go toward open space.
    const open = (a: number, from: Pt = { x: px0, y: py0 }) => {
      for (let d = 0.3; d < 6; d += 0.3) {
        const cx = Math.floor(from.x + Math.cos(a) * d);
        const cy = Math.floor(from.y + Math.sin(a) * d);
        if (cx < 0 || cy < 0 || cx >= lv.w || cy >= lv.h || lv.cells[cy * lv.w + cx] === WALL) return d;
      }
      return 6;
    };
    if (moving) {
      turning = false;
      heading = target;
    } else if (Math.abs(rotate(target - heading)) > 0.3 && now > headHold) {
      if (!turning) {
        turning = true;
        headHold = now + 120 + Math.random() * 180; // the pause before the turn
      } else {
        turning = false;
        heading = target;
      }
    }
    if (Math.abs(rotate(target - heading)) <= 0.3) heading = target;
    if (!moving && !done && now > nextGaze) {
      nextGaze = now + 1600 + Math.random() * 1400;
      let best = 0;
      let bestD = open(heading) + 0.4; // staying put wins a close call
      for (const o of [-1.2, -0.8, -0.4, 0.4, 0.8, 1.2]) {
        const d = open(heading + o);
        if (d > bestD) {
          bestD = d;
          best = o;
        }
      }
      gaze = best;
    }
    if (!done && now > nextGlance) {
      const behind = !moving && Math.random() < 0.15;
      const side = open(heading - 0.7) > open(heading + 0.7) ? -1 : 1;
      if (behind) glance = (Math.random() < 0.5 ? -1 : 1) * 2.5;
      else if (open(heading + side * 0.7) > 2) glance = side * (moving ? 0.25 + Math.random() * 0.2 : 0.5 + Math.random() * 0.5);
      else glance = 0;
      glanceUntil = now + 450 + Math.random() * 600;
      nextGlance = glanceUntil + (2600 + Math.random() * 4500) / nervy;
    }
    // A threat has the whole head turned to it.
    if (exp.threat && !done) {
      const r = exp.entities.find((e) => e.id === exp.threat!.id);
      if (r) {
        glance = rotate(Math.atan2(r.pos.y - p.y, r.pos.x - p.x) - heading);
        glanceUntil = now + 400;
        nextGlance = glanceUntil + 1500;
      }
    }
    const looking = now < glanceUntil;
    const sway = moving || done ? Math.sin(now / 700) * 0.03 : Math.sin(now / 1300) * 0.08;
    const shake = Math.sin(now / 37) * 0.006 + Math.sin(now / 91) * 0.01;
    const desired = (turning ? angle : heading) + (moving || done ? 0 : gaze) + (looking ? glance : 0) + sway;
    const diff = rotate(desired - angle);
    const maxRate = looking && Math.abs(diff) > 0.2 ? 4.2 : moving ? 3.4 : 1.6; // a flick out, a swing into the corner, a slow settle
    const stepA = Math.max(-maxRate * dt, Math.min(maxRate * dt, diff * (1 - Math.exp(-7 * dt))));
    angle = rotate(angle + stepA);
    canvas.dataset.cam = `${angle.toFixed(3)} ${open(angle).toFixed(1)} ${moving ? 1 : 0}`; // for play-tests: where it looks, how far it can see, walking
    if (moving) stepPhase += 0.2;
    const bob = (moving ? Math.sin(stepPhase * 2.2) * 1.6 : Math.sin(now / 1400) * 0.4) + shake * 40;
    const horizon = H / 2 + bob;
    if (moving && Math.sin(stepPhase * 2.2) < -0.95 && now - lastStep > 180) {
      lastStep = now;
      sfx("step");
    }

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const planeX = -dirY * FOV;
    const planeY = dirX * FOV;
    const rays: [number, number][] = [];
    for (let x = 0; x < W; x++) {
      const cx = (2 * x) / W - 1;
      rays.push([dirX + planeX * cx, dirY + planeY * cx]);
    }

    // Lamps stutter now and then; more when something is near.
    const flickRate = 0.985 - danger * 0.03 - input.infection / 6000;
    const flicker = (cx: number, cy: number) => (hash(cx, cy, Math.floor(now / 90)) > flickRate ? 0.5 : 1);
    const style = levelDef(input.exp.levelId).style;
    const mat = MATS[style];

    // Walls.
    for (let x = 0; x < W; x++) {
      const [rx, ry] = rays[x];
      let mx = Math.floor(px0);
      let my = Math.floor(py0);
      const ddx = Math.abs(1 / (rx || 1e-9));
      const ddy = Math.abs(1 / (ry || 1e-9));
      const sx = rx < 0 ? -1 : 1;
      const sy = ry < 0 ? -1 : 1;
      let sdx = (rx < 0 ? px0 - mx : mx + 1 - px0) * ddx;
      let sdy = (ry < 0 ? py0 - my : my + 1 - py0) * ddy;
      let side = 0;
      let hit = false;
      let prev = { x: mx, y: my };
      for (let n = 0; n < 40 && !hit; n++) {
        prev = { x: mx, y: my };
        if (sdx < sdy) {
          sdx += ddx;
          mx += sx;
          side = 0;
        } else {
          sdy += ddy;
          my += sy;
          side = 1;
        }
        if (mx < 0 || my < 0 || mx >= lv.w || my >= lv.h || lv.cells[my * lv.w + mx] === WALL) hit = true;
      }
      const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      zbuf[x] = perp;
      const lineH = Math.floor(H / perp);
      const y0 = Math.floor(horizon - lineH / 2);
      const wallX = side === 0 ? py0 + perp * ry : px0 + perp * rx;
      const u = wallX - Math.floor(wallX);
      const dark = lv.cells[prev.y * lv.w + prev.x] === DARK;
      const lit = (dark ? 0.45 : 1) * flicker(prev.x, prev.y) * mat.light;
      const shade = Math.max(0.05, lit / (1 + perp * perp * mat.fog)) * (side ? 0.8 : 1);
      const face = side * 2 + (side === 0 ? (rx < 0 ? 1 : 0) : ry < 0 ? 1 : 0);
      const kind = kindFor(mat, mx, my, face);
      const fh = hash(mx, my, 77 + face);
      for (let y = Math.max(0, y0); y < Math.min(H, y0 + lineH); y++) {
        const v = (y - y0) / lineH;
        GLOW = 0;
        mat.wall(u, v, fh);
        if (kind) decal(kind, style, u, v, fh);
        const sh = GLOW ? Math.max(shade, GLOW * 0.7) : shade;
        const r = R;
        const g = G;
        const b = B;
        const o = (y * W + x) * 4;
        px[o] = r * sh;
        px[o + 1] = g * sh;
        px[o + 2] = b * sh;
        px[o + 3] = 255;
      }
      // Ceiling and floor for this column.
      for (let y = 0; y < H; y++) {
        if (y >= Math.max(0, y0) && y < Math.min(H, y0 + lineH)) continue;
        const o = (y * W + x) * 4;
        const rowDist = H / (2 * Math.abs(y - horizon) + 0.0001);
        if (rowDist > FAR) {
          px[o] = px[o + 1] = px[o + 2] = 6;
          px[o + 3] = 255;
          continue;
        }
        const fx = px0 + rowDist * rx;
        const fy = py0 + rowDist * ry;
        const cx = Math.floor(fx);
        const cy = Math.floor(fy);
        const cell = lv.cells[cy * lv.w + cx];
        const deadLight = cell === DARK;
        const base = (deadLight ? 0.42 : 1) * flicker(cx, cy) * mat.light;
        const ux = fx - cx;
        const uy = fy - cy;
        const fh = hash(cx, cy, 3);
        let pn = 1;
        if (y < horizon) {
          mat.ceil(fx, fy, ux, uy, fh, !deadLight);
          if (!deadLight && R > 240 && G > 240) pn = 1.25; // a lit panel glows
        } else mat.floor(fx, fy, ux, uy, fh, now);
        const shadeF = Math.max(0.04, base / (1 + rowDist * rowDist * mat.fog * 1.1));
        px[o] = Math.min(255, R * shadeF * pn);
        px[o + 1] = Math.min(255, G * shadeF * pn);
        px[o + 2] = Math.min(255, B * shadeF * pn);
        px[o + 3] = 255;
      }
    }
    bctx.putImageData(frame, 0, 0);

    // Sprites: entities and loot that are in sight, far to near.
    type Spr = { x: number; y: number; src: string; scale: number; lift: number; thing: "entity" | "loot" | "crew" | "portal"; wob: number };
    const sprites: Spr[] = [];
    danger = exp.threat ? 1 : 0;
    if (!done) {
      for (const r of exp.entities) {
        const d = Math.hypot(r.pos.x - p.x, r.pos.y - p.y);
        danger = Math.max(danger, 1 - Math.min(1, d / 9));
        if (d < 10 && los(lv, p, r.pos)) {
          if (!spotted.has(r.id)) {
            spotted.add(r.id);
            sfx("growl", { pan: Math.max(-1, Math.min(1, (r.pos.x - p.x) / 10)), gain: Math.max(0, Math.min(1, 1 - d / 10)) });
          }
          sprites.push({ x: r.pos.x + 0.5, y: r.pos.y + 0.5, src: `./art/entities/${entityDef(r.id).art}`, scale: 0.95, lift: 0, thing: "entity", wob: hash(r.pos.x, r.pos.y) });
        }
      }
      lv.loot.forEach((l, i) => {
        if (input.taken.includes(i) || exp.carried.length > 90) return;
        if (Math.hypot(l.at.x - p.x, l.at.y - p.y) < 7 && los(lv, p, l.at))
          sprites.push({ x: l.at.x + 0.5, y: l.at.y + 0.5, src: `./art/items/${ITEMS[l.itemId].art}`, scale: 0.28, lift: -0.04, thing: "loot", wob: 0 });
      });
    }
    // Teammates walk a cell or two ahead of the lead, as dark shapes, when that ground is open.
    if (!done && input.mates?.length) {
      const hx = Math.cos(heading);
      const hy = Math.sin(heading);
      const ax = Math.abs(hx) >= Math.abs(hy) ? Math.sign(hx) : 0;
      const ay = ax ? 0 : Math.sign(hy);
      input.mates.slice(0, 2).forEach((file, i) => {
        const k = 1.6 + i * 1;
        const mx = p.x + ax * k;
        const my = p.y + ay * k;
        const cell = { x: Math.round(mx), y: Math.round(my) };
        if (!isOpen(lv, cell) || !los(lv, p, cell)) return;
        const side = (i % 2 ? 1 : -1) * 0.3;
        const lift = moving ? Math.abs(Math.sin(stepPhase * 2.2 + i)) * 0.03 : 0;
        sprites.push({ x: mx + 0.5 - ay * side, y: my + 0.5 + ax * side, src: `./art/portraits/${file}`, scale: 0.5, lift: -lift, thing: "crew", wob: 0 });
      });
    }
    if (!sprites.some((q) => q.thing === "entity")) spotted.clear();
    // Heartbeat whenever something is near; faster the closer it gets.
    if (danger > 0.45 && now - lastBeat > 1300 - danger * 800) {
      lastBeat = now;
      sfx("thump");
    }
    sprites.push({ x: lv.entrance.x + 0.5, y: lv.entrance.y + 0.5, src: portalFrames()[Math.floor(now / 140) % 4], scale: 1.05, lift: 0, thing: "portal", wob: 0 });
    const det = planeX * dirY - dirX * planeY;
    sprites
      .map((s) => ({ s, d: (s.x - px0) ** 2 + (s.y - py0) ** 2 }))
      .sort((a, b) => b.d - a.d)
      .forEach(({ s }) => {
        const img = image(s.src);
        if (!img.complete || !img.naturalWidth) return;
        const rx = s.x - px0;
        const ry = s.y - py0;
        const tx = (dirY * rx - dirX * ry) / det;
        const ty = (-planeY * rx + planeX * ry) / det;
        if (ty < 0.25) return;
        const size = Math.max(4, Math.min(H * 2, Math.floor((H / ty) * s.scale)));
        const aspect = img.naturalWidth / img.naturalHeight;
        const sw = Math.max(2, Math.floor(size * aspect));
        const cxs = Math.floor((W / 2) * (1 + tx / ty));
        const sway = s.thing === "entity" ? Math.sin(now / 300 + s.wob * 6) * 1.2 : 0;
        const top = Math.floor(horizon + (H / ty) * (0.5 + s.lift) - size + sway);
        // Pre-darken by distance so far things sink into the fog.
        tmp.width = sw;
        tmp.height = size;
        tctx.imageSmoothingEnabled = false;
        tctx.clearRect(0, 0, sw, size);
        tctx.drawImage(img, 0, 0, sw, size);
        tctx.globalCompositeOperation = "source-atop";
        tctx.fillStyle = `rgba(8,6,0,${s.thing === "portal" ? Math.min(0.5, ty / FAR * 0.6) : s.thing === "crew" ? Math.min(0.95, 0.62 + ty / FAR) : Math.min(0.92, ty / FAR + 0.15)})`;
        tctx.fillRect(0, 0, sw, size);
        tctx.globalCompositeOperation = "source-over";
        for (let c = 0; c < sw; c++) {
          const sx = cxs - Math.floor(sw / 2) + c;
          if (sx < 0 || sx >= W || ty >= zbuf[sx]) continue;
          bctx.drawImage(tmp, c, 0, 1, size, sx, top, 1, size);
        }
      });

    // Post: scale up, then make it look like tape.
    out.imageSmoothingEnabled = false;
    const stage = input.infection;
    const jitter = Math.random() < 0.015 + danger * 0.04 + stage / 4000 ? (Math.random() - 0.5) * 4 : 0;
    out.drawImage(buf, 0, 0, W, H, jitter, 0, OUT_W, OUT_H);
    // Stage four: for a second or two the picture is the office. Your office.
    if (!done && input.infection >= 80 && !isCalm()) {
      if (now > nextCut) {
        cutUntil = now + 1100 + Math.random() * 900;
        nextCut = cutUntil + 30000 + Math.random() * 40000;
        sfx("growl");
      }
    }
    const cut = now < cutUntil;
    if (cut) {
      const art = image("./art/levels/L04-empty-open-plan.png");
      if (art.complete && art.naturalWidth) out.drawImage(art, 0, 0, OUT_W, OUT_H);
      else {
        out.fillStyle = "#222";
        out.fillRect(0, 0, OUT_W, OUT_H);
      }
    }

    // Danger shows as a tracking tear: a band of the picture slips sideways for a
    // moment, with a dip in the lamps and the colour draining. The image stays clear.
    if (!done && !cut) {
      if (now > tearUntil && danger > 0.3 && Math.random() < (danger - 0.2) * 0.05) {
        tearUntil = now + 140 + Math.random() * 260;
        tearY = Math.floor(Math.random() * (OUT_H - 40));
        tearH = 14 + Math.floor(Math.random() * 26);
        tearDx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 18);
      }
      if (now < tearUntil) {
        out.drawImage(canvas, 0, tearY, OUT_W, tearH, tearDx, tearY, OUT_W, tearH);
        out.fillStyle = "rgba(255,255,255,0.1)";
        out.fillRect(0, tearY, OUT_W, 1);
      }
    }
    if (danger > 0.3 && Math.floor(now / 70) % 9 === 0 && hash(Math.floor(now / 70), 5) < danger) {
      out.fillStyle = `rgba(0,0,0,${0.12 + danger * 0.18})`;
      out.fillRect(0, 0, OUT_W, OUT_H);
    }

    // Tint toward the cold green of cheap sensors, and drain the colour as danger or infection grows.
    out.globalCompositeOperation = "multiply";
    out.fillStyle = "rgb(205,225,190)";
    out.fillRect(0, 0, OUT_W, OUT_H);
    const drain = Math.min(0.55, danger * 0.4 + stage / 400);
    if (drain > 0.02) {
      out.globalCompositeOperation = "saturation";
      out.fillStyle = `rgba(128,128,128,${drain})`;
      out.fillRect(0, 0, OUT_W, OUT_H);
    }
    out.globalCompositeOperation = "source-over";

    // Scanlines and vignette.
    out.fillStyle = "rgba(0,0,0,0.16)";
    for (let y = 0; y < OUT_H; y += 2) out.fillRect(0, y, OUT_W, 1);
    const vg = out.createRadialGradient(OUT_W / 2, OUT_H / 2, OUT_H * 0.4, OUT_W / 2, OUT_H / 2, OUT_W * 0.64);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    out.fillStyle = vg;
    out.fillRect(0, 0, OUT_W, OUT_H);

    // Light grain; it only gets heavy when the feed is dying.
    const grain = 0.04 + danger * 0.05 + stage / 900 + (done ? (exp.result && exp.result.survivors ? 0.25 : 0.85) : 0);
    for (let i = 0; i < nimg.data.length; i += 4) {
      const v = Math.random() * 255;
      nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = v;
      nimg.data[i + 3] = 255;
    }
    nctx.putImageData(nimg, 0, 0);
    out.globalAlpha = Math.min(0.9, grain);
    out.drawImage(noise, 0, 0, OUT_W, OUT_H);
    out.globalAlpha = 1;

    // A tracking band rolls down the picture now and then when the tape is old.
    const roll = (now / 25) % 1100;
    if (roll < OUT_H + 20 && (stage > 40 || Math.sin(now / 5000) > 0.9)) {
      out.globalAlpha = 0.25;
      out.drawImage(canvas, 0, Math.max(0, roll - 8), OUT_W, 14, Math.random() * 6 - 3, Math.max(0, roll - 8), OUT_W, 14);
      out.fillStyle = "rgba(255,255,255,0.06)";
      out.fillRect(0, roll, OUT_W, 3);
      out.globalAlpha = 1;
    }

    // Camera overlay.
    out.font = "bold 12px monospace";
    out.textBaseline = "top";
    const text = (s: string, x: number, y: number, align: CanvasTextAlign = "left") => {
      out.textAlign = align;
      out.fillStyle = "#000";
      out.fillText(s, x + 1, y + 1);
      out.fillStyle = "#e6f0d8";
      out.fillText(s, x, y);
    };
    if (Math.floor(now / 600) % 2 === 0 && !done) {
      out.fillStyle = "#d62b1b";
      out.beginPath();
      out.arc(14, 14, 4, 0, Math.PI * 2);
      out.fill();
    }
    text(done ? "NO SIGNAL" : "REC", 24, 8);
    text(cut ? "CAM 00" : `CAM ${String(exp.id % 100).padStart(2, "0")}`, OUT_W - 10, 8, "right");
    text(cut ? "NOBODY" : input.operator.toUpperCase(), 10, OUT_H - 36);
    const secs = Math.floor(exp.tick * 2.2);
    const clock = `L${input.depth}  T+${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    text(clock, 10, OUT_H - 20);
    text(cut ? "YOUR OFFICE" : input.levelName.toUpperCase().slice(0, 18), OUT_W - 10, OUT_H - 20, "right");
    if (exp.call && Math.floor(now / 500) % 2 === 0) text("AWAITING ORDERS", OUT_W / 2, 8, "center"); // a line in the top strip, not over the picture
    if (done) {
      out.fillStyle = "rgba(0,0,0,0.35)";
      out.fillRect(0, 0, OUT_W, OUT_H);
      text(exp.result && exp.result.survivors ? "FEED ENDED" : "SIGNAL LOST", OUT_W / 2, OUT_H / 2 - 6, "center");
    }
  }

  function loop(now: number): void {
    if (stopped) return;
    if (!canvas.isConnected) {
      stopped = true;
      return;
    }
    // Skip hidden tabs and collapsed windows; they cost battery for nothing.
    // Now and then the tape hangs on a frame, like a worn VHS.
    if (now > holdUntil && Math.random() < 0.004 + danger * 0.01 + input.infection / 20000) holdUntil = now + 90 + Math.random() * 160;
    if (!document.hidden && canvas.offsetParent && now > holdUntil && now - lastDrawn >= frameMs) {
      lastDrawn = now;
      render(now);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return { update };
}
