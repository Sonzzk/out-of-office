import "./style.css";
import "./ui/loop.css";
import { loadGame, saveGame } from "./save";
import { stepExpedition } from "./sim/expedition";
import { newGame } from "./sim/state";
import { initStore, update, updateTick } from "./store";
import { mountDesktop } from "./ui/desktop";

const params = new URLSearchParams(location.search);
const forcedSeed = params.get("seed");
const state =
  (!forcedSeed && loadGame()) || newGame(forcedSeed ? Number(forcedSeed) : Math.floor(Math.random() * 2 ** 31));
saveGame(state);
initStore(state);
mountDesktop(document.getElementById("desk")!, state);

// Expeditions keep running whatever window is open. ?fast speeds them up for
// play-tests.
const TICK_MS = params.has("fast") ? 40 : 550;
setInterval(() => {
  const running = state.expeditions.filter((e) => e.phase !== "done");
  if (!running.length) return;
  updateTick((s) => running.forEach((e) => stepExpedition(s, e)));
  if (running.some((e) => e.phase === "done")) update(() => {});
}, TICK_MS);
