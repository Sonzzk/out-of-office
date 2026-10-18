import "./style.css";
import "./ui/loop.css";
import { loadGame, saveGame } from "./save";
import { stepExpedition } from "./sim/expedition";
import { newGame } from "./sim/state";
import { TITLE_AWAY } from "./data/infection";
import { uneaseFor } from "./sim/infection";
import { fill } from "./sim/state";
import { initStore, onChange, update, updateTick } from "./store";
import { boot } from "./ui/boot";
import { mountDesktop } from "./ui/desktop";
import { setUnease } from "./ui/uncanny";

// URL switches for testing: ?seed=7 starts a fresh game, ?fast skips the
// boot delays, ?unease=0.8 previews how the desktop feels when infected.
const params = new URLSearchParams(location.search);
const forcedSeed = params.get("seed");
const state =
  (!forcedSeed && loadGame()) || newGame(forcedSeed ? Number(forcedSeed) : Math.floor(Math.random() * 2 ** 31));
const forcedUnease = params.has("unease") ? Number(params.get("unease")) : null;
setUnease(forcedUnease ?? uneaseFor(state));

const desk = document.getElementById("desk")!;
void boot(document.body, state, params.has("fast")).then(() => {
  saveGame(state);
  initStore(state);
  mountDesktop(desk, state);
  // The desktop gets worse as the infection grows.
  if (forcedUnease === null) onChange(() => setUnease(uneaseFor(state)));
});

// Fourth wall: an infected office calls you back when you switch tabs.
let awayCount = 0;
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) document.title = "Out of Office";
  else if (state.infection >= 30 || (forcedUnease ?? 0) >= 0.5)
    document.title = fill(TITLE_AWAY[awayCount++ % TITLE_AWAY.length], { boss: state.bossName });
});

// Expeditions keep running whatever window is open. ?fast speeds them up for
// play-tests.
const TICK_MS = params.has("fast") ? 40 : 550;
setInterval(() => {
  const running = state.expeditions.filter((e) => e.phase !== "done");
  if (!running.length) return;
  updateTick((s) => running.forEach((e) => stepExpedition(s, e)));
  if (running.some((e) => e.phase === "done")) update(() => {});
}, TICK_MS);
