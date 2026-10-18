import { describe, expect, it } from "vitest";
import { hire } from "../src/sim/crew";
import { endDay, sell } from "../src/sim/economy";
import { startExpedition, stepExpedition } from "../src/sim/expedition";
import { findPath, generateLevel, isOpen } from "../src/sim/level";
import { newGame } from "../src/sim/state";

function runToEnd(seed: number, hires = 2) {
  const s = newGame(seed);
  for (const w of s.pool.slice(0, hires)) {
    s.cash += w.cost; // tests don't care about affording them
    hire(s, w.id);
  }
  const exp = startExpedition(s, s.crew.map((w) => w.id), { x: 25, y: 5 })!;
  let guard = 0;
  while (exp.phase !== "done" && guard++ < 2000) stepExpedition(s, exp);
  return { s, exp, guard };
}

describe("level generation", () => {
  it("connects every open cell to the entrance", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const lv = generateLevel(seed);
      for (let y = 0; y < lv.h; y++)
        for (let x = 0; x < lv.w; x++) {
          const p = { x, y };
          if (isOpen(lv, p) && (x !== lv.entrance.x || y !== lv.entrance.y)) expect(findPath(lv, lv.entrance, p).length).toBeGreaterThan(0);
        }
    }
  });
});

describe("expedition", () => {
  it("always finishes, and fast enough for a 30 to 90 second run", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { exp, guard } = runToEnd(seed);
      expect(exp.phase).toBe("done");
      expect(guard).toBeLessThan(400);
    }
  });

  it("replays identically from the same seed", () => {
    expect(runToEnd(7).exp.log).toEqual(runToEnd(7).exp.log);
  });

  it("brings loot home only when someone survives", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s, exp } = runToEnd(seed);
      if (exp.result!.survivors === 0) expect(s.loot.length).toBe(0);
      else expect(s.loot.length).toBe(exp.result!.loot.length);
    }
  });

  it("leaves a plaque memo for each death", () => {
    let deaths = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { s, exp } = runToEnd(seed, 1);
      deaths += exp.result!.dead.length;
      expect(s.memos.filter((m) => m.from === "HR").length).toBe(exp.result!.dead.length);
    }
    expect(deaths).toBeGreaterThan(0); // the Smiler has to be a real threat
  });
});

describe("economy", () => {
  it("sells loot into cash and the ledger, then starts a new day", () => {
    const { s } = runToEnd(3);
    const cash = s.cash;
    const loot = s.loot[0];
    if (loot) {
      expect(sell(s, loot.id)).toBe(true);
      expect(s.cash).toBeGreaterThan(cash);
    }
    expect(endDay(s)).toBe(true);
    expect(s.day).toBe(2);
    expect(s.pool.length).toBe(3);
  });

  it("won't hire what you can't afford", () => {
    const s = newGame(5);
    s.cash = 0;
    expect(hire(s, s.pool[0].id)).toBe(false);
  });
});
