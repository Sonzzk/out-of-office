import { describe, expect, it } from "vitest";
import { makeRng } from "../src/sim/rng";
import { companyName, newGame } from "../src/sim/state";

describe("rng", () => {
  it("replays the same sequence for the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("new game", () => {
  it("names the company from the seed", () => {
    expect(companyName(7)).toBe(companyName(7));
    expect(companyName(7).split(" ").length).toBeGreaterThanOrEqual(2);
  });

  it("starts calm and survives a JSON round trip", () => {
    const s = newGame(1);
    expect(s.heat).toBe(0);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("asks for onboarding until a catchphrase is signed", () => {
    expect(newGame(1).catchphrase).toBeUndefined();
  });
});
