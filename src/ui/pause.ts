import { access } from "../access";

// Pausing: runs hold still while the tab is hidden (if the setting is on) or
// when the player asks. A banner says so, so a held run is never a mystery.
let manual = false;
let bar: HTMLElement | null = null;
const listeners: (() => void)[] = [];

export const isPaused = (): boolean => manual || (access().pauseHidden && document.hidden);
export const isManualPause = (): boolean => manual;
export const onPauseChange = (fn: () => void): void => void listeners.push(fn);

export function setPaused(on: boolean): void {
  manual = on;
  paint();
}
export const togglePause = (): void => setPaused(!manual);

function paint(): void {
  if (!bar) return;
  const p = isPaused();
  bar.hidden = !p;
  bar.querySelector("span")!.textContent = manual ? "Paused. The crews hold still." : "Paused while this tab is hidden.";
  bar.querySelector("button")!.hidden = !manual;
  listeners.forEach((fn) => fn());
}

export function startPause(parent: HTMLElement): void {
  bar = document.createElement("div");
  bar.className = "pausebar";
  bar.setAttribute("role", "status");
  bar.hidden = true;
  bar.innerHTML = `<b>PAUSED</b> <span></span> <button class="btn" data-resume>Resume</button>`;
  bar.querySelector("button")!.addEventListener("click", () => setPaused(false));
  parent.appendChild(bar);
  document.addEventListener("visibilitychange", paint);
  paint();
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.key.toLowerCase() !== "p" || e.ctrlKey || e.metaKey || e.altKey || t.matches?.("input, textarea, select")) return;
    togglePause();
  });
}
