import { describe, expect, it } from "vitest";
import { AWAY_AFTER_MS, awayReport } from "../src/sim/away";
import { endDay, sell } from "../src/sim/economy";
import { answerEvent, rollEvent } from "../src/sim/events";
import { goalText, newGoal, noteGoal } from "../src/sim/goals";
import { newGame } from "../src/sim/state";

describe("reasons to come back", () => {
  it("writes an away report only after a real absence", () => {
    const s = newGame(3);
    s.lastSeen = 1000;
    const before = s.memos.length;
    expect(awayReport(s, 1000 + AWAY_AFTER_MS - 1)).toBe(false);
    expect(awayReport(s, 1000 + AWAY_AFTER_MS)).toBe(true);
    expect(s.memos.length).toBe(before + 1);
    expect(s.memos[0].subject).toBe("While you were away");
    expect(awayReport(s, 1000 + AWAY_AFTER_MS + 5)).toBe(false);
  });

  it("gives each morning a goal that pays when met", () => {
    const s = newGame(5);
    s.tutorial = 99;
    for (let d = 0; d < 4; d++) endDay(s);
    expect(s.goal?.day).toBe(s.day);
    expect(goalText(s.goal!).length).toBeGreaterThan(5);
    const g = { ...newGoal(s), kind: "earn" as const, need: 100, reward: 40 };
    s.goal = g;
    const cash = s.cash;
    s.loot.push({ id: 900, itemId: "orientation-polaroid", foundBy: "t" });
    sell(s, 900);
    expect(g.done).toBe(true);
    expect(s.cash).toBeGreaterThanOrEqual(cash + 40);
    noteGoal(s, "earn", 500); // paid once only
    expect(s.cash).toBeLessThan(cash + 2000);
  });

  it("rolls the new overnight events and resolves them", () => {
    let seen = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const s = newGame(seed);
      s.day = 6;
      s.infection = 20;
      const m = rollEvent(s);
      if (!m?.event) continue;
      seen.add(m.event.id);
      s.cash = 500;
      expect(answerEvent(s, m.id, 0) || answerEvent(s, m.id, 1)).toBe(true);
    }
    expect(seen.has("door") || seen.has("clockout")).toBe(true);
  });
});
