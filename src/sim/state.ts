import { FIRST, SECOND, SUFFIX } from "../data/companyWords";
import { makeRng, pick } from "./rng";

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
}

export const SAVE_VERSION = 1;

export function companyName(seed: number): string {
  const rng = makeRng(seed);
  const words = [pick(rng, FIRST), pick(rng, SECOND)];
  if (rng() < 0.6) words.push(pick(rng, SUFFIX));
  return words.join(" ");
}

export function newGame(seed: number, bossName = "Boss"): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    company: companyName(seed),
    bossName,
    day: 1,
    cash: 2500,
    heat: 0,
    infection: 0,
  };
}
