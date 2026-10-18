import { ITEMS } from "../data/items";
import { EMPLOYEE_OF_THE_MONTH } from "../data/memos";
import { generatePool } from "./crew";
import { addMemo, fill, type GameState } from "./state";

export function sellPrice(itemId: string): number {
  return ITEMS[itemId].value;
}

export function sell(state: GameState, lootId: number): boolean {
  const item = state.loot.find((l) => l.id === lootId);
  if (!item) return false;
  const price = sellPrice(item.itemId);
  state.loot = state.loot.filter((l) => l !== item);
  state.cash += price;
  state.ledger.unshift({ day: state.day, text: `Sold ${ITEMS[item.itemId].name}`, amount: price });
  return true;
}

export function canEndDay(state: GameState): boolean {
  return !state.expeditions.some((e) => e.phase !== "done");
}

// New day: fresh hiring pool and the loot on Level 0 restocks. Finished
// expeditions are cleared so the map starts clean.
export function endDay(state: GameState): boolean {
  if (!canEndDay(state)) return false;
  // Whoever survived the most runs gets a plaque, if anyone went out today.
  const wentOut = state.expeditions.length > 0;
  const best = state.crew.filter((w) => w.status === "idle" && w.runs > 0).sort((a, b) => b.xp - a.xp)[0];
  if (wentOut && best) {
    const vars = { name: best.name, runs: best.runs, s: best.runs === 1 ? "" : "s", level: best.level };
    addMemo(state, { from: EMPLOYEE_OF_THE_MONTH.from, subject: fill(EMPLOYEE_OF_THE_MONTH.subject, vars), body: fill(EMPLOYEE_OF_THE_MONTH.body, vars) });
  }
  state.day++;
  state.takenToday = [];
  state.expeditions = [];
  state.pool = generatePool(state);
  return true;
}
