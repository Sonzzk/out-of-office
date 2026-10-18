import { Dice } from "./rng";
import { addMemo, type GameState } from "./state";

export type GoalKind = "haul" | "earn" | "home";
export interface Goal {
  kind: GoalKind;
  need: number;
  have: number;
  reward: number;
  day: number;
  done?: boolean;
}

// The Board sets one small goal each morning. Meeting it pays a bonus.
const WORDS: Record<GoalKind, (g: Goal) => string> = {
  haul: (g) => `Bring home ${g.need} find${g.need === 1 ? "" : "s"} today.`,
  earn: (g) => `Sell $${g.need} of loot today.`,
  home: (g) => `Get ${g.need} crew${g.need === 1 ? "" : "s"} home alive today.`,
};
export const goalText = (g: Goal) => WORDS[g.kind](g);

export function newGoal(state: GameState, day = state.day): Goal {
  const dice = new Dice((state.seed ^ Math.imul(day + 313, 2246822519)) >>> 0);
  const kind = dice.pick<GoalKind>(["haul", "earn", "home"]);
  const staff = Math.max(1, state.crew.filter((w) => w.status !== "dead").length);
  const need = kind === "haul" ? 2 + Math.min(3, Math.floor(day / 6)) : kind === "earn" ? 150 + 25 * Math.min(12, day) : Math.min(2, Math.max(1, Math.ceil(staff / 2)));
  return { kind, need, have: 0, reward: kind === "earn" ? Math.round(need * 0.35) : 80 + 6 * Math.min(15, day), day };
}

// Set the day's goal, and tell the player about it.
export function setGoal(state: GameState, day = state.day): void {
  state.goal = newGoal(state, day);
  addMemo(state, {
    from: "The Board",
    subject: `Today's goal (Day ${day})`,
    body: `${goalText(state.goal)}\n\nMeet it and Accounting will release $${state.goal.reward}. It's in the Ledger if you lose track.\n\n- The Board`,
  });
}

export function noteGoal(state: GameState, kind: GoalKind, n: number): void {
  const g = state.goal;
  if (!g || g.done || g.kind !== kind || g.day !== state.day) return;
  g.have += n;
  if (g.have < g.need) return;
  g.done = true;
  state.cash += g.reward;
  state.ledger.unshift({ day: state.day, text: "The Board: goal met", amount: g.reward });
}
