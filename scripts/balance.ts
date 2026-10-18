// Balance bot: plays whole games headlessly and reports money curves.
//   npx vite-node scripts/balance.ts [games] [days] [level0|adaptive|greedy]
// A strategy decides where crews go; everything else (hiring, gear, upgrades,
// selling, research) follows one fixed, sensible routine so strategies compare.
import { hire, skill, type Worker } from "../src/sim/crew";
import { endDay, sell } from "../src/sim/economy";
import { startExpedition, stepExpedition, levelOf, CREW_SLOTS, running, type Expedition } from "../src/sim/expedition";
import { buyUpgrade, canUpgrade, crewSlots } from "../src/sim/facilities";
import { LEVELS } from "../src/data/levels";
import { canResearch, isUnlocked, startResearch } from "../src/sim/research";
import { Dice } from "../src/sim/rng";
import { newGame, type GameState } from "../src/sim/state";
import { ITEMS } from "../src/data/items";

type Strategy = "level0" | "adaptive" | "greedy";
const STRATEGIES: Strategy[] = process.argv[4] ? [process.argv[4] as Strategy] : ["level0", "adaptive", "greedy"];
const GAMES = Number(process.argv[2] ?? 200);
const DAYS = Number(process.argv[3] ?? 60);
const CHECKPOINTS = [5, 10, 20, 30, 45, 60, 75, 90].filter((d) => d <= DAYS);
const UPGRADE_ORDER = ["dispatch", "mast", "security", "lab", "breakroom"];

function pickLevel(s: GameState, crew: Worker[], strategy: Strategy): string {
  const open = LEVELS.filter((l) => isUnlocked(s, l.id));
  if (strategy === "level0") return "level-0";
  if (strategy === "greedy") return open[open.length - 1].id;
  // Adaptive: only go as deep as the crew's experience says is sensible.
  const avg = crew.reduce((a, w) => a + w.level, 0) / crew.length;
  const maxDepth = Math.floor(avg * 1.5);
  return [...open].reverse().find((l) => l.depth <= maxDepth)?.id ?? "level-0";
}

function playDay(s: GameState, strategy: Strategy, dice: Dice, stats: Stats): void {
  // Hire up to four, keeping a cash cushion for payroll.
  for (const w of [...s.pool].sort((a, b) => a.cost - b.cost)) {
    const alive = s.crew.filter((c) => c.status !== "dead").length;
    if (alive >= 4 || s.cash < w.cost + 300) continue;
    hire(s, w.id);
    stats.hired++;
  }
  // Buy the next upgrade when it leaves a comfortable cushion.
  for (const id of UPGRADE_ORDER) if (canUpgrade(s, id) && s.cash > 2.2 * nextCost(s, id)) buyUpgrade(s, id);
  // Research a sample if a bench is free.
  for (const l of [...s.loot]) if (canResearch(s, l.id)) startResearch(s, l.id);

  // Send idle crews out in groups of two or three, one group per free slot.
  const exps: Expedition[] = [];
  const idle = () => s.crew.filter((w) => w.status === "idle");
  while (running(s).length < crewSlots(s) && idle().length) {
    const group = idle().sort((a, b) => b.level - a.level).slice(0, idle().length >= 4 ? 2 : 3);
    const levelId = pickLevel(s, group, strategy);
    const lv = levelOf(s, levelId);
    const open: { x: number; y: number }[] = [];
    lv.cells.forEach((c, i) => c !== 0 && open.push({ x: i % lv.w, y: Math.floor(i / lv.w) }));
    const gear: string[] = [];
    // Gear is for the deep levels; the shallow ones aren't worth the fee.
    const depth = LEVELS.find((l) => l.id === levelId)!.depth;
    if (depth >= 2 && s.cash > 1500) gear.push("rope", "firstaid");
    if ((depth === 2 || depth >= 6) && s.cash > 1800) gear.push("flashlight");
    const exp = startExpedition(s, group.map((w) => w.id), dice.pick(open.filter((p) => p.x > 12).length ? open.filter((p) => p.x > 12) : open), undefined, levelId, gear);
    if (!exp) break;
    exps.push(exp);
    stats.runs++;
    stats.depthSum += LEVELS.find((l) => l.id === levelId)!.depth;
    stats.maxDepth = Math.max(stats.maxDepth, LEVELS.find((l) => l.id === levelId)!.depth);
  }
  const deadBefore = s.crew.filter((w) => w.status === "dead").length;
  while (exps.some((e) => e.phase !== "done")) for (const e of exps) stepExpedition(s, e);
  for (const e of exps) {
    const row = (perLevel[e.levelId] ??= { runs: 0, value: 0, deaths: 0, wipes: 0 });
    row.runs++;
    row.value += (e.result?.loot ?? []).reduce((a, id) => a + ITEMS[id].value, 0);
    row.deaths += e.result?.dead.length ?? 0;
    if (e.result && e.result.survivors === 0) row.wipes++;
  }
  stats.deaths += s.crew.filter((w) => w.status === "dead").length - deadBefore;

  // Sell everything that isn't a sample on the bench.
  for (const l of [...s.loot]) if (!ITEMS[l.itemId].sampleOf || !canResearch(s, l.id)) sell(s, l.id);
}

