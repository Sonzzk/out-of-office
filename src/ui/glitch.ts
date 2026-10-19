// Infection glitches in the desktop chrome, by stage. Stage 2 corrupts window
// titles, stage 3 adds colour fringing and a wrong clock, stage 4 tears the
// screen and swaps icon labels for your name. Calm mode switches all of it off.
import { isCalm } from "./audio";

let stage = 0;

export function setStage(n: number): void {
  stage = n;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);
const NOISE = "▒░#%&¤§¶Ø∆Σ";

export function startGlitch(desk: HTMLElement, bossName: () => string): void {
  const tick = () => {
    if (!isCalm() && stage >= 2 && !document.hidden) {
      const roll = Math.random();
      if (roll < 0.5) corruptTitle(desk);
      else if (roll < 0.75 && stage >= 3) fringe(desk);
      else if (roll < 0.9 && stage >= 3) wrongClock(desk);
      else if (stage >= 4) tear(desk);
      else corruptTitle(desk);
      if (stage >= 4 && Math.random() < 0.4) nameIcon(desk, bossName());
    }
    // Every 20 s at stage 2, every 6 s at stage 4.
    later(tick, rand(14_000, 26_000) / (1 + (stage - 2) * 0.9));
  };
  later(tick, 8_000);

  // Stage four: now and then something plainly wrong, long enough to be sure of.
  let lastWrong = Date.now() - 20_000;
  const wrong = () => {
    if (!isCalm() && stage >= 4 && !document.hidden && Date.now() - lastWrong > rand(25_000, 45_000)) {
      lastWrong = Date.now();
      if (Math.random() < 0.5) officeWall(desk, bossName());
      else typingWindow(desk, bossName());
    }
    later(wrong, 3_000);
  };
  later(wrong, 6_000);
}

/** The desktop is gone for a moment; there is only the office floor, and it is full. */
function officeWall(desk: HTMLElement, boss: string): void {
  const work = desk.querySelector<HTMLElement>(".work");
  if (!work || work.querySelector(".wrong-wall")) return;
  const wall = document.createElement("div");
  wall.className = "wrong-wall";
  wall.setAttribute("aria-hidden", "true");
  let html = `<div class="rows"></div>`;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) html += `<i class="desk" style="left:${c * 17 + 3}%;top:${r * 21 + 8}%"></i>`;
  wall.innerHTML = `${html}<b></b>`;
  wall.querySelector("b")!.textContent = `${boss.toUpperCase()}, YOU ARE HERE`;
  work.appendChild(wall);
  later(() => wall.remove(), rand(2200, 3000));
}

/** A window opens by itself and types a line nobody asked for. */
function typingWindow(desk: HTMLElement, boss: string): void {
  const work = desk.querySelector<HTMLElement>(".work");
  if (!work || work.querySelector(".wrong-win")) return;
  const win = document.createElement("div");
  win.className = "win active wrong-win";
  win.setAttribute("aria-hidden", "true");
  win.style.left = `${Math.round(rand(40, Math.max(60, work.clientWidth - 360)))}px`;
  win.style.top = `${Math.round(rand(30, Math.max(60, work.clientHeight - 200)))}px`;
  win.innerHTML = `<div class="tb"><span>Memo - Untitled</span></div><div class="txt"></div>`;
  work.appendChild(win);
  const txt = win.querySelector<HTMLElement>(".txt")!;
  const line = `${boss}. ${boss}. I am at my desk. I am at my desk. Please look up.`;
  let i = 0;
  const type = () => {
    txt.textContent = line.slice(0, ++i);
    if (i < line.length) later(type, 38);
    else later(() => win.remove(), 700);
  };
  type();
}

function corruptTitle(desk: HTMLElement): void {
  const titles = Array.from(desk.querySelectorAll<HTMLElement>(".win .tb span"));
  const el = titles[Math.floor(Math.random() * titles.length)];
  if (!el) return;
  const was = el.textContent ?? "";
  const bad = [...was].map((c) => (c !== " " && Math.random() < 0.45 ? NOISE[Math.floor(Math.random() * NOISE.length)] : c)).join("");
  el.textContent = bad;
  later(() => {
    if (el.textContent === bad) el.textContent = was;
  }, rand(250, 700));
}

function fringe(desk: HTMLElement): void {
  const wins = Array.from(desk.querySelectorAll<HTMLElement>(".win"));
  const el = wins[Math.floor(Math.random() * wins.length)];
  if (!el) return;
  el.classList.add("fringe");
  later(() => el.classList.remove("fringe"), rand(200, 500));
}

function wrongClock(desk: HTMLElement): void {
  const clock = desk.querySelector<HTMLElement>("[data-clock]");
  if (!clock) return;
  const was = clock.textContent;
  clock.textContent = "3:00 AM";
  later(() => {
    if (clock.textContent === "3:00 AM") clock.textContent = was;
  }, 2200);
}

/** A band of the screen slides sideways for a moment. */
function tear(desk: HTMLElement): void {
  const band = document.createElement("div");
  band.className = "tear";
  band.style.top = `${rand(5, 85)}%`;
  band.style.height = `${rand(3, 9)}%`;
  band.style.setProperty("--shift", `${rand(-24, 24)}px`);
  desk.appendChild(band);
  later(() => band.remove(), rand(120, 300));
}

function nameIcon(desk: HTMLElement, boss: string): void {
  const labels = Array.from(desk.querySelectorAll<HTMLElement>(".ic span"));
  const el = labels[Math.floor(Math.random() * labels.length)];
  if (!el) return;
  const was = el.textContent ?? "";
  el.textContent = boss;
  later(() => {
    if (el.textContent === boss) el.textContent = was;
  }, rand(900, 1800));
}
