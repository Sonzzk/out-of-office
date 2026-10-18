import { advanceTutorial, skipTutorial, TUTORIAL, tutorialActive } from "../sim/tutorial";
import { game, onChange, update } from "../store";
import { esc } from "./dom";

// Employee Orientation: a small card in the corner that names the next thing
// to do and makes that desktop icon pulse. It never blocks anything.
export function startTutorial(desk: HTMLElement): void {
  const card = document.createElement("div");
  card.className = "tutorial inset";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  desk.appendChild(card);

  card.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-skip]")) update((s) => skipTutorial(s));
  });

  let shown = -1;
  const paint = () => {
    const s = game();
    desk.querySelectorAll(".tut-hint").forEach((el) => el.classList.remove("tut-hint"));
    if (!tutorialActive(s)) {
      card.hidden = true;
      return;
    }
    const step = TUTORIAL[s.tutorial];
    card.hidden = false;
    desk.querySelector(`[data-open="${step.icon}"]`)?.classList.add("tut-hint");
    if (shown === s.tutorial) return;
    shown = s.tutorial;
    card.innerHTML = `<b>Employee Orientation ${s.tutorial + 1}/${TUTORIAL.length}</b>
      <div class="ttl">${esc(step.title)}</div>
      <div class="dim">${esc(step.text)}</div>
      <button class="btn" data-skip>Skip orientation</button>`;
  };

  // The state may already be ahead of the first step when the desktop opens.
  if (advanceTutorial(game())) update(() => {});
  paint();
  onChange(() => {
    if (tutorialActive(game()) && advanceTutorial(game())) update(() => {});
    paint();
  });
}
