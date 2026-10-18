// The things that make the desktop feel wrong. All of them scale with
// `unease` (0..1): calm at the start, louder as the office infection grows.
// Stage 6 ramps infection; for now it is the save's infection plus a floor.
import { humFlicker, isCalm, setAudioUnease, sfx } from "./audio";

let raw = 0.15;
let unease = 0.15;

// Calm mode holds the desktop effects near their gentlest.
function apply(): void {
  unease = isCalm() ? Math.min(raw, 0.12) : raw;
}

export function setUnease(v: number): void {
  raw = Math.max(0, Math.min(1, v));
  apply();
  setAudioUnease(raw);
}

export function refreshCalm(): void {
  apply();
  setAudioUnease(raw);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

export function startUncanny(desk: HTMLElement, work: HTMLElement): void {
  flicker(desk);
  ghostCursor(desk, work);
  drift(work);
  lookAway(desk);
}

/** Fluorescent tubes: random stutters, now and then a near blackout. */
function flicker(desk: HTMLElement): void {
  const veil = document.createElement("div");
  veil.className = "veil";
  desk.appendChild(veil);
  const stutter = () => {
    const hits = 1 + Math.floor(Math.random() * (2 + unease * 4));
    let t = 0;
    for (let i = 0; i < hits; i++) {
      const dark = rand(0.15, 0.35 + unease * 0.5);
      const len = rand(30, 90);
      later(() => {
        veil.style.opacity = String(dark);
        humFlicker(len);
      }, t);
      later(() => (veil.style.opacity = "0"), t + len);
      t += len + rand(40, 160);
    }
    // Calm: every 20 to 45 s. Infected: every few seconds.
    later(stutter, rand(20_000, 45_000) * (1 - unease * 0.85));
  };
  later(stutter, rand(6_000, 12_000));
}

/** A second cursor that isn't yours. It wanders toward an icon and is gone. */
function ghostCursor(desk: HTMLElement, work: HTMLElement): void {
  const ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.innerHTML = `<svg width="12" height="19" viewBox="0 0 12 19"><path d="M0 0v16l4-4 3 7 2-1-3-7h6z" fill="#fff" stroke="#000"/></svg>`;
  desk.appendChild(ghost);
  let mx = innerWidth / 2;
  let my = innerHeight / 2;
  addEventListener("pointermove", (e) => {
    mx = e.clientX;
    my = e.clientY;
  });

  const visit = () => {
    const icons = Array.from(work.querySelectorAll<HTMLElement>(".ic"));
    const target = icons[Math.floor(Math.random() * icons.length)];
    if (target && !document.hidden) {
      const r = target.getBoundingClientRect();
      // Start where your cursor is, as if it came loose from it.
      ghost.style.transition = "none";
      ghost.style.transform = `translate(${mx}px, ${my}px)`;
      ghost.style.opacity = String(0.25 + unease * 0.5);
      later(() => {
        ghost.style.transition = `transform ${rand(2.2, 3.5)}s cubic-bezier(.4,0,.3,1), opacity 1.2s`;
        ghost.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + 18}px)`;
      }, 60);
      later(() => target.classList.add("ghost-hover"), 3200);
      later(() => {
        target.classList.remove("ghost-hover");
        ghost.style.opacity = "0";
      }, 4800);
    }
    later(visit, rand(70_000, 140_000) * (1 - unease * 0.7));
  };
  later(visit, rand(35_000, 60_000));
}

/** Desktop icons slowly slide out of their grid, a pixel or two at a time. */
function drift(work: HTMLElement): void {
  const step = () => {
    const icons = Array.from(work.querySelectorAll<HTMLElement>(".ic"));
    const ic = icons[Math.floor(Math.random() * icons.length)];
    if (ic) {
      const dx = Number(ic.dataset.dx ?? 0) + Math.round(rand(-1, 2));
      const dy = Number(ic.dataset.dy ?? 0) + Math.round(rand(-1, 1));
      const cap = 3 + unease * 14;
      ic.dataset.dx = String(Math.max(-cap, Math.min(cap, dx)));
      ic.dataset.dy = String(Math.max(-cap, Math.min(cap, dy)));
      ic.style.translate = `${ic.dataset.dx}px ${ic.dataset.dy}px`;
    }
    later(step, rand(8_000, 20_000) * (1 - unease * 0.6));
  };
  later(step, 5_000);
}

// Things that change while you aren't looking. Each fires once, in order.
const SWAPS: [selector: string, text: string][] = [
  ['[data-open="lab"] span', "Lab (2)"],
  [".start", "Stay"],
  ['[data-open="inbox"] span', "Memo Inbox (you)"],
  ['[data-open="map"] span', "Facility Map"], // the same word, a different font weight
];

/** When the tab is hidden or the window loses focus, something changes. */
function lookAway(desk: HTMLElement): void {
  let next = 0;
  let away = 0;
  const leave = () => (away = Date.now());
  const back = () => {
    if (!away || Date.now() - away < 1500) return;
    away = 0;
    const swap = SWAPS[next];
    if (!swap) return;
    const el = desk.querySelector<HTMLElement>(swap[0]);
    if (!el) return;
    next++;
    el.textContent = swap[1];
    if (next === SWAPS.length) el.style.fontWeight = "bold";
  };
  document.addEventListener("visibilitychange", () => (document.hidden ? leave() : back()));
  addEventListener("blur", leave);
  addEventListener("focus", back);
}

/** A Win95 balloon in the corner of the desktop. */
export function notify(desk: HTMLElement, icon: string, title: string, text: string, ms = 9000): void {
  const n = document.createElement("div");
  n.className = "toast";
  n.innerHTML = `<img alt=""><div><b></b><p></p></div>`;
  n.querySelector("img")!.src = icon;
  n.querySelector("b")!.textContent = title;
  n.querySelector("p")!.textContent = text;
  n.addEventListener("click", () => n.remove());
  desk.appendChild(n);
  sfx("memo");
  later(() => n.classList.add("out"), ms);
  later(() => n.remove(), ms + 600);
}
