import { CREDITS } from "../data/credits";
import { VERSION } from "../version";
import { clearSave, exportSave, parseSave, saveGame } from "../save";
import { isPrivate, isStreamer, setPrivacy, setStreamer } from "../privacy";
import { game, update } from "../store";
import { esc } from "./dom";
import { getVolume, isCalm, setCalm, setVolume } from "./audio";
import { refreshCalm } from "./uncanny";
import { access, SCALES, setAccess, type Relaxed } from "../access";
import { togglePause } from "./pause";
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
      ${accessibilitySection()}
      <h4>2. Your privacy</h4>
      <label class="opt inset"><input type="checkbox" data-opt="privacy" ${isPrivate() ? "checked" : ""} ${isStreamer() ? "disabled" : ""}>
        <span><b>Employee privacy</b><br><span class="dim">On: the office knows nothing about the real world. Off: it may notice your local time and how long you have been at your desk.</span></span></label>
      <label class="opt inset"><input type="checkbox" data-opt="streamer" ${isStreamer() ? "checked" : ""}>
        <span><b>Streamer mode</b><br><span class="dim">Hides the name you signed with, keeps privacy on and tones the scares down.</span></span></label>
      <h4>3. Your file</h4>
      <div class="row"><button class="btn" data-export>Save to file</button><button class="btn" data-import>Load from file</button><button class="btn" data-reset>Start over</button></div>
      <input type="file" accept="application/json,.json" data-file hidden>
      <h4>4. Credits</h4>
      ${CREDITS.map((c) => `<div class="credit"><b>${esc(c.head)}</b>${c.lines.map((l) => `<p class="dim">${esc(l)}</p>`).join("")}</div>`).join("")}
      <p class="dim">Out of Office ${esc(VERSION)}</p>`;
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
  bindAccessibility(body);
  paint();
}

// Accessibility: text size, contrast, motion, and how long the office has to answer.
// TODO(audio): separate SFX and hum sliders need a second gain node in
// src/ui/audio.ts (it only has a master volume and a mute today).
function accessibilitySection(): string {
  const a = access();
  const opt = (name: string, on: boolean, title: string, text: string) =>
    `<label class="opt inset"><input type="checkbox" data-acc="${name}" ${on ? "checked" : ""}><span><b>${title}</b><br><span class="dim">${text}</span></span></label>`;
  return `<h4>Accessibility</h4>
      <label class="row"><span>Interface size</span><select data-acc="scale" aria-label="Interface size">${SCALES.map((n) => `<option value="${n}" ${a.scale === n ? "selected" : ""}>${n}%</option>`).join("")}</select></label>
      ${opt("contrast", a.contrast, "High contrast", "Black text on white, hard edges, no texture.")}
      ${opt("reduceMotion", a.reduceMotion, "Reduce motion and flicker", "No flicker, tearing, ghosts or blinking. Starts on if your system asks for less motion.")}
      <label class="row"><span>Relaxed timers</span><select data-acc="relaxed" aria-label="Relaxed timers">
        <option value="off" ${a.relaxed === "off" ? "selected" : ""}>Off</option>
        <option value="x3" ${a.relaxed === "x3" ? "selected" : ""}>Three times as long</option>
        <option value="wait" ${a.relaxed === "wait" ? "selected" : ""}>Wait for my answer</option></select></label>
      <span class="dim">Calls and contacts on a run wait this long. With "wait", the crew holds until you answer.</span>
      ${opt("pauseHidden", a.pauseHidden, "Pause when this tab is hidden", "Runs hold still while you are on another tab. The P key pauses and resumes any time.")}
      <div class="row"><button class="btn" data-acc-pause>Pause or resume runs</button></div>`;
}

function bindAccessibility(body: HTMLElement): void {
  body.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const k = t.dataset.acc;
    if (!k) return;
    if (k === "scale") setAccess({ scale: Number(t.value) });
    else if (k === "relaxed") setAccess({ relaxed: t.value as Relaxed });
    else setAccess({ [k]: (t as HTMLInputElement).checked });
  });
  body.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-acc-pause]")) togglePause();
  });
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
