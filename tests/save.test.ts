import { describe, expect, it } from "vitest";
import { exportSave, parseSave } from "../src/save";
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
});
