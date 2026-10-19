// Play-test for the level picker: unlock levels 1 to 5 in a save, look at each
// one's map, and send a crew into the hotel. Screenshots go to shots/levels-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5201 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5201/?seed=61&fast`);
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 3; i++) { await page.locator('[data-fold][aria-expanded="false"]').first().click({ timeout: 400 }).catch(() => {}); await page.locator("[data-hire]:not([disabled])").first().click(); }
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.index["level-0"].stage = 2;
  for (let d = 1; d <= 5; d++) s.index[`level-${d}`] = { stage: 1, count: 0, dataSold: 0 };
  // Reveal every map so the screenshots show the layouts.
  s.fog = {};
  for (let d = 1; d <= 4; d++) s.fog[`level-${d}`] = new Array(600).fill(1);
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5201/?fast`);
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (let d = 1; d <= 5; d++) {
  await map.locator(`[data-level="level-${d}"]`).click();
  await page.screenshot({ path: `shots/levels-${d}.png` });
}
console.log("level tabs:", (await map.locator(".levels").textContent()).replace(/\s+/g, " "));
console.log("hotel blurb:", (await map.locator(".lvname").textContent()).replace(/\s+/g, " "));

// Send everyone into the hotel and watch for the front desk.
const ids = await map.locator("input[data-pick]").evaluateAll((els) => els.map((e) => e.dataset.pick));
for (const id of ids) await map.locator(`input[data-pick="${id}"]`).check();
const cb = await map.locator("canvas").boundingBox();
await map.locator("canvas").click({ position: { x: cb.width * 0.9, y: cb.height * 0.2 } });
await map.locator("[data-send]").click();
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/levels-hotel-run.png" });
await map.locator(".debrief").waitFor({ timeout: 30000 });
console.log("hotel debrief:", (await map.locator(".debrief").textContent()).replace(/\s+/g, " ").slice(0, 300));

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
