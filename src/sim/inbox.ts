import { STAGE_MEMOS } from "../data/infection";
import { ACT_MEMOS, BEATS, STORY_EVENTS } from "../data/story";
import type { GameState, Memo } from "./state";

// How the inbox sorts and filters memos. Pure, so it can be tested.
export type InboxFilter = "all" | "unread" | "decisions" | "story" | "board" | "staff";
export const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "decisions", label: "Decisions" },
  { id: "story", label: "Story" },
  { id: "board", label: "Board" },
  { id: "staff", label: "Staff" },
];

const STORY_SUBJECTS = new Set<string>([
  ...BEATS.map((b) => b.subject),
  ...Object.values(ACT_MEMOS).map((m) => m.subject),
  ...STAGE_MEMOS.flatMap((m) => (m ? [m.subject] : [])),
]);
const STORY_FROM = new Set(["(no sender)", "{boss}", "Level 0"]);
const STAFF_FROM = new Set(["HR", "Payroll", "Logistics"]);

export const isPending = (m: Memo) => !!m.event && m.event.choice === undefined;
const isCrewName = (s: GameState, name: string) => s.crew.some((w) => w.name === name);

// Story memos: the strange ones, the act letters, and mail from the dead.
export function isStory(s: GameState, m: Memo): boolean {
  if (m.event && m.event.id in STORY_EVENTS) return true;
  return (
    STORY_FROM.has(m.from) ||
    m.from.startsWith("Derek") ||
    STORY_SUBJECTS.has(m.subject) ||
    m.subject.startsWith("Quarter ") ||
    m.subject.startsWith("The descent") ||
    m.subject.startsWith("In Memoriam") ||
    m.subject.startsWith("Resource rotation notice") ||
    isCrewName(s, m.from) // the dead write back
  );
}

export const isBoard = (m: Memo) => m.from === "The Board";
export const isStaff = (s: GameState, m: Memo) => m.tag === "digest" || STAFF_FROM.has(m.from) || isCrewName(s, m.from);

export function matches(s: GameState, m: Memo, f: InboxFilter): boolean {
  switch (f) {
    case "unread": return !m.read;
    case "decisions": return isPending(m);
    case "story": return isStory(s, m);
    case "board": return isBoard(m);
    case "staff": return isStaff(s, m);
    default: return true;
  }
}

// Pinned: decisions waiting for an answer, then story and dead-staff memos you
// have not read yet. The rest keeps its order (newest first).
export const isPinned = (s: GameState, m: Memo) => isPending(m) || (!m.read && isStory(s, m));

export function inboxList(s: GameState, f: InboxFilter, keepId?: number | null): { pinned: Memo[]; rest: Memo[] } {
  const shown = s.memos.filter((m) => m.id === keepId || matches(s, m, f));
  const pinned = shown.filter((m) => isPinned(s, m)).sort((a, b) => Number(isPending(b)) - Number(isPending(a)));
  return { pinned, rest: shown.filter((m) => !pinned.includes(m)) };
}

// What to open first: a decision waiting, else the newest unread, else the newest.
export function firstToOpen(s: GameState): Memo | undefined {
  const { pinned, rest } = inboxList(s, "all");
  const all = [...pinned, ...rest];
  return all.find(isPending) ?? all.find((m) => !m.read) ?? all[0];
}

export function inboxCounts(s: GameState): { unread: number; decisions: number } {
  return { unread: s.memos.filter((m) => !m.read).length, decisions: s.memos.filter(isPending).length };
}
