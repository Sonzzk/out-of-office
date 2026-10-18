import { describe, expect, it } from "vitest";
import { gainXp, generatePool, hire, skill, type Worker } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { startExpedition, stepExpedition, suggestLead } from "../src/sim/expedition";
import { Dice } from "../src/sim/rng";
import { migrate, newGame, type GameState } from "../src/sim/state";

function hireAll(s: GameState, n = 3): Worker[] {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

function run(s: GameState, ids: number[], lead?: number) {
  const exp = startExpedition(s, ids, { x: 25, y: 5 }, lead)!;
  while (exp.phase !== "done") stepExpedition(s, exp);
  return exp;
}

describe("crew", () => {
  it("gives every applicant one known and one hidden quirk", () => {
    const s = newGame(4);
    for (const w of s.pool) {
      expect(w.quirks).toHaveLength(2);
      expect(w.quirks[0]).not.toBe(w.quirks[1]);
      expect(w.revealed).toEqual([w.quirks[0]]);
    }
  });

  it("levels up survivors and raises a skill each level", () => {
    const w = newGame(1).pool[0];
    const before = Object.values(w.skills).reduce((a, b) => a + b, 0);
    const notes = gainXp(w, 9, new Dice(1));
    expect(w.level).toBe(4);
    expect(notes.length).toBe(3);
    expect(Object.values(w.skills).reduce((a, b) => a + b, 0)).toBe(before + 3);
  });

  it("lets the player pick the team lead, else suggests one", () => {
    const s = newGame(2);
    const crew = hireAll(s);
    const exp = startExpedition(s, crew.map((w) => w.id), { x: 20, y: 5 }, crew[2].id)!;
    expect(exp.leadId).toBe(crew[2].id);
    expect(suggestLead(crew).id).toBeDefined();
  });

  it("reveals hidden quirks by the third survived run at the latest", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = newGame(seed);
      const [w] = hireAll(s, 1);
      w.skills.stealth = 6; // keep them alive for the test
      w.quirks = [w.quirks[0], "calm"];
      for (let i = 0; i < 3 && w.status !== "dead"; i++) {
        run(s, [w.id]);
        endDay(s);
      }
      if (w.status !== "dead") expect(w.revealed).toContain("calm");
    }
  });

  it("never lets a coward be the one taken while others are around", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = newGame(seed);
      const crew = hireAll(s, 2);
      crew[0].quirks = ["coward", "calm"];
      run(s, crew.map((w) => w.id));
      if (crew[1].status !== "dead") expect(crew[0].status).not.toBe("dead");
    }
  });

  it("hands out Employee of the Month after a day with runs", () => {
    const s = newGame(9);
    const crew = hireAll(s, 2);
    crew.forEach((w) => (w.skills.stealth = 6));
    run(s, crew.map((w) => w.id));
    endDay(s);
    expect(s.memos.some((m) => m.subject.startsWith("Employee of the Month"))).toBe(true);
  });

  it("migrates a version 2 save", () => {
    const s = newGame(3) as unknown as Record<string, unknown>;
    const old = JSON.parse(JSON.stringify(s));
    old.version = 2;
    for (const w of old.pool) {
      w.quirk = w.quirks[0];
      delete w.quirks;
      delete w.revealed;
      delete w.xp;
      delete w.level;
    }
    const m = migrate(old)!;
    expect(m.version).toBe(3);
    expect(m.pool[0].quirks).toHaveLength(1);
    expect(skill(m.pool[0], "nav")).toBeGreaterThanOrEqual(0);
  });

  it("keeps generating three applicants a day", () => {
    const s = newGame(5);
    s.day = 7;
    expect(generatePool(s)).toHaveLength(3);
  });
});
