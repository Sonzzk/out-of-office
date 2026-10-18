import { ACT_CARDS, ENDINGS, STICKIES } from "../data/story";
import { shownName } from "../privacy";
import { fill, type GameState } from "../sim/state";
import {
  actOf, beginDescent, canResign, descentBlock, endingSlots, exitRules, flag, pendingDescent, resign, resolveDescent, standing, startQuarter, storyStats,
} from "../sim/story";
import { game, onChange, update, watch } from "../store";
import { apps } from "./apps";
import { esc } from "./dom";
import "./story.css";
import { dialog, openApp, type AppDef } from "./windows";

// The story on the desktop: a title card when an act begins, a note and a tint
// that stay, the Exit icon in Act 3, and the end screen.
const EXIT_APP: AppDef = { id: "exit", title: "Exit Interview", w: 480, h: 560, render: renderExit };
const PLAQUE_APP: AppDef = { id: "plaques", title: "Plaques", w: 400, h: 380, render: renderPlaques };
// ?fast (play-tests) shortens the arrival sequence.
const speed = new URLSearchParams(location.search).has("fast") ? 0.1 : 1;
const lock = `<img class="lock" src="./art/icons/U-padlock.png" alt="">`;

export function startStory(desk: HTMLElement): void {
  const sync = () => {
    const s = game();
    const act = actOf(s);
    for (const n of [2, 3]) desk.classList.toggle(`act-${n}`, act === n);
    syncSticky(desk, act);
    syncExitIcon(desk, act);
    syncPlaques(desk);
    // A crew that went down and came home settles the story, wherever the player is looking.
    if (pendingDescent(s)) return void update((x) => void resolveDescent(x));
    if (s.ending) return showEnding();
    if (ACT_CARDS[act] && act > (flag(s, "shownAct") || 1)) {
      update((x) => void ((x.storyFlags ??= {}).shownAct = act));
      actCard(desk, act);
    }
  };
  onChange(sync);
  sync();
}

function syncSticky(desk: HTMLElement, act: number): void {
  const work = desk.querySelector(".work")!;
  let note = work.querySelector<HTMLElement>(".sticky-board");
  const text = STICKIES[Math.min(act, 3)];
  if (!text || act === 4) return void note?.remove();
  if (!note) {
    note = document.createElement("div");
    note.className = "sticky-board";
    work.appendChild(note);
  }
  const html = `<b>From the Board</b>${esc(text)}`;
  if (note.innerHTML !== html) note.innerHTML = html;
}

function syncExitIcon(desk: HTMLElement, act: number): void {
  const icons = desk.querySelector(".icons")!;
  const has = icons.querySelector(".ic.exit");
  if (act < 3) return void has?.remove();
  if (has) return;
  const btn = document.createElement("button");
  btn.className = "ic exit";
  btn.dataset.open = "exit";
  btn.innerHTML = `<img alt=""><span>EXIT</span>`;
  btn.querySelector("img")!.src = "./art/icons/U-key.png";
  btn.addEventListener("click", () => openApp(EXIT_APP));
  icons.appendChild(btn);
}

function actCard(desk: HTMLElement, act: number): void {
  const c = ACT_CARDS[act];
  const card = document.createElement("div");
  card.className = "act-card";
  card.setAttribute("role", "status");
  card.innerHTML = `<b>${esc(c.title)}</b><span>${esc(c.sub)}</span><small>click to continue</small>`;
  const done = () => {
    card.classList.add("out");
    setTimeout(() => card.remove(), 400);
  };
  card.addEventListener("click", done);
  desk.appendChild(card);
  setTimeout(done, 5000);
}

// Every ending as a slot: the ones you have seen are named, the rest stay locked.
function endingList(s = game()): string {
  return `<ul class="endlist">${endingSlots(s)
    .map((e) => (e.seen ? `<li class="seen"><b>${esc(e.title)}</b></li>` : `<li class="locked">${lock}<span>Locked</span></li>`))
    .join("")}</ul>`;
}

