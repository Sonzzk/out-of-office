// Playtester bot: plays seeded games headlessly and measures what a low-attention
// player would feel, in real seconds (one tick is 550 ms at normal speed).
//   npx vite-node scripts/playtester.ts [games] [days] > shots/playtester.json
// It reports pacing facts (idle gaps, decisions per minute, repeated radio lines,
// milestones by minute) and runs a simple attention model for a few player types.
// The attention model is an explicit guess, not data from real people.
import { writeFileSync, mkdirSync } from "node:fs";
import { hire, type Worker } from "../src/sim/crew";
import { endDay, sell } from "../src/sim/economy";
import { startExpedition, stepExpedition, levelOf, running, answerCall, type Expedition } from "../src/sim/expedition";
import { upgradeDef } from "../src/data/upgrades";
import { buyUpgrade, canUpgrade, crewSlots } from "../src/sim/facilities";
import { LEVELS } from "../src/data/levels";
import { canResearch, isUnlocked, startResearch } from "../src/sim/research";
import { Dice } from "../src/sim/rng";
import { newGame, type GameState } from "../src/sim/state";
import { ITEMS } from "../src/data/items";
import { entityDef } from "../src/data/entities";

const GAMES = Number(process.argv[2] ?? 60);
const DAYS = Number(process.argv[3] ?? 30);
const TICK_S = 0.55;
const UPGRADE_ORDER = ["dispatch", "mast", "security", "lab", "breakroom"];
const nextCost = (s: GameState, id: string) => upgradeDef(id).tiers[s.upgrades[id] ?? 0]?.cost ?? 1e9;

// Seconds a casual player needs for each kind of action (guesses from watching the UI).
const COST = { hire: 8, plan: 14, pin: 3, answer: 4, debrief: 6, sell: 5, research: 6, upgrade: 10, closeBooks: 4, memo: 8 };

type Kind = "call" | "encounter" | "loot" | "death" | "turnback" | "levelup" | "newentity" | "memo" | "upgrade" | "target" | "decision";
interface Beat { t: number; kind: Kind; note?: string }

interface RunLog { levelId: string; depth: number; seconds: number; calls: number; beats: Beat[]; lines: string[]; crew: number }

function runOnce(s: GameState, exp: Expedition, names: string[], dice: Dice): RunLog {
  const beats: Beat[] = [];
  const lines: string[] = [];
  let seenLines = exp.log.length;
  const norm = (l: string) => names.reduce((a, n) => a.split(n).join("{n}"), l).replace(/\$\d+/g, "$X");
  lines.push(...exp.log.map(norm));
  let tick = 0;
  let callAsked = -1;
  let last = { enc: exp.encounters, carried: exp.carried.length, phase: exp.phase as string, dead: s.crew.filter((w) => w.status === "dead").length };
  while (exp.phase !== "done" && tick < 3000) {
    // A casual player answers a call after a few seconds, not instantly.
    if (exp.call && callAsked < 0) callAsked = tick;
    if (exp.call && tick - callAsked >= Math.round(COST.answer / TICK_S)) {
      beats.push({ t: tick * TICK_S, kind: "decision", note: "answer call" });
      answerCall(s, exp, 0);
      callAsked = -1;
    }
    const hadCall = !!exp.call;
    stepExpedition(s, exp);
    tick++;
    if (!hadCall && exp.call) beats.push({ t: tick * TICK_S, kind: "call" });
    if (exp.encounters > last.enc) beats.push({ t: tick * TICK_S, kind: "encounter" });
    if (exp.carried.length > last.carried) beats.push({ t: tick * TICK_S, kind: "loot" });
    if (exp.phase === "return" && last.phase === "in") beats.push({ t: tick * TICK_S, kind: "turnback" });
    const dead = s.crew.filter((w) => w.status === "dead").length;
    if (dead > last.dead) beats.push({ t: tick * TICK_S, kind: "death" });
    last = { enc: exp.encounters, carried: exp.carried.length, phase: exp.phase, dead };
    for (; seenLines < exp.log.length; seenLines++) lines.push(norm(exp.log[seenLines]));
  }
  void dice;
  return { levelId: exp.levelId, depth: LEVELS.find((l) => l.id === exp.levelId)!.depth, seconds: tick * TICK_S, calls: exp.callsMade, beats, lines, crew: exp.crewIds.length };
}

interface Day { day: number; seconds: number; waiting: number; acting: number; runs: RunLog[]; decisions: number; cash: number; beats: Beat[]; milestones: { kind: Kind; note: string }[] }

