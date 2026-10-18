// Regression: a finished run is still on the map after its lead has left the
// payroll (a rival's offer, a firing). The map must still draw, not go blank.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5215 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1858, height: 848 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5215/?seed=7&fast");
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) await page.locator("[data-hire]:not([disabled])").first().click();
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const cb = await map.locator("canvas").boundingBox();
await map.locator("canvas").click({ position: { x: cb.width * 0.85, y: cb.height * 0.3 } });
await map.locator("[data-send]").click();
await map.locator(".debrief").waitFor({ timeout: 30000 });

// Everyone on that run leaves the payroll, then the game is reloaded.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.crew = [];
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto("http://localhost:5215/?fast");
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
await page.click('[data-open="map"]').catch(() => {});
await page.waitForTimeout(500);
const side = (await page.locator('.win[data-app="map"] .expo .side').innerHTML().catch(() => "")).length;
console.log("map side panel html length:", side, "| errors:", errors.length ? errors.join(" | ") : "none");
await page.screenshot({ path: "shots/sold-crew-map.png" });
await browser.close();
await server.close();
if (errors.length || side < 500) process.exit(1);
