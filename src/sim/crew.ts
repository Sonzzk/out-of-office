import { CLONE_PORTRAITS, LEVEL_XP, PEOPLE, QUIRKS, SKILL_LABEL, SKILLS, type Skill, type Source } from "../data/crew";
import { Dice } from "./rng";
import type { GameState } from "./state";
import { BARGAIN, twistIs } from "./twists";

export interface Worker {
  id: number;
  name: string;
  portrait: string;
  source: Source;
  cost: number; // one-off hiring fee (or bribe)
  skills: Record<Skill, number>; // 0..6
  quirks: string[]; // [visible, hidden]
  revealed: string[]; // quirks HR knows about
  status: "idle" | "out" | "busy" | "dead";
  assignment?: "contract" | "overtime"; // what a busy worker is doing today
  runs: number;
  xp: number;
  level: number;
  diedOnDay?: number;
  lastWords?: string;
  boost?: number; // extra Morale while on a run (break room)
  trainedDay?: number; // last day this person was sent on a course
}

export function quirkDef(id: string) {
  return QUIRKS.find((q) => q.id === id)!;
}

export const hasQuirk = (w: Worker, id: string) => w.quirks.includes(id);

// Hidden quirks still change skills; HR just can't see why.
export function skill(w: Worker, s: Skill): number {
  const mod = w.quirks.reduce((sum, q) => sum + (quirkDef(q).mods?.[s] ?? 0), 0) + (s === "morale" ? (w.boost ?? 0) : 0);
  return Math.max(0, Math.min(6, w.skills[s] + mod));
}

export const isVeteran = (w: Worker) => w.level >= 3;

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
    const visible = dice.pick(QUIRKS).id;
    const hidden = dice.pick(QUIRKS.filter((q) => q.reveal && q.id !== visible)).id;
    pool.push({
      id: state.nextId++,
      name,
      portrait,
      source,
      cost: Math.round((dice.range(...stats.cost) * (twistIs(state, "bargain") ? BARGAIN : 1)) / 10) * 10,
      skills,
      quirks: [visible, hidden],
      revealed: [visible],
      status: "idle",
      runs: 0,
      xp: 0,
      level: 1,
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

// Survivors earn xp; each new level raises one skill. Returns what changed,
// for the debrief.
export function gainXp(w: Worker, amount: number, dice: Dice): string[] {
  const notes: string[] = [];
  w.xp += amount;
  while (w.level < LEVEL_XP.length && w.xp >= LEVEL_XP[w.level]) {
    w.level++;
    const open = SKILLS.filter((s) => w.skills[s] < 6);
    if (open.length) {
      const s = dice.pick(open);
      w.skills[s]++;
      notes.push(`${w.name} reached level ${w.level} (+1 ${s === "nav" ? "Navigation" : s[0].toUpperCase() + s.slice(1)})${w.level === 3 ? " and is now a veteran" : ""}.`);
    }
  }
  return notes;
}

export function revealQuirk(w: Worker, id: string): boolean {
  if (!hasQuirk(w, id) || w.revealed.includes(id)) return false;
  w.revealed.push(id);
  return true;
}

// Training: pay for a course and the next level arrives at once, once a day. It also raises the nightly wage.
export const trainCost = (w: Worker) => 250 * w.level;
export const canTrain = (state: GameState, w: Worker) =>
  w.status === "idle" && w.level < LEVEL_XP.length && w.trainedDay !== state.day && state.cash >= trainCost(w);

export function train(state: GameState, workerId: number): boolean {
  const w = state.crew.find((x) => x.id === workerId);
  if (!w || !canTrain(state, w)) return false;
  const cost = trainCost(w);
  state.cash -= cost;
  w.trainedDay = state.day;
  state.ledger.unshift({ day: state.day, text: `Training course: ${w.name}`, amount: -cost });
  const before = { ...w.skills };
  gainXp(w, Math.max(1, LEVEL_XP[w.level] - w.xp), new Dice((state.seed ^ Math.imul(w.id + state.day, 40503)) >>> 0));
  const gained = SKILLS.find((s) => w.skills[s] > before[s]);
  state.ledger[0].text = `Training course: ${w.name}, level ${w.level}${gained ? `, +1 ${SKILL_LABEL[gained]}` : ""}`;
  return true;
}
