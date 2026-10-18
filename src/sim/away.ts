import { goalText } from "./goals";
import { infectionStage } from "./infection";
import { addMemo, type GameState } from "./state";

export const AWAY_AFTER_MS = 10 * 60 * 1000;

const CREEPY = [
  "",
  "The lights flickered once while you were gone. Facilities says that's normal.",
  "Someone used your desk. The chair was still warm when we looked. We did not look for long.",
  "We kept your seat. It kept moving. We stopped mentioning it.",
  "You were not gone. We saw you at your desk the whole time. You were not looking at us.",
];

// A memo waiting for you when you come back after a while.
export function awayReport(state: GameState, now: number): boolean {
  if (!state.lastSeen || now - state.lastSeen < AWAY_AFTER_MS) return false;
  const lines: string[] = [];
  const open = state.memos.filter((m) => m.event && m.event.choice === undefined).length;
  const unread = state.memos.filter((m) => !m.read).length;
  const idle = state.crew.filter((w) => w.status === "idle").length;
  const labReady = state.research.length;
  if (open) lines.push(`${open} memo${open === 1 ? " is" : "s are"} still waiting on a decision.`);
  else if (unread) lines.push(`${unread} unread memo${unread === 1 ? "" : "s"} in your inbox.`);
  if (state.loot.length) lines.push(`${state.loot.length} item${state.loot.length === 1 ? "" : "s"} of loot still unsold.`);
  if (idle) lines.push(`${idle} crew ${idle === 1 ? "is" : "are"} at their desks with nothing to do.`);
  if (labReady) lines.push(`${labReady} sample${labReady === 1 ? "" : "s"} in the lab. Results come in when you close the books.`);
  if (state.goal && !state.goal.done && state.goal.day === state.day) lines.push(`Today's goal: ${goalText(state.goal)} (${state.goal.have}/${state.goal.need}).`);
  const creep = CREEPY[Math.min(infectionStage(state), CREEPY.length - 1)];
  if (creep) lines.push(creep);
  if (!lines.length) lines.push("Nothing needed you. That has never happened before.");
  addMemo(state, { from: "Front Desk", subject: "While you were away", body: `${lines.join("\n\n")}\n\n- Front Desk` });
  state.lastSeen = now;
  return true;
}
