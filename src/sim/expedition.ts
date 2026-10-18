import { ITEMS } from "../data/items";
import { PLAQUES, WIPE_MEMO } from "../data/memos";
import * as RADIO from "../data/radio";
import { skill, type Worker } from "./crew";
import { DARK, dist, findPath, generateLevel, idx, nearestOpen, neighbors, type Level, type Pt } from "./level";
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
  entity: Pt;
  entityCooldown: number;
  entitySeen: boolean;
  tick: number;
  nextChatter: number;
  dice: number;
  carried: string[];
  log: string[];
  result?: { survivors: number; dead: string[]; loot: string[] };
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

export function startExpedition(state: GameState, crewIds: number[], marker: Pt): Expedition | null {
  const crew = crewIds.map((id) => state.crew.find((w) => w.id === id)).filter((w): w is Worker => !!w && w.status === "idle");
  if (!crew.length) return null;
  const lv = level0(state);
  const waypoint = nearestOpen(lv, marker);
  const lead = [...crew].sort((a, b) => skill(b, "morale") - skill(a, "morale"))[0];
  for (const w of crew) w.status = "out";
  const exp: Expedition = {
    id: state.nextId++,
    crewIds: crew.map((w) => w.id),
    leadId: lead.id,
    waypoint,
    pos: { ...lv.entrance },
    phase: "in",
    targets: [waypoint],
    entity: { ...lv.entity },
    entityCooldown: 0,
    entitySeen: false,
    tick: 0,
    nextChatter: 6,
    dice: (state.seed ^ Math.imul(state.nextId * 97 + state.day, 2654435761)) >>> 0,
    carried: [],
    log: [`${lead.name}: Team lead here. Going in.`],
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
  exp.log.push(fill(dice.pick(lines), { n: first(speaker), m: first(other), ...extra }));
}

const first = (w: Worker) => (w.name.startsWith("CLONE") ? w.name : w.name.split(" ")[0]);

// Advance one tick: the crew moves one cell, the entity moves, things happen.
export function stepExpedition(state: GameState, exp: Expedition): void {
  if (exp.phase === "done") return;
  const lv = level0(state);
  const dice = new Dice(exp.dice);
  const crew = members(state, exp);
  exp.tick++;

  const avgNav = crew.reduce((s, w) => s + skill(w, "nav"), 0) / Math.max(1, crew.length);
  const stalled = dice.chance(Math.max(0, 0.16 - avgNav * 0.03));

  // Spot loot nearby on the way in and detour for it.
  if (exp.phase === "in") {
    lv.loot.forEach((l, i) => {
      const known = exp.targets.some((t) => t.x === l.at.x && t.y === l.at.y);
      if (!known && !state.takenToday.includes(i) && dist(l.at, exp.pos) <= 2) exp.targets.unshift({ ...l.at });
    });
  }

  if (!stalled) {
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

  moveEntity(state, lv, exp, dice, crew);

  // An encounter above can end the run.
  if (exp.tick >= exp.nextChatter && (exp.phase as Expedition["phase"]) !== "done") {
    say(exp, dice, crew, RADIO.AMBIENT);
    exp.nextChatter = exp.tick + dice.range(9, 15);
  }
  exp.dice = dice.state;
}

function turnBack(lv: Level, exp: Expedition): void {
  exp.phase = "return";
  exp.targets = [{ ...lv.entrance }];
}

function moveEntity(state: GameState, lv: Level, exp: Expedition, dice: Dice, crew: Worker[]): void {
  if (exp.entityCooldown > 0) {
    exp.entityCooldown--;
    exp.entitySeen = false;
    return;
  }
  const near = dist(exp.entity, exp.pos) <= 5;
  const inDark = lv.cells[idx(lv, exp.pos)] === DARK || lv.cells[idx(lv, exp.entity)] === DARK;
  if (near && inDark) {
    const step = findPath(lv, exp.entity, exp.pos)[0];
    if (step && dice.chance(0.7)) exp.entity = step;
  } else if (dice.chance(0.5)) {
    // Wander, preferring dark cells.
    const options = neighbors(lv, exp.entity);
    const dark = options.filter((p) => lv.cells[idx(lv, p)] === DARK);
    exp.entity = dice.pick(dark.length && dice.chance(0.8) ? dark : options);
  }
  const wasSeen = exp.entitySeen;
  exp.entitySeen = dist(exp.entity, exp.pos) <= VISION;
  if (exp.entitySeen && !wasSeen) say(exp, dice, crew, RADIO.SPOTTED);
  if (dist(exp.entity, exp.pos) <= 1) encounter(state, lv, exp, dice, crew);
}

function encounter(state: GameState, lv: Level, exp: Expedition, dice: Dice, crew: Worker[]): void {
  // Each crew member tries to slip away; the Smiler takes at most one.
  const order = [...crew].sort(() => dice.next() - 0.5);
  const victim = order.find((w) => dice.chance(0.5 - skill(w, "stealth") * 0.075));
  exp.entityCooldown = 14;
  const darkCells: Pt[] = [];
  lv.cells.forEach((c, i) => c === DARK && darkCells.push({ x: i % lv.w, y: Math.floor(i / lv.w) }));
  const far = darkCells.filter((p) => dist(p, exp.pos) > 8);
  exp.entity = far.length ? dice.pick(far) : { ...lv.entity };

  if (!victim) {
    say(exp, dice, crew, RADIO.ESCAPE);
    return;
  }
  const medic = crew.find((w) => w !== victim && skill(w, "medical") >= 4);
  if (medic && dice.chance(0.3)) {
    exp.log.push(`${first(medic)}: Got ${first(victim)} out of there. Bleeding, but walking.`);
    return;
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
  say(exp, dice, survivors, RADIO.DEATH, { m: first(victim) });
  const lead = survivors.find((w) => w.id === exp.leadId) ?? survivors[0];
  exp.leadId = lead.id;
  if (exp.phase === "in" && dice.chance(0.65 - skill(lead, "morale") * 0.1)) {
    exp.log.push(fill(dice.pick(RADIO.RETREAT), { n: first(lead) }));
    turnBack(lv, exp);
  }
}

function finish(state: GameState, exp: Expedition): void {
  exp.phase = "done";
  const all = exp.crewIds.map((id) => state.crew.find((w) => w.id === id)!);
  const alive = all.filter((w) => w.status === "out");
  const dead = all.filter((w) => w.status === "dead" && w.diedOnDay === state.day);
  for (const w of alive) {
    w.status = "idle";
    w.runs++;
  }
  const loot = alive.length ? exp.carried : [];
  for (const itemId of loot) state.loot.push({ id: state.nextId++, itemId, foundBy: alive[0].name });
  exp.result = { survivors: alive.length, dead: dead.map((w) => w.name), loot };
  for (const w of dead) {
    const plaque = state.memos.length % PLAQUES.length;
    const tpl = PLAQUES[plaque];
    addMemo(state, {
      from: "HR",
      subject: fill(tpl.subject, { name: w.name }),
      body: fill(tpl.body, { name: w.name, words: w.lastWords ?? "..." }),
    });
  }
  if (!alive.length) addMemo(state, WIPE_MEMO);
}

// The finished expedition stays visible as a debrief until the next one starts.
export function activeExpedition(state: GameState): Expedition | undefined {
  return state.expeditions[state.expeditions.length - 1];
}
