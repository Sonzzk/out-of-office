import { advanceTutorial, skipTutorial, TUTORIAL, tutorialActive } from "../sim/tutorial";
import { game, onChange, update } from "../store";
import { esc } from "./dom";

// Employee Orientation: a small card in the corner that names the next thing
// to do and makes that desktop icon pulse. It never blocks anything.
export function startTutorial(desk: HTMLElement): void {
  const card = document.createElement("div");
  card.className = "tutorial inset";
  card.hidden = true;
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  desk.appendChild(card);

  card.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-skip]")) update((s) => skipTutorial(s));
  });

  // The card is docked above the taskbar; the work area gives up its height while it shows.
  const setDock = (hide: boolean) => {
    if (card.hidden === hide) return;
    card.hidden = hide;
    desk.style.setProperty("--tut", hide ? "0px" : "var(--tut-h)");
    window.dispatchEvent(new Event("resize")); // windows refit to the room that is left
  };

  let shown = -1;
  const paint = () => {
    const s = game();
    desk.querySelectorAll(".tut-hint").forEach((el) => el.classList.remove("tut-hint"));
    if (!tutorialActive(s)) {
      setDock(true);
      return;
    }
    const step = TUTORIAL[s.tutorial];
    setDock(false);
    desk.querySelector(`[data-open="${step.icon}"]`)?.classList.add("tut-hint");
    if (shown === s.tutorial) return;
    shown = s.tutorial;
    card.innerHTML = `<b>Orientation ${s.tutorial + 1}/${TUTORIAL.length}</b>
      <span class="ttl">${esc(step.title)}</span>
      <span class="dim" title="${esc(step.text)}">${esc(step.text)}</span>
      <button class="btn" data-skip>Skip orientation</button>`;
    card.title = step.text;
  };

  // The state may already be ahead of the first step when the desktop opens.
  if (advanceTutorial(game())) update(() => {});
  paint();
  onChange(() => {
    if (tutorialActive(game()) && advanceTutorial(game())) update(() => {});
    paint();
  });
}
