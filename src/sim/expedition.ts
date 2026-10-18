import { CALL_OUTCOMES, CALL_TICKS, CALL_TIMEOUT, CALLS, VENDING_PRICE, type CallDef } from "../data/calls";
import { ITEMS } from "../data/items";
import { PLAQUES, WIPE_MEMO } from "../data/memos";
import * as RADIO from "../data/radio";
import { gainXp, hasQuirk, quirkDef, revealQuirk, skill, type Worker } from "./crew";
import { DARK, dist, findPath, generateLevel, idx, nearestOpen, neighbors, WALL, type Level, type Pt } from "./level";
import { addHeat, addInfection, HEAT_PER_DEATH, HEAT_PER_WIPE } from "./office";
import { broughtHome, checkSurvey, isMastered, learn, stageOf } from "./research";
import { Dice } from "./rng";
import { addMemo, fill, type GameState } from "./state";

// One crew walking one level. Everything here is plain data so a run can be
// saved mid-way and stepped by tests without a browser.
export interface Expedition {
  id: number;
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
const cache = new Map<number, Level>();

export function level0(state: GameState): Level {
  let lv = cache.get(state.level0Seed);
  if (!lv) {
    lv = generateLevel(state.level0Seed);
    cache.set(state.level0Seed, lv);
  }
  if (state.fog.length !== lv.cells.length) state.fog = new Array(lv.cells.length).fill(0);
  return lv;
}

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
export const CREW_SLOTS = 2; // expeditions that can be out at once

export const running = (state: GameState) => state.expeditions.filter((e) => e.phase !== "done");

// Default team lead: veterans first, then whoever has the best morale.
export function suggestLead(crew: Worker[]): Worker {
  return [...crew].sort((a, b) => b.level - a.level || skill(b, "morale") - skill(a, "morale"))[0];
}

export function startExpedition(state: GameState, crewIds: number[], marker: Pt, leadId?: number): Expedition | null {
  const crew = crewIds
    .map((id) => state.crew.find((w) => w.id === id))
    .filter((w): w is Worker => !!w && w.status === "idle")
    .slice(0, MAX_CREW);
  if (!crew.length || running(state).length >= CREW_SLOTS) return null;
  const lv = level0(state);
  const waypoint = nearestOpen(lv, marker);
  const lead = crew.find((w) => w.id === leadId) ?? suggestLead(crew);
  for (const w of crew) w.status = "out";
  const exp: Expedition = {
    id: state.nextId++,
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
  };
  reveal(state, lv, exp.pos);
  state.expeditions.push(exp);
  return exp;
}

function reveal(state: GameState, lv: Level, p: Pt): void {
  const r = lv.cells[idx(lv, p)] === DARK ? 1 : VISION;
  for (let y = p.y - r; y <= p.y + r; y++)
    for (let x = p.x - r; x <= p.x + r; x++)
      if (x >= 0 && y >= 0 && x < lv.w && y < lv.h && dist(p, { x, y }) <= r) state.fog[y * lv.w + x] = 1;
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
  const lv = level0(state);
  const dice = new Dice(exp.dice);
  const crew = members(state, exp);
  exp.tick++;

  // The team lead's sense of direction counts double.
  const lead = crew.find((w) => w.id === exp.leadId);
  const navSum = crew.reduce((s, w) => s + skill(w, "nav"), 0) + (lead ? skill(lead, "nav") : 0);
  const avgNav = navSum / Math.max(1, crew.length + (lead ? 1 : 0));
  // Once Level 0 is mastered, everyone knows the way.
  const mapBonus = isMastered(state, "level-0") ? 1 : 0;
  const stalled = dice.chance(Math.max(0, 0.16 - (avgNav + mapBonus) * 0.03));

  // Spot loot nearby on the way in and detour for it.
  if (exp.phase === "in") {
    lv.loot.forEach((l, i) => {
      const known = exp.targets.some((t) => t.x === l.at.x && t.y === l.at.y);
      if (!known && !state.takenToday.includes(i) && dist(l.at, exp.pos) <= 2) exp.targets.unshift({ ...l.at });
    });
  }

  maybeCall(state, exp, dice, crew);
  if (exp.call) {
    // Waiting on the office. The crew holds still; the level doesn't.
    if (exp.tick - exp.call.asked >= CALL_TICKS) {
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
  reveal(state, lv, exp.pos);

  // Arrived somewhere?
  const target = exp.targets[0];
  if (target && target.x === exp.pos.x && target.y === exp.pos.y) {
    exp.targets.shift();
    const lootIdx = lv.loot.findIndex((l, i) => l.at.x === exp.pos.x && l.at.y === exp.pos.y && !state.takenToday.includes(i));
    if (lootIdx >= 0) {
      state.takenToday.push(lootIdx);
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

  for (const r of exp.entities) {
    if ((exp.phase as Expedition["phase"]) === "done") break;
    moveEntity(state, lv, exp, r, dice, members(state, exp));
  }

  // An encounter above can end the run.
  if (exp.tick >= exp.nextChatter && (exp.phase as Expedition["phase"]) !== "done") {
    const talker = crew.find((w) => hasQuirk(w, "walls"));
    if (talker && dice.chance(0.25)) revealLine(exp, talker, "walls");
    else say(exp, dice, crew, RADIO.AMBIENT);
    exp.nextChatter = exp.tick + dice.range(9, 15);
  }
  exp.dice = dice.state;
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
  const whistler = crew.find((w) => hasQuirk(w, "whistler"));
  const d = dist(r.pos, exp.pos);
  const options = neighbors(lv, r.pos);
  const dark = (p: Pt) => lv.cells[idx(lv, p)] === DARK;
  const chase = () => {
    const step = findPath(lv, r.pos, exp.pos)[0];
    if (step) r.pos = step;
  };
  if (r.id === "smiler") {
    // Only hunts when someone is in the dark. Lit halls are safe from it.
    if (d <= (whistler ? 7 : 5) && (dark(exp.pos) || dark(r.pos))) dice.chance(0.7) && chase();
    else if (dice.chance(0.5)) {
      const unlit = options.filter(dark);
      r.pos = dice.pick(unlit.length && dice.chance(0.8) ? unlit : options);
    }
  } else if (r.id === "hound") {
    // Hunts by sound anywhere, keeps to the lit halls when wandering.
    if (d <= (whistler ? 6 : 4)) dice.chance(0.6) && chase();
    else if (dice.chance(0.6)) {
      const lit = options.filter((p) => !dark(p));
      r.pos = dice.pick(lit.length ? lit : options);
    }
  } else if (dice.chance(0.35)) {
    // Facelings just wander, late for a meeting.
    r.pos = dice.pick(options);
  }

  const wasSeen = r.seen;
  r.seen = dist(r.pos, exp.pos) <= VISION;
  if (r.seen && !wasSeen) {
    say(exp, dice, crew, r.id === "hound" ? RADIO.SPOTTED_HOUND : r.id === "faceling" ? RADIO.SPOTTED_FACELING : RADIO.SPOTTED);
    const note = crew.length ? learn(state, r.id, 1, crew[0].name) : null;
    if (note) exp.log.push(note);
    if (whistler && r.id !== "faceling") revealLine(exp, whistler, "whistler");
  }
  if (dist(r.pos, exp.pos) <= 1) encounter(state, lv, exp, r, dice, crew);
}

// Send an entity away after an encounter so it doesn't hit twice in a row.
function sendAway(lv: Level, exp: Expedition, r: Roamer, dice: Dice): void {
  r.cooldown = 14;
  r.seen = false;
  const spawn = lv.spawns.find((s) => s.id === r.id)!.at;
  const open: Pt[] = [];
  lv.cells.forEach((c, i) => {
    if (c !== WALL && (r.id !== "smiler" || c === DARK)) open.push({ x: i % lv.w, y: Math.floor(i / lv.w) });
  });
  const far = open.filter((p) => dist(p, exp.pos) > 8);
  r.pos = far.length ? dice.pick(far) : { ...spawn };
}

function encounter(state: GameState, lv: Level, exp: Expedition, r: Roamer, dice: Dice, crew: Worker[]): void {
  exp.encounters++;
  sendAway(lv, exp, r, dice);
  if (r.id === "faceling") return facelingEncounter(state, lv, exp, dice, crew);

  // The Hound won't take on a group.
  if (r.id === "hound" && crew.length >= (isMastered(state, "hound") ? 2 : 3)) {
    say(exp, dice, crew, RADIO.HOUND_BACKS_OFF);
    return survived(state, exp, r, dice, crew);
  }

  // Each crew member tries to slip away; the entity takes at most one.
  const order = [...crew].sort(() => dice.next() - 0.5);
  for (const w of crew) if (hasQuirk(w, "coward") && crew.length > 1) revealLine(exp, w, "coward");
  const victim = order.find((w) => {
    if (hasQuirk(w, "coward") && crew.length > 1) return false;
    let p = r.id === "hound" ? 0.55 - skill(w, "stealth") * 0.06 : 0.5 - skill(w, "stealth") * 0.075;
    if (r.id === "smiler" && isMastered(state, "smiler")) p /= 2;
    const roll = dice.next();
    if (hasQuirk(w, "lucky") && roll < p && roll >= p / 2) {
      revealLine(exp, w, "lucky");
      return false;
    }
    return roll < p;
  });

  if (!victim) {
    say(exp, dice, crew, RADIO.ESCAPE);
    return survived(state, exp, r, dice, crew);
  }
  const medic = crew.find((w) => w !== victim && skill(w, "medical") >= 4);
  if (medic && dice.chance(0.3)) {
    exp.log.push(`${first(medic)}: Got ${first(victim)} out of there. Bleeding, but walking.`);
    return survived(state, exp, r, dice, crew);
  }
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
  say(exp, dice, survivors, r.id === "hound" ? RADIO.HOUND_DEATH : RADIO.DEATH, { m: first(victim) });
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

// Facelings are harmless, but crews who don't know that panic.
function facelingEncounter(state: GameState, lv: Level, exp: Expedition, dice: Dice, crew: Worker[]): void {
  const r = exp.entities.find((e) => e.id === "faceling")!;
  const lead = crew.find((w) => w.id === exp.leadId) ?? crew[0];
  const calm = stageOf(state, "faceling") >= 2 || hasQuirk(lead, "calm");
  if (!calm && exp.phase === "in" && dice.chance(0.5 - skill(lead, "morale") * 0.08)) {
    say(exp, dice, crew, RADIO.FACELING_PANIC);
    turnBack(lv, exp);
  } else {
    say(exp, dice, crew, RADIO.FACELING_PASS);
  }
  survived(state, exp, r, dice, crew);
}

// Living through an encounter teaches the Index something and can leave a sample.
function survived(state: GameState, exp: Expedition, r: Roamer, dice: Dice, crew: Worker[]): void {
  if (!crew.length) return;
  const note = learn(state, r.id, 2, crew[0].name);
  if (note) exp.log.push(note);
  const chance = r.id === "faceling" ? (isMastered(state, "faceling") ? 0.75 : 0.5) : 0.35;
  if (dice.chance(chance)) {
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
  const survey = checkSurvey(state, level0(state));
  if (survey) notes.push(survey);
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
  if (!alive.length) addMemo(state, WIPE_MEMO);
}

// --- Radio calls -----------------------------------------------------------
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
  const lv = level0(state);
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
    for (let y = exp.pos.y - 7; y <= exp.pos.y + 7; y++)
      for (let x = exp.pos.x - 7; x <= exp.pos.x + 7; x++)
        if (x >= 0 && y >= 0 && x < lv.w && y < lv.h && dist(exp.pos, { x, y }) <= 7) state.fog[y * lv.w + x] = 1;
    addInfection(state, 3);
    line("answer");
  } else if (call.id === "ankle") {
    if (choice === 0) {
      line("home");
      return turnBack(lv, exp);
    }
    // Leaving someone to limp along is cheaper. The office notices.
    addInfection(state, 2);
    if (m !== lead && dice.chance(0.25)) {
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
