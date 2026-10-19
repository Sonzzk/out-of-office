// Play-test for the ambience beds, the infection pulse and the panned cues.
// Nothing here can be heard: it taps the beds in headless Chromium and measures
// level, clipping, NaNs, silence gaps, click-free crossfades and how different
// the beds are from each other (octave-band spectra). Whether any of it SOUNDS
// good is for a person to judge by ear.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5303 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push("page " + e.message));
await page.goto("http://localhost:5303/?seed=21&fast");
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.type("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");

// Tools inside the page: a tap on any node, and the analysis.
await page.evaluate(async () => {
  const A = await import("/src/ui/audio.ts");
  window.A = A;
  const d = A.debugAudio();
  const ctx = d.ctx;
  window.tapOf = (node) => {
    const sp = ctx.createScriptProcessor(4096, 2, 2);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(sp);
    sp.connect(mute).connect(ctx.destination);
    const t = { L: [], R: [], on: false };
    sp.onaudioprocess = (e) => {
      if (!t.on) return;
      t.L.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      t.R.push(new Float32Array(e.inputBuffer.getChannelData(1)));
    };
    return t;
  };
  window.bedTap = window.tapOf(d.bedBus);
  window.pulseTap = window.tapOf(d.pulseBus);
  window.masterTap = window.tapOf(d.master);
  const cat = (chunks) => {
    const n = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Float32Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  };
  window.take = (t) => { const r = { L: cat(t.L), R: cat(t.R) }; t.L = []; t.R = []; return r; };
  window.stats = (x, sr) => {
    let sum = 0, peak = 0, nan = 0, maxDiff = 0;
    for (let i = 0; i < x.L.length; i++) {
      for (const v of [x.L[i], x.R[i]]) {
        if (!Number.isFinite(v)) { nan++; continue; }
        sum += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      if (i) maxDiff = Math.max(maxDiff, Math.abs(x.L[i] - x.L[i - 1]), Math.abs(x.R[i] - x.R[i - 1]));
    }
    const rms = Math.sqrt(sum / (2 * x.L.length));
    // 100 ms windows: any that is dead silent is a gap.
    const w = Math.floor(sr / 10);
    const wins = [];
    for (let s = 0; s + w <= x.L.length; s += w) {
      let a = 0;
      for (let i = s; i < s + w; i++) a += x.L[i] ** 2 + x.R[i] ** 2;
      wins.push(Math.sqrt(a / (2 * w)));
    }
    return { rms, peak, nan, maxDiff, winMin: Math.min(...wins), winMax: Math.max(...wins), gaps: wins.filter((v) => v < 1e-6).length, wins };
  };
  // Octave-ish band powers (dB) from an averaged, windowed FFT.
  window.spectrum = (x, sr) => {
    const N = 8192;
    const edges = [0, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 22050];
    const power = new Float64Array(N / 2);
    const fft = (re, im) => {
      for (let i = 1, j = 0; i < N; i++) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        for (let i = 0; i < N; i += len) {
          for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
            const a = i + k, b = i + k + len / 2;
            const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
    };
    let frames = 0;
    for (const ch of [x.L, x.R]) {
      for (let s = 0; s + N <= ch.length; s += N / 2) {
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = ch[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        fft(re, im);
        for (let i = 0; i < N / 2; i++) power[i] += re[i] ** 2 + im[i] ** 2;
        frames++;
      }
    }
    const bands = edges.slice(0, -1).map((lo, bi) => {
      let p = 0;
      for (let i = 1; i < N / 2; i++) { const f = (i * sr) / N; if (f >= lo && f < edges[bi + 1]) p += power[i]; }
      return p / frames;
    });
    const total = bands.reduce((a, b) => a + b, 0) || 1e-30;
    return bands.map((p) => 10 * Math.log10(p / total + 1e-12)); // share of the bed's energy, in dB
  };
  window.sr = ctx.sampleRate;
});

const wait = (ms) => page.waitForTimeout(ms);
const take = (tap) => page.evaluate((t) => { const x = window.take(window[t]); return window.stats(x, window.sr); }, tap);
const REC = 14_000;
const levels = [
  ["halls", "level-0"], ["aisles", "level-1"], ["pipes", "level-2"], ["machines", "level-3"], ["openplan", "level-4"],
  ["hotel", "level-5"], ["flooded", "level-7"], ["caves", "level-8"], ["streets", "level-9"], ["field", "level-10"],
];
const f2 = (v) => v.toFixed(4);
const specs = {};
const rmsOf = {};
const evDiff = {}; // largest sample step with every one-shot firing: what a fade may contain without being a click

for (const [style, id] of levels) {
  await page.evaluate((i) => { window.A.setAmbience(i); }, id);
  await wait(6000); // fade in
  const bedStyle = await page.evaluate(() => window.A.debugAudio().bedStyle);
  if (bedStyle !== style) fail(`${id} should give bed ${style}, got ${bedStyle}`);
  await page.evaluate(() => { window.bedTap.on = true; });
  await wait(REC);
  const { s, sp } = await page.evaluate(() => {
    window.bedTap.on = false;
    const x = window.take(window.bedTap);
    return { s: (({ wins, ...r }) => r)(window.stats(x, window.sr)), sp: window.spectrum(x, window.sr) };
  });
  // Peak with every one-shot forced to fire at once.
  await page.evaluate(() => { window.bedTap.on = true; window.A.debugAudio().fireBedEvents(); });
  await wait(4500);
  const ev = await page.evaluate(() => { window.bedTap.on = false; const { wins, ...r } = window.stats(window.take(window.bedTap), window.sr); return r; });
  specs[style] = sp;
  evDiff[style] = Math.max(ev.maxDiff, s.maxDiff);
  rmsOf[style] = s.rms;
  console.log(
    `${style.padEnd(9)} rms ${f2(s.rms)}  peak ${f2(s.peak)}  win rms ${f2(s.winMin)}..${f2(s.winMax)}  gaps ${s.gaps}  nan ${s.nan}  | all events at once: peak ${f2(ev.peak)}`,
  );
  if (s.nan || ev.nan) fail(`${style}: NaN samples`);
  if (s.peak >= 0.9 || ev.peak >= 0.9) fail(`${style}: peak too high`);
  if (s.gaps) fail(`${style}: ${s.gaps} silent 100ms windows`);
  if (s.rms < 0.001) fail(`${style}: bed is inaudibly quiet (rms ${s.rms})`);
  if (s.rms > 0.02) fail(`${style}: bed is not quiet (rms ${s.rms})`);
  if (s.winMax > 4 * s.winMin + 0.003) fail(`${style}: level swings too much between windows`);
}

console.log("\nBand shares (dB of the bed's own energy) for bands <60 60 120 250 500 1k 2k 4k 8k+");
for (const k of Object.keys(specs)) console.log(k.padEnd(9), specs[k].map((v) => v.toFixed(0).padStart(4)).join(""));
const keys = Object.keys(specs);
let minD = 99, minPair = "";
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const d = Math.sqrt(specs[keys[i]].reduce((a, v, n) => a + (v - specs[keys[j]][n]) ** 2, 0) / specs[keys[i]].length);
  if (d < minD) { minD = d; minPair = `${keys[i]}/${keys[j]}`; }
  if (d < 3) fail(`${keys[i]} and ${keys[j]} sound alike (spectral distance ${d.toFixed(1)} dB)`);
}
console.log(`closest pair: ${minPair}, rms spectral distance ${minD.toFixed(1)} dB`);

// Crossfade: no click, no dip, in either direction and into silence.
console.log("");
const xfade = async (label, from, to) => {
  const sty = (id) => levels.find((l) => l[1] === id)?.[0];
  const seg = (ms) => page.waitForTimeout(ms).then(() => page.evaluate(() => { window.bedTap.on = false; const { wins, ...r } = window.stats(window.take(window.bedTap), window.sr); return r; }));
  await page.evaluate((i) => window.A.setAmbience(i), from);
  await wait(6000);
  await page.evaluate(() => { window.bedTap.on = true; });
  const before = await seg(2500);
  await page.evaluate((i) => { window.bedTap.on = true; window.A.setAmbience(i); }, to);
  const across = await seg(7000);
  await page.evaluate(() => { window.bedTap.on = true; });
  const after = await seg(2500);
  const lim = Math.max(before.maxDiff, after.maxDiff, evDiff[sty(from)] ?? 0, evDiff[sty(to)] ?? 0) * 1.3 + 0.002;
  console.log(`${label}: maxDiff before ${f2(before.maxDiff)}, across fade ${f2(across.maxDiff)}, after ${f2(after.maxDiff)}, peak ${f2(across.peak)}, nan ${across.nan}`);
  if (across.nan) fail(`${label}: NaN`);
  if (across.peak >= 0.9) fail(`${label}: peak too high`);
  if (across.maxDiff > lim) fail(`${label}: click across the crossfade`);
};
await xfade("halls -> machines", "level-0", "level-3");
await xfade("machines -> field", "level-3", "level-10");
await xfade("field -> none", "level-10", null);
const after = await page.evaluate(() => window.A.debugAudio().bedStyle);
if (after !== null) fail("setAmbience(null) left a bed");

// Calm mode lowers the bed.
await page.evaluate(() => window.A.setCalm(false));
await page.evaluate(() => window.A.setAmbience("level-9"));
await wait(6000);
await page.evaluate(() => { window.bedTap.on = true; });
await wait(8000);
const loud = await page.evaluate(() => { window.bedTap.on = false; return window.stats(window.take(window.bedTap), window.sr).rms; });
await page.evaluate(() => window.A.setCalm(true));
await wait(4000);
await page.evaluate(() => { window.take(window.bedTap); window.bedTap.on = true; });
await wait(8000);
const soft = await page.evaluate(() => { window.bedTap.on = false; return window.stats(window.take(window.bedTap), window.sr).rms; });
console.log(`calm: streets rms ${f2(loud)} -> ${f2(soft)} (ratio ${(soft / loud).toFixed(2)}, expect about 0.6)`);
if (!(soft / loud < 0.75 && soft / loud > 0.4)) fail("calm mode does not lower the bed as expected");
await page.evaluate(() => window.A.setCalm(false));

// Muted: nothing reaches the output at all.
await page.evaluate(() => window.A.setMuted(true));
await wait(1500);
await page.evaluate(() => { window.take(window.masterTap); window.masterTap.on = true; });
await wait(2000);
const mut = await page.evaluate(() => { window.masterTap.on = false; return window.stats(window.take(window.masterTap), window.sr).peak; });
console.log(`muted: master peak ${mut.toExponential(2)}`);
if (mut > 1e-4) fail("mute leaks sound");
await page.evaluate(() => window.A.setMuted(false));
await page.evaluate(() => window.A.setAmbience(null));
await wait(1500);

// Infection pulse: rate and level follow the value.
console.log("");
const beats = [];
for (const v of [0, 0.25, 0.6, 1]) {
  await page.evaluate((x) => window.A.setInfectionPulse(x), v);
  await wait(2500);
  await page.evaluate(() => { window.take(window.pulseTap); window.pulseTap.on = true; });
  await wait(10_000);
  const r = await page.evaluate(() => {
    window.pulseTap.on = false;
    const x = window.take(window.pulseTap);
    const st = window.stats(x, window.sr);
    // Count beats: rising edges of the 20 ms envelope past half the max, at least 0.3 s apart.
    const w = Math.floor(window.sr / 50);
    const env = [];
    for (let s = 0; s + w <= x.L.length; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += x.L[i] ** 2; env.push(Math.sqrt(a / w)); }
    const thr = Math.max(...env) * 0.5;
    let n = 0, last = -99;
    for (let i = 1; i < env.length; i++) if (env[i] >= thr && env[i - 1] < thr && thr > 1e-5 && i - last > 15) { n++; last = i; }
    return { rms: st.rms, peak: st.peak, nan: st.nan, bpm: (n * 60) / (env.length / 50) };
  });
  beats.push(r);
  console.log(`pulse ${v}: rms ${r.rms.toFixed(4)}  peak ${r.peak.toFixed(3)}  about ${r.bpm.toFixed(0)} beats/min`);
  if (r.nan || r.peak >= 0.9) fail(`pulse ${v}: nan or clipping`);
}
await page.evaluate(() => window.A.setInfectionPulse(0));
if (beats[0].rms > 1e-5) fail("pulse at 0 is not silent");
if (!(beats[1].rms < beats[2].rms && beats[2].rms < beats[3].rms)) fail("pulse level does not rise with the value");
if (!(beats[1].bpm < beats[3].bpm - 20)) fail("pulse rate does not rise with the value");

// Panned cues: with pan -1 the left channel carries the bell and the right does not.
await wait(1500);
const cue = async (label, opts) => {
  await page.evaluate(() => { window.take(window.masterTap); window.masterTap.on = true; });
  await page.evaluate((o) => (o ? window.A.sfx("call-bell", o) : window.A.sfx("call-bell")), opts);
  await wait(1800);
  const r = await page.evaluate(() => {
    window.masterTap.on = false;
    const x = window.take(window.masterTap);
    let l = 0, rr = 0, d = 0;
    for (let i = 0; i < x.L.length; i++) { l += x.L[i] ** 2; rr += x.R[i] ** 2; d += (x.L[i] - x.R[i]) ** 2; }
    return { L: Math.sqrt(l / x.L.length), R: Math.sqrt(rr / x.L.length), diff: Math.sqrt(d / x.L.length) };
  });
  console.log(`call-bell ${label}: L ${r.L.toFixed(4)} R ${r.R.toFixed(4)} |L-R| ${r.diff.toFixed(4)}`);
  return r;
};
const plain = await cue("plain", undefined);
const left = await cue("pan -1", { pan: -1 });
const right = await cue("pan +1", { pan: 1, gain: 1 });
const quiet = await cue("pan -1 gain 0", { pan: -1, gain: 0 });
if (plain.diff > 0.002) fail("a plain cue is not centred");
if (!(left.diff > plain.diff + 0.002 && left.L > left.R)) fail("pan -1 does not go left");
if (!(right.diff > plain.diff + 0.002 && right.R > right.L)) fail("pan +1 does not go right");
if (quiet.diff > 0.002) fail("gain 0 still sounds");
await page.evaluate(() => { for (const k of ["click", "open", "close", "ding", "tick", "type", "memo", "key", "return", "squelch", "step", "thump", "growl", "call-bell"]) window.A.sfx(k, { pan: 0.5, gain: 0.5 }); });

// Wiring: a running expedition sets the bed, a call or threat rings the bell once, the end clears the bed.
// All in one synchronous step, so the fast-forwarded sim cannot finish the run in between.
const w = await page.evaluate(async () => {
  const ctx = window.A.debugAudio().ctx;
  const oscs = [];
  const orig = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => { const o = orig(); oscs.push(o); return o; };
  const bells = () => oscs.filter((o) => o.frequency.value === 1568).length;
  const bed = () => window.A.debugAudio().bedStyle;
  const { update } = await import("/src/store.ts");
  const crew = await import("/src/sim/crew.ts");
  const ex = await import("/src/sim/expedition.ts");
  const r = {};
  const live = (s) => s.expeditions.find((x) => x.phase !== "done");
  update((s) => {
    const p = s.pool[0];
    s.cash += p.cost;
    crew.hire(s, p.id);
    r.started = !!ex.startExpedition(s, [s.crew[s.crew.length - 1].id], ex.levelOf(s, "level-0").entrance, undefined, "level-0");
  });
  r.bedRunning = bed();
  update((s) => { const e = live(s); e.call = { id: "closet", asked: e.tick }; }, "tick");
  r.afterCall = bells();
  update(() => {}, "tick");
  r.afterAgain = bells();
  update((s) => { const e = live(s); e.call = undefined; e.threat = { id: "x", asked: e.tick }; }, "tick");
  r.afterThreat = bells();
  update((s) => { for (const e of s.expeditions) { e.threat = undefined; e.phase = "done"; } });
  r.bedDone = bed();
  return r;
});
console.log("wiring:", JSON.stringify(w));
if (!w.started) fail("could not start an expedition for the wiring check");
if (w.bedRunning !== "halls") fail("a running expedition did not start its bed");
if (w.afterCall < 1 || w.afterAgain !== w.afterCall || w.afterThreat <= w.afterAgain) fail("bell should ring once per new call or threat");
if (w.bedDone !== null) fail("bed stayed on after the expedition ended");

await wait(500);
await browser.close();
await server.close();
if (errors.length) { console.log("\n" + errors.join("\n")); process.exit(1); }
console.log("\naudio2 ok (levels and spectra measured; tone quality not judged by ear)");
