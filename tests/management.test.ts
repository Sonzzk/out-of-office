import { describe, expect, it } from "vitest";
import { canTrain, hire, train, trainCost } from "../src/sim/crew";
import { closeWarnings, endDay, noteTargetReached, reservedLoot, sell, sellAll, sellAllPreview, sellAllWithUndo, trainWageRise, undoSale, wage } from "../src/sim/economy";
import { declineContract } from "../src/sim/contracts";
import { buyUpgrade, upkeep, upkeepRise } from "../src/sim/facilities";
import { finishResearch, researchPreview, startResearch } from "../src/sim/research";
import { newGame, type GameState } from "../src/sim/state";

function loot(s: GameState, itemId: string, n = 1) {
  for (let i = 0; i < n; i++) s.loot.push({ id: s.nextId++, itemId, foundBy: "Test" });
}

describe("sell all", () => {
  it("skips contract items and research samples, and previews the same total", () => {
    const s = newGame(3);
    s.firstSale = true;
    s.contracts = [{ id: 90, itemId: "almond-water", need: 3, reward: 500, deadline: 9 }];
    loot(s, "almond-water", 4);
    loot(s, "wallpaper", 2);
    loot(s, "sample-smiler");
    const p = sellAllPreview(s);
    expect(p.keptContract).toBe(3);
    expect(p.keptSamples).toBe(1);
    expect(p.count).toBe(3); // one spare water, two wallpaper
    const total = sellAll(s);
    expect(total).toBe(p.total);
    expect(s.loot.filter((l) => l.itemId === "almond-water")).toHaveLength(3);
    expect(s.loot.some((l) => l.itemId === "sample-smiler")).toBe(true);
    expect(s.loot).toHaveLength(4);
  });

  it("reserves what is on hand even when the contract is short", () => {
    const s = newGame(3);
    s.contracts = [{ id: 90, itemId: "wallpaper", need: 3, reward: 500, deadline: 9 }];
    loot(s, "wallpaper", 2);
    expect(reservedLoot(s).contract.size).toBe(2);
  });

  it("undoes while nothing else has happened, and not after", () => {
    const s = newGame(3);
    loot(s, "wallpaper", 2);
    const cash = s.cash;
    const { undo } = sellAllWithUndo(s);
    expect(s.cash).toBeGreaterThan(cash);
    expect(undoSale(s, undo)).toBe(true);
    expect(s.cash).toBe(cash);
    expect(s.loot).toHaveLength(2);
    expect(s.firstSale).toBeFalsy();
    const again = sellAllWithUndo(s);
    s.ledger.unshift({ day: s.day, text: "Something else", amount: 1 });
    expect(undoSale(s, again.undo)).toBe(false);
  });
});

describe("facility upkeep preview", () => {
  it("matches what upkeep() becomes after the buy", () => {
    const s = newGame(4);
    s.cash = 100000;
    for (let i = 0; i < 4; i++) {
      const before = upkeep(s);
      const rise = upkeepRise(s, "lab");
      expect(rise).toBe(i < 2 ? 40 : 15);
      buyUpgrade(s, "lab");
      expect(upkeep(s) - before).toBe(rise);
    }
  });
});

describe("lab preview", () => {
  it("reports the stage finishResearch will reach, including two benches of one kind", () => {
    const s = newGame(5);
    s.upgrades.lab = 1;
    loot(s, "sample-hound", 2);
    const [a, b] = s.loot.map((l) => l.id);
    expect(startResearch(s, a)).toBe(true);
    expect(startResearch(s, b)).toBe(true);
    const ent = "hound";
    const first = researchPreview(s, ent, 0);
    const second = researchPreview(s, ent, 1);
    expect(first).toBe(2); // the first sample is Documented, not Seen
    expect(second).toBe(3);
    finishResearch(s);
    expect(s.index[ent].stage).toBe(second);
  });
});

describe("close the books warnings", () => {
  it("flags an unmet goal, a contract ending tonight, idle benches and unsold loot", () => {
    const s = newGame(6);
    s.goal = { kind: "earn", need: 100, have: 0, reward: 50, day: s.day, done: false } as any;
    s.contracts = [{ id: 90, itemId: "wallpaper", need: 2, reward: 300, deadline: s.day }];
    loot(s, "wallpaper", 1);
    loot(s, "sample-hound");
    loot(s, "candy");
    const w = closeWarnings(s);
    expect(w.some((x) => /goal/i.test(x))).toBe(true);
    expect(w.some((x) => /runs out tonight \(1\/2\)/.test(x))).toBe(true);
    expect(w.some((x) => /lab bench/.test(x))).toBe(true);
    expect(w.some((x) => /unsold/.test(x))).toBe(true);
  });

  it("is quiet when everything is done", () => {
    const s = newGame(6);
    s.goal = undefined;
    s.contracts = [];
    s.loot = [];
    expect(closeWarnings(s)).toEqual([]);
  });
});

describe("training", () => {
  it("previews the wage rise and records the stat gained", () => {
    const s = newGame(7);
    s.cash = 5000;
    const w = s.pool[0];
    hire(s, w.id);
    const worker = s.crew[0];
    const rise = trainWageRise(worker);
    const before = wage(worker);
    expect(canTrain(s, worker)).toBe(true);
    expect(train(s, worker.id)).toBe(true);
    expect(wage(worker) - before).toBe(rise);
    expect(rise).toBe(8);
    expect(s.ledger[0].text).toMatch(/Training course: .*level 2, \+1 /);
    expect(trainCost(worker)).toBe(500);
  });
});

describe("board target", () => {
  it("sends one memo the first time the balance reaches the target", () => {
    const s = newGame(8);
    const n = s.memos.length;
    s.cash = s.target.amount - 1;
    noteTargetReached(s);
    expect(s.memos).toHaveLength(n);
    s.cash = s.target.amount;
    noteTargetReached(s);
    noteTargetReached(s);
    expect(s.memos).toHaveLength(n + 1);
    expect(s.memos[0].subject).toMatch(/target reached/);
  });

  it("can be sold into through sell()", () => {
    const s = newGame(8);
    s.cash = s.target.amount - 10;
    loot(s, "wallpaper");
    sell(s, s.loot[0].id);
    expect(s.targetNoted).toBe(s.target.year);
  });
});

describe("contracts", () => {
  it("can be declined", () => {
    const s = newGame(9);
    s.contracts = [{ id: 5, itemId: "candy", need: 2, reward: 100, deadline: 9 }];
    expect(declineContract(s, 5)).toBe(true);
    expect(s.contracts).toHaveLength(0);
    expect(declineContract(s, 5)).toBe(false);
  });
  it("endDay still runs", () => {
    const s = newGame(9);
    expect(endDay(s)).toBe(true);
  });
});
