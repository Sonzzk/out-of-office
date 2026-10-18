import { migrate, type GameState } from "./sim/state";

// Browser-only saving (concept.md, round 5).
const KEY = "out-of-office.save";

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Turn pasted or uploaded save text into a current game, or null if it is not one. */
export function parseSave(text: string): GameState | null {
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
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

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the game still runs.
  }
}
