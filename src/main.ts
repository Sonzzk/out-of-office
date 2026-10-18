import { awayReport } from "./sim/away";
import { newGoal } from "./sim/goals";
import "./style.css";
import "./ui/loop.css";
import { loadGame, loadProblem, saveGame } from "./save";
import { stepExpedition } from "./sim/expedition";
import { newGame, TUTORIAL_DONE } from "./sim/state";
import { TITLE_AWAY } from "./data/infection";
import { infectionStage, uneaseFor } from "./sim/infection";
import { fill } from "./sim/state";
import { isStreamer, shownName } from "./privacy";
import { initStore, onChange, update, updateTick } from "./store";
import { boot } from "./ui/boot";
import { mountDesktop } from "./ui/desktop";
import { dialog } from "./ui/windows";
import { setStage } from "./ui/glitch";
import { setUnease } from "./ui/uncanny";

// URL switches for testing: ?seed=7 starts a fresh game, ?fast skips the
// boot delays, ?unease=0.8 previews how the desktop feels when infected.
const params = new URLSearchParams(location.search);
const forcedSeed = params.get("seed");
const state =
  (!forcedSeed && loadGame()) || newGame(forcedSeed ? Number(forcedSeed) : Math.floor(Math.random() * 2 ** 31));
const forcedUnease = params.has("unease") ? Number(params.get("unease")) : null;
const forcedStage = params.has("stage") ? Number(params.get("stage")) : null;
setUnease(forcedUnease ?? uneaseFor(state));
setStage(forcedStage ?? infectionStage(state));

const desk = document.getElementById("desk")!;
let ready = false; // runs only advance once the desktop is up and the store has the game
void boot(document.body, state, params.has("fast")).then(() => {
  if (!state.goal && state.tutorial >= TUTORIAL_DONE) state.goal = newGoal(state);
  awayReport(state, Date.now());
  state.lastSeen = Date.now();
  saveGame(state);
  initStore(state);
  ready = true;
  mountDesktop(desk, state);
  if (loadProblem) {
    void dialog(
      "HR",
      loadProblem === "newer"
        ? "Your saved office is from a newer version of this game, so a fresh one was started. The old one is kept safe in this browser."
        : "Your saved office could not be read, so a fresh one was started. The old one is kept safe in this browser.",
    );
  }
  // The desktop gets worse as the infection grows.
  if (forcedUnease === null) onChange(() => setUnease(uneaseFor(state)));
  if (forcedStage === null) onChange(() => setStage(infectionStage(state)));
});

// Remember when the page was last open, for the away report.
setInterval(() => {
  if (!ready) return;
  state.lastSeen = Date.now();
  saveGame(state);
}, 15000);

// Fourth wall: an infected office calls you back when you switch tabs.
let awayCount = 0;
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) document.title = "Out of Office";
  else if (state.infection >= 30 || (forcedUnease ?? 0) >= 0.5)
    // On stream the tab never shows your name.
    document.title = isStreamer() ? "Out of Office (1)" : fill(TITLE_AWAY[awayCount++ % TITLE_AWAY.length], { boss: shownName(state.bossName) });
});

// Expeditions keep running whatever window is open. ?fast speeds them up for
// play-tests.
const TICK_MS = params.has("fast") ? 40 : 550;
setInterval(() => {
  if (!ready) return;
  const running = state.expeditions.filter((e) => e.phase !== "done");
  if (!running.length) return;
  updateTick((s) => running.forEach((e) => stepExpedition(s, e)));
  if (running.some((e) => e.phase === "done")) update(() => {});
}, TICK_MS);

// If something throws, say so once instead of leaving a silently frozen desktop.
let reported = false;
addEventListener("error", () => {
  if (reported || !document.getElementById("desk")?.querySelector(".win")) return;
  reported = true;
  void dialog("Out of Office", "Something went wrong. Your progress is saved. If the desk looks stuck, reload the page.");
});
