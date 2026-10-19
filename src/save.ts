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

// Save slots. The active save stays under KEY so old saves still load. Three
// slots, the last day's backup and the save a load replaced use their own keys.
export const SLOT_COUNT = 3;
const PREVDAY_KEY = "out-of-office.save.prevday";
const UNDO_KEY = "out-of-office.save.before-load";

export type SaveSource = number | "prevday" | "undo"; // a slot number from 1, or a backup

/** The part of localStorage the slots use, so tests can hand in a plain object. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function keyOf(src: SaveSource): string {
  return src === "prevday" ? PREVDAY_KEY : src === "undo" ? UNDO_KEY : `${KEY}.slot${src}`;
}

export interface SlotInfo {
  source: SaveSource;
  empty: boolean;
  day?: number;
  company?: string;
}

/** What a slot or backup holds, for the Handbook to list. */
export function slotInfo(src: SaveSource, store: Store = localStorage): SlotInfo {
  try {
    const { state } = readSave(store.getItem(keyOf(src)));
    return state ? { source: src, empty: false, day: state.day, company: state.company } : { source: src, empty: true };
  } catch {
    return { source: src, empty: true };
  }
}

/** Put a copy of the game in a slot. */
export function saveToSlot(n: number, state: GameState, store: Store = localStorage): boolean {
  if (!Number.isInteger(n) || n < 1 || n > SLOT_COUNT) return false;
  try {
    store.setItem(keyOf(n), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Set the active save aside so replacing it can be taken back. */
export function backupActive(store: Store = localStorage): void {
  try {
    const raw = store.getItem(KEY);
    if (raw) store.setItem(UNDO_KEY, raw);
  } catch {
    // ignore
  }
}

/**
 * Make a slot or backup the active save. The save it replaces is kept under
 * "undo" first, and nothing changes if the source cannot be read. The page
 * must reload afterwards. Returns the game now active, or null.
 */
export function restore(src: SaveSource, store: Store = localStorage): GameState | null {
  try {
    const raw = store.getItem(keyOf(src));
    const { state } = readSave(raw);
    if (!state || !raw) return null;
    backupActive(store); // for "undo" itself this swaps the two, so the swap can be taken back
    store.setItem(KEY, raw);
    return state;
  } catch {
    return null;
  }
}

/**
 * A saver that keeps last day's save. When a save carries a later day than the
 * one it replaces, the old one is copied to the previous-day backup first.
 */
export function createSaver(store: () => Store): (state: GameState) => void {
  let last: { raw: string; day: number } | null = null;
  return (state) => {
    try {
      const s = store();
      const raw = JSON.stringify(state);
      let prev = s.getItem(KEY);
      if (prev && last?.raw !== prev) {
        const day = readSave(prev).state?.day;
        last = day === undefined ? null : { raw: prev, day };
      } else if (!prev) last = null;
      if (prev && last && state.day > last.day) s.setItem(PREVDAY_KEY, prev);
      s.setItem(KEY, raw);
      last = { raw, day: state.day };
    } catch {
      // Private windows can refuse storage; the game still runs.
    }
  };
}

export const saveGame = createSaver(() => localStorage);
