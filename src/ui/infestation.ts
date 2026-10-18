// What the office looks like once it is infected. The glitch and uncanny
// modules add moods; this adds things that are simply there: a stain that
// grows, a desktop icon nobody installed, windows that move and come back.
// Everything is read from the save, and calm mode turns all of it off.
import { shownName } from "../privacy";
import { infectionStage } from "../sim/infection";
import { game, onChange } from "../store";
import { isCalm } from "./audio";
import { esc } from "./dom";
import { notify } from "./uncanny";
import { onWindowsChanged, openApp, openWindows } from "./windows";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

function breakRoom(body: HTMLElement): void {
  const s = game();
  const dead = s.crew.filter((w) => w.status === "dead");
  const head = infectionStage(s) >= 4 ? `<p>${esc(shownName(s.bossName))} is at the head of the table.</p>` : "";
  body.innerHTML = `<div class="inset memo breakroom"><b>BREAK ROOM, LIVE</b>
    <p>${dead.length ? `Seated: ${dead.map((w) => esc(w.name)).join(", ")}.` : "Nobody is here. The coffee is warm."}</p>
    ${dead.length ? `<p class="dim">They have been there since ${dead.length > 1 ? "their days" : `Day ${dead[0].diedOnDay}`}. Someone left the coffee on.</p>` : ""}
    ${head}</div>`;
}

export function startInfestation(desk: HTMLElement, work: HTMLElement): void {
  // The stain: a damp patch in the corner of the desktop that spreads.
  const stain = document.createElement("div");
  stain.className = "stain";
  stain.setAttribute("aria-hidden", "true");
  work.appendChild(stain);

  let iconShown = false;
  const sync = (announce: boolean) => {
    const stage = infectionStage(game());
    stain.style.opacity = isCalm() || stage < 1 ? "0" : String(Math.min(0.55, 0.12 + stage * 0.11));
    stain.style.setProperty("--grow", String(0.6 + stage * 0.35));
    if (stage >= 2 && !iconShown) {
      iconShown = true;
      const btn = document.createElement("button");
      btn.className = "ic";
      btn.dataset.open = "breakroom";
      btn.innerHTML = `<img alt=""><span>Break Room</span>`;
      btn.querySelector("img")!.src = "./art/icons/U-vending.png";
      btn.addEventListener("click", () => openApp({ id: "breakroom", title: "Break Room.exe", w: 380, h: 240, render: breakRoom }));
      work.querySelector(".icons")!.appendChild(btn);
      if (announce) notify(desk, "./art/icons/U-vending.png", "Facilities", "Break Room.exe has been installed on your desktop. You did not request this. You are not able to uninstall it.");
    }
  };
  sync(false);
  onChange(() => sync(true));
  setInterval(() => sync(false), 2000); // calm mode can change at any time

  // Stage three: windows drift, and one you closed comes back.
  let lastClosed: { id: string; title: string; icon?: string } | null = null;
  let before = new Set<string>();
  onWindowsChanged(() => {
    const now = new Set(openWindows().filter((w) => !w.id.startsWith("dlg-")).map((w) => w.id));
    for (const id of before) if (!now.has(id)) lastClosed = { id, title: id };
    before = now;
  });
  const haunt = () => {
    const stage = infectionStage(game());
    if (!isCalm() && stage >= 3 && !document.hidden) {
      const wins = Array.from(desk.querySelectorAll<HTMLElement>(".win:not(.max):not(.dialog)"));
      const el = wins[Math.floor(Math.random() * wins.length)];
      if (el && Math.random() < 0.7) {
        const dx = Math.round(rand(-30, 30));
        const dy = Math.round(rand(-20, 20));
        el.style.left = `${Math.max(0, el.offsetLeft + dx)}px`;
        el.style.top = `${Math.max(0, el.offsetTop + dy)}px`;
      } else if (lastClosed) {
        const icon = desk.querySelector<HTMLElement>(`.ic[data-open="${lastClosed.id}"]`);
        lastClosed = null;
        icon?.click(); // it opens itself
      }
    }
    later(haunt, rand(40_000, 80_000) / Math.max(1, infectionStage(game()) - 2));
  };
  later(haunt, 30_000);
}
