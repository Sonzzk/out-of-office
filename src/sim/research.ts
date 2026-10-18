import { INDEX, indexEntry, STAGE_NAME, type Stage } from "../data/index";
import { ITEMS } from "../data/items";
import { WALL, type Level } from "./level";
import { addHeat, addInfection, HEAT_PER_DATA_SALE } from "./office";
import type { GameState } from "./state";

// What the company knows about each Index entry. Stages only ever go up.
export interface IndexState {
  stage: Stage;
  by?: string; // who first saw it, for the "Discovered by" line
  count: number; // items brought home, or samples researched
  dataSold: Stage; // highest stage whose data has been sold
}

export const ITEMS_TO_DOCUMENT = 3;
export const SAMPLES_TO_DOCUMENT = 1;
export const SAMPLES_TO_MASTER = 2;
export const SURVEY_DOCUMENTED = 0.5;
export const SURVEY_MASTERED = 0.9;

export function known(state: GameState, id: string): IndexState {
  return (state.index[id] ??= { stage: 0, count: 0, dataSold: 0 });
}

export const stageOf = (state: GameState, id: string): Stage => state.index[id]?.stage ?? 0;
export const isMastered = (state: GameState, id: string) => stageOf(state, id) >= 3;

// Raise an entry to at least `stage`. Returns a note when something changed.
export function learn(state: GameState, id: string, stage: Stage, by?: string): string | null {
  const k = known(state, id);
  const e = indexEntry(id);
  const target = Math.min(stage, e.maxStage) as Stage;
  if (target <= k.stage) return null;
  k.stage = target;
  if (by && !k.by) k.by = by;
  return `Index updated: ${e.name} is now ${STAGE_NAME[target]}.`;
}

// Share of Level 0's open cells the crews have seen.
export function surveyed(state: GameState, lv: Level): number {
  let open = 0;
  let seen = 0;
  lv.cells.forEach((c, i) => {
    if (c === WALL) return;
    open++;
    if (state.fog[i]) seen++;
  });
  return open ? seen / open : 0;
}

export function checkSurvey(state: GameState, lv: Level): string | null {
  const s = surveyed(state, lv);
  const stage: Stage = s >= SURVEY_MASTERED ? 3 : s >= SURVEY_DOCUMENTED ? 2 : 1;
  return learn(state, "level-0", stage);
}

// Loot that reached the office counts toward documenting the item.
export function broughtHome(state: GameState, itemId: string, by: string): string | null {
  if (ITEMS[itemId].sampleOf) return null;
  const k = known(state, itemId);
  k.count++;
  return learn(state, itemId, k.count >= ITEMS_TO_DOCUMENT ? 2 : 1, by);
}

// --- Lab: one bench, one sample a day. Selling a sample means it can't be researched.
export function canResearch(state: GameState, lootId: number): boolean {
  const item = state.loot.find((l) => l.id === lootId);
  return !!item && !!ITEMS[item.itemId].sampleOf && !state.research && !isMastered(state, ITEMS[item.itemId].sampleOf!);
}

export function startResearch(state: GameState, lootId: number): boolean {
  if (!canResearch(state, lootId)) return false;
  const item = state.loot.find((l) => l.id === lootId)!;
  state.loot = state.loot.filter((l) => l !== item);
  state.research = { itemId: item.itemId, startedDay: state.day };
  return true;
}

// Runs at the end of the day.
export function finishResearch(state: GameState): string | null {
  if (!state.research) return null;
  const entity = ITEMS[state.research.itemId].sampleOf!;
  state.research = undefined;
  addInfection(state, 2); // whatever was in the jar is in the building now
  const k = known(state, entity);
  k.count++;
  const stage: Stage = k.count >= SAMPLES_TO_MASTER ? 3 : k.count >= SAMPLES_TO_DOCUMENT ? 2 : 1;
  return learn(state, entity, stage) ?? `The lab finished with the ${indexEntry(entity).name} sample. Nothing new.`;
}

// Collectors pay for data once per stage reached.
export function dataPrice(state: GameState, id: string): number {
  const k = state.index[id];
  if (!k || k.stage < 2 || k.dataSold >= k.stage) return 0;
  const e = indexEntry(id);
  // Selling Mastered data after Documented data only pays the difference.
  const worth = (s: number) => (s >= 3 ? e.dataValue * 2.5 : s >= 2 ? e.dataValue : 0);
  return Math.round(worth(k.stage) - worth(k.dataSold));
}

export function sellData(state: GameState, id: string): number {
  const price = dataPrice(state, id);
  if (!price) return 0;
  state.index[id].dataSold = state.index[id].stage;
  addHeat(state, HEAT_PER_DATA_SALE); // collectors talk
  state.cash += price;
  state.ledger.unshift({ day: state.day, text: `Sold ${indexEntry(id).name} data`, amount: price });
  return price;
}

export function indexProgress(state: GameState): { found: number; total: number } {
  return { found: INDEX.filter((e) => stageOf(state, e.id) > 0).length, total: INDEX.length };
}

