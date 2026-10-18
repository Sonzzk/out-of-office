import { FIRST, SECOND, SUFFIX } from "../data/companyWords";
import { WELCOME } from "../data/memos";
import type { Worker } from "./crew";
import { generatePool } from "./crew";
import type { Expedition } from "./expedition";
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
}

// The whole save game. Pure data: no DOM, no classes, so it serializes as-is.
export interface GameState {
  version: number;
  seed: number;
  company: string;
  bossName: string;
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
  fog: number[]; // 1 = revealed cell on Level 0
  takenToday: number[]; // indices of Level 0 loot already picked up today
}

export const SAVE_VERSION = 2;

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
    fog: [],
    takenToday: [],
  };
  state.pool = generatePool(state);
  addMemo(state, WELCOME);
  return state;
}
