// The body cam should walk like a person: face where it is going, turn
// smoothly into corners, and not stare at a wall. Also checks the exit portal.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5333 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5333/?seed=7");
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) {
  await page.locator('[data-fold][aria-expanded="false"]').first().click({ timeout: 400 }).catch(() => {});
  await page.locator("[data-hire]:not([disabled])").first().click();
}
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const cb = await map.locator("canvas.map").boundingBox();
await map.locator("canvas.map").click({ position: { x: cb.width * 0.8, y: cb.height * 0.5 } });
await map.locator("[data-send]").click();
const cam = map.locator("canvas.bodycam");
await cam.waitFor();

const samples = [];
let portalBest = 0;
const teal = () =>
  cam.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 120 && d[i + 2] > 110 && d[i] < d[i + 1] * 0.8) n++;
    return n;
  });
let shots = 0;
const t0 = Date.now();
while (Date.now() - t0 < 70000) {
  if (samples.length % 20 === 0) {
    const n = await teal();
    if (n > portalBest) {
      portalBest = n;
      await cam.screenshot({ path: "shots/camnatural-portal.png" });
    }
  }
  const v = await cam.getAttribute("data-cam");
  if (v) {
    const [a, o, m] = v.split(" ").map(Number);
    samples.push({ t: Date.now() - t0, a, o, m });
  }
  if (shots < 6 && samples.length % 40 === 0) await cam.screenshot({ path: `shots/camnatural-${shots++}.png` });
  await page.waitForTimeout(50);
}
const walking = samples.filter((s) => s.m);
const wallStare = walking.filter((s) => s.o < 1.2).length / Math.max(1, walking.length);
let maxRate = 0;
for (let i = 1; i < samples.length; i++) {
  const dt = (samples[i].t - samples[i - 1].t) / 1000;
  if (dt < 0.04 || !samples[i].m || !samples[i - 1].m) continue; // a new feed starts at angle 0, so only judge walking frames // two reads of nearly the same frame say nothing about speed
  const d = Math.atan2(Math.sin(samples[i].a - samples[i - 1].a), Math.cos(samples[i].a - samples[i - 1].a));
  maxRate = Math.max(maxRate, Math.abs(d) / dt);
}
console.log(`portal pixels (best frame): ${portalBest}`);
console.log(`samples ${samples.length}, walking ${walking.length}, facing a near wall while walking: ${(wallStare * 100).toFixed(0)}%, max turn ${maxRate.toFixed(1)} rad/s`);
await browser.close();
await server.close();
const fail = [];
if (walking.length < 20) fail.push("never saw the crew walk");
if (wallStare > 0.2) fail.push("stares at walls while walking");
if (maxRate > 12) fail.push("turns like a turret");
if (errors.length) fail.push(errors.join("; "));
if (fail.length) {
  console.error("FAIL", fail.join(" | "));
  process.exit(1);
}
console.log("camnatural ok");
