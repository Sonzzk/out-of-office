import type { GameState, Memo, MemoTag } from "./state";

// The routine nightly memos (wages, the plaque) are folded into one digest per
// day so the inbox keeps its room for things that ask something of you.
export const DIGEST_FROM = "HR & Payroll";
export const digestSubject = (day: number) => `Daily digest: Day ${day}`;

type Incoming = { from: string; subject: string; body: string };

// What a routine memo adds to the digest, or null when it is not routine.
export function digestPart(m: Incoming): string | null {
  const paras = m.body.split("\n\n");
  if (m.from === "Payroll" && m.subject.startsWith("Payroll run")) return `PAYROLL\n${paras[0]}`;
  if (m.from === "HR" && m.subject.startsWith("Employee of the Month")) return `EMPLOYEE OF THE MONTH\n${paras.slice(0, 2).join("\n")}`;
  return null;
}

// Rolling memos replace themselves: tonight's goal makes yesterday's obsolete.
export function memoTag(m: Incoming): MemoTag | undefined {
  return m.from === "The Board" && m.subject.startsWith("Today's goal") ? "goal" : undefined;
}

// Fold a routine memo into today's digest. True when it was absorbed (the
// caller adds nothing); false when it should be added as an ordinary memo.
export function foldIntoDigest(state: GameState, m: Incoming): { memo: Memo | null; folded: boolean } {
  const part = digestPart(m);
  if (!part) return { memo: null, folded: false };
  const today = state.memos.find((x) => x.tag === "digest" && x.day === state.day);
  if (today) {
    today.body += `\n\n${part}`;
    today.read = false;
    return { memo: today, folded: true };
  }
  const memo: Memo = { id: state.nextId++, from: DIGEST_FROM, subject: digestSubject(state.day), body: part, day: state.day, read: false, tag: "digest" };
  return { memo, folded: false };
}
