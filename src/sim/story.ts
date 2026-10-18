import { INDEX } from "../data/index";
import { ACT_MEMOS, ACT_RADIO, BEATS, ENDINGS, FINAL_RADIO, QUARTER_MEMOS, STORY_EVENTS, type StoryBeat, type StoryFx } from "../data/story";
import { fill, addMemo, type GameState, type Memo } from "./state";
import { levelOf, MAX_CREW, running, startExpedition, type Expedition } from "./expedition";
import { dist, findPath, WALL } from "./level";
import { addHeat, addInfection } from "./office";
import { infectionStage } from "./infection";
import { isUnlocked, stageOf } from "./research";
import { skill } from "./crew";

// The story is three acts over the usual loop. Act 4 is "new quarter" mode,
// after an ending. All of it is derived from GameState, so it is pure and seeded.
export const ACT2_DAY = 13;
export const ACT3_DAY = 20;
export const ACT3_MASTERED = 4; // Index entries at Mastered
export const ACT3_TARGET_YEAR = 3; // the Board's second target has been met
export const QUARTER_LENGTH = 10;
export const MAX_BEATS_PER_NIGHT = 2;
const HIGH_INFECTION = 50;
const HIGH_HEAT = 60;
const LOYAL_REPLIES = 3;
const LOYAL_CASH = 2500;
const LOYAL_MAX_DEAD = 5;

export const actOf = (s: GameState): number => s.act ?? 1;
export const flag = (s: GameState, k: string): number => s.storyFlags?.[k] ?? 0;
const setFlag = (s: GameState, k: string, v: number) => void ((s.storyFlags ??= {})[k] = v);

export const deadCount = (s: GameState) => s.crew.filter((w) => w.status === "dead").length;
export const masteredCount = (s: GameState) => INDEX.filter((e) => stageOf(s, e.id) >= 3).length;

// What the Board wants before it opens the door.
export function exitRules(s: GameState): { label: string; done: boolean }[] {
  return [
    { label: "Level 10 charted", done: isUnlocked(s, "level-10") },
    { label: `${ACT3_MASTERED} Index entries Mastered (${Math.min(masteredCount(s), ACT3_MASTERED)}/${ACT3_MASTERED})`, done: masteredCount(s) >= ACT3_MASTERED },
    { label: "The Board's second target met", done: s.target.year >= ACT3_TARGET_YEAR },
  ];
}
export const exitReady = (s: GameState) => s.day >= ACT3_DAY && exitRules(s).every((r) => r.done);

function say(s: GameState, m: { from: string; subject: string; body: string }) {
  addMemo(s, { ...m, subject: fill(m.subject, { q: flag(s, "quarter") + 1 }) });
}

function applyFx(s: GameState, fx: StoryFx = {}): void {
  if (fx.replied) setFlag(s, "replied", flag(s, "replied") + fx.replied);
  if (fx.infection) addInfection(s, fx.infection);
  if (fx.heat) addHeat(s, fx.heat);
  if (fx.cash) {
    s.cash += fx.cash;
    s.ledger.unshift({ day: s.day, text: fx.ledger ?? "The Board: adjustment", amount: fx.cash });
  }
  for (const [k, v] of Object.entries(fx.flags ?? {})) setFlag(s, k, v);
}

// An answered strange memo (called from the event resolver).
export function resolveStory(s: GameState, id: string, choice: number): string {
  const beat = BEATS.find((b) => b.id === id);
  const c = beat?.ask?.choices[choice];
  if (!c) return "";
  applyFx(s, c.fx);
  return c.result;
}

export const isStoryEvent = (id: string) => id in STORY_EVENTS;

function sendBeat(s: GameState, b: StoryBeat): void {
  setFlag(s, `beat.${b.id}`, s.day);
  if (!b.ask) return say(s, b);
  const memo: Memo = { id: s.nextId++, from: b.from, subject: b.subject, body: b.body, day: s.day, read: false, event: { id: b.id, vars: {} } };
  s.memos.unshift(memo);
}

