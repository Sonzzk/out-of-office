import { goalText, noteGoal, setGoal } from "./goals";
import { ITEMS } from "../data/items";
import { SOURCE_INFO } from "../data/crew";
import { EMPLOYEE_OF_THE_MONTH, PAYROLL, RESEARCH_DONE, TARGET_MET, TARGET_MISSED, TARGET_REACHED } from "../data/memos";
import { generatePool, isVeteran, type Worker } from "./crew";
import { rollEvent, resolvePending } from "./events";
import { benches, upkeep } from "./facilities";
import { nightInfection } from "./infection";
import { nightShift } from "./office";
import { storyNight } from "./story";
import { saleMultiplier } from "./projects";
import { contractHave, contractText, rollContracts } from "./contracts";
import { BUYER_BONUS, rollTwist, twistIs } from "./twists";
import { canResearch, finishResearch } from "./research";
import { addMemo, fill, type GameState, type LedgerEntry } from "./state";

export function sellPrice(itemId: string, state?: GameState): number {
  return Math.round(ITEMS[itemId].value * (state ? saleMultiplier(state) * (twistIs(state, "buyer") ? BUYER_BONUS : 1) : 1));
}

export const FIRST_SALE_BONUS = 100;

export function sell(state: GameState, lootId: number): boolean {
  const item = state.loot.find((l) => l.id === lootId);
  if (!item) return false;
  const price = sellPrice(item.itemId, state);
  state.loot = state.loot.filter((l) => l !== item);
  state.cash += price;
  state.ledger.unshift({ day: state.day, text: `Sold ${ITEMS[item.itemId].name}`, amount: price });
  noteGoal(state, "earn", price);
  // Accounting pays a little extra the very first time, so day one is not a loss.
  if (!state.firstSale) {
    state.firstSale = true;
    state.cash += FIRST_SALE_BONUS;
    state.ledger.unshift({ day: state.day, text: "Accounting: first-sale bonus (the form said so)", amount: FIRST_SALE_BONUS });
  }
  noteTargetReached(state);
  return true;
}

// Loot that Sell all leaves alone: what an open contract still needs (as many
// of each item as the contract asks for) and research samples.
export interface Reserved {
  contract: Set<number>;
  samples: Set<number>;
}
export function reservedLoot(state: GameState): Reserved {
  const contract = new Set<number>();
  for (const c of state.contracts ?? []) {
    let n = c.need;
    for (const l of state.loot) if (n > 0 && l.itemId === c.itemId && !contract.has(l.id)) (contract.add(l.id), n--);
  }
  const samples = new Set(state.loot.filter((l) => ITEMS[l.itemId].sampleOf && !contract.has(l.id)).map((l) => l.id));
  return { contract, samples };
}

// What Sell all would do right now, for the confirm line.
export interface SellPreview {
  count: number;
  total: number;
  keptContract: number;
  keptSamples: number;
  priciest?: { name: string; price: number }; // the single most valuable thing in the sale
}
export function sellAllPreview(state: GameState): SellPreview {
  const r = reservedLoot(state);
  const p: SellPreview = { count: 0, total: 0, keptContract: r.contract.size, keptSamples: r.samples.size };
  for (const l of state.loot) {
    if (r.contract.has(l.id) || r.samples.has(l.id)) continue;
    const price = sellPrice(l.itemId, state);
    p.count++;
    p.total += price;
    if (!p.priciest || price > p.priciest.price) p.priciest = { name: ITEMS[l.itemId].name, price };
  }
  return p;
}

export function sellAll(state: GameState): number {
  const r = reservedLoot(state);
  let total = 0;
  for (const l of [...state.loot]) {
    if (r.contract.has(l.id) || r.samples.has(l.id)) continue;
    const price = sellPrice(l.itemId, state);
    if (sell(state, l.id)) total += price;
  }
  return total;
}

// A short undo for Sell all: everything it touched, put back while nothing else has happened since.
export interface SaleSnapshot {
  day: number;
  cash: number;
  loot: GameState["loot"];
  ledger: LedgerEntry[];
  goal: GameState["goal"];
  firstSale: boolean | undefined;
  memos: number;
  targetNoted: number | undefined;
  after: number; // ledger length once the sale was done
}
export function sellAllWithUndo(state: GameState): { total: number; undo: SaleSnapshot } {
  const undo: SaleSnapshot = {
    day: state.day,
    cash: state.cash,
    loot: [...state.loot],
    ledger: [...state.ledger],
    goal: state.goal ? { ...state.goal } : undefined,
    firstSale: state.firstSale,
    memos: state.memos.length,
    targetNoted: state.targetNoted,
    after: 0,
  };
  const total = sellAll(state);
  undo.after = state.ledger.length;
  return { total, undo };
}
export function undoSale(state: GameState, snap: SaleSnapshot): boolean {
  if (state.day !== snap.day || state.ledger.length !== snap.after) return false;
  state.cash = snap.cash;
  state.loot = [...snap.loot];
  state.ledger = [...snap.ledger];
  state.goal = snap.goal;
  state.firstSale = snap.firstSale;
  state.memos.splice(0, Math.max(0, state.memos.length - snap.memos));
  state.targetNoted = snap.targetNoted;
  return true;
}

