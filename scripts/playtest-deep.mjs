// Play-test for Levels 6 to 10: unlock them in a save, look at each map, and
// send a crew into the Wheat Field. Screenshots go to shots/deep-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5205 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5205/?seed=${process.env.SEED ?? "71"}&fast`);
await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.click('[data-open="hr"]');
for (let i = 0; i < 3; i++) await page.locator("[data-hire]:not([disabled])").first().click();
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.cash = 4000;
  s.index["level-0"].stage = 2;
  for (let d = 1; d <= 10; d++) s.index[`level-${d}`] = { stage: 1, count: 0, dataSold: 0 };
  // Show every map except the Wheat Field, so its limited sight is visible.
  s.fog = {};
  for (let d = 6; d <= 9; d++) s.fog[`level-${d}`] = new Array(600).fill(1);
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5205/?fast`);
await page.waitForSelector("[data-clockin], #desk .win");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .win");
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (let d = 6; d <= 10; d++) {
  await map.locator(`[data-level="level-${d}"]`).click();
  await page.screenshot({ path: `shots/deep-${d}.png` });
}
console.log("level tabs:", (await map.locator(".levels").textContent()).replace(/\s+/g, " "));

// Send everyone into the Wheat Field with rope and a radio, and answer the farmhouse if it rings.
await map.locator('[data-level="level-10"]').click();
const ids = await map.locator("input[data-pick]").evaluateAll((els) => els.map((e) => e.dataset.pick));
for (const id of ids) await map.locator(`input[data-pick="${id}"]`).check();
for (const g of ["rope", "radio"]) await map.locator(`input[data-gear="${g}"]`).check();
const cb = await map.locator("canvas").boundingBox();
await map.locator("canvas").click({ position: { x: cb.width * 0.85, y: cb.height * 0.5 } });
await map.locator("[data-send]").click();
await page.waitForTimeout(500);
await page.screenshot({ path: "shots/deep-wheat-run.png" });
await map.locator(".debrief").waitFor({ timeout: 60000 });
console.log("wheat debrief:", (await map.locator(".debrief").textContent()).replace(/\s+/g, " ").slice(0, 300));

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
