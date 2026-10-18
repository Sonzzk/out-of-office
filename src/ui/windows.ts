// Win95-style window manager: open, focus, drag, close. One window per app id.
export interface AppDef {
  id: string;
  title: string;
  w: number;
  h: number;
  render: (body: HTMLElement) => void;
}

const open = new Map<string, HTMLElement>();
let z = 10;
let onChange: () => void = () => {};

export function onWindowsChanged(fn: () => void): void {
  onChange = fn;
}

export function openWindows(): { id: string; title: string; active: boolean }[] {
  return [...open.entries()].map(([id, el]) => ({
    id,
    title: el.dataset.title ?? id,
    active: el.classList.contains("active"),
  }));
}

export function focus(id: string): void {
  for (const [key, el] of open) el.classList.toggle("active", key === id);
  const el = open.get(id);
  if (el) el.style.zIndex = String(++z);
  onChange();
}

export function close(id: string): void {
  open.get(id)?.remove();
  open.delete(id);
  // Hand focus to the topmost window that is left, like Windows does.
  const top = [...open.entries()].sort((a, b) => Number(b[1].style.zIndex) - Number(a[1].style.zIndex))[0];
  if (top) focus(top[0]);
  else onChange();
}

export function openApp(desk: HTMLElement, app: AppDef): void {
  if (open.has(app.id)) return focus(app.id);

  const el = document.createElement("div");
  el.className = "win";
  el.dataset.title = app.title;
  el.dataset.app = app.id;
  const w = Math.min(app.w, desk.clientWidth - 8);
  const h = Math.min(app.h, desk.clientHeight - 44);
  // Cascade new windows so they don't stack exactly on top of each other.
  const offset = (open.size % 6) * 24;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${Math.max(4, Math.min((desk.clientWidth - w) / 2 + offset, desk.clientWidth - w - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(60 + offset, desk.clientHeight - h - 40))}px`;
  el.innerHTML = `<div class="tb"><span></span><button aria-label="Close">x</button></div><div class="body"></div>`;
  el.querySelector(".tb span")!.textContent = app.title;
  el.querySelector("button")!.addEventListener("click", () => close(app.id));
  el.addEventListener("pointerdown", () => focus(app.id));
  makeDraggable(el, el.querySelector(".tb")!, desk);

  desk.appendChild(el);
  open.set(app.id, el);
  app.render(el.querySelector(".body")!);
  focus(app.id);
}

function makeDraggable(win: HTMLElement, handle: HTMLElement, desk: HTMLElement): void {
  handle.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    const startX = e.clientX - win.offsetLeft;
    const startY = e.clientY - win.offsetTop;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.max(-win.offsetWidth + 60, Math.min(ev.clientX - startX, desk.clientWidth - 60));
      const y = Math.max(0, Math.min(ev.clientY - startY, desk.clientHeight - 56));
      win.style.left = `${x}px`;
      win.style.top = `${y}px`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}
