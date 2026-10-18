import { entityDef } from "../data/entities";
import { ITEMS } from "../data/items";
import type { Expedition } from "../sim/expedition";
import { DARK, WALL, type Level, type Pt } from "../sim/level";
import { sfx } from "./audio";

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

const hash = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

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
  let nextGlance = performance.now() + 2500;
  let lastFrame = performance.now();
  let holdUntil = 0;
  let stepPhase = 0;
  let lastStep = 0;
  let danger = 0;
  let lastBeat = 0;
  const spotted = new Set<string>();
  let stopped = false;

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

    // A head, not a turret. It reacts a beat late, turns at a human speed,
    // and every few seconds jerks to look at something that may not be there.
    if (Math.abs(rotate(target - heading)) > 0.3 && now > headHold) {
      if (!turning) {
        turning = true;
        headHold = now + 150 + Math.random() * 250; // the pause before the turn
      } else {
        turning = false;
        heading = target;
      }
    }
    if (Math.abs(rotate(target - heading)) <= 0.3) heading = target;
    if (!done && now > nextGlance) {
      const behind = Math.random() < 0.18;
      glance = (Math.random() < 0.5 ? -1 : 1) * (behind ? 2.5 : 0.6 + Math.random() * 0.9);
      glanceUntil = now + 450 + Math.random() * 700;
      nextGlance = glanceUntil + (2200 + Math.random() * 4500) / nervy;
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
    const drift = moving || done ? 0 : Math.sin(now / 1300) * 0.25;
    const shake = Math.sin(now / 37) * 0.006 + Math.sin(now / 91) * 0.01;
    const desired = (turning ? angle : heading) + (looking ? glance : 0) + drift;
    const diff = rotate(desired - angle);
    const maxRate = looking && Math.abs(diff) > 0.2 ? 4.2 : 1.35; // a flick out, a slow return
    const stepA = Math.max(-maxRate * dt, Math.min(maxRate * dt, diff * (1 - Math.exp(-5 * dt))));
    angle = rotate(angle + stepA);
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

    const flicker = (cx: number, cy: number) => (hash(cx, cy, Math.floor(now / 90)) > 0.97 ? 0.35 : 1);

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
      const lit = (dark ? 0.32 : 1) * flicker(prev.x, prev.y);
      const shade = Math.max(0.05, lit / (1 + perp * perp * 0.045)) * (side ? 0.8 : 1);
      for (let y = Math.max(0, y0); y < Math.min(H, y0 + lineH); y++) {
        const v = (y - y0) / lineH;
        // Yellow wallpaper: pinstripes, a dado line, a baseboard, and old stains.
        let r = 176;
        let g = 156;
        let b = 64;
        const stripe = Math.floor(u * 16) % 2 ? 0.9 : 1;
        r *= stripe;
        g *= stripe;
        b *= stripe;
        if (v > 0.9) {
          r = 70;
          g = 52;
          b = 30;
        } else if (v > 0.55 && v < 0.58) {
          r *= 0.7;
          g *= 0.7;
          b *= 0.7;
        }
        const stain = hash(Math.floor(u * 6) + mx * 7, Math.floor(v * 8) + my * 13);
        if (stain > 0.86) {
          r *= 0.72;
          g *= 0.7;
          b *= 0.6;
        }
        const o = (y * W + x) * 4;
        px[o] = r * shade;
        px[o + 1] = g * shade;
        px[o + 2] = b * shade;
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
        const base = (deadLight ? 0.3 : 1) * flicker(cx, cy);
        let r: number, g: number, b: number;
        if (y < horizon) {
          // Ceiling tiles with a fluorescent panel in the middle of every other cell.
          const ux = fx - cx;
          const uy = fy - cy;
          const panel = (cx + cy) % 2 === 0 && ux > 0.2 && ux < 0.8 && uy > 0.3 && uy < 0.7;
          const grid = ux < 0.04 || uy < 0.04;
          if (panel && !deadLight) {
            r = 255;
            g = 250;
            b = 220;
          } else {
            r = grid ? 120 : 168;
            g = grid ? 118 : 164;
            b = grid ? 100 : 140;
          }
        } else {
          // Damp carpet, a little uneven.
          const t = hash(Math.floor(fx * 10), Math.floor(fy * 10));
          r = 118 + t * 16;
          g = 100 + t * 14;
          b = 52 + t * 10;
        }
        const shadeF = Math.max(0.04, base / (1 + rowDist * rowDist * 0.05));
        const pn = y < horizon && (cx + cy) % 2 === 0 && !deadLight ? 1.25 : 1;
        px[o] = Math.min(255, r * shadeF * pn);
        px[o + 1] = Math.min(255, g * shadeF * pn);
        px[o + 2] = Math.min(255, b * shadeF * pn);
        px[o + 3] = 255;
      }
    }
    bctx.putImageData(frame, 0, 0);

    // Sprites: entities and loot that are in sight, far to near.
    type Spr = { x: number; y: number; src: string; scale: number; lift: number; thing: "entity" | "loot"; wob: number };
    const sprites: Spr[] = [];
    danger = exp.threat ? 1 : 0;
    if (!done) {
      for (const r of exp.entities) {
        const d = Math.hypot(r.pos.x - p.x, r.pos.y - p.y);
        danger = Math.max(danger, 1 - Math.min(1, d / 9));
        if (d < 10 && los(lv, p, r.pos)) {
          if (!spotted.has(r.id)) {
            spotted.add(r.id);
            sfx("growl");
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
    if (!sprites.some((q) => q.thing === "entity")) spotted.clear();
    // Heartbeat whenever something is near; faster the closer it gets.
    if (danger > 0.45 && now - lastBeat > 1300 - danger * 800) {
      lastBeat = now;
      sfx("thump");
    }
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
        tctx.fillStyle = `rgba(8,6,0,${Math.min(0.92, ty / FAR + 0.15)})`;
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
    const jitter = Math.random() < 0.02 + danger * 0.08 + stage / 2500 ? (Math.random() - 0.5) * 6 : 0;
    out.drawImage(buf, 0, 0, W, H, jitter, 0, OUT_W, OUT_H);

    // Tint toward the cold green of cheap sensors; red creeps in when something is near.
    out.globalCompositeOperation = "multiply";
    out.fillStyle = "rgb(205,225,190)";
    out.fillRect(0, 0, OUT_W, OUT_H);
    out.globalCompositeOperation = "source-over";
    if (danger > 0.35) {
      out.fillStyle = `rgba(150,20,10,${(danger - 0.35) * 0.35})`;
      out.fillRect(0, 0, OUT_W, OUT_H);
    }

    // Scanlines and vignette.
    out.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < OUT_H; y += 2) out.fillRect(0, y, OUT_W, 1);
    const vg = out.createRadialGradient(OUT_W / 2, OUT_H / 2, OUT_H * 0.35, OUT_W / 2, OUT_H / 2, OUT_W * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.65)");
    out.fillStyle = vg;
    out.fillRect(0, 0, OUT_W, OUT_H);

    // Grain, heavier when something is close or the office is infected.
    const grain = 0.05 + danger * 0.22 + stage / 400 + (done ? (exp.result && exp.result.survivors ? 0.25 : 0.85) : 0);
    for (let i = 0; i < nimg.data.length; i += 4) {
      const v = Math.random() * 255;
      nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = v;
      nimg.data[i + 3] = 255;
    }
    nctx.putImageData(nimg, 0, 0);
    out.globalAlpha = Math.min(0.9, grain);
    out.drawImage(noise, 0, 0, OUT_W, OUT_H);
    out.globalAlpha = 1;

    // A tracking band rolls down the picture now and then.
    const roll = (now / 25) % 900;
    if (roll < OUT_H + 20 && (danger > 0.2 || stage > 20 || Math.sin(now / 5000) > 0.8)) {
      out.globalAlpha = 0.35;
      out.drawImage(canvas, 0, Math.max(0, roll - 8), OUT_W, 14, Math.random() * 8 - 4, Math.max(0, roll - 8), OUT_W, 14);
      out.fillStyle = "rgba(255,255,255,0.08)";
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
    text(`CAM ${String(exp.id % 100).padStart(2, "0")}`, OUT_W - 10, 8, "right");
    text(input.operator.toUpperCase(), 10, OUT_H - 36);
    const secs = Math.floor(exp.tick * 2.2);
    const clock = `L${input.depth}  T+${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    text(clock, 10, OUT_H - 20);
    text(input.levelName.toUpperCase().slice(0, 18), OUT_W - 10, OUT_H - 20, "right");
    if (exp.call) text("AWAITING ORDERS", OUT_W / 2, 26, "center");
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
