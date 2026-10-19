import { migrate, SAVE_VERSION, type GameState } from "./sim/state";

// Browser-only saving (concept.md, round 5).
const KEY = "out-of-office.save";
const BACKUP_KEY = "out-of-office.save.backup";

export interface ReadResult {
  state: GameState | null;
  /** Why a non-empty save could not be used, if it could not. */
  problem?: "unreadable" | "newer";
}

/** Read save text. A save we cannot use is reported, never silently dropped. */
export function readSave(raw: string | null): ReadResult {
  if (!raw) return { state: null };
  try {
    const parsed = JSON.parse(raw);
    const state = migrate(parsed);
    if (state) return { state };
    return { state: null, problem: parsed?.version > SAVE_VERSION ? "newer" : "unreadable" };
  } catch {
    return { state: null, problem: "unreadable" };
  }
}

/** Set when the last load had to put a save aside, so the desktop can say so. */
export let loadProblem: ReadResult["problem"];

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const result = readSave(raw);
    if (result.problem) {
      // Keep the unusable save under another key so a new game does not overwrite it.
      localStorage.setItem(BACKUP_KEY, raw!);
      loadProblem = result.problem;
    }
    return result.state;
  } catch {
    return null;
  }
}

/** Turn pasted or uploaded save text into a current game, or null if it is not one. */
export function parseSave(text: string): GameState | null {
  return readSave(text).state;
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** The save that was put aside by the last load, if any, as raw text. */
export function setAsideSave(): string | null {
  try {
    return localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

/** True when a storage event says another tab wrote the save we are playing. */
export function isForeignWrite(e: { key: string | null; newValue: string | null }): boolean {
  return e.key === KEY && e.newValue !== null;
}

/** Calls fn once, the first time another tab writes this save. Two tabs overwrite each other. */
export function watchOtherTab(fn: () => void): void {
  let told = false;
  window.addEventListener("storage", (e) => {
    if (told || !isForeignWrite(e)) return;
    told = true;
    fn();
  });
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the game still runs.
  }
}
