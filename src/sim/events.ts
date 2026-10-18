import { CLOCKOUT_PAY, DOOR_COST, DOOR_PRIZES, EVENTS, GARY_PAY, GENERATOR_COST, VENDING_FEED, VENDING_PRIZES } from "../data/events";
import { ITEMS } from "../data/items";
import type { Worker } from "./crew";
import { addHeat, addInfection } from "./office";
import { Dice } from "./rng";
import { fill, type GameState, type Memo } from "./state";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const EVENT_CHANCE = 0.6;
const FIRST_EVENT_DAY = 3;

const pricier = (s: GameState) => 150 + 75 * (s.events.count.inspector ?? 0);

// How likely each event is tonight, and what its text needs. Zero weight means it can't happen.
function candidates(state: GameState, dice: Dice): { id: string; weight: number; vars: Record<string, string | number> }[] {
  const yesterday = state.crew.filter((w) => w.status === "dead" && w.diedOnDay === state.day - 1);
  const idle = state.crew.filter((w) => w.status === "idle");
  const prize = [...idle].sort((a, b) => b.level - a.level || b.xp - a.xp)[0];
  const out: ReturnType<typeof candidates> = [];
  if (state.heat >= 10) out.push({ id: "inspector", weight: state.heat >= 30 ? 3 : 1, vars: { bribe: money(pricier(state)), raw: pricier(state) } });
  if (yesterday.length) {
    const w = dice.pick(yesterday);
    out.push({ id: "lawsuit", weight: 5, vars: { name: w.name, amount: money(300 + 100 * w.level), raw: 300 + 100 * w.level } });
  }
  out.push({ id: "outage", weight: 1, vars: { cost: money(GENERATOR_COST) } });
  out.push({ id: "vending", weight: 1, vars: { cost: money(VENDING_FEED) } });
  if (idle.length >= 3 && prize) out.push({ id: "rival", weight: 1, vars: { name: prize.name, worker: prize.id, price: money(400 + 150 * prize.level), raw: 400 + 150 * prize.level } });
  if (idle.length && state.infection >= 8) out.push({ id: "clockout", weight: 1.5, vars: { name: dice.pick(idle).name, raw: CLOCKOUT_PAY } });
  out.push({ id: "door", weight: 1, vars: { cost: money(DOOR_COST), raw: DOOR_COST } });
  out.push({ id: "gary", weight: state.infection >= 10 ? 1.5 : 0.5, vars: {} });
  return out.filter((c) => state.day - (state.events.last[c.id] ?? -99) >= EVENTS[c.id].cooldown);
}

// Called at the end of endDay, once the new day has started.
export function rollEvent(state: GameState): Memo | null {
  if (state.day < FIRST_EVENT_DAY) return null;
  const dice = new Dice((state.seed ^ Math.imul(state.day + 101, 2246822519)) >>> 0);
  const pool = candidates(state, dice);
  // A lawsuit always lands; everything else is a coin flip.
  const forced = pool.find((c) => c.id === "lawsuit");
  if (!forced && !dice.chance(EVENT_CHANCE)) return null;
  let pick = forced;
  if (!pick) {
    let r = dice.next() * pool.reduce((a, c) => a + c.weight, 0);
    pick = pool.find((c) => (r -= c.weight) < 0) ?? pool[pool.length - 1];
  }
  if (!pick) return null;
  const def = EVENTS[pick.id];
  const times = state.events.count[def.id] ?? 0;
  state.events.last[def.id] = state.day;
  state.events.count[def.id] = times + 1;
  const vars = { ...pick.vars };
  const memo: Memo = {
    id: state.nextId++,
    from: def.from,
    subject: fill(def.subject, vars),
    body: fill(def.bodies[Math.min(times, def.bodies.length - 1)], vars),
    day: state.day,
    read: false,
    event: { id: def.id, vars },
  };
  state.memos.unshift(memo);
  return memo;
}

export const choiceLabel = (m: Memo, i: number) => fill(EVENTS[m.event!.id].choices[i], m.event!.vars);

export function canChoose(state: GameState, m: Memo, i: number): boolean {
  const e = m.event;
  if (!e || e.choice !== undefined) return false;
  if (e.id === "inspector" && i === 1) return state.cash >= Number(e.vars.raw);
  if (e.id === "lawsuit" && i === 0) return state.cash >= Number(e.vars.raw);
  if (e.id === "outage" && i === 0) return state.cash >= GENERATOR_COST;
  if (e.id === "door" && i === 0) return state.cash >= DOOR_COST;
  if (e.id === "vending" && i === 0) return state.cash >= VENDING_FEED;
  if (e.id === "rival" && i === 0) return !!state.crew.find((w) => w.id === Number(e.vars.worker) && w.status === "idle");
  return true;
}

export function answerEvent(state: GameState, memoId: number, choice: number): boolean {
  const m = state.memos.find((x) => x.id === memoId);
  if (!m?.event || !canChoose(state, m, choice)) return false;
  m.event.choice = choice;
  m.event.result = resolve(state, m, choice);
  m.read = true;
  return true;
}

// Anything still unanswered when the books close goes with its default.
export function resolvePending(state: GameState): void {
  for (const m of state.memos) {
    if (!m.event || m.event.choice !== undefined) continue;
    let c = EVENTS[m.event.id].fallback;
    if (!canChoose(state, m, c)) c = EVENTS[m.event.id].choices.findIndex((_, i) => canChoose(state, m, i));
    m.event.choice = c;
    m.event.result = `(No answer, so: ${choiceLabel(m, c)}.) ${resolve(state, m, c)}`;
  }
}