// What the last endings left behind: a shelf of small brass plates on the desk. One
// plate per ending seen, dark slots for the rest. It stays across quarters.
function syncPlaques(desk: HTMLElement): void {
  const s = game();
  const work = desk.querySelector(".work")!;
  let shelf = work.querySelector<HTMLElement>(".plaques");
  if (!(s.endings ?? []).length) return void shelf?.remove();
  if (!shelf) {
    shelf = document.createElement("button");
    shelf.className = "plaques";
    shelf.addEventListener("click", () => openApp(PLAQUE_APP));
    work.appendChild(shelf);
  }
  const slots = endingSlots(s);
  const html = slots.map((e) => `<i class="${e.seen ? "seen" : ""}"></i>`).join("");
  shelf.title = `Plaques: ${slots.filter((e) => e.seen).length} of ${slots.length} endings`;
  if (shelf.innerHTML !== html) shelf.innerHTML = html;
}

function renderPlaques(body: HTMLElement): void {
  body.classList.add("exit");
  watch(body, () => {
    const s = game();
    const seen = (s.endings ?? []).length;
    body.innerHTML = `<h3>Plaques</h3><p>One for every way the company has ended. The office kept them.</p>${endingList(s)}
      <p class="dim">${seen} of ${Object.keys(ENDINGS).length} endings.</p>`;
  });
}

// The Clock Out menu item. Returns true when the story took the click.
export async function clockOut(): Promise<boolean> {
  if (actOf(game()) < 2 || game().ending) return false;
  const a = await dialog("Clock Out", "HR has a form for this. It is the only form HR has ever processed on time.", ["Open the form", "Cancel"], "./art/icons/U-clock.png");
  if (a === "Open the form") openApp(EXIT_APP);
  return true;
}

function renderExit(body: HTMLElement): void {
  body.classList.add("exit");
  body.addEventListener("click", async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-do]")?.dataset.do;
    if (act === "map") return void openApp(apps(game()).find((a) => a.id === "map")!);
    if (act === "descend") {
      const ok = await dialog("The Exit", "One crew, one trip. The farmhouse is at the far end of the wheat. Send your best?", ["Send them", "Not yet"], "./art/icons/U-map.png");
      if (ok !== "Send them") return;
      update((s) => void beginDescent(s));
      openApp(apps(game()).find((a) => a.id === "map")!);
    }
    if (act === "resign") {
      const ok = await dialog("Resign", "This is the form. Once HR stamps it, you will have left. Sign?", ["Sign", "Cancel"], "./art/icons/U-padlock.png");
      if (ok === "Sign") update((s) => void resign(s));
    }
  });
  watch(body, () => {
    const s = game();
    const act = actOf(s);
    const out = s.expeditions.some((x) => x.final && x.phase !== "done");
    const block = descentBlock(s);
    const reached = (s.endings ?? []).length;
    body.innerHTML = `
      <h3>The Exit</h3>
      <p>The Board will open a door when it is satisfied. It is satisfied when:</p>
      <ul class="req">${exitRules(s).map((r) => `<li class="${r.done ? "done" : ""}">${esc(r.label)}</li>`).join("")}</ul>
      <h3>Where you stand</h3>
      <ul class="stand">${standing(s).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      <div class="row">
        ${out ? `<button class="btn" data-do="map">The crew is out. Watch the map</button>` : `<button class="btn go" data-do="descend" ${block ? "disabled" : ""}>Send the final crew</button>`}
      </div>
      ${block && !out ? `<p class="dim">${esc(block)}</p>` : ""}
      <h3>Resignation</h3>
      <p>HR has the form. It has always had the form.</p>
      <div class="row"><button class="btn" data-do="resign" ${canResign(s) ? "" : "disabled"}>Resign</button></div>
      <h3>Endings</h3>
      ${endingList(s)}
      <p class="dim">${act >= 4 ? `Quarter ${flag(s, "quarter") + 1}. ` : ""}Endings seen: ${reached} of ${Object.keys(ENDINGS).length}.</p>`;
  });
}

