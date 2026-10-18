import { UPGRADES, UPKEEP_PER_LATE_TIER, UPKEEP_PER_TIER, upgradeDef } from "../data/upgrades";
import type { GameState } from "./state";
import { has } from "./projects";

export const BASE_CREW_SLOTS = 2;

export const tier = (state: GameState, id: string) => state.upgrades[id] ?? 0;
export const nextTier = (state: GameState, id: string) => upgradeDef(id).tiers[tier(state, id)];
export const canUpgrade = (state: GameState, id: string) => {
  const next = nextTier(state, id);
  return !!next && state.cash >= next.cost;
};

export function buyUpgrade(state: GameState, id: string): boolean {
  if (!canUpgrade(state, id)) return false;
  const next = nextTier(state, id);
  state.cash -= next.cost;
  state.upgrades[id] = tier(state, id) + 1;
  state.ledger.unshift({ day: state.day, text: `Facilities: ${upgradeDef(id).name} ${state.upgrades[id]}`, amount: -next.cost });
  return true;
}

// What each upgrade does, read by the systems it changes.
export const crewSlots = (state: GameState) => BASE_CREW_SLOTS + tier(state, "dispatch") + (has(state, "floor2") ? 1 : 0);
export const benches = (state: GameState) => 1 + tier(state, "lab");
export const callWait = (state: GameState) => [1, 1.5, 2, 2.5, 3][tier(state, "mast")];
export const heatCooldown = (state: GameState) => [5, 8, 12, 16, 20][tier(state, "security")];
export const bribeDiscount = (state: GameState) => (tier(state, "security") >= 4 ? 0.5 : tier(state, "security") >= 2 ? 0.75 : 1);
export const moraleBoost = (state: GameState) => Math.min(3, tier(state, "breakroom"));
export const freeFirstAid = (state: GameState) => tier(state, "breakroom") >= 4;
export const upkeep = (state: GameState) =>
  UPGRADES.reduce((a, u) => a + Math.min(2, tier(state, u.id)) * UPKEEP_PER_TIER + Math.max(0, tier(state, u.id) - 2) * UPKEEP_PER_LATE_TIER, 0);
