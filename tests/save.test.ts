import { describe, expect, it } from "vitest";
import { exportSave, parseSave, readSave } from "../src/save";
import { newGame, SAVE_VERSION } from "../src/sim/state";

describe("save files", () => {
  it("round-trips through export and import", () => {
    const s = newGame(9);
    s.cash = 4242;
    const back = parseSave(exportSave(s));
    expect(back?.cash).toBe(4242);
    expect(back?.version).toBe(SAVE_VERSION);
  });

  it("refuses text that is not a save", () => {
    expect(parseSave("not json")).toBeNull();
    expect(parseSave("{}")).toBeNull();
    expect(parseSave(JSON.stringify({ version: 1, cash: 5 }))).toBeNull();
  });

  it("reports why a save was not used instead of dropping it silently", () => {
    expect(readSave(null)).toEqual({ state: null });
    expect(readSave("{broken").problem).toBe("unreadable");
    expect(readSave(JSON.stringify({ version: SAVE_VERSION + 1 })).problem).toBe("newer");
    expect(readSave(exportSave(newGame(3))).problem).toBeUndefined();
  });
});
