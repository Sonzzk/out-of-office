import { ITEMS } from "../data/items";
import { Dice } from "./rng";
import { addMemo, type GameState } from "./state";

// Optional Board contracts: hand over some of one item before the deadline for a good price.
export interface Contract {
  id: number;
  itemId: string;
  need: number;
  reward: number;
  deadline: number; // last day it can be delivered
}

export const MAX_CONTRACTS = 2;
const POOL = ["almond-water", "wallpaper", "polaroid", "flashlight", "royal-ration", "candy", "dumb-gum"];

export const contractText = (c: Contract) => `${c.need} x ${ITEMS[c.itemId].name}`;
export const contractHave = (s: GameState, c: Contract) => s.loot.filter((l) => l.itemId === c.itemId).length;
export const canDeliver = (s: GameState, c: Contract) => contractHave(s, c) >= c.need;

// Each morning: drop contracts that ran out, and offer a new one if there is room.
export function rollContracts(state: GameState): void {
  state.contracts = (state.contracts ?? []).filter((c) => c.deadline >= state.day); // expired ones just vanish
  if (state.day < 3 || state.contracts.length >= MAX_CONTRACTS) return;
  const dice = new Dice((state.seed ^ Math.imul(state.day + 727, 2246822519)) >>> 0);
  if (!dice.chance(0.6)) return;
  const options = POOL.filter((id) => ITEMS[id] && !state.contracts!.some((c) => c.itemId === id));
  if (!options.length) return;
  const itemId = dice.pick(options);
  const need = dice.range(2, 4);
  const reward = Math.round((ITEMS[itemId].value * need * 1.8) / 5) * 5;
  const c: Contract = { id: state.nextId++, itemId, need, reward, deadline: state.day + 5 };
  state.contracts.push(c);
  addMemo(state, {
    from: "The Board",
    subject: `Contract offer: ${contractText(c)}`,
    body: `A client wants ${contractText(c)}. Deliver them from the Ledger by Day ${c.deadline} and we will pay $${reward}. Sold one by one, at the usual price, they would bring about $${ITEMS[itemId].value * need}. You can decline it in the Ledger.\n\nIt is optional. We are only telling you because we can see you have nothing else planned.\n\n- The Board`,
  });
}

export function deliver(state: GameState, id: number): boolean {
  const c = state.contracts?.find((x) => x.id === id);
  if (!c || !canDeliver(state, c)) return false;
  let n = c.need;
  state.loot = state.loot.filter((l) => (l.itemId === c.itemId && n > 0 ? (n--, false) : true));
  state.cash += c.reward;
  state.ledger.unshift({ day: state.day, text: `Contract delivered: ${contractText(c)}`, amount: c.reward });
  state.contracts = state.contracts!.filter((x) => x !== c);
  return true;
}

// Turning an offer down just frees the slot. Items already on hand are yours to sell again.
export function declineContract(state: GameState, id: number): boolean {
  const c = state.contracts?.find((x) => x.id === id);
  if (!c) return false;
  state.contracts = state.contracts!.filter((x) => x !== c);
  return true;
}
