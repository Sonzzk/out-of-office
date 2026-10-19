// Sorting for the HR crew table. Pure, so it can be tested without a DOM.
export type SortKey = "name" | "level" | "status" | "wage";
export type SortDir = "asc" | "desc";

export interface CrewRow {
  id: number;
  name: string;
  level: number;
  status: "idle" | "busy" | "out";
  wage: number;
}

// Idle first: those are the ones you can act on.
const STATUS_ORDER = { idle: 0, busy: 1, out: 2 } as const;

export function sortCrew<T extends CrewRow>(rows: readonly T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: T, b: T): number => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name);
      case "level":
        return a.level - b.level;
      case "status":
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case "wage":
        return a.wage - b.wage;
    }
  };
  // Ties fall back to name, then id, so the order never jumps around between renders.
  return [...rows].sort((a, b) => sign * cmp(a, b) || a.name.localeCompare(b.name) || a.id - b.id);
}

/** Clicking the active column flips it; a new column starts ascending (names and status) or descending (numbers). */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "level" || key === "wage" ? "desc" : "asc" };
}