// Run at the end of each day, once the new day has begun. `before` is how many
// memos existed when tonight began: story memos slot in below tonight's others,
// so a warning from Legal still reads first.
export function storyNight(s: GameState, before = s.memos.length): void {
  const had = s.memos.length;
  nightStory(s);
  const fresh = s.memos.length - had;
  if (fresh > 0 && had > before) {
    const mine = s.memos.splice(0, fresh);
    s.memos.splice(had - before, 0, ...mine);
  }
}

function nightStory(s: GameState): void {
  if (s.ending) return;
  s.act ??= 1;
  resolveDescent(s);
  if (s.ending) return;
  if (s.act === 1 && s.day >= ACT2_DAY) {
    s.act = 2;
    say(s, ACT_MEMOS[2]);
  } else if (s.act === 2 && exitReady(s)) {
    s.act = 3;
    say(s, ACT_MEMOS[3]);
  }
  if (s.act === 4) return quarterNight(s);
  const due = BEATS.filter((b) => b.act === s.act && s.day >= b.day && !flag(s, `beat.${b.id}`) && (!b.when || b.when(s)));
  for (const b of due.slice(0, MAX_BEATS_PER_NIGHT)) sendBeat(s, b);
}

function quarterNight(s: GameState): void {
  const since = s.day - flag(s, "quarterDay");
  if (since < QUARTER_LENGTH || since % QUARTER_LENGTH !== 0) return;
  const memo = QUARTER_MEMOS[(flag(s, "quarter") + s.day) % QUARTER_MEMOS.length];
  say(s, memo);
}

// --- The final descent: one ordinary expedition to Level 10's far end -----
export function descentBlock(s: GameState): string | null {
  if (s.ending) return "The books are closed.";
  if (actOf(s) < 3) return "The Exit is not open yet.";
  if (running(s).length) return "Bring the other crews home first.";
  if (!isUnlocked(s, "level-10")) return "Level 10 is not charted.";
  if (!s.crew.some((w) => w.status === "idle")) return "There is nobody to send.";
  return null;
}

// The far end of the wheat, where the farmhouse is.
function farmhouse(s: GameState) {
  const lv = levelOf(s, "level-10");
  let best = lv.entrance;
  let far = -1;
  for (let y = 0; y < lv.h; y++)
    for (let x = 0; x < lv.w; x++) {
      if (lv.cells[y * lv.w + x] === WALL) continue;
      const d = dist(lv.entrance, { x, y });
      if (d > far && findPath(lv, lv.entrance, { x, y }).length) {
        far = d;
        best = { x, y };
      }
    }
  return best;
}

// Send the best idle crew. They take the same road as anyone, and the same risks.
export function beginDescent(s: GameState, crewIds?: number[]): Expedition | null {
  if (descentBlock(s)) return null;
  const ids =
    crewIds ??
    s.crew
      .filter((w) => w.status === "idle")
      .sort((a, b) => b.level - a.level || skill(b, "morale") - skill(a, "morale"))
      .slice(0, MAX_CREW)
      .map((w) => w.id);
  const exp = startExpedition(s, ids, farmhouse(s), undefined, "level-10");
  if (!exp) return null;
  exp.final = true;
  setFlag(s, "descents", flag(s, "descents") + 1);
  return exp;
}

// Which ending a finished descent earns. Order matters: the worst luck first.
export function endingFor(s: GameState, survivors: number): string {
  if (!survivors) return "skeleton";
  if (s.infection >= HIGH_INFECTION) return "assimilated";
  if (s.heat >= HIGH_HEAT) return "audit";
  if (flag(s, "derek") === 1) return "acquired";
  if (flag(s, "replied") >= LOYAL_REPLIES && s.cash >= LOYAL_CASH && deadCount(s) <= LOYAL_MAX_DEAD) return "promotion";
  return "daylight";
}

