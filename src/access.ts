// Accessibility settings. They live in this browser (localStorage) like the
// other settings, apply to the whole page through attributes on <html>, and
// the pure helpers here are what the tick loop and the tests use.
const KEY = "out-of-office.access";

export type Relaxed = "off" | "x3" | "wait";
export const SCALES = [100, 125, 150] as const;

export interface Access {
  /** UI scale in percent. */
  scale: number;
  contrast: boolean;
  /** Stops flicker, tears, ghosts and animations. Defaults to the system setting. */
  reduceMotion: boolean;
  /** Calls and threats wait for the answer, or get three times as long. */
  relaxed: Relaxed;
  /** Runs hold still while the tab is hidden. */
  pauseHidden: boolean;
}

const systemReduces = () => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
};

export const DEFAULTS = (): Access => ({ scale: 100, contrast: false, reduceMotion: systemReduces(), relaxed: "off", pauseHidden: true });

/** Turn stored text into settings, ignoring anything that does not belong. */
export function parseAccess(raw: string | null, base: Access = DEFAULTS()): Access {
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Partial<Access>;
    return {
      scale: (SCALES as readonly number[]).includes(o.scale as number) ? (o.scale as number) : base.scale,
      contrast: typeof o.contrast === "boolean" ? o.contrast : base.contrast,
      reduceMotion: typeof o.reduceMotion === "boolean" ? o.reduceMotion : base.reduceMotion,
      relaxed: o.relaxed === "x3" || o.relaxed === "wait" || o.relaxed === "off" ? o.relaxed : base.relaxed,
      pauseHidden: typeof o.pauseHidden === "boolean" ? o.pauseHidden : base.pauseHidden,
    };
  } catch {
    return base;
  }
}

/**
 * Should a run take its next step? Only runs that are waiting on the office
 * (a call or a contact) are slowed: "wait" never steps, "x3" steps every third
 * try. `n` counts the tries spent waiting so far.
 */
export function shouldStep(waiting: boolean, relaxed: Relaxed, n: number): boolean {
  if (!waiting || relaxed === "off") return true;
  if (relaxed === "wait") return false;
  return n % 3 === 0;
}

let current: Access = DEFAULTS();
try {
  current = parseAccess(localStorage.getItem(KEY));
} catch {
  // Storage can be blocked; the defaults do fine.
}

export const access = (): Access => current;

/** Put the settings on the page: a scale, a theme and a motion switch on <html>. */
export function applyAccess(root: HTMLElement = document.documentElement): void {
  root.dataset.scale = String(current.scale);
  root.style.setProperty("--ui-scale", String(current.scale / 100));
  root.dataset.contrast = current.contrast ? "high" : "normal";
  root.dataset.motion = current.reduceMotion ? "reduced" : "full";
  window.dispatchEvent(new Event("win-resized"));
  window.dispatchEvent(new Event("resize")); // windows re-clamp to the new room
}

export function setAccess(patch: Partial<Access>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  applyAccess();
}

/** "Tap" on a touch screen, "Click" with a mouse, for hints in the interface. */
export function tapWord(): string {
  try {
    return window.matchMedia?.("(pointer: coarse)").matches ? "Tap" : "Click";
  } catch {
    return "Click";
  }
}
