import type { GameState } from "../sim/state";
import { makeRng } from "../sim/rng";
import type { AppDef } from "./windows";

export interface DesktopApp extends AppDef {
  icon: string;
}

// Apps that later stages fill in show an in-world "not licensed" notice for now.
function unlicensed(body: HTMLElement, name: string): void {
  body.innerHTML = `<div class="inset memo"></div>`;
  body.firstElementChild!.textContent =
    `${name} is not licensed on this workstation.\n\nYour request has been forwarded to IT.\nIT has been forwarded to Level 0.`;
}

function memo(state: GameState): (body: HTMLElement) => void {
  return (body) => {
    body.innerHTML = `<div class="inset memo"></div>`;
    body.firstElementChild!.textContent =
      `TO: ${state.bossName}\nFROM: Facilities\nRE: Welcome aboard\n\n` +
      `Congratulations on founding ${state.company}.\n\n` +
      `Your office has been prepared. The carpet is new. ` +
      `The hum is normal. Please do not open the door at the end of the hall ` +
      `until your first crew has been hired.\n\nHave a productive day.`;
  };
}

// Placeholder schematic of Level 0: a seeded room grid behind fog of war.
// Stage 1 replaces this with the real generated map and crew blips.
function map(state: GameState): (body: HTMLElement) => void {
  return (body) => {
    body.style.padding = "0";
    const canvas = document.createElement("canvas");
    canvas.className = "map";
    body.appendChild(canvas);
    const draw = () => {
      const w = (canvas.width = body.clientWidth);
      const h = (canvas.height = body.clientHeight);
      const ctx = canvas.getContext("2d")!;
      const rng = makeRng(state.seed);
      const cell = 22;
      ctx.fillStyle = "#0e1208";
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += cell) {
        for (let y = 0; y < h; y += cell) {
          const d = Math.hypot(x - w / 2, y - h / 2) / Math.hypot(w / 2, h / 2);
          if (rng() < 0.62 && rng() > d * 0.9) {
            ctx.fillStyle = `rgba(201,186,90,${0.55 - d * 0.45})`;
            ctx.fillRect(x + 2, y + 2, cell - 3, cell - 3);
          }
        }
      }
      ctx.fillStyle = "#e9e2b0";
      ctx.font = "bold 11px monospace";
      ctx.fillText("LEVEL 0 · THE WAITING FLOOR · SURVEYED 3%", 8, 16);
      ctx.fillStyle = "#a8321e";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    requestAnimationFrame(draw);
    new ResizeObserver(draw).observe(body);
  };
}

export function apps(state: GameState): DesktopApp[] {
  const art = "./art/icons/";
  return [
    { id: "map", title: "Facility Map", icon: art + "U-map.png", w: 560, h: 380, render: map(state) },
    { id: "inbox", title: "Memo Inbox", icon: art + "U-envelope.png", w: 380, h: 300, render: memo(state) },
    { id: "feeds", title: "Feeds Wall", icon: art + "U-bodycam.png", w: 420, h: 260, render: (b) => unlicensed(b, "FEEDS.EXE") },
    { id: "hr", title: "HR Roster", icon: art + "U-crew.png", w: 420, h: 260, render: (b) => unlicensed(b, "ROSTER.EXE") },
    { id: "index", title: "The Index", icon: art + "U-magnifier.png", w: 420, h: 260, render: (b) => unlicensed(b, "INDEX.EXE") },
    { id: "ledger", title: "Ledger", icon: art + "U-cash.png", w: 420, h: 260, render: (b) => unlicensed(b, "LEDGER.EXE") },
    { id: "lab", title: "Lab", icon: art + "U-sample-jar.png", w: 420, h: 260, render: (b) => unlicensed(b, "LAB.EXE") },
  ];
}
