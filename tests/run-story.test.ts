import { describe, expect, it } from "vitest";
import { CALLS, MAX_CALLS, THREAT_TICKS } from "../src/data/calls";
import { hire } from "../src/sim/crew";
import { answerCall, answerThreat, orderExpedition, orderReady, startExpedition, stepExpedition, levelOf, type Expedition } from "../src/sim/expedition";
import { dist, neighbors, type Pt } from "../src/sim/level";
import { newGame, type GameState } from "../src/sim/state";

function setup(seed: number, n = 3) {
  const s = newGame(seed, "Amos");
  for (const w of s.pool.slice(0, n)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  const exp = startExpedition(s, s.crew.map((w) => w.id), [{ x: 25, y: 5 }])!;
  return { s, exp };
}

// A hound two cells from the crew, ready to be noticed.
function stalk(s: GameState, exp: Expedition, id = "hound") {
  const lv = levelOf(s, exp.levelId);
  const cell = neighbors(lv, exp.pos).flatMap((p) => neighbors(lv, p)).find((p: Pt) => dist(p, exp.pos) === 2)!;
  exp.entities = [{ id, pos: { ...cell }, cooldown: 0, seen: false }];
}

describe("calls", () => {
  it("has more than a dozen kinds, each with outcomes", () => {
    expect(CALLS.length).toBeGreaterThanOrEqual(14);
  });

  it("asks several questions in one run, never the same one twice", () => {
    let most = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { s, exp } = setup(seed);
      exp.entities = [];
      const asked: string[] = [];
      for (let i = 0; i < 3000 && exp.phase !== "done"; i++) {
        if (exp.call) {
          asked.push(exp.call.id);
          answerCall(s, exp, 0);
        }
        stepExpedition(s, exp);
      }
      expect(new Set(asked).size).toBe(asked.length);
      expect(asked.length).toBeLessThanOrEqual(MAX_CALLS);
      most = Math.max(most, asked.length);
    }
    expect(most).toBeGreaterThanOrEqual(3);
  });

  it("resolves every call both ways without throwing", () => {
    for (const def of CALLS) {
      for (const choice of [0, 1]) {
        const { s, exp } = setup(def.id.length + choice, 3);
        s.cash = 500;
        exp.carried.push("almond-water");
        exp.call = { id: def.id, asked: exp.tick, m: exp.crewIds[1] };
        exp.callIds = [def.id];
        expect(answerCall(s, exp, choice), `${def.id}:${choice}`).toBe(true);
        for (const l of exp.log) expect(l).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe("orders", () => {
  it("hold stops the crew; push on moves faster", () => {
    const a = setup(3);
    a.exp.entities = [];
    a.exp.callsMade = 99;
    const before = { ...a.exp.pos };
    expect(orderExpedition(a.s, a.exp, "hold")).toBe(true);
    for (let i = 0; i < 6; i++) stepExpedition(a.s, a.exp);
    expect(a.exp.pos).toEqual(before);

    const slow = setup(3);
    const fast = setup(3);
    for (const x of [slow, fast]) { x.exp.entities = []; x.exp.callsMade = 99; }
    orderExpedition(fast.s, fast.exp, "push");
    for (let i = 0; i < 6; i++) { stepExpedition(slow.s, slow.exp); stepExpedition(fast.s, fast.exp); }
    expect(dist(fast.exp.pos, levelOf(fast.s, "level-0").entrance)).toBeGreaterThan(dist(slow.exp.pos, levelOf(slow.s, "level-0").entrance));
  });

  it("turn back sends the crew home, and orders cool down", () => {
    const { s, exp } = setup(4);
    exp.entities = [];
    expect(orderExpedition(s, exp, "back")).toBe(true);
    expect(exp.phase).toBe("return");
    expect(orderReady(exp, "back")).toBe(false);
    const b = setup(4);
    orderExpedition(b.s, b.exp, "hold");
    expect(orderReady(b.exp, "hold")).toBe(false);
    b.exp.tick += 20;
    expect(orderReady(b.exp, "hold")).toBe(true);
  });

  it("distract costs the cheapest thing carried and sends the nearest thing away", () => {
    const { s, exp } = setup(5);
    stalk(s, exp);
    exp.carried = ["level-key", "almond-water"];
    expect(orderExpedition(s, exp, "distract")).toBe(true);
    expect(exp.carried).toEqual(["level-key"]);
    expect(exp.entities[0].cooldown).toBeGreaterThan(0);
    expect(orderReady(setup(5).exp, "distract")).toBe(false); // nothing to throw
  });
});

describe("threats", () => {
  it("freezes the crew when something deadly is close, then resolves on its own", () => {
    const { s, exp } = setup(6);
    exp.callsMade = 99;
    stalk(s, exp);
    stepExpedition(s, exp);
    expect(exp.threat?.id).toBe("hound");
    const at = { ...exp.pos };
    for (let i = 0; i < THREAT_TICKS + 2 && exp.threat; i++) {
      stepExpedition(s, exp);
      if (exp.threat) expect(exp.pos).toEqual(at);
    }
    expect(exp.threat).toBeUndefined();
    expect(exp.encounters).toBeGreaterThan(0);
  });

  it("lets the office hide, run, distract or give someone", () => {
    for (const choice of [0, 1, 2, 3]) {
      const { s, exp } = setup(10 + choice, 3);
      exp.callsMade = 99;
      exp.carried = ["almond-water"];
      stalk(s, exp);
      stepExpedition(s, exp);
      expect(exp.threat).toBeDefined();
      expect(answerThreat(s, exp, choice), `choice ${choice}`).toBe(true);
      expect(exp.threat).toBeUndefined();
      for (const l of exp.log) expect(l).not.toMatch(/\{\w+\}/);
      if (choice === 2) expect(exp.carried).toEqual([]);
      if (choice === 3) expect(s.crew.filter((w) => w.status === "dead")).toHaveLength(1);
    }
  });

  it("does not ask when the thing is harmless", () => {
    const { s, exp } = setup(8);
    exp.callsMade = 99;
    stalk(s, exp, "faceling");
    stepExpedition(s, exp);
    expect(exp.threat).toBeUndefined();
  });
});

describe("replay trace", () => {
  it("records the crew and every entity each tick, and stops at a cap", () => {
    const { s, exp } = setup(2);
    for (let i = 0; i < 20; i++) stepExpedition(s, exp);
    expect(exp.trace!.length).toBe(20);
    expect(exp.trace![0]).toHaveLength(2 + exp.entities.length * 2);
  });
});
