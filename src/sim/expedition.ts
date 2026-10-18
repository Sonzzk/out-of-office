import { CALL_OUTCOMES, CALL_TICKS, CALL_TIMEOUT, CALLS, VENDING_PRICE, type CallDef } from "../data/calls";
import { entityDef } from "../data/entities";
import { INFECTED_RADIO } from "../data/infection";
import { GEAR, gearDef } from "../data/gear";
import { ITEMS } from "../data/items";
import { CHECKOUT_TICK, CHECKOUT_WARN, levelDef } from "../data/levels";
import { PLAQUES, WIPE_MEMO } from "../data/memos";
import * as RADIO from "../data/radio";
import { gainXp, hasQuirk, quirkDef, revealQuirk, skill, type Worker } from "./crew";
import { BASE_CREW_SLOTS, callWait, crewSlots, moraleBoost } from "./facilities";
import { DARK, dist, findPath, generateLevel, idx, nearestOpen, neighbors, WALL, type Level, type Pt } from "./level";
import { addHeat, addInfection, HEAT_PER_DEATH, HEAT_PER_WIPE } from "./office";
import { broughtHome, checkSurvey, isMastered, isUnlocked, learn, stageOf } from "./research";
import { Dice } from "./rng";
import { addMemo, fill, type GameState } from "./state";

// One crew walking one level. Everything here is plain data so a run can be
// saved mid-way and stepped by tests without a browser.
export interface Expedition {
  id: number;
  levelId: string;
  crewIds: number[];
  leadId: number;
  waypoint: Pt;
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
  result?: { survivors: number; dead: string[]; loot: string[]; notes: string[] };
}

// One entity walking the same level as the crew.
export interface Roamer {
  id: string; // Index id: smiler, hound, faceling
  pos: Pt;
  cooldown: number; // ticks spent away after an encounter
  seen: boolean;
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
  marker: Pt,
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
  const waypoint = nearestOpen(lv, marker);
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
    pos: { ...lv.entrance },
    phase: "in",
    targets: [waypoint],
    entities: lv.spawns.map((s) => ({ id: s.id, pos: { ...s.at }, cooldown: 0, seen: false })),
    tick: 0,
    nextChatter: 6,
    dice: (state.seed ^ Math.imul(state.nextId * 97 + state.day, 2654435761)) >>> 0,
    carried: [],
    log: [`${lead.name}: Team lead here. Going in.`],
    encounters: 0,
    callsMade: 0,
    gear: affordable(state, gear),
    used: [],
    wait: callWait(state),
  };
  // Gear is paid for when the crew sets out.
  for (const id of exp.gear) {
    state.cash -= gearDef(id).cost;
    state.ledger.unshift({ day: state.day, text: `Gear: ${gearDef(id).name}`, amount: -gearDef(id).cost });
  }
  reveal(state, lv, levelId, exp.pos);
  state.expeditions.push(exp);
  return exp;
}

function reveal(state: GameState, lv: Level, levelId: string, p: Pt, radius?: number): void {
  const fog = state.fog[levelId];
  const lit = state.outageDay === state.day ? 2 : VISION; // power cut: less light everywhere
  const r = radius ?? (lv.cells[idx(lv, p)] === DARK ? 1 : lit);
  for (let y = p.y - r; y <= p.y + r; y++)
    for (let x = p.x - r; x <= p.x + r; x++)
      if (x >= 0 && y >= 0 && x < lv.w && y < lv.h && dist(p, { x, y }) <= r) fog[y * lv.w + x] = 1;
}

function say(exp: Expedition, dice: Dice, crew: Worker[], lines: string[], extra: Record<string, string> = {}): void {
  if (!crew.length) return;
  const speaker = dice.pick(crew);
  const other = crew.length > 1 ? dice.pick(crew.filter((w) => w !== speaker)) : speaker;
  // Someone alone can't talk about a teammate.
  const usable = other === speaker && !extra.m ? lines.filter((l) => !l.includes("{m}")) : lines;
  exp.log.push(fill(dice.pick(usable.length ? usable : lines), { n: first(speaker), m: first(other), ...extra }));
}

