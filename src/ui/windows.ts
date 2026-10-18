// Win95-style window manager: open, focus, drag, resize, minimize, maximize,
// close. One window per app id. Dialogs are windows too, just modal-looking.
import { sfx } from "./audio";

export interface AppDef {
  id: string;
  title: string;
  w: number;
  h: number;
  render: (body: HTMLElement) => void;
}

interface Win {
  el: HTMLElement;
  title: string;
  minimized: boolean;
  /** Position before maximizing, so restore puts it back. */
  restore: { left: string; top: string; width: string; height: string } | null;
}

const open = new Map<string, Win>();
let z = 10;
let desk: HTMLElement;
const listeners: (() => void)[] = [];

export function onWindowsChanged(fn: () => void): void {
  listeners.push(fn);
}
const changed = () => listeners.forEach((fn) => fn());

export function initWindows(root: HTMLElement): void {
  desk = root;
  // Keep every window reachable when the browser window shrinks.
  window.addEventListener("resize", () => {
    for (const w of open.values()) {
      if (w.restore) fit(w.el);
      else clamp(w.el);
    }
  });
}

export function openWindows(): { id: string; title: string; active: boolean; minimized: boolean }[] {
  return [...open.entries()].map(([id, w]) => ({
    id,
    title: w.title,
    active: w.el.classList.contains("active"),
    minimized: w.minimized,
  }));
}

export function isOpen(id: string): boolean {
  return open.has(id);
}

export function setTitle(id: string, title: string): void {
  const w = open.get(id);
  if (!w) return;
  w.title = title;
  w.el.querySelector(".tb span")!.textContent = title;
  changed();
}

export function focus(id: string): void {
  const target = open.get(id);
  if (target?.minimized) {
    target.minimized = false;
    target.el.hidden = false;
  }
  for (const [key, w] of open) w.el.classList.toggle("active", key === id);
  if (target) target.el.style.zIndex = String(++z);
  changed();
}

/** Taskbar click: focus a background window, minimize the one already on top. */
export function toggle(id: string): void {
  const w = open.get(id);
  if (!w) return;
  if (w.el.classList.contains("active") && !w.minimized) minimize(id);
  else focus(id);
}

export function minimize(id: string): void {
  const w = open.get(id);
  if (!w) return;
  w.minimized = true;
  w.el.hidden = true;
  w.el.classList.remove("active");
  focusTop();
}

export function toggleMaximize(id: string): void {
  const w = open.get(id);
  if (!w) return;
  const s = w.el.style;
  if (w.restore) {
    Object.assign(s, w.restore);
    w.restore = null;
    w.el.classList.remove("max");
  } else {
    w.restore = { left: s.left, top: s.top, width: s.width, height: s.height };
    w.el.classList.add("max");
    fit(w.el);
  }
  window.dispatchEvent(new Event("win-resized"));
}

export function close(id: string): void {
  const w = open.get(id);
  if (!w) return;
  w.el.remove();
  open.delete(id);
  sfx("close");
  focusTop();
}

function focusTop(): void {
  // Hand focus to the topmost visible window that is left, like Windows does.
  const top = [...open.entries()]
    .filter(([, w]) => !w.minimized)
    .sort((a, b) => Number(b[1].el.style.zIndex) - Number(a[1].el.style.zIndex))[0];
  if (top) focus(top[0]);
  else changed();
}

