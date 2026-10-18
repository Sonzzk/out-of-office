import type { GameState } from "../sim/state";
import { apps } from "./apps";
import { focus, onWindowsChanged, openApp, openWindows } from "./windows";

export function mountDesktop(desk: HTMLElement, state: GameState): void {
  const list = apps(state);
  desk.innerHTML = `
    <div class="icons"></div>
    <div class="taskbar">
      <button class="btn start"></button>
      <div class="tasks"></div>
      <div class="tray inset">
        <span class="hide-sm"><img src="./art/icons/U-cash.png" alt=""><b data-cash></b></span>
        <span class="hide-sm"><img src="./art/icons/U-heat.png" alt="">Heat <b data-heat></b></span>
        <span><img src="./art/icons/U-clock.png" alt=""><b data-clock></b></span>
      </div>
    </div>
    <div class="scan"></div>`;

  const icons = desk.querySelector(".icons")!;
  for (const app of list) {
    const btn = document.createElement("button");
    btn.className = "ic";
    btn.dataset.open = app.id;
    btn.innerHTML = `<img alt=""><span></span>`;
    btn.querySelector("img")!.src = app.icon;
    btn.querySelector("span")!.textContent = app.title;
    btn.addEventListener("click", () => openApp(desk, app));
    icons.appendChild(btn);
  }

  desk.querySelector(".start")!.textContent = state.company.split(" ").slice(0, 2).join(" ");
  const tasks = desk.querySelector(".tasks")!;
  onWindowsChanged(() => {
    tasks.replaceChildren(
      ...openWindows().map((w) => {
        const b = document.createElement("button");
        b.className = "btn" + (w.active ? " on" : "");
        b.textContent = w.title;
        b.addEventListener("click", () => focus(w.id));
        return b;
      }),
    );
  });

  const tick = () => {
    desk.querySelector("[data-cash]")!.textContent = `$${state.cash.toLocaleString("en-US")}`;
    desk.querySelector("[data-heat]")!.textContent = `${state.heat}%`;
    desk.querySelector("[data-clock]")!.textContent =
      `Day ${state.day} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };
  tick();
  setInterval(tick, 10_000);

  // First boot: the welcome memo and the map are already open.
  openApp(desk, list[0]);
  openApp(desk, list[1]);
}
