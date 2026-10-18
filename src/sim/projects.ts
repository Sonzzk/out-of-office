import { ITEMS } from "../data/items";
import { projectDef, RECOVER_COST } from "../data/projects";
import { addHeat, addInfection } from "./office";
import { Dice } from "./rng";
import { addMemo, type GameState } from "./state";

export const has = (state: GameState, id: string) => !!state.projects?.includes(id);

export const canBuyProject = (state: GameState, id: string) => !has(state, id) && state.cash >= projectDef(id).cost;

export function buyProject(state: GameState, id: string): boolean {
  if (!canBuyProject(state, id)) return false;
  const p = projectDef(id);
  state.cash -= p.cost;
  (state.projects ??= []).push(id);
  state.ledger.unshift({ day: state.day, text: `Project: ${p.name}`, amount: -p.cost });
  return true;
}

// What a death does to the outside world and the building, with projects.
export const deathHeat = (state: GameState, heatPerDeath: number) => (has(state, "cage") ? Math.round(heatPerDeath / 2) : heatPerDeath);
export const deathInfection = (state: GameState) => (has(state, "memorial") ? 1 : 2);
export const saleMultiplier = (state: GameState) => (has(state, "corner") ? 1.1 : 1);

// Estate recovery: pay to get a lost colleague's belongings back from the Index.
export const canRecover = (state: GameState, workerId: number) =>
  state.cash >= RECOVER_COST && state.crew.some((w) => w.id === workerId && w.status === "dead") && !state.recovered?.includes(workerId);

export function recoverBelongings(state: GameState, workerId: number): boolean {
  if (!canRecover(state, workerId)) return false;
  const w = state.crew.find((x) => x.id === workerId)!;
  const dice = new Dice((state.seed ^ Math.imul(workerId + 3, 2654435761)) >>> 0);
  const rare = Object.values(ITEMS).filter((i) => i.rarity > 0 && i.value >= 300);
  const item = dice.pick(rare);
  state.cash -= RECOVER_COST;
  (state.recovered ??= []).push(workerId);
  state.ledger.unshift({ day: state.day, text: `Estate recovery: ${w.name}`, amount: -RECOVER_COST });
  state.loot.push({ id: state.nextId++, itemId: item.id, foundBy: "Estate Office" });
  addInfection(state, -4);
  addHeat(state, -5);
  addMemo(state, {
    from: "Estate Office",
    subject: `${w.name}'s belongings`,
    body: `We recovered ${w.name}'s desk drawer and one ${item.name} that was not theirs. The family has been told it was quick.\n\nThe building seems calmer. The invoice is on the Ledger.`,
  });
  return true;
}
