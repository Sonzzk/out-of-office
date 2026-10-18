import { describe, expect, it } from "vitest";
import { CALL_TICKS } from "../src/data/calls";
import { hire, type Worker } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { answerCall, CREW_SLOTS, startExpedition, stepExpedition } from "../src/sim/expedition";
import { assign, bribe, bribeCost, contractPay, OVERTIME_PAY } from "../src/sim/office";
import { migrate, newGame, SAVE_VERSION, type GameState } from "../src/sim/state";

function hireAll(s: GameState, n = 3): Worker[] {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

describe("loop and office", () => {
  it("runs two crews at once and refuses a third", () => {
    const s = newGame(11);
    const [a, b, c] = hireAll(s);
    const e1 = startExpedition(s, [a.id], { x: 25, y: 5 })!;
    const e2 = startExpedition(s, [b.id], { x: 25, y: 15 })!;
    expect(CREW_SLOTS).toBe(2);
    expect(startExpedition(s, [c.id], { x: 10, y: 5 })).toBeNull();
    while (e1.phase !== "done" || e2.phase !== "done") {
      stepExpedition(s, e1);
      stepExpedition(s, e2);
    }
    expect(startExpedition(s, [c.id], { x: 10, y: 5 })).not.toBeNull();
  });

  it("asks the office a question on most runs and holds still until answered", () => {
    let asked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed);
      const crew = hireAll(s);
      for (const w of crew) w.skills.stealth = 6;
      const exp = startExpedition(s, crew.map((w) => w.id), { x: 27, y: 4 })!;
      while (exp.phase !== "done") {
        stepExpedition(s, exp);
        if (exp.call) {
          asked++;
          const pos = { ...exp.pos };
          stepExpedition(s, exp);
          expect(exp.pos).toEqual(pos);
          if (seed % 2) expect(answerCall(s, exp, 0)).toBe(true);
          else {
            // Nobody answers: the lead decides when the timer runs out.
            for (let i = 0; i < CALL_TICKS && exp.call; i++) stepExpedition(s, exp);
            expect(exp.call).toBeUndefined();
            expect(exp.log.some((l) => l.includes("No answer from the office"))).toBe(true);
          }
        }
      }
    }
    expect(asked).toBeGreaterThan(12);
  });

  it("adds heat for deaths, cools overnight, and bribes bring it down", () => {
    const s = newGame(12);
    s.heat = 70;
    endDay(s);
    expect(s.heat).toBe(65);
    expect(s.memos[0].subject).toContain("questions");
    const cost = bribeCost(s);
    const cash = (s.cash = 2000);
    expect(bribe(s)).toBe(true);
    expect(s.cash).toBe(cash - cost);
    expect(s.heat).toBe(30);
  });

  it("fines the company when heat hits the top", () => {
    const s = newGame(13);
    s.cash = 5000;
    // The night's cooldown comes first, so start above the top.
    s.heat = 105;
    const before = s.cash;
    endDay(s);
    expect(s.cash).toBeLessThan(before);
    expect(s.heat).toBe(40);
    expect(s.memos.some((m) => m.subject.startsWith("Inspection"))).toBe(true);
  });

  it("pays for safe contracts, and overtime pays more but feeds the infection", () => {
    const s = newGame(14);
    const [a, b] = hireAll(s, 2);
    expect(assign(s, a.id, "contract")).toBe(true);
    expect(assign(s, b.id, "overtime")).toBe(true);
    expect(startExpedition(s, [a.id], { x: 20, y: 5 })).toBeNull(); // busy
    const cash = s.cash;
    const pay = contractPay(a);
    endDay(s);
    const wages = s.ledger.find((l) => l.text.startsWith("Payroll"))!.amount;
    expect(s.cash).toBe(cash + pay + OVERTIME_PAY + wages);
    expect(s.infection).toBeGreaterThan(0);
    expect(a.status).toBe("idle");
    expect(b.status).toBe("idle");
  });

  it("migrates a version 4 save", () => {
    const s: any = JSON.parse(JSON.stringify(newGame(15)));
    s.version = 4;
    delete s.heatWarned;
    s.expeditions = [{ phase: "done" }];
    const m: any = migrate(s)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.heatWarned).toBe(false);
    expect(m.expeditions[0].callsMade).toBe(0);
  });
});
