import { describe, expect, it } from "vitest";
import { canDeliver, deliver, MAX_CONTRACTS, rollContracts } from "../src/sim/contracts";
import { generatePool } from "../src/sim/crew";
import { endDay, sell, sellPrice } from "../src/sim/economy";
import { noteGoal } from "../src/sim/goals";
import { newGame } from "../src/sim/state";
import { rollTwist, TWISTS, twistIs } from "../src/sim/twists";

const at = (seed: number, day: number) => {
  const s = newGame(seed);
  s.day = day;
  return s;
};

describe("daily twist", () => {
  it("never rolls before day 3", () => {
    for (let seed = 1; seed < 60; seed++)
      for (const day of [1, 2]) {
        const s = at(seed, day);
        rollTwist(s);
        expect(s.twist).toBeUndefined();
      }
  });

  it("is the same for a given seed and day", () => {
    for (let seed = 1; seed < 30; seed++) {
      const a = at(seed, 9);
      const b = at(seed, 9);
      rollTwist(a);
      rollTwist(b);
      expect(a.twist).toEqual(b.twist);
    }
  });

  it("happens on some days and not others, and never repeats back to back", () => {
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed < 20; seed++) {
      const s = at(seed, 3);
      let prev: string | undefined;
      for (let d = 3; d < 60; d++) {
        s.day = d;
        rollTwist(s);
        if (s.twist) {
          hits++;
          expect(TWISTS.some((t) => t.id === s.twist!.id)).toBe(true);
          expect(s.twist.id).not.toBe(prev);
          prev = s.twist.id;
        } else misses++;
      }
    }
    expect(hits).toBeGreaterThan(100);
    expect(misses).toBeGreaterThan(100);
  });

  it("only lasts the day it was rolled", () => {
    const s = at(1, 3);
    s.twist = { id: "buyer", day: 3 };
    expect(twistIs(s, "buyer")).toBe(true);
    s.day = 4;
    expect(twistIs(s, "buyer")).toBe(false);
  });

  it("is rolled by endDay", () => {
    const s = newGame(7);
    s.tutorial = 99;
    let seen = false;
    for (let i = 0; i < 30; i++) {
      endDay(s);
      if (s.twist) {
        expect(s.twist.day).toBe(s.day);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });
});

describe("twist effects", () => {
  it("collector pays 40% more", () => {
    const s = at(1, 5);
    const base = sellPrice("polaroid", s);
    s.twist = { id: "buyer", day: 5 };
    expect(sellPrice("polaroid", s)).toBe(Math.round(base * 1.4));
    s.loot.push({ id: 900, itemId: "polaroid", foundBy: "x" } as never);
    const cash = s.cash;
    sell(s, 900);
    expect(s.cash - cash).toBeGreaterThanOrEqual(Math.round(base * 1.4));
  });

  it("agency sale makes applicants cheaper", () => {
    const s = at(2, 6);
    const normal = generatePool(s).map((w) => w.cost);
    s.twist = { id: "bargain", day: 6 };
    s.nextId = 1;
    const cheap = generatePool(s).map((w) => w.cost);
    cheap.forEach((c, i) => expect(c).toBeLessThan(normal[i]));
    cheap.forEach((c, i) => expect(Math.abs(c - normal[i] * 0.7)).toBeLessThanOrEqual(10));
  });

  it("quarter-end rush doubles the goal payout", () => {
    for (const rush of [false, true]) {
      const s = at(3, 4);
      s.goal = { kind: "earn", need: 10, have: 0, reward: 100, day: 4 };
      if (rush) s.twist = { id: "rush", day: 4 };
      const cash = s.cash;
      noteGoal(s, "earn", 10);
      expect(s.cash - cash).toBe(rush ? 200 : 100);
    }
  });
});

describe("contracts", () => {
  const withOffer = () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = at(seed, 5);
      rollContracts(s);
      if (s.contracts?.length) return s;
    }
    throw new Error("no offer in 200 seeds");
  };

  it("offers nothing before day 3 and never more than the cap", () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = at(seed, 2);
      rollContracts(s);
      expect(s.contracts ?? []).toHaveLength(0);
    }
    const s = at(1, 5);
    for (let d = 5; d < 80; d++) {
      s.day = d;
      rollContracts(s);
      expect(s.contracts!.length).toBeLessThanOrEqual(MAX_CONTRACTS);
    }
  });

  it("writes a Board memo and gives a deadline", () => {
    const s = withOffer();
    const c = s.contracts![0];
    expect(c.deadline).toBeGreaterThan(s.day);
    expect(s.memos[0].subject).toContain("Contract offer");
    expect(c.reward).toBeGreaterThan(0);
  });

  it("expires quietly", () => {
    const s = withOffer();
    const memos = s.memos.length;
    const c = s.contracts![0];
    s.day = c.deadline; // last day still counts
    rollContracts(s);
    expect(s.contracts!.some((x) => x.id === c.id)).toBe(true);
    s.day = c.deadline + 1;
    s.memos.length = memos;
    rollContracts(s);
    expect(s.contracts!.some((x) => x.id === c.id)).toBe(false);
  });

  it("delivers only with enough items, takes exactly that many, and pays", () => {
    const s = withOffer();
    const c = s.contracts![0];
    expect(deliver(s, c.id)).toBe(false);
    for (let i = 0; i < c.need - 1; i++) s.loot.push({ id: 800 + i, itemId: c.itemId, foundBy: "x" } as never);
    expect(canDeliver(s, c)).toBe(false); // one short
    expect(deliver(s, c.id)).toBe(false);
    s.loot.push({ id: 850, itemId: c.itemId, foundBy: "x" } as never, { id: 851, itemId: c.itemId, foundBy: "x" } as never);
    const cash = s.cash;
    expect(deliver(s, c.id)).toBe(true);
    expect(s.cash).toBe(cash + c.reward);
    expect(s.loot.filter((l) => l.itemId === c.itemId)).toHaveLength(1);
    expect(s.contracts!.some((x) => x.id === c.id)).toBe(false);
    expect(deliver(s, c.id)).toBe(false);
  });
});
