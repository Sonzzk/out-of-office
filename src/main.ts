import { awayReport } from "./sim/away";
import { newGoal } from "./sim/goals";
import "./style.css";
import "./ui/loop.css";
import { loadGame, loadProblem, saveGame, setAsideSave, watchOtherTab } from "./save";
import { access, applyAccess, shouldStep } from "./access";
import { isPaused, startPause } from "./ui/pause";
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
applyAccess();
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
  startPause(document.body);
  if (loadProblem) void setAsideNotice(loadProblem);
  // Two tabs on one save overwrite each other, so say so once.
  watchOtherTab(() => {
    void dialog("HR", "This office is open in another tab. Both tabs save to the same file, so the last one to save wins. Close one of them.");
  });
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
const waited = new Map<number, number>(); // tries spent waiting on the office, per run (relaxed timers)
setInterval(() => {
  if (!ready || isPaused()) return;
  const running = state.expeditions.filter((e) => e.phase !== "done");
  if (!running.length) return;
  const mode = access().relaxed;
  const due = running.filter((e) => {
    const waiting = !!(e.call || e.threat);
    const n = waited.get(e.id) ?? 0;
    waited.set(e.id, waiting ? n + 1 : 0);
    return shouldStep(waiting, mode, n);
  });
  if (!due.length) return;
  updateTick((s) => due.forEach((e) => stepExpedition(s, e)));
  if (running.some((e) => e.phase === "done")) update(() => {});
}, TICK_MS);

/** The saved office could not be used. Say where the old one went and let the player take it out. */
async function setAsideNotice(problem: "unreadable" | "newer"): Promise<void> {
  const why = problem === "newer" ? "is from a newer version of this game" : "could not be read";
  const answer = await dialog(
    "HR",
    `Your saved office ${why}, so a fresh one was started. The old one was set aside and is still in this browser. Export it now if you want to keep it.`,
    ["Export old save", "OK"],
  );
  const raw = setAsideSave();
  if (answer !== "Export old save" || !raw) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  a.download = "out-of-office-set-aside.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// If something throws, say so once instead of leaving a silently frozen desktop.
let reported = false;
addEventListener("error", () => {
  if (reported || !document.getElementById("desk")?.querySelector(".win")) return;
  reported = true;
  void dialog("Out of Office", "Something went wrong. Your progress is saved. If the desk looks stuck, reload the page.");
});