function playDay(s: GameState, dice: Dice, seenLevels: Set<string>, seenEntities: Set<string>): Day {
  let acting = 0;
  let decisions = 0;
  const milestones: Day["milestones"] = [];
  const dayBeats: Beat[] = [];
  const mark = (kind: Kind, note: string) => milestones.push({ kind, note });
  const act = (sec: number, n = 1) => { acting += sec; decisions += n; };

  // Memos read when new (a low-attention player skims the first line).
  const unread = s.memos?.filter((m) => !m.read).length ?? 0;
  if (unread) act(COST.memo * Math.min(2, unread), 0);

  for (const w of [...s.pool].sort((a, b) => a.cost - b.cost)) {
    const alive = s.crew.filter((c) => c.status !== "dead").length;
    if (alive >= 4 || s.cash < w.cost + 300) continue;
    hire(s, w.id);
    act(COST.hire);
  }
  for (const id of UPGRADE_ORDER)
    if (canUpgrade(s, id) && s.cash > 2.2 * nextCost(s, id)) {
      buyUpgrade(s, id);
      act(COST.upgrade);
      mark("upgrade", id);
    }
  for (const l of [...s.loot]) if (canResearch(s, l.id)) { startResearch(s, l.id); act(COST.research); }

  const exps: Expedition[] = [];
  const names = s.crew.map((w) => w.name.split(" ")[0]).concat(s.crew.map((w) => w.name));
  const idle = () => s.crew.filter((w) => w.status === "idle");
  while (running(s).length < crewSlots(s) && idle().length) {
    const group = idle().sort((a, b) => b.level - a.level).slice(0, idle().length >= 4 ? 2 : 3);
    const open = LEVELS.filter((l) => isUnlocked(s, l.id));
    const avg = group.reduce((a, w) => a + w.level, 0) / group.length;
    const levelId = [...open].reverse().find((l) => l.depth <= Math.floor(avg * 1.5))?.id ?? "level-0";
    const lv = levelOf(s, levelId);
    const cells: { x: number; y: number }[] = [];
    lv.cells.forEach((c, i) => c !== 0 && cells.push({ x: i % lv.w, y: Math.floor(i / lv.w) }));
    const far = cells.filter((p) => p.x > 12);
    const depth = LEVELS.find((l) => l.id === levelId)!.depth;
    const gear: string[] = [];
    if (depth >= 2 && s.cash > 1500) gear.push("rope", "firstaid");
    const exp = startExpedition(s, group.map((w) => w.id), dice.pick(far.length ? far : cells), undefined, levelId, gear);
    if (!exp) break;
    act(COST.plan + COST.pin);
    if (!seenLevels.has(levelId)) { seenLevels.add(levelId); mark("levelup", levelId); }
    for (const e of exp.entities) if (!seenEntities.has(e.id)) { seenEntities.add(e.id); mark("newentity", entityDef(e.id).name); }
    exps.push(exp);
  }
  const logs = exps.map((e) => runOnce(s, e, names, dice));
  // Slots run side by side, so the wait is the longest run.
  const waiting = Math.max(0, ...logs.map((l) => l.seconds));
  for (const l of logs) { acting += COST.debrief; decisions++; dayBeats.push(...l.beats); }
  for (const l of [...s.loot]) if (!ITEMS[l.itemId].sampleOf || !canResearch(s, l.id)) { sell(s, l.id); }
  if (logs.length) act(COST.sell);
  endDay(s);
  act(COST.closeBooks);
  return { day: s.day, seconds: acting + waiting, waiting, acting, runs: logs, decisions, cash: s.cash, beats: dayBeats, milestones };
}

// Attention model. Each player type has a patience (drain per idle second) and
// what they find exciting. Novelty fades: the Nth copy of an event is worth less.
interface Persona { id: string; name: string; drain: number; gains: Partial<Record<Kind, number>>; fatigue: number; blurb: string }
const PERSONAS: Persona[] = [
  { id: "casual", name: "Cass, casual (scrolls between tasks)", drain: 2.4, fatigue: 0.62, gains: { call: 16, encounter: 12, loot: 6, death: 14, levelup: 22, newentity: 20, upgrade: 12, target: 18, decision: 3, memo: 4 }, blurb: "Wants something to happen every 10 seconds. Leaves when idle." },
  { id: "optimizer", name: "Otto, optimizer (likes numbers)", drain: 0.9, fatigue: 0.8, gains: { call: 8, encounter: 6, loot: 8, death: 6, levelup: 18, newentity: 8, upgrade: 20, target: 22, decision: 5, memo: 2 }, blurb: "Tolerates waiting if the economy has depth to chew on." },
  { id: "horror", name: "Hana, horror fan (wants dread)", drain: 1.3, fatigue: 0.55, gains: { call: 14, encounter: 18, loot: 3, death: 20, levelup: 24, newentity: 26, upgrade: 4, target: 6, decision: 2, memo: 8 }, blurb: "Cares about atmosphere and surprises. Hates repetition." },
  { id: "streamer", name: "Sam, streamer (needs clip moments)", drain: 1.8, fatigue: 0.5, gains: { call: 15, encounter: 20, loot: 4, death: 24, levelup: 20, newentity: 22, upgrade: 6, target: 10, decision: 3, memo: 6 }, blurb: "Needs a reaction-worthy moment every minute or two." },
];

