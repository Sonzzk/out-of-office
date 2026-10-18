import { FIRST, SECOND, SUFFIX } from "../data/companyWords";
import { WELCOME } from "../data/memos";
import type { Worker } from "./crew";
import { generatePool } from "./crew";
import type { Expedition } from "./expedition";
import type { IndexState } from "./research";
import { makeRng, pick } from "./rng";

export interface LootItem {
  id: number;
  itemId: string;
  foundBy: string;
}

export interface LedgerEntry {
  day: number;
  text: string;
  amount: number;
}

export interface Memo {
  id: number;
  from: string;
  subject: string;
  body: string;
  day: number;
  read: boolean;
  event?: { id: string; vars: Record<string, string | number>; choice?: number; result?: string }; // a memo that asks for a decision
}

// The whole save game. Pure data: no DOM, no classes, so it serializes as-is.
export interface GameState {
  version: number;
  seed: number;
  company: string;
  bossName: string;
  /** Set during onboarding; a save without one hasn't signed the paperwork yet. */
  catchphrase?: string;
  day: number;
  cash: number;
  heat: number; // 0..100, see concept.md "Heat meter"
  infection: number; // 0..100, office infection
  nextId: number;
  crew: Worker[];
  pool: Worker[];
  expeditions: Expedition[];
  loot: LootItem[];
  ledger: LedgerEntry[];
  memos: Memo[];
  level0Seed: number;
  fog: Record<string, number[]>; // per level id: 1 = revealed cell
  takenToday: Record<string, number[]>; // per level id: loot already picked up today
  index: Record<string, IndexState>;
  research: { itemId: string; startedDay: number }[]; // one sample per lab bench
  upgrades: Record<string, number>; // facility upgrade id -> tiers bought
  events: { last: Record<string, number>; count: Record<string, number> }; // overnight events: day last seen, times seen
  outageDay?: number; // the day the power is out
  target: { year: number; amount: number; deadline: number }; // the board's money target
  heatWarned: boolean; // Legal has already sent the warning memo
  infectionSeen: number; // highest infection stage that has had its memo
}

export const SAVE_VERSION = 9;
export const FIRST_TARGET = { year: 1, amount: 2500, deadline: 5 };

// Bring older saves up to date instead of throwing them away.
export function migrate(save: any): GameState | null {
  if (save?.version === 2) {
    for (const w of [...save.crew, ...save.pool]) {
      w.quirks = [w.quirk];
      w.revealed = [w.quirk];
      delete w.quirk;
      w.xp = w.runs ?? 0;
      w.level = 1;
    }
    for (const e of save.expeditions) e.encounters ??= 0;
    save.version = 3;
  }
  if (save?.version === 3) {
    save.index = { "level-0": { stage: 1, count: 0, dataSold: 0 } };
    save.target = { ...FIRST_TARGET, deadline: Math.max(FIRST_TARGET.deadline, save.day + 4) };
    for (const e of save.expeditions) {
      e.entities = [{ id: "smiler", pos: e.entity, cooldown: e.entityCooldown, seen: e.entitySeen }];
      delete e.entity;
      delete e.entityCooldown;
      delete e.entitySeen;
    }
    save.version = 4;
  }
  if (save?.version === 4) {
    save.heatWarned = false;
    for (const e of save.expeditions) e.callsMade ??= 0;
    save.version = 5;
  }
  if (save?.version === 5) {
    save.infectionSeen = 0;
    save.version = 6;
  }
  if (save?.version === 6) {
    save.fog = { "level-0": save.fog ?? [] };
    save.takenToday = { "level-0": save.takenToday ?? [] };
    for (const e of save.expeditions) e.levelId ??= "level-0";
    save.version = 7;
  }
  if (save?.version === 7) {
    save.research = save.research ? [save.research] : [];
    save.upgrades = {};
    for (const e of save.expeditions) {
      e.gear ??= [];
      e.used ??= [];
    }
    save.version = 8;
  }
  if (save?.version === 8) {
    save.events = { last: {}, count: {} };
    save.version = 9;
  }
  return save?.version === SAVE_VERSION ? (save as GameState) : null;
}

export function companyName(seed: number): string {
  const rng = makeRng(seed);
  const words = [pick(rng, FIRST), pick(rng, SECOND)];
  if (rng() < 0.6) words.push(pick(rng, SUFFIX));
  return words.join(" ");
}

export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function addMemo(state: GameState, memo: { from: string; subject: string; body: string }): void {
  // {company} and {boss} stay in the text and are filled when the memo is shown,
  // because both can change during onboarding.
  const vars = { day: state.day };
  state.memos.unshift({
    id: state.nextId++,
    from: memo.from,
    subject: fill(memo.subject, vars),
    body: fill(memo.body, vars),
    day: state.day,
    read: false,
  });
}

export function newGame(seed: number, bossName = "Boss"): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    company: companyName(seed),
    bossName,
    day: 1,
    cash: 1200,
    heat: 0,
    infection: 0,
    nextId: 1,
    crew: [],
    pool: [],
    expeditions: [],
    loot: [],
    ledger: [{ day: 1, text: "Seed money (do not ask whose)", amount: 1200 }],
    memos: [],
    level0Seed: (seed * 7919 + 13) >>> 0,
    fog: {},
    takenToday: {},
    index: { "level-0": { stage: 1, count: 0, dataSold: 0 } },
    target: { ...FIRST_TARGET },
    heatWarned: false,
    infectionSeen: 0,
    research: [],
    upgrades: {},
    events: { last: {}, count: {} },
  };
  state.pool = generatePool(state);
  addMemo(state, WELCOME);
  return state;
}
