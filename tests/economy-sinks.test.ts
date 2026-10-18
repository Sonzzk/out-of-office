import { describe, expect, it } from "vitest";
import { canTrain, hire, train, trainCost } from "../src/sim/crew";
import { FIRST_SALE_BONUS, sell, sellAll, sellPrice } from "../src/sim/economy";
import { startExpedition, stepExpedition, type Expedition } from "../src/sim/expedition";
import { buyUpgrade, callWait, crewSlots, heatCooldown, upkeep } from "../src/sim/facilities";
import { buyProject, canRecover, deathInfection, recoverBelongings, saleMultiplier } from "../src/sim/projects";
import { newGame, type GameState } from "../src/sim/state";

function crewOf(s: GameState, n: number) {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

function runToEnd(s: GameState, exp: Expedition) {
  for (let i = 0; i < 2000 && exp.phase !== "done"; i++) {
    exp.entities = [];
    stepExpedition(s, exp);
  }
}

describe("first day", () => {
  it("always sends the first crew home with something valuable, once", () => {
    const s = newGame(5);
    const [w] = crewOf(s, 1);
    const exp = startExpedition(s, [w.id], { x: 3, y: 3 })!;
    exp.carried = [];
    runToEnd(s, exp);
    expect(exp.result!.loot).toContain("orientation-polaroid");
    expect(s.firstFind).toBe(true);
    const again = startExpedition(s, [w.id], { x: 3, y: 3 })!;
    again.carried = [];
    runToEnd(s, again);
    expect(again.result!.loot).not.toContain("orientation-polaroid");
  });

  it("pays a bonus on the very first sale only", () => {
    const s = newGame(1);
    s.loot.push({ id: 900, itemId: "almond-water", foundBy: "x" }, { id: 901, itemId: "almond-water", foundBy: "x" });
    const cash = s.cash;
    sell(s, 900);
    expect(s.cash).toBe(cash + 90 + FIRST_SALE_BONUS);
    sell(s, 901);
    expect(s.cash).toBe(cash + 180 + FIRST_SALE_BONUS);
  });

  it("sells everything in one go", () => {
    const s = newGame(1);
    s.firstSale = true;
    s.loot.push({ id: 900, itemId: "almond-water", foundBy: "x" }, { id: 901, itemId: "wallpaper", foundBy: "x" });
    expect(sellAll(s)).toBe(230);
    expect(s.loot).toHaveLength(0);
  });
});

describe("somewhere to spend money", () => {
  it("has four tiers per facility, with cheaper upkeep past tier two", () => {
    const s = newGame(1);
    s.cash = 200000;
    for (let i = 0; i < 4; i++) expect(buyUpgrade(s, "dispatch")).toBe(true);
    expect(buyUpgrade(s, "dispatch")).toBe(false);
    expect(crewSlots(s)).toBe(6);
    expect(upkeep(s)).toBe(40 * 2 + 15 * 2);
    for (let i = 0; i < 4; i++) buyUpgrade(s, "mast");
    for (let i = 0; i < 4; i++) buyUpgrade(s, "security");
    expect(callWait(s)).toBe(3);
    expect(heatCooldown(s)).toBe(20);
  });

  it("sells for more from the corner office and builds the second floor", () => {
    const s = newGame(1);
    s.cash = 50000;
    expect(sellPrice("level-key", s)).toBe(480);
    expect(buyProject(s, "corner")).toBe(true);
    expect(saleMultiplier(s)).toBe(1.1);
    expect(sellPrice("level-key", s)).toBe(528);
    expect(buyProject(s, "corner")).toBe(false);
    const slots = crewSlots(s);
    buyProject(s, "floor2");
    expect(crewSlots(s)).toBe(slots + 1);
    expect(deathInfection(s)).toBe(2);
    buyProject(s, "memorial");
    expect(deathInfection(s)).toBe(1);
  });

  it("trains a crew member one level a day for money", () => {
    const s = newGame(1);
    s.cash = 5000;
    const [w] = crewOf(s, 1);
    const cost = trainCost(w);
    const cash = s.cash;
    expect(canTrain(s, w)).toBe(true);
    expect(train(s, w.id)).toBe(true);
    expect(w.level).toBe(2);
    expect(s.cash).toBe(cash - cost);
    expect(train(s, w.id)).toBe(false); // once a day
  });

  it("recovers a dead colleague's belongings once", () => {
    const s = newGame(3);
    s.cash = 5000;
    const [w] = crewOf(s, 1);
    w.status = "dead";
    s.infection = 20;
    expect(canRecover(s, w.id)).toBe(true);
    expect(recoverBelongings(s, w.id)).toBe(true);
    expect(s.loot).toHaveLength(1);
    expect(s.infection).toBe(16);
    expect(recoverBelongings(s, w.id)).toBe(false);
  });
});
