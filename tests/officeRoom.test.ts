import { describe, expect, it } from "vitest";
import { OFFICE_LAYERS } from "../src/data/office3d";
import { officeLayers } from "../src/sim/officeRoom";
import { newGame } from "../src/sim/state";

describe("office view layers", () => {
  it("starts with a bare room and a shut door", () => {
    expect(officeLayers(newGame(1))).toEqual(["fx_door_closed"]);
  });

  it("stacks every bought tier and swaps the antenna", () => {
    const s = newGame(2);
    s.upgrades = { breakroom: 2, mast: 3 };
    s.projects = [...(s.projects ?? []), "floor2"];
    expect(officeLayers(s, { figure: true })).toEqual(["fx_door_open", "up_breakroom_1", "up_breakroom_2", "up_mast_3", "fx_figure"]);
  });

  it("only asks for layers that were rendered", () => {
    const s = newGame(3);
    s.upgrades = { breakroom: 4, dispatch: 4, lab: 4, security: 4, mast: 4 };
    for (const n of officeLayers(s, { figure: true })) expect(OFFICE_LAYERS).toContain(n);
  });
});
