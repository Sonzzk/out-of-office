import { noteGoal } from "./goals";
import { twistIs } from "./twists";
import { CALL_GAP, CALL_OUTCOMES, CALL_TICKS, CALL_TIMEOUT, CALLS, MAX_CALLS, THREAT_LINES, THREAT_OUTCOMES, THREAT_TICKS, VENDING_PRICE, type CallDef } from "../data/calls";
import { entityDef } from "../data/entities";
import { ECHO_LINES, INFECTED_RADIO } from "../data/infection";
import { infectionStage } from "./infection";
import { GEAR, gearDef } from "../data/gear";
import { ITEMS } from "../data/items";
import { CHECKOUT_TICK, CHECKOUT_WARN, levelDef } from "../data/levels";
import { PLAQUES, WIPE_MEMO } from "../data/memos";
import * as RADIO from "../data/radio";
import * as MORE from "../data/radioMore";
import { SECURITY_HELD } from "../data/radioFacilities";
import { gainXp, hasQuirk, quirkDef, revealQuirk, skill, type Worker } from "./crew";
import { BASE_CREW_SLOTS, callWait, crewSlots, facilityLines, freeFirstAid, moraleBoost, tier } from "./facilities";
import { DARK, dist, findPath, generateLevel, idx, nearestOpen, neighbors, WALL, type Level, type Pt } from "./level";
import { addHeat, addInfection, HEAT_PER_DEATH, HEAT_PER_WIPE } from "./office";
import { deathHeat, deathInfection } from "./projects";
import { broughtHome, checkSurvey, isMastered, isUnlocked, learn, stageOf } from "./research";
import { Dice } from "./rng";
import { addMemo, fill, type GameState } from "./state";
import { FINAL_ARRIVE } from "../data/story";
import { actRadio } from "./story";

// One crew walking one level. Everything here is plain data so a run can be
// saved mid-way and stepped by tests without a browser.
export interface Expedition {
  id: number;
  levelId: string;
  crewIds: number[];
  leadId: number;
  waypoint: Pt; // the last pin
  pins?: Pt[]; // every pin dropped for this run, visited in order
  pos: Pt;
  phase: "in" | "return" | "done";
  targets: Pt[];
  entities: Roamer[];
  tick: number;
  nextChatter: number;
  dice: number;
  carried: string[];
  log: string[];
  encounters: number;
  call?: { id: string; asked: number; m?: number }; // a question for the office, waiting for an answer
  gear: string[]; // bought for this run
  used: string[]; // gear already used up
  wait?: number; // radio mast: how much longer calls wait
  warned?: boolean; // a Warning Kite has the crew's back for one encounter
  callsMade: number;
  callIds?: string[]; // calls already made on this run, so none repeats
  lastCall?: number; // tick the last call was answered
  threat?: { id: string; asked: number }; // a deadly thing is close and the crew waits for one word
  hold?: number; // ticks left of holding still
  hurry?: number; // ticks left of pushing on
  orderAt?: Record<string, number>; // tick each order is ready again
  trace?: number[][]; // [x, y, then x, y of each entity] per tick, for the Feeds Wall replay
  mod?: number; // how much a choice made just now scales the danger of the next encounter
  boss?: string; // the player's name, for radio lines that use it
  recent?: string[]; // radio lines already heard, so the crew does not repeat itself
  final?: boolean; // the last descent to the farmhouse, see sim/story.ts
  reached?: boolean; // the final descent got as far as the farmhouse
  result?: { survivors: number; dead: string[]; loot: string[]; notes: string[] };
}

// One entity walking the same level as the crew.
export interface Roamer {
  id: string; // Index id: smiler, hound, faceling
  pos: Pt;
  cooldown: number; // ticks spent away after an encounter
  seen: boolean;
  alerted?: boolean; // has already given the player a chance to react this approach
}

const VISION = 3;

// Each level is rebuilt from a seed derived from the save. The hotel's seed
// changes every day, which is how it rearranges itself.
export function levelSeed(state: GameState, levelId: string): number {
  const def = levelDef(levelId);
  if (def.depth === 0) return state.level0Seed;
  const base = (state.level0Seed + def.depth * 104729) >>> 0;
  return def.rule === "hotel" ? (base ^ Math.imul(state.day, 2654435761)) >>> 0 : base;
}

const cache = new Map<string, Level>();

export function levelOf(state: GameState, levelId: string): Level {
  const seed = levelSeed(state, levelId);
  const key = `${levelId}:${seed}`;
  let lv = cache.get(key);
  if (!lv) {
    lv = generateLevel(seed, levelDef(levelId));
    cache.set(key, lv);
  }
  const fog = state.fog[levelId];
  if (!fog || fog.length !== lv.cells.length) {
    state.fog[levelId] = new Array(lv.cells.length).fill(0);
    reveal(state, lv, levelId, lv.entrance, 4); // the lobby is known before anyone goes in
  }
  state.takenToday[levelId] ??= [];
  return lv;
}

export const level0 = (state: GameState) => levelOf(state, "level-0");

function members(state: GameState, exp: Expedition): Worker[] {
  return exp.crewIds.map((id) => state.crew.find((w) => w.id === id)!).filter((w) => w.status === "out");
}

// Vague survival odds, as the concept asks: words, never numbers.
export function oddsWord(state: GameState, crewIds: number[]): string {
  const crew = crewIds.map((id) => state.crew.find((w) => w.id === id)!).filter(Boolean);
  if (!crew.length) return "Nobody to send";
  const stealth = crew.reduce((s, w) => s + skill(w, "stealth"), 0) / crew.length;
  const score = stealth + Math.min(crew.length, 4) * 0.6;
  if (score >= 5.5) return "Probably fine";
  if (score >= 4) return "Should be okay";
  if (score >= 3) return "Bring a spare";
  return "Statistically brave";
}

export const MAX_PINS = 5;
export const MAX_CREW = 4;
export const CREW_SLOTS = BASE_CREW_SLOTS; // expeditions out at once before upgrades

export const running = (state: GameState) => state.expeditions.filter((e) => e.phase !== "done");

// Default team lead: veterans first, then whoever has the best morale.
export function suggestLead(crew: Worker[]): Worker {
  return [...crew].sort((a, b) => b.level - a.level || skill(b, "morale") - skill(a, "morale"))[0];
}

