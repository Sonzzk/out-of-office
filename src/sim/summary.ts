import { ITEMS } from "../data/items";
import { ENDINGS } from "../data/story";
import { goalText } from "./goals";
import { actOf } from "./story";
import { contractText } from "./contracts";
import { twistToday } from "./twists";
import { isPending } from "./inbox";
import type { GameState } from "./state";

// One line for pasting somewhere: the day, how many people the building has
// kept, and the cash on hand.
export function daySummary(state: GameState): string {
  const lost = state.crew.filter((w) => w.status === "dead").length;
  return `Day ${state.day}, ${lost} lost, $${state.cash.toLocaleString("en-US")}`;
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;

// What endDay is about to erase (the day's runs, the goal being replaced), kept
// as the day goes so the day card can still talk about it afterwards.
export interface DaySnap {
  day: number;
  nextId: number;
  goal?: { text: string; have: number; need: number };
  best?: { lead: string; finds: number; value: number };
  topFind?: string;
}

export function snapshotDay(s: GameState): DaySnap {
  const snap: DaySnap = { day: s.day, nextId: s.nextId };
  if (s.goal && s.goal.day === s.day) snap.goal = { text: goalText(s.goal), have: s.goal.have, need: s.goal.need };
  let top = 0;
  for (const e of s.expeditions) {
    const finds = e.result?.loot ?? [];
    const value = finds.reduce((n, id) => n + (ITEMS[id]?.value ?? 0), 0);
    const lead = s.crew.find((w) => w.id === e.leadId)?.name;
    if (lead && finds.length && (!snap.best || value > snap.best.value)) snap.best = { lead, finds: finds.length, value };
    for (const id of finds) if ((ITEMS[id]?.value ?? 0) > top) (top = ITEMS[id].value), (snap.topFind = ITEMS[id].name);
  }
  return snap;
}

export interface DayReport {
  day: number;
  earned: number;
  spent: number;
  cash: number;
  lost: string[];
  goal: { text: string; result: "met" | "missed"; have: number; need: number; pay: number } | null;
  best?: DaySnap["best"];
  topFind?: string;
  newMemos: number;
  decisions: number;
  tomorrow: { goal: string | null; twist: string | null; contracts: string[] };
}

// The day that just closed, from the snapshot taken before it and the state after.
export function dayReport(prev: DaySnap, s: GameState): DayReport {
  const today = s.ledger.filter((e) => e.day === prev.day);
  const earned = today.filter((e) => e.amount > 0).reduce((n, e) => n + e.amount, 0);
  const spent = -today.filter((e) => e.amount < 0).reduce((n, e) => n + e.amount, 0);
  const met = today.find((e) => e.text === "The Board: goal met");
  const tw = twistToday(s);
  return {
    day: prev.day,
    earned,
    spent,
    cash: s.cash,
    lost: s.crew.filter((w) => w.status === "dead" && w.diedOnDay === prev.day).map((w) => w.name),
    goal: prev.goal ? { ...prev.goal, result: met ? "met" : "missed", pay: met?.amount ?? 0 } : null,
    best: prev.best,
    topFind: prev.topFind,
    newMemos: s.memos.filter((m) => m.id >= prev.nextId).length,
    decisions: s.memos.filter(isPending).length,
    tomorrow: {
      goal: s.goal && s.goal.day === s.day ? `${goalText(s.goal)} Pays ${money(s.goal.reward)}.` : null,
      twist: tw ? `${tw.name}. ${tw.text}` : null,
      contracts: (s.contracts ?? []).map((c) => `${contractText(c)} for ${money(c.reward)}, by Day ${c.deadline}`),
    },
  };
}

// For pasting into a chat: loot, the best run, the goal, and a hint at how far in you are.
export function shareText(r: DayReport, s: GameState): string {
  const lines = [
    `Out of Office, Day ${r.day} closed: +${money(r.earned)}, -${money(r.spent)}, ${money(r.cash)} in the bank.`,
    r.lost.length ? `Lost: ${r.lost.join(", ")}. The building kept them.` : "Everyone clocked out. Somehow.",
  ];
  if (r.best) lines.push(`Best run: ${r.best.lead}, ${r.best.finds} find${r.best.finds === 1 ? "" : "s"} worth ${money(r.best.value)}${r.topFind ? ` (top find: ${r.topFind})` : ""}.`);
  if (r.goal) lines.push(`Board goal: ${r.goal.result === "met" ? `met, ${money(r.goal.pay)} released` : `missed (${r.goal.have}/${r.goal.need})`}.`);
  const seen = s.endings?.length ?? 0;
  lines.push(`Heat ${s.heat}%, Air ${100 - s.infection}%. ${seen ? `Endings found: ${seen} of ${Object.keys(ENDINGS).length}.` : `Act ${["I", "II", "III", "IV"][actOf(s) - 1] ?? "I"}. No ending yet.`}`);
  return lines.join("\n");
}
