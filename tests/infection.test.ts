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

describe("the infection writes back", () => {
  it("sends a memo from the dead once stage two arrives, and nightly at stage four", async () => {
    const { newGame } = await import("../src/sim/state");
    const { nightInfection } = await import("../src/sim/infection");
    const { hire } = await import("../src/sim/crew");
    const s = newGame(5, "Amos");
    for (const w of s.pool.slice(0, 2)) { s.cash += w.cost; hire(s, w.id); }
    s.crew[0].status = "dead";
    s.crew[0].lastWords = "Tell them I tried.";
    s.infection = 45;
    const before = s.memos.length;
    nightInfection(s);
    expect(s.memos.length).toBeGreaterThan(before);
    expect(s.memos.some((m) => m.from === s.crew[0].name)).toBe(true);
    s.infection = 90;
    for (let d = 0; d < 3; d++) {
      s.day++;
      const n = s.memos.filter((m) => m.from === s.crew[0].name).length;
      nightInfection(s);
      expect(s.memos.filter((m) => m.from === s.crew[0].name).length).toBe(n + 1);
    }
  });

  it("makes the radio answer in the boss's voice at stage three", async () => {
    const { newGame } = await import("../src/sim/state");
    const { hire } = await import("../src/sim/crew");
    const { startExpedition, answerCall } = await import("../src/sim/expedition");
    let heard = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const s = newGame(seed, "Amos");
      s.catchphrase = "Rise and grind";
      s.infection = 70;
      s.cash = 2000;
      for (const w of s.pool.slice(0, 2)) hire(s, w.id);
      const exp = startExpedition(s, s.crew.map((w) => w.id), { x: 25, y: 5 })!;
      exp.call = { id: "door", asked: 0, m: exp.crewIds[1] };
      answerCall(s, exp, 1);
      if (exp.log.some((l) => /in your voice|say it again|replied in your voice/.test(l))) heard++;
    }
    expect(heard).toBeGreaterThan(5);
    expect(heard).toBeLessThan(45);
  });
});

describe("the dead write in many voices", () => {
  it("has at least twelve templates, ties them to the person and escalates", async () => {
    const { DEAD_MEMOS } = await import("../src/data/infection");
    const { newGame } = await import("../src/sim/state");
    const { hire } = await import("../src/sim/crew");
    const { nightInfection } = await import("../src/sim/infection");
    expect(DEAD_MEMOS.length).toBeGreaterThanOrEqual(12);
    expect(DEAD_MEMOS.some((m) => m.tier === 2 && /farmhouse|Exit|3 o'clock/.test(m.body))).toBe(true);
    const s = newGame(5, "Amos");
    for (const w of s.pool.slice(0, 2)) { s.cash += w.cost; hire(s, w.id); }
    s.crew[0].status = "dead";
    s.crew[0].diedOnDay = 4;
    s.crew[0].lastWords = "Tell them I tried.";
    s.infection = 90;
    const bodies: string[] = [];
    for (let d = 0; d < 14; d++) {
      s.day++;
      const n = s.memos.length;
      nightInfection(s);
      if (s.memos.length > n) bodies.push(s.memos[0].subject);
    }
    // No template twice running, and the later memos are not the early small talk.
    for (let i = 1; i < bodies.length; i++) expect(bodies[i]).not.toBe(bodies[i - 1]);
    expect(new Set(bodies).size).toBeGreaterThanOrEqual(8);
    const all = s.memos.filter((m) => m.from === s.crew[0].name).map((m) => m.body).join("\n");
    expect(all).not.toMatch(/\{(name|first|skill|quirk|rank|day|words)\}/);
    expect(all).toContain("{boss}"); // filled in when shown
    expect(s.memos.some((m) => m.body.includes("Day 4") || m.body.includes("Tell them I tried."))).toBe(true);
  });
});
