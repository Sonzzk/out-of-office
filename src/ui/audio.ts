// All sound is synthesized with WebAudio, so there are no audio files to ship.
// The office hum is mains hum (50/100/150 Hz) plus a ballast whine and room
// noise. Browsers only allow sound after a click, so startAudio() is called
// from the boot screen's button.

import { isStreamer } from "../privacy";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hum: GainNode | null = null;
let muted = false;
let calm = false;
let audioUnease = 0.15;
let muzak: { gain: GainNode; filter: BiquadFilterNode; vibrato: GainNode } | null = null;

const MUTE_KEY = "out-of-office.muted";
const CALM_KEY = "out-of-office.calm";
const VOL_KEY = "out-of-office.volume";
let volume = 1;
const MUZAK_LEVEL = 0.03;
const HUM_LEVEL = 0.05;

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
  calm = localStorage.getItem(CALM_KEY) === "1";
  const v = Number(localStorage.getItem(VOL_KEY));
  if (localStorage.getItem(VOL_KEY) !== null && v >= 0 && v <= 1) volume = v;
} catch {
  // Storage can be blocked; default to sound on.
}

export function getVolume(): number {
  return volume;
}

/** Master volume, 0..1, remembered between visits. */
export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(VOL_KEY, String(volume));
  } catch {
    // ignore
  }
  if (ctx && master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

/** Calm mode: the sound (and the desktop effects) stay at their gentlest. */
export function isCalm(): boolean {
  return calm;
}

export function setCalm(on: boolean): void {
  calm = on;
  try {
    localStorage.setItem(CALM_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

/** How wrong the muzak is allowed to sound, 0..1. Calm mode caps it low. */
const effectiveUnease = () => (calm ? Math.min(audioUnease, 0.1) : isStreamer() ? Math.min(audioUnease, 0.5) : audioUnease);

export function setAudioUnease(v: number): void {
  audioUnease = Math.max(0, Math.min(1, v));
  if (!ctx || !muzak) return;
  const u = effectiveUnease();
  muzak.filter.frequency.setTargetAtTime(2400 - u * 1900, ctx.currentTime, 1.5);
  muzak.vibrato.gain.setTargetAtTime(u * 40, ctx.currentTime, 1.5);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(on: boolean): void {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  if (ctx && master) master.gain.setTargetAtTime(on ? 0 : volume, ctx.currentTime, 0.05);
}

export function startAudio(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);

  hum = ctx.createGain();
  hum.gain.value = 0;
  hum.gain.setTargetAtTime(HUM_LEVEL, ctx.currentTime, 2.5); // fade in, so it's there before you notice
  hum.connect(master);

  // Mains hum: odd and even harmonics with a slow, uneven wobble.
  for (const [freq, level] of [[50, 0.55], [100, 0.9], [150, 0.35], [200, 0.2], [300, 0.08]] as const) {
    const osc = ctx.createOscillator();
    osc.type = freq === 100 ? "sawtooth" : "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level * (freq === 100 ? 0.25 : 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + Math.random() * 0.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = level * 0.3;
    lfo.connect(lfoGain).connect(g.gain);
    osc.connect(g).connect(hum);
    osc.start();
    lfo.start();
  }

  // Ballast whine, very quiet and very high: you feel it more than hear it.
  const whine = ctx.createOscillator();
  whine.frequency.value = 15_600;
  const wg = ctx.createGain();
  wg.gain.value = 0.012;
  whine.connect(wg).connect(hum);
  whine.start();

  // Room tone: filtered noise, like an air vent two rooms away.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 4);
  noise.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 380;
  const ng = ctx.createGain();
  ng.gain.value = 0.5;
  noise.connect(lp).connect(ng).connect(hum);
  noise.start();

  startMuzak();
}

// Lobby muzak: a lazy four-chord loop on soft triangles. As the infection
// grows it slows, goes sour (detuned, the odd wrong note), dulls and drops out.
const CHORDS = [
  [48, 55, 59, 64], // Cmaj7
  [45, 52, 55, 60], // Am7
  [50, 57, 60, 65], // Dm7
  [43, 50, 53, 59], // G7
];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function startMuzak(): void {
  if (!ctx || !master) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(MUZAK_LEVEL, ctx.currentTime, 4);
  filter.connect(gain).connect(master);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const vibrato = ctx.createGain();
  vibrato.gain.value = 0;
  lfo.connect(vibrato);
  lfo.start();
  muzak = { gain, filter, vibrato };
  setAudioUnease(audioUnease);

  let bar = 0;
  let nextAt = ctx.currentTime + 1;
  const schedule = () => {
    if (!ctx || !muzak) return;
    while (nextAt < ctx.currentTime + 4) {
      const u = effectiveUnease();
      const len = 2.4 + u * 3.2; // the tune drags
      const chord = CHORDS[bar % CHORDS.length];
      if (Math.random() > u * 0.35) {
        chord.forEach((n, i) => {
          const wrong = Math.random() < u * 0.35 ? (Math.random() < 0.5 ? 1 : -1) : 0;
          const o = ctx!.createOscillator();
          o.type = "triangle";
          o.frequency.value = midi(n + wrong + (i === 3 ? 12 : 0));
          o.detune.value = (Math.random() - 0.5) * u * 120;
          vibrato.connect(o.detune);
          const g = ctx!.createGain();
          const at = nextAt + i * 0.18 * (1 + u);
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(0.22, at + 0.08);
          g.gain.exponentialRampToValueAtTime(0.0001, at + len * 0.95);
          o.connect(g).connect(filter);
          o.start(at);
          o.stop(at + len);
        });
      }
      nextAt += len;
      bar++;
    }
  };
  schedule();
  window.setInterval(schedule, 1000);
}

/** The radio: a looping hiss while the crew waits for your call. */
let staticSrc: { stop: () => void } | null = null;
export function radioStatic(on: boolean): void {
  if (!ctx || !master) return;
  if (!on) {
    staticSrc?.stop();
    staticSrc = null;
    return;
  }
  if (staticSrc) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2100;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
  src.connect(bp).connect(g).connect(master);
  src.start();
  const c = ctx;
  staticSrc = {
    stop: () => {
      g.gain.setTargetAtTime(0, c.currentTime, 0.08);
      src.stop(c.currentTime + 0.5);
    },
  };
}

/** The tubes stutter: the hum drops out and comes back with a tick. */
export function humFlicker(ms: number): void {
  if (!ctx || !hum) return;
  const t = ctx.currentTime;
  hum.gain.cancelScheduledValues(t);
  hum.gain.setValueAtTime(HUM_LEVEL * 0.15, t);
  hum.gain.setValueAtTime(HUM_LEVEL * 1.4, t + ms / 1000);
  hum.gain.setTargetAtTime(HUM_LEVEL, t + ms / 1000, 0.3);
  sfx("tick");
}

type Sfx = "click" | "open" | "close" | "ding" | "tick" | "type" | "memo" | "key" | "return" | "squelch";

export function sfx(kind: Sfx): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  switch (kind) {
    case "click":
    case "type":
      burst(t, kind === "type" ? 0.03 : 0.018, kind === "type" ? 2600 : 1800, kind === "type" ? 0.25 : 0.18);
      break;
    case "tick":
      burst(t, 0.012, 4200, 0.35);
      break;
    case "key": // a typewriter key: clack, with a little pitch variety
      burst(t, 0.02, 1500 + Math.random() * 1400, 0.22);
      burst(t + 0.004, 0.008, 5200, 0.12);
      break;
    case "return": // carriage return: thunk and bell
      burst(t, 0.06, 700, 0.35);
      tone(t + 0.05, 1760, 0.18, 0.015);
      break;
    case "squelch": // a radio line arrives
      burst(t, 0.09, 1900, 0.3);
      burst(t + 0.14, 0.03, 2600, 0.15);
      break;
    case "open":
      tone(t, 520, 0.05, 0.05);
      tone(t + 0.05, 780, 0.06, 0.04);
      break;
    case "close":
      tone(t, 620, 0.05, 0.04);
      tone(t + 0.05, 410, 0.07, 0.04);
      break;
    case "ding":
      tone(t, 880, 0.35, 0.06);
      tone(t, 1320, 0.25, 0.025);
      break;
    case "memo":
      tone(t, 660, 0.12, 0.05);
      tone(t + 0.14, 660, 0.12, 0.05);
      tone(t + 0.28, 622, 0.4, 0.05); // the last note is a little flat
      break;
  }
}

function tone(t: number, freq: number, dur: number, level: number): void {
  const osc = ctx!.createOscillator();
  osc.type = "square";
  osc.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function burst(t: number, dur: number, freq: number, level: number): void {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer(ctx!, dur);
  const bp = ctx!.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(t);
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