export function openApp(app: AppDef, at?: { x: number; y: number }): HTMLElement {
  const existing = open.get(app.id);
  if (existing) {
    focus(app.id);
    return existing.el;
  }

  const el = document.createElement("div");
  el.className = "win";
  el.dataset.app = app.id;
  const w = Math.min(app.w, desk.clientWidth - 8);
  const h = Math.min(app.h, desk.clientHeight - 8);
  // Cascade new windows so they don't stack exactly on top of each other.
  const offset = (open.size % 6) * 26;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${at?.x ?? (desk.clientWidth - w) / 2 + offset}px`;
  el.style.top = `${at?.y ?? 40 + offset}px`;
  el.innerHTML = `
    <div class="tb"><span></span>
      <button data-act="min" aria-label="Minimize">_</button>
      <button data-act="max" aria-label="Maximize">□</button>
      <button data-act="close" aria-label="Close">x</button>
    </div>
    <div class="body"></div>
    <div class="grip" aria-hidden="true"></div>`;
  el.querySelector(".tb span")!.textContent = app.title;
  const tb = el.querySelector<HTMLElement>(".tb")!;
  tb.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === "min") minimize(app.id);
    if (act === "max") toggleMaximize(app.id);
    if (act === "close") close(app.id);
  });
  tb.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).tagName !== "BUTTON") toggleMaximize(app.id);
  });
  el.addEventListener("pointerdown", () => {
    if (!el.classList.contains("active")) focus(app.id);
  });
  makeDraggable(el, tb, app.id);
  makeResizable(el, el.querySelector(".grip")!);

  desk.appendChild(el);
  clamp(el);
  open.set(app.id, { el, title: app.title, minimized: false, restore: null });
  app.render(el.querySelector(".body")!);
  sfx("open");
  focus(app.id);
  return el;
}

/** A small Win95 message box. Resolves with the label of the button pressed. */
export function dialog(title: string, message: string, buttons = ["OK"], icon = "./art/icons/U-warning.png"): Promise<string> {
  const id = `dlg-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const el = openApp({
      id,
      title,
      w: 360,
      h: 170,
      render: (body) => {
        body.innerHTML = `
          <div class="dlg"><img alt=""><p></p></div>
          <div class="dlg-btns"></div>`;
        body.querySelector("img")!.src = icon;
        body.querySelector("p")!.textContent = message;
        const row = body.querySelector(".dlg-btns")!;
        for (const label of buttons) {
          const b = document.createElement("button");
          b.className = "btn";
          b.textContent = label;
          b.addEventListener("click", () => {
            close(id);
            resolve(label);
          });
          row.appendChild(b);
        }
      },
    });
    el.classList.add("dialog");
    el.style.height = "auto";
    el.style.left = `${(desk.clientWidth - el.offsetWidth) / 2}px`;
    el.style.top = `${Math.max(8, (desk.clientHeight - el.offsetHeight) / 2 - 40)}px`;
    sfx("ding");
  });
}

function clamp(el: HTMLElement): void {
  // Wide windows (phones) stay fully on screen; others may hang off the edge like in Windows.
  const wide = el.offsetWidth > desk.clientWidth * 0.7;
  const maxX = wide ? desk.clientWidth - el.offsetWidth : desk.clientWidth - 60;
  const maxY = desk.clientHeight - 24;
  el.style.left = `${Math.max(wide ? 0 : -el.offsetWidth + 60, Math.min(el.offsetLeft, maxX))}px`;
  el.style.top = `${Math.max(0, Math.min(el.offsetTop, maxY))}px`;
}

function fit(el: HTMLElement): void {
  Object.assign(el.style, { left: "0px", top: "0px", width: `${desk.clientWidth}px`, height: `${desk.clientHeight}px` });
}

function drag(handle: HTMLElement, onMove: (dx: number, dy: number) => void, onEnd?: () => void): void {
  handle.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON" || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      onEnd?.();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}

function makeDraggable(win: HTMLElement, handle: HTMLElement, id: string): void {
  let left = 0;
  let top = 0;
  handle.addEventListener("pointerdown", () => {
    left = win.offsetLeft;
    top = win.offsetTop;
  });
  drag(handle, (dx, dy) => {
    if (open.get(id)?.restore) return; // maximized windows stay put
    win.style.left = `${left + dx}px`;
    win.style.top = `${top + dy}px`;
    clamp(win);
  });
}

function makeResizable(win: HTMLElement, grip: HTMLElement): void {
  let w = 0;
  let h = 0;
  grip.addEventListener("pointerdown", () => {
    w = win.offsetWidth;
    h = win.offsetHeight;
  });
  drag(
    grip,
    (dx, dy) => {
      win.style.width = `${Math.max(220, Math.min(w + dx, desk.clientWidth - win.offsetLeft))}px`;
      win.style.height = `${Math.max(120, Math.min(h + dy, desk.clientHeight - win.offsetTop))}px`;
    },
    () => window.dispatchEvent(new Event("win-resized")),
  );
}
