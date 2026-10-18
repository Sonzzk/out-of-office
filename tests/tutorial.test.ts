import { describe, expect, it } from "vitest";
import { hire } from "../src/sim/crew";
import { endDay, sell } from "../src/sim/economy";
import { level0, startExpedition } from "../src/sim/expedition";
import { migrate, newGame, SAVE_VERSION, TUTORIAL_DONE } from "../src/sim/state";
import { advanceTutorial, skipTutorial, TUTORIAL, tutorialActive } from "../src/sim/tutorial";

describe("orientation", () => {
  it("starts at the first step and advances as the player does each thing", () => {
    const s = newGame(5);
    expect(s.tutorial).toBe(0);
    expect(advanceTutorial(s)).toBe(false);
    hire(s, s.pool[0].id);
    advanceTutorial(s);
    expect(s.tutorial).toBe(1);
    startExpedition(s, [s.crew[0].id], { x: level0(s).entrance.x + 3, y: level0(s).entrance.y });
    advanceTutorial(s);
    expect(s.tutorial).toBe(2);
    s.loot.push({ id: 9001, itemId: "almond-water", foundBy: "x" } as never);
    sell(s, 9001);
    advanceTutorial(s);
    expect(s.tutorial).toBe(3);
    s.expeditions.forEach((e) => (e.phase = "done"));
    endDay(s);
    advanceTutorial(s);
    expect(s.tutorial).toBe(TUTORIAL.length);
    expect(tutorialActive(s)).toBe(false);
  });

  it("can be skipped at any point", () => {
    const s = newGame(5);
    skipTutorial(s);
    expect(tutorialActive(s)).toBe(false);
  });

  it("v9 saves skip it when they already have a crew, and show it to a blank one", () => {
    const old = newGame(5);
    const blank = JSON.parse(JSON.stringify(old));
    delete blank.tutorial;
    blank.version = 9;
    expect(migrate(blank)?.tutorial).toBe(0);
    const played = JSON.parse(JSON.stringify(old));
    hire(old, old.pool[0].id);
    Object.assign(played, JSON.parse(JSON.stringify(old)));
    delete played.tutorial;
    played.version = 9;
    const m = migrate(played);
    expect(m?.version).toBe(SAVE_VERSION);
    expect(m?.tutorial).toBe(TUTORIAL_DONE);
  });
});
