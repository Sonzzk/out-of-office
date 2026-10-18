import { ITEMS } from "../data/items";
import { Dice } from "./rng";

// A generated level is a grid of cells. Levels are rebuilt from their seed
// whenever needed, so saves only store the seed and what has been revealed.
export const WALL = 0;
export const FLOOR = 1;
export const DARK = 2; // floor with dead lights: entities like it here

export interface Pt {
  x: number;
  y: number;
}

export interface Level {
  w: number;
  h: number;
  cells: number[];
  entrance: Pt;
  loot: { at: Pt; itemId: string }[];
  entity: Pt; // where the Smiler starts
  spawns: { id: string; at: Pt }[]; // every entity on the level, Smiler first
}

export const idx = (lv: { w: number }, p: Pt) => p.y * lv.w + p.x;
export const isOpen = (lv: Level, p: Pt) =>
  p.x >= 0 && p.y >= 0 && p.x < lv.w && p.y < lv.h && lv.cells[idx(lv, p)] !== WALL;
export const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

// Level 0: random-walk carved halls with a few open rooms. Everything carved is
// connected to the entrance by construction.
export function generateLevel(seed: number, w = 30, h = 20): Level {
  const dice = new Dice(seed);
  const cells = new Array(w * h).fill(WALL);
  const entrance = { x: 1, y: Math.floor(h / 2) };
  const set = (x: number, y: number, v: number) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) cells[y * w + x] = v;
  };

  // Several drunk walkers starting from the entrance carve corridors.
  for (let walker = 0; walker < 5; walker++) {
    let p = { ...entrance };
    let dir = DIRS[0];
    for (let i = 0; i < 160; i++) {
      set(p.x, p.y, FLOOR);
      if (dice.chance(0.3)) dir = dice.pick(DIRS);
      const nx = Math.min(w - 2, Math.max(1, p.x + dir.x));
      const ny = Math.min(h - 2, Math.max(1, p.y + dir.y));
      p = { x: nx, y: ny };
      // Sometimes open a small room around the walker.
      if (dice.chance(0.04)) {
        const rw = dice.range(2, 4);
        const rh = dice.range(2, 3);
        for (let x = p.x; x < p.x + rw; x++) for (let y = p.y; y < p.y + rh; y++) set(x, y, FLOOR);
      }
    }
  }

  const floor: Pt[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] !== WALL) floor.push({ x, y });

  // Dead-light patches: grow a few blobs of dark floor away from the entrance.
  for (let b = 0; b < 4; b++) {
    const c = dice.pick(floor.filter((p) => dist(p, entrance) > 8));
    for (const p of floor) if (dist(p, c) <= dice.range(1, 3)) cells[p.y * w + p.x] = DARK;
  }

  // Loot, weighted by rarity, never right at the door.
  const pool = Object.values(ITEMS).flatMap((it) => new Array(it.rarity).fill(it.id) as string[]);
  const loot: Level["loot"] = [];
  const far = floor.filter((p) => dist(p, entrance) > 5);
  for (let i = 0; i < 7; i++) {
    const at = dice.pick(far);
    if (!loot.some((l) => l.at.x === at.x && l.at.y === at.y)) loot.push({ at, itemId: dice.pick(pool) });
  }

  const darkCells = floor.filter((p) => cells[p.y * w + p.x] === DARK);
  const entity = dice.pick(darkCells.length ? darkCells : far);
  // Picked after everything else so older seeds keep their layout.
  const lit = far.filter((p) => cells[p.y * w + p.x] === FLOOR && dist(p, entrance) > 10);
  const spawns = [
    { id: "smiler", at: entity },
    { id: "hound", at: dice.pick(lit.length ? lit : far) },
    { id: "faceling", at: dice.pick(far) },
  ];
  return { w, h, cells, entrance, loot, entity, spawns };
}

// Breadth-first path over open cells. Returns the steps after `from`, ending at
// `to`, or [] when already there.
export function findPath(lv: Level, from: Pt, to: Pt): Pt[] {
  const prev = new Map<number, number>();
  const start = idx(lv, from);
  const goal = idx(lv, to);
  const queue = [start];
  prev.set(start, -1);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goal) break;
    const cx = cur % lv.w;
    const cy = Math.floor(cur / lv.w);
    for (const d of DIRS) {
      const n = { x: cx + d.x, y: cy + d.y };
      if (!isOpen(lv, n)) continue;
      const ni = idx(lv, n);
      if (!prev.has(ni)) {
        prev.set(ni, cur);
        queue.push(ni);
      }
    }
  }
  if (!prev.has(goal)) return [];
  const path: Pt[] = [];
  for (let c = goal; c !== start; c = prev.get(c)!) path.unshift({ x: c % lv.w, y: Math.floor(c / lv.w) });
  return path;
}

export function nearestOpen(lv: Level, p: Pt): Pt {
  let best = lv.entrance;
  let bestD = Infinity;
  for (let y = 0; y < lv.h; y++)
    for (let x = 0; x < lv.w; x++) {
      const c = { x, y };
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (isOpen(lv, c) && d < bestD) {
        best = c;
        bestD = d;
      }
    }
  return best;
}

export function neighbors(lv: Level, p: Pt): Pt[] {
  return DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((n) => isOpen(lv, n));
}
