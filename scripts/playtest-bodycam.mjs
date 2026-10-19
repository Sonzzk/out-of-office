// The body camera feed draws a picture (not a blank canvas) while a run is out, and never throws.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5217 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5217/?seed=7");
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) { await page.locator('[data-fold][aria-expanded="false"]').first().click({ timeout: 400 }).catch(() => {}); await page.locator("[data-hire]:not([disabled])").first().click(); }
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const cb = await map.locator("canvas.map").boundingBox();
for (const [fx, fy] of [[0.3, 0.5], [0.55, 0.4], [0.8, 0.5]]) await map.locator("canvas.map").click({ position: { x: cb.width * fx, y: cb.height * fy } });
if (!/3 of 5 pins/.test(await map.innerText())) errors.push("three pins were not counted");
await map.locator("[data-send]").click();
const cam = map.locator("canvas.bodycam");
await cam.waitFor();
await page.waitForTimeout(1500);
// Distinct colours in the frame: a blank or single-colour canvas has very few.
const colours = () =>
  cam.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 16) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return seen.size;
  });
const a = await colours();
if (a < 40) errors.push(`body cam looks blank (${a} colours)`);
const b64a = await cam.evaluate((c) => c.toDataURL());
await page.waitForTimeout(800);
const b64b = await cam.evaluate((c) => c.toDataURL());
if (b64a === b64b) errors.push("body cam is not animating");
// The feed must not break the window when the tab list changes.
await page.click('[data-run="plan"]').catch(() => {});
await browser.close();
await server.close();
if (errors.length) { console.error("FAIL\n" + errors.join("\n")); process.exit(1); }
console.log(`bodycam playtest ok (${a} colours)`);
