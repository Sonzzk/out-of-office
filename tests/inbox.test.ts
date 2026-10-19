import { describe, expect, it } from "vitest";
import { hire } from "../src/sim/crew";
import { endDay } from "../src/sim/economy";
import { firstToOpen, inboxCounts, inboxList, isPending, isPinned, isStory } from "../src/sim/inbox";
import { addMemo, newGame, type GameState } from "../src/sim/state";
import { dayReport, shareText, snapshotDay } from "../src/sim/summary";

function office(): GameState {
  const s = newGame(7, "Amos");
  s.tutorial = 4;
  for (const w of s.pool.slice(0, 2)) {
    s.cash += w.cost;
    hire(s, w.id);
  }
  return s;
}

describe("daily digest", () => {
  it("folds payroll and the plaque into one memo per day", () => {
    const s = office();
    addMemo(s, { from: "Payroll", subject: "Payroll run: Day 1", body: "Wages for 2 employees have been paid: $80.\n\nDesperate hires cost the most.\n\n- Payroll" });
    addMemo(s, { from: "HR", subject: "Employee of the Month: Walt", body: "Congratulations to Walt.\n\nWalt has survived 3 expeditions.\n\nTheir prize is a plaque.\n\n- HR" });
    const digests = s.memos.filter((m) => m.tag === "digest");
    expect(digests).toHaveLength(1);
    expect(digests[0].body).toContain("PAYROLL");
    expect(digests[0].body).toContain("EMPLOYEE OF THE MONTH");
    expect(digests[0].body).not.toContain("Desperate hires");
    expect(s.memos.some((m) => m.subject.startsWith("Payroll run"))).toBe(false);
  });

  it("marks the digest unread again and starts a new one the next day", () => {
    const s = office();
    addMemo(s, { from: "Payroll", subject: "Payroll run: Day 1", body: "Wages paid.\n\n- Payroll" });
    s.memos[0].read = true;
    addMemo(s, { from: "HR", subject: "Employee of the Month: A", body: "One.\n\nTwo.\n\nThree" });
    expect(s.memos[0].read).toBe(false);
    s.day = 2;
    addMemo(s, { from: "Payroll", subject: "Payroll run: Day 2", body: "Wages paid.\n\n- Payroll" });
    expect(s.memos.filter((m) => m.tag === "digest")).toHaveLength(2);
  });

  it("leaves other memos alone and keeps one goal memo", () => {
    const s = office();
    for (let i = 0; i < 4; i++) endDay(s);
    expect(s.memos.filter((m) => m.subject.startsWith("Today's goal"))).toHaveLength(1);
    expect(s.memos.filter((m) => m.tag === "digest").length).toBeLessThanOrEqual(4);
    expect(s.memos.some((m) => m.subject.startsWith("Payroll run"))).toBe(false);
  });
});

describe("inbox filters", () => {
  it("pins pending decisions first, then unread story memos", () => {
    const s = office();
    s.memos = [];
    addMemo(s, { from: "Facilities", subject: "Carpet", body: "x" });
    addMemo(s, { from: "(no sender)", subject: "do you still work here", body: "x" });
    addMemo(s, { from: "Legal", subject: "Lawsuit", body: "x" });
    s.memos.find((m) => m.subject === "Lawsuit")!.event = { id: "lawsuit", vars: {} };
    const { pinned, rest } = inboxList(s, "all");
    expect(pinned.map((m) => m.subject)).toEqual(["Lawsuit", "do you still work here"]);
    expect(rest.map((m) => m.subject)).toEqual(["Carpet"]);
    expect(isPending(pinned[0])).toBe(true);
    expect(isPinned(s, rest[0])).toBe(false);
  });

  it("filters by unread, decisions, story, board and staff", () => {
    const s = office();
    s.memos = [];
    addMemo(s, { from: "The Board", subject: "Fiscal year 1: target met", body: "x" });
    addMemo(s, { from: "HR", subject: "Resource rotation notice: Mara", body: "x" });
    addMemo(s, { from: "Payroll", subject: "Payroll run: Day 1", body: "x" });
    const names = (f: Parameters<typeof inboxList>[1]) => {
      const l = inboxList(s, f);
      return [...l.pinned, ...l.rest].length;
    };
    expect(names("board")).toBe(1);
    expect(names("staff")).toBe(2);
    expect(names("story")).toBe(1);
    expect(names("decisions")).toBe(0);
    s.memos.forEach((m) => (m.read = true));
    expect(names("unread")).toBe(0);
    expect(inboxCounts(s)).toEqual({ unread: 0, decisions: 0 });
  });

  it("opens the newest unread memo, not the oldest read one", () => {
    const s = office();
    s.memos = [];
    addMemo(s, { from: "Facilities", subject: "Old", body: "x" });
    addMemo(s, { from: "Facilities", subject: "New", body: "x" });
    addMemo(s, { from: "Facilities", subject: "Newest", body: "x" });
    s.memos.find((m) => m.subject === "Newest")!.read = true;
    expect(firstToOpen(s)!.subject).toBe("New");
    s.memos.forEach((m) => (m.read = true));
    expect(firstToOpen(s)!.subject).toBe("Newest");
  });

  it("calls mail from the dead story", () => {
    const s = office();
    const dead = s.crew[0];
    dead.status = "dead";
    addMemo(s, { from: dead.name, subject: "Quick question", body: "x" });
    expect(isStory(s, s.memos[0])).toBe(true);
  });
});

describe("day report", () => {
  it("reports what the closed day earned and spent, and what tomorrow holds", () => {
    const s = office();
    const snap = snapshotDay(s);
    s.ledger.unshift({ day: 1, text: "Sold stuff", amount: 300 });
    endDay(s);
    const r = dayReport(snap, s);
    expect(r.day).toBe(1);
    expect(r.earned).toBeGreaterThanOrEqual(300);
    expect(r.spent).toBeGreaterThan(0); // payroll
    expect(r.newMemos).toBeGreaterThan(0);
    expect(r.tomorrow.goal).toContain("Pays");
    const text = shareText(r, s);
    expect(text).toContain("Day 1 closed");
    expect(text).toContain("Heat");
  });
});
