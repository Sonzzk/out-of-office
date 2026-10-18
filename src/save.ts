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

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the game still runs.
  }
}
