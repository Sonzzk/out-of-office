import type { GameState } from "../sim/state";
import { onChange } from "../store";
import { apps } from "./apps";
import { isMuted, setMuted, sfx } from "./audio";
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
