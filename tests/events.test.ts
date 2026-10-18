import { describe, expect, it } from "vitest";
import { EVENTS } from "../src/data/events";
import { hire } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { answerEvent, canChoose, resolvePending, rollEvent } from "../src/sim/events";
import { migrate, newGame, SAVE_VERSION, type GameState, type Memo } from "../src/sim/state";

// Force a particular event by making it the only one that can happen.
function force(s: GameState, id: string): Memo {
  for (const other of Object.keys(EVENTS)) if (other !== id) s.events.last[other] = s.day;
  for (let i = 0; i < 50; i++) {
    const m = rollEvent(s);
    if (m) return m;
    s.seed++;
  }
  throw new Error(`no ${id}`);
}

function crewOf(s: GameState, n: number) {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

describe("events", () => {
  it("rolls an event on some nights from Day 3, never sooner", () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed);
      crewOf(s, 1);
      s.cash = 100000;
      for (let d = 0; d < 6; d++) endDay(s);
      const events = s.memos.filter((m) => m.event);
      expect(events.every((m) => m.day >= 3)).toBe(true);
      seen += events.length;
    }
    expect(seen).toBeGreaterThan(20);
  });

  it("answers the inspector with an envelope, at the price he arrived with", () => {
    const s = newGame(1);
    s.day = 5;
    s.heat = 40;
    s.cash = 1000;
    const m = force(s, "inspector");
    expect(m.event!.id).toBe("inspector");
    expect(answerEvent(s, m.id, 1)).toBe(true);
    expect(s.heat).toBe(15);
    expect(s.cash).toBe(850);
    expect(answerEvent(s, m.id, 0)).toBe(false); // already answered
  });

  it("sues after a death and fines the company if ignored", () => {
    const s = newGame(2);
    const [w] = crewOf(s, 2);
    s.day = 6;
    w.status = "dead";
    w.diedOnDay = 5;
    const m = rollEvent(s)!;
    expect(m.event!.id).toBe("lawsuit");
    expect(m.subject).toContain(w.name);
    const heat = s.heat;
    resolvePending(s);
    expect(s.heat).toBe(heat + 12);
    expect(m.event!.result).toContain("No answer");
  });

  it("cuts the lights for a day when crews work in the dark", () => {
    const s = newGame(3);
    s.day = 4;
    const m = force(s, "outage");
    answerEvent(s, m.id, 1);
    expect(s.outageDay).toBe(4);
  });

  it("sells a worker to the rival only while they are still idle", () => {
    const s = newGame(4);
    crewOf(s, 3);
    s.day = 7;
    const m = force(s, "rival");
    const target = s.crew.find((w) => w.id === Number(m.event!.vars.worker))!;
    target.status = "out";
    expect(canChoose(s, m, 0)).toBe(false);
    target.status = "idle";
    const cash = s.cash;
    expect(answerEvent(s, m.id, 0)).toBe(true);
    expect(s.crew).not.toContain(target);
    expect(s.cash).toBeGreaterThan(cash);
  });

  it("gets loot from the vending machine and money from Gary, at a price", () => {
    const s = newGame(5);
    s.day = 4;
    s.cash = 500;
    const v = force(s, "vending");
    answerEvent(s, v.id, 0);
    expect(s.loot.at(-1)!.foundBy).toBe("the vending machine");
    s.day = 9;
    const g = force(s, "gary");
    const inf = s.infection;
    answerEvent(s, g.id, 0);
    expect(s.infection).toBe(inf + 5);
  });

  it("migrates a version 8 save", () => {
    const old = JSON.parse(JSON.stringify(newGame(6)));
    old.version = 8;
    delete old.events;
    const m = migrate(old)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.events).toEqual({ last: {}, count: {} });
  });
});
