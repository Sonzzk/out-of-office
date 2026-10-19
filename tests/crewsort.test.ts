import { describe, expect, it } from "vitest";
import { nextSort, sortCrew, type CrewRow } from "../src/ui/crewsort";

const row = (id: number, name: string, level: number, status: CrewRow["status"], wage: number): CrewRow => ({ id, name, level, status, wage });
const rows = [row(1, "Dana", 2, "out", 25), row(2, "Abel", 3, "idle", 40), row(3, "Cy", 2, "busy", 15)];

describe("crew sort", () => {
  it("sorts by each column in both directions without touching the input", () => {
    expect(sortCrew(rows, "name", "asc").map((r) => r.name)).toEqual(["Abel", "Cy", "Dana"]);
    expect(sortCrew(rows, "wage", "desc").map((r) => r.wage)).toEqual([40, 25, 15]);
    expect(sortCrew(rows, "status", "asc").map((r) => r.status)).toEqual(["idle", "busy", "out"]);
    expect(sortCrew(rows, "level", "desc")[0].name).toBe("Abel");
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("breaks ties by name", () => {
    expect(sortCrew(rows, "level", "asc").map((r) => r.name)).toEqual(["Cy", "Dana", "Abel"]);
    expect(sortCrew(rows, "level", "desc").map((r) => r.name)).toEqual(["Abel", "Cy", "Dana"]);
  });
  it("flips direction on the same column and picks a sensible start otherwise", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "wage")).toEqual({ key: "wage", dir: "desc" });
    expect(nextSort({ key: "wage", dir: "desc" }, "status")).toEqual({ key: "status", dir: "asc" });
  });
});
