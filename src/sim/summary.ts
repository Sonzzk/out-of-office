import type { GameState } from "./state";

// One line for pasting somewhere: the day, how many people the building has
// kept, and the cash on hand.
export function daySummary(state: GameState): string {
  const lost = state.crew.filter((w) => w.status === "dead").length;
  return `Day ${state.day}, ${lost} lost, $${state.cash.toLocaleString("en-US")}`;
}
