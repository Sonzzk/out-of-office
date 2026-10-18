import { describe, expect, it } from "vitest";
import { parseAccess, shouldStep, DEFAULTS } from "../src/access";
import { isForeignWrite } from "../src/save";
import { clipName, clipSeconds } from "../src/ui/clip";

describe("relaxed timers", () => {
  it("leaves runs alone unless they are waiting on the office", () => {
    for (let n = 0; n < 5; n++) expect(shouldStep(false, "wait", n)).toBe(true);
    for (let n = 0; n < 5; n++) expect(shouldStep(true, "off", n)).toBe(true);
  });

  it("wait mode never steps a run that is waiting", () => {
    for (let n = 0; n < 50; n++) expect(shouldStep(true, "wait", n)).toBe(false);
  });

  it("x3 mode steps a waiting run every third try", () => {
    const steps = Array.from({ length: 30 }, (_, n) => shouldStep(true, "x3", n)).filter(Boolean).length;
    expect(steps).toBe(10);
    expect(shouldStep(true, "x3", 0)).toBe(true); // the first try goes through, so the call is not stuck
  });
});

describe("accessibility settings", () => {
  it("falls back to the defaults for missing or bad data", () => {
    const d = DEFAULTS();
    expect(parseAccess(null, d)).toEqual(d);
    expect(parseAccess("{not json", d)).toEqual(d);
    expect(parseAccess(JSON.stringify({ scale: 333, relaxed: "never", contrast: "yes" }), d)).toEqual(d);
  });

  it("keeps good values", () => {
    const a = parseAccess(JSON.stringify({ scale: 150, contrast: true, reduceMotion: true, relaxed: "wait", pauseHidden: false }));
    expect(a).toEqual({ scale: 150, contrast: true, reduceMotion: true, relaxed: "wait", pauseHidden: false });
  });
});

describe("second tab", () => {
  it("only a write to the save key from elsewhere counts", () => {
    expect(isForeignWrite({ key: "out-of-office.save", newValue: "{}" })).toBe(true);
    expect(isForeignWrite({ key: "out-of-office.save", newValue: null })).toBe(false);
    expect(isForeignWrite({ key: "out-of-office.volume", newValue: "1" })).toBe(false);
  });
});

describe("clips", () => {
  it("names the file after the clock and rounds the length", () => {
    expect(clipName(new Date("2026-01-02T03:04:05Z"))).toBe("bodycam-030405.webm");
    expect(clipSeconds(0, 24_400)).toBe(24);
    expect(clipSeconds(0, 100)).toBe(1);
  });
});
