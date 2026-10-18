import { describe, expect, it } from "vitest";
import { CALL_OUTCOMES, CALLS, CALL_TIMEOUT, THREAT_LINES, THREAT_OUTCOMES } from "../src/data/calls";
import { AMBIENT_EXTRA, LEVEL_AMBIENT, OPENERS, PASSED_MORE, SPOTTED_MORE } from "../src/data/radioMore";
import { ENTITIES } from "../src/data/entities";
import { LEVELS } from "../src/data/levels";
import { hire } from "../src/sim/crew";
import { startExpedition, stepExpedition } from "../src/sim/expedition";
import { newGame } from "../src/sim/state";

describe("radio", () => {
  it("has plenty to say", () => {
    for (const l of LEVELS) expect(LEVEL_AMBIENT[l.id]?.length, l.id).toBeGreaterThanOrEqual(5);
    for (const e of ENTITIES) {
      expect(e.spotted.length + (SPOTTED_MORE[e.id]?.length ?? 0), `${e.id} spotted`).toBeGreaterThanOrEqual(5);
      expect(1 + (PASSED_MORE[e.id]?.length ?? 0), `${e.id} passed`).toBeGreaterThanOrEqual(3);
    }
    expect(AMBIENT_EXTRA.length + Object.values(LEVEL_AMBIENT).flat().length).toBeGreaterThan(60);
    expect(OPENERS.length).toBeGreaterThanOrEqual(6);
  });

  it("does not repeat itself across a session of runs", () => {
    const s = newGame(7);
    for (const w of s.pool.slice(0, 2)) {
      s.cash += w.cost;
      hire(s, w.id);
    }
    const heard: string[] = [];
    for (let run = 0; run < 5; run++) {
      const exp = startExpedition(s, s.crew.map((w) => w.id), [{ x: 25, y: 5 }, { x: 12, y: 14 }])!;
      for (let i = 0; i < 2000 && exp.phase !== "done"; i++) stepExpedition(s, exp);
      for (const w of s.crew) if (w.status === "dead") w.status = "idle";
      for (const l of exp.log) heard.push(l.replace(/^[^:]+: /, ""));
    }
    expect(s.recentLines?.length).toBeGreaterThan(0);
    // Calls and threats are meant to come back; this is about the chatter.
    const templates = [CALL_TIMEOUT, ...THREAT_LINES, ...CALLS.map((c) => c.text), ...Object.values(CALL_OUTCOMES).flat(), ...Object.values(THREAT_OUTCOMES).flat()];
    const asRegex = (t: string) => new RegExp("^" + t.replace(/^\{n\}: /, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\w+\\\}/g, ".*") + "$");
    const callLike = templates.map(asRegex);
    const ambient = heard.filter((l) => !callLike.some((r) => r.test(l)) && !/Back at|Home|home|Index updated|HR learned|is now (Seen|Known)/.test(l));
    const repeats = ambient.length - new Set(ambient).size;
    expect(repeats / ambient.length).toBeLessThan(0.25);
  });

  it("never leaves a placeholder in a line", () => {
    const s = newGame(9, "Amos");
    for (const w of s.pool.slice(0, 2)) {
      s.cash += w.cost;
      hire(s, w.id);
    }
    const exp = startExpedition(s, s.crew.map((w) => w.id), [{ x: 25, y: 5 }])!;
    for (let i = 0; i < 2000 && exp.phase !== "done"; i++) stepExpedition(s, exp);
    for (const l of exp.log) expect(l, l).not.toMatch(/\{\w+\}/);
  });
});
