import { describe, expect, it } from "vitest";
import { FACILITY_LINES } from "../src/data/radioFacilities";
import { hire } from "../src/sim/crew";
import { startExpedition, stepExpedition } from "../src/sim/expedition";
import { buyUpgrade, facilityLines } from "../src/sim/facilities";
import { newGame } from "../src/sim/state";
import { daySummary } from "../src/sim/summary";

describe("facility radio lines", () => {
  it("are silent until a facility is owned, then grow with the tier", () => {
    const s = newGame(3);
    expect(facilityLines(s)).toEqual([]);
    s.cash = 100000;
    buyUpgrade(s, "mast");
    expect(facilityLines(s)).toEqual(FACILITY_LINES.mast[0]);
    buyUpgrade(s, "mast");
    buyUpgrade(s, "security");
    expect(facilityLines(s)).toEqual([...FACILITY_LINES.mast[0], ...FACILITY_LINES.mast[1], ...FACILITY_LINES.security[0]]);
    s.projects = ["floor2"];
    expect(facilityLines(s)).toContain(FACILITY_LINES.floor2[0][0]);
  });

  it("are heard on the radio only when owned", () => {
    const heard = (own: boolean) => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 6; seed++) {
        const s = newGame(seed);
        s.cash = 100000;
        if (own) for (const id of ["mast", "lab", "security", "breakroom", "dispatch"]) buyUpgrade(s, id);
        for (const w of s.pool.slice(0, 2)) {
          s.cash += w.cost;
          hire(s, w.id);
        }
        const exp = startExpedition(s, s.crew.map((w) => w.id), [{ x: 25, y: 5 }, { x: 12, y: 14 }])!;
        for (let i = 0; i < 2000 && exp.phase !== "done"; i++) stepExpedition(s, exp);
        for (const l of exp.log) out.add(l);
      }
      return [...out].filter((l) => /^(Dispatch|Lab|Mast|Security|Break Room|Upstairs):/.test(l));
    };
    expect(heard(false)).toEqual([]);
    expect(heard(true).length).toBeGreaterThan(0);
  });
});

describe("daySummary", () => {
  it("names the day, the dead and the cash", () => {
    const s = newGame(1);
    s.day = 12;
    s.cash = 1940;
    for (const w of s.pool.slice(0, 3)) {
      s.cash += w.cost;
      hire(s, w.id);
    }
    s.cash = 1940;
    for (const w of s.crew) w.status = "dead";
    expect(daySummary(s)).toBe("Day 12, 3 lost, $1,940");
  });
});
