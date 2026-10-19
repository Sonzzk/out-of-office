import { CREDITS } from "../data/credits";
import { VERSION } from "../version";
import { backupActive, clearSave, exportSave, parseSave, restore, saveGame, saveToSlot, SLOT_COUNT, slotInfo, type SaveSource } from "../save";
import { isPrivate, isStreamer, setPrivacy, setStreamer } from "../privacy";
import { game, update } from "../store";
import { esc } from "./dom";
import { getVolume, isCalm, setCalm, setVolume } from "./audio";
import { renderGuide } from "./guide";
import { refreshCalm } from "./uncanny";
import { access, SCALES, setAccess, type Relaxed } from "../access";
import { togglePause } from "./pause";
import { dialog } from "./windows";
import { apps } from "./apps";

// The Employee Handbook: sound, privacy, your save file and the credits.
export function renderHandbook(body: HTMLElement): void {
  body.classList.add("handbook");
  const pane = tabs(body);
  const paint = () => {
    pane.innerHTML = `
      <p class="dim">Employee Handbook. Nothing here ever leaves this browser.</p>
      <h4>1. Sound</h4>
      <label class="row"><span>Volume</span><input type="range" min="0" max="100" value="${Math.round(getVolume() * 100)}" data-vol aria-label="Volume"></label>
      <label class="opt inset"><input type="checkbox" data-opt="calm" ${isCalm() ? "checked" : ""}>
        <span><b>Calm mode</b><br><span class="dim">Keeps the sound and the glitches at their gentlest.</span></span></label>
      ${accessibilitySection()}
      <h4>2. Your privacy</h4>
      <label class="opt inset"><input type="checkbox" data-opt="privacy" ${isPrivate() ? "checked" : ""} ${isStreamer() ? "disabled" : ""}>
        <span><b>Employee privacy</b><br><span class="dim">On: the office knows nothing about the real world. Off: it may notice your local time and how long you have been at your desk.</span>${isStreamer() ? `<br><span class="dim privacy-note">Locked on while Streamer mode is on. Turn Streamer mode off to change it.</span>` : ""}</span></label>
      <label class="opt inset"><input type="checkbox" data-opt="streamer" ${isStreamer() ? "checked" : ""}>
        <span><b>Streamer mode</b><br><span class="dim">Hides the name you signed with, keeps privacy on and tones the scares down.</span></span></label>
      <h4>3. Your file</h4>
      <div class="row"><button class="btn" data-export>Save to file</button><button class="btn" data-import>Load from file</button><button class="btn" data-reset>Start over</button></div>
      <input type="file" accept="application/json,.json" data-file hidden>
      <h4>4. Save slots</h4>
      ${slotsSection()}
      <h4>5. Hotkeys</h4>
      ${hotkeysSection()}
      <h4>6. Credits</h4>
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
    const slot = t.closest<HTMLElement>("[data-slot-save]");
    if (slot) void saveSlot(Number(slot.dataset.slotSave)).then(paint);
    const load = t.closest<HTMLElement>("[data-slot-load]");
    if (load) void loadSource(load.dataset.slotLoad!);
  });
  bindAccessibility(body);
  paint();
}

// Guide and Settings are two tabs of one window. Start > Help opens the Guide.
let showTab: ((tab: "guide" | "settings") => void) | null = null;
let tabHost: HTMLElement | null = null;
let wantGuide = false;
export function openGuideTab(): void {
  if (tabHost?.isConnected) showTab?.("guide"); // the window is open already
  else wantGuide = true; // it is about to open
}

// Returns the element the settings page paints into.
function tabs(body: HTMLElement): HTMLElement {
  body.innerHTML = `<div class="hb-tabs" role="tablist"><button class="tab" role="tab" data-hbtab="guide">Guide</button><button class="tab" role="tab" data-hbtab="settings">Settings</button></div>
    <div class="hb-pane" data-pane="guide" hidden></div><div class="hb-pane" data-pane="settings"></div>`;
  const guide = body.querySelector<HTMLElement>('[data-pane="guide"]')!;
  const settings = body.querySelector<HTMLElement>('[data-pane="settings"]')!;
  renderGuide(guide);
  const show = (tab: "guide" | "settings") => {
    guide.hidden = tab !== "guide";
    settings.hidden = tab !== "settings";
    body.querySelectorAll<HTMLElement>("[data-hbtab]").forEach((b) => {
      b.classList.toggle("on", b.dataset.hbtab === tab);
      b.setAttribute("aria-selected", String(b.dataset.hbtab === tab));
    });
  };
  body.querySelector(".hb-tabs")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-hbtab]");
    if (b) show(b.dataset.hbtab as "guide" | "settings");
  });
  showTab = show;
  tabHost = body;
  show(wantGuide ? "guide" : "settings");
  wantGuide = false;
  return settings;
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

function slotsSection(): string {
  const row = (label: string, src: SaveSource, canSave: boolean) => {
    const i = slotInfo(src);
    const what = i.empty ? "Empty" : `Day ${i.day}, ${esc(i.company ?? "")}`;
    return `<div class="row"><span><b>${label}</b> <span class="dim">${what}</span></span><span>${canSave ? `<button class="btn" data-slot-save="${src}">Save here</button> ` : ""}<button class="btn" data-slot-load="${src}" ${i.empty ? "disabled" : ""}>Load</button></span></div>`;
  };
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => row(`Slot ${i + 1}`, i + 1, true)).join("");
  return `<span class="dim">Your office saves itself as you play. Slots are copies you keep. Loading one sets the current office aside first.</span>
      ${slots}${row("Previous day", "prevday", false)}${row("Before last load", "undo", false)}`;
}

function hotkeysSection(): string {
  const keys = apps(game()).map((a, i) => `<li><kbd>${i + 1}</kbd> ${esc(a.title)}</li>`).join("");
  return `<ul class="dim hotkeys">${keys}<li><kbd>P</kbd> Pause or resume runs</li><li><kbd>Esc</kbd> Close the top window or the Start menu</li></ul>
      <span class="dim">Number keys do nothing while you are typing or a dialog is open.</span>`;
}

async function saveSlot(n: number): Promise<void> {
  if (!slotInfo(n).empty) {
    const a = await dialog("Employee Handbook", `Slot ${n} already holds an office. Overwrite it with Day ${game().day} of ${game().company}?`, ["Overwrite", "Cancel"]);
    if (a !== "Overwrite") return;
  }
  const ok = saveToSlot(n, game());
  if (!ok) await dialog("Employee Handbook", "The browser would not store that. Save to file instead.");
}

async function loadSource(raw: string): Promise<void> {
  const src: SaveSource = raw === "prevday" || raw === "undo" ? raw : Number(raw);
  const i = slotInfo(src);
  if (i.empty) return;
  const a = await dialog("Employee Handbook", `Load Day ${i.day} of ${i.company}? Your current office is kept under "Before last load".`, ["Load", "Cancel"]);
  if (a !== "Load") return;
  saveGame(game()); // so the set-aside copy is the office as it stands now
  if (!restore(src)) {
    await dialog("Employee Handbook", "That save could not be read. Nothing was changed.");
    return;
  }
  location.href = location.pathname;
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
  backupActive(); // the office you replace stays under "Before last load"
  saveGame(loaded);
  location.href = location.pathname; // reload with the new save
}

async function reset(): Promise<void> {
  const answer = await dialog("Employee Handbook", "Start over with a new office? Your current save is deleted. Save to file first if you want to keep it.", ["Start over", "Cancel"]);
  if (answer !== "Start over") return;
  clearSave();
  location.href = location.pathname;
}
