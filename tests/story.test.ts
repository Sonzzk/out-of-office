import { describe, expect, it } from "vitest";
import { BEATS, ENDINGS, STORY_EVENTS } from "../src/data/story";
import { INDEX } from "../src/data/index";
import { hire } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { answerEvent } from "../src/sim/events";
import { stepExpedition } from "../src/sim/expedition";
import { learn } from "../src/sim/research";
import { migrate, newGame, type GameState } from "../src/sim/state";
import {
  ACT3_MASTERED, beginDescent, deadCount, setEnding, canResign, descentBlock, endingFor, exitReady, resign, resolveDescent, startQuarter, storyStats,
} from "../src/sim/story";

function company(seed = 5, crew = 3): GameState {
  const s = newGame(seed, "Amos");
  s.tutorial = 4;
  for (const w of s.pool.slice(0, crew)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  s.cash = 20000;
  return s;
}

function days(s: GameState, n: number) {
  for (let i = 0; i < n; i++) endDay(s);
}

// Everything the Board asks for before it opens the Exit.
function readyForExit(s: GameState) {
  for (const e of INDEX.slice(0, ACT3_MASTERED)) learn(s, e.id, 3);
  learn(s, "level-10", 1);
  s.target.year = 3;
}

function atExit(seed = 5): GameState {
  const s = company(seed);
  readyForExit(s);
  s.day = 19;
  s.act = 2;
  endDay(s);
  return s;
}

// A finished final descent, whichever way it went.
function finishDescent(s: GameState, survivors: number, reached = true) {
  const exp = beginDescent(s)!;
  expect(exp).toBeTruthy();
  exp.phase = "done";
  exp.reached = reached;
  exp.result = { survivors, dead: [], loot: [], notes: [] };
  for (const id of exp.crewIds) {
    const w = s.crew.find((x) => x.id === id)!;
    w.status = survivors ? "idle" : "dead";
  }
  return exp;
}

describe("story acts", () => {
  it("starts in act 1 and moves to act 2 on day 13 with a memo", () => {
    const s = company();
    days(s, 11);
    expect(s.day).toBe(12);
    expect(s.act ?? 1).toBe(1);
    endDay(s);
    expect(s.act).toBe(2);
    expect(s.memos.some((m) => m.subject.startsWith("Phase Two"))).toBe(true);
  });

  it("sends each beat once, at most two a night, and none from the wrong act", () => {
    const s = company();
    days(s, 40);
    const subjects = s.memos.map((m) => m.subject);
    expect(new Set(subjects.filter((x) => x === "A word between professionals")).size).toBe(1);
    expect(subjects.filter((x) => x === "A note on who we are")).toHaveLength(1);
    expect(subjects).not.toContain("Instructions for the descent"); // act 3 was never earned
    for (let d = 1; d <= 40; d++) expect(s.memos.filter((m) => m.day === d && BEATS.some((b) => b.subject === m.subject)).length).toBeLessThanOrEqual(2);
  });

  it("opens act 3 only when the story condition is met", () => {
    const s = company();
    days(s, 25);
    expect(s.act).toBe(2);
    expect(exitReady(s)).toBe(false);
    readyForExit(s);
    endDay(s);
    expect(s.act).toBe(3);
    expect(s.memos.some((m) => m.subject === "The Exit")).toBe(true);
    expect(descentBlock(s)).toBeNull();
  });

  it("files story memos below the rest of tonight's, not above", () => {
    const s = company();
    s.day = 1;
    endDay(s);
    const subjects = s.memos.map((m) => m.subject);
    expect(subjects.indexOf("A note on who we are")).toBeGreaterThan(subjects.findIndex((x) => x.startsWith("Today's goal")));
    expect(s.memos[0].subject).toMatch(/Today's goal|Payroll|Employee/);
  });

  it("is deterministic for a seed", () => {
    const a = company(9);
    const b = company(9);
    days(a, 32);
    days(b, 32);
    expect(a.memos.map((m) => m.subject)).toEqual(b.memos.map((m) => m.subject));
  });

  it("strange memos count when answered, and fall back when ignored", () => {
    const s = company();
    s.day = 8;
    days(s, 3); // the backlog from days 2 to 7 goes out two a night first
    const m = s.memos.find((x) => x.event?.id === "story-hello")!;
    expect(m).toBeTruthy();
    expect(answerEvent(s, m.id, 0)).toBe(true);
    expect(s.storyFlags!.replied).toBe(1);
    const t = company(6);
    t.day = 8;
    days(t, 5);
    expect(t.storyFlags?.replied ?? 0).toBe(0);
    expect(t.memos.find((x) => x.event?.id === "story-hello")!.event!.choice).toBe(1);
  });

  it("registers a real event with a valid fallback for every question", () => {
    for (const b of BEATS.filter((x) => x.ask)) {
      const e = STORY_EVENTS[b.id];
      expect(e.choices.length).toBeGreaterThan(1);
      expect(e.fallback).toBeLessThan(e.choices.length);
    }
  });

  it("keeps old saves loading with no story fields", () => {
    const s = company();
    delete s.act;
    expect(migrate(JSON.parse(JSON.stringify(s)))).toBeTruthy();
    days(s, 3);
    expect(s.act).toBe(1);
  });
});

describe("endings", () => {
  it("blocks the descent until act 3 and while crews are out", () => {
    const s = company();
    expect(descentBlock(s)).not.toBeNull();
    expect(beginDescent(s)).toBeNull();
  });

  it("reaches every ending", () => {
    const seen = new Set<string>();
    const run = (name: string, set: (s: GameState) => void, survivors = 2) => {
      const s = atExit();
      set(s);
      finishDescent(s, survivors);
      expect(resolveDescent(s)).toBe(name);
      expect(s.ending).toBe(name);
      seen.add(name);
    };
    run("daylight", () => {});
    run("promotion", (s) => {
      s.storyFlags = { ...s.storyFlags, replied: 3 };
    });
    run("acquired", (s) => {
      s.storyFlags = { ...s.storyFlags, derek: 1 };
    });
    run("audit", (s) => (s.heat = 70));
    run("assimilated", (s) => (s.infection = 70));
    run("skeleton", () => {}, 0);
    const q = atExit();
    expect(resign(q)).toBe(true);
    seen.add(q.ending!);
    const l = atExit();
    l.infection = 60;
    expect(resign(l)).toBe(true);
    seen.add(l.ending!);
    expect([...seen].sort()).toEqual(Object.keys(ENDINGS).sort());
  });

  it("ties endings to how the company was run", () => {
    const s = atExit();
    s.storyFlags = { replied: 3 };
    expect(endingFor(s, 2)).toBe("promotion");
    s.cash = 100;
    expect(endingFor(s, 2)).toBe("daylight");
    s.cash = 20000;
    for (const w of s.pool) s.crew.push({ ...w, status: "dead" });
    for (const w of s.crew) w.status = "dead";
    expect(deadCount(s)).toBeGreaterThan(5);
    expect(endingFor(s, 1)).toBe("daylight");
    expect(endingFor(s, 0)).toBe("skeleton");
  });

  it("does not end the game when the crew turns back early", () => {
    const s = atExit();
    finishDescent(s, 2, false);
    expect(resolveDescent(s)).toBeNull();
    expect(s.ending).toBeUndefined();
    expect(s.memos[0].subject).toBe("The descent: incomplete");
    days(s, 1);
    expect(beginDescent(s)).toBeTruthy();
  });

  it("runs the real descent on Level 10 and ends it one way or another", () => {
    for (const seed of [3, 11, 17]) {
      const s = atExit(seed);
      const exp = beginDescent(s)!;
      expect(exp.levelId).toBe("level-10");
      expect(exp.final).toBe(true);
      for (let i = 0; i < 2000 && exp.phase !== "done"; i++) stepExpedition(s, exp);
      expect(exp.phase).toBe("done");
      resolveDescent(s);
      expect(Boolean(s.ending) || s.memos[0].subject === "The descent: incomplete").toBe(true);
      if (exp.reached || !exp.result!.survivors) expect(s.ending).toBeTruthy();
    }
  });

  it("settles a finished descent at night even if nobody was watching", () => {
    const s = atExit();
    finishDescent(s, 2);
    endDay(s);
    expect(s.ending).toBe("daylight");
  });

  it("summarises the run", () => {
    const stats = storyStats(atExit());
    expect(stats.map((x) => x[0])).toContain("Staff lost");
    expect(stats.every((x) => x[1].length > 0)).toBe(true);
  });
});

describe("new quarter", () => {
  it("never soft locks: every ending leaves a playable office", () => {
    for (const id of Object.keys(ENDINGS)) {
      const s = atExit();
      for (const w of s.crew) w.status = "dead";
      s.cash = 0;
      s.ending = id;
      // Days may pass behind the end screen without breaking anything.
      endDay(s);
      expect(startQuarter(s)).toBe(true);
      expect(s.ending).toBeUndefined();
      expect(s.act).toBe(4);
      expect(s.cash).toBeGreaterThanOrEqual(800);
      const w = s.pool.find((x) => x.cost <= s.cash)!;
      expect(w).toBeTruthy();
      expect(hire(s, w.id)).toBeTruthy();
      expect(() => days(s, 25)).not.toThrow();
      expect(s.act).toBe(4);
      expect(s.memos.some((m) => m.subject.startsWith("Quarter"))).toBe(true);
    }
  });

  it("lets the player try for another ending", () => {
    const s = atExit();
    setEnding(s, "daylight");
    startQuarter(s);
    expect(canResign(s)).toBe(true);
    expect(descentBlock(s)).toBeNull();
    finishDescent(s, 0);
    expect(resolveDescent(s)).toBe("skeleton");
    expect(s.endings).toEqual(["daylight", "skeleton"]);
  });

  it("refuses to start a quarter when nothing ended", () => {
    expect(startQuarter(company())).toBe(false);
  });
});