function attention(p: Persona, days: Day[], firstDayBeatsWanted = false) {
  let a = 100;
  let t = 0;
  const seen: Record<string, number> = {};
  const gain = (k: Kind, key = k as string) => {
    const n = seen[key] ?? 0;
    seen[key] = n + 1;
    a = Math.min(100, a + (p.gains[k] ?? 0) * Math.pow(p.fatigue, n));
  };
  const timeline: { t: number; a: number }[] = [];
  let boredAt: number | null = null;
  let boredDay = 0;
  let lastEvent = 0;
  for (const d of days) {
    for (const m of d.milestones) gain(m.kind, `${m.kind}:${m.note}`);
    // Acting time: small steady engagement. Waiting time: walk through the beats.
    const acting = d.acting;
    a = Math.max(0, a - acting * p.drain * 0.15);
    t += acting;
    const beats = d.beats.sort((x, y) => x.t - y.t);
    let cursor = 0;
    for (const b of beats) {
      const gap = b.t - cursor;
      // Only the first few seconds of a gap feel free; after that the player drifts.
      a -= Math.max(0, gap - 4) * p.drain;
      t += gap;
      cursor = b.t;
      if (a < 40 && boredAt === null) { boredAt = t; boredDay = d.day; }
      if (a <= 0) return { quitAt: t, day: d.day, why: "idle", timeline, lastEvent, boredAt, boredDay };
      gain(b.kind, b.kind === "encounter" || b.kind === "loot" ? b.kind : b.kind);
      lastEvent = t;
    }
    const tail = Math.max(0, d.waiting - cursor);
    a -= Math.max(0, tail - 4) * p.drain;
    t += tail;
    timeline.push({ t, a });
    if (a < 40 && boredAt === null) { boredAt = t; boredDay = d.day; }
    if (a <= 0) return { quitAt: t, day: d.day, why: "idle", timeline, lastEvent, boredAt, boredDay };
    void firstDayBeatsWanted;
  }
  return { quitAt: null as number | null, day: days.length, why: "stayed", timeline, lastEvent, boredAt, boredDay };
}

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? 0;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const allRuns: RunLog[] = [];
const gaps: number[] = [];
const games: Day[][] = [];
for (let g = 1; g <= GAMES; g++) {
  const s = newGame(g * 101 + 7);
  const dice = new Dice(g);
  const seenLevels = new Set<string>();
  const seenEntities = new Set<string>();
  const days: Day[] = [];
  for (let d = 0; d < DAYS; d++) days.push(playDay(s, dice, seenLevels, seenEntities));
  games.push(days);
  for (const d of days)
    for (const r of d.runs) {
      allRuns.push(r);
      const ts = [0, ...r.beats.map((b) => b.t), r.seconds].sort((a, b) => a - b);
      for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
    }
}

// Saves from a mid game and a late game, for the browser tour (shots/save-*.json).
{
  const s = newGame(7 * 101 + 7);
  const dice = new Dice(7);
  const seenL = new Set<string>();
  const seenE = new Set<string>();
  mkdirSync("shots", { recursive: true });
  for (let d = 1; d <= 40; d++) {
    playDay(s, dice, seenL, seenE);
    if (d === 12 || d === 40) {
      const snap = JSON.parse(JSON.stringify(s));
      snap.tutorial = 4;
      snap.bossName = "Amos"; // otherwise the game thinks onboarding never happened
      snap.catchphrase = "Results, not excuses.";
      writeFileSync(`shots/save-d${d}.json`, JSON.stringify(snap));
    }
  }
}