function spend(state: GameState, amount: number, text: string): void {
  state.cash -= amount;
  state.ledger.unshift({ day: state.day, text, amount: -amount });
}

function resolve(state: GameState, m: Memo, choice: number): string {
  const e = m.event!;
  const dice = new Dice((state.seed ^ Math.imul(m.id, 2654435761)) >>> 0);
  switch (`${e.id}:${choice}`) {
    case "inspector:0": {
      const recent = state.crew.some((w) => w.status === "dead" && (w.diedOnDay ?? -9) >= state.day - 3);
      addHeat(state, recent ? 10 : -10);
      return recent
        ? "He found the memorial wall. He wrote for a long time. Heat +10."
        : "He saw nothing he could write down. He seemed disappointed. Heat -10.";
    }
    case "inspector:1": {
      spend(state, Number(e.vars.raw), "Coffee for Inspector Hollis");
      addHeat(state, -25);
      return "He took the coffee. He took the envelope. He did not take notes. Heat -25.";
    }
    case "inspector:2":
      addHeat(state, 8);
      return "He waited in the lobby until dark, then left a card that says SEE YOU SOON. Heat +8.";
    case "lawsuit:0":
      spend(state, Number(e.vars.raw), `Settlement: family of ${e.vars.name}`);
      addHeat(state, -5);
      return "Settled. Everyone signed an agreement never to mention it, including {name}'s cat. Heat -5.".replace("{name}", String(e.vars.name));
    case "lawsuit:1":
      if (dice.chance(0.45)) {
        addHeat(state, 3);
        return "We won. The judge ruled that the Backrooms are \"outside the court's jurisdiction, and possibly everyone's.\" Heat +3.";
      }
      spend(state, Number(e.vars.raw) * 2, `Court loss: family of ${e.vars.name}`);
      addHeat(state, 10);
      return `We lost. The jury visited Level 0 on a field trip. Damages: ${money(Number(e.vars.raw) * 2)}. Heat +10.`;
    case "lawsuit:2":
      addHeat(state, 12);
      return "A process server now lives in the lobby. He has a sleeping bag. Heat +12.";
    case "outage:0":
      spend(state, GENERATOR_COST, "Generator rental");
      return "The generator is running. It sounds a lot like the hum, but louder.";
    case "outage:1":
      state.outageDay = state.day;
      return "Crews will see less on every level today. Flashlights help.";
    case "vending:0": {
      spend(state, VENDING_FEED, "Vending machine");
      const item = dice.pick(VENDING_PRIZES);
      state.loot.push({ id: state.nextId++, itemId: item, foundBy: "the vending machine" });
      return `It dispensed a ${ITEMS[item].name} and said THANK YOU in your voice. It's in the Ledger.`;
    }
    case "vending:1":
      addInfection(state, 4);
      return "Unplugged. It is still lit. It is still humming. Nobody will go near it now.";
    case "vending:2":
      return "It printed a receipt for nothing and went quiet.";
    case "rival:0": {
      const w = state.crew.find((x) => x.id === Number(e.vars.worker)) as Worker;
      state.crew = state.crew.filter((x) => x !== w);
      state.cash += Number(e.vars.raw);
      state.ledger.unshift({ day: state.day, text: `Contract sold: ${w.name}`, amount: Number(e.vars.raw) });
      return `${w.name} cleared their desk. Derek sent a thank-you card. It was already signed before you agreed.`;
    }
    case "rival:1":
      return "Derek says he respects that. He sent a fruit basket. Nobody has opened it.";
    case "clockout:0":
      spend(state, CLOCKOUT_PAY, `Sent ${e.vars.name} home`);
      return `${e.vars.name} left at 6:00. The cameras say they left at 6:00 yesterday too. The chair kept the shape.`;
    case "clockout:1":
      addInfection(state, 3);
      return `${e.vars.name} is still there. They have started answering the phone with your name. Infection +3.`;
    case "door:0": {
      spend(state, DOOR_COST, "Locksmith for the new door");
      if (dice.chance(0.6)) {
        const item = dice.pick(DOOR_PRIZES);
        state.loot.push({ id: state.nextId++, itemId: item, foundBy: "the door" });
        return `Behind it: a small room, a table, and a ${ITEMS[item].name} on the table. The door was a wall again by morning. The item is in the Ledger.`;
      }
      addInfection(state, 5);
      return "Behind it was our office, but with the lights off, and somebody at your desk. We closed it quickly. Infection +5.";
    }
    case "door:1":
      return "Bricked up. By morning the bricks were on the other side.";
    case "door:2":
      return "Left alone. At 3 AM it knocked, then stopped, then knocked.";
    case "gary:0":
      state.cash += GARY_PAY;
      state.ledger.unshift({ day: state.day, text: "Accounts adjustment (Gary)", amount: GARY_PAY });
      addInfection(state, 5);
      return `The books balance now. They are ${money(GARY_PAY)} better than they were. Nobody knows where it came from. The air feels wetter.`;
    case "gary:1":
      return "HR replied: \"There is no Gary in Accounts. There is no Accounts.\"";
  }
  return "";
}
