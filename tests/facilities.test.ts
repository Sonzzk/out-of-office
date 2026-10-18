import { describe, expect, it } from "vitest";
import { CALL_TICKS } from "../src/data/calls";
import { hire, skill, type Worker } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { callTicks, startExpedition, stepExpedition } from "../src/sim/expedition";
import { buyUpgrade, canUpgrade, crewSlots, tier, upkeep } from "../src/sim/facilities";
import { bribeCost } from "../src/sim/office";
import { startResearch } from "../src/sim/research";
import { migrate, newGame, SAVE_VERSION, type GameState } from "../src/sim/state";

function hireAll(s: GameState, n = 3): Worker[] {
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s.crew;
}

describe("facilities", () => {
  it("charges for each tier, stops at the top, and bills upkeep with payroll", () => {
    const s = newGame(1);
    s.cash = 10000;
    expect(buyUpgrade(s, "mast")).toBe(true);
    expect(buyUpgrade(s, "mast")).toBe(true);
    expect(tier(s, "mast")).toBe(2);
    expect(s.cash).toBe(10000 - 800 - 3000);
    expect(upkeep(s)).toBe(80);
    const top = newGame(1);
    top.cash = 50000;
    for (let i = 0; i < 4; i++) buyUpgrade(top, "mast");
    expect(canUpgrade(top, "mast")).toBe(false);
    expect(tier(top, "mast")).toBe(4);
    hireAll(s, 1);
    const before = s.cash;
    endDay(s);
    expect(s.ledger.find((l) => l.text === "Facilities upkeep")?.amount).toBe(-80);
    expect(s.cash).toBeLessThan(before - 80);
  });

  it("refuses an upgrade the company can't afford", () => {
    const s = newGame(2);
    s.cash = 500;
    expect(buyUpgrade(s, "dispatch")).toBe(false);
    expect(s.cash).toBe(500);
  });

  it("lets a third crew out with the Dispatch Desk", () => {
    const s = newGame(3);
    const [a, b, c] = hireAll(s);
    s.cash = 5000;
    buyUpgrade(s, "dispatch");
    expect(crewSlots(s)).toBe(3);
    for (const [w, y] of [[a, 5], [b, 15], [c, 10]] as const) expect(startExpedition(s, [w.id], { x: 25, y })).not.toBeNull();
  });

  it("researches two samples a night with a second bench", () => {
    const s = newGame(4);
    s.cash = 5000;
    s.loot.push({ id: 900, itemId: "sample-hound", foundBy: "X" }, { id: 901, itemId: "sample-smiler", foundBy: "X" });
    expect(startResearch(s, 900)).toBe(true);
    expect(startResearch(s, 901)).toBe(false);
    buyUpgrade(s, "lab");
    expect(startResearch(s, 901)).toBe(true);
    endDay(s);
    expect(s.index.hound.stage).toBe(2);
    expect(s.index.smiler.stage).toBe(2);
    expect(s.research).toEqual([]);
  });

  it("makes calls wait longer with the Radio Mast", () => {
    const s = newGame(5);
    const [a, b] = hireAll(s, 2);
    s.cash = 5000;
    buyUpgrade(s, "mast");
    const e1 = startExpedition(s, [a.id], { x: 25, y: 5 })!;
    expect(callTicks(e1)).toBe(Math.round(CALL_TICKS * 1.5));
    const e2 = startExpedition(s, [b.id], { x: 25, y: 15 }, undefined, "level-0", ["radio"])!;
    expect(callTicks(e2)).toBe(CALL_TICKS * 3);
  });

  it("cools heat faster and makes bribes cheaper with the Security Desk", () => {
    const s = newGame(6);
    s.cash = 10000;
    s.heat = 50;
    const plain = bribeCost(s);
    buyUpgrade(s, "security");
    buyUpgrade(s, "security");
    expect(bribeCost(s)).toBeLessThan(plain);
    endDay(s);
    expect(s.heat).toBe(38);
  });

  it("gives crews on a run extra Morale with the Break Room, and takes it back after", () => {
    const s = newGame(7);
    const [w] = hireAll(s, 1);
    w.skills.morale = 2;
    w.skills.stealth = 6;
    s.cash = 5000;
    buyUpgrade(s, "breakroom");
    const exp = startExpedition(s, [w.id], { x: 25, y: 5 })!;
    expect(skill(w, "morale")).toBeGreaterThanOrEqual(3);
    while (exp.phase !== "done") stepExpedition(s, exp);
    expect(w.boost).toBeUndefined();
  });

  it("migrates a version 7 save with a busy lab bench and a run out", () => {
    const s = newGame(8);
    const [w] = hireAll(s, 1);
    startExpedition(s, [w.id], { x: 25, y: 5 });
    const old = JSON.parse(JSON.stringify(s));
    old.version = 7;
    old.research = { itemId: "sample-hound", startedDay: 1 };
    delete old.upgrades;
    delete old.expeditions[0].gear;
    delete old.expeditions[0].used;
    const m = migrate(old)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.research).toEqual([{ itemId: "sample-hound", startedDay: 1 }]);
    expect(m.upgrades).toEqual({});
    expect(m.expeditions[0].gear).toEqual([]);
    expect(callTicks(m.expeditions[0])).toBe(CALL_TICKS);
  });
});
