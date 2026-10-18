import { ITEMS } from "../data/items";
import { SOURCE_INFO } from "../data/crew";
import { EMPLOYEE_OF_THE_MONTH, PAYROLL, RESEARCH_DONE, TARGET_MET, TARGET_MISSED } from "../data/memos";
import { generatePool, isVeteran, type Worker } from "./crew";
import { finishResearch } from "./research";
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
  const lab = finishResearch(state);
  if (lab) addMemo(state, { ...RESEARCH_DONE, body: fill(RESEARCH_DONE.body, { note: lab }) });
  payroll(state);
  state.day++;
  checkTarget(state);
  state.takenToday = [];
  state.expeditions = [];
  state.pool = generatePool(state);
  return true;
}

// Daily wages. Veterans know what they're worth.
export const VETERAN_BONUS = 20;
export function wage(w: Worker): number {
  return SOURCE_INFO[w.source].wage + (isVeteran(w) ? VETERAN_BONUS : 0);
}

function payroll(state: GameState): void {
  const staff = state.crew.filter((w) => w.status !== "dead");
  if (!staff.length) return;
  const total = staff.reduce((s, w) => s + wage(w), 0);
  state.cash -= total;
  state.ledger.unshift({ day: state.day, text: `Payroll (${staff.length})`, amount: -total });
  addMemo(state, {
    from: PAYROLL.from,
    subject: PAYROLL.subject,
    body: fill(PAYROLL.body, { count: staff.length, s: staff.length === 1 ? "" : "s", total: money(total) }),
  });
}

// The Board checks the bank balance the morning of the deadline.
function checkTarget(state: GameState): void {
  const t = state.target;
  if (state.day < t.deadline) return;
  if (state.cash >= t.amount) {
    const next = { year: t.year + 1, amount: Math.round((t.amount * 1.8) / 500) * 500, deadline: state.day + 7 };
    state.target = next;
    addMemo(state, { from: TARGET_MET.from, subject: fill(TARGET_MET.subject, { year: t.year }), body: fill(TARGET_MET.body, { amount: money(next.amount), deadline: next.deadline }) });
  } else {
    t.deadline = state.day + 3;
    addMemo(state, { from: TARGET_MISSED.from, subject: fill(TARGET_MISSED.subject, { year: t.year }), body: fill(TARGET_MISSED.body, { amount: money(t.amount), cash: money(state.cash), deadline: t.deadline }) });
  }
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