// Things worth knowing before the books close. Empty means nothing to flag.
export function closeWarnings(state: GameState): string[] {
  const out: string[] = [];
  const g = state.goal;
  if (g && g.day === state.day && !g.done) out.push(`Today's goal is not met: ${goalText(g)} (${g.have}/${g.need}). The bonus is lost at midnight.`);
  for (const c of state.contracts ?? []) {
    if (c.deadline > state.day) continue;
    const have = Math.min(c.need, contractHave(state, c));
    out.push(`The contract for ${contractText(c)} runs out tonight (${have}/${c.need}). It pays $${c.reward.toLocaleString("en-US")}.`);
  }
  const free = benches(state) - state.research.length;
  const waiting = state.loot.filter((l) => canResearch(state, l.id)).length;
  if (free > 0 && waiting > 0) out.push(`${free === 1 ? "A lab bench is" : `${free} lab benches are`} empty and ${waiting === 1 ? "a sample is" : `${waiting} samples are`} in storage.`);
  const sale = sellAllPreview(state);
  if (sale.count > 0) out.push(`${sale.count} item${sale.count === 1 ? "" : "s"} unsold, worth ${money(sale.total)}.`);
  return out;
}

// What a training course adds to the nightly wage.
export const trainWageRise = (w: Worker) => wage({ ...w, level: w.level + 1 }) - wage(w);

export function canEndDay(state: GameState): boolean {
  return !state.expeditions.some((e) => e.phase !== "done");
}

// New day: fresh hiring pool and the loot on Level 0 restocks. Finished
// expeditions are cleared so the map starts clean.
export function endDay(state: GameState): boolean {
  if (!canEndDay(state)) return false;
  resolvePending(state);
  noteTargetReached(state); // before tonight's memos, so it reads as today's news
  const memosBefore = state.memos.length;
  setGoal(state, state.day + 1); // lands under tonight's other memos
  // Whoever survived the most runs gets a plaque, if anyone went out today.
  const wentOut = state.expeditions.length > 0;
  const best = state.crew.filter((w) => w.status === "idle" && w.runs > 0).sort((a, b) => b.xp - a.xp)[0];
  if (wentOut && best) {
    const vars = { name: best.name, runs: best.runs, s: best.runs === 1 ? "" : "s", level: best.level };
    addMemo(state, { from: EMPLOYEE_OF_THE_MONTH.from, subject: fill(EMPLOYEE_OF_THE_MONTH.subject, vars), body: fill(EMPLOYEE_OF_THE_MONTH.body, vars) });
  }
  const lab = finishResearch(state);
  if (lab.length) addMemo(state, { ...RESEARCH_DONE, body: fill(RESEARCH_DONE.body, { note: lab.join("\n\n") }) });
  nightShift(state);
  nightInfection(state);
  payroll(state);
  state.day++;
  rollTwist(state); // before the pool, which reads it
  checkTarget(state);
  storyNight(state, memosBefore);
  state.takenToday = {};
  delete state.fog["level-5"]; // the hotel rearranges itself overnight
  state.expeditions = [];
  state.pool = generatePool(state);
  rollEvent(state);
  rollContracts(state);
  return true;
}

// Daily wages. Veterans know what they're worth.
export const VETERAN_BONUS = 20;
export const WAGE_PER_LEVEL = 8; // experienced crews ask for more
export function wage(w: Worker): number {
  return SOURCE_INFO[w.source].wage + (isVeteran(w) ? VETERAN_BONUS : 0) + WAGE_PER_LEVEL * Math.max(0, w.level - 1);
}

function payroll(state: GameState): void {
  const rent = upkeep(state);
  if (rent) {
    state.cash -= rent;
    state.ledger.unshift({ day: state.day, text: "Facilities upkeep", amount: -rent });
  }
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
    const next = { year: t.year + 1, amount: Math.round((t.amount * 1.7) / 500) * 500, deadline: state.day + 8 };
    state.target = next;
    addMemo(state, { from: TARGET_MET.from, subject: fill(TARGET_MET.subject, { year: t.year }), body: fill(TARGET_MET.body, { amount: money(next.amount), deadline: next.deadline }) });
  } else {
    t.deadline = state.day + 3;
    addMemo(state, { from: TARGET_MISSED.from, subject: fill(TARGET_MISSED.subject, { year: t.year }), body: fill(TARGET_MISSED.body, { amount: money(t.amount), cash: money(state.cash), deadline: t.deadline }) });
  }
}

// The Board only checks on the deadline morning, but say so the moment the balance first gets there.
export function noteTargetReached(state: GameState): void {
  const t = state.target;
  if (state.cash < t.amount || state.targetNoted === t.year || state.day >= t.deadline) return;
  state.targetNoted = t.year;
  addMemo(state, { from: TARGET_REACHED.from, subject: fill(TARGET_REACHED.subject, { year: t.year }), body: fill(TARGET_REACHED.body, { amount: money(t.amount), cash: money(state.cash), deadline: t.deadline }) });
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
