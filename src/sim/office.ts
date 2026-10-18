import { CONTRACT_DONE, HEAT_WARNING, INSPECTION, OVERTIME_DONE } from "../data/memos";
import { hasQuirk, type Worker } from "./crew";
import { Dice } from "./rng";
import { addMemo, fill, type GameState } from "./state";

// Heat: how much attention the outside world pays to the company.
export const HEAT_PER_DEATH = 10;
export const HEAT_PER_WIPE = 5;
export const HEAT_PER_DATA_SALE = 4;
export const HEAT_COOLDOWN = 5; // per night
export const HEAT_WARN = 60;
export const BRIBE_HEAT = 35;

export function addHeat(state: GameState, n: number): void {
  state.heat = Math.max(0, Math.min(100, state.heat + n));
}

export function addInfection(state: GameState, n: number): void {
  state.infection = Math.max(0, Math.min(100, state.infection + n));
}

export const bribeCost = (state: GameState) => Math.round((100 + state.heat * 10) / 50) * 50;
export const canBribe = (state: GameState) => state.heat >= 10 && state.cash >= bribeCost(state);

export function bribe(state: GameState): boolean {
  if (!canBribe(state)) return false;
  const cost = bribeCost(state);
  state.cash -= cost;
  addHeat(state, -BRIBE_HEAT);
  state.ledger.unshift({ day: state.day, text: "Donation: inspector's retirement fund", amount: -cost });
  return true;
}

// Idle crew can be sent on a safe contract or unpaid overtime for the day.
export const contractPay = (w: Worker) => 50 + 15 * w.level;
export const OVERTIME_PAY = 120;
export const OVERTIME_INFECTION = 6;

export function assign(state: GameState, workerId: number, job: "contract" | "overtime"): boolean {
  const w = state.crew.find((x) => x.id === workerId);
  if (!w || w.status !== "idle") return false;
  w.status = "busy";
  w.assignment = job;
  return true;
}

// Night-time office business, before payroll.
export function nightShift(state: GameState): void {
  const dice = new Dice((state.seed ^ Math.imul(state.day + 7, 40503)) >>> 0);
  for (const w of state.crew.filter((x) => x.status === "busy")) {
    const job = w.assignment;
    w.status = "idle";
    w.assignment = undefined;
    if (job === "contract") {
      const pay = contractPay(w);
      state.cash += pay;
      state.ledger.unshift({ day: state.day, text: `Safe contract: ${w.name}`, amount: pay });
      addMemo(state, { from: CONTRACT_DONE.from, subject: fill(CONTRACT_DONE.subject, { name: w.name }), body: fill(CONTRACT_DONE.body, { name: w.name, pay: `$${pay}` }) });
    } else if (job === "overtime") {
      state.cash += OVERTIME_PAY;
      state.ledger.unshift({ day: state.day, text: `Overtime billed: ${w.name}`, amount: OVERTIME_PAY });
      addInfection(state, OVERTIME_INFECTION);
      // Something in the Overtime Room talks back.
      if (!hasQuirk(w, "walls") && dice.chance(0.2)) w.quirks.push("walls");
      addMemo(state, { from: OVERTIME_DONE.from, subject: fill(OVERTIME_DONE.subject, { name: w.name }), body: fill(OVERTIME_DONE.body, { name: w.name, pay: `$${OVERTIME_PAY}` }) });
    }
  }

  addHeat(state, -HEAT_COOLDOWN);
  if (state.heat >= 100) {
    const fine = Math.max(200, Math.round((state.cash * 0.3) / 50) * 50);
    state.cash -= fine;
    state.ledger.unshift({ day: state.day, text: "Inspection fine", amount: -fine });
    state.heat = 40;
    state.heatWarned = false;
    addMemo(state, { from: INSPECTION.from, subject: fill(INSPECTION.subject, { fine: `$${fine}` }), body: fill(INSPECTION.body, { fine: `$${fine}` }) });
  } else if (state.heat >= HEAT_WARN && !state.heatWarned) {
    state.heatWarned = true;
    addMemo(state, HEAT_WARNING);
  } else if (state.heat < 40) state.heatWarned = false;
}
