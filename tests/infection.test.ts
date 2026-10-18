import { describe, expect, it } from "vitest";
import { STAGE_MEMOS } from "../src/data/infection";
import { endDay } from "../src/sim/economy";
import { deepClean, infectionStage, uneaseFor } from "../src/sim/infection";
import { migrate, newGame, SAVE_VERSION } from "../src/sim/state";

describe("infection", () => {
  it("sends one memo per stage, signed with your name where it should be", () => {
    const s = newGame(31, "Amos");
    s.infection = 45;
    endDay(s);
    expect(infectionStage(s)).toBe(2);
    expect(s.infectionSeen).toBe(2);
    const subjects = s.memos.map((m) => m.subject);
    expect(subjects).toContain(STAGE_MEMOS[1]!.subject);
    expect(subjects).toContain(STAGE_MEMOS[2]!.subject);
    expect(s.memos.find((m) => m.subject === "Note to self")!.from).toBe("{boss}"); // filled when shown
    endDay(s);
    expect(s.memos.filter((m) => m.subject === "Note to self")).toHaveLength(1);
  });

  it("creeps up on its own once it has started, and a deep clean pushes it back", () => {
    const s = newGame(32);
    endDay(s);
    expect(s.infection).toBe(0); // a clean office stays clean
    s.infection = 25;
    endDay(s);
    expect(s.infection).toBe(26);
    s.cash = 1000;
    expect(deepClean(s)).toBe(true);
    expect(s.infection).toBe(11);
    expect(s.cash).toBe(700);
  });

  it("maps infection to how wrong the desktop feels", () => {
    const s = newGame(33);
    expect(uneaseFor(s)).toBeCloseTo(0.15);
    s.infection = 100;
    expect(uneaseFor(s)).toBeCloseTo(1);
  });

  it("migrates a version 5 save", () => {
    const s: any = JSON.parse(JSON.stringify(newGame(34)));
    s.version = 5;
    delete s.infectionSeen;
    const m: any = migrate(s)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.infectionSeen).toBe(0);
  });
});
