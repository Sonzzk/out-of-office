import "./style.css";
import { loadGame, saveGame } from "./save";
import { newGame } from "./sim/state";
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
  mountDesktop(desk, state);
});
