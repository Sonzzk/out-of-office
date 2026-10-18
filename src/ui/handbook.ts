import { CREDITS } from "../data/credits";
import { clearSave, exportSave, parseSave, saveGame } from "../save";
import { isPrivate, isStreamer, setPrivacy, setStreamer } from "../privacy";
import { game, update } from "../store";
import { esc } from "./dom";
import { getVolume, isCalm, setCalm, setVolume } from "./audio";
import { refreshCalm } from "./uncanny";
import { dialog } from "./windows";

// The Employee Handbook: sound, privacy, your save file and the credits.
export function renderHandbook(body: HTMLElement): void {
  body.classList.add("handbook");
  const paint = () => {
    body.innerHTML = `
      <p class="dim">Employee Handbook. Nothing here ever leaves this browser.</p>
      <h4>1. Sound</h4>
      <label class="row"><span>Volume</span><input type="range" min="0" max="100" value="${Math.round(getVolume() * 100)}" data-vol aria-label="Volume"></label>
      <label class="opt inset"><input type="checkbox" data-opt="calm" ${isCalm() ? "checked" : ""}>
        <span><b>Calm mode</b><br><span class="dim">Keeps the sound and the glitches at their gentlest.</span></span></label>
      <h4>2. Your privacy</h4>
      <label class="opt inset"><input type="checkbox" data-opt="privacy" ${isPrivate() ? "checked" : ""} ${isStreamer() ? "disabled" : ""}>
        <span><b>Employee privacy</b><br><span class="dim">On: the office knows nothing about the real world. Off: it may notice your local time and how long you have been at your desk.</span></span></label>
      <label class="opt inset"><input type="checkbox" data-opt="streamer" ${isStreamer() ? "checked" : ""}>
        <span><b>Streamer mode</b><br><span class="dim">Hides the name you signed with, keeps privacy on and tones the scares down.</span></span></label>
      <h4>3. Your file</h4>
      <div class="row"><button class="btn" data-export>Save to file</button><button class="btn" data-import>Load from file</button><button class="btn" data-reset>Start over</button></div>
      <input type="file" accept="application/json,.json" data-file hidden>
      <h4>4. Credits</h4>
      ${CREDITS.map((c) => `<div class="credit"><b>${esc(c.head)}</b>${c.lines.map((l) => `<p class="dim">${esc(l)}</p>`).join("")}</div>`).join("")}`;
  };

  body.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.vol !== undefined) setVolume(Number(t.value) / 100);
  });
  body.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.opt === "calm") {
      setCalm(t.checked);
      refreshCalm();
    }
    if (t.dataset.opt === "privacy") setPrivacy(t.checked);
    if (t.dataset.opt === "streamer") {
      setStreamer(t.checked);
      refreshCalm();
    }
    if (t.dataset.file !== undefined && t.files?.[0]) void importFile(t.files[0]);
    if (t.dataset.opt) {
      paint();
      update(() => {}); // repaint every window that shows the name
    }
  });
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-export]")) download();
    if (t.closest("[data-import]")) body.querySelector<HTMLInputElement>("[data-file]")!.click();
    if (t.closest("[data-reset]")) void reset();
  });
  paint();
}

function download(): void {
  const blob = new Blob([exportSave(game())], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `out-of-office-day-${game().day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importFile(file: File): Promise<void> {
  const loaded = parseSave(await file.text());
  if (!loaded) {
    await dialog("Employee Handbook", "That file is not one of ours. Nothing was changed.");
    return;
  }
  const answer = await dialog("Employee Handbook", `Replace your current office with Day ${loaded.day} of ${loaded.company}?`, ["Replace", "Cancel"]);
  if (answer !== "Replace") return;
  saveGame(loaded);
  location.href = location.pathname; // reload with the new save
}

async function reset(): Promise<void> {
  const answer = await dialog("Employee Handbook", "Start over with a new office? Your current save is deleted. Save to file first if you want to keep it.", ["Start over", "Cancel"]);
  if (answer !== "Start over") return;
  clearSave();
  location.href = location.pathname;
}
