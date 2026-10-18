// The office talks to the person at the desk. Two flavours:
//  - "Are you recording?": once the office is properly infected it asks, one
//    time. Saying yes turns streamer mode on (name hidden, scares toned down).
//  - Real-world touches, only when Employee privacy is off: the office notices
//    your local time and how long you have been sitting there. Nothing is sent
//    anywhere; it only reads the browser clock.
import { infectionStage } from "../sim/infection";
import type { GameState } from "../sim/state";
import { hasAsked, isPrivate, markAsked, setStreamer, shownName } from "../privacy";
import { isCalm } from "./audio";
import { update } from "../store";
import { notify, refreshCalm } from "./uncanny";
import { dialog } from "./windows";

const started = Date.now();
// ?fast (play-tests) shortens every wait.
const speed = new URLSearchParams(location.search).has("fast") ? 0.1 : 1;
const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms * speed);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function startFourthWall(desk: HTMLElement, game: () => GameState): void {
  const recording = () => {
    // Never in calm mode, and never on top of a call or a threat on a running feed.
    const busy = game().expeditions.some((e) => e.phase !== "done" && (e.call || e.threat));
    if (!hasAsked() && !isCalm() && !busy && infectionStage(game()) >= 3 && !document.hidden) {
      markAsked();
      const before = new Set(Array.from(desk.querySelectorAll(".win.dialog")));
      void dialog(
        "Facilities",
        "Facilities has noticed a red light on your end. Are you recording?",
        ["Yes", "No"],
        "./art/icons/U-bodycam.png",
      ).then((answer) => {
        if (answer === "Yes") {
          setStreamer(true);
          refreshCalm();
          update(() => {}); // repaint open windows without the name
          notify(desk, "./art/icons/U-padlock.png", "Streamer mode", "Your name is hidden and the scares are gentler. Change it in the Employee Handbook.");
        } else {
          notify(desk, "./art/icons/U-padlock.png", "Facilities", "Good. Neither are we.");
        }
      });
      // Nobody answered: it counts as No, after about ten seconds.
      window.setTimeout(() => {
        const mine = Array.from(desk.querySelectorAll<HTMLElement>(".win.dialog")).find((d) => !before.has(d) && d.textContent?.includes("red light"));
        Array.from(mine?.querySelectorAll<HTMLButtonElement>(".dlg-btns .btn") ?? []).find((b) => b.textContent === "No")?.click();
      }, 10_000); // real seconds, even under ?fast
    }
    later(recording, 15_000);
  };
  later(recording, 10_000);

  const touch = () => {
    const s = game();
    if (!isPrivate() && !isCalm() && infectionStage(s) >= 2 && !document.hidden) {
      const now = new Date();
      const minutes = Math.round((Date.now() - started) / 60_000);
      const hour = now.getHours();
      const clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const name = shownName(s.bossName);
      const lines: string[] = [];
      if (hour >= 23 || hour < 5) lines.push(`It's ${clock}, ${name}. You should be home. We can tell you are not.`);
      if (minutes >= 20) lines.push(`You have been at your desk for ${minutes} minutes. HR has noted it. HR approves.`);
      lines.push(`Your clock says ${clock}. Ours says it is always about this time.`);
      notify(desk, "./art/icons/U-clock.png", "HR", lines[Math.floor(Math.random() * lines.length)]);
    }
    later(touch, rand(90_000, 180_000));
  };
  later(touch, rand(40_000, 70_000));
}
