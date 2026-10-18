import { ACT_CARDS, ENDINGS, STICKIES } from "../data/story";
import { shownName } from "../privacy";
import { fill } from "../sim/state";
import {
  actOf, beginDescent, canResign, descentBlock, exitRules, flag, pendingDescent, resign, resolveDescent, startQuarter, storyStats,
} from "../sim/story";
import { game, onChange, update, watch } from "../store";
import { apps } from "./apps";
import { esc } from "./dom";
import "./story.css";
import { dialog, openApp, type AppDef } from "./windows";

// The story on the desktop: a title card when an act begins, a note and a tint
// that stay, the Exit icon in Act 3, and the end screen.
const EXIT_APP: AppDef = { id: "exit", title: "Exit Interview", w: 480, h: 470, render: renderExit };

export function startStory(desk: HTMLElement): void {
  const sync = () => {
    const s = game();
    const act = actOf(s);
    for (const n of [2, 3]) desk.classList.toggle(`act-${n}`, act === n);
    syncSticky(desk, act);
    syncExitIcon(desk, act);
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
    setTimeout(() => card.remove(), 1300);
  };
  card.addEventListener("click", done);
  desk.appendChild(card);
  setTimeout(done, 5000);
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
      <div class="row">
        ${out ? `<button class="btn" data-do="map">The crew is out. Watch the map</button>` : `<button class="btn go" data-do="descend" ${block ? "disabled" : ""}>Send the final crew</button>`}
      </div>
      ${block && !out ? `<p class="dim">${esc(block)}</p>` : ""}
      <h3>Resignation</h3>
      <p>HR has the form. It has always had the form.</p>
      <div class="row"><button class="btn" data-do="resign" ${canResign(s) ? "" : "disabled"}>Resign</button></div>
      <p class="dim">${act >= 4 ? `Quarter ${flag(s, "quarter") + 1}. ` : ""}Endings seen: ${reached} of ${Object.keys(ENDINGS).length}.</p>`;
  });
}

function showEnding(): void {
  if (document.querySelector(".ending")) return;
  const s = game();
  const def = ENDINGS[s.ending!];
  if (!def) return;
  const vars = { company: s.company, boss: shownName(s.bossName) };
  const el = document.createElement("div");
  el.className = "ending";
  el.dataset.ending = s.ending!;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", def.title);
  el.innerHTML = `<div class="sheet">
    <h1>${esc(def.title)}</h1>
    <div class="kick">${esc(fill(def.kicker, vars))}</div>
    ${def.text.map((p) => `<p>${esc(fill(p, vars))}</p>`).join("")}
    <table>${storyStats(s).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    <div class="n">Ending ${(s.endings ?? []).length} of ${Object.keys(ENDINGS).length}. The office carries on.</div>
    <button data-quarter>Begin a new quarter</button></div>`;
  el.querySelector("[data-quarter]")!.addEventListener("click", () => {
    update((x) => void startQuarter(x));
    el.remove();
  });
  document.body.appendChild(el);
  el.querySelector<HTMLElement>("[data-quarter]")!.focus();
}
