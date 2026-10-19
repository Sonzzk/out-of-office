// Play-test for the roster: pack gear, send a crew into Level 4 and look at
// the new creatures on the map, then check the Index lists all 20 entities.
// Screenshots go to shots/roster-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5202 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5202/?seed=${process.env.SEED ?? "33"}&fast`);
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
  s.cash = 2000;
  for (let d = 0; d <= 4; d++) s.index[`level-${d}`] = { stage: d < 4 ? 2 : 1, count: 0, dataSold: 0 };
  s.fog = { "level-4": new Array(600).fill(1) };
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5202/?fast`);
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
await map.locator('[data-level="level-4"]').click();
const ids = await map.locator("input[data-pick]").evaluateAll((els) => els.map((e) => e.dataset.pick));
for (const id of ids.slice(0, 2)) await map.locator(`input[data-pick="${id}"]`).check();
for (const g of ["rope", "firstaid", "repellent"]) await map.locator(`input[data-gear="${g}"]`).check();
const cb = await map.locator("canvas").boundingBox();
await map.locator("canvas").click({ position: { x: cb.width * 0.8, y: cb.height * 0.5 } });
await page.screenshot({ path: "shots/roster-1-gear.png" });
await map.locator("[data-send]").click();
// Wait until something other than the first three creatures has been spotted.
await page.waitForFunction(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save") ?? "{}");
  const e = s.expeditions?.find((x) => x.phase !== "done");
  return !e || e.entities.some((r) => r.seen && !["smiler", "hound", "faceling"].includes(r.id));
}, null, { timeout: 30000, polling: 50 });
const spotted = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  const e = s.expeditions.find((x) => x.phase !== "done");
  return e ? e.entities.filter((r) => r.seen).map((r) => r.id) : [];
});
console.log("spotted mid-run:", spotted);
await page.screenshot({ path: "shots/roster-2-run.png" });
console.log("run header:", (await map.locator(".runhead").first().innerHTML()).match(/title="[^"]+"/g));
await map.locator(".debrief").waitFor({ timeout: 40000 });
console.log("debrief:", (await map.locator(".debrief").textContent()).replace(/\s+/g, " ").slice(0, 300));
await page.click('[data-open="ledger"]');
console.log("ledger gear lines:", await page.locator('.win[data-app="ledger"]').getByText("Gear:").count());

await page.click('[data-open="index"]');
const index = page.locator('.win[data-app="index"]');
const cards = await index.locator("[data-entry]").evaluateAll((els) => els.map((e) => e.dataset.entry));
console.log("index entries:", cards.length);
await page.screenshot({ path: "shots/roster-3-index.png" });

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
