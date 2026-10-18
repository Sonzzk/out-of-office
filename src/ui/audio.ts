// All sound is synthesized with WebAudio, so there are no audio files to ship.
// The office hum is mains hum (50/100/150 Hz) plus a ballast whine and room
// noise. Browsers only allow sound after a click, so startAudio() is called
// from the boot screen's button.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hum: GainNode | null = null;
let muted = false;

const MUTE_KEY = "out-of-office.muted";
const HUM_LEVEL = 0.05;

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // Storage can be blocked; default to sound on.
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
  if (ctx && master) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.05);
}

export function startAudio(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
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

type Sfx = "click" | "open" | "close" | "ding" | "tick" | "type" | "memo";

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
