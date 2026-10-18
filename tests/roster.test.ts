// @ts-expect-error node types are not installed; vitest runs in node
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTITIES } from "../src/data/entities";
import { GEAR } from "../src/data/gear";
import { ITEMS } from "../src/data/items";
import { LEVELS } from "../src/data/levels";
import { hire } from "../src/sim/crew";
import { callTicks, encounter, levelOf, startExpedition, type Roamer } from "../src/sim/expedition";
import { Dice } from "../src/sim/rng";
import { newGame, type GameState } from "../src/sim/state";

function setup(seed: number, n = 1, gear: string[] = []) {
  const s = newGame(seed);
  s.cash = 5000;
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  const exp = startExpedition(s, s.crew.map((w) => w.id), { x: 25, y: 5 }, undefined, "level-0", gear)!;
  return { s, exp, lv: levelOf(s, "level-0") };
}

const meet = (s: GameState, exp: ReturnType<typeof setup>["exp"], id: string, seed: number) => {
  const r: Roamer = { id, pos: { ...exp.pos }, cooldown: 0, seen: false };
  const crew = s.crew.filter((w) => exp.crewIds.includes(w.id) && w.status !== "dead");
  encounter(s, levelOf(s, exp.levelId), exp, r, new Dice(seed), crew);
};

describe("roster", () => {
  it("has art and an Index entry for every entity, and a sample item when it drops one", () => {
    expect(ENTITIES).toHaveLength(20);
    for (const e of ENTITIES) {
      expect(existsSync(`public/art/entities/${e.art}`), e.art).toBe(true);
      if (e.sample > 0) expect(ITEMS[`sample-${e.id}`]?.value).toBe(e.sampleValue);
    }
    for (const g of GEAR) expect(existsSync(`public/art/items/${g.art}`), g.art).toBe(true);
  });

  it("only spawns known entities on each level", () => {
    const ids = new Set(ENTITIES.map((e) => e.id));
    for (const l of LEVELS) for (const id of l.entities) expect(ids.has(id), id).toBe(true);
  });

  it("charges gear to the ledger and skips what the boss can't afford", () => {
    const { s, exp } = setup(1, 1, ["rope", "radio"]);
    expect(exp.gear).toEqual(["rope", "radio"]);
    expect(s.ledger.filter((l) => l.text.startsWith("Gear:")).reduce((a, l) => a + l.amount, 0)).toBe(-110);
    const poor = newGame(2);
    hire(poor, poor.pool[0].id);
    poor.cash = 70;
    const e2 = startExpedition(poor, [poor.crew[0].id], { x: 25, y: 5 }, undefined, "level-0", ["repellent", "flashlight"])!;
    expect(e2.gear).toEqual(["flashlight"]);
    expect(poor.cash).toBe(30);
  });

  it("doubles the time to answer a call with a radio kit", () => {
    expect(callTicks(setup(3, 1, ["radio"]).exp)).toBe(2 * callTicks(setup(3).exp));
  });

  it("saves a life with a first aid kit and drives off a Smiler with repellent", () => {
    let aided = 0;
    let sprayed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = setup(seed, 1, ["firstaid"]);
      a.s.crew[0].skills.stealth = 0;
      meet(a.s, a.exp, "hound", seed);
      expect(a.s.crew[0].status).not.toBe("dead");
      if (a.exp.used.includes("firstaid")) aided++;
      const b = setup(seed, 1, ["repellent"]);
      b.s.crew[0].skills.stealth = 0;
      meet(b.s, b.exp, "smiler", seed);
      expect(b.s.crew[0].status).not.toBe("dead");
      if (b.exp.used.includes("repellent")) sprayed++;
    }
    expect(aided).toBeGreaterThan(5);
    expect(sprayed).toBe(40);
  });

  it("lets a warning kite stop the next attack", () => {
    const { s, exp } = setup(4);
    s.index["warning-kite"] = { stage: 3, by: "x", count: 0, dataSold: 0 }; // mastered always warns
    meet(s, exp, "warning-kite", 1);
    expect(exp.warned).toBe(true);
    s.crew[0].skills.stealth = 0;
    meet(s, exp, "hound", 1);
    expect(exp.warned).toBe(false);
    expect(s.crew[0].status).not.toBe("dead");
  });

  it("guides crews to loot, steals loot, and infects the office", () => {
    const g = setup(5);
    const before = g.exp.targets.length;
    meet(g.s, g.exp, "light-guide", 1);
    expect(g.exp.targets.length).toBeGreaterThanOrEqual(before);

    let stolen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const t = setup(seed);
      t.exp.carried.push("almond-water", "almond-water");
      meet(t.s, t.exp, "duller", seed);
      if (t.exp.carried.filter((c) => c === "almond-water").length < 2) stolen++;
    }
    expect(stolen).toBeGreaterThan(0);

    const i = setup(6);
    const inf = i.s.infection;
    meet(i.s, i.exp, "anna", 1);
    expect(i.s.infection).toBe(inf + 3);
  });

  it("scares off group-shy entities when the crew is big enough", () => {
    const def = ENTITIES.find((e) => e.groupDeter && e.effect === "kill")!;
    for (let seed = 1; seed <= 20; seed++) {
      const { s, exp } = setup(seed, def.groupDeter!);
      s.crew.forEach((w) => Object.keys(w.skills).forEach((k) => ((w.skills as Record<string, number>)[k] = 0)));
      meet(s, exp, def.id, seed);
      expect(s.crew.every((w) => w.status !== "dead")).toBe(true);
    }
  });
});
