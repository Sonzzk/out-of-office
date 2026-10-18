import { DEAD_MEMOS, DEEP_CLEAN_AMOUNT, DEEP_CLEAN_COST, STAGE_MEMOS, STAGES } from "../data/infection";
import { Dice } from "./rng";
import { addInfection } from "./office";
import { addMemo, fill, type GameState } from "./state";

export const INFECTION_PER_DEATH = 2;
export const INFECTION_PER_RESEARCH = 2;
export const INFECTION_CREEP = 1; // per night once past the first stage

export function infectionStage(state: GameState): number {
  let stage = 0;
  STAGES.forEach((need, i) => state.infection >= need && (stage = i));
  return stage;
}

// Night: the infection creeps, and each new stage gets one memo.
export function nightInfection(state: GameState): void {
  if (infectionStage(state) >= 1) addInfection(state, INFECTION_CREEP);
  const stage = infectionStage(state);
  while (state.infectionSeen < stage) {
    state.infectionSeen++;
    const memo = STAGE_MEMOS[state.infectionSeen];
    if (memo) addMemo(state, memo);
  }
  deadWrite(state, stage);
}

// Deeper in, the people you lost keep writing: once on reaching stage two, every
// other night at stage three, every night at stage four.
function deadWrite(state: GameState, stage: number): void {
  const dead = state.crew.filter((w) => w.status === "dead");
  if (stage < 2 || !dead.length) return;
  const arrived = state.infectionSeen === stage && !state.events.last["dead-memo"] && stage === 2;
  const due = stage >= 4 || (stage === 3 && state.day % 2 === 0) || arrived;
  if (!due) return;
  const dice = new Dice((state.seed ^ Math.imul(state.day + 211, 2654435761)) >>> 0);
  const w = dice.pick(dead);
  const m = dice.pick(DEAD_MEMOS);
  state.events.last["dead-memo"] = state.day;
  const vars = { name: w.name, words: w.lastWords ?? "...", boss: "{boss}" };
  addMemo(state, { from: w.name, subject: m.subject, body: fill(m.body, vars) });
}

export const canDeepClean = (state: GameState) => state.infection > 0 && state.cash >= DEEP_CLEAN_COST;

export function deepClean(state: GameState): boolean {
  if (!canDeepClean(state)) return false;
  state.cash -= DEEP_CLEAN_COST;
  addInfection(state, -DEEP_CLEAN_AMOUNT);
  state.ledger.unshift({ day: state.day, text: "Deep clean (Facilities)", amount: -DEEP_CLEAN_COST });
  return true;
}

// How wrong the desktop should feel, 0..1.
export const uneaseFor = (state: GameState) => 0.15 + (state.infection / 100) * 0.85;
