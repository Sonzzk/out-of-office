// Fourth-wall settings. They only live in this browser (localStorage) and the
// game never sends anything anywhere.
//  - Employee privacy (default on): the office never uses real-world details.
//    Turn it off and the office may notice your clock and how long you've sat here.
//  - Streamer mode: hides the name you signed with, tones down the scares and
//    keeps the real-world touches off. The game offers it once, when things get odd.
const KEYS = { privacy: "out-of-office.privacy", streamer: "out-of-office.streamer", asked: "out-of-office.asked-recording" };

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function write(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // ignore
  }
}

let privacy = read(KEYS.privacy, true);
let streamer = read(KEYS.streamer, false);

export const isPrivate = () => privacy || streamer;
export const isStreamer = () => streamer;
export const hasAsked = () => read(KEYS.asked, false);
export const markAsked = () => write(KEYS.asked, true);

export function setPrivacy(on: boolean): void {
  privacy = on;
  write(KEYS.privacy, on);
}

export function setStreamer(on: boolean): void {
  streamer = on;
  write(KEYS.streamer, on);
}

export const ALIAS = "Employee";

/** The name to show on screen: the real one is hidden on stream. */
export const shownName = (bossName: string) => (streamer ? ALIAS : bossName);

/** Swap the signed name out of any text (radio logs hold it baked in). */
export function scrub(text: string, bossName: string): string {
  if (!streamer || bossName.length < 2) return text;
  return text.split(bossName).join(ALIAS);
}
