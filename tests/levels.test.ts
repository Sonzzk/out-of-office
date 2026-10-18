import { describe, expect, it } from "vitest";
import { CHECKOUT_TICK } from "../src/data/levels";
import { LEVELS } from "../src/data/levels";
import { hire, type Worker } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { levelOf, levelSeed, startExpedition, stepExpedition } from "../src/sim/expedition";
import { findPath, generateLevel } from "../src/sim/level";
import { isUnlocked, stageOf } from "../src/sim/research";
import { migrate, newGame, SAVE_VERSION, type GameState } from "../src/sim/state";

function hireAll(s: GameState, n = 3): Worker[] {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

describe("levels", () => {
  it("builds every level with reachable loot and entities", () => {
    for (const def of LEVELS)
      for (let seed = 1; seed <= 25; seed++) {
        const lv = generateLevel(seed * 31 + def.depth, def);
        expect(lv.loot.length).toBeGreaterThan(def.lootCount / 2);
        expect(lv.spawns.map((s) => s.id)).toEqual(def.entities);
        for (const p of [...lv.loot.map((l) => l.at), ...lv.spawns.map((s) => s.at)])
          expect(findPath(lv, lv.entrance, p).length, `${def.id} seed ${seed}`).toBeGreaterThan(0);
      }
  });

  it("opens the next level when the one above is Documented, not before", () => {
    const s = newGame(51);
    const [w] = hireAll(s, 1);
    expect(isUnlocked(s, "level-1")).toBe(false);
    expect(startExpedition(s, [w.id], { x: 20, y: 5 }, undefined, "level-1")).toBeNull();
    const lv = levelOf(s, "level-0");
    s.fog["level-0"] = lv.cells.map((_, i) => (i % 3 ? 1 : 0)); // two thirds seen
    w.skills.stealth = 6;
    const exp = startExpedition(s, [w.id], { x: 20, y: 5 })!;
    while (exp.phase !== "done") stepExpedition(s, exp);
    expect(stageOf(s, "level-0")).toBeGreaterThanOrEqual(2);
    expect(isUnlocked(s, "level-1")).toBe(true);
    if (w.status !== "dead") expect(exp.result!.notes.some((n) => n.startsWith("New level unlocked"))).toBe(true);
  });

  it("rearranges the hotel every night and checks in anyone still there at checkout", () => {
    const s = newGame(52);
    const seed = levelSeed(s, "level-5");
    endDay(s);
    expect(levelSeed(s, "level-5")).not.toBe(seed);
    expect(levelSeed(s, "level-1")).toBe(levelSeed(newGame(52), "level-1"));

    s.index["level-5"] = { stage: 1, count: 0, dataSold: 0 };
    const crew = hireAll(s, 2);
    const exp = startExpedition(s, crew.map((w) => w.id), { x: 28, y: 2 }, undefined, "level-5")!;
    for (const r of exp.entities) r.cooldown = 999; // nothing else interferes
    exp.tick = CHECKOUT_TICK - 1;
    exp.callsMade = 99;
    stepExpedition(s, exp);
    expect(exp.log.some((l) => l.includes("has been checked in"))).toBe(true);
    expect(crew.filter((w) => w.status === "dead")).toHaveLength(1);
  });

  it("migrates a version 6 save", () => {
    const s: any = JSON.parse(JSON.stringify(newGame(53)));
    s.version = 6;
    s.fog = [0, 1];
    s.takenToday = [2];
    s.expeditions = [{ phase: "done" }];
    const m: any = migrate(s)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.fog).toEqual({ "level-0": [0, 1] });
    expect(m.takenToday).toEqual({ "level-0": [2] });
    expect(m.expeditions[0].levelId).toBe("level-0");
  });
});