export function setEnding(s: GameState, id: string): void {
  s.ending = id;
  s.endings = [...new Set([...(s.endings ?? []), id])];
}

// A final descent that has come home and not yet been settled.
export const pendingDescent = (s: GameState) => !s.ending && s.expeditions.some((e) => e.final && e.phase === "done" && !flag(s, `final.${e.id}`));

// Called when an expedition ends (and again each night, in case nobody was watching).
export function resolveDescent(s: GameState): string | null {
  if (s.ending) return null;
  for (const e of s.expeditions) {
    if (!e.final || e.phase !== "done" || flag(s, `final.${e.id}`)) continue;
    setFlag(s, `final.${e.id}`, 1);
    const survivors = e.result?.survivors ?? 0;
    if (!survivors || e.reached) {
      setEnding(s, endingFor(s, survivors));
      return s.ending!;
    }
    addMemo(s, {
      from: "The Board",
      subject: "The descent: incomplete",
      body: "Your crew turned back before the farmhouse. The Board is not disappointed. The Board is patient, which is worse.\n\nThe door will stay open. Try again when you are ready, or when you are not.\n\n- The Board",
    });
  }
  return null;
}

// The back door: HR's form. Open from Phase Two, and it never fails.
export const canResign = (s: GameState) => !s.ending && actOf(s) >= 2 && !running(s).some((e) => e.final);
export function resign(s: GameState): boolean {
  if (!canResign(s)) return false;
  setEnding(s, s.infection >= HIGH_INFECTION ? "looped" : "resigned");
  return true;
}

// --- After an ending: a new quarter, same office ------------------------------
export function startQuarter(s: GameState): boolean {
  const id = s.ending;
  if (!id) return false;
  const q = ENDINGS[id].quarter;
  s.cash = Math.max(s.cash + q.cash, q.floor);
  if (q.heat !== undefined) s.heat = q.heat;
  if (q.infection !== undefined) s.infection = q.infection;
  s.ledger.unshift({ day: s.day, text: "New quarter: opening balance", amount: q.cash });
  s.ending = undefined;
  s.act = 4;
  setFlag(s, "quarter", flag(s, "quarter") + 1);
  setFlag(s, "quarterDay", s.day);
  setFlag(s, "derek", 0);
  s.target = { year: s.target.year + 1, amount: Math.max(s.target.amount, 2000), deadline: s.day + 8 };
  addMemo(s, { from: "The Board", subject: `Quarter ${flag(s, "quarter") + 1}: welcome back`, body: q.memo + "\n\n- The Board" });
  // The doors stay open: another descent is only a crew away, and a different ending.
  return true;
}

export function storyStats(s: GameState): [string, string][] {
  const found = INDEX.filter((e) => stageOf(s, e.id) > 0).length;
  const stage = ["clean", "damp", "wrong", "unwell", "ours"][infectionStage(s)];
  return [
    ["Days at the desk", String(s.day)],
    ["Cash in the bank", `$${s.cash.toLocaleString("en-US")}`],
    ["Staff lost", String(deadCount(s))],
    ["Heat", `${s.heat}%`],
    ["The office is", stage],
    ["Index", `${found}/${INDEX.length} seen, ${masteredCount(s)} mastered`],
    ["Strange memos answered", String(flag(s, "replied"))],
    ["Board targets met", String(Math.max(0, s.target.year - 1))],
  ];
}

// Extra radio on the way in, for the act the company is in.
export function actRadio(s: GameState, exp: Expedition): string[] {
  if (exp.final) return [...FINAL_RADIO, ...FINAL_RADIO, ...ACT_RADIO[3]];
  const act = Math.min(actOf(s), 3);
  return [...(ACT_RADIO[act] ?? []), ...(act > 1 ? ACT_RADIO[act - 1] : [])];
}