const first = (w: Worker) => (w.name.startsWith("CLONE") ? w.name : w.name.split(" ")[0]);

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
  const stalled = dice.chance(Math.max(0, 0.16 - (avgNav + mapBonus) * 0.03) * rope);

  // Spot loot nearby on the way in and detour for it.
  if (exp.phase === "in") {
    lv.loot.forEach((l, i) => {
      const known = exp.targets.some((t) => t.x === l.at.x && t.y === l.at.y);
      if (!known && !taken.includes(i) && dist(l.at, exp.pos) <= 2) exp.targets.unshift({ ...l.at });
    });
  }

  maybeCall(state, exp, dice, crew);
  if (exp.call) {
    // Waiting on the office. The crew holds still; the level doesn't.
    if (exp.tick - exp.call.asked >= callTicks(exp)) {
      const lead = crew.find((w) => w.id === exp.leadId) ?? crew[0];
      exp.log.push(fill(CALL_TIMEOUT, { n: first(lead) }));
      resolveCall(state, exp, callDef(exp.call.id).fallback, dice);
    }
  } else if (!stalled) {
    const target = exp.targets[0];
    const step = target ? findPath(lv, exp.pos, target)[0] : undefined;
    if (step) exp.pos = step;
  } else if (dice.chance(0.2)) {
    say(exp, dice, crew, RADIO.LOST);
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
      say(exp, dice, crew, RADIO.LOOT, { item: item.name });
    } else if (exp.phase === "in" && exp.waypoint.x === exp.pos.x && exp.waypoint.y === exp.pos.y) {
      say(exp, dice, crew, RADIO.ARRIVE);
    }
    if (exp.phase === "in" && !exp.targets.length) turnBack(lv, exp);
  }
  if (exp.phase === "return" && exp.pos.x === lv.entrance.x && exp.pos.y === lv.entrance.y) {
    say(exp, dice, crew, RADIO.HOME);
    exp.dice = dice.state;
    return finish(state, exp);
  }

  if (levelDef(exp.levelId).rule === "hotel") checkout(state, lv, exp, dice);
  for (const r of exp.entities) {
    if ((exp.phase as Expedition["phase"]) === "done") break;
    moveEntity(state, lv, exp, r, dice, members(state, exp));
  }

  // An encounter above can end the run.
  if (exp.tick >= exp.nextChatter && (exp.phase as Expedition["phase"]) !== "done") {
    const talker = crew.find((w) => hasQuirk(w, "walls"));
    if (talker && dice.chance(0.25)) revealLine(exp, talker, "walls");
    // An infected office leaks into the radio, and it knows your name.
    else if (state.infection >= 30 && dice.chance(state.infection / 200))
      say(exp, dice, crew, INFECTED_RADIO, { boss: state.bossName, phrase: state.catchphrase ?? "" });
    else say(exp, dice, crew, RADIO.AMBIENT);
    exp.nextChatter = exp.tick + dice.range(9, 15);
  }
  exp.dice = dice.state;
}

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
    return;
  }
  const def = entityDef(r.id);
  const whistler = crew.find((w) => hasQuirk(w, "whistler"));
  const near = def.sense > 0 && dist(r.pos, exp.pos) <= def.sense + (whistler ? 2 : 0);
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
    say(exp, dice, crew, def.spotted, { boss: state.bossName });
    const note = crew.length ? learn(state, r.id, 1, crew[0].name) : null;
    if (note) exp.log.push(note);
    if (whistler && def.sense > 0) revealLine(exp, whistler, "whistler");
  }
  if (dist(r.pos, exp.pos) <= 1) encounter(state, lv, exp, r, dice, crew);
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
    say(exp, dice, crew, [def.passed], vars);
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
      const p = Math.max(0.03, def.base! - skill(victim, def.check!) * def.per!) * (mastered ? 0.5 : 1) * depthMult;
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
        p *= depthMult;
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
    exp.log.push(fill(dice.pick(RADIO.RETREAT), { n: first(lead) }));
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
    say(exp, dice, crew, RADIO.SAMPLE);
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
  for (const itemId of loot) {
    state.loot.push({ id: state.nextId++, itemId, foundBy: alive[0].name });
    const note = broughtHome(state, itemId, alive[0].name);
    if (note) notes.push(note);
  }
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
  addHeat(state, dead.length * HEAT_PER_DEATH + (alive.length ? 0 : HEAT_PER_WIPE));
  addInfection(state, dead.length * 2);
  if (!alive.length) addMemo(state, WIPE_MEMO);
}

// --- Radio calls -----------------------------------------------------------
// A radio kit gives the office twice as long to answer.
export const callTicks = (exp: Expedition) => Math.round(CALL_TICKS * (exp.gear.includes("radio") ? 2 : 1) * (exp.wait ?? 1));

const callDef = (id: string): CallDef => CALLS.find((c) => c.id === id)!;

function maybeCall(state: GameState, exp: Expedition, dice: Dice, crew: Worker[]): void {
  if (exp.call || exp.callsMade || exp.phase !== "in" || exp.tick < 8 || !dice.chance(0.12)) return;
  const options = CALLS.filter((c) => (c.needs === "pair" ? crew.length >= 2 : c.needs === "loot" ? exp.carried.length > 0 : true));
  const def = dice.pick(options);
  const caller = dice.pick(crew);
  const other = crew.length > 1 ? dice.pick(crew.filter((w) => w !== caller)) : caller;
  exp.call = { id: def.id, asked: exp.tick, m: other.id };
  exp.callsMade++;
  exp.log.push(fill(def.text, { n: first(caller), m: first(other), price: `$${VENDING_PRICE}` }));
}

// The player (or the timer) answers the crew's question.
export function answerCall(state: GameState, exp: Expedition, choice: number): boolean {
  if (!exp.call || exp.phase === "done") return false;
  const dice = new Dice(exp.dice);
  resolveCall(state, exp, choice, dice);
  exp.dice = dice.state;
  return true;
}

function resolveCall(state: GameState, exp: Expedition, choice: number, dice: Dice): void {
  const call = exp.call!;
  exp.call = undefined;
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
  } else if (call.id === "rival") {
    if (choice === 1 || !exp.carried.length) return void line("refuse");
    const item = exp.carried.shift()!;
    const pay = Math.round(ITEMS[item].value * 1.3);
    state.cash += pay;
    state.ledger.unshift({ day: state.day, text: `Traded ${ITEMS[item].name} to a rival crew`, amount: pay });
    line("trade", { item: ITEMS[item].name });
  }
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
