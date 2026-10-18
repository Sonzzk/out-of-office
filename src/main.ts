import "./style.css";
import "./ui/loop.css";
import { loadGame, saveGame } from "./save";
import { stepExpedition } from "./sim/expedition";
import { newGame } from "./sim/state";
import { initStore, update, updateTick } from "./store";
import { boot } from "./ui/boot";
import { mountDesktop } from "./ui/desktop";
import { setUnease } from "./ui/uncanny";

// URL switches for testing: ?seed=7 starts a fresh game, ?fast skips the
// boot delays, ?unease=0.8 previews how the desktop feels when infected.
const params = new URLSearchParams(location.search);
const forcedSeed = params.get("seed");
const state =
  (!forcedSeed && loadGame()) || newGame(forcedSeed ? Number(forcedSeed) : Math.floor(Math.random() * 2 ** 31));
setUnease(params.has("unease") ? Number(params.get("unease")) : 0.15 + state.infection / 100);

const desk = document.getElementById("desk")!;
void boot(document.body, state, params.has("fast")).then(() => {
  saveGame(state);
  initStore(state);
  mountDesktop(desk, state);
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