const nextCost = (s: GameState, id: string) => {
  const tier = s.upgrades[id] ?? 0;
  return ({ dispatch: [3000, 8000], lab: [2400, 6000], mast: [1200, 3000], security: [1600, 4000], breakroom: [1400, 4000] } as Record<string, number[]>)[id]?.[tier] ?? 1e9; // only used to keep a cushion
};

interface Stats { hired: number; runs: number; deaths: number; depthSum: number; maxDepth: number }
// Per level: runs, value of loot brought home, crew lost.
const perLevel: Record<string, { runs: number; value: number; deaths: number; wipes: number }> = {};

function playGame(seed: number, strategy: Strategy) {
  const s = newGame(seed * 101 + 7);
  const dice = new Dice(seed);
  const stats: Stats = { hired: 0, runs: 0, deaths: 0, depthSum: 0, maxDepth: 0 };
  const cash: Record<number, number> = {};
  let broke = 0;
  let firstTarget = Infinity;
  for (let day = 1; day <= DAYS; day++) {
    playDay(s, strategy, dice, stats);
    endDay(s);
    if (s.target.year > 1 && firstTarget === Infinity) firstTarget = s.day;
    if (s.cash < 0) broke++;
    if (CHECKPOINTS.includes(day)) cash[day] = s.cash;
  }
  return { cash, stats, broke, metEarly: firstTarget <= 6, years: s.target.year - 1, firstTarget, index: Object.values(s.index).filter((k) => k.stage > 0).length };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct2 = (x: number) => `${Math.round(100 * x)}%`;
const pct = (n: number) => `${Math.round((100 * n) / GAMES)}%`;
const k = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

console.log(`Balance bot: ${GAMES} games × ${DAYS} days\n`);
for (const strategy of STRATEGIES) {
  for (const k of Object.keys(perLevel)) delete perLevel[k];
  const games = Array.from({ length: GAMES }, (_, i) => playGame(i + 1, strategy));
  console.log(`== ${strategy}`);
  console.log("median cash by day:  " + CHECKPOINTS.map((d) => `D${d} ${k(median(games.map((g) => g.cash[d])))}`).join("   "));
  console.log(`first target met on time (Day 5): ${pct(games.filter((g) => g.metEarly).length)}`);
  console.log(`first target met:    ${pct(games.filter((g) => g.firstTarget !== Infinity).length)} (median day ${median(games.filter((g) => g.firstTarget !== Infinity).map((g) => g.firstTarget)) || "-"})`);
  console.log(`fiscal years passed: median ${median(games.map((g) => g.years))}, best ${Math.max(...games.map((g) => g.years))}`);
  console.log(`went broke at least once: ${pct(games.filter((g) => g.broke > 0).length)}   (days spent below $0: median ${median(games.map((g) => g.broke))})`);
  console.log(`deaths per run:      ${(games.reduce((a, g) => a + g.stats.deaths, 0) / Math.max(1, games.reduce((a, g) => a + g.stats.runs, 0))).toFixed(2)}   runs per game ${median(games.map((g) => g.stats.runs))}   hires per game ${median(games.map((g) => g.stats.hired))}`);
  console.log(`depth: mean ${(games.reduce((a, g) => a + g.stats.depthSum, 0) / Math.max(1, games.reduce((a, g) => a + g.stats.runs, 0))).toFixed(1)}, deepest reached median ${median(games.map((g) => g.stats.maxDepth))}   Index pages found median ${median(games.map((g) => g.index))}`);
  console.log("per level (runs / loot value per run / deaths per run / wipe rate):");
  for (const l of LEVELS) {
    const r = perLevel[l.id];
    if (r) console.log(`  L${String(l.depth).padEnd(2)} ${String(r.runs).padStart(6)} runs  ${k(r.value / r.runs).padStart(7)}  ${(r.deaths / r.runs).toFixed(2)}  ${pct2(r.wipes / r.runs)}`);
  }
  console.log();
}