// --- Pacing facts
const runSecs = allRuns.map((r) => r.seconds);
const idleShare = (limit: number) => {
  let over = 0;
  let total = 0;
  for (const r of allRuns) {
    const ts = [0, ...r.beats.map((b) => b.t), r.seconds].sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      total += gap;
      if (gap > limit) over += gap - limit;
    }
  }
  return over / total;
};
const callsPer = mean(allRuns.map((r) => r.calls));
const zeroCall = allRuns.filter((r) => r.calls === 0).length / allRuns.length;
const lineCount = new Map<string, number>();
let lineTotal = 0;
for (const g of games) for (const d of g) for (const r of d.runs) for (const l of r.lines) { lineCount.set(l, (lineCount.get(l) ?? 0) + 1); lineTotal++; }
const topLines = [...lineCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
// Repetition inside one casual session: the first 10 runs of each game.
let sessionRepeat = 0;
let sessionTotal = 0;
for (const g of games) {
  const seen = new Set<string>();
  let n = 0;
  for (const d of g) for (const r of d.runs) {
    if (n++ >= 10) break;
    for (const l of r.lines) { sessionTotal++; if (seen.has(l)) sessionRepeat++; seen.add(l); }
  }
}
const decisionsPerMin = mean(games.map((g) => {
  const secs = g.reduce((a, d) => a + d.seconds, 0);
  return (60 * g.reduce((a, d) => a + d.decisions + d.runs.reduce((x, r) => x + r.calls, 0), 0)) / secs;
}));
const dayLen = games.flatMap((g) => g.map((d) => d.seconds));
const waitShare = mean(games.map((g) => g.reduce((a, d) => a + d.waiting, 0) / g.reduce((a, d) => a + d.seconds, 0)));
const byDepth: Record<number, { n: number; secs: number[]; calls: number }> = {};
for (const r of allRuns) (byDepth[r.depth] ??= { n: 0, secs: [], calls: 0 }).secs.push(r.seconds), (byDepth[r.depth].calls += r.calls), byDepth[r.depth].n++;

// First-day and first-ten-minutes shape (game 1..GAMES median).
const day1 = games.map((g) => g[0]);
const minutesTo = (pred: (d: Day) => boolean) =>
  games.map((g) => {
    let t = 0;
    for (const d of g) { t += d.seconds; if (pred(d)) return t / 60; }
    return Infinity;
  }).filter((x) => x !== Infinity);
const firstL1 = minutesTo((d) => d.milestones.some((m) => m.kind === "levelup" && m.note !== "level-0"));
const firstUpgrade = minutesTo((d) => d.milestones.some((m) => m.kind === "upgrade"));
const cashDay = (d: number) => pct(games.map((g) => g[d - 1]?.cash ?? 0), 0.5);

// --- Personas
const personas = PERSONAS.map((p) => {
  const results = games.map((g) => attention(p, g));
  const quits = results.filter((r) => r.quitAt !== null);
  return {
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    quitShare: quits.length / results.length,
    medianQuitMin: quits.length ? pct(quits.map((r) => r.quitAt! / 60), 0.5) : null,
    medianQuitDay: quits.length ? pct(quits.map((r) => r.day), 0.5) : null,
    p25QuitMin: quits.length ? pct(quits.map((r) => r.quitAt! / 60), 0.25) : null,
    firstBoredMin: pct(results.filter((r) => r.boredAt !== null).map((r) => r.boredAt! / 60), 0.5),
    firstBoredDay: pct(results.filter((r) => r.boredAt !== null).map((r) => r.boredDay), 0.5),
  };
});

// With no call pending nothing in a run can be changed: how much of the run is that?
const noInput = mean(allRuns.map((r) => 1 - Math.min(1, (r.calls * (10 * 0.55 * 0 + COST.answer)) / r.seconds)));
const secsPerDecision = pct(allRuns.map((r) => r.seconds / Math.max(1, r.calls)), 0.5);

const report = {
  noInputShareOfRun: noInput,
  secondsPerRunDecisionMedian: secsPerDecision,
  games: GAMES,
  days: DAYS,
  runs: allRuns.length,
  runSeconds: { p10: pct(runSecs, 0.1), median: pct(runSecs, 0.5), p90: pct(runSecs, 0.9), max: Math.max(...runSecs) },
  gapSeconds: { median: pct(gaps, 0.5), p90: pct(gaps, 0.9), max: Math.max(...gaps) },
  idleShare10s: idleShare(10),
  idleShare5s: idleShare(5),
  callsPerRun: callsPer,
  zeroCallRuns: zeroCall,
  decisionsPerMinute: decisionsPerMin,
  waitShareOfPlay: waitShare,
  dayLengthSeconds: { median: pct(dayLen, 0.5), p90: pct(dayLen, 0.9) },
  day1: { seconds: pct(day1.map((d) => d.seconds), 0.5), runs: mean(day1.map((d) => d.runs.length)), decisions: mean(day1.map((d) => d.decisions)) },
  radio: { totalLines: lineTotal, distinct: lineCount.size, sessionRepeatShare: sessionRepeat / sessionTotal, topLines },
  perDepth: Object.fromEntries(Object.entries(byDepth).map(([d, v]) => [d, { runs: v.n, medianSeconds: pct(v.secs, 0.5), callsPerRun: v.calls / v.n }])),
  minutesToFirstDeeperLevel: pct(firstL1, 0.5),
  minutesToFirstUpgrade: pct(firstUpgrade, 0.5),
  cashByDay: { 1: cashDay(1), 3: cashDay(3), 5: cashDay(5), 10: cashDay(10), 20: cashDay(20), 30: cashDay(Math.min(30, DAYS)) },
  personas,
};
mkdirSync("shots", { recursive: true });
writeFileSync("shots/playtester.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