function showEnding(): void {
  if (document.querySelector(".ending, .arrival")) return;
  const s = game();
  if (!ENDINGS[s.ending!]) return;
  // A crew that reached the farmhouse gets its arrival first; resigning goes straight to the page.
  if (s.endingCrew) arrival(s, showSheet);
  else showSheet();
}

// The last ten seconds before the page: the body cam finds the lit house, the
// radio goes quiet, and the table has a card with the boss's name on it.
function arrival(s: GameState, then: () => void): void {
  const boss = shownName(s.bossName);
  const crew = s.endingCrew!;
  const lead = (crew.present[0] ?? crew.missing[0] ?? "Crew").split(" ")[0];
  const el = document.createElement("div");
  el.className = "arrival";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Arrival at the farmhouse");
  el.dataset.phase = "1";
  const places = [...crew.present, ...crew.missing].map((n) => `<i class="${crew.missing.includes(n) ? "empty" : ""}"></i>`).join("");
  el.innerHTML = `<div class="scene">
      <div class="sky"></div><div class="field"></div>
      <div class="house"><i class="roof"></i><i class="walls"></i><i class="win a"></i><i class="win b"></i><i class="win c"></i><i class="door"></i></div>
      <div class="room"><div class="table">${places}<div class="card">${esc(boss)}</div></div></div>
    </div>
    <div class="hud"><span><i class="led"></i>REC</span><span>CAM 10</span><span class="l">${esc(lead.toUpperCase())}</span><span class="r">L10  T+END</span></div>
    <div class="line"></div><div class="scan"></div><button class="skip">skip</button>`;
  const line = el.querySelector<HTMLElement>(".line")!;
  const beats: [number, string, string][] = [
    [0, "1", `${lead}: There. Every light is on. It is exactly where the wheat stops.`],
    [4500, "2", "The radio has gone quiet. Nobody is breathing on it."],
    [8500, "3", `A table, laid for the whole crew. One card has ${boss} on it.`],
    [14000, "4", ""],
  ];
  const timers: number[] = [];
  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    timers.forEach(clearTimeout);
    el.remove();
    then();
  };
  for (const [ms, phase, text] of beats)
    timers.push(
      window.setTimeout(() => {
        el.dataset.phase = phase;
        line.textContent = text;
        if (phase === "4") timers.push(window.setTimeout(finish, 900 * speed));
      }, ms * speed),
    );
  el.querySelector(".skip")!.addEventListener("click", finish);
  document.body.appendChild(el);
}

function showSheet(): void {
  const s = game();
  const def = ENDINGS[s.ending!];
  const vars = { company: s.company, boss: shownName(s.bossName) };
  const crew = s.endingCrew;
  const el = document.createElement("div");
  el.className = "ending";
  el.dataset.ending = s.ending!;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", def.title);
  el.innerHTML = `<div class="sheet">
    <div class="label">Ending</div>
    <h1>${esc(def.title)}</h1>
    <div class="kick">${esc(fill(def.kicker, vars))}</div>
    ${def.text.map((p) => `<p>${esc(fill(p, vars))}</p>`).join("")}
    ${crew ? `<div class="crew"><b>The crew</b>${crew.present.map((n) => `<span>${esc(n)}</span>`).join("")}${crew.missing.map((n) => `<span class="gone">${esc(n)} <em>missing</em></span>`).join("")}</div>` : ""}
    <table>${storyStats(s).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    ${endingList(s)}
    <div class="n">Ending ${(s.endings ?? []).length} of ${Object.keys(ENDINGS).length}. The office carries on.</div>
    <button data-quarter>Begin a new quarter</button></div>`;
  el.querySelector("[data-quarter]")!.addEventListener("click", () => {
    update((x) => void startQuarter(x));
    el.remove();
  });
  document.body.appendChild(el);
  el.querySelector<HTMLElement>("[data-quarter]")!.focus({ preventScroll: true });
}
