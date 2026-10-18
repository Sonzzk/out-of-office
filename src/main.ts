import "./style.css";
import { loadGame, saveGame } from "./save";
import { newGame } from "./sim/state";
import { mountDesktop } from "./ui/desktop";

const params = new URLSearchParams(location.search);
const forcedSeed = params.get("seed");
const state =
  (!forcedSeed && loadGame()) || newGame(forcedSeed ? Number(forcedSeed) : Math.floor(Math.random() * 2 ** 31));
saveGame(state);
mountDesktop(document.getElementById("desk")!, state);