export function startExpedition(
  state: GameState,
  crewIds: number[],
  marker: Pt | Pt[],
  leadId?: number,
  levelId = "level-0",
  gear: string[] = [],
): Expedition | null {
  const crew = crewIds
    .map((id) => state.crew.find((w) => w.id === id))
    .filter((w): w is Worker => !!w && w.status === "idle")
    .slice(0, MAX_CREW);
  if (!crew.length || running(state).length >= crewSlots(state) || !isUnlocked(state, levelId)) return null;
  const lv = levelOf(state, levelId);
  const pins = (Array.isArray(marker) ? marker : [marker])
    .slice(0, MAX_PINS)
    .map((m) => nearestOpen(lv, m))
    .filter((p, i, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === i);
  if (!pins.length) return null;
  const waypoint = pins[pins.length - 1];
  const lead = crew.find((w) => w.id === leadId) ?? suggestLead(crew);
  for (const w of crew) {
    w.status = "out";
    w.boost = moraleBoost(state) || undefined;
  }
  const exp: Expedition = {
    id: state.nextId++,
    levelId,
    crewIds: crew.map((w) => w.id),
    leadId: lead.id,
    waypoint,
    pins,
    pos: { ...lv.entrance },
    phase: "in",
    targets: pins.map((p) => ({ ...p })),
    entities: lv.spawns.map((s) => ({ id: s.id, pos: { ...s.at }, cooldown: 0, seen: false })),
    tick: 0,
    nextChatter: 6,
    dice: (state.seed ^ Math.imul(state.nextId * 97 + state.day, 2654435761)) >>> 0,
    carried: [],
    log: [fill(MORE.OPENERS[(state.nextId + state.day) % MORE.OPENERS.length], { n: lead.name })],
    encounters: 0,
    callsMade: 0,
    boss: state.bossName,
    recent: [...(state.recentLines ?? [])],
    gear: affordable(state, gear),
    used: [],
    wait: callWait(state),
  };
  // Gear is paid for when the crew sets out.
  for (const id of exp.gear) {
    state.cash -= gearDef(id).cost;
    state.ledger.unshift({ day: state.day, text: `Gear: ${gearDef(id).name}`, amount: -gearDef(id).cost });
  }
  if (freeFirstAid(state) && !exp.gear.includes("firstaid")) exp.gear.push("firstaid"); // the break room stocks one
  reveal(state, lv, levelId, exp.pos);
  state.expeditions.push(exp);
  return exp;
}

function reveal(state: GameState, lv: Level, levelId: string, p: Pt, radius?: number): void {
  const fog = state.fog[levelId];
  const lit = levelDef(levelId).vision ?? (state.outageDay === state.day || twistIs(state, "fog") ? 2 : VISION); // power cut, fog or tall wheat: less seen
  const r = radius ?? (lv.cells[idx(lv, p)] === DARK ? 1 : lit);
  for (let y = p.y - r; y <= p.y + r; y++)
    for (let x = p.x - r; x <= p.x + r; x++)
      if (x >= 0 && y >= 0 && x < lv.w && y < lv.h && dist(p, { x, y }) <= r) fog[y * lv.w + x] = 1;
}

function say(exp: Expedition, dice: Dice, crew: Worker[], lines: string[], extra: Record<string, string> = {}): void {
  if (!crew.length) return;
  const speaker = dice.pick(crew);
  const other = crew.length > 1 ? dice.pick(crew.filter((w) => w !== speaker)) : speaker;
  // Someone alone can't talk about a teammate, and lines about an item need one.
  const hasItem = "item" in extra;
  const usable = lines.filter((l) => (other !== speaker || extra.m || !l.includes("{m}")) && (hasItem || !l.includes("{item}")));
  const pool = usable.length ? usable : lines;
  // Prefer something the crew (and you) have not heard lately.
  const recent = (exp.recent ??= []);
  const fresh = pool.filter((l) => !recent.includes(l));
  const line = dice.pick(fresh.length ? fresh : pool);
  recent.push(line);
  if (recent.length > RECENT_LINES) recent.splice(0, recent.length - RECENT_LINES);
  exp.log.push(fill(line, { n: first(speaker), m: first(other), boss: exp.boss ?? "boss", ...extra }));
}

const RECENT_LINES = 60;

// The best thing a crew is carrying, by sale value, for lines that name it.
const bestItem = (exp: Expedition) => [...exp.carried].sort((a, b) => ITEMS[b].value - ITEMS[a].value).map((id) => ITEMS[id].name)[0];

// Everything a crew might say while walking: the common lines, the floor's own,
// running jokes that grow with the days, and the mood of the run so far.
function ambientPool(state: GameState, exp: Expedition, crew: Worker[]): string[] {
  const pool = [...RADIO.AMBIENT, ...MORE.AMBIENT_EXTRA, ...(MORE.LEVEL_AMBIENT[exp.levelId] ?? []), ...(MORE.LEVEL_AMBIENT[exp.levelId] ?? [])];
  pool.push(...actRadio(state, exp));
  const jokes = MORE.RUNNING_JOKES.filter((j) => j.fromDay <= state.day).slice(-2);
  for (const j of jokes) pool.push(...j.lines);
  if (exp.encounters > 0 || exp.log.some((l) => /checked in|fell behind|lost /.test(l))) pool.push(...MORE.TENSE, ...MORE.TENSE);
  if (exp.carried.length) pool.push(...MORE.CARRYING, ...MORE.CARRYING);
  pool.push(...facilityLines(state));
  return pool;
}

// How a crew sounds at the door depends on how the run went.
function homePool(state: GameState, exp: Expedition): string[] {
  const lost = exp.crewIds.filter((id) => state.crew.find((w) => w.id === id)?.status === "dead").length;
  const worth = exp.carried.reduce((a, id) => a + ITEMS[id].value, 0);
  const pool = [...RADIO.HOME];
  if (lost) return [...MORE.HOME_COSTLY, ...MORE.HOME_COSTLY];
  if (exp.encounters >= 2) pool.push(...MORE.HOME_SHAKEN, ...MORE.HOME_SHAKEN);
  if (!exp.encounters) pool.push(...MORE.HOME_CLEAN, ...MORE.HOME_CLEAN);
  if (worth >= 600 || exp.carried.length >= 3) pool.push(...MORE.HOME_RICH, ...MORE.HOME_RICH);
  if (!exp.carried.length) pool.push(...MORE.HOME_EMPTY, ...MORE.HOME_EMPTY);
  if (exp.tick > 130) pool.push(...MORE.HOME_LATE);
  return pool;
}

// Names like "Mr. Smith" are called by the second word.
const first = (w: Worker) => {
  if (w.name.startsWith("CLONE")) return w.name;
  const [a, b] = w.name.split(" ");
  return a.endsWith(".") && b ? b : a;
};

// Advance one tick: the crew moves one cell, the entity moves, things happen.
export function stepExpedition(state: GameState, exp: Expedition): void {
  if (exp.phase === "done") return;
  const lv = levelOf(state, exp.levelId);
  const taken = state.takenToday[exp.levelId];
  const dice = new Dice(exp.dice);
  const crew = members(state, exp);
  exp.tick++;

  // The team lead's sense of direction counts double.
  const lead = crew.find((w) => w.id === exp.leadId);
  const navSum = crew.reduce((s, w) => s + skill(w, "nav"), 0) + (lead ? skill(lead, "nav") : 0);
  const avgNav = navSum / Math.max(1, crew.length + (lead ? 1 : 0));
  // Once Level 0 is mastered, everyone knows the way.
  const mapBonus = isMastered(state, exp.levelId) ? 1 : 0;
  const rope = exp.gear.includes("rope") ? 0.5 : 1;
  const wheat = levelDef(exp.levelId).rule === "wheat" && exp.phase === "return"; // the way home is never where you left it
  const lost = wheat ? Math.max(0.05, 0.3 - avgNav * 0.05) * rope : 0;
  const stalled = dice.chance(Math.max(0, 0.16 - (avgNav + mapBonus) * 0.03) * rope) || dice.chance(lost);

  // Spot loot nearby on the way in and detour for it.
  if (exp.phase === "in") {
    lv.loot.forEach((l, i) => {
      const known = exp.targets.some((t) => t.x === l.at.x && t.y === l.at.y);
      if (!known && !taken.includes(i) && dist(l.at, exp.pos) <= 2) exp.targets.unshift({ ...l.at });
    });
  }

  if (exp.hold) exp.hold--;
  if (exp.hurry) exp.hurry--;
  maybeCall(state, exp, dice, crew);
  if (exp.threat) {
    // Frozen until the office answers, or the thing arrives.
    if (exp.tick - exp.threat.asked >= THREAT_TICKS) resolveThreat(state, exp, -1, dice);
  } else if (exp.call) {
    // Waiting on the office. The crew holds still; the level doesn't.
    if (exp.tick - exp.call.asked >= callTicks(exp)) {
      const lead = crew.find((w) => w.id === exp.leadId) ?? crew[0];
      exp.log.push(fill(CALL_TIMEOUT, { n: first(lead) }));
      resolveCall(state, exp, callDef(exp.call.id).fallback, dice);
    }
  } else if (exp.hold) {
    // Holding still: nobody moves, nobody makes noise.
  } else if (!stalled || exp.hurry) {
    const target = exp.targets[0];
    const step = target ? findPath(lv, exp.pos, target)[0] : undefined;
    if (step) exp.pos = step;
    // Pushing on covers two cells a tick, as long as the first did not reach the target.
    if (exp.hurry && target && step && !(step.x === target.x && step.y === target.y)) {
      const again = findPath(lv, exp.pos, target)[0];
      if (again) exp.pos = again;
    }
  } else if (dice.chance(0.2)) {
    say(exp, dice, crew, [...RADIO.LOST, ...MORE.LOST_MORE]);
  }
  const lamp = exp.gear.includes("flashlight") && lv.cells[idx(lv, exp.pos)] === DARK ? 2 : undefined;
  reveal(state, lv, exp.levelId, exp.pos, lamp);

  // Arrived somewhere?
  const target = exp.targets[0];
  if (target && target.x === exp.pos.x && target.y === exp.pos.y) {
    exp.targets.shift();
    const lootIdx = lv.loot.findIndex((l, i) => l.at.x === exp.pos.x && l.at.y === exp.pos.y && !taken.includes(i));
    if (lootIdx >= 0) {
      taken.push(lootIdx);
      const item = ITEMS[lv.loot[lootIdx].itemId];
      exp.carried.push(item.id);
      say(exp, dice, crew, [...RADIO.LOOT, ...MORE.LOOT_MORE], { item: item.name });
    } else if (exp.phase === "in" && (exp.pins ?? [exp.waypoint]).some((p) => p.x === exp.pos.x && p.y === exp.pos.y)) {
      say(exp, dice, crew, [...RADIO.ARRIVE, ...MORE.ARRIVE_MORE]);
    }
    if (exp.phase === "in" && !exp.targets.length) {
      if (exp.final) {
        exp.reached = true;
        say(exp, dice, crew, FINAL_ARRIVE);
      }
      turnBack(lv, exp);
    }
  }
  if (exp.phase === "return" && exp.pos.x === lv.entrance.x && exp.pos.y === lv.entrance.y) {
    say(exp, dice, crew, homePool(state, exp));
    exp.dice = dice.state;
    return finish(state, exp);
  }

  if (levelDef(exp.levelId).rule === "hotel") checkout(state, lv, exp, dice);
  for (const r of exp.entities) {
    if ((exp.phase as Expedition["phase"]) === "done") break;
    if (exp.threat) continue; // everything holds its breath
    moveEntity(state, lv, exp, r, dice, members(state, exp));
  }

  // An encounter above can end the run.
  if (exp.tick >= exp.nextChatter && (exp.phase as Expedition["phase"]) !== "done") {
    const talker = crew.find((w) => hasQuirk(w, "walls"));
    if (talker && dice.chance(0.25)) revealLine(exp, talker, "walls");
    // An infected office leaks into the radio, and it knows your name.
    else if (state.infection >= 30 && dice.chance(state.infection / 200))
      say(exp, dice, crew, INFECTED_RADIO, { boss: state.bossName, phrase: state.catchphrase ?? "" });
    else say(exp, dice, crew, ambientPool(state, exp, crew), exp.carried.length ? { item: bestItem(exp) } : {});
    exp.nextChatter = exp.tick + dice.range(9, 15);
  }
  exp.dice = dice.state;
  recordTrace(exp);
}

function recordTrace(exp: Expedition): void {
  const t = (exp.trace ??= []);
  if (t.length < TRACE_MAX) t.push([exp.pos.x, exp.pos.y, ...exp.entities.flatMap((r) => [r.pos.x, r.pos.y])]);
}

const TRACE_MAX = 600;

// Hotel Overflow: the front desk calls checkout, and stragglers get checked in.
function checkout(state: GameState, lv: Level, exp: Expedition, dice: Dice): void {
  const crew = members(state, exp);
  if (exp.tick === CHECKOUT_WARN) {
    exp.log.push("Front desk: Checkout is in twenty minutes. We hope you enjoyed your stay.");
    if (exp.phase === "in") turnBack(lv, exp);
  }
  if (exp.tick >= CHECKOUT_TICK && (exp.tick - CHECKOUT_TICK) % 10 === 0 && crew.length) {
    const guest = dice.pick(crew);
    guest.lastWords = "Just one more night.";
    guest.status = "dead";
    guest.diedOnDay = state.day;
    exp.log.push(`Front desk: ${guest.name} has been checked in. Their room is ready.`);
    if (crew.length === 1) {
      exp.log.push(...RADIO.WIPE);
      finish(state, exp);
    }
  }
}

function turnBack(lv: Level, exp: Expedition): void {
  exp.phase = "return";
  exp.targets = [{ ...lv.entrance }];
}

function moveEntity(state: GameState, lv: Level, exp: Expedition, r: Roamer, dice: Dice, crew: Worker[]): void {
  if (r.cooldown > 0) {
    r.cooldown--;
    r.seen = false;
    r.alerted = false;
    return;
  }
  const def = entityDef(r.id);
  const whistler = crew.find((w) => hasQuirk(w, "whistler"));
  // Holding still hides you a little; pushing on is loud.
  const sense = def.sense + (whistler ? 2 : 0) + (exp.hurry ? 2 : 0) - (exp.hold ? 2 : 0);
  const near = def.sense > 0 && dist(r.pos, exp.pos) <= sense;
  const options = neighbors(lv, r.pos);
  const dark = (p: Pt) => lv.cells[idx(lv, p)] === DARK;
  const chase = () => {
    const step = findPath(lv, r.pos, exp.pos)[0];
    if (step && dice.chance(def.speed)) r.pos = step;
  };
  const wander = (prefer?: (p: Pt) => boolean, bias = 1) => {
    const liked = prefer ? options.filter(prefer) : options;
    if (options.length) r.pos = dice.pick(liked.length && dice.chance(bias) ? liked : options);
  };
  if (def.moves === "dark") {
    // Only hunts when someone is in the dark. Lit halls are safe from it.
    if (near && (dark(exp.pos) || dark(r.pos))) chase();
    else if (dice.chance(0.5)) wander(dark, 0.8);
  } else if (def.moves === "lit") {
    if (near) chase();
    else if (dice.chance(0.6)) wander((p) => !dark(p));
  } else if (def.moves === "any") {
    if (near) chase();
    else if (dice.chance(0.5)) wander();
  } else if (def.moves === "wander" && dice.chance(def.speed)) wander();

  const wasSeen = r.seen;
  r.seen = dist(r.pos, exp.pos) <= VISION;
  if (r.seen && !wasSeen) {
    say(exp, dice, crew, [...def.spotted, ...(MORE.SPOTTED_MORE[r.id] ?? [])], { boss: state.bossName });
    const note = crew.length ? learn(state, r.id, 1, crew[0].name) : null;
    if (note) exp.log.push(note);
    if (whistler && def.sense > 0) revealLine(exp, whistler, "whistler");
  }
  // Something deadly is close: the crew freezes and the office gets one word.
  const d = dist(r.pos, exp.pos);
  if (d <= 2 && !r.alerted && !exp.threat && !exp.call && (def.effect === "kill" || def.effect === "lure") && crew.length) {
    r.alerted = true;
    exp.threat = { id: r.id, asked: exp.tick };
    say(exp, dice, crew, THREAT_LINES);
    return;
  }
  if (d <= 1) encounter(state, lv, exp, r, dice, crew);
}

// --- Threats and orders ------------------------------------------------------
// answer: 0 hide, 1 run, 2 distract (costs the cheapest thing carried), 3 give it
// someone, -1 nobody answered and it simply arrives.
export function answerThreat(state: GameState, exp: Expedition, choice: number): boolean {
  if (!exp.threat || exp.phase === "done") return false;
  const dice = new Dice(exp.dice);
  resolveThreat(state, exp, choice, dice);
  exp.dice = dice.state;
  return true;
}

export const canDistract = (exp: Expedition) => exp.carried.length > 0;
export const canGiveSomeone = (state: GameState, exp: Expedition) => members(state, exp).length >= 2;

function cheapest(exp: Expedition): number {
  let at = 0;
  exp.carried.forEach((id, i) => {
    if (ITEMS[id].value < ITEMS[exp.carried[at]].value) at = i;
  });
  return at;
}

function resolveThreat(state: GameState, exp: Expedition, choice: number, dice: Dice): void {
  const threat = exp.threat!;
  exp.threat = undefined;
  const lv = levelOf(state, exp.levelId);
  const crew = members(state, exp);
  if (!crew.length) return;
  const r = exp.entities.find((e) => e.id === threat.id) ?? exp.entities[0];
  if (!r) return;
  const lead = crew.find((w) => w.id === exp.leadId) ?? crew[0];
  const line = (key: keyof typeof THREAT_OUTCOMES, extra: Record<string, string> = {}) =>
    exp.log.push(fill(dice.pick(THREAT_OUTCOMES[key]), { n: first(lead), m: first(crew.find((w) => w !== lead) ?? lead), boss: exp.boss ?? "boss", ...extra }));
  const meets = (mod: number) => {
    exp.mod = mod;
    encounter(state, lv, exp, r, dice, crew);
    exp.mod = undefined;
  };
  if (choice === 0) {
    line("hide");
    exp.hold = 6;
    return meets(0.5);
  }
  if (choice === 1) {
    // Running works if the crew knows where it is going.
    const nav = crew.reduce((a, w) => a + skill(w, "nav"), 0) / crew.length;
    if (dice.chance(0.45 + nav * 0.06)) {
      line("runClean");
      sendAway(lv, exp, r, dice);
      return;
    }
    line("runCaught");
    return meets(1.4);
  }
  if (choice === 2 && canDistract(exp)) {
    const [gone] = exp.carried.splice(cheapest(exp), 1);
    line("distract", { item: ITEMS[gone].name });
    sendAway(lv, exp, r, dice);
    return;
  }
  if (choice === 3 && crew.length >= 2) {
    const victim = [...crew].filter((w) => w.id !== exp.leadId).sort((a, b) => a.level - b.level || a.id - b.id)[0] ?? crew[crew.length - 1];
    line("sacrifice", { m: first(victim) });
    addInfection(state, 3);
    sendAway(lv, exp, r, dice);
    return lose(state, lv, exp, r, dice, crew, victim, "{n}: We gave it {m}. We're sorry.");
  }
  meets(1); // no answer, or a choice that was not available
}

export type Order = "hold" | "push" | "back" | "distract";
export const ORDER_COOLDOWN: Record<Order, number> = { hold: 14, push: 14, back: 0, distract: 20 };
export const ORDER_LINES: Record<Order, string[]> = {
  hold: ["{n}: Holding. Nobody move. Nobody breathe.", "{n}: Standing still. Counting ceiling tiles."],
  push: ["{n}: Pushing on. Quick feet.", "{n}: Moving fast. Don't talk, don't trip."],
  back: ["{n}: You're the boss. Turning around.", "{n}: Heading for the door. Your call."],
  distract: ["{n}: Dropping the {item} behind us. Hope it likes it.", "{n}: Throwing the {item} down the hall. Goodbye, {item}."],
};

export function orderReady(exp: Expedition, order: Order, tick = exp.tick): boolean {
  if (exp.phase === "done" || exp.call || exp.threat) return false;
  if ((exp.orderAt?.[order] ?? 0) > tick) return false;
  if (order === "back") return exp.phase === "in";
  if (order === "distract") return exp.carried.length > 0 && exp.entities.length > 0;
  return true;
}

// A standing order from the office, any time between calls.
export function orderExpedition(state: GameState, exp: Expedition, order: Order): boolean {
  if (!orderReady(exp, order)) return false;
  const lv = levelOf(state, exp.levelId);
  const crew = members(state, exp);
  if (!crew.length) return false;
  const dice = new Dice(exp.dice);
  let item = "";
  if (order === "hold") {
    exp.hold = 10;
    exp.hurry = 0;
  } else if (order === "push") {
    exp.hurry = 8;
    exp.hold = 0;
  } else if (order === "back") turnBack(lv, exp);
  else {
    const near = [...exp.entities].sort((a, b) => dist(a.pos, exp.pos) - dist(b.pos, exp.pos))[0];
    const [gone] = exp.carried.splice(cheapest(exp), 1);
    item = ITEMS[gone].name;
    sendAway(lv, exp, near, dice);
  }
  (exp.orderAt ??= {})[order] = exp.tick + ORDER_COOLDOWN[order];
  say(exp, dice, crew, ORDER_LINES[order], item ? { item } : {});
  exp.dice = dice.state;
  return true;
}

// Send an entity away after an encounter so it doesn't hit twice in a row.
function sendAway(lv: Level, exp: Expedition, r: Roamer, dice: Dice): void {
  r.cooldown = 14;
  r.seen = false;
  const def = entityDef(r.id);
  if (def.moves === "still") return; // it stays where it is; the crew moves on
  const spawn = lv.spawns.find((s) => s.id === r.id)?.at ?? lv.entrance;
  const open: Pt[] = [];
  lv.cells.forEach((c, i) => {
    if (c !== WALL && (def.moves !== "dark" || c === DARK)) open.push({ x: i % lv.w, y: Math.floor(i / lv.w) });
  });
  const far = open.filter((p) => dist(p, exp.pos) > 8);
  r.pos = far.length ? dice.pick(far) : { ...spawn };
}

// Only gear that exists and that the company can pay for goes along.
function affordable(state: GameState, gear: string[]): string[] {
  let budget = state.cash;
  return gear.filter((id) => {
    const def = GEAR.find((d) => d.id === id);
    if (!def || def.cost > budget) return false;
    budget -= def.cost;
    return true;
  });
}

const useGear = (exp: Expedition, id: string) => {
  if (!exp.gear.includes(id) || exp.used.includes(id)) return false;
  exp.used.push(id);
  return true;
};

export function encounter(state: GameState, lv: Level, exp: Expedition, r: Roamer, dice: Dice, crew: Worker[]): void {
  exp.encounters++;
  sendAway(lv, exp, r, dice);
  const def = entityDef(r.id);
  const mastered = isMastered(state, r.id);
  const depthMult = 1 + levelDef(exp.levelId).depth * 0.08; // deeper is deadlier
  const lead = crew.find((w) => w.id === exp.leadId) ?? crew[0];
  const vars = { boss: state.bossName };
  const line = (text: string, m?: Worker) => exp.log.push(fill(text, { n: first(lead), m: m ? first(m) : first(lead), ...vars }));
  const passed = () => {
    say(exp, dice, crew, [def.passed, ...(MORE.PASSED_MORE[def.id] ?? [])], vars);
    survived(state, exp, r, dice, crew);
  };

  switch (def.effect) {
    case "panic": {
      // Harmless, but crews who don't know that panic.
      const calm = stageOf(state, r.id) >= 2 || hasQuirk(lead, "calm");
      if (!calm && exp.phase === "in" && dice.chance(def.base! - skill(lead, def.check!) * def.per!)) {
        line(def.outcome);
        turnBack(lv, exp);
        return survived(state, exp, r, dice, crew);
      }
      return passed();
    }
    case "guide": {
      reveal(state, lv, exp.levelId, exp.pos, mastered ? 9 : 6);
      if (exp.phase === "in") {
        const taken = state.takenToday[exp.levelId];
        const shown = lv.loot
          .map((l, i) => ({ l, i }))
          .filter(({ l, i }) => !taken.includes(i) && dist(l.at, exp.pos) <= (mastered ? 9 : 6))
          .slice(0, 2);
        for (const { l } of shown) exp.targets.unshift({ ...l.at });
      }
      line(def.outcome);
      return survived(state, exp, r, dice, crew);
    }
    case "warn":
      if (mastered || dice.chance(0.7)) {
        exp.warned = true;
        line(def.outcome);
        return survived(state, exp, r, dice, crew);
      }
      return passed();
    case "infect":
      addInfection(state, mastered ? 1 : 3);
      line(def.outcome);
      return survived(state, exp, r, dice, crew);
    case "steal": {
      const deterred = crew.length >= (def.groupDeter ?? Infinity);
      const best = Math.max(...crew.map((w) => skill(w, def.check!)));
      if (exp.carried.length && !mastered && !deterred && dice.chance(def.base! - best * def.per!)) {
        exp.carried.splice(dice.int(exp.carried.length), 1);
        line(def.outcome);
        return survived(state, exp, r, dice, crew);
      }
      return passed();
    }
    case "lure": {
      if (exp.warned) {
        exp.warned = false;
        exp.log.push(`${first(lead)}: Something told us not to listen. We didn't.`);
        return passed();
      }
      const victim = [...crew].sort((a, b) => skill(a, def.check!) - skill(b, def.check!))[0];
      const p = Math.max(0.03, def.base! - skill(victim, def.check!) * def.per!) * (mastered ? 0.5 : 1) * depthMult * (exp.mod ?? 1);
      if (!dice.chance(p)) return passed();
      return lose(state, lv, exp, r, dice, crew, victim, def.outcome);
    }
    case "kill": {
      const deterAt = def.groupDeter ? def.groupDeter - (mastered ? 1 : 0) : Infinity;
      if (crew.length >= deterAt) return passed();
      if (exp.warned) {
        exp.warned = false;
        exp.log.push(`${first(lead)}: The kite warned us in time. We hid until it passed.`);
        return survived(state, exp, r, dice, crew);
      }
      if (def.moves === "dark" && useGear(exp, "repellent")) {
        exp.log.push(`${first(lead)}: Sprayed the repellent. It hated that. It's gone.`);
        return survived(state, exp, r, dice, crew);
      }
      // Each crew member tries to slip away; the entity takes at most one.
      const order = [...crew].sort(() => dice.next() - 0.5);
      for (const w of crew) if (hasQuirk(w, "coward") && crew.length > 1) revealLine(exp, w, "coward");
      const victim = order.find((w) => {
        if (hasQuirk(w, "coward") && crew.length > 1) return false;
        let p = Math.max(0.03, def.base! - skill(w, def.check!) * def.per!);
        if (mastered) p /= 2;
        p *= depthMult * (exp.mod ?? 1);
        const roll = dice.next();
        if (hasQuirk(w, "lucky") && roll < p && roll >= p / 2) {
          revealLine(exp, w, "lucky");
          return false;
        }
        return roll < p;
      });
      if (!victim) return passed();
      if (useGear(exp, "firstaid")) {
        exp.log.push(`${first(lead)}: ${first(victim)} is hurt bad. Used the first aid kit. They'll make it.`);
        return survived(state, exp, r, dice, crew);
      }
      const medic = crew.find((w) => w !== victim && skill(w, "medical") >= 4);
      if (medic && dice.chance(0.3)) {
        exp.log.push(`${first(medic)}: Got ${first(victim)} out of there. Bleeding, but walking.`);
        return survived(state, exp, r, dice, crew);
      }
      return lose(state, lv, exp, r, dice, crew, victim, def.outcome);
    }
  }
}

// Someone is gone: plaque words, the radio line, and maybe a retreat.
function lose(state: GameState, lv: Level, exp: Expedition, r: Roamer, dice: Dice, crew: Worker[], victim: Worker, outcome: string): void {
  const survivors = crew.filter((w) => w !== victim);
  // Their own last line on the radio, for the plaque.
  const mine = [...exp.log].reverse().find((l) => l.startsWith(`${first(victim)}: `));
  victim.lastWords = mine ? mine.slice(first(victim).length + 2) : "...";
  victim.status = "dead";
  victim.diedOnDay = state.day;
  if (!survivors.length) {
    exp.log.push(...RADIO.WIPE);
    return finish(state, exp);
  }
  say(exp, dice, survivors, [outcome], { m: first(victim), boss: state.bossName });
  survived(state, exp, r, dice, survivors);
  const lead = survivors.find((w) => w.id === exp.leadId) ?? survivors[0];
  exp.leadId = lead.id;
  if (exp.phase !== "in") return;
  if (hasQuirk(lead, "calm")) return revealLine(exp, lead, "calm");
  if (dice.chance(0.65 - skill(lead, "morale") * 0.1)) {
    if (hasQuirk(lead, "debts") && !exp.carried.length) return revealLine(exp, lead, "debts");
    exp.log.push(fill(dice.pick([...RADIO.RETREAT, ...MORE.RETREAT_MORE]), { n: first(lead), boss: exp.boss ?? "boss" }));
    turnBack(lv, exp);
  }
}

// Living through an encounter teaches the Index something and can leave a sample.
function survived(state: GameState, exp: Expedition, r: Roamer, dice: Dice, crew: Worker[]): void {
  if (!crew.length) return;
  const note = learn(state, r.id, 2, crew[0].name);
  if (note) exp.log.push(note);
  const def = entityDef(r.id);
  const chance = def.sample * (isMastered(state, r.id) ? 1.5 : 1);
  if (def.sample > 0 && dice.chance(chance)) {
    exp.carried.push(`sample-${r.id}`);
    say(exp, dice, crew, [...RADIO.SAMPLE, ...MORE.SAMPLE_MORE]);
  }
}

function finish(state: GameState, exp: Expedition): void {
  exp.phase = "done";
  const all = exp.crewIds.map((id) => state.crew.find((w) => w.id === id)!);
  const alive = all.filter((w) => w.status === "out");
  const dead = all.filter((w) => w.status === "dead" && w.diedOnDay === state.day);
  const dice = new Dice(exp.dice);
  const notes: string[] = [];
  let loot = alive.length ? [...exp.carried] : [];
  // The first crew home always has something to show for it, so day one is not a loss.
  if (alive.length && !state.firstFind) {
    state.firstFind = true;
    if (!loot.some((id) => ITEMS[id].value >= 300)) {
      loot.push("orientation-polaroid");
      notes.push("Taped to the inside of the door: an old photo of a crew nobody hired. Somebody will pay for that.");
    }
  }
  const pocketer = alive.find((w) => hasQuirk(w, "pockets"));
  if (pocketer && loot.length && dice.chance(0.5)) {
    const kept = loot.splice(dice.int(loot.length), 1)[0];
    revealLine(exp, pocketer, "pockets");
    notes.push(`${ITEMS[kept].name} went missing. ${pocketer.name} says they never saw it.`);
  }
  for (const w of alive) {
    w.status = "idle";
    w.boost = undefined;
    w.runs++;
    notes.push(...gainXp(w, 1 + (loot.length ? 1 : 0) + Math.min(exp.encounters, 2), dice));
    // After three runs HR works out what the file left out.
    const hidden = w.quirks.find((q) => !w.revealed.includes(q));
    if (hidden && w.runs >= 3 && revealQuirk(w, hidden)) notes.push(`HR has learned something about ${w.name}: ${quirkDef(hidden).name}.`);
  }
  notes.push(...exp.log.filter((l) => l.startsWith("HR learned something")));
  exp.dice = dice.state;
  state.recentLines = (exp.recent ?? []).slice(-RECENT_LINES);
  for (const itemId of loot) {
    state.loot.push({ id: state.nextId++, itemId, foundBy: alive[0].name });
    const note = broughtHome(state, itemId, alive[0].name);
    if (note) notes.push(note);
  }
  noteGoal(state, "haul", loot.length);
  noteGoal(state, "home", alive.length);
  notes.push(...checkSurvey(state, levelOf(state, exp.levelId), exp.levelId));
  notes.push(...exp.log.filter((l) => l.startsWith("Index updated") && !notes.includes(l)));
  exp.result = { survivors: alive.length, dead: dead.map((w) => w.name), loot, notes };
  for (const w of dead) {
    const plaque = state.memos.length % PLAQUES.length;
    const tpl = PLAQUES[plaque];
    addMemo(state, {
      from: "HR",
      subject: fill(tpl.subject, { name: w.name }),
      body: fill(tpl.body, { name: w.name, words: w.lastWords ?? "..." }),
    });
  }
  if (dead.length && tier(state, "security") > 0) notes.push(SECURITY_HELD);
  addHeat(state, deathHeat(state, dead.length * HEAT_PER_DEATH) + (alive.length ? 0 : HEAT_PER_WIPE));
  addInfection(state, dead.length * deathInfection(state));
  if (!alive.length) addMemo(state, WIPE_MEMO);
}

// --- Radio calls -----------------------------------------------------------
// A radio kit gives the office twice as long to answer.
export const callTicks = (exp: Expedition) => Math.round(CALL_TICKS * (exp.gear.includes("radio") ? 2 : 1) * (exp.wait ?? 1));

const callDef = (id: string): CallDef => CALLS.find((c) => c.id === id)!;

function maybeCall(state: GameState, exp: Expedition, dice: Dice, crew: Worker[]): void {
  if (exp.call || exp.threat || exp.phase === "done" || exp.tick < 8 || exp.callsMade >= MAX_CALLS) return;
  if (exp.tick - (exp.lastCall ?? -CALL_GAP) < CALL_GAP || !dice.chance(0.2)) return;
  const options = CALLS.filter(
    (c) =>
      (!c.only || c.only === exp.levelId) &&
      !(c.outbound && exp.phase !== "in") &&
      !(exp.callIds ?? []).includes(c.id) &&
      (c.needs === "pair" ? crew.length >= 2 : c.needs === "loot" ? exp.carried.length > 0 : true),
  );
  if (!options.length) return;
  const def = dice.pick(options);
  const caller = dice.pick(crew);
  const other = crew.length > 1 ? dice.pick(crew.filter((w) => w !== caller)) : caller;
  exp.call = { id: def.id, asked: exp.tick, m: other.id };
  exp.callsMade++;
  (exp.callIds ??= []).push(def.id);
  exp.log.push(fill(def.text, { n: first(caller), m: first(other), price: `$${VENDING_PRICE}` }));
}

// The player (or the timer) answers the crew's question.
export function answerCall(state: GameState, exp: Expedition, choice: number): boolean {
  if (!exp.call || exp.phase === "done") return false;
  const dice = new Dice(exp.dice);
  resolveCall(state, exp, choice, dice);
  // Far enough in, the radio answers in your voice before you have.
  if (infectionStage(state) >= 3 && state.catchphrase && dice.chance(0.25)) {
    const lead = members(state, exp)[0];
    if (lead) exp.log.push(fill(dice.pick(ECHO_LINES), { n: first(lead), boss: state.bossName, phrase: state.catchphrase }));
  }
  exp.dice = dice.state;
  return true;
}

function resolveCall(state: GameState, exp: Expedition, choice: number, dice: Dice): void {
  const call = exp.call!;
  exp.call = undefined;
  exp.lastCall = exp.tick;
  const lv = levelOf(state, exp.levelId);
  const crew = members(state, exp);
  const lead = crew.find((w) => w.id === exp.leadId) ?? crew[0];
  const m = crew.find((w) => w.id === call.m) ?? lead;
  const line = (key: string, extra: Record<string, string> = {}) =>
    exp.log.push(fill(dice.pick(CALL_OUTCOMES[`${call.id}:${key}`]), { n: first(lead), m: first(m), ...extra }));
  const floorItem = () => dice.pick(Object.values(ITEMS).filter((i) => i.rarity > 0)).id;

  if (call.id === "closet") {
    if (choice === 1) return void line("leave");
    if (dice.chance(0.6)) {
      const item = floorItem();
      exp.carried.push(item);
      line("found", { item: ITEMS[item].name });
    } else line("empty");
    // The noise brings the Hound running.
    const hound = exp.entities.find((r) => r.id === "hound");
    if (hound) {
      const near = neighbors(lv, exp.pos).flatMap((p) => neighbors(lv, p)).filter((p) => dist(p, exp.pos) >= 2);
      if (near.length) hound.pos = dice.pick(near);
      hound.cooldown = 0;
    }
  } else if (call.id === "phone") {
    if (choice === 1) return void line("ignore");
    reveal(state, lv, exp.levelId, exp.pos, 7);
    addInfection(state, 3);
    line("answer");
  } else if (call.id === "ankle") {
    if (choice === 0) {
      line("home");
      return turnBack(lv, exp);
    }
    // Leaving someone to limp along is cheaper. The office notices.
    addInfection(state, 2);
    // A rope kit means nobody gets left behind.
    if (m !== lead && !exp.gear.includes("rope") && dice.chance(0.25)) {
      line("lost");
      m.lastWords = "Wait up. Guys? Wait up.";
      m.status = "dead";
      m.diedOnDay = state.day;
    } else line("fine");
  } else if (call.id === "vending") {
    if (choice === 1 || state.cash < VENDING_PRICE) return void line("skip");
    const item = dice.chance(0.5) ? "almond-water" : "royal-ration";
    state.cash -= VENDING_PRICE;
    state.ledger.unshift({ day: state.day, text: "Vending machine, Level 0", amount: -VENDING_PRICE });
    exp.carried.push(item);
    line("buy", { item: ITEMS[item].name });
  } else if (call.id === "farmhouse") {
    if (choice === 1) return void line("pass");
    if (dice.chance(0.6)) {
      const item = dice.pick(["level-key", "deuclidator", "ghost-light", "memory-jar"]);
      exp.carried.push(item);
      line("good", { item: ITEMS[item].name });
    } else {
      addInfection(state, 6);
      line("wrong");
    }
  } else if (call.id === "rival") {
    if (choice === 1 || !exp.carried.length) return void line("refuse");
    const item = exp.carried.shift()!;
    const pay = Math.round(ITEMS[item].value * 1.3);
    state.cash += pay;
    state.ledger.unshift({ day: state.day, text: `Traded ${ITEMS[item].name} to a rival crew`, amount: pay });
    line("trade", { item: ITEMS[item].name });
  } else if (call.id === "door") {
    if (choice === 1) return void line("pass");
    const roll = dice.next();
    if (roll < 0.5) {
      const item = floorItem();
      exp.carried.push(item);
      line("loot", { item: ITEMS[item].name });
    } else if (roll < 0.8) line("empty");
    else {
      line("woke");
      wakeNearest(lv, exp, dice);
    }
  } else if (call.id === "voice") {
    if (choice === 1) {
      exp.nextChatter = exp.tick + 20; // a quiet stretch
      return void line("cut");
    }
    reveal(state, lv, exp.levelId, exp.pos, 6);
    addInfection(state, 2);
    line("answer");
  } else if (call.id === "fork") {
    if (choice === 0) return void line("lit");
    reveal(state, lv, exp.levelId, exp.pos, 5);
    const taken = state.takenToday[exp.levelId];
    const seen = lv.loot.map((l, i) => ({ l, i })).filter(({ l, i }) => !taken.includes(i) && dist(l.at, exp.pos) <= 7).slice(0, 1);
    for (const { l } of seen) exp.targets.unshift({ ...l.at });
    if (seen.length) line("darkgood", { item: ITEMS[seen[0].l.itemId].name });
    else {
      line("dark");
      wakeNearest(lv, exp, dice);
    }
  } else if (call.id === "sleeper") {
    if (choice === 1) return void line("leave");
    if (dice.chance(0.5)) {
      const item = floorItem();
      exp.carried.push(item);
      line("item", { item: ITEMS[item].name });
    } else {
      line("noise");
      wakeNearest(lv, exp, dice);
    }
  } else if (call.id === "elevator") {
    if (choice === 1) {
      exp.hold = 4; // the stairs take a while
      return void line("stairs");
    }
    const far = [];
    for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (lv.cells[y * lv.w + x] !== WALL && dist({ x, y }, exp.pos) >= 6 && dist({ x, y }, exp.pos) <= 12) far.push({ x, y });
    if (far.length) exp.pos = dice.pick(far);
    reveal(state, lv, exp.levelId, exp.pos, 6);
    addInfection(state, 2);
    line("ride");
  } else if (call.id === "coworker") {
    if (choice === 1) return void line("decline");
    exp.carried.push("sealed-letter");
    addInfection(state, 2);
    line("take");
  } else if (call.id === "supply") {
    if (choice === 1) return void line("leave");
    if (!exp.gear.includes("firstaid")) exp.gear.push("firstaid");
    if (dice.chance(0.3)) {
      line("alarm");
      wakeNearest(lv, exp, dice);
    } else line("take");
  } else if (call.id === "payphone") {
    if (choice === 1 || state.cash < 60) return void line("hang");
    state.cash -= 60;
    state.ledger.unshift({ day: state.day, text: "Collect call from the office", amount: -60 });
    addHeat(state, -5);
    line("accept");
  } else if (call.id === "mirror") {
    if (choice === 1) {
      exp.hold = 3;
      return void line("cover");
    }
    reveal(state, lv, exp.levelId, exp.pos, 8);
    addInfection(state, 3);
    if (dice.chance(0.4)) {
      const item = floorItem();
      exp.carried.push(item);
      line("item", { item: ITEMS[item].name });
    } else line("look");
  } else if (call.id === "shortcut") {
    if (choice === 1) return void line("around");
    const target = exp.targets[0];
    const path = target ? findPath(lv, exp.pos, target) : [];
    if (path.length > 4) exp.pos = path[Math.min(path.length - 1, 5)];
    reveal(state, lv, exp.levelId, exp.pos);
    if (crew.length > 1 && dice.chance(0.3)) {
      exp.hold = 5;
      line("stuck");
    } else line("through");
  }
}

// Whatever lives closest wakes up and comes to see.
function wakeNearest(lv: Level, exp: Expedition, dice: Dice): void {
  const near = [...exp.entities].sort((a, b) => dist(a.pos, exp.pos) - dist(b.pos, exp.pos))[0];
  if (!near) return;
  const cells = neighbors(lv, exp.pos).flatMap((p) => neighbors(lv, p)).filter((p) => dist(p, exp.pos) >= 3);
  if (cells.length) near.pos = dice.pick(cells);
  near.cooldown = 0;
  near.alerted = false;
}

// The finished expedition stays visible as a debrief until the next one starts.
export function activeExpedition(state: GameState): Expedition | undefined {
  return state.expeditions[state.expeditions.length - 1];
}

// A hidden quirk shows itself: say it on the radio and tell HR.
function revealLine(exp: Expedition, w: Worker, id: string): void {
  if (!revealQuirk(w, id)) return;
  const q = quirkDef(id);
  exp.log.push(fill(q.reveal ?? "{n} is acting strange.", { n: first(w) }));
  exp.log.push(`HR learned something about ${w.name}: ${q.name}.`);
}
