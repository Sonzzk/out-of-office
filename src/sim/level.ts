import { entityDef } from "../data/entities";
import { LEVELS, type LevelDef } from "../data/levels";
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

// Generate a level from its seed and definition. Every style carves open cells
// into a wall grid; cells not reachable from the entrance are filled back in.
export function generateLevel(seed: number, def: LevelDef = LEVELS[0], w = 30, h = 20): Level {
  const dice = new Dice(seed);
  const cells = new Array(w * h).fill(WALL);
  const entrance = { x: 1, y: Math.floor(h / 2) };
  const set = (x: number, y: number, v: number) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) cells[y * w + x] = v;
  };
  CARVE[def.style](dice, set, w, h, entrance);
  set(entrance.x, entrance.y, FLOOR);
  if (def.style !== "halls") prune(cells, w, h, entrance);

  const floor: Pt[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] !== WALL) floor.push({ x, y });

  // Dead-light patches: grow a few blobs of dark floor away from the entrance.
  for (let b = 0; b < def.darkBlobs; b++) {
    const c = dice.pick(floor.filter((p) => dist(p, entrance) > 8));
    for (const p of floor) if (dist(p, c) <= dice.range(1, 3)) cells[p.y * w + p.x] = DARK;
  }

  // Loot, weighted, never right at the door.
  const pool = def.loot.flatMap(([id, weight]) => new Array(weight).fill(id) as string[]);
  const loot: Level["loot"] = [];
  const far = floor.filter((p) => dist(p, entrance) > 5);
  for (let i = 0; i < def.lootCount; i++) {
    const at = dice.pick(far);
    if (!loot.some((l) => l.at.x === at.x && l.at.y === at.y)) loot.push({ at, itemId: dice.pick(pool) });
  }

  // Dark hunters start in the dark, lit hunters in the lit halls, the rest anywhere far.
  const darkCells = floor.filter((p) => cells[p.y * w + p.x] === DARK);
  const lit = far.filter((p) => cells[p.y * w + p.x] === FLOOR && dist(p, entrance) > 10);
  const spawns = def.entities.map((id) => ({
    id,
    at: ((moves) => (moves === "dark" ? dice.pick(darkCells.length ? darkCells : far) : moves === "lit" ? dice.pick(lit.length ? lit : far) : dice.pick(far)))(
      entityDef(id).moves,
    ),
  }));
  const entity = spawns.find((s) => s.id === "smiler")?.at ?? spawns[0].at;
  return { w, h, cells, entrance, loot, entity, spawns };
}

type Carver = (dice: Dice, set: (x: number, y: number, v: number) => void, w: number, h: number, entrance: Pt) => void;

