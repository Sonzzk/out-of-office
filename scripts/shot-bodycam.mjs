// Takes a few frames of the body camera feed during a run (for eyeballing).
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const level = process.argv[2] ?? "level-0";
const server = await createServer({ server: { port: 5217 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => r.status() === 404 && !r.url().includes("favicon") && errors.push("404 " + r.url()));
await page.goto("http://localhost:5217/?seed=7");
await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) await page.locator("[data-hire]:not([disabled])").first().click();
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const cb = await map.locator("canvas.map").boundingBox();
await map.locator("canvas.map").click({ position: { x: cb.width * 0.8, y: cb.height * 0.5 } });
await map.locator("[data-send]").click();
await map.locator("canvas.bodycam").waitFor();
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `shots/bodycam-${i}.png` });
  await map.locator("canvas.bodycam").screenshot({ path: `shots/bodycam-cam-${i}.png` });
}
await browser.close();
await server.close();
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "ok");
