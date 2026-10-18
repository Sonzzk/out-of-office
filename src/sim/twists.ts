import { Dice } from "./rng";
import type { GameState } from "./state";

// Each morning has a chance of a twist you can see on the desktop and feel in the numbers.
export interface TwistDef {
  id: string;
  name: string;
  text: string;
}

export const TWISTS: TwistDef[] = [
  { id: "buyer", name: "Collector in town", text: "A collector is paying 40% over the usual price for everything today. He will not say where he parks." },
  { id: "bargain", name: "Staffing agency sale", text: "The agency is clearing its books. Today's applicants cost 30% less. Ask no questions about the refund policy." },
  { id: "fog", name: "Fog on every floor", text: "Something is wrong with the lights. Crews see about a third less on every level today." },
  { id: "rush", name: "Quarter-end rush", text: "Accounting wants the figures early. Today's goal pays double and nobody will say why." },
];

export const TWIST_CHANCE = 0.55;
export const BUYER_BONUS = 1.4;
export const BARGAIN = 0.7;
export const RUSH_BONUS = 2;

export const twistDef = (id: string) => TWISTS.find((t) => t.id === id)!;
export const twistToday = (s: GameState): TwistDef | undefined => (s.twist && s.twist.day === s.day ? twistDef(s.twist.id) : undefined);
export const twistIs = (s: GameState, id: string) => s.twist?.day === s.day && s.twist.id === id;

// Called once the new day has started, before the pool is made.
export function rollTwist(state: GameState): void {
  delete state.twist;
  if (state.day < 3) return;
  const dice = new Dice((state.seed ^ Math.imul(state.day + 509, 2654435761)) >>> 0);
  if (!dice.chance(TWIST_CHANCE)) return;
  const prev = state.twistLast;
  const pool = TWISTS.filter((t) => t.id !== prev);
  const pick = dice.pick(pool);
  state.twist = { id: pick.id, day: state.day };
  state.twistLast = pick.id;
}
