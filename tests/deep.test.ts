import { describe, expect, it } from "vitest";
import { CALLS } from "../src/data/calls";
import { INDEX } from "../src/data/index";
import { levelDef, LEVELS } from "../src/data/levels";
import { hire } from "../src/sim/crew";
import { levelOf, startExpedition, stepExpedition } from "../src/sim/expedition";
import { DARK, FLOOR, generateLevel } from "../src/sim/level";
import { checkSurvey, isUnlocked } from "../src/sim/research";
import { newGame, type GameState } from "../src/sim/state";

function setup(seed: number, levelId: string, gear: string[] = []) {
  const s = newGame(seed);
  s.cash = 5000;
  for (const w of s.pool.slice(0, 2)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  s.index[levelId] = { stage: 1, count: 0, dataSold: 0 };
  const exp = startExpedition(s, s.crew.map((w) => w.id), { x: 25, y: 5 }, undefined, levelId, gear)!;
  return { s, exp, lv: levelOf(s, levelId) };
}

const revealed = (s: GameState, id: string) => s.fog[id].filter(Boolean).length;

describe("deep levels", () => {
  it("has eleven levels in order, each with an Index page", () => {
    expect(LEVELS.map((l) => l.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const l of LEVELS) expect(INDEX.some((e) => e.id === l.id), l.id).toBe(true);
  });

  it("opens each level once the one above is Documented, all the way down", () => {
    const s = newGame(7);
    for (let d = 5; d < 10; d++) {
      const id = `level-${d}`;
      s.index[id] = { stage: 1, count: 0, dataSold: 0 };
      const lv = levelOf(s, id);
      s.fog[id] = lv.cells.map(() => 1);
      expect(isUnlocked(s, `level-${d + 1}`)).toBe(false);
      expect(checkSurvey(s, lv, id).some((n) => n.includes("New level unlocked"))).toBe(true);
      expect(isUnlocked(s, `level-${d + 1}`)).toBe(true);
    }
  });

  it("keeps Lights Out dark everywhere, and a flashlight sees one step further", () => {
    const lv = generateLevel(5, levelDef("level-6"));
    expect(lv.cells.filter((c) => c === FLOOR)).toHaveLength(0);
    expect(lv.cells.filter((c) => c === DARK).length).toBeGreaterThan(100);
    const plain = setup(1, "level-6");
    const lamp = setup(1, "level-6", ["flashlight"]);
    for (const t of [plain, lamp]) {
      for (const r of t.exp.entities) r.cooldown = 999;
      t.exp.callsMade = 99;
      for (let i = 0; i < 10; i++) stepExpedition(t.s, t.exp);
    }
    expect(revealed(lamp.s, "level-6")).toBeGreaterThan(revealed(plain.s, "level-6"));
  });

  it("limits how far a crew sees in the Wheat Field", () => {
    const wheat = setup(2, "level-10");
    const plain = setup(2, "level-2");
    for (const t of [wheat, plain]) {
      t.exp.callsMade = 99;
      for (const r of t.exp.entities) r.cooldown = 999;
    }
    const before = revealed(wheat.s, "level-10");
    stepExpedition(wheat.s, wheat.exp);
    // A radius 2 diamond covers at most 13 cells, radius 3 up to 25.
    expect(revealed(wheat.s, "level-10") - before).toBeLessThanOrEqual(13);
  });

  it("makes the way home slow in the Wheat Field, less so with rope", () => {
    const ticksHome = (gear: string[]) => {
      let total = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const t = setup(seed, "level-10", gear);
        t.s.crew.forEach((w) => (w.skills.stealth = 6));
        for (const r of t.exp.entities) r.cooldown = 99999;
        t.exp.callsMade = 99;
        t.exp.phase = "return";
        t.exp.pos = { x: t.lv.entrance.x + 3, y: t.lv.entrance.y };
        t.exp.targets = [{ ...t.lv.entrance }];
        let n = 0;
        while ((t.exp.phase as string) !== "done" && n < 400) {
          stepExpedition(t.s, t.exp);
          n++;
        }
        total += n;
      }
      return total;
    };
    expect(ticksHome(["rope"])).toBeLessThan(ticksHome([]));
  });

  it("only offers the farmhouse in the Wheat Field", () => {
    expect(CALLS.find((c) => c.id === "farmhouse")?.only).toBe("level-10");
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = setup(seed, "level-3");
      for (let i = 0; i < 40 && t.exp.phase !== "done"; i++) {
        stepExpedition(t.s, t.exp);
        if (t.exp.call) {
          expect(t.exp.call.id).not.toBe("farmhouse");
          seen++;
          break;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("places the late creatures on the deep levels", () => {
    const used = new Set(LEVELS.flatMap((l) => l.entities));
    for (const id of ["wretch", "mother", "anna", "humans", "chupavida", "dunk"]) expect(used.has(id), id).toBe(true);
  });
});
