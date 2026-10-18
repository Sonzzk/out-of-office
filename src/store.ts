import { saveGame } from "./save";
import type { GameState } from "./sim/state";

// One live game state. UI code changes it only through update(), which saves
// and tells every open window to redraw. "tick" changes (an expedition step)
// only reach windows that asked for them, so forms don't flicker every step.
export type Topic = "all" | "tick";

let state: GameState;
const subs = new Set<{ fn: () => void; topics: Topic[] }>();

export function initStore(s: GameState): void {
  state = s;
}

export function game(): GameState {
  return state;
}

export function update(fn: (s: GameState) => void, topic: Topic = "all"): void {
  fn(state);
  saveGame(state);
  for (const sub of [...subs]) if (topic === "all" || sub.topics.includes(topic)) sub.fn();
}

export function onChange(fn: () => void, topics: Topic[] = ["all"]): void {
  subs.add({ fn, topics });
}

// Render now and again on every change, until the element leaves the page
// (its window was closed).
export function watch(el: HTMLElement, render: (topic: Topic) => void, topics: Topic[] = ["all"]): void {
  render("all");
  const sub = {
    topics,
    fn: () => {
      if (!el.isConnected) subs.delete(sub);
      else render(currentTopic);
    },
  };
  subs.add(sub);
}

let currentTopic: Topic = "all";
export function updateTick(fn: (s: GameState) => void): void {
  currentTopic = "tick";
  update(fn, "tick");
  currentTopic = "all";
}
