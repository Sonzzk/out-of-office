import { SKILL_LABEL, SKILLS } from "../data/crew";
import { DEAD_MEMOS, DEEP_CLEAN_AMOUNT, DEEP_CLEAN_COST, STAGE_MEMOS, STAGES, type DeadMemo } from "../data/infection";
import { quirkDef, skill, type Worker } from "./crew";
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
  const flags = (state.storyFlags ??= {});
  const sent = flags.deadMemos ?? 0;
  const m = pickDeadMemo(dice, sent, stage, flags.deadMemoLast ?? -1);
  flags.deadMemos = sent + 1;
  flags.deadMemoLast = DEAD_MEMOS.indexOf(m);
  state.events.last["dead-memo"] = state.day;
  addMemo(state, { from: w.name, subject: fill(m.subject, deadVars(w)), body: fill(m.body, deadVars(w)) });
}

// The first few are small talk; the later ones know where the Exit is. Never the
// same template twice running.
export function pickDeadMemo(dice: Dice, sent: number, stage: number, last = -1): DeadMemo {
  const tier = Math.min(2, Math.floor(sent / 3) + (stage >= 4 ? 1 : 0));
  let pool = DEAD_MEMOS.filter((m) => m.tier <= tier && m.tier >= Math.max(0, tier - 1));
  if (pool.length > 1) pool = pool.filter((m) => DEAD_MEMOS.indexOf(m) !== last);
  return dice.pick(pool);
}

// {boss} stays a placeholder: it is filled in with the signed name when shown.
function deadVars(w: Worker): Record<string, string | number> {
  const best = [...SKILLS].sort((a, b) => skill(w, b) - skill(w, a))[0];
  return {
    name: w.name,
    first: w.name.split(" ")[0],
    words: w.lastWords ?? "...",
    skill: SKILL_LABEL[best].toLowerCase(),
    quirk: (quirkDef(w.quirks[0])?.name ?? "reliable").toLowerCase(),
    rank: w.level,
    day: w.diedOnDay ?? 0,
    boss: "{boss}",
  };
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
