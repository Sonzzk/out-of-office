import { CLONE_PORTRAITS, PEOPLE, QUIRKS, SKILLS, type Skill, type Source } from "../data/crew";
import { Dice } from "./rng";
import type { GameState } from "./state";

export interface Worker {
  id: number;
  name: string;
  portrait: string;
  source: Source;
  cost: number; // one-off hiring fee (or bribe)
  skills: Record<Skill, number>; // 0..6
  quirk: string;
  status: "idle" | "out" | "dead";
  runs: number;
  diedOnDay?: number;
  lastWords?: string;
}

export function quirkOf(w: Worker) {
  return QUIRKS.find((q) => q.id === w.quirk)!;
}

export function skill(w: Worker, s: Skill): number {
  const mod = quirkOf(w).mods?.[s] ?? 0;
  return Math.max(0, Math.min(6, w.skills[s] + mod));
}

const SOURCE_STATS: Record<Source, { weight: number; cost: [number, number]; skill: [number, number] }> = {
  desperate: { weight: 5, cost: [150, 300], skill: [1, 4] },
  prisoner: { weight: 2, cost: [380, 560], skill: [2, 5] },
  clone: { weight: 3, cost: [60, 110], skill: [1, 3] },
};

// Three candidates a day, the same three for a given save and day.
export function generatePool(state: GameState): Worker[] {
  const dice = new Dice(state.seed * 31 + state.day * 977);
  const taken = new Set(state.crew.filter((w) => w.status !== "dead").map((w) => w.name));
  const sources = (Object.keys(SOURCE_STATS) as Source[]).flatMap((s) => new Array(SOURCE_STATS[s].weight).fill(s) as Source[]);
  const pool: Worker[] = [];
  for (let i = 0; i < 3; i++) {
    const source = dice.pick(sources);
    const stats = SOURCE_STATS[source];
    let name: string;
    let portrait: string;
    if (source === "clone") {
      const n = dice.range(3, 98);
      name = `CLONE-${String(n).padStart(2, "0")}`;
      portrait = dice.pick(CLONE_PORTRAITS);
    } else {
      const free = PEOPLE.filter((p) => !taken.has(p.name));
      const person = dice.pick(free.length ? free : PEOPLE);
      name = person.name;
      portrait = person.portrait;
    }
    taken.add(name);
    const skills = Object.fromEntries(SKILLS.map((s) => [s, dice.range(...stats.skill)])) as Record<Skill, number>;
    pool.push({
      id: state.nextId++,
      name,
      portrait,
      source,
      cost: Math.round(dice.range(...stats.cost) / 10) * 10,
      skills,
      quirk: dice.pick(QUIRKS).id,
      status: "idle",
      runs: 0,
    });
  }
  return pool;
}

export function hire(state: GameState, workerId: number): boolean {
  const w = state.pool.find((p) => p.id === workerId);
  if (!w || state.cash < w.cost) return false;
  state.cash -= w.cost;
  state.ledger.unshift({ day: state.day, text: `Hired ${w.name} (${w.source === "prisoner" ? "bribe" : "fee"})`, amount: -w.cost });
  state.pool = state.pool.filter((p) => p.id !== workerId);
  state.crew.push(w);
  return true;
}
