// All sound is synthesized with WebAudio, so there are no audio files to ship.
// The office hum is mains hum (50/100/150 Hz) plus a ballast whine and room
// noise. Browsers only allow sound after a click, so startAudio() is called
// from the boot screen's button.

import { isStreamer } from "../privacy";
import { LEVELS, type LevelStyle } from "../data/levels";

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
  const stored = localStorage.getItem(CALM_KEY);
  // People who ask their system for less motion start in calm mode until they choose otherwise.
  calm = stored === null ? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true : stored === "1";
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
  window.dispatchEvent(new Event("ooo-calm")); // the tray label listens
  try {
    localStorage.setItem(CALM_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  if (ctx && bed) bed.gain.gain.setTargetAtTime(bedLevel(bed), ctx.currentTime, 0.5);
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

  bedBus = ctx.createGain();
  bedBus.connect(master);
  pulseBus = ctx.createGain();
  pulseBus.connect(master);
  window.setInterval(tickBeds, 400);
  window.setInterval(tickPulse, 200);
  setAmbience(wantedBed);
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
    // Muted or in a background tab: keep time, but don't build notes nobody can hear.
    if (muted || document.hidden) nextAt = Math.max(nextAt, ctx.currentTime + 1);
    while (nextAt < ctx.currentTime + 4 && !muted && !document.hidden) {
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

type Sfx =
  | "click" | "open" | "close" | "ding" | "tick" | "type" | "memo" | "key" | "return" | "squelch" | "step" | "thump" | "growl" | "call-bell"
  // the office around your desk
  | "far-steps" | "knock" | "far-ring" | "buzz" | "clunk";

/** pan: -1 (left) to 1 (right). gain: 0..1, scales the cue. Both are optional. */
export interface SfxOptions {
  pan?: number;
  gain?: number;
}

// Where tone() and burst() send their sound: the master bus, or the panned
// and scaled bus of the cue being played right now.
let sink: AudioNode | null = null;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));

export function sfx(kind: Sfx, opts?: SfxOptions): void {
  if (!ctx || !master) return;
  if (!opts || (opts.pan === undefined && opts.gain === undefined)) return play(kind);
  const g = ctx.createGain();
  g.gain.value = clamp(opts.gain ?? 1, 0, 1);
  if (opts.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(opts.pan, -1, 1);
    g.connect(p).connect(master);
  } else g.connect(master);
  sink = g;
  try {
    play(kind);
  } finally {
    sink = null;
  }
}

function play(kind: Sfx): void {
  const t = ctx!.currentTime;
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
    case "step": // a footfall on damp carpet, slightly different each time
      burst(t, 0.07, 160 + Math.random() * 80, 0.28);
      burst(t, 0.03, 900 + Math.random() * 300, 0.05);
      break;
    case "thump": // a heartbeat, close to the microphone
      burst(t, 0.12, 70, 0.55);
      burst(t + 0.16, 0.1, 62, 0.4);
      break;
    case "growl": // something low and wet in the signal
      for (let i = 0; i < 6; i++) burst(t + i * 0.09, 0.18, 90 + Math.random() * 120, 0.22);
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
    case "call-bell": // a desk bell two rooms away: someone on the radio wants an answer
      for (const at of [0, 0.3]) {
        bell(t + at, 1568, 0.9, 0.02);
        bell(t + at, 2349, 0.5, 0.007);
        bell(t + at, 4186, 0.25, 0.003);
      }
      break;
    case "far-steps": // someone walking down the hall, slow, getting closer, then not
      for (let i = 0; i < 7; i++) {
        const at = t + i * (0.62 + Math.random() * 0.08);
        const near = 0.3 + i * 0.1;
        burst(at, 0.09, 120 + Math.random() * 40, 0.16 * near);
        burst(at + 0.01, 0.025, 600 + Math.random() * 200, 0.025 * near);
      }
      break;
    case "knock": // three knocks on a hollow office door
      for (const at of [0, 0.32, 0.64]) {
        burst(t + at, 0.11, 140, 0.5);
        burst(t + at, 0.03, 420, 0.18);
      }
      break;
    case "far-ring": // a desk phone ringing in an empty cubicle somewhere
      for (const at of [0, 2.4]) {
        for (let i = 0; i < 20; i++) {
          bell(t + at + i * 0.05, 440, 0.06, 0.006);
          bell(t + at + i * 0.05 + 0.025, 480, 0.06, 0.006);
        }
      }
      break;
    case "buzz": // a fluorescent tube struggling to start
      for (let i = 0; i < 5; i++) {
        const osc = ctx!.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 100;
        const g = ctx!.createGain();
        const at = t + i * 0.09 + Math.random() * 0.05;
        g.gain.setValueAtTime(0.02, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
        osc.connect(g).connect(sink ?? master!);
        osc.start(at);
        osc.stop(at + 0.08);
        burst(at, 0.01, 3800, 0.08);
      }
      break;
    case "clunk": // a can drops in the vending machine down the hall
      burst(t, 0.16, 220, 0.3);
      burst(t + 0.05, 0.08, 900, 0.08);
      burst(t + 0.22, 0.1, 260, 0.12);
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
  osc.connect(g).connect(sink ?? master!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function bell(t: number, freq: number, dur: number, level: number): void {
  const osc = ctx!.createOscillator();
  osc.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(sink ?? master!);
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
  src.connect(bp).connect(g).connect(sink ?? master!);
  src.start(t);
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// --- Ambience beds -------------------------------------------------------
// One very quiet bed per level style, built from looped noise, a few
// oscillators and sparse one-shot events. setAmbience() fades the old bed out
// while the new one fades in, so there is never a click or a gap.

let bedBus: GainNode | null = null;
let pulseBus: GainNode | null = null;
let wantedBed: string | null = null; // asked for before the audio engine started
let bed: Bed | null = null;
let bedNoiseBuf: AudioBuffer | null = null;

interface Bed {
  style: LevelStyle;
  gain: GainNode;
  trim: number;
  sources: AudioScheduledSourceNode[];
  events: { min: number; max: number; at: number; fire: (t: number) => void }[];
  dead: boolean;
}

/** Test hook: the nodes the beds and the pulse play through. */
export function debugAudio() {
  return {
    ctx,
    master,
    bedBus,
    pulseBus,
    bedStyle: bed?.style ?? null,
    /** Fire every one-shot of the current bed right now. */
    fireBedEvents: () => bed?.events.forEach((e) => e.fire(ctx!.currentTime + 0.05)),
  };
}

const bedLevel = (b: Bed) => b.trim * (calm ? 0.6 : 1);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const side = () => (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.9);

/** Fade the ambience to the bed for this level (null: silence). Safe to call before the engine starts. */
export function setAmbience(levelId: string | null): void {
  wantedBed = levelId;
  if (!ctx || !bedBus) return;
  const style = LEVELS.find((l) => l.id === levelId)?.style ?? null;
  if (bed && bed.style === style) return;
  if (bed) retire(bed);
  bed = null;
  if (!style) return;
  const b: Bed = { style, gain: ctx.createGain(), trim: BED_TRIM[style], sources: [], events: [], dead: false };
  b.gain.gain.value = 0;
  b.gain.connect(bedBus);
  BEDS[style](b);
  b.gain.gain.setTargetAtTime(bedLevel(b), ctx.currentTime, 1.6);
  bed = b;
}

function retire(b: Bed): void {
  b.dead = true;
  const c = ctx!;
  b.gain.gain.cancelScheduledValues(c.currentTime);
  b.gain.gain.setTargetAtTime(0, c.currentTime, 1.2);
  window.setTimeout(() => {
    for (const s of b.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    b.gain.disconnect();
  }, 9000);
}

function tickBeds(): void {
  if (!ctx || !bed) return;
  const now = ctx.currentTime;
  for (const e of bed.events) {
    if (e.at > now) continue;
    // Muted or in a background tab: keep time, but make no sounds nobody can hear.
    if (!muted && !document.hidden) e.fire(now + 0.05);
    e.at = now + rand(e.min, e.max);
  }
}

// Building blocks. Every one of them sends into the bed's own gain.
function bedNoise(): AudioBuffer {
  return (bedNoiseBuf ??= noiseBuffer(ctx!, 5));
}

function hiss(b: Bed, type: BiquadFilterType, freq: number, q: number, level: number, dest: AudioNode = b.gain) {
  const src = ctx!.createBufferSource();
  src.buffer = bedNoise();
  src.loop = true;
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx!.createGain();
  g.gain.value = level;
  src.connect(f).connect(g).connect(dest);
  src.start(0, Math.random() * 4);
  b.sources.push(src);
  return { f, g };
}

function drone(b: Bed, type: OscillatorType, freq: number, level: number, dest: AudioNode = b.gain) {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.value = level;
  o.connect(g).connect(dest);
  o.start();
  b.sources.push(o);
  return { o, g };
}

/** A slow wobble on any parameter. */
function sway(b: Bed, param: AudioParam, rate: number, depth: number): void {
  const o = ctx!.createOscillator();
  o.frequency.value = rate;
  const g = ctx!.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start();
  b.sources.push(o);
}

function every(b: Bed, min: number, max: number, fire: (t: number) => void): void {
  b.events.push({ min, max, at: ctx!.currentTime + rand(1, min), fire });
}

function place(pan: number | undefined, dest: AudioNode): AudioNode {
  if (!pan) return dest;
  const p = ctx!.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  p.connect(dest);
  return p;
}

interface Shot {
  freq: number;
  to?: number;
  dur: number;
  level: number;
  attack?: number;
  q?: number;
  pan?: number;
  type?: OscillatorType | BiquadFilterType;
  dest?: AudioNode;
}

function envelope(g: GainNode, t: number, o: Shot): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.level, t + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
}

/** A pitched blip: a drip, a ding, a squeak. */
function ping(b: Bed, t: number, o: Shot): void {
  const osc = ctx!.createOscillator();
  osc.type = (o.type as OscillatorType) ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = ctx!.createGain();
  envelope(g, t, o);
  osc.connect(g).connect(place(o.pan, o.dest ?? b.gain));
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

/** A filtered puff of noise: a thud, a tick, a clink, a splash. */
function puff(b: Bed, t: number, o: Shot): void {
  const src = ctx!.createBufferSource();
  src.buffer = bedNoise();
  const f = ctx!.createBiquadFilter();
  f.type = (o.type as BiquadFilterType) ?? "bandpass";
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 1;
  const g = ctx!.createGain();
  envelope(g, t, o);
  src.connect(f).connect(g).connect(place(o.pan, o.dest ?? b.gain));
  src.start(t, Math.random() * 4);
  src.stop(t + o.dur + 0.05);
}

/** A send that repeats and darkens: the warehouse, the cave. Returns the input. */
function echo(b: Bed, delay: number, feedback: number, dark: number, wet: number): GainNode {
  const input = ctx!.createGain();
  const d = ctx!.createDelay(2);
  d.delayTime.value = delay;
  const f = ctx!.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = dark;
  const fb = ctx!.createGain();
  fb.gain.value = feedback;
  const w = ctx!.createGain();
  w.gain.value = wet;
  input.connect(b.gain);
  input.connect(d);
  d.connect(f);
  f.connect(fb).connect(d);
  f.connect(w).connect(b.gain);
  return input;
}

/** Overall loudness of each bed (they differ a lot in raw noise energy). */
const BED_TRIM: Record<LevelStyle, number> = {
  halls: 0.044, aisles: 0.039, pipes: 0.069, machines: 0.054, openplan: 0.072,
  hotel: 0.049, flooded: 0.056, caves: 0.09, streets: 0.058, field: 0.031,
};

const BEDS: Record<LevelStyle, (b: Bed) => void> = {
  // Wet carpet room-tone, a door a long way off.
  halls(b) {
    const room = hiss(b, "lowpass", 260, 0.6, 2.2);
    sway(b, room.f.frequency, 0.05, 70);
    drone(b, "sine", 58, 0.05);
    const air = hiss(b, "bandpass", 1100, 0.7, 0.25);
    sway(b, air.g.gain, 0.07, 0.12);
    every(b, 24, 50, (t) => {
      const pan = side();
      puff(b, t, { type: "lowpass", freq: 150, dur: 0.4, level: 1.2, attack: 0.012, pan });
      puff(b, t + 0.3, { freq: 1900, q: 3, dur: 0.06, level: 0.25, pan });
    });
  },
  // A big empty room: low rumble and clanks that come back around.
  aisles(b) {
    const rumble = hiss(b, "lowpass", 130, 0.7, 1.7);
    sway(b, rumble.f.frequency, 0.04, 40);
    hiss(b, "bandpass", 900, 0.4, 0.9);
    hiss(b, "highpass", 3200, 0.5, 0.07);
    const verb = echo(b, 0.43, 0.55, 1300, 0.7);
    every(b, 7, 16, (t) => {
      const pan = side();
      ping(b, t, { freq: rand(650, 1100), dur: 0.5, level: 0.07, type: "triangle", pan, dest: verb });
      puff(b, t, { freq: 2400, q: 4, dur: 0.05, level: 0.2, pan, dest: verb });
    });
  },
  // Water in the walls.
  pipes(b) {
    const flow = hiss(b, "bandpass", 300, 0.8, 1.2);
    sway(b, flow.g.gain, 0.09, 0.5);
    drone(b, "sine", 46, 0.06);
    const verb = echo(b, 0.21, 0.4, 2600, 0.5);
    every(b, 1.4, 4.5, (t) => ping(b, t, { freq: rand(1500, 2600), to: rand(700, 1000), dur: 0.09, level: 0.12, pan: side(), dest: verb }));
    every(b, 6, 15, (t) => {
      const pan = side();
      puff(b, t, { freq: 3200, q: 9, dur: 0.04, level: 0.3, pan });
      ping(b, t + 0.01, { freq: 190, to: 150, dur: 0.18, level: 0.14, pan, type: "triangle" });
    });
  },
  // A machine room: mains drone, a slow beat between two motors, clanks.
  machines(b) {
    const lp = ctx!.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.connect(b.gain);
    drone(b, "sawtooth", 60, 0.1, lp);
    drone(b, "sawtooth", 60.6, 0.08, lp);
    drone(b, "square", 120.9, 0.03, lp);
    const g = drone(b, "sine", 30, 0.16);
    sway(b, g.g.gain, 0.2, 0.04);
    hiss(b, "lowpass", 600, 0.5, 0.55);
    every(b, 5, 12, (t) => {
      const pan = side();
      puff(b, t, { freq: 780, q: 2.5, dur: 0.18, level: 0.5, pan });
      for (const [i, f] of [220, 341, 587].entries()) ping(b, t, { freq: f, dur: 0.45 - i * 0.1, level: 0.09, pan, type: "triangle" });
    });
  },
  // Almost nobody here. Somebody typing, a long way away.
  openplan(b) {
    const room = hiss(b, "lowpass", 420, 0.5, 1.1);
    sway(b, room.f.frequency, 0.06, 90);
    hiss(b, "highpass", 5200, 0.5, 0.04);
    every(b, 7, 18, (t) => {
      const pan = side();
      let at = t;
      for (let i = 0, n = Math.floor(rand(4, 12)); i < n; i++) {
        puff(b, at, { freq: rand(2200, 3600), q: 2, dur: 0.025, level: rand(0.1, 0.22), pan });
        at += rand(0.07, 0.24) * (Math.random() < 0.15 ? 3 : 1);
      }
    });
    every(b, 16, 38, (t) => {
      const f = rand(780, 1100);
      ping(b, t, { freq: f, to: f * 1.45, dur: 0.28, level: 0.05, attack: 0.05, type: "sawtooth", pan: side(), dest: squeakFilter() });
    });
  },
  // Warm corridor hum, a lift that dings, a television through the wall.
  hotel(b) {
    const room = hiss(b, "lowpass", 300, 0.6, 1.8);
    sway(b, room.f.frequency, 0.05, 50);
    drone(b, "sine", 110, 0.05);
    const muffle = ctx!.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = 2300;
    muffle.connect(b.gain);
    // Voices: noise through two formant-ish bands, chopped at speech speed.
    const tv = ctx!.createGain();
    tv.gain.value = 0.5;
    sway(b, tv.gain, 3.7, 0.3);
    sway(b, tv.gain, 0.37, 0.2);
    hiss(b, "bandpass", 640, 1.6, 0.9, tv);
    hiss(b, "bandpass", 1650, 2, 0.5, tv);
    tv.connect(place(-0.6, muffle));
    every(b, 28, 55, (t) => {
      const pan = side();
      ping(b, t, { freq: 988, dur: 1.5, level: 0.06, pan, dest: muffle });
      ping(b, t + 0.55, { freq: 784, dur: 1.9, level: 0.06, pan, dest: muffle });
    });
  },
  // Standing water: a swell that laps, the odd drip.
  flooded(b) {
    const lap = hiss(b, "lowpass", 480, 0.7, 1);
    sway(b, lap.g.gain, 0.16, 0.8);
    sway(b, lap.f.frequency, 0.11, 120);
    const slosh = hiss(b, "bandpass", 900, 1.5, 0.15);
    sway(b, slosh.g.gain, 0.23, 0.12);
    hiss(b, "lowpass", 90, 0.5, 1.5);
    every(b, 3, 8, (t) => puff(b, t, { type: "lowpass", freq: rand(500, 900), dur: 1.6, level: 0.8, attack: 0.4, pan: side() }));
    every(b, 5, 12, (t) => ping(b, t, { freq: rand(500, 800), to: rand(250, 350), dur: 0.14, level: 0.1, pan: side() }));
  },
  // Wind finding its way along rock, drips that fall a long way.
  caves(b) {
    const w1 = hiss(b, "bandpass", 340, 2.5, 1.4);
    sway(b, w1.f.frequency, 0.08, 120);
    const w2 = hiss(b, "bandpass", 760, 3, 0.6);
    sway(b, w2.f.frequency, 0.05, 220);
    sway(b, w2.g.gain, 0.06, 0.3);
    const verb = echo(b, 0.52, 0.6, 1800, 0.8);
    every(b, 3.5, 9, (t) => ping(b, t, { freq: rand(900, 1700), to: rand(450, 700), dur: 0.1, level: 0.1, pan: side(), dest: verb }));
  },
  // Night: crickets in the verge, a siren somewhere else.
  streets(b) {
    hiss(b, "bandpass", 420, 0.4, 0.9);
    const mix = ctx!.createGain();
    mix.gain.value = 0.05;
    mix.connect(b.gain);
    for (const [f, rate, gate, pan] of [[4300, 31, 1.9, -0.5], [4720, 27, 2.4, 0.4], [3900, 34, 1.4, 0.1]] as const) {
      // The carrier is chopped fast (the trill) and then in groups (the chirp).
      const trill = ctx!.createGain();
      trill.gain.value = 0.5;
      sway(b, trill.gain, rate, 0.5);
      const chirp = ctx!.createGain();
      chirp.gain.value = 0.5;
      sway(b, chirp.gain, gate, 0.5);
      chirp.connect(place(pan, mix));
      drone(b, "sine", f, 1, trill);
      trill.connect(chirp);
    }
    every(b, 50, 100, (t) => {
      const pan = Math.random() < 0.5 ? -0.7 : 0.7;
      const lp = ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      const g = ctx!.createGain();
      const o = ctx!.createOscillator();
      o.type = "triangle";
      for (let i = 0; i < 3; i++) {
        o.frequency.linearRampToValueAtTime(i % 2 ? 640 : 880, t + i * 1.8 + 1.8);
      }
      o.frequency.setValueAtTime(640, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 1.5);
      g.gain.setValueAtTime(0.05, t + 4);
      g.gain.linearRampToValueAtTime(0, t + 6);
      o.connect(lp).connect(g).connect(place(pan, b.gain));
      o.start(t);
      o.stop(t + 6.2);
    });
  },
  // Wind through the wheat: slow swells of hush.
  field(b) {
    const a = hiss(b, "bandpass", 2400, 0.9, 0.9);
    sway(b, a.g.gain, 0.11, 0.6);
    sway(b, a.f.frequency, 0.07, 500);
    const c = hiss(b, "bandpass", 5500, 0.8, 0.7);
    sway(b, c.g.gain, 0.17, 0.4);
    const low = hiss(b, "lowpass", 220, 0.5, 0.25);
    sway(b, low.g.gain, 0.05, 0.15);
  },
};

// Squeaks go through a narrow band so they sound like a chair, not a siren.
function squeakFilter(): BiquadFilterNode {
  const f = ctx!.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1500;
  f.Q.value = 1.5;
  f.connect(bed?.gain ?? bedBus!);
  return f;
}

// --- Infection pulse -----------------------------------------------------
// A slow heartbeat under everything. The rate and the level follow the value.

let pulseValue = 0;
let pulseNext = 0;

/** 0..1: how far the infection has got. Under about 0.03 there is no pulse. */
export function setInfectionPulse(v: number): void {
  pulseValue = clamp(v, 0, 1);
}

function tickPulse(): void {
  if (!ctx || !pulseBus) return;
  const v = pulseValue;
  if (muted || document.hidden || v < 0.03) {
    pulseNext = Math.max(pulseNext, ctx.currentTime + 0.1);
    return;
  }
  const period = 60 / (52 + v * 68); // 52 bpm rising to 120
  while (pulseNext < ctx.currentTime + 0.5) {
    beat(Math.max(pulseNext, ctx.currentTime + 0.02), v);
    pulseNext += period;
  }
}

function beat(t: number, v: number): void {
  const level = (0.03 + 0.12 * v) * (calm ? 0.5 : 1);
  const thud = (at: number, f0: number, f1: number, amp: number, dur: number) => {
    for (const [mul, a] of [[1, amp], [2.1, amp * 0.3]] as const) {
      const o = ctx!.createOscillator();
      o.frequency.setValueAtTime(f0 * mul, at);
      o.frequency.exponentialRampToValueAtTime(f1 * mul, at + dur);
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(a, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(pulseBus!);
      o.start(at);
      o.stop(at + dur + 0.02);
    }
  };
  thud(t, 62, 42, level, 0.22);
  thud(t + 0.19 - v * 0.04, 54, 38, level * 0.7, 0.2);
}
