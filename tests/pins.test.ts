import { describe, expect, it } from "vitest";
import { hire } from "../src/sim/crew";
import { levelOf, MAX_PINS, startExpedition, stepExpedition } from "../src/sim/expedition";
import { newGame } from "../src/sim/state";

function game(seed: number) {
  const s = newGame(seed);
  s.cash += s.pool[0].cost;
  hire(s, s.pool[0].id);
  return s;
}

describe("pins", () => {
  it("visits every pin in the order they were dropped", () => {
    const s = game(3);
    const lv = levelOf(s, "level-0");
    const open = [];
    for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (lv.cells[y * lv.w + x] !== 0) open.push({ x, y });
    const far = open.filter((p) => p.x > 8);
    const pins = [far[0], far[Math.floor(far.length / 2)], far[far.length - 1]];
    const exp = startExpedition(s, [s.crew[0].id], pins)!;
    expect(exp.pins!.length).toBeGreaterThan(1);
    exp.entities = []; // nothing to scare the lead into turning back early
    const reached: number[] = [];
    let guard = 0;
    while (exp.phase !== "done" && exp.phase !== "return" && guard++ < 3000) {
      stepExpedition(s, exp);
      exp.pins!.forEach((p, i) => {
        if (p.x === exp.pos.x && p.y === exp.pos.y && !reached.includes(i)) reached.push(i);
      });
      if ((exp.phase as string) === "done") break;
    }
    expect(reached).toEqual(exp.pins!.map((_, i) => i));
  });

  it("caps the route and drops duplicates", () => {
    const s = game(4);
    const p = { x: 6, y: 10 };
    const exp = startExpedition(s, [s.crew[0].id], Array.from({ length: 12 }, () => ({ ...p })))!;
    expect(exp.pins!.length).toBe(1);
    const s2 = game(4);
    const lv = levelOf(s2, "level-0");
    const cells = [];
    for (let y = 0; y < lv.h && cells.length < 12; y++) for (let x = 0; x < lv.w && cells.length < 12; x++) if (lv.cells[y * lv.w + x] !== 0) cells.push({ x, y });
    const e2 = startExpedition(s2, [s2.crew[0].id], cells)!;
    expect(e2.pins!.length).toBeLessThanOrEqual(MAX_PINS);
  });
});
