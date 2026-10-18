import type { GameState } from "../sim/state";
import { game, onChange } from "../store";
import { apps } from "./apps";
import { isCalm, isMuted, setCalm, setMuted, sfx } from "./audio";
import { refreshCalm } from "./uncanny";
import { shownName } from "../privacy";
import { startFourthWall } from "./fourthwall";
import { startGlitch } from "./glitch";
import { startTutorial } from "./tutorial";
import { notify, startUncanny } from "./uncanny";
import { dialog, initWindows, onWindowsChanged, openApp, openWindows, toggle } from "./windows";

export function mountDesktop(desk: HTMLElement, state: GameState): void {
  const list = apps(state);
  desk.innerHTML = `
    <div class="work"><div class="icons"></div></div>
    <div class="startmenu" hidden><div class="side">OUT OF OFFICE</div><div class="items"></div></div>
    <div class="taskbar">
      <button class="btn start" aria-haspopup="menu">Start</button>
      <div class="tasks"></div>
      <div class="tray inset">
        <span class="hide-sm"><img src="./art/icons/U-cash.png" alt=""><b data-cash></b></span>
        <span class="hide-sm"><img src="./art/icons/U-heat.png" alt="">Heat <b data-heat></b></span>
        <span class="hide-sm" data-air hidden><img src="./art/icons/U-infection.png" alt="">Air <b></b></span>
        <button class="hum" data-calm></button>
        <button class="hum" data-hum></button>
        <span><b data-clock></b></span>
      </div>
    </div>
    <div class="scan"></div>`;

  const work = desk.querySelector<HTMLElement>(".work")!;
  initWindows(work);

  const icons = desk.querySelector(".icons")!;
  for (const app of list) {
    const btn = document.createElement("button");
    btn.className = "ic";
    btn.dataset.open = app.id;
    btn.innerHTML = `<img alt=""><span></span>`;
    btn.querySelector("img")!.src = app.icon;
    btn.querySelector("span")!.textContent = app.title;
    btn.addEventListener("click", () => openApp(app));
    icons.appendChild(btn);
  }

  // Start menu: every app, plus the two buttons that don't help.
  const menu = desk.querySelector<HTMLElement>(".startmenu")!;
  const start = desk.querySelector<HTMLButtonElement>(".start")!;
  const items = menu.querySelector(".items")!;
  const item = (icon: string, label: string, run: () => void) => {
    const b = document.createElement("button");
    b.innerHTML = `<img alt=""><span></span>`;
    b.querySelector("img")!.src = icon;
    b.querySelector("span")!.textContent = label;
    b.addEventListener("click", () => {
      setMenu(false);
      run();
    });
    items.appendChild(b);
  };
  for (const app of list) item(app.icon, app.title, () => openApp(app));
  items.appendChild(document.createElement("hr"));
  item("./art/icons/U-document.png", "Help", () =>
    dialog("Help", "Help is not available on this workstation. Have you tried working harder?", ["OK"]),
  );
  item("./art/icons/U-padlock.png", "Clock Out...", async () => {
    const a = await dialog("Clock Out", "You cannot clock out during a shift. Your shift ends when the work is done.", ["OK", "Cancel"]);
    if (a === "OK") dialog("Clock Out", "The work is not done.", ["OK"], "./art/icons/U-clock.png");
  });
  const setMenu = (on: boolean) => {
    menu.hidden = !on;
    start.classList.toggle("on", on);
  };
  start.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenu(menu.hidden);
  });
  desk.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== start) setMenu(false);
  });

  const tasks = desk.querySelector(".tasks")!;
  onWindowsChanged(() => {
    tasks.replaceChildren(
      ...openWindows()
        .filter((w) => !w.id.startsWith("dlg-"))
        .map((w) => {
          const b = document.createElement("button");
          b.className = "btn" + (w.active && !w.minimized ? " on" : "");
          b.textContent = w.title;
          b.dataset.task = w.id;
          b.addEventListener("click", () => toggle(w.id));
          return b;
        }),
    );
  });

  // Soft key click on every button press, so the office always answers you.
  desk.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) sfx("click");
  });

  // Typewriter clack on every key typed into a field.
  desk.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("input, textarea")) sfx(e.key === "Enter" ? "return" : "key");
  });

  const calmBtn = desk.querySelector<HTMLButtonElement>("[data-calm]")!;
  const showCalm = () => {
    calmBtn.textContent = isCalm() ? "calm: on" : "calm: off";
    calmBtn.title = "Calm mode keeps the sound and the glitches at their gentlest.";
  };
  calmBtn.addEventListener("click", () => {
    setCalm(!isCalm());
    refreshCalm();
    showCalm();
  });
  showCalm();

  const hum = desk.querySelector<HTMLButtonElement>("[data-hum]")!;
  const showHum = () => {
    hum.textContent = isMuted() ? "x hum" : "~ hum";
    hum.title = isMuted() ? "The hum is still there. You just can't hear it." : "Mute";
  };
  hum.addEventListener("click", () => {
    setMuted(!isMuted());
    showHum();
  });
  showHum();

  const clock = desk.querySelector("[data-clock]")!;
  let frozen = 0;
  const tick = () => {
    desk.querySelector("[data-cash]")!.textContent = `$${state.cash.toLocaleString("en-US")}`;
    desk.querySelector("[data-heat]")!.textContent = `${state.heat}%`;
    // Facilities only starts measuring the air once there is something in it.
    const air = desk.querySelector<HTMLElement>("[data-air]")!;
    air.hidden = state.infection < 20;
    air.querySelector("b")!.textContent = state.infection >= 60 ? "BAD" : `${100 - state.infection}%`;
    // Once in a long while the clock says 11:47 PM for a few seconds. It always does.
    if (frozen > 0) frozen--;
    else if (Math.random() < 0.0015) frozen = 6;
    clock.textContent = frozen
      ? "11:47 PM"
      : new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 1000);
  onChange(tick);

  startUncanny(desk, work);
  startGlitch(desk, () => shownName(game().bossName));
  startFourthWall(desk, game);
  startTutorial(desk);

  // An event memo that needs an answer pops up once, wherever you are.
  const announced = new Set(state.memos.map((m) => m.id));
  onChange(() => {
    for (const m of game().memos) {
      if (announced.has(m.id)) continue;
      announced.add(m.id);
      if (m.event && m.event.choice === undefined) notify(desk, "./art/icons/U-envelope.png", `New memo: ${m.from.split(",")[0]}`, `${m.subject}. Needs your answer in the Memo Inbox.`);
    }
  });

  // First shift: the welcome memo and the map are already open.
  openApp(list[0]);
  openApp(list[1]);

  // Facilities follows up about the hum, whether you reported it or not.
  setTimeout(
    () =>
      notify(
        desk,
        "./art/icons/U-envelope.png",
        "Memo from Facilities",
        "We have received your complaint about the hum. There is no hum. Please stop reporting the hum.",
      ),
    75_000,
  );
}
