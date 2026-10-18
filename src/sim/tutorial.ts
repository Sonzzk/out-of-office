import { TUTORIAL_DONE, type GameState } from "./state";

// Employee Orientation: four small steps that teach the loop. Each step is
// finished by doing the thing, so it can never get stuck waiting on a click.
export interface TutorialStep {
  title: string;
  text: string;
  /** The desktop icon to point at (a `data-open` id). */
  icon: string;
  done: (s: GameState) => boolean;
}

export const TUTORIAL: TutorialStep[] = [
  {
    title: "Hire your first employee",
    text: "Open the HR Roster and hire someone. Anyone. The cheapest ones are cheap for a reason, but it is a start.",
    icon: "hr",
    done: (s) => s.crew.length > 0,
  },
  {
    title: "Send them into Level 0",
    text: "Open the Facility Map, click somewhere in the dark to drop a marker, tick your hire and press send. Listen to the radio.",
    icon: "map",
    done: (s) => s.expeditions.length > 0,
  },
  {
    title: "Sell what comes back",
    text: "When the crew returns, open the Ledger and sell their finds. Keep the odd sample for the Lab if you are curious.",
    icon: "ledger",
    done: (s) => s.ledger.some((l) => l.text.startsWith("Sold ")),
  },
  {
    title: "Close the books",
    text: "In the Ledger, close the books to end the day. Wages are paid, the pool restocks and the Board checks your numbers.",
    icon: "ledger",
    done: (s) => s.day > 1,
  },
];

export const tutorialActive = (s: GameState) => s.tutorial < TUTORIAL_DONE;

/** Move past every step that is already done. Returns true if anything changed. */
export function advanceTutorial(s: GameState): boolean {
  const before = s.tutorial;
  while (s.tutorial < TUTORIAL.length && TUTORIAL[s.tutorial].done(s)) s.tutorial++;
  return s.tutorial !== before;
}

export function skipTutorial(s: GameState): void {
  s.tutorial = TUTORIAL_DONE;
}
