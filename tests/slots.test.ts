import { describe, expect, it } from "vitest";
import { backupActive, createSaver, restore, saveToSlot, slotInfo, type Store } from "../src/save";
import { newGame } from "../src/sim/state";

const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const ACTIVE = "out-of-office.save";

describe("save slots", () => {
  it("copies the game into a slot and reads it back", () => {
    const store = memory();
    const s = newGame(11);
    s.day = 4;
    expect(slotInfo(2, store).empty).toBe(true);
    expect(saveToSlot(2, s, store)).toBe(true);
    expect(slotInfo(2, store)).toMatchObject({ empty: false, day: 4, company: s.company });
    expect(saveToSlot(4, s, store)).toBe(false);
    expect(saveToSlot(0, s, store)).toBe(false);
  });

  it("keeps the current save when a slot is loaded", () => {
    const store = memory();
    const a = newGame(1);
    a.day = 3;
    const b = newGame(2);
    b.day = 9;
    store.setItem(ACTIVE, JSON.stringify(a));
    saveToSlot(1, b, store);
    expect(restore(1, store)?.day).toBe(9);
    expect(JSON.parse(store.getItem(ACTIVE)!).day).toBe(9);
    expect(slotInfo("undo", store).day).toBe(3);
    // Undo swaps back, and the day-9 office is kept in turn.
    expect(restore("undo", store)?.day).toBe(3);
    expect(slotInfo("undo", store).day).toBe(9);
  });

  it("changes nothing when the source is empty or unreadable", () => {
    const store = memory();
    store.setItem(ACTIVE, JSON.stringify(newGame(1)));
    const before = store.getItem(ACTIVE);
    expect(restore(3, store)).toBeNull();
    store.setItem("out-of-office.save.slot3", "{not json");
    expect(restore(3, store)).toBeNull();
    expect(store.getItem(ACTIVE)).toBe(before);
    expect(slotInfo("undo", store).empty).toBe(true);
  });

  it("backs up the last save when the day rolls over", () => {
    const store = memory();
    const save = createSaver(() => store);
    const s = newGame(5);
    s.day = 2;
    save(s);
    save(s);
    expect(slotInfo("prevday", store).empty).toBe(true);
    s.day = 3;
    save(s);
    expect(slotInfo("prevday", store).day).toBe(2);
    s.day = 4;
    save(s);
    expect(slotInfo("prevday", store).day).toBe(3);
    expect(JSON.parse(store.getItem(ACTIVE)!).day).toBe(4);
  });

  it("finds an old save already in storage on the first save", () => {
    const store = memory();
    const old = newGame(8);
    old.day = 6;
    store.setItem(ACTIVE, JSON.stringify(old));
    const next = { ...old, day: 7 };
    createSaver(() => store)(next);
    expect(slotInfo("prevday", store).day).toBe(6);
  });

  it("does not throw when storage refuses", () => {
    const broken: Store = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => {} };
    expect(() => createSaver(() => broken)(newGame(1))).not.toThrow();
    expect(slotInfo(1, broken).empty).toBe(true);
    expect(restore(1, broken)).toBeNull();
    expect(() => backupActive(broken)).not.toThrow();
  });
});
