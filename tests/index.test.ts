import { describe, expect, it } from "vitest";
import { entityDef } from "../src/data/entities";
import { hire, type Worker } from "../src/sim/crew";
import { endDay, wage } from "../src/sim/economy";
import { level0, startExpedition, stepExpedition } from "../src/sim/expedition";
import { generateLevel } from "../src/sim/level";
import { broughtHome, dataPrice, sellData, startResearch, stageOf } from "../src/sim/research";
import { migrate, newGame, SAVE_VERSION, type GameState } from "../src/sim/state";

function hireAll(s: GameState, n = 3): Worker[] {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

function run(s: GameState, ids: number[], marker = { x: 25, y: 5 }) {
  const exp = startExpedition(s, ids, marker)!;
  while (exp.phase !== "done") stepExpedition(s, exp);
  return exp;
}

describe("Index and economy", () => {
  it("puts a Smiler, a Hound and a Faceling on Level 0 without moving the old layout", () => {
    const lv = generateLevel(99);
    expect(lv.spawns.map((s) => s.id)).toEqual(["smiler", "hound", "faceling"]);
    expect(lv.spawns[0].at).toEqual(lv.entity);
    expect(generateLevel(99)).toEqual(lv);
  });

  it("marks entities Seen with who saw them, and Documented once someone lives through one", () => {
    let seen = 0;
    let documented = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame(seed);
      const crew = hireAll(s);
      for (const w of crew) w.skills.stealth = 6;
      run(s, crew.map((w) => w.id), { x: 27, y: 3 });
      for (const id of ["smiler", "hound", "faceling"]) {
        if (stageOf(s, id) >= 1) {
          seen++;
          expect(s.index[id].by).toBeTruthy();
        }
        if (stageOf(s, id) >= 2) documented++;
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(documented).toBeGreaterThan(3);
  });

  it("never lets a Hound take someone from a crew of three or more", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed);
      const crew = hireAll(s);
      const exp = run(s, crew.map((w) => w.id), { x: 27, y: 15 });
      const alive = exp.crewIds.filter((id) => s.crew.find((w) => w.id === id)!.status !== "dead").length;
      // Once the group drops below three the Hound may strike, so only check full groups.
      const houndLine = entityDef("hound").outcome.slice(4).replace(/\{m\}.*/, "");
      if (alive === 3) expect(exp.log.some((l) => l.includes(houndLine))).toBe(false);
    }
  });

  it("researches one sample a day: Documented after one, Mastered after two", () => {
    const s = newGame(5);
    s.loot.push({ id: 900, itemId: "sample-hound", foundBy: "X" }, { id: 901, itemId: "sample-hound", foundBy: "X" });
    expect(startResearch(s, 900)).toBe(true);
    expect(startResearch(s, 901)).toBe(false); // one bench
    endDay(s);
    expect(stageOf(s, "hound")).toBe(2);
    expect(dataPrice(s, "hound")).toBe(220);
    expect(sellData(s, "hound")).toBe(220);
    expect(dataPrice(s, "hound")).toBe(0); // once per stage
    expect(startResearch(s, 901)).toBe(true);
    endDay(s);
    expect(stageOf(s, "hound")).toBe(3);
    expect(dataPrice(s, "hound")).toBe(330); // only the difference
  });

  it("documents an item after three come home, and Level 0 by surveying it", () => {
    const s = newGame(6);
    broughtHome(s, "polaroid", "A");
    broughtHome(s, "polaroid", "B");
    expect(stageOf(s, "polaroid")).toBe(1);
    broughtHome(s, "polaroid", "C");
    expect(stageOf(s, "polaroid")).toBe(2);
    expect(s.index.polaroid.by).toBe("A");
    expect(stageOf(s, "level-0")).toBe(1);
    const lv = level0(s);
    s.fog["level-0"] = lv.cells.map(() => 1);
    const crew = hireAll(s, 1);
    crew[0].skills.stealth = 6;
    run(s, [crew[0].id]);
    expect(stageOf(s, "level-0")).toBe(3);
  });

  it("pays wages every evening and checks the money target on the deadline", () => {
    const s = newGame(7);
    const crew = hireAll(s, 2);
    const before = s.cash;
    endDay(s);
    expect(s.cash).toBe(before - crew.reduce((a, w) => a + wage(w), 0));
    s.cash = 100;
    let due = s.target.deadline;
    while (s.day < due) endDay(s);
    expect(s.target.year).toBe(1);
    expect(s.memos.some((m) => m.day === s.day && m.subject.includes("concerns"))).toBe(true);
    expect(s.target.deadline).toBe(due + 3);
    s.cash = 10_000;
    due = s.target.deadline;
    while (s.day < due) endDay(s);
    expect(s.target.year).toBe(2);
    expect(s.target.amount).toBeGreaterThan(2500);
  });

  it("migrates a version 3 save with a run in progress", () => {
    const s: any = JSON.parse(JSON.stringify(newGame(8)));
    s.version = 3;
    delete s.index;
    delete s.target;
    s.expeditions = [{ entity: { x: 1, y: 1 }, entityCooldown: 2, entitySeen: true }];
    const m: any = migrate(s)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.expeditions[0].entities).toEqual([{ id: "smiler", pos: { x: 1, y: 1 }, cooldown: 2, seen: true }]);
    expect(m.target.amount).toBe(2500);
  });
});