const CARVE: Record<LevelDef["style"], Carver> = {
  // Level 0: random-walk carved halls with a few open rooms.
  halls(dice, set, w, h, entrance) {
    for (let walker = 0; walker < 5; walker++) {
      let p = { ...entrance };
      let dir = DIRS[0];
      for (let i = 0; i < 160; i++) {
        set(p.x, p.y, FLOOR);
        if (dice.chance(0.3)) dir = dice.pick(DIRS);
        p = { x: Math.min(w - 2, Math.max(1, p.x + dir.x)), y: Math.min(h - 2, Math.max(1, p.y + dir.y)) };
        if (dice.chance(0.04)) {
          const rw = dice.range(2, 4);
          const rh = dice.range(2, 3);
          for (let x = p.x; x < p.x + rw; x++) for (let y = p.y; y < p.y + rh; y++) set(x, y, FLOOR);
        }
      }
    }
  },
  // Warehouse: open floor cut by long shelving rows with gaps.
  aisles(dice, set, w, h) {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) set(x, y, FLOOR);
    for (let x = 3; x < w - 2; x += 3) {
      for (let y = 2; y < h - 2; y++) set(x, y, WALL);
      const gaps = dice.range(1, 3);
      for (let g = 0; g < gaps; g++) {
        const gy = dice.range(2, h - 3);
        set(x, gy, FLOOR);
        set(x, gy + 1, FLOOR);
      }
    }
    for (let i = 0; i < 8; i++) set(dice.range(2, w - 3), dice.range(2, h - 3), WALL); // stray crates
  },
  // Pipe tunnels: long straight runs crossing each other.
  pipes(dice, set, w, h, entrance) {
    for (let x = 1; x < w - 1; x++) set(x, entrance.y, FLOOR);
    for (let i = 0; i < 7; i++) {
      const x = dice.range(3, w - 3);
      const y0 = dice.range(1, h / 2);
      for (let y = y0; y < Math.min(h - 1, y0 + dice.range(6, h)); y++) set(x, y, FLOOR);
    }
    for (let i = 0; i < 5; i++) {
      const y = dice.range(1, h - 2);
      const x0 = dice.range(1, w / 2);
      for (let x = x0; x < Math.min(w - 1, x0 + dice.range(8, w)); x++) set(x, y, FLOOR);
    }
  },
  // Machine rooms joined by L-shaped corridors.
  machines(dice, set, w, h, entrance) {
    let prev = { ...entrance };
    for (let r = 0; r < 8; r++) {
      const rw = dice.range(3, 6);
      const rh = dice.range(3, 5);
      const rx = dice.range(2, w - rw - 2);
      const ry = dice.range(1, h - rh - 2);
      for (let x = rx; x < rx + rw; x++) for (let y = ry; y < ry + rh; y++) set(x, y, FLOOR);
      const c = { x: rx + Math.floor(rw / 2), y: ry + Math.floor(rh / 2) };
      for (let x = Math.min(prev.x, c.x); x <= Math.max(prev.x, c.x); x++) set(x, prev.y, FLOOR);
      for (let y = Math.min(prev.y, c.y); y <= Math.max(prev.y, c.y); y++) set(c.x, y, FLOOR);
      prev = c;
    }
  },
  // Open plan: one big floor with pillars and a few cubicle walls.
  openplan(dice, set, w, h) {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) set(x, y, FLOOR);
    for (let x = 4; x < w - 2; x += 5) for (let y = 3; y < h - 2; y += 5) set(x, y, WALL);
    for (let i = 0; i < 10; i++) {
      const x = dice.range(3, w - 6);
      const y = dice.range(2, h - 3);
      const horizontal = dice.chance(0.5);
      for (let k = 0; k < 3; k++) set(horizontal ? x + k : x, horizontal ? y : y + k, WALL);
    }
  },
  // Hotel: a main corridor with side corridors lined by small rooms.
  hotel(dice, set, w, h, entrance) {
    for (let x = 1; x < w - 1; x++) set(x, entrance.y, FLOOR);
    for (let x = 4; x < w - 2; x += dice.range(4, 6)) {
      const up = dice.chance(0.5) || x % 2 === 0;
      const down = !up || dice.chance(0.5);
      for (const dir of [up ? -1 : 0, down ? 1 : 0].filter(Boolean)) {
        for (let y = entrance.y; y > 0 && y < h - 1; y += dir) set(x, y, FLOOR);
        // Rooms off the side corridor, through one-cell doors.
        for (let y = entrance.y + dir * 2; y > 1 && y < h - 2; y += dir * 3) {
          const side = dice.chance(0.5) ? 1 : -1;
          set(x + side, y, FLOOR);
          for (let rx = 0; rx < 2; rx++) for (let ry = -1; ry <= 0; ry++) set(x + side * (2 + rx), y + ry, FLOOR);
        }
      }
    }
  },
};

// Fill in any open cell the entrance can't reach.
function prune(cells: number[], w: number, h: number, entrance: Pt): void {
  const seen = new Uint8Array(w * h);
  const queue = [entrance.y * w + entrance.x];
  seen[queue[0]] = 1;
  while (queue.length) {
    const cur = queue.pop()!;
    const x = cur % w;
    const y = Math.floor(cur / w);
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      const ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ni] || cells[ni] === WALL) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  for (let i = 0; i < cells.length; i++) if (!seen[i]) cells[i] = WALL;
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
